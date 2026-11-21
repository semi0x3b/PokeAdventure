// 5~7세 학습 문제. 데이터는 script 태그로 불러오며 네트워크 요청이 필요 없다.
(function () {
  'use strict';
  const questions = [];
  const counts = { math: 0, korean: 0, english: 0, creative: 0 };

  // extra.silentOptions: 문제 읽기(js/narration.js)가 보기를 읽지 않는다. 보기를 소리로 들으면 답이 드러나는 문제
  // (자음·모음·알파벳·글자·받침·첫 글자·통글자·같은 모양·그림 고르기, 2026-11-13 사용자: 「자음 모음 알파벳 같은 문제는 보기를 안 읽어야해」).
  function add(area, difficulty, prompt, answer, distractors, extra = {}) {
    const sequence = ++counts[area];
    const options = [String(answer), ...distractors.map(String)];
    // 첫 보기만 정답이 되는 일이 없도록 정답 위치를 고르게 섞는다.
    const offset = sequence % 4;
    questions.push({
      id: `${area}-${String(sequence).padStart(3, '0')}`,
      area,
      difficulty,
      prompt,
      ...extra,
      // 따라 쓰기는 보기를 고르지 않고 쓴 글씨를 채점하므로 보기가 없다.
      options: extra.trace ? [] : options.slice(offset).concat(options.slice(0, offset)),
      answer: String(answer)
    });
  }

  // 목록에서 정답 다음 칸들을 건너뛰며 고른 오답 세 개.
  const neighbors = (list, index, steps) => steps.map(step => list[(index + step) % list.length]);
  let distractorTurn = 0;
  function numberDistractors(answer) {
    // 정답이 보기 중 몇 번째로 큰 수인지가 문제마다 달라지도록, 정답보다 작은 보기 수를 0~3개로 돌린다.
    const smallerCount = distractorTurn++ % 4;
    const result = [];
    for (let step = 1; result.length < smallerCount && answer - step >= 0; step++) result.push(answer - step);
    for (let step = 1; result.length < 3 && answer + step <= 100; step++) result.push(answer + step);
    for (let step = 1; result.length < 3; step++) {
      if (!result.includes(answer - step)) result.push(answer - step);
    }
    return result;
  }

  // 수학은 수 범위(5·10·20·50·100)로 단계를 나눈다. 모든 셈에 세어 볼 그림(문제마다 도트 포켓몬·물건, js/learning-art.js countingArt)이 있고, 10개는 한 묶음으로 그린다.
  // 그림 종류가 문제마다 달라 문장에는 그림 이름(몬스터볼 등)을 쓰지 않는다(2026-11-13 Aside QA).
  const MATH_LEVELS = [5, 10, 20, 50, 100];
  function mathLevel(largest) { return MATH_LEVELS.find(limit => largest <= limit); }
  function addMath(a, b, minus) {
    const answer = minus ? a - b : a + b;
    const largest = Math.max(a, b, answer);
    const bundled = Math.max(a, b) >= 10;
    const hint = minus
      ? (bundled ? '왼쪽 그림에서 오른쪽 그림만큼 덜어 내자. 10개 묶음부터!' : '왼쪽 그림에서 오른쪽 그림만큼 덜어 내 보자!')
      : (bundled ? '묶음 하나는 10개야. 묶음부터 세어 보자!' : '그림을 하나씩 세어 보자!');
    add('math', largest <= 10 ? 1 : 2, `${a} ${minus ? '−' : '+'} ${b} = 얼마일까요?`, answer, numberDistractors(answer), {
      kind: minus ? 'subtract' : 'add', level: mathLevel(largest), counting: { left: a, right: b, minus }, hint
    });
  }
  for (let count = 1; count <= 10; count++) {
    add('math', 1, '모두 몇 개일까요?', count, numberDistractors(count), {
      kind: 'count', level: mathLevel(count), counting: { left: count, right: 0, minus: false }, hint: '손가락으로 하나씩 짚으며 세어 보자!'
    });
  }
  // 20까지는 모든 셈, 그보다 큰 수는 한 자리 수나 몇십을 더하고 빼는 셈만 낸다.
  const friendly = (largest, b) => largest <= 20 || b <= 9 || b % 10 === 0;
  for (let a = 1; a <= 99; a++) {
    for (let b = 1; a + b <= 100; b++) if (friendly(a + b, b)) addMath(a, b, false);
  }
  for (let a = 2; a <= 100; a++) {
    for (let b = 1; b < a; b++) if (friendly(a, b)) addMath(a, b, true);
  }

  // 수학 유형(kind): 몇 개(count)·덧셈(add)·뺄셈(subtract)에 더해 팩토 킨더·소마셈 K단계(5~7세) 구성을 참고한
  // 수 크기 비교(compare)·수 순서(order)·수 규칙(pattern)·가르기(split)·10 만들기(make)·도형(shape).
  // pick 은 한 판 안에서 유형부터 고르게 고른다. 수 범위 단계(level)는 문제에 나오는 가장 큰 수로 정한다.
  const ballPicture = total => ({ counting: { left: total, right: 0, minus: false } });
  // 숫자 뒤 조사. 마지막 자리 이름(영·일·삼·육·칠·팔·십·백)에 받침이 있으면 앞의 것(PokemonText.josa 와 같은 규칙).
  function numberWithJosa(number, withBatchim, withoutBatchim) {
    return `${number}${'013678'.includes(String(number).at(-1)) ? withBatchim : withoutBatchim}`;
  }
  const mathDifficulty = largest => largest <= 10 ? 1 : 2;
  // 정답보다 작은 보기가 below 개가 되도록 고른 오답 세 개(정답이 보기 중 몇 번째로 큰 수인지를 문제마다 돌린다).
  // trap 은 꼭 넣는다. 정답에서 unit 씩 떨어진 수부터, 0~100.
  let rankTurn = 0;
  function rankedDistractors(answer, trap, below, unit = 1) {
    // trap 이 없거나 정답과 같거나 0~100 밖이면 넣지 않는다(4는 2와 몇 → 정답도 2).
    const result = Number.isInteger(trap) && trap !== answer && trap >= 0 && trap <= 100 ? [trap] : [];
    const smaller = [], larger = [];
    for (let distance = unit; distance <= 100; distance += unit) {
      if (answer - distance >= 0 && answer - distance !== trap) smaller.push(answer - distance);
      if (answer + distance <= 100 && answer + distance !== trap) larger.push(answer + distance);
    }
    const wantSmaller = Math.min(3 - result.length, Math.max(0, below - (result.length && trap < answer ? 1 : 0)));
    result.push(...smaller.slice(0, wantSmaller));
    result.push(...larger.slice(0, 3 - result.length));
    result.push(...smaller.slice(wantSmaller, wantSmaller + 3 - result.length));
    return result;
  }

  // 수 크기 비교: 두 무더기를 나란히 그려(사이에 기호 없음) 더 많은·적은 쪽이 몇 개인지 고른다.
  // 20까지는 1~4개 차이, 그보다 큰 수는 10개 묶음 하나 차이·낱개 3개 차이로 묶음과 낱개를 견주게 한다.
  for (let big = 2; big <= 100; big++) {
    for (const gap of big <= 20 ? [1, 2, 3, 4] : [10, 3]) {
      const small = big - gap;
      if (small < 1) continue;
      const [left, right] = (big + gap) % 2 ? [big, small] : [small, big];
      const shared = { kind: 'compare', level: mathLevel(big), counting: { left, right, minus: false, versus: true }, hint: big >= 10 ? '묶음 상자부터 세어 보고, 낱개를 세어 보자!' : '양쪽을 하나씩 세어 보자!' };
      // 다른 쪽 무더기 수는 꼭 오답에 넣고, 정답이 보기 중 몇 번째로 큰 수인지는 돌려 가며 정한다
      // (더 많은 쪽은 가장 작은 수일 수 없고, 더 적은 쪽은 가장 큰 수일 수 없다).
      add('math', mathDifficulty(big), '더 많은 쪽은 몇 개일까요?', big, rankedDistractors(big, small, 1 + rankTurn++ % 3), shared);
      add('math', mathDifficulty(big), '더 적은 쪽은 몇 개일까요?', small, rankedDistractors(small, big, rankTurn++ % 3), shared);
    }
  }

  // 수 순서: 바로 뒤의 수·바로 앞의 수·두 수 사이의 수. 20까지는 주어진 수만큼 그림을 그린다.
  for (let number = 1; number <= 99; number++) {
    const next = number + 1;
    add('math', mathDifficulty(next), `${number} 바로 뒤의 수는 뭘까요?`, next, rankedDistractors(next, number, 1 + number % 3), {
      kind: 'order', level: mathLevel(next), ...(number <= 20 ? ballPicture(number) : {}), hint: '하나 더 많은 수야. 하나 더 세어 보자!'
    });
    add('math', mathDifficulty(next), `${next} 바로 앞의 수는 뭘까요?`, number, rankedDistractors(number, next, (number + 1) % 3), {
      kind: 'order', level: mathLevel(next), ...(next <= 20 ? ballPicture(next) : {}), hint: '하나 더 적은 수야. 하나 빼고 세어 보자!'
    });
    if (number + 2 <= 100) {
      add('math', mathDifficulty(number + 2), `${numberWithJosa(number, '과', '와')} ${number + 2} 사이의 수는 뭘까요?`, next, rankedDistractors(next, number + 2, (number + 2) % 3), {
        kind: 'order', level: mathLevel(number + 2), hint: '작은 수부터 차례로 세어 보자!'
      });
    }
  }

  // 수 규칙(뛰어 세기): 일정하게 커지거나 작아지는 네 수 다음에 올 수. 수 범위마다 알맞은 뛰는 크기만 낸다.
  const PATTERN_STEPS = { 5: [1, -1], 10: [1, -1, 2, -2], 20: [1, 2, -2, 5], 50: [2, 5, 10, -10], 100: [5, 10, -5, -10] };
  for (const step of [1, -1, 2, -2, 5, -5, 10, -10]) {
    for (let start = 0; start <= 100; start++) {
      // 5씩 뛰기는 0·5·10… 에서만 시작한다(7, 12, 17… 은 5~7세에게 낯설다).
      if (Math.abs(step) === 5 && start % 5) continue;
      const terms = [0, 1, 2, 3].map(index => start + step * index);
      const answer = start + step * 4;
      const largest = Math.max(start, answer);
      if (Math.min(start, answer) < 0 || largest > 100) continue;
      const level = mathLevel(largest);
      if (!PATTERN_STEPS[level].includes(step)) continue;
      // 마지막 수를 그대로 고르는 실수를 오답에 넣고, 나머지 오답도 같은 크기로 뛴 수라 규칙을 알아야 고른다.
      const below = (step > 0 ? 1 : 0) + start % 3;
      add('math', mathDifficulty(largest), `${terms.join(', ')} 다음에 올 수는 뭘까요?`, answer, rankedDistractors(answer, terms[3], below, Math.abs(step)), {
        kind: 'pattern', level, hint: step > 0 ? '수가 얼마씩 커지는지 살펴보자!' : '수가 얼마씩 작아지는지 살펴보자!'
      });
    }
  }

  // 가르기: 10까지는 모든 양수 조합, 20까지는 10과 몇. 그림은 알려 준 무더기와 ? 무더기로 나눈다.
  // 오답도 선택한 수 범위 안에서 고른다. 힌트에는 구할 수나 같은 수를 직접 적지 않는다.
  function addSplitting(total, part) {
    const answer = total - part;
    const level = mathLevel(total);
    const distractors = rankedDistractors(answer, part, rankTurn++ % 4).filter(value => value <= level);
    for (let value = 0; distractors.length < 3; value++) {
      if (value !== answer && !distractors.includes(value)) distractors.push(value);
    }
    add('math', mathDifficulty(total), `${numberWithJosa(total, '을', '를')} ${numberWithJosa(part, '과', '와')} 몇으로 나눌까요?`, answer, distractors, {
      kind: 'split', level, counting: { left: part, right: answer, minus: false, split: true },
      hint: total > 20 ? '한 묶음은 열 개예요. 빈칸 쪽을 세어 보세요!' : '빈칸이 있는 무더기를 하나씩 세어 보세요!'
    });
  }
  for (let total = 2; total <= 20; total++) {
    const parts = total <= 10 ? Array.from({ length: total - 1 }, (_, index) => index + 1) : [...new Set([10, total - 10])];
    for (const part of parts) addSplitting(total, part);
  }
  for (let total = 21; total <= 100; total++) {
    const tens = Math.floor(total / 10);
    const ones = total % 10;
    add('math', 2, `${total}개에는 10개 묶음이 몇 개 있을까요?`, tens, rankedDistractors(tens, ones, rankTurn++ % 4), {
      kind: 'split', level: mathLevel(total), ...ballPicture(total), hint: '네모 상자 하나가 10개 묶음이야. 상자만 세어 보자!'
    });
    if (!ones) continue;
    add('math', 2, `${total}개에서 묶음 밖의 낱개는 몇 개일까요?`, ones, rankedDistractors(ones, tens, rankTurn++ % 4), {
      kind: 'split', level: mathLevel(total), ...ballPicture(total), hint: '상자 밖에 따로 있는 것만 세어 보자!'
    });
  }

  // 10 만들기: 지금 있는 그림에 몇을 더하면 5·10·20·다음 몇십이 되는지.
  const makeTargets = [];
  for (let have = 1; have <= 4; have++) makeTargets.push([have, 5]);
  for (let have = 1; have <= 9; have++) makeTargets.push([have, 10]);
  for (let have = 11; have <= 19; have++) makeTargets.push([have, 20]);
  for (let have = 21; have <= 99; have++) if (have % 10) makeTargets.push([have, Math.ceil(have / 10) * 10]);
  for (const [have, target] of makeTargets) {
    const answer = target - have;
    add('math', mathDifficulty(target), `${have}에 몇을 더하면 ${numberWithJosa(target, '이', '가')} 될까요?`, answer, rankedDistractors(answer, undefined, rankTurn++ % 4), {
      kind: 'make', level: mathLevel(target), ...ballPicture(have), hint: `${target}까지 하나씩 더 세어 보자!`
    });
  }

  // 도형: 평면 도형 그림(img/art/shapes/<모양>-<색>.png, Codex 그림)을 js/learning-art.js 가 ‘빨간 세모’ 같은 이름으로 찾는다.
  // 수 범위와 상관없는 문제라 단계(level) 없이 쉬움·도전으로 고른다. 그림 이름은 화면에 글자로 나오지 않는다.
  const SHAPES = [['동그라미', 0], ['세모', 3], ['네모', 4], ['긴 네모', 4], ['별', null], ['하트', null], ['마름모', 4], ['오각형', 5]];
  const SHAPE_NAMES = SHAPES.map(([name]) => name);
  const SHAPE_COLORS = ['빨간', '파란', '노란', '초록'];
  const EASY_SHAPES = ['동그라미', '세모', '네모', '별', '하트'];
  // 네모와 긴 네모는 아이에게 같은 ‘네모’라 한 문제의 보기에 함께 두지 않는다.
  const sameFamily = (first, second) => first.endsWith('네모') && second.endsWith('네모');
  const shapeHint = '뾰족한 곳과 곧은 선을 살펴보자!';
  SHAPES.forEach(([shape, corners], shapeIndex) => {
    SHAPE_COLORS.forEach((color, colorIndex) => {
      const visual = `${color} ${shape}`;
      // 이름: 긴 네모도 ‘네모’라 이름 문제에서는 뺀다.
      if (shape !== '긴 네모') {
        const easy = EASY_SHAPES.includes(shape);
        const pool = (easy ? EASY_SHAPES : SHAPE_NAMES.filter(name => name !== '긴 네모')).filter(name => name !== shape);
        add('math', easy ? 1 : 2, '이 모양의 이름은 뭘까요?', shape, neighbors(pool, colorIndex, [0, 1, 2]), { kind: 'shape', visual, hint: shapeHint });
      }
      // 꼭짓점·곧은 선 수: 별·하트는 아이마다 세는 법이 달라 뺀다.
      if (corners !== null) {
        add('math', 2, '이 모양에서 뾰족한 곳은 몇 개일까요?', corners, rankedDistractors(corners, corners + 1, rankTurn++ % 4), { kind: 'shape', visual, hint: '뾰족한 곳을 손가락으로 짚으며 세어 보자!' });
        add('math', 2, '이 모양에서 곧은 선은 몇 개일까요?', corners, rankedDistractors(corners, corners - 1, rankTurn++ % 4), { kind: 'shape', visual, hint: '곧은 선을 하나씩 따라가며 세어 보자!' });
      }
      // 같은 모양 찾기: 정답은 색만 다른 같은 모양, 오답은 문제와 같은 색의 다른 모양(색에 끌리지 않고 모양을 보게).
      const otherColor = SHAPE_COLORS[(colorIndex + 1) % SHAPE_COLORS.length];
      const lures = SHAPE_NAMES.filter(name => name !== shape && !sameFamily(name, shape));
      add('math', 1, '이 모양과 같은 모양은 뭘까요?', `${otherColor} ${shape}`, neighbors(lures, shapeIndex + colorIndex, [0, 2, 4]).map(name => `${color} ${name}`), {
        kind: 'shape', visual, hint: '색은 달라도 모양이 같으면 돼!', silentOptions: true
      });
    });
  });
  // 모양 규칙: AB·AAB·ABB·ABC 로 늘어놓은 모양 다음에 올 모양. 모양마다 색도 달라 구별하기 쉽다.
  const SHAPE_PATTERNS = [['AB', [0, 1, 0, 1], 0], ['AAB', [0, 0, 1, 0, 0], 1], ['ABB', [0, 1, 1, 0, 1], 1], ['ABC', [0, 1, 2, 0, 1], 2]];
  SHAPE_NAMES.forEach((_, shapeIndex) => {
    SHAPE_PATTERNS.forEach(([name, order, answerIndex], patternIndex) => {
      const shapeAt = offset => SHAPE_NAMES[(shapeIndex + offset) % SHAPE_NAMES.length];
      const items = [shapeAt(0), shapeAt(3), shapeAt(5), shapeAt(6)]
        .map((shape, index) => `${SHAPE_COLORS[(shapeIndex + patternIndex + index) % SHAPE_COLORS.length]} ${shape}`);
      const answer = items[answerIndex];
      add('math', name === 'AB' ? 1 : 2, '다음에 올 모양은 뭘까요?', answer, items.filter(item => item !== answer), {
        kind: 'shape', visual: [...order.map(index => items[index]), '?'].join(', '), hint: name === 'ABC' ? '세 가지 모양이 차례로 되풀이돼!' : '어떤 모양이 되풀이되는지 살펴보자!'
      });
    });
  });

  // 같다·다르다(2026-11-13 사용자: 「보기의 그림과 같은 그림·다른 그림을 골라 달라」). 문제 칸에 그림 하나, 보기 넷은 그림만.
  // 그림 값: ‘pokemon:25’(PokeAPI 3D 앞모습 img/model/front)·‘learn:사과’(ARASAAC)·‘shape:빨간 세모’(도형). 같은 그림 여러 장은
  // ‘#1’·‘#2’ 로만 구별해 같은 파일을 같은 크기로 그린다(js/learning-art.js tokenPicture). 정답 판정은 지금처럼 보기 문자열.
  // 같은 그림: 문제 그림과 같은 파일이 보기에 하나. 다른 그림: 문제 그림과 같은 파일 셋 + 다른 파일 하나(답).
  // 쉬움은 확 다른 그림, 도전은 닮은 그림(같은 진화 줄·같은 색·같은 모양). 포켓몬 위주(8), 낱말 그림(3)·도형(3)을 섞는다.
  const SAME_EASY_POKEMON = [25, 1, 4, 7, 39, 143, 92, 133, 175, 54];
  const SAME_LOOKALIKES = [
    [25, 26, 172, 417], [133, 134, 135, 136, 196, 470, 471], [1, 2, 152, 153], [4, 5, 155, 390],
    [7, 8, 258, 393], [39, 40, 174, 35], [183, 184, 298, 60]
  ];
  const SAME_EASY_WORDS = ['사과', '자동차', '고양이', '우산', '공', '책', '나무', '물고기'];
  const SAME_WORD_LOOKALIKES = [['사과', '토마토', '딸기', '복숭아'], ['귤', '오렌지', '레몬', '복숭아'], ['운동화', '실내화', '슬리퍼', '장화']];
  const pokemonPicture = id => `pokemon:${id}`, wordPicture = word => `learn:${word}`, shapeToken = shape => `shape:${shape}`;
  // [문제 그림, 다른 보기 셋] — 같은 그림 고르기.
  const findSame = [
    ...SAME_EASY_POKEMON.slice(0, 8).map((id, index) => [1, pokemonPicture(id), [1, 3, 5].map(step => pokemonPicture(SAME_EASY_POKEMON[(index + step) % SAME_EASY_POKEMON.length]))]),
    ...SAME_EASY_WORDS.slice(0, 3).map((word, index) => [1, wordPicture(word), [2, 4, 6].map(step => wordPicture(SAME_EASY_WORDS[(index + step) % SAME_EASY_WORDS.length]))]),
    [1, shapeToken('빨간 동그라미'), ['파란 세모', '노란 별', '초록 하트'].map(shapeToken)],
    [1, shapeToken('노란 별'), ['빨간 하트', '초록 세모', '파란 동그라미'].map(shapeToken)],
    [1, shapeToken('초록 하트'), ['노란 동그라미', '빨간 세모', '파란 별'].map(shapeToken)],
    // 도전: 닮은 무리에서 둘째 그림(진화 줄·같은 색)과 나머지 셋. 이브이 무리는 둘(둘째·다섯째).
    ...[...SAME_LOOKALIKES.map(group => group[1]), 196].map(id => {
      const group = SAME_LOOKALIKES.find(members => members.includes(id));
      return [2, pokemonPicture(id), group.filter(member => member !== id).slice(0, 3).map(pokemonPicture)];
    }),
    ...SAME_WORD_LOOKALIKES.map(group => [2, wordPicture(group[1]), group.filter((_, index) => index !== 1).map(wordPicture)]),
    // 도형 도전: 같은 모양 다른 색, 같은 색 닮은 모양이 섞인다.
    [2, shapeToken('빨간 세모'), ['파란 세모', '빨간 마름모', '노란 세모'].map(shapeToken)],
    [2, shapeToken('파란 네모'), ['파란 긴 네모', '초록 네모', '파란 마름모'].map(shapeToken)],
    [2, shapeToken('노란 오각형'), ['노란 동그라미', '빨간 오각형', '초록 오각형'].map(shapeToken)]
  ];
  // [문제 그림, 다른 그림 하나(답)] — 다른 그림 고르기. 보기는 문제 그림 셋 + 답.
  const findOdd = [
    ...SAME_EASY_POKEMON.slice(0, 8).map((id, index) => [1, pokemonPicture(id), pokemonPicture(SAME_EASY_POKEMON[(index + 5) % SAME_EASY_POKEMON.length])]),
    ...SAME_EASY_WORDS.slice(3, 6).map((word, index) => [1, wordPicture(word), wordPicture(SAME_EASY_WORDS[(index + 6) % SAME_EASY_WORDS.length])]),
    [1, shapeToken('파란 세모'), shapeToken('노란 하트')],
    [1, shapeToken('빨간 별'), shapeToken('초록 동그라미')],
    [1, shapeToken('노란 동그라미'), shapeToken('빨간 세모')],
    // 도전: 닮은 무리의 셋째·넷째(이브이 무리는 리피아·글레이시아도).
    ...[...SAME_LOOKALIKES.map(group => [group[2], group[3]]), [470, 471]].map(([id, odd]) => [2, pokemonPicture(id), pokemonPicture(odd)]),
    ...SAME_WORD_LOOKALIKES.map(group => [2, wordPicture(group[0]), wordPicture(group[1])]),
    [2, shapeToken('빨간 네모'), shapeToken('빨간 긴 네모')],
    [2, shapeToken('파란 별'), shapeToken('노란 별')],
    [2, shapeToken('초록 동그라미'), shapeToken('초록 오각형')]
  ];
  findSame.forEach(([difficulty, picture, others]) => add('math', difficulty, '이 그림과 똑같은 그림은 뭘까요?', picture, others, {
    kind: 'same', visual: picture, hint: '한 군데씩 꼼꼼히 견주어 보자!', silentOptions: true
  }));
  findOdd.forEach(([difficulty, picture, odd]) => add('math', difficulty, '이 그림과 다른 그림은 뭘까요?', odd, [1, 2, 3].map(copy => `${picture}#${copy}`), {
    kind: 'same', visual: picture, hint: '셋은 똑같아. 하나만 다른 곳이 있어!', silentOptions: true
  }));
  // 양쪽 수를 같게: 두 무더기(20까지, 1~4개 차이)에서 적은 쪽에 몇 개를 더 놓아야 같아지는지.
  for (let big = 2; big <= 20; big++) {
    for (const gap of [1, 2, 3, 4]) {
      const small = big - gap;
      if (small < 1) continue;
      const [left, right] = (big + gap) % 2 ? [big, small] : [small, big];
      add('math', mathDifficulty(big), '양쪽 수가 같아지려면 적은 쪽에 몇 개 더 놓아야 할까요?', gap, rankedDistractors(gap, null, rankTurn++ % 4), {
        kind: 'same', level: mathLevel(big), counting: { left, right, minus: false, versus: true }, hint: '양쪽을 하나씩 짝지어 보자. 짝이 없는 게 몇 개야?'
      });
    }
  }

  const wordPictures = [
    ['🍎', '사과', '바나나', '포도', '수박'], ['🍌', '바나나', '사과', '딸기', '배'],
    ['🍇', '포도', '수박', '귤', '복숭아'], ['🍉', '수박', '참외', '포도', '사과'],
    ['🍓', '딸기', '바나나', '수박', '감'], ['🐶', '강아지', '고양이', '토끼', '돼지'],
    ['🐱', '고양이', '강아지', '소', '양'], ['🐰', '토끼', '고양이', '말', '오리'],
    ['🐘', '코끼리', '기린', '사자', '호랑이'], ['🦒', '기린', '코끼리', '얼룩말', '곰'],
    ['🐸', '개구리', '물고기', '거북이', '달팽이'], ['🦋', '나비', '개미', '벌', '잠자리'],
    ['🐝', '벌', '나비', '무당벌레', '개미'], ['🐢', '거북이', '토끼', '물고기', '뱀'],
    ['🚗', '자동차', '비행기', '배', '기차'], ['✈️', '비행기', '자전거', '자동차', '배'],
    ['🚲', '자전거', '기차', '버스', '비행기'], ['🚂', '기차', '배', '자전거', '자동차'],
    ['🌳', '나무', '꽃', '풀', '돌'], ['🌻', '해바라기', '장미', '민들레', '튤립'],
    ['☂️', '우산', '모자', '가방', '신발'], ['👟', '신발', '장갑', '양말', '모자'],
    ['🎈', '풍선', '공', '인형', '로봇'], ['📚', '책', '연필', '가위', '시계']
  ];
  // 한글 단계: 1 자음, 2 모음, 3 글자(받침 없음), 4 받침 글자, 5 통글자, 6 낱말.
  const KOREAN_LEVELS = ['자음', '모음', '글자', '받침', '통글자', '낱말', '문장'];
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  function syllable(first, vowel, final = '') {
    return String.fromCharCode(0xAC00 + (CHO.indexOf(first) * 21 + JUNG.indexOf(vowel)) * 28 + JONG.indexOf(final));
  }

  const basicConsonants = [
    ['ㄱ', '기역'], ['ㄴ', '니은'], ['ㄷ', '디귿'], ['ㄹ', '리을'], ['ㅁ', '미음'], ['ㅂ', '비읍'], ['ㅅ', '시옷'],
    ['ㅇ', '이응'], ['ㅈ', '지읒'], ['ㅊ', '치읓'], ['ㅋ', '키읔'], ['ㅌ', '티읕'], ['ㅍ', '피읖'], ['ㅎ', '히읗']
  ];
  const consonantLetters = basicConsonants.map(([letter]) => letter);
  const consonantNames = basicConsonants.map(([, name]) => name);
  basicConsonants.forEach(([letter, name], index) => {
    add('korean', 1, `‘${name}’은 어느 글자일까요?`, letter, neighbors(consonantLetters, index, [1, 5, 9]), { level: 1, silentOptions: true });
    add('korean', 1, '이 글자의 이름은?', name, neighbors(consonantNames, index, [2, 6, 11]), { level: 1, visual: letter });
    add('korean', 1, `‘${syllable(letter, 'ㅏ')}’에 들어 있는 자음은?`, letter, neighbors(consonantLetters, index, [3, 7, 10]), { level: 1, visual: syllable(letter, 'ㅏ'), silentOptions: true });
  });

  const basicVowels = [['ㅏ', '아'], ['ㅑ', '야'], ['ㅓ', '어'], ['ㅕ', '여'], ['ㅗ', '오'], ['ㅛ', '요'], ['ㅜ', '우'], ['ㅠ', '유'], ['ㅡ', '으'], ['ㅣ', '이']];
  const vowelLetters = basicVowels.map(([letter]) => letter);
  const vowelSounds = basicVowels.map(([, sound]) => sound);
  basicVowels.forEach(([letter, sound], index) => {
    add('korean', 1, `‘${sound}’ 소리가 나는 글자는?`, letter, neighbors(vowelLetters, index, [1, 4, 7]), { level: 2, silentOptions: true });
    add('korean', 1, '이 글자는 어떤 소리가 날까요?', sound, neighbors(vowelSounds, index, [2, 5, 8]), { level: 2, visual: letter });
    for (const first of ['ㄴ', 'ㅁ']) {
      add('korean', 1, `‘${syllable(first, letter)}’에 들어 있는 모음은?`, letter, neighbors(vowelLetters, index, [3, 6, 9]), { level: 2, visual: syllable(first, letter), silentOptions: true });
    }
  });

  const easyVowels = ['ㅏ', 'ㅗ', 'ㅜ', 'ㅣ'];
  consonantLetters.forEach((first, index) => {
    easyVowels.forEach((vowel, vowelIndex) => {
      const answer = syllable(first, vowel);
      const others = [
        syllable(first, easyVowels[(vowelIndex + 1) % 4]),
        syllable(consonantLetters[(index + 3) % 14], vowel),
        syllable(consonantLetters[(index + 8) % 14], easyVowels[(vowelIndex + 2) % 4])
      ];
      add('korean', 1, `${first} + ${vowel} = 어떤 글자일까요?`, answer, others, { level: 3, silentOptions: true });
    });
    const spoken = syllable(first, 'ㅏ');
    add('korean', 1, `‘${spoken}’는 어느 글자일까요?`, spoken, neighbors(consonantLetters, index, [2, 6, 11]).map(other => syllable(other, 'ㅏ')), { level: 3, silentOptions: true });
  });

  const easyFinals = ['ㄱ', 'ㄴ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅇ'];
  ['ㄱ', 'ㄴ', 'ㄷ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ'].forEach(first => {
    const base = syllable(first, 'ㅏ');
    easyFinals.forEach((final, finalIndex) => {
      add('korean', 2, `${base} + ${final} = 어떤 글자일까요?`, syllable(first, 'ㅏ', final), neighbors(easyFinals, finalIndex, [1, 3, 4]).map(other => syllable(first, 'ㅏ', other)), { level: 4, silentOptions: true });
    });
  });

  wordPictures.forEach(([visual, answer, ...others]) => add('korean', 2, '이건 뭘까요?', answer, others, { visual, level: 5, silentOptions: true }));
  wordPictures.forEach(([visual, word], index) => {
    // 한 글자 낱말(벌·책)은 첫 글자가 낱말 자체라 묻지 않는다.
    if (word.length < 2) return;
    const others = neighbors(wordPictures, index, [5, 11, 17]).map(([, other]) => other[0]).filter(letter => letter !== word[0]);
    const spare = ['고', '마', '두', '치'].filter(letter => letter !== word[0] && !others.includes(letter));
    add('korean', 2, `‘${word}’의 첫 글자는?`, word[0], [...new Set(others), ...spare].slice(0, 3), { visual, level: 6, silentOptions: true });
  });

  const spellings = [
    ['하늘', '하눌', '허늘', '하닐'], ['나무', '너무', '나모', '누무'],
    ['바다', '버다', '바더', '바두'], ['토끼', '토기', '도끼', '토키'],
    ['사과', '사꽈', '사고', '서과'], ['우유', '우요', '오유', '유우'],
    ['모자', '모저', '무자', '모조'], ['가방', '가밧', '거방', '가뱅'],
    ['학교', '학고', '하교', '학쿄'], ['친구', '친고', '칭구', '친쿠'],
    ['연필', '연피', '염필', '연풀'], ['공책', '공첵', '곰책', '공채'],
    ['꽃', '꼿', '꼳', '꽂'], ['눈사람', '눈사랑', '눈서람', '눈사남'],
    ['수박', '수밥', '수팍', '수빡'], ['별', '벌', '볕', '벨'],
    ['장갑', '장감', '장갖', '장갚'], ['양말', '양마', '양망', '양멀'],
    ['달팽이', '달팡이', '달팽히', '달펭이'], ['병아리', '벙아리', '병아니', '병어리'],
    ['고구마', '고구머', '고쿠마', '거구마'], ['감자', '강자', '감저', '감쟈'],
    ['시계', '시게', '시개', '시께'], ['바람', '바랑', '버람', '바럼']
  ];
  spellings.forEach(([answer, ...others]) => add('korean', 2, `‘${answer}’${objectJosa(answer)} 똑같이 쓴 낱말은?`, answer, others, { level: 5, silentOptions: true }));

  const finalSounds = [
    ['곰', 'ㅁ'], ['산', 'ㄴ'], ['달', 'ㄹ'], ['밥', 'ㅂ'], ['책', 'ㄱ'], ['공', 'ㅇ'],
    ['문', 'ㄴ'], ['물', 'ㄹ'], ['봄', 'ㅁ'], ['집', 'ㅂ'], ['떡', 'ㄱ'], ['강', 'ㅇ'],
    ['별', 'ㄹ'], ['밤', 'ㅁ'], ['손', 'ㄴ'], ['옷', 'ㅅ'], ['꽃', 'ㅊ'], ['낮', 'ㅈ'],
    ['숲', 'ㅍ'], ['밭', 'ㅌ']
  ];
  const consonants = ['ㄱ', 'ㄴ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅌ', 'ㅍ'];
  finalSounds.forEach(([word, answer], index) => {
    const others = consonants.filter(c => c !== answer);
    const start = index % (others.length - 2);
    add('korean', 2, `‘${word}’의 받침은?`, answer, others.slice(start, start + 3), { level: 4, visual: word, silentOptions: true });
  });

  const koreanSentences = [
    ['금붕어는 어디에서 헤엄칠까요?', '물', '하늘', '모래', '불'],
    ['‘차갑다’와 반대인 낱말은?', '뜨겁다', '작다', '빠르다', '높다'],
    ['‘크다’와 반대인 낱말은?', '작다', '길다', '밝다', '무겁다'],
    ['‘길다’와 반대인 낱말은?', '짧다', '많다', '넓다', '깊다'],
    ['‘빠르다’와 반대인 낱말은?', '느리다', '가깝다', '높다', '무겁다'],
    ['‘밝다’와 반대인 낱말은?', '어둡다', '가볍다', '작다', '얇다'],
    ['‘높다’와 반대인 낱말은?', '낮다', '넓다', '길다', '뜨겁다'],
    ['‘많다’와 반대인 낱말은?', '적다', '크다', '예쁘다', '멀다'],
    ['‘무겁다’와 반대인 낱말은?', '가볍다', '느리다', '춥다', '어둡다'],
    ['‘열다’와 반대인 낱말은?', '닫다', '걷다', '먹다', '뛰다'],
    ['‘웃다’와 반대인 낱말은?', '울다', '앉다', '읽다', '자다'],
    ['‘앉다’와 반대인 낱말은?', '서다', '웃다', '보다', '듣다'],
    ['‘안’과 반대인 낱말은?', '밖', '위', '앞', '옆'],
    ['‘앞’과 반대인 낱말은?', '뒤', '위', '안', '옆'],
    ['‘위’와 반대인 낱말은?', '아래', '안', '뒤', '옆'],
    ['새는 하늘에서 어떻게 움직일까요?', '날아', '읽어', '먹어', '입어'],
    ['책을 볼 때 쓰는 말은?', '읽어', '입어', '신어', '마셔'],
    ['물을 먹을 때 쓰는 말은?', '마셔', '신어', '읽어', '입어'],
    ['옷을 몸에 걸칠 때 쓰는 말은?', '입어', '읽어', '마셔', '타'],
    ['신발에 발을 쏙 넣는 걸 뭐라고 할까요?', '신어', '먹어', '읽어', '씻어']
  ];
  koreanSentences.forEach(([prompt, answer, ...others]) => add('korean', 2, prompt, answer, others, { level: 6 }));

  const englishWords = [
    ['🍎', 'apple'], ['🍌', 'banana'], ['🍇', 'grape'], ['🍊', 'orange'], ['🍋', 'lemon'],
    ['🍓', 'strawberry'], ['🍉', 'watermelon'], ['🍑', 'peach'], ['🐱', 'cat'], ['🐶', 'dog'],
    ['🐷', 'pig'], ['🐮', 'cow'], ['🐴', 'horse'], ['🐑', 'sheep'], ['🐰', 'rabbit'],
    ['🐻', 'bear'], ['🦁', 'lion'], ['🐯', 'tiger'], ['🐘', 'elephant'], ['🦒', 'giraffe'],
    ['🐸', 'frog'], ['🐟', 'fish'], ['🐦', 'bird'], ['🦆', 'duck'], ['🐢', 'turtle'],
    ['🐜', 'ant'], ['🐝', 'bee'], ['🦋', 'butterfly'], ['☀️', 'sun'], ['🌙', 'moon'],
    ['⭐', 'star'], ['🌳', 'tree'], ['🌸', 'flower'], ['🚗', 'car'], ['🚌', 'bus'],
    ['🚂', 'train'], ['⛵', 'boat'], ['📖', 'book'], ['✏️', 'pencil'], ['🎩', 'hat'],
    ['🛏️', 'bed'], ['🪑', 'chair'], ['⚽', 'ball'], ['🥛', 'milk'], ['🥚', 'egg'],
    ['🍞', 'bread'], ['🧀', 'cheese'], ['🍰', 'cake'], ['🍕', 'pizza'], ['🧦', 'socks']
  ];
  englishWords.forEach(([visual, answer], index) => {
    const others = [1, 7, 17].map(offset => englishWords[(index + offset) % englishWords.length][1]);
    add('english', 2, '이건 영어로 뭘까요?', answer, others, { visual, level: 3 });
  });
  // 따라 쓰기: 옅게 보이는 글자 위를 손가락으로 따라 쓰고 채점한다(js/tracing.js). 보기는 없다.
  const TRACE_HINT = '연한 글자를 천천히 따라 써 보자!';
  // 목적격 조사. 한글은 받침, 영어는 마지막 글자 이름(엘·엠·엔·알만 받침)으로 고른다.
  function objectJosa(word) {
    const last = word.at(-1);
    const code = last.charCodeAt(0);
    const batchim = code >= 0xAC00 && code <= 0xD7A3 ? (code - 0xAC00) % 28 !== 0 : /[LMNR]/i.test(last);
    return batchim ? '을' : '를';
  }
  // 영어 단계: 1 알파벳, 2 파닉스(첫 글자), 3 단어.
  const ENGLISH_LEVELS = ['알파벳', '파닉스', '단어', '문장'];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  [...alphabet].forEach((letter, index) => {
    const lower = letter.toLowerCase();
    const otherLower = [1, 6, 11].map(offset => alphabet[(index + offset) % 26].toLowerCase());
    add('english', 1, `대문자 ${letter}의 소문자는?`, lower, otherLower, { visual: letter, level: 1, silentOptions: true });
    const otherUpper = [1, 8, 17].map(offset => alphabet[(index + offset) % 26]);
    add('english', 1, `${letter}${objectJosa(letter)} 따라 써 볼까?`, letter, [], { visual: letter, trace: letter, level: 1, hint: TRACE_HINT });
  });
  englishWords.forEach(([visual, word]) => {
    const answer = word[0].toUpperCase();
    const start = alphabet.indexOf(answer);
    // 소리가 같은 글자(cat 의 C 와 K, giraffe 의 G 와 J)는 듣고 고르면 정답이 둘이 되므로 오답에서 뺀다.
    const soundAlike = { C: 'K', K: 'C', G: 'J', J: 'G' }[answer];
    const others = [3, 8, 17, 5].map(offset => alphabet[(start + offset) % 26]).filter(letter => letter !== soundAlike).slice(0, 3);
    add('english', 2, `‘${word}’의 맨 앞 영어 글자는?`, answer, others, { visual, level: 2, silentOptions: true });
  });

  // 낱말 따라 쓰기: 영어는 2~4글자 단어(단어 단계), 한글은 1~2글자 낱말(1글자는 통글자, 2글자는 낱말 단계).
  englishWords.filter(([, word]) => word.length >= 2 && word.length <= 4).forEach(([visual, word]) => {
    // 영어 단어는 읽는 소리에 따라 조사가 달라(bear 베어를, book 북을) 글자로 정할 수 없으니 조사를 붙이지 않는다.
    add('english', 2, `‘${word}’ 따라 써 볼까?`, word, [], { visual, trace: word, level: 3, hint: TRACE_HINT });
  });
  wordPictures.filter(([, word]) => word.length <= 2).forEach(([visual, word]) => {
    add('korean', 2, `‘${word}’${objectJosa(word)} 따라 써 볼까?`, word, [], { visual, trace: word, level: word.length === 1 ? 5 : 6, hint: TRACE_HINT });
  });

  const riddles = [
    ['다리는 네 개지만 걸을 수 없고, 밥그릇을 올려놓아요.', '식탁', '강아지', '고양이', '토끼'],
    ['밤하늘에서 반짝이고, 해처럼 스스로 빛나는 먼 친구예요.', '별', '구름', '무지개', '비'],
    ['비 오는 날 머리 위에 펴서 비를 막아요.', '우산', '부채', '돋보기', '가위'],
    ['몸에 숫자가 있고, 똑딱똑딱 시간을 알려 줘요.', '시계', '냉장고', '의자', '가위'],
    ['이를 깨끗하게 닦을 때 치약과 함께 써요.', '칫솔', '빗', '연필', '수건'],
    ['엉킨 머리카락을 쓱쓱 풀어 줘요.', '빗', '포크', '칫솔', '숟가락'],
    ['종이에 글씨를 쓰고, 지우개로 지울 수 있어요.', '연필', '젓가락', '빗', '숟가락'],
    ['종이를 싹둑싹둑 오릴 때 써요.', '가위', '빗', '자', '지우개'],
    ['틀리게 쓴 연필 글씨를 싹싹 없애 줘요.', '지우개', '가위', '색종이', '자'],
    ['편지를 넣으면 멀리 있는 사람에게 보내 주는 빨간 상자예요.', '우체통', '냉장고', '세탁기', '옷장'],
    ['여름에 켜면 날개가 돌아가고 바람이 나와요.', '선풍기', '난로', '밥솥', '전등'],
    ['추운 날 손에 끼는 옷이에요.', '장갑', '양말', '모자', '목도리'],
    ['신발을 신기 전에 발에 신어요.', '양말', '장갑', '모자', '목도리'],
    ['머리에 써서 햇빛을 가려요.', '모자', '양말', '장갑', '운동화'],
    ['추운 날 둘둘 감아서 찬바람을 막아요.', '목도리', '모자', '장갑', '양말'],
    ['많은 사람이 타고 정류장에서 서는 큰 자동차예요.', '버스', '자전거', '썰매', '오토바이'],
    // 보기 그림이 붙는 문제에는 '배' 대신 '돛단배'(낱말 그림표의 '배'는 과일 배 그림).
    ['여러 칸이 길게 이어져 철길 위를 달려요.', '기차', '자동차', '비행기', '돛단배'],
    ['큰 날개가 있고 사람을 태워 하늘을 날아요.', '비행기', '돛단배', '버스', '기차'],
    ['등에 딱딱한 집을 지고 천천히 걷는 동물이에요.', '거북이', '나비', '물고기', '토끼'],
    ['목이 아주 길어 높은 곳의 나뭇잎을 먹는 동물이에요.', '기린', '코끼리', '돼지', '토끼'],
    ['몸집이 아주 크고, 귀가 부채처럼 펄럭이는 회색 동물이에요.', '코끼리', '기린', '사슴', '양'],
    ['물가에 살고, 뒷다리로 폴짝폴짝 뛰는 초록 동물이에요.', '개구리', '토끼', '참새', '물고기'],
    ['알에서 나오고, 삐약삐약 우는 아기 닭이에요.', '병아리', '송아지', '강아지', '새끼 고양이'],
    ['꿀꿀 울고 코가 동그란 동물이에요.', '돼지', '소', '양', '말'],
    ['하얀 털이 복슬복슬하고 매애 우는 동물이에요.', '양', '소', '말', '돼지'],
    ['뜨거운 음식을 입으로 후후 불어. 왜 그럴까요?', '식히려고', '더 뜨겁게 하려고', '색을 바꾸려고', '그릇을 키우려고'],
    ['비가 그친 뒤 하늘에 여러 색으로 휘어져 보여요.', '무지개', '눈사람', '번개', '고드름'],
    ['겨울에 동글동글 굴려 만들고 당근 코를 달아 줘요.', '눈사람', '모래', '낙엽', '씨앗'],
    ['너무 더운 곳에 두면 물로 변하는 차가운 것이에요.', '얼음', '돌', '나무', '모래'],
    ['꽃에 찾아와 꽃가루를 옮기는 줄무늬 곤충이에요.', '벌', '개미', '달팽이', '지렁이']
  ];
  riddles.forEach(([prompt, answer, ...others], index) => add('creative', index < 16 ? 1 : 2, prompt, answer, others));

  const groups = [
    ['과일', '사과', '당근', '감자', '양파'], ['채소', '당근', '포도', '귤', '사과'],
    ['바다에 사는 동물', '고래', '사자', '토끼', '말'], ['곤충', '나비', '거북이', '고양이', '참새'],
    ['알을 낳는 동물', '닭', '강아지', '소', '말'], ['네 발로 걷는 동물', '고양이', '물고기', '참새', '나비'],
    ['하늘을 나는 동물', '참새', '거북이', '고양이', '소'], ['땅속에서 자라는 채소', '감자', '오이', '토마토', '가지'],
    ['학교에서 글씨 쓸 때 쓰는 물건', '연필', '숟가락', '양말', '비누'], ['손을 씻을 때 쓰는 물건', '비누', '테이프', '연필', '색종이'],
    ['앞을 보는 데 쓰는 몸의 부분', '눈', '귀', '코', '입'], ['소리를 듣는 데 쓰는 몸의 부분', '귀', '눈', '코', '손'],
    ['냄새를 맡는 데 쓰는 몸의 부분', '코', '귀', '눈', '발'], ['음식을 씹는 데 쓰는 몸의 부분', '이', '귀', '코', '눈'],
    ['타고 다니는 물건', '자전거', '냉장고', '책상', '책'], ['음식을 넣어 두면 차갑게 해 주는 물건', '냉장고', '세탁기', '밥솥', '난로'],
    ['빨래할 때 쓰는 물건', '세탁기', '전자레인지', '냉장고', '청소기'], ['어두운 방을 밝히는 물건', '전등', '선풍기', '의자', '이불'],
    ['둥근 모양의 물건', '공', '책', '자', '상자'],
    ['겨울에 필요한 따뜻한 옷', '두꺼운 외투', '수영복', '반바지', '민소매'], ['바다에서 헤엄칠 때 입는 옷', '수영복', '겨울 외투', '비옷', '잠옷'],
    ['비 오는 날 신는 신발', '장화', '실내화', '슬리퍼', '발레화'], ['길을 건널 때 빨간 신호등이면 할 일', '멈춰', '뛰어 건너', '차도로 가', '눈을 감아']
  ];
  groups.forEach(([group, answer, ...others], index) => add('creative', index < 12 ? 1 : 2, `${group}을 골라요.`, answer, others));

  const relationships = [
    ['새는 둥지에 살아. 꿀을 모으는 곤충은 어디에 살까요?', '벌집', '어항', '새장', '마구간'],
    ['물고기는 지느러미로 헤엄쳐. 새는 무엇으로 날아갈까요?', '날개', '바퀴', '뿌리', '집게'],
    ['손에는 장갑, 발에는 무엇을 신을까요?', '양말', '모자', '목도리', '안경'],
    ['머리에는 모자, 눈에는 무엇을 쓸까요?', '안경', '장화', '장갑', '양말'],
    ['밥은 숟가락으로 먹어. 국수는 무엇으로 집어 먹을까요?', '젓가락', '접시', '국자', '컵'],
    ['그림은 연필로 그리고, 종이는 무엇으로 자를까요?', '가위', '지우개', '색종이', '테이프'],
    ['여름에는 덥고, 겨울에는 어떨까요?', '추워', '똑같이 더워', '언제나 비가 와', '언제나 꽃이 펴'],
    ['아침에는 해가 뜨고, 저녁에는 해가 어떻게 될까요?', '져', '두 개가 돼', '커져', '파래져'],
    ['씨앗에 물을 주고 기다리면 무엇이 자라 나올까요?', '싹', '자동차', '구름', '돌'],
    ['물을 냉동실에 넣어 두면 무엇이 될까요?', '얼음', '불', '바람', '솜'],
    ['개구리가 되기 전, 꼬리로 헤엄치는 건 뭘까요?', '올챙이', '병아리', '송아지', '강아지'],
    ['개는 멍멍, 고양이는 어떻게 울까요?', '야옹', '꿀꿀', '매애', '음매'],
    ['닭은 꼬끼오, 소는 어떻게 울까요?', '음매', '야옹', '멍멍', '짹짹'],
    ['비누는 손을 깨끗하게 해 줘. 지우개는 무엇을 없애 줄까요?', '연필 자국', '발자국', '무지개', '신발'],
    ['뜨거운 물은 식히고, 추울 때는 몸을 어떻게 할까요?', '따뜻하게 해', '더 차갑게 해', '물에 넣어', '얼음에 앉아'],
    ['꽃은 꽃병에, 금붕어는 어디에서 키울까요?', '어항', '세탁기', '냄비', '새장'],
    ['양말은 서랍에 넣어 둬. 우유를 차갑게 두려면 어디에 넣을까요?', '냉장고', '어항', '옷장', '책장'],
    ['밥을 먹기 전 손을 씻고, 먹은 뒤에는 무엇을 닦을까요?', '이', '신발', '창문', '바퀴'],
    ['비가 오면 땅이 젖고, 해가 나면 젖은 땅은 어떻게 될까요?', '말라', '계속 더 젖어', '얼음이 돼', '사라져']
  ];
  relationships.forEach(([prompt, answer, ...others]) => add('creative', 2, prompt, answer, others));

  // 되풀이 규칙: 그림이 있는 낱말은 문제 줄을 그림 줄(js/learning-art.js, 끝 ?는 빈칸)로 보여 주고 질문은 짧게 둔다.
  // [질문, 정답, 오답 셋, 그림 줄]. 그림 줄이 없는 것(수·요일·끼니)은 글자 그대로 둔다.
  // 색 없는 모양은 보기 그림(같은 파란 도형)과 맞춰 파란 도형으로 그린다. ‘작은 ’ 낱말은 같은 그림을 작게 그린다.
  const sequences = [
    ['다음에 올 색은?', '빨강', '노랑', '초록', '보라', '빨강, 파랑, 빨강, 파랑, ?'],
    ['다음에 올 모양은?', '동그라미', '네모', '별', '하트', '파란 동그라미, 파란 세모, 파란 동그라미, 파란 세모, ?'],
    // 동작 규칙: 발 구르기는 ARASAAC 에 맞는 그림이 없어 박수·점프 되풀이로(2026-11-13, 그림 4장 ARASAAC).
    ['다음에 올 동작은?', '박수', '점프', '앉기', '돌기', '박수, 점프, 박수, 점프, ?'],
    ['다음에 올 것은?', '사과', '포도', '수박', '딸기', '사과, 바나나, 사과, 바나나, ?'],
    ['다음에 올 것은?', '낮', '밤', '겨울', '봄', '낮, 밤, 낮, 밤, ?'],
    ['다음에 올 것은?', '작은 공', '큰 공', '작은 책', '큰 책', '작은 공, 큰 공, 작은 공, 큰 공, ?'],
    ['1, 2, 3, 4, 다음 수는?', '5', '2', '7', '9'],
    ['2, 4, 6, 8, 다음 수는?', '10', '9', '11', '12'],
    ['5, 10, 15, 20, 다음 수는?', '25', '21', '24', '30'],
    ['10, 9, 8, 7, 다음 수는?', '6', '5', '4', '8'],
    ['다음에 올 계절은?', '겨울', '봄', '여름', '가을', '봄, 여름, 가을, ?'],
    ['월요일, 화요일, 수요일, 다음은?', '목요일', '금요일', '일요일', '토요일'],
    ['아침밥, 점심밥, 다음에 먹는 밥은?', '저녁밥', '아침밥', '점심밥', '새벽밥'],
    ['신발을 신기 전에 발에 신는 건 뭘까요?', '양말', '모자', '장갑', '목도리'],
    ['손을 비누로 깨끗이 문지른 다음에는 뭘 할까요?', '물로 헹궈', '흙을 만져', '연필을 깎아', '신발을 신어'],
    ['다음에 될 것은?', '큰 나무', '돌', '계란', '물고기', '씨앗, 싹, 작은 나무, ?'],
    ['달걀에서 나온 아기 닭을 뭐라고 할까요?', '병아리', '송아지', '강아지', '올챙이'],
    ['다음에 올 색은?', '파랑', '초록', '보라', '검정', '빨강, 노랑, 파랑, 빨강, 노랑, ?'],
    ['다음에 올 모양은?', '네모', '동그라미', '별', '하트', '파란 세모, 파란 세모, 파란 네모, 파란 세모, 파란 세모, ?'],
    // 높게·낮게(소리)는 그림으로 보일 수 없어 그림이 있는 꽃·나비 규칙(하나, 둘 되풀이)으로 바꿨다(2026-11-13).
    ['다음에 올 것은?', '나비', '꽃', '벌', '새', '꽃, 나비, 나비, 꽃, 나비, ?']
  ];
  // 그림 줄은 다시 읽을 글이 짧으니 힌트도 그림을 보게 한다(기본 힌트는 ‘문제를 한 번 더 천천히 읽어 보자!’).
  const rowHint = '그림이 어떤 차례로 놓였는지 하나씩 짚어 보자!';
  sequences.forEach(([prompt, answer, first, second, third, visual], index) => {
    add('creative', index < 8 ? 1 : 2, prompt, answer, [first, second, third], visual ? { visual, hint: rowHint } : {});
  });

  // 2026-11-14 문제 넓히기(Codex 작성·자체 검사 통과, 원본 .data/question-bank/new-questions.json): 한글 단계마다 30, 영어 단계마다 30, 창의력 쉬움·도전 각 40.
  // 기존 문제 번호(id)가 바뀌지 않도록 모든 문제 뒤에 붙인다. 줄: [단계(창의력은 쉬움 1·도전 2), 문제, 정답, 오답 셋, 힌트, 그림 낱말(js/data/learn-pictures.js, 없으면 ''), 보기 안 읽기(1)]
  // 2026-11-15: 선의 위치·모양이나 선 더하기/빼기를 말로 설명해 글자를 추측하는 문제는 제외한다.
  const MORE_KOREAN = [
    [1, '가위와 구름은 어떤 자음으로 시작할까요?', 'ㄱ', 'ㅋ', 'ㄴ', 'ㅅ', '두 낱말의 맨 앞 소리를 천천히 비교해 보자!', '', 1],
    [1, '나비와 나무의 첫 자음은 무엇일까요?', 'ㄴ', 'ㄱ', 'ㄷ', 'ㅁ', '두 낱말의 맨 앞 소리를 천천히 비교해 보자!', '', 1],
    [1, '모자와 무지개는 어떤 자음으로 시작할까요?', 'ㅁ', 'ㅂ', 'ㄹ', 'ㅎ', '두 낱말의 맨 앞 소리를 천천히 비교해 보자!', '', 1],
    [1, '바나나와 비누의 첫 자음은 무엇일까요?', 'ㅂ', 'ㅍ', 'ㅁ', 'ㄷ', '두 낱말의 맨 앞 소리를 천천히 비교해 보자!', '', 1],
    [1, '소와 사자는 어떤 자음으로 시작할까요?', 'ㅅ', 'ㅈ', 'ㅊ', 'ㅇ', '두 낱말의 맨 앞 소리를 천천히 비교해 보자!', '', 1],
    [1, '토끼와 토마토의 첫 자음은 무엇일까요?', 'ㅌ', 'ㄷ', 'ㄴ', 'ㅋ', '두 낱말의 맨 앞 소리를 천천히 비교해 보자!', '', 1],
    [1, '이 동물 이름의 첫 자음은 무엇일까요?', 'ㄷ', 'ㅌ', 'ㄱ', 'ㅂ', '그림 이름을 말하고 맨 앞 소리를 들어 보자!', '돼지', 1],
    [1, '이 과일 이름은 어떤 자음으로 시작할까요?', 'ㄹ', 'ㄴ', 'ㅁ', 'ㅇ', '그림 이름을 말하고 맨 앞 소리를 들어 보자!', '레몬', 1],
    [1, '이 탈것 이름의 첫 자음은 무엇일까요?', 'ㅈ', 'ㅊ', 'ㅅ', 'ㄷ', '그림 이름을 말하고 맨 앞 소리를 들어 보자!', '자전거', 1],
    [1, '이 동물 이름은 어떤 자음으로 시작할까요?', 'ㅋ', 'ㄱ', 'ㅌ', 'ㅍ', '그림 이름을 말하고 맨 앞 소리를 들어 보자!', '코끼리', 1],
    [1, '이 음식 이름의 첫 자음은 무엇일까요?', 'ㅍ', 'ㅂ', 'ㅎ', 'ㅅ', '그림 이름을 말하고 맨 앞 소리를 들어 보자!', '피자', 1],
    [1, '이 동물 이름의 맨 앞 자음은 무엇일까요?', 'ㅎ', 'ㅇ', 'ㅁ', 'ㄹ', '그림 이름을 말하고 맨 앞 소리를 들어 보자!', '호랑이', 1],
    [2, '이 곤충 이름의 첫 글자에는 어떤 모음이 있을까요?', 'ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', '그림 이름의 첫 글자를 길게 소리 내 보자!', '나비', 1],
    [2, '이 동물 이름의 첫 글자 모음은 무엇일까요?', 'ㅓ', 'ㅏ', 'ㅕ', 'ㅣ', '그림 이름의 첫 글자를 길게 소리 내 보자!', '거북이', 1],
    [2, '이 동물 이름을 쓰면 어떤 모음이 들어갈까요?', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ', '그림 이름의 첫 글자를 길게 소리 내 보자!', '소', 1],
    [2, '이 그림 이름의 첫 글자에는 어떤 모음이 있을까요?', 'ㅜ', 'ㅗ', 'ㅓ', 'ㅏ', '그림 이름의 첫 글자를 길게 소리 내 보자!', '구름', 1],
    [2, '목이 긴 이 동물 이름의 첫 모음은 무엇일까요?', 'ㅣ', 'ㅡ', 'ㅏ', 'ㅓ', '그림 이름의 첫 글자를 길게 소리 내 보자!', '기린', 1],
    [2, '이 그림 이름을 말할 때 처음 만나는 모음은 무엇일까요?', 'ㅜ', 'ㅠ', 'ㅗ', 'ㅏ', '그림 이름의 첫 글자를 길게 소리 내 보자!', '무지개', 1],
    [2, '이 동물 이름에는 어떤 모음이 들어갈까요?', 'ㅑ', 'ㅏ', 'ㅕ', 'ㅛ', '그림 이름의 첫 글자를 길게 소리 내 보자!', '양', 1],
    [2, '이 물건 이름의 첫 글자 모음은 무엇일까요?', 'ㅕ', 'ㅓ', 'ㅑ', 'ㅠ', '그림 이름의 첫 글자를 길게 소리 내 보자!', '연필', 1],
    [2, '가와 사에 함께 들어 있는 모음은 무엇일까요?', 'ㅏ', 'ㅓ', 'ㅗ', 'ㅣ', '두 글자에서 자음 옆이나 아래의 선을 비교해 보자!', '', 1],
    [2, '고와 도에 함께 쓰인 모음은 무엇일까요?', 'ㅗ', 'ㅜ', 'ㅛ', 'ㅡ', '두 글자에서 자음 옆이나 아래의 선을 비교해 보자!', '', 1],
    [2, '주와 부의 모음은 무엇일까요?', 'ㅜ', 'ㅗ', 'ㅠ', 'ㅣ', '두 글자에서 자음 옆이나 아래의 선을 비교해 보자!', '', 1],
    [2, '시와 치에서 똑같이 쓰인 모음은 무엇일까요?', 'ㅣ', 'ㅡ', 'ㅏ', 'ㅓ', '두 글자에서 자음 옆이나 아래의 선을 비교해 보자!', '', 1],
    [2, '느와 스에 함께 들어 있는 모음은 무엇일까요?', 'ㅡ', 'ㅣ', 'ㅗ', 'ㅜ', '두 글자에서 자음 옆이나 아래의 선을 비교해 보자!', '', 1],
    [2, '거와 서의 모음은 무엇일까요?', 'ㅓ', 'ㅏ', 'ㅕ', 'ㅑ', '두 글자에서 자음 옆이나 아래의 선을 비교해 보자!', '', 1],
    [3, '고의 모음을 아 모음으로 바꾸면 어느 글자일까요?', '가', '거', '구', '나', '바꾸는 부분만 달라지고 나머지는 그대로인지 살펴보자!', '', 1],
    [3, '나의 모음을 오 모음으로 바꾸면 어느 글자일까요?', '노', '누', '너', '모', '바꾸는 부분만 달라지고 나머지는 그대로인지 살펴보자!', '', 1],
    [3, '두의 모음을 이 모음으로 바꾸면 어느 글자일까요?', '디', '다', '두', '기', '바꾸는 부분만 달라지고 나머지는 그대로인지 살펴보자!', '', 1],
    [3, '머의 모음을 우 모음으로 바꾸면 어느 글자일까요?', '무', '머', '모', '누', '바꾸는 부분만 달라지고 나머지는 그대로인지 살펴보자!', '', 1],
    [3, '시의 모음을 아 모음으로 바꾸면 어느 글자일까요?', '사', '서', '소', '자', '바꾸는 부분만 달라지고 나머지는 그대로인지 살펴보자!', '', 1],
    [3, '가의 자음을 니은으로 바꾸면 어느 글자일까요?', '나', '다', '가', '노', '바꾸는 부분만 달라지고 나머지는 그대로인지 살펴보자!', '', 1],
    [3, '모의 자음을 비읍으로 바꾸면 어느 글자일까요?', '보', '부', '모', '포', '바꾸는 부분만 달라지고 나머지는 그대로인지 살펴보자!', '', 1],
    [3, '주의 자음을 치읓으로 바꾸면 어느 글자일까요?', '추', '주', '차', '쿠', '바꾸는 부분만 달라지고 나머지는 그대로인지 살펴보자!', '', 1],
    [3, '피에서 자음을 하늘의 첫 자음으로 바꾸면 어느 글자일까요?', '히', '피', '하', '시', '바꾸는 부분만 달라지고 나머지는 그대로인지 살펴보자!', '', 1],
    [3, '아에서 모음을 연필의 첫 모음으로 바꾸면 어느 글자일까요?', '여', '어', '야', '요', '바꾸는 부분만 달라지고 나머지는 그대로인지 살펴보자!', '', 1],
    [3, '그림 이름 나□의 빈칸에는 어떤 글자가 들어갈까요?', '비', '바', '피', '부', '그림 이름을 말하며 마지막 소리를 들어 보자!', '나비', 1],
    [3, '그림 이름 포□의 빈칸에는 어떤 글자가 들어갈까요?', '도', '두', '토', '고', '그림 이름을 말하며 마지막 소리를 들어 보자!', '포도', 1],
    [3, '그림 이름 고구□의 빈칸에는 어떤 글자가 들어갈까요?', '마', '머', '나', '바', '그림 이름을 말하며 마지막 소리를 들어 보자!', '고구마', 1],
    [3, '그림 이름 가□의 빈칸에는 어떤 글자가 들어갈까요?', '지', '치', '자', '기', '그림 이름을 말하며 마지막 소리를 들어 보자!', '가지', 1],
    [3, '그림 이름 오□의 빈칸에는 어떤 글자가 들어갈까요?', '리', '니', '르', '미', '그림 이름을 말하며 마지막 소리를 들어 보자!', '오리', 1],
    [3, '그림 이름 피□의 빈칸은 무엇일까요?', '자', '차', '저', '사', '그림 이름을 말하며 마지막 소리를 들어 보자!', '피자', 1],
    [3, '그림 이름 바□의 빈칸은 무엇일까요?', '다', '나', '도', '타', '그림 이름을 말하며 마지막 소리를 들어 보자!', '바다', 1],
    [3, '그림 이름 우□의 빈칸에는 어떤 글자가 들어갈까요?', '유', '우', '요', '여', '그림 이름을 말하며 마지막 소리를 들어 보자!', '우유', 1],
    [3, '고와 첫 자음이 같은 글자는 무엇일까요?', '기', '니', '미', '시', '같아야 하는 부분이 자음인지 모음인지 짚어 보자!', '', 1],
    [3, '더와 첫 자음이 같은 글자는 무엇일까요?', '도', '고', '노', '모', '같아야 하는 부분이 자음인지 모음인지 짚어 보자!', '', 1],
    [3, '루와 첫 자음이 같은 글자는 무엇일까요?', '라', '나', '다', '마', '같아야 하는 부분이 자음인지 모음인지 짚어 보자!', '', 1],
    [3, '초와 첫 자음이 같은 글자는 무엇일까요?', '치', '지', '시', '히', '같아야 하는 부분이 자음인지 모음인지 짚어 보자!', '', 1],
    [3, '파와 모음이 같은 글자는 무엇일까요?', '하', '호', '후', '히', '같아야 하는 부분이 자음인지 모음인지 짚어 보자!', '', 1],
    [3, '소와 모음이 같은 글자는 무엇일까요?', '코', '카', '쿠', '키', '같아야 하는 부분이 자음인지 모음인지 짚어 보자!', '', 1],
    [4, '‘소’ 아래에 어떤 받침을 쓰면 그림 이름이 될까요?', 'ㄴ', 'ㄹ', 'ㅁ', 'ㅇ', '그림 이름을 말하고 끝소리를 살펴보자!', '손', 1],
    [4, '‘고’ 아래에 어떤 받침을 쓰면 그림 이름이 될까요?', 'ㅁ', 'ㄴ', 'ㅂ', 'ㅇ', '그림 이름을 말하고 끝소리를 살펴보자!', '곰', 1],
    [4, '‘고’ 아래에 어떤 받침을 쓰면 그림 이름이 될까요?', 'ㅇ', 'ㄱ', 'ㄴ', 'ㅁ', '그림 이름을 말하고 끝소리를 살펴보자!', '공', 1],
    [4, '‘무’ 아래에 어떤 받침을 쓰면 그림 이름이 될까요?', 'ㄹ', 'ㄴ', 'ㅁ', 'ㅂ', '그림 이름을 말하고 끝소리를 살펴보자!', '물', 1],
    [4, '‘벼’ 아래에 어떤 받침을 쓰면 그림 이름이 될까요?', 'ㄹ', 'ㄱ', 'ㅁ', 'ㅇ', '그림 이름을 말하고 끝소리를 살펴보자!', '별', 1],
    [4, '‘채’ 아래에 어떤 받침을 쓰면 그림 이름이 될까요?', 'ㄱ', 'ㄴ', 'ㄹ', 'ㅂ', '그림 이름을 말하고 끝소리를 살펴보자!', '책', 1],
    [4, '‘바’ 아래에 어떤 받침을 쓰면 그림 이름이 될까요?', 'ㅁ', 'ㄱ', 'ㄴ', 'ㅇ', '그림 이름을 말하고 끝소리를 살펴보자!', '밤', 1],
    [4, '‘야’ 아래에 어떤 받침을 쓰면 그림 이름이 될까요?', 'ㅇ', 'ㄴ', 'ㄹ', 'ㅁ', '그림 이름을 말하고 끝소리를 살펴보자!', '양', 1],
    [4, '‘부’ 아래에 어떤 받침을 쓰면 그림 이름이 될까요?', 'ㄹ', 'ㄴ', 'ㅂ', 'ㅇ', '그림 이름을 말하고 끝소리를 살펴보자!', '불', 1],
    [4, '‘이’ 아래에 어떤 받침을 쓰면 그림 이름이 될까요?', 'ㅂ', 'ㄱ', 'ㄴ', 'ㅁ', '그림 이름을 말하고 끝소리를 살펴보자!', '입', 1],
    [4, '받침이 있는 낱말은 어느 것일까요?', '손', '자', '귀', '코', '글자 아래에 자음이 있는지 살펴보자!', '', 1],
    [4, '받침이 있는 낱말은 어느 것일까요?', '눈', '소', '새', '이', '글자 아래에 자음이 있는지 살펴보자!', '', 1],
    [4, '받침이 있는 낱말은 어느 것일까요?', '책', '오이', '가지', '나무', '글자 아래에 자음이 있는지 살펴보자!', '', 1],
    [4, '받침이 있는 낱말은 어느 것일까요?', '가방', '모자', '바다', '우유', '글자 아래에 자음이 있는지 살펴보자!', '', 1],
    [4, '받침이 있는 낱말은 어느 것일까요?', '풍선', '포도', '사자', '기차', '글자 아래에 자음이 있는지 살펴보자!', '', 1],
    [4, '받침이 하나도 없는 낱말은 어느 것일까요?', '나비', '양말', '연필', '공책', '각 글자의 맨 아래를 하나씩 살펴보자!', '', 1],
    [4, '받침이 하나도 없는 낱말은 어느 것일까요?', '오리', '장갑', '수박', '신발', '각 글자의 맨 아래를 하나씩 살펴보자!', '', 1],
    [4, '받침이 하나도 없는 낱말은 어느 것일까요?', '비누', '창문', '침대', '식탁', '각 글자의 맨 아래를 하나씩 살펴보자!', '', 1],
    [4, '받침이 하나도 없는 낱말은 어느 것일까요?', '고래', '얼음', '인형', '당근', '각 글자의 맨 아래를 하나씩 살펴보자!', '', 1],
    [4, '받침이 하나도 없는 낱말은 어느 것일까요?', '토마토', '수건', '칫솔', '잠옷', '각 글자의 맨 아래를 하나씩 살펴보자!', '', 1],
    [4, '‘곰’과 같은 받침으로 끝나는 낱말은 무엇일까요?', '밤', '공', '발', '손', '마지막 글자 아래의 자음을 서로 비교해 보자!', '', 1],
    [4, '‘손’과 같은 받침으로 끝나는 낱말은 무엇일까요?', '눈', '책', '별', '곰', '마지막 글자 아래의 자음을 서로 비교해 보자!', '', 1],
    [4, '‘물’과 같은 받침으로 끝나는 낱말은 무엇일까요?', '돌', '입', '양', '꽃', '마지막 글자 아래의 자음을 서로 비교해 보자!', '', 1],
    [4, '‘책’과 같은 받침으로 끝나는 낱말은 무엇일까요?', '수박', '가방', '연필', '양말', '마지막 글자 아래의 자음을 서로 비교해 보자!', '', 1],
    [4, '‘입’과 같은 받침으로 끝나는 낱말은 무엇일까요?', '컵', '손', '불', '밤', '마지막 글자 아래의 자음을 서로 비교해 보자!', '', 1],
    [4, '‘공’과 같은 받침으로 끝나는 낱말은 무엇일까요?', '가방', '당근', '수건', '신발', '마지막 글자 아래의 자음을 서로 비교해 보자!', '', 1],
    [4, '‘발’과 같은 받침으로 끝나는 낱말은 무엇일까요?', '연필', '인형', '수박', '장갑', '마지막 글자 아래의 자음을 서로 비교해 보자!', '', 1],
    [4, '‘문’과 같은 받침으로 끝나는 낱말은 무엇일까요?', '풍선', '공책', '가을', '봄', '마지막 글자 아래의 자음을 서로 비교해 보자!', '', 1],
    [4, '‘솜’과 같은 받침으로 끝나는 낱말은 무엇일까요?', '봄', '별', '손', '책', '마지막 글자 아래의 자음을 서로 비교해 보자!', '', 1],
    [4, '‘방’과 같은 받침으로 끝나는 낱말은 무엇일까요?', '양', '돌', '밤', '손', '마지막 글자 아래의 자음을 서로 비교해 보자!', '', 1],
    [5, '‘나는 □□로 손을 씻어요.’ 빈칸에 맞는 낱말은 무엇일까요?', '비누', '연필', '수박', '모래', '손을 깨끗이 씻는 모습을 떠올려 보자!', '', 1],
    [5, '‘나는 □□로 머리를 말려요.’ 빈칸에 맞는 낱말은 무엇일까요?', '수건', '공책', '양말', '접시', '물기를 닦는 물건을 골라 보자!', '', 1],
    [5, '‘나는 □□에 물고기를 길러요.’ 빈칸에 맞는 낱말은 무엇일까요?', '어항', '가방', '신발', '모자', '물고기가 헤엄칠 수 있는 곳을 찾아보자!', '', 1],
    [5, '‘나는 □□를 타고 철길을 가요.’ 빈칸에 맞는 낱말은 무엇일까요?', '기차', '버스', '자전거', '비행기', '철길을 달리는 모습을 떠올려 보자!', '', 1],
    [5, '‘나는 □□로 종이를 잘라요.’ 빈칸에 맞는 낱말은 무엇일까요?', '가위', '국자', '시계', '장갑', '종이를 두 조각 내는 도구를 찾아보자!', '', 1],
    [5, '‘나는 □□로 이를 닦아요.’ 빈칸에 맞는 낱말은 무엇일까요?', '칫솔', '포크', '빗', '가위', '입을 깨끗하게 하는 물건을 골라 보자!', '', 1],
    [5, '‘나는 □□에 누워 잠을 자요.’ 빈칸에 맞는 낱말은 무엇일까요?', '침대', '냄비', '창문', '우체통', '잘 때 몸을 눕히는 곳을 떠올려 보자!', '', 1],
    [5, '‘나는 □□□으로 밥을 먹어요.’ 빈칸에 맞는 낱말은 무엇일까요?', '숟가락', '돋보기', '목도리', '지우개', '밥을 떠서 입에 넣는 도구를 찾아보자!', '', 1],
    [5, '‘나는 □□□에 편지를 넣어요.’ 빈칸에 맞는 낱말은 무엇일까요?', '우체통', '냉장고', '세탁기', '밥솥', '편지를 보내는 모습을 떠올려 보자!', '', 1],
    [5, '‘나는 □□를 쓰고 비를 피해요.’ 빈칸에 맞는 낱말은 무엇일까요?', '우산', '장화', '시계', '모자', '머리 위에 펼치는 물건을 골라 보자!', '', 1],
    [5, '과일 이름표 사이에 잘못 놓인 낱말은 무엇일까요?', '당근', '레몬', '참외', '복숭아', '과일이 아닌 것을 하나 찾아보자!', '', 1],
    [5, '동물 이름표 사이에 잘못 놓인 낱말은 무엇일까요?', '의자', '기린', '사슴', '고양이', '살아 움직이는 동물끼리 모아 보자!', '', 1],
    [5, '탈것 이름표 사이에 잘못 놓인 낱말은 무엇일까요?', '냄비', '버스', '자동차', '오토바이', '타고 이동하는 것끼리 모아 보자!', '', 1],
    [5, '옷 이름표 사이에 잘못 놓인 낱말은 무엇일까요?', '접시', '잠옷', '반바지', '수영복', '몸에 입는 것끼리 모아 보자!', '', 1],
    [5, '색 이름표 사이에 잘못 놓인 낱말은 무엇일까요?', '바퀴', '노랑', '보라', '초록', '색을 나타내는 낱말끼리 모아 보자!', '', 1],
    [5, '계절 이름표 사이에 잘못 놓인 낱말은 무엇일까요?', '하늘', '봄', '여름', '겨울', '한 해의 계절을 떠올려 보자!', '', 1],
    [5, '몸 이름표 사이에 잘못 놓인 낱말은 무엇일까요?', '빗', '코', '귀', '발', '우리 몸에 있는 것끼리 모아 보자!', '', 1],
    [5, '곤충 이름표 사이에 잘못 놓인 낱말은 무엇일까요?', '고래', '나비', '개미', '잠자리', '작은 벌레 친구들을 떠올려 보자!', '', 1],
    [5, '주방 도구 이름표 사이에 잘못 놓인 낱말은 무엇일까요?', '인형', '국자', '냄비', '젓가락', '요리하거나 밥 먹을 때 쓰는 것을 찾아보자!', '', 1],
    [5, '학교 준비물 이름표 사이에 잘못 놓인 낱말은 무엇일까요?', '밥솥', '연필', '공책', '지우개', '학교 가방에 넣을 것끼리 모아 보자!', '', 1],
    [5, '‘동물’ 바구니에 붙일 이름표는 무엇일까요?', '얼룩말', '우체통', '목도리', '냉장고', '동물의 이름을 찾아보자!', '', 1],
    [5, '‘탈것’ 바구니에 붙일 이름표는 무엇일까요?', '돛단배', '달팽이', '고드름', '해바라기', '사람이 타고 이동하는 것을 찾아보자!', '', 1],
    [5, '‘과일’ 바구니에 붙일 이름표는 무엇일까요?', '오렌지', '고구마', '양파', '장미', '과일 이름을 천천히 읽어 보자!', '', 1],
    [5, '‘꽃’ 바구니에 붙일 이름표는 무엇일까요?', '튤립', '당근', '기차', '거북이', '꽃이 피는 식물을 찾아보자!', '', 1],
    [5, '‘비 오는 날’ 상자에 넣을 물건은 무엇일까요?', '우산', '민소매', '선풍기', '부채', '비에 젖지 않게 머리 위에 펴는 것을 찾아보자!', '', 1],
    [5, '‘추운 날’ 상자에 넣을 물건은 무엇일까요?', '겨울 외투', '민소매', '수영복', '반바지', '추위를 막아 주는 옷을 골라 보자!', '', 1],
    [5, '‘잘 때’ 상자에 넣을 물건은 무엇일까요?', '이불', '장화', '국자', '가위', '누웠을 때 몸을 덮는 것을 찾아보자!', '', 1],
    [5, '‘생일’ 상자에 넣을 음식은 무엇일까요?', '케이크', '칫솔', '발레화', '전등', '생일 축하 노래를 부를 때 먹는 것을 떠올려 보자!', '', 1],
    [5, '‘청소’ 상자에 넣을 물건은 무엇일까요?', '빗자루', '자전거', '인형', '해바라기', '바닥의 먼지를 쓸어 내는 도구를 골라 보자!', '', 1],
    [5, '‘빨래’ 상자에 넣을 물건은 무엇일까요?', '세탁기', '책장', '전등', '선풍기', '옷을 깨끗이 빠는 도구를 골라 보자!', '', 1],
    [6, '오리가 우는 소리를 나타내는 말은 무엇일까요?', '꽥꽥', '멍멍', '야옹', '음매', '물가의 오리 소리를 흉내 내 보자!', '', 0],
    [6, '개구리가 우는 소리를 나타내는 말은 무엇일까요?', '개굴개굴', '꼬끼오', '짹짹', '꿀꿀', '연못에서 들리는 소리를 떠올려 보자!', '', 0],
    [6, '벌이 날아다니는 소리를 나타내는 말은 무엇일까요?', '윙윙', '똑딱똑딱', '첨벙첨벙', '사각사각', '작은 날갯소리를 떠올려 보자!', '', 0],
    [6, '물에 뛰어들 때 나는 소리는 무엇일까요?', '풍덩', '똑똑', '딸랑', '데굴데굴', '물방울이 튀는 모습을 떠올려 보자!', '', 0],
    [6, '문을 가볍게 두드리는 소리는 무엇일까요?', '똑똑', '철썩', '보글보글', '멍멍', '방문 앞에서 손으로 두드려 보자!', '', 0],
    [6, '시계가 가는 소리를 나타내는 말은 무엇일까요?', '똑딱똑딱', '사각사각', '꿀꺽꿀꺽', '음매', '조용한 방에서 들리는 시계 소리를 떠올려 보자!', '', 0],
    [6, '공이 굴러가는 모양을 나타내는 말은 무엇일까요?', '데굴데굴', '깡충깡충', '반짝반짝', '꼬끼오', '둥근 물건이 바닥을 구르는 모습을 떠올려 보자!', '', 0],
    [6, '토끼가 뛰는 모양을 나타내는 말은 무엇일까요?', '깡충깡충', '엉금엉금', '데굴데굴', '빙글빙글', '두 뒷발로 뛰는 모습을 떠올려 보자!', '', 0],
    [6, '할머니의 ‘밥’을 높여 이르는 말은 무엇일까요?', '진지', '간식', '과자', '반찬', '어른께 예의를 갖추어 말하는 모습을 떠올려 보자!', '', 0],
    [6, '어른의 ‘이름’을 높여 이르는 말은 무엇일까요?', '성함', '별명', '생일', '나이', '어른께 이름을 여쭤보는 장면을 떠올려 보자!', '', 0],
    [6, '할아버지의 ‘집’을 높여 이르는 말은 무엇일까요?', '댁', '문', '방', '마당', '어른이 사시는 곳을 공손히 부르는 말을 생각해 보자!', '', 0],
    [6, '‘자다’를 높여 이르는 말은 무엇일까요?', '주무시다', '달리다', '앉다', '웃다', '어른께 편안히 쉬시라고 인사해 보자!', '', 0],
    [6, '‘먹다’를 높여 이르는 말은 무엇일까요?', '드시다', '보다', '오다', '가다', '어른께 음식을 권하는 모습을 떠올려 보자!', '', 0],
    [6, '‘주다’를 높여 이르는 말은 무엇일까요?', '드리다', '갖다', '빌리다', '받다', '내가 어른께 물건을 건네는 모습을 떠올려 보자!', '', 0],
    [6, '‘양보하다’는 어떤 뜻일까요?', '다른 사람에게 먼저 하게 해', '다른 사람을 밀어', '혼자 먼저 가져가', '큰 소리로 화를 내', '그네를 기다리는 친구를 떠올려 보자!', '', 0],
    [6, '‘협동하다’는 어떤 뜻일까요?', '힘을 모아 함께 해', '혼자만 해', '서로 싸워', '하던 일을 숨겨', '친구들과 큰 블록집을 만드는 모습을 떠올려 보자!', '', 0],
    [6, '‘약속’은 무슨 뜻일까요?', '앞으로 할 일을 지키기로 정한 말', '우연히 들은 소리', '생각 없이 부른 노래', '물건에 붙인 이름', '친구와 만나기로 한 일을 떠올려 보자!', '', 0],
    [6, '‘소중하다’는 어떤 뜻일까요?', '매우 귀하고 중요해', '쉽게 버려도 돼', '아주 무거워', '소리가 커', '아끼는 물건이나 사람을 떠올려 보자!', '', 0],
    [6, '‘정리하다’는 어떤 뜻일까요?', '물건을 알맞은 자리에 놓아', '물건을 바닥에 흩어', '물건을 몰래 숨겨', '물건을 마구 던져', '놀이가 끝난 뒤의 방을 떠올려 보자!', '', 0],
    [6, '‘빌리다’는 어떤 뜻일까요?', '남의 물건을 잠깐 쓰고 돌려줘', '남의 물건을 그냥 가져', '내 물건을 버려', '물건을 새로 만들어', '도서관에서 책을 가져오는 일을 떠올려 보자!', '', 0],
    [6, '‘차례’는 어떤 뜻일까요?', '하나씩 돌아오는 순서', '함께 먹는 음식', '물건의 무게', '움직이는 빠르기', '줄을 서서 한 명씩 그네를 타는 모습을 떠올려 보자!', '', 0],
    [6, '‘이웃’은 누구를 이르는 말일까요?', '가까운 곳에 사는 사람', '가게에서 파는 물건', '산속에 사는 동물', '멀리 보이는 구름', '우리 집 주변에 사는 사람을 떠올려 보자!', '', 0],
    [6, '‘깨끗하다’와 반대되는 낱말은 무엇일까요?', '더럽다', '환하다', '가늘다', '조용하다', '청소하기 전과 후를 비교해 보자!', '', 0],
    [6, '‘젖다’와 반대되는 낱말은 무엇일까요?', '마르다', '자라다', '흔들리다', '구르다', '빨래를 햇볕에 널기 전과 후를 떠올려 보자!', '', 0],
    [6, '‘넓다’와 반대되는 낱말은 무엇일까요?', '좁다', '길다', '높다', '깊다', '여럿이 서 있을 자리가 충분한지 생각해 보자!', '', 0],
    [6, '‘가깝다’와 반대되는 낱말은 무엇일까요?', '멀다', '느리다', '작다', '얇다', '집에서 몇 걸음을 가야 하는지 생각해 보자!', '', 0],
    [6, '‘두껍다’와 반대되는 낱말은 무엇일까요?', '얇다', '넓다', '어둡다', '무겁다', '종이 한 장과 여러 장을 겹친 것을 비교해 보자!', '', 0],
    [6, '‘굵다’와 반대되는 낱말은 무엇일까요?', '가늘다', '짧다', '낮다', '차갑다', '나무줄기와 실의 굵기를 비교해 보자!', '', 0],
    [6, '‘시끄럽다’와 반대되는 낱말은 무엇일까요?', '조용하다', '빠르다', '밝다', '따뜻하다', '여럿이 떠들 때와 모두 잠들었을 때를 비교해 보자!', '', 0],
    [6, '‘출발하다’와 반대되는 낱말은 무엇일까요?', '도착하다', '기다리다', '돌아보다', '쉬다', '집을 나설 때와 목적지에 닿을 때를 떠올려 보자!', '', 0]
  ];
  const MORE_ENGLISH = [
    [1, '소문자 a의 짝인 대문자는 무엇일까요?', 'A', 'D', 'H', 'Y', '작은 글자와 짝인 큰 글자를 찾아보자!', '', 1],
    [1, '소문자 d의 짝인 대문자는 무엇일까요?', 'D', 'B', 'P', 'R', '작은 글자와 짝인 큰 글자를 찾아보자!', '', 1],
    [1, '소문자 e의 짝인 대문자는 무엇일까요?', 'E', 'F', 'L', 'T', '작은 글자와 짝인 큰 글자를 찾아보자!', '', 1],
    [1, '소문자 g의 짝인 대문자는 무엇일까요?', 'G', 'C', 'O', 'Q', '작은 글자와 짝인 큰 글자를 찾아보자!', '', 1],
    [1, '소문자 h의 짝인 대문자는 무엇일까요?', 'H', 'N', 'M', 'K', '작은 글자와 짝인 큰 글자를 찾아보자!', '', 1],
    [1, '소문자 m의 짝인 대문자는 무엇일까요?', 'M', 'N', 'W', 'H', '작은 글자와 짝인 큰 글자를 찾아보자!', '', 1],
    [1, '소문자 n의 짝인 대문자는 무엇일까요?', 'N', 'M', 'H', 'Z', '작은 글자와 짝인 큰 글자를 찾아보자!', '', 1],
    [1, '소문자 r의 짝인 대문자는 무엇일까요?', 'R', 'P', 'B', 'K', '작은 글자와 짝인 큰 글자를 찾아보자!', '', 1],
    [1, '소문자 t의 짝인 대문자는 무엇일까요?', 'T', 'F', 'I', 'L', '작은 글자와 짝인 큰 글자를 찾아보자!', '', 1],
    [1, '소문자 y의 짝인 대문자는 무엇일까요?', 'Y', 'V', 'X', 'W', '작은 글자와 짝인 큰 글자를 찾아보자!', '', 1],
    [1, '알파벳 순서에서 A 바로 다음 글자는 무엇일까요?', 'B', 'D', 'F', 'H', '알파벳 노래를 부르며 앞뒤 순서를 생각해 보자!', '', 1],
    [1, '알파벳 순서에서 D 바로 다음 글자는 무엇일까요?', 'E', 'C', 'G', 'I', '알파벳 노래를 부르며 앞뒤 순서를 생각해 보자!', '', 1],
    [1, '알파벳 순서에서 G 바로 다음 글자는 무엇일까요?', 'H', 'F', 'J', 'L', '알파벳 노래를 부르며 앞뒤 순서를 생각해 보자!', '', 1],
    [1, '알파벳 순서에서 K 바로 다음 글자는 무엇일까요?', 'L', 'J', 'N', 'P', '알파벳 노래를 부르며 앞뒤 순서를 생각해 보자!', '', 1],
    [1, '알파벳 순서에서 P 바로 다음 글자는 무엇일까요?', 'Q', 'O', 'S', 'U', '알파벳 노래를 부르며 앞뒤 순서를 생각해 보자!', '', 1],
    [1, '알파벳 순서에서 T 바로 다음 글자는 무엇일까요?', 'U', 'S', 'W', 'Y', '알파벳 노래를 부르며 앞뒤 순서를 생각해 보자!', '', 1],
    [1, '알파벳 순서에서 D 바로 앞 글자는 무엇일까요?', 'C', 'A', 'E', 'G', '알파벳 노래를 부르며 앞뒤 순서를 생각해 보자!', '', 1],
    [1, '알파벳 순서에서 J 바로 앞 글자는 무엇일까요?', 'I', 'G', 'K', 'M', '알파벳 노래를 부르며 앞뒤 순서를 생각해 보자!', '', 1],
    [1, '알파벳 순서에서 R 바로 앞 글자는 무엇일까요?', 'Q', 'O', 'S', 'U', '알파벳 노래를 부르며 앞뒤 순서를 생각해 보자!', '', 1],
    [1, '알파벳 순서에서 Z 바로 앞 글자는 무엇일까요?', 'Y', 'V', 'W', 'X', '알파벳 노래를 부르며 앞뒤 순서를 생각해 보자!', '', 1],
    [2, '영어로 공을 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'B', 'D', 'M', 'S', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '공', 1],
    [2, '영어로 오리를 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'D', 'B', 'F', 'T', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '오리', 1],
    [2, '영어로 물고기를 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'F', 'H', 'M', 'S', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '물고기', 1],
    [2, '영어로 챙이 둘러진 모자를 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'H', 'B', 'N', 'T', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '', 1],
    [2, '영어로 사자를 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'L', 'M', 'R', 'S', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '사자', 1],
    [2, '영어로 밤하늘의 달을 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'M', 'B', 'N', 'W', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '', 1],
    [2, '영어로 코를 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'N', 'D', 'L', 'M', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '코', 1],
    [2, '영어로 돼지를 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'P', 'B', 'D', 'T', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '돼지', 1],
    [2, '영어로 토끼를 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'R', 'F', 'L', 'S', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '토끼', 1],
    [2, '영어로 양말을 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'S', 'F', 'M', 'T', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '양말', 1],
    [2, '영어로 호랑이를 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'T', 'B', 'D', 'P', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '호랑이', 1],
    [2, '영어로 밴을 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'V', 'B', 'F', 'W', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '', 1],
    [2, '영어로 창문을 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'W', 'H', 'M', 'V', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '창문', 1],
    [2, '영어로 요요를 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'Y', 'L', 'R', 'W', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '', 1],
    [2, '영어로 얼룩말을 말할 때 첫소리와 이어지는 글자는 무엇일까요?', 'Z', 'B', 'D', 'S', '영어 낱말을 천천히 말하며 처음 소리를 들어 보자!', '얼룩말', 1],
    [2, '영어로 말할 때, 바나나와 첫소리가 같은 낱말은 무엇일까요?', 'ball', 'sun', 'fish', 'moon', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 오리와 첫소리가 같은 낱말은 무엇일까요?', 'dog', 'pig', 'hat', 'nose', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 물고기와 첫소리가 같은 낱말은 무엇일까요?', 'fan', 'rabbit', 'tiger', 'ball', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 챙이 둘러진 모자와 첫소리가 같은 낱말은 무엇일까요?', 'hand', 'sock', 'moon', 'pig', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 사자와 첫소리가 같은 낱말은 무엇일까요?', 'lemon', 'window', 'nose', 'fish', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 밤하늘의 달과 첫소리가 같은 낱말은 무엇일까요?', 'milk', 'dog', 'sun', 'rabbit', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 코와 첫소리가 같은 낱말은 무엇일까요?', 'net', 'ball', 'hat', 'pig', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 돼지와 첫소리가 같은 낱말은 무엇일까요?', 'pen', 'moon', 'fish', 'tiger', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 토끼와 첫소리가 같은 낱말은 무엇일까요?', 'red', 'sun', 'milk', 'nose', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 양말과 첫소리가 같은 낱말은 무엇일까요?', 'sun', 'hat', 'pen', 'dog', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 호랑이와 첫소리가 같은 낱말은 무엇일까요?', 'top', 'fish', 'ball', 'milk', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 창문과 첫소리가 같은 낱말은 무엇일까요?', 'water', 'nose', 'rabbit', 'sun', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 침대와 첫소리가 같은 낱말은 무엇일까요?', 'bus', 'hat', 'fish', 'top', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 문과 첫소리가 같은 낱말은 무엇일까요?', 'doll', 'moon', 'pen', 'sun', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [2, '영어로 말할 때, 가족과 첫소리가 같은 낱말은 무엇일까요?', 'fox', 'bed', 'water', 'net', '두 낱말을 천천히 말하며 맨 처음 소리를 비교해 보자!', '', 0],
    [3, '빨간색을 영어로 말하면 무엇일까요?', 'red', 'blue', 'green', 'yellow', '색 이름을 영어로 하나씩 떠올려 보자!', '', 0],
    [3, '파란색을 영어로 말하면 무엇일까요?', 'blue', 'red', 'black', 'white', '색 이름을 영어로 하나씩 떠올려 보자!', '', 0],
    [3, '노란색을 영어로 말하면 무엇일까요?', 'yellow', 'green', 'blue', 'purple', '색 이름을 영어로 하나씩 떠올려 보자!', '', 0],
    [3, '초록색을 영어로 말하면 무엇일까요?', 'green', 'yellow', 'red', 'black', '색 이름을 영어로 하나씩 떠올려 보자!', '', 0],
    [3, '검은색을 영어로 말하면 무엇일까요?', 'black', 'white', 'blue', 'green', '색 이름을 영어로 하나씩 떠올려 보자!', '', 0],
    [3, '하얀색을 영어로 말하면 무엇일까요?', 'white', 'black', 'yellow', 'red', '색 이름을 영어로 하나씩 떠올려 보자!', '', 0],
    [3, '블록 한 개를 영어로 셀 때 쓰는 말은 무엇일까요?', 'one', 'two', 'three', 'four', '손가락으로 수를 세며 영어 수 이름을 떠올려 보자!', '', 0],
    [3, '블록 두 개를 영어로 셀 때 쓰는 말은 무엇일까요?', 'two', 'one', 'four', 'six', '손가락으로 수를 세며 영어 수 이름을 떠올려 보자!', '', 0],
    [3, '블록 세 개를 영어로 셀 때 쓰는 말은 무엇일까요?', 'three', 'two', 'five', 'six', '손가락으로 수를 세며 영어 수 이름을 떠올려 보자!', '', 0],
    [3, '블록 네 개를 영어로 셀 때 쓰는 말은 무엇일까요?', 'four', 'one', 'three', 'five', '손가락으로 수를 세며 영어 수 이름을 떠올려 보자!', '', 0],
    [3, '블록 다섯 개를 영어로 셀 때 쓰는 말은 무엇일까요?', 'five', 'two', 'four', 'six', '손가락으로 수를 세며 영어 수 이름을 떠올려 보자!', '', 0],
    [3, '블록 여섯 개를 영어로 셀 때 쓰는 말은 무엇일까요?', 'six', 'one', 'three', 'five', '손가락으로 수를 세며 영어 수 이름을 떠올려 보자!', '', 0],
    [3, '멍멍 짖는 동물을 영어로 무엇이라고 할까요?', 'dog', 'cat', 'pig', 'duck', '어떤 동물의 울음소리인지 떠올려 보자!', '', 0],
    [3, '야옹 하고 우는 동물을 영어로 무엇이라고 할까요?', 'cat', 'dog', 'cow', 'horse', '집에서 함께 사는 작은 동물을 생각해 보자!', '', 0],
    [3, '꿀꿀 하고 우는 동물을 영어로 무엇이라고 할까요?', 'pig', 'duck', 'cat', 'cow', '코가 납작한 농장 동물을 떠올려 보자!', '', 0],
    [3, '꽥꽥 울며 물 위에 뜨는 동물을 영어로 무엇이라고 할까요?', 'duck', 'dog', 'rabbit', 'pig', '넓적한 부리와 물갈퀴가 있는 동물을 떠올려 보자!', '', 0],
    [3, '긴 귀로 소리를 듣고 깡충 뛰는 동물을 영어로 무엇이라고 할까요?', 'rabbit', 'horse', 'cow', 'cat', '당근을 먹는 작은 동물을 생각해 보자!', '', 0],
    [3, '커다란 몸에 긴 코가 있는 동물을 영어로 무엇이라고 할까요?', 'elephant', 'rabbit', 'duck', 'dog', '코로 물을 뿜는 동물을 떠올려 보자!', '', 0],
    [3, '박수를 칠 때 마주치는 손을 영어로 무엇이라고 할까요?', 'hand', 'foot', 'nose', 'ear', '짝짝 소리를 낼 때 쓰는 몸의 부분을 떠올려 보자!', '', 0],
    [3, '신발을 신는 발을 영어로 무엇이라고 할까요?', 'foot', 'hand', 'eye', 'mouth', '걸을 때 땅에 닿는 몸의 부분을 생각해 보자!', '', 0],
    [3, '꽃향기를 맡는 코를 영어로 무엇이라고 할까요?', 'nose', 'ear', 'hand', 'foot', '향기를 맡을 때 어디를 쓰는지 떠올려 보자!', '', 0],
    [3, '소리를 듣는 귀를 영어로 무엇이라고 할까요?', 'ear', 'eye', 'nose', 'mouth', '친구가 부르는 소리를 듣는 곳을 생각해 보자!', '', 0],
    [3, '사물을 보는 눈을 영어로 무엇이라고 할까요?', 'eye', 'ear', 'foot', 'hand', '책 속 그림을 볼 때 쓰는 곳을 떠올려 보자!', '', 0],
    [3, '음식을 먹는 입을 영어로 무엇이라고 할까요?', 'mouth', 'nose', 'eye', 'ear', '맛있는 음식을 어디로 먹는지 생각해 보자!', '', 0],
    [3, '친구를 만나서 안녕 하고 인사할 때 영어로 무엇이라고 할까요?', 'Hello', 'Goodbye', 'Thank you', 'Sorry', '반갑게 만난 친구에게 하는 인사를 떠올려 보자!', '', 0],
    [3, '친구와 헤어지며 잘 가라고 인사할 때 영어로 무엇이라고 할까요?', 'Goodbye', 'Hello', 'Thank you', 'Sorry', '만날 때와 헤어질 때 인사가 어떻게 다른지 생각해 보자!', '', 0],
    [3, '아침에 만나서 하는 인사를 영어로 무엇이라고 할까요?', 'Good morning', 'Good night', 'Thank you', 'Sorry', '해가 떠서 하루를 시작하는 때의 인사를 떠올려 보자!', '', 0],
    [3, '잠자리에 들며 잘 자라고 인사할 때 영어로 무엇이라고 할까요?', 'Good night', 'Good morning', 'Hello', 'Thank you', '밤에 잠들기 전에 나누는 인사를 떠올려 보자!', '', 0],
    [3, '친구가 도와줬어요. 고마워는 영어로 무엇일까요?', 'Thank you', 'Sorry', 'Goodbye', 'Good night', '도움을 받아 기쁜 마음을 전하는 말을 생각해 보자!', '', 0],
    [3, '친구 발을 실수로 밟았어요. 미안해는 영어로 무엇일까요?', 'Sorry', 'Thank you', 'Hello', 'Good morning', '실수했을 때 친구 마음을 달래는 말을 떠올려 보자!', '', 0]
  ];
  const MORE_CREATIVE = [
    [1, '과일이 아닌 것은 무엇일까요?', '연필', '사과', '바나나', '포도', '나무에서 열리거나 먹을 수 있는 것끼리 모아 보자!', '', 0],
    [1, '몸에 입거나 신는 것이 아닌 것은 무엇일까요?', '냄비', '양말', '장갑', '신발', '외출할 때 몸에 걸치는 것들을 떠올려 보자!', '', 0],
    [1, '동물이 아닌 것은 무엇일까요?', '자동차', '토끼', '돼지', '고양이', '살아서 움직이는 친구들을 찾아보자!', '', 0],
    [1, '음식이 아닌 것은 무엇일까요?', '의자', '피자', '빵', '치즈', '먹을 수 있는 것끼리 모아 보자!', '', 0],
    [1, '탈것이 아닌 것은 무엇일까요?', '공책', '버스', '기차', '자전거', '우리를 태워 이동하는 것끼리 모아 보자!', '', 0],
    [1, '종이에 그림을 다 그렸어요. 쓰던 색연필은 어떻게 할까요?', '제자리에 넣어', '바닥에 던져', '입에 넣어', '밖으로 버려', '다음에도 쓸 수 있게 정리하는 방법을 생각해 보자!', '', 0],
    [1, '잠옷을 입고 이불을 덮었어요. 이제 무엇을 할까요?', '잠을 자', '모래를 파', '목욕을 해', '공을 차', '하루를 마치고 쉬는 시간을 떠올려 보자!', '', 0],
    [1, '집에 들어가기 전에 신발은 어떻게 할까요?', '벗어', '옷 속에 넣어', '베개에 올려', '손에 신어', '깨끗한 집 안으로 들어가는 모습을 생각해 보자!', '', 0],
    [1, '퍼즐 조각을 모두 맞췄어요. 다시 하려면 먼저 무엇을 할까요?', '하나씩 떼어', '종이를 잘라', '풀로 붙여', '물을 부어', '처음의 흩어진 모습으로 돌아가는 방법을 생각해 보자!', '', 0],
    [1, '길에서 과자 봉지를 주웠어요. 어디에 넣을까요?', '쓰레기통', '어항', '책장', '옷장', '쓰고 남은 것을 모으는 자리를 떠올려 보자!', '', 0],
    [1, '비눗방울을 손가락으로 콕 찔렀어요. 어떻게 될까요?', '터져', '돌이 돼', '깃털이 나', '단단해져', '아주 얇은 막을 건드렸을 때를 떠올려 보자!', '', 0],
    [1, '공을 손에서 놓았어요. 공은 어디로 갈까요?', '바닥으로 떨어져', '손 안에 남아', '천장에 붙어', '하늘로 사라져', '손으로 잡아 주지 않을 때를 생각해 보자!', '', 0],
    [1, '불을 끄면 방 안은 어떻게 될까요?', '어두워져', '더 환해져', '물로 가득 차', '나무가 자라', '밤에 전등을 껐을 때를 떠올려 보자!', '', 0],
    [1, '모래 위를 걸었어요. 뒤에 무엇이 남을까요?', '발자국', '무지개', '벌집', '구름', '발로 밟은 자리를 살펴보자!', '', 0],
    [1, '비누로 씻던 손을 물에 헹궜어요. 거품은 어떻게 될까요?', '씻겨 내려가', '털이 돼', '손에 뿌리를 내려', '돌로 변해', '흐르는 물이 무엇을 데려갈지 생각해 보자!', '', 0],
    [1, '꽃이 피고 새싹이 돋기 시작하는 계절은 언제일까요?', '봄', '겨울', '여름', '가을', '추운 날이 지나고 따뜻해질 때를 생각해 보자!', '', 0],
    [1, '단풍잎이 붉어지고 낙엽이 많이 지는 계절은 언제일까요?', '가을', '봄', '여름', '겨울', '나무가 겨울을 준비하는 모습을 떠올려 보자!', '', 0],
    [1, '눈이 쌓인 언덕에서 타기 좋은 것은 무엇일까요?', '썰매', '자전거', '오토바이', '발레화', '미끄러운 눈 위에서 즐기는 놀이를 생각해 보자!', '', 0],
    [1, '햇볕이 뜨거운 날, 머리를 가려 주는 것은 무엇일까요?', '모자', '컵', '숟가락', '양말', '밖에 나갈 때 머리에 쓰는 것을 찾아보자!', '', 0],
    [1, '비가 그쳐도 웅덩이가 남아 있어요. 발이 젖지 않게 신는 것은 무엇일까요?', '장화', '양말', '슬리퍼', '실내화', '물이 스며들지 않는 신발을 떠올려 보자!', '', 0],
    [1, '차를 타고 자리에 앉았어요. 출발 전에 무엇을 할까요?', '안전띠를 매', '창밖으로 몸을 내밀어', '자리에서 뛰어', '문을 열어', '몸이 자리에 잘 머물게 하는 방법을 생각해 보자!', '', 0],
    [1, '길가로 공이 굴러갔어요. 어떻게 할까요?', '어른에게 부탁해', '바로 뛰어가', '눈을 감고 달려', '차 뒤로 숨어', '차가 다니는 곳에서는 누구와 함께해야 할지 생각해 보자!', '', 0],
    [1, '낯선 사람이 같이 가자고 해요. 어떻게 할까요?', '보호자에게 달려가', '이름표를 건네', '손잡고 멀리 가', '혼자 따라가', '나를 돌봐 주는 사람을 떠올려 보자!', '', 0],
    [1, '놀이가 끝난 작은 블록이 바닥에 있어요. 어떻게 할까요?', '상자에 정리해', '입에 넣어', '발로 차', '계단에 뿌려', '밟고 넘어지지 않도록 하는 방법을 생각해 보자!', '', 0],
    [1, '높은 미끄럼틀 계단에서는 어떻게 올라갈까요?', '난간을 잡고 천천히 가', '친구를 밀어', '뒤로 뛰어가', '눈을 감고 올라가', '떨어지지 않게 몸을 지탱할 방법을 생각해 보자!', '', 0],
    [1, '친구가 생일 선물을 받고 활짝 웃어요. 어떤 기분일까요?', '기뻐', '무서워', '슬퍼', '화나', '웃는 얼굴과 즐거운 순간을 함께 떠올려 보자!', '', 0],
    [1, '아끼던 장난감을 잃어버려 눈물이 나요. 어떤 기분일까요?', '슬퍼', '뿌듯해', '즐거워', '신나', '소중한 것이 없어졌을 때를 생각해 보자!', '', 0],
    [1, '어두운 곳에서 큰 소리가 나서 몸이 움찔했어요. 어떤 기분일까요?', '무서워', '편안해', '든든해', '뿌듯해', '깜짝 놀랐을 때의 마음을 떠올려 보자!', '', 0],
    [1, '혼자 옷의 단추를 다 잠갔어요. 해내서 자랑스러운 마음은 어떨까요?', '뿌듯해', '심심해', '무서워', '섭섭해', '처음으로 혼자 해낸 일을 떠올려 보자!', '', 0],
    [1, '친구가 장난감을 빌려줬어요. 어떤 말을 하면 좋을까요?', '고마워', '내 거야', '저리 가', '빌려주지 마', '도움을 받았을 때 마음을 전해 보자!', '', 0],
    [1, '이 중 몸집이 가장 큰 동물은 무엇일까요?', '코끼리', '벌', '무당벌레', '개미', '사람보다 훨씬 큰 동물을 찾아보자!', '', 0],
    [1, '이 중 손가락 끝에 올라갈 만큼 작은 동물은 무엇일까요?', '개미', '말', '기린', '소', '작은 틈으로도 지나가는 동물을 떠올려 보자!', '', 0],
    [1, '이 중 목이 가장 긴 동물은 무엇일까요?', '기린', '돼지', '고양이', '토끼', '높은 나뭇잎에 입이 닿는 모습을 떠올려 보자!', '', 0],
    [1, '아기 손보다 훨씬 큰 물건은 무엇일까요?', '냉장고', '동전', '지우개', '달걀', '안에 물건을 많이 넣을 수 있는 것을 생각해 보자!', '', 0],
    [1, '작은 컵 하나에 담을 수 있는 것은 무엇일까요?', '동전', '책상', '침대', '기차', '손바닥보다 작은 물건을 찾아보자!', '', 0],
    [1, '내 몸 안에 물을 담고, 손잡이를 잡아 입으로 가져가요. 무엇일까요?', '컵', '국자', '접시', '포크', '목마를 때 손에 드는 것을 떠올려 보자!', '', 0],
    [1, '작은 구멍에 뭉툭한 심을 넣고 돌리면 끝이 뾰족해져요. 무엇일까요?', '연필깎이', '지우개', '테이프', '공책', '짧아진 연필 끝을 다듬는 도구를 떠올려 보자!', '', 0],
    [1, '동그란 바퀴 둘을 발로 굴리며 타요. 무엇일까요?', '자전거', '기차', '비행기', '돛단배', '두 발로 페달을 밟는 모습을 떠올려 보자!', '', 0],
    [1, '얼굴 앞에 두 개의 알을 걸쳐 쓰면 더 잘 보여요. 무엇일까요?', '안경', '목도리', '장갑', '모자', '눈앞에 걸치는 물건을 찾아보자!', '', 0],
    [1, '바람을 넣으면 통통해지고 줄을 잡고 가지고 놀아요. 무엇일까요?', '풍선', '책', '돌', '접시', '바람이 빠지면 쪼그라드는 것을 떠올려 보자!', '', 0],
    [2, '주방에서 음식을 먹을 때 쓰는 물건이 아닌 것은 무엇일까요?', '빗', '숟가락', '포크', '젓가락', '밥상에 놓는 물건끼리 모아 보자!', '', 0],
    [2, '날개가 있어도 곤충은 아닌 것은 무엇일까요?', '참새', '벌', '나비', '잠자리', '깃털이 있는 동물을 찾아보자!', '', 0],
    [2, '바퀴가 있어도 사람이 타고 다니는 물건은 아닌 것은 무엇일까요?', '장난감 자동차', '자전거', '오토바이', '버스', '우리가 실제로 올라탈 수 있는지 생각해 보자!', '', 0],
    [2, '물에 살아도 물고기는 아닌 것은 무엇일까요?', '고래', '잉어', '금붕어', '상어', '물 위로 나와 숨 쉬는 동물을 떠올려 보자!', '', 0],
    [2, '종이를 쓰는 활동에 필요하지 않은 것은 무엇일까요?', '국자', '연필', '지우개', '색연필', '글을 쓰거나 그림을 그리는 모습을 떠올려 보자!', '', 0],
    [2, '색종이를 접어 모양을 만들어요. 풀을 바른 뒤 붙이기 전에 무엇을 할까요?', '붙일 자리를 맞춰', '물에 씻어', '바닥에 던져', '공처럼 차', '원하는 곳에 잘 붙이는 순서를 생각해 보자!', '', 0],
    [2, '끈 있는 운동화를 신으려 해요. 끈을 묶기 전에 무엇을 할까요?', '발을 쏙 넣어', '끈을 잘라', '장갑을 껴', '신발을 벗어', '매고 나서 걸을 수 있게 준비해 보자!', '', 0],
    [2, '책을 빌리려고 도서관에 왔어요. 읽고 싶은 책을 찾은 뒤 무엇을 할까요?', '사서 선생님께 가져가', '바닥에 숨겨', '그냥 들고 나가', '책을 찢어', '함께 쓰는 책을 빌리는 방법을 떠올려 보자!', '', 0],
    [2, '젖은 그림 위에 손을 대면 번져요. 액자에 넣기 전에 무엇을 할까요?', '마를 때까지 기다려', '물을 더 뿌려', '손으로 문질러', '접어서 눌러', '물감이 손에 묻지 않을 때를 생각해 보자!', '', 0],
    [2, '소풍 가방에 물과 간식을 넣었어요. 빠진 것이 없는지 언제 살펴볼까요?', '출발하기 전에', '집에 돌아온 뒤에', '잠든 뒤에', '다 먹은 뒤에', '필요한 것을 챙길 수 있는 때를 생각해 보자!', '', 0],
    [2, '우산을 접자 바닥에 물이 떨어졌어요. 왜 그럴까요?', '빗방울이 묻어서', '신발 안에서 끓어서', '천장에서 얼어서', '바닥에서 솟아서', '밖에서 비를 맞은 물건을 떠올려 보자!', '', 0],
    [2, '흙탕물이 든 컵을 가만히 두었어요. 무거운 흙은 어디에 모일까요?', '맨 아래', '맨 위', '공중', '컵 밖', '무거운 알갱이가 가라앉는 모습을 생각해 보자!', '', 0],
    [2, '빙글 돌던 팽이가 점점 느려졌어요. 계속 두면 어떻게 될까요?', '쓰러져 멈춰', '계속 더 빨라져', '높이 날아가', '나무가 자라', '손으로 더 돌려 주지 않을 때를 생각해 보자!', '', 0],
    [2, '텅 빈 상자에 장난감을 가득 넣었어요. 들면 전보다 어떨까요?', '더 무거워', '더 가벼워', '무게가 없어', '항상 똑같아', '안에 들어간 물건들의 무게를 생각해 보자!', '', 0],
    [2, '물이 든 컵을 옆으로 기울였어요. 가장자리를 넘은 물은 어떻게 될까요?', '밖으로 흘러', '종이로 변해', '컵 안에서 얼어', '거꾸로 솟아', '컵의 열린 쪽과 기울어진 방향을 살펴보자!', '', 0],
    [2, '겨울 산책에 목도리와 장갑을 챙겼어요. 함께 입기 좋은 것은 무엇일까요?', '두꺼운 외투', '수영복', '민소매', '반바지', '몸의 열이 달아나지 않게 해 주는 옷을 찾아보자!', '', 0],
    [2, '더운 여름, 햇볕 아래 오래 걸었어요. 쉬려면 어디가 좋을까요?', '나무 그늘', '뜨거운 아스팔트 위', '햇볕 드는 미끄럼틀', '차가 다니는 길', '햇빛을 가려 주고 차가 없는 곳을 생각해 보자!', '', 0],
    [2, '바람이 세게 불어요. 날아가지 않게 붙잡을 것은 무엇일까요?', '쓰고 있는 모자', '땅에 박힌 바위', '건물 벽', '큰 나무 뿌리', '가볍고 몸에서 벗겨질 수 있는 것을 찾아보자!', '', 0],
    [2, '봄 소풍에서 핀 꽃을 오래 보려면 어떻게 할까요?', '꺾지 않고 구경해', '발로 밟아', '쓰레기로 덮어', '뿌리째 뽑아', '그 자리에서 계속 자랄 수 있게 생각해 보자!', '', 0],
    [2, '가을에 떨어진 잎을 관찰해요. 무엇으로 보면 작은 줄이 잘 보일까요?', '돋보기', '목도리', '빗', '포크', '작은 것을 크게 보여 주는 도구를 찾아보자!', '', 0],
    [2, '공원에서 보호자가 보이지 않아요. 어떻게 할까요?', '안내소 직원에게 도움을 청해', '혼자 멀리 찾아가', '낯선 차에 타', '주차장으로 뛰어가', '일하는 어른이 있는 곳에서 도움받는 방법을 생각해 보자!', '', 0],
    [2, '길을 건너려는데 초록 불이 깜빡이기 시작했어요. 아직 인도에 있다면 어떻게 할까요?', '다음 신호를 기다려', '급히 뛰어들어', '눈을 감고 건너', '공을 굴리며 가', '서두르지 않고 충분한 시간이 있을 때를 생각해 보자!', '', 0],
    [2, '집에서 타는 냄새가 나요. 가까이 가지 않고 먼저 무엇을 할까요?', '어른에게 바로 알려', '이불을 덮고 숨어', '혼자 불 옆으로 가', '장난감으로 가려', '혼자 해결하려 하지 말고 도움받을 사람을 떠올려 보자!', '', 0],
    [2, '친구가 탄 그네가 앞뒤로 움직여요. 지나가려면 어떻게 할까요?', '멀찍이 돌아서 가', '친구 발을 잡아', '그네 바로 앞을 뛰어가', '그네 밑으로 기어가', '그네가 닿지 않는 길을 생각해 보자!', '', 0],
    [2, '장난감이 높은 선반 위에 있어요. 손이 닿지 않으면 어떻게 할까요?', '어른에게 꺼내 달라고 해', '서랍을 계단처럼 밟아', '의자 위에 상자를 쌓아', '손잡이에 매달려', '가구가 넘어지지 않게 도움받을 방법을 생각해 보자!', '', 0],
    [2, '친구가 내 옆에서 함께 놀고 싶어 해요. 어떻게 말하면 좋을까요?', '같이 하자', '넌 안 돼', '저리 가', '장난감 다 내 거야', '친구를 놀이에 초대하는 말을 찾아보자!', '', 0],
    [2, '블록 탑이 무너져 친구가 울먹여요. 어떻게 말하면 좋을까요?', '속상하겠다, 같이 다시 쌓자', '울면 안 놀아', '다 버리자', '네가 못해서 그래', '마음을 알아주고 도와주는 말을 찾아보자!', '', 0],
    [2, '친구가 빌려 간 공을 돌려주지 않아 속상해요. 어떻게 말하면 좋을까요?', '나도 쓰고 싶어, 이제 줄래', '공을 터뜨릴 거야', '너랑 다시는 안 놀아', '가방을 던질 거야', '내 마음과 바라는 일을 차분하게 말해 보자!', '', 0],
    [2, '놀다가 실수로 친구 그림을 찢었어요. 어떻게 할까요?', '미안하다고 하고 함께 고쳐', '못 본 척해', '친구 탓을 해', '그림을 숨겨', '내 실수를 인정하고 도울 방법을 생각해 보자!', '', 0],
    [2, '같이 놀던 친구가 조금 쉬고 싶대요. 어떻게 할까요?', '잠깐 기다려 줘', '계속 뛰라고 밀어', '못 쉬게 막아', '물건을 빼앗아', '친구의 몸과 마음도 소중하게 생각해 보자!', '', 0],
    [2, '큰 상자 안에 작은 상자가 들어 있어요. 작은 상자를 꺼내 큰 상자를 그 안에 넣을 수 있을까요?', '아니, 너무 커', '응, 물만 뿌리면 돼', '응, 언제나 꼭 맞아', '응, 저절로 작아져', '겉을 둘러싸던 쪽이 어느 쪽인지 생각해 보자!', '', 0],
    [2, '같은 양동이 두 개 중 하나에만 물을 가득 부었어요. 들어 보면 어느 것이 더 무거울까요?', '꽉 찬 쪽', '둘이 똑같아', '텅 빈 쪽', '둘 다 무게가 없어', '안에 들어간 것의 무게를 생각해 보자!', '', 0],
    [2, '똑같은 끈 두 개 중 하나를 반으로 접었어요. 펴 놓은 것과 비교하면 길이는 어떨까요?', '펼치면 같아', '영원히 더 짧아', '펴도 두 배 길어', '길이가 사라져', '자르지 않고 접기만 했다는 걸 생각해 보자!', '', 0],
    [2, '큰 공을 담으려면 입구가 넓은 어떤 물건이 좋을까요?', '바구니', '컵', '양말', '필통', '물건이 들어갈 입구를 떠올려 보자!', '', 0],
    [2, '찰흙 한 덩이를 길게 늘리기만 했어요. 무엇이 달라졌을까요?', '모양', '색깔', '냄새', '무게', '재료를 더하거나 빼지 않았다는 걸 생각해 보자!', '', 0],
    [2, '발은 없지만 소식을 싣고 집집마다 가요. 봉투에 넣어 보내는 나는 무엇일까요?', '편지', '장갑', '양말', '숟가락', '멀리 있는 사람에게 마음을 적어 보내는 것을 떠올려 보자!', '', 0],
    [2, '몸이 닳을수록 종이에 남긴 선이 길어져요. 뾰족한 끝이 있는 나는 무엇일까요?', '색연필', '가위', '자', '테이프', '종이에 문질러 색을 남기는 도구를 찾아보자!', '', 0],
    [2, '입은 없지만 글과 그림으로 이야기를 들려줘요. 장을 넘기는 나는 무엇일까요?', '책', '냄비', '신발', '돌', '여러 장을 묶어 놓은 물건을 떠올려 보자!', '', 0],
    [2, '먹지도 않는데 휴지와 과자 봉지를 삼키고, 가득 차면 비워 줘요. 나는 무엇일까요?', '쓰레기통', '발레화', '칫솔', '책상', '버릴 것을 잠시 모아 두는 곳을 떠올려 보자!', '', 0],
    [2, '둘이 마주치면 짝짝 소리가 나요. 장갑 속에 들어가는 것은 무엇일까요?', '손', '발', '귀', '코', '반가울 때 마주쳐 소리 내는 몸의 부분을 생각해 보자!', '', 0]
  ];
  // 한글·영어는 단계(level)로 고르고 쉬움·도전은 기존 문제와 같게 정한다(한글 1~3단계·영어 1단계는 쉬움).
  const MORE_EASY_UNTIL = { korean: 3, english: 1 };
  [['korean', MORE_KOREAN], ['english', MORE_ENGLISH], ['creative', MORE_CREATIVE]].forEach(([area, rows]) => {
    rows.forEach(([step, prompt, answer, first, second, third, hint, visual, silentOptions]) => {
      const extra = { hint };
      // 낱말 하나뿐인 visual 은 글자로 보이므로(js/learning-art.js sequenceHtml) learn: 그림 값으로 넘겨 그림만 보이게 한다(이름이 답의 실마리).
      if (visual) extra.visual = `learn:${visual}`;
      if (silentOptions) extra.silentOptions = true;
      if (area === 'creative') {
        add(area, step, prompt, answer, [first, second, third], extra);
        return;
      }
      add(area, step <= MORE_EASY_UNTIL[area] ? 1 : 2, prompt, answer, [first, second, third], { ...extra, level: step });
    });
  });


  // 2026-11-14 가장 어려운 단계 위 문제(Codex 작성, 원본 .data/question-bank/harder-questions.json): 한글 7단계 「문장」·영어 4단계 「문장」 각 40, 창의력 「도전+」(difficulty 3) 40.
  // 힌트·한글/창의력 보기는 게임 말투(반말)로 옮겼다(‘둘째예요’ → ‘둘째’). 영어 뜻 보기는 번역 문장이라 그대로. 줄 모양은 MORE_ 와 같다.
  const HARDER_KOREAN = [
    [7, '‘수아는 이를 닦아요’ 무엇을 쓸까요?', '칫솔', '빗', '수건', '컵', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘준호는 그림을 그려요’ 무엇이 필요할까요?', '색연필', '수저', '장갑', '비누', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘헝클어진 머리를 정리해요’ 무엇을 쓰면 좋을까요?', '빗', '자', '우산', '포크', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘민지는 비를 피해요’ 머리 위에 무엇을 펼까요?', '우산', '공책', '숟가락', '양말', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘아이는 배가 고파요’ 무엇을 먹으면 좋을까요?', '밥', '물', '옷', '책', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘유나는 목이 말라요’ 무엇을 마시면 좋을까요?', '물', '밥', '빵', '떡', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘동생은 졸려서 누워요’ 어디로 가면 좋을까요?', '침대', '놀이터', '부엌', '현관', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘엄마는 겨울 장갑을 껴요’ 손이 어떻게 느껴졌을까요?', '추워', '더워', '배불러', '졸려', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘친구가 선물을 줘요’ 받은 사람의 마음은 어떨까요?', '기뻐', '화나', '졸려', '심심해', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘유나는 도움을 받았어요’ 뭐라고 인사하면 좋을까요?', '고마워', '미안해', '잘 자', '잘 가', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘민수는 책을 빌려요’ 어디에 갔을까요?', '도서관', '운동장', '수영장', '우체국', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘서아는 편지를 보내요’ 어디에 가면 좋을까요?', '우체국', '도서관', '놀이터', '목욕탕', '문장 속 사람이 하는 일과 상황을 떠올려 보자!', '', 0],
    [7, '‘나비가 □ 날아요’ 빈칸에 어울리는 낱말은 무엇일까요?', '팔랑팔랑', '데굴데굴', '쿨쿨', '엉금엉금', '빈칸에 보기를 하나씩 넣어 읽어 보자!', '', 0],
    [7, '‘바퀴가 □ 굴러요’ 빈칸에 어울리는 낱말은 무엇일까요?', '데굴데굴', '팔랑팔랑', '깡충깡충', '꼬불꼬불', '빈칸에 보기를 하나씩 넣어 읽어 보자!', '', 0],
    [7, '‘아기는 □ 자요’ 빈칸에 어울리는 낱말은 무엇일까요?', '쿨쿨', '주룩주룩', '깡충깡충', '데굴데굴', '빈칸에 보기를 하나씩 넣어 읽어 보자!', '', 0],
    [7, '‘토끼가 □ 뛰어요’ 빈칸에 어울리는 낱말은 무엇일까요?', '깡충깡충', '쿨쿨', '팔랑팔랑', '엉금엉금', '빈칸에 보기를 하나씩 넣어 읽어 보자!', '', 0],
    [7, '‘별이 □ 빛나요’ 빈칸에 어울리는 낱말은 무엇일까요?', '반짝반짝', '쿨쿨', '주룩주룩', '데굴데굴', '빈칸에 보기를 하나씩 넣어 읽어 보자!', '', 0],
    [7, '‘비가 □ 내려요’ 빈칸에 어울리는 낱말은 무엇일까요?', '주룩주룩', '깡충깡충', '쿨쿨', '엉금엉금', '빈칸에 보기를 하나씩 넣어 읽어 보자!', '', 0],
    [7, '‘얼음은 아주 □’ 문장을 마치려면 무엇이 알맞을까요?', '차가워', '따뜻해', '부드러워', '시끄러워', '빈칸에 보기를 하나씩 넣어 읽어 보자!', '', 0],
    [7, '‘솜을 만지면 □’ 문장을 마치려면 무엇이 알맞을까요?', '부드러워', '뾰족해', '딱딱해', '시끄러워', '빈칸에 보기를 하나씩 넣어 읽어 보자!', '', 0],
    [7, '‘레몬을 먹으면 □’ 문장을 마치려면 무엇이 알맞을까요?', '셔', '달아', '짜', '매워', '빈칸에 보기를 하나씩 넣어 읽어 보자!', '', 0],
    [7, '‘설탕을 맛보면 □’ 문장을 마치려면 무엇이 알맞을까요?', '달아', '셔', '짜', '매워', '빈칸에 보기를 하나씩 넣어 읽어 보자!', '', 0],
    [7, '‘문밖에 비가 와요’ 알맞은 행동은 무엇일까요?', '우산을 펼쳐 들어', '안경을 접어 넣어', '선풍기를 세게 틀어', '연필을 길게 깎아', '문장 속 상황을 떠올리고 어울리는 행동을 골라 보자!', '', 1],
    [7, '‘추워서 몸이 떨려요’ 알맞은 행동은 무엇일까요?', '두꺼운 외투를 걸쳐', '찬물을 가득 마셔', '부채로 바람을 만들어', '선풍기 앞에 앉아', '문장 속 상황을 떠올리고 어울리는 행동을 골라 보자!', '', 1],
    [7, '‘햇볕에 땀이 나요’ 알맞은 행동은 무엇일까요?', '시원한 그늘로 가', '두꺼운 목도리를 둘러', '따뜻한 장갑을 껴', '두꺼운 이불을 덮어', '문장 속 상황을 떠올리고 어울리는 행동을 골라 보자!', '', 1],
    [7, '‘책장이 너무 높아요’ 어떻게 하면 좋을까요?', '어른에게 도움을 청해', '책갈피를 먼저 만들어', '공책에 그림을 그려', '종이를 반으로 접어', '문장 속 상황을 떠올리고 어울리는 행동을 골라 보자!', '', 1],
    [7, '‘동생이 혼자 심심해요’ 어떤 제안이 좋을까요?', '함께 놀이를 해', '불을 끄고 자', '모자를 쓰고 와', '신발을 가지런히 놓아', '문장 속 상황을 떠올리고 어울리는 행동을 골라 보자!', '', 1],
    [7, '‘친구의 연필을 빌렸어요’ 어떻게 하면 좋을까요?', '사용한 뒤에 돌려줘', '계속 가방에 보관해', '다른 사람에게 건네', '이름표를 새로 붙여', '문장 속 상황을 떠올리고 어울리는 행동을 골라 보자!', '', 1],
    [7, '‘바닥에 장난감이 흩어져요’ 어떤 행동이 알맞을까요?', '상자에 가지런히 넣어', '종이에 이름을 적어', '창밖을 조용히 바라봐', '물컵에 주스를 따라', '문장 속 상황을 떠올리고 어울리는 행동을 골라 보자!', '', 1],
    [7, '‘운동하고 옷이 젖어요’ 어떤 행동이 알맞을까요?', '마른 것으로 갈아입어', '가방에서 책을 꺼내', '공책에 날짜를 써', '책상에 연필을 놓아', '문장 속 상황을 떠올리고 어울리는 행동을 골라 보자!', '', 1],
    [7, '‘화분의 흙이 말라요’ 어떻게 하면 좋을까요?', '물을 조금 줘', '모자를 벗어 놓아', '식탁에 그릇을 놓아', '종이로 배를 접어', '문장 속 상황을 떠올리고 어울리는 행동을 골라 보자!', '', 1],
    [7, '‘마당에 낙엽이 쌓여요’ 무엇을 하면 좋을까요?', '빗자루로 쓸어 모아', '비누로 손을 씻어', '숟가락으로 밥을 떠', '가위로 종이를 오려', '문장 속 상황을 떠올리고 어울리는 행동을 골라 보자!', '', 1],
    [7, '① 신발을 신어요 ② 밖으로 나가요 ③ 양말을 신어요 바른 순서는 무엇일까요?', '3 → 1 → 2', '1 → 3 → 2', '2 → 1 → 3', '3 → 2 → 1', '가장 먼저 할 일부터 차례대로 떠올려 보자!', '', 0],
    [7, '① 껍질을 벗겨요 ② 한입 먹어요 ③ 바나나를 집어요 바른 순서는 무엇일까요?', '3 → 1 → 2', '1 → 2 → 3', '2 → 3 → 1', '3 → 2 → 1', '가장 먼저 할 일부터 차례대로 떠올려 보자!', '', 0],
    [7, '① 그림을 완성해요 ② 종이를 꺼내요 ③ 색을 칠해요 바른 순서는 무엇일까요?', '2 → 3 → 1', '1 → 2 → 3', '3 → 1 → 2', '2 → 1 → 3', '가장 먼저 할 일부터 차례대로 떠올려 보자!', '', 0],
    [7, '① 물을 부어요 ② 빈 컵을 놓아요 ③ 한 모금 마셔요 바른 순서는 무엇일까요?', '2 → 1 → 3', '1 → 2 → 3', '3 → 1 → 2', '2 → 3 → 1', '가장 먼저 할 일부터 차례대로 떠올려 보자!', '', 0],
    [7, '① 상자를 닫아요 ② 선물을 넣어요 ③ 뚜껑을 열어요 바른 순서는 무엇일까요?', '3 → 2 → 1', '1 → 2 → 3', '2 → 1 → 3', '3 → 1 → 2', '가장 먼저 할 일부터 차례대로 떠올려 보자!', '', 0],
    [7, '① 입을 헹궈요 ② 이를 닦아요 ③ 칫솔에 치약을 짜요 바른 순서는 무엇일까요?', '3 → 2 → 1', '1 → 2 → 3', '2 → 3 → 1', '3 → 1 → 2', '가장 먼저 할 일부터 차례대로 떠올려 보자!', '', 0],
    [7, '① 이불을 덮어요 ② 잠자리에 누워요 ③ 잠옷으로 갈아입어요 바른 순서는 무엇일까요?', '3 → 2 → 1', '1 → 2 → 3', '2 → 1 → 3', '3 → 1 → 2', '가장 먼저 할 일부터 차례대로 떠올려 보자!', '', 0],
    [7, '① 장난감을 꺼내요 ② 놀이를 끝내요 ③ 상자에 정리해요 바른 순서는 무엇일까요?', '1 → 2 → 3', '2 → 1 → 3', '3 → 2 → 1', '1 → 3 → 2', '가장 먼저 할 일부터 차례대로 떠올려 보자!', '', 0]
  ];
  const HARDER_ENGLISH = [
    [4, '‘I like apples.’의 뜻은 무엇일까요?', '저는 사과를 좋아해요.', '저는 우유를 좋아해요.', '저는 사과를 씻어요.', '저는 바나나를 먹어요.', '좋아하는 대상이 무엇인지 살펴보자!', '', 0],
    [4, '‘I am happy.’의 뜻은 무엇일까요?', '저는 기뻐요.', '저는 졸려요.', '저는 배고파요.', '저는 슬퍼요.', '마음을 나타내는 마지막 낱말을 살펴보자!', '', 0],
    [4, '‘I am hungry.’의 뜻은 무엇일까요?', '저는 배고파요.', '저는 기뻐요.', '저는 졸려요.', '저는 목말라요.', '문장 끝에서 몸의 느낌을 나타내는 낱말을 읽어 보자!', '', 0],
    [4, '‘I can swim.’의 뜻은 무엇일까요?', '저는 수영할 수 있어요.', '저는 노래할 수 있어요.', '저는 뛸 수 있어요.', '저는 춤출 수 있어요.', '물속에서 하는 움직임을 나타내는 낱말을 찾아보자!', '', 0],
    [4, '‘I can jump.’의 뜻은 무엇일까요?', '저는 뛸 수 있어요.', '저는 수영할 수 있어요.', '저는 잘 수 있어요.', '저는 읽을 수 있어요.', '몸을 위로 움직이는 동작을 떠올려 보자!', '', 0],
    [4, '‘It is red.’의 뜻은 무엇일까요?', '그것은 빨간색이에요.', '그것은 파란색이에요.', '그것은 노란색이에요.', '그것은 초록색이에요.', '문장 끝에 있는 색 이름을 읽어 보자!', '', 0],
    [4, '‘It is big.’의 뜻은 무엇일까요?', '그것은 커요.', '그것은 작아요.', '그것은 길어요.', '그것은 짧아요.', '크기를 나타내는 마지막 낱말을 살펴보자!', '', 0],
    [4, '‘This is mine.’의 뜻은 무엇일까요?', '이것은 제 것이에요.', '이것은 제 친구예요.', '이것은 빨간색이에요.', '이것은 작은 공이에요.', '누구의 물건인지 나타내는 마지막 낱말을 살펴보자!', '', 0],
    [4, '‘a small cat’의 뜻은 무엇일까요?', '작은 고양이예요.', '큰 고양이예요.', '작은 개예요.', '큰 개예요.', '크기를 나타내는 말과 동물 이름을 함께 읽어 보자!', '', 0],
    [4, '‘a big dog’의 뜻은 무엇일까요?', '큰 개예요.', '작은 개예요.', '큰 고양이예요.', '작은 고양이예요.', '동물의 이름뿐 아니라 앞의 꾸밈말도 살펴보자!', '', 0],
    [4, '‘a blue ball’의 뜻은 무엇일까요?', '파란 공이에요.', '빨간 공이에요.', '파란 모자예요.', '노란 모자예요.', '색 이름과 물건 이름을 차례로 읽어 보자!', '', 0],
    [4, '‘two yellow ducks’의 뜻은 무엇일까요?', '노란 오리 두 마리예요.', '노란 오리 세 마리예요.', '파란 오리 두 마리예요.', '노란 개구리 두 마리예요.', '수와 색과 동물 이름을 모두 확인해 보자!', '', 0],
    [4, '‘three green frogs’의 뜻은 무엇일까요?', '초록 개구리 세 마리예요.', '초록 개구리 두 마리예요.', '노란 개구리 세 마리예요.', '초록 오리 세 마리예요.', '처음부터 끝까지 세 낱말의 뜻을 이어 보자!', '', 0],
    [4, '‘my red hat’의 뜻은 무엇일까요?', '제 빨간 모자예요.', '제 파란 모자예요.', '제 빨간 공이에요.', '제 노란 가방이에요.', '누구의 물건인지와 색과 물건 이름을 함께 살펴보자!', '', 0],
    [4, '‘Good morning!’의 뜻은 무엇일까요?', '좋은 아침이에요.', '편안한 밤 보내세요.', '고마워요.', '미안해요.', '하루 중 어느 때에 하는 인사인지 떠올려 보자!', '', 0],
    [4, '‘Good night!’의 뜻은 무엇일까요?', '편안한 밤 보내세요.', '좋은 아침이에요.', '고마워요.', '반가워요.', '잠들기 전에 나누는 인사를 생각해 보자!', '', 0],
    [4, '‘Thank you!’의 뜻은 무엇일까요?', '고마워요.', '미안해요.', '안녕히 가세요.', '좋은 아침이에요.', '도움을 받았을 때 전하는 마음을 떠올려 보자!', '', 0],
    [4, '‘Please help.’의 뜻은 무엇일까요?', '도와주세요.', '함께 읽어요.', '여기에 앉으세요.', '문을 닫으세요.', '도움이 필요할 때 쓰는 말을 떠올려 보자!', '', 0],
    [4, '‘Let\'s read.’의 뜻은 무엇일까요?', '함께 읽어요.', '함께 뛰어요.', '함께 먹어요.', '함께 그려요.', '친구와 무엇을 하자고 하는지 살펴보자!', '', 0],
    [4, '‘We are friends.’의 뜻은 무엇일까요?', '우리는 친구예요.', '우리는 가족이에요.', '우리는 배고파요.', '우리는 기뻐요.', '사람들 사이의 관계를 나타내는 마지막 낱말을 읽어 보자!', '', 0],
    [4, '책을 펼치라고 부탁하는 영어 표현은 무엇일까요?', 'Open your book.', 'Close your eyes.', 'Wash your hands.', 'Touch your nose.', '펼치는 동작과 책을 뜻하는 낱말을 함께 찾아보자!', '', 1],
    [4, '눈을 감으라고 부탁하는 영어 표현은 무엇일까요?', 'Close your eyes.', 'Open your book.', 'Wash your hands.', 'Touch your nose.', '감는 동작과 눈을 뜻하는 낱말을 함께 찾아보자!', '', 1],
    [4, '의자에 앉으라고 권하는 영어 표현은 무엇일까요?', 'Sit down.', 'Stand up.', 'Come here.', 'Look up.', '앉는 동작을 나타내는 낱말을 찾아보자!', '', 1],
    [4, '자리에서 일어서라고 권하는 영어 표현은 무엇일까요?', 'Stand up.', 'Sit down.', 'Come here.', 'Look down.', '서 있는 모습과 어울리는 낱말을 찾아보자!', '', 1],
    [4, '친구에게 이쪽으로 오라고 부르는 영어 표현은 무엇일까요?', 'Come here.', 'Sit down.', 'Stand up.', 'Good night.', '가까이 오도록 부를 때 쓰는 말을 떠올려 보자!', '', 1],
    [4, '친구에게 함께 놀자고 제안하는 영어 표현은 무엇일까요?', 'Let\'s play.', 'Let\'s read.', 'Let\'s eat.', 'Let\'s sleep.', '함께 하자는 말 뒤에 어떤 동작이 오는지 살펴보자!', '', 1],
    [4, '물건을 건네며 여기 있다고 말하는 영어 표현은 무엇일까요?', 'Here you are.', 'I am happy.', 'See you soon.', 'Good morning.', '상대에게 물건을 줄 때 하는 말을 떠올려 보자!', '', 1],
    [4, '실수로 친구와 부딪혀 사과하는 영어 표현은 무엇일까요?', 'I\'m sorry.', 'Thank you.', 'Good morning.', 'Well done.', '실수한 뒤 상대의 마음을 달래는 말을 찾아보자!', '', 1],
    [4, '헤어지며 나중에 다시 만나자고 인사하는 영어 표현은 무엇일까요?', 'See you.', 'Thank you.', 'Good morning.', 'Well done.', '만날 때와 헤어질 때의 인사를 구별해 보자!', '', 1],
    [4, '친구가 잘 해냈을 때 칭찬하는 영어 표현은 무엇일까요?', 'Well done.', 'Good night.', 'See you.', 'Please help.', '잘한 친구를 격려하는 마음을 떠올려 보자!', '', 1],
    [4, '‘I ____ Sam.’에서 자신을 소개하려면 빈칸에 무엇이 들어갈까요?', 'am', 'is', 'are', 'can', '자신을 가리키는 말에 이어지는 짝을 떠올려 보자!', '', 1],
    [4, '‘He ____ happy.’의 빈칸에 알맞은 말은 무엇일까요?', 'is', 'am', 'are', 'like', '한 사람을 가리키는 말에 이어지는 짝을 떠올려 보자!', '', 1],
    [4, '‘We ____ friends.’의 빈칸에 알맞은 말은 무엇일까요?', 'are', 'am', 'is', 'can', '여럿을 가리키는 말에 이어지는 짝을 떠올려 보자!', '', 1],
    [4, '‘I like ____.’에서 사과를 뜻하는 말은 무엇일까요?', 'apples', 'books', 'dogs', 'balls', '좋아하는 대상이 먹는 과일인지 살펴보자!', '', 1],
    [4, '‘a ____ dog’에서 크다는 뜻을 넣으려면 무엇이 알맞을까요?', 'big', 'small', 'red', 'blue', '크기를 나타내는 꾸밈말을 찾아보자!', '', 1],
    [4, '‘a ____ ball’에서 빨간색을 넣으려면 무엇이 알맞을까요?', 'red', 'blue', 'green', 'yellow', '문장 속 물건의 색을 떠올려 보자!', '', 1],
    [4, '‘____ cats’에서 고양이 두 마리를 나타내려면 무엇이 알맞을까요?', 'two', 'one', 'three', 'four', '동물 이름 앞에서 수를 나타내는 말을 찾아보자!', '', 1],
    [4, '‘I can ____.’에서 헤엄칠 수 있다고 말하려면 무엇이 알맞을까요?', 'swim', 'jump', 'sing', 'dance', '물에서 하는 움직임을 나타내는 낱말을 찾아보자!', '', 1],
    [4, '‘Good ____!’에서 아침 인사를 완성하려면 무엇이 알맞을까요?', 'morning', 'night', 'bye', 'cat', '하루가 시작되는 때를 뜻하는 낱말을 찾아보자!', '', 1],
    [4, '‘Thank ____!’에서 감사 인사를 완성하려면 무엇이 알맞을까요?', 'you', 'me', 'we', 'they', '고마운 마음을 전하는 상대를 떠올려 보자!', '', 1]
  ];
  const HARDER_CREATIVE = [
    [3, '준서는 나래보다 먼저, 나래는 다온보다 먼저, 다온은 하린보다 먼저 왔어요. 나래는 몇 번째로 왔을까요?', '둘째', '첫째', '셋째', '넷째', '먼저 온 사람부터 한 줄로 세워 보자!', '', 0],
    [3, '민호는 수아보다 뒤에, 수아는 유나보다 뒤에, 유나는 태오보다 뒤에 섰어요. 태오는 몇 번째일까요?', '첫째', '둘째', '셋째', '넷째', '뒤에 선 사람의 앞에 누가 있는지 이어 보자!', '', 0],
    [3, '주하는 예린보다 크고, 예린은 도윤보다 크고, 도윤은 지후보다 커요. 키 큰 순서로 세우면 도윤은 몇 번째일까요?', '셋째', '첫째', '둘째', '넷째', '키를 나타내는 막대 네 개를 차례로 놓아 보자!', '', 0],
    [3, '지민은 유리보다 늦게, 유리는 소미보다 늦게, 소미는 건우보다 늦게 마쳤어요. 지민은 몇 번째로 마쳤을까요?', '넷째', '첫째', '둘째', '셋째', '빨리 마친 사람부터 순서를 만들어 보자!', '', 0],
    [3, '빨간 기둥은 노란 것보다 낮고, 노란 기둥은 초록 것보다 낮고, 초록 기둥은 파란 것보다 낮아요. 높은 순서에서 노란 기둥은 몇 번째일까요?', '셋째', '첫째', '둘째', '넷째', '낮은 것부터 놓은 뒤 반대 방향으로 살펴보자!', '', 0],
    [3, '집에서 공원은 서점보다 가깝고, 서점은 빵집보다 가깝고, 빵집은 도서관보다 가까워요. 가까운 순서에서 공원은 몇 번째일까요?', '첫째', '둘째', '셋째', '넷째', '멀고 가까운 관계를 길 위에 표시해 보자!', '', 0],
    [3, '종이배를 만들어요. 지훈은 보미보다 늦게, 보미는 채은보다 늦게, 채은은 시우보다 늦게 끝냈어요. 보미는 몇 번째로 끝냈을까요?', '셋째', '첫째', '둘째', '넷째', '먼저 끝낸 사람부터 손가락으로 짚어 보자!', '', 0],
    [3, '하루는 아람보다 앞에, 아람은 누리보다 앞에, 누리는 세나보다 앞에 앉았어요. 아람은 몇 번째일까요?', '둘째', '첫째', '셋째', '넷째', '앞쪽 자리부터 한 사람씩 놓아 보자!', '', 0],
    [3, '보슬보슬 내리는 날 양손에 짐을 들어요. 몸이 덜 젖고 손도 자유로우려면 무엇이 좋을까요?', '비옷', '우산', '목도리', '모자', '젖지 않는 조건과 두 손을 쓰는 조건을 따로 확인해 보자!', '', 0],
    [3, '소풍에서 마실 것을 챙겨요. 흔들리는 가방에서 쏟아지지 않게 뚜껑도 잠그려면 무엇이 좋을까요?', '물병', '컵', '필통', '접시', '담을 수 있는지와 잠글 수 있는지를 각각 확인해 보자!', '', 0],
    [3, '밤에 그림을 그려요. 종이 주변만 환하게 하고 두 손도 쓸 수 있으려면 무엇이 좋을까요?', '스탠드', '손에 든 손전등', '천장 조명', '꽃병', '비추는 범위와 손이 자유로운지를 함께 비교해 보자!', '', 0],
    [3, '깃털이 있고 물 위에서 헤엄도 치는 동물에게 먹이를 줘요. 누가 받을까요?', '오리', '참새', '물고기', '토끼', '겉모습으로 먼저 나눈 뒤 움직임을 확인해 보자!', '', 0],
    [3, '소꿉가게에서 껍질이 노랗고 모양도 길쭉한 것을 골라요. 무엇을 담을까요?', '바나나', '레몬', '오이', '딸기', '색으로 추린 뒤 생김새도 확인해 보자!', '', 0],
    [3, '햇빛이 통과하고, 벽에도 달려 있는 것을 찾아요. 무엇일까요?', '창문', '거울', '안경', '의자', '빛이 지나는지와 놓이는 위치를 함께 생각해 보자!', '', 0],
    [3, '밖에서 웅덩이를 밟아도 젖지 않게 발을 감싸려면 무엇이 좋을까요?', '장화', '양말', '우산', '장갑', '몸의 어느 부분을 가리는지와 젖는지를 차례로 살펴보자!', '', 0],
    [3, '종이를 접지 않고 넣어요. 열어 보지 않아도 담긴 것이 보여야 한다면 무엇이 좋을까요?', '투명 파일', '속이 안 보이는 봉투', '유리컵', '작은 필통', '넣는 모양과 보이는 정도를 따로 따져 보자!', '', 0],
    [3, '밖이 쌀쌀한데 걸친 옷이 흠뻑 젖었어요. 편안히 산책하려면 어떻게 준비할까요?', '마른 외투로 갈아입어', '젖은 외투를 계속 입어', '마른 민소매만 입어', '젖은 옷 위에 리본을 달아', '추위와 축축함을 함께 해결할 방법을 골라 보자!', '', 0],
    [3, '장난감이 어두운 소파 밑으로 굴러갔어요. 팔도 닿지 않는다면 어떻게 꺼낼까요?', '손전등을 비추고 긴 집게를 써', '손전등만 비추며 바라봐', '짧은 숟가락만 뻗어', '소파 위에 인형을 놓아', '보이지 않는 문제와 거리가 먼 문제를 따로 해결해 보자!', '', 0],
    [3, '아기가 곁에서 자는데 인형에 먼지가 묻었어요. 잠을 깨우지 않고 어떻게 깨끗하게 할까요?', '물수건으로 살살 닦아', '청소기를 크게 틀어', '큰 소리로 먼지를 불어', '조용히 그대로 두어', '소음을 줄이는 방법과 더러움을 없애는 방법을 함께 생각해 보자!', '', 0],
    [3, '빗방울이 들이쳐 바닥까지 축축해졌어요. 계속 젖는 것도 막고, 이미 고인 것도 없애려면 어떻게 할까요?', '창문을 닫고 걸레로 닦아', '바닥만 닦고 계속 열어 둬', '창문만 닫고 고인 것은 둬', '가구를 밖으로 옮겨', '새로 생기는 까닭을 막은 뒤 남은 흔적을 해결해 보자!', '', 0],
    [3, '읽던 이야기를 내일 이어 보고 싶어요. 어린 동생의 낙서도 막으려면 어떻게 보관할까요?', '책갈피를 끼우고 보호자께 맡겨', '책갈피만 끼워 바닥에 놓아', '표시 없이 보호자께 맡겨', '펼쳐서 동생에게 건네', '다시 찾을 자리와 동생의 손이 닿는지를 함께 살펴보자!', '', 0],
    [3, '소풍에서 과자가 바람에 날리고 개미도 다가와요. 어떻게 보관하는 게 좋을까요?', '밀폐 용기에 담아', '무거운 접시에 펼쳐', '얇은 종이로만 덮어', '풀밭에 그대로 놓아', '날아가는 문제와 작은 벌레가 오는 문제를 함께 해결해 보자!', '', 0],
    [3, '조용한 도서관이에요. 멀리 있는 친구에게 목소리는 안 들려도 서로 얼굴은 보인다면 어떻게 인사할까요?', '손을 흔들어', '큰 소리로 불러', '작게 속삭여', '뒤돌아 숨어', '소리 없이도 상대가 알아챌 방법을 찾아보자!', '', 0],
    [3, '블록이 한 통에 섞였어요. 동그란 조각부터 찾고 그중 빨간 것만 쓰려면 어떻게 할까요?', '생김새로 모은 뒤 색을 골라', '색만 보고 모두 가져와', '동그란 조각을 전부 써', '아무 조각이나 집어', '첫 조건으로 나눈 다음 남은 조건을 적용해 보자!', '', 0],
    [3, '운동을 마쳐 땀에 젖었어요. 잠시 뒤 찬 곳으로 가야 한다면 몸이 식지 않게 어떻게 준비할까요?', '수건으로 닦고 겉옷을 걸쳐', '땀만 닦고 얇게 입어', '젖은 채로 찬 곳에 서', '부채질을 계속해', '축축함을 없앤 뒤 달라질 온도도 생각해 보자!', '', 0],
    [3, '소풍 갈 때 우유를 챙겨요. 상하지 않고, 가방 안에서 새지도 않으려면 어떻게 할까요?', '마개를 잠가 보냉 주머니에 넣어', '마개만 잠가 햇볕에 놓아', '뚜껑 없이 차가운 곳에 놓아', '따뜻한 이불로만 감싸', '새는 것을 막는 방법과 시원하게 지키는 방법을 함께 확인해 보자!', '', 0],
    [3, '빈 테두리가 있는 그림이에요. 물감은 아직 축축하고 바람에 종이도 날아가려 한다면 어떻게 할까요?', '모서리를 눌러 고정하고 말려', '젖은 면 위에 책을 덮어', '손으로 문질러', '종이를 그대로 밖에 놓아', '그린 면을 건드리지 않으면서 움직임을 막을 방법을 찾아보자!', '', 0],
    [3, '친구 둘이 같은 놀잇감을 원해요. 한 사람씩만 쓸 수 있고 먼저 할 사람도 못 정했다면 어떻게 할까요?', '가위바위보로 순번을 정해 번갈아', '가위바위보로 이긴 사람만 계속 놀아', '번갈자고만 하고 서로 먼저 쓰겠다고 다퉈', '둘이 억지로 동시에 써', '먼저 쓸 사람을 정한 뒤 나중 사람의 기회도 생각해 보자!', '', 0],
    [3, '과일에 모래가 묻었어요. 바닥에 닿으면 다시 더러워진다면 어떻게 할까요?', '헹군 뒤 깨끗한 그릇에 담아', '헹군 뒤 바닥에 놓아', '씻지 않고 그릇에 담아', '바닥에서 굴려', '처음의 더러움을 없애고 다시 묻지 않게 하는 순서를 골라 보자!', '', 0],
    [3, '그림을 붙일 벽에 먼지가 많아요. 준비한 풀도 말라서 붙지 않는다면 어떻게 할까요?', '깨끗이 닦고 새 테이프로 고정해', '먼지만 닦고 마른 풀을 계속 써', '먼지를 그대로 두고 새 테이프만 써', '그림을 바닥에 펼쳐 둬', '붙일 곳의 상태와 준비한 도구를 각각 확인해 보자!', '', 0],
    [3, '친구들이 차례를 기다리며 통로를 막고 있어요. 다른 사람도 지나갈 수 있게 어떻게 설까요?', '벽 쪽으로 붙어 일렬로 서', '문 앞을 넓게 둘러싸', '그 자리에 계속 기다려', '통로에 가로로 늘어서', '다른 사람이 지날 자리와 순서를 함께 지킬 방법을 찾아보자!', '', 0],
    [3, '공을 선반에 놓으면 굴러가요. 나중에 찾기도 쉬우려면 어떻게 정리할까요?', '속이 보이는 바구니에 담아', '속이 안 보이는 봉투에 꽁꽁 싸', '선반 가장자리에 놓아', '눈에 안 보이는 틈에 넣어', '움직임을 막는 조건과 쉽게 찾는 조건을 함께 확인해 보자!', '', 0],
    [3, '똑같은 얼음을 햇볕과 그늘에 놓았어요. 햇볕 쪽만 빨리 작아졌다면 오래 남겨 두려고 어디로 옮길까요?', '서늘한 실내', '햇볕 아래', '난로 옆', '따뜻한 방바닥', '무엇이 빨리 작아지게 했는지 찾고 반대 환경을 골라 보자!', '', 0],
    [3, '젖은 천 두 장 중 바람이 통하는 쪽이 더 빨리 말랐어요. 다음 빨래는 어떻게 널까요?', '서로 띄워 걸어', '꽁꽁 뭉쳐 놓아', '겹겹이 포개 놓아', '밀폐 상자에 넣어', '빨라진 까닭을 떠올리고 같은 효과가 생길 배치를 골라 보자!', '', 0],
    [3, '같은 양의 주스를 좁고 긴 잔에서 넓고 낮은 잔으로 남김없이 옮겼어요. 마실 수 있는 양은 어떨까요?', '변하지 않아', '더 많아져', '더 적어져', '모두 사라져', '높이와 실제로 옮겨 간 양을 구별해 보자!', '', 0],
    [3, '화분 두 개를 같은 곳에 두고 한쪽 흙만 흠뻑 적셨어요. 그쪽만 싱싱해졌다면 나머지는 어떻게 도울까요?', '물을 조금 줘', '더 큰 소음', '두꺼운 포장지', '장난감', '두 화분에서 달랐던 돌봄을 찾고 부족한 것을 생각해 보자!', '', 0],
    [3, '장난감 차를 같은 힘으로 굴렸어요. 까칠한 바닥보다 반들반들한 바닥에서 더 멀리 갔다면 새 길은 무엇으로 만들까요?', '평평한 나무판', '울퉁불퉁한 돌길', '푹신한 털실 뭉치', '두꺼운 모래밭', '멀리 간 까닭을 찾고 비슷한 표면을 새 재료에서 찾아보자!', '', 0],
    [3, '놀이에서 노란 문을 지나면 모자를 써요. 모자를 쓴 사람은 북을 친다면, 노란 문을 지난 친구는 마지막에 어떻게 할까요?', '둥둥 울려', '신발을 벗어', '바닥에 누워', '색종이를 접어', '첫 규칙의 결과가 두 번째 규칙과 어떻게 이어지는지 살펴보자!', '', 0],
    [3, '둥근 찰흙을 길게 늘렸다가 납작하게 눌렀어요. 떼어 내거나 보태지 않았다면 무게는 어떨까요?', '똑같아', '훨씬 무거워져', '아주 가벼워져', '아예 없어져', '생김새가 달라진 것과 덩이 자체가 늘고 줄었는지를 나눠 보자!', '', 0],
    [3, '박수에는 앞으로 움직이고 종소리에는 멈추는 놀이예요. 손뼉, 딸랑, 손뼉 소리를 들었다면 몇 번 이동했을까요?', '두 차례', '한 차례', '세 차례', '전혀 움직이지 않아', '들린 소리를 규칙에 맞춰 바꾸고 움직인 때만 세어 보자!', '', 0]
  ];
  [['korean', HARDER_KOREAN], ['english', HARDER_ENGLISH], ['creative', HARDER_CREATIVE]].forEach(([area, rows]) => {
    rows.forEach(([step, prompt, answer, first, second, third, hint, visual, silentOptions]) => {
      const extra = { hint };
      if (visual) extra.visual = `learn:${visual}`;
      if (silentOptions) extra.silentOptions = true;
      if (area === 'creative') add(area, step, prompt, answer, [first, second, third], extra);
      else add(area, 2, prompt, answer, [first, second, third], { ...extra, level: step });
    });
  });


  // 기존 문제 id를 유지하도록 큰 수의 가르기는 마지막에 덧붙인다.
  // 낱개가 있으면 몇십과 낱개로, 정십이면 10과 나머지 몇십으로 나눈다(받아내림 없음).
  for (let total = 21; total <= 100; total++) {
    const ones = total % 10;
    const parts = ones ? [total - ones, ones] : [10, total - 10];
    for (const part of new Set(parts)) addSplitting(total, part);
  }

  function shuffle(items, random = Math.random) {
    const shuffled = items.slice();
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return shuffled;
  }

  const AREAS = ['math', 'korean', 'english', 'creative'];
  // 단계가 정해진 영역은 그 단계 문제만, 아니면 쉬움·도전으로 고른다. 수 범위 10은 5까지의 셈도 포함한다.
  function fits(question, difficulty, levels) {
    const level = levels[question.area];
    if (level && question.level !== undefined) {
      if (question.area === 'math') return question.level === level || (level === 10 && question.level === 5);
      return question.level === level;
    }
    // 도전+(3)는 창의력 문제만 따로 있고, 다른 영역은 도전(2) 문제를 낸다.
    const wanted = difficulty === 3 && question.area !== 'creative' ? 2 : difficulty;
    return !wanted || question.difficulty === wanted;
  }
  const CALCULATION_KINDS = ['add', 'subtract'];
  function pick({ area, difficulty, levels = {}, count = 2, exclude = [], random = Math.random } = {}) {
    const excluded = new Set(exclude);
    const wanted = Math.max(0, Math.floor(count));
    const areaNames = !area || area === 'mixed' ? shuffle(AREAS, random) : [area];
    const pools = areaNames.map(name => questions.filter(question => question.area === name && fits(question, difficulty, levels)));
    const picked = [];
    const choose = list => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
    // 영역마다 문항 수가 크게 달라도 골고루 나오도록 영역을 돌아가며 한 문제씩 고른다. 안 푼 문제가 먼저다.
    for (let slot = 0; picked.length < wanted && slot < wanted * pools.length; slot++) {
      const pool = pools[slot % pools.length].filter(question => !picked.includes(question));
      if (!pool.length) continue;
      // 유형(kind)이 있는 영역(수학)은 유형부터 고르게 고른다. 덧셈·뺄셈이 수천 개여도 다른 유형이 묻히지 않고,
      // 한 판 안에서는 아직 안 나온 유형이 먼저다.
      const usedKinds = new Set(picked.map(question => question.kind));
      const kinds = [...new Set(pool.map(question => question.kind))];
      // 수학은 절반을 셈(덧셈·뺄셈), 나머지 절반을 다른 유형에서 고른다(2026-11-13 사용자: 계산 문제가 잘 안 나온다).
      const sums = kinds.filter(kind => CALCULATION_KINDS.includes(kind)), others = kinds.filter(kind => !CALCULATION_KINDS.includes(kind));
      const group = sums.length && others.length ? (random() < .5 ? sums : others) : kinds;
      // 고른 쪽 유형을 이 판에서 다 썼으면 아직 안 나온 다른 유형으로(한 판 안에서 유형은 겹치지 않는다).
      let freshKinds = group.filter(kind => !usedKinds.has(kind));
      if (!freshKinds.length) freshKinds = kinds.filter(kind => !usedKinds.has(kind));
      const kind = choose(freshKinds.length ? freshKinds : kinds);
      const sameKind = pool.filter(question => question.kind === kind);
      const fresh = sameKind.filter(question => !excluded.has(question.id));
      picked.push(choose(fresh.length ? fresh : sameKind));
    }
    return picked.map(question => ({ ...question, options: shuffle(question.options, random) }));
  }

  window.QUESTIONS = questions;
  window.QuestionBank = Object.freeze({ pick, shuffle, areas: AREAS, levels: Object.freeze({ math: MATH_LEVELS, korean: KOREAN_LEVELS, english: ENGLISH_LEVELS }) });
})();
