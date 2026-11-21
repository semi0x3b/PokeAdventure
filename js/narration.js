(function (root) {
  'use strict';
  let lastKey = null;
  let generation = 0;
  let activeAudio = null;
  let activeUtterance = null;
  let completion = null;
  function completeReading(success) {
    const done = completion;
    completion = null;
    done?.(success);
  }
  let voices = [];
  const LETTERS = ['에이', '비', '씨', '디', '이', '에프', '지', '에이치', '아이', '제이', '케이', '엘', '엠', '엔', '오', '피', '큐', '아르', '에스', '티', '유', '브이', '더블유', '엑스', '와이', '제트'];

  function hasSpeech() {
    return !!root.speechSynthesis && typeof root.speechSynthesis.speak === 'function' && typeof root.SpeechSynthesisUtterance === 'function';
  }
  function refreshVoices() {
    try { voices = hasSpeech() && root.speechSynthesis.getVoices ? root.speechSynthesis.getVoices() : []; }
    catch { voices = []; }
  }
  function koreanVoice() {
    refreshVoices();
    const korean = voices.filter(voice => /^ko(?:-|$)/i.test(voice.lang || ''));
    return korean.find(voice => voice.localService && /^ko-KR$/i.test(voice.lang)) ||
      korean.find(voice => voice.localService) || korean.find(voice => /^ko-KR$/i.test(voice.lang)) || korean[0] || null;
  }
  function clean(text, area) {
    let value = String(text == null ? '' : text)
      .replace(/♀/g, ' 암컷').replace(/♂/g, ' 수컷')
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}]/gu, ' ')
      .replace(/[\uFE0F\u200D\u20E3]/gu, ' ');
    if (area === 'math') {
      value = value.replace(/[=＝]\s*[?？](?=\s*$)/g, ' 은 얼마일까요?')
        .replace(/[?？](?=\s*[+＋−–=＝-])/g, '빈칸')
        .replace(/[+＋]/g, ' 더하기 ').replace(/[−–-]/g, ' 빼기 ').replace(/[=＝]/g, ' 은 ');
    }
    if (area === 'english') value = value.replace(/\b[A-Za-z]\b/g, letter => LETTERS[letter.toUpperCase().charCodeAt(0) - 65]);
    // 짧은 명령형이 ‘팔로 자’처럼 뭉개지는 것을 줄인다. 화면의 보기 글은 그대로 둔다.
    return value.replace(/발로\s+차(?=[.!?]|$)/gu, '발로 찬다').replace(/\s+/g, ' ').trim();
  }
  // 보기 번호는 한자어 수 한글로 읽는다(2026-11-15 사용자 「보기 읽을때 번호를 한번이라고 하는게 일번이라고 해야함」 — 엔진이 「1번」을 「한 번」으로 읽었다).
  // 화면의 번호(.gb-answer-no)는 그대로 숫자 1~4.
  const OPTION_NUMBERS = ['일', '이', '삼', '사'];
  function textFor(question) {
    const prompt = clean(question.prompt, question.area);
    // silentOptions(js/data/questions.js add): 보기를 소리로 들으면 답이 드러나는 문제(자음·모음·알파벳·글자·그림 고르기 등)는 질문만 읽는다.
    const choices = Array.isArray(question.options) && !question.silentOptions ? question.options.slice(0, 4) : [];
    const parts = prompt ? [prompt] : [];
    if (choices.length) parts.push('보기를 들어 보세요.');
    choices.forEach((choice, index) => parts.push(`${OPTION_NUMBERS[index]}번. ${clean(choice, question.area) || '그림 보기'}.`));
    // 그림 이모지와 따라쓰기용 큰 글자는 본문과 중복해서 읽지 않는다.
    return parts.join(' ');
  }
  function stopAudio() {
    const audio = activeAudio;
    activeAudio = null;
    if (!audio) return;
    audio.onerror = null;
    audio.onended = null;
    try { audio.pause(); } catch { /* 이미 끝난 음원 */ }
    try { audio.removeAttribute('src'); audio.load(); } catch { /* 재생 자원 해제 불가 */ }
  }
  function stop() {
    completeReading(false);
    generation++;
    stopAudio();
    activeUtterance = null;
    waiting = false;
    try { if (root.speechSynthesis && root.speechSynthesis.cancel) root.speechSynthesis.cancel(); } catch { /* 지원하지 않는 기기 */ }
  }
  function cancel() { stop(); lastKey = null; }
  const SPEAK_DELAY_MS = 80, SPEAK_RETRY_MS = 1500;
  // 늦춰 읽기를 기다리는 동안(엔진에 넘기기 전)도 「읽는 중」으로 친다(음성 안내가 끼어들지 않게).
  let waiting = false;
  function speak(text, token) {
    if (!hasSpeech() || !text || token !== generation) return false;
    try {
      const utterance = new root.SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      const voice = koreanVoice();
      if (voice) utterance.voice = voice;
      activeUtterance = utterance;
      const finish = success => {
        if (token !== generation || activeUtterance !== utterance) return;
        activeUtterance = null;
        completeReading(success);
      };
      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);
      // 크롬(특히 안드로이드)은 cancel() 바로 뒤에 speak() 하면 새 읽기를 버리는 일이 있어 잠깐(80ms) 뒤에 읽고,
      // 1.5초 안에 읽기가 시작되지 않으면(엔진이 멈춘 상태) 한 번 끊고 다시 읽는다(2026-11-13 사용자: 문제를 갑자기 안 읽어 준다).
      let started = false;
      utterance.onstart = function () { started = true; };
      waiting = true;
      const say = () => {
        waiting = false;
        if (token !== generation || activeUtterance !== utterance) return;
        try {
          if (root.speechSynthesis.paused && root.speechSynthesis.resume) root.speechSynthesis.resume();
          root.speechSynthesis.speak(utterance);
        } catch { /* 엔진 오류 — 다음 읽기에서 다시 */ }
      };
      // 타이머가 없는 곳(단위 시험 환경)에서는 바로 읽는다.
      if (typeof root.setTimeout !== 'function') { say(); return true; }
      root.setTimeout(say, SPEAK_DELAY_MS);
      root.setTimeout(() => {
        // 시작 신호가 없어도 엔진이 말하는 중이면 그대로 둔다(onstart 를 안 보내는 엔진도 있다).
        if (started || root.speechSynthesis.speaking || token !== generation || activeUtterance !== utterance) return;
        try { root.speechSynthesis.cancel(); } catch { /* 지원하지 않는 기기 */ }
        waiting = true;
        root.setTimeout(say, SPEAK_DELAY_MS);
      }, SPEAK_RETRY_MS);
      return true;
    } catch { activeUtterance = null; return false; }
  }
  function read(question, options) {
    const { repeat = false, enabled = true, onComplete = null } = options || {};
    if (!enabled) { cancel(); return false; }
    if (!question || typeof question !== 'object') return false;
    const key = question.id == null ? JSON.stringify([question.prompt, question.options, question.audio]) : String(question.id);
    if (!repeat && key === lastKey) return false;
    const hasAudio = typeof question.audio === 'string' && question.audio.trim() && typeof root.Audio === 'function';
    if (!hasAudio && !hasSpeech()) return false;
    const text = textFor(question);
    stop();
    completion = onComplete;
    const token = generation;
    lastKey = key;

    if (hasAudio) {
      let usedFallback = false;
      function fallback() {
        if (usedFallback || token !== generation) return;
        usedFallback = true;
        stopAudio();
        if (!speak(text, token)) { lastKey = null; completeReading(false); }
      }
      try {
        const audio = new root.Audio(question.audio);
        activeAudio = audio;
        audio.preload = 'auto';
        audio.onerror = fallback;
        audio.onended = function () { if (token === generation && activeAudio === audio) { activeAudio = null; completeReading(true); } };
        const playing = audio.play();
        if (playing && playing.catch) playing.catch(fallback);
        return true;
      } catch { fallback(); return hasSpeech(); }
    }
    const started = speak(text, token);
    if (!started) { lastKey = null; completeReading(false); }
    return started;
  }

  function readAndWait(question, options = {}) {
    return new Promise(resolve => {
      let done = false, token;
      const finish = success => {
        if (done) return;
        done = true;
        root.clearTimeout(timer);
        resolve(success);
      };
      // onend를 보내지 않는 엔진에서도 배틀이 멈추지 않게 한다.
      const timer = root.setTimeout(() => {
        if (token === generation) cancel();
        finish(false);
      }, 12000);
      const started = read(question, { ...options, onComplete: finish });
      token = generation;
      if (!started) finish(false);
    });
  }

  refreshVoices();
  // iPhone·iPad 는 첫 음성을 사람이 누른 그 순간 안에서 시작해야 소리가 열린다. 첫 누름 때 소리 없는 짧은 읽기로 미리 열어 두면
  // 뒤의 문제 읽기(늦춰 읽기·연출 뒤 읽기)도 소리가 난다(2026-11-13 사용자: 문제를 갑자기 안 읽어 준다).
  function unlockSpeech() {
    for (const type of ['pointerdown', 'touchend', 'keydown']) root.removeEventListener?.(type, unlockSpeech, true);
    if (!hasSpeech()) return;
    try {
      const silent = new root.SpeechSynthesisUtterance(' ');
      silent.volume = 0;
      root.speechSynthesis.speak(silent);
    } catch { /* 지원하지 않는 기기 */ }
  }
  for (const type of ['pointerdown', 'touchend', 'keydown']) root.addEventListener?.(type, unlockSpeech, { capture: true, once: true });
  if (root.speechSynthesis && root.speechSynthesis.addEventListener) root.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  // voice·clean·speaking: 음성 안내(js/voice-guide.js)가 같은 목소리·같은 글 다듬기를 쓰고, 문제를 읽는 동안에는 끼어들지 않게 한다.
  root.Narration = Object.freeze({
    read, readAndWait, cancel, voice: koreanVoice, clean,
    get speaking() { return Boolean(activeAudio || (activeUtterance && hasSpeech() && (waiting || root.speechSynthesis.speaking || root.speechSynthesis.pending))); },
    get supported() { return hasSpeech() || typeof root.Audio === 'function'; }
  });
})(window);
