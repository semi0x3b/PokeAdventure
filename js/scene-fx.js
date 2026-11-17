(function (root) {
  'use strict';
  // 아이가 따라올 수 있게 천천히(2026-11-13 사용자: 너무 빨라 긴장감 부족 → 한 번 더 「2배 느리게」). 배틀 진입이 가장 길다.
  // 덮는 단계(midpoint 까지): 볼이 굴러 들어와(배틀은 크게 떨어져) 흔들리고, 그 뒤로 화면이 닫힌다.
  // 여는 단계: 볼이 빛나며 열리고 빛·고리·반짝임이 퍼지면서 새 장면이 드러난다.
  const TIMING = {
    travel: { duration: 2000, midpoint: 880 },
    battle: { duration: 2600, midpoint: 1240 },
    return: { duration: 1600, midpoint: 680 }
  };
  const BALL = 'img/art/balls/ball-red.png';
  // 열린 볼·반짝임은 CSS 배경(scene-fx.css)으로 쓴다. 첫 전환에서도 바로 보이게 미리 받아 둔다.
  const WARM = [BALL, 'img/art/balls/ball-red-open.png', 'img/art/icons/star.png'];
  // 열릴 때 퍼지는 반짝임 방향(가로 dx·세로 dy, 반지름 배수).
  const SPARKS = [[0, -1], [.72, -.72], [1, 0], [.72, .72], [0, 1], [-.72, .72], [-1, 0], [-.72, -.72]];
  let inFlight = null;
  // 새 화면이 드러나는 중이면 남은 연출을 바로 끝내는 함수(덮는 중에는 null — 그때 온 이동은 버린다).
  let finishReveal = null;
  // 첫 전환을 이미지 다운로드 때문에 늦추지 않는다. 그림이 늦어도 아이리스는 독립적으로 완주한다.
  if (typeof root.Image === 'function') {
    for (const source of WARM) {
      try { const warm = new root.Image(); warm.src = source; } catch { /* 그림 없이도 전환은 가능 */ }
    }
  }
  function element(tag, className, text) {
    const node = root.document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function travel(options) {
    // 같은 전환 중 재호출은 새 화면 교체를 예약하지 않는다. 다만 새 화면이 이미 드러나는 중이면
    // 남은 연출을 끝내고 새 이동을 바로 시작한다(아이가 드러나는 화면에서 바로 누른 것).
    if (inFlight && finishReveal) finishReveal();
    if (inFlight) return inFlight;
    const { kind = 'travel', title = '', subtitle = '', direction, onMidpoint } = options || {};
    if (typeof onMidpoint !== 'function') return Promise.reject(new TypeError('onMidpoint 콜백이 필요합니다.'));
    const effect = Object.prototype.hasOwnProperty.call(TIMING, kind) ? kind : 'travel';
    const timing = TIMING[effect];
    const way = direction === 'in' || direction === 'out' ? direction : effect === 'return' ? 'in' : 'out';
    const media = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let resolveTransition, rejectTransition;
    const promise = new Promise((resolve, reject) => { resolveTransition = resolve; rejectTransition = reject; });
    inFlight = promise;
    let overlay = null, midpointTimer = null, finishTimer = null;
    let midpointCalled = false, finished = false, locked = false, mediaListener = '', revealCleanup = null;
    function blockKeyboard(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }
    function blockPointer(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    function lockInput() {
      locked = true;
      root.addEventListener('keydown', blockKeyboard, true);
      root.addEventListener('keyup', blockKeyboard, true);
      for (const type of ['pointerdown', 'pointerup', 'click', 'contextmenu']) root.addEventListener(type, blockPointer, true);
    }
    function complete(error) {
      const failed = arguments.length > 0;
      if (finished) return;
      finished = true;
      clearTimeout(midpointTimer); clearTimeout(finishTimer);
      if (mediaListener === 'event') media.removeEventListener('change', motionChanged);
      else if (mediaListener === 'legacy') media.removeListener(motionChanged);
      if (locked) {
        root.removeEventListener('keydown', blockKeyboard, true);
        root.removeEventListener('keyup', blockKeyboard, true);
        for (const type of ['pointerdown', 'pointerup', 'click', 'contextmenu']) root.removeEventListener(type, blockPointer, true);
      }
      locked = false;
      revealCleanup?.();
      finishReveal = null;
      if (overlay) overlay.remove();
      inFlight = null;
      if (failed) rejectTransition(error); else resolveTransition();
    }
    function midpoint() {
      if (midpointCalled || finished) return;
      midpointCalled = true;
      try {
        // 화면을 완전히 덮은 상태에서 내용만 바꾸고 같은 작업 안에서 새 장면을 연다.
        onMidpoint();
        if (!finished && overlay) overlay.setAttribute('data-stage', 'reveal');
        // 새 화면이 드러나는 동안 누르면 남은 연출을 바로 끝내고 그 누름은 그대로 새 화면에 간다
        // (2026-11-13 Aside QA: 도감을 연 직후 ← 가 한 번 먹지 않았다). 덮는 동안의 중복 입력 막기는 그대로다.
        if (!finished && locked) {
          root.removeEventListener('keydown', blockKeyboard, true);
          root.removeEventListener('keyup', blockKeyboard, true);
          for (const type of ['pointerdown', 'pointerup', 'click', 'contextmenu']) root.removeEventListener(type, blockPointer, true);
          locked = false;
          const finishEarly = () => { root.removeEventListener('pointerdown', finishEarly, true); root.removeEventListener('keydown', finishEarly, true); complete(); };
          root.addEventListener('pointerdown', finishEarly, true);
          root.addEventListener('keydown', finishEarly, true);
          revealCleanup = () => { root.removeEventListener('pointerdown', finishEarly, true); root.removeEventListener('keydown', finishEarly, true); };
          finishReveal = () => complete();
        }
      } catch (error) { complete(error); }
    }
    function motionChanged(event) { if (event.matches) { midpoint(); complete(); } }
    if (media && media.matches) { midpoint(); complete(); return promise; }
    try {
      overlay = element('div', `scene-fx scene-fx--${effect} scene-fx--${way}`);
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.setAttribute('aria-atomic', 'true');
      overlay.setAttribute('data-stage', 'cover');
      overlay.style.setProperty('--scene-duration', `${timing.duration}ms`);
      overlay.style.setProperty('--scene-cover-duration', `${timing.midpoint}ms`);
      overlay.style.setProperty('--scene-reveal-duration', `${timing.duration - timing.midpoint}ms`);
      const cover = element('div', 'scene-fx__cover');
      const reveal = element('div', 'scene-fx__reveal');
      // 배틀만: 닫히기 전 하얗게 두 번 번쩍(CSS 가 다른 전환에서는 숨긴다).
      const flash = element('div', 'scene-fx__flash');
      const glow = element('div', 'scene-fx__glow');
      const burst = element('div', 'scene-fx__burst');
      const ring = element('div', 'scene-fx__ring');
      const ball = element('img', 'scene-fx__ball');
      ball.setAttribute('src', BALL);
      ball.setAttribute('alt', '');
      ball.setAttribute('draggable', 'false');
      const opened = element('div', 'scene-fx__ball-open');
      const sparks = SPARKS.map(([dx, dy]) => {
        const spark = element('span', 'scene-fx__spark');
        spark.style.setProperty('--dx', String(dx));
        spark.style.setProperty('--dy', String(dy));
        return spark;
      });
      const decorations = [cover, reveal, flash, glow, burst, ring, ball, opened, ...sparks];
      for (const decoration of decorations) decoration.setAttribute('aria-hidden', 'true');
      const description = element('span', 'scene-fx__sr-only', [title, subtitle].filter(Boolean).map(String).join('. '));
      overlay.append(...decorations, description);
      lockInput();
      (root.document.body || root.document.documentElement).appendChild(overlay);
      if (media && typeof media.addEventListener === 'function') { media.addEventListener('change', motionChanged); mediaListener = 'event'; }
      else if (media && typeof media.addListener === 'function') { media.addListener(motionChanged); mediaListener = 'legacy'; }
      midpointTimer = setTimeout(midpoint, timing.midpoint);
      finishTimer = setTimeout(() => { midpoint(); complete(); }, timing.duration);
    } catch (error) { complete(error); }
    return promise;
  }
  root.SceneFX = Object.freeze({ travel, get active() { return inFlight !== null; } });
})(window);
