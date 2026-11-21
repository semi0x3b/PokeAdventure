/* 배틀 화면 출력(순수 함수)과 배틀 멘트 목록. 장면은 항상 화면 전체를 쓰고, 문제는 장면 위에 뜨는 팝업으로만 보인다.
   흐름: 전체 장면 → 문제 팝업 → 답 선택 → 팝업 닫힘 → 장면에서 공격·피격과 HP 변화 → 다음 팝업.
   공개 뒤 첫 문제 전에는 같은 자리에 「어떻게 잡을까?」(공격하기·먹이 주기) 팝업이 한 번 뜬다(대표 포켓몬이 있을 때만).
   등장(공개)·잡았다·도망은 HP 칸 없이 장면 전체에 포켓몬을 크게 두고 한 줄만 보인다.
   카메라(확대·축소)는 data-camera 값으로 정하고, 바꾸는 시점은 game.js·AdventureMotion 이 맡는다. */
(function (root) {
  'use strict';
  const PHASES = ['silhouette', 'reveal', 'question', 'capture', 'throwing', 'caught', 'fled'];
  const REGIONS = ['forest', 'city', 'desert', 'sea'];
  const CAMERAS = ['wide', 'enemy', 'attack', 'hit', 'ball'];
  const AREAS = ['math', 'korean', 'english', 'creative'];
  // 화면 수치는 양쪽 모두 300 만점. 규칙(하트 3개·문제 수)은 그대로 두고 표시만 환산한다.
  const HP_MAX = 300;

  // ── 멘트: 상황마다 짧은 반말 몇 가지 중 하나(직전과 같은 문장은 피한다). 이름이 들어가는 것은 조사를 맞춘다. ──
  function josa(name, pair) { return root.PokemonText ? root.PokemonText.josa(name, pair) : name; }
  // 받침이 있으면 '이다/이었어/이야', 없으면 '다/였어/야'. 받침 판별은 PokemonText.josa 와 같은 기준.
  function batchim(name) { return root.PokemonText ? josa(name, '이/가').slice(String(name).length) === '이' : false; }
  const COPULA = { 다: ['이다', '다'], 였어: ['이었어', '였어'], 야: ['이야', '야'] };
  function copula(name, form) { return name + COPULA[form][batchim(name) ? 0 : 1]; }
  const LINES = Object.freeze({
    correct: ['효과가 굉장했다!', '정답! 멋진 공격!', '맞았어! 최고야!', '딩동댕! 정답!', '와! 한 방에 맞혔어!'],
    lastQuestion: ['마지막 문제야!', '하나만 더 맞히자!', '거의 다 왔어!', '이제 한 문제 남았어!'],
    captureReady: ['좋아! 이제 잡을 수 있어!', '지금이야! 친구로 맞이하자!'],
    firstMiss: ['앗, 아깝다!', '괜찮아, 다시 해 보자!', '음… 다른 걸 골라 볼까?', '조금만 더 생각해 봐!', '힌트를 보고 다시!'],
    hit: [name => `${name}의 공격!`, () => '앗, 맞았다!', () => '으앗! 힘내!', name => `${name}의 반격이다!`, () => '아야! 다시 해 보자!'],
    // 우리 편이 트레이너뿐일 때(튜토리얼 첫 배틀)·먹이 주기: 몸으로 부딪히지 않고 라즈베리를 던져 마음을 연다(2026-11-13 사용자, 그림은 PokeAPI razz-berry).
    // 이름은 「라즈베리」(2026-11-15 사용자 「라즈 열매 대신 라즈베리로 바꿔줘」).
    befriend: [() => '라즈베리를 던져 줬다!', name => `${josa(name, '이/가')} 라즈베리를 냠냠 먹었다!`, name => `${josa(name, '이/가')} 조금 다가왔다!`, () => '마음이 조금 열렸어!'],
    shy: [name => `${josa(name, '이/가')} 고개를 홱 돌렸다!`, () => '아직 부끄러운가 봐…', name => `${josa(name, '이/가')} 찌릿! 경계한다!`, () => '천천히 다시 해 보자!'],
    reveal: [name => `${copula(name, '다')}!`, name => `${copula(name, '였어')}!`, name => `바로 ${copula(name, '야')}!`, name => `정답! ${name}!`],
    goldReveal: [name => `반짝반짝 ${name}!`, name => `빛나는 ${copula(name, '다')}!`, name => `와! 특별한 ${name}!`, name => `반짝! ${copula(name, '다')}!`],
    throw: ['가랏! 몬스터볼!', '던져라! 몬스터볼!', '잡아라! 몬스터볼!', '간다! 몬스터볼!'],
    caught: ['잡았다!', '신난다! 잡았다!', '해냈다!', '친구가 됐다!'],
    // 아이가 직접 「도망치자」를 눌렀을 때(2026-11-13 사용자: 잡고 싶지 않은 포켓몬은 도망).
    runAway: [() => '무사히 도망쳤다!', () => '다음에 또 만나자!', () => '휴, 도망 성공!', () => '안녕, 또 만나자!'],
    fled: [name => `${josa(name, '은/는')} 도망쳐 버렸다…`, () => '앗, 도망갔다…', name => `${josa(name, '이/가')} 숨어 버렸다…`, () => '다음에 또 만나자!']
  });
  const lastPicked = {};
  function line(kind, name = '', random = Math.random) {
    const options = LINES[kind];
    if (!options) return '';
    let index = Math.min(options.length - 1, Math.floor(random() * options.length));
    if (options.length > 1 && index === lastPicked[kind]) index = (index + 1) % options.length;
    lastPicked[kind] = index;
    const chosen = options[index];
    return typeof chosen === 'function' ? chosen(String(name)) : chosen;
  }

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }
  function text(value) { return escape(value).replace(/&lt;br\s*\/?&gt;/gi, '<br>'); }
  function bounded(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.trunc(number))) : fallback;
  }
  function imageUrl(value, fallback) {
    if (typeof value !== 'string' || !value.trim() || /^(?:javascript|data|vbscript):/i.test(value.trim())) return fallback;
    return value;
  }
  // 남은 HP 200 이하는 노랑, 100 이하는 빨강 막대.
  function hpTone(points) { return points <= 100 ? ' hp-low' : points <= 200 ? ' hp-mid' : ''; }
  function status(side, name, points, label) {
    const share = points / HP_MAX;
    return `<div class="gb-status gb-status--${side}" data-hp="${Math.round(points / 100)}"><div class="gb-name">${name}</div>` +
      `<div class="gb-hp-line"><div class="gb-hp gb-hp--${side}${hpTone(points)}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuenow="${points}" aria-valuemax="${HP_MAX}">` +
      `<span class="gb-hp-fill" style="--hp-scale:${Number(share.toFixed(4))}"></span></div><strong class="gb-hp-number">HP ${points}/${HP_MAX}</strong></div></div>`;
  }
  // 「먹이 주기」로 잡을 때 상대 칸: HP 가 줄어드는 대신 「마음」 막대가 0 에서 차오른다(맞힌 문제 수/전체, 다 맞히면 가득).
  // 막대 색은 하나(css/battle-view.css .gb-hp--heart). 바 이름이 .gb-hp--enemy 가 아니라서 HP 애니메이션·시험이 HP 로 읽지 않는다.
  function heartStatus(name, points) {
    return `<div class="gb-status gb-status--enemy gb-status--heart"><div class="gb-name">${name}</div>` +
      `<div class="gb-hp-line"><div class="gb-hp gb-hp--heart" role="progressbar" aria-label="야생 포켓몬의 마음" aria-valuemin="0" aria-valuenow="${points}" aria-valuemax="${HP_MAX}">` +
      `<span class="gb-hp-fill" style="--hp-scale:${Number((points / HP_MAX).toFixed(4))}"></span></div><strong class="gb-hp-number">마음 ${points}/${HP_MAX}</strong></div></div>`;
  }
  // 「어떻게 잡을까?」 선택(2026-11-14 사용자 「그림자 맞춘 다음에 공격으로 잡을지 먹이로 잡을지 선택」): 공개 뒤 첫 문제 전에 한 번.
  // 그림 버튼 둘 — 공격하기는 공격할 때 실제로 터지는 노란 타격 그림(js/adventure-motion.js 정답 타격과 같은 그림, 2026-11-14 사용자 「공격하기는 그림을 바꿔줘」 —
  // 예전에는 대표 포켓몬 3D 앞모습), 먹이 주기는 라즈열매(PokeAPI 아이템 그림, 튜토리얼 열매와 같은 그림).
  // 문제 보기(.gb-answer)가 아니다: 시험·키보드 1~4 가 문제 보기로 보지 않게 따로 이름을 쓴다(키보드는 1·2).
  const BERRY = root.PokemonAssets.berry();
  const HIT = 'img/battle/fx-hit-correct.webp';
  const METHODS = [['attack', '공격하기', HIT, 'is-hit'], ['feed', '먹이 주기', BERRY, 'is-berry']];
  function methodPopup(stay) {
    const buttons = METHODS.map(([value, label, picture, kind], index) => `<button class="gb-method-button" type="button" data-method="${value}" aria-keyshortcuts="${index + 1}">` +
      `<span class="gb-method-no" aria-hidden="true">${index + 1}</span>` +
      `<img class="gb-method-picture ${kind}" src="${picture}" alt="" draggable="false">` +
      `<span class="gb-method-label">${label}</span></button>`).join('');
    return `<div class="gb-popup gb-method${stay ? ' is-static' : ''}" role="dialog" aria-modal="true" aria-labelledby="gb-method-title">` +
      `<div class="gb-card gb-method-card"><div class="gb-ask"><span class="gb-area"><span class="gb-tag-ball" aria-hidden="true"></span></span>` +
      `<h1 id="gb-method-title" class="gb-method-title">어떻게 잡을까?</h1></div>` +
      `<div class="gb-choices"><div class="gb-methods">${buttons}</div></div></div></div>`;
  }
  // 포획 별: 볼에서 사방으로 흩어진다(각자 방향 --dx/--dy).
  const STAR_PATHS = [[-1, -.8], [1, -.9], [-1.3, .1], [1.3, 0], [-.6, -1.3], [.6, -1.35]];
  // 금색 볼 등장의 큰 반짝임 자리(장면 %, 시작 시각).
  const GRADE_LABELS = { basic: '일반', advanced: '고급', rare: '희귀', legend: '전설' };
  function gradeLine(pokemon) {
    const label = GRADE_LABELS[root.GameRules?.grade?.(pokemon)];
    return label ? `<p class="gb-result-grade" data-grade="${root.GameRules.grade(pokemon)}">${label} 포켓몬</p>` : '';
  }
  function render(props) {
    const input = props || {};
    const battle = input.battle || {};
    const pokemon = battle.pokemon || {};
    const phase = PHASES.includes(battle.phase) ? battle.phase : 'silhouette';
    const region = REGIONS.includes(input.region) ? input.region : 'forest';
    const camera = CAMERAS.includes(input.camera) ? input.camera : 'wide';
    const id = bounded(pokemon.id, 1, 493, 1);
    const hearts = bounded(battle.hearts, 0, 3, 3);
    const total = bounded(battle.total, 1, 4, 2);
    const index = bounded(battle.index, 0, total, 0);
    const ownPoints = hearts * 100;
    // 상대 HP는 남은 문제 비율. 다 맞혀도 1은 남겨 볼을 던질 차례임을 보인다.
    const enemyPoints = Math.max(1, Math.round((total - index) / total * HP_MAX));
    // 먹이 주기(battle.method 'feed')의 마음은 맞힌 문제 비율(0 에서 시작, 다 맞히면 300).
    const feeding = battle.method === 'feed';
    const heartPoints = Math.round(index / total * HP_MAX);
    const hidden = phase === 'silhouette';
    const silhouette = hidden || (phase === 'reveal' && input.revealing === true);
    const own = input.companion && typeof input.companion === 'object' ? input.companion : null;
    const ownId = own ? bounded(own.id, 1, 493, 1) : null;
    // choosing: 첫 문제 전 「어떻게 잡을까?」 팝업. 대표 포켓몬이 있을 때만(트레이너뿐이면 묻지 않고 열매) 문제 팝업 대신 뜬다.
    const choosing = phase === 'question' && input.choosing === true && input.scene !== true && Boolean(own);
    const asking = ['silhouette', 'question'].includes(phase) && input.popup === true && input.scene !== true && !choosing;
    const ending = ['caught', 'fled'].includes(phase) && input.scene !== true;
    const ownName = own ? own.name || '내 포켓몬' : input.userName || '트레이너';
    const backUrl = own ? imageUrl(own.backUrl, root.PokemonAssets.image(ownId, 'back')) : '';
    const wildName = hidden ? '???' : escape(pokemon.name || '야생 포켓몬');
    const controls = typeof input.controls === 'string' ? input.controls : '';
    const artwork = typeof input.artwork === 'string' ? input.artwork : '';
    const area = AREAS.includes(input.area) ? input.area : '';
    const ownArt = own
      ? `<img class="gb-own-pokemon" src="${escape(backUrl)}" alt="${escape(ownName)}의 뒷모습" draggable="false">`
      : `<span class="gb-trainer" role="img" aria-label="${escape(ownName)}의 뒷모습"></span>`;
    const ball = ['throwing', 'caught'].includes(phase)
      ? `<div class="gb-throw" aria-hidden="true"><span class="gb-throw-shadow"></span><span class="gb-throw-ball"></span><span class="gb-throw-stars">${STAR_PATHS.map(([x, y]) => `<span class="gb-star" style="--dx:${x};--dy:${y}"></span>`).join('')}</span></div>` : '';
    const flee = phase === 'fled' ? '<img class="gb-flee-smoke" src="img/battle/fx-hit-wrong.webp" alt="" aria-hidden="true">' : '';
    // 등장 순간의 위쪽 이름표(볼 표시 + 이름).
    // 공개 때 이름은 가운데 「정답! ○○!」 한 번만(위 이름표와 두 번 겹쳐 보였다, 2026-11-13 사용자).
    const tag = '';
    const callout = ['reveal', 'fled'].includes(phase) && input.heading && input.scene !== true ? `<p class="gb-callout" role="status">${text(input.heading)}</p>` : '';
    // 긴 문제(30자 넘음): 가로 폰에서 글씨를 한 단계 줄여 창 안에 들어오게 한다(css/battle-view.css .gb-question.is-long).
    const longAsk = String(input.heading || '').replace(/<br\s*\/?>/gi, '').length > 30;
    const popup = asking ? `<div class="gb-popup${input.stay ? ' is-static' : ''}" role="dialog" aria-modal="true" aria-labelledby="gb-question">` +
      `<div class="gb-card${artwork ? ' has-art' : ''}${input.trace ? ' is-trace' : ''}"><div class="gb-ask">` +
      `<button class="gb-area gb-read-question" type="button" data-action="read-question" aria-label="문제 다시 듣기"${input.soundEnabled === false ? ' disabled' : ''}><span class="ui-icon icon-sound-on" aria-hidden="true"></span></button>` +
      `<h1 id="gb-question" class="gb-question${longAsk ? ' is-long' : ''}"${input.questionId == null ? '' : ` data-question-id="${escape(input.questionId)}"`}>${text(input.heading)}</h1>` +
      `${artwork ? `<div class="gb-art">${artwork}</div>` : ''}${input.hint ? `<p class="gb-hint" role="status"><span class="ui-icon icon-hint" aria-hidden="true"></span><span>${escape(input.hint)}</span></p>` : ''}</div>` +
      `<div class="gb-choices">${controls}</div></div></div>` : '';
    // 잡았다: 어두워진 장면 위 가운데 세로 카드(위·아래 빨강 띠), 맨 위 큰 이름 + 한 줄 + 큰 포켓몬 + 버튼 하나.
    const result = ending && phase === 'caught' ? `<div class="gb-result" role="dialog" aria-modal="true" aria-labelledby="gb-result-title"><div class="gb-result-card">` +
      `<img class="gb-caught-star gb-caught-star--left" src="img/art/icons/star.png" alt="" aria-hidden="true"><img class="gb-caught-star gb-caught-star--right" src="img/art/icons/star.png" alt="" aria-hidden="true">` +
      // 맨 위 「○○ 포켓몬」(등급, 2026-11-13 사용자: 「의」 없이) → 큰 이름 → 축하 한 줄(2026-11-13 사용자: 1·3줄 같은 크기, 1·2줄 사이를 더 좁게).
      `<div class="gb-result-head">${gradeLine(pokemon)}<p class="gb-result-name">${escape(pokemon.name || '')}</p></div>` +
      `<p id="gb-result-title" class="gb-result-title" role="status">${text(input.heading)}</p>` +
      `<div class="gb-result-art"><span class="gb-ground" aria-hidden="true"></span><img class="gb-result-pokemon" src="${root.PokemonAssets.image(id)}" alt="${escape(pokemon.name || '잡은 포켓몬')}" draggable="false"></div>` +
      `<div class="gb-result-actions">${controls}</div></div></div>` : '';
    // 도망치자: 잡고 싶지 않을 때 나가는 길. 던지기 전(그림자·공개·문제)에만, 튜토리얼 첫 배틀에는 없다.
    const runAway = ['silhouette', 'reveal', 'question'].includes(phase) && !battle.tutorial
      ? '<button class="gb-run-away" type="button" data-action="run-away" aria-label="도망치자"><span class="ui-icon icon-back" aria-hidden="true"></span></button>' : '';
    // 설정(2026-11-14 사용자 「배틀에서도 옵션 바꾸게 해줘」): 배틀은 위쪽 막대(설정 버튼)가 숨으므로 장면 안 오른쪽 위에 같은 모서리 버튼을 둔다.
    // 설정은 항상 오른쪽 위, 도망 아이콘은 왼쪽 위다. 누르면 지금 설정 창(game.js settingsModal)을 연다.
    // 던지기 연출(capture·throwing) 동안은 숨긴다: 도망치자·HP 칸도 숨는 몇 초짜리 절정 장면이라 창이 덮지 않게.
    const settings = ['silhouette', 'reveal', 'question', 'caught', 'fled'].includes(phase)
      ? '<button class="corner-button gb-settings" type="button" data-action="settings" aria-label="설정"><span class="ui-icon icon-settings" aria-hidden="true"></span></button>' : '';
    const corner = settings || runAway ? `<div class="gb-corner">${runAway}${settings}</div>` : '';
    const dock = ending && phase === 'fled' ? `<div class="gb-dock">${controls}</div>` : '';
    // 키에 따른 그림 크기(core.js bodySize, 0.5~1). 상대·우리 편 칸 크기에 곱한다(css/battle-view.css). 트레이너는 1.
    const bodySize = value => Number((root.GameRules?.bodySize?.(value) ?? 1).toFixed(3));
    const sizes = `--gb-enemy-size:${bodySize(id)}` + (own ? `;--gb-own-size:${bodySize(ownId)}` : '');
    return `<section class="go-battle${battle.gold ? ' is-gold' : ''}" style="${sizes}" data-phase="${phase}" data-camera="${camera}" data-region="${region}">` +
      `<div class="gb-stage">${typeof input.ambient === 'string' ? input.ambient : ''}<div class="gb-enemy"><span class="gb-ground" aria-hidden="true"></span>` +
      `<img class="gb-pokemon${silhouette ? ' silhouette' : ''}" src="${root.PokemonAssets.image(id)}" alt="${hidden ? '이름을 맞혀 볼 포켓몬 그림자' : escape(pokemon.name || '야생 포켓몬')}" draggable="false"></div>` +
      `<div class="gb-own"><span class="gb-ground" aria-hidden="true"></span>${ownArt}</div>${ball}${flee}</div>` +
      (feeding ? heartStatus(wildName, heartPoints) : status('enemy', wildName, enemyPoints, '야생 포켓몬의 남은 HP')) + status('own', escape(ownName), ownPoints, '우리 편의 남은 HP') +
      tag + callout + popup + (choosing ? methodPopup(input.stay === true) : '') + result + dock + corner + '</section>';
  }
  root.BattleView = Object.freeze({ render, line, LINES, HP_MAX });
})(window);
