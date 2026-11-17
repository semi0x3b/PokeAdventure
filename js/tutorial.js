/* 처음 온 아이(잡은 포켓몬 0마리)의 튜토리얼: 설명 카드 3장 → 숲에서 피카츄와 첫 배틀 → 잡으면 지역 고르기.
   잡은 포켓몬이 3마리가 되면 한 번 「같이 다닐 친구」 카드 한 장 → 도감 파트너 칸으로(판단·도감 이동·칸 반짝임은 game.js).
   이 파일은 카드 화면과 캐릭터 고르기 장면만 그린다. 들어가는 길(지역 고르기 대신 여기로)과 첫 배틀은 game.js 가 맡는다.
   새 저장 필드는 없다. 서버가 상태 필드를 검사하므로 caught 가 비었는지로만 판단한다. */
(function (root) {
  'use strict';
  const STARTER = 25;
  // 첫 배틀의 그림자 퀴즈 팝업 아래 한 줄. 사용자는 멘트가 많은 걸 싫어해서 배틀 안내는 이것뿐이다.
  // 그림은 기존 아이콘(img/art/icons)과 게임 속 몬스터볼 그림만 쓴다.
  const CARDS = Object.freeze([
    { title: '포켓몬 세계에 온 걸 환영해!', text: '들판을 걸으며 몬스터볼을 찾아보자', art: '<span class="ui-icon icon-map" aria-hidden="true"></span>' },
    { title: '몬스터볼에 닿으면\n포켓몬이 나타나!', text: '문제를 맞히면 잡을 수 있어', art: '<img src="img/art/balls/ball-red.png" alt="" draggable="false">' },
    { title: '첫 친구는 피카츄야!', text: '피카츄를 만나러 가 볼까?', art: '<span class="ui-icon icon-partner" aria-hidden="true"></span>' },
  ]);
  // 같이 다닐 친구 카드: 아이콘은 도감 파트너 칸 이름표와 같은 icon-partner 라 카드와 칸이 이어져 보인다.
  const PARTY_CARD = Object.freeze({ title: '같이 다닐 친구를 골라 볼까?', text: '두 마리까지 함께 모험할 수 있어', art: '<span class="ui-icon icon-partner" aria-hidden="true"></span>' });
  // 난이도 올리기 제안 카드(game.js levelGuide): 연속 10번 틀림 없이 끝냈을 때. 큰 글씨 한 줄 + 짧은 한 줄 + 버튼 둘(주·보조).
  const LEVEL_CARD = Object.freeze({ title: '문제가 쉬웠나 봐!', text: '더 어려운 문제에 도전해 볼까?', art: '<img src="img/art/icons/star.png" alt="" draggable="false">' });
  function needed(storage) {
    return Boolean(storage && storage.user) && !(storage.state && storage.state.caught && storage.state.caught.length);
  }
  function screen(attributes, top, card, label, actions = '') {
    return `<section class="tutorial-screen is-entering" ${attributes}>` +
      '<div class="title-backdrop" aria-hidden="true"></div><span class="title-cloud title-cloud--one" aria-hidden="true"></span><span class="title-cloud title-cloud--two" aria-hidden="true"></span>' +
      `<div class="tutorial-layout">${top}` +
      `<div class="tutorial-card pop" style="--order:1" role="status"><span class="tutorial-art">${card.art}</span><h2 class="tutorial-title">${card.title}</h2><p class="tutorial-text">${card.text}</p></div>` +
      (actions || `<button class="button tutorial-next pop" style="--order:2" data-tutorial-next>${label}<span class="ui-icon icon-play" aria-hidden="true"></span></button>`) +
      '</div></section>';
  }
  function pokemonImage(pokemon, extra = '') {
    return `<img src="${root.PokemonAssets.image(pokemon.id)}" alt="${pokemon.name}" role="button" tabindex="0" data-cry="${pokemon.id}" aria-label="${pokemon.name} 울음소리 듣기" draggable="false"${extra}>`;
  }
  function render(step) {
    const top = `<div class="tutorial-pikachu pop" style="--order:0">${pokemonImage({ id: STARTER, name: '피카츄' })}</div>`;
    return screen(`data-step="${step + 1}"`, top, CARDS[step], '다음');
  }
  // pokemon: 잡은 포켓몬 셋({id, name}). 3D 앞모습을 나란히 놓고 차례로 통통 뛴다.
  function renderParty(pokemon) {
    const trio = pokemon.map((p, index) => pokemonImage(p, ` style="--hop:${index}"`)).join('');
    return screen('data-guide="party"', `<div class="tutorial-trio pop" style="--order:0">${trio}</div>`, PARTY_CARD, '좋아!');
  }
  // pokemon: 같이 다니는(없으면 피카츄) 포켓몬 하나. 버튼: 「어려운 문제로 바꾸기」(주)·「지금이 좋아」(보조).
  function renderLevel(pokemon) {
    const top = `<div class="tutorial-pikachu pop" style="--order:0">${pokemonImage(pokemon || { id: STARTER, name: '피카츄' })}</div>`;
    const actions = '<div class="tutorial-actions pop" style="--order:2">' +
      '<button class="button tutorial-next" data-level-harder>어려운 문제로 바꾸기</button>' +
      '<button class="button secondary tutorial-next is-secondary" data-level-keep>지금이 좋아</button></div>';
    return screen('data-guide="level"', top, LEVEL_CARD, '', actions);
  }
  function spoken(card) { return card.title.replace(/\n/g, ' ') + ' ' + card.text; }
  // read(문장): 카드가 바뀔 때마다 부른다(읽을지는 game.js 가 설정을 보고 정한다). onDone: 셋째 카드의 「다음」에서 한 번만.
  // 장면은 처음 한 번만 그리고, 「다음」에서는 카드 안 그림·글만 바꾼다. 배경·구름·피카츄·버튼은 같은 노드 그대로라
  // 등장 연출(.is-entering .pop)이 다시 돌지 않는다(2026-11-14 사용자 「화면 계속 깜빡이는데 대화 내용 나오는 부분만 바뀌게 게임처럼」).
  function mount(main, { read = () => {}, onDone = () => {} } = {}) {
    let step = 0;
    let finished = false;
    main.innerHTML = render(step);
    const section = main.querySelector('.tutorial-screen');
    const next = main.querySelector('[data-tutorial-next]');
    function show() {
      const card = CARDS[step];
      section.dataset.step = String(step + 1);
      section.querySelector('.tutorial-art').innerHTML = card.art;
      section.querySelector('.tutorial-title').textContent = card.title;
      section.querySelector('.tutorial-text').textContent = card.text;
      read(spoken(card));
    }
    next.addEventListener('click', () => {
      if (finished) return;
      if (step < CARDS.length - 1) { step++; show(); return; }
      finished = true;
      onDone();
    });
    next.focus({ preventScroll: true });
    show();
  }
  // 같이 다닐 친구 카드 한 장. onDone: 「좋아!」에서 한 번만.
  function mountParty(main, { pokemon = [], read = () => {}, onDone = () => {} } = {}) {
    main.innerHTML = renderParty(pokemon);
    const next = main.querySelector('[data-tutorial-next]');
    let finished = false;
    next.addEventListener('click', () => {
      if (finished) return;
      finished = true;
      onDone();
    });
    next.focus({ preventScroll: true });
    read(spoken(PARTY_CARD));
  }
  // onHarder·onKeep: 둘 중 한 번만 불린다.
  function mountLevel(main, { pokemon = null, read = () => {}, onHarder = () => {}, onKeep = () => {} } = {}) {
    main.innerHTML = renderLevel(pokemon);
    let finished = false;
    const once = action => () => { if (finished) return; finished = true; action(); };
    main.querySelector('[data-level-harder]').addEventListener('click', once(onHarder));
    main.querySelector('[data-level-keep]').addEventListener('click', once(onKeep));
    main.querySelector('[data-level-harder]').focus({ preventScroll: true });
    read(spoken(LEVEL_CARD));
  }
  // 캐릭터 고르기(2026-11-14 사용자 「피카츄 잡을 때 캐릭터 남자 여자 두 벌 고를 수 있게」): 셋째 카드 뒤, 숲 배틀 전.
  // 글 대신 두 캐릭터 앞모습을 크게 놓고 누르면 고른다(말은 음성 안내 trainerPick). 고른 값(settings.trainerLook)은 game.js 가 저장한다.
  const LOOKS = Object.freeze([{ id: 'boy', name: '남자' }, { id: 'girl', name: '여자' }]);
  function renderPick() {
    const choices = LOOKS.map((look, index) =>
      `<button class="tutorial-look pop" style="--order:${index + 1}" data-tutorial-look="${look.id}" aria-label="${look.name} 캐릭터">` +
      `<img src="img/art/trainer-front-${look.id}.webp" alt="" draggable="false"><span>${look.name}</span></button>`).join('');
    return '<section class="tutorial-screen is-entering" data-guide="look">' +
      '<div class="title-backdrop" aria-hidden="true"></div><span class="title-cloud title-cloud--one" aria-hidden="true"></span><span class="title-cloud title-cloud--two" aria-hidden="true"></span>' +
      `<div class="tutorial-pick"><h2 class="tutorial-pick-title pop" style="--order:0">같이 모험할 캐릭터를 골라 줘!</h2><div class="tutorial-looks">${choices}</div></div></section>`;
  }
  // onPick('boy' | 'girl'): 처음 누른 한 번만.
  function mountPick(main, { onPick = () => {} } = {}) {
    main.innerHTML = renderPick();
    let picked = false;
    for (const look of LOOKS) {
      main.querySelector(`[data-tutorial-look="${look.id}"]`).addEventListener('click', () => {
        if (picked) return;
        picked = true;
        onPick(look.id);
      });
    }
  }
  root.Tutorial = Object.freeze({ STARTER, CARDS, PARTY_CARD, LEVEL_CARD, LOOKS, needed, render, renderParty, renderLevel, renderPick, mount, mountParty, mountLevel, mountPick });
})(window);
