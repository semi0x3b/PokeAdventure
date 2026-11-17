import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../js/storage.js',import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../js/core.js',import.meta.url),'utf8');
const KEY='poke-adventure:device-save:v1';
const LEGACY='pokemon-journey-v1:';
const START=Date.parse('2026-11-17T14:59:00Z');
const NAME='부모수첩',PIN='2468';
const plain=value=>JSON.parse(JSON.stringify(value));

function harness(values=new Map(),options={}){
  let now=START,blocked=Boolean(options.blocked),readBlocked=Boolean(options.blockRead),writes=0,requests=0;
  const listeners=new Map(),events=[];
  const localStorage={getItem(key){if(readBlocked)throw Error('읽기 차단');return values.get(key)??null;},setItem(key,value){if(blocked)throw Error('저장 용량 부족');writes++;values.set(key,value);},removeItem(key){values.delete(key);}};
  const window={crypto:options.noCrypto?undefined:webcrypto,addEventListener(name,fn){listeners.set(name,fn);},dispatchEvent(event){events.push(event);}};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const context=vm.createContext({window,crypto:webcrypto,AbortSignal,localStorage,Date:Clock,Intl,TextEncoder,Uint8Array,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},navigator:{onLine:true,sendBeacon(){requests++;throw Error('서버 요청 금지');}},fetch(){requests++;throw Error('서버 요청 금지');},setTimeout,clearTimeout});
  vm.runInContext(rules,context);context.GameRules=window.GameRules;vm.runInContext(source,context);
  return{storage:window.GameStorage,values,events,listeners,get writes(){return writes;},get requests(){return requests;},setBlocked(value){blocked=value;},setReadBlocked(value){readBlocked=value;},setTime(value){now=value;},fire(name,event={}){return listeners.get(name)?.(event);},disk(){return JSON.parse(values.get(KEY));}};
}
async function registered(values=new Map()) {const h=harness(values);await h.storage.init();await h.storage.authenticate('register',NAME,PIN);return h;}

// 암호 계산은 실제 WebCrypto를 사용한다. 테스트용 빠른 해시로 교체하지 않는다.
test('매번 부모 잠금으로 시작하고 이름·PIN 인증 뒤 오늘 도장과 기기 기록을 쓴다',async()=>{
  const first=await registered();assert.equal(first.storage.user.name,NAME);assert.deepEqual(plain(first.storage.state.stamps),['2026-11-17']);
  first.storage.update({caught:[25],companions:[25],companion:25},true);
  const second=harness(first.values);await second.storage.init();assert.equal(second.storage.user,null);assert.deepEqual(plain(second.storage.state.caught),[]);assert.equal(second.storage.hasAccount,true);
  await assert.rejects(second.storage.exportBackup(),/잠금|로그인/);
  await second.storage.authenticate('login',NAME,PIN);assert.deepEqual(plain(second.storage.state.caught),[25]);assert.equal(second.storage.state.companion,25);
  await second.storage.refresh();await second.storage.sync();second.fire('online');second.fire('pagehide');
  assert.equal(first.requests+second.requests,0);await second.storage.logout();assert.equal(second.storage.user,null);
  assert.deepEqual(second.disk().state.caught,[25],'잠금은 기록을 지우지 않음');
});

test('PIN은 랜덤 salt·PBKDF2 해시로 저장하고 다른 수첩 등록으로 부모 잠금을 우회하지 못한다',async()=>{
  const a=await registered(),b=await registered();
  assert.notEqual(a.disk().credential.salt,b.disk().credential.salt);assert.notEqual(a.disk().credential.hash,b.disk().credential.hash);
  assert.equal(a.disk().credential.iterations,600000);assert.equal(a.disk().credential.algorithm,'PBKDF2-SHA256');assert.equal(a.disk().credential.pin,undefined);
  await a.storage.logout();await assert.rejects(a.storage.authenticate('register','다른수첩','1234'),/이미|등록/);assert.equal(a.storage.user,null);
  assert.equal(a.values.has(LEGACY+'session'),false,'자동 로그인 상태를 쓰지 않음');
});

