// 글자 쓰기: 들어가면 바로 첫 낱말을 손가락으로 따라 쓴다. 옆으로 넘겨 다른 낱말을 쓰고, 목록에서 골라도 된다. 배틀·계정·서버와 분리돼 있고, 쓴 낱말은 이 기기에만 기억한다.
// 통과하면 연습장 위에 큰 별 도장이 쾅 찍히고 작은 별이 흩어진 뒤 다음 낱말로 넘어간다. 포켓몬 선물 세기·저장은 바깥(game.js)이 onPass·giftProgress 로 맡는다.
// 글자 쓰기에서는 획 경로·시작점·손가락을 따라오는 화살표를 쓰고, 기존 채점·도장·선물 흐름을 유지한다.
(function (global) {
  'use strict';

  const DONE_KEY = 'pa.wordbook.done';
  // 스티커가 칸에 들어간(2초) 직후 지금 낱말이 LEAVE_MS 동안 사라지고 다음 낱말이 나온다.
  const NEXT_WORD_DELAY = 2150;
  const LEAVE_MS = 350;
  // 들어올 때 「글자를 써 보자!」 시작 화면이 떠 있는 시간(wordbook.css wordbook-intro 와 같게).
  const INTRO_MS = 2200;
  // 피카츄 스티커: 붙고 흔들린 뒤 STAMP_FLY_AT 에 위쪽 칸으로 날아가 STAMP_FLY_MS 동안 작아지며 들어간다 — 붙고 작아지기까지 총 2초(2026-11-13 사용자).
  const STAMP_FLY_AT = 1300;
  const STAMP_FLY_MS = 700;
  const RETRY_DELAY = 900;
  const SPARK_COUNT = 14;
  // 말풍선 문구: 상황마다 여러 개 중 하나를 무작위로 고르고, 직전과 같은 문장은 피한다.
  const MESSAGES = {
    // 스티커 아래 칭찬 글씨: 매번 바뀐다(2026-11-13 사용자: 영어·한글 여러 개).
    praise: ['GOOD!', 'OK!', '최고야!', '잘했어!', '멋져!', '대단해!', '우와, 멋져!'],
    retry: ['한 번 더 써 보자!', '천천히 다시 해 보자!', '괜찮아, 또 써 보자!', '글자 위를 따라가 봐!'],
    empty: ['글자를 따라 써 봐!', '손가락으로 쓱쓱 써 봐!', '먼저 글씨를 써 볼까?', '회색 글자 위에 써 봐!'],
    rest: ['오늘 선물은 다 받았어! 내일 또 만나!', '오늘은 선물 끝! 글씨 연습은 계속!', '내일 또 피카츄 도장 모으자!'],
    reward: ['피카츄 도장 다 모았다!', '와, 포켓몬 선물이야!', '선물 상자가 왔어!', '다섯 번 다 썼다! 선물!']
  };

  // 포켓몬 이름 따라 쓰기(2026-11-13 사용자): 잡은 포켓몬 먼저, 그다음 잘 알려진 포켓몬. 연습장 한 칸에 크게 들어가는 세 글자까지.
  const FAVORITE_POKEMON = [25, 7, 4, 143, 39, 133, 151, 52, 6, 94, 35, 129, 132, 147, 149, 150, 172, 175, 155, 158, 393, 387, 16, 19, 74, 92];
  function pokemonWords() {
    const all = Array.isArray(global.POKEMON) ? global.POKEMON : [];
    const caught = Array.isArray(global.GameStorage?.state?.caught) ? global.GameStorage.state.caught : [];
    const ids = [...new Set([...caught, ...FAVORITE_POKEMON])];
    return ids.map(id => all.find(pokemon => pokemon.id === id))
      .filter(pokemon => pokemon && [...pokemon.name].length <= 3)
      .map(pokemon => ({ id: 'pk-' + pokemon.id, language: 'pokemon', word: pokemon.name, pokemonId: pokemon.id }));
  }
  // 한 칸에 따라 쓰기 좋은 길이만 고른다: 영어 2~4글자, 한글 1~2글자, 포켓몬 이름 1~3글자.
  function practiceWords(language, entries = global.WORDBOOK_WORDS) {
    if (language === 'pokemon') return pokemonWords();
    const longest = language === 'en' ? 4 : 2;
    return (Array.isArray(entries) ? entries : []).filter(entry => entry.language === language && [...entry.word].length <= longest);
  }

  const lastMessage = {};
  function pickMessage(kind) {
    const choices = MESSAGES[kind].filter(text => text !== lastMessage[kind]);
    const text = choices[Math.floor(Math.random() * choices.length)];
    lastMessage[kind] = text;
    return text;
  }

  // 다 쓴 낱말 표시는 계정마다 따로(2026-11-13 Aside QA: 새 계정에 앞 계정의 별이 남았다). 게스트는 'guest'.
  function doneKey(owner) { return DONE_KEY + ':' + (owner || 'guest'); }
  function loadDone(browser, owner) {
    try {
      const saved = JSON.parse(browser.localStorage.getItem(doneKey(owner)) || '[]');
      return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []);
    } catch (error) {
      return new Set();
    }
  }
  function saveDone(browser, done, owner) {
    try { browser.localStorage.setItem(doneKey(owner), JSON.stringify([...done])); } catch (error) { /* 저장이 막혀도 연습은 계속한다 */ }
  }

  // onPass(entry): 통과할 때마다 부른다. 선물이 생겼으면 별 도장이 끝난 뒤 부를 함수를 돌려준다.
  // giftProgress(): 다음 선물까지 채운 칸 { filled, total }. 없거나 null 이면(게스트) 피카츄 도장 칸을 두지 않는다.
  function mount(container, { onFeedback, onRead, onPass, giftProgress, owner = null } = {}) {
    if (!container || !container.ownerDocument || typeof container.replaceChildren !== 'function') {
      throw new TypeError('단어집을 표시할 화면 요소가 필요합니다.');
    }
    const document = container.ownerDocument;
    const browser = document.defaultView || global;
    const done = loadDone(browser, owner);
    const state = { view: 'write', language: 'ko', wordId: null };
    // 처음 낱말과 다음 낱말은 무작위로 고른다: 아직 안 쓴 낱말을 먼저, 다 썼으면 방금 쓴 것만 빼고(2026-11-13 사용자: 랜덤하게 쭉 쓰기).
    function randomWordId(list, exceptId = null) {
      const others = list.filter(item => item.id !== exceptId);
      const fresh = others.filter(item => !done.has(item.id));
      const choices = fresh.length ? fresh : others.length ? others : list;
      return choices.length ? choices[Math.floor(Math.random() * choices.length)].id : null;
    }
    function firstWordId(language) { return randomWordId(practiceWords(language)); }
    state.wordId = firstWordId('ko');
    const root = document.createElement('section');
    root.className = 'wordbook';
    root.setAttribute('aria-label', '글자 쓰기');
    let destroyed = false;
    let cleanupView = () => {};
    // 선물 연출 예약은 화면을 다시 그려도(넘기기·탭) 남겨 두고, 글자 쓰기를 떠날 때만 취소한다.
    let revealTimer = null;
    container.replaceChildren(root);

    function node(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    // 그림: ARASAAC 픽토그램(LEARN_PICTURES)이 있으면 그것, 없으면 LearningArt 그림. 영어 낱말은 짝인 한글 낱말로 찾는다.
    function pictureOf(entry) {
      const picture = node('span', 'wordbook-picture');
      if (entry.pokemonId) {
        const image = node('img');
        image.src = global.PokemonAssets.image(entry.pokemonId);
        image.alt = '';
        image.draggable = false;
        picture.append(image);
        return picture;
      }
      const number = global.LEARN_PICTURES?.[entry.language === 'ko' ? entry.word : entry.translation];
      if (number) {
        const image = node('img');
        image.src = `img/learn/${number}.webp`;
        image.alt = '';
        image.draggable = false;
        picture.append(image);
        return picture;
      }
      if (global.LearningArt && typeof global.LearningArt.html === 'function') picture.innerHTML = global.LearningArt.html(entry.visual);
      return picture;
    }
    function wordOf(entry) {
      const word = node('span', 'wordbook-word', entry.word);
      word.lang = entry.language === 'en' ? 'en' : 'ko';
      return word;
    }

    function render() {
      if (destroyed) return;
      cleanupView();
      const cleanups = [];
      cleanupView = () => cleanups.splice(0).forEach(cleanup => cleanup());
      const listen = (element, event, handler) => {
        element.addEventListener(event, handler);
        cleanups.push(() => element.removeEventListener(event, handler));
      };
      const later = (handler, delay) => {
        const timer = browser.setTimeout(handler, delay);
        cleanups.push(() => browser.clearTimeout(timer));
      };
      root.replaceChildren();
      root.dataset.view = state.view;
      root.dataset.language = state.language;
      delete root.dataset.wordId;
      const list = practiceWords(state.language);
      const entry = list.find(item => item.id === state.wordId);
      if (state.view === 'list' || !entry) renderList(list, listen);
      else renderWrite(entry, list, listen, later, cleanups);
    }

    // 제목(연필 그림 + 글자 쓰기)과 한글/영어 탭. 목록·쓰기 화면이 함께 쓴다.
    function buildHeader(listen, extraClass) {
      const header = node('header', 'wordbook-header' + (extraClass ? ' ' + extraClass : ''));
      const title = node('h2', 'wordbook-title');
      // 처음 화면 메뉴와 같은 연필 아이콘(공통 색 아이콘).
      const pencil = node('span', 'ui-icon icon-pencil wordbook-pencil');
      pencil.setAttribute('aria-hidden', 'true');
      title.append(pencil, node('span', '', '글자 쓰기'));
      header.append(title);
      const tabs = node('div', 'toggle-group wordbook-tabs');
      tabs.setAttribute('role', 'group');
      tabs.setAttribute('aria-label', '낱말 언어');
      for (const [value, title] of [['ko', '한글'], ['en', '영어'], ['pokemon', '포켓몬']]) {
        const tab = node('button', value === state.language ? 'active' : '');
        // 포켓몬 탭은 글자 대신 작은 몬스터볼 그림 표시.
        const mark = value === 'pokemon' ? node('span', 'wordbook-tab-mark wordbook-tab-mark--ball') : node('span', 'wordbook-tab-mark', value === 'ko' ? '가' : 'A');
        if (value === 'pokemon') mark.setAttribute('aria-hidden', 'true');
        tab.append(mark, node('span', '', title));
        tab.type = 'button';
        tab.dataset.wordbookValue = value;
        tab.setAttribute('aria-pressed', String(value === state.language));
        listen(tab, 'click', () => { state.language = value; state.wordId = firstWordId(value); render(); });
        tabs.append(tab);
      }
      header.append(tabs);
      return header;
    }

    // ---------- 목록: 그림 카드 ----------
    function renderList(list, listen) {
      state.view = 'list';
      root.dataset.view = 'list';
      const header = buildHeader(listen);
      root.append(header);
      if (!list.length) {
        root.append(node('p', 'wordbook-empty', '낱말을 준비하고 있어.'));
        return;
      }
      const grid = node('div', 'wordbook-grid');
      list.forEach((entry, index) => {
        const card = node('button', 'wordbook-card');
        card.type = 'button';
        card.dataset.wordbookCard = entry.id;
        card.style.setProperty('--i', String(Math.min(index, 14)));
        card.setAttribute('aria-label', entry.word + (done.has(entry.id) ? ', 다 썼어요' : ''));
        if (done.has(entry.id)) card.dataset.done = 'true';
        card.append(pictureOf(entry), wordOf(entry));
        listen(card, 'click', () => { state.view = 'write'; state.wordId = entry.id; render(); });
        grid.append(card);
      });
      root.append(grid);
    }

    // ---------- 따라 쓰기: 그림·낱말, 연습장, 두 버튼 ----------
    function renderWrite(entry, list, listen, later, cleanups) {
      root.dataset.wordId = entry.id;

      root.append(buildHeader(listen));
      // 2026-11-14 사용자 참고: 큰 그림·낱말 카드와 쓰는 칸을 나눈다. 카드를 누르면 낱말을 읽어 준다.
      const sample = node('button', 'wordbook-sample');
      sample.type = 'button';
      sample.dataset.wordbookAction = 'read';
      sample.setAttribute('aria-label', entry.word + ' 듣기');
      const wordLabel = wordOf(entry);
      wordLabel.replaceChildren(...[...entry.word].map(character => node('span', 'wordbook-letter', character)));
      sample.append(pictureOf(entry), wordLabel);
      if (entry.translation) sample.append(node('span', 'wordbook-translation', entry.translation));
      listen(sample, 'click', () => { if (typeof onRead === 'function') onRead(entry.word); });

      // 다음 포켓몬 선물까지: 피카츄 도장 칸이 하나씩 찍힌다(로그인한 계정만). 상자 밖(세로는 위, 가로는 왼쪽)에 따로 둔다.
      const hasGift = typeof giftProgress === 'function' && Boolean(giftProgress());
      const balls = hasGift ? node('span', 'wordbook-gift-balls') : null;
      function paintBalls(fresh, full) {
        if (!balls) return;
        const { filled: count, total } = giftProgress();
        const filled = full ? total : count;
        balls.setAttribute('aria-label', full ? '포켓몬 선물이 왔어요' : `포켓몬 선물까지 ${total - filled}번 남았어요`);
        balls.replaceChildren();
        for (let slot = 0; slot < total; slot++) {
          const ball = node('span', 'wordbook-gift-ball');
          if (slot < filled) ball.dataset.on = 'true';
          if (fresh && slot === filled - 1) ball.dataset.fresh = 'true';
          balls.append(ball);
        }
      }
      if (balls) {
        balls.id = 'wordbook-gift-balls';
        sample.setAttribute('aria-describedby', balls.id);
        paintBalls(false, false);
      }

      const stage = node('div', 'wordbook-stage');
      const canvas = node('canvas', 'wordbook-canvas tracing-pad');
      canvas.setAttribute('aria-label', entry.word + ' 따라 쓰기 연습장');
      const bubble = node('p', 'wordbook-bubble');
      bubble.setAttribute('role', 'status');
      bubble.setAttribute('aria-live', 'polite');
      const guidance = node('div', 'wordbook-guidance');
      const guideText = node('span', 'wordbook-guide-text', '화살표부터 따라 써 봐!');
      const progressText = node('span', 'wordbook-progress');
      progressText.setAttribute('aria-live', 'polite');
      guidance.append(guideText, progressText);
      stage.append(guidance, canvas, bubble);
      const workspace = node('div', 'wordbook-workspace');
      workspace.append(sample, stage);

      const actions = node('div', 'wordbook-actions');
      const clear = node('button', 'button secondary');
      const complete = node('button', 'button');
      const replay = node('button', 'button secondary wordbook-replay');
      replay.type = 'button';
      replay.dataset.wordbookAction = 'replay';
      replay.setAttribute('aria-label', '획 쓰는 순서 보여 줘');
      replay.append(node('span', 'ui-icon icon-play'), node('span', '', '보여 줘'));
      for (const [control, action, icon, label] of [[clear, 'clear', 'icon-eraser', '지우개'], [complete, 'complete', 'icon-done', '다 썼어요']]) {
        control.type = 'button';
        control.dataset.wordbookAction = action;
        control.setAttribute('aria-label', label);
        const mark = node('span', 'ui-icon ' + icon);
        mark.setAttribute('aria-hidden', 'true');
        control.append(mark, node('span', '', label));
        actions.append(control);
      }
      // 넘기기 화살표는 없다: 다 쓰면 다음 낱말이 무작위로 이어진다. 낱말을 직접 고르려면 ★ 목록(2026-11-13 사용자).
      const showList = node('button', 'button secondary wordbook-list-button');
      showList.type = 'button';
      showList.dataset.wordbookAction = 'list';
      showList.setAttribute('aria-label', '낱말 목록');
      const listMark = node('span', 'ui-icon icon-star');
      listMark.setAttribute('aria-hidden', 'true');
      showList.append(listMark);
      actions.prepend(showList, replay);
      const content = node('div', 'wordbook-content');
      content.append(...(balls ? [balls] : []), workspace, actions);
      root.append(content);

      let bubbleTimer = null;
      function say(message, kind, lasting) {
        browser.clearTimeout(bubbleTimer);
        bubble.textContent = message;
        bubble.hidden = !message;
        if (kind) bubble.dataset.kind = kind; else delete bubble.dataset.kind;
        // 말풍선 애니메이션을 다시 시작한다.
        bubble.classList.remove('wordbook-bubble--show', 'wordbook-bubble--leaving');
        void bubble.offsetWidth;
        if (message) bubble.classList.add('wordbook-bubble--show');
        if (message && !lasting) bubbleTimer = browser.setTimeout(() => say(''), RETRY_DELAY + 700);
      }
      cleanups.push(() => browser.clearTimeout(bubbleTimer));
      say('');

      // 피카츄 도장: 연습장 오른쪽 위 구석(쓴 글자를 가리지 않게)에 피카츄 도장이 쾅 찍히고(커졌다 줄며 살짝 흔들림) 작은 별이 흩어진다. 칭찬 글은 그 바로 아래.
      // 선물 칸이 있으면(로그인) 도장이 위쪽 칸으로 날아가 한 칸씩 쌓이고, 없으면 그 자리에서 사라진다.
      // 다음 낱말을 그리면 함께 없어진다. 모션 줄이기에서는 날아가지 않고 칸이 바로 찍힌다(wordbook.css).
      // 피카츄 스티커 한 장(PokeAPI 그림에 하얀 칼선 테두리, wordbook.css). 칭찬 글씨는 스티커 아래 말(bubble)로 매번 바뀐다.
      function stampMark() { return node('span', 'wordbook-stamp-mark'); }
      function stamp(collect, cleanups) {
        const overlay = node('div', 'wordbook-stamp' + (collect ? ' wordbook-stamp--collect' : ''));
        overlay.setAttribute('aria-hidden', 'true');
        const mark = stampMark();
        overlay.append(mark);
        for (let index = 0; index < SPARK_COUNT; index++) {
          const angle = (Math.PI * 2 * index) / SPARK_COUNT - Math.PI / 2;
          const reach = 120 + (index % 3) * 46;
          const spark = node('span', 'wordbook-spark');
          spark.style.setProperty('--dx', Math.round(Math.cos(angle) * reach) + 'px');
          spark.style.setProperty('--dy', Math.round(Math.sin(angle) * reach) + 'px');
          spark.style.setProperty('--d', 260 + (index % 4) * 50 + 'ms');
          spark.style.setProperty('--s', (0.7 + (index % 3) * 0.25).toFixed(2));
          overlay.append(spark);
        }
        // 칭찬 글씨(아래쪽)를 가리지 않게 그 위 남은 칸 가운데에 찍는다.
        stage.append(overlay);
        // 스티커가 칸으로 날아가기 시작하는 순간 칭찬 글은 그 자리에서 짧게 사라진다(날아가는 것은 스티커만, 2026-11-13 사용자).
        const fade = browser.setTimeout(() => bubble.classList.add('wordbook-bubble--leaving'), STAMP_FLY_AT);
        cleanups.push(() => browser.clearTimeout(fade));
        const slot = collect ? balls?.querySelector('[data-fresh="true"]') : null;
        const reduced = browser.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (!slot || reduced || typeof mark.animate !== 'function') return;
        // 칸은 도장이 도착할 때까지 비어 보이게 두었다가, 도착하면 쾅 찍힌다.
        slot.dataset.waiting = 'true';
        const timer = browser.setTimeout(() => {
          if (!mark.isConnected || !slot.isConnected) return;
          const from = mark.getBoundingClientRect(), to = slot.getBoundingClientRect();
          // 스크롤 칸 밖으로도 날아갈 수 있게 화면 기준(fixed) 복사본을 날린다.
          const flyer = mark.cloneNode(true);
          flyer.classList.add('wordbook-stamp-flyer');
          Object.assign(flyer.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
          document.body.append(flyer);
          mark.style.visibility = 'hidden';
          const dx = to.left + to.width / 2 - (from.left + from.width / 2);
          const dy = to.top + to.height / 2 - (from.top + from.height / 2);
          const flight = flyer.animate([
            { transform: 'translate(0, 0) scale(1) rotate(0)' },
            { offset: .35, transform: `translate(${dx * .3}px, ${dy * .3 - 40}px) scale(${Math.max(.5, to.width / from.width * 2.2)}) rotate(-6deg)` },
            { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width}) rotate(-10deg)` }
          ], { duration: STAMP_FLY_MS, easing: 'cubic-bezier(.45, 0, .55, 1)', fill: 'forwards' });
          const land = () => {
            flyer.remove();
            if (!slot.isConnected) return;
            delete slot.dataset.waiting;
            delete slot.dataset.fresh;
            void slot.offsetWidth;
            slot.dataset.fresh = 'true';
          };
          flight.finished.then(land, land);
          cleanups.push(() => flyer.remove());
        }, STAMP_FLY_AT);
        cleanups.push(() => browser.clearTimeout(timer));
      }
      function shake() {
        stage.classList.remove('wordbook-stage--shake');
        void stage.offsetWidth;
        stage.classList.add('wordbook-stage--shake');
      }
      // 다음 낱말로 자연스럽게: 지금 낱말(그림·안내 글자·쓴 획)이 스르르 사라진 뒤 새 낱말이 스르르 나타난다(연습장은 움직이지 않고 투명도만, 2026-11-13 사용자).
      const nextWord = () => {
        content.classList.add('wordbook-content--leaving');
        later(() => { state.wordId = randomWordId(list, entry.id); render(); }, LEAVE_MS);
      };
      listen(showList, 'click', () => { state.view = 'list'; render(); });

      const guided = Boolean(global.GuidedTracingPad && global.StrokeLetters?.supports(entry.word));
      root.dataset.guided = String(guided);
      function showProgress(progress) {
        if (!progress) return;
        const index = Math.min([...entry.word].length - 1, progress.glyphIndex || 0);
        for (const [i, letter] of [...wordLabel.children].entries()) {
          letter.classList.toggle('is-current', !progress.complete && i === index);
          letter.classList.toggle('is-written', progress.complete || i < index);
        }
        const label = progress.complete ? '다 썼다! 확인해 보자!' : `${index + 1} / ${[...entry.word].length} 글자`;
        if (progressText.textContent !== label) progressText.textContent = label;
        stage.dataset.strokeIndex = String(progress.strokeIndex);
        stage.dataset.strokeProgress = String(progress.progress);
      }
      const factory = guided ? global.GuidedTracingPad : global.TracingPad;
      const pad = factory ? factory.create(canvas, { text: entry.word, owner, onProgress: showProgress }) : null;
      showProgress(pad?.progress);
      replay.disabled = !guided;
      cleanups.push(() => pad?.destroy());
      listen(replay, 'click', () => {
        if (!pad?.replay) return;
        pad.setEraser(false);
        clear.classList.remove('is-on');
        clear.setAttribute('aria-pressed', 'false');
        say('');
        pad.replay();
      });
      listen(clear, 'click', () => {
        if (!pad) return;
        // 지우개 켜기/끄기: 켜면 문지른 곳의 획만 지워진다(2026-11-13 사용자: 통째 지우기 말고 지우개).
        pad.setEraser(!pad.eraser);
        clear.classList.toggle('is-on', pad.eraser);
        clear.setAttribute('aria-pressed', String(pad.eraser));
        say('');
      });
      listen(complete, 'click', () => {
        if (!pad) return;
        if (!pad.strokes) { say(pickMessage('empty'), 'hint'); return; }
        if (pad.score().pass) {
          if (!done.has(entry.id)) { done.add(entry.id); saveDone(browser, done, owner); }
          // onPass 는 { counted, capped, reveal } 를 돌려준다(옛 방식: 선물 장면 함수 하나). 세지 않은 통과(오늘 쓴 낱말·오늘 선물 끝)는 칸을 그대로 둔다.
          const result = typeof onPass === 'function' ? onPass(entry) : null;
          const reveal = typeof result === 'function' ? result : typeof result?.reveal === 'function' ? result.reveal : null;
          const gift = Boolean(reveal);
          const counted = typeof result === 'function' || Boolean(result?.counted);
          if (counted) paintBalls(true, gift);
          say(pickMessage(gift ? 'reward' : result?.capped ? 'rest' : 'praise'), 'correct', true);
          stamp(counted, cleanups);
          if (typeof onFeedback === 'function') onFeedback('correct');
          complete.disabled = true;
          clear.disabled = true;
          later(nextWord, NEXT_WORD_DELAY);
          if (gift) {
            browser.clearTimeout(revealTimer);
            revealTimer = browser.setTimeout(reveal, NEXT_WORD_DELAY);
          }
          return;
        }
        say(pickMessage('retry'), 'wrong');
        shake();
        if (typeof onFeedback === 'function') onFeedback('wrong');
        later(() => pad.clear(), RETRY_DELAY / 2);
      });
      // 화면 크기가 바뀌면 연습장을 새 크기로 다시 그린다(쓰던 획은 상대 위치로 옮겨 그대로 둔다).
      if (pad && typeof browser.ResizeObserver === 'function') {
        const first = canvas.getBoundingClientRect();
        let width = first.width, height = first.height;
        const observer = new browser.ResizeObserver(() => {
          const bounds = canvas.getBoundingClientRect();
          if (Math.abs(bounds.width - width) < 2 && Math.abs(bounds.height - height) < 2) return;
          width = bounds.width; height = bounds.height;
          pad.resize();
        });
        observer.observe(canvas);
        cleanups.push(() => observer.disconnect());
      }
    }

    render();
    // 들어오면 약간 어두운 반투명 바탕에 흰 글씨 「글자를 써 보자!」가 잠깐 떴다가 사라지며 쓰기 화면이 드러난다(2026-11-13 사용자).
    // 누르는 것을 막지 않아 바로 써도 된다. 모션 줄이기에서는 움직임 없이 같은 시간만 보인다(wordbook.css).
    const intro = node('div', 'wordbook-intro');
    intro.setAttribute('role', 'status');
    const introIcon = node('span', 'ui-icon icon-pencil');
    introIcon.setAttribute('aria-hidden', 'true');
    intro.append(introIcon, node('p', 'wordbook-intro-text', '글자를 써 보자!'));
    // 화면을 다시 그려도(탭·다음 낱말) 지워지지 않게 연습장 바깥(container)에 둔다.
    container.append(intro);
    const introTimer = browser.setTimeout(() => intro.remove(), INTRO_MS);
    return {
      // 목록을 보는 중이면 쓰기 화면으로 돌아가고 true, 쓰기 화면이면 false(바깥 화면이 처음으로 보낸다).
      back() {
        if (destroyed || state.view !== 'list') return false;
        state.view = 'write';
        render();
        return true;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        browser.clearTimeout(revealTimer);
        browser.clearTimeout(introTimer);
        intro.remove();
        cleanupView();
        root.remove();
      }
    };
  }

  // 처음부터 다시 하기(game.js startOver): 그 계정의 다 쓴 낱말 표시를 지운다.
  function forget(owner) {
    try { global.localStorage?.removeItem(doneKey(owner)); } catch (error) { /* 저장소가 막혀 있으면 지울 것도 없다 */ }
  }

  global.Wordbook = Object.freeze({ mount, practiceWords, forget });
})(typeof window === 'undefined' ? globalThis : window);
