// 내 마당: 잡은 포켓몬을 10마리까지 풀어 두고 노는 도트 장면.
// 바닥·나무·울타리는 Ninja Adventure(CC0) 16px 타일을 정수배로 키워 캔버스에 한 번 그리고,
// 포켓몬은 필드 동행과 같은 외부 원본 픽셀 걷기 시트로 requestAnimationFrame 하나에서 움직인다.
(function (global) {
  'use strict';

  const LIMIT = 10;
  const SOURCE_TILE = 16;
  const BERRY_LIMIT = 5; // 땅에 한꺼번에 놓을 수 있는 먹이 수
  const TOUCH = 52; // tokens.css 의 --touch 와 같은 값(모서리 버튼 높이)

  // ---------- 마당 여러 개 ----------

  // 마당은 여러 개를 모으는 구조(lat 기획 「테마 마당」: 고정 크기·각 10마리·N개 보유). 기본 풀밭 마당은 옛 저장 칸 yard 를 그대로 쓰고,
  // 다른 마당은 yards[id] 에 따로 저장한다(js/storage.js YARD_THEMES 와 같은 id). 같은 포켓몬을 여러 마당에 둘 수 있다.
  // 여는 규칙(2026-11-19 사용자 「처음 열리는 마을은 눈의 마을로 해주고 이후는 본인들이 열 수 있게」):
  // 풀밭 마당은 처음부터, 눈의 마을은 포켓몬 SNOW_AT 마리에 저절로 열린다. 그 뒤 KEY_EVERY 마리마다 마당 열쇠 하나를 받고,
  // 아이가 목록에서 열고 싶은 마을을 골라 연다(저장 yardsOpen). 숫자는 임시값.
  const SNOW_AT = 10;
  const KEY_EVERY = 10;
  // 모양: 바닥(floor 시트 블록)·나무·덤불·꽃·작은 풀·날리는 것(particles)·소품(props: img/yard/props-<id>.png 의 32px 칸 수).
  // 소품 도트는 GPT 이미지 생성(docs/art/yard-props-*)으로 이 묶음 그림체에 맞춰 만들고 tools/pixel-props.py 로 32px 격자에 되돌렸다(img/yard/LICENSE.txt).
  // 2026-11-19 「여아 남아 모두 좋아할 수 있게」·「픽셀로 만들어 다른 맵 그림체랑 맞게」.
  const THEMES = [
    { id: 'meadow', name: '풀밭 마당', fixed: true },
    { id: 'snow', name: '눈의 마을', fixed: true, props: 5 },
    { id: 'forest', name: '숲 마을', props: 6 },
    { id: 'sea', name: '바다 마을', props: 6 },
    { id: 'doll', name: '인형 마을', props: 6 },
    { id: 'robot', name: '로봇 마을', props: 6 },
    { id: 'car', name: '자동차 마을', props: 6 },
    { id: 'dino', name: '공룡 마을', props: 6 },
    { id: 'sweets', name: '과자 마을', props: 6 },
    { id: 'cherry', name: '벚꽃 마을', props: 6 },
    { id: 'space', name: '우주 마을', props: 6 },
    { id: 'gem', name: '보석 동굴', props: 6 },
    { id: 'desert', name: '사막 마을', props: 6 },
    { id: 'autumn', name: '단풍 마을', props: 6 },
    { id: 'flower', name: '꽃밭 마을', props: 6 }
  ];
  const CHOOSABLE = THEMES.filter(item => !item.fixed).map(item => item.id);
  const PROP_SIZE = 32;
  function propSheet(id) { return theme(id).props ? `img/yard/props-${theme(id).id}.png` : ''; }
  function theme(id) { return THEMES.find(item => item.id === id) || THEMES[0]; }
  function caughtCount(state) { return Array.isArray(state?.caught) ? state.caught.length : 0; }
  function openedIds(state) { return Array.isArray(state?.yardsOpen) ? state.yardsOpen.filter(id => CHOOSABLE.includes(id)) : []; }
  // 지금까지 받은 마당 열쇠 수(눈의 마을 뒤 KEY_EVERY 마리마다 하나)와 아직 안 쓴 열쇠.
  function keysEarned(state) { return Math.min(CHOOSABLE.length, Math.max(0, Math.floor((caughtCount(state) - SNOW_AT) / KEY_EVERY))); }
  function keysLeft(state) { return Math.max(0, keysEarned(state) - openedIds(state).length); }
  function themeOpen(id, state) {
    const item = theme(id);
    if (item.id === 'meadow') return true;
    if (item.id === 'snow') return caughtCount(state) >= SNOW_AT;
    return openedIds(state).includes(item.id);
  }
  // 다음 열쇠(눈의 마을 전이면 눈의 마을)까지 더 잡아야 하는 수.
  function nextUnlockIn(state) {
    const count = caughtCount(state);
    if (count < SNOW_AT) return SNOW_AT - count;
    return KEY_EVERY - ((count - SNOW_AT) % KEY_EVERY);
  }
  // 잡은 수가 before → after 로 늘 때 새로 열린 것: 'snow'(눈의 마을) 또는 'key'(열쇠 하나 더). 축하 카드에 쓴다.
  function unlocksBetween(before, after) {
    const events = [];
    if (before < SNOW_AT && after >= SNOW_AT) events.push('snow');
    const was = keysEarned({ caught: Array(Math.max(0, before)) });
    const now = keysEarned({ caught: Array(Math.max(0, after)) });
    for (let index = was; index < now; index++) events.push('key');
    return events;
  }
  // 열쇠로 마을 하나 열기. 열쇠가 없거나 고를 수 없는 마을이면 그대로.
  function openTheme(state, id) {
    if (!CHOOSABLE.includes(id) || themeOpen(id, state) || keysLeft(state) < 1) return null;
    return { yardsOpen: [...openedIds(state), id] };
  }
  // 저장할 때 쓸 바꿈 조각(풀밭 마당은 yard, 나머지는 yards 안 한 칸).
  function yardPatch(state, id, ids) {
    if (theme(id).id === 'meadow') return { yard: ids };
    return { yards: { ...(state?.yards || {}), [theme(id).id]: ids } };
  }

  // ---------- 저장된 마당 목록 ----------

  // 풀밭 마당은 저장된 목록이 없으면(처음 열었을 때) 모험 파트너부터 잡은 포켓몬을 10마리까지 보여 준다. 저장은 고를 때 처음 한다.
  // 다른 마당은 처음엔 비어 있다.
  function yardIds(state, themeId = 'meadow') {
    const caught = Array.isArray(state?.caught) ? state.caught : [];
    const caughtSet = new Set(caught);
    if (theme(themeId).id !== 'meadow') {
      const saved = state?.yards?.[theme(themeId).id];
      return Array.isArray(saved) ? [...new Set(saved)].filter(id => caughtSet.has(id)).slice(0, LIMIT) : [];
    }
    if (Array.isArray(state?.yard)) {
      return [...new Set(state.yard)].filter(id => caughtSet.has(id)).slice(0, LIMIT);
    }
    const party = Array.isArray(state?.companions) ? state.companions : (state?.companion ? [state.companion] : []);
    return [...new Set([...party, ...caught])].filter(id => caughtSet.has(id)).slice(0, LIMIT);
  }

  // 고르기 창에서 한 마리를 누르면 넣거나 뺀다. 10마리가 찼으면 바꾸지 않고 full 을 알린다.
  function toggleYard(ids, id, caught) {
    if (!caught.includes(id)) return { ids, result: 'invalid' };
    if (ids.includes(id)) return { ids: ids.filter(other => other !== id), result: 'removed' };
    if (ids.length >= LIMIT) return { ids, result: 'full' };
    return { ids: [...ids, id], result: 'added' };
  }

  // ---------- 크기·배율 ----------

  // 타일 배율은 정수(2~4)만 쓴다. 화면의 짧은 변에 16px 타일이 8칸쯤 들어가게 고른다.
  function tileScale(width, height) {
    const shorter = Math.min(width, height);
    return Math.max(2, Math.min(4, Math.round(shorter / (SOURCE_TILE * 8))));
  }

  // 포켓몬 그림의 몸통 크기(걷기·서 있기 모든 프레임 중 가장 큰 경계). 같은 포켓몬은 늘 같은 배율로 그린다.
  function spriteExtent(data) {
    let widest = 0;
    let tallest = 0;
    for (const motion of [data?.walk, data?.idle]) {
      const rows = Array.isArray(motion?.frameGeometry) ? motion.frameGeometry : [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const geometry of row) {
          const bounds = geometry?.bounds;
          if (Array.isArray(bounds) && Number.isFinite(bounds[2]) && Number.isFinite(bounds[3])) {
            widest = Math.max(widest, bounds[2]);
            tallest = Math.max(tallest, bounds[3]);
          }
        }
      }
    }
    const fallback = Math.max(data?.walk?.frameWidth || 0, data?.walk?.frameHeight || 0);
    return Math.max(widest, tallest) || fallback || 32;
  }

  // 몸통이 target 픽셀쯤 되게 하는 배율(1~4). steps 는 기기 배율(정수): 3이면 1/3 단위라 도트 한 칸이 기기 픽셀 정수 개로
  // 고르게 그려진다(그보다 잘게 나누면 도트가 뭉개진다). 반올림으로 목표의 80%보다 작아지면 한 단계 키운다
  // (큰 그림이 1배로 떨어져 작게 보이는 것을 막는다).
  function pixelScale(extent, target, steps = 1) {
    if (!(extent > 0) || !(target > 0)) return 1;
    let scale = Math.max(1, Math.min(4, Math.round(target / extent * steps) / steps));
    if (extent * scale < target * .8 && scale < 4) scale += 1 / steps;
    return scale;
  }
  // 마당에서 가장 큰 포켓몬(core.js bodySize 1)의 몸통 크기는 포켓몬 칸(pokemonSize)의 1.6배. 키 1m 포켓몬이 칸의 1.2배쯤이고,
  // 피카츄·디그다는 작게, 잠만보·롱스톤은 크게 그려 키 차이가 보인다(2026-11-14 사용자 「포켓몬 끼리도 비율이 이상해」).
  const YARD_FULL_SIZE = 1.6;

  // 화면 크기와 기기 안전 여백으로 타일 크기·울타리 줄·포켓몬이 걸을 수 있는 칸을 정한다.
  function yardLayout(width, height, safe = {}) {
    const top = safe.top || 0;
    const right = safe.right || 0;
    const bottom = safe.bottom || 0;
    const left = safe.left || 0;
    const scale = tileScale(width, height);
    const tile = SOURCE_TILE * scale;
    // 울타리는 위쪽 모서리 버튼 줄 아래 끝에 걸치게 둔다(버튼 뒤에는 나무만 보인다).
    const fenceY = Math.round(Math.max(tile * .75, top + TOUCH + 8 - tile * .6));
    const walk = {
      left: Math.round(left + tile * .9),
      right: Math.round(width - right - tile * .9),
      top: Math.round(fenceY + tile * 1.25),
      bottom: Math.round(height - bottom - tile * .4)
    };
    if (walk.bottom - walk.top < tile) walk.bottom = walk.top + tile;
    return { width, height, scale, tile, fenceY, walk, pokemonSize: Math.round(tile * 1.35) };
  }

  function clampPoint(point, bounds) {
    return {
      x: Math.max(bounds.left, Math.min(bounds.right, point.x)),
      y: Math.max(bounds.top, Math.min(bounds.bottom, point.y))
    };
  }

  // ---------- 움직임(순수 함수) ----------

  function randomPoint(bounds, random) {
    return {
      x: bounds.left + random() * (bounds.right - bounds.left),
      y: bounds.top + random() * (bounds.bottom - bounds.top)
    };
  }

  // 다른 포켓몬과 가장 멀리 떨어진 빈 곳을 몇 번 뽑아 고른다(처음 놓을 때·새 목적지).
  function freeSpot(bounds, others, random, tries = 10) {
    let best = randomPoint(bounds, random);
    let bestDistance = -1;
    for (let attempt = 0; attempt < tries; attempt++) {
      const candidate = randomPoint(bounds, random);
      let nearest = Infinity;
      for (const other of others) nearest = Math.min(nearest, Math.hypot(candidate.x - other.x, candidate.y - other.y));
      if (nearest > bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    return best;
  }

  // 가까운 포켓몬에게서 밀어내는 방향(겹칠수록 크다). 여러 마리면 합친다.
  function avoidance(self, others, radius) {
    let pushX = 0;
    let pushY = 0;
    for (const other of others) {
      if (other === self) continue;
      const dx = self.x - other.x;
      const dy = (self.y - other.y) * 1.6; // 위아래로는 덜 떨어져도 겹쳐 보이지 않는다
      const distance = Math.hypot(dx, dy);
      if (distance >= radius) continue;
      if (distance < .001) {
        pushX += self.id > other.id ? 1 : -1;
        continue;
      }
      // 밀어내기 + 옆걸음(진행 방향의 오른쪽). 마주 걸어도 서로 반대쪽 옆으로 비켜 지나간다.
      const strength = (radius - distance) / radius;
      const awayX = dx / distance;
      const awayY = dy / distance;
      pushX += (awayX - awayY * .8) * strength;
      pushY += (awayY + awayX * .8) * strength;
    }
    return { x: pushX, y: pushY };
  }

  // 움직이는 쪽으로 4방향(앞·뒤·왼쪽·오른쪽)을 정한다. 거의 안 움직이면 이전 방향을 유지한다.
  function directionFor(dx, dy, previous = 'front') {
    if (Math.abs(dx) < .01 && Math.abs(dy) < .01) return previous;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'front' : 'back';
  }

  // 서서 두리번거릴 때 볼 쪽. 얼굴이 보이게 뒤돌기는 넣지 않는다(뒷모습은 위로 걸어갈 때만).
  const LOOK_AROUND = ['front', 'left', 'right', 'front'];

  // 한 마리를 dt초만큼 움직인다. 걷기 → 도착하면 잠깐 서서 두리번 → 새 목적지로 걷기.
  // 반환값: 이번에 일어난 일('arrived' | 'look' | null). 화면 효과는 부르는 쪽이 붙인다.
  function stepActor(actor, others, dt, bounds, random, options = {}) {
    const speed = options.speed || 40;
    const radius = options.radius || 40;
    actor.clock += dt;
    if (actor.mode === 'idle') {
      actor.wait -= dt;
      // 서 있는데 다른 포켓몬과 겹쳐 있으면 기다리지 않고 비어 있는 곳으로 옮겨 간다.
      const crowd = avoidance(actor, others, radius);
      if (Math.hypot(crowd.x, crowd.y) > .55) actor.wait = 0;
      if (actor.wait > 0) {
        if (random() < dt * .7) {
          actor.dir = LOOK_AROUND[Math.floor(random() * LOOK_AROUND.length)];
          return 'look';
        }
        return null;
      }
      actor.target = freeSpot(bounds, others.filter(other => other !== actor).map(other => other.target || other), random, 6);
      actor.mode = 'walk';
      actor.boost = 1;
    }
    const goal = actor.target || actor;
    const toGoalX = goal.x - actor.x;
    const toGoalY = goal.y - actor.y;
    const distance = Math.hypot(toGoalX, toGoalY);
    if (distance < 3) {
      actor.mode = 'idle';
      actor.wait = 1.4 + random() * 3;
      actor.target = null;
      const wasCalled = actor.boost > 1;
      actor.boost = 1;
      return wasCalled ? 'arrived' : null;
    }
    const push = avoidance(actor, others, radius);
    const step = speed * (actor.boost || 1) * dt;
    const moveX = toGoalX / distance + push.x * 1.4;
    const moveY = toGoalY / distance + push.y * 1.4;
    const length = Math.hypot(moveX, moveY) || 1;
    const next = clampPoint({ x: actor.x + moveX / length * Math.min(step, distance), y: actor.y + moveY / length * Math.min(step, distance) }, bounds);
    actor.dir = directionFor(toGoalX, toGoalY, actor.dir);
    actor.x = next.x;
    actor.y = next.y;
    return null;
  }

  // 마당 빈 곳을 누르면 가까운 몇 마리가 그 둘레로 모인다(서로 겹치지 않게 둥글게).
  function gatherTargets(point, actors, count, spacing, bounds) {
    const nearest = [...actors]
      .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))
      .slice(0, count);
    return nearest.map((actor, index) => {
      const angle = Math.PI / 2 + index * (Math.PI * 2 / Math.max(1, nearest.length));
      const ring = nearest.length > 1 ? spacing : 0;
      return { actor, target: clampPoint({ x: point.x + Math.cos(angle) * ring, y: point.y + Math.sin(angle) * ring * .6 }, bounds) };
    });
  }

  // ---------- 멘트 ----------

  const LINES = {
    enter: ['마당에 왔다!', '다들 신나게 놀고 있어!', '오늘도 같이 놀자!', '바람이 살랑살랑 불어!', '모두 반가워!'],
    pet: ['기분 좋대!', '폴짝폴짝!', '간질간질 좋아!', '또 놀아 줘!', '우리 친구 최고!'],
    call: ['이리 와!', '모두 모여라!', '여기야 여기!', '누가 먼저 올까?', '같이 달려 보자!'],
    add: ['새 친구가 놀러 왔어!', '어서 와, 반가워!', '마당이 북적북적!', '같이 놀자!'],
    remove: ['잠깐 쉬러 갔어!', '다음에 또 놀자!', '안녕, 또 만나!', '푹 쉬고 와!'],
    full: ['마당이 꽉 찼어!', '열 마리가 다 모였어!', '더는 못 들어와!', '한 마리를 빼면 들어올 수 있어!'],
    empty: ['친구를 데려와 볼까?', '마당이 텅 비었어!', '누구랑 놀까?', '포켓몬을 불러 보자!'],
    feedOn: ['땅을 눌러 라즈베리를 놓자!', '어디에 놓을까?'],
    feedOff: ['먹이 주기 끝!', '배불리 먹었대!'],
    feedFull: ['먹이가 벌써 많아!', '다 먹고 나면 또 주자!'],
    enterSnow: ['눈의 마을에 왔다!', '하얀 눈이 펑펑!', '눈사람 만들자!', '발이 시려워도 신나!'],
    eat: ['냠냠 맛있다!', '라즈베리 최고!', '고마워, 맛있어!', '배가 든든해!']
  };

  // 상황에 맞는 멘트 하나. 바로 전에 한 말은 다시 고르지 않는다.
  function pickLine(kind, previous, random = Math.random) {
    const lines = LINES[kind] || [];
    const choices = lines.length > 1 ? lines.filter(line => line !== previous) : lines;
    return choices[Math.floor(random() * choices.length)] || '';
  }

  // ---------- 바닥 그리기 ----------

  const TILE_IMAGES = {
    floor: 'img/yard/tileset-floor.png',
    nature: 'img/yard/tileset-nature.png',
    house: 'img/yard/tileset-house.png',
    detail: 'img/yard/tileset-floor-detail.png'
  };
  // 그림 안 위치(원본 16px 칸 단위 또는 px). [시트, x, y, 너비, 높이] — 모두 원본 픽셀.
  const PIECES = {
    grass: ['floor', 0, 192, 16, 16],
    grassMarks: [['floor', 16, 192], ['floor', 32, 192], ['floor', 48, 192], ['floor', 64, 192], ['floor', 32, 176], ['floor', 48, 176]],
    // 흙밭 9칸: [위·가운데·아래][왼쪽·가운데·오른쪽]
    dirt: {
      top: { left: [0, 112], middle: [16, 112], right: [32, 112] },
      middle: { left: [0, 128], middle: [16, 128], right: [32, 128] },
      bottom: { left: [0, 144], middle: [16, 144], right: [32, 144] }
    },
    dirtDetails: [[0, 176], [16, 176]],
    fence: ['house', 176, 80, 16, 16],
    trees: [['nature', 0, 0, 32, 32], ['nature', 224, 0, 32, 32], ['nature', 256, 0, 32, 32], ['nature', 32, 0, 32, 32], ['nature', 288, 0, 32, 32]],
    bigTrees: [['nature', 0, 288, 48, 48], ['nature', 48, 288, 48, 48]],
    bushes: [['nature', 0, 160, 16, 16], ['nature', 16, 160, 16, 16], ['nature', 32, 160, 16, 16]],
    flowers: [['nature', 0, 176, 16, 16], ['nature', 48, 176, 16, 16], ['nature', 96, 176, 16, 16], ['nature', 32, 176, 16, 16], ['detail', 80, 32, 16, 16]],
    tufts: [['detail', 0, 32, 16, 16], ['detail', 16, 32, 16, 16], ['detail', 32, 32, 16, 16], ['detail', 96, 32, 16, 16]]
  };

  // 다른 마을의 바닥: TilesetFloor 는 16px 칸으로 [열, 줄] 블록이 4×2 개다. 블록마다 왼쪽 위 3×3 이 웅덩이(9칸 이어 붙이기),
  // 5줄 아래가 민 바닥. 열 0 은 모래·풀·눈·얼음, 열 11 은 분홍·짙은 풀·갈색·주황 블록.
  const tile16 = (column, row) => [column * 16, row * 16];
  function nineSlice(column, row) {
    const at = (dx, dy) => tile16(column + dx, row + dy);
    return {
      top: { left: at(0, 0), middle: at(1, 0), right: at(2, 0) },
      middle: { left: at(0, 1), middle: at(1, 1), right: at(2, 1) },
      bottom: { left: at(0, 2), middle: at(1, 2), right: at(2, 2) }
    };
  }
  function floorOf(plain, marks, rate) { return { grass: ['floor', ...tile16(...plain), 16, 16], grassMarks: marks.map(mark => ['floor', ...tile16(...mark)]), markRate: rate }; }
  const FLOORS = {
    sand: floorOf([1, 1], [[1, 4], [0, 4]], .04),
    sandDark: floorOf([0, 5], [[1, 5], [2, 5], [3, 5], [4, 5]], .2),
    pinkDark: floorOf([11, 5], [[12, 5], [13, 5], [14, 5]], .18),
    darkGrass: floorOf([11, 12], [[12, 12], [13, 12], [14, 12], [15, 12]], .22),
    brown: floorOf([11, 19], [[12, 19], [13, 19], [14, 19]], .18),
    snow: floorOf([3, 18], [[0, 18], [1, 18]], .06)
  };
  const NATURE = {
    green: ['nature', 0, 0, 32, 32], pine: ['nature', 32, 0, 32, 32], dead: ['nature', 64, 0, 32, 32], roots: ['nature', 96, 0, 32, 32],
    snowPine: ['nature', 160, 0, 32, 32], snowPineGreen: ['nature', 128, 0, 32, 32], white: ['nature', 192, 0, 32, 32], pink: ['nature', 224, 0, 32, 32],
    green2: ['nature', 256, 0, 32, 32], green3: ['nature', 288, 0, 32, 32],
    bigPink: ['nature', 0, 288, 48, 48], bigGreen: ['nature', 48, 288, 48, 48], bigWhite: ['nature', 96, 288, 48, 48], bigOrange: ['nature', 144, 288, 48, 48],
    brownRock: ['nature', 208, 128, 32, 32], greyRock: ['nature', 256, 128, 32, 32], stump: ['nature', 0, 128, 32, 32], stumpOrange: ['nature', 32, 128, 32, 32],
    sunflower: ['nature', 0, 176, 16, 16], sunflower2: ['nature', 16, 176, 16, 16], clover: ['nature', 32, 176, 16, 16], redFlower: ['nature', 48, 176, 16, 16], whiteFlower: ['nature', 96, 176, 16, 16],
    bush1: ['nature', 0, 160, 16, 16], bush2: ['nature', 16, 160, 16, 16], bush3: ['nature', 32, 160, 16, 16],
    snowRock: ['nature', 64, 192, 16, 16], snowBall: ['nature', 80, 192, 16, 16], tealRock: ['nature', 112, 192, 16, 16], snowTeal: ['nature', 144, 192, 16, 16], snowPile: ['nature', 160, 192, 16, 16],
    frost1: ['nature', 128, 208, 16, 16], frost2: ['nature', 144, 208, 16, 16], snowBall2: ['nature', 160, 208, 16, 16], greyBall: ['nature', 176, 208, 16, 16],
    crystalOrange: ['nature', 0, 224, 16, 16], crystalTeal: ['nature', 16, 224, 16, 16], crystalPink: ['nature', 32, 224, 16, 16], crystalGreen: ['nature', 48, 224, 16, 16],
    gemOrange: ['nature', 0, 240, 16, 16], gemTeal: ['nature', 16, 240, 16, 16], gemPink: ['nature', 32, 240, 16, 16], gemGreen: ['nature', 48, 240, 16, 16],
    ore1: ['nature', 64, 224, 16, 16], ore2: ['nature', 80, 224, 16, 16], ore3: ['nature', 96, 224, 16, 16],
    leafOrange: ['nature', 192, 192, 16, 16], sprout: ['nature', 208, 192, 16, 16]
  };
  const pick = names => names.map(name => NATURE[name]);
  // 마을마다 풀밭 마당(PIECES)에서 바꾸는 것만 적는다. patch: 웅덩이 9칸 위치(열, 줄), big: 웅덩이를 크게(바다·호수).
  const LOOKS = {
    snow: { floor: 'snow', patch: [0, 21], trees: ['snowPineGreen', 'snowPine', 'white'], big: ['bigWhite', 'bigWhite'], bushes: ['snowRock', 'snowBall', 'snowPile'], flowers: ['snowBall', 'snowBall2', 'snowTeal'], tufts: ['frost1', 'frost2'], particles: 'snow' },
    forest: { floor: 'darkGrass', patch: [11, 7], trees: ['pine', 'roots', 'green', 'pine'], big: ['bigGreen', 'bigGreen'], bushes: ['bush1', 'bush2', 'bush3'], flowers: ['clover', 'sprout', 'stump'], tufts: ['bush2'], particles: 'leaves' },
    sea: { floor: 'sand', patch: [0, 21], patchSize: 'big', patchFill: true, trees: ['green2', 'green3'], big: ['bigGreen', 'bigGreen'], bushes: ['tealRock', 'bush1'], flowers: ['tealRock', 'greyBall'], tufts: [], particles: 'none' },
    doll: { floor: 'pinkDark', patch: [11, 0], trees: ['pink', 'white'], big: ['bigPink', 'bigWhite'], bushes: ['bush1', 'bush2'], flowers: ['redFlower', 'whiteFlower', 'crystalPink'], tufts: ['clover'], particles: 'petals' },
    robot: { floor: 'brown', patch: [11, 14], trees: ['greyRock', 'brownRock'], big: ['bigGreen', 'bigGreen'], bushes: ['greyBall', 'tealRock'], flowers: ['ore1', 'ore2', 'ore3'], tufts: ['greyBall'], particles: 'none' },
    car: { floor: 'sandDark', patch: [0, 0], trees: ['green', 'green2'], big: ['bigGreen', 'bigOrange'], bushes: ['bush1', 'bush3'], flowers: ['greyBall'], tufts: ['sprout'], particles: 'none' },
    dino: { floor: 'darkGrass', patch: [11, 7], trees: ['roots', 'pine', 'brownRock'], big: ['bigGreen', 'bigGreen'], bushes: ['bush1', 'bush2', 'bush3'], flowers: ['sprout', 'clover', 'ore2'], tufts: ['bush2'], particles: 'leaves' },
    sweets: { floor: 'pinkDark', patch: [11, 0], trees: ['white', 'pink'], big: ['bigWhite', 'bigPink'], bushes: ['bush1'], flowers: ['gemPink', 'gemOrange', 'whiteFlower'], tufts: ['clover'], particles: 'petals' },
    cherry: { floor: 'grass', trees: ['pink', 'pink', 'white'], big: ['bigPink', 'bigPink'], bushes: ['bush1', 'bush2'], flowers: ['redFlower', 'whiteFlower', 'clover'], tufts: ['sprout'], particles: 'petals' },
    space: { floor: 'brown', patch: [11, 14], trees: ['greyRock', 'brownRock'], big: ['bigWhite', 'bigWhite'], bushes: ['greyBall', 'snowRock'], flowers: ['crystalTeal', 'gemTeal', 'greyBall'], tufts: ['ore1'], particles: 'stars' },
    gem: { floor: 'brown', patch: [11, 14], trees: ['brownRock', 'greyRock'], big: ['bigWhite', 'bigOrange'], bushes: ['greyBall', 'ore1'], flowers: ['crystalOrange', 'crystalTeal', 'crystalPink', 'crystalGreen', 'gemPink', 'gemTeal'], tufts: ['ore2', 'ore3'], particles: 'stars' },
    desert: { floor: 'sandDark', patch: [0, 0], trees: ['dead', 'brownRock'], big: ['bigOrange', 'bigOrange'], bushes: ['sprout', 'leafOrange'], flowers: ['ore2', 'leafOrange'], tufts: ['sprout'], particles: 'none' },
    autumn: { floor: 'grass', trees: ['dead', 'roots', 'stumpOrange'], big: ['bigOrange', 'bigOrange'], bushes: ['bush3', 'leafOrange'], flowers: ['leafOrange', 'redFlower', 'sprout'], tufts: ['leafOrange'], particles: 'leaves' },
    flower: { floor: 'grass', trees: ['green', 'pink', 'green3'], big: ['bigPink', 'bigGreen'], bushes: ['bush1', 'bush2'], flowers: ['sunflower', 'sunflower2', 'redFlower', 'whiteFlower'], tufts: ['clover'], flowerRate: .2, particles: 'petals' }
  };
  function particlesFor(themeId) { return LOOKS[theme(themeId).id]?.particles || 'meadow'; }
  // 소품(그림 문자) 자리: 걷는 칸 안에 화면 크기마다 같은 자리로 흩어 둔다. 포켓몬은 그 위를 지나다닌다.
  function propsFor(themeId, layout) {
    const props = theme(themeId).props || 0;
    if (!props || !layout) return [];
    const random = seededRandom(Math.round(layout.width) * 101 + Math.round(layout.height) * 7 + props);
    const area = layout.walk;
    const count = Math.max(4, Math.min(7, Math.round((area.right - area.left) * (area.bottom - area.top) / (layout.tile * layout.tile * 8))));
    return Array.from({ length: count }, (_, index) => ({
      index: index % props,
      x: Math.round(area.left + random() * (area.right - area.left)),
      y: Math.round(area.top + layout.tile * .4 + random() * (area.bottom - area.top - layout.tile * .4))
    }));
  }
  const LOOK_PIECES = {};
  function piecesFor(themeId) {
    const id = theme(themeId).id;
    const look = LOOKS[id];
    if (!look) return PIECES;
    if (LOOK_PIECES[id]) return LOOK_PIECES[id];
    const floor = look.floor === 'grass' ? {} : FLOORS[look.floor];
    return LOOK_PIECES[id] = {
      ...PIECES, ...floor,
      dirt: look.patch ? nineSlice(...look.patch) : PIECES.dirt,
      dirtDetails: look.patch ? [] : PIECES.dirtDetails,
      patchSize: look.patchSize || 'normal',
      patchFill: Boolean(look.patchFill),
      trees: pick(look.trees), bigTrees: pick(look.big), bushes: pick(look.bushes),
      flowers: pick(look.flowers), tufts: look.tufts.length ? pick(look.tufts) : pick(look.flowers),
      flowerRate: look.flowerRate || .11
    };
  }

  // 같은 화면 크기면 늘 같은 마당이 되도록 정해진 씨앗으로 뽑는 난수.
  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value + 0x6D2B79F5) >>> 0;
      let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 흙밭 하나(타일 칸 단위 사각형). 마당 가운데 왼쪽쯤, 걷는 칸 안에 둔다.
  function dirtPatch(layout, size = 'normal') {
    const columns = Math.ceil(layout.width / layout.tile);
    const walkTopRow = Math.ceil(layout.walk.top / layout.tile);
    const walkBottomRow = Math.floor(layout.walk.bottom / layout.tile);
    const big = size === 'big';
    const rows = Math.max(2, Math.min(big ? 6 : 3, walkBottomRow - walkTopRow - 1));
    const width = Math.max(3, Math.min(big ? 9 : 5, Math.round(columns * (big ? .6 : .3))));
    const column = Math.max(1, Math.round(columns * .16));
    const row = walkTopRow + Math.max(0, Math.round((walkBottomRow - walkTopRow - rows) * .55));
    return { column, row, width, rows };
  }

  function drawGround(canvas, images, layout, devicePixelRatio, themeId = 'meadow') {
    const PIECES = piecesFor(themeId);
    const ratio = Math.max(1, Math.min(3, devicePixelRatio || 1));
    // 원본 1픽셀을 기기 픽셀 정수 개로 그린다. 기기 배율이 정수(대부분)면 CSS 배율도 정확히 scale 배다.
    const unit = Math.max(1, Math.round(layout.scale * ratio));
    const pixelWidth = Math.round(layout.width * ratio);
    const pixelHeight = Math.round(layout.height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.setTransform(1, 0, 0, 1, 0, 0);
    const deviceTile = SOURCE_TILE * unit;
    const toDevice = cssPixels => Math.round(cssPixels * ratio);
    const draw = (sheet, sx, sy, sw, sh, dx, dy) => {
      const image = images[sheet];
      if (!image) return;
      context.drawImage(image, sx, sy, sw, sh, dx, dy, sw * unit, sh * unit);
    };
    const random = seededRandom(Math.round(layout.width) * 7919 + Math.round(layout.height));
    const columns = Math.ceil(pixelWidth / deviceTile) + 1;
    const rows = Math.ceil(pixelHeight / deviceTile) + 1;

    // 1) 풀밭: 대부분 민 풀, 가끔 풀 무늬
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const marked = random() < (PIECES.markRate ?? .22);
        const [sheet, sx, sy] = marked ? PIECES.grassMarks[Math.floor(random() * PIECES.grassMarks.length)] : PIECES.grass;
        draw(sheet, sx, sy, 16, 16, column * deviceTile, row * deviceTile);
      }
    }

    // 2) 흙밭(9칸 이어 붙이기)
    const patch = dirtPatch(layout, PIECES.patchSize);
    for (let row = 0; row < patch.rows; row++) {
      for (let column = 0; column < patch.width; column++) {
        const vertical = row === 0 ? 'top' : row === patch.rows - 1 ? 'bottom' : 'middle';
        const horizontal = column === 0 ? 'left' : column === patch.width - 1 ? 'right' : 'middle';
        // patchFill: 가장자리 칸이 바닥색과 안 맞는 웅덩이(바다)는 가운데 칸만 채운다.
        const [sx, sy] = PIECES.patchFill ? PIECES.dirt.middle.middle : PIECES.dirt[vertical][horizontal];
        draw('floor', sx, sy, 16, 16, (patch.column + column) * deviceTile, (patch.row + row) * deviceTile);
      }
    }
    if (PIECES.dirtDetails.length && patch.width > 2 && patch.rows > 2) {
      const [sx, sy] = PIECES.dirtDetails[Math.floor(random() * PIECES.dirtDetails.length)];
      draw('floor', sx, sy, 16, 16, (patch.column + 1) * deviceTile, (patch.row + 1) * deviceTile);
    }
    const onPatch = (column, row) => column >= patch.column - 1 && column <= patch.column + patch.width && row >= patch.row - 1 && row <= patch.row + patch.rows;

    // 3) 꽃·풀 포기(걷는 칸 안 흩뿌리기, 흙밭 둘레는 비운다)
    const walkTopRow = Math.ceil(layout.walk.top / layout.tile);
    for (let row = walkTopRow; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (onPatch(column, row) || random() > (PIECES.flowerRate || .11)) continue;
        const pool = random() < .6 ? PIECES.flowers : PIECES.tufts;
        const [sheet, sx, sy, sw, sh] = pool[Math.floor(random() * pool.length)];
        const nudgeX = Math.floor(random() * 5) - 2;
        const nudgeY = Math.floor(random() * 5) - 2;
        draw(sheet, sx, sy, sw, sh, column * deviceTile + nudgeX * unit, row * deviceTile + nudgeY * unit);
      }
    }

    // 4) 양옆 덤불(화면 가장자리에 반쯤 걸친다)
    const sideStep = Math.round(deviceTile * 1.3);
    for (let y = toDevice(layout.fenceY + layout.tile * .6); y < pixelHeight; y += sideStep) {
      for (const side of [0, 1]) {
        const [sheet, sx, sy, sw, sh] = PIECES.bushes[Math.floor(random() * PIECES.bushes.length)];
        const x = side === 0 ? -Math.round(deviceTile * .35) : pixelWidth - Math.round(deviceTile * .65);
        draw(sheet, sx, sy, sw, sh, x, y);
      }
    }

    // 5) 위쪽 숲: 뒷줄·앞줄 나무를 엇갈려 세운다. 나무 밑동이 울타리 바로 뒤에 온다.
    const fenceTop = toDevice(layout.fenceY);
    const treeWidth = Math.max(...PIECES.trees.map(piece => piece[3])) * unit;
    const treeStep = Math.round(treeWidth * .82);
    for (const [rowIndex, offsetY] of [[0, -Math.round(deviceTile * 1.05)], [1, -Math.round(deviceTile * .35)]]) {
      const shift = rowIndex === 0 ? Math.round(treeStep / 2) : 0;
      for (let x = -treeWidth + shift; x < pixelWidth + treeWidth; x += treeStep) {
        const [sheet, sx, sy, sw, sh] = PIECES.trees[Math.floor(random() * PIECES.trees.length)];
        draw(sheet, sx, sy, sw, sh, x, fenceTop + offsetY - sh * unit + deviceTile);
      }
    }

    // 6) 울타리 한 줄
    const [fenceSheet, fx, fy, fw, fh] = PIECES.fence;
    for (let x = 0; x < pixelWidth; x += deviceTile) draw(fenceSheet, fx, fy, fw, fh, x, fenceTop);

    // 7) 아래 두 모서리에 큰 꽃나무(반쯤 화면 밖)
    const [bigSheet, bx, by, bw, bh] = PIECES.bigTrees[0];
    const [bigSheet2, bx2, by2, bw2, bh2] = PIECES.bigTrees[1];
    draw(bigSheet, bx, by, bw, bh, -Math.round(bw * unit * .55), pixelHeight - Math.round(bh * unit * .55));
    draw(bigSheet2, bx2, by2, bw2, bh2, pixelWidth - Math.round(bw2 * unit * .45), pixelHeight - Math.round(bh2 * unit * .55));
    return { unit, patch };
  }

  // ---------- 화면 ----------

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function mount(container, options = {}) {
    const document = container.ownerDocument;
    const browser = document.defaultView || global;
    const storage = options.storage || global.GameStorage;
    const cry = options.cry || (() => {});
    const sound = options.sound || (() => {});
    const showModal = options.showModal;
    const closeModal = options.closeModal || (() => {});
    const pokemonList = global.POKEMON || [];
    const sprites = global.FIELD_SPRITES || {};
    const companionView = global.CompanionView;
    const themeId = theme(options.theme).id;
    const themeName = theme(themeId).name;
    const motionQuery = browser.matchMedia?.('(prefers-reduced-motion: reduce)');
    const random = Math.random;
    let reduced = Boolean(motionQuery?.matches);
    let destroyed = false;
    let frameRequest = 0;
    let lastTime = 0;
    let layout = null;
    let layoutKey = '';
    let lastLine = '';
    let lineTimer = 0;
    let feeding = false;
    const berries = [];
    const timers = new Set();
    const actors = [];
    const imageCache = new Map();
    const groundImages = {};
    const cleanups = [];

    const root = document.createElement('section');
    root.className = 'yard-screen yard-screen--' + themeId;
    root.dataset.yardTheme = themeId;
    root.setAttribute('aria-label', themeName);
    root.innerHTML = `<canvas class="yard-ground" aria-hidden="true"></canvas>
<div class="yard-decor" aria-hidden="true"></div>
<div class="yard-field"></div>
<div class="yard-clouds" aria-hidden="true"><i></i><i></i></div>
<span class="yard-safe" aria-hidden="true"></span>
<p class="yard-line" role="status" aria-live="polite"></p>
<div class="yard-empty" hidden></div>
<button class="corner-button yard-feed-button" type="button" data-yard-action="feed" aria-label="먹이 주기" aria-pressed="false"><img src="${escapeHtml(global.PokemonAssets?.berry?.() || '')}" alt="" draggable="false"></button>
<button class="corner-button yard-party-button" type="button" data-yard-action="party" aria-label="마당 친구 고르기"><span class="ui-icon icon-partner" aria-hidden="true"></span></button>`;
    container.replaceChildren(root);
    const canvas = root.querySelector('.yard-ground');
    const decor = root.querySelector('.yard-decor');
    const fieldLayer = root.querySelector('.yard-field');
    const lineElement = root.querySelector('.yard-line');
    const emptyElement = root.querySelector('.yard-empty');
    const partyButton = root.querySelector('.yard-party-button');
    const feedButton = root.querySelector('.yard-feed-button');
    const safeProbe = root.querySelector('.yard-safe');

    function listen(target, event, handler, listenerOptions) {
      target.addEventListener(event, handler, listenerOptions);
      cleanups.push(() => target.removeEventListener(event, handler, listenerOptions));
    }
    function later(callback, delay) {
      const timer = browser.setTimeout(() => {
        timers.delete(timer);
        if (!destroyed) callback();
      }, delay);
      timers.add(timer);
      return timer;
    }
    // 매 프레임 같은 값을 다시 쓰지 않는다(서 있는 포켓몬은 스타일 계산을 건너뛴다).
    const writtenStyles = new WeakMap();
    function setStyle(element, property, value) {
      let written = writtenStyles.get(element);
      if (!written) writtenStyles.set(element, written = {});
      if (written[property] === value) return;
      written[property] = value;
      element.style[property] = value;
    }
    function pokemonName(id) { return pokemonList.find(pokemon => pokemon.id === id)?.name || '포켓몬'; }
    function currentIds() { return yardIds(storage?.state, themeId); }
    function caughtIds() { return Array.isArray(storage?.state?.caught) ? storage.state.caught : []; }

    function loadImage(source) {
      if (!imageCache.has(source)) {
        const record = { image: new browser.Image(), failed: false, ready: false };
        record.image.crossOrigin = 'anonymous';
        record.image.onload = () => { record.ready = true; };
        record.image.onerror = () => { record.failed = true; };
        record.image.src = source;
        imageCache.set(source, record);
      }
      return imageCache.get(source);
    }

    function say(kind, text) {
      const line = text || pickLine(kind, lastLine, random);
      if (!line) return;
      lastLine = line;
      lineElement.textContent = line;
      // 도트 말풍선 판(9칸 늘이기)이 반 픽셀에 걸리면 이음매가 비쳐 보여, 너비(짝수라 가운데 꼬리 자리도 정수)·높이·
      // 왼쪽 자리를 정수 px 로 고정한다.
      lineElement.style.width = '';
      lineElement.style.height = '';
      const box = browser.getComputedStyle(lineElement);
      const natural = Math.ceil(parseFloat(box.width));
      const width = natural + natural % 2;
      lineElement.style.height = Math.ceil(parseFloat(box.height)) + 'px';
      lineElement.style.width = width + 'px';
      lineElement.style.left = Math.floor((root.clientWidth - width) / 2) + 'px';
      lineElement.classList.remove('visible');
      void lineElement.offsetWidth;
      lineElement.classList.add('visible');
      browser.clearTimeout(lineTimer);
      lineTimer = browser.setTimeout(() => lineElement.classList.remove('visible'), 2600);
    }

    // ---- 크기 맞추기 ----
    function readSafeArea() {
      const box = safeProbe.getBoundingClientRect();
      const width = browser.innerWidth;
      const height = browser.innerHeight;
      return { top: Math.max(0, box.top), left: Math.max(0, box.left), right: Math.max(0, width - box.right), bottom: Math.max(0, height - box.bottom) };
    }
    function relayout() {
      const width = root.clientWidth || browser.innerWidth;
      const height = root.clientHeight || browser.innerHeight;
      const safe = readSafeArea();
      const key = [width, height, safe.top, safe.right, safe.bottom, safe.left, browser.devicePixelRatio].join(':');
      if (key === layoutKey) return false;
      const previous = layout;
      layoutKey = key;
      layout = yardLayout(width, height, safe);
      root.style.setProperty('--yard-scale', String(layout.scale));
      root.style.setProperty('--yard-tile', layout.tile + 'px');
      paintGround();
      placeDecor();
      for (const actor of actors) {
        if (previous) {
          // 화면이 바뀌면 같은 비율 자리로 옮긴다.
          const ratioX = (actor.x - previous.walk.left) / Math.max(1, previous.walk.right - previous.walk.left);
          const ratioY = (actor.y - previous.walk.top) / Math.max(1, previous.walk.bottom - previous.walk.top);
          actor.x = layout.walk.left + ratioX * (layout.walk.right - layout.walk.left);
          actor.y = layout.walk.top + ratioY * (layout.walk.bottom - layout.walk.top);
        }
        Object.assign(actor, clampPoint(actor, layout.walk));
        actor.target = actor.target ? clampPoint(actor.target, layout.walk) : null;
        actor.scale = 0;
      }
      for (const berry of berries) {
        if (previous) {
          const ratioX = (berry.x - previous.walk.left) / Math.max(1, previous.walk.right - previous.walk.left);
          const ratioY = (berry.y - previous.walk.top) / Math.max(1, previous.walk.bottom - previous.walk.top);
          berry.x = layout.walk.left + ratioX * (layout.walk.right - layout.walk.left);
          berry.y = layout.walk.top + ratioY * (layout.walk.bottom - layout.walk.top);
        }
        Object.assign(berry, clampPoint(berry, layout.walk));
        placeBerry(berry);
        if (berry.eater) berry.eater.target = { x: berry.x, y: berry.y };
      }
      return true;
    }
    function paintGround() {
      if (!layout || Object.keys(TILE_IMAGES).some(name => !groundImages[name])) return;
      drawGround(canvas, groundImages, layout, browser.devicePixelRatio, themeId);
    }
    // 바람에 흔들리는 데이지·풀, 날아가는 나뭇잎. 자리는 바닥과 같은 씨앗으로 정한다.
    function placeDecor() {
      decor.replaceChildren();
      const particles = particlesFor(themeId);
      for (const prop of propsFor(themeId, layout)) {
        const piece = document.createElement('i');
        piece.className = 'yard-prop';
        piece.style.backgroundImage = `url('${propSheet(themeId)}')`;
        piece.style.setProperty('--prop-index', String(prop.index));
        piece.style.translate = `${prop.x}px ${prop.y}px`;
        decor.append(piece);
      }
      if (particles === 'snow' || particles === 'stars') {
        // 내리는 눈송이·반짝이는 별(CSS yard-snowfall·yard-twinkle). 움직임 줄이기면 css 가 숨긴다.
        const flakeRandom = seededRandom(Math.round(layout.width) * 13 + Math.round(layout.height));
        for (let index = 0; index < 24; index++) {
          const flake = document.createElement('i');
          flake.className = (particles === 'snow' ? 'yard-snowflake' : 'yard-star') + (index % 3 === 0 ? ' big' : '');
          flake.style.left = (flakeRandom() * 100).toFixed(1) + '%';
          if (particles === 'stars') flake.style.top = (flakeRandom() * 100).toFixed(1) + '%';
          flake.style.animationDuration = (7 + flakeRandom() * 6).toFixed(1) + 's, ' + (2.5 + flakeRandom() * 2).toFixed(1) + 's';
          flake.style.animationDelay = `${-(flakeRandom() * 12).toFixed(1)}s, ${-(flakeRandom() * 3).toFixed(1)}s`;
          decor.append(flake);
        }
        return;
      }
      if (particles === 'none') return;
      if (particles === 'petals' || particles === 'leaves') {
        const area = layout.walk;
        for (let index = 0; index < 5; index++) {
          const leaf = document.createElement('i');
          leaf.className = 'yard-leaf' + (particles === 'petals' ? ' pink' : '');
          leaf.style.top = Math.round(area.top + (index + .5) / 5 * (area.bottom - area.top) - layout.tile) + 'px';
          leaf.style.animationDelay = `${-(index * 3.1).toFixed(1)}s, 0s`;
          decor.append(leaf);
        }
        return;
      }
      const pickRandom = seededRandom(Math.round(layout.width) * 31 + Math.round(layout.height) * 17);
      const area = layout.walk;
      const count = Math.max(3, Math.min(8, Math.round((area.right - area.left) * (area.bottom - area.top) / (layout.tile * layout.tile * 6))));
      for (let index = 0; index < count; index++) {
        const piece = document.createElement('i');
        piece.className = index % 2 === 0 ? 'yard-daisy' : 'yard-tuft';
        const x = Math.round(area.left - layout.tile * .5 + pickRandom() * (area.right - area.left));
        const y = Math.round(area.top + pickRandom() * (area.bottom - area.top) - layout.tile);
        piece.style.translate = `${x}px ${y}px`;
        piece.style.animationDelay = `${-(pickRandom() * 3).toFixed(2)}s`;
        decor.append(piece);
      }
      for (let index = 0; index < 3; index++) {
        const leaf = document.createElement('i');
        leaf.className = 'yard-leaf' + (index === 1 ? ' pink' : '');
        leaf.style.top = Math.round(area.top + (index + .5) / 3 * (area.bottom - area.top) - layout.tile) + 'px';
        leaf.style.animationDelay = `${-(index * 4.3).toFixed(1)}s, 0s`;
        decor.append(leaf);
      }
    }

    // ---- 포켓몬 ----
    // order: 처음 들어올 때 하나씩 차례로 튀어나오게 하는 순번(나중에 더한 포켓몬은 0).
    function createActor(id, order) {
      const shadow = document.createElement('span');
      shadow.className = 'yard-shadow';
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'yard-pokemon';
      node.dataset.yardId = String(id);
      node.setAttribute('aria-label', pokemonName(id));
      const sprite = document.createElement('span');
      sprite.className = 'yard-sprite';
      node.append(sprite);
      fieldLayer.append(shadow, node);
      const spot = freeSpot(layout.walk, actors, random, 12);
      const data = sprites[id];
      const actor = {
        id, x: spot.x, y: spot.y, target: null, mode: 'idle', wait: .6 + random() * 2.5,
        dir: 'front', clock: random() * 3, boost: 1, node, sprite, shadow, data,
        scale: 0, frameKey: '', fallback: !data || !companionView, leaving: false
      };
      if (data) {
        loadImage(global.PokemonAssets.sprite(data.walk) || '');
        loadImage(global.PokemonAssets.sprite(data.idle) || '');
      }
      if (!reduced) {
        // 등장 톡: css/yard.css yard-pop 1.24초, 한 마리씩 0.32초 간격(2026-11-13 「2배 느리게」).
        for (const element of [sprite, shadow]) {
          element.classList.add('is-popping');
          element.style.animationDelay = (order * .32).toFixed(2) + 's';
        }
        later(() => {
          for (const element of [sprite, shadow]) {
            element.classList.remove('is-popping');
            element.style.animationDelay = '';
          }
        }, 1400 + order * 320);
      }
      actors.push(actor);
      return actor;
    }
    function removeActor(actor) {
      if (actor.leaving) return;
      actor.leaving = true;
      releaseBerry(actor);
      const finish = () => {
        actor.node.remove();
        actor.shadow.remove();
        const index = actors.indexOf(actor);
        if (index >= 0) actors.splice(index, 1);
      };
      if (reduced) { finish(); return; }
      actor.sprite.classList.add('is-leaving');
      actor.shadow.classList.add('is-leaving');
      later(finish, 360);
    }
    // 저장된 마당 목록과 화면의 포켓몬을 맞춘다(고르기·다른 기기 저장·새로고침 모두 이 길로 온다).
    function reconcile(entering = false) {
      if (!layout) return;
      const ids = currentIds();
      for (const actor of [...actors]) if (!ids.includes(actor.id)) removeActor(actor);
      let order = 0;
      for (const id of ids) {
        if (actors.some(actor => actor.id === id && !actor.leaving)) continue;
        createActor(id, entering ? order : 0);
        order++;
      }
      updateEmpty(ids);
      draw();
    }
    function updateEmpty(ids) {
      const caught = caughtIds();
      if (!caught.length) {
        emptyElement.hidden = false;
        emptyElement.innerHTML = '<p>포켓몬을 잡아서 데려오자!</p><button class="button" type="button" data-action="regions">모험 가기</button>';
        partyButton.hidden = true;
        feedButton.hidden = true;
        return;
      }
      emptyElement.hidden = true;
      emptyElement.replaceChildren();
      partyButton.hidden = false;
      feedButton.hidden = !ids.length;
      if (!ids.length && feeding) setFeeding(false, true);
      partyButton.classList.toggle('is-calling', ids.length === 0);
    }

    // 픽셀 시트의 지금 프레임을 그린다. 시트가 없거나 못 읽으면 3D 앞모습을 작게 대신 보여 준다.
    function drawActor(actor) {
      const moving = actor.mode === 'walk' && !reduced;
      const frame = !actor.fallback ? companionView.animationFor(actor.data, actor.dir, moving, actor.clock, reduced) : null;
      const record = frame ? loadImage(frame.src) : null;
      if (record?.failed) actor.fallback = true;
      const ready = frame && record?.ready && record.image.naturalWidth === frame.width * frame.columns && record.image.naturalHeight === frame.height * frame.rows;
      if (frame && record?.ready && !ready) actor.fallback = true;
      const node = actor.node;
      const sprite = actor.sprite;
      if (ready) {
        if (!actor.scale) {
          const size = global.GameRules?.bodySize?.(actor.id) ?? 1;
          actor.scale = pixelScale(spriteExtent(actor.data), layout.pokemonSize * YARD_FULL_SIZE * size, Math.max(1, Math.round(browser.devicePixelRatio || 1)));
        }
        const scale = actor.scale;
        const width = frame.width * scale;
        const height = frame.height * scale;
        const sheetKey = frame.src + ':' + scale;
        if (actor.frameKey !== sheetKey) {
          actor.frameKey = sheetKey;
          node.classList.remove('is-fallback');
          node.style.width = width + 'px';
          node.style.height = height + 'px';
          sprite.style.backgroundImage = `url("${frame.src}")`;
          sprite.style.backgroundSize = `${width * frame.columns}px ${height * frame.rows}px`;
        }
        setStyle(sprite, 'backgroundPosition', `${-frame.column * width}px ${-frame.row * height}px`);
        const anchorX = actor.id === 25 && frame.body ? frame.body[0] : frame.ground[0];
        const left = Math.round(actor.x - anchorX * scale);
        const top = Math.round(actor.y - frame.ground[1] * scale);
        setStyle(node, 'transform', `translate(${left}px, ${top}px)`);
        const [boundsX, boundsY, boundsWidth, boundsHeight] = frame.bounds;
        actor.visible = { left: left + boundsX * scale, top: top + boundsY * scale, right: left + (boundsX + boundsWidth) * scale, bottom: top + (boundsY + boundsHeight) * scale };
        const shadowWidth = Math.round(Math.max(24, frame.bounds[2] * scale * .8));
        setStyle(actor.shadow, 'width', shadowWidth + 'px');
        setStyle(actor.shadow, 'transform', `translate(${Math.round(actor.x - shadowWidth / 2)}px, ${Math.round(actor.y - 5)}px)`);
        if (node.dataset.spriteKind !== 'pixel') node.dataset.spriteKind = 'pixel';
        if (node.dataset.direction !== actor.dir) node.dataset.direction = actor.dir;
      } else if (actor.fallback) {
        const size = Math.round(layout.pokemonSize * 1.05);
        const sheetKey = 'model:' + size;
        if (actor.frameKey !== sheetKey) {
          actor.frameKey = sheetKey;
          node.classList.add('is-fallback');
          node.style.width = size + 'px';
          node.style.height = size + 'px';
          sprite.style.backgroundImage = `url("${global.PokemonAssets.image(actor.id)}")`;
          sprite.style.backgroundSize = 'contain';
          sprite.style.backgroundPosition = 'center bottom';
        }
        setStyle(sprite, 'scale', actor.dir === 'right' ? '-1 1' : '');
        setStyle(node, 'transform', `translate(${Math.round(actor.x - size / 2)}px, ${Math.round(actor.y - size)}px)`);
        actor.visible = { left: actor.x - size / 2, top: actor.y - size, right: actor.x + size / 2, bottom: actor.y };
        setStyle(actor.shadow, 'width', Math.round(size * .6) + 'px');
        setStyle(actor.shadow, 'transform', `translate(${Math.round(actor.x - size * .3)}px, ${Math.round(actor.y - 5)}px)`);
        if (node.dataset.spriteKind !== 'fallback') node.dataset.spriteKind = 'fallback';
        if (node.dataset.direction !== actor.dir) node.dataset.direction = actor.dir;
      } else {
        setStyle(node, 'transform', `translate(${Math.round(actor.x)}px, ${Math.round(actor.y)}px)`);
      }
      // 앞뒤 순서는 발밑 y. 말풍선을 띄운 포켓몬은 잠깐 맨 앞으로.
      setStyle(node, 'zIndex', String(10 + Math.round(actor.y) + (actor.talking ? 4000 : 0)));
    }
    function draw() {
      if (!layout) return;
      for (const actor of actors) drawActor(actor);
    }

    function showEmote(actor, name) {
      actor.node.querySelector('.yard-emote')?.remove();
      const emote = document.createElement('img');
      emote.className = 'yard-emote';
      emote.alt = '';
      emote.src = `img/yard/emote-${name}.png`;
      actor.node.append(emote);
      later(() => emote.remove(), 1300);
    }
    function showName(actor) {
      actor.node.querySelector('.yard-name')?.remove();
      const bubble = document.createElement('span');
      bubble.className = 'yard-name';
      bubble.textContent = pokemonName(actor.id);
      actor.node.append(bubble);
      actor.talking = true;
      later(() => {
        bubble.remove();
        actor.talking = false;
      }, 1700);
    }
    function hop(actor) {
      if (reduced) return;
      actor.sprite.classList.remove('is-hopping');
      void actor.sprite.offsetWidth;
      actor.sprite.classList.add('is-hopping');
      later(() => actor.sprite.classList.remove('is-hopping'), 520);
    }
    function pet(actor) {
      actor.mode = 'idle';
      actor.wait = 1.6 + random();
      actor.target = null;
      actor.boost = 1;
      actor.dir = 'front';
      hop(actor);
      cry(actor.id);
      showEmote(actor, ['heart', 'happy', 'star'][Math.floor(random() * 3)]);
      showName(actor);
      say('pet');
      draw();
    }
    // ---- 먹이 주기 ----
    function placeBerry(berry) {
      berry.node.style.left = Math.round(berry.x) + 'px';
      berry.node.style.top = Math.round(berry.y) + 'px';
      berry.node.style.zIndex = String(9 + Math.round(berry.y));
    }
    function setFeeding(on, quiet = false) {
      feeding = on;
      root.classList.toggle('is-feeding', on);
      feedButton.setAttribute('aria-pressed', String(on));
      if (!quiet) say(on ? 'feedOn' : 'feedOff');
    }
    function releaseBerry(actor) {
      const berry = berries.find(item => item.eater === actor);
      if (berry) berry.eater = null;
      actor.berry = null;
      assignBerries();
    }
    // 먹이마다 가장 가까운 한가한 포켓몬이 달려간다.
    function assignBerries() {
      for (const berry of berries) {
        if (berry.eater) continue;
        let best = null;
        let bestDistance = Infinity;
        for (const actor of actors) {
          if (actor.leaving || actor.berry) continue;
          const distance = Math.hypot(actor.x - berry.x, actor.y - berry.y);
          if (distance < bestDistance) { best = actor; bestDistance = distance; }
        }
        if (!best) return;
        berry.eater = best;
        best.berry = berry;
        showEmote(best, 'exclaim');
        if (reduced) continue;
        best.target = { x: berry.x, y: berry.y };
        best.mode = 'walk';
        best.boost = 2.2;
      }
    }
    function dropBerry(point) {
      if (berries.length >= BERRY_LIMIT) { say('feedFull'); return; }
      const spot = clampPoint(point, layout.walk);
      const node = document.createElement('img');
      node.className = 'yard-berry';
      node.alt = '';
      node.draggable = false;
      node.src = global.PokemonAssets?.berry?.() || '';
      fieldLayer.append(node);
      const berry = { x: spot.x, y: spot.y, node, eater: null };
      berries.push(berry);
      placeBerry(berry);
      sound('tap');
      assignBerries();
      // 움직임을 줄인 설정에서는 걷지 않으므로 바로 먹는다.
      if (reduced && berry.eater) eat(berry.eater);
    }
    function eat(actor) {
      const berry = actor.berry;
      if (!berry) return;
      berry.node.remove();
      const index = berries.indexOf(berry);
      if (index >= 0) berries.splice(index, 1);
      actor.berry = null;
      actor.mode = 'idle';
      actor.wait = 1.6 + random();
      actor.target = null;
      actor.boost = 1;
      actor.dir = 'front';
      hop(actor);
      cry(actor.id);
      showEmote(actor, 'heart');
      showName(actor);
      say('eat');
      assignBerries();
      draw();
    }
    function callTo(point) {
      const walking = actors.filter(actor => !actor.leaving);
      if (!walking.length) return;
      const spacing = layout.tile * .9;
      const picked = gatherTargets(clampPoint(point, layout.walk), walking, Math.min(3, walking.length), spacing, layout.walk);
      for (const { actor, target } of picked) {
        showEmote(actor, 'exclaim');
        if (reduced) continue;
        actor.target = target;
        actor.mode = 'walk';
        actor.boost = 2.2;
      }
      global.AdventureMotion?.ripple?.(point.x, point.y, root);
      say('call');
    }

    // ---- 고르기 창 ----
    function pickerTitle(count) {
      return `<h2 id="modal-title" class="yard-picker-title" aria-label="마당 친구 ${count}마리, ${LIMIT}마리까지"><img src="img/art/balls/ball-red-small.png" alt=""><span class="yard-count${count >= LIMIT ? ' full' : ''}">${count} / ${LIMIT}</span></h2>`;
    }
    function openPicker() {
      if (typeof showModal !== 'function') return;
      const ids = currentIds();
      const caughtSet = new Set(caughtIds());
      const caught = pokemonList.filter(pokemon => caughtSet.has(pokemon.id));
      const choices = caught.map(pokemon => {
        const inYard = ids.includes(pokemon.id);
        return `<button type="button" class="yard-choice${inYard ? ' active' : ''}" data-yard-pick="${pokemon.id}" aria-pressed="${inYard}" aria-label="${escapeHtml(pokemon.name)}"><img src="${global.PokemonAssets.image(pokemon.id, 'thumb')}" alt="" loading="lazy"><span class="yard-choice-mark" aria-hidden="true"></span></button>`;
      }).join('');
      showModal(pickerTitle(ids.length), `<div class="yard-picker-tools"><button type="button" class="button secondary small yard-clear" data-yard-action="clear"><span class="ui-icon icon-eraser" aria-hidden="true"></span>모두 빼기</button></div><div class="yard-picker">${choices}</div>`, 'modal--wide yard-picker-modal');
      updatePicker();
    }
    function updatePicker() {
      const picker = document.querySelector('.yard-picker');
      if (!picker) return;
      const ids = currentIds();
      const full = ids.length >= LIMIT;
      // 「모두 빼기」는 마당에 한 마리라도 있을 때만 누를 수 있다.
      const clear = document.querySelector('.yard-picker-tools [data-yard-action="clear"]');
      if (clear) clear.disabled = ids.length === 0;
      for (const choice of picker.querySelectorAll('[data-yard-pick]')) {
        const inYard = ids.includes(Number(choice.dataset.yardPick));
        choice.classList.toggle('active', inYard);
        choice.setAttribute('aria-pressed', String(inYard));
        choice.classList.toggle('locked', full && !inYard);
        if (full && !inYard) choice.setAttribute('aria-disabled', 'true');
        else choice.removeAttribute('aria-disabled');
      }
      const title = document.querySelector('.yard-picker-title');
      if (title) {
        title.setAttribute('aria-label', `마당 친구 ${ids.length}마리, ${LIMIT}마리까지`);
        const count = title.querySelector('.yard-count');
        count.textContent = `${ids.length} / ${LIMIT}`;
        count.classList.toggle('full', full);
      }
    }
    function pick(id, choice) {
      const change = toggleYard(currentIds(), id, caughtIds());
      if (change.result === 'invalid') return;
      if (change.result === 'full') {
        say('full');
        sound('wrong');
        const count = document.querySelector('.yard-count');
        for (const element of [count, choice]) {
          if (!element || reduced) continue;
          element.classList.remove('is-shaking');
          void element.offsetWidth;
          element.classList.add('is-shaking');
        }
        return;
      }
      storage.update(yardPatch(storage.state, themeId, change.ids), true);
      if (change.result === 'added') { cry(id); say('add'); }
      else say(change.ids.length ? 'remove' : 'empty');
    }
    // 「모두 빼기」(2026-11-14 사용자 「마당에 새로 포켓몬 풀어둘때 전체 체크 해제하는 기능」): 마당을 한 번에 비우고 새로 고르게 한다.
    // 고른 적 없는 처음 마당(잡은 포켓몬 10마리 기본값)도 빈 마당으로 저장한다.
    function clearYard() {
      if (!currentIds().length) return;
      storage.update(yardPatch(storage.state, themeId, []), true);
      updatePicker();
      say('empty');
    }

    // ---- 입력 ----
    listen(root, 'pointerdown', event => {
      if (event.button > 0 || !layout) return;
      if (event.target.closest('button, a, .yard-empty')) return;
      const box = root.getBoundingClientRect();
      const point = { x: event.clientX - box.left, y: event.clientY - box.top };
      if (feeding) dropBerry(point);
      else callTo(point);
    });
    listen(root, 'click', event => {
      const pokemonButton = event.target.closest('[data-yard-id]');
      if (pokemonButton) {
        const actor = actors.find(item => item.id === Number(pokemonButton.dataset.yardId) && !item.leaving);
        if (actor) pet(actor);
        return;
      }
      if (event.target.closest('[data-yard-action="feed"]')) { setFeeding(!feeding); return; }
      if (event.target.closest('[data-yard-action="party"]')) openPicker();
    });
    // 고르기 창은 공통 창(#modal-root) 안에 열리므로 문서에서 받는다.
    listen(document, 'click', event => {
      if (event.target.closest('.yard-picker-tools [data-yard-action="clear"]')) { clearYard(); return; }
      const choice = event.target.closest('[data-yard-pick]');
      if (choice) pick(Number(choice.dataset.yardPick), choice);
    });
    listen(browser, 'savechange', () => {
      if (destroyed) return;
      reconcile(false);
      updatePicker();
    });
    listen(browser, 'resize', () => { if (relayout()) draw(); });
    listen(document, 'visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });
    const onMotionChange = () => {
      reduced = Boolean(motionQuery?.matches);
      for (const actor of actors) if (reduced) { actor.mode = 'idle'; actor.target = null; }
      draw();
    };
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener('change', onMotionChange);
      cleanups.push(() => motionQuery.removeEventListener('change', onMotionChange));
    }

    // ---- 한 개의 움직임 루프 ----
    function frame(time) {
      frameRequest = 0;
      if (destroyed) return;
      if (!root.isConnected) { destroy(); return; }
      const dt = lastTime ? Math.min(.05, Math.max(0, (time - lastTime) / 1000)) : 0;
      lastTime = time;
      if (!reduced && layout) {
        const speed = layout.tile * .85;
        const radius = layout.pokemonSize * .7;
        for (const actor of actors) {
          if (actor.leaving) continue;
          // 쓰다듬기·부르기로 멈췄어도 먹이가 있으면 다시 그쪽으로 간다.
          if (actor.berry && (actor.mode === 'idle' || !actor.target)) { actor.target = { x: actor.berry.x, y: actor.berry.y }; actor.mode = 'walk'; actor.boost = 2.2; }
          const event = stepActor(actor, actors, dt, layout.walk, random, { speed, radius });
          if (actor.berry && (event === 'arrived' || Math.hypot(actor.x - actor.berry.x, actor.y - actor.berry.y) < layout.pokemonSize * .35)) { eat(actor); continue; }
          if (event === 'arrived') { hop(actor); showEmote(actor, 'heart'); }
          else if (event === 'look' && random() < .03) showEmote(actor, 'question');
        }
      }
      draw();
      frameRequest = browser.requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || frameRequest || document.hidden) return;
      lastTime = 0;
      frameRequest = browser.requestAnimationFrame(frame);
    }
    function stop() {
      if (frameRequest) browser.cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (current === session) current = null;
      stop();
      browser.clearTimeout(lineTimer);
      for (const timer of timers) browser.clearTimeout(timer);
      timers.clear();
      cleanups.splice(0).forEach(cleanup => cleanup());
    }

    // ---- 시작 ----
    relayout();
    let loaded = 0;
    for (const [name, source] of Object.entries(TILE_IMAGES)) {
      const image = new browser.Image();
      image.onload = () => {
        groundImages[name] = image;
        loaded++;
        if (loaded === Object.keys(TILE_IMAGES).length && !destroyed) paintGround();
      };
      image.src = source;
    }
    reconcile(true);
    if (caughtIds().length) say(currentIds().length ? (themeId === 'snow' ? 'enterSnow' : 'enter') : 'empty', currentIds().length && themeId !== 'meadow' && themeId !== 'snow' ? themeName + '에 왔다!' : '');
    start();

    const session = {
      destroy,
      // 시험용: 지금 마당 상태(걷는 칸, 포켓몬 발밑 위치와 그림이 보이는 상자)
      snapshot: () => ({
        layout,
        actors: actors.filter(actor => !actor.leaving).map(({ id, x, y, mode, dir, fallback, visible }) => ({ id, x, y, mode, dir, fallback, visible }))
      })
    };
    current = session;
    return session;
  }
  let current = null;

  // ---- 마당 고르기 목록(마당에 들어가면 먼저 보인다) ----
  // 3열 타일(2026-11-19 「3*3 으로 마을들 보여주는 뷰」). 첫 화면에 세 줄과 넷째 줄 윗부분이 보여 아래로 더 있음을 알린다.
  // 열린 마을은 실제 바닥 그림(drawGround)과 소품을 작게, 잠긴 마을은 검은 덮개·자물쇠. 열쇠가 있으면 잠긴 마을에 열쇠 표시가 뜨고,
  // 누르면 options.confirmOpen 으로 묻고 연다.
  function mountList(container, options = {}) {
    const document = container.ownerDocument;
    const browser = document.defaultView || global;
    const storage = options.storage || global.GameStorage;
    const root = document.createElement('section');
    root.className = 'yard-list-screen';
    root.setAttribute('aria-label', '마을 고르기');
    container.replaceChildren(root);
    let destroyed = false;
    let lineTimer = 0;
    const images = {};
    let loaded = 0;
    const ready = () => loaded === Object.keys(TILE_IMAGES).length;

    function lockedHint(item, state) {
      const more = nextUnlockIn(state);
      if (item.id === 'snow') return `${more}마리 더 잡으면 열려요`;
      return keysLeft(state) ? '열쇠로 열어요' : '열쇠가 필요해요';
    }
    function render(justOpened = '') {
      const state = storage?.state;
      const keys = keysLeft(state);
      const tiles = THEMES.map((item, index) => {
        const open = themeOpen(item.id, state);
        const count = yardIds(state, item.id).length;
        const canOpen = !open && keys > 0 && CHOOSABLE.includes(item.id);
        const name = `<span class="yard-tile-name">${escapeHtml(item.name)}</span>`;
        const body = open
          ? `<canvas class="yard-tile-art" aria-hidden="true"></canvas>${name}<span class="yard-tile-count">${count} / ${LIMIT}</span>`
          : `<span class="yard-tile-lock" aria-hidden="true"><i class="yard-tile-peek" style="background-image:url('${propSheet(item.id)}')"></i><span class="ui-icon ${canOpen ? 'icon-unlock' : 'icon-lock'}"></span>${canOpen ? '<i class="yard-tile-key yard-key-art"></i>' : ''}</span>${name}<span class="yard-tile-hint">${escapeHtml(lockedHint(item, state))}</span>`;
        const label = open ? `${item.name}, 친구 ${count}마리` : `${item.name}, 잠김. ${lockedHint(item, state)}`;
        const classes = ['yard-tile', open ? '' : 'is-locked', canOpen ? 'can-open' : '', item.id === justOpened ? 'is-opened' : ''].filter(Boolean).join(' ');
        return `<button type="button" class="${classes}" style="--order:${index}" data-yard-theme="${item.id}" aria-label="${escapeHtml(label)}">${body}</button>`;
      }).join('');
      const keyBadge = `<p class="yard-key-count" aria-label="마당 열쇠 ${keys}개"><i class="yard-key-art" aria-hidden="true"></i> ${keys}</p>`;
      root.innerHTML = `<header class="yard-list-head"><h1 class="yard-list-title">어느 마을에 갈까?</h1>${keyBadge}</header><p class="yard-list-line" role="status" aria-live="polite"></p><div class="yard-list">${tiles}</div>`;
      if (ready()) paint();
    }
    function paint() {
      for (const tileCanvas of root.querySelectorAll('.yard-tile-art')) {
        const id = tileCanvas.closest('[data-yard-theme]').dataset.yardTheme;
        // 마당 한쪽을 2배 타일로 크게 그린 뒤 CSS 로 타일 칸에 맞춰 줄인다(울타리·숲·연못이 함께 보이게). 칸 비율은 그대로.
        const ratio = (tileCanvas.clientHeight || 160) / (tileCanvas.clientWidth || 120);
        const layout = yardLayout(240, Math.round(240 * ratio), { top: -TOUCH - 8 });
        drawGround(tileCanvas, images, layout, 1, id);
        const sheet = propImages[id];
        if (sheet?.complete && sheet.naturalWidth) {
          const context = tileCanvas.getContext('2d');
          context.imageSmoothingEnabled = false;
          const size = PROP_SIZE * layout.scale;
          for (const prop of propsFor(id, layout).slice(0, 3)) context.drawImage(sheet, prop.index * PROP_SIZE, 0, PROP_SIZE, PROP_SIZE, Math.round(prop.x - size / 2), Math.round(prop.y - size), size, size);
        }
      }
    }
    function say(text) {
      const line = root.querySelector('.yard-list-line');
      if (!line) return;
      line.textContent = text;
      line.classList.add('visible');
      browser.clearTimeout(lineTimer);
      lineTimer = browser.setTimeout(() => line.classList.remove('visible'), 3200);
      options.read?.(text);
    }
    function shake(tile) {
      tile.classList.remove('is-shaking');
      void tile.offsetWidth;
      tile.classList.add('is-shaking');
    }
    for (const [name, source] of Object.entries(TILE_IMAGES)) {
      const image = new browser.Image();
      image.onload = () => { images[name] = image; loaded++; if (!destroyed && ready()) paint(); };
      image.src = source;
    }
    // 소품 시트는 늦게 와도 그 마을 그림만 다시 그린다.
    const propImages = {};
    for (const item of THEMES) {
      if (!item.props) continue;
      const image = new browser.Image();
      image.onload = () => { if (!destroyed && ready()) paint(); };
      image.src = propSheet(item.id);
      propImages[item.id] = image;
    }
    const onClick = event => {
      const tile = event.target.closest('[data-yard-theme]');
      if (!tile || !root.contains(tile)) return;
      const id = tile.dataset.yardTheme;
      const item = theme(id);
      const state = storage?.state;
      if (themeOpen(id, state)) { options.onPick?.(id); return; }
      if (id === 'snow' || !keysLeft(state)) {
        options.sound?.('wrong');
        shake(tile);
        say(id === 'snow' ? `포켓몬 ${nextUnlockIn(state)}마리 더 잡으면 ${item.name}이 열려!` : `포켓몬 ${nextUnlockIn(state)}마리 더 잡으면 열쇠를 받아!`);
        return;
      }
      const open = () => {
        if (destroyed) return;
        const patch = openTheme(storage.state, id);
        if (!patch) return;
        storage.update(patch, true);
        options.celebrate?.(id);
        render(id);
        say(`${item.name}이 열렸어!`);
      };
      if (options.confirmOpen) options.confirmOpen(id, open); else open();
    };
    root.addEventListener('click', onClick);
    render();
    return { destroy() { destroyed = true; browser.clearTimeout(lineTimer); root.removeEventListener('click', onClick); }, render };
  }
  function themeName(id) { return theme(id).name; }

  global.YardScene = Object.freeze({
    LIMIT, BERRY_LIMIT, THEMES, CHOOSABLE, SNOW_AT, KEY_EVERY, LINES, mount, mountList, themeOpen, yardPatch, keysEarned, keysLeft, openTheme, unlocksBetween, nextUnlockIn, propsFor, propSheet, themeName, current: () => current?.snapshot() || null, yardIds, toggleYard, tileScale, spriteExtent, pixelScale, yardLayout, clampPoint,
    freeSpot, avoidance, directionFor, stepActor, gatherTargets, pickLine, seededRandom, dirtPatch
  });
})(window);
