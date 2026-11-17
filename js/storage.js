// 개인 기기 수첩. 게임 기록과 부모 잠금은 localStorage 한 레코드에만 남긴다.
// 서버 인증이 아니므로 개발자 도구·기기 소유자를 막는 보안 경계로 쓰지 않는다.
(function (root) {
  'use strict';
  const KEY = 'poke-adventure:device-save:v1';
  const LEGACY = 'pokemon-journey-v1:';
  const VERSION = 1;
  const ITERATIONS = 600000;
  const MAX_BACKUP = 256 * 1024;
  const LOCK_MS = 15 * 60 * 1000;
  const STATE_KEYS = ['caught', 'stamps', 'companion', 'companions', 'yard', 'seen', 'stampRewards', 'wordsWritten', 'wordRewards', 'settings', 'updatedAt', 'preferencesUpdatedAt', 'resetAt'];
  const SETTINGS_KEYS = ['sound', 'area', 'difficulty', 'readAloud', 'music', 'voiceGuide', 'trainerLook', 'mathMax', 'koreanLevel', 'englishLevel'];
  const SEEN = ['toured', 'stamps', 'wordbook', 'yard', 'settings'];
  let user = null;
  let state = emptyState();
  let record = null;
  let pending = false;
  let sessionLockVersion = 0;
  let accountEpoch = 0;
  let authQueue = Promise.resolve();
  let damaged = false;
  let status = '부모님이 수첩 잠금을 열어 주세요';

  function emptyState() {
    return { caught: [], stamps: [], companion: null, companions: [], yard: [], seen: [], stampRewards: 0, wordsWritten: 0, wordRewards: 0, settings: { sound: true, area: 'mixed', difficulty: 1 }, updatedAt: 0, preferencesUpdatedAt: 0, resetAt: 0 };
  }
  function today() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()); }
  function emit() { root.dispatchEvent(new CustomEvent('savechange')); }
  function setStatus(message) { status = message; emit(); }
  function resetEvent(name) { root.dispatchEvent(new CustomEvent('progressreset', { detail: { name } })); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function check(condition, message) { if (!condition) throw new Error(message); }
  function limitedKeys(value, keys) { check(object(value) && Object.keys(value).every(key => keys.includes(key)), '백업에 알 수 없는 필드가 있어요.'); }
  function safeTree(value, depth = 0) {
    if (!value || typeof value !== 'object') return;
    check(depth <= 24, '백업 기록의 구조가 너무 복잡해요.');
    for (const key of Object.keys(value)) {
      check(!['__proto__', 'prototype', 'constructor'].includes(key), '백업 필드가 올바르지 않아요.');
      safeTree(value[key], depth + 1);
    }
  }
  function nameOf(value) {
    const name = typeof value === 'string' ? value.trim().normalize('NFC') : '';
    check(name.length >= 2 && name.length <= 16 && !/[<>\x00-\x1f\x7f]/.test(name), '이름은 두 글자부터 열여섯 글자까지 별명으로 적어 주세요.');
    return name;
  }
  function sameName(a, b) { return a.normalize('NFKC').toLocaleLowerCase() === b.normalize('NFKC').toLocaleLowerCase(); }
  function integer(value, max) { return Number.isSafeInteger(value) && value >= 0 && value <= max; }
  function time(value) { return Number.isFinite(value) && value >= 0 && value <= Date.now() + 300000; }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2020-01-01' || value > today()) return false;
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  function idList(value, maximum, label) {
    check(Array.isArray(value) && value.length <= maximum && value.every(id => Number.isInteger(id) && id >= 1 && id <= 493) && new Set(value).size === value.length, label + ' 기록이 올바르지 않아요.');
    return [...value];
  }
  function validatedState(value, strict = true) {
    safeTree(value);
    if (strict) limitedKeys(value, STATE_KEYS);
    check(object(value), '저장 기록이 올바르지 않아요.');
    const defaults = emptyState();
    const result = { ...defaults, ...value };
    result.caught = idList(result.caught, 493, '포켓몬').sort((a, b) => a - b);
    check(Array.isArray(result.stamps) && result.stamps.length <= 15000 && result.stamps.every(date) && new Set(result.stamps).size === result.stamps.length, '출석 기록이 올바르지 않아요.');
    result.stamps = [...result.stamps].sort();
    if (!Object.hasOwn(value, 'companions')) result.companions = result.companion ? [result.companion] : [];
    result.companions = idList(result.companions, 2, '동행');
    check(result.companion === (result.companions[0] ?? null) && result.companions.every(id => result.caught.includes(id)), '잡은 포켓몬 중에서 동행을 다시 골라 주세요.');
    result.yard = idList(result.yard, 10, '마당');
    check(result.yard.every(id => result.caught.includes(id)), '잡은 포켓몬만 마당에 둘 수 있어요.');
    check(Array.isArray(result.seen) && result.seen.length <= SEEN.length && result.seen.every(name => SEEN.includes(name)) && new Set(result.seen).size === result.seen.length, '안내 기록이 올바르지 않아요.');
    result.seen = [...result.seen].sort();
    check(integer(result.stampRewards, 3000) && integer(result.wordsWritten, 100000) && integer(result.wordRewards, 20000), '선물 보상 기록이 올바르지 않아요.');
    const stampLimit = Math.floor(result.stamps.length / 5), wordLimit = Math.floor(result.wordsWritten / 5);
    if (strict) check(result.stampRewards <= stampLimit && result.wordRewards <= wordLimit, '선물 보상 기록이 올바르지 않아요.');
    result.stampRewards = Math.min(result.stampRewards, stampLimit);
    result.wordRewards = Math.min(result.wordRewards, wordLimit);
    check(object(result.settings), '게임 설정이 올바르지 않아요.');
    if (strict) limitedKeys(result.settings, SETTINGS_KEYS);
    const settings = { ...defaults.settings, ...result.settings };
    check(typeof settings.sound === 'boolean' && ['mixed', 'math', 'korean', 'english', 'creative'].includes(settings.area) && [1, 2, 3].includes(settings.difficulty), '게임 설정이 올바르지 않아요.');
    for (const key of ['readAloud', 'music', 'voiceGuide']) if (Object.hasOwn(settings, key)) check(typeof settings[key] === 'boolean', '소리 설정이 올바르지 않아요.');
    for (const [key, allowed] of [['mathMax', [5, 10, 20, 50, 100]], ['koreanLevel', [1, 2, 3, 4, 5, 6, 7]], ['englishLevel', [1, 2, 3, 4]]]) {
      if (Object.hasOwn(settings, key)) check(allowed.includes(settings[key]), '학습 설정이 올바르지 않아요.');
    }
    if (Object.hasOwn(settings, 'trainerLook')) check(['boy', 'girl'].includes(settings.trainerLook), '캐릭터 설정이 올바르지 않아요.');
    result.settings = Object.fromEntries(SETTINGS_KEYS.filter(key => Object.hasOwn(settings, key)).map(key => [key, settings[key]]));
    check(time(result.updatedAt) && time(result.preferencesUpdatedAt) && time(result.resetAt), '기록 날짜와 기기 시간을 확인해 주세요.');
    return Object.fromEntries(STATE_KEYS.map(key => [key, result[key]]));
  }
  function validatedRecord(value) {
    safeTree(value);
    limitedKeys(value, ['version', 'revision', 'user', 'credential', 'state', 'failedAttempts', 'lockedUntil', 'lockVersion']);
    check(value.version === VERSION && integer(value.revision, Number.MAX_SAFE_INTEGER) && integer(value.lockVersion, Number.MAX_SAFE_INTEGER), '기기 수첩 버전을 확인해 주세요.');
    limitedKeys(value.user, ['name']);
    const name = nameOf(value.user.name);
    limitedKeys(value.credential, ['algorithm', 'iterations', 'salt', 'hash']);
    const credential = value.credential;
    check(credential.algorithm === 'PBKDF2-SHA256' && credential.iterations === ITERATIONS && /^[a-f0-9]{32}$/.test(credential.salt) && /^[a-f0-9]{64}$/.test(credential.hash), '기기 잠금 정보가 올바르지 않아요.');
    check(integer(value.failedAttempts, 5) && time(value.lockedUntil === 0 ? 0 : value.lockedUntil - LOCK_MS), '기기 잠금 기록이 올바르지 않아요.');
    return { version: VERSION, revision: value.revision, user: { name }, credential: { ...credential }, state: validatedState(value.state), failedAttempts: value.failedAttempts, lockedUntil: value.lockedUntil, lockVersion: value.lockVersion };
  }
  function stored() {
    const raw = localStorage.getItem(KEY);
    return raw === null ? null : validatedRecord(JSON.parse(raw));
  }
  function save(next) {
    const serialized = JSON.stringify(next);
    try { localStorage.setItem(KEY, serialized); }
    catch { throw new Error('이 기기에 저장하지 못했어요. 저장 공간을 확인하고 기록을 백업해 주세요.'); }
    record = next;
    return next;
  }
  function nextRecord(base, changes) { return { ...base, ...changes, revision: base.revision + 1 }; }
  function needLogin() { check(Boolean(user), '부모님이 수첩 잠금을 열고 로그인해 주세요.'); }
  function data() { return { user: user ? { ...user } : null, state: copy(state) }; }
  function locked() { user = null; state = emptyState(); pending = false; accountEpoch++; setStatus('부모님이 수첩 잠금을 열어 주세요'); }
  function freshRecord() {
    let latest;
    try { latest = stored(); } catch { throw new Error('기기 저장 기록을 읽지 못했어요. 기록을 백업하고 저장 공간을 확인해 주세요.'); }
    check(Boolean(latest), '기기 수첩을 찾지 못했어요.');
    if (user && latest.lockVersion !== sessionLockVersion) { record = latest; locked(); throw new Error('수첩이 잠겼어요. 부모님이 다시 로그인해 주세요.'); }
    return latest;
  }
  function mergeState(saved, current) {
    const merged = root.GameRules.mergeState(saved, current);
    const newer = current.preferencesUpdatedAt > saved.preferencesUpdatedAt ? current : saved;
    merged.settings = { ...newer.settings };
    merged.companion = newer.companion;
    merged.companions = [...(newer.companions || [])];
    merged.updatedAt = Math.max(saved.updatedAt, current.updatedAt);
    merged.preferencesUpdatedAt = Math.max(saved.preferencesUpdatedAt, current.preferencesUpdatedAt);
    return validatedState(merged, false);
  }
  function noticeReset(latest) {
    if (latest.state.resetAt <= state.resetAt) return false;
    record = latest; state = copy(latest.state); pending = false; setStatus('이 기기의 새 기록으로 바뀌었어요'); resetEvent(user.name); return true;
  }
  function attendance(value) {
    const day = today();
    return value.stamps.includes(day) ? value : { ...value, stamps: [...value.stamps, day].sort(), updatedAt: Date.now() };
  }
  function hex(bytes) { return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); }
  function bytes(value) { return Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16)); }
  async function pinHash(pin, salt) {
    check(typeof pin === 'string' && /^\d{4}$/.test(pin), '비밀번호는 숫자 네 자리로 입력해 주세요.');
    check(root.crypto?.subtle && root.crypto?.getRandomValues, '이 브라우저에서는 안전한 잠금을 만들 수 없어요. 보안 연결로 열어 주세요.');
    const key = await root.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return hex(new Uint8Array(await root.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes(salt), iterations: ITERATIONS, hash: 'SHA-256' }, key, 256)));
  }
  function sameHash(a, b) {
    let different = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) different |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return different === 0;
  }
  function checkCooldown(value) { check(value.lockedUntil <= Date.now(), '다섯 번 틀려 잠겼어요. 15분 뒤 부모님이 다시 열어 주세요.'); }
  async function verified(pin, name, epoch) {
    const base = freshRecord(); checkCooldown(base);
    const computed = await pinHash(pin, base.credential.salt);
    check(epoch === accountEpoch, '수첩 상태가 바뀌었어요. 다시 로그인해 주세요.');
    const latest = freshRecord(); checkCooldown(latest);
    if (!sameName(name, latest.user.name) || !sameHash(computed, latest.credential.hash)) {
      const failures = Math.min(5, (latest.lockedUntil && latest.lockedUntil <= Date.now() ? 0 : latest.failedAttempts) + 1);
      save(nextRecord(latest, { failedAttempts: failures, lockedUntil: failures === 5 ? Date.now() + LOCK_MS : 0 }));
      throw new Error(failures === 5 ? '다섯 번 틀려 잠겼어요. 15분 뒤 다시 해 주세요.' : '이름 또는 비밀번호가 맞지 않아요.');
    }
    return latest;
  }
  function legacyState(name) {
    try {
      // 옛 화면에서 로그아웃했다면 session은 없어도 이름별 임시 기록은 남아 있다.
      // 부모님이 지금 등록한 이름의 캐시만 읽고 다른 이름의 진행을 섞지 않는다.
      const key = LEGACY + 'save:' + encodeURIComponent(name.normalize('NFKC').toLocaleLowerCase());
      const previous = JSON.parse(localStorage.getItem(key));
      if (!previous?.state) return emptyState();
      const raw = Object.fromEntries(STATE_KEYS.filter(key => Object.hasOwn(previous.state, key)).map(key => [key, previous.state[key]]));
      return validatedState(raw, false);
    } catch { throw new Error('이전 기기 기록을 읽지 못했어요. 기록을 확인한 뒤 수첩을 만들어 주세요.'); }
  }
  async function init() {
    user = null; state = emptyState(); pending = false; accountEpoch++;
    try { record = stored(); damaged = false; setStatus('부모님이 수첩 잠금을 열어 주세요'); }
    catch { damaged = true; setStatus('기기 저장 기록을 읽지 못했어요. 저장 공간을 확인해 주세요.'); }
    emit();
  }
  async function authenticateNow(action, name, pin, epoch) {
    name = nameOf(name);
    check(['register', 'login'].includes(action), '수첩 열기 방법을 확인해 주세요.');
    check(!damaged, '기기 저장 기록을 확인해 주세요. 기존 수첩을 덮어쓰지 않았어요.');
    if (action === 'register') {
      check(!stored(), '이미 부모님 수첩이 있어요. 로그인해서 잠금을 열어 주세요.');
      const original = legacyState(name);
      check(root.crypto?.getRandomValues, '이 브라우저에서는 안전한 잠금을 만들 수 없어요.');
      const salt = hex(root.crypto.getRandomValues(new Uint8Array(16)));
      const hash = await pinHash(pin, salt);
      check(epoch === accountEpoch, '수첩 상태가 바뀌었어요. 다시 해 주세요.');
      check(!stored(), '이미 부모님 수첩이 등록됐어요. 로그인해 주세요.');
      const initial = attendance(original);
      save({ version: VERSION, revision: 1, user: { name }, credential: { algorithm: 'PBKDF2-SHA256', iterations: ITERATIONS, salt, hash }, state: initial, failedAttempts: 0, lockedUntil: 0, lockVersion: 0 });
    } else {
      const latest = await verified(pin, name, epoch);
      // 배경 잠금이 저장 공간 부족으로 끝나지 못한 경우, 인증한 같은 부모에게만
      // 메모리에 남은 새 진행을 돌려준다. 다른 창의 잠금/초기화 경계는 넘지 않는다.
      const retainedPending = pending && user && sameName(user.name, latest.user.name) &&
        sessionLockVersion === latest.lockVersion && state.resetAt === latest.state.resetAt;
      const nextState = attendance(retainedPending ? mergeState(latest.state, state) : latest.state);
      try { save(nextRecord(latest, { failedAttempts: 0, lockedUntil: 0, state: nextState })); }
      catch (error) {
        if (!retainedPending) throw error;
        record = latest; user = { ...latest.user }; state = copy(nextState);
        sessionLockVersion = latest.lockVersion; pending = true;
        setStatus(error.message);
        return data();
      }
    }
    user = { ...record.user }; state = copy(record.state); sessionLockVersion = record.lockVersion; pending = false; setStatus('이 기기에 저장되어 있어요'); return data();
  }
  function authenticate(action, name, pin) {
    const epoch = accountEpoch;
    const job = authQueue.catch(() => {}).then(() => authenticateNow(action, name, pin, epoch));
    authQueue = job;
    return job;
  }
  function update(patch, preferences = false) {
    needLogin();
    check(object(patch), '저장할 기록을 확인해 주세요.');
    limitedKeys(patch, STATE_KEYS);
    let latest, readFailure = null;
    try { latest = freshRecord(); }
    catch (error) { if (!user) throw error; latest = record; readFailure = error; }
    if (noticeReset(latest)) return false;
    const candidate = validatedState({ ...state, ...patch, settings: { ...state.settings, ...(patch.settings || {}) }, updatedAt: Date.now(), preferencesUpdatedAt: preferences ? Math.max(Date.now(), state.preferencesUpdatedAt + 1, latest.state.preferencesUpdatedAt + 1) : state.preferencesUpdatedAt }, false);
    state = mergeState(latest.state, candidate);
    // 읽을 수 없는 디스크를 오래된 메모리 사본으로 덮어쓰지 않는다. 새 진행은 백업할 수 있게 메모리에 둔다.
    if (readFailure) { pending = true; setStatus(readFailure.message); return false; }
    try { save(nextRecord(latest, { state: copy(state) })); pending = false; setStatus('이 기기에 저장했어요'); return true; }
    catch (error) { pending = true; setStatus(error.message); return false; }
  }
  async function sync() {
    if (!user) return;
    if (pending) update({});
  }
  async function refresh() {
    if (!user) return;
    const latest = freshRecord();
    if (noticeReset(latest)) return;
    state = mergeState(latest.state, state);
    record = latest;
    const next = attendance(state);
    if (pending || JSON.stringify(next) !== JSON.stringify(latest.state)) { state = next; update({}); }
    else setStatus('이 기기에 저장되어 있어요');
  }
  async function logout() {
    accountEpoch++;
    if (!user) { setStatus('부모님이 수첩 잠금을 열어 주세요'); return; }
    await sync();
    check(!pending, '아직 이 기기에 저장하지 못한 기록이 있어요. 먼저 백업해 주세요.');
    const latest = freshRecord();
    save(nextRecord(latest, { lockVersion: latest.lockVersion + 1 }));
    locked();
  }
  async function reset(pin) {
    needLogin();
    const epoch = accountEpoch, latest = await verified(pin, user.name, epoch), next = emptyState();
    next.settings = { ...latest.state.settings }; delete next.settings.trainerLook;
    next.resetAt = Math.max(Date.now(), latest.state.resetAt + 1);
    next.updatedAt = next.resetAt; next.preferencesUpdatedAt = next.resetAt; next.stamps = [today()];
    save(nextRecord(latest, { state: next, failedAttempts: 0, lockedUntil: 0 }));
    const name = user.name; state = copy(next); pending = false; setStatus('이 기기의 기록을 새로 시작했어요'); resetEvent(name); return data();
  }
  async function exportBackup() {
    needLogin();
    return JSON.stringify({ format: 'poke-adventure-device-backup', version: VERSION, exportedAt: Date.now(), state: validatedState(state) }, null, 2);
  }
  async function importBackup(raw) {
    needLogin();
    check(typeof raw === 'string' && raw.length <= MAX_BACKUP, '백업 파일이 너무 크거나 올바르지 않아요.');
    let backup;
    try { backup = JSON.parse(raw); } catch { throw new Error('백업 파일을 읽지 못했어요. JSON 파일을 골라 주세요.'); }
    safeTree(backup); limitedKeys(backup, ['format', 'version', 'exportedAt', 'state']);
    check(backup.format === 'poke-adventure-device-backup' && backup.version === VERSION && time(backup.exportedAt), '백업 파일 버전과 날짜를 확인해 주세요.');
    check(object(backup.state) && STATE_KEYS.every(key=>Object.hasOwn(backup.state,key)), '백업에 필요한 진행 기록이 빠져 있어요. 원래 백업 파일을 골라 주세요.');
    const next = validatedState(backup.state), latest = freshRecord();
    next.resetAt = Math.max(Date.now(), state.resetAt + 1, latest.state.resetAt + 1); next.updatedAt = next.resetAt; next.preferencesUpdatedAt = next.resetAt;
    save(nextRecord(latest, { state: next }));
    state = copy(next); pending = false; setStatus('백업 기록을 이 기기에 복원했어요'); resetEvent(user.name); return data();
  }
  root.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    try {
      const latest = stored();
      if (!latest) { record = null; locked(); return; }
      if (!user) { record = latest; emit(); return; }
      if (latest.lockVersion !== sessionLockVersion) { record = latest; locked(); return; }
      if (noticeReset(latest)) return;
      if (latest.state.resetAt < state.resetAt) return;
      const merged = mergeState(latest.state, state);
      record = latest; state = merged;
      if (JSON.stringify(merged) !== JSON.stringify(latest.state)) { save(nextRecord(latest, { state: copy(merged) })); }
      pending = false; setStatus('이 기기의 다른 창과 기록을 맞췄어요');
    } catch { setStatus('기기 저장 기록을 읽지 못했어요. 먼저 백업해 주세요.'); }
  });
  root.addEventListener('online', () => { void refresh().catch(() => {}); });
  root.addEventListener('pagehide', () => { if (user && pending) void sync().catch(() => {}); });
  root.GameStorage = { init, authenticate, update, sync, refresh, logout, reset, exportBackup, importBackup,
    get user() { return user; }, get state() { return state; }, get status() { return status; }, get pending() { return pending; }, get needsLogin() { return !user; }, get hasAccount() { return Boolean(record) || damaged; } };
})(window);
