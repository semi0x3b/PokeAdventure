import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const caught = count => Array.from({ length: count }, (_, index) => index + 1);
const rulesWindow = {};
vm.runInNewContext(source('js/core.js'), { window: rulesWindow });
const rules = rulesWindow.GameRules;

function storageHarness(values = new Map()) {
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const window = { crypto: webcrypto, addEventListener() {}, dispatchEvent() {}, GameRules: rules };
  const context = vm.createContext({ window, GameRules: rules, localStorage, crypto: webcrypto, TextEncoder, Uint8Array, Intl, Date, CustomEvent: class {}, setTimeout, clearTimeout });
  vm.runInContext(source('js/storage.js'), context);
  return { storage: window.GameStorage, values };
}

function gameHarness(count, companions = [1, 2]) {
  const nodes = new Map();
  function element() {
    return { innerHTML: '', textContent: '', dataset: {}, isConnected: true, attributes: {}, style: { setProperty() {}, removeProperty() {} },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {}, removeEventListener() {}, focus() {}, remove() {}, appendChild() {}, append() {},
      setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
      getAttribute(name) { return this.attributes[name]; }, querySelector() { return element(); }, querySelectorAll() { return []; },
      getBoundingClientRect() { return { width: 390, height: 844, left: 0, top: 0, right: 390, bottom: 844 }; } };
  }
  const document = { body: element(), documentElement: element(), createElement: element, addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [],
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); } };
  const window = { document, innerWidth: 390, innerHeight: 844, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, scrollTo() {} };
  // 포획 연출의 시간만 생략한다. 저장·대표 선택·배틀 출력은 실제 게임 코드를 실행한다.
  window.AdventureMotion = { cancel() {}, sequence: async () => true, burst() {} };
  const storage = { user: { name: '동행시험' }, state: { caught: caught(count), companions, companion: companions[0], settings: { sound: false }, stamps: [] },
    update(patch) { this.state = { ...this.state, ...patch }; } };
  const context = vm.createContext({ window, document, GameStorage: storage, navigator: {}, performance: { now: () => 0 }, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, Image: class {},
    getComputedStyle: () => ({ display: 'block', opacity: '1' }), DexHint: { say: () => '' }, QuestionBank: { levels: {} } });
  for (const file of ['js/core.js', 'js/data/pokemon.js', 'js/pokemon-assets.js', 'js/companion.js', 'js/field-map.js', 'js/battle-view.js']) {
    vm.runInContext(source(file), context, { filename: file });
    for (const [key, value] of Object.entries(window)) context[key] = value;
  }
  const gameSource = source('js/game.js');
  const startup = gameSource.lastIndexOf('  title();\n');
  assert.ok(startup > 0);
  const exposed = `window.__party = { partyIds, chooseParty, partyPanel, bagModal, partyPicker, setPartner, clearPartner, updateCompanions, seatCompanions, createField, fieldScreen, battleScreen, throwBall,
    get field() { return field; }, set field(value) { field = value; }, get battle() { return battle; }, set battle(value) { battle = value; }, set screen(value) { screen = value; },
    set region(value) { region = value; } };})();`;
  vm.runInContext(gameSource.slice(0, startup) + exposed, context);
  return { party: window.__party, storage, document, context, window };
}

test('동행은 서로 다른 포켓몬을 50마리 잡은 때부터 세 마리까지 열린다', () => {
  for (const [count, capacity] of [[0, 2], [49, 2], [50, 3], [51, 3], [493, 3]]) assert.equal(rules.companionCapacity(caught(count)), capacity);
  assert.equal(rules.companionCapacity([...caught(49), 1]), 2, '같은 포켓몬은 다시 세지 않는다');
});

