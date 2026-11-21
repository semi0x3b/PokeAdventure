// 실제 저장 윤곽의 골격·단면에서 확정된 한글 경로 누락만 복구한다.
// 영문·글꼴 윤곽·기존 ㅊ 보정은 바꾸지 않는다. --write가 없으면 점검만 한다.
import fs from 'node:fs';
import vm from 'node:vm';
import { fontGeometry } from './tracing-font-geometry.mjs';

const file = new URL('../js/data/strokes-font.js', import.meta.url);
let source = fs.readFileSync(file, 'utf8');
const prefix = 'window.TRACING_FONT_GLYPHS=';
const glyphs = JSON.parse(source.slice(source.indexOf(prefix) + prefix.length).trim().replace(/;$/, ''));
const originals = structuredClone(glyphs);
const scope = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../js/data/strokes.js', import.meta.url), 'utf8'), scope);
const templates = scope.window.StrokeLetters;
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const geometry = new Map();
const geo = character => {
  if (!geometry.has(character)) geometry.set(character, fontGeometry(glyphs[character].outline));
  return geometry.get(character);
};
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearest = (point, points) => Math.min(...points.map(p => distance(point, p)));
const center = range => (range[0] + range[1]) / 2;
function line(from, to, count = 20) {
  return Array.from({ length: Math.max(10, count) }, (_, index) => from.map((value, axis) =>
    Number((value + (to[axis] - value) * index / (Math.max(10, count) - 1)).toFixed(2))));
}
function set(character, index, targets) {
  try { glyphs[character].strokes[index] = geo(character).route(targets); }
  catch (error) { throw Error(character + ' ' + (index + 1) + '획: ' + error.message); }
}
function horizontal(character, y) {
  const bands = geo(character).bands('y', y).filter(([left, right]) => right - left > 30).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  if (!bands.length) throw Error(character + ': 가로 윤곽 단면을 확인하지 못했습니다.');
  return [bands[0][0] + 3, bands[0][1] - 3];
}
function componentBars(character, count, final = false) {
  const bands = geo(character).bands('x', 55).filter(range => range[1] - range[0] < 10);
  const selected = final ? bands.slice(-count) : bands.slice(0, count);
  if (selected.length !== count) throw Error(character + ': 가로획 개수 확인 실패');
  return selected.map(range => { const y = center(range), [left, right] = horizontal(character, y); return { left, right, y }; });
}

// 단면의 실제 세 가로획을 모두 지나야 하는 ㄹ. 초성/받침의 자모 순서는 strokes.js와 같다.
for (const [character, glyph] of Object.entries(glyphs)) {
  if (!(character >= '가' && character <= '힣')) continue;
  const code = character.codePointAt(0) - 0xAC00;
  const initial = CHO[Math.floor(code / 588)], vowel = JUNG[Math.floor(code % 588 / 28)];
  const positions = [];
  if (initial === 'ㄹ' && 'ㅗㅛㅜㅠㅡ'.includes(vowel)) positions.push({ index: 0, final: false });
  if (code % 28 === 8) positions.push({ index: glyph.strokes.length - 3, final: true });
  for (const { index, final } of positions) {
    const [top, middle, bottom] = componentBars(character, 3, final);
    const desired = [
      [[top.left, top.y], [top.right, top.y], [middle.right, middle.y]],
      [[middle.left, middle.y], [middle.right, middle.y]],
      [[middle.left, middle.y], [bottom.left, bottom.y], [bottom.right, bottom.y]],
    ];
    if (desired.some((targets, stroke) => targets.some(point => nearest(point, glyph.strokes[index + stroke]) > 4.5))) {
      desired.forEach((targets, stroke) => set(character, index + stroke, targets));
    }
  }
}

// 압축된 초성 ㅌ에서 중간과 아랫줄이 같은 경로로 매핑된 확정 사례.
for (const character of ['톤', '톱', '통']) {
  const [top, middle, bottom] = componentBars(character, 3);
  set(character, 1, [[middle.left, middle.y], [middle.right, middle.y]]);
  set(character, 2, [[top.left, top.y], [bottom.left, bottom.y], [bottom.right, bottom.y]]);
}

