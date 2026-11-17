/* 첫 화면 기능 소개(2026-11-14 사용자 승인 설계): 글을 못 읽는 아이에게 처음 화면 버튼을 하나씩 빛내며 음성으로 한마디씩 알려 준다.
   글자는 띄우지 않는다(사용자 「텍스트로 쓰는건 ㄴㄴ」). 소리(js/voice-guide.js 'tour-*')와 빛·누름 물결만 쓴다.
   - 차례: 출석 도장 → 글자 쓰기 → 내 마당 → 설정(어른과 함께 문제 어려움 바꾸기).
   - 계정마다 한 번, 손님('guest')도 이 기기에서 한 번. 띄운 순간 본 것으로 기억해 중간에 나가도 다시 띄우지 않는다. 설정 「소개 다시 보기」로 다시 본다.
   - 화면을 막지 않는다: 나머지는 살짝 어두워질 뿐 누르면 그대로 동작한다. 버튼(「모험 시작」 포함)을 누르면 그 버튼이 동작하고 소개는 끝,
     버튼이 아닌 곳(빈 곳·포켓몬)을 누르면 다음 차례. 한 차례는 약 3초(말이 더 길면 끝날 때까지) 뒤 저절로 넘어간다.
   - 소리를 끈 계정은 소리 없이 빛만 차례로 지나간다. 아직 아무것도 누르지 않은 페이지(브라우저가 소리를 막음)에서는
     첫 차례에 머물렀다가 첫 누름에 그 차례 말을 들려준다(voice-guide.js 의 첫 누름 규칙).
   - 반짝 표시: 아직 들어가 본 적 없는 메뉴(글자 쓰기·내 마당·출석 도장판·설정)에 작은 별(img/art/icons/star.png, css .tour-new).
     game.js 가 들어갈 때(그날 저절로 뜬 출석 도장판 포함) visited(id) 를 부르면 그 메뉴의 별만 사라진다.
   - 저장(2026-11-14 사용자 「메인에 알려주는 표시가 다 했던건데 또 나와」 — 같은 계정을 아이폰·아이패드·맥에서 연다):
     이 기기 localStorage 에 계정별 한 키({ toured, visited }), 로그인 계정은 서버 계정 기록 state.seen(이름 목록, 합집합이라 지워지지 않음)에도.
     로그인 계정은 둘을 합쳐 보고, 들어가 보거나 소개를 띄우면 둘 다에 적는다. 이 기기에만 있던 기록(서버 기록이 생기기 전에 본 것)은
     서버 확인이 끝난 처음 화면에서 서버로 올린다. 손님은 이 기기에만. 처음부터 다시 하기는 서버(api/game.mjs resetAccount)·기기(forget) 모두 비운다.
   Codex 가 그린 손가락(img/art/ui/tap-hand.png, .feature-tour-hand)이 버튼 가운데를 두 번 톡톡 누르고, 금빛 테두리가 조여지며 버튼 가운데서 누름 물결(.feature-tour-tap)이 퍼진다.
   버튼 밖에 세모를 두면 세로·가로 화면 모두 옆 버튼 글자를 가렸다(2026-11-14 캡처). 손가락은 끝을 버튼 가운데에 두어 그 버튼 위에서 벗어나지 않는다(가림은 캡처로 확인). */
