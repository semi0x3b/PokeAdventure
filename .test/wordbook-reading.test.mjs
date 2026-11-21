import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness({ canRead = () => true, onPass } = {}) {
  let now = 0, sequence = 0;
  const timers = new Map(), reads = [], pads = [], observers = [];
  const browser = {
    localStorage: { getItem: () => null, setItem() {} },
    speechSynthesis: { speaking: false, pending: false },
    setTimeout(callback, delay = 0) { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} }
  };
  const document = { defaultView: browser, createElement: tag => new Element(tag) };
  class Element {
    constructor(tag) { this.tagName = tag; this.ownerDocument = document; this.children = []; this.dataset = {}; this.style = { setProperty() {} }; this.className = ''; this.textContent = ''; this.events = new Map(); this.width = 300; this.height = 200; }
    get classList() { return { add() {}, remove() {}, toggle() {} }; }
    setAttribute() {}
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    prepend(...children) { for (const child of children) child.parent = this; this.children.unshift(...children); }
    replaceChildren(...children) { for (const child of this.children) child.parent = null; this.children = []; this.append(...children); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    addEventListener(type, handler) { this.events.set(type, handler); }
    removeEventListener(type, handler) { if (this.events.get(type) === handler) this.events.delete(type); }
    click() { this.events.get('click')?.(); }
    getBoundingClientRect() { return { width: this.width, height: this.height }; }
    find(predicate) { if (predicate(this)) return this; for (const child of this.children) { const found = child.find(predicate); if (found) return found; } return null; }
  }
  const window = {
    WORDBOOK_WORDS: [{ id: 'ko-apple', language: 'ko', word: '사과' }, { id: 'ko-ball', language: 'ko', word: '공' }, { id: 'en-cat', language: 'en', word: 'cat' }],
    StrokeLetters: { supports: () => true },
    GuidedTracingPad: { create(canvas, options) {
      const pad = { canvas, options, strokes: 1, progress: { glyphIndex: 0, complete: false }, eraser: false,
        setEraser(on) { this.eraser = on; }, score: () => ({ pass: true }), resize() {}, destroy() {}, replay() {}, clear() {} };
      pads.push(pad); return pad;
    } }
  };
  const math = Object.create(Math); math.random = () => 0;
  vm.runInNewContext(fs.readFileSync(new URL('../js/wordbook.js', import.meta.url), 'utf8'), { window, Math: math });
  const container = new Element('main');
  const session = window.Wordbook.mount(container, { onRead: word => reads.push({ word, at: now }), canRead, onPass });
  function advance(duration) {
    const target = now + duration;
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      const [id, timer] = due; timers.delete(id); now = timer.at; timer.callback();
    }
    now = target;
  }
  const click = action => container.find(node => node.dataset.wordbookAction === action).click();
  const select = id => { click('list'); container.find(node => node.dataset.wordbookCard === id).click(); };
  return { session, browser, reads, pads, observers, container, advance, click, select, now: () => now };
}

test('첫 낱말은 소개가 끝난 뒤 한 번만 읽고 진행·지우개·크기 변경·시범에서는 반복하지 않는다', () => {
  const env = harness();
  env.advance(2199); assert.deepEqual(env.reads, []);
  env.advance(1); assert.deepEqual(env.reads, [{ word: '사과', at: 2200 }]);
  env.pads.at(-1).options.onProgress({ glyphIndex: 1, strokeIndex: 1, progress: .5 });
  env.click('clear'); env.click('replay');
  env.pads.at(-1).canvas.width = 400; env.observers.at(-1).callback();
  env.advance(5000); assert.equal(env.reads.length, 1);
});

test('다른 낱말과 다음 낱말은 전환 후 읽고 같은 낱말로 목록에서 돌아오면 다시 읽지 않는다', () => {
  const env = harness(); env.advance(2200);
  env.select('ko-apple'); env.advance(500); assert.equal(env.reads.length, 1);
  env.select('ko-ball'); env.advance(499); assert.equal(env.reads.length, 1);
  env.advance(1); assert.equal(env.reads.at(-1).word, '공');
  env.click('complete'); env.advance(2150 + 350 + 500);
  assert.deepEqual(env.reads.map(read => read.word), ['사과', '공', '사과']);
});

test('소개 중 낱말을 바꾸면 옛 낱말 예약을 취소하고 소개 뒤 현재 낱말만 읽는다', () => {
  const env = harness(); env.advance(1000); env.select('ko-ball');
  env.advance(1199); assert.deepEqual(env.reads, []);
  env.advance(1); assert.deepEqual(env.reads, [{ word: '공', at: 2200 }]);
});

