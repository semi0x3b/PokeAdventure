import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/core.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/yard.js', 'utf8'), context);
const Y = context.window.YardScene;
const R = context.window.GameRules;
const plain = value => JSON.parse(JSON.stringify(value));
const ten = [1, 4, 7, 10, 13, 16, 19, 21, 23, 25];

test('마당 여러 개: 풀밭 마당은 옛 yard, 눈의 마을은 yards.snow 에 따로 저장한다', () => {
  const state = { caught: ten, companions: [25], yard: [1, 4], yards: { snow: [7, 99] } };
  assert.deepEqual(plain(Y.yardIds(state)), [1, 4]);
  assert.deepEqual(plain(Y.yardIds(state, 'snow')), [7]);
  assert.deepEqual(plain(Y.yardIds({ caught: ten }, 'snow')), []);
  assert.deepEqual(plain(Y.yardPatch(state, 'meadow', [25])), { yard: [25] });
  assert.deepEqual(plain(Y.yardPatch(state, 'snow', [25])), { yards: { snow: [25] } });
});

const range = n => Array.from({ length: n }, (_, i) => i + 1);
test('눈의 마을은 10마리에 저절로 열리고, 그 뒤 10마리마다 열쇠 하나로 아이가 고른 마을을 연다', () => {
  assert.equal(Y.themeOpen('meadow', { caught: [25] }), true);
  assert.equal(Y.themeOpen('snow', { caught: range(9) }), false);
  assert.equal(Y.themeOpen('snow', { caught: range(10) }), true);
  assert.equal(Y.keysLeft({ caught: range(19) }), 0);
  assert.equal(Y.openTheme({ caught: range(19) }, 'robot'), null);
  const twenty = { caught: range(20) };
  assert.equal(Y.keysLeft(twenty), 1);
  assert.deepEqual(plain(Y.openTheme(twenty, 'robot')), { yardsOpen: ['robot'] });
  const opened = { caught: range(20), yardsOpen: ['robot'] };
  assert.equal(Y.themeOpen('robot', opened), true);
  assert.equal(Y.themeOpen('doll', opened), false);
  assert.equal(Y.keysLeft(opened), 0);
  assert.equal(Y.openTheme(opened, 'doll'), null);
  assert.equal(Y.openTheme({ caught: range(40) }, 'snow'), null);
  assert.equal(Y.nextUnlockIn({ caught: range(7) }), 3);
  assert.equal(Y.nextUnlockIn({ caught: range(23) }), 7);
});

test('축하 카드: 10마리를 넘으면 눈의 마을, 그 뒤 10마리마다 열쇠', () => {
  assert.deepEqual(plain(Y.unlocksBetween(9, 10)), ['snow']);
  assert.deepEqual(plain(Y.unlocksBetween(10, 19)), []);
  assert.deepEqual(plain(Y.unlocksBetween(19, 20)), ['key']);
  assert.deepEqual(plain(Y.unlocksBetween(8, 31)), ['snow', 'key', 'key']);
});

test('마을은 10개 넘게 있고, 열쇠 마을은 모두 저장 검사(js/storage.js)와 같은 id', () => {
  assert.ok(Y.THEMES.length >= 12);
  const storage = fs.readFileSync('js/storage.js', 'utf8');
  for (const id of Y.CHOOSABLE) assert.match(storage, new RegExp(`'${id}'`));
  for (const name of ['인형 마을', '로봇 마을', '자동차 마을', '공룡 마을', '숲 마을', '바다 마을']) assert.ok(Y.THEMES.some(item => item.name === name), name);
});

test('기록을 합칠 때 yards 도 나중에 바꾼 쪽을 따른다', () => {
  const older = { caught: ten, stamps: [], settings: {}, yards: { snow: [1] }, preferencesUpdatedAt: 1 };
  const newer = { caught: ten, stamps: [], settings: {}, yards: { snow: [4, 7] }, preferencesUpdatedAt: 2 };
  assert.deepEqual(plain(R.mergeState(older, newer).yards), { snow: [4, 7] });
  assert.deepEqual(plain(R.mergeState(newer, older).yards), { snow: [4, 7] });
});
