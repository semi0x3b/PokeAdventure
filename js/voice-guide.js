// 음성 안내(2026-11-13 사용자 「윙크 홈런 같은 느낌으로 음성으로 가이드」): 글을 못 읽는 아이가 소리만 듣고도 따라오게
// 화면에 들어갈 때·중요한 일이 생길 때 짧은 한마디를 브라우저 한국어 TTS 로 들려준다. game.js 는 VoiceGuide.say('순간') 한 줄만 부르고,
// 말 목록·횟수·겹침 규칙은 모두 여기 있다. 설정 「소리」(settings.sound, 2026-11-15 소리 설정 하나로)를 끄면 말하지 않는다.
// 옛 「음성 안내」(settings.voiceGuide)는 보지 않는다(설정 창이 「소리」를 바꿀 때 같은 값으로 함께 저장만 한다, game.js soundSettings).
//
// 겹침 규칙
// - 문제 읽기(js/narration.js)가 먼저다. 말할 때가 됐는데 문제를 읽는 중이면 이 말은 건너뛴다(기다렸다 늦게 말하지 않는다).
//   반대로 안내 중에 문제 읽기가 시작되면 Narration 이 speechSynthesis.cancel() 로 안내를 끊는다.
// - delay: 효과음·울음소리가 끝난 뒤에 말하도록 기다리는 시간. 그사이 화면이 바뀌면(cancel) 말하지 않는다.
// - 안내끼리는 새 말이 앞 말을 끊는다(지금 화면 말이 더 맞다). 아이가 화면을 누르면 하던 안내는 끊는다.
// - narrated: 같은 글을 문제 읽기가 읽어 주는 순간(잡았다 카드·선물 글). 소리가 켜져 있으면 문제 읽기가 읽으므로 안내는 말하지 않는다
//   (소리 하나로 합친 뒤에는 안내만 켜지고 읽기는 꺼진 경우가 없어 이 순간은 늘 문제 읽기가 맡는다).
//
// 횟수: count 가 있는 순간은 이 기기에 계정별로 몇 번 말했는지 센다. full 번까지는 lines, quiet 번까지는 short, 그 뒤는 말하지 않는다.
// count:false 인 순간(정답·오답 같은 반응)은 세지 않고 늘 말한다. 세는 순간을 GAP_MS(gap 이 있으면 그 값) 안에 또 부르면(다시 그리기 등) 넘어간다.
// {text}·{say}·{dir} 자리는 say(순간, { text }) 로 채운다. 채울 말에 한글이 없으면(「GOOD!」 등) 그 줄은 빼고 다른 줄을 쓴다.
// {name} 은 로그인한 계정 이름(2026-11-14 사용자 「내가 넣은 계정 이름으로해야해 지우x」, 「서아 캐릭터를 누르면 이라고해」). 손님이면 그 줄은 빠지고 이름 없는 줄을 쓴다.
// (같은 날 가방 안내가 「캐릭터를 누르면」에서 「가방」 버튼으로 바뀌어 지금 {name} 을 쓰는 줄은 없다.)
(function (root) {
  'use strict';
  const MOMENTS = Object.freeze({
    title: { lines: ['모험 시작을 눌러 볼까?', '모험 시작 버튼을 눌러 봐!'], short: ['오늘도 모험 가 볼까?', '모험을 떠나 볼까?'], full: 3, quiet: 10 },
    // 가입·로그인 창은 대개 부모님이 채운다. 숫자판만 짧게.
    auth: { lines: ['비밀번호 숫자 네 개를 눌러 줘!'], full: 3, quiet: 3 },
    regions: { lines: ['가고 싶은 곳을 눌러 봐!', '어디로 갈지 골라 볼까?'], short: ['어디로 갈까?', '오늘은 어디로 갈까?'], full: 3, quiet: 10 },
    // 새 지역에 들어온 첫 말풍선 때. 처음 세 번은 걷는 법, 그 뒤에는 트레이너 말풍선 글을 그대로.
    'field-enter': { lines: ['몬스터볼을 찾아서 걸어가 보자!', '화면을 누르면 그쪽으로 걸어가!'], short: ['{say}'], full: 3, quiet: 15 },
    // 금색 볼 말풍선은 볼이 보이는 동안 8초마다 뜬다. 소리는 30초에 한 번만.
    'field-gold': { lines: ['{say}'], count: false, gap: 30000 },
    'field-boat': { lines: ['{say}'], count: false },
    'field-done': { lines: ['{say}'], count: false, gap: 30000 },
    fieldReturn: { lines: ['또 몬스터볼을 찾아보자!', '다음 친구를 찾으러 가자!'], full: 3, quiet: 3 },
    // 필드에서 오래 가만히 있을 때. 처음엔 걷는 법, 그 뒤에는 가장 가까운 볼 방향(미니맵에서 보이는 쪽).
    fieldIdle: { lines: ['화면을 눌러서 걸어 볼까?', '화면을 누르면 걸어갈 수 있어!'], short: ['{dir}에 몬스터볼이 있어!', '{dir}에 볼이 숨어 있어!'], full: 2, quiet: 20 },
    // 필드 오른쪽 위 「가방」 버튼(2026-11-14 사용자 「트레이너 눌렀을때 가방 좀 불편하네 … 우상단 버튼으로」). 이 기기에서 계정마다 한 번,
    // 새로 들어온 필드의 인사 말풍선이 끝난 뒤(game.js guideBag). 뒤이어 가방 창에서는 bagOpen 「칸을 눌러서 친구를 바꿔 봐!」.
    // 전에는 「{name} 캐릭터를 누르면 가방이 열려!」(트레이너를 누르던 때).
    bag: { lines: ['가방을 눌러서 친구를 골라 봐!'], full: 1, quiet: 1 },
    bagOpen: { lines: ['칸을 눌러서 친구를 바꿔 봐!'], full: 3, quiet: 3 },
    // 배틀 말풍선 멘트(js/battle-view.js LINES: 정답·마지막 문제·오답·피격·던지기·도망 등)를 소리로도. 효과음(0.5초 안팎) 뒤에.
    battle: { lines: ['{text}'], count: false, delay: 450 },
    // 그림자 정체(「피카츄다!」)는 말하지 않는다: 공개 소리는 그 포켓몬의 울음소리(2026-11-14 사용자 「포켓몬 그림자 맞추면 포켓몬 울음소리로 변경」, game.js playAnswer).
    // 「어떻게 잡을까?」 선택 팝업(공개·울음소리가 끝나고 첫 문제 전, 2026-11-14). 글을 못 읽어도 두 그림 중 고르게. 문제 읽기는 고른 뒤에 시작한다.
    catchMethod: { lines: ['공격할까, 먹이를 줄까?', '공격할지 먹이 줄지 골라 봐!'], short: ['어떻게 잡을까?', '어떻게 잡아 볼까?'], full: 3, quiet: 10 },
    // 잡았다: 징글·울음소리(0.9초에 시작) 뒤. 소리가 켜져 있으면 문제 읽기가 잡았다 카드를 읽어 주므로(feat/run-away) 말하지 않는다.
    caught: { lines: ['{text}'], count: false, narrated: true, delay: 2000 },
    stamp: { lines: ['오늘 출석 도장 쾅!', '출석 도장을 받았어!'], count: false, delay: 1100 },
    giftReady: { lines: ['선물 상자를 눌러 봐!', '열기를 눌러 봐!'], count: false },
    stamps: { lines: ['도장을 다 모으면 선물이 와!'], full: 3, quiet: 3 },
    // 선물 공개 글: 상자가 열리고(5.8초) 울음소리(6.2초)가 끝난 뒤. 소리가 켜져 있으면 문제 읽기가 읽는다.
    gift: { lines: ['{text}'], count: false, narrated: true, delay: 7400 },
    dex: { lines: ['잡은 친구들을 볼 수 있어!', '친구를 누르면 자세히 보여!'], short: ['포켓몬 도감이야!'], full: 3, quiet: 10 },
    partySlot: { lines: ['반짝이는 칸을 눌러 봐!'], full: 3, quiet: 3 },
    partyPick: { lines: ['같이 다닐 친구를 골라 봐!'], full: 3, quiet: 3 },
    // 튜토리얼 캐릭터 고르기(남자·여자 앞모습 두 개, js/tutorial.js mountPick). 계정마다 거의 한 번이라 세지 않는다.
    trainerPick: { lines: ['같이 모험할 캐릭터를 골라 줘!'], count: false },
    wordbook: { lines: ['손가락으로 따라 써 보자!', '회색 글자 위를 따라 써 봐!'], short: ['글자를 써 보자!'], full: 3, quiet: 10 },
    tracePass: { lines: ['{text}', '잘 썼어!', '최고야!', '멋지게 썼어!'], count: false },
    traceRetry: { lines: ['{text}', '한 번 더 써 보자!'], count: false },
    yard: { lines: ['친구를 누르면 쓰다듬을 수 있어!', '땅을 누르면 친구들이 달려와!'], full: 3, quiet: 3 },
    // 첫 화면 소개(js/feature-tour.js): 버튼을 하나씩 빛내며 한마디. 소개가 계정마다 한 번(다시 보기는 설정)이라 세지 않는다.
    'tour-stamps': { lines: ['매일 도장 쾅! 다섯 개면 선물!'], count: false },
    'tour-wordbook': { lines: ['글자 쓰면 피카츄 스티커를 받아!'], count: false },
    'tour-yard': { lines: ['잡은 포켓몬이 마당에서 놀아!'], count: false },
    'tour-settings': { lines: ['어른이랑 문제 어려움을 바꿔 봐!'], count: false }
  });
  const DEFAULT_DELAY = 300;
  const GAP_MS = 4000;
  // 문제 읽기(0.9·1)보다 조금 빠르고 밝게. 1.2 를 넘으면 목소리가 가늘게 뭉개진다.
  const RATE = 0.95;
  const PITCH = 1.1;
  const HANGUL = /[가-힣]/;
  const lastLine = {};
  const lastAt = {};
  const timers = new Set();
  let current = null; // 지금 말하는 안내
  let waiting = null; // 아직 한 번도 누르지 않아 브라우저가 소리를 막을 때, 첫 누름 뒤에 할 말
  let epoch = 0;

  function engine() {
    const synth = root.speechSynthesis;
    return synth && typeof synth.speak === 'function' && typeof root.SpeechSynthesisUtterance === 'function' ? synth : null;
  }
  function settings() { return root.GameStorage?.state?.settings || {}; }
  function enabled() { return settings().sound !== false; }
  function storeKey(name = root.GameStorage?.user?.name || 'guest') { return 'pokemon-adventure:voice-guide:' + name; }
  function counts() {
    try { return JSON.parse(root.localStorage?.getItem(storeKey()) || '{}') || {}; }
    catch { return {}; }
  }
  function bump(moment) {
    const all = counts();
    all[moment] = (all[moment] || 0) + 1;
    try { root.localStorage?.setItem(storeKey(), JSON.stringify(all)); }
    catch { /* 저장 공간이 없으면 다음에 한 번 더 말한다 */ }
  }
  function accountFill(key) {
    const name = root.GameStorage?.user?.name;
    if (key !== 'name' || typeof name !== 'string' || !name.trim()) return undefined;
    return name.trim();
  }
  function fillLine(line, fill) {
    let missing = false;
    const text = line.replace(/\{(\w+)\}/g, (_, key) => {
      const value = fill[key] ?? accountFill(key);
      // 계정 이름은 영어여도 그대로 부른다(아이가 넣은 이름).
      if (typeof value === 'string' && value.trim() && (HANGUL.test(value) || key === 'name')) return value.trim();
      missing = true;
      return '';
    });
    return missing ? '' : text;
  }
  // 순간·채울 말·지금까지 말한 횟수로 할 말 하나를 고른다(없으면 ''). 직전에 한 말은 피한다.
  function pick(moment, fill = {}, seen = 0, random = Math.random) {
    const spec = MOMENTS[moment];
    if (!spec) return '';
    const counted = spec.count !== false;
    const full = spec.full ?? 3;
    if (counted && seen >= (spec.quiet ?? full)) return '';
    const pool = !counted || seen < full ? spec.lines : spec.short || [];
    const options = pool.map(line => ({ templated: /\{\w+\}/.test(line), text: fillLine(line, fill) })).filter(option => option.text);
    // 채울 말(말풍선 글 등)이 있으면 그 말을 먼저 쓴다.
    const preferred = options.some(option => option.templated) ? options.filter(option => option.templated) : options;
    const fresh = preferred.filter(option => option.text !== lastLine[moment]);
    const choices = fresh.length ? fresh : preferred;
    if (!choices.length) return '';
    const text = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))].text;
    lastLine[moment] = text;
    return text;
  }
  // 가장 가까운 볼이 있는 쪽(지도 좌표 dx·dy, 아래가 +). 비스듬하면 「오른쪽 위」처럼 둘을 붙인다.
  function direction(dx, dy) {
    if (!dx && !dy) return '';
    const horizontal = Math.abs(dx) > Math.abs(dy) * 0.5 ? (dx > 0 ? '오른쪽' : '왼쪽') : '';
    const vertical = Math.abs(dy) > Math.abs(dx) * 0.5 ? (dy > 0 ? '아래' : '위') : '';
    if (horizontal && vertical) return horizontal + ' ' + vertical;
    return horizontal || vertical + '쪽';
  }
  // 안내만 끊는다(문제 읽기가 말하는 중이면 건드리지 않는다).
  function stopOwn() {
    const synth = engine();
    if (!current || !synth) { current = null; return; }
    if (!root.Narration?.speaking) synth.cancel();
    current = null;
  }
  function speakNow(moment, fill) {
    const synth = engine();
    if (!synth || !enabled()) return;
    if (typeof fill.guard === 'function' && !fill.guard()) return;
    if (root.Narration?.speaking) return;
    if (current && !synth.speaking && !synth.pending) current = null;
    // 다른 소리(문제 읽기가 아닌 TTS)가 말하는 중이면 끼어들지 않는다.
    if (!current && (synth.speaking || synth.pending)) return;
    // 아직 아무것도 누르지 않은 페이지에서는 브라우저가 말을 막는다. 첫 누름 뒤에 말한다.
    if (root.navigator?.userActivation?.hasBeenActive === false) { waiting = { moment, fill, epoch }; return; }
    const spec = MOMENTS[moment];
    const counted = spec.count !== false;
    const text = pick(moment, fill, counted ? counts()[moment] || 0 : 0);
    if (!text) return;
    if (current) synth.cancel();
    try {
      const utterance = new root.SpeechSynthesisUtterance(root.Narration?.clean ? root.Narration.clean(text) : text);
      utterance.lang = 'ko-KR';
      utterance.rate = RATE;
      utterance.pitch = PITCH;
      utterance.volume = 1;
      const voice = root.Narration?.voice?.();
      if (voice) utterance.voice = voice;
      utterance.voiceGuide = moment; // 시험이 문제 읽기와 안내를 가려낸다
      current = utterance;
      utterance.onend = utterance.onerror = () => { if (current === utterance) current = null; };
      synth.speak(utterance);
      if (counted) bump(moment);
    } catch { current = null; }
  }
  // fill: { text, say, dir } 자리 채울 말, guard: 말할 때 아직 그 장면인지(배틀 단계 등) 확인하는 함수.
  function say(moment, fill = {}) {
    const spec = MOMENTS[moment];
    if (!spec || !enabled() || !engine()) return false;
    if (spec.narrated) return false;
    const gap = spec.gap ?? (spec.count === false ? 0 : GAP_MS);
    if (gap) {
      const now = Date.now();
      if (now - (lastAt[moment] ?? -Infinity) < gap) return false;
      lastAt[moment] = now;
    }
    epoch++;
    waiting = null;
    const timer = root.setTimeout(() => { timers.delete(timer); speakNow(moment, fill); }, spec.delay ?? DEFAULT_DELAY);
    timers.add(timer);
    return true;
  }
  // 화면이 바뀔 때·설정을 끌 때: 기다리던 말을 지우고 하던 안내를 끊는다.
  function cancel() {
    epoch++;
    waiting = null;
    for (const timer of timers) root.clearTimeout(timer);
    timers.clear();
    stopOwn();
  }
  // 아이가 화면을 누르면 하던 안내는 끊는다. 첫 누름이면 막혀 있던 말(처음 화면 등)을 그 뒤에 들려준다(그사이 다른 말이 없을 때만).
  root.addEventListener?.('pointerdown', () => {
    stopOwn();
    if (!waiting) return;
    const pending = waiting;
    waiting = null;
    root.setTimeout(() => { if (pending.epoch === epoch) speakNow(pending.moment, pending.fill); }, 400);
  }, true);

  // 처음부터 다시 하기(game.js startOver): 그 계정이 들은 횟수를 지워 새 계정처럼 처음 몇 번은 길게 말한다.
  function forget(name) {
    try { root.localStorage?.removeItem(storeKey(name)); }
    catch { /* 저장소가 막혀 있으면 지울 것도 없다 */ }
    for (const moment of Object.keys(lastAt)) delete lastAt[moment];
  }

  root.VoiceGuide = Object.freeze({ say, cancel, pick, direction, forget, MOMENTS });
})(window);
