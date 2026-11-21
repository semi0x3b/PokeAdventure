// 확인된 ㅔ 오매핑만 기존 NanumGothic 윤곽의 가로·세로 가장자리로 복구한다.
// 글꼴 윤곽·초성·받침·다른 글자는 재생성하지 않는다. --write가 없으면 점검만 한다.
import fs from 'node:fs';

const file = new URL('../js/data/strokes-font.js', import.meta.url);
let source = fs.readFileSync(file, 'utf8');
const prefix = 'window.TRACING_FONT_GLYPHS=';
const glyphs = JSON.parse(source.slice(source.indexOf(prefix) + prefix.length).trim().replace(/;$/, ''));
// 파싱으로 확인한 사례: 게·케는 가로획이 세로 점획으로, 나머지는 왼세로가 오른세로로 잘못 연결됐다.
const repairs = [
  ['게', 1], ['겔', 1], ['겟', 1], ['델', 2], ['렌', 3], ['렛', 3], ['벨', 4],
  ['엘', 1], ['젤', 2], ['케', 2], ['켄', 2], ['켈', 2], ['펫', 4], ['헬', 3],
  ['ㅞ', 2], ['쉐', 4], ['쉘', 4],
];

function segments(outline) {
  const tokens = outline.match(/[MLQZ]|-?\d+(?:\.\d+)?/g);
  const lines = [];
  let current;
  for (let index = 0; index < tokens.length;) {
    const command = tokens[index++];
    if (command === 'Z') continue;
    let next = [Number(tokens[index++]), Number(tokens[index++])];
    if (command === 'Q') next = [Number(tokens[index++]), Number(tokens[index++])];
    if (command === 'L') lines.push({ from: current, to: next });
    current = next;
  }
  return lines;
}

function only(items, description) {
  if (items.length !== 1) throw Error(description + ': 원본 윤곽 확인 실패 (' + items.length + ')');
  return items[0];
}

function sample(from, to, count) {
  const length = Math.max(10, count);
  return Array.from({ length }, (_, index) => {
    const progress = index / (length - 1);
    return from.map((value, axis) => Number((value + (to[axis] - value) * progress).toFixed(2)));
  });
}

function replaceStroke(character, number, points) {
  const start = source.indexOf(JSON.stringify(character) + ':');
  const array = source.indexOf('"strokes":[', start) + '"strokes":'.length;
  let depth = 0, current = -1, begin = -1;
  for (let index = array; index < source.length; index++) {
    if (source[index] === '[' && ++depth === 2) { current++; begin = index; }
    if (source[index] === ']' && --depth === 1 && current === number) {
      source = source.slice(0, begin) + JSON.stringify(points) + source.slice(index + 1);
      return;
    }
  }
  throw Error(character + '의 ' + (number + 1) + '획을 찾지 못했습니다.');
}

const changed = [];
for (const [character, index] of repairs) {
  const glyph = glyphs[character];
  const [bar, left, right] = glyph.strokes.slice(index, index + 3);
  const missingLeft = left.every(([x]) => x > 79);
  const missingBar = bar.at(-1)[0] - bar[0][0] < 4;
  if (!missingLeft && !missingBar) continue;

  // 음절의 왼세로 양쪽 가장자리는 x=62.14/68.56, 독립 ㅞ는 x=66.03/72.44이다.
  // 연결된 초성 윤곽도 있으므로 윤곽 전체 상자 대신 실제 직선 구간을 찾는다.
  const edgeLeft = character === 'ㅞ' ? 66.03 : 62.14;
  const edgeRight = character === 'ㅞ' ? 72.44 : 68.56;
  const lines = segments(glyph.outline);
  const upper = only(lines.filter(({ from, to }) => from[0] < edgeLeft - 2 && to[0] === edgeLeft && from[1] === to[1]), character + ' 가로 위');
  const lower = only(lines.filter(({ from, to }) => from[0] === edgeLeft && to[0] < edgeLeft - 2 && from[1] === to[1]), character + ' 가로 아래');
  const stem = only(lines.filter(({ from, to }) => from[0] === edgeRight && to[0] === edgeRight && to[1] - from[1] > 35), character + ' 왼세로 오른쪽');
  if (!(lower.from[1] - upper.from[1] > 5 && lower.from[1] - upper.from[1] < 7)) throw Error(character + ' 가로 굵기 확인 실패');
  const x = (edgeLeft + edgeRight) / 2;
  const y = (upper.to[1] + lower.from[1]) / 2;
  replaceStroke(character, index, sample([Math.max(upper.from[0], lower.to[0]), y], [x, y], bar.length));
  if (missingLeft) {
    // 잘못 옮겨진 오른세로 전체 경로는 마지막 획으로 그대로 보존한다.
    if (!right.every(([x]) => x > 79) || right.at(-1)[1] - right[0][1] > 4) throw Error(character + ' 오른세로 중복 확인 실패');
    const inset = (edgeRight - edgeLeft) / 4;
    replaceStroke(character, index + 1, sample([x, stem.from[1] + inset], [x, stem.to[1] - inset], left.length));
    replaceStroke(character, index + 2, left);
  }
  changed.push(character);
}
if (process.argv.includes('--write')) fs.writeFileSync(file, source);
console.log('ㅔ 경로 복구 ' + changed.length + '글자: ' + changed.join('·'));
