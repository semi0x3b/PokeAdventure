import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = new URL('../js/guided-tracing.js', import.meta.url);
const sandbox = {};
vm.createContext(sandbox);
if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
const tracker = (...args) => sandbox.GuidedTracingPad.createTracker(...args);
const p = (x, y = 0) => ({ x, y });
const line = [p(0), p(100)];
function trace(target, points) {
  target.begin(points[0]);
  for (const point of points.slice(1)) target.move(point);
  target.end();
}

test('현재 획의 시작부터 따라 쓸 때 화살표가 실제 입력 위치로 전진한다', () => {
  const target = tracker([line], { tolerance: 5 });
  target.begin(p(0));
  target.move(p(10));
  assert.equal(target.progress.marker.x, 10);
  assert.equal(target.progress.progress, .1);
  assert.equal(target.progress.complete, false);
});

test('끝점을 꼭 찍지 않아도 마지막 12%·최대16px 안이면 다음 획으로 간다', () => {
  const target = tracker([line, [p(0, 20), p(100, 20)]], { tolerance: 24, maxStep: 36 });
  trace(target, Array.from({ length: 18 }, (_, i) => p(i * 5)));
  assert.equal(target.progress.strokeIndex, 0);
  trace(target, [p(85), p(89)]);
  assert.equal(target.progress.strokeIndex, 1);
  assert.equal(target.progress.marker.y, 20);
  const long = tracker([[p(0), p(300)]], { tolerance: 24, maxStep: 36 });
  trace(long, Array.from({ length: 29 }, (_, i) => p(i * 10)));
  assert.equal(long.progress.complete, false, '긴 획의 20px 남은 상태는 아직 아님');
  trace(long, [p(280), p(285)]);
  assert.equal(long.progress.complete, true);
});

test('짧은 점획은 시작점을 누르거나 반만 그어서는 끝나지 않는다', () => {
  const dot = tracker([[p(0), p(2)]], { tolerance: 24, maxStep: 36 });
  trace(dot, [p(0), p(0)]);
  assert.equal(dot.progress.complete, false);
  trace(dot, [p(0), p(1)]);
  assert.equal(dot.progress.complete, false);
  trace(dot, [p(1), p(1.9)]);
  assert.equal(dot.progress.complete, true);
});

test('꺾이는 지점에 도착한 화살표는 다음 선의 방향을 가리킨다', () => {
  const target = tracker([[p(0), p(10), p(10, 20)]], { tolerance: 5 });
  target.begin(p(0));
  target.move(p(5));
  target.move(p(10));
  assert.equal(target.progress.marker.x, 10);
  assert.equal(target.progress.marker.y, 0);
  assert.equal(target.progress.marker.angle, Math.PI / 2);
});

test('중간과 끝에서 시작하거나 끝으로 순간이동하면 전진하지 않는다', () => {
  const target = tracker([line], { tolerance: 5 });
  trace(target, [p(70), p(80), p(100)]);
  assert.equal(target.progress.progress, 0);
  trace(target, [p(0), p(100)]);
  assert.equal(target.progress.progress, 0);
});

test('벗어나거나 역방향으로 써도 진행이 늘지 않고 현재 위치에서 이어 쓴다', () => {
  const target = tracker([line], { tolerance: 5 });
  trace(target, [p(0), p(10), p(20)]);
  trace(target, [p(20), p(15), p(10)]);
  assert.equal(target.progress.marker.x, 20);
  trace(target, [p(20), p(25, 20), p(35, 20), p(40)]);
  assert.equal(target.progress.marker.x, 20);
  trace(target, [p(20), p(30)]);
  assert.equal(target.progress.marker.x, 30);
});

test('손을 떼도 유지하며 끝까지 쓰면 다음 획 시작점으로 이동한다', () => {
  const target = tracker([{ points: line, glyphIndex: 0 }, { points: [p(20, 20), p(20, 40)], glyphIndex: 1 }], { tolerance: 5 });
  trace(target, [p(0), p(10), p(20)]);
  assert.equal(target.progress.progress, .2);
  trace(target, Array.from({ length: 9 }, (_, i) => p(20 + i * 10)));
  assert.equal(target.progress.strokeIndex, 1);
  assert.equal(target.progress.glyphIndex, 1);
  assert.equal(target.progress.marker.x, 20);
  assert.equal(target.progress.marker.y, 20);
  trace(target, [p(20, 20), p(20, 30), p(20, 40)]);
  assert.equal(target.progress.complete, true);
  assert.equal(target.progress.progress, 1);
});

test('닫힌 획의 시작과 끝이 같아도 한 바퀴를 실제 순서대로 써야 한다', () => {
  const square = [p(0), p(20), p(20, 20), p(0, 20), p(0)];
  const target = tracker([square], { tolerance: 3 });
  trace(target, [p(0), p(0, 5), p(0)]);
  assert.equal(target.progress.complete, false);
  target.reset();
  const points = [p(0), p(5), p(10), p(15), p(20), p(20, 5), p(20, 10), p(20, 15), p(20, 20), p(15, 20), p(10, 20), p(5, 20), p(0, 20), p(0, 15), p(0, 10), p(0, 5), p(0)];
  trace(target, points);
  assert.equal(target.progress.complete, true);
});