test('옛 서버 캐시는 같은 이름으로 부모 PIN을 새로 등록할 때만 기록을 이전한다',async()=>{
  const values=new Map();values.set(LEGACY+'session',JSON.stringify({name:NAME,token:'복사하지않는필드'}));
  const old={caught:[25,7],stamps:['2026-11-12','2026-11-13','2026-11-14','2026-11-15','2026-11-16'],companions:[25,7],companion:25,yard:[7],stampRewards:1,wordsWritten:15,wordRewards:3,seen:['yard'],settings:{sound:false,area:'english',difficulty:2,trainerLook:'girl',englishLevel:3},updatedAt:START-1000,preferencesUpdatedAt:START-1000};
  values.set(LEGACY+'save:'+encodeURIComponent(NAME.toLowerCase()),JSON.stringify({state:old,pending:true}));
  const h=harness(values);await h.storage.init();assert.equal(h.storage.user,null);assert.equal(h.storage.hasAccount,false);
  await h.storage.authenticate('register',NAME,PIN);assert.deepEqual(plain(h.storage.state.caught),[7,25]);
  for(const field of ['companions','yard','stampRewards','wordsWritten','wordRewards','seen','settings'])assert.deepEqual(plain(h.storage.state[field]),plain(old[field]));
  assert.equal(h.storage.state.stamps.length,6);assert.equal(h.disk().user.token,undefined);assert.equal(h.requests,0);
});

test('옛 로그아웃으로 session이 없어도 등록한 이름의 캐시만 이전한다',async()=>{
  const template=await registered();template.storage.update({caught:[25]});const progress=plain(template.storage.state);
  const values=new Map([[LEGACY+'save:'+encodeURIComponent(NAME),JSON.stringify({state:progress,pending:false})]]);
  const h=harness(values);await h.storage.init();await h.storage.authenticate('register',NAME,PIN);assert.deepEqual(plain(h.storage.state.caught),[25]);
  const other=harness(new Map([[LEGACY+'save:'+encodeURIComponent(NAME),JSON.stringify({state:progress,pending:false})]]));await other.storage.init();await other.storage.authenticate('register','다른부모','1234');assert.deepEqual(plain(other.storage.state.caught),[]);
});

test('이름이 다르거나 PIN이 틀린 시도 다섯 번 뒤 15분 동안 올바른 PIN도 거절한다',async()=>{
  const h=await registered();await h.storage.logout();
  for(let i=0;i<5;i++)await assert.rejects(h.storage.authenticate('login',i===0?'다른이름':NAME,'0000'),/이름|비밀번호|잠금|15분/);
  assert.equal(h.disk().failedAttempts,5);assert.ok(h.disk().lockedUntil>START);
  await assert.rejects(h.storage.authenticate('login',NAME,PIN),/15분|잠금/);
  const next=harness(h.values);await next.storage.init();await assert.rejects(next.storage.authenticate('login',NAME,PIN),/15분|잠금/);
  next.setTime(START+15*60*1000+1);await next.storage.authenticate('login',NAME,PIN);assert.equal(next.storage.user.name,NAME);assert.equal(next.disk().failedAttempts,0);
});

test('한국 시각 자정에 도장을 하나만 더하고 선물 수는 다섯 개 기준을 넘지 않는다',async()=>{
  const h=await registered();h.setTime(Date.parse('2026-11-17T15:00:00Z'));await h.storage.refresh();await h.storage.refresh();
  assert.deepEqual(plain(h.storage.state.stamps),['2026-11-17','2026-11-18']);h.storage.update({stampRewards:4,wordsWritten:9,wordRewards:2});assert.equal(h.storage.state.stampRewards,0);assert.equal(h.storage.state.wordRewards,1);
});

