// 기존 글꼴 윤곽의 떨어진 짧은 가로획으로 ㅊ의 첫 획만 복구한다.
// 글꼴·나머지 획·샘플링 수치는 재생성하지 않는다. --write가 없으면 점검만 한다.
import fs from 'node:fs';

const file = new URL('../js/data/strokes-font.js', import.meta.url);
let source = fs.readFileSync(file, 'utf8');
const prefix = 'window.TRACING_FONT_GLYPHS=';
const glyphs = JSON.parse(source.slice(source.indexOf(prefix) + prefix.length).trim().replace(/;$/, ''));

function bounds(contour) {
  const coordinates = contour.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const xs = coordinates.filter((_, index) => index % 2 === 0);
  const ys = coordinates.filter((_, index) => index % 2 === 1);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
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
  throw Error(character + '의 첫 획을 찾지 못했습니다.');
}

const changed = [];
for (const [character, glyph] of Object.entries(glyphs)) {
  const code = character.codePointAt(0) - 0xAC00;
  const syllable = code >= 0 && code <= 11171;
  const initial = syllable && Math.floor(code / 588) === 14;
  const final = syllable && code % 28 === 23;
  if (character !== 'ㅊ' && !initial && !final) continue;
  const number = final ? glyph.strokes.length - 3 : 0;
  const [dot, body] = glyph.strokes.slice(number, number + 2);
  const bodyTop = Math.min(...body.map(point => point[1]));
  if (Math.max(...dot.map(point => point[1])) + 4 < bodyTop) continue;

  const middle = (Math.min(...body.map(point => point[0])) + Math.max(...body.map(point => point[0]))) / 2;
  const candidates = glyph.outline.split(/(?=M)/).filter(Boolean).map(bounds).filter(box =>
    box.bottom < bodyTop - 3 && box.bottom - box.top < 9 &&
    box.right - box.left > (box.bottom - box.top) * 2 &&
    box.left < middle && box.right > middle
  );
  if (candidates.length !== 1) throw Error(character + '의 분리된 짧은 획 확인 실패');
  const box = candidates[0], inset = (box.bottom - box.top) * .65;
  const y = (box.top + box.bottom) / 2;
  const points = Array.from({ length: dot.length }, (_, index) => [
    Number((box.left + inset + (box.right - box.left - inset * 2) * index / (dot.length - 1)).toFixed(2)),
    Number(y.toFixed(2))
  ]);
  replaceStroke(character, number, points);
  changed.push(character);
}
if (process.argv.includes('--write')) fs.writeFileSync(file, source);
console.log('ㅊ 첫 획 복구 ' + changed.length + '글자: ' + changed.join('·'));
