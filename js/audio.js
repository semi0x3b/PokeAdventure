// 효과음(브라우저 합성)·포켓몬 울음소리(PokeAPI)·배경 음악과 징글(Ninja Adventure, CC0)을 이 게임의 소리 설정 하나(settings.sound, game.js syncAudio)와 연결.
// 효과음 참고: https://pokemon-quiz-kiro.vercel.app/js/audio.js / 울음소리 원본: PokeAPI / 음악·징글 원본과 바꾼 방법: sounds/music/LICENSE.txt(tools/make-music.mjs).
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, unlocked = false;

  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = on ? 0.7 : 0;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; return null; }
    }
    // iOS 는 전화·다른 앱 소리 뒤 'interrupted' 로 둔다. 두 경우 모두 다시 열어 본다(첫 누름 전이면 브라우저가 막고, 다음 누름에서 열린다).
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') { try { const resumed = ctx.resume(); if (resumed && resumed.catch) resumed.catch(() => {}); } catch (e) { /* 무시 */ } }
    return ctx;
  }

  // iOS/iPadOS 는 첫 터치 때 소리를 열어 줘야 한다. 무음 스위치가 켜져 있어도 나게 'playback' 으로 지정.
  // 첫 누름 전에는 브라우저가 소리를 막으므로 음악 파일도 받지 않는다. 첫 누름에서 소리가 열리면 지금 화면 곡을 받는다.
  function unlock() {
    if (unlocked) { ensure(); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 무시 */ }
    const c = ensure();
    if (!c) return;
    try {
      const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (e) { /* 무시 */ }
    unlocked = true;
    loadJingles();
    syncMusic();
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));

  function tone(freq, t0, dur, type, vol, slideTo) {
    const c = ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const v = vol == null ? 0.25 : vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, vol, hp) {
    const c = ctx; if (!c) return;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 1500;
    const g = c.createGain(); g.gain.value = vol || 0.2;
    s.connect(f); f.connect(g); g.connect(master); s.start(t0);
  }
  const N = { C4: 262, E4: 330, G4: 392, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, E6: 1319, G6: 1568, C7: 2093 };

  const SOUNDS = {
    tap(t) { tone(660, t, 0.07, 'triangle', 0.15); },
    correct(t) {
      [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, t + i * 0.085, 0.22, 'triangle', 0.28));
      tone(N.C6, t + 0.34, 0.35, 'sine', 0.12);
    },
    wrong(t) {
      tone(233, t, 0.18, 'sawtooth', 0.14, 200);
      tone(175, t + 0.17, 0.3, 'sawtooth', 0.14, 120);
    },
    battle(t) {
      tone(180, t, 0.4, 'square', 0.12, 900);
      [N.G5, N.B5, N.E6].forEach((f, i) => tone(f, t + 0.42 + i * 0.1, 0.16, 'square', 0.14));
      noise(t, 0.3, 0.06, 3000);
    },
    throw(t) { tone(1000, t, 0.5, 'sine', 0.18, 280); noise(t, 0.35, 0.05, 2500); },
    hit(t) { tone(400, t, 0.15, 'square', 0.18, 90); noise(t, 0.12, 0.2, 800); },
    shake(t) { tone(320, t, 0.07, 'triangle', 0.25); tone(210, t + 0.06, 0.09, 'triangle', 0.2); },
    caught(t) {
      [N.C5, N.E5, N.G5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, t + i * 0.11, 0.2, 'triangle', 0.28));
      [N.E6, N.G6].forEach((f, i) => tone(f, t + 0.75 + i * 0.12, 0.5, 'sine', 0.18));
    },
    flee(t) { tone(700, t, 0.5, 'triangle', 0.2, 150); },
    stamp(t) { tone(150, t, 0.25, 'sine', 0.5, 50); noise(t, 0.09, 0.25, 600); tone(N.G5, t + 0.2, 0.2, 'triangle', 0.18); tone(N.C6, t + 0.3, 0.3, 'triangle', 0.18); },
    gold(t) { [N.E6, N.G6, N.C7, N.G6, N.C7].forEach((f, i) => tone(f, t + i * 0.07, 0.25, 'sine', 0.14)); },
    unlock(t) {
      [N.C5, N.C5, N.C5, N.G5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, t + i * 0.13, 0.25, 'square', 0.12));
      tone(N.C6, t + 0.95, 0.6, 'triangle', 0.2); tone(N.E6, t + 0.95, 0.6, 'triangle', 0.15);
    },
  };
  function synth(name) {
    const c = ensure();
    if (!c || !SOUNDS[name]) return;
    try { SOUNDS[name](c.currentTime + 0.01); } catch (e) { /* 소리 실패는 무시 */ }
  }

  // ---------- 포켓몬 울음소리 (실행 시 PokeAPI 외부 원본에서 받음) ----------
  // iPad 사파리에서도 잘 나오도록 <audio> 하나를 계속 다시 쓴다(첫 터치 때 열어 둠).
  const cryEl = (typeof Audio !== 'undefined') ? new Audio() : null;
  let cryUnlocked = false;
  let cryVersion = 0;
  if (cryEl) { cryEl.preload = 'auto'; cryEl.setAttribute('playsinline', ''); }
  function unlockCry() {
    if (!cryEl || cryUnlocked) return;
    cryUnlocked = true;
    const version = cryVersion;
    try {
      cryEl.muted = true; cryEl.src = 'https://play.pokemonshowdown.com/audio/cries/pikachu.mp3';
      const pr = cryEl.play();
      if (pr && pr.then) pr.then(() => { if(version===cryVersion){cryEl.pause();cryEl.muted=false;} }).catch(() => { if(version===cryVersion){cryEl.muted=false;cryUnlocked=false;} });
      else { cryEl.pause(); cryEl.muted = false; }
    } catch (e) { cryEl.muted = false; cryUnlocked = false; }
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(ev => window.addEventListener(ev, unlockCry, { passive: true }));

  // ---------- 배경 음악: 장면마다 곡 하나(sounds/music, Ninja Adventure CC0 — 기존 포켓몬 게임 음악은 넣지 않는다) ----------
  // 받기: 지금 화면 곡만, 소리가 켜져 있고 첫 누름으로 소리가 열린 뒤에 받는다(첫 화면 로딩을 막지 않는다). 못 받으면 음악 없이 간다.
  // 반복: 디코드한 버퍼를 AudioBufferSourceNode 로 끊김 없이 돌린다. 파일 앞뒤에 곡 끝·곡 처음 PAD 를 덧붙여 두었으므로(tools/make-music.mjs)
  //   [PAD, PAD + 곡 길이] 를 돌면 디코더가 앞에 지연을 넣든 빼든 이음새가 곡 그대로 이어진다.
  // 메모리: 풀어 둔 곡은 지금 곡 하나만(모노 Float32: 48kHz 에서 1분에 약 11.5MB, 가장 긴 36 Village 105초 약 20MB). 곡을 바꾸면
  //   새 곡이 다 풀린 뒤 CROSSFADE 동안 겹쳐 바꾸고 앞 곡을 놓는다(그 0.8초만 두 곡). 징글 둘(2초씩, 약 0.4MB)은 받아 두고 다시 쓴다.
  // 크기: 파일은 모두 −21 LUFS(모노 측정). MUSIC_GAIN 0.224(−13 dB)로 약 −34 LUFS — 지금까지의 합성 음악(−34 LUFS)과 같고
  //   문제 읽기·음성 안내 TTS(macOS 유나 −18~−19 LUFS)보다 15 dB, 울음소리(−6~−14 LUFS)보다 20 dB 넘게 작다.
  //   말·울음소리·징글이 나는 동안은 DUCK(−6 dB, 약 −40 LUFS)으로 더 줄여 말과 음악 차이를 21 dB 로 둔다(아이 교실 권장 15 dB 이상).
  const MUSIC_DIR = 'sounds/music/';
  const RATE = 44100, PAD = 11025;
  const TRACKS = Object.freeze({
    title: Object.freeze({ file: '1-adventure-begin.mp3', samples: 3628800 }),
    forest: Object.freeze({ file: '5-peaceful.mp3', samples: 2605292 }),
    city: Object.freeze({ file: '36-village.mp3', samples: 4618473 }),
    desert: Object.freeze({ file: '12-temple.mp3', samples: 2352000 }),
    sea: Object.freeze({ file: '39-boat.mp3', samples: 4233600 }),
    battle: Object.freeze({ file: '34-fight.mp3', samples: 4233600 }),
    gold: Object.freeze({ file: '13-mystical.mp3', samples: 2646000 }),
  });
  const JINGLES = Object.freeze({ caught: 'success3.mp3', gift: 'secret1.mp3' });
  const FIELD_TRACKS = ['forest', 'city', 'desert', 'sea'];
  const MUSIC_GAIN = 0.224, DUCK = 0.5;
  // 징글: −21 LUFS 파일을 0.56(−5 dB)로 약 −26 LUFS. 지금까지의 합성 「잡았다」 효과음(−28.6 LUFS)보다 조금 크게, 울음소리보다는 작게.
  const JINGLE_GAIN = 0.56;
  const CROSSFADE = 0.8, STOP_FADE = 0.3, CUT_FADE = 0.12, RESUME_FADE = 0.3;

  // 화면 → 곡 이름(TRACKS) 또는 null(음악 없음). game.js musicForScreen 이 화면·배틀 단계가 바뀔 때마다 부른다.
  // 필드는 지역 곡, 배틀(튜토리얼 배틀 포함)은 34 Fight, 금색 볼 배틀은 13 Mystical, 잡았다·도망 화면은 음악 없음,
  // 그 밖의 화면(처음 화면·지역 고르기·도감·글자 쓰기·마당·튜토리얼 카드 등)은 모두 처음 화면 곡.
  function trackFor({ screen, region, phase, gold } = {}) {
    if (screen === 'field') return FIELD_TRACKS.includes(region) ? region : 'forest';
    if (screen === 'battle') return phase === 'caught' || phase === 'fled' ? null : gold ? 'gold' : 'battle';
    return 'title';
  }

  let on = false;
  let wanted = null;    // 지금 화면이 바라는 곡(null 은 음악 없음)
  let current = null;   // 지금 곡 { name, buffer, source, gain, startedAt, offset }. 풀어 둔 버퍼를 들고 있는 곡은 이 하나뿐
  let loading = null;   // 받는 중인 곡 이름
  let token = 0;        // 받는 사이 곡이 바뀌거나 소리를 끄면 늦게 온 곡은 버린다
  let musicBus = null;  // 음악 전체 크기(MUSIC_GAIN × 줄임)
  let ducked = false, duckTimer = 0;
  let jingleNow = null; // 지금 나는 징글 { file, source, gain }
  const jingleWanted = new Set(), jingleBuffers = new Map(), jingleLoads = new Set();

  const loopStart = () => PAD / RATE;
  const loopEnd = name => (PAD + TRACKS[name].samples) / RATE;
  function hidden() { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; }
  function bus() {
    const c = ensure(); if (!c) return null;
    if (!musicBus) { musicBus = c.createGain(); musicBus.gain.value = MUSIC_GAIN; musicBus.connect(c.destination); ducked = false; }
    return musicBus;
  }
  function fetchSound(url) {
    return fetch(url).then(response => { if (!response.ok) throw new Error(url + ' ' + response.status); return response.arrayBuffer(); })
      .then(bytes => new Promise((resolve, reject) => {
        // 옛 사파리(webkitAudioContext)는 콜백만, 요즘 브라우저는 Promise 도 돌려준다.
        try { const p = ctx.decodeAudioData(bytes, resolve, reject); if (p && typeof p.then === 'function') p.then(resolve, reject); } catch (e) { reject(e); }
      }));
  }
  // 지금 소리 설정·화면 곡·첫 누름·탭 보임에 맞춘다. 같은 곡이면 그대로 이어서(숨김에서 돌아오면 멈춘 자리부터) 튼다.
  function syncMusic() {
    if (!on || !wanted) { stopMusic(on ? STOP_FADE : CUT_FADE); return; }
    if (!unlocked || hidden() || !ensure()) return; // 첫 누름 뒤·탭이 다시 보일 때 다시 온다
    if (current && current.name === wanted) { if (!current.source) startSource(current, RESUME_FADE); return; }
    if (loading !== wanted) load(wanted);
  }
  function load(name) {
    const mine = ++token;
    loading = name;
    fetchSound(MUSIC_DIR + TRACKS[name].file).then(buffer => {
      if (mine !== token) return;
      loading = null;
      if (!on || wanted !== name) return;
      const previous = current;
      current = { name, buffer, source: null, gain: null, startedAt: 0, offset: loopStart() };
      if (!hidden()) startSource(current, previous && previous.source ? CROSSFADE : STOP_FADE);
      if (previous) release(previous, CROSSFADE);
    }, () => {
      // 못 받으면 음악 없이(지난 화면 곡을 이 화면에 남기지 않고, 옛 합성 곡으로 돌아가지도 않는다).
      if (mine !== token) return;
      loading = null;
      if (current) { release(current, STOP_FADE); current = null; }
    });
  }
  function startSource(track, fade) {
    const c = ensure(), out = bus(); if (!c || !out || !track.buffer) return;
    const source = c.createBufferSource(), gain = c.createGain(), t = c.currentTime;
    source.buffer = track.buffer; source.loop = true;
    source.loopStart = loopStart(); source.loopEnd = loopEnd(track.name);
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(1, t + fade);
    source.connect(gain); gain.connect(out);
    try { source.start(t, track.offset); } catch (e) { return; }
    track.source = source; track.gain = gain; track.startedAt = t;
    watchDuck();
  }
  // 지금 반복 구간 안 재생 위치(초).
  function position(track) {
    const a = loopStart(), b = loopEnd(track.name);
    let at = track.offset + Math.max(0, ctx.currentTime - track.startedAt);
    if (at >= b) at = a + ((at - a) % (b - a));
    return at;
  }
  // 소리를 줄이며 멈춘다(버퍼는 track 에 남는다 — 탭을 숨길 때).
  function silence(track, fade) {
    const { source, gain } = track;
    if (!source) return;
    track.source = null; track.gain = null;
    const t = ctx.currentTime, g = gain.gain;
    try { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade); source.stop(t + fade + 0.02); } catch (e) { /* 이미 멈춤 */ }
    source.onended = () => { try { source.disconnect(); gain.disconnect(); } catch (e) { /* 무시 */ } };
  }
  // 멈추고 버퍼도 놓는다(곡을 바꿀 때·소리를 끌 때).
  function release(track, fade) { silence(track, fade); track.buffer = null; }
  function stopMusic(fade) {
    token++; loading = null;
    if (current) { release(current, fade); current = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (hidden()) { if (current && current.source) { current.offset = position(current); silence(current, 0.05); } }
    else syncMusic();
  });

  // 말(문제 읽기·음성 안내 — 둘 다 speechSynthesis)·울음소리·징글이 나는 동안 음악을 줄인다. 음악이 나는 동안만 0.15초마다 본다.
  function speaking() { try { return Boolean(window.speechSynthesis && window.speechSynthesis.speaking); } catch (e) { return false; } }
  function crying() { return Boolean(cryEl && !cryEl.paused && !cryEl.ended); }
  function updateDuck() {
    if (!musicBus || !ctx) return;
    const want = Boolean(jingleNow) || crying() || speaking();
    if (want === ducked) return;
    ducked = want;
    const t = ctx.currentTime, g = musicBus.gain;
    try { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(MUSIC_GAIN * (want ? DUCK : 1), t, want ? 0.06 : 0.35); } catch (e) { /* 무시 */ }
  }
  function watchDuck() {
    updateDuck();
    if (duckTimer) return;
    duckTimer = setInterval(() => {
      if (!current || !current.source) { clearInterval(duckTimer); duckTimer = 0; return; }
      updateDuck();
    }, 150);
  }

  // ---------- 징글: 잡은 순간 Success3, 선물 상자가 열릴 때 Secret1 (한 번씩) ----------
  // prepare 로 미리 받아 두고(배틀·선물 장면이 시작될 때), 그 순간 아직 못 받았으면 지금까지의 합성 「잡았다」 효과음을 낸다.
  function loadJingles() {
    if (!on || !ensure()) return;
    for (const name of jingleWanted) {
      if (jingleBuffers.has(name) || jingleLoads.has(name)) continue;
      jingleLoads.add(name);
      fetchSound(MUSIC_DIR + JINGLES[name]).then(buffer => { jingleBuffers.set(name, buffer); }, () => { /* 그때는 합성 효과음 */ })
        .then(() => jingleLoads.delete(name));
    }
  }
  function stopJingle() {
    const playing = jingleNow;
    jingleNow = null;
    if (playing) { try { playing.source.stop(); } catch (e) { /* 이미 끝남 */ } }
    updateDuck();
  }

  window.Sfx = {
    unlock,
    TRACKS, JINGLES, trackFor,
    play(name) { if (on) synth(name); },
    capture() {
      if (!on) return;
      const c = ensure(); if (!c) return;
      const start = c.currentTime + .01;
      SOUNDS.throw(start);
      for (const offset of [1.24,1.82,2.40]) SOUNDS.shake(start + offset);
      SOUNDS.hit(start + 3.02);
    },
    cry(id) {
      if (!on || !cryEl || !id) return;
      const version=++cryVersion;
      let retried = false;
      const fallback=()=>{
        if(retried||!on||version!==cryVersion)return;
        retried=true;
        void window.PokemonAssets.playableCry(id,false).then(play).catch(()=>{});
      };
      const play=source=>{
        if(!source||!on||version!==cryVersion)return;
        try { cryEl.pause();cryEl.muted=false;cryEl.onerror=fallback;cryEl.src=source;cryEl.currentTime=0;const pr=cryEl.play();if(pr?.catch)pr.catch(fallback);updateDuck(); } catch { fallback(); }
      };
      void window.PokemonAssets.playableCry(id).then(source=>source?play(source):fallback()).catch(fallback);
    },
    // 지금 나는 울음소리가 끝날 때까지 남은 시간(ms). 안 나고 있거나(소리 끔·막힘·끝남) 길이를 아직 모르면 0.
    // 배틀 공개(game.js)가 울음소리 위에 문제 읽기가 얹히지 않게 기다리는 데 쓴다.
    cryLeft() {
      if (!cryEl || cryEl.paused || cryEl.ended || !Number.isFinite(cryEl.duration)) return 0;
      return Math.max(0, Math.round((cryEl.duration - cryEl.currentTime) * 1000));
    },
    // 화면에 맞는 배경 음악(trackFor 의 이름, null 은 음악 없음). 같은 곡이면 이어서, 다른 곡이면 받아서 겹쳐 바꾼다.
    music(name) {
      wanted = name && TRACKS[name] ? name : null;
      syncMusic();
    },
    // 징글 미리 받기('caught' | 'gift'). 소리가 꺼져 있으면 켤 때 받는다.
    prepare(name) { if (JINGLES[name]) { jingleWanted.add(name); loadJingles(); } },
    jingle(name) {
      if (!on || !JINGLES[name]) return;
      const c = ensure(), buffer = jingleBuffers.get(name);
      if (!c || !buffer) { this.prepare(name); synth('caught'); return; }
      stopJingle();
      const source = c.createBufferSource(), gain = c.createGain();
      gain.gain.value = JINGLE_GAIN; source.buffer = buffer;
      source.connect(gain); gain.connect(c.destination);
      const playing = { file: JINGLES[name], source, gain };
      source.onended = () => { try { gain.disconnect(); } catch (e) { /* 무시 */ } if (jingleNow === playing) { jingleNow = null; updateDuck(); } };
      jingleNow = playing;
      try { source.start(c.currentTime + 0.01); } catch (e) { jingleNow = null; }
      updateDuck();
    },
    // 시험용 읽기 전용 값: 지금 들리는 배경 음악·징글 파일 이름(없으면 null).
    get playing() { return Object.freeze({ music: current && current.source ? TRACKS[current.name].file : null, jingle: jingleNow ? jingleNow.file : null }); },
    isOn() { return on; },
    isUnlocked() { return unlocked; },
    // 소리 하나(settings.sound): 끄면 효과음·울음소리·징글·음악이 바로 멈추고(음악 버퍼도 놓는다), 켜면 지금 화면 곡을 처음부터 다시 받는다.
    setOn(v) {
      if(!v)cryVersion++;
      on = !!v;
      if (master && ctx) master.gain.setValueAtTime(on ? .7 : 0, ctx.currentTime);
      if (on) { ensure(); this.play('tap'); loadJingles(); }
      else { if (cryEl) cryEl.pause(); stopJingle(); }
      syncMusic();
    },
  };
})();
