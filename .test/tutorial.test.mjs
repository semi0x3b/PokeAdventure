import { loadPokemonAssets } from './load-pokemon-assets.mjs';
// 튜토리얼: 잡은 포켓몬 0마리면 지역 대신 카드 3장 → 숲에서 피카츄 첫 배틀(도망 없음) → 잡으면 caught·companions 에 25 → 지역 고르기.
// 실제 js/game.js 를 화면 출력만 메모리 요소로 바꿔 돌린다(제품 파일에는 쓰지 않는다).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = process.env.GAME_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// companions: 파트너 칸(없으면 옛 단일 companion 없음). local: 이 기기 localStorage 흉내(본 안내 기억).
// sound: 소리 설정 하나(settings.sound, 2026-11-15 — 카드 읽기도 이 값만 본다). extra: 옛 계정에 남은 readAloud 등 다른 설정 값.
function harness(caught = [], { sound = false, extra = {}, companions = null, local = new Map(), holdSpeech = false } = {}) {
  let time = 0, sequence = 0;
  const timers = new Map(), listeners = new Map(), nodes = new Map(), documentListeners = new Map();
  function schedule(callback, delay = 0) { const id = ++sequence; timers.set(id, { at: time + Math.max(0, delay), callback }); return id; }
  function removeTimer(id) { timers.delete(id); }
  // 요소 흉내: innerHTML 을 바꾸면 안쪽 요소(querySelector 결과)가 새로 생긴다. click() 은 붙은 click 처리기를 부른다.
  function element() {
    const classes = new Set(), handlers = new Map();
    let children = new Map(), html = '';
    return {
      textContent: '', dataset: {}, attributes: {}, isConnected: true, className: '', disabled: false,
      get innerHTML() { return html; }, set innerHTML(value) { html = String(value); children = new Map(); },
      style: { setProperty() {}, removeProperty() {} },
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle() {} },
      setAttribute(key, value) { this.attributes[key] = String(value); }, getAttribute(key) { return this.attributes[key] ?? null; }, removeAttribute(key) { delete this.attributes[key]; },
      appendChild(value) { return value; }, append() {}, remove() { this.isConnected = false; },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, element()); return children.get(selector); }, querySelectorAll() { return []; },
      addEventListener(type, callback) { handlers.set(type, callback); }, removeEventListener() {}, focus() {},
      click() { handlers.get('click')?.({ target: this }); },
      getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 }; },
    };
  }
  const body = element();
  const document = {
    body, documentElement: body, hidden: false, activeElement: { focus() {} }, createElement: element,
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); },
    querySelectorAll() { return []; }, addEventListener(type, callback) { documentListeners.set(type, callback); }, removeEventListener() {},
  };
  const writes = [];
  const storage = {
    user: { name: '새친구' }, state: { caught: [...caught], stamps: [], companion: null, ...(companions ? { companions: [...companions], companion: companions[0] ?? null } : {}), settings: { sound, area: 'mixed', difficulty: 1, ...extra } },
    update(patch, preferences) { writes.push({ patch, preferences }); this.state = { ...this.state, ...patch, settings: { ...this.state.settings, ...(patch.settings || {}) } }; },
  };
  const quiz = [
    { id: 't1', area: 'math', prompt: '1 + 1 = ?', options: ['2', '3', '4', '5'], answer: '2' },
    { id: 't2', area: 'korean', prompt: '「가」는 어느 것?', options: ['나', '가', '다', '라'], answer: '가' },
  ];
  const media = { matches: false, addEventListener() {}, removeEventListener() {} };
  const localStorage = { getItem: key => (local.has(key) ? local.get(key) : null), setItem: (key, value) => { local.set(key, String(value)); } };
  const window = { document, localStorage, innerWidth: 390, innerHeight: 844, addEventListener(type, callback) { listeners.set(type, callback); }, removeEventListener() {}, dispatchEvent() {}, scrollTo() {}, matchMedia: () => media, setTimeout: schedule, clearTimeout: removeTimer };
  // 문제 읽기 기록: 읽을 문장·읽을 보기 차례와 설정에 따른 enabled 값을 남긴다.
  const reads = [], speechWaits = [];
  window.Narration = { read(question, options) { reads.push({ text: question.prompt, options: question.options, enabled: options.enabled }); return true; }, cancel() {} };
  if (holdSpeech) window.Narration.readAndWait = question => new Promise(resolve => speechWaits.push({ text: question.prompt, resolve }));
  const performance = { now: () => time };
  window.performance = performance;
  const context = vm.createContext({
    window, document, GameStorage: storage, Image: class { set src(value) { this.source = value; } }, setTimeout: schedule, clearTimeout: removeTimer, navigator: {}, performance, AbortController,
    requestAnimationFrame: callback => schedule(() => callback(time), 16), cancelAnimationFrame: removeTimer,
    getComputedStyle: () => ({ display: 'block', opacity: '1', transform: 'none' }),
    // 처음 화면·도감 알림 문구는 이 시험의 관심 밖이라 빈 그림·빈 문장으로 둔다.
    TitlePoster: { render: () => '<section class="title-scene"></section>' }, DexHint: { say: () => '' },
    QuestionBank: { pick: ({ count }) => quiz.slice(0, count), levels: { math: [10], korean: ['자음'], english: ['알파벳'] } },
    POKEMON: [
      { id: 1, gen: 1, tier: 'normal', name: '이상해씨', types: ['grass'] }, { id: 4, gen: 1, tier: 'normal', name: '파이리', types: ['fire'] },
      { id: 7, gen: 1, tier: 'normal', name: '꼬부기', types: ['water'] }, { id: 10, gen: 1, tier: 'normal', name: '캐터피', types: ['bug'] },
      { id: 25, gen: 1, tier: 'normal', name: '피카츄', types: ['electric'] },
    ],
  });
  loadPokemonAssets(context);
  function load(relative) { vm.runInContext(fs.readFileSync(path.join(ROOT, relative), 'utf8'), context, { filename: relative }); for (const [name, value] of Object.entries(window)) if (name !== 'document') context[name] = value; }
  for (const file of ['js/core.js', 'js/pokemon-text.js', 'js/battle-view.js', 'js/adventure-motion.js', 'js/tutorial.js']) load(file);
  let source = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
  const startup = source.lastIndexOf('  title();\n'); assert.ok(startup >= 0, '실제 게임 초기 화면 계측 위치');
  source = source.slice(0, startup) + 'window.__game={setScreen,travelTo,encounter,lockSession,get partyGuideSlot(){return partyGuideSlot;},get screen(){return screen;},get battle(){return battle;},get nameOptions(){return nameOptions;},get hint(){return battleHint;},get region(){return region;},get busy(){return busy;},get popup(){return battlePopup;}};})();';
  vm.runInContext(source, context, { filename: 'js/game.js (출력만 메모리 계측)' });
  async function flush() { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); }
  async function advance(duration) {
    const target = time + duration;
    while (true) {
      await flush();
      const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      const [id, timer] = due; timers.delete(id); time = timer.at; timer.callback();
    }
    time = target; await flush();
  }
  const press = key => listeners.get('keydown')({ key, repeat: false, target: { tagName: 'BODY', matches() { return false; } }, preventDefault() {} });
  // 화면 버튼 누르기 흉내: 게임의 document click 처리기에 closest(selector) 가 이 버튼만 돌려주는 사건을 보낸다.
  function click(selector, dataset) {
    const target = { dataset, closest: wanted => (wanted === selector ? target : null) };
    return documentListeners.get('click')({ target });
  }
  return { node:selector=>document.querySelector(selector), click, local, reads, speechWaits, game: window.__game, tutorial: window.Tutorial, main: document.querySelector('#main'), root: document.documentElement, storage, writes, advance, press, quiz };
}

