import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const scope = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../js/field-map.js', import.meta.url), 'utf8'), scope);
const W = scope.window.FieldWorld;
const map = W.build('desert');
const at = (x, y) => ({ x: (x + .5) / W.SIZE, y: (y + .5) / W.SIZE });
const cacti = map.props.filter(prop => prop.kind.startsWith('cactus'));

test('사막 선인장은 실제 선인장 원본 타일 한 칸을 밑동에 온전히 그린다', () => {
  // 원본 시트를 눈으로 확인한 좌표: 팔 달린 선인장 / 토끼귀 선인장.
  const crops = { cactus: [374, 153], 'cactus-small': [442, 153] };
  assert.ok(cacti.length >= 7);
  for (const prop of cacti) {
    const [sx, sy] = crops[prop.kind];
    const tiles = map.ground.filter(([sheet, , , dx, dy]) =>
      sheet === 'cacti' && dx === prop.x * 16 && dy === prop.y * 16);
    assert.deepEqual(Array.from(tiles, tile => Array.from(tile)), [
      ['cacti', sx, sy, prop.x * 16, prop.y * 16, 16, 16],
    ], `${prop.kind} (${prop.x}, ${prop.y})`);
    assert.equal(W.isWalkable(map, at(prop.x, prop.y)), false, '그림 밑동은 충돌 칸');
    assert.equal(W.isCovered(map, at(prop.x, prop.y)), false, '온전한 한 그림을 위아래로 분리하지 않는다');
  }
  assert.ok(fs.existsSync(new URL('../' + map.sheets.cacti, import.meta.url)), '배포할 실제 원본 시트');
});

test('사막에 들어오면 가까운 모래 위에서 선인장을 발견하고 뒤로 걸어갈 수 있다', () => {
  const nearby = cacti.find(prop => Math.abs(prop.x + .5 - map.start.x * 40) <= 2 &&
    Math.abs(prop.y + .5 - map.start.y * 40) <= 2);
  assert.ok(nearby, '좁은 첫 화면에도 시작점 두 칸 안에 선인장이 있다');
  const behind = at(nearby.x, nearby.y - 1);
  assert.equal(W.isWalkable(map, behind), true);
  assert.equal(W.isCovered(map, behind), false);
  assert.ok(W.findPath(map, map.start, behind), '안내대로 뒤를 살필 수 있다');
});

test('선인장의 기존 충돌 위치와 시작 동행 길·사막 출구는 유지한다', () => {
  for (const [x, y] of [[25, 13], [14, 28], [33, 19], [34, 35], [11, 24], [27, 25], [6, 35]]) {
    assert.equal(W.isWalkable(map, at(x, y)), false, `기존 밑동 (${x}, ${y})`);
  }
  for (let step = 0; step <= 4; step++) {
    assert.ok(W.isWalkable(map, { x: map.start.x - step / 40, y: map.start.y }));
    assert.ok(W.isWalkable(map, { x: map.start.x, y: map.start.y + step / 40 }));
  }
  for (const exit of map.exits) {
    for (const [x, y] of exit.cells) {
      const destination = at(x, y);
      assert.ok(W.isWalkable(map, destination));
      assert.ok(W.findPath(map, map.start, destination), `${exit.side} 출구까지 걸어간다`);
    }
  }
});
