import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fontGeometry } from '../tools/tracing-font-geometry.mjs';

const scope = { window: {} };
for (const file of ['strokes-font', 'strokes']) {
  vm.runInNewContext(fs.readFileSync(new URL('../js/data/' + file + '.js', import.meta.url), 'utf8'), scope);
}
const letters = scope.window.StrokeLetters;
const span = (points, axis) => Math.max(...points.map(point => point[axis])) - Math.min(...points.map(point => point[axis]));
function nearPath(point, path) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
  }
  return best;
}

test('지원 한글 438자의 획이 점으로 축소되지 않고, 정해진 직선 방향과 원형의 닫힘을 유지한다', () => {
  const original = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../js/data/strokes.js', import.meta.url), 'utf8'), original);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let checked = 0;
  for (const character of Object.keys(scope.window.TRACING_FONT_GLYPHS)) {
    if (/[a-z]/i.test(character)) continue;
    checked++;
    const actual = letters.glyph(character), template = original.window.StrokeLetters.glyph(character);
    actual.strokes.forEach((stroke, index) => {
      const raw = template.strokes[index];
      const length = stroke.slice(1).reduce((sum, p, i) => sum + distance(p, stroke[i]), 0);
      assert.ok(length > 4, character + ' ' + (index + 1) + '획이 점으로 축소되지 않는다');
      const dx = raw.at(-1).x - raw[0].x, dy = raw.at(-1).y - raw[0].y;
      if (span(raw, 'y') < .1 && dx > 5) assert.ok(stroke.at(-1).x - stroke[0].x > 3, character + ' 가로획 방향');
      if (span(raw, 'x') < .1 && dy > 5) assert.ok(stroke.at(-1).y - stroke[0].y > 3, character + ' 세로획 방향');
      const straight = span(raw, 'x') < .1 ? 'y' : span(raw, 'y') < .1 ? 'x' : null;
      if (straight) {
        const backwards = stroke.slice(1).reduce((sum, p, i) => sum + Math.max(0, stroke[i][straight] - p[straight]), 0);
        assert.ok(backwards < 3, character + ' 직선 획 도중 역행');
      }
      if (distance(raw[0], raw.at(-1)) < .2) {
        assert.ok(distance(stroke[0], stroke.at(-1)) < 4, character + ' 원형 획 닫힘');
        const area = points => points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y; }, 0);
        assert.equal(Math.sign(area(stroke)), Math.sign(area(raw)), character + ' 원형 획 회전 방향');
      }
      for (let prior = 0; prior < index; prior++) {
        const originalOverlap = raw.filter(p => nearPath(p, template.strokes[prior]) < 1.5).length / raw.length;
        const overlap = stroke.filter(p => nearPath(p, actual.strokes[prior]) < 1.5).length / stroke.length;
        assert.ok(originalOverlap >= .3 || overlap <= .8, character + ' ' + (index + 1) + '획이 앞 획을 중복하지 않는다');
        if (nearPath(raw[0], template.strokes[prior]) < .25) assert.ok(nearPath(stroke[0], actual.strokes[prior]) < 6, character + ' 시작 접점');
        if (nearPath(raw.at(-1), template.strokes[prior]) < .25) assert.ok(nearPath(stroke.at(-1), actual.strokes[prior]) < 6, character + ' 끝 접점');
        const other = template.strokes[prior];
        const sharedHeight = Math.min(...[raw, other].map(s => Math.max(...s.map(p => p.y)))) - Math.max(...[raw, other].map(s => Math.min(...s.map(p => p.y))));
        if (span(raw, 'x') < .1 && span(other, 'x') < .1 && sharedHeight > 5 && Math.abs(raw[0].x - other[0].x) > 5) {
          const expected = Math.sign(raw[0].x - template.strokes[prior][0].x);
          assert.equal(Math.sign(stroke[0].x - actual.strokes[prior][0].x), expected, character + ' 좌우 세로획 순서');
        }
      }
    });
  }
  assert.equal(checked, 438);
});