test('50마리 수첩은 세 동행 저장·다시 로그인·백업 복원하며 49마리와 잘못된 동행은 거절한다', async () => {
  const first = storageHarness();
  await first.storage.init();
  await first.storage.authenticate('register', '동행시험', '2468');
  first.storage.update({ caught: caught(49), companions: [1, 2], companion: 1 }, true);
  const oldBackup = await first.storage.exportBackup();
  assert.throws(() => first.storage.update({ companions: [1, 2, 3] }, true), /동행/);
  first.storage.update({ caught: caught(50), companions: [1, 2, 3], companion: 1 }, true);
  const backup = await first.storage.exportBackup();
  const reopened = storageHarness(first.values);
  await reopened.storage.init();
  await reopened.storage.authenticate('login', '동행시험', '2468');
  assert.deepEqual(plain(reopened.storage.state.companions), [1, 2, 3]);
  await reopened.storage.importBackup(oldBackup);
  assert.deepEqual(plain(reopened.storage.state.companions), [1, 2]);
  await reopened.storage.importBackup(backup);
  assert.deepEqual(plain(reopened.storage.state.companions), [1, 2, 3]);
  const original = plain(reopened.storage.state);
  for (const patch of [{ caught: caught(49) }, { companions: [1, 2, 51] }, { companions: [1, 2, 2] }, { companions: [1, 2, 3, 4] }, { companion: 2 }]) {
    const invalid = JSON.parse(backup); invalid.state = { ...invalid.state, ...patch };
    await assert.rejects(reopened.storage.importBackup(JSON.stringify(invalid)), /동행|잡은 포켓몬/);
    assert.deepEqual(plain(reopened.storage.state), original);
  }
});

test('가방과 도감은 열린 동행 칸을 표시하고 셋째와 대표를 서로 바꾸거나 비운다', () => {
  const before = gameHarness(49);
  assert.equal((before.party.partyPanel().match(/data-party-slot=/g) || []).length, 2);
  before.party.setPartner(2, 3);
  assert.deepEqual(plain(before.party.partyIds()), [1, 2]);
  before.party.chooseParty([1, 2, 3]);
  assert.deepEqual(plain(before.party.partyIds()), [1, 2]);
  const after = gameHarness(50);
  assert.equal((after.party.partyPanel().match(/data-party-slot=/g) || []).length, 3);
  after.party.bagModal();
  assert.equal((after.document.querySelector('#modal-root').innerHTML.match(/data-party-slot=/g) || []).length, 3);
  after.party.setPartner(2, 3);
  assert.deepEqual(plain(after.party.partyIds()), [1, 2, 3]);
  after.party.setPartner(0, 3);
  assert.deepEqual(plain(after.party.partyIds()), [3, 2, 1]);
  assert.equal(after.storage.state.companion, 3);
  after.party.setPartner(2, 99);
  assert.deepEqual(plain(after.party.partyIds()), [3, 2, 1]);
  after.party.clearPartner(1);
  assert.deepEqual(plain(after.party.partyIds()), [3, 1]);
});

test('필드와 배에서 세 번째 동행도 갱신하며 서로 다른 좌석을 보존한다', () => {
  const env = gameHarness(50, [1, 2, 3]);
  env.party.createField();
  env.party.fieldScreen();
  assert.match(env.document.querySelector('#main').innerHTML, /id="field-companion-3"/);
  const view = { size: 1024, scale: 2 };
  const sizes = { tile: 32, trainer: 60, companion: 2 };
  env.party.updateCompanions(.016, view, sizes, .01);
  assert.deepEqual(plain(env.party.field.followers.map(state => state?.id)), [1, 2, 3]);
  env.party.field.boat = { x: .5, y: .5, direction: 'right' };
  for (const direction of ['right', 'left']) {
    env.party.field.boat.direction = direction;
    env.party.seatCompanions(sizes);
    const states = env.party.field.followers;
    assert.deepEqual(plain(states.map(state => state?.id)), [1, 2, 3]);
    assert.equal(new Set(states.map(state => `${state.x},${state.y}`)).size, 3);
    assert.ok(states.every(state => Number.isFinite(state.x) && Number.isFinite(state.y)));
  }
});

test('50번째 포획은 새 동행 칸을 자동으로 채우며 배틀에는 첫 대표 한 마리만 나간다', async () => {
  for (const [count, id, expected] of [[48, 49, [1, 2]], [49, 50, [1, 2, 50]]]) {
    const env = gameHarness(count);
    const pokemon = env.context.POKEMON.find(item => item.id === id);
    env.party.battle = { ...rules.newBattle(pokemon, false), phase: 'capture', missed: true };
    env.party.screen = 'battle';
    await env.party.throwBall();
    assert.deepEqual(plain(env.storage.state.companions), expected);
    assert.equal(env.storage.state.companion, 1);
    assert.equal(env.party.battle.phase, 'caught');
    if (count === 49) assert.match(env.document.querySelector('#toast').textContent, /50마리.*세 마리/);
    env.party.battle.phase = 'capture';
    env.party.battleScreen();
    const html = env.document.querySelector('#main').innerHTML;
    assert.equal((html.match(/class="gb-own-pokemon"/g) || []).length, 1);
    assert.match(html, /back\/1\./);
    assert.doesNotMatch(html, /back\/(?:2|50)\./);
  }
});