test('Tutorial.needed: 로그인했고 잡은 포켓몬이 0마리일 때만 튜토리얼', () => {
  const { tutorial } = harness();
  assert.equal(tutorial.needed({ user: { name: '가' }, state: { caught: [] } }), true);
  assert.equal(tutorial.needed({ user: { name: '가' }, state: { caught: [1] } }), false);
  assert.equal(tutorial.needed({ user: null, state: { caught: [] } }), false, '로그인 전에는 판단하지 않는다(로그인 창이 먼저)');
});

test('부모 잠금 전에는 글자 쓰기·지역·마당·도감 직접 진입도 게임을 열지 않는다',()=>{
  for(const target of ['wordbook','regions','yard','dex']){
    const env=harness([25]);env.storage.user=null;env.game.setScreen(target);
    assert.match(env.main.innerHTML,/parent-lock/);assert.doesNotMatch(env.main.innerHTML,/data-action="wordbook"|field-canvas|dex-entry/);
    assert.equal(env.game.screen,'title');
  }
});

test('완료된 선물 장면도 앱을 잠그면 제거되어 부모 화면을 가리지 않는다',async()=>{
 const env=harness([25]);const gift=env.node('.gift-scene');env.storage.logout=async()=>{env.storage.user=null;};
 await env.game.lockSession();assert.equal(gift.isConnected,false);assert.match(env.main.innerHTML,/parent-lock/);assert.equal(env.storage.user,null);
});