test('교차점에서 나중 구간으로 건너뛸 수 없다', () => {
  const target = tracker([[p(0), p(40, 40), p(0, 40), p(40)]], { tolerance: 3 });
  trace(target, [p(0), p(4, 4), p(8, 8), p(12, 12), p(16, 16), p(20, 20)]);
  const before = target.progress.progress;
  trace(target, [p(20, 20), p(24, 16), p(28, 12)]);
  assert.equal(target.progress.progress, before);
});

test('지운 위치의 진행을 복원하고 빈 자료는 안전하게 완료 상태를 돌려준다', () => {
  const target = tracker([line], { tolerance: 5 });
  trace(target, Array.from({ length: 11 }, (_, i) => p(i * 10)));
  target.restore({ strokeIndex: 0, progress: .3 });
  assert.equal(target.progress.complete, false);
  assert.equal(target.progress.marker.x, 30);
  trace(target, [p(30), p(40)]);
  assert.equal(target.progress.progress, .4);
  assert.equal(tracker([]).progress.complete, true);
});

// Node에는 Canvas가 없으므로 여기서는 브라우저 자원 경계만 대역으로 둔다.
// 픽셀 채점과 실제 화면 비교는 브라우저 회귀에서 확인한다.
function environment() {
  const frames = new Map();
  const holes = [];
  const contexts = [];
  let frameId = 0;
  const context = () => new Proxy({
    getImageData: (_x, _y, width, height) => {
      const data = new Uint8ClampedArray(width * height * 4).fill(255);
      for (const hole of holes) for (let y = hole.y - 2; y <= hole.y + 2; y++) for (let x = hole.x - 2; x <= hole.x + 2; x++) {
        data[(Math.round(y) * width + Math.round(x)) * 4 + 3] = 0;
      }
      return { data };
    }
  }, { get: (object, key) => object[key] ?? (() => {}) });
  const makeCanvas = () => {
    const listeners = new Map();
    const ctx = context();
    ctx.images = [];
    ctx.drawImage = (...args) => ctx.images.push(args);
    ctx.lines = [];
    ctx.lineTo = (x, y) => ctx.lines.push({ x, y });
    contexts.push(ctx);
    return { width: 0, height: 0, style: {}, listeners, getContext: () => ctx,
      bounds: { left: 0, top: 0, width: 320, height: 200 },
      getBoundingClientRect() { return this.bounds; },
      addEventListener(type, handler) { listeners.set(type, handler); },
      removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
      emit(type, point, pointerId = 1) { listeners.get(type)?.({ clientX: point.x, clientY: point.y, pointerId, preventDefault() {} }); },
      setPointerCapture() {}, releasePointerCapture() {}
    };
  };
  const env = {
    document: { createElement: makeCanvas }, devicePixelRatio: 3,
    getComputedStyle: () => ({ getPropertyValue: () => '', fontFamily: 'sans-serif' }),
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    StrokeLetters: { glyph: () => ({ strokes: [[p(0, 40), p(100, 40)]], advance: 100, kind: 'latin' }) },
    TracingPad: { grade: () => ({ inside: .8, coverage: .6, outside: .2, pass: true }) }
  };
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(file, 'utf8'), env);
  return { env, canvas: makeCanvas(), frames, holes, contexts };
}

test('보여 주기는 사용자 진행을 바꾸지 않으며 입력과 destroy에서 예약을 해제한다', () => {
  const { env, canvas, frames } = environment();
  const pad = env.GuidedTracingPad.create(canvas, { text: 'a' });
  pad.replay();
  assert.equal(frames.size, 1);
  assert.equal(pad.progress.progress, 0);
  canvas.emit('pointerdown', pad.progress.marker);
  assert.equal(frames.size, 0);
  assert.equal(canvas.width, 640);
  pad.replay();
  pad.destroy();
  assert.equal(frames.size, 0);
  assert.equal(canvas.listeners.size, 0);
});

test('회전하면 진행 위치와 잉크를 상대 좌표로 보존하며 pointercancel 뒤 입력을 멈춘다', () => {
  const { env, canvas } = environment();
  const pad = env.GuidedTracingPad.create(canvas, { text: 'a' });
  const start = pad.progress.marker;
  canvas.emit('pointerdown', start);
  canvas.emit('pointermove', { x: start.x + 10, y: start.y });
  const progress = pad.progress.progress;
  assert.ok(progress > 0);
  canvas.emit('pointercancel', start);
  canvas.emit('pointermove', { x: start.x + 20, y: start.y });
  assert.equal(pad.progress.progress, progress);
  canvas.bounds.width = 640;
  canvas.bounds.height = 400;
  pad.resize();
  assert.equal(pad.progress.progress, progress);
  assert.equal(pad.progress.marker.x, (start.x + 10) * 2);
  assert.equal(pad.score().pass, true);
  pad.clear();
  assert.equal(pad.progress.progress, 0);
  pad.destroy();
});