test('기존 안내가 끝날 때까지 기다리고 화면이나 낱말을 떠나면 늦은 읽기를 취소한다', () => {
  const env = harness(); env.browser.speechSynthesis.speaking = true;
  env.advance(3000); assert.deepEqual(env.reads, []);
  env.browser.speechSynthesis.speaking = false;
  env.advance(100); assert.equal(env.reads.at(-1).word, '사과');
  env.select('ko-ball'); env.advance(300); env.session.destroy(); env.advance(5000);
  assert.deepEqual(env.reads.map(read => read.word), ['사과']);
  const early = harness(); early.advance(1000); early.session.destroy(); early.advance(5000);
  assert.deepEqual(early.reads, []);
});

test('수동 듣기는 언제든 반복할 수 있고 예정된 자동 읽기와 겹치지 않으며 영어도 같은 콜백을 쓴다', () => {
  const env = harness(); env.click('read'); env.advance(2200);
  assert.deepEqual(env.reads.map(read => read.word), ['사과']);
  env.click('read'); assert.equal(env.reads.length, 2);
  env.container.find(node => node.dataset.wordbookValue === 'en').click(); env.advance(500);
  assert.equal(env.reads.at(-1).word, 'cat');
  env.click('read'); assert.deepEqual(env.reads.map(read => read.word), ['사과', '사과', 'cat', 'cat']);
});


function gamePermission() {
  let mounted;
  const overlays = new Set();
  const state = {
    screen: 'wordbook', wordbookSession: null, main: {},
    S: { user: { name: '별수첩' } }, wordPassed() {}, wordGiftProgress() {},
    window: {}, modalRoot: { firstChild: null },
    document: { hidden: false, querySelector: selector => overlays.has(selector) ? {} : null },
    Wordbook: { mount(container, options) { mounted = options; return { destroy() {} }; } }
  };
  const game = fs.readFileSync(new URL('../js/game.js', import.meta.url), 'utf8');
  const start = game.indexOf('  function wordbookScreen() {');
  const end = game.indexOf('\n  }', start) + 4;
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(game.slice(start, end) + '\nwordbookScreen();', state);
  assert.equal(typeof mounted.canRead, 'function', '실제 게임이 화면 상태 검사 콜백을 전달함');
  return { canRead: mounted.canRead, state, overlays };
}

test('실제 게임은 선물·설정·소개·숨김·다른 화면에서 자동 읽기를 막는다', () => {
  const permission = gamePermission();
  assert.equal(permission.canRead(), true);
  for (const selector of ['.gift-scene', '.feature-tour']) {
    permission.overlays.add(selector); assert.equal(permission.canRead(), false, selector);
    permission.overlays.delete(selector);
  }
  permission.state.modalRoot.firstChild = {}; assert.equal(permission.canRead(), false);
  permission.state.modalRoot.firstChild = null;
  permission.state.document.hidden = true; assert.equal(permission.canRead(), false);
  permission.state.document.hidden = false;
  permission.state.screen = 'title'; assert.equal(permission.canRead(), false);
});

test('선물 장면 뒤의 다음 낱말은 선물 닫기까지 미루고 닫으면 한 번 읽는다', () => {
  const permission = gamePermission();
  const env = harness({ canRead: permission.canRead, onPass: () => ({ counted: true, reveal: () => permission.overlays.add('.gift-scene') }) });
  env.advance(2200); env.click('complete'); env.advance(3000);
  assert.deepEqual(env.reads.map(read => read.word), ['사과']);
  permission.overlays.delete('.gift-scene'); env.advance(100);
  assert.deepEqual(env.reads.map(read => read.word), ['사과', '공']);
  env.advance(1000); assert.equal(env.reads.length, 2);
});

test('설정·숨김 동안 미룬 읽기는 다시 보일 때 읽고 화면을 떠나면 취소한다', () => {
  for (const blockedBy of ['settings', 'hidden']) {
    const permission = gamePermission();
    const block = value => {
      if (blockedBy === 'settings') permission.state.modalRoot.firstChild = value ? {} : null;
      else permission.state.document.hidden = value;
    };
    block(true);
    const env = harness({ canRead: permission.canRead }); env.advance(3000);
    assert.deepEqual(env.reads, [], blockedBy);
    block(false); env.advance(100); assert.equal(env.reads.length, 1, blockedBy);
    env.select('ko-ball'); block(true); env.advance(1000);
    env.session.destroy(); block(false); env.advance(5000);
    assert.equal(env.reads.length, 1, blockedBy + ' 떠난 뒤 예약 취소');
  }
});