test('튜토리얼 건너뛰기: 카드/캐릭터 선택에서 피카츄 한 번 등록·대표 지정·지역 이동, 설정 유지', async () => {
  for (const steps of [0, 2, 3]) {
    const h = harness([], { extra: { trainerLook: 'girl', mathMax: 20 } });
    h.game.setScreen('tutorial');
    for (let i = 0; i < steps; i++) h.main.querySelector('[data-tutorial-next]').click();
    const settings = JSON.stringify(h.storage.state.settings);
    await h.click('[data-action]', { action: 'skip-tutorial' });
    await h.advance(2000);
    assert.equal(h.game.screen, 'regions');
    assert.deepEqual([...h.storage.state.caught], [25]);
    assert.deepEqual([...h.storage.state.companions], [25]);
    assert.equal(h.storage.state.companion, 25);
    assert.equal(JSON.stringify(h.storage.state.settings), settings);
    assert.equal(h.tutorial.needed(h.storage), false);
    const writes = h.writes.length;
    await h.click('[data-action]', { action: 'skip-tutorial' });
    assert.equal(h.writes.length, writes, '두 번 눌러도 중복 저장 없음');
    const reopened = harness(h.storage.state.caught, { companions: h.storage.state.companions });
    assert.notEqual(reopened.game.screen, 'tutorial', '저장 기록으로 다시 열면 튜토리얼이 아님');
  }
});

test('피카츄 첫 배틀을 문제 연출 도중 건너뛰어도 남은 타이머가 지역 선택을 덮지 않는다', async () => {
  const h = harness();
  h.game.setScreen('tutorial');
  for (let i = 0; i < 3; i++) h.main.querySelector('[data-tutorial-next]').click();
  h.main.querySelector('[data-tutorial-look="girl"]').click();
  await h.advance(1500);
  h.press(String(h.game.nameOptions.indexOf('피카츄') + 1));
  await h.advance(7700);
  h.press('1');
  assert.equal(h.game.busy, true);
  await h.click('[data-action]', { action: 'skip-tutorial' });
  await h.advance(30000);
  assert.equal(h.game.screen, 'regions');
  assert.deepEqual([...h.storage.state.caught], [25]);
  assert.equal(h.storage.state.settings.trainerLook, 'girl');
});

test('튜토리얼 건너뛰기는 일반 배틀·기존 수첩·로그인 전에는 피카츄를 지급하지 않는다', async () => {
  const existing = harness([1]);
  await existing.click('[data-action]', { action: 'skip-tutorial' });
  assert.deepEqual([...existing.storage.state.caught], [1]);
  const guest = harness();
  guest.storage.user = null;
  await guest.click('[data-action]', { action: 'skip-tutorial' });
  assert.deepEqual([...guest.storage.state.caught], []);
  const regular = harness();
  regular.game.encounter(false);
  await regular.advance(1500);
  assert.equal(regular.game.battle.tutorial, false);
  await regular.click('[data-action]', { action: 'skip-tutorial' });
  assert.deepEqual([...regular.storage.state.caught], []);
});

test('카드 3장: 피카츄 3D 앞모습, 글 두 줄, 「다음」 버튼 하나, 기존 아이콘·볼 그림만, 이모지 없음', () => {
  const { tutorial } = harness();
  assert.equal(tutorial.CARDS.length, 3);
  for (let step = 0; step < 3; step++) {
    const html = tutorial.render(step);
    assert.match(html, /https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/versions\/generation-viii\/brilliant-diamond-shining-pearl\/25\.webp/);
    assert.equal((html.match(/<button/g) || []).length, 1, '버튼은 「다음」 하나');
    assert.match(html, /data-tutorial-next>다음</);
    assert.ok(html.includes(tutorial.CARDS[step].title) && html.includes(tutorial.CARDS[step].text));
    assert.doesNotMatch(html, /\p{Extended_Pictographic}/u, '이모지 없음');
    assert.doesNotMatch(html, /<svg|<canvas/, '그림을 새로 그리지 않는다');
    for (const [, name] of html.matchAll(/icon-([a-z-]+)/g)) assert.ok(fs.existsSync(path.join(ROOT, 'img/art/icons', name + '.png')), name);
    for (const [, source] of html.matchAll(/src="([^"]+)"/g)) if (!source.startsWith('https://')) assert.ok(fs.existsSync(path.join(ROOT, source)), source);
  }
});