test('입력 이벤트 사이 잉크를 지운 경우에도 그 전 위치로 진행을 되돌린다', () => {
  const { env, canvas, holes } = environment();
  const pad = env.GuidedTracingPad.create(canvas, { text: 'a' });
  const start = pad.progress.marker;
  canvas.emit('pointerdown', start);
  canvas.emit('pointermove', { x: start.x + 10, y: start.y });
  canvas.emit('pointerup', { x: start.x + 10, y: start.y });
  pad.setEraser(true);
  const erased = { x: Math.round(start.x + 5), y: Math.round(start.y) };
  canvas.emit('pointerdown', erased);
  // 실제 캔버스가 지우개를 적용한 뒤 반환하는 알파의 빈 구간.
  holes.push(erased);
  canvas.emit('pointerup', erased);
  assert.ok(pad.progress.marker.x <= start.x + 7);
  pad.destroy();
});

// 안내는 가로세로 비율을 유지하므로 잉크도 글자 좌표로 이동해야 한다.
test('세로에서 낮은 가로로 회전해도 실제 잉크 끝이 화살표 위치에 붙는다', () => {
  const { env, canvas, contexts } = environment();
  const pad = env.GuidedTracingPad.create(canvas, { text: 'a' });
  const start = pad.progress.marker;
  canvas.emit('pointerdown', start);
  canvas.emit('pointermove', { x: start.x + 10, y: start.y });
  canvas.emit('pointerup', start);
  const saved = pad.progress.progress;
  canvas.bounds = { left: 0, top: 0, width: 640, height: 150 };
  pad.resize();
  const ink = contexts.at(-2);
  const end = ink.lines.at(-1);
  assert.equal(pad.progress.progress, saved);
  assert.ok(Math.abs(end.x - pad.progress.marker.x) < .1, JSON.stringify({ end, marker: pad.progress.marker }));
  assert.ok(Math.abs(end.y - pad.progress.marker.y) < .1);
  pad.destroy();
});

test('같은 낱말이어도 계정이 달라지면 앞 아이의 잉크와 화살표를 가져오지 않는다', () => {
  const { env, canvas } = environment();
  const first = env.GuidedTracingPad.create(canvas, { text: 'a', owner: 'first' });
  const start = first.progress.marker;
  canvas.emit('pointerdown', start);
  canvas.emit('pointermove', { x: start.x + 10, y: start.y });
  canvas.emit('pointerup', start);
  first.destroy();
  const second = env.GuidedTracingPad.create(canvas, { text: 'a', owner: 'second' });
  assert.equal(second.strokes, 0);
  assert.equal(second.progress.progress, 0);
  second.destroy();
});

test('글씨 화면에는 안내 획만 칠하고 손가락 원본 잉크를 겹쳐 그리지 않는다', () => {
  const { env, canvas, contexts } = environment();
  const pad = env.GuidedTracingPad.create(canvas, { text: 'a' });
  const start = pad.progress.marker;
  canvas.emit('pointerdown', start);
  canvas.emit('pointermove', { x: start.x + 10, y: start.y });
  canvas.emit('pointerup', start);
  assert.ok(pad.progress.progress > 0);
  assert.equal(pad.strokes, 1, '채점·지우개용 입력 기록은 유지');
  assert.equal(contexts[0].images.length, 0, '손가락 잉크 레이어를 화면에 복사하지 않는다');
  pad.destroy();
});

test('안내선에서 조금 벗어나도 화살표가 손가락을 따라 전진한다', () => {
  const { env, canvas } = environment();
  const pad = env.GuidedTracingPad.create(canvas, { text: 'a' });
  const start = pad.progress.marker;
  canvas.emit('pointerdown', { x: start.x, y: start.y + 15 });
  canvas.emit('pointermove', { x: start.x + 10, y: start.y + 15 });
  canvas.emit('pointerup', start);
  assert.ok(pad.progress.progress > 0);
  assert.equal(pad.progress.marker.y, start.y, '화살표는 안내 경로 위에 유지');
  pad.destroy();
});

test('어린이가 안내 옆 24px에서 시작해도 이어 쓰되 큰 점프는 세지 않는다', () => {
  const { env, canvas } = environment();
  const pad = env.GuidedTracingPad.create(canvas, { text: 'a' });
  const start = pad.progress.marker;
  canvas.emit('pointerdown', { x: start.x, y: start.y + 24 });
  canvas.emit('pointermove', { x: start.x + 10, y: start.y + 24 });
  assert.ok(pad.progress.progress > 0, '24px 흔들림도 전진');
  canvas.emit('pointerup', start);
  pad.clear();
  canvas.emit('pointerdown', start);
  canvas.emit('pointermove', { x: start.x + 70, y: start.y });
  assert.equal(pad.progress.progress, 0, '판정 폭을 넓혀도 70px 순간이동은 거절');
  pad.destroy();
});
