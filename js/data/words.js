// 5~7세가 그림을 보고 따라 써 볼 기초 낱말. 그림 문자는 LearningArt에서 실제 PNG로 바꾼다.
// 영어 2~4글자·한글 1~2글자 중 한쪽이라도 맞고 ARASAAC 그림(LEARN_PICTURES)이 있는 낱말만 둔다.
(function (global) {
  'use strict';
  const pairs = [
    ['apple', '사과', '🍎'], ['grape', '포도', '🍇'],
    ['dog', '강아지', '🐶'], ['cat', '고양이', '🐱'], ['rabbit', '토끼', '🐰'],
    ['frog', '개구리', '🐸'], 
    ['car', '자동차', '🚗'], ['bike', '자전거', '🚲'],
    ['train', '기차', '🚂'], ['tree', '나무', '🌳'], ['shoe', '신발', '👟'],
    ['lemon', '레몬', '🍋'],
    ['peach', '복숭아', '🍑'], ['pig', '돼지', '🐷'], 
    ['sheep', '양', '🐑'], ['bear', '곰', '🐻'],
    ['lion', '사자', '🦁'], ['tiger', '호랑이', '🐯'], ['fish', '물고기', '🐟'],
    ['bird', '새', '🐦'], ['duck', '오리', '🦆'], ['ant', '개미', '🐜'],
    ['star', '별', '⭐'],
    ['bus', '버스', '🚌'], ['hat', '모자', '🎩'],
    ['bed', '침대', '🛏'], ['chair', '의자', '🪑'], ['ball', '공', '⚽'],
    ['milk', '우유', '🥛'], ['egg', '달걀', '🥚'], ['bread', '빵', '🍞'],
    ['cheese', '치즈', '🧀'], ['cake', '케이크', '🍰'], ['pizza', '피자', '🍕'],
    ['socks', '양말', '🧦'], ['pencil', '연필', '✏'], ['flower', '꽃', '🌸']
  ];
  global.WORDBOOK_WORDS = Object.freeze(pairs.flatMap(([english, korean, visual]) => [
    Object.freeze({ id: 'ko-' + english, concept: english, language: 'ko', word: korean, visual, translation: english }),
    Object.freeze({ id: 'en-' + english, concept: english, language: 'en', word: english, visual, translation: korean })
  ]));
})(typeof window === 'undefined' ? globalThis : window);