test('저장 공간이 막히면 진행을 메모리에 남기고 백업을 제공하되 저장 성공으로 표시하지 않는다',async()=>{
  const h=await registered();const saved=h.values.get(KEY);h.setBlocked(true);h.storage.update({caught:[25]});
  assert.deepEqual(plain(h.storage.state.caught),[25]);assert.equal(h.storage.pending,true);assert.match(h.storage.status,/저장하지 못|백업/);assert.equal(h.values.get(KEY),saved);
  assert.deepEqual(JSON.parse(await h.storage.exportBackup()).state.caught,[25]);h.setBlocked(false);await h.storage.sync();assert.equal(h.storage.pending,false);assert.deepEqual(h.disk().state.caught,[25]);
});

test('저장 실패로 잠금이 끝나지 못해도 같은 부모가 다시 열면 미저장 진행과 백업을 보존한다',async()=>{
  const h=await registered();h.storage.update({caught:[7]});h.setBlocked(true);h.storage.update({caught:[7,25]});
  await assert.rejects(h.storage.logout(),/저장|백업/);
  const reopened=await h.storage.authenticate('login',NAME,PIN);
  assert.deepEqual(plain(reopened.state.caught),[7,25]);assert.equal(h.storage.pending,true);assert.match(h.storage.status,/저장하지 못|백업/);
  assert.deepEqual(JSON.parse(await h.storage.exportBackup()).state.caught,[7,25]);
  for(const[name,pin]of[[NAME,'0000'],['다른부모',PIN]])await assert.rejects(h.storage.authenticate('login',name,pin));
  assert.deepEqual(plain(h.storage.state.caught),[7,25]);
  h.setBlocked(false);await h.storage.authenticate('login',NAME,PIN);assert.deepEqual(h.disk().state.caught,[7,25]);assert.equal(h.storage.pending,false);
});

test('다른 탭에서 초기화했으면 다시 열 때 이전 미저장 진행을 합치지 않는다',async()=>{
  const a=await registered();a.storage.update({caught:[7]});const b=harness(a.values);await b.storage.init();await b.storage.authenticate('login',NAME,PIN);
  a.setBlocked(true);a.storage.update({caught:[7,25]});await assert.rejects(a.storage.logout(),/저장|백업/);
  await b.storage.reset(PIN);a.setBlocked(false);await a.storage.authenticate('login',NAME,PIN);
  assert.deepEqual(plain(a.storage.state.caught),[]);assert.equal(a.storage.pending,false);assert.deepEqual(a.disk().state.caught,[]);
});

test('다른 탭 잠금 버전이 바뀌면 이전 미저장 진행을 인증 성공으로 다시 노출하지 않는다',async()=>{
  const a=await registered();a.storage.update({caught:[7]});const b=harness(a.values);await b.storage.init();await b.storage.authenticate('login',NAME,PIN);
  a.setBlocked(true);a.storage.update({caught:[7,25]});await assert.rejects(a.storage.logout(),/저장|백업/);
  await b.storage.logout();a.setBlocked(false);
  await assert.rejects(a.storage.authenticate('login',NAME,PIN),/잠겼|다시 로그인/);assert.equal(a.storage.user,null);
  await a.storage.authenticate('login',NAME,PIN);assert.deepEqual(plain(a.storage.state.caught),[7]);assert.equal(a.storage.pending,false);
});

test('첫 등록 저장이 실패하면 인증되지 않고 암호·진행도 남기지 않는다',async()=>{
  const h=harness(new Map(),{blocked:true});await h.storage.init();await assert.rejects(h.storage.authenticate('register',NAME,PIN),/저장/);assert.equal(h.storage.user,null);assert.equal(h.values.has(KEY),false);
  const unavailable=harness(new Map(),{blocked:true,blockRead:true});await unavailable.storage.init();assert.equal(unavailable.storage.user,null);assert.match(unavailable.storage.status,/저장/);assert.equal(unavailable.requests,0);
});

test('로그인 전에는 기록 수정·복원·초기화를 거절한다',async()=>{
  const h=await registered();const backup=await h.storage.exportBackup();await h.storage.logout();const saved=h.values.get(KEY);
  assert.throws(()=>h.storage.update({caught:[25]}),/잠금|로그인/);await assert.rejects(h.storage.importBackup(backup),/잠금|로그인/);await assert.rejects(h.storage.reset(PIN),/잠금|로그인/);assert.equal(h.values.get(KEY),saved);
});

