(function () {
  'use strict';
  const R = GameRules;
  const S = GameStorage;
  let sessionLocked = !S.user;
  const main = document.querySelector('#main');
  const modalRoot = document.querySelector('#modal-root');
  const images = new Map();
  const keys = new Set();
  let screen = 'title';
  let region = 'forest';
  let field = null;
  let battle = null;
  let questions = [];
  let nameOptions = [];
  let usedQuestions = [];
  let busy = false;
  let dexFilter = 'all';
  let dexGen = 1;
  let returnScreen = 'title';
  let toastTimer;
  let previousTime = 0;
  let wordbookSession = null;
  let yardSession = null;
  let answerMotionId = 0;
  let lastCaughtId = null;
  let partySlot = 0;
  // 필드 가방 창을 연 채 친구를 고르는 중인지(고른 뒤 가방 창으로 돌아온다).
  let bagOpen = false;
  // 같이 다닐 친구 안내 중 도감에서 반짝이는 파트너 칸(없으면 null). 칸에서 포켓몬을 고르거나 도감을 떠나면 끝난다.
  let partyGuideSlot = null;
  let newBadgeId = null;
  const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const fieldSpriteImages = new Map();
  const areas = { mixed: '골고루', math: '수학', korean: '한글', english: '영어', creative: '창의력' };
  function escape(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }
  function button(label, action, secondary = false, small = false) {
    return `<button class="button${secondary ? ' secondary' : ''}${small ? ' small' : ''}" data-action="${action}">${label}</button>`;
  }
  function partyIds() {
    const stored = Array.isArray(S.state.companions) ? S.state.companions : (S.state.companion ? [S.state.companion] : []);
    return [...new Set(stored)].filter(id => S.state.caught.includes(id)).slice(0,2);
  }
  function chooseParty(ids) {
    const companions = [...new Set(ids)].slice(0,2);
    S.update({ companions, companion: companions[0] || null }, true);
  }
  // 도감 위쪽 「모험 파트너」 두 칸. 칸을 누르면 잡은 포켓몬 고르기 창이 열린다. 1번 칸이 배틀에 나가는 대표, 2번 칸이 필드 동행이다.
  const PARTY_ROLES = ['대표', '동행'];
  function partyPanel() {
    if (!S.state.caught.length) return '<section class="party-panel"><p class="party-hint">포켓몬을 잡아 보자!</p></section>';
    const ids = partyIds();
    const slots = PARTY_ROLES.map((role, slot) => {
      const pokemon = POKEMON.find(p => p.id === ids[slot]);
      const body = pokemon
        ? `<img src="${pokemonImage(pokemon, true)}" alt=""><strong>${escape(pokemon.name)}</strong>`
        : '<img class="party-empty" src="img/art/balls/ball-red-small.png" alt=""><strong>비어 있어</strong>';
      const label = `${role} ${pokemon ? escape(pokemon.name) : '비어 있음'}`;
      return `<button class="party-slot${pokemon ? '' : ' empty'}${slot === partyGuideSlot ? ' is-guided' : ''}" data-party-slot="${slot}" aria-label="${label}"><span class="party-tag"><span class="ui-icon icon-partner" aria-hidden="true"></span>${role}</span>${body}</button>`;
    }).join('');
    return `<section class="party-panel" aria-label="모험 파트너"><div class="party-slots">${slots}</div></section>`;
  }
  // 필드 「가방」: 같이 다닐 친구 두 칸만 보여 주고, 칸을 누르면 도감과 같은 고르기 창(partyPicker)으로 바꾼다(2026-11-13 사용자).
  // 여는 곳은 오른쪽 위 「가방」 버튼(index.html #bag-button, 2026-11-14 — 트레이너 누르기에서 다시 버튼으로).
  function bagModal() {
    if (!S.state.caught.length) return;
    bagOpen = true;
    const ids = partyIds();
    const slots = PARTY_ROLES.map((role, slot) => {
      const pokemon = POKEMON.find(p => p.id === ids[slot]);
      const body = pokemon
        ? `<img src="${modelImagePath(pokemon.id)}" alt=""><strong>${escape(pokemon.name)}</strong>`
        : '<img class="party-empty" src="img/art/balls/ball-red-small.png" alt=""><strong>비어 있어</strong>';
      return `<button class="party-slot${pokemon ? '' : ' empty'}" data-party-slot="${slot}" aria-label="${role} ${pokemon ? escape(pokemon.name) : '비어 있음'}"><span class="party-tag"><span class="ui-icon icon-partner" aria-hidden="true"></span>${role}</span>${body}</button>`;
    }).join('');
    showModal('<h2 id="modal-title">같이 다닐 친구</h2>', `<section class="party-panel bag-party"><div class="party-slots">${slots}</div></section>`, 'modal--pop');
    window.VoiceGuide?.say('bagOpen');
  }
  function partyPicker(slot) {
    const caught = POKEMON.filter(p => S.state.caught.includes(p.id));
    if (!caught.length) return;
    partySlot = slot;
    const ids = partyIds();
    const current = ids[slot];
    const choices = caught.map(p => {
      const assigned = ids.indexOf(p.id);
      const tag = assigned >= 0 ? `<span class="party-tag">${PARTY_ROLES[assigned]}</span>` : '';
      return `<button class="party-choice${p.id === current ? ' active' : ''}" data-party-pick="${p.id}" aria-pressed="${p.id === current}">${tag}<img src="${pokemonImage(p, true)}" alt="" loading="lazy"><span>${escape(p.name)}</span></button>`;
    }).join('');
    showModal(`<h2 id="modal-title">${PARTY_ROLES[slot]} 포켓몬</h2>`, `<div class="party-picker">${choices}</div>${current ? `<div class="modal-actions">${button('비우기', 'party-clear', true)}</div>` : ''}`, 'modal--wide modal--pop');
    window.VoiceGuide?.say('partyPick');
  }
  // 지정한 칸이 톡 튀며 울음소리를 낸다. 목록을 다시 그린 뒤 부른다.
  function popPartySlot(slot, id) {
    const element = main.querySelector(`[data-party-slot="${slot}"]`);
    if (element && !motionPreference?.matches) {
      element.classList.add('is-popped');
      element.addEventListener('animationend', () => element.classList.remove('is-popped'), { once: true });
    }
    cry(id);
  }
  function setPartner(slot, id) {
    const ids = partyIds();
    // 다른 칸에 있던 포켓몬을 고르면 두 칸을 맞바꾼다. 빈 1번 칸 뒤의 2번 칸은 앞으로 당겨진다.
    const other = 1 - slot;
    if (ids[other] === id) ids[other] = ids[slot];
    ids[slot] = id;
    chooseParty(ids.filter(Boolean));
  }
  function clearPartner(slot) {
    const ids = partyIds();
    ids.splice(slot, 1);
    chooseParty(ids);
  }
  function pokemonImage(pokemon, small = false) { return window.PokemonAssets.image(pokemon.id, small ? 'thumb' : 'artwork'); }
  // 배틀과 필드의 앞·뒤 3D 그림은 실행할 때 PokeAPI 원본 자료원에서 받는다.
  function modelImagePath(id, back = false) { return window.PokemonAssets.image(id, back ? 'back' : 'front'); }
  function getImage(id) {
    if (!images.has(id)) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = pokemonImage({ id });
      images.set(id, image);
    }
    return images.get(id);
  }
  function toast(message) {
    const element = document.querySelector('#toast');
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('visible'), 3300);
  }
  // 소리 설정 하나(2026-11-15 사용자 「설정에서 소리 너무 옵셔널해 1개 설정으로 해줘」): 효과음·울음소리·배경 음악·징글·문제 읽기·음성 안내·
  // 기능 소개 말·글자 쓰기 읽기가 모두 settings.sound 하나만 본다(js/voice-guide.js·js/feature-tour.js 도 같은 값). 옛 계정에 남은
  // music·readAloud·voiceGuide 가 서로 달라도 보지 않는다. 바꿀 때는 넷을 같은 값으로 저장한다(soundSettings, 배포 전에 열린 탭도 같게 들린다).
  function soundOn() { return Boolean(S.user) && !sessionLocked && S.state.settings.sound !== false; }
  function soundSettings(on) { return { sound: on, music: on, readAloud: on, voiceGuide: on }; }
  let audioPreference = null;
  // 끄면(이 기기 설정 창·다른 기기 저장) 효과음·음악·울음소리와 하던 읽기·안내를 바로 멈춘다. 켜면 Sfx 가 지금 화면 곡을 다시 튼다(읽기는 다시 시작하지 않음).
  function syncAudio() {
    const on = soundOn();
    if (audioPreference === on) return;
    audioPreference = on;
    window.Sfx?.setOn(on);
    if (!on) { window.Narration?.cancel(); window.VoiceGuide?.cancel(); }
  }
  function sound(kind) {
    syncAudio();
    if (kind === 'throw' && window.Sfx?.capture) { if(!motionPreference?.matches)Sfx.capture();return; }
    const names = { encounter: 'battle' };
    window.Sfx?.play(names[kind] || kind);
  }
  // 징글(js/audio.js, Ninja Adventure): 'caught' 잡은 순간 Success3, 'gift' 선물 상자가 열릴 때 Secret1. 못 받았으면 합성 「잡았다」 효과음.
  function jingle(name) {
    syncAudio();
    if (window.Sfx?.jingle) Sfx.jingle(name); else window.Sfx?.play('caught');
  }
  function cry(id) { syncAudio(); window.Sfx?.cry(id); }
  // 화면 곡(js/audio.js trackFor): 필드는 지역 곡, 배틀은 Fight(금색 볼 Mystical), 잡았다·도망은 음악 없음, 나머지 화면은 처음 화면 곡.
  function musicForScreen() {
    if (!window.Sfx?.music) return;
    syncAudio();
    Sfx.music(Sfx.trackFor ? Sfx.trackFor({ screen, region, phase: battle?.phase, gold: Boolean(battle?.gold) }) : null);
  }
  // 상단에는 모서리 버튼만 있다: 왼쪽 몬스터볼(한 단계 뒤로, 지역 선택에서는 처음 화면), 오른쪽 「도감」(필드에서만)·「지도」(도감에서만)·설정,
  // 그 아래 「가방」(필드에서만, css/app.css). 소리·음악·계정·저장 상태는 모두 설정 창 안에서 바꾸고 본다.
  function updateHeader() {
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.hidden = sessionLocked || !S.user;
    const skip = document.querySelector('#tutorial-skip');
    if (skip) skip.hidden = !canSkipTutorial();
    // 「가방」은 같이 다닐 친구를 고르는 곳이라 잡은 포켓몬이 없으면 열 게 없어 숨긴다(눌러도 아무 일 없는 버튼을 두지 않는다).
    // 로그인한 계정은 피카츄를 잡기 전에 튜토리얼로 가므로 필드에서는 늘 보인다. 저장이 바뀔 때(savechange)도 여기를 지난다.
    const bag = document.querySelector('#bag-button');
    if (bag) bag.hidden = !S.state.caught.length;
    // 왼쪽 위 버튼: 처음 화면으로 가면 집 아이콘, 한 단계 뒤로 가면 화살표(몬스터볼은 뒤로 가기로 알아보기 어려웠다, 2026-11-13 사용자).
    const back = document.querySelector('#home-button');
    const toTitle = backTarget() === 'title' && !(screen === 'wordbook' && document.querySelector('.wordbook[data-view="list"]'));
    if (back?.setAttribute) back.setAttribute('aria-label', toTitle ? '처음 화면' : '뒤로');
    back?.querySelector?.('.ui-icon')?.setAttribute?.('class', 'ui-icon ' + (toTitle ? 'icon-home' : 'icon-back'));
    syncAudio();
  }
  function tutorialFirst(next) {
    // 처음부터 다시 한 바로 뒤의 처음 화면은 한 번 그대로 보여 준다(「시작」을 누르면 아래 규칙대로 튜토리얼).
    if (next === 'title' && resetTitleFor !== null && resetTitleFor === S.user?.name) return false;
    return Boolean(window.Tutorial?.needed(S)) && !['tutorial', 'battle'].includes(next);
  }
  function canSkipTutorial() {
    return Boolean(window.Tutorial?.needed(S)) &&
      (screen === 'tutorial' || screen === 'battle' && battle?.tutorial === true);
  }
  function skipTutorial() {
    if (!canSkipTutorial()) return;
    // 진행 중이던 답변·포획 처리가 나중에 화면이나 기록을 되돌리지 않게 먼저 무효화한다.
    answerMotionId++;
    battle = null;
    busy = false;
    window.EncounterIntro?.clear();
    window.AdventureMotion?.cancel();
    window.Narration?.cancel();
    window.VoiceGuide?.cancel();
    tracingPad?.destroy();
    tracingPad = null;
    const id = Tutorial.STARTER;
    S.update({ caught: [...new Set([...S.state.caught, id])], companions: [id], companion: id }, true);
    void travelTo('regions', 'travel', '피카츄와 모험을 떠나자!');
  }
  // 처음부터 다시 하기(progressreset) 뒤 처음 화면을 그대로 둘 계정 이름. 다른 화면으로 가면 null.
  let resetTitleFor = null;
  // 같이 다닐 친구 안내(2026-11-13 사용자 「세 마리 잡고 나면 같이 다닐 포켓몬을 정할 수 있다고」): 잡은 포켓몬이 3마리 이상이 된 뒤
  // 잡았다 화면을 떠나거나(「계속」·도감 등 어느 버튼이든) 출석·글자 쓰기 선물 장면을 닫을 때 카드 한 장.
  // 둘째 포켓몬은 잡을 때 빈 동행 칸에 저절로 들어가므로, 셋째부터 누구와 다닐지 고를 거리가 생긴다.
  // ponytail: 본 것은 이 기기에 계정별로만 기억한다(새 서버 저장 필드 없음). 기기를 바꾸면 한 번 더 볼 수 있음. 서버 기록은 그게 문제가 되면.
  const PARTY_GUIDE_AT = 3;
  function partyGuideKey() { return 'pokemon-adventure:party-guide:' + S.user.name; }
  function partyGuideDue() {
    return Boolean(window.Tutorial && S.user) && S.state.caught.length >= PARTY_GUIDE_AT && readLocal(partyGuideKey()) !== '1';
  }
  // 난이도 올리기 제안(2026-11-14 사용자 「정답률 100% 가 10번 넘으면 난이도 조절 안내」): 배틀마다 틀림 없이 끝내면 연속 +1, 학습 문제를 하나라도 틀리면 0
  // (튜토리얼 배틀·그림자 이름 맞히기는 세지 않는다). 계정별로 이 기기 localStorage 에만 둔다(서버 저장 필드 없음, 새로고침해도 유지).
  // 잡았다 카드를 떠날 때(같이 다닐 친구 카드가 먼저, 그 뒤에) 카드 한 장. 올릴 단계가 없으면 묻지 않는다.
  function streakKey() { return 'pokemon-adventure:perfect-streak:' + S.user.name; }
  function perfectStreak() { return S.user ? Number(readLocal(streakKey())) || 0 : 0; }
  function setPerfectStreak(value) { if (S.user) writeLocal(streakKey(), String(value)); }
  function levelGuideDue() {
    return Boolean(window.Tutorial && S.user) && perfectStreak() >= R.LEVEL_UP_STREAK && Boolean(R.harderSettings(S.state.settings, QuestionBank.levels));
  }
  let levelGuideReturn = 'field', levelGuideSlot = null;
  function levelGuideFirst(next) {
    return !['levelGuide', 'partyGuide', 'battle', 'tutorial'].includes(next) && levelGuideDue() &&
      ((screen === 'battle' && battle?.phase === 'caught') || screen === 'partyGuide');
  }
  function partyGuideFirst(next) { return screen === 'battle' && battle?.phase === 'caught' && next !== 'battle' && partyGuideDue(); }
  function setScreen(next) {
    if (sessionLocked || !S.user) next = 'title';
    if (next !== 'title') resetTitleFor = null;
    // 로그인했는데 잡은 포켓몬이 없으면(가입·로그인 직후, 어느 화면으로 가려 해도) 튜토리얼(js/tutorial.js)로 간다.
    // 피카츄를 잡기 전에는 글자 쓰기·도감·마당으로 빠져 다른 포켓몬을 먼저 받는 일이 없게 한다(2026-11-13 사용자). 튜토리얼 배틀만 예외.
    if (tutorialFirst(next)) next = 'tutorial';
    bagOpen = false;
    // 같이 다닐 친구 카드: 가려던 화면은 카드·도감의 몬스터볼(뒤로)이 돌아갈 곳으로 남긴다. 도감으로 가던 길이면 goDex 가 정한 곳 그대로.
    if (partyGuideFirst(next)) { if (next !== 'dex') returnScreen = next; next = 'partyGuide'; }
    if (levelGuideFirst(next)) { levelGuideReturn = next; levelGuideSlot = partyGuideSlot; next = 'levelGuide'; }
    if (next !== 'dex') partyGuideSlot = null;
    wordbookSession?.destroy();wordbookSession=null;
    yardSession?.destroy();yardSession=null;
    answerMotionId++;
    window.EncounterIntro?.clear();
    window.AdventureMotion?.cancel();
    busy = false;
    document.querySelector('.gift-scene')?.remove();
    window.Narration?.cancel();
    window.VoiceGuide?.cancel();
    document.querySelector('#battle-speech')?.remove();
    screen = next;
    keys.clear();
    document.body.dataset.screen = next;
    render();
    musicForScreen();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  // 처음부터 다시 하기가 장면 전환 도중에 오면 덮는 중이던 이동은 버린다(전환 뒤에는 처음 화면이 그대로 드러난다).
  let travelEpoch = 0;
  // 장면 전환이 가는 중인 화면(가운데 지점에서 setScreen 하기 전까지). 처음 화면이 다른 화면으로 넘어가는 동안 도장판을 띄우지 않는 데 쓴다.
  let travelTarget = null;
  function travelTo(next, kind, title, subtitle = '', onArrive = null) {
    keys.clear();
    if (!window.SceneFX) { setScreen(next);onArrive?.();return Promise.resolve(); }
    const epoch = travelEpoch;
    // 이미 전환 중이면 SceneFX 가 그 전환을 돌려주고 이 이동은 버린다(scene-fx.js inFlight) — 그때는 가는 곳을 바꾸지 않는다.
    if (!SceneFX.active) travelTarget = next;
    const arrived = () => { if (travelTarget === next) travelTarget = null; };
    return SceneFX.travel({ kind, title, subtitle, onMidpoint: () => {arrived();if(epoch!==travelEpoch)return;setScreen(next);onArrive?.();} }).finally(arrived);
  }
  // 도장 몇 개마다 선물 하나인지는 core.js 가 정한다(루트 792f5dd: 5개). 그 값이 없는 옛 core.js 에서도 5개로 본다.
  const STAMPS_PER_GIFT = R.STAMPS_PER_GIFT || 5;
  function stampCycle() {
    // 도장 STAMPS_PER_GIFT 개가 한 판. 선물을 받을 때마다 다음 판으로 넘어간다. 연속 출석이 아니어도 된다.
    const claimed = S.state.stampRewards || 0;
    const stamps = [...S.state.stamps].sort().slice(claimed * STAMPS_PER_GIFT);
    return { claimed, stamps: stamps.slice(0, STAMPS_PER_GIFT), ready: stamps.length >= STAMPS_PER_GIFT };
  }
  // 아이에게 하는 말: 상황마다 여러 문장 중 하나를 고르고, 바로 전에 한 말은 피한다. {이름:이/가}는 받침에 맞춘 조사.
  const LINES = {
    giftArrived: ['{name:이/가} 찾아왔다!', '짜잔! {name:이/가} 친구가 됐어!', '상자에서 {name:이/가} 나왔어!', '와! {name:이/가} 놀러 왔어!'],
    regions: ['어디로 갈까?', '어디서 모험할까?', '오늘은 어디 갈까?', '어디서 놀아 볼까?'],
    depart: ['{place}에 가 보자!', '좋아, {place} 출발!', '{place} 친구들을 만나러 가자!', '두근두근, {place}에서 누굴 만날까?']
  };
  const lastLines = new Map();
  function line(key, fill = {}) {
    const choices = LINES[key];
    const fresh = choices.filter(text => text !== lastLines.get(key));
    const picked = fresh[Math.floor(Math.random() * fresh.length)] || choices[0];
    lastLines.set(key, picked);
    return picked.replace(/\{(\w+)(?::([^}]+))?\}/g, (_, name, pair) => {
      const value = String(fill[name] ?? '');
      return pair && window.PokemonText ? PokemonText.josa(value, pair) : value;
    });
  }
  // 출석 배지 그림은 이 한 곳에서 고른다. Codex 새 배지(img/art/badges/badge-N.png, 안 찍힌 칸은 -off)를 먼저 쓰고,
  // 파일이 없으면 data-fallback 의 옛 배지 조각으로 바꾼다(아래 error 처리). 옛 조각에는 회색 칸이 없어 흐리게(badge-dim) 보인다.
  function badgeSource(index, collected) {
    return {
      src: `img/art/badges/badge-${index}${collected ? '' : '-off'}.png`,
      fallback: `img/ui-art/badge-${Math.min(7, index)}.webp`,
      dim: !collected
    };
  }
  function badgeImage(index, collected, alt = '') {
    const { src, fallback, dim } = badgeSource(index, collected);
    return `<img src="${src}" data-fallback="${fallback}"${dim ? ' data-fallback-class="badge-dim"' : ''} alt="${escape(alt)}">`;
  }
  function todayKey() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()); }
  function readLocal(key) { try { return window.localStorage?.getItem(key) ?? null; } catch { return null; } }
  function writeLocal(key, value) { try { window.localStorage?.setItem(key, value); } catch { /* 저장 공간이 없으면 다음에 한 번 더 보여 준다 */ } }
  function removeLocal(key) { try { window.localStorage?.removeItem(key); } catch { /* 저장소가 막혀 있으면 지울 것도 없다 */ } }
  // 오늘 도장판을 이 기기에서 본 날(계정별). 처음부터 다시 하면 지운다.
  function stampBoardKey(name) { return 'pokemon-adventure:stamp-board:' + name; }
  // 서버 계정 확인(S.init)이 끝났는지. 그 전의 첫 처음 화면은 로그인 계정도 손님으로 그려지므로 기능 소개(js/feature-tour.js)를 띄우지 않는다.
  let booted = false;
  function lockedScreen() {
    document.body.dataset.screen = 'locked';
    updateHeader();
    main.innerHTML = `<section class="parent-lock"><img class="parent-lock-logo" src="img/ui-art/adventure-logo.webp" alt="두근두근 모험"><div class="parent-lock-card"><span class="ui-icon icon-lock" aria-hidden="true"></span><h1>부모님과 함께 열어요</h1><p>이 기기의 모험 수첩은<br>이름과 비밀번호로 열 수 있어요.</p>${booted ? '<button class="button" data-action="account">'+(S.hasAccount ? '수첩 열기' : '부모 수첩 만들기')+'</button>' : '<p role="status">수첩을 준비하고 있어요…</p>'}</div><div class="parent-lock-links"><button class="button secondary small" data-action="install-help">홈 화면에 추가</button><button class="button secondary small" data-action="legal">이용 안내</button></div></section>`;
    window.Narration?.cancel();window.VoiceGuide?.cancel();window.Sfx?.setOn(false);
    document.querySelector('.gift-scene')?.remove();
    document.querySelector('#battle-speech')?.remove();
  }
  async function lockSession() {
    sessionLocked = true;
    answerMotionId++;travelEpoch++;
    window.SceneFX?.cancel?.();window.EncounterIntro?.clear();window.AdventureMotion?.cancel();
    window.Narration?.cancel();window.VoiceGuide?.cancel();window.Sfx?.setOn(false);
    wordbookSession?.destroy();wordbookSession=null;yardSession?.destroy();yardSession=null;
    tracingPad?.destroy();tracingPad=null;field=null;battle=null;busy=false;
    closeModal();screen='title';lockedScreen();
    try { await S.logout(); } catch (error) { toast(error.message); }
    lockedScreen();
  }
  function title() {
    if (sessionLocked || !S.user) { lockedScreen(); return; }
    document.body.dataset.screen = 'title';
    // 처음 화면을 직접 그리는 길(앱 시작·로그인 확인 뒤)도 피카츄를 잡기 전이면 튜토리얼로.
    if (tutorialFirst('title')) { setScreen('tutorial'); return; }
    const cycle = stampCycle();
    // 처음 들어올 때만 차례로 톡톡 등장한다. 로그인 확인 등으로 다시 그릴 때는 그대로 둔다.
    const entering = !main.querySelector?.('.title-scene');
    main.innerHTML = TitlePoster.render({
      trainerName: S.user?.name, caught: S.state.caught.length, collected: cycle.stamps.length, per: STAMPS_PER_GIFT, ready: cycle.ready,
      entering, badge: badgeSource(Math.max(1, cycle.stamps.length), cycle.stamps.length > 0),
      ambient: window.AmbientScene?.html('forest') || ''
    });
    // 오늘 도장판이 저절로 뜨면(아래) 그 안내가 대신한다.
    if (entering) window.VoiceGuide?.say('title', { guard: () => screen === 'title' && !modalRoot.firstChild });
    // 메뉴 반짝 표시와 한 번만 보는 기능 소개. 소개는 아래 오늘 도장판·선물 장면이 닫히고 안내 말이 끝난 뒤에 시작한다.
    // 처음부터 다시 한 바로 뒤(잡은 포켓몬 0마리)의 처음 화면에서는 소개·오늘 도장판을 띄우지 않는다. 새 계정처럼 튜토리얼 뒤 처음 화면에서 본다.
    const beforeTutorial = Boolean(window.Tutorial?.needed(S));
    window.FeatureTour?.title(booted && !beforeTutorial);
    if (!S.user || beforeTutorial || modalRoot.firstChild || document.querySelector('.gift-scene')) return;
    // 도장판은 그날 처음 도장이 찍힐 때만 저절로 띄운다(기기마다 하루 한 번). 그 밖에는 출석 카드를 눌러야 연다(2026-11-13 사용자).
    const seenKey = stampBoardKey(S.user.name);
    const today = todayKey();
    const firstToday = S.state.stamps.includes(today) && readLocal(seenKey) !== today;
    if (!firstToday) return;
    // 처음 화면에서 다른 화면으로 넘어가는 전환 중(서버 확인이 늦게 끝나 처음 화면을 다시 그린 순간 등)에는 띄우지 않는다.
    // 그대로 띄우면 넘어간 화면(내 마당 등) 위에 도장판이 남는다. 다음에 처음 화면을 그릴 때 띄운다(처음 화면으로 오는 전환은 그대로 띄움).
    if (travelTarget && travelTarget !== 'title') return;
    writeLocal(seenKey, today);
    stampsModal(true);
    // 저절로 뜬 도장판은 오늘 도장이 쾅 찍히는 연출(약 1.6초)이 끝나면 스르르 닫혀 「모험 시작」을 가리지 않는다(2026-11-13 Aside QA).
    // 선물 상자가 열릴 차례면 「열기!」를 눌러야 하니 그대로 둔다. 아이가 먼저 닫았거나 다른 창을 열었으면 손대지 않는다.
    if (stampCycle().ready) return;
    const board = modalRoot.querySelector?.('.modal--stamps');
    const stillBoard = () => board?.isConnected && modalRoot.querySelector?.('.modal--stamps') === board;
    setTimeout(() => {
      if (!stillBoard()) return;
      board.closest?.('.modal-backdrop')?.classList.add('is-leaving');
      setTimeout(() => { if (stillBoard()) closeModal(); }, STAMP_BOARD_FADE_MS);
    }, STAMP_BOARD_AUTO_CLOSE_MS);
  }
  const STAMP_BOARD_AUTO_CLOSE_MS = 2500;
  const STAMP_BOARD_FADE_MS = 350;
  function openStampGift() {
    closeModal();
    if (!S.user || !stampCycle().ready || document.querySelector('.gift-scene')) return;
    const gift = R.stampGift(POKEMON, S.state.caught);
    if (!gift) { toast('모든 포켓몬을 이미 만났다!'); return; }
    // 수령은 먼저 한 번 기록하고 연출 중 이탈해도 잃어버리지 않는다.
    S.update({ caught:[...S.state.caught,gift.id], stampRewards:stampCycle().claimed + 1 });
    lastCaughtId = gift.id;
    giftScene(gift, '출석 선물');
  }
  // 선물 연출(상자 흔들림 → 열림 → 포켓몬). 출석 선물과 글자 쓰기 선물이 함께 쓴다. 선물 기록은 부르기 전에 끝낸다.
  function giftScene(gift, label) {
    const owner = S.user.name;
    const scene = document.createElement('div');
    scene.className = 'gift-scene';
    scene.setAttribute('role','dialog');
    scene.setAttribute('aria-modal','true');
    scene.setAttribute('aria-label',label);
    scene.innerHTML = `<div class="gift-rays" aria-hidden="true"></div><img class="gift-chest-closed" src="img/art/gift/gift-box.webp" alt=""><img class="gift-chest-open" src="img/art/gift/gift-box-open.webp" alt=""><div class="gift-ball" aria-hidden="true"></div><img class="gift-pokemon" src="${pokemonImage(gift)}" alt="${escape(gift.name)}"><p class="gift-message" role="status">${escape(line('giftArrived', { name: gift.name }))}</p>${button('<span class="ui-icon icon-done" aria-hidden="true"></span>신난다!','gift-close')}`;
    document.body.appendChild(scene);
    const guard = () => scene.isConnected && S.user?.name === owner;
    window.VoiceGuide?.say('gift', { text: scene.querySelector('.gift-message')?.textContent || '', guard });
    // 상자가 열리고 포켓몬이 나오는 순간(5.8초)의 징글 Secret1 을 미리 받아 둔다(2026-11-15 부모 승인, 합성 「잡았다」 효과음 대신).
    window.Sfx?.prepare?.('gift');
    // 2026-11-13 「2배 느리게」: 두근두근 기다림 → 상자 열림 → 볼 흔들림 4번(1.1초 간격) → 짜잔. 3.2초 → 6.2초.
    // 시각은 css/app.css .gift-scene 애니메이션 길이와 맞춘다.
    const steps = [
      {at:0,run:()=>{scene.dataset.giftBeat='expect';if(!motionPreference?.matches)sound('shake');}},
      {at:800,run:()=>{scene.dataset.giftBeat='opening';scene.classList.add('opening');}},
      ...[1300,2400,3500,4600].map((at,index)=>({at,run:()=>{scene.dataset.giftBeat='shake-'+(index+1);if(!motionPreference?.matches)sound('shake');}})),
      {at:5800,run:()=>{
        scene.dataset.giftBeat='revealed';scene.classList.add('revealed');jingle('gift');
        scene.querySelector('button').focus({preventScroll:true});
      }},
      {at:6200,run:()=>cry(gift.id)},
      {at:7800,run:()=>readAloud('gift-' + gift.id, scene.querySelector('.gift-message')?.textContent.trim() || '')}
    ];
    if (window.AdventureMotion) {
      void AdventureMotion.sequence(steps,{duration:7800,guard}).then(done=>{if(!done)scene.remove();});
    } else {
      setTimeout(()=>{if(guard())steps[steps.length-3].run();else scene.remove();},5800);
    }
  }
  function closeStampGift() {
    window.AdventureMotion?.cancel();
    document.querySelector('.gift-scene')?.remove();
    if (partyGuideDue()) { returnScreen = screen; setScreen('partyGuide'); return; }
    if (screen === 'title') title();
  }
  function regions() {
    const starters = { forest: 1, city: 25, desert: 4, sea: 7 };
    // 카드 전체를 장소 그림으로 채우고 그 위에는 이름과 남은 포켓몬 수만 둔다. 카드 자체가 누르는 버튼이다.
    const entering = !main.querySelector?.('.region-screen');
    const heading = entering ? line('regions') : main.querySelector('.screen-title')?.textContent || line('regions');
    const cards = Object.entries(R.REGIONS).map(([id, data], index) => {
      const remaining = R.pool(POKEMON, S.state.caught, id, false).length + R.pool(POKEMON, S.state.caught, id, true).length;
      return `<button class="region-card pop" data-region="${id}" style="--order:${index + 1};--float-delay:${(-index * .45).toFixed(2)}s"><img class="region-art" src="img/ui-art/field-${id}.webp" alt="" draggable="false"><span class="region-pokemon"><img src="${modelImagePath(starters[id])}" alt="" draggable="false"></span><span class="region-label"><strong>${data.name}</strong><span>새 포켓몬 ${remaining}마리</span></span></button>`;
    }).join('');
    main.innerHTML = `<section class="region-screen${entering ? ' is-entering' : ''}"><h2 class="screen-title pop">${escape(heading)}</h2><div class="regions">${cards}</div></section>`;
    if (entering) window.VoiceGuide?.say('regions');
  }
  // ---------- 필드 ----------
  // 필드는 16px 도트 타일 지도(js/field-map.js)다. 타일을 정수배(2~4배)로만 키워 선명하게 그리고,
  // 지도 한 변(40칸)은 화면의 2~3배라 어느 화면에서도 둘러볼 곳이 있다.
  // 좌표는 지도 기준 0~1이고 카메라(보이는 화면의 왼쪽 위)도 같은 단위다. 화면 좌표 = (세계 좌표 − 카메라) × 지도 크기.
  // 볼 개수: 화면이 좁으면(짧은 변 600px 미만 = 폰) 2개, 태블릿·컴퓨터는 3개. 화면이 작을수록 볼이 붙어 다녀 너무 자주 만나지 않게.
  function ballCount(view) { return Math.min(view.width, view.height) < 600 ? 2 : 3; }
  const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
  let fieldHintShown = false;
  let safeInsetCache = { key: '', value: NO_INSETS };
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  // 금색 볼이 나올 확률: 쉬움 3%·도전 6%(2026-11-13 사용자: 너무 자주 나온다, 10%·20%에서 낮춤). 볼이 새로 생길 때마다 한 번 굴린다.
  function goldChance() { return S.state.settings.difficulty >= 2 ? 0.06 : 0.03; }
  function fieldMap() { return FieldWorld.build(region); }
  // 타일 배율: 화면 짧은 변 130px 마다 1배(2~4배, 정수). 지도가 화면보다 작아지지는 않게 한다. 거기에 확대·축소 단계를 더한다.
  function tileScale(width, height) {
    const side = FieldWorld.SIZE * FieldWorld.TILE;
    const base = Math.max(clamp(Math.round(Math.min(width, height) / 130), 2, 4), Math.ceil(Math.max(width, height) / side));
    return Math.max(1, base + fieldZoom);
  }
  // 지도 확대·축소(2026-11-13 사용자 「맵 확대 축소」): 기기 타일 배율에 정수 단계(-1·0·+1·+2, 휴대폰 3배 기준 약 0.7·1·1.3·1.7배)를
  // 더한다. 도트가 고르게 보이도록 정수 배율만 쓴다. 두 손가락 벌리기·오므리기와 휠·ctrl+휠로만 바꾼다(화면 +/− 버튼은 사용자 지시로 뺐다).
  // 고른 단계는 이 기기에 기억한다(계정 무관).
  // 지도가 화면보다 작아져도(큰 모니터) 카메라는 트레이너를 가운데에 두고, 지도 밖은 그 지역 장식으로 채워 그린다.
  const ZOOM_KEY = 'pokemon-adventure:field-zoom';
  const ZOOM_MIN = -1, ZOOM_MAX = 2;
  let fieldZoom = clamp(Math.round(Number(readLocal(ZOOM_KEY)) || 0), ZOOM_MIN, ZOOM_MAX);
  function setZoom(next) {
    const step = clamp(next, ZOOM_MIN, ZOOM_MAX);
    if (step === fieldZoom) return false;
    fieldZoom = step;
    writeLocal(ZOOM_KEY, String(step));
    // 바꾼 배율에서도 트레이너가 화면 가운데에 오게 카메라를 다시 둔다.
    if (field) {
      const canvas = document.querySelector('#field-canvas');
      const view = fieldView(canvas?.clientWidth || window.innerWidth || 1, canvas?.clientHeight || window.innerHeight || 1);
      field.camera = centeredCamera(view);
      field.framed = view.width + 'x' + view.height;
    }
    return true;
  }
  function fieldView(width, height) {
    const scale = tileScale(width, height);
    const size = FieldWorld.SIZE * FieldWorld.TILE * scale;
    return { size, scale, width, height, w: width / size, h: height / size };
  }
  // 도트 한 칸(16px)이 화면에서 차지하는 크기로 트레이너(몸 높이)·볼·동행 크기를 정한다.
  function actorSizes(view) {
    const tile = FieldWorld.TILE * view.scale;
    // 동행 도트는 지도 타일 배율(확대·축소 단계 포함)을 기준으로 그린다(2026-11-13 사용자 「필드 동행 배율」).
    // 포켓몬마다 몸통이 같은 크기가 되게 배율을 고른다(companionShape, 2026-11-14 「다 같은 크기로해」).
    return { tile, trainer: trainerHeight(view.scale), ball: 12 * view.scale, companion: view.scale };
  }
  // 노치·홈 막대 안쪽 여백(px). 필드 안의 숨은 요소에 tokens.css 의 --safe-* 를 padding 으로 걸어 읽는다.
  function safeInsets(width, height) {
    const key = width + 'x' + height;
    if (safeInsetCache.key === key) return safeInsetCache.value;
    const probe = document.querySelector('.field-safe-probe');
    if (!probe || !window.getComputedStyle) return NO_INSETS;
    const style = getComputedStyle(probe);
    const value = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
    safeInsetCache = { key, value };
    return value;
  }
  // 위쪽 모서리 버튼 줄 높이(px): tokens.css 의 --gap-s(8) + --touch(52) + 여유 6.
  const HUD_HEIGHT = 66;
  // 발이 지도 가장자리에 너무 붙으면 카메라가 지도 끝에 멈춘 상태에서 트레이너가 화면(노치 포함) 밖으로 잘리거나
  // 위쪽 버튼 줄 밑에 가린다. 그만큼 띄운다.
  function walkMargin(view, sizes, insets) {
    return {
      left: (insets.left + sizes.tile * .5) / view.size,
      right: (insets.right + sizes.tile * .5) / view.size,
      top: (insets.top + HUD_HEIGHT + sizes.trainer) / view.size,
      bottom: (insets.bottom + 14) / view.size,
    };
  }
  // 카메라는 늘 트레이너를 화면 가운데에 둔다(2026-11-13 사용자 「지우가 항상 가운데, 이동하려고 누를 자리가 너무 작다」).
  // 지도 끝에 서도 멈추지 않고, 화면에 보이는 지도 밖은 그 지역 장식(숲·바위·바다, field-map.js beyond)으로 채워 그린다.
  // 걸을 수 있는 범위는 그대로이고, 지도 밖을 누르면 그쪽의 가장 가까운 걸을 수 있는 곳으로 걷는다(walkTargetAt).
  function centeredCamera(view) { return { x: field.player.x - view.w / 2, y: field.player.y - view.h / 2 }; }
  function followCamera(view, ratio) {
    const goal = centeredCamera(view);
    field.camera = { x: field.camera.x + (goal.x - field.camera.x) * ratio, y: field.camera.y + (goal.y - field.camera.y) * ratio };
  }
  function frameStart(view) {
    field.camera = centeredCamera(view);
    field.framed = view.width + 'x' + view.height;
  }
  // 화면 위 버튼(처음으로·도감·설정)과 지역 이름표, 아래 구석 미니맵 자리(화면 px, 둘레 16px 여유 포함). 볼 단추가 이 밑에 있으면 아이가 볼을
  // 누를 때 버튼이 대신 눌려 다른 화면으로 나간다. 필드 화면이 그려진 뒤 화면 크기가 바뀔 때만 다시 잰다.
  let hudCache = { key: '', rects: [] };
  function hudRects(view) {
    const key = view.width + 'x' + view.height;
    if (hudCache.key === key) return hudCache.rects;
    const rects = [];
    if (!window.getComputedStyle) return rects;
    for (const node of document.querySelectorAll('.topbar button, .field-place, .field-mini')) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      rects.push({ left: box.left - 16, top: box.top - 16, right: box.right + 16, bottom: box.bottom + 16 });
    }
    if (document.querySelector('.field-place')) hudCache = { key, rects };
    return rects;
  }
  // 볼 단추(--touch 정사각, 볼 그림 가운데 기준)가 버튼 자리와 겹치는지. point 는 지도 좌표.
  function ballUnderHud(view, sizes, point, rects) {
    const half = field.ballHalf || 26;
    const x = (point.x - field.camera.x) * view.size, y = (point.y - field.camera.y) * view.size - sizes.tile / 2;
    return rects.some(rect => x + half > rect.left && x - half < rect.right && y + half > rect.top && y - half < rect.bottom);
  }
  // 볼 단추(누르는 영역 전체)가 화면과 노치·홈 막대 안쪽(safe-area)에 다 들어오는지. point 는 지도 좌표.
  function ballOnScreen(view, sizes, point, insets) {
    const half = field.ballHalf || 26;
    const x = (point.x - field.camera.x) * view.size, y = (point.y - field.camera.y) * view.size - sizes.tile / 2;
    return x - half >= insets.left && x + half <= view.width - insets.right && y - half >= insets.top && y + half <= view.height - insets.bottom;
  }
  // 새 볼은 보이는 화면 안(위쪽 버튼 줄·이름표와 가장자리는 빼고), 걸을 수 있고 나무·지붕·높은 풀에 가리지 않는 곳,
  // 트레이너와 떨어진 자리에 놓는다.
  // 처음 볼 하나(inView)는 지금 보이는 화면 안에, 나머지와 다시 생기는 볼은 지도 전체에 서로·트레이너와 멀리 고루 놓는다
  // (2026-11-13 사용자: 볼이 처음에 가운데만 나온다). 지도 쪽은 후보 여러 개 중 가장 외딴 곳을 고른다(best-candidate).
  function placeBallOnMap(ball, view, margin, sizes) {
    const map = ball.water ? fieldMap().openWaterMap : fieldMap();
    const edge = 2 / FieldWorld.SIZE;
    const others = field.balls.filter(other => other !== ball && Number.isFinite(other.x));
    const far = point => Math.min(Math.hypot(point.x - field.player.x, point.y - field.player.y) * 1.2, ...others.map(other => Math.hypot(point.x - other.x, point.y - other.y)));
    let spot = null, best = -1;
    for (let tries = 0; tries < 16; tries++) {
      const point = FieldWorld.randomWalkable(map, [edge, edge, 1 - edge, 1 - edge], margin);
      if (!point || FieldWorld.isCovered(map, point)) continue;
      const score = far(point);
      if (score > best) { best = score; spot = point; }
    }
    if (!spot) { placeBall(ball, view, margin, NO_INSETS, sizes); return; }
    Object.assign(ball, { x: spot.x, y: spot.y, heading: Math.random() * Math.PI * 2, turn: 1 + Math.random() * 2, roll: 0, spawn: 0, seen: false });
  }
  function placeBall(ball, view, margin, insets, sizes) {
    const map = fieldMap();
    const size = view.size;
    // 보이는 화면 안쪽(지도 밖이 보이면 지도 안으로 줄인다).
    const edge = 2 / FieldWorld.SIZE;
    const box = [
      Math.max(edge, field.camera.x + (insets.left + 32) / size),
      Math.max(edge, field.camera.y + (insets.top + HUD_HEIGHT + 6 + sizes.ball) / size),
      Math.min(1 - edge, field.camera.x + view.w - (insets.right + 32) / size),
      Math.min(1 - edge, field.camera.y + view.h - (insets.bottom + 24) / size),
    ];
    const rects = hudRects(view);
    let spot = null;
    for (let tries = 0; tries < 12 && !spot; tries++) {
      const point = FieldWorld.randomWalkable(map, box, margin);
      if (!point || ballUnderHud(view, sizes, point, rects) || !ballOnScreen(view, sizes, point, insets)) continue;
      if (Math.hypot((point.x - field.player.x) * size, (point.y - field.player.y) * size) > sizes.tile * 2.5) spot = point;
    }
    if (!spot) spot = FieldWorld.nearestWalkable(map, { x: field.player.x + sizes.tile * 3 / size, y: field.player.y }, margin);
    Object.assign(ball, { x: spot.x, y: spot.y, heading: Math.random() * Math.PI * 2, turn: 1 + Math.random() * 2, roll: 0, spawn: 0, seen: false });
  }
  // from: 출구로 넘어왔으면 떠나온 지역. 그 지역으로 돌아가는 출구 앞에서 지도 안쪽을 보고 선다.
  function createField(from = null) {
    const view = fieldView(window.innerWidth || 1, window.innerHeight || 1);
    const sizes = actorSizes(view);
    const map = fieldMap();
    const gate = from ? FieldWorld.exitTo(map, from) : null;
    const start = gate ? gate.arrival : map.start;
    // 동행 두 마리가 처음부터 트레이너 옆에 줄지어 서도록 옆으로 걸어온 길(4칸)을 깔아 둔다(왼쪽 먼저, 막혔으면 오른쪽).
    // 아래쪽·아치 안쪽 길로 깔면 동행이 트레이너 머리 위나 발 위로 겹쳐 서고 말풍선·가방 그림에 가렸다(2026-11-14 플레이테스트).
    // 출구 도착도 같다 — 출구 앞 칸은 길 한 칸 폭이라 위아래는 아치지만 옆은 열려 있다.
    const lineOpen = side => [1, 2, 3, 4].every(step => FieldWorld.isWalkable(map, { x: start.x + side * step / FieldWorld.SIZE, y: start.y }));
    const lineSide = lineOpen(-1) || !lineOpen(1) ? -1 : 1;
    const trail = { x: start.x + lineSide * 4 / FieldWorld.SIZE, y: start.y };
    field = {
      player: { x: start.x, y: start.y, direction: gate?.arrival.direction || 'front' }, camera: { x: 0, y: 0 },
      target: null, chase: null, drag: null, marker: null, moving: false, stuck: 0, time: 0, cooldown: 0,
      history: [trail, { x: start.x, y: start.y }], followers: [], freshEntry: true, dust: [], dustTimer: 0,
      hint: fieldHintShown ? 0 : 2, intro: true, greeted: false, bagGuided: false, say: null, lastLine: '', goldSaidAt: -99,
      // 배(바다 지역): 부두 끝에 매여 있다가 닿으면 탄다. 탄 상태는 이 필드(지역)에서만이고 저장하지 않는다. boatCall: 배를 눌러 걸어가는 자리.
      boat: map.boat ? { x: map.boat.x, y: map.boat.y, direction: 'right' } : null, riding: false, boatReady: true, boatCall: null,
    };
    fieldHintShown = true;
    // 동행 도트 그림(걷기·서 있기)을 미리 불러 둔다. 걷기 시작할 때 그림이 늦게 와 3D 그림이 잠깐 보이던 것을 막는다.
    for (const id of partyIds()) for (const motion of ['walk', 'idle']) { const source = window.PokemonAssets.sprite(window.FIELD_SPRITES?.[id]?.[motion]); if (source) spriteImage(source); }
    frameStart(view);
    // 2번째 볼만 금색이 될 수 있다(빨간 볼은 늘 하나 이상).
    // 배가 있는 지역(바다)은 마지막 볼이 물 위에 둥실 떠 있다(배를 타야 닿는다).
    const count = ballCount(view);
    field.balls = Array.from({ length: count }, (_, index) => ({ gold: index % 2 === 1 && Math.random() < goldChance(), water: Boolean(map.boat) && index === count - 1 }));
    // 노치·홈 막대 여백: 출구로 넘어올 때는 지난 필드 화면에서 잰 값이 있어 그대로 쓴다(없으면 0 — 첫 프레임에 걸을 수 있는 곳으로 옮겨진다).
    // 0 으로만 두면 노치 기기에서 위쪽 여백 안(걸을 수 없는 띠)에 볼이 놓인 채 전환 중(필드 멈춤)에 보일 수 있었다(2026-11-13 바다 → 사막).
    const insets = safeInsets(view.width, view.height), margin = walkMargin(view, sizes, insets);
    field.balls.forEach((ball, index) => index === 0 ? placeBall(ball, view, margin, insets, sizes) : placeBallOnMap(ball, view, margin, sizes));
  }
  // 화면을 누른 자리(캔버스 안 px)를 지도 좌표로. 걸을 수 없는 곳이면 가장 가까운 걸을 수 있는 점.
  // 누른 자리(지도 좌표, 걸을 수 있는지와 상관없이)와 그때의 걷기 여백.
  function tapPoint(canvas, clientX, clientY) {
    // 줌아웃(transform) 중에도 맞도록 화면에 보이는 크기와 레이아웃 크기의 비율로 바꾼다.
    const bounds = canvas.getBoundingClientRect();
    const width = canvas.clientWidth || bounds.width, height = canvas.clientHeight || bounds.height;
    const view = fieldView(width, height);
    const margin = walkMargin(view, actorSizes(view), safeInsets(width, height));
    const x = (clientX - bounds.left) / (bounds.width || 1) * width, y = (clientY - bounds.top) / (bounds.height || 1) * height;
    return { point: { x: field.camera.x + x / view.size, y: field.camera.y + y / view.size }, margin };
  }
  function walkTargetAt(canvas, clientX, clientY) {
    const { point, margin } = tapPoint(canvas, clientX, clientY);
    const map = fieldMap();
    // 배를 탄 채 물을 누르면 그 물 위로(바위면 그 곁), 땅을 누르면 그쪽 땅으로(물가에 닿으면 내린다).
    if (field.riding && !FieldWorld.isWalkable(map, point, margin) && waterAt(map, point)) return FieldWorld.nearestWalkable(map.waterMap, point, margin);
    return FieldWorld.nearestWalkable(map, point, margin);
  }
  function waterAt(map, point) {
    const x = Math.floor(point.x * map.size), y = Math.floor(point.y * map.size);
    return x >= 0 && y >= 0 && x < map.size && y < map.size && Boolean(map.water[y * map.size + x]);
  }
  // 걷는 동안 배 그림(몸통 사각형) 위를 누르면: 누른 곳(물)에서 가장 가까운 땅이 아니라 배와 가장 가까운 땅·부두 자리. 그 자리를 field.boatCall
  // 로도 두어 닿으면 탄다(updateBoat). 배가 아니면 null.
  function boatCallAt(canvas, clientX, clientY) {
    if (!field.boat || field.riding) return null;
    const { point, margin } = tapPoint(canvas, clientX, clientY);
    return FieldWorld.boatGap(field.boat, point) > 0 ? null : FieldWorld.boardingSpot(fieldMap(), field.boat, margin);
  }
  function chaseBall(index) {
    field.chase = index;
    field.target = null;
    field.hint = 0;
  }
  // ---------- 배(바다 지역, 2026-11-13 사용자 「부두랑 배 타기」) ----------
  // 배 몸통(FieldWorld.BOAT_BODY, 큰 배 그림의 불투명 사각형)에서 BOARD_REACH 칸 안으로 다가가면 탄다. 탄 동안은 물 위만 다니고(moveTrainer),
  // 뱃머리가 땅·부두에 닿으면 그 앞으로 내린다. 내린 뒤에는 몸통에서 BOARD_READY 칸 넘게 한 번 떨어져야 다가가서 다시 탄다(내리자마자
  // 다시 타지 않게 — 내린 자리는 몸통에 붙어 있다). 배 그림을 누르면(boatCallAt) 배와 가장 가까운 땅·부두 자리까지 걸어가 바로 탄다
  // (아이가 배를 골랐으니 떨어졌는지는 보지 않는다). 동행은 함께 타서 배 칸에 앉고(seatCompanions, 2026-11-14), 내리면 끈 따라오기로
  // 땅까지 건너온다. 지역을 떠나면(새 필드) 배는 부두 끝으로 돌아가고 탄 상태는 끝난다.
  // 2026-11-14 「배를 내려가니 다시 안 타지네. 모래사장 쪽에서 내렸거든」: 전에는 배 가운데에서 2.3칸 안이면 타고 3.3칸 넘게 떨어져야
  // 다시 탈 준비였다. 모래사장 물가에 내리면 트레이너는 배 가운데에서 1.84~1.91칸이라, 배를 누르면 그 물가 자리로만 걸어가고
  // (누른 곳에서 가장 가까운 땅) 모래 안쪽 1칸·물가 따라 2칸쯤 걸었다 와서는 준비가 안 돼 가만히 서 있었다.
  // 칸: 몸통 왼쪽 끝(x 33.6)이 부두 끝(x 34)에 6도트 걸쳐 있어 부두 끝 칸에서 x 33.1 을 지나면 탄다(전 2.3칸 규칙은 33.2~33.3).
  // 다시 탈 준비는 떨어지는 폭이 전과 같은 1칸(2.3 → 3.3 처럼 0.5 → 1.5).
  const BOARD_REACH = .5, BOARD_READY = BOARD_REACH + 1;
  function updateBoat() {
    const boat = field.boat;
    if (!boat) return;
    // 배는 늘 가로 모습이라 뱃머리 쪽(direction)은 왼쪽·오른쪽으로 갈 때만 바뀐다(위·아래로 가면 앞 쪽 그대로 — 앉는 칸 앞뒤).
    if (field.riding) {
      boat.x = field.player.x;
      boat.y = field.player.y;
      if (field.player.direction === 'left' || field.player.direction === 'right') boat.direction = field.player.direction;
      return;
    }
    const gap = FieldWorld.boatGap(boat, field.player);
    // 배를 눌러 걸어가는 중: 몸통 가까이 오거나 그 자리에 닿으면 탄다. 다른 곳을 누르거나 방향키·볼 쫓기로 목적지가 바뀌면 끝.
    const call = field.boatCall;
    if (call) {
      if (gap < BOARD_REACH || Math.hypot(field.player.x - call.x, field.player.y - call.y) * FieldWorld.SIZE < .2) { boardBoat(); return; }
      if (field.target !== call) field.boatCall = null;
    }
    if (!field.boatReady) { field.boatReady = gap > BOARD_READY; return; }
    if (gap < BOARD_REACH) boardBoat();
  }
  function boardBoat() {
    field.riding = true;
    field.player.x = field.boat.x;
    field.player.y = field.boat.y;
    field.target = null; field.chase = null; field.path = null; field.pathKey = ''; field.boatCall = null;
    field.boatReady = false;
    fieldSay('boat');
  }
  function leaveBoat(spot) {
    const map = fieldMap();
    field.riding = false;
    field.boat.x = field.player.x;
    field.boat.y = field.player.y;
    field.player.x = spot.x;
    field.player.y = spot.y;
    field.path = null; field.pathKey = ''; field.boatCall = null;
    field.boatReady = false;
    pushOffShore(map);
    // 걸어온 길을 새로: 내린 자리에서 배 반대쪽(땅 안쪽) 1.5칸을 걸어온 것처럼. 배에 앉아 있던 동행은 땅에 닿을 때까지 트레이너 쪽으로
    // 곧장 건너온다(aboard, updateCompanions).
    const unit = 1.5 / FieldWorld.SIZE;
    const away = [[unit, 0], [-unit, 0], [0, unit], [0, -unit]].map(([dx, dy]) => ({ x: spot.x + dx, y: spot.y + dy }))
      .filter(point => FieldWorld.isWalkable(map, point))
      .sort((a, b) => Math.hypot(b.x - field.boat.x, b.y - field.boat.y) - Math.hypot(a.x - field.boat.x, a.y - field.boat.y))[0];
    field.history = [away || { x: spot.x, y: spot.y }, { x: spot.x, y: spot.y }];
    for (const state of field.followers) if (state) state.aboard = true;
  }
  // 내릴 때는 가는 쪽 뱃머리만 보므로(moveTrainer) 물가를 따라 가다 내리면 큰 배 옆이 땅·부두에 걸쳐 있다. 네 방향 끝(BOAT_HALF 에서
  // 3도트 안쪽 — 부두에 매인 배처럼 끝만 살짝 걸치는 건 둔다)이 땅이 아닐 때까지 배를 한 도트씩 물 쪽으로 밀고(배 가운데는 물 위로만),
  // 앉아 있던 동행도 같이 옮겨 배에서 건너오게 한다.
  function pushOffShore(map) {
    const boat = field.boat, dot = mapDot(), from = { x: boat.x, y: boat.y };
    for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let pushed = 0; pushed < BOAT_HALF.x; pushed++) {
        const tip = { x: boat.x + ex * (BOAT_HALF.x - 3) * dot, y: boat.y + ey * (BOAT_HALF.y - 3) * dot };
        const back = { x: boat.x - ex * dot, y: boat.y - ey * dot };
        if (!FieldWorld.isWalkable(map, tip) || !FieldWorld.isSailable(map, back)) break;
        boat.x = back.x;
        boat.y = back.y;
      }
    }
    for (const state of field.followers) if (state) { state.x += boat.x - from.x; state.y += boat.y - from.y; }
  }
  // 출구 칸에 닿으면 그 지역으로 넘어간다(지역 고르기와 같은 출발 인사·장면 전환). 지역·필드는 화면이 다 덮인 뒤(중간)에 바꾼다.
  // 전환 중에는 SceneFX.active 라 필드가 멈춰 다시 닿지 않는다.
  function leaveBy(exit) {
    const from = region;
    field.target = null;
    field.chase = null;
    field.drag = null;
    keys.clear();
    const arrive = () => { region = exit.to; createField(from); setScreen('field'); };
    if (!window.SceneFX) { arrive(); return; }
    void SceneFX.travel({ kind: 'travel', title: line('depart', { place: R.REGIONS[exit.to].name }), onMidpoint: arrive });
  }
  // ---------- 필드 말풍선 ----------
  // 짧은 한마디를 트레이너 머리 위에 잠깐 띄운다. 같은 상황에서도 매번 다른 말(바로 앞과 같은 말은 피한다).
  const FIELD_LINES = {
    enter: {
      forest: ['풀숲에 누가 숨어 있을까?', '숲 냄새가 상쾌해!', '바스락! 무슨 소리지?', '나무 사이를 살펴보자!', '시냇물 소리가 들려!'],
      city: ['광장이 북적북적해!', '분수 옆에 누가 있을까?', '골목골목 찾아보자!', '오늘은 누구를 만날까?', '반짝 도시에 왔어!'],
      desert: ['모래가 따끈따끈해!', '오아시스까지 가 볼까?', '선인장 뒤를 살펴보자!', '바위 틈에 누가 있을까?', '모래바람 조심!'],
      sea: ['파도 소리가 좋아!', '부두 끝까지 가 볼까?', '모래사장에 발자국 꾹!', '바닷가 친구를 찾아보자!', '물가를 살펴보자!'],
    },
    gold: ['반짝! 금색 볼이다!', '저기 금색 볼이 있어!', '특별한 볼을 찾았어!', '금색 볼, 잡으러 가자!', '와, 반짝반짝 빛나!'],
    boat: ['배를 타고 출발!', '출렁출렁, 바다로 가자!', '물 위 친구를 찾아보자!', '꽉 잡아, 출발!'],
    done: ['여기 친구들은 다 만났어!', '다른 곳에도 가 볼까?', '이곳 친구는 모두 만났네!', '새 친구는 다른 지역에 있을 거야!'],
  };
  function fieldSay(kind) {
    if (!field) return;
    const pool = kind === 'enter' ? FIELD_LINES.enter[region] || FIELD_LINES.enter.forest : FIELD_LINES[kind];
    if (!pool?.length) return;
    const choices = pool.length > 1 ? pool.filter(line => line !== field.lastLine) : pool;
    const line = choices[Math.floor(Math.random() * choices.length)] || pool[0];
    field.lastLine = line;
    field.say = { line, until: field.time + 2.4 };
    window.VoiceGuide?.say('field-' + kind, { say: line });
    const bubble = document.querySelector('.field-say');
    if (bubble) { bubble.textContent = line; bubble.hidden = false; bubble.classList.remove('is-popping'); void bubble.offsetWidth; bubble.classList.add('is-popping'); }
  }
  function fieldScreen() {
    if (!field) createField();
    field.ballHalf = 0;
    // 볼에 닿자마자 배틀 배경이 바로 보이도록 이 지역 배틀 배경(가로·세로)을 미리 읽어 둔다.
    for (const shape of ['landscape', 'portrait']) spriteImage('img/battle/bg-' + region + '-' + shape + '.webp');
    const ambient = window.AmbientScene?.field?.(region) || { world: '', weather: '' };
    const balls = field.balls.map((ball, index) => `<button class="field-ball-target" data-field-ball="${index}" data-gold="${ball.gold}" aria-label="${ball.gold ? '금색' : '빨간'} 몬스터볼까지 걸어가기"><span class="field-ball-body"><span class="field-ball-art"></span></span><span class="field-ball-sparkle"></span><span class="field-ball-sparkle"></span></button>`).join('');
    // 출구 아치 위의 갈 지역 이름(fieldFrame 이 자리를 옮긴다).
    const exitNames = fieldMap().exits.map((exit, index) => `<span class="field-exit-name" data-field-exit="${index}" hidden>${R.REGIONS[exit.to].name}</span>`).join('');
    // 새로 들어온 필드만 카메라가 살짝 물러나며(줌아웃) 시작한다. 배틀에서 돌아올 때는 그대로.
    const intro = field.intro ? ' data-intro="true"' : '';
    // 배틀에서 돌아왔을 때(새로 들어온 필드는 첫 말풍선 때 field-enter 안내).
    if (!field.intro) window.VoiceGuide?.say('fieldReturn');
    field.intro = false;
    main.innerHTML = `<section class="field-screen" data-region="${region}"${intro}><div class="field-wrap"><canvas id="field-canvas" class="field-canvas" tabindex="0" aria-label="${R.REGIONS[region].name} 지도. 누르거나 누른 채 움직이면 그쪽으로 걸어가고, 몬스터볼에 닿으면 포켓몬을 만나요. 위아래 끝의 돌 아치로 가면 다른 지역으로 가요."></canvas>${ambient.world}${balls}<span id="field-companion" class="field-companion" role="img" aria-label="대표 포켓몬" hidden></span><span id="field-companion-2" class="field-companion" role="img" aria-label="두 번째 동행 포켓몬" hidden></span><canvas id="field-actor" class="field-actor" aria-hidden="true"></canvas><canvas id="field-over" class="field-over" aria-hidden="true"></canvas>${exitNames}${ambient.weather}<p class="field-say" role="status" hidden></p><span class="field-alert" aria-hidden="true" hidden><img src="img/yard/emote-exclaim.png" alt="" draggable="false"></span></div><p class="field-place">${R.REGIONS[region].name}</p><div class="field-mini" aria-hidden="true"><canvas class="field-mini-map"></canvas><canvas class="field-mini-dots"></canvas></div><span class="field-safe-probe" aria-hidden="true"></span></section>`;
    const canvas = main.querySelector('#field-canvas');
    const screenNode = main.querySelector('.field-screen');
    miniDrawn = '';
    // 두 손가락 벌리기·오므리기로 확대·축소. 두 번째 손가락이 닿으면 걷기를 멈추고, 손가락을 모두 뗄 때까지 걷기 입력을 막는다
    // (화면 전체에서 먼저 받아 지도·볼 단추로 가지 않게 한다). 거리가 1.25배 벌어지거나 0.8배로 좁아질 때마다 한 단계.
    const touches = new Map();
    let pinch = null;
    const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
    screenNode.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch') return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2 && !pinch) {
        pinch = { distance: spread() };
        field.target = null; field.chase = null; field.drag = null; field.marker = null;
      }
      if (pinch) event.stopPropagation();
    }, true);
    screenNode.addEventListener('pointermove', event => {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!pinch) return;
      event.stopPropagation();
      if (touches.size < 2) return;
      const ratio = spread() / pinch.distance;
      if (ratio > 1.25 || ratio < .8) { setZoom(fieldZoom + (ratio > 1 ? 1 : -1)); pinch.distance = spread(); }
    }, true);
    const lift = event => {
      if (!touches.delete(event.pointerId)) return;
      if (pinch) { event.stopPropagation(); field.drag = null; }
      if (!touches.size) pinch = null;
    };
    screenNode.addEventListener('pointerup', lift, true);
    screenNode.addEventListener('pointercancel', lift, true);
    // 마우스 휠·트랙패드(두 손가락 오므리기는 ctrl+휠로 온다): 움직인 양을 모아 한 단계씩, 연달아 넘어가지 않게 잠깐 쉰다.
    const wheel = { sum: 0, at: 0, last: 0 };
    screenNode.addEventListener('wheel', event => {
      event.preventDefault();
      const now = performance.now();
      if (now - wheel.last > 300) wheel.sum = 0;
      wheel.last = now;
      wheel.sum += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      if (now - wheel.at < 250 || Math.abs(wheel.sum) < 40) return;
      setZoom(fieldZoom + (wheel.sum < 0 ? 1 : -1));
      wheel.sum = 0;
      wheel.at = now;
    }, { passive: false });
    // 톡 누르면 그곳으로, 누른 채 움직이면 손가락을 계속 따라 걷고, 떼면 그 자리까지 걷고 멈춘다.
    canvas.addEventListener('pointerdown', event => {
      // 트레이너 위를 눌러도 다른 곳과 같다: 누른 자리로 걷는다(2026-11-14 가방은 오른쪽 위 「가방」 버튼으로 옮김). 배를 탄 채면 물을 누르면
      // 그 물 위로, 바로 옆 부두·모래를 누르면(앉은 트레이너 둘레여도) 거기로 내린다(walkTargetAt).
      // 걷는 동안 배 그림을 누르면 배 곁 땅·부두로 걸어가 탄다(boatCallAt·updateBoat).
      field.boatCall = boatCallAt(canvas, event.clientX, event.clientY);
      field.target = field.boatCall || walkTargetAt(canvas, event.clientX, event.clientY);
      field.chase = null;
      field.drag = event.pointerId;
      field.hint = 0;
      field.marker = { x: field.target.x, y: field.target.y, age: 0 };
      canvas.setPointerCapture?.(event.pointerId);
      canvas.focus({ preventScroll: true });
    });
    canvas.addEventListener('pointermove', event => {
      if (field.drag !== event.pointerId) return;
      field.boatCall = boatCallAt(canvas, event.clientX, event.clientY);
      field.target = field.boatCall || walkTargetAt(canvas, event.clientX, event.clientY);
    });
    const release = event => { if (field.drag === event.pointerId) field.drag = null; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    for (const ballButton of main.querySelectorAll('[data-field-ball]')) {
      ballButton.addEventListener('pointerdown', event => {
        event.preventDefault();
        chaseBall(Number(ballButton.dataset.fieldBall));
        canvas.focus({ preventScroll: true });
      });
      ballButton.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          chaseBall(Number(ballButton.dataset.fieldBall));
        }
      });
    }
    updateHeader();
  }
  function learningLevels() {
    const settings = S.state.settings;
    return { math: settings.mathMax || 10, korean: settings.koreanLevel || 1, english: settings.englishLevel || 1 };
  }
  // 배틀 화면 상태(게임 규칙이 아니라 보이는 방식). 문제 팝업이 열렸는지, 문제 아래 힌트, 카메라 위치, 방금 잠근 보기,
  // 등장·잡았다·도망 순간의 한 줄.
  let battlePopup = false;
  let battleHint = '';
  let battleCamera = 'wide';
  let battleLastWrong = null;
  let battleCallout = '';
  // 공개 뒤 첫 문제 전 「어떻게 잡을까?」(공격하기·먹이 주기) 팝업이 떠 있는지. 고른 방법은 battle.method('attack'·'feed')에 둔다.
  let battleChoosing = false;
  // 시점(ms). 보기 표시 → 팝업 닫힘 → 장면 연출. AdventureMotion.feedback 의 타격 시점과 HP 막대가 함께 움직인다.
  // 2026-11-13 사용자: 전환이 너무 빨라 긴장감이 없다 → 고른 답을 오래 보이고, 카메라·타격·공개를 천천히.
  // 같은 날 「아직도 빨라 2배 느리게」: 연출(팝업 열고 닫기·카메라·공개·포획)을 1.5~2배로. 답을 누른 뒤 다음 문제까지
  // 기다리는 시간은 아이가 지루하지 않게 약 3.7초(표시 0.9 + 닫힘 0.5 + 공격 2.3)로 둔다.
  // 짝: css/battle-view.css 팝업 닫힘 .5s·카메라 1.3s, js/adventure-motion.js feedback 타격 0.76초.
  const ANSWER_MARK_MS = 900;
  const POPUP_CLOSE_MS = 500;
  const CAMERA_MS = 1400;
  const HP_IMPACT_MS = 800;
  const ENCOUNTER_ALERT_MS = 750; // 필드 「!」가 떠 있는 시간
  const REVEAL_SUSPENSE_MS = 1200;
  const REVEAL_HOLD_MS = 1800;
  const RUN_AWAY_MS = 1400;
  const CAUGHT_READ_MS = 2600; // 잡은 뒤 울음소리(0.9초에 시작)가 끝난 다음
  const ENCOUNTER_READ_MS = 1700; // 그림자 만남 글이 뜨는 때(css/encounter-intro.css 1.6초)
  const ENCOUNTER_CRY_MS = 4300; // 글 읽기(2.5초 안팎)가 끝난 뒤
  const FALLBACK_HINTS = { math: '그림을 하나씩 세어 보자!', korean: '글자 모양을 천천히 다시 보자!', english: '그림을 보고 소리 내어 말해 보자!', creative: '문제를 한 번 더 천천히 읽어 보자!' };
  // 몬스터볼 그림은 여기 한 곳에서 정한다. Codex 새 그림(img/art/balls/*.png)이 있으면 CSS 변수(--gb-<이름>-art)로 바꿔 끼우고,
  // 없으면 battle-view.css 의 기본값(같은 새 그림 img/art/balls/ball-red.png·ball-gold.png)을 쓴다.
  const BALL_ART_DIR = 'img/art/balls/';
  // 흔들림 그림(ball-red-wiggle-*.png)은 쓰지 않는다: 같은 볼을 기울이는 흔들림이 맞다(css/battle-view.css --gb-turn, 2026-11-14 사용자).
  const BALL_ART = ['ball-red', 'ball-gold', 'ball-red-open', 'ball-gold-open', 'ball-shadow', 'ball-red-small'];
  function useBallArt() {
    if (typeof Image !== 'function' || !document.documentElement?.style) return;
    const apply = (name, source) => document.documentElement.style.setProperty(`--gb-${name}-art`, `url("${source}")`);
    // 첫 그림이 없으면 나머지도 아직 안 들어온 것으로 보고 더 묻지 않는다(콘솔 404 를 한 번만).
    const probe = new Image();
    probe.onload = () => {
      apply(BALL_ART[0], probe.src);
      for (const name of BALL_ART.slice(1)) { const image = new Image(); image.onload = () => apply(name, image.src); image.src = BALL_ART_DIR + name + '.png'; }
    };
    probe.src = BALL_ART_DIR + BALL_ART[0] + '.png';
  }
  useBallArt();
  // 배틀 멘트(목록은 battle-view.js 의 LINES 한 곳). 화면 모듈이 없을 때(시험 계측)는 빈 문장.
  // 우리 편 자리에 포켓몬 없이 트레이너만 있는 배틀(튜토리얼 첫 배틀). 이때는 공격 대신 열매로 마음을 연다.
  function trainerAlone() { return Boolean(document.querySelector('.go-battle .gb-trainer')); }
  function battleLine(kind, name) { return window.BattleView?.line ? BattleView.line(kind, name) : ''; }
  // tutorialPokemon: 튜토리얼 첫 배틀(필드 없이 정해 둔 포켓몬). 도망가지 않고(core.js) 그림자 팝업은 글 대신 보기가 차례로 톡톡 반짝여 누를 곳을 알려 준다.
  function encounter(gold, tutorialPokemon = null, picked = null) {
    const selected = tutorialPokemon || picked || R.choose(POKEMON, S.state.caught, region, gold, S.state.settings.difficulty);
    if (!selected) {
      fieldSay('done');
      field.cooldown = 3;
      return;
    }
    getImage(selected.id);
    battle = R.newBattle(selected, gold);
    battle.tutorial = Boolean(tutorialPokemon);
    // 대표 포켓몬 없이 트레이너뿐인 배틀(튜토리얼 첫 배틀 포함)은 「어떻게 잡을까?」를 묻지 않고 늘 열매로 마음을 연다.
    // 상대 칸도 먹이 주기처럼 처음부터 「마음」 막대가 0 에서 차오르게(예전에는 열매를 던지는데 HP 가 줄었다, 2026-11-14). 연출·HP 규칙은 그대로.
    if (battle.tutorial || !POKEMON.some(p => p.id === S.state.companion)) battle.method = 'feed';
    battlePopup = false; battleHint = ''; battleLastWrong = null; battleCallout = '';
    battleChoosing = false;
    // 발견 순간에는 카메라가 상대 쪽으로 당겨져 있다가, 그림자 소개가 끝나면 전경으로 물러난다.
    battleCamera = 'enemy';
    const decoys = R.shuffle(POKEMON.filter(p => p.id !== selected.id && p.gen <= Math.max(1, selected.gen))).slice(0, 3);
    nameOptions = R.shuffle([selected.name, ...decoys.map(p => p.name)]);
    for(const pokemon of [selected,...decoys])spriteImage(modelImagePath(pokemon.id));
    // 금색 볼도 부모가 고른 단계의 문제를 낸다(개수만 4개). 최근에 푼 문제 30개는 되도록 다시 내지 않는다.
    questions = QuestionBank.pick({ area: S.state.settings.area, difficulty: S.state.settings.difficulty, levels: learningLevels(), count: battle.total, exclude: usedQuestions });
    usedQuestions = [...usedQuestions, ...questions.map(q => q.id)].slice(-30);
    sound('encounter');
    // 잡은 순간의 징글 Success3 를 미리 받아 둔다(2026-11-15, 잡았다 카드 동안은 음악 없이 이 징글 한 번).
    window.Sfx?.prepare?.('caught');
    const appeared=battle,owner=S.user?.name;
    const stillHere=()=>screen==='battle'&&battle===appeared&&!appeared.runningAway&&S.user?.name===owner;
    // 필드에서 만나면 먼저 트레이너 머리 위에 「!」가 톡 뜨고(「뜨든—」), 잠깐 뒤 번쩍·소용돌이 전환으로 배틀에 들어간다(2026-11-13 사용자).
    const alertMs = screen === 'field' && field && !tutorialPokemon && !motionPreference?.matches ? ENCOUNTER_ALERT_MS : 0;
    if (alertMs) { field.alertUntil = field.time + alertMs / 1000; keys.clear(); field.target = null; field.chase = null; field.drag = null; }
    const enterBattle = () => {
    if (alertMs && (screen !== 'field' || battle !== appeared || S.user?.name !== owner)) return;
    // 배틀에서 돌아왔을 때 「!」가 남지 않게(필드 시간은 배틀 동안 멈춰 있다, 2026-11-13 Aside QA).
    if (field) field.alertUntil = 0;
    // 울음소리는 그림자가 다 떠오른 순간(전환 1.24초 + 떠오름 1.8초 안팎)에.
    void travelTo('battle','battle','야생의 포켓몬을 발견했다!','',()=>{
      // 그림자 소개와 카메라가 물러나는 동안은 답을 받지 않는다(팝업도 아직 없다).
      busy=true;
      const intro=window.EncounterIntro?EncounterIntro.show({id:selected.id,region,gold,guard:stillHere}):Promise.resolve(true);
      // 그림자 글(1.6초에 뜸)을 읽어 주고, 읽기가 끝난 뒤 울음소리. 둘 다 그 뒤 문제 읽기와 겹치지 않는다(문제 팝업은 소개가 끝난 뒤).
      setTimeout(()=>{const message=document.querySelector('.encounter-intro p')?.textContent.trim();if(stillHere()&&message)readAloud('encounter-'+selected.id,message);},ENCOUNTER_READ_MS);
      setTimeout(()=>{if(stillHere())cry(selected.id);},ENCOUNTER_CRY_MS);
      void intro.then(async()=>{
        if(!stillHere())return;
        setCamera('wide');
        await pause(CAMERA_MS,stillHere);
        if(!stillHere())return;
        busy=false;
        openBattlePopup();
      });
    });
    };
    if (alertMs) setTimeout(enterBattle, alertMs); else enterBattle();
  }
  function currentQuestion() { return questions[battle.index]; }
  function readBattle(repeat = false) {
    if (!window.Narration || !battle) return false;
    const question = battle.phase === 'silhouette'
      ? { id: 'silhouette-' + battle.pokemon.id, prompt: '누구일까? 그림자를 보고 포켓몬을 골라 보자!', options: nameOptions }
      : battle.phase === 'question' ? currentQuestion() : null;
    if (!question) { Narration.cancel(); return false; }
    return Narration.read({ ...question, prompt: window.PokemonText ? PokemonText.questionPrompt(question.prompt, question.area) : question.prompt }, { repeat, enabled: soundOn() });
  }
  function countingPicture({ left, right, minus, versus, split }) {
    // 식의 왼쪽 수는 왼쪽에, 오른쪽 수는 오른쪽에 그린다(낱개 그림은 countingArt). 10개는 한 묶음(다섯 개씩 두 줄 상자), 나머지는 낱개다.
    // 빼기도 흐리게 하지 않는다. 낱개 크기(--ball)는 그린 뒤 fitCounting 이 팝업 그림 칸에 맞춘다.
    // versus: 크기 비교라 두 무더기 사이에 +·− 대신 빈 간격만 둔다.
    // split: 가르기. 왼쪽(떼어 놓은 수)은 색 테두리, 오른쪽(구할 수)은 점선 테두리 위에 ? 를 단다. 사이 기호 없음.
    const balls = count => '<i></i>'.repeat(count);
    const drawn = left + right;
    const size = drawn <= 20 ? 'large' : drawn <= 60 ? 'medium' : drawn <= 120 ? 'small' : 'tiny';
    const compact = size === 'small' || size === 'tiny';
    const block = count => {
      const packs = Math.floor(count / 10), ones = count % 10;
      // 큰 수는 묶음을 세 줄까지만 쌓아 그림 칸 높이를 넘지 않게 한다.
      const columns = compact ? Math.ceil(packs / 3) : Math.min(3, packs);
      const packHtml = packs ? `<span class="gb-count-packs" style="--columns:${columns}">${`<span class="gb-ten">${balls(10)}</span>`.repeat(packs)}</span>` : '';
      const onesHtml = ones ? `<span class="gb-count-ones" style="--columns:${Math.min(5, ones)}">${balls(ones)}</span>` : '';
      return `<span class="gb-count-block">${packHtml}${onesHtml}</span>`;
    };
    const between = split ? '' : versus ? '<b style="width:var(--ball)"></b>' : `<b>${minus ? '−' : '+'}</b>`;
    const leftHtml = split ? `<span class="gb-count-part">${block(left)}</span>` : block(left);
    const rightHtml = split ? `<span class="gb-count-part is-unknown"><b class="gb-count-mark">?</b>${block(right)}</span>` : block(right);
    // 낱개 그림: 문제마다 도트 포켓몬·낱말 그림 중 하나(문제 글이 몬스터볼을 말하면 몬스터볼). js/learning-art.js countingArt.
    const art = window.LearningArt?.countingArt?.(currentQuestion());
    return `<div class="gb-count gb-count--${size}${art ? ' ' + art.className : ''}"${art ? ` style="${art.style}"` : ''} aria-hidden="true">${leftHtml}${right ? between + rightHtml : ''}</div>`;
  }
  // 학습 그림(그림판 한 칸) 또는 큰 글자(ㄱ·A 등).
  function visualPicture(visual) {
    const html = LearningArt.html(visual);
    return `<div class="gb-visual${html.includes('learning-picture') ? '' : ' is-letter'}"><span>${html}</span></div>`;
  }
  // 아이콘 + 짧은 글자 버튼. 아이콘은 공통 부품(.ui-icon .icon-이름).
  function battleButton(label, action, iconName, secondary = false) {
    return `<button class="gb-button${secondary ? ' is-secondary' : ''}" data-action="${action}"><span class="ui-icon icon-${iconName}" aria-hidden="true"></span><span>${label}</span></button>`;
  }
  // options.scene: 팝업·버튼 없이 장면만(공격·피격 연출용). stay: 팝업을 다시 띄우는 효과 없이 내용만 바꿈.
  // hpDelay: HP 막대가 줄기 시작하는 시점. revealing: 공개 연출 직전이라 그림자를 유지.
  function battleScreen(options = {}) {
    const pokemon = battle.pokemon;
    const phase = battle.phase;
    // choosing: 문제 팝업 대신 「어떻게 잡을까?」 팝업(같은 자리). 그동안 문제는 그리지도 읽지도 않는다.
    const choosing = !options.scene && battlePopup && battleChoosing && phase === 'question';
    const popup = !options.scene && battlePopup && !choosing && ['silhouette', 'question'].includes(phase);
    let heading = '', controls = '', artwork = '', questionId = null, trace = false, area = '';
    if (phase === 'silhouette') {
      heading = '이 그림자는 누구일까?';
      artwork = `<img class="gb-art-silhouette" src="${modelImagePath(pokemon.id)}" alt="이름을 맞혀 볼 포켓몬 그림자" draggable="false">`;
      controls = answerButtons(nameOptions, true);
    } else if (phase === 'question' && !choosing) {
      const question = currentQuestion();
      questionId = question.id;
      area = question.area;
      heading = window.PokemonText ? PokemonText.questionPrompt(question.prompt, question.area) : question.prompt;
      artwork = question.counting ? countingPicture(question.counting) : question.visual && question.visual !== question.trace ? visualPicture(question.visual) : '';
      trace = Boolean(question.trace);
      controls = trace
        ? `<div class="gb-trace" data-guided="${guidedTrace(question.trace)}"><div class="gb-trace-box"><canvas class="gb-trace-pad" id="trace-canvas" aria-label="${escape(question.trace)} 따라 쓰기"></canvas></div><div class="gb-trace-buttons">${battleButton('지우개', 'eraser-trace', 'eraser', true)}${battleButton('다 썼어요', 'check-trace', 'done')}</div></div>`
        // 그림이 문제에 이미 있으면(그림 보고 낱말 고르기) 보기에 그림을 붙이면 답이 드러나므로 글자만.
        : answerButtons(question.options, false, !question.visual && !question.counting);
    } else if (phase === 'reveal' || phase === 'caught' || phase === 'fled') {
      heading = battleCallout;
      // 잡았다·도망 화면은 큰 버튼 하나만(도감은 필드 모서리 버튼으로 간다).
      // 튜토리얼 첫 포획 뒤에는 필드가 없으니 지역 고르기로 간다.
      if (phase !== 'reveal') controls = battle.tutorial ? battleButton('모험 떠나기', 'regions', 'map') : battleButton('계속', 'back-field', 'map') + battleButton('다른 마을 가기', 'regions', 'map', true);
    }
    const companionId = S.state.companion;
    const companionPokemon = POKEMON.find(p => p.id === companionId);
    const previousOwnHp = Number(document.querySelector('.gb-hp--own')?.getAttribute?.('aria-valuenow'));
    const previousEnemyHp = Number(document.querySelector('.gb-hp--enemy')?.getAttribute?.('aria-valuenow'));
    // 먹이 주기의 마음 막대(.gb-hp--heart)도 같은 방식으로 차오른다. 공격 → 마음으로 바뀌는 순간은 막대 이름이 달라 움직이지 않는다.
    const previousHeart = Number(document.querySelector('.gb-hp--heart')?.getAttribute?.('aria-valuenow'));
    main.innerHTML = BattleView.render({
      battle, region, heading, controls, artwork, questionId, trace, popup, choosing, area,
      hint: popup ? battleHint : '', stay: options.stay === true, scene: options.scene === true, revealing: options.revealing === true,
      camera: battleCamera, userName: S.user?.name || '트레이너', ambient: window.AmbientScene?.html(region) || '',
      companion: companionPokemon ? {id:companionId,name:companionPokemon.name,backUrl:modelImagePath(companionId, true)} : null
    });
    if (!motionPreference?.matches) {
      for (const [selector, previous] of [['.gb-hp--own',previousOwnHp],['.gb-hp--enemy',previousEnemyHp],['.gb-hp--heart',previousHeart]]) {
        const bar = document.querySelector(selector);
        const fill = bar?.querySelector?.('.gb-hp-fill');
        if (fill?.animate && Number.isFinite(previous)) {
          const maximum = Number(bar.getAttribute('aria-valuemax'));
          const current = Number(bar.getAttribute('aria-valuenow'));
          if (previous !== current) fill.animate([{transform:'scaleX(' + previous/maximum + ')'},{transform:'scaleX(' + current/maximum + ')'}], {duration:1100,delay:options.hpDelay||0,easing:'ease-out',fill:'backwards'});
        }
      }
    }
    // 획 순서 시범은 팝업이 새로 뜰 때(통통 커진 뒤)와 힌트와 함께 남는 오답 뒤(traceDemo)에만. 화면을 돌려 다시 그릴 때(stay)는 쓰던 것만 잇는다.
    if (popup && phase === 'question' && trace) traceWhenSettled(currentQuestion().trace, !options.stay || options.traceDemo === true);
    else { tracingPad?.destroy(); tracingPad = null; }
    if (popup) fitCounting();
    // 튜토리얼 그림자 문제: 안내 글 대신 그림자가 두근거리고 보기 버튼이 차례로 톡톡 반짝인다(2026-11-13 사용자: 글로 말고 화면으로).
    if (popup && battle.tutorial && phase === 'silhouette') document.querySelector('.go-battle .gb-popup')?.classList?.add('gb-guide');
    // 피카츄 그림은 꼬리를 제외한 몸통 축을 가운데로 맞춘 투명 여백을 갖는다.
    // 꼬리까지 세는 무게 중심 보정을 또 하면 몸통이 다시 옆으로 밀린다.
    if (phase === 'caught' && Number(battle.pokemon.id) !== 25) centerByMass(document.querySelector('.go-battle .gb-result-pokemon'));
    // 문제는 팝업이 처음 뜰 때만 읽는다. 장면만 보일 때는 읽던 것을 멈춘다(선택 팝업은 음성 안내가 한마디 하므로 끊지 않는다).
    if (popup) { if (!options.stay) readBattle(); }
    else if (!choosing) window.Narration?.cancel();
    musicForScreen();
    updateHeader();
  }
  // showPokemon: 그림자 퀴즈(보기마다 3D 앞모습). withPictures: 보기 낱말이 물건·동물 등이면 네 보기 모두 그림이 있을 때만 그림+낱말.
  function answerButtons(options, showPokemon = false, withPictures = false) {
    // 그림만 있는 보기(같다·다르다의 ‘pokemon:25#1’ 등): 글자 없이 그림만 크게, 2×2.
    const pictureOnly = !showPokemon && options.every(option => window.LearningArt?.tokenPicture?.(option));
    // 긴 보기(영어 낱말·긴 이름)가 있으면 2×2 대신 한 줄에 하나씩 놓아 잘리지 않게 한다.
    const list = !pictureOnly && options.some(option => labelWidth(option) > 4.8) ? ' gb-answers--list' : '';
    // 문제에 그림이 이미 있으면 낱말 그림은 빼고, 도형 보기(‘빨간 세모’ 등)만 그림으로 고른다.
    // 단, 그림 줄 규칙 문제(‘사과, 바나나, ?’)는 줄에 보기 그림이 이미 보여 답을 알려 주지 않으니 보기도 그림으로.
    const pictureRow = !showPokemon && /, \?$/.test(currentQuestion()?.visual || '');
    const learned = showPokemon ? null : window.LearningArt?.optionPictures?.(options, { shapesOnly: !withPictures && !pictureRow }) || null;
    return `<div class="gb-answers${list}${learned ? ' has-pictures' : ''}${pictureOnly ? ' is-picture-only' : ''}">${options.map((option, index) => {
      const pokemon = showPokemon ? POKEMON.find(item => item.name === option) : null;
      const locked = battle.wrong.includes(option);
      const picture = pokemon ? `<img class="gb-answer-picture" src="${modelImagePath(pokemon.id)}" alt="" draggable="false">`
        : learned ? `<img class="gb-answer-picture is-learn${LearningArt.isSmall(option) ? ' learning-small' : ''}" src="${learned[index]}" alt="" draggable="false">` : '';
      // 틀린 보기는 흐리게만 한다(X 표시 없음, 2026-11-13 사용자).
      const mark = '';
      // 그림만 있는 보기도 값은 숨긴 글자로 남긴다(화면·읽기에는 안 나오고, 브라우저 시험이 보기 값으로 답을 찾는다).
      const label = `<span class="gb-answer-label${JAMO_ONLY.test(option) ? ' is-jamo' : ''}"${pictureOnly ? ' hidden' : ''}>${escape(option)}</span>`;
      // 보기 번호(2026-11-14 「보기에 번호가 안 써져 있다. 읽어 주긴 하는데」): 읽어 주는 「N번」(narration.js)·키보드 N·aria-keyshortcuts 와 같은 index + 1.
      // 보기를 읽지 않는 문제(silentOptions)에도 늘 보인다: 번호는 자리일 뿐 답을 알려 주지 않고, 키보드 1~4 와 맞고 화면이 한결같다. 화면 읽기에는 글자만(aria-hidden).
      return `<button class="gb-answer${picture ? ' has-picture' : ''}${locked && option === battleLastWrong ? ' just-locked' : ''}" data-answer="${index}" aria-keyshortcuts="${index + 1}"${pictureOnly ? ` aria-label="그림 ${index + 1}"` : ''}${locked || busy ? ' disabled' : ''}><span class="gb-answer-no" aria-hidden="true">${index + 1}</span>${picture}${label}${mark}</button>`;
    }).join('')}</div>`;
  }
  // 자음·모음 하나(ㄱ·ㅏ 등 호환 자모)는 글꼴이 글자보다 훨씬 작게 그려서 따로 키운다.
  const JAMO_ONLY = /^[\u3131-\u318E]$/;
  // 글자 폭 어림(em): 한글·기호는 1, 영문·숫자는 0.6.
  function labelWidth(value) { return [...String(value)].reduce((sum, character) => sum + (/[\x20-\x7e]/.test(character) ? 0.6 : 1), 0); }
  // 팝업이 통통 튀며 커지는 동안에는 연습장 크기를 재지 않는다(작게 잰 크기로 글자를 그리지 않게). 다 커진 뒤에 만든다(시범도 그때부터).
  function traceWhenSettled(letter, demo = false) {
    tracingPad?.destroy(); tracingPad = null;
    const card = document.querySelector('.go-battle .gb-card');
    const running = card?.getAnimations?.() || [];
    if (!running.length) { setupTracing(letter, demo); return; }
    const canvas = document.querySelector('#trace-canvas');
    void Promise.all(running.map(animation => animation.finished.catch(() => {}))).then(() => {
      if (canvas?.isConnected && document.querySelector('#trace-canvas') === canvas) setupTracing(letter, demo);
    });
  }
  // 그림 상자 가운데가 아니라 포켓몬 몸(칠해진 부분)의 무게 중심이 칸 가운데에 오도록 옆으로 옮긴다.
  // 피카츄처럼 한쪽으로 긴 꼬리가 있으면 몸이 한쪽으로 쏠려 보이던 것(2026-11-13 사용자). 옮기는 폭은 칸 너비의 20%까지.
  function centerByMass(image) {
    if (!image || typeof document.createElement !== 'function') return;
    const apply = () => {
      const width = image.clientWidth, height = image.clientHeight, naturalWidth = image.naturalWidth, naturalHeight = image.naturalHeight;
      if (!width || !height || !naturalWidth || !naturalHeight) return;
      const canvas = document.createElement('canvas');
      const sample = 48;
      canvas.width = sample;
      canvas.height = Math.max(1, Math.round(sample * naturalHeight / naturalWidth));
      const context = canvas.getContext?.('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let weighted = 0, total = 0;
      try {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] < 40) continue;
          weighted += ((index - 3) / 4 % canvas.width + .5) * pixels[index];
          total += pixels[index];
        }
      } catch { return; }
      if (!total) return;
      const drawnWidth = naturalWidth * Math.min(width / naturalWidth, height / naturalHeight);
      const shift = clamp(drawnWidth * (.5 - weighted / total / canvas.width), -width * .2, width * .2);
      image.style.translate = `${Math.round(shift)}px 0`;
    };
    if (image.complete && image.naturalWidth) apply(); else image.addEventListener?.('load', apply, { once: true });
  }
  function setCamera(value) {
    battleCamera = value;
    const node = document.querySelector('.go-battle');
    if (node?.dataset) node.dataset.camera = value;
  }
  // 시간만 기다리는 단계. 화면·계정·전투가 바뀌거나 AdventureMotion.cancel()이 오면 false.
  // keepTime: 모션 줄이기에서도 멈춘 화면을 그만큼 보여 준다(움직임만 뺀다).
  function pause(milliseconds, guard, keepTime = false) {
    if (!window.AdventureMotion) return new Promise(resolve => setTimeout(() => resolve(guard()), milliseconds));
    return AdventureMotion.sequence([], { duration: milliseconds, guard, keepTime });
  }
  function openBattlePopup() {
    // 설정 창(배틀 안 설정 버튼)이 떠 있으면 창을 닫은 뒤에 띄운다(창 뒤에서 팝업이 뜨고 문제를 읽어 아이가 못 듣지 않게).
    if (deferBattleStep(openBattlePopup)) return;
    battlePopup = true;
    battleScreen();
  }
  function closeBattlePopup(guard) {
    battlePopup = false;
    const popup = document.querySelector('.go-battle .gb-popup');
    if (!popup?.classList || motionPreference?.matches) return Promise.resolve(guard());
    popup.classList.add('is-closing');
    return pause(POPUP_CLOSE_MS, guard);
  }
  // 셈 그림을 팝업 그림 칸에 꼭 맞춘다. 묶음을 몇 줄로 쌓을지(--columns)와 볼 하나 크기(--ball)를 바꿔 보며
  // 칸을 넘지 않는 가장 큰 볼을 고른다. 묶음 수는 그대로라 10개 한 묶음은 지켜진다.
  function fitCounting() {
    const art = document.querySelector('.go-battle .gb-art');
    const picture = art?.querySelector?.('.gb-count');
    if (!picture?.style) return;
    const packs = [...picture.querySelectorAll('.gb-count-packs')];
    const most = Math.max(1, ...packs.map(node => node.children.length));
    const fits = () => picture.offsetWidth <= art.clientWidth && picture.offsetHeight <= art.clientHeight;
    const largest = () => {
      let small = 4, large = 64;
      for (let step = 0; step < 8; step++) {
        const size = (small + large) / 2;
        picture.style.setProperty('--ball', size + 'px');
        if (fits()) small = size; else large = size;
      }
      return Math.floor(small);
    };
    // 낱개는 항상 한 줄 최대5개: 7개는5+2다. 화면이 좁으면 배열 대신 그림 크기를 줄인다.
    const ones = [...picture.querySelectorAll('.gb-count-ones')];
    // 묶음과 낱개를 위아래(column)로 둘지 나란히(row)로 둘지도 고른다. 세로 폰의 큰 수 비교(37 vs 27)는 위아래가 훨씬 크다(2026-11-13 Aside QA).
    const mixed = [...picture.querySelectorAll('.gb-count-block')].some(node => node.children.length > 1);
    const layout = ({ flow, columns }) => {
      picture.dataset.flow = flow;
      for (const node of packs) node.style.setProperty('--columns', Math.min(columns, node.children.length));
      for (const node of ones) node.style.setProperty('--columns', Math.min(5, node.children.length));
    };
    let best = { size: 0, flow: 'column', columns: 1 };
    for (const flow of mixed ? ['column', 'row'] : ['column']) {
      for (let columns = 1; columns <= Math.min(most, 5); columns++) {
        layout({ flow, columns });
        const size = largest();
        if (size > best.size) best = { size, flow, columns };
      }
    }
    layout(best);
    picture.style.setProperty('--ball', best.size + 'px');
  }
  function hintFor(question) {
    if (!question) {
      const first = [...battle.pokemon.name][0];
      const code = first.charCodeAt(0) - 0xAC00;
      return `첫 글자는 ‘${first}’${code >= 0 && code < 11172 && code % 28 ? '이야' : '야'}!`;
    }
    return question.hint || FALLBACK_HINTS[question.area] || '천천히 다시 생각해 보자!';
  }
  function selectAnswer(index) {
    if (window.EncounterIntro?.active || busy || battleChoosing || !battle || !['silhouette','question'].includes(battle.phase)) return;
    const options = battle.phase === 'silhouette' ? nameOptions : currentQuestion().options;
    const correct = battle.phase === 'silhouette' ? battle.pokemon.name : currentQuestion().answer;
    const selected = options[index];
    if (selected === undefined || battle.wrong.includes(selected)) return;
    judgeAnswer(selected, correct, index);
  }
  // index: 누른 보기 위치(따라 쓰기는 없음). 고른 칸에 정답(톡)·오답(흔들림) 표시를 먼저 보인다.
  function judgeAnswer(selected, correct, index = null) {
    // 보기를 누르는(따라 쓰기는 「다 썼어요」) 순간 문제·보기 읽기를 멈춘다. 오답 힌트·다음 문제 읽기는 이 뒤에 새로 시작한다.
    window.Narration?.cancel();
    const asked = battle.phase === 'question' ? currentQuestion() : null;
    const motionBattle = battle, motionOwner = S.user?.name;
    const motionId = ++answerMotionId;
    window.AdventureMotion?.cancel();
    const guard = () => battle === motionBattle && screen === 'battle' && S.user?.name === motionOwner && answerMotionId === motionId;
    const heartsBefore = battle.hearts;
    const right = R.answer(battle, selected, correct);
    if (!right && asked && !battle.tutorial) { battle.missed = true; setPerfectStreak(0); }
    const fled = battle.phase === 'fled';
    sound(right ? 'correct' : fled ? 'flee' : 'wrong');
    if (!right && battle.hearts === heartsBefore) {
      // 첫 오답(또는 더 잃지 않는 세 번째 오답): 팝업은 그대로 두고 고른 보기를 회색으로 잠근 뒤 문제 아래에 힌트를 보인다.
      // 따라 쓰기는 새 빈 연습장에 획 순서 시범을 한 번 더 보인다(traceDemo).
      battleHint = hintFor(asked);
      battleLastWrong = selected;
      battleScreen({ stay: true, traceDemo: true });
      battleSpeech(battleLine('firstMiss'), 'wrong');
      if (soundOn()) window.Narration?.read({ id: `hint-${asked?.id || 'silhouette'}-${battle.wrong.length}`, area: asked?.area, prompt: battleHint, options: [] }, { repeat: true });
      return;
    }
    battleLastWrong = null;
    if (right) battleHint = '';
    if (fled && asked) battle.missedAnswer = asked.answer;
    // 표시 → 팝업 닫힘 → 장면 연출 동안은 입력을 잠근다. 늦은 단계는 guard 가 막는다.
    busy = true;
    void playAnswer(right, fled, guard, index);
  }
  async function playAnswer(right, fled, guard, index) {
    const chosen = index === null ? document.querySelector('.go-battle .gb-trace-box') : document.querySelector(`.go-battle .gb-answer[data-answer="${index}"]`);
    if (chosen?.classList) {
      chosen.classList.add(right ? 'is-right' : 'is-wrong');
      if (!await pause(ANSWER_MARK_MS, guard, true) || !guard()) return;
    }
    if (!await closeBattlePopup(guard) || !guard()) return;
    const name = battle.pokemon.name;
    // 먹이 주기로 잡는 중이거나 우리 편이 트레이너뿐이면 공격 대신 열매(맞히면 냠냠, 두 번째 오답이면 고개를 홱). HP 규칙은 공격과 같다.
    const feeding = battle.method === 'feed';
    if (!right) {
      // 두 번째 오답: 상대의 공격을 맞고 HP 100이 줄어든다. 남아 있으면 같은 문제 팝업이 다시 뜬다(잠긴 보기·힌트 유지).
      battleScreen({ scene: true, hpDelay: HP_IMPACT_MS });
      battleSpeech(battleLine(feeding || trainerAlone() ? 'shy' : 'hit', name), 'wrong');
      await (window.AdventureMotion?.feedback('wrong', guard, { feed: feeding }) || pause(1400, guard));
      if (!guard()) return;
      busy = false;
      if (fled) { battleCallout = battleLine('fled', name); battleScreen(); window.VoiceGuide?.say('battle', { text: battleCallout, guard: () => !modalRoot.firstChild }); return; }
      openBattlePopup();
      return;
    }
    if (battle.phase === 'reveal') {
      // 그림자 정답: HP 칸 없이 화면 가운데에 크게 하얗게 번쩍이며 정체를 보이고(이름 한 줄), 배틀 자리로 물러난 뒤 첫 문제 팝업.
      // 공개 소리는 그 포켓몬의 울음소리 하나(2026-11-14 사용자 「포켓몬 그림자 맞추면 포켓몬 울음소리로 변경」): 예전에는 번쩍 1.4초 뒤
      // 음성 안내가 「피카츄였어!」를 기계 목소리로 읽어 울음소리 끝에 겹쳤다. 화면의 한 줄 글은 그대로. 울음소리는 소리 설정을 따른다(끄면 조용히 글만).
      battleCallout = battleLine(battle.gold ? 'goldReveal' : 'reveal', name);
      battleScreen({ scene: false, revealing: true });
      // 울음소리 위에 다른 말이 얹히지 않게 기다리던 안내(그림자 오답 멘트 등)도 지운다. 문제 읽기는 답을 누를 때 이미 멈췄다.
      window.VoiceGuide?.cancel();
      // 그림자가 잠깐 부르르 떨다가(누굴까?) 번쩍이며 정체를 드러낸다.
      document.querySelector('.go-battle .gb-stage .gb-pokemon')?.classList?.add('gb-suspense');
      if (!await pause(REVEAL_SUSPENSE_MS, guard, true) || !guard()) return;
      document.querySelector('.go-battle .gb-stage .gb-pokemon')?.classList?.remove('gb-suspense');
      cry(battle.pokemon.id);
      await (window.AdventureMotion?.reveal(guard) || Promise.resolve(true));
      if (!guard() || !await pause(REVEAL_HOLD_MS, guard, true) || !guard()) return;
      R.startQuestions(battle);
      // 같은 장면에서 상대가 배틀 자리로 옮겨 가고 HP 칸이 나타난다(CSS 전환).
      const section = document.querySelector('.go-battle');
      if (section?.dataset) section.dataset.phase = battle.phase;
      for (const node of document.querySelectorAll('.go-battle .gb-callout, .go-battle .gb-tag')) node.remove();
      if (!await pause(CAMERA_MS, guard) || !guard()) return;
      // 첫 팝업의 문제 읽기·음성 안내가 울음소리 끝을 덮지 않게 남은 만큼 기다린다. 보통은 이미 끝났고(울음소리는 길어야 2.3초, 여기까지 약 5초),
      // 모션 줄이기에서는 번쩍·카메라 시간이 없어 1.8초 만에 여기 온다(긴 울음소리가 문제 읽기에 묻혔다).
      const crying = window.Sfx?.cryLeft?.() || 0;
      if (crying && (!await pause(crying, guard, true) || !guard())) return;
      busy = false;
      // 대표 포켓몬과 함께면 첫 문제 전에 「어떻게 잡을까?」를 묻는다. 튜토리얼·트레이너뿐인 배틀은 묻지 않고 지금처럼 열매.
      if (asksCatchMethod()) { openMethodPopup(); return; }
      openBattlePopup();
      return;
    }
    const last = battle.phase === 'question' && battle.index === battle.total - 1;
    battleScreen({ scene: true, hpDelay: HP_IMPACT_MS });
    battleSpeech(feeding || trainerAlone() ? battleLine('befriend', battle.pokemon.name) : battleLine(last ? 'lastQuestion' : 'correct'), 'correct');
    await (window.AdventureMotion?.feedback('correct', guard, { feed: feeding }) || pause(1500, guard));
    if (!guard()) return;
    busy = false;
    // 마지막 문제까지 맞히면 버튼 없이 바로 던진다.
    if (battle.phase === 'capture') { void throwBall(); return; }
    openBattlePopup();
  }
  // 「어떻게 잡을까?」(2026-11-14 사용자 「포켓몬 그림자 맞춘 다음에 공격으로 잡을지 먹이로 잡을지 선택」): 공개가 끝나고 첫 문제 전에 한 번.
  // 공격하기는 지금 그대로, 먹이 주기는 정답마다 열매를 던지고 상대 칸이 「마음」 막대로 차오른다. 문제 수·HP·보상은 같다(고르는 재미만 다르다).
  // 튜토리얼 첫 배틀과 대표 포켓몬이 없는 배틀(사람이 포켓몬을 때리지 않는다)은 묻지 않는다.
  function asksCatchMethod() { return Boolean(battle && !battle.tutorial && !battle.method && battle.phase === 'question' && !trainerAlone()); }
  function openMethodPopup() {
    if (deferBattleStep(openMethodPopup)) return;
    battleChoosing = true;
    battlePopup = true;
    battleScreen();
    // 소리로만 한마디(화면에 안내 글을 더 띄우지 않는다). 그사이 고르거나 화면이 바뀌거나 설정 창을 열면 말하지 않는다.
    const asked = battle, owner = S.user?.name;
    window.VoiceGuide?.say('catchMethod', { guard: () => screen === 'battle' && battle === asked && battleChoosing && S.user?.name === owner && !modalRoot.firstChild });
  }
  // 고르면 팝업이 닫히고(0.5초) 그 방법으로 첫 문제 팝업. 닫히는 동안 도망치자·화면 전환·계정 변경이 오면 guard 가 막는다.
  function chooseMethod(method) {
    if (!battleChoosing || busy || screen !== 'battle' || battle?.phase !== 'question' || !['attack', 'feed'].includes(method)) return;
    battle.method = method;
    battleChoosing = false;
    busy = true;
    window.VoiceGuide?.cancel();
    const chosenBattle = battle, owner = S.user?.name, motionId = ++answerMotionId;
    const guard = () => battle === chosenBattle && screen === 'battle' && S.user?.name === owner && answerMotionId === motionId;
    void closeBattlePopup(guard).then(() => {
      if (!guard()) return;
      busy = false;
      openBattlePopup();
    });
  }
  function backToField() {
    if (field) { field.cooldown = 2; field.target = null; field.chase = null; field.drag = null; }
    void travelTo('field', 'return', '다음 포켓몬을 만나러 가자!');
  }
  // 「도망치자」: 잡지 않고 필드로. 진행 중이던 연출·팝업·읽기를 모두 끊고(answerMotionId 를 올려 늦은 타이머가 못 돌게),
  // 말풍선 한마디 뒤 도망(HP 0)과 같은 길로 필드에 돌아간다. 잡은 기록은 건드리지 않는다. battle.runningAway 로 두 번 눌러도 한 번.
  async function runAway() {
    const leaving = battle;
    if (screen !== 'battle' || !leaving || leaving.tutorial || leaving.runningAway || !['silhouette', 'reveal', 'question'].includes(leaving.phase)) return;
    leaving.runningAway = true;
    answerMotionId++;
    window.EncounterIntro?.clear();
    window.AdventureMotion?.cancel();
    window.Narration?.cancel();
    busy = true;
    battlePopup = false;
    battleChoosing = false;
    battleScreen({ scene: true });
    battleSpeech(battleLine('runAway'), 'info');
    const owner = S.user?.name;
    const stillHere = () => screen === 'battle' && battle === leaving && S.user?.name === owner;
    if (!await pause(RUN_AWAY_MS, stillHere) || !stillHere()) return;
    backToField();
  }
  let battleSpeechTimer;
  function battleSpeech(message,kind) {
    let bubble = document.querySelector('#battle-speech');
    if (!bubble) { bubble = document.createElement('div'); bubble.id = 'battle-speech'; bubble.setAttribute('role','status'); document.body.appendChild(bubble); }
    // 팝업이 닫힌 장면(정답 공격·피격·던지기)의 멘트는 화면 위에서 1/4 지점, 팝업이 열려 있으면 팝업 위 띠(가리지 않게).
    bubble.className = 'gb-speech ' + kind + (battlePopup ? '' : ' gb-speech--scene');
    bubble.textContent = message;
    clearTimeout(battleSpeechTimer);
    battleSpeechTimer = setTimeout(() => bubble.remove(), 2200);
    window.VoiceGuide?.say('battle', { text: message, guard: () => !modalRoot.firstChild });
  }
  // 가로세로가 바뀌면 열린 팝업을 새 크기로 다시 그린다(높이만 바뀌는 사파리 도구막대 변화에는 그림 크기만 맞춘다).
  let battleViewportWidth = window.innerWidth, battleResizeTimer;
  window.addEventListener('resize', () => {
    if (screen !== 'battle' || !battle) return;
    clearTimeout(battleResizeTimer);
    battleResizeTimer = setTimeout(() => {
      if (screen !== 'battle' || !battle) return;
      const widthChanged = window.innerWidth !== battleViewportWidth;
      battleViewportWidth = window.innerWidth;
      if (widthChanged && battlePopup && !busy) battleScreen({ stay: true });
      else if (battlePopup) fitCounting();
    }, 180);
  });
  async function throwBall() {
    if (busy || battle.phase !== 'capture') return;
    const captureBattle = battle;
    const captureOwner = S.user?.name;
    answerMotionId++;
    window.AdventureMotion?.cancel();
    busy = true;
    battle.phase = 'throwing';
    battleScreen();
    document.querySelector('#battle-speech')?.remove();
    battleSpeech(battleLine('throw'), 'correct');
    sound('throw');
    const guard = () => battle === captureBattle && S.user?.name === captureOwner;
    // 카메라가 볼을 따라 상대 쪽으로 당겨진다: 회전하며 포물선 → 하얗게 빛나며 빨려 들어감(빛·고리) → 떨어져 쿵 →
    // 흔들림 3번(사이 정적) → 찰칵(톡) → 금빛 고리와 별이 촤라라. 2026-11-13 「2배 느리게」로 7초 → 9.6초.
    // 박자 길이는 css/battle-view.css 의 data-capture-beat 애니메이션과 맞춘다. 효과는 AdventureMotion.burst.
    const section = document.querySelector('.go-battle');
    const effect = kind => () => void window.AdventureMotion?.burst?.(kind, guard);
    const beat = (name, extra) => () => { if (!section?.dataset) return; section.dataset.captureBeat = name; extra?.(); };
    const beats = [
      // 날아가는 동안은 살짝만 당겨 큰 포켓몬(거북왕 등)도 다 보이게, 빨려 들어간 뒤 떨어질 때 볼로 크게 당긴다(2026-11-13 사용자: 잘려 보임).
      [0, 'throw', () => { battleCamera = 'attack'; section.dataset.camera = 'attack'; }],
      [1300, 'absorb', effect('absorb')], [2200, 'drop', () => { battleCamera = 'ball'; section.dataset.camera = 'ball'; }],
      // 흔들림에는 글자를 띄우지 않는다(흔들림·소리만).
      // 흔들림 사이 정적이 점점 길어진다(두근두근).
      [3500, 'shake-1'], [5000, 'shake-2'], [6600, 'shake-3'],
      [8200, 'click', effect('caught')]
    ].map(([at, name, extra]) => ({ at, run: beat(name, extra) }));
    // 볼이 땅에 닿는 순간(떨어짐 0.8초의 55%) 살짝 쿵.
    beats.push({ at: 2640, run: effect('land') });
    const done = window.AdventureMotion ? await AdventureMotion.sequence(beats,{duration:9600,guard,keepTime:true}) : await new Promise(resolve=>setTimeout(()=>resolve(true),9600));
    if (!guard()) return;
    if (!done) { busy=false;battle.phase='capture';battleCamera='wide';if(screen==='battle')battleScreen();return; }
    const caught = [...new Set([...S.state.caught, battle.pokemon.id])];
    const companions = partyIds();
    const partyChanged = companions.length < 2 && !companions.includes(battle.pokemon.id);
    if (partyChanged) companions.push(battle.pokemon.id);
    S.update({ caught, companions, companion: companions[0] || null }, partyChanged);
    lastCaughtId = captureBattle.pokemon.id;
    if (!battle.tutorial && !battle.missed) setPerfectStreak(R.nextStreak(perfectStreak(), true));
    battle.phase = 'caught';
    battleCallout = battleLine('caught');
    // 잡은 순간(2026-11-15 부모 승인): 배틀 곡을 멈추고 징글 Success3 한 번(합성 「잡았다」 효과음 대신). 잡았다 카드 동안은 음악 없이
    // 울음소리·카드 읽기만 들린다(js/audio.js trackFor 의 caught → null).
    musicForScreen();
    jingle('caught');
    setTimeout(() => { if (S.user?.name === captureOwner) cry(captureBattle.pokemon.id); }, 900);
    // 울음소리가 끝난 뒤 카드 글을 읽어 준다(카드를 닫으면 setScreen 이 읽기를 멈춘다). 그때 설정 창이 떠 있으면 창을 닫은 뒤에 읽는다.
    const readCard = () => {
      if (screen !== 'battle' || battle !== captureBattle || battle.phase !== 'caught') return;
      if (deferBattleStep(readCard)) return;
      const part = selector => document.querySelector('.go-battle ' + selector)?.textContent.trim();
      const grade = part('.gb-result-grade');
      readAloud('caught-card-' + captureBattle.pokemon.id, `${grade ? grade + ', ' : ''}${captureBattle.pokemon.name}! ${part('.gb-result-title') || ''}`.trim());
    };
    setTimeout(readCard, CAUGHT_READ_MS);
    busy = false;
    if (screen !== 'battle') return;
    // 볼에 붙어 있던 카메라에서 줌아웃하며 어두워진 장면 위에 잡은 포켓몬 카드가 뜬다.
    battleCamera = 'ball';
    battleScreen();
    void document.querySelector('.go-battle')?.offsetWidth;
    setCamera('wide');
    window.VoiceGuide?.say('caught', { text: battleCallout, guard: () => guard() && screen === 'battle' && battle.phase === 'caught' && !modalRoot.firstChild });
  }
  function dexScreen(animate = true) {
    const normalGen = R.generation(POKEMON, S.state.caught, false);
    const legendGen = R.generation(POKEMON, S.state.caught, true);
    const caught = new Set(S.state.caught);
    if (lastCaughtId) newBadgeId = lastCaughtId;
    const entries = POKEMON.filter(p => p.gen === dexGen && (dexFilter !== 'caught' || caught.has(p.id)));
    const genAll = POKEMON.filter(p => p.gen === dexGen);
    const genCaught = genAll.filter(p => caught.has(p.id)).length;
    const unlocked = Math.max(normalGen, legendGen);
    const tabs = [1,2,3,4].map(gen => {
      const locked = gen > unlocked;
      return `<button data-gen="${gen}" class="${dexGen === gen ? 'active' : ''}" aria-pressed="${dexGen === gen}"${locked ? ` data-locked="true" aria-label="${gen}세대 잠김"` : ''}>${locked ? '<span class="ui-icon icon-lock" aria-hidden="true"></span>' : ''}${gen}세대</button>`;
    }).join('');
    const filters = [['all','전체','dex'],['caught','잡은 것','check']].map(([id, label, icon]) => `<button data-filter="${id}" class="${dexFilter === id ? 'active' : ''}" aria-pressed="${dexFilter === id}"><span class="ui-icon icon-${icon}" aria-hidden="true"></span>${label}</button>`).join('');
    const grid = entries.length ? entries.map((p, index) => {
      const found = caught.has(p.id);
      const badge = found && p.id === newBadgeId ? '<span class="dex-new">NEW</span>' : '';
      return `<button class="dex-entry${found ? '' : ' unknown'}" style="--i:${index}" data-pokemon="${p.id}" aria-label="${found ? `${escape(p.name)} 자세히 보기` : `${p.id}번 아직 만나지 못한 포켓몬`}"><span class="dex-number">${String(p.id).padStart(3,'0')}</span><img class="${found ? '' : 'silhouette'}" src="${pokemonImage(p,true)}" srcset="${pokemonImage(p,true)} 128w, ${pokemonImage(p)} 360w" sizes="132px" alt="" loading="lazy"><strong>${found ? escape(p.name) : '???'}</strong>${badge}</button>`;
    }).join('') : `<div class="empty-state"><h3>아직 잡은 포켓몬이 없어!</h3>${button('모험하러 가기','regions')}</div>`;
    const entering = !main.querySelector?.('.dex-screen');
    main.innerHTML = `<section class="dex-screen${animate ? ' is-entering' : ''}"><header class="dex-header"><h2>포켓몬 도감</h2><span class="dex-progress" aria-label="${dexGen}세대 ${genAll.length}마리 중 ${genCaught}마리"><img src="img/art/balls/ball-red-small.png" alt="">${dexGen}세대 ${genCaught} / ${genAll.length}</span></header>${partyPanel()}<div class="dex-tabs"><div class="toggle-group generation-tabs">${tabs}</div><div class="toggle-group dex-filter">${filters}</div></div><div class="dex-grid">${grid}</div></section>`;
    if (entering) window.VoiceGuide?.say(partyGuideSlot == null ? 'dex' : 'partySlot');
  }
  function highlightNewPokemon() {
    if (!lastCaughtId || !main.querySelector('.dex-entry[data-pokemon="'+lastCaughtId+'"]')) return;
    const id = lastCaughtId;
    lastCaughtId = null;
    void window.AdventureMotion?.register(id);
  }
  async function showPokemon(id) {
    const pokemon = POKEMON.find(p => p.id === id);
    if (!pokemon) return;
    if (!S.state.caught.includes(id)) {
      const entry=main.querySelector('[data-pokemon="'+id+'"]'),owner=S.user?.name;
      const guard=()=>screen==='dex'&&S.user?.name===owner&&entry?.isConnected&&!modalRoot.firstChild;
      if(await DexHint.shake(entry,guard)) showModal(`<h2 id="modal-title">${DexHint.say('unknown')}</h2>`,DexHint.render(pokemon,POKEMON,S.state.caught),'modal--pop');
      return;
    }
    if (newBadgeId === id) { newBadgeId = null; main.querySelector('.dex-new')?.remove(); }
    const detail = window.POKEMON_DETAILS?.[id];
    const statNames = {hp:'체력',attack:'공격',defense:'방어','special-attack':'특수공격','special-defense':'특수방어',speed:'스피드'};
    const statIcons = {hp:'heart',attack:'play',defense:'lock','special-attack':'star','special-defense':'check',speed:'arrow-right'};
    const icon = name => `<span class="ui-icon icon-${name}" aria-hidden="true"></span>`;
    const evolutions = (detail?.evolutions || []).filter(edge => edge.methodKo);
    const evolutionIds = [...new Set(evolutions.flatMap(edge => [edge.from,edge.to]))].filter(other => other !== id && POKEMON.some(p => p.id === other));
    // 상세 내용에는 버튼을 두지 않는다(누를 것은 제목 줄의 울음소리·지도·닫기뿐). 그림·설명·키·몸무게·특성·능력치 6개를 펼쳐 보여 주고, 진화는 그림으로만 알려 준다.
    const abilities = detail?.abilities.map(a => escape(a.name) + (a.hidden ? '(숨겨진 특성)' : '')).join(' · ');
    const stats = detail ? Object.entries(statNames).map(([key,label]) => `<div><dt>${icon(statIcons[key])}${label}</dt><dd><span class="stat-track"><span style="--stat:${Math.min(1, detail.baseStats[key]/255).toFixed(3)}"></span></span><b>${detail.baseStats[key]}</b></dd></div>`).join('') : '';
    const evolutionList = evolutionIds.length ? `<div class="evolution-list"><h3>진화</h3><div class="evolution-row">${evolutionIds.map(other => { const found = S.state.caught.includes(other), p = POKEMON.find(p => p.id === other); return `<div class="evolution-preview"><img class="${found ? '' : 'silhouette'}" src="${pokemonImage(p,true)}" alt=""><span>${found ? escape(p.name) : '???'}</span></div>`; }).join('')}</div></div>` : '';
    const profile = detail ? `<p class="dex-genus">${escape(detail.genus)}</p><p class="dex-description">${escape(detail.flavorText)}</p><dl class="dex-facts"><div><dt>${icon('height')}키</dt><dd>${detail.heightMeters}m</dd></div><div><dt>${icon('weight')}몸무게</dt><dd>${detail.weightKg}kg</dd></div><div class="dex-fact-wide"><dt>${icon('star')}특성</dt><dd>${abilities}</dd></div></dl><dl class="dex-stats">${stats}</dl>${evolutionList}` : '';
    // 이름 옆 스피커 버튼: 누르면 그 포켓몬 울음소리(PokeAPI 외부 원본 — 아래 [data-cry] 누르기 처리, 2026-11-13 사용자).
    // 울음소리는 소리 설정을 따른다(audio.js Sfx.cry). 소리가 꺼져 있으면 눌러도 소리가 없으니 흐리게만(이유 글 없음).
    const cryButton = `<button class="corner-button dex-cry-button" type="button" data-cry="${id}" aria-label="울음소리 듣기"${soundOn() ? '' : ' disabled'}><span class="ui-icon icon-sound-on" aria-hidden="true"></span></button>`;
    // 닫기 왼쪽 「지도」(위쪽 「지도」와 같은 일, goMap): 상세 창이 위쪽 버튼 줄을 덮어도 바로 지도로 갈 수 있게(2026-11-14 사용자).
    const mapButton = `<button class="corner-button corner-pill map-button dex-map-button" type="button" data-action="map" aria-label="지도로 가기"><span class="ui-icon icon-map" aria-hidden="true"></span><span class="corner-pill-label">지도</span></button>`;
    showModal(`<div class="dex-detail-title"><h2 id="modal-title"><span class="dex-detail-number">${String(id).padStart(3,'0')}</span> ${escape(pokemon.name)}</h2>${cryButton}</div>${mapButton}`, `<div class="dex-profile"><div class="dex-portrait"><img id="dex-preview" class="dex-art" src="${modelImagePath(id)}" alt="${escape(pokemon.name)}"><div class="types">${pokemon.types.map(t => `<span class="type-label">${TYPE_KO[t]}</span>`).join('')}</div></div><div class="dex-info">${profile}</div></div>`, 'modal--wide modal--pop modal--dex-detail');
    // 3D 앞모습이 없거나 못 불러오면 예전 그림으로 대신한다.
    modalRoot.querySelector('#dex-preview')?.addEventListener('error', event => { event.target.src = pokemonImage(pokemon); }, { once: true });
  }
  function showModal(title, content, variant = '') {
    window.Narration?.cancel();
    const previousFocus = document.activeElement;
    document.body.classList.add('modal-open');
    keys.clear();
    // 열린 창을 다시 그릴 때(설정 바꾸기 등)는 등장 움직임을 다시 하지 않는다.
    const replacing = Boolean(modalRoot.firstChild);
    modalRoot.innerHTML = `<div class="modal-backdrop${replacing ? ' is-replacing' : ''}"><section class="modal${variant ? ' ' + variant : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header">${title}<button class="close-button" data-action="close-modal" aria-label="닫기"><span class="ui-icon icon-close" aria-hidden="true"></span></button></div>${content}</section></div>`;
    const dialog = modalRoot.querySelector('.modal');
    dialog.querySelector('input,button,select')?.focus({ preventScroll: true });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); dialog.querySelector('[data-action=close-modal]')?.click(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll('button:not(:disabled),input,select,a[href],[tabindex="0"]'));
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    });
    // 창 바깥(어두운 곳)을 누르면 닫는다 — 닫기 버튼과 같은 길(2026-11-13 Aside QA: 아래로 내리면 X 가 안 보이고 바깥을 눌러도 안 닫혔다).
    modalRoot.querySelector('.modal-backdrop')?.addEventListener('click', event => {
      if (event.target === event.currentTarget) modalRoot.querySelector('[data-action=close-modal]')?.click();
    });
    modalRoot.restoreFocus = previousFocus;
  }
  // 창 밖에 초점이 있어도 Esc 로 닫는다.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modalRoot.firstChild) modalRoot.querySelector('[data-action=close-modal]')?.click();
  });
  // 배틀 중 연 창(배틀 안 설정 버튼, 2026-11-14 사용자 「배틀에서도 옵션 바꾸게 해줘」): 창이 떠 있는 동안 배틀의 다음 단계(문제·「어떻게 잡을까?」 팝업,
  // 잡았다 카드 읽기)는 창을 닫을 때까지 미룬다. 창 뒤에서 팝업이 뜨고 문제를 읽어 아이가 못 듣고 지나가지 않게. 닫힌 뒤 같은 배틀·같은 계정일 때만 잇는다.
  // 창 뒤의 보기·버튼은 창 바깥 어두운 곳(modal-backdrop)이 덮고, 키보드 1~4 는 창이 있으면 무시한다(아래 keydown).
  const afterModal = [];
  function closeModal() {
    document.body.classList.remove('modal-open');modalRoot.innerHTML = ''; modalRoot.restoreFocus?.focus({ preventScroll:true });
    if (screen === 'battle' || afterModal.length) setTimeout(resumeBattle, 0);
  }
  function deferBattleStep(step) {
    if (screen !== 'battle' || !modalRoot.firstChild) return false;
    const waiting = battle, owner = S.user?.name, motionId = answerMotionId;
    afterModal.push(() => { if (screen === 'battle' && battle === waiting && S.user?.name === owner && answerMotionId === motionId) step(); });
    return true;
  }
  // 창을 닫은 다음 차례(로그아웃·처음부터 다시 하기처럼 닫자마자 화면을 바꾸는 길이 먼저 끝나게): 미뤄 둔 단계를 잇고, 창을 열 때 끊긴 문제 읽기를
  // 다시 한다(소리가 켜져 있을 때만 — 창에서 켰으면 이때부터 읽는다. 방금 새로 띄운 팝업이 읽은 문제는 narration.js 가 같은 문제로 거른다).
  function resumeBattle() {
    if (modalRoot.firstChild) return;
    for (const step of afterModal.splice(0)) step();
    if (screen === 'battle' && battle && battlePopup && !battleChoosing && !busy && ['silhouette', 'question'].includes(battle.phase) && document.querySelector('.go-battle .gb-popup:not(.is-closing)')) readBattle();
  }
  // 로그인·가입: 이름은 키보드로, 숫자 4자리 비밀번호는 화면 숫자판으로 누른다. 4자리가 차면 확인 버튼이 켜진다.
  // 비밀번호 칸 자체는 보이지 않게 남겨 두어 키보드·화면 읽기·비밀번호 자동 입력도 그대로 된다(휴대폰 키보드는 띄우지 않음).
  function authModal(register = false, next = null) {
    register = !S.hasAccount;
    const icon = name => `<span class="ui-icon icon-${name}" aria-hidden="true"></span>`;
    const submitLabel = () => icon('play') + (register ? '내 수첩 만들기' : '모험 이어 하기');
    const padKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => `<button type="button" data-pin-key="${digit}">${digit}</button>`).join('')
      + `<button type="button" class="pin-erase" data-pin-key="erase" aria-label="한 글자 지우기">${icon('eraser')}</button><button type="button" class="pin-zero" data-pin-key="0">0</button>`;
    showModal('<h2 id="modal-title">나의 모험 수첩</h2>', `<form id="auth-form" class="auth-form"><div class="toggle-group login-tabs"><button type="button" data-action="auth-login" class="${register ? '' : 'active'}" aria-pressed="${!register}">${icon('trainer')}로그인</button><button type="button" data-action="auth-register" class="${register ? 'active' : ''}" aria-pressed="${register}">${icon('star')}처음 왔어요</button></div><label class="form-field">이름<input name="name" required minlength="2" maxlength="16" autocomplete="username" placeholder="예: 별이탐험가"></label><div class="form-field pin-field"><label for="auth-pin">숫자 4자리 비밀번호</label><input id="auth-pin" class="pin-input" name="pin" type="password" inputmode="none" pattern="[0-9]{4}" maxlength="4" required autocomplete="${register ? 'new-password' : 'current-password'}"><span class="pin-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div><div class="pin-pad" role="group" aria-label="비밀번호 숫자판">${padKeys}</div><p class="form-help">부모님이 처음 한 번 비밀번호를 정해 주세요. 기록은 이 기기에만 저장되며 비밀번호는 아이에게 알려주지 마세요.</p><div class="form-error" id="auth-error" role="alert"></div><button class="button full" type="submit" disabled>${submitLabel()}</button></form>`, 'modal--form');
    window.VoiceGuide?.say('auth');
    modalRoot.authNext = next;
    const form = modalRoot.querySelector('#auth-form');
    form.querySelector('.login-tabs')?.remove();
    const pin = form.elements.pin;
    const submit = form.querySelector('[type=submit]');
    const refresh = () => {
      pin.value = pin.value.replace(/\D/g, '').slice(0, 4);
      form.querySelectorAll('.pin-dots i').forEach((dot, index) => dot.classList.toggle('on', index < pin.value.length));
      submit.disabled = form.elements.name.value.trim().length < 2 || pin.value.length !== 4;
    };
    form.addEventListener('input', refresh);
    form.querySelector('.pin-pad').addEventListener('click', event => {
      const key = event.target.closest('[data-pin-key]')?.dataset.pinKey;
      if (!key) return;
      pin.value = key === 'erase' ? pin.value.slice(0, -1) : (pin.value + key).slice(0, 4);
      refresh();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      submit.textContent = '수첩을 열고 있어요…';
      try {
        const previousAccount = S.user?.name;
        await S.authenticate(register ? 'register' : 'login', form.elements.name.value.trim(), pin.value);
        if (!form.isConnected || document.hidden) { await S.logout(); return; }
        sessionLocked = false;
        pin.value = '';
        closeModal();
        if(previousAccount && previousAccount !== S.user?.name) { battle=null; field=null; usedQuestions=[]; setScreen('regions'); return; }
        toast(register ? '새 수첩을 만들었어요!' : '수첩을 불러왔어요!');
        if (next) next(); else render();
      } catch (error) {
        if (!form.isConnected) return;
        modalRoot.querySelector('#auth-error').textContent = error.message;
        submit.innerHTML = submitLabel();
        refresh();
      }
    });
  }
  // 부모님 설정 하나에 소리·학습 단계·계정·출처를 모은다. 설명은 줄마다 한 줄까지만.
  // 소리는 「소리」 한 줄(2026-11-15 사용자 「설정에서 소리 너무 옵셔널해 1개 설정으로 해줘」 — 효과음·배경 음악·문제 읽어 주기·음성 안내 넷을 하나로).
  // 평소(저장됨·저장 중·준비 중)에는 빈 글. 서버에 저장이 안 되는 상태일 때만 경고 한 줄.
  const QUIET_STATUS = ['이 기기에 저장했어요', '이 기기에 저장되어 있어요', '서버에 저장되어 있어요', '서버에 저장했어요', '저장하고 있어요…', '친구를 만날 준비 중'];
  function saveWarning() {
    if (QUIET_STATUS.includes(S.status)) return '';
    return `<p class="setting-warning" role="status"><span class="ui-icon icon-hint" aria-hidden="true"></span>${escape(S.status)}</p>`;
  }
  function settingsModal() {
    window.FeatureTour?.visited('settings');
    const settings = S.state.settings;
    const levels = learningLevels();
    // 아이콘이 먼저, 글자는 짧게. 글을 못 읽어도 켜짐·꺼짐과 과목을 그림으로 알아본다.
    const icon = name => name ? `<span class="ui-icon icon-${name}" aria-hidden="true"></span>` : '';
    const choice = (attributes, label, active, iconName = '') => `<button ${attributes} class="${active ? 'active' : ''}" aria-pressed="${active}">${icon(iconName)}${label}</button>`;
    const onOff = (attribute, enabled, onIcon, offIcon) => choice(`data-${attribute}="true"`, '켜기', enabled, onIcon) + choice(`data-${attribute}="false"`, '끄기', !enabled, offIcon);
    const areaIcons = { mixed: 'star', math: 'math', korean: 'korean', english: 'english', creative: 'creative' };
    const row = (heading, controls, note = '') => `<div class="setting-row"><h3>${heading}</h3><div class="toggle-group">${controls}</div>${note ? `<p class="setting-note">${note}</p>` : ''}</div>`;
    const signedIn = S.user && !S.needsLogin;
    const account = signedIn
      // 「○○ 수첩 · 저장하고 있어요…」 같은 평소 저장 상태 글은 두지 않는다(2026-11-13 사용자). 다만 서버에 저장이 안 되는 동안
      // (오프라인·연결 오류·다시 로그인 필요)에는 부모님이 알 수 있게 그 한 줄만 보여 준다.
      // 「처음부터 다시 하기」는 로그인했을 때만 로그아웃 옆에(2026-11-14 사용자 「계정 초기화 기능」, 확인 창 resetModal).
      ? saveWarning() + button(icon('back') + '로그아웃', 'logout', true, true) + button(icon('retry') + '처음부터 다시 하기', 'reset-open', true, true)
      : button(icon('trainer') + '로그인', 'account', false, true);
    const previousScroll = modalRoot.querySelector?.('.modal')?.scrollTop || 0;
    // 캐릭터: 튜토리얼에서 고른 남자·여자를 작은 앞모습 그림 두 개로 바꾼다(필드 도트·전투 뒷모습이 함께 바뀜).
    const look = trainerLook();
    const lookChoice = ({ id, name }) => `<button data-trainer-look="${id}" class="setting-look${look === id ? ' active' : ''}" aria-pressed="${look === id}"><img src="img/art/trainer-front-${id}.webp" alt="" draggable="false">${name}</button>`;
    showModal('<h2 id="modal-title">설정</h2>', [
      row('캐릭터', Tutorial.LOOKS.map(lookChoice).join('')),
      row('소리', onOff('sound', soundOn(), 'sound-on', 'sound-off')),
      row('문제 종류', Object.entries(areas).map(([id, name]) => choice(`data-area="${id}"`, name, settings.area === id, areaIcons[id])).join('')),
      row('수학 수 범위', QuestionBank.levels.math.map(limit => choice(`data-setting="mathMax" data-value="${limit}"`, `${limit}까지`, levels.math === limit)).join('')),
      row('한글 단계', QuestionBank.levels.korean.map((name, index) => choice(`data-setting="koreanLevel" data-value="${index + 1}"`, name, levels.korean === index + 1)).join('')),
      row('영어 단계', QuestionBank.levels.english.map((name, index) => choice(`data-setting="englishLevel" data-value="${index + 1}"`, name, levels.english === index + 1)).join('')),
      row('난이도', choice('data-difficulty="1"', '쉬움', settings.difficulty === 1) + choice('data-difficulty="2"', '도전', settings.difficulty === 2) + choice('data-difficulty="3"', '도전+', settings.difficulty === 3), '도전은 금색 볼과 전설 포켓몬이 더 자주 나와요. 도전\u2060+는 창의력 문제가 더 어려워요.'),
      // 기능 소개는 처음 화면 버튼을 가리키므로 처음 화면에서 연 설정에만 둔다.
      `<div class="setting-row setting-footer">${account}${screen === 'title' ? button(icon('retry') + '소개 다시 보기', 'feature-tour', true, true) : ''}${button(icon('gift') + '기록 백업', 'backup-export', true, true)}${button(icon('map') + '기록 복원', 'backup-import', true, true)}${button(icon('hint') + '이용 안내', 'legal', true, true)}${button(icon('hint') + '그림·소리 출처', 'credits', true, true)}${button(icon('pencil') + '부모님 제안·오류 제보', 'feedback', true, true)}</div>`
    ].join(''), 'modal--settings');
    const dialog = modalRoot.querySelector?.('.modal');
    if (dialog && previousScroll) dialog.scrollTop = previousScroll;
  }
  function showCredits() {
    showModal('<h2 id="modal-title">그림·소리 출처</h2>', '<div class="asset-credits"><p>포켓몬 이름·타입·공식 그림·스프라이트·울음소리: <a href="https://pokeapi.co/" target="_blank" rel="noopener noreferrer">PokeAPI</a>.</p><p>숲·마을·사막 배틀 배경: Nidhoggn, <a href="https://opengameart.org/content/backgrounds-3" target="_blank" rel="noopener noreferrer">Backgrounds</a>, CC0.</p><p>바다 배틀 배경: CraftPix.net 2D Game Assets, <a href="https://opengameart.org/content/beach-2d-backgrounds" target="_blank" rel="noopener noreferrer">Beach 2D Backgrounds</a>, <a href="https://static.opengameart.org/OGA-BY-3.0.txt" target="_blank" rel="noopener noreferrer">OGA-BY 3.0</a>.</p><p>문제 그림: <a href="https://arasaac.org" target="_blank" rel="noopener noreferrer">ARASAAC 픽토그램</a> — 저작자 Sergio Palao, 소유 아라곤 자치정부(스페인), <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>.</p><p>필드 도트 타일: <a href="https://pixel-boy.itch.io/ninja-adventure-asset-pack" target="_blank" rel="noopener noreferrer">Ninja Adventure</a>, pixel-boy, CC0.</p><p>필드 동행 픽셀 포켓몬: <a href="https://github.com/PMDCollab/SpriteCollab" target="_blank" rel="noopener noreferrer">PMDCollab SpriteCollab</a>. <a href="https://github.com/semi0x3b/PokeAdventure/blob/main/docs/field-sprites/CREDITS.md" target="_blank" rel="noopener noreferrer">포켓몬별 작가·출처·사용 조건</a>을 확인해 주세요.</p><p>타이틀 로고·지역 그림·출석 도장·트레이너: 이 게임을 위해 만든 그림.</p><p>아이콘: <a href="https://kenney.nl/assets/game-icons" target="_blank" rel="noopener noreferrer">Kenney</a>, CC0.</p><p>배경 음악·징글: <a href="https://pixel-boy.itch.io/ninja-adventure-asset-pack" target="_blank" rel="noopener noreferrer">Ninja Adventure</a>(Pixel-boy·AAA), CC0.</p><p>효과음은 브라우저에서 합성합니다.</p><p>기존 포켓몬 게임 음악·주제가는 넣지 않았습니다.</p></div>');
  }
  // 처음부터 다시 하기 확인 창(부모 안내라 존댓말): 지워지는 것·남는 것·되돌릴 수 없음을 짧게 적고, 비밀번호 4자리(로그인 창 PIN 칸과 같은 꼴,
  // 숫자 키보드)를 다 넣어야 「지우고 처음부터」가 켜진다. 요청 중에는 닫기·그만두기·지우기를 모두 잠근다.
  // 성공하면 js/storage.js 가 'progressreset' 을 내고 startOver 가 기기 기록 정리·처음 화면·알림을 맡는다.
  function resetModal() {
    if (!S.user) return;
    const icon = name => `<span class="ui-icon icon-${name}" aria-hidden="true"></span>`;
    const submitLabel = text => icon('retry') + text;
    showModal('<h2 id="modal-title">처음부터 다시 할까요?</h2>', `<form id="reset-form" class="reset-form" novalidate><p class="reset-note">잡은 포켓몬 ${S.state.caught.length}마리, 출석 도장, 글자 쓰기 기록이 지워져요.</p><p class="reset-note">학습 단계와 소리 설정은 그대로 남아요.</p><p class="reset-warning">되돌릴 수 없어요.</p><label class="form-field pin-field">숫자 4자리 비밀번호<input class="pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"><span class="pin-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></label><div class="form-error" id="reset-error" role="alert"></div><div class="modal-actions reset-actions"><button class="button" type="submit" disabled>${submitLabel('지우고 처음부터')}</button><button type="button" class="button secondary" data-action="close-modal">그만두기</button></div></form>`, 'modal--form');
    const form = modalRoot.querySelector('#reset-form');
    const pin = form.elements.pin;
    const submit = form.querySelector('[type=submit]');
    const refresh = () => {
      pin.value = pin.value.replace(/\D/g, '').slice(0, 4);
      form.querySelectorAll('.pin-dots i').forEach((dot, index) => dot.classList.toggle('on', index < pin.value.length));
      submit.disabled = pin.value.length !== 4;
    };
    form.addEventListener('input', refresh);
    // 키보드가 있는 기기(마우스)는 바로 칠 수 있게 비밀번호 칸에 둔다. 손가락 기기는 칸을 눌러 숫자 키보드를 연다.
    if (window.matchMedia?.('(pointer: fine)').matches) pin.focus({ preventScroll: true });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      const value = pin.value;
      const controls = [...modalRoot.querySelectorAll('button'), pin];
      for (const control of controls) control.disabled = true;
      submit.innerHTML = submitLabel('지우고 있어요…');
      form.querySelector('#reset-error').textContent = '';
      const owner = S.user?.name;
      try {
        await S.reset(value);
        // 보통은 'progressreset' 이 이미 창을 닫고 처음 화면으로 갔다. 신호가 없었던 경우에도 같은 정리를 한다.
        if (form.isConnected && owner && owner === S.user?.name) startOver(owner);
      } catch (error) {
        if (!form.isConnected) return;
        for (const control of controls) control.disabled = false;
        form.querySelector('#reset-error').textContent = error.message;
        submit.innerHTML = submitLabel('지우고 처음부터');
        pin.value = '';
        refresh();
        pin.focus({ preventScroll: true });
      }
    });
  }
  // 처음부터 다시 하기(js/storage.js 'progressreset' — 이 기기·다른 기기·관리자 스크립트로 이 계정을 초기화했다는 신호, 한 번):
  // 이 기기에 남은 그 계정의 처음 한 번 기록(기능 소개·같이 다닐 친구 안내·연속 정답 수·도장판 본 날·음성 안내 횟수·글자 쓰기 다 쓴 낱말)을
  // 지우고, 하던 배틀·필드·최근 문제를 버린 뒤 처음 화면으로. 필드 확대 배율(field-zoom)은 기기 화면 설정이라 남긴다.
  // 처음 화면은 한 번 그대로 보여 주고(resetTitleFor) 「시작」을 누르면 잡은 포켓몬 0마리라 지금 규칙대로 튜토리얼부터.
  function startOver(name) {
    for (const key of [partyGuideKey(), streakKey(), stampBoardKey(name)]) removeLocal(key);
    window.FeatureTour?.forget?.(name);
    window.VoiceGuide?.forget?.(name);
    window.Wordbook?.forget?.(name);
    battle = null; field = null; questions = []; nameOptions = []; usedQuestions = [];
    lastCaughtId = null; newBadgeId = null; partyGuideSlot = null; levelGuideSlot = null; bagOpen = false;
    dexFilter = 'all'; dexGen = 1; returnScreen = 'title'; fieldHintShown = false;
    travelEpoch++;
    closeModal();
    resetTitleFor = name;
    // 처음 화면을 새로 들어온 것처럼(톡톡 등장·「모험 시작」 안내 말) 그린다.
    main.innerHTML = '';
    setScreen('title');
    toast('처음부터 다시 시작해요!');
  }
  window.addEventListener('progressreset', event => {
    const name = event.detail?.name;
    if (name && name === S.user?.name) startOver(name);
  });
  // 큰 도장판: 7칸마다 서로 다른 배지, 8번째 칸은 늘 보이는 선물 상자. 7개가 차면 상자가 「열기」 버튼이 된다.
  // 큰 도장판: 칸마다 서로 다른 배지, 마지막 칸은 늘 보이는 선물 상자. 다 차면 상자를 한 번 누르면 바로 선물 연출로 간다.
  function stampsModal(stampToday = false) {
    if (!S.user) { authModal(false, () => stampsModal()); return; }
    // 그날 처음 저절로 뜬 오늘 도장판도 본 것으로 친다(2026-11-14 사용자 「메인에 알려주는 표시가 다 했던건데 또 나와」 — 아이는 도장판을 매일 본다).
    window.FeatureTour?.visited('stamps');
    const cycle = stampCycle();
    const today = todayKey();
    const count = cycle.stamps.length;
    const badges = Array.from({ length: STAMPS_PER_GIFT }, (_, index) => {
      const date = cycle.stamps[index];
      const isToday = date === today;
      const classes = 'stamp-badge' + (date ? ' collected' : '') + (isToday ? ' today' : '') + (isToday && stampToday ? ' stamping' : '');
      return `<li class="${classes}">${badgeImage(index + 1, Boolean(date), date ? `${index + 1}번째 도장` : `${index + 1}번째 칸`)}<span>${date ? escape(date.slice(5).replace('-', '/')) : index + 1}</span></li>`;
    }).join('');
    const gift = cycle.ready
      ? '<li class="stamp-badge gift ready"><button class="stamp-gift-open" data-action="stamp-gift-open" aria-label="출석 선물 열기"><img src="img/art/gift/gift-box.webp" alt=""><span>열기!</span></button></li>'
      : '<li class="stamp-badge gift"><img src="img/art/gift/gift-box-off.webp" alt="선물 상자(도장을 다 모으면 열려요)"><span>선물</span></li>';
    const cells = STAMPS_PER_GIFT + 1;
    showModal(`<h2 id="modal-title">출석 도장</h2>`, `<div class="stamp-board"><ol class="stamp-badges" style="--cells:${cells};--columns:${Math.ceil(cells / 2)}">${badges}${gift}</ol></div>`, 'modal--stamps');
    window.VoiceGuide?.say(cycle.ready ? 'giftReady' : stampToday ? 'stamp' : 'stamps');
    // 오늘 도장이 쾅 찍히는 순간(css stamp-slam 중간)에 소리를 낸다.
    if (stampToday && modalRoot.querySelector?.('.stamp-badge.stamping')) setTimeout(() => sound('correct'), 770);
  }
  let tracingPad = null;
  // 배틀 따라 쓰기(2026-11-15 부모 승인 「안내 글자를 획 경로 그림으로 바꾸고 획마다 번호·방향과 먼저 보여 주기만, 채점은 지금대로」):
  // 획 자료가 있는 글자(배틀 문제 66개 모두)는 글자 쓰기와 같은 GuidedTracingPad — 획 경로 안내·지금 획 화살표(손가락을 따라옴)·다음 획 번호.
  // 획 자료가 없는 글자만 옛 TracingPad(글꼴 안내). 채점은 둘 다 TracingPad.grade 비율 그대로(획 순서·방향은 보지 않는다).
  function guidedTrace(text) { return Boolean(window.GuidedTracingPad && window.StrokeLetters?.supports(text)); }
  // demo: 획 순서 시범 한 번(사용자 진행은 채우지 않고, 연습장에 손대면 패드가 멈춘다). 설정 창이 떠 있으면 닫은 뒤에.
  // 모션 줄이기에서는 시범을 돌리지 않는다: 패드의 시범은 움직임뿐이라, 멈춰 있는 안내(지금 획 시작 화살표·다음 획 번호)만 보인다.
  function setupTracing(letter, demo = false) {
    tracingPad?.destroy();
    tracingPad = null;
    const canvas = document.querySelector('#trace-canvas');
    const guided = guidedTrace(letter);
    const factory = guided ? window.GuidedTracingPad : window.TracingPad;
    if (!canvas || !factory) return;
    const pad = tracingPad = factory.create(canvas, { text: letter, owner: S.user?.name || null });
    if (!demo || !guided || motionPreference?.matches) return;
    const play = () => { if (tracingPad === pad) pad.replay(); };
    if (!deferBattleStep(play)) play();
  }
  // 다 썼어요: 쓴 획의 절반 이상이 글자 안에 들어오면 정답, 아니면 오답(힌트를 보여 주고 다시 쓰게 한다).
  function checkTrace() {
    if (busy || !battle || battle.phase !== 'question' || !currentQuestion().trace || !tracingPad) return;
    if (!tracingPad.strokes) { battleSpeech('글자를 따라 먼저 써 보자!', 'info'); return; }
    const question = currentQuestion();
    const result = tracingPad.score();
    // 오답 기록은 보기 이름으로 겹침을 막으므로, 따라 쓰기 오답은 시도마다 다른 이름을 준다.
    judgeAnswer(result.pass ? question.answer : `따라쓰기-${battle.wrong.length + 1}`, question.answer);
  }
  // 글자 쓰기 선물(2026-11-13 사용자): 로그인한 계정은 통과할 때마다 wordsWritten 을 하나 올리고, WORDS_PER_GIFT 번마다 포켓몬 하나(wordGift 등급 비율).
  // 게스트는 세지 않는다. 선물은 연출 전에 기록해 중복 수령을 막고(출석 선물과 같은 방식), 연출은 글자 쓰기가 별 도장 뒤에 부른다.
  const WORDS_PER_GIFT = R.WORDS_PER_GIFT || 5;
  function wordGiftProgress() {
    if (!S.user) return null;
    return { filled: (S.state.wordsWritten || 0) % WORDS_PER_GIFT, total: WORDS_PER_GIFT };
  }
  // 같은 짧은 낱말을 되풀이해 포켓몬을 쓸어 가지 않게: 같은 낱말은 하루 한 번만 세고, 글자 쓰기 선물은 하루 3마리까지(한국 시간).
  // 오늘 센 낱말·받은 선물 수는 이 기기에 계정별로 기억한다. ponytail: 기기를 바꾸면 하루 제한이 새로 시작된다. 서버 하루 기록은 필요해지면.
  const WORD_GIFTS_PER_DAY = 3;
  function wordDay() {
    const key = 'pa.wordbook.day:' + encodeURIComponent(S.user.name);
    let saved = null;
    try { saved = JSON.parse(readLocal(key) || 'null'); } catch { saved = null; }
    const today = todayKey();
    const day = saved && saved.date === today && Array.isArray(saved.words) && Number.isInteger(saved.gifts) ? saved : { date: today, words: [], gifts: 0 };
    return { day, save: () => writeLocal(key, JSON.stringify(day)) };
  }
  // 반환: { counted: 이번 통과를 셌는지, capped: 오늘 선물을 다 받았는지, reveal: 선물이면 선물 장면을 여는 함수 }.
  function wordPassed(entry) {
    if (!S.user) return null;
    const { day, save } = wordDay();
    if (day.gifts >= WORD_GIFTS_PER_DAY) return { counted: false, capped: true, reveal: null };
    if (entry?.id && day.words.includes(entry.id)) return { counted: false, capped: false, reveal: null };
    if (entry?.id) day.words.push(entry.id);
    const written = (S.state.wordsWritten || 0) + 1;
    const claimed = S.state.wordRewards || 0;
    const due = Math.floor(written / WORDS_PER_GIFT) > claimed;
    const gift = due ? R.wordGift(POKEMON, S.state.caught) : null;
    if (!gift) { S.update({ wordsWritten: written }); save(); return { counted: true, capped: false, reveal: null }; }
    day.gifts++;
    save();
    S.update({ wordsWritten: written, wordRewards: claimed + 1, caught: [...S.state.caught, gift.id] });
    lastCaughtId = gift.id;
    const owner = S.user.name;
    return { counted: true, capped: false, reveal: () => {
      if (screen !== 'wordbook' || S.user?.name !== owner || document.querySelector('.gift-scene')) return;
      giftScene(gift, '글자 쓰기 선물');
    } };
  }
  function wordbookScreen() {
    wordbookSession?.destroy();
    wordbookSession=Wordbook.mount(main,{
      // 통과·다시 쓰기: 말풍선 글을 소리로도(한글이 아닌 GOOD! 등은 음성 안내가 고른 칭찬으로).
      onFeedback:kind=>{sound(kind==='wrong'?'wrong':'correct');window.VoiceGuide?.say(kind==='wrong'?'traceRetry':'tracePass',{text:main.querySelector('.wordbook-bubble')?.textContent||''});},
      onRead:text=>window.Narration?.read({id:'wordbook-'+text,prompt:text,options:[]},{repeat:true,enabled:soundOn()}),
      onPass:wordPassed,
      giftProgress:wordGiftProgress,
      owner:S.user?.name||null
    });
    window.FeatureTour?.visited('wordbook');
    window.VoiceGuide?.say('wordbook');
  }
  // 내 마당(js/yard.js): 잡은 포켓몬을 10마리까지 풀어 두고 노는 화면. 입구는 타이틀 메뉴 하나다.
  function yardScreen() {
    yardSession?.destroy();
    yardSession = YardScene.mount(main, { storage: S, cry, sound, showModal, closeModal });
    window.FeatureTour?.visited('yard');
    window.VoiceGuide?.say('yard');
  }
  // 카드·장면 글 읽기(튜토리얼 카드·잡았다 카드·선물 글·그림자 글). 소리가 꺼져 있으면 읽지 않는다.
  function readAloud(id, text) { window.Narration?.read({ id, prompt: text, options: [] }, { repeat: true, enabled: soundOn() }); }
  function readTutorialCard(text) { window.Narration?.read({ id: 'tutorial-' + text, prompt: text, options: [] }, { repeat: true, enabled: soundOn() }); }
  // 튜토리얼 카드 3장(js/tutorial.js). 셋째 카드 「다음」에서 숲 배경으로 피카츄와 바로 배틀한다(필드 걷기 없이).
  function tutorialScreen() {
    // 첫 카드가 환영 인사라 가입 알림(「새 수첩을 만들었어요!」)은 거둔다. 세로 화면에서 「다음」 버튼을 가린다.
    document.querySelector('#toast')?.classList.remove('visible');
    Tutorial.mount(main, {
      read: readTutorialCard,
      onDone: trainerPickScreen
    });
  }
  // 캐릭터 고르기(js/tutorial.js mountPick): 셋째 카드 「다음」 → 남자·여자 앞모습 중 하나를 누르면 저장하고 숲에서 피카츄와 배틀.
  // 고른 캐릭터가 바로 첫 배틀의 뒷모습으로 나온다. 카드 읽기가 남아 있으면 끊어야 음성 안내가 건너뛰지 않는다.
  function trainerPickScreen() {
    window.Narration?.cancel();
    Tutorial.mountPick(main, {
      onPick: look => { setTrainerLook(look); region = 'forest'; encounter(false, POKEMON.find(p => p.id === Tutorial.STARTER)); }
    });
    window.VoiceGuide?.say('trainerPick', { guard: () => Boolean(document.querySelector('.tutorial-screen[data-guide="look"]')) });
  }
  // 고른 캐릭터(settings.trainerLook, 서버 선택 항목). 고르지 않은 옛 계정·손님은 남자.
  // 필드 도트(TRAINER_SHEETS)는 그릴 때마다 이 값을 보고, 전투 뒷모습(css --trainer-back)은 <html data-trainer-look> 으로 바뀐다.
  function trainerLook() { return S.state.settings.trainerLook === 'girl' ? 'girl' : 'boy'; }
  function applyTrainerLook() { document.documentElement.dataset.trainerLook = trainerLook(); }
  function setTrainerLook(look) {
    S.update({ settings: { trainerLook: look === 'girl' ? 'girl' : 'boy' } }, true);
    applyTrainerLook();
  }
  // 같이 다닐 친구 카드(js/tutorial.js mountParty) → 「좋아!」 → 도감에서 둘째(동행) 칸이 금빛으로 톡톡 반짝인다(대표 칸이 비어 있으면 대표 칸).
  // 카드를 띄운 순간 본 것으로 기억한다. 카드나 도감에서 다른 화면으로 나가도 다시 띄우지 않는다(가두지 않는다).
  function partyGuideScreen() {
    if (S.user) writeLocal(partyGuideKey(), '1');
    const pokemon = S.state.caught.slice(0, PARTY_GUIDE_AT).map(id => POKEMON.find(p => p.id === id)).filter(Boolean);
    Tutorial.mountParty(main, {
      pokemon,
      read: readTutorialCard,
      onDone: () => { partyGuideSlot = partyIds().length ? 1 : 0; void travelTo('dex', 'travel'); }
    });
  }
  function levelGuideScreen() {
    const own = POKEMON.find(p => p.id === S.state.companion);
    const leave = () => { partyGuideSlot = levelGuideSlot; void travelTo(levelGuideReturn, levelGuideReturn === 'field' ? 'return' : 'travel', levelGuideReturn === 'field' ? '다음 포켓몬을 만나러 가자!' : ''); };
    Tutorial.mountLevel(main, {
      pokemon: own ? { id: own.id, name: own.name } : null,
      read: readTutorialCard,
      onHarder: () => {
        const patch = R.harderSettings(S.state.settings, QuestionBank.levels);
        if (patch) S.update({ settings: patch }, true);
        setPerfectStreak(0);
        toast('좋아! 다음 문제부터 어려워져!');
        leave();
      },
      onKeep: () => { setPerfectStreak(0); leave(); }
    });
  }
  function render() {
    if (sessionLocked || !S.user) { lockedScreen(); return; }
    // 가입·로그인 창이 닫힌 뒤(다음 화면 지정 없이) 다시 그릴 때도 피카츄를 잡기 전이면 튜토리얼로.
    if (tutorialFirst(screen)) { setScreen('tutorial'); return; }
    updateHeader();
    ({ title, regions, tutorial:tutorialScreen, partyGuide:partyGuideScreen, levelGuide:levelGuideScreen, field:fieldScreen, battle:battleScreen, dex:() => dexScreen(), wordbook:wordbookScreen, yard:yardScreen }[screen] || title)();
    if(screen==='dex') highlightNewPokemon();
  }
  function goDex(caughtOnly = false) {
    if (!S.user) { authModal(false, () => goDex(caughtOnly)); return; }
    returnScreen = screen === 'field' || screen === 'battle' ? 'field' : 'title';
    if (caughtOnly) { dexFilter = 'caught'; dexGen = battle?.pokemon.gen || 1; }
    void travelTo('dex','travel');
  }
  // 도감 → 지도(2026-11-14 사용자 「도감에서도 맵으로 가는 기능 추가해줘」): 도감 위쪽·상세 창의 「지도」 버튼.
  // 필드에서 들어왔으면 그 필드로(「뒤로」와 같은 길). 처음 화면 등에서 들어왔어도 이번에 고른 지역이 있으면(만들어 둔 필드) 그 지역 필드로,
  // 고른 지역이 없으면(새로 열었거나 다른 계정·처음부터 다시 한 뒤 — field 가 비워진다) 지역 고르기로. 「뒤로」는 그대로 returnScreen 을 따른다.
  function goMap() {
    if (modalRoot.firstChild) closeModal();
    if (!field) { void travelTo('regions', 'travel'); return; }
    if (returnScreen === 'field') { void travelTo('field', 'return'); return; }
    void travelTo('field', 'travel', line('depart', { place: R.REGIONS[region].name }));
  }
  // 왼쪽 위 몬스터볼: 한 단계 뒤로. 지역 선택에서는 처음 화면, 필드에서는 지역 선택으로 간다.
  function backTarget() { return { regions: 'title', tutorial: 'title', partyGuide: returnScreen, levelGuide: levelGuideReturn, field: 'regions', dex: returnScreen, wordbook: 'title', yard: 'title' }[screen]; }
  function goBack() {
    if (screen === 'wordbook' && wordbookSession?.back()) return;
    const previous = backTarget();
    if (!previous) return;
    void travelTo(previous, 'return');
  }
  function openWordbook() { void travelTo('wordbook', 'travel', '글자를 써 보자!'); }
  document.addEventListener('click', async event => {
    if (sessionLocked || !S.user) {
      const allowed = ['account','auth-login','auth-register','close-modal','legal','install-help'];
      if (!allowed.includes(event.target.closest('[data-action]')?.dataset.action)) return;
    }
    document.querySelector('#toast').classList.remove('visible');
    const cryElement = event.target.closest('[data-cry]');
    if (cryElement) {
      cry(Number(cryElement.dataset.cry));
      // 처음 화면 포켓몬: 누르면 한 번 통 점프(손가락으로는 hover 가 없어서).
      const hopper = cryElement.closest('.title-pokemon');
      if (hopper?.classList) { hopper.classList.remove('is-hopping'); void hopper.offsetWidth; hopper.classList.add('is-hopping'); setTimeout(() => hopper.classList.remove('is-hopping'), 1250); }
      return;
    }
    const slotElement = event.target.closest('[data-party-slot]');
    if (slotElement) { partyPicker(Number(slotElement.dataset.partySlot)); return; }
    const pickElement = event.target.closest('[data-party-pick]');
    if (pickElement) {
      const id = Number(pickElement.dataset.partyPick);
      const slot = partySlot;
      partyGuideSlot = null;
      setPartner(slot, id); closeModal();
      // 필드 가방에서 바꿨으면 필드에 그대로 남아 동행만 바뀐다. 도감에서 바꿨으면 도감을 다시 그린다.
      if (screen === 'dex') { dexScreen(false); popPartySlot(partyIds().indexOf(id), id); } else { cry(id); if (bagOpen) bagModal(); }
      toast(DexHint.say('partnerSet', POKEMON.find(p => p.id === id).name));
      return;
    }
    const actionElement = event.target.closest('[data-action]');
    const regionElement = event.target.closest('button.region-card[data-region]');
    const answerElement = event.target.closest('[data-answer]');
    const filterElement = event.target.closest('[data-filter]');
    const genElement = event.target.closest('[data-gen]');
    const pokemonElement = event.target.closest('[data-pokemon]');
    const areaElement = event.target.closest('[data-area]');
    const difficultyElement = event.target.closest('[data-difficulty]');
    const soundElement = event.target.closest('[data-sound]');
    const lookElement = event.target.closest('button[data-trainer-look]'); // <html> 에도 data-trainer-look 이 있어 버튼만
    if (regionElement) {
      region = regionElement.dataset.region;
      // 고른 카드가 살짝 커졌다 들어가고, 출발 인사를 하고 떠난다.
      regionElement.classList.add('is-picked');
      const departure = line('depart', { place: R.REGIONS[region].name });
      createField();
      // 출발 인사는 장면 전환 제목으로만 보인다. 도착하면 트레이너 말풍선이 따로 인사하니 아래 안내 글은 띄우지 않는다.
      await travelTo('field', 'travel', departure);
      return;
    }
    const methodElement = event.target.closest('button[data-method]');
    if (methodElement) { chooseMethod(methodElement.dataset.method); return; }
    if (answerElement) { selectAnswer(Number(answerElement.dataset.answer)); return; }
    if (filterElement) { dexFilter = filterElement.dataset.filter; dexScreen(); return; }
    if (genElement) {
      // 잠긴 세대 칩은 눌러도 목록을 바꾸지 않고 살짝 흔들리기만 한다(설명 글 없이, 2026-11-13 Aside QA).
      if (genElement.dataset.locked) {
        genElement.classList.remove('is-shaking');
        void genElement.offsetWidth;
        genElement.classList.add('is-shaking');
        return;
      }
      dexGen = Number(genElement.dataset.gen); dexScreen();
      const gen = POKEMON.filter(p => p.gen === dexGen);
      if (gen.every(p => S.state.caught.includes(p.id))) toast(DexHint.say('complete'));
      return;
    }
    if (pokemonElement) { showPokemon(Number(pokemonElement.dataset.pokemon)); return; }
    if (soundElement) {
      // 「소리」 켜기·끄기: 넷을 같은 값으로 저장하고(soundSettings) 바로 맞춘다 — 끄면 음악·읽기·안내·효과음이 멈추고, 켜면 지금 화면 곡만 다시.
      S.update({ settings: soundSettings(soundElement.dataset.sound === 'true') }, true);
      syncAudio(); musicForScreen(); settingsModal();
      return;
    }
    if (lookElement) { setTrainerLook(lookElement.dataset.trainerLook); settingsModal(); return; }
    const levelElement = event.target.closest('[data-setting]');
    if (levelElement && ['mathMax', 'koreanLevel', 'englishLevel'].includes(levelElement.dataset.setting)) {
      S.update({ settings: { [levelElement.dataset.setting]: Number(levelElement.dataset.value) } }, true);
      settingsModal(); return;
    }
    if (areaElement || difficultyElement) {
      S.update({ settings: { ...(areaElement ? {area:areaElement.dataset.area} : {}), ...(difficultyElement ? {difficulty:Number(difficultyElement.dataset.difficulty)} : {}) } }, true);
      settingsModal(); return;
    }
    if (!actionElement) return;
    const action = actionElement.dataset.action;
    switch(action) {
      case 'skip-tutorial': skipTutorial(); break;
      case 'start': if (S.user) void travelTo('regions','travel'); else authModal(true, () => void travelTo('regions','travel')); break;
      case 'nav-back': goBack(); break;
      case 'settings':
        // 배틀 안 설정 버튼: 창을 열면 하던 안내·기다리던 안내도 멈춘다(문제 읽기는 showModal 이 멈춘다). 닫으면 resumeBattle 이 잇는다.
        if (screen === 'battle') window.VoiceGuide?.cancel();
        settingsModal(); break;
      case 'wordbook': openWordbook(); break;
      case 'yard': if (S.user) void travelTo('yard','travel','마당으로 가자!'); else authModal(false, () => void travelTo('yard','travel','마당으로 가자!')); break;
      case 'regions': if (S.user) void travelTo('regions','travel'); else authModal(true, () => void travelTo('regions','travel')); break;
      case 'dex': goDex(); break;
      case 'map': goMap(); break;
      case 'bag': bagModal(); break;
      case 'caught-dex': goDex(true); break;
      case 'party-clear': clearPartner(partySlot); closeModal(); if (screen === 'dex') dexScreen(false); else if (bagOpen) bagModal(); toast(DexHint.say('partnerClear')); break;
      case 'back-field': backToField(); break;
      case 'run-away': void runAway(); break;
      case 'questions': R.startQuestions(battle); battleScreen(); break;
      case 'throw': void throwBall(); break;
      case 'hint-regions': closeModal();void travelTo('regions','travel','어디로 갈까?');break;
      case 'close-modal': bagOpen = false; closeModal(); break;
      case 'auth-login': authModal(false, modalRoot.authNext); break;
      case 'auth-register': authModal(true, modalRoot.authNext); break;
      case 'account': authModal(); break;
      case 'stamps': stampsModal(); break;
      case 'stamp-gift-open': openStampGift(); break;
      case 'gift-close': closeStampGift(); break;
      case 'credits': showCredits(); break;
      case 'legal': showModal('<h2 id="modal-title">이용 안내</h2>', '<div class="parent-notes"><p>부모님과 함께 사용하는 비공식·비상업 개인 학습 게임입니다.</p><p>게임 기록·수첩 이름·비밀번호 확인값은 이 기기의 브라우저에 저장합니다. 게임 기록을 서버로 전송하지 않습니다.</p><p>브라우저 데이터를 지우거나 기기를 잃으면 기록을 복구하지 못할 수 있습니다. 설정에서 기록을 백업해 보관해 주세요.</p><p>포켓몬 그림·울음소리 등은 외부 자료원에서 불러오므로 해당 제공자와 호스팅 서비스에는 IP 주소 등 접속 정보가 전달될 수 있습니다.</p><p>부모 비밀번호는 어린이의 우발적 실행을 막는 앱 안 잠금입니다. 기기 자체의 잠금이나 사용 시간 제한을 대신하지 않습니다.</p><p>포켓몬 캐릭터·이름·이미지의 권리는 원 권리자에게 있으며 이 게임은 공식 제품이 아닙니다. 무료·API 사용은 별도의 이용 허가를 뜻하지 않습니다.</p><p><a href="privacy.html" target="_blank" rel="noopener noreferrer">개인정보·보관 안내</a> · <a href="terms.html" target="_blank" rel="noopener noreferrer">이용 조건</a></p></div>', 'modal--form'); break;
      case 'install-help': showModal('<h2 id="modal-title">홈 화면에 추가</h2>', '<div class="parent-notes"><p>아이폰·아이패드: Safari에서 이 주소를 연 뒤 공유 메뉴 → 홈 화면에 추가를 눌러 주세요.</p><p>안드로이드·PC: 브라우저 메뉴의 앱 설치 또는 홈 화면에 추가를 눌러 주세요.</p><p>처음에는 인터넷이 필요하며 한 번 받은 화면·그림은 기기에 보관합니다. 아직 받지 않은 그림·소리는 연결이 필요합니다.</p><p>설치한 앱에서도 부모 비밀번호로 수첩을 엽니다. 기기에 따라 Safari와 설치한 앱의 저장 공간이 다를 수 있으니 기록 백업을 먼저 받아 주세요.</p></div>', 'modal--form'); break;
      case 'feedback': showModal('<h2 id="modal-title">부모님 제안·오류 제보</h2>', '<div class="parent-notes"><p>부모님이 GitHub 계정으로 작성하는 공개 게시판입니다. 글과 첨부는 누구나 볼 수 있어요.</p><p>아이 이름·얼굴·연락처·비밀번호·백업 파일은 올리지 마세요. 게임 기록은 자동으로 보내지 않습니다.</p><p><a class="button secondary small" href="https://github.com/semi0x3b/PokeAdventure/issues/new/choose" target="_blank" rel="noopener noreferrer">기능 제안·오류 제보 열기</a></p><p>잠금 우회·정보 노출 같은 보안 문제는 공개하지 말고 <a href="https://github.com/semi0x3b/PokeAdventure/security/advisories/new" target="_blank" rel="noopener noreferrer">비공개로 신고해 주세요</a>.</p><p><a href="privacy.html" target="_blank" rel="noopener noreferrer">개인정보·보관 안내</a></p></div>', 'modal--form'); break;
      case 'backup-export': {
        try { const raw=await S.exportBackup();const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='PokeAdventure-backup-'+todayKey()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('기록 백업을 저장했어요. 다른 사람에게 보내지 말아 주세요.'); } catch(error){toast(error.message);} break;
      }
      case 'backup-import': {
        const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';
        picker.addEventListener('change',async()=>{const file=picker.files?.[0];if(!file)return;if(file.size>1024*1024){toast('백업 파일이 너무 커요.');return;}if(!window.confirm('현재 기기의 기록을 백업 파일로 바꿀까요? 먼저 현재 기록을 백업해 주세요.'))return;try{await S.importBackup(await file.text());closeModal();field=null;battle=null;setScreen('title');toast('이 기기에 기록을 복원했어요.');}catch(error){toast(error.message);}});picker.click();break;
      }
      case 'feature-tour': closeModal(); window.FeatureTour?.start(); break;
      case 'eraser-trace': {
        // 지우개 켜기/끄기: 켜면 문지른 곳의 획만 지워진다. 버튼이 눌린 모양(is-on)으로 지금 도구를 보여 준다.
        if (!tracingPad) break;
        tracingPad.setEraser(!tracingPad.eraser);
        actionElement?.classList.toggle('is-on', tracingPad.eraser);
        actionElement?.setAttribute('aria-pressed', String(tracingPad.eraser));
        break;
      }
      case 'check-trace': checkTrace(); break;
      case 'read-question': if (!readBattle(true) && soundOn()) toast('이 브라우저에서는 문제 읽기를 사용할 수 없어요.'); break;
      case 'logout':
        if (screen === 'battle' && !['caught','fled'].includes(battle.phase)) { toast('친구와의 만남을 끝낸 뒤 로그아웃해 주세요.'); break; }
        try { await S.logout(); resetTitleFor = null; closeModal(); field = null; battle = null; setScreen('title'); }
        catch(error) { toast(error.message); }
        break;
      case 'reset-open':
        // 로그아웃처럼 배틀 중(잡았다·도망 화면 전)에는 막는다.
        if (screen === 'battle' && !['caught','fled'].includes(battle.phase)) { toast('친구와의 만남을 끝낸 뒤 처음부터 다시 할 수 있어요.'); break; }
        resetModal();
        break;
    }
  });
  // 그림 파일이 없을 때 data-fallback 그림으로 한 번만 바꾼다(아직 도착하지 않은 새 출석 배지 등).
  document.addEventListener('error', event => {
    const image = event.target;
    const fallback = image?.dataset?.fallback;
    if (!fallback || image.dataset.fellBack) return;
    image.dataset.fellBack = 'true';
    if (image.dataset.fallbackClass) image.classList.add(image.dataset.fallbackClass);
    image.src = fallback;
  }, true);
  window.addEventListener('savechange', updateHeader);
  window.addEventListener('savechange', () => { if (!S.user && !sessionLocked) void lockSession(); });
  // 로그인·로그아웃·다른 기기에서 바꾼 캐릭터도 바로 전투 뒷모습에 맞춘다.
  window.addEventListener('savechange', applyTrainerLook);
  applyTrainerLook();
  // 스페이스 = 지금 화면의 메인 버튼(2026-11-15 사용자 「스페이스를 누르면 메인버튼 클릭으로」). 메인 버튼이 하나로 정해진 곳만 누른다:
  // 처음 화면 「모험 시작」, 튜토리얼·같이 다닐 친구 카드 「다음·좋아!」, 난이도 카드 「어려운 문제로 바꾸기」, 잡았다·도망 화면 「계속」
  // (튜토리얼은 「모험 떠나기」), 배틀·글자 쓰기의 따라 쓰기 「다 썼어요」, 출석 도장판 「열기!」, 선물 장면 「신난다!」, 가입·로그인 창의 확인.
  // 고를 것이 여럿인 곳(보기·「어떻게 잡을까?」·지역·캐릭터·필드)은 누르지 않는다(보기는 숫자 1~4, 잡는 방법은 1·2).
  // 「처음부터 다시 하기」처럼 되돌릴 수 없는 버튼은 고르지 않는다. 이름 칸 같은 글자 칸에서는 빈칸을 그대로 쓴다.
  function primaryControl() {
    const ready = element => element && !element.disabled && element.getClientRects().length ? element : null;
    const gift = document.querySelector('.gift-scene');
    if (gift) return gift.classList.contains('revealed') ? ready(gift.querySelector('[data-action="gift-close"]')) : null;
    if (modalRoot.firstChild) return ready(modalRoot.querySelector('[data-action="stamp-gift-open"], #auth-form [type="submit"]'));
    if (screen === 'title') return ready(main.querySelector('.title-menu [data-action="start"]'));
    if (['tutorial', 'partyGuide', 'levelGuide'].includes(screen)) return ready(main.querySelector('[data-tutorial-next], [data-level-harder]'));
    if (screen === 'wordbook') return ready(main.querySelector('[data-wordbook-action="complete"]'));
    if (screen === 'battle') return ready(main.querySelector('.gb-result-actions [data-action], .gb-dock [data-action], .gb-popup:not(.is-closing) [data-action="check-trace"]'));
    return null;
  }
  window.addEventListener('keydown', event => {
    if (event.key === ' ' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey && !/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) {
      const control = primaryControl();
      // 초점이 다른 버튼에 있어도 그 버튼 대신 메인 버튼을 누른다(브라우저 기본 동작은 막는다).
      if (control) { event.preventDefault(); control.click(); return; }
    }
    document.querySelector('#toast').classList.remove('visible');
    if (modalRoot.firstChild || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if (['Enter',' '].includes(event.key) && event.target.matches('[data-cry]')) { event.preventDefault(); event.target.click(); return; }
    if(window.EncounterIntro?.active){if(!event.metaKey&&!event.ctrlKey&&!event.altKey)event.preventDefault();return;}
    // 「어떻게 잡을까?」 팝업: 1 공격하기·2 먹이 주기. 떠 있는 동안 3·4 는 아무것도 하지 않는다(뒤에 숨은 문제를 답하지 않게).
    if (screen === 'battle' && battleChoosing && /^[1-4]$/.test(event.key)) { event.preventDefault(); if(!event.repeat&&event.key<='2')chooseMethod(event.key==='1'?'attack':'feed'); return; }
    if (screen === 'battle' && /^[1-4]$/.test(event.key)) { event.preventDefault(); if(!event.repeat)selectAnswer(Number(event.key)-1); }
    const key = event.key.toLowerCase();
    if (screen === 'field' && ['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d'].includes(key)) { event.preventDefault(); keys.add(key); field.target = null; }
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => { keys.clear(); if (document.hidden) void lockSession(); });
  window.addEventListener('pagehide', () => { void lockSession(); });
  // 캔버스 크기는 레이아웃 크기(clientWidth)로 잰다. 들어올 때 줌아웃(transform) 중에도 지도 배율이 바뀌지 않게 한다.
  function canvasContext(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) {
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return { ctx, width, height };
  }
  // 필드 캔버스 색은 tokens.css 값을 읽어 쓴다(흰색 물결·먼지, 지도 밖 바탕).
  let fieldColors = null;
  function fieldColor(name) {
    if (!fieldColors) {
      const style = getComputedStyle(document.documentElement);
      fieldColors = {
        surface: style.getPropertyValue('--c-surface').trim() || '#ffffff',
        paper: style.getPropertyValue('--c-paper').trim() || '#fffdf5',
      };
    }
    return fieldColors[name];
  }
  // 볼·동행을 트레이너(한 장짜리 캔버스, z-index 2000) 뒤 또는 앞에 놓는다. 발이 아래(y가 큰) 쪽일수록 앞이다.
  function fieldDepth(y) {
    return String((y > field.player.y ? 2100 : 1000) + Math.round(y * 800));
  }
  function spriteImage(source) {
    if (!fieldSpriteImages.has(source)) {
      const record = { image: new Image(), failed: false };
      record.image.crossOrigin = 'anonymous';
      record.image.onerror = () => { record.failed = true; };
      record.image.src = source;
      fieldSpriteImages.set(source, record);
    }
    return fieldSpriteImages.get(source);
  }
  function imageReady(record) { return !record.failed && record.image.complete && record.image.naturalWidth > 0; }
  // 지도 그림판을 모두 불러오면 바닥·위층을 1배 크기 캔버스에 한 번 그려 둔다(매 프레임은 정수배로 키워 옮기기만 한다).
  // 불러오지 못한 그림판의 타일은 건너뛴다.
  let fieldLayers = null;
  function tileLayers(map) {
    if (fieldLayers?.region === map.region) return fieldLayers;
    const sheets = {};
    for (const [key, source] of Object.entries(map.sheets)) sheets[key] = spriteImage(source);
    if (Object.values(sheets).some(record => !record.failed && !imageReady(record))) return null;
    // 바닥 층은 지도 둘레 pad 칸(지도 밖 채움 beyond)까지 한 장에 그린다. 위층(나무 윗부분·지붕)은 지도 안만.
    const paint = (lists, pad) => {
      const side = (map.size + pad * 2) * map.tile;
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      for (const list of lists) for (const [sheet, sx, sy, dx, dy, width, height] of list) {
        if (imageReady(sheets[sheet])) ctx.drawImage(sheets[sheet].image, sx, sy, width, height, dx + pad * map.tile, dy + pad * map.tile, width, height);
      }
      return canvas;
    };
    fieldLayers = { region: map.region, ground: paint([map.beyond, map.ground], map.pad), over: paint([map.over], 0), pad: map.pad, sheets };
    return fieldLayers;
  }
  // 높은 풀이 바람에 한 도트씩 흔들린다(모션 줄이기에서는 멈춤).
  function grassSway(x, y, reduced) {
    return reduced ? 0 : Math.round(Math.sin(field.time * 2.4 + x * .9 + y * .5) * 1.1);
  }
  // ---------- 도트 트레이너 ----------
  // 그림판은 앞에서부터 쓸 수 있는 것을 쓴다. cell 은 한 칸 크기(도트), foot 은 칸 안에서 발이 닿는 줄, body 는 몸 높이.
  // byRow 가 참이면 행이 방향(아래·위·왼쪽·오른쪽)이고 열이 걷기 네 장, 거짓이면 그 반대.
  // {look} 은 고른 캐릭터(trainerLook: boy·girl). 캐릭터를 바꾸면 그림판을 새로 읽는다.
  const TRAINER_SHEETS = [
    { src: 'img/field-tiles/trainer-{look}.png', cell: [16, 32], foot: 29, body: 21, byRow: true }, // Codex 도트(이 게임 전용)
    { src: 'img/field-tiles/trainer-temp.png', cell: [16, 16], foot: 15, body: 15, byRow: false }, // 임시: Ninja Adventure Boy
  ];
  let trainerSheet = null;
  function currentTrainerSheet() {
    const look = trainerLook();
    if (!trainerSheet || trainerSheet.look !== look) {
      const sheet = { image: new Image(), index: 0, look };
      trainerSheet = sheet;
      sheet.image.onerror = () => {
        if (sheet.index < TRAINER_SHEETS.length - 1) sheet.image.src = TRAINER_SHEETS[++sheet.index].src.replace('{look}', look);
      };
      sheet.image.src = TRAINER_SHEETS[0].src.replace('{look}', look);
    }
    return { image: trainerSheet.image, sheet: TRAINER_SHEETS[trainerSheet.index] };
  }
  // 트레이너 몸 높이(px): 그림판이 정해지기 전에는 새 도트 기준.
  function trainerHeight(scale) { return (trainerSheet ? TRAINER_SHEETS[trainerSheet.index] : TRAINER_SHEETS[0]).body * scale; }
  // 트레이너: 발(땅에 닿는 점)이 (x, y)에 오도록 그림 칸을 scale 배로 그린다.
  function drawPlayer(ctx, x, y, scale, moving, time, direction = 'front', marker = ctx.canvas) {
    const pose = window.TrainerView?.frameFor(direction, moving, time, Boolean(motionPreference?.matches)) || { direction: 0, frame: 0, walking: false };
    if (marker?.dataset) { marker.dataset.trainerFrame = pose.walking ? String(pose.frame) : 'idle'; marker.dataset.trainerRow = String(pose.direction); }
    const { image, sheet } = currentTrainerSheet();
    if (!image.complete || !image.naturalWidth) return;
    const [width, height] = sheet.cell;
    const column = sheet.byRow ? pose.frame : pose.direction;
    const row = sheet.byRow ? pose.direction : pose.frame;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, column * width, row * height, width, height,
      Math.round(x - width * scale / 2), Math.round(y - sheet.foot * scale), width * scale, height * scale);
  }
  // ---------- 도트 몬스터볼 ----------
  // Codex 도트 볼(img/field-tiles/ball-red.png·ball-gold.png: 16×16 칸 4장, 굴러가는 모습)을 쓰고,
  // 없으면 지금 볼 그림을 12px 로 줄여 한 도트 테두리를 두른 한 장(14×14)으로 대신한다(그때는 90도씩 돌려 굴린다).
  const FIELD_BALL_ART = {
    red: { pixel: 'img/field-tiles/ball-red.png', painted: 'img/art/pokeball.png' },
    gold: { pixel: 'img/field-tiles/ball-gold.png', painted: 'img/art/gold-pokeball.png' },
  };
  const fieldBallSprites = {};
  function fieldBallSprite(gold) {
    const kind = gold ? 'gold' : 'red';
    if (fieldBallSprites[kind]) return fieldBallSprites[kind];
    const art = FIELD_BALL_ART[kind];
    const record = { src: art.pixel, width: 16, frames: 4 };
    fieldBallSprites[kind] = record;
    const pixel = new Image();
    pixel.onload = () => Object.assign(record, { width: pixel.naturalHeight, frames: Math.max(1, Math.round(pixel.naturalWidth / pixel.naturalHeight)) });
    pixel.onerror = () => {
      const painted = new Image();
      painted.onload = () => {
        // 그림판(1312×1199)에서 볼이 있는 곳(가로 220~1060, 세로 145~1044)만 잘라 12×12 로 줄인다.
        const canvas = document.createElement('canvas');
        canvas.width = 14;
        canvas.height = 14;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        const kx = painted.naturalWidth / 1312, ky = painted.naturalHeight / 1199;
        ctx.drawImage(painted, 220 * kx, 145 * ky, 840 * kx, 899 * ky, 1, 1, 12, 12);
        try {
          const pixels = ctx.getImageData(0, 0, 14, 14);
          const data = pixels.data;
          const solid = new Uint8Array(14 * 14);
          for (let index = 0; index < solid.length; index++) solid[index] = data[index * 4 + 3] >= 110 ? 1 : 0;
          for (let index = 0; index < solid.length; index++) {
            const x = index % 14, y = Math.floor(index / 14);
            const edge = !solid[index] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => solid[(y + dy) * 14 + x + dx] && x + dx >= 0 && x + dx < 14);
            // 반투명 도트를 없애고, 볼 바깥 한 도트는 타일셋 테두리 색(남색 숯빛)으로 칠한다.
            if (edge) data.set([20, 27, 27, 255], index * 4);
            else data[index * 4 + 3] = solid[index] ? 255 : 0;
          }
          ctx.putImageData(pixels, 0, 0);
          Object.assign(record, { src: canvas.toDataURL(), width: 14, frames: 1 });
        } catch { Object.assign(record, { src: art.painted, width: 14, frames: 1 }); }
      };
      painted.src = art.painted;
    };
    pixel.src = art.pixel;
    return record;
  }
  // 트레이너가 차지하는 사각형(지도 px): 그림 가운데 몸이 있는 가로 12도트 × 몸 높이.
  function trainerBox(point, sizes, size) {
    const x = point.x * size, y = point.y * size, half = sizes.tile * 6 / 16;
    return { left: x - half, right: x + half, top: y - sizes.trainer, bottom: y };
  }
  function shapeBox(shape, point, size) {
    const x = point.x * size, y = point.y * size;
    return { left: x + shape.left, right: x + shape.right, top: y + shape.top, bottom: y + shape.bottom };
  }
  function boxesOverlap(a, b, padding) {
    return a.left < b.right + padding && b.left < a.right + padding && a.top < b.bottom + padding && b.top < a.bottom + padding;
  }
  // 걷는 속도: 1초에 4.5칸쯤(2026-11-13 사용자: 조금 더 빠르게, 3.5칸에서).
  function trainerSpeed(view) { return FieldWorld.TILE * view.scale * 4.5; }
  // 방향키(WASD)가 먼저, 아니면 누른 곳·끄는 손가락·쫓는 볼 쪽으로 걷는다. 걸을 수 없는 곳으로 가려 하면 가장자리를 따라 미끄러진다.
  function moveTrainer(dt, view, margin) {
    const map = fieldMap();
    const size = view.size;
    // 배를 타고 있으면 물 칸만 다닌다(map.waterMap). 땅·부두를 누르면 그쪽 물가까지 가서 내린다(아래 raw 걸음).
    const ground = field.riding ? map.waterMap : map;
    let dx = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
    let dy = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
    let remaining = Infinity;
    if (dx || dy) {
      field.target = null;
      field.chase = null;
      field.hint = 0;
    } else {
      const chased = field.chase == null ? null : field.balls[field.chase];
      if (chased) field.target = FieldWorld.nearestWalkable(chased.water && field.riding ? map.waterMap : map, chased, margin);
      if (field.target) {
        // 배를 탄 채 땅·부두를 눌렀으면 그 자리에 가장 가까운 물까지 배로 가고, 거기서 땅 쪽으로 한 걸음 디뎌 내린다(아래 raw 걸음).
        // 부두를 눌렀을 때 부두 끝을 돌아 반대쪽으로 가지 않게 한다.
        let goal = field.target;
        if (field.riding && !FieldWorld.isSailable(map, goal, margin)) {
          const shore = FieldWorld.nearestWalkable(map.waterMap, goal, margin);
          if (Math.hypot(shore.x - field.player.x, shore.y - field.player.y) * size > 3) goal = shore;
        }
        // 장애물 너머를 누르면 칸 길찾기로 돌아간다. 목적지가 다른 칸으로 옮겨질 때만 길을 다시 찾는다.
        const key = Math.floor(goal.x * map.size) + ',' + Math.floor(goal.y * map.size);
        if (field.pathKey !== key || !field.path?.length) {
          field.path = FieldWorld.findPath(ground, field.player, goal, margin) || [goal];
          field.pathKey = key;
        }
        field.path[field.path.length - 1] = goal;
        while (field.path.length > 1 && Math.hypot(field.path[0].x - field.player.x, field.path[0].y - field.player.y) * size < 3) field.path.shift();
        const next = field.path[0];
        dx = (next.x - field.player.x) * size;
        dy = (next.y - field.player.y) * size;
        remaining = Math.hypot(dx, dy);
        // 손가락을 누르고 있으면 목적지에 닿아도 목적지를 지우지 않는다(손가락이 다시 움직이면 바로 따라간다).
        if (remaining < 3 && field.path.length === 1) { if (field.drag == null) { field.target = null; field.chase = null; } dx = 0; dy = 0; }
      }
    }
    if (!field.target) { field.path = null; field.pathKey = ''; }
    const length = Math.hypot(dx, dy);
    if (!length) { field.moving = false; field.stuck = 0; return 0; }
    field.player.direction = CompanionView.directionOf(dx, dy, field.player.direction);
    const step = Math.min(remaining, trainerSpeed(view) * dt);
    const raw = { x: field.player.x + dx / length * step / size, y: field.player.y + dy / length * step / size };
    // 배를 타고 가다 가는 쪽 뱃머리(BOAT_HALF)가 땅·부두에 닿으면 뱃머리 앞으로 건너 내린다. 배는 지금 자리(물 위)에 남아 끝만
    // 물가에 닿는다 — 배 가운데가 물가까지 가서 내리면 큰 배(2026-11-14)가 땅·부두에 반쯤 올라앉아 보였다. 뱃머리 자리가 걸을 수 없으면
    // 전처럼 배 가운데가 땅에 들어설 때 내린다.
    if (field.riding) {
      const ux = dx / length, uy = dy / length;
      const reach = 1 / Math.hypot(ux / BOAT_HALF.x, uy / BOAT_HALF.y); // 가는 쪽 배 테두리까지(도트, 타원으로 어림 — 비스듬히 가도 끝에 맞게)
      const bow = { x: raw.x + ux * reach * mapDot(), y: raw.y + uy * reach * mapDot() };
      const landing = [bow, raw].find(spot => !FieldWorld.isSailable(map, spot, margin) && FieldWorld.isWalkable(map, spot, margin));
      if (landing) {
        leaveBoat(landing);
        field.moving = true;
        return step;
      }
    }
    const next = FieldWorld.nearestWalkable(ground, raw, margin);
    const moved = Math.hypot(next.x - field.player.x, next.y - field.player.y) * size;
    field.step = { x: (next.x - field.player.x) * size, y: (next.y - field.player.y) * size };
    field.player.x = next.x;
    field.player.y = next.y;
    field.moving = moved > step * .25;
    // 벽에 막혀 거의 못 가면 잠깐 뒤 목적지를 버린다(손가락을 누르고 있는 동안은 그대로 둔다).
    if (field.target && !field.moving && field.drag == null) {
      field.stuck += dt;
      if (field.stuck > .4) { field.target = null; field.chase = null; }
    } else field.stuck = 0;
    return moved;
  }
  // 걸어온 길: 맨 끝 점은 늘 지금 발 위치다. 앞 점과 3px 넘게 떨어지면 새 점을 찍고, 400점을 넘으면 오래된 점부터 버린다.
  function recordTrail(view) {
    const history = field.history;
    const now = { x: field.player.x, y: field.player.y };
    const anchor = history[history.length - 2];
    if (anchor && Math.hypot((now.x - anchor.x) * view.size, (now.y - anchor.y) * view.size) < 3) history[history.length - 1] = now;
    else history.push(now);
    if (history.length > 400) history.shift();
  }
  // 동행은 끈에 묶인 듯 따라온다(2026-11-13 사용자: 동행이 난리 — 비켜서기·앞길 막기 계산이 동행을 트레이너보다 두 배 움직이게 했다).
  // 앞 사람(첫째는 트레이너, 둘째는 첫째)과 발밑 상자가 떨어진 거리가 끈 길이보다 멀어질 때만 앞 사람 쪽으로 끌려오고, 가까우면 제자리에 선다.
  // 트레이너가 되돌아 걸어오면 동행은 선 채로 지나가게 둔다(그림은 발이 아래인 쪽이 앞). 끝 거리는 발밑 상자가 딱 닿는 자리라 쉬면 겹치지 않는다.
  // ponytail: 끈은 직선이라 모서리를 돌 때 질러간다. 걸을 수 없는 곳이면 한 축씩만 움직이고, 그래도 막혀 멀어지면 걸어온 길 위로 옮긴다.
  const FOLLOW_SLACK_TILES = .1; // 발밑 상자 사이 여유(칸). 2026-11-13 사용자: 간격이 너무 넓다
  // 부딪힘으로 보는 아래쪽 높이(칸): 트레이너는 1.2칸(아래로 걸을 때 뒤따르는 동행 얼굴이 머리 위로 보이게), 동행은 0.8칸(앞에 그려질 때 트레이너 다리를 덜 가리게).
  const TRAINER_FOOT_TILES = 1.2, COMPANION_FOOT_TILES = .8;
  function footing(box, sizes, tiles) { return { ...box, top: Math.max(box.top, box.bottom - sizes.tile * tiles) }; }
  function boxCenter(box) { return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, w: (box.right - box.left) / 2, h: (box.bottom - box.top) / 2 }; }
  // 대각선으로 끌려올 때 앞뒤·좌우 모습이 매 프레임 바뀌지 않게, 지금 축을 1.3배까지 유지한다.
  function steadyDirection(dx, dy, previous) {
    const horizontal = previous === 'left' || previous === 'right';
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (horizontal && ax && ay < ax * 1.3) return dx > 0 ? 'right' : 'left';
    if (!horizontal && ay && ax < ay * 1.3) return dy > 0 ? 'front' : 'back';
    return CompanionView.directionOf(dx, dy, previous);
  }
  function updateCompanions(dt, view, sizes, margin) {
    const ids = partyIds();
    const size = view.size;
    const map = fieldMap();
    const maxStep = trainerSpeed(view) * 1.6 * dt;
    const slack = sizes.tile * FOLLOW_SLACK_TILES;
    let leaderBox = footing(trainerBox(field.player, sizes, size), sizes, TRAINER_FOOT_TILES);
    // 앞 사람 모두(트레이너·앞 동행): 이들과 발밑이 겹치면 옆으로 비켜선다.
    const blockers = [leaderBox];
    const step = Math.hypot(field.step?.x || 0, field.step?.y || 0);
    const heading = field.moving && step ? { x: field.step.x / step, y: field.step.y / step } : null;
    let trailDistance = 0;
    for (let slot = 0; slot < 2; slot++) {
      const id = ids[slot];
      if (!id || !window.CompanionView) { field.followers[slot] = null; continue; }
      const shape = companionShape(id, sizes.companion, sizes.tile);
      const footOf = point => footing(shapeBox(shape, point, size), sizes, COMPANION_FOOT_TILES);
      const lead = boxCenter(leaderBox);
      const reachX = lead.w + boxCenter(footOf({ x: 0, y: 0 })).w + slack;
      const reachY = lead.h + boxCenter(footOf({ x: 0, y: 0 })).h + slack;
      trailDistance += Math.max(reachX, reachY);
      let state = field.followers[slot];
      // 처음·동행이 바뀜·너무 멀어짐(지역 이동 등)이면 걸어온 길 위 뒤쪽에 바로 세운다.
      const far = state && Math.hypot((state.x - field.player.x) * size, (state.y - field.player.y) * size) > sizes.tile * 8;
      if (state?.id !== id || far) {
        // 새 동행(방금 잡음·바꿈)은 앞 사람 바로 뒤(보는 쪽 반대)에 나타난다. 걸을 수 없는 곳이면 걸어온 길 위로
        // (2026-11-13 Aside QA: 잡은 뒤 돌아오면 새 동행이 강가 쪽에 따로 서 있었다).
        const leaderAt = slot === 0 ? field.player : field.followers[0];
        const facing = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] }[leaderAt?.direction || field.player.direction] || [0, 1];
        // 띄우는 거리는 발밑 상자가 딱 닿지 않는 끈 길이(가는 축의 reach)보다 조금 더(고정 칸 수로 두면 큰 동행·트레이너 발밑과 닿았다).
        const reach = (facing[0] ? reachX : reachY) * 1.08 / size;
        const behind = leaderAt ? { x: leaderAt.x - facing[0] * reach, y: leaderAt.y - facing[1] * reach } : null;
        // 들어온 첫 화면은 트레이너가 앞(아래)을 보고 있어 「뒤」가 머리 위가 된다 — 깔아 둔 걸어온 길(왼쪽·아래쪽·출구 안)에 줄 세운다.
        const spot = !field.freshEntry && behind && FieldWorld.isWalkable(map, behind, margin) ? behind
          : CompanionView.followPosition(field.history, trailDistance, size, size) || { x: field.player.x, y: field.player.y - sizes.tile / size };
        state = { id, x: spot.x, y: spot.y, direction: leaderAt?.direction || 'front', moving: false, walk: 0, side: 0 };
      }
      const own = boxCenter(footOf(state));
      const dx = own.x - lead.x, dy = own.y - lead.y;
      // 상자 거리(가로·세로 중 더 먼 쪽 비율)가 1을 넘으면 그만큼만 앞 사람 쪽으로 당긴다.
      const stretch = Math.max(Math.abs(dx) / reachX, Math.abs(dy) / reachY);
      // 배에서 막 내린 동행(배 칸 자리, 물 위)은 끈이 느슨해도 가장 가까운 땅(부두·물가)으로 곧장 건너온다(물 위라 걷기 판정은 건너뛴다).
      // 트레이너 쪽으로 당기면 트레이너 발밑에 막혀 물 위에 서 있었다(2026-11-14 시험). 땅에 닿으면 끈 따라오기로 돌아간다.
      if (state.aboard && FieldWorld.isWalkable(map, state, margin)) state.aboard = false;
      const land = state.aboard ? FieldWorld.nearestWalkable(map, state, margin) : null;
      let moveX = 0, moveY = 0;
      if (stretch > 1 || land) {
        moveX = land ? (land.x - state.x) * size : dx / stretch - dx;
        moveY = land ? (land.y - state.y) * size : dy / stretch - dy;
        const length = Math.hypot(moveX, moveY);
        if (length > maxStep) { moveX *= maxStep / length; moveY *= maxStep / length; }
        const walkable = (mx, my) => state.aboard || FieldWorld.isWalkable(map, { x: state.x + mx / size, y: state.y + my / size }, margin);
        if (!walkable(moveX, moveY)) {
          if (walkable(moveX, 0)) moveY = 0;
          else if (walkable(0, moveY)) moveX = 0;
          else if (stretch > 2) {
            // 막힌 곳에 걸려 끈이 두 배로 늘어나면 걸어온 길 위로 조금씩 옮긴다.
            const spot = CompanionView.followPosition(field.history, trailDistance, size, size);
            if (spot) { moveX = (spot.x - state.x) * size; moveY = (spot.y - state.y) * size; const jump = Math.hypot(moveX, moveY); if (jump > maxStep) { moveX *= maxStep / jump; moveY *= maxStep / jump; } }
          } else { moveX = 0; moveY = 0; }
        }
        state.x += moveX / size;
        state.y += moveY / size;
      }
      // 트레이너가 되돌아 걸어와 발밑이 겹치면, 트레이너가 가는 방향의 옆으로(이미 서 있던 쪽으로) 조금씩 비켜선다.
      // 한 번 고른 쪽은 겹침이 풀릴 때까지 유지해서 좌우로 왔다 갔다 하지 않는다.
      const touches = box => {
        const other = boxCenter(box), mine = boxCenter(footOf(state));
        return Math.abs(mine.x - other.x) < other.w + boxCenter(footOf({ x: 0, y: 0 })).w && Math.abs(mine.y - other.y) < other.h + boxCenter(footOf({ x: 0, y: 0 })).h;
      };
      // 트레이너가 걸어오는 쪽(발밑 상자를 가는 방향으로 0.9칸 앞으로 민 자리)에 있어도 미리 비켜선다 — 부딪힌 뒤에 비키면 잠깐 겹친다.
      const ahead = heading ? { left: blockers[0].left + heading.x * sizes.tile * .9, right: blockers[0].right + heading.x * sizes.tile * .9, top: blockers[0].top + heading.y * sizes.tile * .9, bottom: blockers[0].bottom + heading.y * sizes.tile * .9 } : null;
      const overlapped = blockers.find(touches) || (ahead && touches(ahead) ? blockers[0] : null);
      if (overlapped && dt > 0) {
        const other = boxCenter(overlapped), mine = boxCenter(footOf(state));
        const away = { x: mine.x - other.x, y: mine.y - other.y };
        const awayLength = Math.hypot(away.x, away.y) || 1;
        let push = { x: away.x / awayLength, y: away.y / awayLength };
        if (heading) {
          if (!state.side) state.side = (-heading.y * away.x + heading.x * away.y) >= 0 ? 1 : -1;
          push = { x: -heading.y * state.side * .85 + push.x * .15, y: heading.x * state.side * .85 + push.y * .15 };
        }
        const pushLength = Math.hypot(push.x, push.y) || 1;
        const pushStep = trainerSpeed(view) * 2.2 * dt; // 겹침은 빨리 풀되(시험: 걷는 중 겹침 0) 한 프레임 8px 안쪽이라 튀어 보이지 않는다
        let pushX = push.x / pushLength * pushStep, pushY = push.y / pushLength * pushStep;
        const free = (mx, my) => FieldWorld.isWalkable(map, { x: state.x + mx / size, y: state.y + my / size }, margin);
        // 걸을 수 있는 쪽으로만 비켜서되, 사방이 막힌 좁은 길이면 장식 위로라도 비켜선다(겹쳐 있는 것보다 낫다).
        if (!free(pushX, pushY)) { if (free(pushX, 0)) pushY = 0; else if (free(0, pushY)) pushX = 0; }
        state.x += pushX / size;
        state.y += pushY / size;
        moveX += pushX;
        moveY += pushY;
      } else state.side = 0;
      const movedPx = Math.hypot(moveX, moveY);
      // 걷는 모습은 조금 움직였을 때도 0.15초 이어서 보여 준다(걷기·서기 그림이 깜빡이지 않게).
      state.walk = movedPx > .3 ? .15 : Math.max(0, state.walk - dt);
      state.moving = state.walk > 0;
      // 움직이면 가는 쪽, 서 있으면 앞 사람 쪽을 본다.
      state.direction = movedPx > .3 ? steadyDirection(moveX, moveY, state.direction) : steadyDirection(-dx, -dy, state.direction);
      state.shape = shape;
      field.followers[slot] = state;
      leaderBox = footOf(state);
      blockers.push(leaderBox);
    }
    field.freshEntry = false;
  }
  // 볼: 보이는 화면 근처의 걸을 수 있는 곳에서 이따금 방향을 틀며 굴러간다. 많이 멀어지면 화면 안에 다시 나타난다.
  function updateBalls(dt, view, margin, insets, sizes) {
    const map = fieldMap();
    const radius = sizes.ball / 2;
    const centerX = field.camera.x + view.w / 2, centerY = field.camera.y + view.h / 2;
    // 볼은 지도 어디서든 제자리 근처를 굴러다닌다(화면으로 끌려오지 않는다). 화면 안에서는 위쪽 버튼·이름표 밑으로 들어가지 않고, 들어가 있으면 화면 가운데 쪽으로 나온다.
    const rects = hudRects(view);
    const underButtons = point => ballUnderHud(view, sizes, point, rects);
    // 볼은 트레이너 쪽으로 굴러오지 않는다(1.5칸 안에서는 다가가는 방향 금지). 만남은 아이가 걸어가 닿을 때만.
    const keepAway = sizes.tile * 1.5;
    const fromPlayer = point => Math.hypot((point.x - field.player.x) * view.size, (point.y - field.player.y) * view.size);
    const approaches = (from, to) => fromPlayer(to) < keepAway && fromPlayer(to) < fromPlayer(from);
    for (const ball of field.balls) {
      ball.spawn = Math.min(1, ball.spawn + dt * 2.5);
      // 물 위 볼은 사방이 물인 칸 안에서 천천히 떠다닌다(구르지 않고 둥실).
      const ground = ball.water ? map.openWaterMap : map;
      if (!FieldWorld.isWalkable(ground, ball, margin)) Object.assign(ball, FieldWorld.nearestWalkable(ground, ball, margin));
      ball.turn -= dt;
      if (ball.turn <= 0) { ball.heading += (Math.random() - .5) * 2.4; ball.turn = 1.2 + Math.random() * 2.4; }
      if (underButtons(ball)) ball.heading = Math.atan2(centerY - ball.y, centerX - ball.x);
      const speed = (ball.gold ? 1.3 : 1) * sizes.tile * (ball.water ? .3 : .9);
      let next = null;
      for (let attempt = 0; attempt < 6 && !next; attempt++) {
        const candidate = { x: ball.x + Math.cos(ball.heading) * speed * dt / view.size, y: ball.y + Math.sin(ball.heading) * speed * dt / view.size };
        // 출구 아치 안으로는 굴러가지 않는다(볼을 쫓다가 다른 지역으로 넘어가지 않게).
        const allowed = FieldWorld.isWalkable(ground, candidate, margin) && !FieldWorld.isCovered(map, candidate) && !FieldWorld.exitAt(map, candidate) &&
          (!underButtons(candidate) || underButtons(ball)) && !approaches(ball, candidate);
        if (allowed) next = candidate;
        else ball.heading = Math.random() * Math.PI * 2;
      }
      if (!next) continue;
      // 굴러간 거리만큼 돈다(반지름 기준). 왼쪽으로 가면 반대로 돈다.
      const rolled = ball.water ? 0 : Math.hypot(next.x - ball.x, next.y - ball.y) * view.size;
      ball.roll += rolled / radius * (Math.cos(ball.heading) < 0 ? -1 : 1);
      ball.x = next.x;
      ball.y = next.y;
    }
  }
  // 걸을 때 발밑에 작은 흙먼지(도트 한 칸짜리 네모). 만나는 칸에서는 그 칸다운 것으로: 맨 모래는 굵은 모래 먼지(더 자주),
  // 꽃밭·분수 둘레는 분홍 꽃잎(Ninja Adventure LeafPink 도트). 풀숲은 풀 흔들림, 물가는 옆 물 칸의 물결(drawGround).
  function updateDust(dt, view, moved, reduced) {
    for (const puff of field.dust) puff.age += dt;
    field.dust = field.dust.filter(puff => puff.age < (puff.kind === 'garden' ? .7 : .45));
    if (reduced || !moved || field.riding) return;
    field.dustTimer -= dt;
    if (field.dustTimer > 0) return;
    const kind = FieldWorld.encounterAt(fieldMap(), field.player);
    field.dustTimer = kind === 'sand' ? .07 : .12;
    const side = field.dust.length % 2 ? 1 : -1;
    field.dust.push({ x: field.player.x + side * 4 * view.scale / view.size, y: field.player.y, age: 0, kind });
  }
  function drawRing(ctx, x, y, radius, alpha, width) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = fieldColor('surface');
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * .5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // 발밑 그림자(도트 그림 shadow.png, 12×7). 그림은 불투명한 남색이라 옅게 그린다.
  function drawShadow(ctx, x, y, scale) {
    const shadow = spriteImage('img/field-tiles/shadow.png');
    if (!imageReady(shadow)) return;
    ctx.save();
    ctx.globalAlpha = .32;
    ctx.drawImage(shadow.image, Math.round(x - 6 * scale), Math.round(y - 4 * scale), 12 * scale, 7 * scale);
    ctx.restore();
  }
  function tileOnScreen(view, cameraX, cameraY, x, y) {
    const cell = FieldWorld.TILE * view.scale;
    const left = x * cell - cameraX, top = y * cell - cameraY;
    return left > -cell && top > -cell && left < view.width && top < view.height ? [left, top, cell] : null;
  }
  // 배 그림(Codex 도트, img/field-tiles/boat-big.png 128×40, 2026-11-14)의 64×40 두 장(x 0·64, 한 도트 출렁임)을 번갈아 그린다.
  // 배 가운데(칸 x 32·y 20)가 spot. 불투명 범위는 가운데에서 가로 -30~+29·세로 -19~+17, 칸막이 두 줄(x 23·40)로 바닥이 세 칸
  // (가운데 x -16·0·+16, 폭 14~16), 바닥은 세로 -12~+9 이고 그 아래가 앞 테두리다. 잠만보처럼 큰 동행도 한 칸에 들어오게 옛 배
  // (boat.png 가로 48×32, 불투명 43×28)보다 크게 그렸다(사용자 「포켓몬들도 같이 타야해」 뒤 큰 포켓몬이 배 밖으로 삐져나와서).
  // 매여 있을 때도 탄 뒤에도 어느 쪽으로 가든 늘 이 가로 그림이다(2026-11-14 「타기전 배모양과 탄 후 배모양이 다른거」 — 뱃머리가 따로 없는
  // 둥근 배라 뒤집지도 않는다). 가운데 칸에 트레이너, 양쪽 칸에 동행이 앉는다(seatCompanions).
  const BOAT = { src: 'img/field-tiles/boat-big.png', frames: [[0, 0, 64, 40], [64, 0, 64, 40]] };
  // 배 가운데에서 앞뒤 끝 도트 줄까지(도트): 좌우로 갈 때 x, 위아래로 갈 때 y. 물길이 시작하는 꼬리(updateTracks)와
  // 땅·부두에 닿으면 내리는 뱃머리(moveTrainer)가 이 거리다.
  const BOAT_HALF = { x: 29, y: 17 };
  function drawBoat(ctx, spot, scale, reduced) {
    const sheet = spriteImage(BOAT.src);
    if (!imageReady(sheet)) return;
    const [sx, sy, width, height] = BOAT.frames[reduced ? 0 : Math.floor(field.time * 2.5) % BOAT.frames.length];
    field.boat.cell = [sx, sy, width, height]; // 시험이 매여 있을 때·탄 뒤 같은 칸인지 본다(snapshot)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet.image, sx, sy, width, height, Math.round(spot.x - width * scale / 2), Math.round(spot.y - height * scale / 2), width * scale, height * scale);
  }
  // ---------- 발자국·물길(2026-11-14 사용자 「맵 걸어갈때 발자국 생기게해줘 물위는 배로 다니니 물 길로」) ----------
  // 트레이너가 STEP_DOTS 도트 걸을 때마다 왼발·오른발을 번갈아 바닥에 찍고, 배를 타고 가면 WAKE_DOTS 도트마다 배 꼬리 양쪽에 흰 물거품을
  // 하나씩 남긴다(양옆으로 퍼져 V자). 지도 도트 격자에 맞춘 네모(fillRect)만 그린다. 발자국은 FOOT_LIFE 초, 물거품은 WAKE_LIFE 초 뒤
  // 사라지고 개수 상한을 넘으면 오래된 것부터 버린다(걸으면 발자국 36개쯤·배는 물거품 43개쯤). 동행 발자국은 없다(트레이너만).
  // 지도 도트 한 칸(지도 기준 0~1). field-map.js 가 game.js 뒤에 읽혀 함수로 둔다.
  function mapDot() { return 1 / (FieldWorld.SIZE * FieldWorld.TILE); }
  const STEP_DOTS = 10, FOOT_LIFE = 5, FOOT_MAX = 40;
  const WAKE_DOTS = 6, WAKE_LIFE = 1.8, WAKE_MAX = 48, WAKE_SPREAD = 8; // 물거품이 옆으로 퍼지는 빠르기(도트/초)
  // 바닥별 발자국 색(지도 타일·장식에 이미 있는 바닥보다 어두운 도트 색)과 진하기. 모래는 또렷, 흙길은 중간, 풀은 눌린 풀처럼 옅게.
  // 바닥 무늬와 같은 색(사막 모래 무늬 #ef914f·흙길 무늬 #bd7959)은 무늬에 섞여 안 보여서 한 단계 더 어두운 색을 쓴다.
  // 돌바닥(stone)·다리·부두 널빤지(plank)는 단단해서 남기지 않는다(물 water 은 배라 물길).
  const FOOT_TONES = {
    lightSand: ['#ffad5d', .9], // 밝은 모래(바다 모래사장·사막 모래길 #ffcb8d) 위 — 사막 바탕 모래색
    darkSand: ['#bd7959', .85], // 사막 진한 모래(#ffad5d) 위 — 흙길·사막 집의 갈색
    dirt: ['#965746', .7],      // 흙길(#d3865f) 위 — 나무 밑동·그루터기 갈색
    grass: ['#74a334', .7],     // 풀밭(#adbc3a) 위 — 높은 풀 잎 그림자색(풀 무늬 #a8a129 는 풀밭과 거의 같아 안 보였다). 밝기는 비슷해 옅어 보인다
    tall: ['#74a334', .7],      // 높은 풀 위 — 같은 색
  };
  // 발자국 한 개(도트 네모들, 발 위치 기준): 앞꿈치 2×2 + 한 도트 띄고 뒤꿈치. 가는 쪽으로 앞꿈치가 온다. side: 왼발 -1·오른발 1.
  function footRects(direction, side) {
    if (direction === 'left' || direction === 'right') {
      const y = side < 0 ? -3 : 0, right = direction === 'right';
      return [[right ? 1 : -2, y, 2, 2], [right ? -1 : 1, y, 1, 2]];
    }
    const x = side < 0 ? -3 : 1, down = direction !== 'back';
    return [[x, down ? 0 : -2, 2, 2], [x, down ? -2 : 1, 2, 1]];
  }
  // moved: 이번 프레임에 걸은 거리(px). 멈춰 있으면 새로 찍지 않는다.
  function updateTracks(dt, view, moved) {
    const tracks = field.tracks || (field.tracks = { prints: [], wake: [], walked: 0, sailed: 0, side: 1 });
    for (const mark of tracks.prints) mark.age += dt;
    for (const foam of tracks.wake) foam.age += dt;
    tracks.prints = tracks.prints.filter(mark => mark.age < FOOT_LIFE);
    tracks.wake = tracks.wake.filter(foam => foam.age < WAKE_LIFE);
    if (!moved) return;
    const dots = moved / view.scale;
    const feet = { x: field.player.x / mapDot(), y: field.player.y / mapDot() }; // 발 위치(도트)
    if (field.riding) {
      tracks.sailed += dots;
      if (tracks.sailed < WAKE_DOTS) return;
      tracks.sailed = 0;
      const length = Math.hypot(field.step?.x || 0, field.step?.y || 0);
      if (!length) return;
      const hx = field.step.x / length, hy = field.step.y / length;
      // 배 꼬리: 가로로 긴 배(boat-big 불투명 60×36 도트)라 좌우로 갈 때는 29도트 뒤 둥근 끝(폭 ±3), 위아래로 갈 때는 17도트 뒤
      // 긴 옆(바닥·윗줄 폭 ±12) — 꼬리 맨 끝 도트 줄(BOAT_HALF)에서 시작한다.
      const back = Math.abs(hx) * BOAT_HALF.x + Math.abs(hy) * BOAT_HALF.y, half = Math.abs(hx) * 3 + Math.abs(hy) * 12;
      for (const side of [-1, 1]) {
        tracks.wake.push({ x: feet.x - hx * back - hy * side * half, y: feet.y - 1 - hy * back + hx * side * half, dx: -hy * side, dy: hx * side, age: 0 });
      }
      tracks.wake.splice(0, Math.max(0, tracks.wake.length - WAKE_MAX));
      return;
    }
    tracks.walked += dots;
    if (tracks.walked < STEP_DOTS) return;
    tracks.walked = 0;
    tracks.side = -tracks.side;
    const kind = FieldWorld.groundAt(fieldMap(), field.player);
    if (!FOOT_TONES[kind]) return;
    tracks.prints.push({ x: Math.round(feet.x), y: Math.round(feet.y), kind, rects: footRects(field.player.direction, tracks.side), age: 0 });
    if (tracks.prints.length > FOOT_MAX) tracks.prints.shift();
  }
  // 남은 진하기(0~1): 처음 40%는 그대로, 그 뒤 0까지 옅어진다. 모션 줄이기에서는 서서히 대신 세 단계(1 → ⅔ → ⅓)로 줄인다.
  function trackFade(age, life, reduced) {
    const left = 1 - age / life;
    return reduced ? Math.ceil(left * 3) / 3 : Math.min(1, left / .6);
  }
  // 바닥 위(drawGround 안, 흙먼지·그림자 아래)에 발자국 → 물거품 순서로 그린다. 도트 하나는 지도와 같은 view.scale px 이고
  // 자리는 지도 도트 격자(도트 × scale − 카메라)에 맞춘다. 물거품은 처음 절반은 2×1, 퍼진 뒤에는 1×1 도트(모션 줄이기에서는 퍼지지 않음).
  function drawTracks(ctx, view, cameraX, cameraY, reduced) {
    const tracks = field.tracks;
    if (!tracks) return;
    const scale = view.scale;
    ctx.save();
    for (const mark of tracks.prints) {
      const [color, strength] = FOOT_TONES[mark.kind];
      ctx.fillStyle = color;
      ctx.globalAlpha = strength * trackFade(mark.age, FOOT_LIFE, reduced);
      for (const [x, y, width, height] of mark.rects) ctx.fillRect((mark.x + x) * scale - cameraX, (mark.y + y) * scale - cameraY, width * scale, height * scale);
    }
    ctx.fillStyle = fieldColor('surface'); // 물빛 반짝임·물보라와 같은 흰 도트
    for (const foam of tracks.wake) {
      const spread = reduced ? 0 : foam.age * WAKE_SPREAD;
      const x = Math.round(foam.x + foam.dx * spread), y = Math.round(foam.y + foam.dy * spread);
      ctx.globalAlpha = .9 * trackFade(foam.age, WAKE_LIFE, reduced);
      ctx.fillRect(x * scale - cameraX, y * scale - cameraY, (foam.age < WAKE_LIFE / 2 ? 2 : 1) * scale, scale);
    }
    ctx.restore();
  }
  // 배에 탄 동행(2026-11-14 사용자 「포켓몬들도 같이타야해」): 배 칸 셋 가운데에 트레이너, 트레이너 뒤 칸(뱃머리 반대쪽)에 대표,
  // 앞 칸에 둘째가 앉는다(동행은 최대 두 마리라 모두 탄다). 앉은 모습은 트레이너처럼 발을 SIT_DOTS 내려 앞 테두리 안쪽에 두고,
  // 배 가운데에서 RIM_DOTS 아래부터는 가린다(seatClip — 발밑 5도트가 앞 테두리에 가려 앉은 것처럼).
  // 옆모습 꼬리(피카츄)·긴 몸(롱스톤)처럼 그림이 넓어 칸 가운데에 앉히면 배 끝(BOAT_HALF.x) 밖으로 나가면 그만큼 안쪽으로 당겨 앉힌다
  // (모든 장면을 합친 그림 테두리 shape.draw 기준. 2026-11-14 필드 동행 493마리 × 배율 2~5 × 방향 4 × 두 칸으로 셈: 당기지 않으면 2.5%가
  // 1~12도트 배 밖, 당기면 0 — 다섯에 하나꼴로 당기고 그중 82%는 3도트 이하).
  // 내리면 updateCompanions 의 끈 따라오기로 땅까지 건너온다(aboard).
  // 도트: 배 가운데(칸 x 32)에서 앞·뒤 칸 가운데(칸 x 16·48)까지 SEAT, 앉은 발 내림 SIT(앞 테두리 안쪽 줄 칸 y 30), 가림 줄 RIM
  const SEAT_DOTS = 16, SIT_DOTS = 10, RIM_DOTS = 5;
  function seatCompanions(sizes) {
    const ids = partyIds();
    const boat = field.boat;
    const behind = boat.direction === 'left' ? 1 : -1; // 뒤 칸이 있는 쪽(x 부호)
    const pxPerDot = sizes.tile / FieldWorld.TILE;
    for (let slot = 0; slot < 2; slot++) {
      const id = ids[slot];
      if (!id || !window.CompanionView) { field.followers[slot] = null; continue; }
      const state = field.followers[slot]?.id === id ? field.followers[slot] : { id };
      const shape = companionShape(id, sizes.companion, sizes.tile);
      const seat = Math.min(BOAT_HALF.x - shape.draw.right / pxPerDot, Math.max(-BOAT_HALF.x - shape.draw.left / pxPerDot, (slot === 0 ? behind : -behind) * SEAT_DOTS));
      Object.assign(state, {
        x: boat.x + seat * mapDot(), y: boat.y + SIT_DOTS * mapDot(),
        direction: field.player.direction, moving: false, walk: 0, side: 0, shape,
      });
      field.followers[slot] = state;
    }
  }
  // 탄 동안 동행 그림: 트레이너(액터 캔버스, 2000) 바로 아래 층에 두고 트레이너와 같은 줄(배 가운데 + RIM_DOTS)부터 아래를 가린다. 내리면 풀어 준다.
  function seatClip(node, state, toScreen, view) {
    let clip = '';
    if (field.riding) {
      node.style.zIndex = '1990';
      const foot = toScreen(state);
      const bottom = node.dataset.spriteKind === 'fallback' ? foot.y : foot.y + state.shape.draw.bottom;
      clip = 'inset(0px 0px ' + Math.max(0, Math.round(bottom - toScreen(field.boat).y - RIM_DOTS * view.scale)) + 'px 0px)';
    }
    if (node.dataset.seatClip === clip) return;
    node.dataset.seatClip = clip;
    node.style.clipPath = clip;
  }
  // 꽃밭을 걸을 때 튀는 꽃잎: Ninja Adventure FX/Particle/LeafPink(12×7 도트 6장, 마당이 쓰는 img/yard 그림).
  const PETAL = { src: 'img/yard/leaf-pink.png', width: 12, height: 7, frames: 6 };
  // 땅에 그리는 것: 지도 바닥, 물결·높은 풀(움직이는 타일), 누른 곳 물결, 처음 안내 고리, 발자국·물길(drawTracks), 배, 흙먼지, 그림자.
  function drawGround(ctx, view, sizes, reduced, cameraX, cameraY, toScreen) {
    const map = fieldMap();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = fieldColor('paper');
    ctx.fillRect(0, 0, view.width, view.height);
    const layers = tileLayers(map);
    if (!layers) return false;
    // 지도 밖 채움까지 그린 바닥 층(둘레 pad 칸)을 지도 왼쪽 위가 (-cameraX, -cameraY) 에 오게 놓는다.
    const padPixels = layers.pad * FieldWorld.TILE * view.scale;
    ctx.drawImage(layers.ground, -cameraX - padPixels, -cameraY - padPixels, view.size + padPixels * 2, view.size + padPixels * 2);
    const ripple = spriteImage(map.ripple.src);
    if (imageReady(ripple)) {
      for (const [x, y] of map.ripples) {
        const spot = tileOnScreen(view, cameraX, cameraY, x, y);
        if (!spot) continue;
        const frame = reduced ? 0 : Math.floor(field.time * 3 + x * .7 + y * 1.3) % map.ripple.frames;
        ctx.drawImage(ripple.image, frame * FieldWorld.TILE, 0, FieldWorld.TILE, FieldWorld.TILE, spot[0], spot[1], spot[2], spot[2]);
      }
    }
    // 물빛: 몇몇 물 칸에서 흰 도트 두 개가 잠깐 반짝인다.
    if (!reduced) {
      ctx.save();
      ctx.fillStyle = fieldColor('surface');
      for (const [x, y, phase] of map.glints) {
        const spot = tileOnScreen(view, cameraX, cameraY, x, y);
        if (!spot) continue;
        const beat = (field.time + phase) % 3;
        if (beat > .6) continue;
        ctx.globalAlpha = Math.sin(beat / .6 * Math.PI);
        const dot = view.scale;
        ctx.fillRect(spot[0] + 6 * dot, spot[1] + 5 * dot, dot * 2, dot);
        ctx.fillRect(spot[0] + 10 * dot, spot[1] + 9 * dot, dot, dot);
      }
      // 물가를 걸으면 바로 옆 물 칸에 흰 물보라 도트가 퍼진다(물빛 반짝임과 같은 도트).
      if (field.moving && FieldWorld.encounterAt(map, field.player) === 'shore') {
        const px = Math.floor(field.player.x * map.size), py = Math.floor(field.player.y * map.size);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = px + dx, y = py + dy;
          if (x < 0 || y < 0 || x >= map.size || y >= map.size || !map.water[y * map.size + x]) continue;
          const spot = tileOnScreen(view, cameraX, cameraY, x, y);
          if (!spot) continue;
          const dot = view.scale, beat = (field.time * 2.5 + (dx + dy) * .3) % 1, spread = (2 + beat * 5) * dot;
          const cx = spot[0] + 8 * dot, cy = spot[1] + 8 * dot;
          ctx.globalAlpha = 1 - beat;
          ctx.fillRect(cx - spread - dot, cy, dot * 2, dot);
          ctx.fillRect(cx + spread - dot, cy - dot, dot * 2, dot);
          ctx.fillRect(cx - dot / 2, cy - spread * .7, dot, dot);
        }
      }
      ctx.restore();
    }
    const grassSheet = layers.sheets[map.grass.sheet];
    if (imageReady(grassSheet)) {
      const [sx, sy] = map.grass.rect;
      for (const [x, y] of map.tallTiles) {
        const spot = tileOnScreen(view, cameraX, cameraY, x, y);
        if (!spot) continue;
        ctx.drawImage(grassSheet.image, sx, sy, 16, 16, spot[0] + grassSway(x, y, reduced) * view.scale, spot[1], spot[2], spot[2]);
      }
    }
    // 누른 곳에 퍼지는 물결(0.6초). 걷는 동안에는 목적지에 작은 고리가 남는다.
    if (field.marker) {
      const spot = toScreen(field.marker);
      const progress = Math.min(1, field.marker.age / .6);
      if (!reduced && progress < 1) drawRing(ctx, spot.x, spot.y, sizes.tile * (.3 + progress * .6), 1 - progress, view.scale);
      else field.marker = null;
    }
    if (field.target && field.chase == null) { const spot = toScreen(field.target); drawRing(ctx, spot.x, spot.y, sizes.tile * .3, .85, view.scale); }
    // 처음 들어왔을 때만 2초 동안(첫 터치에 사라짐) 가장 가까운 볼 둘레에 「여기를 눌러」 고리를 띄운다(글 없이).
    // 화면 밖이거나 위쪽 버튼(「도감」 아래 「가방」 등) 밑이라 단추를 숨긴 볼(placeBalls 와 같은 규칙)에는 띄우지 않는다.
    if (field.hint > 0) {
      const insets = safeInsets(view.width, view.height), rects = hudRects(view);
      const visible = field.balls.filter(ball => ballOnScreen(view, sizes, ball, insets) && !ballUnderHud(view, sizes, ball, rects)).map(toScreen);
      const player = toScreen(field.player);
      const nearest = visible.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
      if (nearest) {
        const phase = reduced ? .4 : field.time * 1.4 % 1;
        drawRing(ctx, nearest.x, nearest.y - 2, sizes.ball * (.8 + phase * .7), Math.min(1, field.hint) * (1 - phase), view.scale);
      }
    }
    drawTracks(ctx, view, cameraX, cameraY, reduced);
    // 배는 물길 위, 탄 동행(DOM 1990)·트레이너(액터 캔버스 2000) 아래라 바닥 캔버스에 그린다.
    if (field.boat) drawBoat(ctx, toScreen(field.boat), view.scale, reduced);
    ctx.save();
    const petal = spriteImage(PETAL.src);
    for (const puff of field.dust) {
      const spot = toScreen(puff);
      if (puff.kind === 'garden') {
        // 꽃잎: 위로 톡 튀었다 내려앉으며 돈다(6장).
        const progress = puff.age / .7;
        if (!imageReady(petal)) continue;
        ctx.globalAlpha = 1 - progress * progress;
        const frame = Math.floor(progress * PETAL.frames) % PETAL.frames;
        const lift = Math.sin(progress * Math.PI) * 6 * view.scale;
        ctx.drawImage(petal.image, frame * PETAL.width, 0, PETAL.width, PETAL.height, Math.round(spot.x - PETAL.width * view.scale / 2), Math.round(spot.y - lift - PETAL.height * view.scale), PETAL.width * view.scale, PETAL.height * view.scale);
        continue;
      }
      const progress = puff.age / .45;
      const sand = puff.kind === 'sand';
      const side = view.scale * (progress < .5 ? (sand ? 3 : 2) : sand ? 2 : 1);
      ctx.fillStyle = fieldColor(sand ? 'paper' : 'surface');
      ctx.globalAlpha = (sand ? .85 : .7) * (1 - progress);
      ctx.fillRect(Math.round(spot.x - side / 2), Math.round(spot.y - progress * (sand ? 5 : 3) * view.scale - side), side, side);
    }
    ctx.restore();
    const player = toScreen(field.player);
    if (!field.riding) drawShadow(ctx, player.x, player.y, view.scale);
    for (const state of field.followers) {
      if (!state || field.riding) continue;
      const spot = toScreen(state);
      drawShadow(ctx, spot.x, spot.y, view.scale);
    }
    return true;
  }
  // 트레이너·동행보다 위에 그리는 것: 나무 윗부분·지붕(위층)과, 누가 서 있는 칸의 높은 풀.
  // 가만히 서 있으면 풀 아래 절반이 발목을 덮고, 걷거나 굴러가는 중이면 풀숲이 흔들린다(grass-rustle.png 4장, Codex 도트).
  const GRASS_RUSTLE = 'img/field-tiles/grass-rustle.png';
  function drawOver(ctx, view, reduced, cameraX, cameraY) {
    const map = fieldMap();
    ctx.clearRect(0, 0, view.width, view.height);
    const layers = tileLayers(map);
    if (!layers) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layers.over, -cameraX, -cameraY, view.size, view.size);
    const grassSheet = layers.sheets[map.grass.sheet];
    if (!imageReady(grassSheet)) return;
    const rustle = spriteImage(GRASS_RUSTLE);
    const cells = new Map(); // 칸 → 흔들리는지
    const mark = (point, moving) => {
      if (!FieldWorld.isTallGrass(map, point)) return;
      const key = Math.floor(point.x * map.size) + ',' + Math.floor(point.y * map.size);
      cells.set(key, cells.get(key) || moving);
    };
    mark(field.player, field.moving);
    for (const state of field.followers) if (state) mark(state, state.moving);
    for (const ball of field.balls) mark(ball, true);
    const [sx, sy] = map.grass.rect;
    const rustleFrame = reduced ? 0 : Math.floor(field.time * 10) % 4;
    for (const [key, moving] of cells) {
      const [x, y] = key.split(',').map(Number);
      const spot = tileOnScreen(view, cameraX, cameraY, x, y);
      if (!spot) continue;
      if (moving && imageReady(rustle)) {
        ctx.drawImage(rustle.image, rustleFrame * 16, 0, 16, 16, spot[0], spot[1], spot[2], spot[2]);
        continue;
      }
      const half = spot[2] / 2;
      ctx.drawImage(grassSheet.image, sx, sy + 8, 16, 8, spot[0] + grassSway(x, y, reduced) * view.scale, spot[1] + half, spot[2], half);
    }
  }
  // 볼 단추: 굴러간 만큼 그림을 90도씩 돌리고(도트가 뭉개지지 않게), 통통 튀고, 새로 나타날 때 톡 커진다.
  function placeBalls(view, sizes, insets, reduced, toScreen) {
    for (let index = 0; index < field.balls.length; index++) {
      const ball = field.balls[index];
      const target = document.querySelector('[data-field-ball="' + index + '"]');
      if (!target) continue;
      const spot = toScreen(ball);
      const sprite = fieldBallSprite(ball.gold);
      const ballSize = sprite.width * view.scale;
      const centerY = spot.y - ballSize / 2;
      // 누르는 영역이 화면(safe-area) 밖에 걸치거나 위쪽 버튼 밑에 들어간 볼은 숨겨서(카메라가 움직일 때), 잘린 단추가 보이거나
      // 버튼 대신 눌리지 않게 한다. 숨은 볼은 화면 가운데 쪽으로 굴러 다시 나온다.
      target.hidden = !ballOnScreen(view, sizes, ball, insets) || ballUnderHud(view, sizes, ball, hudRects(view));
      if (target.hidden) continue;
      if (ball.gold && !ball.seen) {
        ball.seen = true;
        if (field.time - field.goldSaidAt > 8) { field.goldSaidAt = field.time; fieldSay('gold'); }
      }
      // 단추 크기(--touch)는 화면마다 같아서 한 번만 잰다. 매 프레임 재면 레이아웃을 다시 계산한다.
      if (!field.ballHalf) field.ballHalf = target.offsetWidth / 2 || 26;
      const half = field.ballHalf;
      if (target.dataset.ballSize !== String(ballSize)) {
        target.dataset.ballSize = String(ballSize);
        target.style.setProperty('--ball', ballSize + 'px');
      }
      target.style.transform = 'translate(' + Math.round(spot.x - half) + 'px,' + Math.round(centerY - half) + 'px)';
      target.style.zIndex = fieldDepth(ball.y);
      const body = target.querySelector('.field-ball-body');
      const hop = reduced ? 0 : ball.water ? Math.round((Math.sin(field.time * 2.2 + index) + 1) * .75) * view.scale : Math.round(Math.abs(Math.sin(ball.roll * .5)) * 1.5) * view.scale;
      const t = ball.spawn - 1;
      const pop = reduced ? 1 : 1 + 2.7 * t * t * t + 1.7 * t * t;
      body.style.transform = 'translateY(' + (-hop) + 'px) scale(' + pop + ')';
      // 굴러간 만큼 네 장을 넘긴다(한 장 = 4분의 1바퀴). 한 장짜리 대체 그림은 90도씩 돌린다.
      const art = body.querySelector('.field-ball-art');
      const quarter = reduced ? 0 : Math.floor(ball.roll / (Math.PI / 2));
      const frameIndex = ((quarter % sprite.frames) + sprite.frames) % sprite.frames;
      const image = 'url("' + sprite.src + '")';
      if (art.style.backgroundImage !== image) art.style.backgroundImage = image;
      art.style.backgroundSize = (sprite.frames * 100) + '% 100%';
      art.style.backgroundPosition = (sprite.frames > 1 ? frameIndex / (sprite.frames - 1) * 100 : 0) + '% 0';
      art.style.transform = sprite.frames > 1 ? '' : 'rotate(' + quarter * 90 + 'deg)';
      if (target.dataset.gold !== String(ball.gold)) {
        target.dataset.gold = String(ball.gold);
        target.setAttribute('aria-label', (ball.gold ? '금색' : '빨간') + ' 몬스터볼까지 걸어가기');
      }
    }
  }
  // 출구 아치 윗부분에 갈 지역 이름(테두리 글씨, 지도와 함께 움직임). 위쪽 버튼 줄·지역 이름표에 걸리면(가로 폰에서 위 출구 앞에 서면)
  // 아치 안쪽·바로 밑으로 그만큼 내려 쓰고, 그래도 걸리거나 화면 밖이면 숨긴다.
  function placeExitNames(view, toScreen) {
    const exits = fieldMap().exits;
    const rects = hudRects(view);
    const tile = view.size / FieldWorld.SIZE;
    for (const node of document.querySelectorAll('[data-field-exit]')) {
      const spot = toScreen(exits[Number(node.dataset.fieldExit)].label);
      if (spot.x < 0 || spot.x > view.width || spot.y + tile * 2.5 < 0 || spot.y > view.height) { node.hidden = true; continue; }
      node.hidden = false;
      // 글자 크기는 바뀌지 않아 처음 한 번만 잰다(가운데 기준 반폭·반높이).
      if (!node.half) node.half = { x: node.offsetWidth / 2, y: node.offsetHeight / 2 };
      const { x: halfX, y: halfY } = node.half;
      let y = Math.max(spot.y, halfY); // 아치 윗부분이 화면 위로 나가 있으면 화면 안으로 먼저 내린다
      for (const rect of rects) {
        if (spot.x - halfX < rect.right && spot.x + halfX > rect.left && y - halfY < rect.bottom && y + halfY > rect.top) y = rect.bottom + halfY;
      }
      const lowest = spot.y + tile * 2.5 + halfY; // 아치 아래 끝 바로 밑까지(아치는 이름 자리에서 2.5칸 아래까지, 가로 폰에서 위 출구 앞)
      node.hidden = y > lowest || spot.x - halfX < 0 || spot.x + halfX > view.width || y - halfY < 0 || y + halfY > view.height;
      node.style.transform = 'translate(' + spot.x + 'px,' + Math.round(y) + 'px)';
    }
  }
  // ---------- 미니맵(2026-11-13 사용자 「미니맵, 내 위치, 몬스터볼 위치」) ----------
  // 아래 오른쪽 구석에 지도 전체를 작게: 땅·물·막힌 곳·풀숲 색(tokens.css 값)은 지역·크기가 바뀔 때만 아래 캔버스에 한 번 그리고,
  // 위 캔버스에 지금 보이는 범위(얇은 사각형)·출구(바깥을 가리키는 세모)·볼(빨강·금색 점)·트레이너(흰 점+남색 테두리)만 매 프레임 그린다.
  // 누르는 동작은 없다(밑의 볼·지도를 누를 수 있게 통과). 트레이너가 미니맵 밑으로 걸어가면 옅어진다.
  let miniDrawn = '';
  let miniColors = null;
  function miniColor(name) {
    if (!miniColors) {
      const style = getComputedStyle(document.documentElement);
      const read = (token, fallback) => style.getPropertyValue(token).trim() || fallback;
      miniColors = {
        land: read('--c-paper', '#fffdf5'), water: read('--c-blue', '#4dabf7'), blocked: read('--c-ink-soft', '#7a6a8a'), grass: read('--c-green', '#51cf66'),
        frame: read('--c-ink', '#4b3a5a'), red: read('--c-primary', '#ff6b6b'), gold: read('--c-gold', '#ffd43b'), you: read('--c-surface', '#ffffff'),
      };
    }
    return miniColors[name];
  }
  // 미니맵 위 점 자리(미니맵 캔버스 안 px): 지도 좌표 0~1 × 한 변.
  function miniPoint(point, side) { return { x: point.x * side, y: point.y * side }; }
  function drawMinimap(view, sizes, player, camera) {
    const box = document.querySelector('.field-mini');
    const base = document.querySelector('.field-mini-map'), dots = document.querySelector('.field-mini-dots');
    if (!box || !base || !dots) return;
    const map = fieldMap();
    const { ctx, width: side } = canvasContext(dots);
    // 지형: 지역·크기가 바뀔 때만
    const key = map.region + ':' + side;
    if (miniDrawn !== key) {
      const { ctx: ground } = canvasContext(base);
      ground.imageSmoothingEnabled = false;
      const cell = side / map.size;
      for (let index = 0; index < map.size * map.size; index++) {
        const x = index % map.size, y = Math.floor(index / map.size);
        ground.fillStyle = miniColor(map.water[index] && map.blocked[index] ? 'water' : map.blocked[index] ? 'blocked' : map.tall[index] ? 'grass' : 'land');
        ground.fillRect(x * cell, y * cell, cell + .5, cell + .5);
      }
      miniDrawn = key;
    }
    ctx.clearRect(0, 0, side, side);
    // 지금 보이는 범위
    ctx.strokeStyle = miniColor('frame');
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = .75;
    // 화면이 지도 밖까지 보이면 지도 안에 든 부분만
    const left = Math.max(0, camera.x), top = Math.max(0, camera.y);
    const right = Math.min(1, camera.x + view.w), bottom = Math.min(1, camera.y + view.h);
    if (right > left && bottom > top) ctx.strokeRect(left * side, top * side, (right - left) * side, (bottom - top) * side);
    ctx.globalAlpha = 1;
    // 출구: 지도 바깥(위·아래)을 가리키는 작은 세모
    ctx.fillStyle = miniColor('frame');
    for (const exit of map.exits) {
      const spot = miniPoint(exit.label, side), size = Math.max(4, side / 22), way = exit.side === 'top' ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(spot.x, spot.y + way * size);
      ctx.lineTo(spot.x - size, spot.y - way * size * .2);
      ctx.lineTo(spot.x + size, spot.y - way * size * .2);
      ctx.closePath();
      ctx.fill();
    }
    // 배: 작은 남색 네모(타고 있으면 트레이너 점 밑). 폭은 배 그림 불투명 폭(60도트 = 3.75칸)만큼, 높이는 그 0.6(36도트).
    if (field.boat) {
      const spot = miniPoint(field.boat, side), boatWidth = Math.max(6, side * 60 / (FieldWorld.SIZE * FieldWorld.TILE));
      ctx.fillStyle = miniColor('frame');
      ctx.fillRect(spot.x - boatWidth / 2, spot.y - boatWidth * .3, boatWidth, boatWidth * .6);
    }
    const dot = (point, radius, fill) => {
      const spot = miniPoint(point, side);
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = miniColor('frame');
      ctx.stroke();
    };
    const unit = Math.max(2.5, side / 36);
    for (const ball of field.balls) dot(ball, unit, miniColor(ball.gold ? 'gold' : 'red'));
    dot(field.player, unit * 1.5, miniColor('you'));
    // 트레이너가 미니맵 밑에 들어가면 옅게(미니맵 상자는 크기가 바뀔 때만 잰다).
    if (!field.miniBox || field.miniBox.key !== view.width + 'x' + view.height) {
      const rect = box.getBoundingClientRect();
      field.miniBox = { key: view.width + 'x' + view.height, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }
    const under = player.x + sizes.tile / 2 > field.miniBox.left && player.x - sizes.tile / 2 < field.miniBox.right && player.y > field.miniBox.top && player.y - sizes.trainer < field.miniBox.bottom;
    box.classList.toggle('is-faded', under);
  }
  // 트레이너가 닿은 볼. 아이가 볼을 눌러 쫓는 중이면 그 볼만(가는 길의 다른 볼은 지나친다), 아니면 가장 가까운 볼.
  // 풀숲 만나기(2026-11-13 사용자): 만나는 칸을 걸을 때만 가끔 포켓몬이 튀어나온다(원작 방식). 그 밖은 볼에 닿을 때만.
  // 만나는 칸은 지역마다 다르다(FieldWorld.encounterAt: 풀숲·도시 꽃밭과 분수 둘레·사막 맨 모래·바다 물가).
  // 칸 종류별 확률·쉬는 칸 수는 core.js grassStep(GRASS). 나오는 포켓몬은 빨간 볼과 같은 등급 비율(encounter(false)).
  let grassOff = false; // 시험에서만 GameField.setGrassEncounters(false)
  let exitsOff = false; // 시험에서만 GameField.setExits(false)
  function grassEncounter(map, sizes, moved) {
    const kind = field.riding ? 'boat' : FieldWorld.encounterAt(map, field.player);
    if (grassOff || !moved || !kind) return false;
    const next = R.grassStep(field.grass || {}, moved / sizes.tile, Math.random, kind);
    field.grass = next;
    return next.met;
  }
  function touchedBall(view, sizes) {
    const reach = sizes.ball / 2 + sizes.tile * .3;
    const distance = ball => Math.hypot((ball.x - field.player.x) * view.size, (ball.y - field.player.y) * view.size);
    const chased = field.chase == null ? null : field.balls[field.chase];
    const candidates = chased ? [chased] : field.balls;
    const touching = candidates.filter(ball => ball.spawn >= 1 && distance(ball) < reach);
    return touching.sort((a, b) => distance(a) - distance(b))[0] || null;
  }
  // 말풍선은 트레이너 머리 위에 붙어 다니다 2.4초 뒤 사라진다.
  // 만남 「!」: 트레이너 머리 위에 잠깐(field.alertUntil 까지). 말풍선은 그동안 숨긴다.
  // 오른쪽 위 「가방」 버튼 음성 안내(voice-guide.js 'bag', 이 기기에서 계정마다 처음 한 번): 새로 들어온 필드에서 인사 말풍선(2.4초)이 지난
  // 2.6초에 한 번(트레이너를 누르면 가방이던 때 머리 위 가방 그림이 뜨던 때). 그때 「!」(만남)가 떠 있거나 버튼이 없으면(잡은 포켓몬 0) 이 필드에서는 넘어간다.
  const BAG_GUIDE_AT = 2.6;
  function guideBag() {
    if (field.bagGuided || field.time < BAG_GUIDE_AT) return;
    field.bagGuided = true;
    if (S.state.caught.length && !(field.alertUntil && field.time <= field.alertUntil)) window.VoiceGuide?.say('bag');
  }
  function placeAlert(player, sizes) {
    const mark = document.querySelector('.field-alert');
    if (!mark) return;
    const showing = field.alertUntil && field.time <= field.alertUntil;
    mark.hidden = !showing;
    // 마당과 같은 도트 감정 말풍선(Ninja Adventure 「!」)을 머리 바로 위에, 도트 크기(칸 16px 기준 배율)에 맞춰(2026-11-13 사용자).
    // 도트 배율은 지도의 1.5배를 정수로 반올림(3배 지도에서 4.5배면 도트 굵기가 들쭉날쭉해진다).
    if (showing) { mark.style.setProperty('--alert-px', String(Math.round(sizes.tile / 16 * 1.5))); mark.style.transform = 'translate(' + Math.round(player.x) + 'px,' + Math.round(player.y - sizes.trainer - 2) + 'px)'; }
  }
  // 말풍선이 밑으로 들어가면 안 되는 위쪽 것: 모서리 버튼·지역 이름(화면 px). 화면 크기·지역(이름 폭)이 바뀔 때만 다시 잰다.
  let topHudCache = { key: '', rects: [] };
  function topHudRects(view) {
    const key = view.width + 'x' + view.height + ':' + region;
    if (topHudCache.key === key) return topHudCache.rects;
    if (!window.getComputedStyle) return [];
    const rects = [];
    for (const node of document.querySelectorAll('.topbar button, .field-place')) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const box = node.getBoundingClientRect();
      if (box.width && box.height) rects.push({ left: box.left, right: box.right, bottom: box.bottom });
    }
    if (document.querySelector('.field-place')) topHudCache = { key, rects };
    return rects;
  }
  function placeBubble(player, sizes, insets = NO_INSETS, view = null) {
    if (field.alertUntil && field.time <= field.alertUntil) { const say = document.querySelector('.field-say'); if (say) say.hidden = true; return; }
    const bubble = document.querySelector('.field-say');
    if (!bubble) return;
    if (!field.say || field.time > field.say.until) { bubble.hidden = true; return; }
    bubble.hidden = false;
    // 도트 말풍선 판은 지도와 같은 도트 배율로(css/field.css --px). 판이 반 픽셀에 걸리면 9칸 이음매가 비쳐 보여서
    // 글이나 배율이 바뀔 때 너비(짝수라 가운데 꼬리 자리도 정수)·높이를 정수 px 로 고정하고, 가운데 맞춤도 정수로 한다.
    const px = sizes.tile / 16;
    const fit = field.say.line + '@' + px;
    if (bubble.dataset.fit !== fit) {
      bubble.textContent = field.say.line;
      bubble.style.setProperty('--px', String(px));
      bubble.style.width = '';
      bubble.style.height = '';
      const natural = getComputedStyle(bubble);
      const width = Math.ceil(parseFloat(natural.width));
      bubble.style.width = width + width % 2 + 'px';
      bubble.style.height = Math.ceil(parseFloat(natural.height)) + 'px';
      // 꼬리 그림(css/field.css .field-say::after)이 붙어 있으면 그 높이(5도트 중 판과 겹치는 1줄을 뺀 4도트)만큼 더 띄운다.
      const tailed = getComputedStyle(bubble, '::after').backgroundImage !== 'none';
      bubble.dataset.tail = String(tailed ? 4 * px : 0);
      bubble.dataset.fit = fit;
    }
    const width = bubble.offsetWidth;
    const left = Math.round(player.x) - Math.round(width / 2);
    // 키 낮은 가로 폰(사파리 가로 343px)에서 확대 단계를 올리면 머리 위 자리가 모자라 말풍선 윗부분이 화면 위로 잘렸다 → 화면(노치 안쪽) 위 4px 에서 멈춘다
    // (그때는 꼬리가 머리에 조금 겹친다). 말풍선과 가로로 겹치는 위쪽 버튼·지역 이름이 있으면 그 아래 4px 에서 멈춘다 — 「도감」 아래 「가방」(2026-11-14)이
    // 키 낮은 세로 화면(아이폰 SE 사파리 375×548 등) 확대 +1·+2 에서 말풍선 글을 덮었다. 가로 폰에서는 말풍선이 위쪽 것들 사이에 있어 그대로다.
    const ceiling = (view ? topHudRects(view) : []).reduce((low, box) => box.left < left + width && box.right > left ? Math.max(low, Math.round(box.bottom) + 4) : low, Math.round(insets.top) + 4);
    const top = Math.max(ceiling, Math.round(player.y - sizes.trainer - 6) - Number(bubble.dataset.tail) - bubble.offsetHeight);
    bubble.style.transform = 'translate(' + left + 'px,' + top + 'px)';
  }
  const FIELD_IDLE_S = 10;
  function guideIdle() {
    const player = field.player;
    const distance = ball => Math.hypot(ball.x - player.x, ball.y - player.y);
    const nearest = field.balls.filter(ball => ball.spawn >= 1).sort((a, b) => distance(a) - distance(b))[0];
    window.VoiceGuide?.say('fieldIdle', { dir: nearest ? VoiceGuide.direction(nearest.x - player.x, nearest.y - player.y) : '' });
  }
  function fieldFrame(dt) {
    const canvas = document.querySelector('#field-canvas');
    const actor = document.querySelector('#field-actor');
    const overlay = document.querySelector('#field-over');
    if (!canvas || !actor || !overlay) return;
    const { ctx, width, height } = canvasContext(canvas);
    const view = fieldView(width, height);
    const sizes = actorSizes(view);
    const insets = safeInsets(width, height);
    const margin = walkMargin(view, sizes, insets);
    const map = fieldMap();
    const reduced = Boolean(motionPreference?.matches);
    const paused = !!modalRoot.firstChild || !!window.SceneFX?.active;
    // 첫 걸음 전에는 실제 캔버스 크기로 처음 구도를 다시 잡는다(창 크기와 캔버스 크기가 다를 수 있다).
    if (!field.walked && field.framed !== width + 'x' + height) frameStart(view);
    // 화면 크기가 바뀌어 가장자리 여백이 달라지면 트레이너를 걸을 수 있는 곳 안으로 되돌린다.
    const ground = field.riding ? map.waterMap : map;
    if (!FieldWorld.isWalkable(ground, field.player, margin)) Object.assign(field.player, FieldWorld.nearestWalkable(ground, field.player, margin));
    let moved = 0;
    if (!paused) {
      field.time += dt;
      field.cooldown = Math.max(0, field.cooldown - dt);
      field.hint = Math.max(0, field.hint - dt);
      if (field.marker) field.marker.age += dt;
      if (!field.greeted) { field.greeted = true; fieldSay('enter'); }
      guideBag();
      moved = moveTrainer(dt, view, margin);
      if (moved) { recordTrail(view); field.walked = true; }
      // 오래 가만히 있으면 음성 안내(걸어 보자·가까운 볼이 있는 쪽). 말한 뒤 30초 동안은 다시 하지 않는다.
      field.idle = moved ? 0 : (field.idle || 0) + dt;
      if (field.idle >= FIELD_IDLE_S) { field.idle = -20; guideIdle(); }
      updateBoat();
      updateBalls(dt, view, margin, insets, sizes);
      updateDust(dt, view, moved, reduced);
      updateTracks(dt, view, moved);
    }
    if (field.riding) seatCompanions(sizes);
    else updateCompanions(paused ? 0 : dt, view, sizes, margin);
    // 카메라는 부드럽게 따라가고(모션 줄이기에서는 바로), 지도 밖은 보여 주지 않는다. 도트가 흐려지지 않게 정수 px 로 옮긴다.
    followCamera(view, paused ? 0 : reduced ? 1 : Math.min(1, dt * 5));
    const cameraX = Math.round(field.camera.x * view.size), cameraY = Math.round(field.camera.y * view.size);
    const toScreen = point => ({ x: Math.round(point.x * view.size - cameraX), y: Math.round(point.y * view.size - cameraY) });
    const ready = drawGround(ctx, view, sizes, reduced, cameraX, cameraY, toScreen);
    canvas.dataset.ready = String(ready);
    const world = document.querySelector('.field-ambient-world');
    if (world) {
      const side = view.size + 'px';
      if (world.style.width !== side) { world.style.width = side; world.style.height = side; }
      world.style.transform = 'translate3d(' + (-cameraX) + 'px,' + (-cameraY) + 'px,0)';
    }
    placeBalls(view, sizes, insets, reduced, toScreen);
    placeExitNames(view, toScreen);
    drawMinimap(view, sizes, toScreen(field.player), { x: cameraX / view.size, y: cameraY / view.size });
    for (let slot = 0; slot < 2; slot++) {
      const node = document.querySelector(slot === 0 ? '#field-companion' : '#field-companion-2');
      const state = field.followers[slot];
      if (!node) continue;
      if (!state || !window.POKEMON_DETAILS) { node.hidden = true; continue; }
      placeCompanion(node, state.id, toScreen(state), { direction: state.direction, moving: state.moving, scale: sizes.companion, extent: sizes.tile });
      node.style.zIndex = fieldDepth(state.y);
      seatClip(node, state, toScreen, view);
    }
    canvas.dataset.direction = field.player.direction || 'front';
    const actorContext = canvasContext(actor).ctx;
    actorContext.clearRect(0, 0, width, height);
    const player = toScreen(field.player);
    // 배는 바닥 캔버스에 그린다(drawGround — 물길 위, 탄 동행 아래).
    if (field.riding) {
      // 배 위에 앉은 모습: 트레이너를 가운데 칸 앞 테두리까지 내려 그리고 가림 줄 아래(발밑)는 가린다(동행과 같은 SIT_DOTS·RIM_DOTS).
      actorContext.save();
      actorContext.beginPath();
      actorContext.rect(0, 0, width, player.y + RIM_DOTS * view.scale);
      actorContext.clip();
      drawPlayer(actorContext, player.x, player.y + SIT_DOTS * view.scale, view.scale, false, field.time, field.player.direction, canvas);
      actorContext.restore();
    } else drawPlayer(actorContext, player.x, player.y, view.scale, field.moving, field.time, field.player.direction, canvas);
    drawOver(canvasContext(overlay).ctx, view, reduced, cameraX, cameraY);
    placeBubble(player, sizes, insets, view);
    placeAlert(player, sizes);
    field.last = { view, sizes, margin, cameraX, cameraY };
    if (paused || field.cooldown) return;
    const exit = FieldWorld.exitAt(map, field.player);
    if (exit && !exitsOff) { leaveBy(exit); return; }
    const touched = touchedBall(view, sizes);
    if (!touched) {
      if (grassEncounter(map, sizes, moved)) {
        field.target = null; field.chase = null; field.drag = null; field.cooldown = 2;
        // 배 위에서 만나면 물 타입(열린 물 타입이 없으면 지역 전체)
        encounter(false, null, field.riding ? R.choose(POKEMON, S.state.caught, region, false, S.state.settings.difficulty, Math.random, ['water']) : null);
      }
      return;
    }
    const gold = touched.gold;
    // 다시 나타나는 볼은 지도 어딘가 트레이너·다른 볼과 먼 곳에 둔다(찾아다니는 재미).
    // 다만 화면에 보이는 볼이 하나도 없으면 이 볼은 지금 화면 안에 둔다(폰은 볼이 둘뿐이라 빈 들판에서 헤매지 않게).
    touched.gold = Math.random() < goldChance();
    const othersVisible = field.balls.some(ball => ball !== touched && ballOnScreen(view, sizes, ball, insets));
    if (othersVisible || touched.water) placeBallOnMap(touched, view, margin, sizes);
    else placeBall(touched, view, margin, insets, sizes);
    field.target = null;
    field.chase = null;
    field.drag = null;
    field.cooldown = 2;
    encounter(gold);
  }
  // 동행: 외부 원본 픽셀 걷기 시트(4방향)를 발(foot, 화면 px)에 맞춰 정수배로 그린다. 시트가 없거나 깨지면 PokeAPI 3D 그림으로 대신한다.
  function placeCompanion(node, id, foot, pose) {
    const data = window.FIELD_SPRITES?.[id];
    const reduced = Boolean(motionPreference?.matches);
    // 걷기·서 있기 그림 묶음이 따로라, 걷기 시작할 때 걷기 묶음이 아직 안 왔으면 다른 묶음(서 있기)으로 그린다.
    // 둘 다 불러오는 중이면 직전 도트 그림을 그대로 두고, 3D 그림은 도트 그림이 정말 깨졌을 때만 쓴다(걷다가 3D 피카츄가 보이던 버그, 2026-11-13).
    const sheetReady = (frame, loaded) => frame && loaded && !loaded.failed && loaded.image.complete &&
      loaded.image.naturalWidth === frame.width * frame.columns && loaded.image.naturalHeight === frame.height * frame.rows;
    const candidates = [pose.moving, !pose.moving].map(moving => CompanionView.animationFor(data, pose.direction, moving, field.time, reduced)).filter(Boolean);
    const loadedOf = frame => spriteImage(frame.src);
    const frame = candidates.find(candidate => sheetReady(candidate, loadedOf(candidate))) || null;
    const ready = Boolean(frame);
    const stillLoading = !ready && candidates.some(candidate => !loadedOf(candidate).failed);
    node.hidden = false;
    node.dataset.direction = pose.direction;
    node.dataset.pokemonId = String(id);
    node.setAttribute('aria-label', POKEMON.find(pokemon => pokemon.id === id)?.name || '동행 포켓몬');
    if (stillLoading) {
      if (node.dataset.spriteKind !== 'pixel') { node.hidden = true; return; }
      const draw = companionShape(id, pose.scale, pose.extent).draw;
      node.style.transform = 'translate(' + Math.round(foot.x + draw.left) + 'px,' + Math.round(foot.y + draw.top) + 'px)';
      return;
    }
    if (ready) {
      // 같은 포켓몬의 Walk/Idle·각 프레임에 같은 배율을 써서 크기가 출렁이지 않게 한다.
      // 칸 전체가 아니라 모든 프레임의 그림 경계를 합친 사각형(shape.draw)만큼만 보여 줘서, 빈 여백이 다른 그림·버튼 위에 걸치지 않게 한다.
      const shape = companionShape(id, pose.scale, pose.extent);
      const scale = shape.scale;
      const draw = shape.draw;
      const pixelWidth = frame.width * scale;
      const pixelHeight = frame.height * scale;
      // 피카츄의 긴 꼬리는 발의 가로 중심과 몸통 중심을 다르게 만든다. 세로 접지는 원래 ground를 유지한다.
      const anchorX = id === 25 && frame.body ? frame.body[0] : frame.ground[0];
      node.style.width = (draw.right - draw.left) + 'px';
      node.style.height = (draw.bottom - draw.top) + 'px';
      node.style.backgroundImage = 'url("' + frame.src + '")';
      node.style.backgroundRepeat = 'no-repeat';
      node.style.backgroundSize = (pixelWidth * frame.columns) + 'px ' + (pixelHeight * frame.rows) + 'px';
      node.style.backgroundPosition = (-frame.column * pixelWidth - (anchorX * scale + draw.left)) + 'px ' + (-frame.row * pixelHeight - (frame.ground[1] * scale + draw.top)) + 'px';
      node.style.imageRendering = 'pixelated';
      node.style.transform = 'translate(' + Math.round(foot.x + draw.left) + 'px,' + Math.round(foot.y + draw.top) + 'px)';
      node.dataset.spriteKind = 'pixel';
      node.dataset.spriteSource = frame.src;
      node.dataset.spriteRow = String(frame.row);
      node.dataset.spriteFrame = String(frame.column);
      node.dataset.spriteMode = frame.mode;
      node.dataset.spriteView = pose.direction;
      return;
    }
    // 로딩 중·유실·손상된 픽셀 시트는 현재 PokeAPI 3D 그림으로 대체한다.
    const view = CompanionView.spriteFor({ id }, pose.direction);
    let source = view.url || pokemonImage({ id });
    if (source && spriteImage(source).failed) source = pokemonImage({ id });
    if (!source || spriteImage(source).failed) {
      node.hidden = true;
      return;
    }
    const box = pose.extent;
    const bob = pose.moving && !reduced ? Math.sin(field.time * 11) * 3 : 0;
    node.style.width = box + 'px';
    node.style.height = box + 'px';
    node.style.backgroundImage = 'url("' + source + '")';
    node.style.backgroundRepeat = 'no-repeat';
    node.style.backgroundSize = 'contain';
    node.style.backgroundPosition = 'center bottom';
    node.style.imageRendering = 'auto';
    node.style.transform = 'translate(' + (foot.x - box / 2) + 'px,' + (foot.y - box + bob) + 'px) scaleX(' + (view.mirror ? -1 : 1) + ')';
    node.dataset.spriteKind = 'fallback';
    node.dataset.spriteSource = source;
    node.dataset.spriteMode = 'fallback';
    node.dataset.spriteView = view.view;
    delete node.dataset.spriteRow;
    delete node.dataset.spriteFrame;
  }
  // 동행 그림의 배율과 발 기준 사각형(px). 걷기·쉬기 모든 프레임의 그림 경계를 합쳐 한 배율로 키운다(같은 포켓몬은 늘 같은 배율).
  // 필드 동행은 키와 상관없이 모두 같은 크기(2026-11-14 사용자 「여긴 크기 비례하지말고 다 같은 크기로해」, 키 비례는 배틀만):
  // 몸통 크기(장면별 그림 폭·높이 중앙값 중 큰 쪽)가 지도 배율로 COMPANION_BODY_DOTS 도트가 되게, 트레이너(몸 21도트)보다 살짝 작게.
  // 가장 긴 변 대신 중앙값을 쓰는 건 옆모습 꼬리(피카츄 30도트, 중앙값 24)·땅 파는 장면(디그다) 한 장 때문에 몸이 작아지지 않게.
  // 배율은 기기 배율 단위(3배 폰은 1/3)로만 골라 도트 한 칸이 기기 픽셀 정수 개로 고르게 그려지고, 1배 아래로는 내려가지 않는다.
  // 픽셀 시트가 없으면 3D 대체 그림 크기 extent(px) 정사각.
  const COMPANION_BODY_DOTS = 19;
  // 걷기·쉬기 모든 장면 그림 경계의 중앙값(도트). index 2 는 폭, 3 은 높이.
  function medianBound(data, index) {
    const values = [];
    for (const motion of [data?.walk, data?.idle]) {
      for (const row of Array.isArray(motion?.frameGeometry) ? motion.frameGeometry : []) {
        for (const geometry of Array.isArray(row) ? row : []) if (Number.isFinite(geometry?.bounds?.[index])) values.push(geometry.bounds[index]);
      }
    }
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] || 0;
  }
  const companionShapes = new Map();
  function companionShape(id, scale, extent) {
    const steps = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const key = id + ':' + scale + ':' + extent + ':' + steps;
    if (companionShapes.has(key)) return companionShapes.get(key);
    const data = window.FIELD_SPRITES?.[id];
    let widest = 0, tallest = 0;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const motion of [data?.walk, data?.idle]) {
      const rows = Array.isArray(motion?.frameGeometry) ? motion.frameGeometry : [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const geometry of row) {
          const bounds = geometry?.bounds;
          if (!Array.isArray(bounds) || !bounds.every(Number.isFinite)) continue;
          const ground = Array.isArray(geometry.ground) ? geometry.ground : [motion.frameWidth / 2, motion.frameHeight * .8];
          const anchorX = id === 25 && Array.isArray(geometry.body) && Number.isFinite(geometry.body[0]) ? geometry.body[0] : ground[0];
          widest = Math.max(widest, bounds[2]);
          tallest = Math.max(tallest, bounds[3]);
          left = Math.min(left, bounds[0] - anchorX);
          right = Math.max(right, bounds[0] + bounds[2] - anchorX);
          top = Math.min(top, bounds[1] - ground[1]);
          bottom = Math.max(bottom, bounds[1] + bounds[3] - ground[1]);
        }
      }
    }
    let shape;
    if (widest && tallest) {
      const mapScale = Math.max(1, Math.round(scale));
      const body = Math.max(medianBound(data, 2), medianBound(data, 3));
      const whole = Math.max(1, Math.round(COMPANION_BODY_DOTS * mapScale / body * steps) / steps);
      // 몸통 상자: 가로는 장면별 그림 폭의 중앙값을 발 가운데에 둔 폭, 세로는 모든 장면을 합친 범위. 끈 길이·발밑 겹침
      // (updateCompanions)은 이 상자로 잰다. 모든 장면을 합친 폭은 옆모습 꼬리까지 들어가(피카츄 40도트, 중앙값 23) 끈이 길어지고
      // 세로 폰에서 옆으로 걸으면 둘째 동행이 화면 밖으로 밀려났다(2026-11-13). 꼬리·귀가 옆 동행과 조금 겹쳐 그려지는 건 괜찮다.
      // 앞모습 폭만 쓰면 롱스톤(앞 24·옆 79도트)처럼 옆으로 긴 포켓몬이 앞 동행을 덮어 중앙값을 쓴다.
      const half = medianBound(data, 2) / 2;
      // left·right·top·bottom 은 몸통 상자, draw 는 그림을 자르지 않게 모든 장면을 합친 상자(placeCompanion 이 그 크기로 그린다).
      shape = { scale: whole, left: -half * whole, right: half * whole, top: top * whole, bottom: bottom * whole,
        draw: { left: left * whole, right: right * whole, top: top * whole, bottom: bottom * whole } };
    } else {
      // 픽셀 시트 정보가 없으면 3D 대체 그림 크기(extent 정사각, 발이 아래 끝).
      const square = { left: -extent / 2, right: extent / 2, top: -extent, bottom: 0 };
      shape = { scale: 1, ...square, draw: square };
    }
    companionShapes.set(key, shape);
    return shape;
  }

  function frame(time) {
    const dt = Math.min((time - previousTime) / 1000, .05);
    previousTime = time;
    if (screen === 'field' && field && !document.hidden) fieldFrame(dt);
    requestAnimationFrame(frame);
  }
  // 점검용 읽기 전용 상태: 브라우저 시험이 화면 좌표로 겹침·걸을 수 있는 범위·지도 여백을 잰다.
  window.GameField = Object.freeze({
    // 시험용: 볼을 찾아가는 시험이 풀숲 만남에 끼어들리지 않게 끈다.
    setGrassEncounters(on) { grassOff = !on; },
    // 시험용: 지도 네 귀퉁이까지 걷는 시험이 출구로 다른 지역에 넘어가지 않게 끈다.
    setExits(on) { exitsOff = !on; },
    // 미니맵 지형 색(tokens 값) — 시험이 캔버스 픽셀을 이 색과 비교한다.
    miniColor,
    snapshot() {
      if (screen !== 'field' || !field?.last) return null;
      const { view, sizes, margin, cameraX, cameraY } = field.last;
      const map = fieldMap();
      const toScreen = point => ({ x: point.x * view.size - cameraX, y: point.y * view.size - cameraY });
      const screenBox = box => ({ left: box.left - cameraX, right: box.right - cameraX, top: box.top - cameraY, bottom: box.bottom - cameraY });
      return {
        region, size: view.size, scale: view.scale, width: view.width, height: view.height, camera: { x: cameraX, y: cameraY }, sizes,
        ready: document.querySelector('#field-canvas')?.dataset.ready === 'true', say: field.say && field.time <= field.say.until ? field.say.line : null,
        player: { ...toScreen(field.player), walkable: field.riding ? FieldWorld.isSailable(map, field.player, margin) : FieldWorld.isWalkable(map, field.player, margin), direction: field.player.direction, moving: field.moving },
        trainerBox: screenBox(trainerBox(field.player, sizes, view.size)), footTiles: { trainer: TRAINER_FOOT_TILES, companion: COMPANION_FOOT_TILES },
        companions: field.followers.filter(Boolean).map(state => ({ id: state.id, direction: state.direction, moving: state.moving, stepping: Boolean(state.side), scale: state.shape.scale, ...toScreen(state), box: screenBox(shapeBox(state.shape, state, view.size)), drawn: screenBox(shapeBox(state.shape.draw, state, view.size)) })),
        balls: field.balls.map(ball => ({ ...toScreen(ball), gold: ball.gold, water: Boolean(ball.water), spawn: ball.spawn, walkable: FieldWorld.isWalkable(ball.water ? map.openWaterMap : map, ball, margin), exit: Boolean(FieldWorld.exitAt(map, ball)) })),
        // 배: 화면 자리·방향, 타고 있는지, 트레이너에서 몸통까지(칸)·다시 탈 준비·배를 눌러 걸어가는 중인지
        riding: field.riding, boat: field.boat ? { ...toScreen(field.boat), direction: field.boat.direction, cell: field.boat.cell || null, gap: FieldWorld.boatGap(field.boat, field.player), ready: field.boatReady, call: Boolean(field.boatCall) } : null,
        // 발자국(바닥 종류·나이)과 물거품 개수
        tracks: { prints: (field.tracks?.prints || []).map(mark => ({ kind: mark.kind, age: mark.age })), wake: field.tracks?.wake.length || 0 },
        // 출구: 출구 칸 가운데(화면 px)·갈 지역·이름표, 트레이너가 지금 선 출구(전환 직전에만)
        exits: map.exits.map(exit => ({ side: exit.side, to: exit.to, cells: exit.cells.map(([x, y]) => toScreen({ x: (x + .5) / map.size, y: (y + .5) / map.size })), label: toScreen(exit.label) })),
        // 확대 단계와 미니맵(점 캔버스의 화면 자리·한 변 px, 옅어졌는지)
        zoom: fieldZoom,
        mini: (() => {
          const node = document.querySelector('.field-mini-dots');
          if (!node) return null;
          const box = node.getBoundingClientRect();
          return { left: box.left, top: box.top, size: box.width, faded: document.querySelector('.field-mini').classList.contains('is-faded') };
        })(),
      };
    },
  });
  title();
  musicForScreen();
  requestAnimationFrame(frame);
  void S.init().then(()=>{booted=true;updateHeader();if(screen==='title')title();});
})();