test('소리가 켜져 있으면 카드마다 문장을 읽고, 꺼져 있으면 읽지 않는다(옛 readAloud 값은 보지 않는다)', () => {
  for (const [sound, extra] of [[true, {}], [false, {}], [true, { readAloud: false }], [false, { readAloud: true }]]) {
    const h = harness([], { sound, extra });
    h.game.setScreen('regions');
    h.main.querySelector('[data-tutorial-next]').click();
    h.main.querySelector('[data-tutorial-next]').click();
    assert.deepEqual(h.reads.map(entry => entry.text), [...h.tutorial.CARDS].map(card => card.title.replace(/\n/g, ' ') + ' ' + card.text), '카드마다 한 번, 큰 글씨와 짧은 줄을 함께');
    assert.ok(h.reads.every(entry => entry.enabled === sound), `소리 ${sound}·옛 값 ${JSON.stringify(extra)} → 읽기 ${sound}`);
  }
});

test('0마리면 처음 화면·글자 쓰기·도감·마당 어디로 가려 해도 튜토리얼부터(가입·로그인 직후 바로)', async () => {
  for (const next of ['title', 'wordbook', 'dex', 'yard', 'regions', 'field']) {
    const h = harness([]);
    h.game.setScreen(next);
    assert.equal(h.game.screen, 'tutorial', next);
  }
});

test('잡은 포켓몬이 1마리 이상이면 지역 고르기는 그대로', async () => {
  const h = harness([1]);
  h.game.setScreen('regions');
  assert.equal(h.game.screen, 'regions');
  await h.game.travelTo('regions', 'travel');
  assert.equal(h.game.screen, 'regions');
});

test('0마리: 지역 대신 카드 3장 → 숲에서 피카츄 첫 배틀 → 오답에도 도망 없음 → 잡으면 caught·대표 25 → 「모험 떠나기」로 지역', async () => {
  const h = harness([]);
  await h.game.travelTo('regions', 'travel');
  assert.equal(h.game.screen, 'tutorial', '가입 직후·모험 시작의 지역 이동이 튜토리얼로 바뀐다');
  // 장면은 처음 한 번만 그리고(innerHTML 그대로), 「다음」에서는 카드 글만 바꾼다(깜빡임 없이 대화만 넘어감).
  const scene = h.main.innerHTML;
  for (let step = 1; step <= 3; step++) {
    assert.equal(h.main.innerHTML, scene, `카드 ${step}: 장면을 다시 그리지 않는다`);
    assert.equal(h.main.querySelector('.tutorial-screen').dataset.step, String(step));
    assert.equal(h.main.querySelector('.tutorial-screen').querySelector('.tutorial-title').textContent, h.tutorial.CARDS[step - 1].title);
    h.main.querySelector('[data-tutorial-next]').click();
  }
  // 셋째 카드 뒤 캐릭터 고르기: 고르기 전에는 배틀로 가지 않고, 여자를 고르면 settings.trainerLook 에 저장·<html data-trainer-look> 반영.
  assert.equal(h.game.screen, 'tutorial');
  assert.match(h.main.innerHTML, /data-guide="look"/);
  assert.equal(h.root.dataset.trainerLook, 'boy', '고르기 전에는 남자');
  h.main.querySelector('[data-tutorial-look="girl"]').click();
  h.main.querySelector('[data-tutorial-look="boy"]').click();
  assert.equal(h.storage.state.settings.trainerLook, 'girl', '처음 누른 하나만');
  assert.ok(h.writes.some(entry => entry.patch.settings?.trainerLook === 'girl' && entry.preferences === true), '설정 저장(바꾼 시각 포함)');
  assert.equal(h.root.dataset.trainerLook, 'girl');
  assert.equal(h.game.screen, 'battle', '캐릭터를 고르면 필드 없이 바로 배틀');
  assert.equal(h.game.region, 'forest');
  assert.equal(h.game.battle.pokemon.id, 25);
  assert.equal(h.game.battle.tutorial, true);
  assert.equal(h.game.battle.gold, false);
  assert.equal(h.game.battle.total, 2, '일반 볼·문제 2개');
  assert.equal(h.game.battle.method, 'feed', '트레이너뿐: 묻지 않고 먹이 주기(열매)');
  await h.advance(1500);
  assert.equal(h.game.popup, true, '그림자 퀴즈 팝업');
  assert.match(h.main.innerHTML, /class="gb-status gb-status--enemy gb-status--heart"/, '그림자 단계부터 상대 칸은 마음 막대');
  assert.doesNotMatch(h.main.innerHTML, /gb-hp--enemy/, 'HP 막대가 아님');
  assert.equal(h.game.hint, '', '그림자 팝업에 안내 글은 없다(보기가 톡톡 반짝이는 움직임으로 대신)');

  const right = h.game.nameOptions.indexOf('피카츄');
  const wrong = [0, 1, 2, 3].filter(index => index !== right);
  for (const index of wrong) { h.press(String(index + 1)); await h.advance(50); }
  assert.equal(h.game.battle.hearts, 3, '그림자 오답 세 번에도 HP 그대로');
  assert.equal(h.game.battle.phase, 'silhouette');
  assert.equal(h.game.popup, true, '팝업은 그대로 두고 보기만 잠근다');
  h.press(String(right + 1));
  await h.advance(7700);
  assert.equal(h.game.battle.phase, 'question');
  assert.equal(h.game.popup, true);
  assert.equal(h.game.hint, '', '문제 팝업에는 튜토리얼 안내가 없다');

  for (const index of [1, 2, 3]) { h.press(String(index + 1)); await h.advance(50); }
  assert.equal(h.game.battle.hearts, 3, '문제 오답 세 번에도 HP 그대로');
  assert.equal(h.game.busy, false, '피격 연출 없이 바로 다시 고른다');
  h.press('1');
  await h.advance(3800);
  assert.equal(h.game.battle.index, 1);
  h.press('2');
  await h.advance(3800 + 9700);
  assert.equal(h.game.battle.phase, 'caught', '마지막 문제 뒤 자동으로 던져 잡는다');
  assert.deepEqual([...h.storage.state.caught], [25]);
  assert.deepEqual([...h.storage.state.companions], [25]);
  assert.equal(h.storage.state.companion, 25, '동행 대표가 피카츄');
  assert.match(h.main.innerHTML, /data-action="regions"[^]*모험 떠나기/, '잡았다 화면 버튼은 「모험 떠나기」');
  assert.doesNotMatch(h.main.innerHTML, /data-action="back-field"/);

  h.game.setScreen('regions');
  assert.equal(h.game.screen, 'regions', '잡은 뒤에는 지역 고르기');
});