test('구·꾸는 ㄱ 다리와 ㅜ 세로를 중간에서 끊거나 띄우지 않고 실제 가로 접점까지 쓴다', () => {
  for (const [character, index] of [['구', 1], ['꾸', 2]]) {
    const glyph = letters.glyph(character), bar = glyph.strokes[index], stem = glyph.strokes[index + 1];
    assert.ok(nearPath(stem[0], bar) < 2, character + ' ㅜ 세로는 가로에서 출발');
    for (const stroke of glyph.strokes.slice(0, index)) assert.ok(nearPath(stroke.at(-1), bar) < 2, character + ' ㄱ 다리 전체');
  }
});

test('붙은 글꼴에서도 ㅓ·ㅔ 모음의 가로획이 초성 ㅂ의 가로를 다시 긋지 않는다', () => {
  for (const [character, offset] of [['버', 0], ['벅', 0], ['번', 0], ['벌', 0], ['범', 0], ['베', 0], ['뻐', 4]]) {
    const strokes = letters.glyph(character).strokes;
    const rightStem = strokes[offset + 1], vowelBar = strokes[offset + 4];
    assert.ok(vowelBar[0].x >= rightStem[0].x - 3, character + ' 모음이 초성 내부부터 시작하지 않는다');
    assert.ok(span(vowelBar, 'y') < 2, character + ' 모음 가로만 지난다');
  }
});

test('골격 복구는 떨어진 두 자모 사이에 가짜 연결선을 만들지 않는다', () => {
  const geometry = fontGeometry(scope.window.TRACING_FONT_GLYPHS['렛'].outline);
  assert.throws(() => geometry.route([[65, 10], [82, 10]]), /서로 떨어진 글꼴 골격/);
  assert.throws(() => geometry.endpoint([0, 0, 1, 1]), /끝점이 없습니다/);
});

test('전체 한글에서 원래 글꼴 중심선의 긴 구간을 빼먹지 않는다', () => {
  for (const [character, glyph] of Object.entries(scope.window.TRACING_FONT_GLYPHS)) {
    if (/[a-z]/i.test(character)) continue;
    const nodes = fontGeometry(glyph.outline).nodes;
    const points = glyph.strokes.flat();
    const missing = nodes.filter(p => Math.min(...points.map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))) > 4.5);
    assert.ok(missing.length <= 10 || missing.length / nodes.length <= .035,
      character + ' 실제 글꼴 중심선 누락 ' + missing.length + '/' + nodes.length);
  }
});

test('꼬렛의 렛은 ㄹ 다음 ㅔ의 짧은 가로·왼세로·오른세로를 각각 한 번씩 쓴다', () => {
  const glyph = letters.glyph('렛');
  const [bar, left, right] = glyph.strokes.slice(3, 6);
  assert.ok(bar[0].x < 52 && bar.at(-1).x > 64, '4획은 왼쪽 가로획을 지나 왼세로와 만난다');
  assert.ok(bar.every(point => point.y > 30.91 && point.y < 36.74), '원래 글꼴의 짧은 가로획 안');
  assert.ok(span(bar, 'y') < .5, '점이나 세로획으로 바뀌지 않는다');
  assert.ok(left.every(point => point.x > 62.14 && point.x < 68.56), '5획은 오른세로를 중복하지 않는다');
  assert.ok(left[0].y < 12 && left.at(-1).y > 55, '왼세로를 위에서 아래 끝까지 쓴다');
  assert.ok(right.every(point => point.x > 79.34 && point.x < 85.75));
  assert.ok(right[0].y < 12 && right.at(-1).y > 61, '6획은 오른세로 전체를 쓴다');
  assert.equal(glyph.strokes.length, 8, 'ㄹ 3획·ㅔ 3획·ㅅ 2획');
});

