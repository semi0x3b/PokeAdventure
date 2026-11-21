// 따라 쓰기 중심선. 좌표는 0~100, y는 아래쪽으로 증가한다.
// 한글은 초성→중성→종성, 왼쪽→오른쪽 순서로 조립한다.
// 참고: 고용허가제 공식 한국어 교재 13·15·16쪽의 자모 획순 그림
// https://www.eps.go.kr/exam/Hanguel.pdf
// 교재마다 다른 ㅁ·ㅌ은 국내 어린이에게 익숙한 왼세로 우선/가로 우선형을 쓴다.
// 영어는 한 층 a·g의 공/막대형 인쇄체다. 특정 필기체 교재의 유일한 정답은 아니다.
(function (root) {
  'use strict';

  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
  const VERTICAL = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ';
  const HORIZONTAL = 'ㅗㅛㅜㅠㅡ';
  const MIXED = { 'ㅘ': ['ㅗ', 'ㅏ'], 'ㅙ': ['ㅗ', 'ㅐ'], 'ㅚ': ['ㅗ', 'ㅣ'],
    'ㅝ': ['ㅜ', 'ㅓ'], 'ㅞ': ['ㅜ', 'ㅔ'], 'ㅟ': ['ㅜ', 'ㅣ'], 'ㅢ': ['ㅡ', 'ㅣ'] };

  function line(...coordinates) {
    return coordinates.reduce((commands, coordinate, index) => {
      if (index % 2 === 0) commands.push([index === 0 ? 'M' : 'L', coordinate, coordinates[index + 1]]);
      return commands;
    }, []);
  }
  const oval = (x, y, rx, ry, from = 0, to = -360) => [['E', x, y, rx, ry, from, to]];
  const curve = (x, y, ...segments) => [['M', x, y], ...segments];

  // 직선의 꺾임은 꼭 점으로 남긴다. 짧은 점획도 10점 이상으로 방향을 갖는다.
  function sample(commands) {
    const points = [];
    const push = (x, y) => points.push({ x, y });
    for (const [operation, ...values] of commands) {
      if (operation === 'M') {
        push(values[0], values[1]);
        continue;
      }
      const last = points.at(-1);
      if (operation === 'L') {
        const [x, y] = values;
        const steps = Math.max(9, Math.ceil(Math.hypot(x - last.x, y - last.y) / 2));
        for (let index = 1; index <= steps; index++) {
          push(last.x + (x - last.x) * index / steps, last.y + (y - last.y) * index / steps);
        }
      } else if (operation === 'Q') {
        const [cx, cy, x, y] = values;
        const steps = Math.max(9, Math.ceil((Math.hypot(cx - last.x, cy - last.y) + Math.hypot(x - cx, y - cy)) / 2));
        for (let index = 1; index <= steps; index++) {
          const t = index / steps, u = 1 - t;
          push(u * u * last.x + 2 * u * t * cx + t * t * x,
            u * u * last.y + 2 * u * t * cy + t * t * y);
        }
      } else if (operation === 'E') {
        const [cx, cy, rx, ry, from, to] = values;
        // 4의 배수로 샘플링해 원의 상하좌우 극점을 정확히 포함한다.
        const steps = Math.max(12, Math.ceil(Math.abs(to - from) * Math.PI / 180 * Math.max(rx, ry) / 8) * 4);
        for (let index = 0; index <= steps; index++) {
          const angle = (from + (to - from) * index / steps) * Math.PI / 180;
          push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
        }
      }
    }
    return points;
  }
  function place(strokes, [x, y, width, height]) {
    return strokes.map(stroke => stroke.map(point => ({ x: x + point.x * width / 100, y: y + point.y * height / 100 })));
  }

  const definitions = {
    'ㄱ': [line(8, 10, 90, 10, 90, 90)],
    'ㄴ': [line(10, 8, 10, 90, 92, 90)],
    'ㄷ': [line(10, 10, 90, 10), line(10, 10, 10, 90, 90, 90)],
    'ㄹ': [line(10, 10, 90, 10, 90, 48), line(10, 48, 90, 48), line(10, 48, 10, 90, 90, 90)],
    'ㅁ': [line(10, 10, 10, 90), line(10, 10, 90, 10, 90, 90), line(10, 90, 90, 90)],
    'ㅂ': [line(10, 8, 10, 90), line(90, 8, 90, 90), line(10, 48, 90, 48), line(10, 90, 90, 90)],
    'ㅅ': [curve(54, 10, ['Q', 47, 59, 10, 88]), curve(48, 40, ['Q', 61, 69, 90, 88])],
    'ㅇ': [oval(50, 50, 40, 42, -90, -450)],
    'ㅈ': [curve(10, 12, ['L', 86, 12], ['Q', 69, 64, 10, 90]), curve(56, 52, ['Q', 69, 75, 90, 90])],
    'ㅊ': [line(36, 7, 64, 13), curve(10, 30, ['L', 86, 30], ['Q', 68, 71, 10, 92]), curve(55, 62, ['Q', 68, 80, 90, 92])],
    'ㅋ': [line(8, 10, 90, 10, 90, 90), line(10, 50, 90, 50)],
    'ㅌ': [line(10, 10, 90, 10), line(10, 48, 90, 48), line(10, 10, 10, 90, 90, 90)],
    'ㅍ': [line(8, 10, 92, 10), line(28, 10, 28, 90), line(72, 10, 72, 90), line(8, 90, 92, 90)],
    'ㅎ': [line(34, 6, 66, 10), line(8, 28, 92, 28), oval(50, 70, 30, 24, -90, -450)],
    'ㅏ': [line(34, 5, 34, 95), line(34, 50, 92, 50)],
    'ㅑ': [line(34, 5, 34, 95), line(34, 34, 92, 34), line(34, 67, 92, 67)],
    'ㅓ': [line(8, 50, 66, 50), line(66, 5, 66, 95)],
    'ㅕ': [line(8, 34, 66, 34), line(8, 67, 66, 67), line(66, 5, 66, 95)],
    'ㅗ': [line(50, 8, 50, 62), line(6, 62, 94, 62)],
    'ㅛ': [line(34, 8, 34, 62), line(67, 8, 67, 62), line(6, 62, 94, 62)],
    'ㅜ': [line(6, 36, 94, 36), line(50, 36, 50, 92)],
    'ㅠ': [line(6, 36, 94, 36), line(34, 36, 34, 92), line(67, 36, 67, 92)],
    'ㅡ': [line(6, 50, 94, 50)],
    'ㅣ': [line(50, 5, 50, 95)]
  };
  const JAMO = Object.create(null);
  for (const [character, strokes] of Object.entries(definitions)) JAMO[character] = strokes.map(sample);
  const pairs = { 'ㄲ': ['ㄱ', 'ㄱ'], 'ㄸ': ['ㄷ', 'ㄷ'], 'ㅃ': ['ㅂ', 'ㅂ'], 'ㅆ': ['ㅅ', 'ㅅ'], 'ㅉ': ['ㅈ', 'ㅈ'],
    'ㄳ': ['ㄱ', 'ㅅ'], 'ㄵ': ['ㄴ', 'ㅈ'], 'ㄶ': ['ㄴ', 'ㅎ'], 'ㄺ': ['ㄹ', 'ㄱ'], 'ㄻ': ['ㄹ', 'ㅁ'],
    'ㄼ': ['ㄹ', 'ㅂ'], 'ㄽ': ['ㄹ', 'ㅅ'], 'ㄾ': ['ㄹ', 'ㅌ'], 'ㄿ': ['ㄹ', 'ㅍ'], 'ㅀ': ['ㄹ', 'ㅎ'], 'ㅄ': ['ㅂ', 'ㅅ'] };
  for (const [character, [left, right]] of Object.entries(pairs)) {
    JAMO[character] = [...place(JAMO[left], [0, 0, 44, 100]), ...place(JAMO[right], [56, 0, 44, 100])];
  }
  for (const [character, base] of [['ㅐ', 'ㅏ'], ['ㅒ', 'ㅑ'], ['ㅔ', 'ㅓ'], ['ㅖ', 'ㅕ']]) {
    JAMO[character] = [...place(JAMO[base], [0, 0, 68, 100]), ...place(JAMO['ㅣ'], [68, 0, 32, 100])];
  }
  for (const [character, [horizontal, vertical]] of Object.entries(MIXED)) {
    JAMO[character] = [...place(JAMO[horizontal], [0, 46, 68, 52]), ...place(JAMO[vertical], [70, 0, 30, 100])];
  }

  // 모음 모양 × 받침 유무. 자모 안 여백까지 합쳐 획 굵기와 시작 번호가 붙지 않게 둔다.
  const FORMS = {
    vertical: { cho: [6, 22, 48, 58], jung: [58, 4, 37, 92] },
    'vertical+final': { cho: [6, 3, 48, 52], jung: [59, 1, 35, 58], jong: [12, 68, 76, 29] },
    horizontal: { cho: [17, 3, 66, 42], jung: [4, 51, 92, 45] },
    'horizontal+final': { cho: [18, 1, 64, 29], jung: [4, 35, 92, 27], jong: [13, 70, 74, 27] },
    mixed: { cho: [6, 14, 49, 34], jungH: [4, 47, 63, 42], jungV: [70, 3, 27, 92] },
    'mixed+final': { cho: [6, 2, 49, 27], jungH: [3, 34, 65, 28], jungV: [70, 1, 27, 61], jong: [12, 71, 76, 26] }
  };

  // 대문자 윗줄4·소문자 윗줄38·기준선80·내림선98.
  const LATIN = {
    A: [80, line(40, 4, 6, 80), line(40, 4, 74, 80), line(18, 53, 62, 53)],
    B: [74, line(8, 4, 8, 80), curve(8, 4, ['L', 36, 4], ['Q', 65, 4, 65, 23], ['Q', 65, 42, 36, 42], ['L', 8, 42]), curve(8, 42, ['L', 38, 42], ['Q', 68, 42, 68, 61], ['Q', 68, 80, 38, 80], ['L', 8, 80])],
    C: [80, oval(42, 42, 34, 38, -45, -315)],
    D: [80, line(8, 4, 8, 80), curve(8, 4, ['L', 31, 4], ['Q', 72, 4, 72, 42], ['Q', 72, 80, 31, 80], ['L', 8, 80])],
    E: [70, line(10, 4, 10, 80), line(10, 4, 62, 4), line(10, 42, 54, 42), line(10, 80, 62, 80)],
    F: [70, line(10, 4, 10, 80), line(10, 4, 62, 4), line(10, 42, 54, 42)],
    G: [82, oval(42, 42, 34, 38, -45, -315), line(66, 69, 66, 45, 45, 45)],
    H: [80, line(10, 4, 10, 80), line(70, 4, 70, 80), line(10, 42, 70, 42)],
    I: [40, line(20, 4, 20, 80), line(6, 4, 34, 4), line(6, 80, 34, 80)],
    J: [64, curve(52, 4, ['L', 52, 60], ['Q', 52, 80, 30, 80], ['Q', 8, 80, 8, 62])],
    K: [76, line(10, 4, 10, 80), line(66, 4, 10, 43), line(30, 30, 68, 80)],
    L: [68, line(10, 4, 10, 80, 60, 80)],
    M: [90, line(8, 4, 8, 80), line(8, 4, 45, 57), line(45, 57, 82, 4), line(82, 4, 82, 80)],
    N: [84, line(10, 4, 10, 80), line(10, 4, 74, 80), line(74, 4, 74, 80)],
    O: [84, oval(42, 42, 34, 38, -90, -450)],
    P: [72, line(10, 4, 10, 80), curve(10, 4, ['L', 36, 4], ['Q', 65, 4, 65, 25], ['Q', 65, 46, 36, 46], ['L', 10, 46])],
    Q: [86, oval(42, 42, 34, 38, -90, -450), line(48, 58, 79, 86)],
    R: [78, line(10, 4, 10, 80), curve(10, 4, ['L', 36, 4], ['Q', 65, 4, 65, 25], ['Q', 65, 46, 36, 46], ['L', 10, 46]), line(37, 46, 70, 80)],
    S: [76, curve(66, 16, ['Q', 53, 4, 37, 4], ['Q', 8, 4, 8, 23], ['Q', 8, 38, 38, 42], ['Q', 68, 46, 68, 62], ['Q', 68, 80, 38, 80], ['Q', 20, 80, 8, 68])],
    T: [76, line(6, 4, 70, 4), line(38, 4, 38, 80)],
    U: [80, curve(10, 4, ['L', 10, 54], ['Q', 10, 80, 40, 80], ['Q', 70, 80, 70, 54], ['L', 70, 4])],
    V: [80, line(8, 4, 40, 80), line(40, 80, 72, 4)],
    W: [90, line(5, 4, 23, 80), line(23, 80, 45, 24), line(45, 24, 67, 80), line(67, 80, 85, 4)],
    X: [80, line(8, 4, 72, 80), line(72, 4, 8, 80)],
    Y: [80, line(8, 4, 40, 42), line(72, 4, 40, 42, 40, 80)],
    Z: [80, line(8, 4, 72, 4, 8, 80, 72, 80)],
    a: [54, oval(25, 59, 21, 21, -45, -405), line(46, 38, 46, 80)],
    b: [54, line(8, 4, 8, 80), curve(8, 38, ['Q', 46, 38, 46, 59], ['Q', 46, 80, 8, 80])],
    c: [52, oval(27, 59, 21, 21, -45, -315)],
    d: [54, oval(25, 59, 21, 21, -45, -405), line(46, 4, 46, 80)],
    e: [54, curve(6, 59, ['L', 46, 59], ['Q', 46, 38, 26, 38], ['Q', 6, 38, 6, 59], ['Q', 6, 80, 27, 80], ['Q', 39, 80, 46, 72])],
    f: [46, curve(37, 8, ['Q', 17, 0, 17, 21], ['L', 17, 80]), line(5, 38, 38, 38)],
    g: [56, oval(25, 59, 21, 21, -45, -405), curve(46, 38, ['L', 46, 88], ['Q', 46, 98, 32, 98], ['Q', 20, 98, 14, 91])],
    h: [58, line(8, 4, 8, 80), curve(8, 58, ['Q', 8, 38, 29, 38], ['Q', 50, 38, 50, 58], ['L', 50, 80])],
    i: [38, line(19, 38, 19, 80), line(19, 19, 19, 21)],
    j: [38, curve(19, 38, ['L', 19, 86], ['Q', 19, 98, 9, 98], ['Q', 4, 98, 4, 93]), line(19, 19, 19, 21)],
    k: [56, line(8, 4, 8, 80), line(47, 38, 8, 62), line(24, 52, 48, 80)],
    l: [38, line(19, 4, 19, 80)],
    m: [88, line(8, 38, 8, 80), curve(8, 55, ['Q', 8, 38, 25, 38], ['Q', 43, 38, 43, 55], ['L', 43, 80]), curve(43, 55, ['Q', 43, 38, 61, 38], ['Q', 79, 38, 79, 55], ['L', 79, 80])],
    n: [58, line(8, 38, 8, 80), curve(8, 57, ['Q', 8, 38, 29, 38], ['Q', 50, 38, 50, 58], ['L', 50, 80])],
    o: [54, oval(27, 59, 21, 21, -90, -450)],
    p: [54, line(8, 38, 8, 98), curve(8, 38, ['Q', 46, 38, 46, 59], ['Q', 46, 80, 8, 80])],
    q: [54, oval(25, 59, 21, 21, -45, -405), line(46, 38, 46, 98)],
    r: [46, line(8, 38, 8, 80), curve(8, 57, ['Q', 8, 38, 26, 38], ['Q', 35, 38, 39, 43])],
    s: [52, curve(44, 44, ['Q', 36, 38, 26, 38], ['Q', 7, 38, 7, 48], ['Q', 7, 57, 26, 59], ['Q', 45, 61, 45, 71], ['Q', 45, 80, 26, 80], ['Q', 14, 80, 6, 73])],
    t: [46, curve(19, 17, ['L', 19, 68], ['Q', 19, 80, 31, 80], ['Q', 37, 80, 40, 76]), line(5, 38, 38, 38)],
    u: [58, curve(8, 38, ['L', 8, 63], ['Q', 8, 80, 28, 80], ['Q', 48, 80, 48, 61]), line(48, 38, 48, 80)],
    v: [56, line(6, 38, 28, 80), line(28, 80, 50, 38)],
    w: [84, line(5, 38, 22, 80), line(22, 80, 42, 44), line(42, 44, 62, 80), line(62, 80, 79, 38)],
    x: [56, line(6, 38, 50, 80), line(50, 38, 6, 80)],
    y: [56, line(6, 38, 28, 80), line(50, 38, 19, 98)],
    z: [54, line(6, 38, 48, 38, 6, 80, 48, 80)]
  };

  function compatibilityJamo(character) {
    const code = character.charCodeAt(0);
    if (code >= 0x1100 && code <= 0x1112) return CHO[code - 0x1100];
    if (code >= 0x1161 && code <= 0x1175) return JUNG[code - 0x1161];
    if (code >= 0x11A8 && code <= 0x11C2) return JONG[code - 0x11A7];
    return character;
  }
  function supportedCharacter(character) {
    const code = character.charCodeAt(0);
    return (code >= 0xAC00 && code <= 0xD7A3) || Object.hasOwn(LATIN, character) || Object.hasOwn(JAMO, compatibilityJamo(character));
  }
  function supports(text) {
    return typeof text === 'string' && text.length > 0 && [...text].every(supportedCharacter);
  }
  function glyph(character) {
    if (typeof character !== 'string' || [...character].length !== 1 || !supportedCharacter(character)) return null;
    const font = root.TRACING_FONT_GLYPHS?.[character];
    if (font) return {
      advance: font.advance, kind: font.kind, font: font.font, outline: font.outline,
      strokes: font.strokes.map(stroke => stroke.map(([x, y]) => ({ x, y })))
    };
    if (Object.hasOwn(LATIN, character)) {
      const [advance, ...strokes] = LATIN[character];
      return { advance, kind: 'latin', strokes: strokes.map(sample) };
    }
    const jamo = compatibilityJamo(character);
    if (Object.hasOwn(JAMO, jamo)) return { advance: 100, kind: 'jamo', strokes: place(JAMO[jamo], [0, 0, 100, 100]) };
    const index = character.charCodeAt(0) - 0xAC00;
    const cho = CHO[Math.floor(index / 588)];
    const jung = JUNG[Math.floor(index % 588 / 28)];
    const jong = JONG[index % 28];
    const shape = VERTICAL.includes(jung) ? 'vertical' : HORIZONTAL.includes(jung) ? 'horizontal' : 'mixed';
    const form = FORMS[shape + (jong ? '+final' : '')];
    const strokes = place(JAMO[cho], form.cho);
    if (shape === 'mixed') {
      const [horizontal, vertical] = MIXED[jung];
      strokes.push(...place(JAMO[horizontal], form.jungH), ...place(JAMO[vertical], form.jungV));
    } else {
      strokes.push(...place(JAMO[jung], form.jung));
    }
    if (jong) strokes.push(...place(JAMO[jong], form.jong));
    return { advance: 100, kind: 'syllable', strokes };
  }
  root.StrokeLetters = Object.freeze({ glyph, supports });
})(typeof window === 'undefined' ? globalThis : window);