test('다중 탭 기록을 합치고 다른 탭 잠금·초기화를 받아들인다',async()=>{
  const a=await registered(),b=harness(a.values);await b.storage.init();await b.storage.authenticate('login',NAME,PIN);
  b.storage.update({caught:[7],settings:{sound:false}},true);a.fire('storage',{key:KEY,newValue:a.values.get(KEY)});assert.deepEqual(plain(a.storage.state.caught),[7]);assert.equal(a.storage.state.settings.sound,false);
  a.storage.update({caught:[7,25]});b.storage.update({caught:[7,133]});a.fire('storage',{key:KEY,newValue:a.values.get(KEY)});assert.deepEqual(plain(a.storage.state.caught),[7,25,133]);
  const old=plain(b.storage.state);await a.storage.reset(PIN);b.storage.update({caught:[...old.caught,1]});assert.deepEqual(plain(b.storage.state.caught),[]);assert.deepEqual(b.disk().state.caught,[]);assert.equal(b.events.filter(e=>e.type==='progressreset').length,1);
  await a.storage.logout();b.fire('storage',{key:KEY,newValue:a.values.get(KEY)});assert.equal(b.storage.user,null,'다른 탭에서 잠그면 열린 탭도 잠김');
});

test('초기화는 PIN을 검증하고 성공 때만 기록을 비우며 학습·소리 설정은 보존한다',async()=>{
  const h=await registered();h.storage.update({caught:[25],companion:25,companions:[25],yard:[25],wordsWritten:20,wordRewards:4,settings:{sound:false,trainerLook:'girl'}},true);const before=plain(h.storage.state);
  await assert.rejects(h.storage.reset('0000'),/비밀번호/);assert.deepEqual(plain(h.storage.state),before);
  h.setBlocked(true);await assert.rejects(h.storage.reset(PIN),/저장/);assert.deepEqual(plain(h.storage.state),before);assert.equal(h.events.filter(e=>e.type==='progressreset').length,0);
  h.setBlocked(false);await h.storage.reset(PIN);assert.deepEqual(plain(h.storage.state.caught),[]);assert.deepEqual(plain(h.storage.state.yard),[]);assert.equal(h.storage.state.wordRewards,0);assert.equal(h.storage.state.settings.sound,false);assert.equal(h.storage.state.settings.trainerLook,undefined);
});

test('백업은 암호를 담지 않고 현재 부모 수첩에 진행만 복원하며 새 초기화 경계를 세운다',async()=>{
  const a=await registered();a.storage.update({caught:[7,25],companions:[25,7],companion:25,yard:[7],wordsWritten:10,wordRewards:2},true);const raw=await a.storage.exportBackup(),backup=JSON.parse(raw);assert.equal(backup.credential,undefined);assert.equal(backup.user,undefined);
  const b=await registered();b.storage.update({caught:[1]});await b.storage.importBackup(raw);assert.deepEqual(plain(b.storage.state.caught),[7,25]);assert.equal(b.storage.user.name,NAME);assert.deepEqual(plain(b.storage.state.yard),[7]);assert.equal(b.storage.state.wordRewards,2);assert.equal(b.events.filter(e=>e.type==='progressreset').length,1);
});

for(const [label,edit] of [
  ['다른 버전',b=>{b.version=99;}],['비어 있는 진행',b=>{b.state={};}],['누락된 진행',b=>{delete b.state.caught;}],['범위 밖 번호',b=>{b.state.caught=[494];}],['중복 번호',b=>{b.state.caught=[25,25];}],['잡지 않은 동행',b=>{b.state.companion=7;b.state.companions=[7];}],['잘못된 설정',b=>{b.state.settings.area='unknown';}],['임의 필드',b=>{b.state.script='alert(1)';}],['프로토타입 필드',b=>{b.state=JSON.parse('{"__proto__":{"polluted":true}}');}],['미래 출석',b=>{b.state.stamps=['2099-01-01'];}],['지나친 보상',b=>{b.state.wordRewards=999;}]
])test('잘못된 백업 거절: '+label,async()=>{
  const h=await registered();h.storage.update({caught:[25]});const before=plain(h.storage.state),disk=h.values.get(KEY),backup=JSON.parse(await h.storage.exportBackup());edit(backup);
  await assert.rejects(h.storage.importBackup(JSON.stringify(backup)),/백업|기록|설정|동행|출석|보상|필드/);assert.deepEqual(plain(h.storage.state),before);assert.equal(h.values.get(KEY),disk);
});

