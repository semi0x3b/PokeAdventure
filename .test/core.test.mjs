import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = {window:{}};
vm.createContext(context);
const source = fs.existsSync('js/core.js') ? fs.readFileSync('js/core.js','utf8') : '';
vm.runInContext(source,context);
vm.runInContext(fs.readFileSync('js/data/pokemon.js','utf8'),context);
const R = context.window.GameRules || {};
const all = context.window.POKEMON;
test('같은 문제의 두 번째 오답에서만 하트를 잃고, 세 번째 오답은 더 깎지 않는다',()=>{
 const battle = R.newBattle(all[0],false);
 assert.equal(battle.hearts,3);
 assert.equal(R.answer(battle,'오답','정답'),false);
 assert.equal(battle.hearts,3,'첫 오답은 그 보기만 잠근다');
 assert.deepEqual(Array.from(battle.wrong),['오답']);
 assert.equal(R.answer(battle,'오답','정답'),false);
 assert.equal(battle.hearts,3,'이미 잠긴 보기를 다시 눌러도 오답으로 세지 않는다');
 assert.equal(battle.wrong.length,1);
 R.answer(battle,'오답2','정답');
 assert.equal(battle.hearts,2,'두 번째 오답에서 HP 100(하트 1)을 잃는다');
 R.answer(battle,'오답3','정답');
 assert.equal(battle.hearts,2,'세 번째 오답에는 추가로 잃지 않는다');
 assert.equal(battle.phase,'silhouette','틀렸다고 다음 단계로 넘기지 않는다');
 assert.equal(R.answer(battle,'정답','정답'),true);
 assert.equal(battle.phase,'reveal');
 assert.equal(battle.wrong.length,0,'다음 문제로 가면 오답 기록을 비운다');
});
test('그림자·문제1·문제2에서 각각 두 번씩 틀리면 HP 0이 되어 바로 도망간다',()=>{
 const battle = R.newBattle(all[0],false);
 R.answer(battle,'가','정답'); R.answer(battle,'나','정답');
 assert.equal(battle.hearts,2);
 R.answer(battle,'정답','정답'); R.startQuestions(battle);
 R.answer(battle,'가','정답');
 assert.equal(battle.hearts,2,'새 문제의 첫 오답은 다시 감소 없음');
 R.answer(battle,'나','정답');
 assert.equal(battle.hearts,1);
 R.answer(battle,'정답','정답');
 assert.equal(battle.index,1);
 R.answer(battle,'가','정답'); R.answer(battle,'나','정답');
 assert.equal(battle.hearts,0);
 assert.equal(battle.phase,'fled');
 assert.equal(R.answer(battle,'정답','정답'),false,'도망친 뒤에는 답을 받지 않는다');
 assert.equal(battle.index,1);
});
test('튜토리얼 배틀(battle.tutorial)은 단계마다 보기 셋을 다 틀려도 HP를 잃지 않아 도망가지 않고 포획까지 간다',()=>{
 const battle = R.newBattle(all[0],false); battle.tutorial = true;
 for (const stage of ['silhouette','question','question']) {
  for (const wrong of ['가','나','다']) assert.equal(R.answer(battle,wrong,'정답'),false);
  assert.equal(battle.hearts,3,stage+' 오답 세 번에도 HP 그대로');
  assert.equal(battle.phase,stage,'도망가지 않는다');
  R.answer(battle,'정답','정답'); R.startQuestions(battle);
 }
 assert.equal(battle.phase,'capture');
 const normal = R.newBattle(all[0],false);
 R.answer(normal,'가','정답'); R.answer(normal,'나','정답');
 assert.equal(normal.hearts,2,'일반 배틀 규칙은 그대로(두 번째 오답에 HP 100)');
});
test('금색 볼도 문제마다 같은 규칙: 한 번씩만 틀리면 HP를 잃지 않고 포획 단계까지 간다',()=>{
 const battle = R.newBattle(all[0],true);
 R.answer(battle,'오답','이상해씨'); R.answer(battle,'이상해씨','이상해씨'); R.startQuestions(battle);
 for (let i = 0; i < 4; i++) { R.answer(battle,'오답','정답'); assert.equal(R.answer(battle,'정답','정답'),true); }
 assert.equal(battle.hearts,3);
 assert.equal(battle.phase,'capture');
});
test('실루엣 정답 뒤 공개되고 일반 2문제 금색 4문제 뒤 포획한다',()=>{
 for(const gold of [false,true]) {
  const b=R.newBattle(all[0],gold);
  assert.equal(b.total,gold?4:2);
  R.answer(b,'이상해씨','이상해씨'); assert.equal(b.phase,'reveal');
  R.startQuestions(b);
  for(let i=0;i<b.total;i++) { R.answer(b,'정답','정답'); }
  assert.equal(b.phase,'capture');
 }
});
test('각 지역은 자신의 타입을 뽑고 포획한 포켓몬을 제외한다',()=>{
 for(const region of Object.keys(R.REGIONS)) {
  const pool=R.pool(all,[],region,false);
  assert.ok(pool.length>0);
  assert.ok(pool.every(p=>p.types.some(t=>R.REGIONS[region].types.includes(t))));
  const caught=pool.map(p=>p.id);
  assert.equal(R.pool(all,caught,region,false).filter(p=>caught.includes(p.id)).length,0);
 }
 assert.ok(all.every(p=>Object.values(R.REGIONS).some(r=>p.types.some(t=>r.types.includes(t)))));
});
test('일반과 전설의 다음 세대는 각각 해당 세대를 모아야 열린다',()=>{
 assert.equal(R.generation(all,[],false),1);
 const normals=all.filter(p=>p.gen===1&&p.tier!=='legend').map(p=>p.id);
 assert.equal(R.generation(all,normals,false),2);
 assert.equal(R.generation(all,normals,true),1);
 const legends=all.filter(p=>p.gen===1&&p.tier==='legend').map(p=>p.id);
 assert.equal(R.generation(all,legends,true),2);
});
test('임시 저장과 다른 기기 수집·출석을 합칠 때 잃지 않는다',()=>{
 const state=R.mergeState({caught:[1],stamps:['2026-11-11'],settings:{sound:true}}, {caught:[2],stamps:['2026-11-12'],settings:{sound:false}});
 assert.deepEqual(Array.from(state.caught),[1,2]);
 assert.equal(state.stamps.length,2);
});

