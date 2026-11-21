import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const window = {};
const context = vm.createContext({ window });
for (const file of ['strokes-font', 'strokes']) vm.runInContext(fs.readFileSync(new URL(`../js/data/${file}.js`, import.meta.url), 'utf8'), context);
const letters = window.StrokeLetters;
const glyphs = window.TRACING_FONT_GLYPHS;
// 기초 인쇄체의 방향·구성만 검사한다. 특정 교재의 이어쓰기·펜 들기 차이는 강요하지 않는다.
// 교육부 Teaching Handwriting(12·13·16쪽): https://www.pointview.school.nz/site_files/52127/upload_files/Teaching-Handwriting-2026.pdf?dl=1
// Benchmark Advance Handwriting: https://resources.finalsite.net/images/v1716500511/pleasantonusdnet/gpknusmh5sq6cfvkzbzo/BenchmarkHandwriting1.pdf
const roles = {
  A: ['downLeft', 'downRight', 'right'], B: ['down', 'bowl', 'bowl'], C: ['c'], D: ['down', 'bowl'],
  E: ['down', 'right', 'right', 'right'], F: ['down', 'right', 'right'], G: ['c', 'upLeft'], H: ['down', 'down', 'right'],
  I: ['down', 'right', 'right'], J: ['hookLeft'], K: ['down', 'downLeft', 'downRight'], L: ['corner'],
  M: ['down', 'downRight', 'upRight', 'down'], N: ['down', 'downRight', 'down'], O: ['circleTop'], P: ['down', 'bowl'],
  Q: ['circleTop', 'downRight'], R: ['down', 'bowl', 'downRight'], S: ['s'], T: ['right', 'down'], U: ['u'],
  V: ['downRight', 'upRight'], W: ['downRight', 'upRight', 'downRight', 'upRight'], X: ['downRight', 'downLeft'],
  Y: ['downRight', 'downLeft'], Z: ['z'],
  a: ['circleRight', 'down'], b: ['down', 'bowl'], c: ['c'], d: ['circleRight', 'down'], e: ['e'], f: ['hookLeft', 'right'],
  g: ['circleRight', 'hookLeft'], h: ['down', 'arch'], i: ['down', 'dot'], j: ['hookLeft', 'dot'],
  k: ['down', 'downLeft', 'downRight'], l: ['down'], m: ['down', 'arch', 'arch'], n: ['down', 'arch'], o: ['circleTop'],
  p: ['down', 'bowl'], q: ['circleRight', 'down'], r: ['down', 'archShort'], s: ['s'], t: ['hookRight', 'right'],
  u: ['u', 'down'], v: ['downRight', 'upRight'], w: ['downRight', 'upRight', 'downRight', 'upRight'],
  x: ['downRight', 'downLeft'], y: ['downRight', 'downLeft'], z: ['z']
};
const bounds = path => ({ left: Math.min(...path.map(p => p.x)), right: Math.max(...path.map(p => p.x)), top: Math.min(...path.map(p => p.y)), bottom: Math.max(...path.map(p => p.y)) });
const area = path => path.slice(1).reduce((sum, p, i) => sum + path[i].x * p.y - p.x * path[i].y, 0);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('영문 대소문자 52자의 획수·시작 방향·구성 요소를 기하적으로 검사한다', () => {
  assert.equal(Object.keys(roles).length, 52);
  for (const [character, expected] of Object.entries(roles)) {
    const glyph = letters.glyph(character);
    assert.equal(glyph.font, 'Latin', character);
    assert.equal(glyph.strokes.length, expected.length, character + ' 획수');
    const paths = glyph.strokes;
    assert.equal(new Set(paths.map(path => JSON.stringify(path))).size, paths.length, character + ' 같은 획 중복 없음');
    paths.forEach((path, index) => {
      const role = expected[index], label = `${character} ${index + 1}획 ${role}`;
      assert.ok(path.length >= 2, label + ' 한 점 획 금지');
      for (let i = 1; i < path.length; i++) assert.ok(distance(path[i - 1], path[i]) > .001, label + ' 연속 중복점 금지');
      const first = path[0], last = path.at(-1), box = bounds(path);
      const dx = last.x - first.x, dy = last.y - first.y;
      const width = box.right - box.left, height = box.bottom - box.top;
      if (role === 'down') {
        assert.ok(dy > 15 && width < 6, label + ' 위에서 아래로 줄기');
        assert.ok(first.y <= box.top + 3 && last.y >= box.bottom - 3, label);
      } else if (role === 'right') assert.ok(dx > 10 && height < 5, label + ' 왼쪽에서 오른쪽');
      else if (['downLeft', 'downRight', 'upRight', 'upLeft'].includes(role)) {
        assert.ok((role.endsWith('Right') ? dx : -dx) > 8 && (role.startsWith('down') ? dy : -dy) > 5, label);
        assert.ok(role.startsWith('down') ? first.y <= box.top + 3 && last.y >= box.bottom - 3 : first.y >= box.bottom - 3 && last.y <= box.top + 3, label + ' 꼭짓점을 넘겨 되돌아가지 않음');
      } else if (role.startsWith('circle')) {
        assert.ok(distance(first, last) < 1 && width > 20 && height > 25 && area(path) < -500, label + ' 반시계 폐곡선');
        assert.ok(first.y <= box.top + height * .2, label + ' 윗부분부터');
        if (role === 'circleRight') assert.ok(first.x >= box.right - width * .2, label + ' 오른쪽 위에서 시작');
      } else if (role === 'bowl') {
        assert.ok(width > 20 && dy > 10 && dx < 5, label + ' 오른쪽으로 둥근 배');
        assert.ok(path.slice(1, 8).some(p => p.x > first.x + 2), label + ' 초반에 오른쪽으로');
      } else if (role === 'c' || role === 's') {
        assert.ok(width > 20 && height > 25 && path[5].x < first.x, label + ' 오른쪽 위에서 왼쪽으로');
      } else if (role.startsWith('hook')) {
        assert.ok(height > 25 && dy > 15, label);
        assert.ok(role === 'hookLeft' ? box.left < first.x - 5 : box.right > first.x + 5, label + ' 끝 굽힘');
      } else if (role.startsWith('arch')) {
        assert.ok(dx > 15 && box.top < first.y - 3, label + ' 위로 올라가 오른쪽으로 둥근 어깨');
        if (role === 'arch') assert.ok(last.y > box.top + 25, label + ' 오른쪽 다리');
      } else if (role === 'dot') {
        assert.ok(width < 3 && height > 0 && height < 3 && box.bottom < bounds(paths[0]).top - 5, label + ' 본체 위의 짧은 점');
      } else if (role === 'u') assert.ok(dx > 20 && box.bottom > first.y + 25 && last.y < box.bottom - 10, label + ' 아래를 돌아 오른쪽 위로');
      else if (role === 'corner') assert.ok(dy > 30 && dx > 20 && path[5].y > first.y + 5, label + ' 먼저 아래로 뒤에 오른쪽');
      else if (role === 'e') assert.ok(path[5].x > first.x + 2 && box.top < first.y - 10 && box.bottom > first.y + 10, label + ' 가로획 뒤 둥근 배');
      else if (role === 'z') assert.ok(path[5].x > first.x + 5 && dy > 25 && box.right - box.left > 20, label + ' 윗가로부터');
      else assert.fail(label + ' 검사 누락');
    });
  }
});