// 보기 번호(2026-11-14 사용자 「보기에 번호가 안 써져 있다. 읽어 주긴 하는데」): game.js answerButtons 가 버튼마다 번호(.gb-answer-no)를 하나씩 붙이고,
// 번호 = data-answer + 1 = aria-keyshortcuts, 차례는 문제 읽기에 넘긴 보기 차례(js/narration.js 가 「N번」을 붙이는 차례)와 같다. 키보드 N 은 번호 N 보기를 고른다.
// 화면 배치(2×2·한 줄 꼴)와 겹침은 .test/option-numbers-browser.mjs 가 본다.
test('보기 번호: 버튼마다 번호 하나(1~4), data-answer·aria-keyshortcuts·읽는 보기 차례와 같고, 키보드 N 이 번호 N 보기를 고른다(잠긴 보기도 번호 그대로)', async () => {
  const h = harness([], { sound: true });
  await h.game.travelTo('regions', 'travel');
  for (let step = 1; step <= 3; step++) h.main.querySelector('[data-tutorial-next]').click();
  h.main.querySelector('[data-tutorial-look="boy"]').click();
  await h.advance(1500);
  assert.equal(h.game.popup, true, '그림자 퀴즈 팝업');
  const buttons = () => [...h.main.innerHTML.matchAll(/<button class="gb-answer[^"]*" data-answer="(\d)" aria-keyshortcuts="(\d)"[^>]*>(.*?)<\/button>/g)].map(([whole, answer, key, inside]) => ({
    answer: Number(answer), key: Number(key), disabled: /\sdisabled>/.test(whole.slice(0, whole.indexOf('>') + 1)),
    numbers: [...inside.matchAll(/<span class="gb-answer-no" aria-hidden="true">([^<]*)<\/span>/g)].map(match => match[1]),
    label: inside.match(/<span class="gb-answer-label[^"]*"[^>]*>([^<]*)<\/span>/)?.[1]
  }));
  let shown = buttons();
  assert.equal(shown.length, 4, '보기 넷');
  assert.deepEqual(shown.map(button => button.answer), [0, 1, 2, 3], 'DOM 순서 = data-answer');
  assert.deepEqual(shown.map(button => button.key), [1, 2, 3, 4], 'aria-keyshortcuts 1~4');
  assert.deepEqual(shown.map(button => button.numbers), [['1'], ['2'], ['3'], ['4']], '버튼마다 번호 하나, data-answer + 1');
  const read = h.reads.filter(entry => entry.options?.length).at(-1);
  assert.deepEqual(shown.map(button => button.label), [...read.options], '화면 번호 차례 = 읽는 보기 차례(N번)');
  // 틀린 보기를 번호로 누르면 그 보기가 잠기고, 잠긴 보기도 번호는 그대로다. 맞는 보기를 번호로 누르면 정답.
  const right = shown.find(button => button.label === h.game.battle.pokemon.name);
  const wrong = shown.find(button => button !== right);
  h.press(wrong.numbers[0]);
  await h.advance(50);
  assert.deepEqual([...h.game.battle.wrong], [wrong.label], `키보드 ${wrong.numbers[0]} = ${wrong.numbers[0]}번 보기`);
  shown = buttons();
  assert.deepEqual(shown.filter(button => button.disabled).map(button => button.numbers), [wrong.numbers], '잠긴 보기도 번호가 남는다');
  assert.deepEqual(shown.map(button => button.numbers), [['1'], ['2'], ['3'], ['4']]);
  h.press(right.numbers[0]);
  assert.notEqual(h.game.battle.phase, 'silhouette', `키보드 ${right.numbers[0]} 로 ${right.label} 정답`);
});