// ㅎ의 두 분리 가로획과 원형: 실제 윤곽의 내부 빈 공간을 둘러싼 골격을 한 바퀴 지난다.
for (const [character, glyph] of Object.entries(glyphs)) {
  const code = character.codePointAt(0) - 0xAC00;
  if (character !== 'ㅎ' && !(code >= 0 && code <= 11171 && Math.floor(code / 588) === 18)) continue;
  const contours = geo(character).contours.map(points => ({
    points,
    area: points.reduce((sum, a, i) => { const b = points[(i + 1) % points.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0),
    left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])),
    top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])),
  }));
  const hole = contours.filter(c => c.area < 0).sort((a, b) => a.top - b.top)[0];
  const headers = contours.filter(c => c.area > 0 && c.bottom < hole.top && c.bottom - c.top < 9 && c.right - c.left > (c.bottom - c.top) * 2).sort((a, b) => a.top - b.top);
  if (headers.length !== 2) throw Error(character + ': ㅎ의 두 분리 획 확인 실패');
  headers.forEach((box, index) => {
    const y = (box.top + box.bottom) / 2;
    const desired = [[box.left + 3, y], [box.right - 3, y]];
    if (desired.some(p => nearest(p, glyph.strokes[index]) > 4.5)) set(character, index, desired);
  });
  const x = (hole.left + hole.right) / 2, y = (hole.top + hole.bottom) / 2;
  const ring = [[x, hole.top - 2.7], [hole.left - 3.3, y], [x, hole.bottom + 2.7], [hole.right + 3.3, y], [x, hole.top - 2.7]];
  if (distance(glyph.strokes[2][0], glyph.strokes[2].at(-1)) > 4 || ring.some(p => nearest(p, glyph.strokes[2]) > 4.5)) set(character, 2, ring);
}

// 실제 원형을 가로/세로 모음으로 잘못 옮긴 세 글자의 모음도 해당 윤곽으로 되돌린다.
set('홍', 3, [[49.7, 48], [49.7, 59.5]]);
set('흉', 3, [[10.5, 57.3], [89, 57.3]]);
set('흉', 4, [[34, 57.3], [34, 69.5]]);
set('흉', 5, [[65.8, 57.3], [65.8, 69.5]]);
set('흔', 3, [[10.5, 61.7], [89, 61.7]]);

// 구·꾸: 세로를 중간에서 시작하지 않고 실제 가로 접점에서 시작한다.
for (const [character, initialCount] of [['구', 1], ['꾸', 2]]) {
  const glyph = glyphs[character], bar = glyph.strokes[initialCount], stem = glyph.strokes[initialCount + 1];
  const y = center([bar[0][1], bar.at(-1)[1]]);
  set(character, initialCount + 1, [[stem[0][0], y], stem.at(-1)]);
  for (let index = 0; index < initialCount; index++) {
    const stroke = glyph.strokes[index], end = stroke.at(-1), previous = stroke.at(-3);
    if (Math.abs(end[1] - y) < 1) continue;
    const x = end[0] + (y - end[1]) * (end[0] - previous[0]) / (end[1] - previous[1]);
    set(character, index, [stroke[0], [x, y]]);
  }
}

// 초성이 모음까지 되돌아가던 ㄱ/ㅋ: 같은 실제 골격의 초성 끝점에서 끝낸다.
for (const [character, bottom] of [['게', 78], ['겔', 55], ['겟', 58], ['케', 78], ['켄', 62], ['켈', 55]]) {
  const glyph = glyphs[character], g = geo(character);
  const start = g.endpoint([5, 5, 58, 23], false);
  const end = g.endpoint([5, 24, 58, bottom]);
  set(character, 0, [start, end]);
  if (character === '케') set(character, 1, [g.endpoint([5, 30, 25, 45]), [43.5, 39]]);
}
// ㅡ 위 ㄱ/ㅋ의 기울어진 다리가 중간에서 끊긴 경우. 밑 가로와 만나는 부분까지 지난다.
for (const [character, index] of [['그', 0], ['근', 0], ['크', 0]]) {
  const glyph = glyphs[character], bar = glyph.strokes[character === '크' ? 2 : 1];
  set(character, index, [glyph.strokes[index][0], [71.5, bar[0][1]]]);
}

// 실제 ㅂ의 위쪽 양 세로가 누락된 연결형. 새 직선을 그리지 않고 원래 세로 골격을 연장한다.
for (const [character, index] of [['버', 0], ['베', 0], ['뻐', 4]]) {
  const glyph = glyphs[character], g = geo(character);
  for (const number of [index, index + 1]) {
    const stroke = glyph.strokes[number];
    const top = g.endpoint([stroke[0][0] - 4, 5, stroke[0][0] + 4, 23], false);
    set(character, number, [top, stroke.at(-1)]);
  }
  const scanX = (glyph.strokes[index][0][0] + glyph.strokes[index + 1][0][0]) / 2;
  const band = g.bands('x', scanX).find(([top, bottom]) => top > 20 && bottom - top < 10);
  const y = center(band);
  set(character, index + 2, [[glyph.strokes[index][0][0], y], [glyph.strokes[index + 1][0][0], y]]);
}