test('실제 글꼴이 없는 기본 인쇄체 정의도 a·d·g·q를 오른쪽 위에서 반시계로 시작한다', () => {
  const fallback = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../js/data/strokes.js', import.meta.url), 'utf8'), fallback);
  for (const character of ['a', 'd', 'g', 'q']) {
    const bowl = fallback.window.StrokeLetters.glyph(character).strokes[0];
    const box = bounds(bowl);
    assert.ok(bowl[0].y < box.top + (box.bottom - box.top) * .2, character + ' 기본 배도 윗부분에서 시작');
    assert.ok(area(bowl) < 0 && bowl[5].x < bowl[0].x, character + ' 기본 배도 왼쪽으로 돈다');
  }
});

test('a·d·g·q의 배는 오른쪽 위에서 반시계로 돌고 오른쪽 줄기는 윗부분부터 내려온다', () => {
  for (const character of ['a', 'd', 'g', 'q']) {
    const [bowl, stem] = letters.glyph(character).strokes;
    const box = bounds(bowl);
    assert.ok(bowl[0].y < box.top + 8, character + ' 배 시작은 중간이 아니라 위');
    assert.ok(bowl[5].x < bowl[0].x - 2, character + ' 배 위를 왼쪽으로 돈다');
    assert.ok(stem[0].y <= box.top + 5, character + ' 줄기 윗부분 누락 없음');
    assert.ok(stem.at(-1).y >= box.bottom - 2, character + ' 줄기 끝까지');
  }
  assert.ok(letters.glyph('d').strokes[1][0].y < 15, 'd의 긴 줄기는 ascender 위에서');
});

test('B의 아랫배는 가운데 왼쪽부터, M·W의 대각선은 꼭짓점에서 새 획을 시작한다', () => {
  const [stem, , lower] = letters.glyph('B').strokes;
  assert.ok(Math.abs(lower[0].x - stem[0].x) < 3, 'B 아랫배의 가로 부분을 건너뛰지 않음');
  for (const [character, pairs] of [['M', [[1, 2], [2, 3]]], ['W', [[0, 1], [1, 2], [2, 3]]]]) {
    const paths = letters.glyph(character).strokes;
    for (const [before, after] of pairs) assert.ok(distance(paths[before].at(-1), paths[after][0]) < 1, `${character} ${before + 1}→${after + 1} 꼭짓점`);
  }
});