test('같은 오매핑이 확인된 ㅔ 글자도 가로획과 서로 다른 두 세로획을 모두 지난다', () => {
  // 원본 파싱으로 확인한 오류만 열거한다. 나머지 ㅔ 글자는 교체하지 않는다.
  for (const [character, index] of [
    ['게', 1], ['겔', 1], ['겟', 1], ['델', 2], ['렌', 3], ['렛', 3], ['벨', 4],
    ['엘', 1], ['젤', 2], ['케', 2], ['켄', 2], ['켈', 2], ['펫', 4], ['헬', 3],
  ]) {
    const [bar, left, right] = letters.glyph(character).strokes.slice(index, index + 3);
    assert.ok(bar.at(-1).x - bar[0].x > 8 && span(bar, 'y') < .5, character + ' 짧은 가로획');
    assert.ok(left.every(point => point.x > 62.14 && point.x < 68.56), character + ' 왼세로');
    assert.ok(right.every(point => point.x > 79.34 && point.x < 85.75), character + ' 오른세로');
    assert.ok(left.at(-1).y - left[0].y > 35, character + ' 왼세로 전체');
    assert.ok(right.at(-1).y - right[0].y > 35, character + ' 오른세로 전체');
  }
});

test('수리 도구는 이미 고친 자료를 다시 바꾸지 않고, 예상과 다른 윤곽·중복 경로는 쓰기 전에 거부한다', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tracing-rat-'));
  try {
    fs.mkdirSync(path.join(folder, 'tools'));
    fs.mkdirSync(path.join(folder, 'js/data'), { recursive: true });
    const tool = path.join(folder, 'tools/repair-tracing-rat.mjs');
    const target = path.join(folder, 'js/data/strokes-font.js');
    fs.copyFileSync(new URL('../tools/repair-tracing-rat.mjs', import.meta.url), tool);
    const source = fs.readFileSync(new URL('../js/data/strokes-font.js', import.meta.url), 'utf8');
    fs.writeFileSync(target, source);
    const again = spawnSync(process.execPath, [tool, '--write'], { encoding: 'utf8' });
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /복구 0글자/);
    assert.equal(fs.readFileSync(target, 'utf8'), source);

    for (const [message, alter] of [
      ['원본 윤곽 확인 실패', glyph => {
        assert.equal(glyph.outline.split('L68.56 58.11').length - 1, 1);
        glyph.outline = glyph.outline.replace('L68.56 58.11', 'L68.55 58.11');
      }],
      ['가로 굵기 확인 실패', glyph => {
        assert.equal(glyph.outline.split('36.74').length - 1, 3);
        glyph.outline = glyph.outline.replaceAll('36.74', '39.74');
      }],
      ['오른세로 중복 확인 실패', glyph => { glyph.strokes[5] = [[65, 59.01], [65, 62.5]]; }],
    ]) {
      const data = JSON.parse(JSON.stringify(scope.window.TRACING_FONT_GLYPHS));
      const glyph = data['렛'];
      // 고장 난 원본과 같은 매핑으로 되돌려 수리 진입 조건을 만든다.
      glyph.strokes[3] = [[65, 9.6], [65, 10.4]];
      glyph.strokes[4] = glyph.strokes[5];
      glyph.strokes[5] = [[82.08, 59.01], [82.08, 62.5]];
      alter(glyph);
      const invalid = 'window.TRACING_FONT_GLYPHS=' + JSON.stringify(data) + ';';
      fs.writeFileSync(target, invalid);
      const result = spawnSync(process.execPath, [tool, '--write'], { encoding: 'utf8' });
      assert.notEqual(result.status, 0, message);
      assert.ok(result.stderr.includes(message), result.stderr);
      assert.equal(fs.readFileSync(target, 'utf8'), invalid, '실패하면 자료를 일부만 덮어쓰지 않는다');
    }
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
