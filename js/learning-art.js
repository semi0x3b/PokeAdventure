// 학습 문제의 그림 문자를 그림으로 바꾼다. 원본 데이터와 DOM은 수정하지 않는다.
// 문제 그림은 한 그림체(ARASAAC 픽토그램, img/learn/<번호>.webp)로 통일한다. 낱말 → 번호 표는 js/data/learn-pictures.js 의
// window.LEARN_PICTURES(이 파일보다 먼저 읽는다). 표에 없는 낱말만 예전 8×8 그림판 칸으로 대신한다.
(function (global) {
  'use strict';

  const pictures = [
    ['🍎', '사과'], ['🍌', '바나나'], ['🍇', '포도'], ['🍉', '수박'],
    ['🍓', '딸기'], ['🐶', '강아지'], ['🐱', '고양이'], ['🐰', '토끼'],
    ['🐘', '코끼리'], ['🦒', '기린'], ['🐸', '개구리'], ['🦋', '나비'],
    ['🐝', '벌'], ['🐢', '거북이'], ['🚗', '자동차'], ['✈', '비행기'],
    ['🚲', '자전거'], ['🚂', '기차'], ['🌳', '나무'], ['🌻', '해바라기'],
    ['☂', '우산'], ['👟', '신발'], ['🎈', '풍선'], ['📚', '책'],
    ['🍊', '오렌지'], ['🍋', '레몬'], ['🍑', '복숭아'], ['🐷', '돼지'],
    ['🐮', '소'], ['🐴', '말'], ['🐑', '양'], ['🐻', '곰'],
    ['🦁', '사자'], ['🐯', '호랑이'], ['🐟', '물고기'], ['🐦', '새'],
    ['🦆', '오리'], ['🐜', '개미'], ['☀', '해'], ['🌙', '달'],
    ['⭐', '별'], ['🌸', '꽃'], ['🚌', '버스'], ['⛵', '돛단배'],
    ['📖', '책'], ['✏', '연필'], ['🎩', '모자'], ['🛏', '침대'],
    ['🪑', '의자'], ['⚽', '공'], ['🥛', '우유'], ['🥚', '달걀'],
    ['🍞', '빵'], ['🧀', '치즈'], ['🍰', '케이크'], ['🍕', '피자'],
    ['🧦', '양말']
  ];
  const cells = new Map(pictures.map(([symbol, name], index) => [symbol, { name, index }]));
  const escapedCharacters = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const decoration = /[\uFE0E\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}]/u;
  const unsupportedEmoji = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

  // 평면 도형 그림(Codex, img/art/shapes/<모양>-<색>.png). 수학 도형 문제의 ‘빨간 세모’ 같은 이름을 그림으로 바꾼다.
  const SHAPE_FILES = { '동그라미': 'circle', '세모': 'triangle', '네모': 'square', '긴 네모': 'rectangle', '별': 'star', '하트': 'heart', '마름모': 'diamond', '오각형': 'pentagon' };
  const COLOR_FILES = { '빨간': 'red', '파란': 'blue', '노란': 'yellow', '초록': 'green' };
  const own = (table, key) => Object.prototype.hasOwnProperty.call(table, key);
  function shapePicture(word) {
    const text = String(word == null ? '' : word).trim();
    const space = text.indexOf(' ');
    const color = text.slice(0, space), shape = text.slice(space + 1);
    return space > 0 && own(COLOR_FILES, color) && own(SHAPE_FILES, shape) ? `img/art/shapes/${SHAPE_FILES[shape]}-${COLOR_FILES[color]}.png` : null;
  }
  // 크기 규칙(‘작은 공, 큰 공’): 낱말 앞 ‘작은 ’·‘큰 ’은 같은 그림을 작게·크게 보인다는 뜻이라 뒤 낱말의 그림을 쓴다.
  const SIZE_PREFIX = /^(작은|큰) /;
  // 낱말 → 그림 주소. 그림이 없으면 null. 문제 그림과 보기 그림이 모두 이 함수 하나로 찾는다.
  function picture(word) {
    const table = global.LEARN_PICTURES;
    const key = String(word == null ? '' : word).trim();
    const tableId = name => table && name && own(table, name) ? table[name] : null;
    const id = tableId(key) || tableId(key.replace(SIZE_PREFIX, ''));
    return Number.isInteger(id) && id > 0 ? `img/learn/${id}.webp` : shapePicture(key);
  }
  // ‘작은 ’으로 시작하고 그림이 있는 낱말. 그림을 작게 그린다(큰 것은 보통 크기).
  const isSmall = word => /^작은 /.test(String(word == null ? '' : word).trim()) && Boolean(picture(word));
  // 그림만 보이는 값(수학 같다·다르다): ‘pokemon:25’(PokeAPI 3D 앞모습)·‘learn:사과’(ARASAAC)·‘shape:빨간 세모’(도형).
  // 같은 그림 여러 장은 ‘#1’·‘#2’ 로만 구별한다(같은 파일·같은 크기). 그림 값이 아니거나 그림이 없으면 null.
  const PICTURE_TOKEN = /^(pokemon|learn|shape):([^#]+)(?:#\d+)?$/;
  function tokenPicture(value) {
    const match = PICTURE_TOKEN.exec(String(value == null ? '' : value));
    if (!match) return null;
    const [, kind, key] = match;
    if (kind === 'pokemon') return /^\d+$/.test(key) && Number(key) >= 1 && Number(key) <= 493 ? global.PokemonAssets.image(Number(key)) : null;
    return kind === 'shape' ? shapePicture(key) : picture(key);
  }
  // 보기 네 개의 그림. 하나라도 없으면 null(그림과 글자만인 보기가 섞이면 어색하므로 모두 글자로 둔다).
  // shapesOnly: 문제에 이미 그림이 있으면 낱말 그림은 붙이지 않고(답이 드러남) 도형 보기만 그림으로 고르게 한다.
  // 색 없는 모양 이름만인 보기(‘동그라미, 네모, 별, 하트’)는 모두 같은 색 도형 그림으로 맞춘다(별만 낱말 그림이면 섞인다).
  // 그림 값 보기(‘pokemon:25’ 등)는 그림 자체가 보기라 언제나 그림.
  function optionPictures(options, { shapesOnly = false } = {}) {
    if (!Array.isArray(options) || !options.length) return null;
    if (options.every(tokenPicture)) return options.map(tokenPicture);
    if (!shapesOnly && options.every(option => own(SHAPE_FILES, option))) return options.map(option => shapePicture(`파란 ${option}`));
    const sources = options.map(shapesOnly ? shapePicture : picture);
    return sources.every(Boolean) ? sources : null;
  }
  // 도형 그림 한 칸. 그림이 안 불러와져도 이름(답)이 글자로 보이지 않게 alt 는 ‘모양’으로만 둔다.
  const shapeImage = source => `<img class="learning-picture learning-shape" src="${source}" alt="모양" draggable="false">`;
  const escapeText = text => String(text).replace(/[&<>"']/g, character => escapedCharacters[character]);
  // 그림 줄의 한 칸: 도형은 이름을 숨기고, 낱말 그림은 낱말을 alt 로. ‘작은 ’ 낱말은 작게.
  function itemImage(item) {
    const shape = shapePicture(item);
    if (shape) return shapeImage(shape);
    return `<img class="learning-picture${isSmall(item) ? ' learning-small' : ''}" src="${picture(item)}" alt="${escapeText(item)}" draggable="false">`;
  }
  // ‘빨간 세모’ 하나, 또는 쉼표로 늘어놓은 그림 줄(‘빨간 세모, 파란 네모, ?’·‘사과, 바나나, ?’·‘작은 공, 큰 공, ?’, ?는 빈칸).
  // 낱말 하나(‘수박’ 등 받침 문제)는 글자로 보여 주는 문제라 그림으로 바꾸지 않는다.
  function sequenceHtml(value) {
    const items = String(value).split(', ');
    if (items.length === 1) return shapePicture(items[0]) ? shapeImage(shapePicture(items[0])) : null;
    if (!items.every(item => item === '?' || picture(item)) || !items.some(item => item !== '?')) return null;
    const cells = items.map(item => item === '?' ? '<span class="learning-blank" aria-label="빈칸">?</span>' : itemImage(item));
    return `<span class="learning-sequence" style="--cells:${items.length}">${cells.join('')}</span>`;
  }

  function html(value) {
    if (value === null || value === undefined) return '';
    // 그림 값 하나(같다·다르다 문제 그림). 이름이 답의 실마리가 되지 않게 alt 는 ‘그림’만.
    const token = tokenPicture(value);
    if (token) return `<img class="learning-picture" src="${token}" alt="그림" draggable="false">`;
    const sequence = sequenceHtml(value);
    if (sequence) return sequence;
    let output = '';
    for (const character of String(value)) {
      // 같은 그림의 텍스트/이모지 표시 선택자는 셀 판별에 영향을 주지 않는다.
      if (decoration.test(character)) continue;
      const cell = cells.get(character);
      const source = cell ? picture(cell.name) : null;
      if (source) {
        output += `<img class="learning-picture" src="${source}" alt="${cell.name}" draggable="false">`;
      } else if (cell) {
        const x = Number((cell.index % 8 / 7 * 100).toFixed(6));
        const y = Number((Math.floor(cell.index / 8) / 7 * 100).toFixed(6));
        output += `<span class="learning-picture" role="img" aria-label="${cell.name}" style="background-position:${x}% ${y}%"></span>`;
      } else if (unsupportedEmoji.test(character)) {
        // 새 문제가 추가되어 아직 그림이 없더라도 기기별 이모지를 다시 노출하지 않는다.
        output += '<span class="learning-picture-unavailable" role="img" aria-label="그림">그림</span>';
      } else {
        // 숫자·알파벳·일반 문자는 보존하되 HTML에 넣기 전에 반드시 이스케이프한다.
        output += escapedCharacters[character] || character;
      }
    }
    return output;
  }

  // 셈 그림(낱개·10개 묶음)에 그릴 것. 문제마다 한 가지(문제 id 로 고정)라 한 문제 안에서는 모두 같다. 문장에는 그림 이름이 없다.
  // ‘몇 개’로 묻는 문제는 물건(몬스터볼·낱말 그림)만 — 포켓몬은 ‘마리’라 문장과 어긋난다. 그 밖(덧셈·뺄셈 등)은 도트 포켓몬도.
  // 도트 포켓몬: 필드 동행 걷기 그림(js/data/field-sprites.js)의 앞모습 첫 칸을 잘라 쓴다(새 그림 없음, 2026-11-13 사용자).
  const COUNT_POKEMON = [25, 1, 4, 7, 133, 39, 52, 54, 175, 152, 155, 158, 255, 258, 387, 393, 183, 216];
  // 몬스터볼은 CSS 기본 낱개 그림(battle-view.css .gb-count i)이라 따로 바꾸지 않는다(null).
  const COUNT_THINGS = ['몬스터볼', '사과', '딸기', '공', '귤'];
  // CSS 변수 속 url() 은 그 변수를 쓰는 스타일시트(css/) 기준으로 풀려 그림을 못 찾는다. 화면에서는 문서 기준 전체 주소로 바꾼다.
  const fullUrl = source => `url('${global.document?.baseURI ? new URL(source, global.document.baseURI).href : source}')`;
  function spriteArt(id) {
    const walk = global.FIELD_SPRITES?.[id]?.walk;
    const row = walk?.directionRows?.down;
    const bounds = walk?.frameGeometry?.[row]?.[0]?.bounds;
    const source = global.PokemonAssets.sprite(walk);
    if (!source || !Array.isArray(bounds)) return null;
    // 몸(bounds)을 감싸는 정사각형. 칸 밖(옆 칸 그림)이 비치지 않게 칸 안으로 당긴다.
    const [x, y, width, height] = bounds;
    const side = Math.min(walk.frameWidth, walk.frameHeight, Math.max(width, height) + 2);
    const inside = (start, limit) => Math.max(0, Math.min(limit - side, Math.round(start)));
    const left = inside(x + width / 2 - side / 2, walk.frameWidth);
    const top = row * walk.frameHeight + inside(y + height / 2 - side / 2, walk.frameHeight);
    // 값은 낱개 크기(--ball) 한 칸을 1로 본 비율. 크기는 그린 뒤 game.js fitCounting 이 정한다.
    return { className: 'is-sprite', style: `--count-art:${fullUrl(source)};--count-sheet-w:${walk.sheetWidth / side};--count-sheet-h:${walk.sheetHeight / side};--count-x:${left / side};--count-y:${top / side}` };
  }
  function wordArt(word) {
    const source = picture(word);
    return source ? { className: 'is-learn', style: `--count-art:${fullUrl(source)}` } : null;
  }
  function countingArt(question) {
    const prompt = String(question?.prompt || '');
    const pool = [...(/몇 개/.test(prompt) ? [] : COUNT_POKEMON), ...COUNT_THINGS];
    const number = Number(String(question?.id || '').replace(/\D/g, '')) || 0;
    const choice = pool[number % pool.length];
    if (choice === '몬스터볼') return null;
    return typeof choice === 'number' ? spriteArt(choice) : wordArt(choice);
  }

  // 가르기는 두 무더기와 빈칸으로 표시한다. 큰 수의 10개는 그림 하나 + ‘10’ 상자로 줄여
  // 100까지도 그림 백 개를 빽빽하게 그리지 않는다. 구할 무더기의 합계 숫자는 노출하지 않는다.
  function splittingHtml({ left, right }, question) {
    const bundled = left + right > 20;
    const balls = count => '<i></i>'.repeat(count);
    const block = count => {
      const tens = Math.floor(count / 10), ones = count % 10;
      const ten = bundled ? '<span class="learning-ten"><i></i><b>10</b></span>' : `<span class="gb-ten">${balls(10)}</span>`;
      const packs = tens ? `<span class="gb-count-packs" style="--columns:${Math.min(3, tens)}">${ten.repeat(tens)}</span>` : '';
      const singles = ones ? `<span class="gb-count-ones" style="--columns:${Math.min(5, ones)}">${balls(ones)}</span>` : '';
      return `<span class="gb-count-block">${packs}${singles}</span>`;
    };
    const art = countingArt(question);
    return `<div class="gb-count gb-count--large${art ? ' ' + art.className : ''}"${art ? ` style="${art.style}"` : ''} aria-hidden="true"><span class="gb-count-part">${block(left)}</span><span class="gb-count-part is-unknown"><b class="gb-count-mark">?</b>${block(right)}</span></div>`;
  }

  global.LearningArt = Object.freeze({ html, picture, optionPictures, shapePicture, isSmall, countingArt, tokenPicture, splittingHtml });
})(typeof window === 'undefined' ? globalThis : window);