test('처음부터 다시 하기: 두 기록의 resetAt 이 다르면 나중에 초기화한 쪽을 통째로 쓰고, 같으면 지금처럼 합친다', () => {
  const plain = value => JSON.parse(JSON.stringify(value));
  const before = { caught: [1, 4, 7], stamps: ['2026-11-01', '2026-11-02'], companion: 1, companions: [1, 4], yard: [1, 4], stampRewards: 3, wordsWritten: 12, wordRewards: 2, settings: { sound: false, area: 'math', difficulty: 2, trainerLook: 'girl' }, updatedAt: 900, preferencesUpdatedAt: 800 };
  const after = { caught: [], stamps: ['2026-11-14'], companion: null, stampRewards: 0, wordsWritten: 0, wordRewards: 0, settings: { sound: false, area: 'math', difficulty: 2 }, updatedAt: 1000, preferencesUpdatedAt: 0, resetAt: 1000 };
  for (const [server, local, label] of [[after, before, '서버가 초기화'], [before, after, '이 기기가 먼저 초기화 기록을 받음']]) {
    const merged = plain(R.mergeState(server, local));
    assert.deepEqual(merged, plain(after), label + ': 초기화 전 기록(잡은 것·도장·동행·마당·설정·선물 수)을 섞지 않는다');
  }
  // 옛 기록에 resetAt 이 있어도(앞선 초기화) 더 큰 쪽.
  assert.deepEqual(plain(R.mergeState({ ...before, resetAt: 500 }, after)), plain(after));
  // 같은 resetAt 이면 원래 규칙: 수집·도장은 합치고 선물 수는 큰 쪽.
  const played = { ...after, caught: [25], stamps: ['2026-11-14', '2026-11-15'], wordsWritten: 3, updatedAt: 1100 };
  const merged = R.mergeState(after, played);
  assert.deepEqual(Array.from(merged.caught), [25]);
  assert.deepEqual(Array.from(merged.stamps), ['2026-11-14', '2026-11-15']);
  assert.equal(merged.wordsWritten, 3);
  assert.equal(merged.resetAt, 1000);
  // 고른 쪽을 그대로 옮겨 담는다(배열을 같이 쓰지 않는다).
  const copy = R.mergeState(after, before);
  copy.caught.push(9); copy.settings.sound = true;
  assert.deepEqual(after.caught, []); assert.equal(after.settings.sound, false);
});

