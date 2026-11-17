// 필드 타일 지도: 지역 4곳을 16px 도트 타일(Ninja Adventure Asset Pack, CC0 — img/field-tiles/LICENSE.txt)로 짠 데이터와
// 걸을 수 있는 곳 계산(FieldWorld). 화면(DOM·캔버스)에 손대지 않는 순수 계산이라 node 시험에서 그대로 읽는다.
// 좌표는 두 가지다: 타일(0~SIZE 칸)과 지도 기준 0~1(게임 화면이 쓰는 단위, 타일 ÷ SIZE).
(function (root) {
  'use strict';
  const TILE = 16;
  const SIZE = 40; // 지도 한 변의 타일 수(정사각)
  // 지도 밖 채움 너비(칸, 짝수). 카메라가 늘 트레이너를 가운데에 두어 지도 끝에 서면 화면 절반이 지도 밖이 된다.
  // 가장 작게 본 큰 화면(2560px·3배 타일 → 반 화면 27칸)까지 덮는다. 그보다 넓으면 바탕색.
  const PAD = 32;
  const SHEETS = {
    floor: 'img/field-tiles/tileset-floor.png',
    water: 'img/field-tiles/tileset-water.png',
    nature: 'img/field-tiles/tileset-nature.png',
    house: 'img/field-tiles/tileset-house.png',
    desert: 'img/field-tiles/tileset-desert.png',
    detail: 'img/field-tiles/tileset-floor-detail.png',
    element: 'img/field-tiles/tileset-element.png',
    interior: 'img/field-tiles/tileset-interior-floor.png',
  };
  // 자동으로 가장자리를 잇는 지형 묶음. 묶음마다 같은 배치다(값은 묶음 왼쪽 위 칸):
  // 3×3 가장자리·모서리, 오른쪽 세로 한 줄(위끝·가운데·아래끝), 아래 가로 한 줄(왼끝·가운데·오른끝)과 외톨이, 안쪽 모서리 4칸.
  const TERRAINS = {
    dirt: { sheet: 'floor', x: 0, y: 7, solid: false, joins: ['pond'] },  // 풀밭 위 흙길(다리 앞에서는 물까지 이어짐)
    sand: { sheet: 'floor', x: 0, y: 0, solid: false, joins: ['sea'] },  // 진한 모래 위 밝은 모래길(오아시스 물가까지 이어짐)
    pond: { sheet: 'water', x: 0, y: 6, solid: true },   // 풀밭 위 물
    sea: { sheet: 'water', x: 0, y: 0, solid: true },    // 모래 위 물
  };
  // 한 칸짜리 바닥 무늬. 앞쪽이 자주 나오게 같은 칸을 여러 번 적었다.
  const BASES = {
    grass: { sheet: 'floor', tiles: [[0, 12], [0, 12], [0, 12], [0, 12], [1, 12], [2, 12], [3, 12], [4, 12], [2, 11], [3, 11]] },
    darkSand: { sheet: 'floor', tiles: [[0, 5], [0, 5], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5]] },
    lightSand: { sheet: 'floor', tiles: [[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [8, 2], [1, 4]] },
    cobble: { sheet: 'interior', tiles: [[1, 13], [1, 13], [1, 13], [5, 13]] },
  };
  // 장식물: rect 는 타일셋 안의 그림 칸(px). 위쪽 over 줄은 트레이너·동행보다 위에 그려(뒤로 지나가면 가려짐) 걸을 수 있고,
  // 나머지 아래 줄은 못 걷는다. solid:false 는 밟고 지나가는 바닥 장식.
  const PROPS = {
    tree: { sheet: 'nature', rect: [0, 0, 32, 32], over: 1 },
    'tree-pine': { sheet: 'nature', rect: [32, 0, 32, 32], over: 1 },
    'tree-light': { sheet: 'nature', rect: [256, 0, 32, 32], over: 1 },
    'tree-pink': { sheet: 'nature', rect: [224, 0, 32, 32], over: 1 },
    'tree-round': { sheet: 'nature', rect: [96, 128, 32, 32], over: 1 },
    'tree-big': { sheet: 'nature', rect: [0, 32, 64, 48], over: 2 },
    'tree-big-light': { sheet: 'nature', rect: [256, 32, 64, 48], over: 2 },
    stump: { sheet: 'nature', rect: [0, 128, 32, 32], over: 1 },
    bush: { sheet: 'nature', rect: [16, 160, 16, 16], over: 0 },
    'bush-small': { sheet: 'nature', rect: [96, 160, 16, 16], over: 0 },
    rock: { sheet: 'nature', rect: [64, 208, 16, 16], over: 0 },
    boulder: { sheet: 'nature', rect: [80, 208, 16, 16], over: 0 },
    'rock-big': { sheet: 'nature', rect: [208, 128, 32, 32], over: 1 },
    'rock-gray': { sheet: 'nature', rect: [256, 128, 32, 32], over: 1 }, // 2026-11-13: 272 에서 잘라 큰 바위 반쪽+작은 바위가 나왔다
    cactus: { sheet: 'nature', rect: [176, 128, 16, 48], over: 2 },
    'cactus-small': { sheet: 'nature', rect: [192, 144, 16, 32], over: 1 },
    'house-a': { sheet: 'house', rect: [0, 0, 64, 48], over: 1 },
    'house-b': { sheet: 'house', rect: [64, 0, 64, 48], over: 1 },
    'house-c': { sheet: 'house', rect: [128, 0, 64, 48], over: 1 },
    'house-d': { sheet: 'house', rect: [192, 0, 64, 48], over: 1 },
    dome: { sheet: 'desert', rect: [0, 0, 48, 48], over: 1 }, // 2026-11-13: 폭 32 로 오른쪽이 잘렸다(그림은 48칸)
    'desert-house': { sheet: 'desert', rect: [96, 0, 64, 48], over: 1 },
    palms: { sheet: 'desert', rect: [160, 64, 64, 48], over: 2 },
    fountain: { sheet: 'desert', rect: [128, 112, 32, 32], over: 0 },
    boat: { sheet: 'water', rect: [416, 0, 32, 16], over: 0 },
    'water-rock': { sheet: 'water', rect: [192, 0, 16, 16], over: 0 },
    lamp: { sheet: 'element', rect: [96, 48, 16, 32], over: 1 },
    vase: { sheet: 'element', rect: [48, 0, 16, 16], over: 0 },
    // 출구 돌 아치(TilesetHouse 오른쪽 아래, 3×3칸). open 줄(가운데)만 걸을 수 있고 나머지 칸은 위층 줄까지 막는다.
    arch: { sheet: 'house', rect: [464, 320, 48, 48], over: 1, open: 1 },
    sunflower: { sheet: 'nature', rect: [0, 176, 16, 16], over: 0, solid: false },
    'flower-red': { sheet: 'nature', rect: [48, 176, 16, 16], over: 0, solid: false },
    daisy: { sheet: 'nature', rect: [96, 176, 16, 16], over: 0, solid: false },
    skull: { sheet: 'detail', rect: [208, 0, 16, 16], over: 0, solid: false },
    bone: { sheet: 'detail', rect: [224, 0, 16, 16], over: 0, solid: false },
    shell: { sheet: 'detail', rect: [176, 0, 16, 16], over: 0, solid: false },
    pebble: { sheet: 'detail', rect: [240, 0, 16, 16], over: 0, solid: false },
  };
  // 높은 풀(밟으면 발목까지 가림): 바닥에 한 장, 트레이너 위에 아래 절반을 한 번 더 그린다.
  const TALL_GRASS = { grass: { sheet: 'nature', rect: [64, 160, 16, 16] }, dry: { sheet: 'nature', rect: [48, 160, 16, 16] } };
  // 다리·부두 널빤지(물 위에서도 걸을 수 있다)
  const PLANK = { sheet: 'water', rect: [16, 192, 16, 16] };
  const RIPPLE = { src: 'img/field-tiles/water-ripple.png', frames: 4 };

  // ---------- 지역 지도 ----------
  // 모든 값은 타일 좌표. 사각형은 [왼쪽, 위, 오른쪽, 아래](끝 칸 포함), 타원은 { ellipse: [가운데x, 가운데y, 반지름x, 반지름y] }.
  // edge: 지도 가장자리 두 줄을 막는 장식물(번갈아 놓는다). start: 처음 서는 칸(왼쪽 4칸은 걸을 수 있어야 동행이 줄지어 선다).
  // focus: 시작 칸 가까이의 랜드마크(숲 시냇물·다리, 도시 분수·집, 사막 오아시스, 바다 부두). 카메라는 늘 트레이너를 가운데에 두어 화면을 비추는 데는 쓰지 않고,
  // field-world.test 가 시작 칸에서 8칸 안인지만 본다. 처음 화면에 보일지는 start 가 정한다(바다는 390 세로 화면에도 물이 보이게 부두 밑동 모래).
  // exits: 위·아래 출구 아치의 가운데 열(x). 길이 아치를 지나 지도 끝까지 이어지게 terrain 에 한 칸 폭 길을 둔다(바다는 모래밭이라 아치만).
  // fill: 출구 위·아래 가장자리 틈 옆을 메우는 한 칸짜리 장식물.
  // beyond: 지도 밖 채움. 'sea' 면 바다(모래사장이 섬처럼), 없으면 바탕 위에 edge 장식물(2×2칸)을 번갈아 빽빽이.
  // meet: 풀숲 말고 포켓몬을 만나는 칸(지역마다 다르게, 2026-11-13 사용자) — 도시 꽃밭·분수 둘레(garden), 사막 맨 모래(sand),
  // 바다 물가(shore, 바다는 풀숲 없이 물가만). 칸 종류별 확률은 core.js GRASS.chance.
  const REGIONS = {
    forest: {
      base: 'grass', tall: 'grass', edge: ['tree', 'tree-pine'], fill: 'bush', exits: { top: 19, bottom: 13 },
      terrain: [
        ['dirt', [4, 19, 35, 20]], ['dirt', [19, 6, 20, 19]], ['dirt', [19, 0, 19, 5]], ['dirt', [13, 21, 14, 33]], ['dirt', [13, 34, 13, 39]],
        ['pond', [26, 7, 32, 13]], ['pond', [25, 8, 33, 12]], ['pond', [29, 13, 30, 37]],
      ],
      // 시냇물이 길어서 흙길 다리 말고도 중간중간 다리를 놓는다(2026-11-13 사용자).
      bridges: [[29, 19, 30, 20], [29, 26, 30, 27], [29, 35, 30, 36]],
      tallGrass: [[5, 8, 10, 13], [22, 24, 27, 29], [4, 29, 9, 34], [33, 23, 36, 27], [8, 23, 11, 26]],
      props: [
        ['tree-big', 4, 3], ['tree-big-light', 11, 3], ['tree-big', 23, 3], ['tree-big-light', 33, 15], ['tree-big', 4, 14],
        ['tree-big-light', 20, 30], ['tree-big', 31, 31], ['tree', 16, 25], ['tree-light', 9, 36], ['tree', 25, 14], ['tree-light', 15, 8],
        ['stump', 23, 22], ['rock-big', 6, 22], ['rock', 25, 8], ['boulder', 34, 9], ['bush', 22, 13], ['bush-small', 17, 15],
        ['bush', 11, 16], ['bush', 34, 29], ['bush-small', 27, 34], ['rock', 18, 33], ['sunflower', 12, 22], ['daisy', 16, 22],
        ['flower-red', 24, 17], ['daisy', 26, 21], ['sunflower', 8, 18], ['daisy', 22, 9], ['flower-red', 11, 30], ['daisy', 34, 21],
      ],
      start: [26, 20], focus: [29.5, 16],
    },
    city: {
      base: 'grass', tall: 'grass', edge: ['tree-light', 'tree-pink'], fill: 'bush', exits: { top: 19, bottom: 19 }, meet: 'garden',
      terrain: [
        ['cobble', [10, 12, 29, 27]],
        ['dirt', [18, 6, 21, 11]], ['dirt', [19, 0, 19, 5]], ['dirt', [30, 19, 37, 20]], ['dirt', [2, 19, 9, 20]], ['dirt', [18, 28, 21, 33]], ['dirt', [19, 34, 19, 39]],
      ],
      props: [
        ['house-a', 3, 2], ['house-b', 8, 2], ['house-d', 25, 2], ['house-c', 30, 2],
        ['house-c', 4, 8], ['house-b', 32, 8], ['house-d', 4, 29], ['house-a', 32, 29],
        ['house-a', 14, 15], ['house-d', 22, 15], ['fountain', 19, 18], ['lamp', 11, 12], ['lamp', 28, 12], ['lamp', 11, 25], ['lamp', 28, 25],
        ['tree-pink', 6, 22], ['tree-pink', 33, 22], ['tree-light', 14, 31], ['tree-light', 25, 31], ['tree-round', 14, 5], ['tree-round', 24, 6],
        ['vase', 13, 14], ['vase', 26, 14], ['bush', 9, 11], ['bush', 30, 11], ['bush-small', 9, 28], ['bush-small', 30, 28],
        ['flower-red', 13, 19], ['daisy', 26, 19], ['sunflower', 16, 23], ['flower-red', 23, 23], ['daisy', 6, 17], ['sunflower', 35, 17],
      ],
      tallGrass: [[3, 23, 7, 27], [33, 13, 36, 16], [10, 32, 13, 35], [27, 32, 30, 35]],
      start: [19, 22], focus: [19.5, 17],
    },
    desert: {
      base: 'darkSand', tall: 'dry', edge: ['rock-big', 'rock-gray'], fill: 'boulder', exits: { top: 19, bottom: 19 }, meet: 'sand',
      terrain: [
        ['sand', [5, 6, 17, 14]], ['sand', [15, 10, 19, 11]], ['sand', [4, 20, 35, 21]], ['sand', [19, 6, 20, 33]], ['sand', [19, 0, 19, 5]], ['sand', [19, 34, 19, 39]],
        ['sea', [8, 8, 14, 12]], ['sea', [7, 9, 15, 11]],
      ],
      props: [
        ['palms', 3, 3], ['palms', 14, 4], ['palms', 4, 13], ['rock-big', 28, 6], ['rock-gray', 31, 7], ['rock-big', 30, 28], ['rock-big', 8, 30],
        ['rock-gray', 24, 33], ['cactus', 25, 11], ['cactus', 14, 26], ['cactus', 33, 17], ['cactus-small', 11, 23], ['cactus-small', 27, 24],
        ['cactus-small', 6, 34], ['cactus', 34, 33], ['dome', 26, 15], ['desert-house', 5, 24], ['boulder', 23, 9], ['rock', 16, 30],
        ['skull', 29, 21], ['bone', 12, 33], ['bone', 23, 17], ['pebble', 9, 21], ['pebble', 31, 12], ['skull', 17, 13],
      ],
      tallGrass: [[27, 9, 31, 12], [5, 16, 6, 18], [24, 25, 28, 28], [11, 27, 14, 30], [32, 22, 35, 25]],
      start: [17, 13], focus: [11, 10],
    },
    sea: {
      base: 'lightSand', tall: 'grass', edge: ['palms', 'rock-big'], fill: 'boulder', exits: { top: 11, bottom: 11 }, meet: 'shore', beyond: 'sea',
      // 2026-11-13 사용자 「모래가 너무 크다」: 오른쪽 절반이 넓은 바다, 왼쪽은 바닷가 모래 띠(야자수·바위). 모래에서 바다로 긴 나무 부두가
      // 뻗고(숲 다리와 같은 널빤지) 끝에 배가 매여 있다(boat: 배 가운데, 타일 좌표). 배를 타면 물 위를 다닌다(game.js).
      terrain: [
        ['sea', [21, 0, 39, 39]], ['sea', [17, 7, 20, 10]], ['sea', [19, 28, 20, 32]],
      ],
      bridges: [[16, 19, 33, 20]],
      // 큰 배(boat-big, 가운데에서 왼쪽 끝까지 30도트)라 x 35.5: 왼쪽 끝이 부두 끝(x 34)에 6도트 걸친다(옛 작은 배 x 35 와 같은 모습).
      boat: [35.5, 20],
      props: [
        ['water-rock', 26, 6], ['water-rock', 33, 9], ['water-rock', 28, 14], ['water-rock', 36, 27], ['water-rock', 30, 33], ['water-rock', 24, 29],
        ['palms', 3, 7], ['palms', 12, 12], ['palms', 4, 24], ['palms', 13, 29], ['palms', 3, 31], ['tree-round', 5, 13],
        ['rock-big', 8, 15], ['rock-big', 16, 34], ['rock', 6, 19], ['boulder', 15, 23], ['bush', 9, 28], ['bush-small', 16, 5],
        ['shell', 8, 22], ['shell', 12, 26], ['pebble', 14, 17], ['shell', 18, 24], ['pebble', 7, 11], ['shell', 7, 34], ['pebble', 18, 14],
      ],
      start: [18, 21], focus: [18, 20],
    },
  };
  const REGION_NAMES = Object.keys(REGIONS);

  // 칸마다 같은 값이 나오는 작은 해시(바닥 무늬 고르기용).
  function hash(x, y, seed) {
    let value = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    value = (value ^ (value >>> 13)) * 1274126177 | 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }
  function eachCell(shape, visit) {
    if (Array.isArray(shape)) {
      const [left, top, right, bottom] = shape;
      for (let y = Math.max(0, top); y <= Math.min(SIZE - 1, bottom); y++) for (let x = Math.max(0, left); x <= Math.min(SIZE - 1, right); x++) visit(x, y);
      return;
    }
    const [cx, cy, rx, ry] = shape.ellipse;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1 && x >= 0 && y >= 0 && x < SIZE && y < SIZE) visit(x, y);
      }
    }
  }
  // 이웃 네 방향(위·오른쪽·아래·왼쪽)이 같은 지형인지로 묶음 안 칸을 고른다. kindAt(x, y) 는 그 칸 지형(지도 밖 채움 포함),
  // 그림을 그리는 범위 밖이면 undefined 라 같은 지형으로 본다(바다·길이 끝까지 이어짐).
  function autotile(kindAt, x, y) {
    const kind = kindAt(x, y);
    const joins = TERRAINS[kind]?.joins || [];
    const same = (dx, dy) => {
      const other = kindAt(x + dx, y + dy);
      return other === undefined || other === kind || joins.includes(other);
    };
    const north = same(0, -1), east = same(1, 0), south = same(0, 1), west = same(-1, 0);
    if (north && east && south && west) {
      if (!same(1, 1)) return [5, 1];
      if (!same(-1, 1)) return [6, 1];
      if (!same(1, -1)) return [5, 2];
      if (!same(-1, -1)) return [6, 2];
      return [1, 1];
    }
    const key = (north ? 'N' : '') + (east ? 'E' : '') + (south ? 'S' : '') + (west ? 'W' : '');
    const table = {
      ESW: [1, 0], NSW: [2, 1], NEW: [1, 2], NES: [0, 1],
      ES: [0, 0], SW: [2, 0], NE: [0, 2], NW: [2, 2],
      NS: [3, 1], EW: [1, 3], S: [3, 0], N: [3, 2], E: [0, 3], W: [2, 3], '': [3, 3],
    };
    return table[key];
  }

  // ---------- 출구 ----------
  // 2026-11-13 사용자: 한 지도만 돌아다니다 다른 지역을 잊는다 → 지도 끝까지 가면 다음 지역으로.
  // 지역마다 위·아래 가장자리에 돌 아치 하나씩. 아래 출구는 다음 지역, 위 출구는 앞 지역(숲 → 도시 → 사막 → 바다 → 숲).
  // 아래로 나가면 다음 지역의 위 출구 앞에서, 위로 나가면 앞 지역의 아래 출구 앞에서 지도 안쪽을 보고 선다.
  // 아치 맨 윗줄(EXIT_ROW): 위 출구는 버튼 줄 밑에 가리지 않게 가장자리(두 줄)에서 한 줄 더 띄운다.
  // 출구 칸은 아치 다리 사이 두 칸이다. 위 출구 칸(4~5줄)은 버튼 줄·노치 여백(트레이너 발 위쪽 한계 약 4칸)보다 아래라 걸어 닿는다.
  const EXIT_ROW = { top: 3, bottom: SIZE - 5 };
  function exitsOf(name, spec) {
    const index = REGION_NAMES.indexOf(name);
    return Object.entries(spec.exits || {}).map(([side, x]) => {
      const top = EXIT_ROW[side];
      const step = side === 'top' ? REGION_NAMES.length - 1 : 1;
      const front = side === 'top' ? top + 4 : top - 2; // 도착해 서는 줄: 아치에서 안쪽으로 한두 칸
      return {
        side, x, top, to: REGION_NAMES[(index + step) % REGION_NAMES.length],
        cells: [[x, top + 1], [x, top + 2]],
        label: { x: (x + .5) / SIZE, y: (top + .5) / SIZE }, // 아치 윗부분 가운데(다음 지역 이름 자리)
        // 도착: 지도 안쪽을 보고 서고, 동행은 옆으로 줄지어 선다(game.js createField 가 걸을 수 있는 쪽을 고른다).
        arrival: { x: (x + .5) / SIZE, y: (front + .9) / SIZE, direction: side === 'top' ? 'front' : 'back' },
      };
    });
  }

  const ZONES = ['', 'grass', 'garden', 'sand', 'shore'];
  function waterBeside(water, size, x, y) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < size && ny < size && Boolean(water[ny * size + nx]);
    });
  }
  const GARDEN_PROPS = ['fountain', 'flower-red', 'daisy', 'sunflower'];
  const cache = new Map();
  // 지역 지도를 만든다: 그릴 타일 목록(바닥·위층·높은 풀·물결)과 칸별 막힘·가림·풀·출구 표시.
  function build(region) {
    const name = Object.hasOwn(REGIONS, region) ? region : 'forest';
    if (cache.has(name)) return cache.get(name);
    const spec = REGIONS[name];
    const seed = REGION_NAMES.indexOf(name) + 1;
    const count = SIZE * SIZE;
    const kinds = new Array(count).fill(null);
    const blocked = new Uint8Array(count), covered = new Uint8Array(count), tall = new Uint8Array(count), water = new Uint8Array(count), bridge = new Uint8Array(count);
    const exits = exitsOf(name, spec), exit = new Uint8Array(count); // exit: 출구 칸이면 exits 번호 + 1
    const solid = new Uint8Array(count); // 장식물(바위 등)이 막은 칸 — 물 위 바위는 배도 못 지나간다
    const ground = [], over = [], tallTiles = [], ripples = [], glints = [];
    for (const [kind, shape] of spec.terrain) eachCell(shape, (x, y) => { kinds[y * SIZE + x] = kind; });
    // 지도 밖(카메라가 늘 트레이너를 가운데에 두어 보이는 곳)의 지형: 바다 지역은 바다, 나머지는 바탕(장식 숲·바위는 아래 beyond).
    // 출구 위·아래로는 아치 너비만큼 길(지도 끝 칸과 같은 지형)이 화면 끝까지 이어진다.
    const corridorOf = (x, y) => exits.find(item => x >= item.x - 1 && x <= item.x + 1 && (item.side === 'top' ? y < 0 : y >= SIZE));
    const beyondKind = (x, y) => {
      const corridor = corridorOf(x, y);
      if (corridor) return x === corridor.x ? kinds[(corridor.side === 'top' ? 0 : SIZE - 1) * SIZE + x] : null;
      return spec.beyond === 'sea' ? 'sea' : null;
    };
    const kindAt = (x, y) => {
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) return kinds[y * SIZE + x];
      if (x < -PAD || y < -PAD || x >= SIZE + PAD || y >= SIZE + PAD) return undefined;
      return beyondKind(x, y);
    };
    for (const shape of spec.bridges || []) eachCell(shape, (x, y) => { bridge[y * SIZE + x] = 1; });
    const base = BASES[spec.base];
    // 1) 바닥: 모든 칸에 기본 무늬, 그 위에 지형(흙길·물·돌바닥)
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const index = y * SIZE + x;
        const pick = base.tiles[Math.floor(hash(x, y, seed) * base.tiles.length)];
        ground.push([base.sheet, pick[0] * TILE, pick[1] * TILE, x * TILE, y * TILE, TILE, TILE]);
        const kind = kinds[index];
        if (!kind) continue;
        if (kind === 'cobble') {
          const stone = BASES.cobble.tiles[Math.floor(hash(x, y, seed + 7) * BASES.cobble.tiles.length)];
          ground.push(['interior', stone[0] * TILE, stone[1] * TILE, x * TILE, y * TILE, TILE, TILE]);
          continue;
        }
        const terrain = TERRAINS[kind];
        const [tx, ty] = autotile(kindAt, x, y);
        ground.push([terrain.sheet, (terrain.x + tx) * TILE, (terrain.y + ty) * TILE, x * TILE, y * TILE, TILE, TILE]);
        if (terrain.solid) {
          water[index] = 1;
          if (!bridge[index]) blocked[index] = 1;
          // 물 한가운데 칸(사방이 물) 몇 곳에 잔물결을, 다른 몇 곳에 반짝이는 물빛을 띄운다.
          const chance = hash(x, y, seed + 3);
          if (tx === 1 && ty === 1 && !bridge[index] && chance < .14) ripples.push([x, y]);
          else if (!bridge[index] && chance > .9) glints.push([x, y, hash(x, y, seed + 5) * 3]);
        }
      }
    }
    for (let index = 0; index < count; index++) {
      if (!bridge[index]) continue;
      const x = index % SIZE, y = Math.floor(index / SIZE);
      ground.push([PLANK.sheet, PLANK.rect[0], PLANK.rect[1], x * TILE, y * TILE, TILE, TILE]);
    }
    // 2) 장식물: 가장자리 두 줄 + 지역 목록. 아래 줄은 막고, 위쪽 over 줄은 위층에 그리고 가림 표시를 한다.
    const placements = [];
    const edgeKinds = spec.edge;
    let edgeIndex = 0;
    const tilesOf = kind => [Math.ceil(PROPS[kind].rect[2] / TILE), Math.ceil(PROPS[kind].rect[3] / TILE)];
    // 위·아래 줄은 왼쪽부터, 왼쪽·오른쪽 줄은 위부터 장식물 크기만큼 띄워 겹치지 않게 놓는다.
    // 출구 아치 너비만큼은 비워 길이 지도 밖으로 이어져 보이게 하고, 틈 앞에 장식물이 들어가지 않는 칸은 fill 로 채운다.
    for (const side of ['top', 'bottom', 'left', 'right']) {
      let along = side === 'top' || side === 'bottom' ? 0 : 2;
      const end = side === 'top' || side === 'bottom' ? SIZE : SIZE - 2;
      const gaps = exits.filter(item => item.side === side).map(item => [item.x - 1, item.x + 1]);
      while (along < end) {
        const kind = edgeKinds[edgeIndex % edgeKinds.length];
        const [columns, rows] = tilesOf(kind);
        const gap = gaps.find(([from, to]) => along <= to && along + columns > from);
        if (gap) {
          for (; along < gap[0]; along++) for (const row of [0, 1]) placements.push([spec.fill, along, side === 'top' ? row : SIZE - 1 - row, true]);
          along = gap[1] + 1;
          continue;
        }
        edgeIndex++;
        const x = side === 'left' ? 0 : side === 'right' ? SIZE - columns : along;
        const y = side === 'top' ? 0 : side === 'bottom' ? SIZE - rows : along;
        placements.push([kind, x, y, true]);
        along += side === 'top' || side === 'bottom' ? columns : rows;
      }
    }
    for (const [kind, x, y] of spec.props) placements.push([kind, x, y, false]);
    for (const item of exits) placements.push(['arch', item.x - 1, item.top, false]);
    const props = [];
    for (const [kind, x, y, edge] of placements) {
      const prop = PROPS[kind];
      if (!prop) continue;
      const [sx, sy, width, height] = prop.rect;
      const columns = Math.ceil(width / TILE), rows = Math.ceil(height / TILE);
      // 가장자리 장식물이 지도 밖으로 나가면 그 칸들을 막는 것만 한다(그림은 지도 안쪽에 맞춰 놓는다).
      const left = Math.min(x, SIZE - columns), top = Math.min(y, SIZE - rows);
      // 바다에 한 칸이라도 걸치는 가장자리 장식물은 두지 않는다(물 위에 야자수가 서지 않게)
      if (edge && Array.from({ length: rows * columns }, (_, cell) => kinds[(top + Math.floor(cell / columns)) * SIZE + left + cell % columns]).includes('sea')) continue;
      props.push({ kind, x: left, y: top });
      const solidRows = prop.solid === false ? 0 : rows - prop.over;
      for (let row = 0; row < rows; row++) {
        const isOver = row < prop.over;
        const target = isOver ? over : ground;
        target.push([prop.sheet, sx, sy + row * TILE, left * TILE, (top + row) * TILE, width, Math.min(TILE, height - row * TILE)]);
        for (let column = 0; column < columns; column++) {
          const index = (top + row) * SIZE + left + column;
          if (isOver) covered[index] = 1;
          if (prop.open != null) { if (column !== prop.open) blocked[index] = 1; } // 아치: 가운데 줄만 지나간다
          else if (!isOver && row >= rows - solidRows) { blocked[index] = 1; solid[index] = 1; }
        }
      }
    }
    // 가장자리 두 줄은 장식물이 없는 틈(바다 쪽·출구 틈 등)도 막는다.
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (x < 2 || y < 2 || x >= SIZE - 2 || y >= SIZE - 2) blocked[y * SIZE + x] = 1;
    }
    // 아치 뒤(아치와 지도 끝 사이)는 막아 아치 옆으로 돌아 뒤로 들어가지 못하게 하고, 다리 사이 두 칸을 출구로 표시한다.
    exits.forEach((item, number) => {
      const [from, to] = item.side === 'top' ? [0, item.top - 1] : [item.top + 3, SIZE - 1];
      for (let y = from; y <= to; y++) for (let x = item.x - 1; x <= item.x + 1; x++) blocked[y * SIZE + x] = 1;
      for (const [x, y] of item.cells) exit[y * SIZE + x] = number + 1;
    });
    // 3) 높은 풀: 막힌 칸·물·길·출구 위에는 두지 않는다.
    const grass = TALL_GRASS[spec.tall];
    for (const shape of spec.tallGrass || []) eachCell(shape, (x, y) => {
      const index = y * SIZE + x;
      if (blocked[index] || water[index] || kinds[index] || covered[index] || exit[index]) return;
      tall[index] = 1;
      tallTiles.push([x, y]);
    });
    // 5) 지도 밖 채움(beyond, 좌표는 지도 왼쪽 위 기준이라 음수도 있다): 바탕 무늬 + 지형(바다·출구 길) + edge 장식물.
    // 장식물은 짝수 칸에 2×2로 놓아 지도 가장자리 장식 줄과 칸이 맞고, 지도 안·출구 길에 걸치는 자리는 비운다.
    const beyond = [];
    for (let y = -PAD; y < SIZE + PAD; y++) for (let x = -PAD; x < SIZE + PAD; x++) {
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) continue;
      const pick = base.tiles[Math.floor(hash(x, y, seed) * base.tiles.length)];
      beyond.push([base.sheet, pick[0] * TILE, pick[1] * TILE, x * TILE, y * TILE, TILE, TILE]);
      const kind = kindAt(x, y);
      if (!kind) continue;
      const terrain = TERRAINS[kind];
      const [tx, ty] = autotile(kindAt, x, y);
      beyond.push([terrain.sheet, (terrain.x + tx) * TILE, (terrain.y + ty) * TILE, x * TILE, y * TILE, TILE, TILE]);
    }
    const fills = spec.beyond === 'sea' ? [] : spec.edge.filter(kind => tilesOf(kind).join() === '2,2');
    for (let y = -PAD; y < SIZE + PAD && fills.length; y += 2) for (let x = -PAD; x < SIZE + PAD; x += 2) {
      const block = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
      if (block.some(([bx, by]) => (bx >= 0 && by >= 0 && bx < SIZE && by < SIZE) || corridorOf(bx, by))) continue;
      const kind = fills[((x / 2 + y / 2) % fills.length + fills.length) % fills.length];
      const [sx, sy, width, height] = PROPS[kind].rect;
      beyond.push([PROPS[kind].sheet, sx, sy, x * TILE, y * TILE, width, height]);
    }
    // 4) 만나는 칸(zone, ZONES 번호): 높은 풀 + 지역 meet. 출구 칸은 빼고, 겹치면 풀숲이 먼저다.
    const zone = new Uint8Array(count);
    const open = index => !blocked[index] && !exit[index];
    const mark = (index, kind) => { if (open(index) && !zone[index]) zone[index] = ZONES.indexOf(kind); };
    for (let index = 0; index < count; index++) if (tall[index]) mark(index, 'grass');
    if (spec.meet === 'garden') {
      // 꽃·분수 둘레 한 칸까지(꽃 칸 자체 포함)
      for (const prop of props) {
        if (!GARDEN_PROPS.includes(prop.kind)) continue;
        const [columns, rows] = tilesOf(prop.kind);
        for (let y = prop.y - 1; y <= prop.y + rows; y++) for (let x = prop.x - 1; x <= prop.x + columns; x++) {
          if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) mark(y * SIZE + x, 'garden');
        }
      }
    }
    for (let index = 0; index < count; index++) {
      const x = index % SIZE, y = Math.floor(index / SIZE);
      if (spec.meet === 'sand' && !kinds[index] && !water[index]) mark(index, 'sand');
      if (spec.meet === 'shore' && waterBeside(water, SIZE, x, y)) mark(index, 'shore');
    }
    const map = {
      region: name, size: SIZE, tile: TILE, sheets: SHEETS, ground, over, props, tallTiles, ripples, glints, grass, ripple: RIPPLE,
      beyond, pad: PAD, blocked, covered, tall, water, exit, exits, zone, kinds, bridge, base: spec.base, start: { x: (spec.start[0] + .5) / SIZE, y: (spec.start[1] + .9) / SIZE },
      focus: { x: spec.focus[0] / SIZE, y: spec.focus[1] / SIZE },
    };
    // 6) 배(바다 지역): 배를 타면 물 칸(부두 널빤지·바위·지도 가장자리 두 줄 빼고)만 다닌다. 물 위 볼은 사방이 다 물인 칸에만 둔다
    // (부두·모래에서 손이 닿지 않게 — 배를 타야 닿는다). 둘 다 걸을 수 있는 곳 계산 함수(isWalkable·findPath 등)에 그대로 넘기는 지도 모양이다.
    if (spec.boat) {
      const sail = new Uint8Array(count).fill(1), open = new Uint8Array(count).fill(1);
      const sails = (x, y) => x >= 2 && y >= 2 && x < SIZE - 2 && y < SIZE - 2 && water[y * SIZE + x] && !bridge[y * SIZE + x] && !solid[y * SIZE + x];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        if (!sails(x, y)) continue;
        sail[y * SIZE + x] = 0;
        if (NEIGHBORS.every(([dx, dy]) => sails(x + dx, y + dy))) open[y * SIZE + x] = 0;
      }
      const empty = new Uint8Array(count);
      map.waterMap = { size: SIZE, blocked: sail, covered: empty, tall: empty, exit: empty, zone: empty };
      map.openWaterMap = { size: SIZE, blocked: open, covered: empty, tall: empty, exit: empty, zone: empty };
      map.boat = { x: spec.boat[0] / SIZE, y: spec.boat[1] / SIZE };
    }
    cache.set(name, map);
    return map;
  }

  // ---------- 걸을 수 있는 곳(지도 기준 0~1) ----------
  // margin 은 지도 가장자리에서 띄울 거리(0~1). 화면 가장자리·위쪽 버튼·인물 키를 반영해 부르는 쪽이 정한다.
  function inMargin(point, margin) {
    return point.x >= (margin?.left || 0) && point.x <= 1 - (margin?.right || 0) && point.y >= (margin?.top || 0) && point.y <= 1 - (margin?.bottom || 0);
  }
  function cellOf(map, point) {
    return [Math.min(map.size - 1, Math.max(0, Math.floor(point.x * map.size))), Math.min(map.size - 1, Math.max(0, Math.floor(point.y * map.size)))];
  }
  function isWalkable(map, point, margin) {
    if (!inMargin(point, margin) || point.x < 0 || point.y < 0 || point.x >= 1 || point.y >= 1) return false;
    const [x, y] = cellOf(map, point);
    return !map.blocked[y * map.size + x];
  }
  // 걸을 수 있는 곳 가운데 point 와 가장 가까운 점. 이미 안이면 그대로. 막힌 칸이면 주변 칸을 한 겹씩 넓혀 찾는다.
  function nearestWalkable(map, point, margin) {
    const left = margin?.left || 0, top = margin?.top || 0, right = 1 - (margin?.right || 0), bottom = 1 - (margin?.bottom || 0);
    const clamped = { x: Math.max(left, Math.min(right, point.x)), y: Math.max(top, Math.min(bottom, point.y)) };
    if (isWalkable(map, clamped, margin)) return clamped;
    const [cx, cy] = cellOf(map, clamped);
    const unit = 1 / map.size, inset = unit * .02;
    let best = null, bestDistance = Infinity;
    for (let radius = 1; radius <= map.size && !best; radius++) {
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== radius) continue;
          if (x < 0 || y < 0 || x >= map.size || y >= map.size || map.blocked[y * map.size + x]) continue;
          const candidate = {
            x: Math.max(Math.max(left, x * unit + inset), Math.min(Math.min(right, (x + 1) * unit - inset), clamped.x)),
            y: Math.max(Math.max(top, y * unit + inset), Math.min(Math.min(bottom, (y + 1) * unit - inset), clamped.y)),
          };
          if (!isWalkable(map, candidate, margin)) continue;
          const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
          if (distance < bestDistance) { best = candidate; bestDistance = distance; }
        }
      }
    }
    return best || clamped;
  }
  // box([왼쪽, 위, 오른쪽, 아래], 0~1) 안의 걸을 수 있고 위층·높은 풀에 가리지 않는 곳에서 한 점(새 볼 자리). 못 찾으면 null.
  function randomWalkable(map, box, margin, random = Math.random) {
    for (let tries = 0; tries < 60; tries++) {
      const point = { x: box[0] + random() * (box[2] - box[0]), y: box[1] + random() * (box[3] - box[1]) };
      if (!isWalkable(map, point, margin)) continue;
      const [x, y] = cellOf(map, point);
      if (map.covered[y * map.size + x] || map.tall[y * map.size + x] || map.exit?.[y * map.size + x]) continue;
      return point;
    }
    return null;
  }
  // 두 점 사이를 곧게 걸어갈 수 있는지(¼칸마다 확인).
  function clearLine(map, from, to, margin) {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * map.size * 4);
    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      if (!isWalkable(map, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, margin)) return false;
    }
    return true;
  }
  const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  // 칸 길찾기: 걸을 수 있는 칸만 지나(대각선은 양옆 칸이 열려 있을 때만) from 에서 to 까지 가장 짧은 길.
  // 돌려주는 점들은 지도 기준 0~1이고, 곧게 이어 갈 수 있는 중간 점은 빼서 꺾이는 곳만 남긴다. 마지막 점은 to. 못 가면 null.
  function findPath(map, from, to, margin) {
    if (clearLine(map, from, to, margin)) return [to];
    const size = map.size;
    const center = index => ({ x: (index % size + .5) / size, y: (Math.floor(index / size) + .5) / size });
    const [startX, startY] = cellOf(map, from), [goalX, goalY] = cellOf(map, to);
    const start = startY * size + startX, goal = goalY * size + goalX;
    const open = (x, y) => x >= 0 && y >= 0 && x < size && y < size && (y * size + x === goal || isWalkable(map, center(y * size + x), margin));
    const previous = new Int32Array(size * size).fill(-1);
    previous[start] = start;
    const queue = [start];
    for (let head = 0; head < queue.length && previous[goal] < 0; head++) {
      const index = queue[head], x = index % size, y = Math.floor(index / size);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy, next = ny * size + nx;
        if (!open(nx, ny) || previous[next] >= 0) continue;
        if (dx && dy && (!open(x + dx, y) || !open(x, y + dy))) continue;
        previous[next] = index;
        queue.push(next);
      }
    }
    if (previous[goal] < 0) return null;
    const cells = [];
    for (let index = goal; index !== start; index = previous[index]) cells.push(index);
    const points = cells.reverse().map(center);
    points[points.length - 1] = to;
    const path = [];
    let anchor = from;
    for (let index = 0; index < points.length;) {
      let far = points.length - 1;
      while (far > index && !clearLine(map, anchor, points[far], margin)) far--;
      path.push(points[far]);
      anchor = points[far];
      index = far + 1;
    }
    return path;
  }
  function isCovered(map, point) {
    const [x, y] = cellOf(map, point);
    return Boolean(map.covered[y * map.size + x]);
  }
  function isTallGrass(map, point) {
    const [x, y] = cellOf(map, point);
    return Boolean(map.tall[y * map.size + x]);
  }
  // point(발)가 선 칸이 출구면 그 출구({ side, to, … }), 아니면 null.
  function exitAt(map, point) {
    const [x, y] = cellOf(map, point);
    const number = map.exit?.[y * map.size + x];
    return number ? map.exits[number - 1] : null;
  }
  // 발이 선 칸에서 포켓몬을 만날 수 있으면 그 칸 종류('grass'·'garden'·'sand'·'shore'), 아니면 null.
  function encounterAt(map, point) {
    const [x, y] = cellOf(map, point);
    return ZONES[map.zone?.[y * map.size + x]] || null;
  }
  // 물가: 걸을 수 있는 칸 중 위·아래·왼쪽·오른쪽에 물 칸이 있는 곳(부두 널빤지 포함).
  function isShore(map, point) {
    const [x, y] = cellOf(map, point);
    return !map.blocked[y * map.size + x] && waterBeside(map.water, map.size, x, y);
  }
  // 발이 선 칸의 바닥(발자국 색·진하기용, game.js): 'plank'(다리·부두 널빤지)·'stone'(도시 돌바닥)·'water'·'tall'(높은 풀)·
  // 'dirt'(흙길)·'lightSand'(밝은 모래: 바다 모래사장·사막 모래길)·'darkSand'(사막 진한 모래)·'grass'(풀밭).
  function groundAt(map, point) {
    const [x, y] = cellOf(map, point);
    const index = y * map.size + x;
    if (map.bridge[index]) return 'plank';
    if (map.water[index]) return 'water';
    if (map.tall[index]) return 'tall';
    const kind = map.kinds[index];
    if (kind === 'cobble') return 'stone';
    if (kind === 'dirt') return 'dirt';
    if (kind === 'sand') return 'lightSand';
    return map.base;
  }
  // 배를 타고 갈 수 있는 곳인지(배가 없는 지역은 늘 false).
  function isSailable(map, point, margin) {
    return Boolean(map.waterMap) && isWalkable(map.waterMap, point, margin);
  }
  // 큰 배 그림(game.js BOAT, boat-big.png 64×40)의 불투명 범위 — 배 가운데에서 도트로 가로 -30~+29, 세로 -19~+17.
  // 다시 타는 거리는 배 가운데가 아니라 이 몸통 사각형 가장자리에서 잰다(2026-11-14 「배를 내려가니 다시 안 타지네」).
  const BOAT_BODY = Object.freeze({ left: -30, right: 29, top: -19, bottom: 17 });
  // point 에서 배(boat: 배 가운데, 지도 기준 0~1) 몸통 사각형까지 거리(칸). 몸통 안이면 0.
  function boatGap(boat, point) {
    const dot = 1 / (SIZE * TILE);
    const dx = Math.max(boat.x + BOAT_BODY.left * dot - point.x, 0, point.x - (boat.x + BOAT_BODY.right * dot));
    const dy = Math.max(boat.y + BOAT_BODY.top * dot - point.y, 0, point.y - (boat.y + BOAT_BODY.bottom * dot));
    return Math.hypot(dx, dy) * SIZE;
  }
  // 배를 눌렀을 때 걸어갈 자리: 걸을 수 있는 땅·부두 가운데 배 몸통에 가장 가까운 점(몸통에 걸친 땅이 여럿이면 배 가운데에 가장 가까운 점).
  // 칸마다 배 가운데를 칸 안(걷기 여백 안)으로 당긴 점이 그 칸에서 몸통에도 가장 가깝다(거리가 가로·세로 따로 늘기만 해서).
  // 몸통에서 reach 칸 안에 없으면 null.
  function boardingSpot(map, boat, margin, reach = 4) {
    const left = margin?.left || 0, top = margin?.top || 0, right = 1 - (margin?.right || 0), bottom = 1 - (margin?.bottom || 0);
    const unit = 1 / map.size, inset = unit * .02;
    const [cx, cy] = cellOf(map, boat);
    const span = Math.ceil(reach) + 3; // 몸통 반 너비(2칸 안쪽) + reach
    let best = null, bestGap = Infinity, bestDistance = Infinity;
    for (let y = cy - span; y <= cy + span; y++) {
      for (let x = cx - span; x <= cx + span; x++) {
        if (x < 0 || y < 0 || x >= map.size || y >= map.size || map.blocked[y * map.size + x]) continue;
        const point = {
          x: Math.max(Math.max(left, x * unit + inset), Math.min(Math.min(right, (x + 1) * unit - inset), boat.x)),
          y: Math.max(Math.max(top, y * unit + inset), Math.min(Math.min(bottom, (y + 1) * unit - inset), boat.y)),
        };
        if (!isWalkable(map, point, margin)) continue;
        const gap = boatGap(boat, point), distance = Math.hypot(point.x - boat.x, point.y - boat.y);
        if (gap > reach || gap > bestGap + 1e-9 || (gap > bestGap - 1e-9 && distance >= bestDistance)) continue;
        best = point; bestGap = gap; bestDistance = distance;
      }
    }
    return best;
  }
  // 배에서 내릴 자리: point(배) 둘레 reach 칸 안에서 가장 가까운 걸을 수 있는 땅·부두 점. 없으면 null.
  function landingSpot(map, point, margin, reach = 1.5) {
    const spot = nearestWalkable(map, point, margin);
    if (!isWalkable(map, spot, margin)) return null;
    return Math.hypot(spot.x - point.x, spot.y - point.y) * map.size <= reach ? spot : null;
  }
  // region 으로 가는 출구(그 지역에서 넘어왔으면 이 출구 앞 arrival 에 선다). 없으면 null.
  function exitTo(map, region) {
    return map.exits?.find(item => item.to === region) || null;
  }
  root.FieldWorld = Object.freeze({ TILE, SIZE, PAD, SHEETS, PROPS, REGIONS: REGION_NAMES, build, isWalkable, nearestWalkable, randomWalkable, findPath, isCovered, isTallGrass, exitAt, exitTo, encounterAt, groundAt, isShore, isSailable, landingSpot, BOAT_BODY, boatGap, boardingSpot });
})(window);