test('캐릭터 고르기 장면: 남자·여자 앞모습 그림 버튼 둘(그림 파일 있음), 제목 한 줄, 이모지 없음', () => {
  const { tutorial } = harness();
  const html = tutorial.renderPick();
  assert.deepEqual([...html.matchAll(/data-tutorial-look="(\w+)"/g)].map(match => match[1]), ['boy', 'girl']);
  assert.equal((html.match(/<button/g) || []).length, 2, '버튼은 그림 둘뿐');
  for (const [, source] of html.matchAll(/src="([^"]+)"/g)) if (!source.startsWith('https://')) assert.ok(fs.existsSync(path.join(ROOT, source)), source);
  assert.match(html, /같이 모험할 캐릭터를 골라 줘!/);
  assert.doesNotMatch(html, /\p{Extended_Pictographic}/u, '이모지 없음');
  for (const look of ['boy', 'girl']) {
    for (const file of [`img/field-tiles/trainer-${look}.png`, `img/art/trainer-back-${look}.webp`, `img/art/trainer-front-${look}.webp`]) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  }
});

test('설정 창 캐릭터 버튼: 누르면 바꾸고 저장, 고른 적 없는 계정은 남자', async () => {
  const h = harness([25]);
  assert.equal(h.root.dataset.trainerLook, 'boy', '고른 적 없는 계정은 남자');
  await h.click('[data-action]', { action: 'settings' });
  await h.click('button[data-trainer-look]', { trainerLook: 'girl' });
  assert.equal(h.storage.state.settings.trainerLook, 'girl');
  assert.equal(h.root.dataset.trainerLook, 'girl');
  await h.click('button[data-trainer-look]', { trainerLook: 'boy' });
  assert.equal(h.storage.state.settings.trainerLook, 'boy');
  assert.equal(h.root.dataset.trainerLook, 'boy');
});

// ---------- 같이 다닐 친구 안내: 잡은 포켓몬이 3마리가 되면 한 번, 카드 한 장 → 도감 파트너 칸이 금빛으로 톡톡 ----------
const GUIDE_KEY = 'pokemon-adventure:party-guide:새친구';
const guided = html => [...html.matchAll(/class="party-slot[^"]*\bis-guided\b[^"]*" data-party-slot="(\d)"/g)].map(match => Number(match[1]));
// 2마리(튜토리얼 피카츄 + 이상해씨)에서 숲 배틀 하나를 잡아 3마리가 된 잡았다 화면까지.
async function catchThird(options = {}) {
  const h = harness([25, 1], { companions: [25], ...options });
  h.game.encounter(false);
  await h.advance(1500);
  assert.equal(h.game.screen, 'battle');
  assert.equal(h.game.battle.tutorial, false);
  h.press(String(h.game.nameOptions.indexOf(h.game.battle.pokemon.name) + 1));
  await h.advance(7700);
  h.press(String(h.quiz[0].options.indexOf(h.quiz[0].answer) + 1));
  await h.advance(3800);
  h.press(String(h.quiz[1].options.indexOf(h.quiz[1].answer) + 1));
  await h.advance(3800 + 9700);
  assert.equal(h.game.battle.phase, 'caught');
  assert.equal(h.storage.state.caught.length, 3);
  return h;
}

