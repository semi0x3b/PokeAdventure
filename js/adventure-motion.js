/* 작은 모션과 순서 제어. 게임 상태 변경은 호출하는 쪽의 콜백이 담당한다. */
(function (root) {
  'use strict';

  const active = new Set();
  const noopGuard = () => true;
  const motionQuery = '(prefers-reduced-motion: reduce)';

  function now() {
    return root.performance && typeof root.performance.now === 'function' ? root.performance.now() : Date.now();
  }

  function finish(record, result) {
    if (record.done) return;
    record.done = true;
    let outcome = result;
    for (const timer of record.timers) root.clearTimeout(timer);
    record.timers.clear();
    for (const resume of [...record.waiters]) resume(false);
    record.waiters.clear();
    if (record.media && record.media.removeEventListener) record.media.removeEventListener('change', record.motionChanged);
    for (const animation of record.animations) {
      try { animation.cancel(); } catch { outcome = false; }
    }
    record.animations.clear();
    // 같은 요소를 여러 단계에서 바꿨다면 가장 나중 변경부터 되돌린다.
    for (const cleanup of [...record.cleanups].reverse()) {
      try { cleanup(outcome); } catch { outcome = false; }
    }
    record.cleanups.clear();
    active.delete(record);
    record.resolve(outcome);
  }

  function allowed(record) {
    if (record.done) return false;
    try {
      if (record.guard()) return true;
    } catch { /* 실패한 guard는 시퀀스를 성공으로 처리하지 않는다. */ }
    finish(record, false);
    return false;
  }

  // 모션 줄이기에서는 기다리지 않는다. 단 keepTime 시퀀스는 멈춘 화면을 같은 시간 보여 주려고 시간은 지킨다.
  function skipsTime(record) { return record.reduced && !record.keepTime; }

  function wait(record, milliseconds) {
    if (record.done) return Promise.resolve(false);
    if (skipsTime(record) || milliseconds <= 0) return Promise.resolve(true);
    return new Promise(resolve => {
      let released = false;
      let timer;
      function resume(result) {
        if (released) return;
        released = true;
        root.clearTimeout(timer);
        record.timers.delete(timer);
        record.waiters.delete(resume);
        resolve(result);
      }
      timer = root.setTimeout(() => resume(true), milliseconds);
      record.timers.add(timer);
      record.waiters.add(resume);
    });
  }

  // CSS 가 만든 애니메이션·전환(CSSAnimation·CSSTransition)은 스타일이 주인이다. 속성 값이 바뀌어 교체되는 것은
  // 정상이므로 시퀀스 실패로 보지 않고 취소하지도 않는다. 콜백이 element.animate 로 직접 만든 것만 맡는다.
  function cssOwned(animation) { return typeof animation.animationName === 'string' || typeof animation.transitionProperty === 'string'; }

  function track(record, animation) {
    if (!animation || typeof animation.cancel !== 'function' || record.animations.has(animation) || cssOwned(animation)) return;
    if (animation.finished && typeof animation.finished.catch === 'function') {
      animation.finished.catch(() => {
        // finish/cancel 및 감소된 모션 전환에서 발생하는 WAAPI 취소는 이미 정리 중이다.
        if (!record.done && !record.reduced) finish(record, false);
      });
    }
    if (record.done || record.reduced) {
      animation.cancel();
      return;
    }
    record.animations.add(animation);
  }

  function documentAnimations() {
    try {
      return root.document && typeof root.document.getAnimations === 'function' ? root.document.getAnimations() : [];
    } catch { return []; }
  }

  async function drive(record, steps, duration) {
    try {
      for (const step of steps) {
        if (!allowed(record)) return;
        const delay = skipsTime(record) ? 0 : Math.max(0, step.at - (now() - record.started));
        if (delay > 0 && !await wait(record, delay)) return;
        if (!allowed(record)) return;
        const previousAnimations = new Set(documentAnimations());
        let returned;
        try { returned = step.run(); }
        finally {
          // 콜백이 직접 시작한 WAAPI도 소유권을 기록해 취소 시 원래 상태로 돌린다.
          for (const animation of documentAnimations()) if (!previousAnimations.has(animation)) track(record, animation);
        }
        if (returned && typeof returned.then === 'function') await returned;
        if (!allowed(record)) return;
      }
      const remaining = skipsTime(record) ? 0 : Math.max(0, duration - (now() - record.started));
      if (remaining > 0 && !await wait(record, remaining)) return;
      if (allowed(record)) finish(record, true);
    } catch { finish(record, false); }
  }

  function start(steps, options = {}, setup) {
    let ordered;
    let duration;
    let guard;
    let media;
    try {
      if (!Array.isArray(steps)) throw new TypeError('steps는 배열이어야 합니다.');
      ordered = steps.map((step, order) => {
        if (!step || !Number.isFinite(step.at) || step.at < 0 || typeof step.run !== 'function') throw new TypeError('올바른 at/run 콜백이 필요합니다.');
        return { at: step.at, run: step.run, order };
      }).sort((first, second) => first.at - second.at || first.order - second.order);
      guard = options.guard === undefined ? noopGuard : options.guard;
      if (typeof guard !== 'function') throw new TypeError('guard는 함수여야 합니다.');
      const lastAt = ordered.length ? ordered[ordered.length - 1].at : 0;
      if (options.duration !== undefined && (!Number.isFinite(options.duration) || options.duration < 0)) throw new TypeError('duration은 0 이상의 시간이어야 합니다.');
      duration = Math.max(options.duration === undefined ? lastAt : options.duration, lastAt);
      media = root.matchMedia ? root.matchMedia(motionQuery) : null;
    } catch { return Promise.resolve(false); }

    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const record = {
      done: false, resolve, guard, started: now(), media, keepTime: options.keepTime === true,
      reduced: Boolean(media && media.matches), timers: new Set(), waiters: new Set(),
      animations: new Set(), cleanups: new Set(), motionChanged: null
    };
    record.motionChanged = event => {
      if (!event.matches || record.done || record.reduced) return;
      record.reduced = true;
      for (const animation of record.animations) {
        try { animation.cancel(); } catch { finish(record, false); return; }
      }
      if (record.keepTime) return;
      for (const resume of [...record.waiters]) resume(true);
    };
    active.add(record);
    if (!allowed(record)) return promise;
    try {
      if (setup) setup(record);
      if (record.media && record.media.addEventListener) record.media.addEventListener('change', record.motionChanged);
      void drive(record, ordered, duration);
    } catch { finish(record, false); }
    return promise;
  }

  function sequence(steps, options) { return start(steps, options); }

  function cancel() {
    for (const record of [...active]) finish(record, false);
  }

  function query(selector) {
    try { return root.document ? root.document.querySelector(selector) : null; }
    catch { return null; }
  }

  function connected(node) { return Boolean(node && node.isConnected !== false); }

  function effectGuard(nodes, guard) {
    return () => typeof guard === 'function' && guard() && nodes.every(connected);
  }

  function animate(record, node, frames, duration, fallback, easing = 'ease-in-out') {
    if (record.done || record.reduced || !connected(node)) return;
    if (typeof node.animate === 'function') {
      track(record, node.animate(frames, { duration, easing, fill: 'both' }));
      return;
    }
    if (!node.style) return;
    const original = node.style.animation;
    node.style.animation = `${fallback} ${duration}ms ${easing} both`;
    record.cleanups.add(() => { node.style.animation = original; });
  }

  function temporary(record, parent, tag, className, source) {
    const node = root.document.createElement(tag);
    node.className = className;
    node.setAttribute('aria-hidden', 'true');
    if (source) { node.src = source; node.alt = ''; }
    parent.appendChild(node);
    record.cleanups.add(() => node.remove());
    return node;
  }

  function temporaryClass(record, node, className) {
    if (!node.classList || node.classList.contains(className)) return;
    node.classList.add(className);
    record.cleanups.add(() => node.classList.remove(className));
  }

  // 장면 래퍼(.go-battle)의 카메라 값을 바꾼다. 끝나거나 취소되면 원래 값으로 돌린다.
  function camera(record, section, value) {
    if (!section || !section.dataset) return;
    const before = section.dataset.camera;
    section.dataset.camera = value;
    record.cleanups.add(() => { section.dataset.camera = before; });
  }

  // 효과 조각(고리·빛·반짝임·별·번쩍·햇살)은 CSS 애니메이션이 움직인다(adventure-motion.css). 여기서는 자리와 방향만 정한다.
  // spot: enemy(상대 가운데)·own(우리 편 가운데)·ball(땅에 놓인 볼 가운데), 없으면 장면 전체. 끝나거나 취소되면 지운다.
  // 모션 줄이기에서는 부르지 않는다(움직임 없는 장식만 남으면 오히려 헷갈린다).
  const BERRY = root.PokemonAssets.berry(); // PokeAPI 라즈열매(sprites/items/dream-world/razz-berry.png)
  const STAR = 'img/art/icons/star.png';
  function piece(record, stage, classes, spot, source) {
    return temporary(record, stage, source ? 'img' : 'span', spot ? `${classes} adventure-motion__fx--${spot}` : classes, source);
  }
  // 한 점에서 사방으로 퍼진다. stars 면 별과 반짝임을 번갈아, fall 이면 솟았다가 포물선으로 쏟아진다(별 촤라라).
  function scatter(record, stage, spot, count, { stars = false, fall = false } = {}) {
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2 - Math.PI / 2;
      // 흩어지는 조각은 모두 같은 노란 별(전환·포획·글자 쓰기와 같은 그림, 2026-11-13 사용자: 별·반짝이가 서로 다르다).
      const node = piece(record, stage, fall ? 'adventure-motion__confetti' : 'adventure-motion__spark', spot, STAR);
      node.style.setProperty('--dx', Math.cos(angle).toFixed(2));
      node.style.setProperty('--dy', Math.sin(angle).toFixed(2));
      node.style.setProperty('--fx-delay', `${index % 3 * 70}ms`);
      node.style.setProperty('--fx-scale', index % 2 ? '.75' : '1');
    }
  }
  // 장면 전체가 짧게 덜컹. 카메라(transform)와 겹치지 않게 translate·scale 속성만 쓴다.
  function quake(record, stage, soft) {
    temporaryClass(record, stage, soft ? 'adventure-motion-quake--soft' : 'adventure-motion-quake');
  }

  // 정답(correct): 카메라가 상대 쪽으로 당겨지고 우리 편이 달려들며 상대에게 노랑 타격 + 번쩍·금빛 고리·별과 반짝임·화면 덜컹.
  // 두 번째 오답(wrong): 상대가 달려들고 우리 편에 보라 타격 + 보라 고리·반짝임·살짝 덜컹, 카메라는 우리 편 쪽으로 살짝.
  // 카메라가 먼저 당겨지고(0.4초) 달려들어 0.76초에 맞힌다(game.js HP_IMPACT_MS 0.8초에 HP 가 줄기 시작).
  // 정답 2.3초·피격 2.2초(2026-11-13 「2배 느리게」, 답을 기다리는 시간이라 1.5배). 모션 줄이기에서는 움직임 없이 타격 그림만 같은 시간 보여 준다.
  // options.feed: 「먹이 주기」로 잡는 배틀(2026-11-14). 대표 포켓몬이 있어도 달려들지 않고 트레이너뿐일 때와 같은 열매·고개 돌리기 연출(같은 시간).
  function feedback(kind, guard = noopGuard, options = {}) {
    const section = query('.go-battle');
    const stage = query('.go-battle .gb-stage');
    const own = query('.go-battle .gb-own');
    const enemy = query('.go-battle .gb-stage .gb-pokemon');
    if (!own || !enemy || !stage || !['correct', 'wrong'].includes(kind) || !root.document) return Promise.resolve(false);
    const attack = kind === 'correct';
    let record;
    const lunge = attack ? [
      { transform: 'translate(0, 0)' },
      { offset: .45, transform: 'translate(18%, -10%)' },
      { transform: 'translate(0, 0)' }
    ] : [
      { transform: 'translate(0, 0) scale(1)' },
      { offset: .45, transform: 'translate(-16%, 8%) scale(1.08)' },
      { transform: 'translate(0, 0) scale(1)' }
    ];
    // 맞은 쪽은 좌우로 흔들리며 잠깐 하얗게 번쩍인다.
    const flinch = attack ? [
      { transform: 'translateX(0)', filter: 'brightness(1)' },
      { offset: .2, transform: 'translateX(-8%)', filter: 'brightness(2.6)' },
      { offset: .5, transform: 'translateX(6%)', filter: 'brightness(1.3)' },
      { offset: .75, transform: 'translateX(-3%)', filter: 'brightness(1)' },
      { transform: 'translateX(0)', filter: 'brightness(1)' }
    ] : [
      { transform: 'translate(0, 0) rotate(0)', filter: 'brightness(1)' },
      { offset: .2, transform: 'translate(-6%, 0) rotate(-3deg)', filter: 'brightness(2.4)' },
      { offset: .5, transform: 'translate(5%, 0) rotate(2deg)', filter: 'brightness(1.3)' },
      { offset: .75, transform: 'translate(-3%, 0) rotate(-1deg)', filter: 'brightness(1)' },
      { transform: 'translate(0, 0) rotate(0)', filter: 'brightness(1)' }
    ];
    // 우리 편이 트레이너뿐이면(튜토리얼) 사람이 포켓몬에게 부딪히지 않는다(2026-11-13 사용자). 「먹이 주기」를 고른 배틀도 같은 연출(대표 포켓몬이 통 뛰며 던져 준다).
    // 맞히면 트레이너가 제자리에서 라즈열매(PokeAPI 그림)를 던져 주고 상대가 기뻐 뛰고, 틀리면 상대가 고개를 홱 돌린다.
    // 모션 줄이기에서는 열매가 날아가지 않고 상대 앞에 가만히 보인다(공격의 타격 그림처럼 같은 시간).
    if (options?.feed === true || own.querySelector?.('.gb-trainer')) {
      const hop = [
        { transform: 'translate(0, 0)' }, { offset: .35, transform: 'translate(0, -9%)' }, { offset: .6, transform: 'translate(0, 0)' },
        { offset: .8, transform: 'translate(0, -4%)' }, { transform: 'translate(0, 0)' }
      ];
      const turnAway = [
        { transform: 'scaleX(1)' }, { offset: .2, transform: 'scaleX(-1)' }, { offset: .8, transform: 'scaleX(-1)' }, { transform: 'scaleX(1)' }
      ];
      const friendly = [
        { at: 0, run: () => camera(record, section, 'attack') },
        { at: 300, run: () => animate(record, own, hop, 700, 'adventure-motion-advance') },
        { at: 450, run: () => temporary(record, stage, 'img', record.reduced ? 'adventure-motion__berry adventure-motion__berry--still' : 'adventure-motion__berry', BERRY) },
        { at: 1250, run() {
          animate(record, enemy, hop, 800, 'adventure-motion-hit');
          if (record.reduced) return;
          piece(record, stage, 'adventure-motion__ring adventure-motion__ring--gold', 'enemy');
          scatter(record, stage, 'enemy', 8);
        } },
        { at: 1900, run: () => camera(record, section, 'wide') }
      ];
      const shy = [
        { at: 0, run: () => camera(record, section, 'attack') },
        { at: 400, run: () => animate(record, enemy, turnAway, 1300, 'adventure-motion-flinch') },
        { at: 1800, run: () => camera(record, section, 'wide') }
      ];
      return start(attack ? friendly : shy, { duration: attack ? 2300 : 2200, keepTime: true, guard: effectGuard([own, enemy, stage], guard) }, value => { record = value; });
    }
    const target = attack ? 'enemy' : 'own';
    const steps = [
      { at: 0, run: () => camera(record, section, attack ? 'attack' : 'hit') },
      { at: 400, run: () => animate(record, attack ? own : enemy, lunge, 700, attack ? 'adventure-motion-advance' : 'adventure-motion-lunge') },
      { at: 760, run() {
        const hit = temporary(record, stage, 'img', `adventure-motion__hit adventure-motion__hit--${target}`, `img/battle/fx-hit-${attack ? 'correct' : 'wrong'}.webp`);
        animate(record, hit, [
          { opacity: 0, transform: 'translate(-50%, -50%) scale(.4) rotate(-12deg)' },
          { offset: .25, opacity: 1, transform: 'translate(-50%, -50%) scale(1.1) rotate(4deg)' },
          { offset: .7, opacity: 1, transform: 'translate(-50%, -50%) scale(1.16) rotate(6deg)' },
          { opacity: 0, transform: 'translate(-50%, -50%) scale(1.3) rotate(8deg)' }
        ], 900, 'adventure-motion-burst');
        animate(record, attack ? enemy : own, flinch, 800, attack ? 'adventure-motion-hit' : 'adventure-motion-flinch');
        if (record.reduced) return;
        if (attack) piece(record, stage, 'adventure-motion__flash');
        piece(record, stage, `adventure-motion__ring adventure-motion__ring--${attack ? 'gold' : 'purple'}`, target);
        if (attack) scatter(record, stage, target, 8); // 별은 맞혔을 때만(맞았을 때는 고리만)
        quake(record, stage, !attack);
      } },
      { at: 1800, run: () => camera(record, section, 'wide') }
    ];
    return start(steps, { duration: attack ? 2300 : 2200, keepTime: true, guard: effectGuard([own, enemy, stage], guard) }, value => { record = value; });
  }

  // 정체 공개: 그림자가 걷히며 하얗게 번쩍(밝기 크게 → 보통)하고 살짝 크게 튕겼다가 제자리로. 뒤로 햇살이 돌며 퍼지고
  // 고리와 반짝임이 터진다(금색 볼은 금빛 햇살). 1.8초. 모션 줄이기에서는 그림자만 걷고 움직임은 없다. 취소되면 그림자 상태로 되돌린다.
  function reveal(guard = noopGuard) {
    const enemy = query('.go-battle .gb-stage .gb-pokemon');
    const stage = query('.go-battle .gb-stage');
    if (!enemy || !stage || !root.document) return Promise.resolve(false);
    const silhouette = enemy.classList.contains('silhouette');
    let record;
    return start([
      { at: 0, run() {
        if (silhouette) enemy.classList.remove('silhouette');
        if (record.reduced) return;
        piece(record, stage, 'adventure-motion__rays', 'enemy');
        piece(record, stage, 'adventure-motion__flash');
        // 공개 빛: 그림 없이 둥근 금빛만(반짝이 그림이 어색해 보인다, 2026-11-13 사용자).
        const light = temporary(record, stage, 'span', 'adventure-motion__reveal-light');
        animate(record, light, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.45)' }, { offset: .35, opacity: 1, transform: 'translate(-50%, -50%) scale(1.05)' }, { opacity: 0, transform: 'translate(-50%, -50%) scale(1.35)' }], 1800, 'adventure-motion-reveal-light');
        animate(record, enemy, [
          { filter: 'brightness(8)', transform: 'scale(.82)' },
          { offset: .55, filter: 'brightness(1.4)', transform: 'scale(1.12)' },
          { offset: .8, filter: 'brightness(1)', transform: 'scale(.97)' },
          { filter: 'brightness(1)', transform: 'scale(1)' }
        ], 1800, 'adventure-motion-reveal-pop', 'cubic-bezier(.3, 1.4, .5, 1)');
        piece(record, stage, 'adventure-motion__ring adventure-motion__ring--light adventure-motion__ring--big', 'enemy');
        scatter(record, stage, 'enemy', 8, { stars: true });
      } }
    ], { duration: 1800, guard: effectGuard([enemy, stage], guard) }, value => {
      record = value;
      record.cleanups.add(result => { if (!result && silhouette) enemy.classList.add('silhouette'); });
    });
  }

  function register(id) {
    if (!Number.isInteger(id) || id <= 0) return Promise.resolve(false);
    const entry = query(`.dex-entry[data-pokemon="${id}"]`);
    if (!entry || !root.document) return Promise.resolve(false);
    let record;
    return start([{ at: 0, run() {
      if (record.reduced) return;
      // 도감에 새로 들어온 칸: 노란 별이 돌며 붙고 칸이 통 튄다(1.8초).
      const star = temporary(record, entry, 'img', 'adventure-motion__new-star', STAR);
      animate(record, star, [{ opacity: 0, transform: 'scale(.35) rotate(-18deg)' }, { offset: .24, opacity: 1, transform: 'scale(1.12) rotate(6deg)' }, { offset: .78, opacity: 1, transform: 'scale(1) rotate(0)' }, { opacity: 0, transform: 'scale(.85) rotate(0)' }], 1800, 'adventure-motion-star');
      animate(record, entry, [{ transform: 'scale(.97)' }, { offset: .3, transform: 'scale(1.025)' }, { transform: 'scale(1)' }], 1000, 'adventure-motion-register');
    } }], { duration: 1800, guard: effectGuard([entry], noopGuard) }, value => { record = value; });
  }

  function stamp(element) {
    if (!connected(element)) return Promise.resolve(false);
    let record;
    return start([{ at: 0, run: () => animate(record, element, [
      { opacity: 0, transform: 'scale(1.35) rotate(-13deg)' },
      { offset: .55, opacity: 1, transform: 'scale(.92) rotate(-5deg)' },
      { transform: 'scale(1) rotate(0)', opacity: 1 }
    ], 840, 'adventure-motion-stamp') }], { duration: 840, guard: effectGuard([element], noopGuard) }, value => { record = value; });
  }

  // x/y는 container 안 CSS 픽셀 좌표다. 위치 자체는 고정하고 transform/opacity만 움직인다.
  function ripple(x, y, container) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !connected(container) || !root.document) return Promise.resolve(false);
    let record;
    return start([{ at: 0, run() {
      if (record.reduced) return;
      temporaryClass(record, container, 'adventure-motion-ripple-host');
      const ring = temporary(record, container, 'span', 'adventure-motion__ripple');
      ring.style.setProperty('--adventure-ripple-x', `${x}px`);
      ring.style.setProperty('--adventure-ripple-y', `${y}px`);
      const center = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      animate(record, ring, [{ opacity: .75, transform: `${center} scale(.3)` }, { opacity: 0, transform: `${center} scale(1.6)` }], 520, 'adventure-motion-ripple');
    } }], { duration: 520, guard: effectGuard([container], noopGuard) }, value => { record = value; });
  }

  // 포획 박자의 효과(game.js throwBall 이 박자마다 부른다). absorb: 상대가 빨려 들어갈 때 빛과 고리와 반짝임,
  // land: 볼이 땅에 떨어질 때 살짝 쿵, caught: 찰칵 순간 번쩍·금빛 고리·별이 촤라라 쏟아지고 덜컹.
  const BURSTS = { absorb: 900, land: 600, caught: 1400 };
  function burst(kind, guard = noopGuard) {
    const stage = query('.go-battle .gb-stage');
    if (!stage || !root.document || !Object.prototype.hasOwnProperty.call(BURSTS, kind)) return Promise.resolve(false);
    let record;
    return start([{ at: 0, run() {
      if (record.reduced) return;
      if (kind === 'absorb') {
        piece(record, stage, 'adventure-motion__light', 'enemy');
        piece(record, stage, 'adventure-motion__ring adventure-motion__ring--gold', 'enemy');
        // 빨려 들 때는 빛과 고리만(반짝이 조각이 어색해 보인다, 2026-11-13 사용자).
      } else if (kind === 'land') {
        piece(record, stage, 'adventure-motion__ring adventure-motion__ring--light', 'ball');
        quake(record, stage, true);
      } else {
        piece(record, stage, 'adventure-motion__flash');
        piece(record, stage, 'adventure-motion__ring adventure-motion__ring--gold adventure-motion__ring--big', 'ball');
        scatter(record, stage, 'ball', 14, { stars: true, fall: true });
        quake(record, stage, false);
      }
    } }], { duration: BURSTS[kind], guard: effectGuard([stage], guard) }, value => { record = value; });
  }

  root.AdventureMotion = Object.freeze({ sequence, cancel, feedback, reveal, register, stamp, ripple, burst });
})(window);