(function (root) {
  'use strict';
  const STEPS = Object.freeze([
    { id: 'stamps', target: '.title-scene [data-action="stamps"]' },
    { id: 'wordbook', target: '.title-menu [data-action="wordbook"]' },
    { id: 'yard', target: '.title-menu [data-action="yard"]' },
    { id: 'settings', target: '#settings-button', flip: true }
  ]);
  const START_AFTER_MS = 2400; // 처음 화면 톡톡 등장(출석 카드가 마지막, 약 2.2초)이 끝난 뒤
  const STEP_MS = 3200; // 한 차례 최소 시간. 말이 더 길면 끝날 때까지 기다린다.
  const STEP_MAX_MS = 9000; // 말이 끝나지 않아도(다른 소리 등) 이만큼 지나면 넘어간다.
  const HAND_SHIFT = 0.12; // 손가락 끝을 버튼 폭의 이만큼 가운데에서 오른쪽으로
  // 손 크기: 버튼 높이의 0.8배(48~80px). 손가락은 끝에서 위로 그림 키의 0.94배 뻗으므로, 끝을 그만큼 버튼 안쪽 아래에 두어
  // 몸통이 버튼 위로 넘어 위쪽 버튼 글자를 덮지 않게 한다(가로 화면은 버튼이 낮아 손이 작고 끝이 아래쪽).
  const HAND_MIN = 48;
  const HAND_MAX = 80;
  const HAND_REACH = 0.94;
  const TIP = { x: 68 / 256, y: 240 / 256 }; // 그림에서 손가락 끝. 180도 돌린 설정 차례는 (1-x, 1-y)
  const PAD = 6; // 빛나는 테두리와 버튼 사이
  const KEY = 'pokemon-adventure:feature-tour:';
  // 서버 계정 기록 state.seen 에 넣는 이름: 소개를 본 것('toured')과 차례 메뉴들(api/game.mjs SEEN_NAMES 와 같아야 서버가 받는다).
  const SEEN = Object.freeze(['toured', ...STEPS.map(step => step.id)]);
  const doc = root.document;
  let tour = null;
  let waitTimer = 0;

  function owner() { return root.GameStorage?.user?.name || 'guest'; }
  // 이 기기 기록 { toured, visited: [메뉴] }(계정 이름 키, 손님은 'guest').
  function load() {
    try {
      const record = JSON.parse(root.localStorage?.getItem(KEY + owner()) || '{}');
      return record && typeof record === 'object' && !Array.isArray(record) ? record : {};
    } catch { return {}; }
  }
  function save(record) {
    try { root.localStorage?.setItem(KEY + owner(), JSON.stringify(record)); }
    catch { /* 저장 공간이 없으면 다음에 한 번 더 보여 준다 */ }
  }
  function deviceSeen(record = load()) {
    const visited = Array.isArray(record.visited) ? record.visited : [];
    return SEEN.filter(name => name === 'toured' ? record.toured === true : visited.includes(name));
  }
  // 로그인 계정의 서버 기록(js/storage.js 가 들고 있는 계정 기록, 아직 보내는 중인 것 포함). 손님은 없음.
  function accountSeen() {
    const list = root.GameStorage?.user ? root.GameStorage.state?.seen : null;
    return Array.isArray(list) ? SEEN.filter(name => list.includes(name)) : [];
  }
  function seen() {
    const names = new Set([...deviceSeen(), ...accountSeen()]);
    return SEEN.filter(name => names.has(name));
  }
  // 로그인 계정: 이 기기에서 본 것 중 서버 기록에 없는 것이 있으면 합친 목록을 보낸다(설정이 아니라 preferences 로 보내지 않는다).
  function upload() {
    const storage = root.GameStorage;
    if (!storage?.user || typeof storage.update !== 'function') return;
    const account = accountSeen();
    const all = seen();
    if (all.every(name => account.includes(name))) return;
    storage.update({ seen: [...all].sort() });
  }
  // 본 것(들어가 본 메뉴·'toured')을 이 기기에 적고 서버에도 보낸다.
  function remember(names) {
    const record = load();
    let next = record;
    if (names.includes('toured') && record.toured !== true) next = { ...next, toured: true };
    const visited = Array.isArray(record.visited) ? record.visited : [];
    const fresh = names.filter(name => name !== 'toured' && !visited.includes(name));
    if (fresh.length) next = { ...next, visited: [...visited, ...fresh] };
    if (next !== record) save(next);
    upload();
  }
  // 소리 설정 하나(settings.sound, 2026-11-15)를 따른다. 옛 「음성 안내」(voiceGuide) 값은 보지 않는다.
  function voiceOn() { return Boolean(root.speechSynthesis) && root.GameStorage?.state?.settings?.sound !== false; }
  function onTitle() { return doc.body.dataset.screen === 'title' && Boolean(doc.querySelector('.title-scene')); }
  // 다른 창·선물 장면·장면 전환이 떠 있으면 소개를 시작하지 않고, 하던 소개는 끝낸다.
  function covered() { return Boolean(doc.querySelector('#modal-root')?.firstChild || doc.querySelector('.gift-scene') || root.SceneFX?.active); }

  // 반짝 표시: 들어가 본 적 없는 메뉴에 별. 처음 화면을 그릴 때마다·메뉴에 들어갈 때마다·계정 기록이 바뀔 때마다 다시 붙인다.
  function mark() {
    const names = seen();
    for (const step of STEPS) doc.querySelector(step.target)?.classList.toggle('tour-new', !names.includes(step.id));
  }
  // game.js: 글자 쓰기·내 마당에 들어갈 때, 출석 도장판(아이가 연 것·그날 저절로 뜬 것)·설정 창을 열 때.
  function visited(id) {
    remember([id]);
    mark();
  }
  // game.js title() 가 처음 화면을 그릴 때마다 부른다. ready: 서버 계정 확인이 끝났는지(그 전의 첫 그림은 로그인 계정도 손님으로 보인다).
  // 오늘 도장판·선물 장면·앞 화면 안내 말이 끝나기를 기다렸다가 시작한다.
  function title(ready) {
    mark();
    root.clearTimeout(waitTimer);
    if (!ready || tour) return;
    upload();
    const shownAt = Date.now();
    const check = () => {
      if (!onTitle() || seen().includes('toured')) return;
      if (Date.now() - shownAt < START_AFTER_MS || covered() || root.speechSynthesis?.speaking) { waitTimer = root.setTimeout(check, 400); return; }
      start();
    };
    waitTimer = root.setTimeout(check, 400);
  }
  // 소개 시작(처음 화면에서 저절로, 또는 설정 「소개 다시 보기」).
  function start() {
    if (tour || !onTitle()) return;
    root.clearTimeout(waitTimer);
    remember(['toured']);
    const layer = doc.createElement('div');
    layer.className = 'feature-tour';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<span class="feature-tour-spot"></span><span class="feature-tour-tap"></span><span class="feature-tour-hand"></span>';
    tour = { layer, spot: layer.firstChild, tap: layer.children[1], hand: layer.lastChild, index: -1, stepAt: 0, heard: true, frame: 0 };
    next();
    // 붙이기 전에 자리를 잡아 둔다(처음엔 화면 구석에서 날아오지 않게).
    place();
    doc.body.append(layer);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    tour.frame = root.requestAnimationFrame(tick);
  }
  function next() {
    tour.index++;
    const step = STEPS[tour.index];
    if (!step) { finish(); return; }
    tour.stepAt = root.performance.now();
    tour.heard = !voiceOn() || root.navigator?.userActivation?.hasBeenActive !== false;
    tour.layer.dataset.step = step.id;
    if (voiceOn()) root.VoiceGuide?.say('tour-' + step.id);
  }
  function onClick(event) {
    // 버튼을 누르면 그 버튼이 하던 대로 동작하고(이 함수는 막지 않는다) 소개는 끝난다.
    if (event.target.closest?.('button, a, input, select, textarea')) { finish(); return; }
    // 막혀 있던 첫 차례 말은 이 누름 뒤에 voice-guide.js 가 들려준다. 그 말을 듣도록 이 차례를 처음부터 센다.
    if (!tour.heard) { tour.heard = true; tour.stepAt = root.performance.now(); return; }
    next();
  }
  function onKey(event) { if (event.key === 'Escape') finish(); }
  function tick(now) {
    if (!tour) return;
    if (!onTitle() || covered()) { finish(); return; }
    place();
    const elapsed = now - tour.stepAt;
    if (tour.heard && elapsed >= STEP_MS && (!root.speechSynthesis?.speaking || elapsed >= STEP_MAX_MS)) next();
    if (tour) tour.frame = root.requestAnimationFrame(tick);
  }
  // 지금 차례 버튼 둘레에 빛(나머지는 그 둘레 그림자로 어둡게)과 가운데 누름 물결. 화면을 돌리거나 크기가 바뀌어도 매 프레임 따라간다.
  function place() {
    const target = doc.querySelector(STEPS[tour.index]?.target);
    if (!target) return;
    const box = target.getBoundingClientRect();
    const radius = parseFloat(root.getComputedStyle(target).borderTopLeftRadius) || 0;
    Object.assign(tour.spot.style, {
      left: box.left - PAD + 'px', top: box.top - PAD + 'px',
      width: box.width + PAD * 2 + 'px', height: box.height + PAD * 2 + 'px',
      borderRadius: radius + PAD + 'px'
    });
    const center = { left: box.left + box.width / 2 + 'px', top: box.top + box.height / 2 + 'px' };
    Object.assign(tour.tap.style, center);
    placeHand(box, STEPS[tour.index].flip === true);
  }
  // flip: 화면 맨 위 설정 버튼은 손을 180도 돌려 아래에서 위로 가리키고 끝을 버튼 가운데에 둔다.
  function placeHand(box, flip) {
    const size = Math.round(Math.min(HAND_MAX, Math.max(HAND_MIN, box.height * 0.8)));
    const tip = flip ? { x: 1 - TIP.x, y: 1 - TIP.y } : TIP;
    const tipY = flip ? box.top + box.height / 2 : Math.min(box.bottom - 4, box.top + Math.max(box.height * 0.4, size * HAND_REACH));
    Object.assign(tour.hand.style, {
      width: size + 'px', height: size + 'px',
      margin: `${-tip.y * size}px 0 0 ${-tip.x * size}px`,
      left: box.left + box.width * (0.5 + HAND_SHIFT) + 'px', top: tipY + 'px'
    });
  }
  function finish() {
    if (!tour) return;
    root.cancelAnimationFrame(tour.frame);
    tour.layer.remove();
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKey, true);
    tour = null;
  }
  // 처음부터 다시 하기(game.js startOver): 그 계정의 이 기기 소개·반짝 표시 기록을 지워 튜토리얼 뒤 처음 화면에서 다시 본다. 하던 소개도 끝낸다.
  // 서버 기록(state.seen)은 서버가 초기화하며 비운다(api/game.mjs resetAccount). 이 신호는 js/storage.js 가 새 계정 기록을 받은 바로 뒤에 온다.
  function forget(name) {
    finish();
    root.clearTimeout(waitTimer);
    try { root.localStorage?.removeItem(KEY + name); }
    catch { /* 저장소가 막혀 있으면 지울 것도 없다 */ }
  }
  // 로그인·다른 기기 기록 받기 등으로 계정 기록이 바뀌면 처음 화면 별을 다시 맞춘다. 여기서는 보내지 않는다: 처음부터 다시 한 기록을 받은 순간은
  // 이 기기 기록을 지우기(forget) 직전이라, 보내면 지운 기록이 서버에 되살아난다.
  root.addEventListener?.('savechange', mark);

  root.FeatureTour = Object.freeze({ STEPS, SEEN, title, start, visited, forget, get active() { return tour !== null; } });
})(window);
