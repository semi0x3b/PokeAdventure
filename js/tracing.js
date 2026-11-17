// 글씨 따라 쓰기 연습장과 채점. 배틀의 따라 쓰기 문제와 단어집이 함께 쓴다.
// 점선 글자 안에 쓴 획이 절반 이상이면 맞힌 것으로 본다. 점 하나만 찍고 통과하지 않도록 글자의 일정 부분 이상을 지나가야 한다.
(function (root) {
  'use strict';

  // 쓴 획 가운데 점선 글자 안(조금 넉넉하게 잡은 영역)에 들어온 비율. 사용자가 정한 기준이다.
  const INSIDE_RATIO = 0.5;
  // 점 하나·짧은 선으로 통과하지 않도록, 글자 모양 중 굵게 그린 획이 지나간 비율의 최소값.
  const COVERAGE_RATIO = 0.4;
  // 칸 전체를 마구 그어 통과하지 않도록, 글자 밖 빈 곳을 굵은 획이 덮은 비율의 최대값.
  // 글자가 칸을 크게 차지하면(가로 폰의 한글 낱말 등) 마구 그어도 절반 가까이 글자 안에 들어가기 때문이다.
  // 2026-11-13 실측(칸 4가지 × 글자 5개): 칸 전체 지그재그는 늘 1.0, 글자 영역을 빠짐없이 점으로 찍어도 최대 0.69.
  // ponytail: 휴리스틱 하나. 성기게 긋는 장난까지 막으려면 획 길이(글자 뼈대 대비) 상한을 더한다.
  const OUTSIDE_RATIO = 0.75;

  // 순수 채점: 같은 크기의 알파 배열 두 개(글자 영역, 쓴 획)와 굵게 그린 획으로 비율을 계산한다.
  function grade(guide, ink, wideInk, options = {}) {
    const insideNeed = options.inside ?? INSIDE_RATIO;
    const coverageNeed = options.coverage ?? COVERAGE_RATIO;
    const outsideLimit = options.outside ?? OUTSIDE_RATIO;
    let inkCount = 0, inkInside = 0, guideCount = 0, guideCovered = 0, emptyCount = 0, emptyCovered = 0;
    for (let index = 0; index < guide.length; index++) {
      const inGuide = guide[index] > 40;
      if (ink[index] > 40) {
        inkCount++;
        if (inGuide) inkInside++;
      }
      if (inGuide) {
        guideCount++;
        if (wideInk[index] > 40) guideCovered++;
      } else {
        emptyCount++;
        if (wideInk[index] > 40) emptyCovered++;
      }
    }
    const inside = inkCount ? inkInside / inkCount : 0;
    const coverage = guideCount ? guideCovered / guideCount : 0;
    const outside = emptyCount ? emptyCovered / emptyCount : 0;
    return { inside, coverage, outside, pass: inkCount > 0 && inside >= insideNeed && coverage >= coverageNeed && outside <= outsideLimit };
  }

  function layer(width, height) {
    const canvas = root.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx: canvas.getContext('2d') };
  }

  function alphaOf(ctx, width, height) {
    const data = ctx.getImageData(0, 0, width, height).data;
    const alpha = new Uint8ClampedArray(width * height);
    for (let index = 0; index < alpha.length; index++) alpha[index] = data[index * 4 + 3];
    return alpha;
  }

  // 화면을 돌리면 배틀 팝업이 통째로 다시 그려져 연습장이 새로 만들어진다. 막 닫힌 같은 글자 연습장의 획(상대 좌표)을 이어 받는다.
  // 채점한 뒤에 닫힌 연습장(오답 뒤 다시 쓰기)은 넘기지 않는다.
  const CARRY_MS = 3000;
  let carried = null;

  // 연습장 만들기. canvas 크기는 화면 배치(CSS)가 정하고, 여기서는 그 크기에 맞춰 점선 글자를 그린다.
  function create(canvas, options) {
    const text = String(options?.text || '');
    const style = root.getComputedStyle ? root.getComputedStyle(canvas) : null;
    const guideColor = style?.getPropertyValue('--trace-guide').trim() || '#d6dee6';
    const inkColor = style?.getPropertyValue('--trace-ink').trim() || '#2f5da8';
    const font = style?.fontFamily || 'sans-serif';
    const ratio = Math.min(root.devicePixelRatio || 1, 2);
    let width = 1, height = 1, fontSize = 10, guide = null, ink = null, wide = null;
    // 쓴 획: 연습장 크기를 1로 본 상대 좌표(0~1) 점 목록. 크기가 바뀌면 이걸로 다시 그린다.
    // 지우개로 문지른 길도 { erase: true, points } 로 순서대로 넣어, 다시 그릴 때 그린 것→지운 것 순서로 되살린다.
    let strokeList = [], judged = false, eraser = false;
    if (carried && carried.text === text && Date.now() - carried.at < CARRY_MS) strokeList = carried.strokes;
    carried = null;
    let glyphs = [], baseline = 0;
    // 안내 글자를 놓는 칸: 연습장 전체에서 구석 그림·스티커 자리(CSS --trace-inset-*)를 뺀 곳. 쓰기·채점은 연습장 전체 그대로다.
    let area = { left: 0, top: 0, width: 1, height: 1 };
    let drawing = false, last = null;

    function letterFont() { return `800 ${fontSize}px ${font}`; }
    // 글자마다 따로 놓아 사이를 넓게 벌리고, 글자 묶음 전체를 칸 한가운데에 둔다.
    function placeGlyphs(ctx) {
      const characters = [...text];
      const gap = fontSize * (/[가-힣]/.test(text) ? 0.28 : 0.38);
      const widths = characters.map(character => ctx.measureText(character).width);
      const total = widths.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, characters.length - 1);
      let x = area.left + (area.width - total) / 2;
      glyphs = characters.map((character, index) => { const placed = { character, x }; x += widths[index] + gap; return placed; });
      const box = ctx.measureText(text);
      const ascent = box.actualBoundingBoxAscent || fontSize * 0.72;
      const descent = box.actualBoundingBoxDescent || 0;
      baseline = area.top + area.height / 2 + (ascent - descent) / 2;
      return total;
    }
    function drawGlyphs(ctx, method) {
      ctx.font = letterFont();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      for (const glyph of glyphs) ctx[method](glyph.character, glyph.x, baseline);
    }
    function layout() {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      // 글자 쓰기 상자는 왼쪽 위에 낱말 그림, 오른쪽 위에 스티커가 얹힌다(wordbook.css 가 그 자리를 --trace-inset-* 로 알려 준다, 2026-11-13 사용자).
      // 안내 글자만 그 자리를 비켜 남은 곳 가운데에 선다. 배틀 연습장은 변수가 없어 칸 전체를 쓴다. 남는 칸이 너무 작아지면 무시한다.
      // 변수 값은 calc() 그대로 읽히므로, 안 보이는 작은 요소의 안쪽 여백에 넣어 px 로 바꿔 읽는다.
      let top = 0, right = 0, bottom = 0, left = 0;
      if (canvas.parentNode && root.getComputedStyle) {
        const probe = root.document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding:var(--trace-inset-top,0px) var(--trace-inset-right,0px) var(--trace-inset-bottom,0px) var(--trace-inset-left,0px)';
        canvas.parentNode.append(probe);
        const resolved = root.getComputedStyle(probe);
        [top, right, bottom, left] = ['Top', 'Right', 'Bottom', 'Left'].map(side => Math.max(0, parseFloat(resolved['padding' + side]) || 0));
        probe.remove();
      }
      area = width - left - right >= width * .4 && height - top - bottom >= height * .4
        ? { left, top, width: width - left - right, height: height - top - bottom }
        : { left: 0, top: 0, width, height };
      // 글자 수와 칸 크기에 맞춰 가장 크게: 높이는 (구석 자리를 뺀) 칸의 70%, 너비(간격 포함)는 86% 안.
      const measure = layer(1, 1).ctx;
      fontSize = 100;
      measure.font = letterFont();
      const box = measure.measureText(text);
      const glyphHeight = (box.actualBoundingBoxAscent || 72) + (box.actualBoundingBoxDescent || 0);
      const totalAt100 = placeGlyphs(measure);
      fontSize = Math.max(24, Math.min(area.height * 0.7 * 100 / glyphHeight, area.width * 0.86 * 100 / totalAt100));
      guide = layer(width, height);
      guide.ctx.font = letterFont();
      placeGlyphs(guide.ctx);
      // 아이 손가락이 조금 벗어나도 글자 안으로 치도록 글자 둘레를 넉넉하게 잡는다.
      guide.ctx.lineJoin = 'round';
      guide.ctx.lineWidth = Math.max(10, fontSize * 0.16);
      guide.ctx.strokeStyle = '#000';
      guide.ctx.fillStyle = '#000';
      drawGlyphs(guide.ctx, 'fillText');
      drawGlyphs(guide.ctx, 'strokeText');
      ink = layer(width, height);
      wide = layer(width, height);
      for (const target of [ink.ctx, wide.ctx]) { target.lineCap = 'round'; target.lineJoin = 'round'; }
      // 쓰는 펜은 가늘게, 채점용 넓은 획은 따로 굵게.
      ink.ctx.lineWidth = Math.max(4, fontSize * 0.045);
      ink.ctx.strokeStyle = inkColor;
      wide.ctx.lineWidth = Math.max(18, fontSize * 0.2);
      wide.ctx.strokeStyle = '#000';
      for (const stroke of strokeList) {
        const points = stroke.points.map(p => ({ x: p.x * width, y: p.y * height }));
        for (let i = 0; i < points.length; i++) drawSegment(points[Math.max(0, i - 1)], points[i], stroke.erase);
      }
      paint();
    }
    // 안내 글자는 테두리·점선 없이 옅은 색으로 채운 글자 위에 따라 쓴다.
    function paint() {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = guideColor;
      drawGlyphs(ctx, 'fillText');
      ctx.drawImage(ink.canvas, 0, 0, width, height);
    }
    function point(event) {
      const bounds = canvas.getBoundingClientRect();
      return { x: (event.clientX - bounds.left) * width / bounds.width, y: (event.clientY - bounds.top) * height / bounds.height };
    }
    function drawSegment(from, to, erase = false) {
      for (const target of [ink.ctx, wide.ctx]) {
        const penWidth = target.lineWidth;
        if (erase) { target.globalCompositeOperation = 'destination-out'; target.lineWidth = Math.max(28, fontSize * 0.28); }
        target.beginPath();
        target.moveTo(from.x, from.y);
        target.lineTo(to.x + .01, to.y + .01);
        target.stroke();
        target.globalCompositeOperation = 'source-over';
        target.lineWidth = penWidth;
      }
    }
    function line(from, to) {
      drawSegment(from, to, eraser);
      paint();
    }
    function remember(p) { strokeList[strokeList.length - 1].points.push({ x: p.x / width, y: p.y / height }); }
    function down(event) {
      event.preventDefault();
      drawing = true;
      last = point(event);
      judged = false;
      strokeList.push({ erase: eraser, points: [] });
      remember(last);
      canvas.setPointerCapture?.(event.pointerId);
      line(last, last);
    }
    function move(event) {
      if (!drawing) return;
      const next = point(event);
      line(last, next);
      remember(next);
      last = next;
    }
    function up() { drawing = false; last = null; }
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.style.touchAction = 'none';
    layout();

    return {
      // 남은 잉크가 있는 획 수(지우개로 다 지우면 0). 쓴 것이 남아 있는지 보는 용도다.
      get strokes() {
        const left = strokeList.filter(stroke => !stroke.erase).length;
        return left && alphaOf(ink.ctx, width, height).some(value => value > 40) ? left : 0;
      },
      get eraser() { return eraser; },
      setEraser(on) { eraser = Boolean(on); },
      clear() { strokeList = []; layout(); },
      // 칸 크기가 바뀐 뒤: 안내 글자를 새 크기로 다시 그리고 쓴 획은 그대로 옮긴다.
      resize() { layout(); },
      score(gradeOptions) {
        judged = true;
        return grade(alphaOf(guide.ctx, width, height), alphaOf(ink.ctx, width, height), alphaOf(wide.ctx, width, height), gradeOptions);
      },
      // 시험에서만 쓴다: 글자 영역 안의 점들을 화면 좌표로 돌려준다.
      guidePoints(step = 8) {
        const alpha = alphaOf(guide.ctx, width, height);
        const bounds = canvas.getBoundingClientRect();
        const points = [];
        for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
          if (alpha[y * width + x] > 200) points.push({ x: bounds.left + x * bounds.width / width, y: bounds.top + y * bounds.height / height });
        }
        return points;
      },
      destroy() {
        carried = strokeList.length && !judged ? { text, strokes: strokeList, at: Date.now() } : null;
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
      }
    };
  }

  root.TracingPad = Object.freeze({ create, grade, INSIDE_RATIO, COVERAGE_RATIO, OUTSIDE_RATIO });
})(typeof window === 'undefined' ? globalThis : window);