test('출석 선물은 열린 세대의 못 만난 포켓몬에서 선물 등급 비율(일반 40·고급 40·희귀 15·전설 5)로 고르고, 받은 횟수는 병합할 때 큰 값을 따른다',()=>{
  assert.equal(R.STAMPS_PER_GIFT, 5);
  assert.deepEqual({ ...R.GIFT_GRADE_WEIGHTS }, { basic: 40, advanced: 40, rare: 15, legend: 5 });
  // 첫 난수로 등급을 고른다: 0.97 이상이면 전설(95/100 이후).
  const legend = R.stampGift(all, [], (() => { let first = true; return () => { if (first) { first = false; return .97; } return 0; }; })());
  assert.equal(legend.tier, 'legend'); assert.equal(legend.gen, 1);
  const usual = R.stampGift(all, [], () => 0.7);
  assert.notEqual(usual.tier, 'legend'); assert.equal(usual.gen, 1);
  let legends = 0;
  for (let i = 0; i < 4000; i++) if (R.stampGift(all, []).tier === 'legend') legends++;
  assert.ok(legends > 120 && legends < 290, `선물 전설 비율 ${legends}/4000`);
  const caught = all.filter(p => p.gen === 1 && p.tier !== 'legend').map(p => p.id);
  const next = R.stampGift(all, caught, () => 0.7);
  assert.equal(next.gen, 2); assert.notEqual(next.tier, 'legend'); assert.equal(caught.includes(next.id), false);
  const nonLegends = all.filter(p => p.tier !== 'legend').map(p => p.id);
  assert.equal(R.stampGift(all, nonLegends, () => 0.9).tier, 'legend', '일반·희귀가 다 잡혔으면 전설');
  assert.equal(R.stampGift(all, all.map(p => p.id)), null);
  const state = { caught: [], stamps: [], settings: {} };
  assert.equal(R.mergeState({ ...state, stampRewards: 2 }, { ...state, stampRewards: 1 }).stampRewards, 2);
  assert.equal(R.mergeState(state, { ...state, stampRewards: 1 }).stampRewards, 1);
});

test('맵의 금색 볼에서 전설은 드물게 나온다(쉬움 10%·도전 25%)',()=>{
  const count = difficulty => { let n = 0; for (let i = 0; i < 2000; i++) if (R.choose(all, [], 'forest', true, difficulty).tier === 'legend') n++; return n / 2000; };
  const easy = count(1), hard = count(2);
  assert.ok(easy > 0.06 && easy < 0.14, `쉬움 ${easy}`);
  assert.ok(hard > 0.2 && hard < 0.3, `도전 ${hard}`);
  assert.ok(['rare', 'legend'].includes(R.choose(all, [], 'forest', true, 1).tier), '금색 볼은 희귀·전설만');
});