// 붙은 쌍자음에서 짧은 오른빗획이 다른 ㅈ의 끝점으로 옮겨진 확정 사례.
for (const [character, points] of [
  ['ㅉ', [[33, 50], [48, 63]]], ['짱', [[26, 37], [38, 47]]], ['찌', [[24, 47], [35, 66]]],
]) {
  const first = glyphs[character].strokes[0];
  const end = geo(character).endpoint([5, 30, 29, character === 'ㅉ' ? 70 : character === '짱' ? 48 : 65]);
  set(character, 0, [first[0], end]);
  set(character, 1, points);
}

// 원의 ㅓ 가로획은 실제 저장 윤곽의 왼쪽 짧은 가로다.
set('원', 3, [[58, 62.1], [79.2, 62.1]]);

// 모든 지원 모음의 짧은 가지를 점검한다. 세로획으로 돌아가던 구간만 실제 가로 단면으로 복구한다.
const verticals = {
  'ㅏ': { stem: 0, bars: [1], right: true }, 'ㅑ': { stem: 0, bars: [1, 2], right: true },
  'ㅐ': { stem: 0, bars: [1], right: true }, 'ㅒ': { stem: 0, bars: [1, 2], right: true },
  'ㅓ': { stem: 1, bars: [0] }, 'ㅕ': { stem: 2, bars: [0, 1] },
  'ㅔ': { stem: 1, bars: [0] }, 'ㅖ': { stem: 2, bars: [0, 1] },
};
const mixed = { 'ㅘ': ['ㅗ', 'ㅏ'], 'ㅙ': ['ㅗ', 'ㅐ'], 'ㅝ': ['ㅜ', 'ㅓ'], 'ㅞ': ['ㅜ', 'ㅔ'] };
const unresolved = [];
for (const [character, glyph] of Object.entries(glyphs)) {
  if (/[a-z]/i.test(character)) continue;
  const code = character.codePointAt(0) - 0xAC00;
  const syllable = code >= 0 && code <= 11171;
  let vowel = syllable ? JUNG[Math.floor(code % 588 / 28)] : character;
  let offset = syllable ? templates.glyph(CHO[Math.floor(code / 588)]).strokes.length : 0;
  if (mixed[vowel]) { const [horizontal, vertical] = mixed[vowel]; offset += templates.glyph(horizontal).strokes.length; vowel = vertical; }
  const shape = verticals[vowel];
  if (!shape) continue;
  const stem = glyph.strokes[offset + shape.stem], xs = stem.map(p => p[0]).sort((a, b) => a - b);
  const x = xs[Math.floor(xs.length / 2)], ys = stem.map(p => p[1]);
  const g = geo(character);
  const bands = g.bands('x', x + (shape.right ? 7 : -7)).filter(([top, bottom]) => bottom - top < 10 && top > Math.min(...ys) && bottom < Math.max(...ys));
  if (bands.length !== shape.bars.length) { unresolved.push(character); continue; }
  shape.bars.forEach((number, ordinal) => {
    const y = center(bands[ordinal]);
    const row = g.bands('y', y).find(([left, right]) => left <= x && right >= x);
    const original = glyph.strokes[offset + number];
    // 번처럼 초성의 가로와 모음 가지가 이어진 윤곽에서도 모음의 기존 왼쪽 시작점을 넘지 않는다.
    const left = Math.max(row[0] + 2.5, Math.min(original[0][0], x - 4));
    const from = shape.right ? [x, y] : [left, y];
    const to = shape.right ? [row[1] - 2.5, y] : [x, y];
    const desired = line(from, to, original.length);
    if (desired.some(p => nearest(p, original) > 4.5) || original.some(p => nearest(p, desired) > 4.5)) glyph.strokes[offset + number] = desired;
  });
}

const changed = {};
for (const [character, glyph] of Object.entries(glyphs)) {
  if (JSON.stringify(glyph) === JSON.stringify(originals[character])) continue;
  changed[character] = glyph;
  for (let number = 0; number < glyph.strokes.length; number++) {
    if (JSON.stringify(glyph.strokes[number]) === JSON.stringify(originals[character].strokes[number])) continue;
    const start = source.indexOf(JSON.stringify(character) + ':');
    const array = source.indexOf('"strokes":[', start) + '"strokes":'.length;
    let depth = 0, current = -1, begin = -1;
    for (let index = array; index < source.length; index++) {
      if (source[index] === '[' && ++depth === 2) { current++; begin = index; }
      if (source[index] === ']' && --depth === 1 && current === number) {
        source = source.slice(0, begin) + JSON.stringify(glyph.strokes[number]) + source.slice(index + 1);
        break;
      }
    }
  }
}
if (process.argv.includes('--write')) fs.writeFileSync(file, source);
console.log('한글 경로 복구 ' + Object.keys(changed).length + '글자: ' + Object.keys(changed).join('·'));
console.log('단면만으로 자동 판정하지 않은 모음 ' + unresolved.length + '글자: ' + unresolved.join('·'));