test('깨진 JSON·큰 파일·저장 실패 복원은 기존 기록을 바꾸지 않는다',async()=>{
  const h=await registered();h.storage.update({caught:[25]});const before=plain(h.storage.state);for(const raw of ['{',' '.repeat(256*1024+1)])await assert.rejects(h.storage.importBackup(raw),/백업/);
  const raw=await h.storage.exportBackup();h.setBlocked(true);await assert.rejects(h.storage.importBackup(raw),/저장/);assert.deepEqual(plain(h.storage.state),before);
});

test('디스크 읽기가 막히거나 기록이 손상돼도 오래된 사본으로 덮어쓰지 않는다',async()=>{
  const h=await registered();h.storage.update({caught:[25]});const saved=h.values.get(KEY);h.setReadBlocked(true);h.storage.update({caught:[25,7]});
  assert.deepEqual(plain(h.storage.state.caught),[7,25]);assert.equal(h.storage.pending,true);assert.equal(h.values.get(KEY),saved);assert.match(h.storage.status,/읽지 못|백업/);
  h.setReadBlocked(false);await h.storage.sync();assert.deepEqual(h.disk().state.caught,[7,25]);
  const damaged=new Map([[KEY,'{"broken":true}']]),next=harness(damaged);await next.storage.init();assert.equal(next.storage.user,null);assert.equal(next.storage.hasAccount,true);
  await assert.rejects(next.storage.authenticate('register',NAME,PIN),/기록|덮어/);assert.equal(damaged.get(KEY),'{"broken":true}');
});

test('안전한 암호 계산이 없거나 PIN 형식이 틀리면 부모 수첩을 등록하지 않는다',async()=>{
  const h=harness(new Map(),{noCrypto:true});await h.storage.init();await assert.rejects(h.storage.authenticate('register',NAME,PIN),/안전한|보안/);assert.equal(h.values.has(KEY),false);
  const next=harness();await next.storage.init();await assert.rejects(next.storage.authenticate('register',NAME,'12ab'),/네 자리/);assert.equal(next.values.has(KEY),false);
});

test('암호를 계산하는 동안 잠그면 늦은 성공이 수첩을 다시 열지 못한다',async()=>{
  const h=await registered();await h.storage.logout();
  const opening=h.storage.authenticate('login',NAME,PIN);await Promise.resolve();await h.storage.logout();
  await assert.rejects(opening,/상태가 바뀌/);assert.equal(h.storage.user,null);
});

test('깊게 중첩되거나 날짜·설정·출석 중복·마당이 잘못된 백업도 원본을 보존한다',async()=>{
  const h=await registered(),saved=h.values.get(KEY),original=JSON.parse(await h.storage.exportBackup());
  const invalid=[b=>{b.state.settings.mathMax=3;},b=>{b.state.settings.trainerLook='unknown';},b=>{b.state.settings.readAloud='yes';},b=>{b.state.stamps=['2026-11-17','2026-11-17'];},b=>{b.state.stamps=['2026-02-30'];},b=>{b.state.yard=[25];},b=>{b.state.updatedAt=-1;},b=>{b.state.seen=['untrusted'];},b=>{b.state.wordsWritten=-1;},b=>{let next=b.state;for(let i=0;i<30;i++){next.nested={};next=next.nested;}}];
  for(const edit of invalid){const backup=plain(original);edit(backup);await assert.rejects(h.storage.importBackup(JSON.stringify(backup)));assert.equal(h.values.get(KEY),saved);}
});