test('빨간 볼·글자 쓰기 선물은 등급 비율(일반 60·고급 35·희귀 4.95·전설 0.01), 다 모은 등급은 빼고 다시 나눈다',()=>{
  assert.deepEqual({ ...R.GRADE_WEIGHTS }, { basic: 60, advanced: 35, rare: 4.95, legend: 0.01 });
  assert.equal(R.grade(all.find(p => p.id === 1)), 'basic', '이상해씨는 처음 모습');
  assert.equal(R.grade(all.find(p => p.id === 2)), 'advanced', '이상해풀은 진화한 모습');
  assert.equal(R.grade(all.find(p => p.tier === 'rare')), 'rare');
  assert.equal(R.grade(all.find(p => p.tier === 'legend')), 'legend');
  // 정해진 난수로 경계 확인: [0,60) 일반, [60,95) 고급, [95,99.95) 희귀, 그 뒤 전설(합 99.96).
  const sample = [all.find(p => p.id === 1), all.find(p => p.id === 2), all.find(p => p.tier === 'rare'), all.find(p => p.tier === 'legend')];
  const at = value => { let first = true; return () => { if (first) { first = false; return value / 99.96; } return 0; }; };
  assert.equal(R.grade(R.pickByGrade(sample, at(59.9))), 'basic');
  assert.equal(R.grade(R.pickByGrade(sample, at(60.1))), 'advanced');
  assert.equal(R.grade(R.pickByGrade(sample, at(95.1))), 'rare');
  assert.equal(R.grade(R.pickByGrade(sample, at(99.955))), 'legend');
  // 일반을 다 모으면 남은 등급끼리: 고급 35/39.96.
  const withoutBasic = sample.slice(1);
  assert.equal(R.grade(R.pickByGrade(withoutBasic, () => 0.87)), 'advanced');
  assert.equal(R.grade(R.pickByGrade(withoutBasic, () => 0.885)), 'rare');
  assert.equal(R.pickByGrade([], Math.random), null);
  const counts = { basic: 0, advanced: 0, rare: 0, legend: 0 };
  // 인기 포켓몬(EARLY_FAVORITES)은 못 잡은 게 있으면 따로 60% 로 나오므로 모두 잡은 것으로 두고 등급 비율만 본다.
  for (let i = 0; i < 20000; i++) counts[R.grade(R.choose(all, [...R.EARLY_FAVORITES, 10, 11, 12, 13, 14, 15, 16, 17], 'forest', false, 1))]++;
  assert.ok(Math.abs(counts.basic / 20000 - .6) < .02, `일반 ${counts.basic}`);
  assert.ok(Math.abs(counts.advanced / 20000 - .35) < .02, `고급 ${counts.advanced}`);
  assert.ok(Math.abs(counts.rare / 20000 - .0495) < .01, `희귀 ${counts.rare}`);
  assert.ok(counts.legend < 20, `전설 ${counts.legend}`);
  const gift = R.wordGift(all, []);
  assert.ok(gift && gift.gen === 1, '글자 쓰기 선물도 열린 세대에서');
  assert.equal(R.wordGift(all, all.map(p => p.id)), null);
});

test('배를 타고 물 위에서 만나면 물 타입만(열린 물 타입이 없으면 지역 전체)', () => {
  const sea = R.pool(all, [], 'sea', false);
  for (let i = 0; i < 50; i++) assert.ok(R.choose(all, [], 'sea', false, 1, Math.random, ['water']).types.includes('water'));
  assert.ok(sea.some(p => !p.types.includes('water')), '바다 지역에는 얼음 타입도 있다');
  const caughtWater = sea.filter(p => p.types.includes('water')).map(p => p.id);
  const fallback = R.choose(all, caughtWater, 'sea', false, 1, Math.random, ['water']);
  assert.ok(fallback === null || !fallback.types.includes('water') || !caughtWater.includes(fallback.id), '물 타입을 다 잡으면 지역 전체에서');
});