test('같이 다닐 친구 카드: 잡은 셋의 3D 앞모습, 큰 글씨 한 줄·짧은 한 줄, 「좋아!」 버튼 하나, 이모지 없음', () => {
  const { tutorial } = harness();
  const html = tutorial.renderParty([{ id: 25, name: '피카츄' }, { id: 1, name: '이상해씨' }, { id: 10, name: '캐터피' }]);
  assert.deepEqual([...html.matchAll(/src="https:[^"]*\/(\d+)\.webp/g)].map(match => Number(match[1])), [25, 1, 10]);
  assert.equal((html.match(/<button/g) || []).length, 1, '버튼은 「좋아!」 하나');
  assert.match(html, /data-tutorial-next>좋아!</);
  assert.ok(html.includes(tutorial.PARTY_CARD.title) && html.includes(tutorial.PARTY_CARD.text));
  assert.doesNotMatch(html, /\p{Extended_Pictographic}/u, '이모지 없음');
  for (const [, name] of html.matchAll(/icon-([a-z-]+)/g)) assert.ok(fs.existsSync(path.join(ROOT, 'img/art/icons', name + '.png')), name);
  for (const [, source] of html.matchAll(/src="([^"]+)"/g)) if (!source.startsWith('https://')) assert.ok(fs.existsSync(path.join(ROOT, source)), source);
});

test('2마리 → 3마리가 된 잡았다 화면 「계속」: 필드 대신 카드 → 「좋아!」 → 도감 둘째 칸 반짝임 → 칸에서 고르면 끝·동행 저장', async () => {
  const h = await catchThird({ sound: true });
  assert.deepEqual([...h.storage.state.companions], [25, h.game.battle.pokemon.id], '둘째 포켓몬은 빈 동행 칸에 저절로 들어갔다');
  await h.click('[data-action]', { action: 'back-field' });
  assert.equal(h.game.screen, 'partyGuide', '「계속」 → 필드 대신 같이 다닐 친구 카드');
  assert.match(h.main.innerHTML, /data-guide="party"/);
  assert.deepEqual([...h.main.innerHTML.matchAll(/src="https:[^"]*\/(\d+)\.webp/g)].map(match => Number(match[1])), [...h.storage.state.caught]);
  assert.equal(h.local.get(GUIDE_KEY), '1', '띄운 순간 이 기기에 계정별로 본 것을 기억');
  const card = h.tutorial.PARTY_CARD;
  assert.equal(h.reads.at(-1).text, card.title + ' ' + card.text, '소리가 켜져 있으면 카드 문장을 읽는다');
  assert.equal(h.reads.at(-1).enabled, true);

  h.main.querySelector('[data-tutorial-next]').click();
  assert.equal(h.game.screen, 'dex', '「좋아!」 → 도감');
  assert.equal(h.game.partyGuideSlot, 1);
  assert.deepEqual(guided(h.main.innerHTML), [1], '둘째(동행) 칸 하나만 반짝인다');

  await h.click('[data-party-slot]', { partySlot: '1' });
  assert.deepEqual(guided(h.main.innerHTML), [1], '고르기 창만 열고 아직 고르지 않았으면 그대로 반짝인다');
  await h.click('[data-party-pick]', { partyPick: '1' });
  assert.deepEqual([...h.storage.state.companions], [25, 1], '고른 포켓몬이 동행 칸에 저장');
  assert.equal(h.storage.state.companion, 25);
  assert.equal(h.game.partyGuideSlot, null);
  assert.deepEqual(guided(h.main.innerHTML), [], '칸에서 고르면 반짝임이 멈춘다');
});

test('같이 다닐 친구 안내: 문제 읽기가 꺼져 있으면 읽지 않는다, 대표 칸이 비어 있으면 대표 칸이 반짝인다', async () => {
  const h = await catchThird({ companions: [] });
  // 대표 칸이 빈 계정은 잡을 때 대표 칸에 저절로 들어가므로, 시험에서는 잡은 뒤 비워 둔다.
  h.storage.update({ companions: [], companion: null }, true);
  await h.click('[data-action]', { action: 'back-field' });
  assert.equal(h.game.screen, 'partyGuide');
  assert.equal(h.reads.at(-1).enabled, false);
  h.main.querySelector('[data-tutorial-next]').click();
  assert.deepEqual(guided(h.main.innerHTML), [0]);
});

