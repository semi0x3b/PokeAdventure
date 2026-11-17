// 화면에 보여 줄 학습·포켓몬 문구만 다룬다. 원본 문제나 계정 안내는 변경하지 않는다.
(function (global) {
  'use strict';

  function josa(word, pair) {
    if (typeof word !== 'string' || !word.trim()) return word;
    const pairs = { '이/가': ['이', '가'], '을/를': ['을', '를'], '은/는': ['은', '는'], '과/와': ['과', '와'] };
    if (!Object.prototype.hasOwnProperty.call(pairs, pair)) return word;

    // 성별 표시와 닫는 따옴표·문장부호는 발음에 포함하지 않는다.
    // 실제 표시 문자열은 그대로 두고, 받침 판별에만 정규화한 이름을 사용한다.
    const spokenWord = word.normalize('NFC').trim().replace(/[\p{P}\s♀♂]+$/gu, '');
    if (!spokenWord) return word;
    const last = spokenWord.at(-1);
    const code = last.charCodeAt(0);
    let hasBatchim = false;
    if (code >= 0xAC00 && code <= 0xD7A3) {
      hasBatchim = (code - 0xAC00) % 28 !== 0;
    } else if (/\d/.test(last)) {
      // 숫자는 마지막 자리의 한국어 수 이름으로 판별한다. 폴리곤2의 '투'도 받침이 없다.
      hasBatchim = '013678'.includes(last);
    } else if (/[A-Za-z]/.test(last)) {
      // 영문 표기는 단어 발음을 추정하지 않고 마지막 알파벳의 한국어 이름을 쓴다.
      // 엘·엠·엔·알은 받침이 있고, 제트(Z)를 포함한 나머지 글자는 받침이 없다.
      hasBatchim = /[LMNR]/i.test(last);
    }
    return word + pairs[pair][hasBatchim ? 0 : 1];
  }

  function questionPrompt(prompt, area) {
    if (typeof prompt !== 'string' || !prompt.trim()) return prompt;
    if (!['math', 'korean', 'english', 'creative'].includes(area)) return prompt;
    // 수식·숫자·기호에는 손대지 않고 질문 종결의 존댓말만 바꾼다.
    if (area === 'math') return prompt.replace(/까요[?？]?$/u, '까?');

    let text = prompt;
    // 끝 문장만 반말로 바꾸면 ‘…했어요. 무엇일까?’처럼 섞이므로, 앞 문장의 존댓말 끝도 반말로 바꾼다(했어요. → 했어.).
    text = text.replace(/이에요([.,!])(?=\s)/gu, '이야$1')
      .replace(/예요([.,!])(?=\s)/gu, '야$1')
      .replace(/요([.,!])(?=\s)/gu, '$1');
    // 원본 데이터에 고정 조사로 적힌 따옴표 낱말과 영어 따라쓰기의 조사도 화면에서 맞춘다.
    text = text.replace(/([‘“「『'"])([^‘’“”「」『』'"]+)([’”」』'"])(?:을|를)(?=\s|$)/gu,
      (_, open, word, close) => josa(open + word + close, '을/를'));
    text = text.replace(/^(손가락으로\s+)([A-Za-z])(?:을|를)(\s+따라)/u,
      (_, before, letter, after) => before + josa(letter, '을/를') + after);

    const choice = text.match(/^(.*?)(?:을|를)\s+(?:고르세요|골라요)[.!?？]?$/u);
    if (choice) return josa(choice[1], '은/는') + ' 뭘까?';

    if (/까요[?？]?$/u.test(text)) return text.replace(/까요[?？]?$/u, '까?');
    if (/[은는][?？]$/u.test(text)) return text.replace(/[?？]$/u, ' 뭘까?');

    // 수수께끼의 단서는 남기고, 끝에서만 아이에게 무엇인지 묻는다.
    if (area === 'creative') {
      if (/이에요[.!]?$/u.test(text)) return text.replace(/이에요[.!]?$/u, '이야. 뭘까?');
      if (/예요[.!]?$/u.test(text)) return text.replace(/예요[.!]?$/u, '야. 뭘까?');
      if (/요[.!]?$/u.test(text)) return text.replace(/요[.!]?$/u, '. 뭘까?');
    }
    // 이미 반말 질문이거나 지원하지 않는 문장은 그대로 둔다. 임의로 물음표를 덧붙이지 않는다.
    return text;
  }

  global.PokemonText = Object.freeze({ josa, questionPrompt });
})(typeof window === 'undefined' ? globalThis : window);