test('인기 포켓몬(이상해씨·파이리·꼬부기·피카츄·이브이)은 잡은 수와 상관없이 못 잡은 게 있으면 빨간 볼 만남의 60%, 다 잡으면 끝', () => {
  const favorites = [1, 4, 7, 25, 133];
  assert.deepEqual([...R.EARLY_FAVORITES], favorites, '피카츄도 들어간다(튜토리얼 전부터 놀던 계정)');
  assert.equal(R.EARLY_FAVORITES_UNTIL, undefined, '잡은 수 기준(8마리 미만)은 없앴다');
  // 난수 고정: 첫 난수 0.1(<60%) → 못 잡은 인기 포켓몬에서 고른다. 지역 타입과 상관없이(숲=풀·벌레인데 파이리가 나온다).
  const fixed = values => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };
  assert.equal(R.choose(all, [25], 'forest', false, 1, fixed([0.1, 0.3])).id, 4, '피카츄만 잡은 새 계정: 넷 중 하나(0.3 → 둘째 파이리)');
  assert.equal(R.choose(all, [25, 1], 'forest', false, 1, fixed([0.1, 0])).id, 4, '잡은 것은 빼고');
  assert.equal(R.choose(all, [], 'forest', false, 1, fixed([0.1, 0.7])).id, 25, '피카츄를 못 잡은 계정: 다섯 중 하나(0.7 → 넷째 피카츄)');
  // 60% 를 넘는 난수면 원래 규칙(등급 비율).
  assert.equal(R.choose(all, [25], 'forest', false, 1, fixed([0.7, 0, 0])).id, all.filter(p => R.grade(p) === 'basic' && R.pool(all, [25], 'forest', false).includes(p))[0].id);
  // 잡은 수가 많아도(인기 포켓몬을 뺀 1세대 100마리) 못 잡은 인기 포켓몬이 있으면 그대로 60% 안팎.
  const veteran = all.filter(p => p.gen === 1 && !favorites.includes(p.id)).slice(0, 100).map(p => p.id);
  const rate = caught => { let n = 0; for (let i = 0; i < 6000; i++) if (favorites.includes(R.choose(all, caught, 'forest', false, 1).id)) n++; return n / 6000; };
  const early = rate([25]), many = rate(veteran);
  assert.ok(early > 0.5 && early < 0.7, `초반 ${early}`);
  assert.ok(many > 0.5 && many < 0.7, `100마리 잡은 계정 ${many}`);
  assert.equal(R.choose(all, [...veteran, 1, 4, 7, 133], 'forest', false, 1, fixed([0.1, 0])).id, 25, '피카츄 하나만 남아도');
  // 다섯을 다 잡으면 원래 규칙: 인기 포켓몬이 풀에 없으니 나오지 않는다.
  for (let i = 0; i < 300; i++) assert.ok(!favorites.includes(R.choose(all, [...veteran, ...favorites], 'forest', false, 1).id));
  // 배 위(물 타입만)는 지금처럼 물 타입 인기 포켓몬(꼬부기)만.
  assert.equal(R.choose(all, veteran, 'sea', false, 1, fixed([0.1, 0.9]), ['water']).id, 7);
  for (let i = 0; i < 200; i++) assert.ok(R.choose(all, veteran, 'sea', false, 1, Math.random, ['water']).types.includes('water'));
  // 금색 볼은 그대로(희귀·전설만).
  for (let i = 0; i < 200; i++) assert.ok(['rare', 'legend'].includes(R.choose(all, [25], 'forest', true, 1).tier));
});

test('지역마다 만나는 칸: 풀숲 3%·꽃밭 4%·물가 4%·맨 모래 1.5%·배 위 3%, 평균 만남 간격 10~20초', () => {
  assert.deepEqual({ ...R.GRASS.chance }, { grass: 0.03, garden: 0.04, shore: 0.04, sand: 0.015, boat: 0.03 });
  // 그 칸만 계속 걸을 때 평균 간격(초) = (쉼 20칸 + 1/확률) ÷ 4.5칸/초(game.js trainerSpeed)
  for (const [kind, chance] of Object.entries(R.GRASS.chance)) {
    const seconds = (R.GRASS.rest + 1 / chance) / 4.5;
    assert.ok(seconds >= 10 && seconds <= 20, `${kind} ${seconds.toFixed(1)}초`);
  }
  // 칸 종류별 확률대로 굴린다: 난수 0.02 는 풀숲(3%)·물가(4%)에선 만나고 모래(1.5%)에선 안 만난다. 모르는 칸은 만나지 않는다.
  const ready = { walk: 0, rest: 0 };
  assert.equal(R.grassStep(ready, 1, () => .02, 'grass').met, true);
  assert.equal(R.grassStep(ready, 1, () => .02, 'shore').met, true);
  assert.equal(R.grassStep(ready, 1, () => .02, 'sand').met, false);
  assert.equal(R.grassStep(ready, 1, () => .01, 'sand').met, true);
  assert.equal(R.grassStep(ready, 1, () => 0, 'road').met, false);
  let met = 0;
  for (let i = 0; i < 20000; i++) if (R.grassStep(ready, 1, Math.random, 'sand').met) met++;
  assert.ok(met > 200 && met < 400, `모래 한 칸 만남 비율 ${met}/20000`);
});