test('선물 장면을 닫았을 때: 3마리가 되면 카드, 2마리면 그대로, 이미 본 계정은 다시 안 뜸', async () => {
  for (const [caught, local, expected] of [
    [[25, 1], new Map(), 'title'],
    [[25, 1, 4], new Map(), 'partyGuide'],
    [[25, 1, 4], new Map([[GUIDE_KEY, '1']]), 'title'],
  ]) {
    const h = harness(caught, { companions: [25, 1], local });
    h.game.setScreen('title');
    await h.click('[data-action]', { action: 'gift-close' });
    assert.equal(h.game.screen, expected, `${caught.length}마리·${local.size ? '본 계정' : '처음'}`);
  }
});

test('같이 다닐 친구 안내는 가두지 않는다: 카드를 본 뒤 도감에서 다른 화면으로 나가면 반짝임도 끝, 다시 띄우지 않는다', async () => {
  const local = new Map();
  const h = harness([25, 1, 4], { companions: [25, 1], local });
  h.game.setScreen('title');
  await h.click('[data-action]', { action: 'gift-close' });
  h.main.querySelector('[data-tutorial-next]').click();
  assert.deepEqual(guided(h.main.innerHTML), [1]);
  h.game.setScreen('title');
  assert.equal(h.game.partyGuideSlot, null);
  h.game.setScreen('dex');
  assert.deepEqual(guided(h.main.innerHTML), [], '도감에 다시 와도 반짝이지 않는다');
  await h.click('[data-action]', { action: 'gift-close' });
  assert.notEqual(h.game.screen, 'partyGuide', '한 번 본 뒤에는 다시 안 뜸');
});

test('공격 대사와 가랏 몬스터볼 읽기가 끝나야 실제 공을 던진다', async()=>{
 const h=harness([],{sound:true,holdSpeech:true});
 await h.game.travelTo('regions','travel');for(let step=0;step<3;step++)h.main.querySelector('[data-tutorial-next]').click();h.main.querySelector('[data-tutorial-look="boy"]').click();await h.advance(1500);
 assert.match(h.main.innerHTML,/data-action="read-question"[^>]*aria-label="문제 다시 듣기"/);
 h.press(String(h.game.nameOptions.indexOf('피카츄')+1));await h.advance(7700);
 h.press('1');await h.advance(4000);assert.equal(h.speechWaits.length,1);assert.equal(h.game.busy,true);h.speechWaits[0].resolve(true);await h.advance(3000);
 h.press('2');await h.advance(4000);assert.equal(h.game.battle.phase,'capture');assert.equal(h.speechWaits.length,2);assert.doesNotMatch(h.speechWaits[1].text,/조금 다가|마지막 문제|한 문제/);assert.doesNotMatch(h.main.innerHTML,/class="gb-throw-ball"/);
 h.speechWaits[1].resolve(true);await h.advance(5000);assert.equal(h.speechWaits.length,3);assert.match(h.speechWaits[2].text,/몬스터볼/);assert.equal(h.game.battle.phase,'capture','가랏 대사를 읽는 동안 아직 던지지 않음');
 h.speechWaits[2].resolve(true);await h.advance(9800);assert.equal(h.game.battle.phase,'caught');assert.deepEqual([...h.storage.state.caught],[25]);
});

test('포획 대사 중 설정을 열면 공 던지기를 멈추고 닫은 뒤 대사를 다시 읽는다',async()=>{
 const h=harness([],{sound:true,holdSpeech:true});await h.game.travelTo('regions','travel');for(let n=0;n<3;n++)h.main.querySelector('[data-tutorial-next]').click();h.main.querySelector('[data-tutorial-look="boy"]').click();await h.advance(1500);h.press(String(h.game.nameOptions.indexOf('피카츄')+1));await h.advance(7700);
 h.press('1');await h.advance(4000);h.speechWaits[0].resolve(true);await h.advance(3000);h.press('2');await h.advance(4000);h.speechWaits[1].resolve(true);await h.advance(1000);assert.equal(h.speechWaits.length,3);
 const modal=h.node('#modal-root');Object.defineProperty(modal,'firstChild',{get(){return this.innerHTML?{}:null;}});
 h.click('[data-action]',{action:'settings'});h.speechWaits[2].resolve(false);await h.advance(10000);assert.equal(h.game.battle.phase,'capture');assert.deepEqual([...h.storage.state.caught],[]);
 h.click('[data-action]',{action:'close-modal'});await h.advance(250);assert.equal(h.speechWaits.length,4);assert.equal(h.speechWaits[3].text,h.speechWaits[2].text);h.speechWaits[3].resolve(true);await h.advance(9800);assert.equal(h.game.battle.phase,'caught');
});
