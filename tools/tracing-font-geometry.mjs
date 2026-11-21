// 이미 저장된 NanumGothic 윤곽을 분석한다. 새 글꼴·글자 도형을 만들지 않는다.
const RES = 240;
const DOT = 100 / RES;

export function fontGeometry(outline) {
  const tokens = outline.match(/[MLQZ]|-?\d+(?:\.\d+)?/g);
  const contours = [];
  let polygon = [], current;
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++];
    if (command === 'Z') { contours.push(polygon); polygon = []; continue; }
    const x = Number(tokens[i++]), y = Number(tokens[i++]);
    if (command === 'M' || command === 'L') { current = [x, y]; polygon.push(current); }
    else {
      const end = [Number(tokens[i++]), Number(tokens[i++])], start = current;
      for (let n = 1; n <= 16; n++) {
        const t = n / 16, u = 1 - t;
        polygon.push([u * u * start[0] + 2 * u * t * x + t * t * end[0], u * u * start[1] + 2 * u * t * y + t * t * end[1]]);
      }
      current = end;
    }
  }
  const mask = new Uint8Array(RES * RES);
  for (let row = 0; row < RES; row++) {
    const y = row * DOT, crossings = [];
    for (const path of contours) for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const a = path[j], b = path[i];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        crossings.push({ x: a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]), sign: b[1] > a[1] ? 1 : -1 });
      }
    }
    crossings.sort((a, b) => a.x - b.x);
    let winding = 0;
    for (let i = 0; i < crossings.length - 1; i++) {
      winding += crossings[i].sign;
      if (!winding) continue;
      for (let x = Math.max(0, Math.ceil(crossings[i].x / DOT)); x < Math.min(RES, Math.ceil(crossings[i + 1].x / DOT)); x++) mask[row * RES + x] = 1;
    }
  }
  // 기존 생성 도구와 같은 한 픽셀 안쪽 윤곽에서 Zhang–Suen 골격을 추출한다.
  const core = mask.slice();
  for (let y = 1; y < RES - 1; y++) for (let x = 1; x < RES - 1; x++) {
    const i = y * RES + x;
    core[i] &= mask[i - RES] & mask[i + RES] & mask[i - 1] & mask[i + 1];
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const phase of [0, 1]) {
      const erased = [];
      for (let y = 1; y < RES - 1; y++) for (let x = 1; x < RES - 1; x++) {
        const i = y * RES + x;
        if (!core[i]) continue;
        const n = [core[i - RES], core[i - RES + 1], core[i + 1], core[i + RES + 1], core[i + RES], core[i + RES - 1], core[i - 1], core[i - RES - 1]];
        const count = n.reduce((a, b) => a + b, 0);
        const turns = n.reduce((sum, p, k) => sum + (!p && n[(k + 1) % 8] ? 1 : 0), 0);
        const first = phase ? n[0] * n[2] * n[6] : n[0] * n[2] * n[4];
        const second = phase ? n[0] * n[4] * n[6] : n[2] * n[4] * n[6];
        if (count >= 2 && count <= 6 && turns === 1 && !first && !second) erased.push(i);
      }
      for (const i of erased) core[i] = 0;
      if (erased.length) changed = true;
    }
  }
  const nodes = [], indices = new Map();
  for (let i = 0; i < core.length; i++) if (core[i]) { indices.set(i, nodes.length); nodes.push([i % RES * DOT, Math.floor(i / RES) * DOT]); }
  const graph = nodes.map(([x, y]) => {
    const px = Math.round(x / DOT), py = Math.round(y / DOT), neighbors = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const index = indices.get((py + dy) * RES + px + dx);
      if (index != null) neighbors.push(index);
    }
    return neighbors;
  });
  const closest = point => {
    let best = 0, score = Infinity;
    nodes.forEach((node, i) => { const d = Math.hypot(node[0] - point[0], node[1] - point[1]); if (d < score) { score = d; best = i; } });
    return best;
  };
  function route(targets) {
    const result = [];
    for (let k = 1; k < targets.length; k++) {
      const start = closest(targets[k - 1]), end = closest(targets[k]);
      const previous = new Int32Array(nodes.length).fill(-1), queue = [start];
      previous[start] = start;
      for (let head = 0; head < queue.length && previous[end] < 0; head++) {
        for (const neighbor of graph[queue[head]]) if (previous[neighbor] < 0) { previous[neighbor] = queue[head]; queue.push(neighbor); }
      }
      if (previous[end] < 0) throw Error('서로 떨어진 글꼴 골격을 연결하려 했습니다: ' + JSON.stringify(targets));
      const portion = [end];
      while (portion.at(-1) !== start) portion.push(previous[portion.at(-1)]);
      result.push(...portion.reverse().slice(result.length ? 1 : 0).map(index => nodes[index]));
    }
    return result.map(p => p.map(n => Number(n.toFixed(2))));
  }
  function bands(axis, fixed) {
    const ranges = [];
    let start = -1;
    for (let variable = 0; variable <= RES; variable++) {
      const x = axis === 'x' ? Math.round(fixed / DOT) : variable;
      const y = axis === 'x' ? variable : Math.round(fixed / DOT);
      const filled = variable < RES && mask[y * RES + x];
      if (filled && start < 0) start = variable;
      if (!filled && start >= 0) { ranges.push([start * DOT, (variable - 1) * DOT]); start = -1; }
    }
    return ranges;
  }
  function endpoint(box, bottom = true) {
    const candidates = nodes.filter(([x, y], i) => graph[i].length === 1 && x >= box[0] && y >= box[1] && x <= box[2] && y <= box[3]);
    candidates.sort((a, b) => bottom ? b[1] - a[1] : a[1] - b[1]);
    if (!candidates.length) throw Error('글꼴 골격의 끝점이 없습니다: ' + JSON.stringify(box));
    return candidates[0];
  }
  return { contours, nodes, graph, route, bands, endpoint };
}
