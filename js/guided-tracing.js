// 안내와 채점이 같은 획 경로를 쓰는 글씨 연습장.
(function (root) {
  'use strict';

  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function pathOf(path) {
    const points = (Array.isArray(path) ? path : path.points).filter((point, index, all) => !index || distance(all[index - 1], point) > .0001);
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
    return { points, lengths, length: lengths.at(-1) || 0, glyphIndex: path.glyphIndex || 0 };
  }

  function at(path, amount) {
    const points = path.points;
    if (points.length < 2) return { ...points[0], angle: 0 };
    const length = clamp(amount, 0, path.length);
    let i = 1;
    while (i < points.length - 1 && path.lengths[i] <= length) i++;
    const a = points[i - 1], b = points[i];
    const t = (length - path.lengths[i - 1]) / (path.lengths[i] - path.lengths[i - 1]);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  // 순수 진행기. paths는 point[][] 또는 {points, glyphIndex}[]이며 좌표 단위는 tolerance와 같다.
  // begin/move/end는 한 번의 손짓, restore는 지우개·크기 변경 뒤의 진행 복원에 쓴다.
  function createTracker(paths, options = {}) {
    const strokes = paths.map(pathOf).filter(path => path.points.length);
    const tolerance = Math.max(.5, options.tolerance || 10);
    const maxStep = options.maxStep || tolerance * 3;
    let strokeIndex = 0, walked = 0, attached = false, previous = null;

    function state() {
      const complete = strokeIndex >= strokes.length;
      const path = strokes[Math.min(strokeIndex, strokes.length - 1)];
      return {
        strokeIndex, strokeCount: strokes.length, progress: complete ? 1 : path.length ? walked / path.length : 0,
        complete, marker: path ? at(path, complete ? path.length : walked) : { x: 0, y: 0, angle: 0 },
        glyphIndex: path?.glyphIndex || 0
      };
    }
    function begin(point) {
      previous = point;
      attached = strokeIndex < strokes.length && distance(point, state().marker) <= tolerance;
      return state();
    }
    function move(point) {
      if (strokeIndex >= strokes.length || !previous) return state();
      const from = previous;
      previous = point;
      if (!attached) {
        attached = distance(point, state().marker) <= tolerance;
        return state();
      }
      const step = distance(from, point);
      if (step > maxStep) { attached = false; return state(); }
      const path = strokes[strokeIndex];
      // 가까운 교차점이나 닫힌 획의 끝으로 뛰지 않도록 현재 위치 바로 다음만 찾는다.
      // 모서리에서 손이 안쪽으로 흔들려도 지나온 획에 다시 붙잡히지 않는다.
      const low = walked;
      const high = Math.min(path.length, walked + Math.min(maxStep, step * 1.5 + .01));
      let candidate = null;
      for (let i = 1; i < path.points.length; i++) {
        if (path.lengths[i] < low || path.lengths[i - 1] > high) continue;
        const a = path.points[i - 1], b = path.points[i];
        const segment = path.lengths[i] - path.lengths[i - 1];
        const t = clamp(((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (segment * segment), Math.max(0, (low - path.lengths[i - 1]) / segment), Math.min(1, (high - path.lengths[i - 1]) / segment));
        const projection = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const offset = distance(point, projection);
        const amount = path.lengths[i - 1] + segment * t;
        if (!candidate || offset < candidate.offset - .001 || (Math.abs(offset - candidate.offset) <= .001 && amount < candidate.amount)) candidate = { amount, offset };
      }
      if (!candidate || candidate.offset > tolerance) { attached = false; return state(); }
      if (candidate.amount <= walked + .001) return state();
      const marker = at(path, walked);
      const next = at(path, candidate.amount);
      // 역방향 또는 획과 직각으로 지나가는 교차 입력은 전진으로 세지 않는다.
      if ((point.x - from.x) * (next.x - marker.x) + (point.y - from.y) * (next.y - marker.y) <= 0) return state();
      // 모서리를 가로질러 쓰지 않도록 입력 선분의 중간도 경로에 붙어 있어야 한다.
      const middle = { x: (from.x + point.x) / 2, y: (from.y + point.y) / 2 };
      if (distance(middle, at(path, (walked + candidate.amount) / 2)) > tolerance * 1.4) { attached = false; return state(); }
      walked = candidate.amount;
      // 끝점을 정확히 찍기 어려운 다섯 살도 끝 부근까지 따라오면 다음 획으로 간다.
      // 짧은 점획과 폐곡선은 적게만 양보해, 점 하나나 원의 앞부분만으로 끝나지 않게 한다.
      const closed = distance(path.points[0], path.points.at(-1)) < Math.max(1, path.length * .01);
      const finishSlack = path.length < 20 ? path.length * .06 : Math.min(closed ? 8 : 16, path.length * (closed ? .08 : .12));
      if (path.length - walked <= Math.max(.01, finishSlack)) {
        strokeIndex++;
        walked = 0;
        attached = false;
      }
      return state();
    }
    return {
      get progress() { return state(); }, begin, move,
      end() { previous = null; attached = false; },
      reset() { strokeIndex = 0; walked = 0; previous = null; attached = false; },
      restore(saved) {
        strokeIndex = clamp(Math.floor(saved.strokeIndex || 0), 0, strokes.length);
        walked = strokeIndex < strokes.length ? strokes[strokeIndex].length * clamp(saved.progress || 0, 0, 1) : 0;
        previous = null;
        attached = false;
      }
    };
  }

  function layer(width, height) {
    const canvas = root.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx: canvas.getContext('2d') };
  }

  function alphaOf(ctx, width, height) {
    const pixels = ctx.getImageData(0, 0, width, height).data;
    return Uint8ClampedArray.from({ length: width * height }, (_, index) => pixels[index * 4 + 3]);
  }

  function polyline(ctx, path, amount = path.length) {
    if (!path.points.length || amount < 0) return;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      if (path.lengths[i] > amount) break;
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    const end = at(path, amount);
    ctx.lineTo(end.x + .001, end.y + .001);
    ctx.stroke();
  }

  let carried = null;
  function create(canvas, options = {}) {
    const text = String(options.text || '');
    const owner = options.owner || null;
    const glyphs = [...text].map(character => root.StrokeLetters.glyph(character));
    const style = root.getComputedStyle?.(canvas);
    const color = (name, fallback) => style?.getPropertyValue(name).trim() || fallback;
    const colors = {
      guide: color('--trace-guide', '#d6dee6'), ink: color('--trace-ink', '#2f5da8'),
      blue: color('--c-blue', '#3d87db'), pink: color('--c-primary', '#ef7392'),
      gold: color('--c-gold', '#e9b73e'), line: color('--c-ink-soft', '#8e99aa')
    };
    const ratio = Math.min(root.devicePixelRatio || 1, 2);
    const originalTouchAction = canvas.style.touchAction;
    let width = 1, height = 1, scale = 1, origin = { x: 0, y: 0 }, guideWidth = 12, area, paths = [], tracker;
    let ink, wide, guide, fontOutline, strokeList = [], checkpoints = [], judged = false, eraser = false;
    let drawing = false, pointerId = null, last = null, destroyed = false;
    let frame = null, replayStarted = null, replayState = null;
    let initialProgress = null;
    if (carried && carried.text === text && carried.owner === owner && Date.now() - carried.at < 3000) {
      ({ strokeList, checkpoints } = carried);
      initialProgress = carried.progress;
    }
    carried = null;

    function notify() { options.onProgress?.(tracker.progress); }
    function resolveArea() {
      let top = 0, right = 0, bottom = 0, left = 0;
      if (canvas.parentNode && root.getComputedStyle) {
        const probe = root.document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding:var(--trace-inset-top,0px) var(--trace-inset-right,0px) var(--trace-inset-bottom,0px) var(--trace-inset-left,0px)';
        canvas.parentNode.append(probe);
        const resolved = root.getComputedStyle(probe);
        [top, right, bottom, left] = ['Top', 'Right', 'Bottom', 'Left'].map(side => Math.max(0, parseFloat(resolved['padding' + side]) || 0));
        probe.remove();
      }
      return width - left - right >= width * .4 && height - top - bottom >= height * .4
        ? { left, top, width: width - left - right, height: height - top - bottom }
        : { left: 0, top: 0, width, height };
    }

    function layout() {
      if (destroyed) return;
      const saved = tracker?.progress || initialProgress;
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      area = resolveArea();
      const gap = 18;
      const total = Math.max(1, glyphs.reduce((sum, glyph) => sum + (glyph?.advance || 100), 0) + Math.max(0, glyphs.length - 1) * gap);
      scale = Math.min(area.height * .68 / 100, area.width * .86 / total);
      // 받침의 짧은 가로획과 원 사이가 붙지 않도록 한글은 가는 획을 쓴다.
      const latin = glyphs.every(glyph => glyph?.kind === 'latin');
      guideWidth = Math.max(latin ? 8 : 5, scale * (latin ? 8.5 : 5.2));
      let x = area.left + (area.width - total * scale) / 2;
      const y = area.top + (area.height - 100 * scale) / 2;
      origin = { x, y };
      paths = [];
      // 실제 글꼴의 윤곽을 그대로 그리고, 그 윤곽에서 추출한 중심선을 입력·화살표에 쓴다.
      // 화면의 회색 글자와 화살표를 서로 다른 글꼴/좌표로 그리지 않는다.
      fontOutline = glyphs.every(glyph => glyph?.outline) && root.Path2D ? new root.Path2D() : null;
      glyphs.forEach((glyph, glyphIndex) => {
        if (fontOutline) fontOutline.addPath(new root.Path2D(glyph.outline), { a: scale, b: 0, c: 0, d: scale, e: x, f: y });
        (glyph?.strokes || []).forEach((points, number) => {
          const path = pathOf({ points: points.map(point => ({ x: x + point.x * scale, y: y + point.y * scale })), glyphIndex });
          path.number = number + 1;
          paths.push(path);
        });
        x += ((glyph?.advance || 100) + gap) * scale;
      });
      // 다섯 살의 손떨림은 보이는 선폭과 별개로 24~36px까지 받는다.
      // 허용 폭을 넓혀도 한 번에 건너뛸 수 있는 거리는 늘리지 않는다.
      tracker = createTracker(paths, {
        tolerance: clamp(guideWidth * 1.15, 24, 36),
        maxStep: Math.max(12, scale * (latin ? 13 : 6)) * 3
      });
      if (saved) tracker.restore(saved);
      guide = layer(width, height);
      ink = layer(width, height);
      wide = layer(width, height);
      guide.ctx.lineWidth = guideWidth + Math.max(10, scale * 12);
      guide.ctx.lineCap = guide.ctx.lineJoin = 'round';
      guide.ctx.strokeStyle = '#000';
      for (const path of paths) polyline(guide.ctx, path);
      for (const target of [ink.ctx, wide.ctx]) target.lineCap = target.lineJoin = 'round';
      ink.ctx.lineWidth = Math.max(4, scale * 4.5);
      ink.ctx.strokeStyle = colors.ink;
      wide.ctx.lineWidth = Math.max(18, guideWidth * 1.5);
      wide.ctx.strokeStyle = '#000';
      for (const stroke of strokeList) {
        const points = stroke.points.map(fromGlyph);
        points.forEach((point, index) => drawSegment(points[Math.max(0, index - 1)], point, stroke.erase));
      }
      paint();
    }

    function drawSegment(from, to, erase) {
      for (const target of [ink.ctx, wide.ctx]) {
        const penWidth = target.lineWidth;
        if (erase) { target.globalCompositeOperation = 'destination-out'; target.lineWidth = Math.max(28, guideWidth * 2); }
        target.beginPath();
        target.moveTo(from.x, from.y);
        target.lineTo(to.x + .01, to.y + .01);
        target.stroke();
        target.globalCompositeOperation = 'source-over';
        target.lineWidth = penWidth;
      }
    }

    function arrow(ctx, marker) {
      ctx.save();
      ctx.translate(marker.x, marker.y);
      ctx.rotate(marker.angle);
      // 꺾쇠 대신 몸통이 있는 통화살표. 회전해도 체크 표시처럼 보이지 않는다.
      const size = 9;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-size, -3);
      ctx.lineTo(0, -3);
      ctx.lineTo(0, -size * .8);
      ctx.lineTo(size, 0);
      ctx.lineTo(0, size * .8);
      ctx.lineTo(0, 3);
      ctx.lineTo(-size, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function paint() {
      if (destroyed) return;
      const ctx = canvas.getContext('2d');
      const progress = replayState || tracker.progress;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = ctx.lineJoin = 'round';
      if (glyphs.some(glyph => glyph?.kind === 'latin')) {
        const top = area.top + (area.height - 100 * scale) / 2;
        ctx.strokeStyle = colors.line;
        ctx.globalAlpha = .35;
        ctx.lineWidth = 1;
        for (const offset of [0, 38, 80]) {
          ctx.setLineDash(offset === 38 ? [5, 5] : []);
          ctx.beginPath();
          ctx.moveTo(area.left + area.width * .04, top + offset * scale);
          ctx.lineTo(area.left + area.width * .96, top + offset * scale);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
      ctx.lineWidth = guideWidth;
      ctx.strokeStyle = colors.guide;
      if (fontOutline) { ctx.fillStyle = colors.guide; ctx.fill(fontOutline); }
      else for (const path of paths) polyline(ctx, path);
      // 채워진 부분은 실제 획 진행만 반영한다. 낙서·채점 통과와 독립적이다.
      ctx.save();
      if (fontOutline) ctx.clip(fontOutline);
      ctx.lineWidth = guideWidth * .8;
      ctx.strokeStyle = colors.blue;
      paths.forEach((path, index) => {
        if (index < progress.strokeIndex) polyline(ctx, path);
        else if (index === progress.strokeIndex && progress.progress > 0) polyline(ctx, path, path.length * progress.progress);
      });
      ctx.restore();
      ctx.strokeStyle = colors.line;
      ctx.globalAlpha = .48;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      for (const path of paths) polyline(ctx, path);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // 손가락 원본은 채점·지우개에만 쓴다. 화면에는 경로를 채운 획과 화살표만 보인다.
      // 현재 화살표 하나만 손가락을 따라 움직인다. 다음 획 번호는 현재 글자 안에서만 옅게 보인다.
      const radius = 18;
      const currentGlyph = paths[Math.min(progress.strokeIndex, paths.length - 1)]?.glyphIndex;
      const usedBadges = [];
      paths.forEach((path, index) => {
        if (index <= progress.strokeIndex || path.glyphIndex !== currentGlyph) return;
        const marker = at(path, 0);
        const badge = { x: marker.x, y: marker.y };
        const small = Math.max(7, radius * .62);
        while (usedBadges.some(other => distance(other, badge) < small * 2.1)) badge.x += small * 2.15;
        usedBadges.push(badge);
        ctx.globalAlpha = .55;
        ctx.fillStyle = colors.line;
        ctx.beginPath();
        ctx.arc(badge.x, badge.y, small, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${Math.round(small * 1.25)}px ${style?.fontFamily || 'sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(path.number), badge.x, badge.y + .5);
      });
      if (!progress.complete && paths.length) {
        const marker = progress.marker;
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = colors.pink;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        arrow(ctx, marker);
      }
    }

    function cancelReplay() {
      if (frame !== null) root.cancelAnimationFrame?.(frame);
      frame = null;
      replayStarted = null;
      replayState = null;
    }

    function replay() {
      if (destroyed || !paths.length) return;
      cancelReplay();
      const durations = paths.map(path => Math.max(450, path.length / Math.max(.07, scale * .075)));
      const total = durations.reduce((sum, value) => sum + value + 180, 0);
      const tick = time => {
        if (destroyed) return;
        if (replayStarted === null) replayStarted = time;
        let elapsed = time - replayStarted;
        if (elapsed >= total) { cancelReplay(); paint(); return; }
        let index = 0;
        while (index < paths.length - 1 && elapsed >= durations[index] + 180) elapsed -= durations[index++] + 180;
        const progress = Math.min(1, elapsed / durations[index]);
        replayState = { strokeIndex: index, progress, complete: false, marker: at(paths[index], paths[index].length * progress) };
        paint();
        frame = root.requestAnimationFrame(tick);
      };
      frame = root.requestAnimationFrame(tick);
    }

    function point(event) {
      const bounds = canvas.getBoundingClientRect();
      return { x: (event.clientX - bounds.left) * width / bounds.width, y: (event.clientY - bounds.top) * height / bounds.height };
    }
    // 안내와 같은 원점·배율로 저장해 화면을 돌려도 잉크가 획에 붙어 있게 한다.
    function toGlyph(position) { return { x: (position.x - origin.x) / scale, y: (position.y - origin.y) / scale }; }
    function fromGlyph(position) { return { x: origin.x + position.x * scale, y: origin.y + position.y * scale }; }
    function remember(position) { strokeList.at(-1).points.push(toGlyph(position)); }
    function down(event) {
      if (destroyed || drawing || (event.button !== undefined && event.button !== 0)) return;
      event.preventDefault();
      cancelReplay();
      drawing = true;
      pointerId = event.pointerId;
      judged = false;
      last = point(event);
      strokeList.push({ erase: eraser, points: [] });
      remember(last);
      if (!eraser) tracker.begin(last);
      canvas.setPointerCapture?.(pointerId);
      drawSegment(last, last, eraser);
      paint();
    }
    function move(event) {
      if (!drawing || event.pointerId !== pointerId) return;
      const next = point(event);
      drawSegment(last, next, eraser);
      remember(next);
      if (!eraser) {
        const before = tracker.progress;
        const after = tracker.move(next);
        if (after.strokeIndex !== before.strokeIndex || after.progress !== before.progress) {
          // 입력점 사이를 지워도 찾을 수 있도록 실제 잉크 선분을 촘촘히 기억한다.
          const count = Math.max(1, Math.ceil(distance(last, next) / 2));
          const endProgress = after.strokeIndex === before.strokeIndex ? after.progress : 1;
          for (let i = 1; i <= count; i++) {
            checkpoints.push({
              before: { strokeIndex: before.strokeIndex, progress: before.progress + (endProgress - before.progress) * (i - 1) / count },
              point: toGlyph({ x: last.x + (next.x - last.x) * i / count, y: last.y + (next.y - last.y) * i / count })
            });
          }
          notify();
        }
      }
      last = next;
      paint();
    }
    function rewindErased() {
      const alpha = alphaOf(ink.ctx, width, height);
      const missing = checkpoints.findIndex(checkpoint => {
        const position = fromGlyph(checkpoint.point);
        const x = clamp(Math.round(position.x), 0, width - 1);
        const y = clamp(Math.round(position.y), 0, height - 1);
        return alpha[y * width + x] <= 40;
      });
      if (missing < 0) return;
      tracker.restore(checkpoints[missing].before);
      checkpoints.length = missing;
      notify();
    }
    function up(event) {
      if (!drawing || (event && event.pointerId !== pointerId)) return;
      if (eraser) rewindErased();
      tracker.end();
      drawing = false;
      try { canvas.releasePointerCapture?.(pointerId); } catch (_) { /* 브라우저가 먼저 캡처를 해제한 경우 */ }
      pointerId = null;
      last = null;
      paint();
    }
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    canvas.style.touchAction = 'none';
    layout();

    return {
      get progress() { return tracker.progress; },
      get strokes() { return strokeList.filter(stroke => !stroke.erase).length && alphaOf(ink.ctx, width, height).some(value => value > 40) ? strokeList.filter(stroke => !stroke.erase).length : 0; },
      get eraser() { return eraser; },
      setEraser(on) { up(); eraser = Boolean(on); },
      clear() { up(); cancelReplay(); strokeList = []; checkpoints = []; judged = false; tracker.reset(); layout(); notify(); },
      resize() { up(); cancelReplay(); layout(); },
      score(gradeOptions) {
        judged = true;
        const result = root.TracingPad.grade(alphaOf(guide.ctx, width, height), alphaOf(ink.ctx, width, height), alphaOf(wide.ctx, width, height), gradeOptions);
        // 실제 입력으로 모든 획을 순서대로 마쳤다면, 허용한 손떨림 때문에 다시 오답으로 만들지 않는다.
        return { ...result, pass: result.pass || paths.length > 0 && tracker.progress.complete && strokeList.some(stroke => !stroke.erase) };
      },
      guidePoints(step = 8) {
        const alpha = alphaOf(guide.ctx, width, height);
        const bounds = canvas.getBoundingClientRect();
        const points = [];
        for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
          if (alpha[y * width + x] > 200) points.push({ x: bounds.left + x * bounds.width / width, y: bounds.top + y * bounds.height / height });
        }
        return points;
      },
      replay,
      destroy() {
        if (destroyed) return;
        up();
        cancelReplay();
        carried = strokeList.length && !judged ? { text, owner, strokeList, checkpoints, progress: tracker.progress, at: Date.now() } : null;
        destroyed = true;
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
        canvas.removeEventListener('lostpointercapture', up);
        canvas.style.touchAction = originalTouchAction;
      }
    };
  }

  root.GuidedTracingPad = Object.freeze({ create, createTracker });
})(typeof window === 'undefined' ? globalThis : window);
