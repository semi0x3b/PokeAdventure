/* 순수 게임 규칙. 화면과 저장소에 의존하지 않는다. */
(function (root) {
  'use strict';
  const REGIONS = {
    forest: { name: '초록 숲', subtitle: '풀잎 사이로 살랑살랑', types: ['grass', 'bug', 'poison', 'flying', 'fairy'], color: '#a9d77a' },
    city: { name: '반짝 도시', subtitle: '새로운 친구가 기다려요', types: ['normal', 'electric', 'fighting', 'psychic', 'steel', 'ghost'], color: '#a9c5e8' },
    desert: { name: '모래 사막', subtitle: '따뜻한 모래 위를 사뿐', types: ['fire', 'ground', 'rock', 'dragon', 'dark'], color: '#ecd08a' },
    sea: { name: '파랑 바다', subtitle: '시원한 파도를 따라서', types: ['water', 'ice'], color: '#8ed2e5' }
  };
  function generation(all, caught, legendary) {
    const found = new Set(caught);
    const max = Math.max(...all.map(p => p.gen));
    for (let gen = 1; gen <= max; gen++) {
      if (all.some(p => p.gen === gen && (p.tier === 'legend') === legendary && !found.has(p.id))) return gen;
    }
    return max;
  }
  // 등급(2026-11-13 사용자): 일반(처음 모습)·고급(진화해서 나오는 모습, 자료의 evolved)·희귀·전설.
  // 나오는 비율은 일반 60 · 고급 35 · 희귀 4.95 · 전설 0.01. 한 등급을 다 모으면 그 등급은 빼고 남은 등급끼리 비율을 다시 나눈다.
  const GRADE_WEIGHTS = Object.freeze({ basic: 60, advanced: 35, rare: 4.95, legend: 0.01 });
  function grade(pokemon) {
    if (pokemon.tier === 'legend') return 'legend';
    if (pokemon.tier === 'rare') return 'rare';
    return pokemon.evolved ? 'advanced' : 'basic';
  }
  // 포켓몬 그림 크기 배율(0.5~1). 화면마다 「가장 큰 포켓몬」 크기를 정해 두고 여기에 곱한다(배틀·필드 동행·내 마당 공용).
  // 키(pokemon-details heightMeters)를 로그 눈금으로 줄여 쓴다: 키가 두 배면 0.13 커지고, 3.5m 이상(롱스톤 등)은 1에서 멈추고,
  // 아주 작은 포켓몬(디그다 0.2m)도 알아보게 0.5 아래로는 줄이지 않는다. 피카츄 0.6·이상해씨 0.7·1m 0.77·잠만보 0.9.
  // 실제 비율 그대로면 디그다가 롱스톤의 1/44 이라 보이지 않는다. 키를 모르면 1m 로 본다.
  const BODY_SIZE_MIN = 0.5;
  // 서로 다른 포켓몬을 50마리 잡으면 같이 다닐 친구 한 칸이 더 열린다. 첫 동행은 계속 배틀 대표다.
  function companionCapacity(caught = []) { return new Set(caught).size >= 50 ? 3 : 2; }
  function bodySize(id) {
    const meters = Number(root.POKEMON_DETAILS?.[id]?.heightMeters) || 1;
    return Math.min(1, Math.max(BODY_SIZE_MIN, 0.77 + 0.42 * Math.log10(meters)));
  }
  // 출석 선물은 길에서 만나는 것보다 특별하게(전설이 금방 바닥나지 않을 만큼만): 일반 40 · 고급 40 · 희귀 15 · 전설 5.
  const GIFT_GRADE_WEIGHTS = Object.freeze({ basic: 40, advanced: 40, rare: 15, legend: 5 });
  function pickByGrade(candidates, random = Math.random, weights = GRADE_WEIGHTS) {
    const groups = {};
    for (const pokemon of candidates) (groups[grade(pokemon)] ||= []).push(pokemon);
    const grades = Object.keys(weights).filter(name => groups[name]);
    if (!grades.length) return null;
    const total = grades.reduce((sum, name) => sum + weights[name], 0);
    let roll = random() * total;
    let chosen = grades[grades.length - 1];
    for (const name of grades) {
      roll -= weights[name];
      if (roll < 0) { chosen = name; break; }
    }
    const list = groups[chosen];
    return list[Math.floor(random() * list.length)];
  }
  // 아직 못 잡았고 세대가 열린 포켓몬(일반·고급·희귀는 일반 세대, 전설은 전설 세대). region 이 있으면 그 지역 타입만.
  function unlocked(all, caught, region = null) {
    const found = new Set(caught);
    const normalGen = generation(all, caught, false);
    const legendGen = generation(all, caught, true);
    return all.filter(p => !found.has(p.id) && (p.tier === 'legend' ? p.gen <= legendGen : p.gen <= normalGen) &&
      (!region || p.types.some(type => REGIONS[region].types.includes(type))));
  }
  function pool(all, caught, region, gold) {
    const open = unlocked(all, caught, region);
    // 금색 볼은 특별한 포켓몬(희귀·전설)만. 빨간 볼은 모든 등급을 등급 비율로.
    return gold ? open.filter(p => p.tier === 'legend' || p.tier === 'rare') : open;
  }
  // 인기 포켓몬 먼저(2026-11-13 사용자 요청 「파이리 이상해씨 꼬부기 이브이는 초반에 나오게」, 2026-11-14 「기존 유저들에게도 같은 경험」):
  // 인기 포켓몬 중 못 잡은 것이 하나라도 있으면(잡은 수와 상관없이) 빨간 볼 만남은 EARLY_FAVORITES_CHANCE 확률로 그중 하나(지역 타입과 상관없이).
  // 피카츄(25)도 넣는다: 새 계정은 튜토리얼에서 받지만 그 전부터 놀던 계정에는 없을 수 있다. 다 잡으면 원래 규칙(등급 비율)만.
  const EARLY_FAVORITES = Object.freeze([1, 4, 7, 25, 133]);
  const EARLY_FAVORITES_CHANCE = 0.6;
  // types(배 위 물 타입 등)가 있으면 그 타입인 인기 포켓몬만.
  function earlyFavorite(all, caught, random, types = null) {
    const found = new Set(caught);
    const missing = all.filter(p => EARLY_FAVORITES.includes(p.id) && !found.has(p.id) && (!types || p.types.some(type => types.includes(type))));
    if (!missing.length || random() >= EARLY_FAVORITES_CHANCE) return null;
    return missing[Math.floor(random() * missing.length)];
  }
  // types: 그 타입만(배를 타고 물 위를 지날 때 물 타입). 열린 포켓몬 중 그 타입이 하나도 없으면 지역 전체에서 고른다.
  function choose(all, caught, region, gold, difficulty, random = Math.random, types = null) {
    const open = pool(all, caught, region, gold);
    const typed = types ? open.filter(p => p.types.some(type => types.includes(type))) : open;
    const available = typed.length ? typed : open;
    if (!available.length) return null;
    if (!gold) return earlyFavorite(all, caught, random, types) || pickByGrade(available, random);
    const legends = available.filter(p => p.tier === 'legend');
    const rare = available.filter(p => p.tier !== 'legend');
    // 금색 볼의 전설은 쉬움 10%·도전 25%. 희귀가 다 잡혔을 때만 반드시 전설.
    const preferred = legends.length && (random() < (difficulty >= 2 ? 0.25 : 0.1) || !rare.length) ? legends : rare;
    const choices = preferred.length ? preferred : available;
    return choices[Math.floor(random() * choices.length)];
  }
  // 글자 쓰기 선물: 열린 세대의 못 잡은 포켓몬(모든 지역) 중 등급 비율로 하나.
  function wordGift(all, caught, random = Math.random) { return pickByGrade(unlocked(all, caught), random); }
  // 풀숲 만나기: 풀숲에서 tiles 칸 걸었을 때. 한 칸마다 chance 확률, 처음엔 first 칸·만난 뒤엔 rest 칸 쉰다. state 는 { walk, rest }.
  // 평균 약 12초 걸어야 한 번(걷기 1초 4.5칸 기준: 쉬는 20칸 4.4초 + 평균 33칸 7.4초). 2026-11-13: 5%·8칸은 6초마다라 잦았다.
  // 걷다가 만나는 칸은 지역마다 다르다(2026-11-13 사용자 「지역마다 다르게」, 칸 종류는 js/field-map.js FieldWorld.encounterAt):
  // 풀숲(숲·도시 공원·사막 마른 덤불), 꽃밭·분수 둘레(도시), 맨 모래(사막), 물가(바다). 칸 종류별 한 칸 확률(chance)은 아래 표.
  // 평균 만남 간격(그 칸만 계속 걸을 때) = (쉼 rest 20칸 + 1/확률)칸 ÷ 걷는 속도 4.5칸/초:
  // 풀숲 3% → 53칸 ≈ 12초 · 꽃밭 4% → 45칸 = 10초 · 물가 4% → 10초 · 맨 모래 1.5% → 87칸 ≈ 19초(모래가 넓어 가장 낮게).
  // 꽃밭·물가는 좁은 띠라 한 번에 오래 걷지 못해 풀숲보다 조금 높다. 처음 first 칸은 쉰다.
  // 배 위(boat, 바다 지역에서 배를 타고 물 위를 지날 때, 물 타입만): 3% → 풀숲과 같은 12초.
  const GRASS = Object.freeze({ rest: 20, first: 3, chance: Object.freeze({ grass: 0.03, garden: 0.04, shore: 0.04, sand: 0.015, boat: 0.03 }) });
  function grassStep(state, tiles, random = Math.random, kind = 'grass') {
    const chance = GRASS.chance[kind] || 0;
    let walk = (state.walk || 0) + tiles, rest = (state.rest ?? GRASS.first) - tiles, met = false;
    while (walk >= 1) { walk -= 1; if (rest <= 0 && random() < chance) met = true; }
    return { walk, rest: met ? GRASS.rest : rest, met };
  }
  function newBattle(pokemon, gold) {
    return { pokemon, gold, total: gold ? 4 : 2, hearts: 3, phase: 'silhouette', index: 0, wrong: [] };
  }
  // 한 문제에서 두 번째로 틀렸을 때만 하트(화면 HP 100) 하나를 잃는다. 첫 오답은 그 보기만 잠근다.
  // 오답 보기는 3개뿐이라 세 번째 오답에는 더 잃지 않는다. 다음 문제로 넘어가면 오답 기록이 비워진다.
  const DAMAGE_ON_MISS = 2;
  function answer(battle, selected, correct) {
    if (!['silhouette', 'question'].includes(battle.phase) || battle.wrong.includes(selected)) return false;
    if (selected !== correct) {
      battle.wrong.push(selected);
      // 튜토리얼 첫 배틀(battle.tutorial)은 HP 를 잃지 않아 도망가지 않는다. 오답은 보기 잠금·힌트만.
      if (battle.wrong.length === DAMAGE_ON_MISS && !battle.tutorial) battle.hearts--;
      if (battle.hearts <= 0) { battle.hearts = 0; battle.phase = 'fled'; }
      return false;
    }
    battle.wrong = [];
    if (battle.phase === 'silhouette') battle.phase = 'reveal';
    else {
      battle.index++;
      if (battle.index === battle.total) battle.phase = 'capture';
    }
    return true;
  }
  function startQuestions(battle) { if (battle.phase === 'reveal') battle.phase = 'question'; }
  // 출석 선물: 열린 세대의 못 만난 포켓몬 중 선물 등급 비율(GIFT_GRADE_WEIGHTS)로 하나. 다 모은 등급은 빼고 다시 나눈다.
  function stampGift(all, caught, random = Math.random) { return pickByGrade(unlocked(all, caught), random, GIFT_GRADE_WEIGHTS); }
  function copyYards(yards) { return Object.fromEntries(Object.entries(yards).map(([key, ids]) => [key, [...ids]])); }
  // 기록 한 벌을 그대로 옮겨 담는다(배열·설정은 새로).
  function copyState(state) {
    return {
      ...state,
      caught: [...(state.caught || [])], stamps: [...(state.stamps || [])], settings: { ...(state.settings || {}) },
      ...(Array.isArray(state.companions) ? { companions: [...state.companions] } : {}),
      ...(Array.isArray(state.yard) ? { yard: [...state.yard] } : {}),
      ...(state.yards && typeof state.yards === 'object' ? { yards: copyYards(state.yards) } : {}),
      ...(Array.isArray(state.yardsOpen) ? { yardsOpen: [...state.yardsOpen] } : {}),
      ...(Array.isArray(state.seen) ? { seen: [...state.seen] } : {})
    };
  }
  function mergeState(server, local) {
    // 처음부터 다시 하기(서버가 매긴 resetAt): 두 쪽 초기화 시각이 다르면 나중에 초기화한 쪽을 통째로 쓴다(앞선 쪽 기록은 섞지 않는다).
    const serverReset = server.resetAt || 0, localReset = local.resetAt || 0;
    if (serverReset !== localReset) return copyState(serverReset > localReset ? server : local);
    // 내 마당은 설정처럼 나중에 바꾼 쪽(preferencesUpdatedAt)을 따른다. 그쪽에 마당 기록이 없으면 다른 쪽 것을 쓴다.
    const [newer, older] = (local.preferencesUpdatedAt || 0) > (server.preferencesUpdatedAt || 0) ? [local, server] : [server, local];
    const yard = Array.isArray(newer.yard) ? newer.yard : older.yard;
    const yards = newer.yards && typeof newer.yards === 'object' ? newer.yards : older.yards;
    // 연 마을은 두 쪽 합집합(열쇠 수를 넘으면 storage.js 가 자른다).
    const opened = [server.yardsOpen, local.yardsOpen].filter(Array.isArray);
    // 처음 화면 안내를 본 기록(seen: 소개를 본 것·들어가 본 메뉴)은 서버처럼 합집합. 두 쪽 다 없으면 넣지 않는다.
    const seenLists = [server.seen, local.seen].filter(Array.isArray);
    return {
      ...server, ...local,
      stampRewards: Math.max(server.stampRewards || 0, local.stampRewards || 0),
      wordsWritten: Math.max(server.wordsWritten || 0, local.wordsWritten || 0),
      wordRewards: Math.max(server.wordRewards || 0, local.wordRewards || 0),
      caught: [...new Set([...(server.caught || []), ...(local.caught || [])])].sort((a,b) => a-b),
      stamps: [...new Set([...(server.stamps || []), ...(local.stamps || [])])].sort(),
      settings: { ...server.settings, ...local.settings },
      ...(Array.isArray(yard) ? { yard: [...yard] } : {}),
      ...(yards && typeof yards === 'object' ? { yards: copyYards(yards) } : {}),
      ...(opened.length ? { yardsOpen: [...new Set(opened.flat())] } : {}),
      ...(seenLists.length ? { seen: [...new Set(seenLists.flat())].sort() } : {})
    };
  }
  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  // 난이도 올리기 제안(2026-11-14 사용자): 틀림 없이 끝낸 배틀이 LEVEL_UP_STREAK 번 이어지면 묻는다. 틀리면 0.
  const LEVEL_UP_STREAK = 10;
  const MAX_DIFFICULTY = 3; // 쉬움 1 · 도전 2 · 도전+ 3(서버 허용 범위와 같다)
  function nextStreak(streak, perfect) { return perfect ? (Number(streak) || 0) + 1 : 0; }
  // levels: { math: [5,10,...], korean: [이름...], english: [이름...] }(QuestionBank.levels). 수학 수 범위·한글·영어 단계를 한 칸씩, 창의력(난이도)은 쉬움→도전→도전+ 한 칸씩.
  // 올릴 게 하나도 없으면(모두 최고 단계) null.
  function harderSettings(settings, levels) {
    const current = settings || {};
    const patch = {};
    const math = levels.math.indexOf(current.mathMax || 10);
    if (math >= 0 && math < levels.math.length - 1) patch.mathMax = levels.math[math + 1];
    const korean = current.koreanLevel || 1;
    if (korean < levels.korean.length) patch.koreanLevel = korean + 1;
    const english = current.englishLevel || 1;
    if (english < levels.english.length) patch.englishLevel = english + 1;
    const difficulty = current.difficulty || 1;
    if (difficulty < MAX_DIFFICULTY) patch.difficulty = difficulty + 1;
    return Object.keys(patch).length ? patch : null;
  }
  root.GameRules = { companionCapacity, LEVEL_UP_STREAK, MAX_DIFFICULTY, nextStreak, harderSettings, REGIONS, generation, pool, choose, newBattle, answer, startQuestions, mergeState, stampGift, wordGift, grassStep, GRASS, grade, pickByGrade, bodySize, GRADE_WEIGHTS, EARLY_FAVORITES, EARLY_FAVORITES_CHANCE, GIFT_GRADE_WEIGHTS, shuffle, STAMPS_PER_GIFT: 5, WORDS_PER_GIFT: 5 };
})(window);