test('풀숲 만나기: 풀숲 한 칸마다 3%, 처음엔 3칸·만난 뒤엔 20칸 쉰다',()=>{
  assert.deepEqual([R.GRASS.chance.grass, R.GRASS.rest, R.GRASS.first], [0.03, 20, 3]);
  let state = {};
  state = R.grassStep(state, 2.5, () => 0); assert.equal(state.met, false, '처음 3칸은 쉰다');
  state = R.grassStep(state, 1, () => 0); assert.equal(state.met, true, '쉬는 칸이 끝나면 만날 수 있다');
  assert.equal(state.rest, 20, '만나면 다시 20칸 쉰다');
  state = R.grassStep(state, 19.5, () => 0); assert.equal(state.met, false, '만난 뒤 20칸은 쉰다');
  assert.equal(R.grassStep(state, 1, () => 0).met, true);
  let met = 0, s2 = { rest: 0 };
  for (let i = 0; i < 4000; i++) { s2 = R.grassStep({ walk: 0, rest: 0 }, 1); if (s2.met) met++; }
  assert.ok(met > 70 && met < 180, `한 칸 만남 비율 ${met}/4000`);
  assert.equal(R.grassStep({ walk: .2, rest: 0 }, .3, () => 0).met, false, '한 칸을 다 걷기 전에는 굴리지 않는다');
});

test('그림 크기 배율(bodySize)은 키를 따르되 0.5~1 안: 작은 포켓몬도 보이고 큰 포켓몬은 상한', () => {
  context.window.POKEMON_DETAILS = { 50: { heightMeters: .2 }, 25: { heightMeters: .4 }, 143: { heightMeters: 2.1 }, 95: { heightMeters: 8.8 }, 321: { heightMeters: 14.5 } };
  const [diglett, pikachu, snorlax, onix, wailord] = [50, 25, 143, 95, 321].map(R.bodySize);
  assert.equal(diglett, .5, '디그다 0.2m 는 하한');
  assert.ok(pikachu > diglett && pikachu < snorlax && snorlax < onix, `${pikachu} ${snorlax} ${onix}`);
  assert.ok(Math.abs(pikachu - .6) < .01 && Math.abs(snorlax - .905) < .01);
  assert.equal(onix, 1, '롱스톤 8.8m 는 상한');
  assert.equal(wailord, 1);
  assert.equal(R.bodySize(9999), .77, '키를 모르면 1m');
  delete context.window.POKEMON_DETAILS;
});

test('난이도 올리기 제안: 틀림 없는 배틀이 이어지면 연속이 늘고 틀리면 0, 10번이 기준', () => {
  assert.equal(R.LEVEL_UP_STREAK, 10);
  assert.equal(R.nextStreak(0, true), 1);
  assert.equal(R.nextStreak(9, true), 10);
  assert.equal(R.nextStreak(7, false), 0);
  assert.equal(R.nextStreak(undefined, true), 1);
  assert.equal(R.nextStreak('abc', true), 1);
});

test('난이도 올리기: 수학 수 범위·한글·영어는 한 단계씩, 난이도는 쉬움→도전→도전+, 최고에서 멈추고 모두 최고면 null', () => {
  const levels = { math: [5, 10, 20, 50, 100], korean: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], english: ['x', 'y', 'z', 'w'] };
  assert.equal(R.MAX_DIFFICULTY, 3);
  assert.deepEqual({ ...R.harderSettings({}, levels) }, { mathMax: 20, koreanLevel: 2, englishLevel: 2, difficulty: 2 }, '아무것도 안 골랐으면 기본(10·1·1·쉬움)에서');
  assert.deepEqual({ ...R.harderSettings({ mathMax: 5, koreanLevel: 3, englishLevel: 2, difficulty: 1 }, levels) }, { mathMax: 10, koreanLevel: 4, englishLevel: 3, difficulty: 2 });
  assert.deepEqual({ ...R.harderSettings({ mathMax: 100, koreanLevel: 7, englishLevel: 3, difficulty: 2 }, levels) }, { englishLevel: 4, difficulty: 3 }, '최고인 영역은 그대로 두고 남은 것만(영어 3→4, 도전→도전+)');
  assert.deepEqual({ ...R.harderSettings({ mathMax: 100, koreanLevel: 7, englishLevel: 4, difficulty: 2 }, levels) }, { difficulty: 3 });
  assert.equal(R.harderSettings({ mathMax: 100, koreanLevel: 7, englishLevel: 4, difficulty: 3 }, levels), null, '모두 최고면 제안 없음');
});
