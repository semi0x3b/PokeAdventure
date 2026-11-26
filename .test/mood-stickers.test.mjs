import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

// 하루 기분 스티커(출석 도장 창): 기기 수첩 state.moods 저장·검증·합치기·백업·초기화와 처음 화면 출석 카드 표시.
const storageSource=fs.readFileSync(new URL('../js/storage.js',import.meta.url),'utf8');
const rulesSource=fs.readFileSync(new URL('../js/core.js',import.meta.url),'utf8');
const posterSource=fs.readFileSync(new URL('../js/title-poster.js',import.meta.url),'utf8');
const KEY='poke-adventure:device-save:v1';
const NAME='기분수첩',PIN='2468';
const DAY1=Date.parse('2026-11-25T03:00:00Z'); // 한국시간 11-25 낮
const DAY2=Date.parse('2026-11-26T03:00:00Z');
const plain=value=>JSON.parse(JSON.stringify(value));

function harness(values=new Map(),start=DAY1){
  let now=start;
  const listeners=new Map();
  const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const window={crypto:webcrypto,addEventListener(name,fn){listeners.set(name,fn);},dispatchEvent(){}};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const context=vm.createContext({window,crypto:webcrypto,localStorage,Date:Clock,Intl,TextEncoder,Uint8Array,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},setTimeout,clearTimeout});
  vm.runInContext(rulesSource,context);context.GameRules=window.GameRules;vm.runInContext(storageSource,context);
  return{storage:window.GameStorage,rules:window.GameRules,values,setTime(value){now=value;},fire(name,event={}){return listeners.get(name)?.(event);},disk(){return JSON.parse(values.get(KEY));}};
}
async function registered(values=new Map(),start=DAY1){const h=harness(values,start);await h.storage.init();await h.storage.authenticate('register',NAME,PIN);return h;}

test('기분을 고르기 전에는 moods 를 저장하지 않고, 고르면 날짜별로 기기 수첩에 남는다',async()=>{
  const h=await registered();
  assert.equal('moods' in h.disk().state,false,'옛 앱 탭이 읽을 수 있게 빈 기록은 쓰지 않음');
  assert.equal(h.storage.update({moods:{'2026-11-25':'joy'}}),true);
  assert.deepEqual(h.disk().state.moods,{'2026-11-25':'joy'});
  // 같은 날 다시 고르면 바뀐다.
  h.storage.update({moods:{'2026-11-25':'calm'}});
  assert.deepEqual(h.disk().state.moods,{'2026-11-25':'calm'});
});

test('다음 날 로그인해도 어제 스티커는 남고 오늘 것이 더해진다(새로 열기 뒤 유지)',async()=>{
  const first=await registered();
  first.storage.update({moods:{'2026-11-25':'sad'}});
  const next=harness(first.values,DAY2);await next.storage.init();await next.storage.authenticate('login',NAME,PIN);
  assert.deepEqual(plain(next.storage.state.moods),{'2026-11-25':'sad'});
  assert.deepEqual(plain(next.storage.state.stamps),['2026-11-25','2026-11-26']);
  next.storage.update({moods:{...next.storage.state.moods,'2026-11-26':'angry'}});
  assert.deepEqual(next.disk().state.moods,{'2026-11-25':'sad','2026-11-26':'angry'});
});

test('모르는 기분·미래 날짜·잘못된 날짜는 저장하지 않는다',async()=>{
  const h=await registered();
  const before=h.values.get(KEY);
  assert.throws(()=>h.storage.update({moods:{'2026-11-25':'happy'}}),/기분 스티커/);
  assert.throws(()=>h.storage.update({moods:{'2026-11-26':'joy'}}),/기분 스티커/,'한국시간 내일');
  assert.throws(()=>h.storage.update({moods:{'2026-02-30':'joy'}}),/기분 스티커/);
  assert.throws(()=>h.storage.update({moods:['joy']}),/기분 스티커/);
  assert.equal(h.values.get(KEY),before);
});

test('두 기록을 합치면 날짜별 합집합, 같은 날이 다르면 나중에 저장한 쪽을 쓴다',()=>{
  const {rules}=harness();
  const older={caught:[],stamps:[],settings:{},updatedAt:100,moods:{'2026-11-24':'joy','2026-11-25':'sad'}};
  const newer={caught:[],stamps:[],settings:{},updatedAt:200,moods:{'2026-11-25':'calm'}};
  assert.deepEqual(plain(rules.mergeState(older,newer).moods),{'2026-11-24':'joy','2026-11-25':'calm'});
  assert.deepEqual(plain(rules.mergeState(newer,older).moods),{'2026-11-24':'joy','2026-11-25':'calm'},'순서와 상관없이 나중 저장 우선');
  assert.equal('moods' in rules.mergeState({caught:[],stamps:[],settings:{}},{caught:[],stamps:[],settings:{}}),false);
});

test('다른 창에서 붙인 스티커를 이 창이 덮어쓰지 않는다',async()=>{
  const a=await registered();
  const b=harness(a.values);await b.storage.init();await b.storage.authenticate('login',NAME,PIN);
  a.setTime(DAY1+60000);b.setTime(DAY1+60000);
  a.storage.update({moods:{'2026-11-25':'joy'}});
  b.fire('storage',{key:KEY});
  assert.deepEqual(plain(b.storage.state.moods),{'2026-11-25':'joy'});
  b.setTime(DAY1+120000);b.storage.update({caught:[25]});
  assert.deepEqual(b.disk().state.moods,{'2026-11-25':'joy'});
});

test('백업에 기분 스티커가 들어가고, 기분 기록이 없는 옛 백업도 복원된다',async()=>{
  const h=await registered();
  h.storage.update({moods:{'2026-11-25':'angry'}});
  const backup=await h.storage.exportBackup();
  assert.deepEqual(JSON.parse(backup).state.moods,{'2026-11-25':'angry'});
  const old=JSON.parse(backup);delete old.state.moods;
  await h.storage.importBackup(JSON.stringify(old));
  assert.equal(h.storage.state.moods,undefined);
  await h.storage.importBackup(backup);
  assert.deepEqual(plain(h.storage.state.moods),{'2026-11-25':'angry'});
  const bad=JSON.parse(backup);bad.state.moods={'2026-11-25':'<img>'};
  await assert.rejects(h.storage.importBackup(JSON.stringify(bad)),/기분 스티커/);
});

test('처음부터 다시 하기는 기분 스티커도 지운다',async()=>{
  const h=await registered();
  h.storage.update({moods:{'2026-11-25':'joy'}});
  await h.storage.reset(PIN);
  assert.equal(h.storage.state.moods,undefined);
  assert.equal('moods' in h.disk().state,false);
});

test('처음 화면 출석 카드는 오늘 도장 배지에 고른 기분 스티커를 붙인다',()=>{
  const window={PokemonAssets:{image:id=>`https://example.test/${id}.png`}};
  vm.runInContext(posterSource,vm.createContext({window}));
  const html=window.TitlePoster.render({trainerName:'시험',caught:3,collected:2,per:5,mood:'calm',moodAt:1});
  assert.equal((html.match(/img\/art\/moods\/calm\.webp/g)||[]).length,1);
  assert.match(html,/오늘 기분 편안함/);
  const none=window.TitlePoster.render({collected:2,per:5,mood:'calm',moodAt:-1});
  assert.doesNotMatch(none,/img\/art\/moods/,'오늘 도장이 이번 판에 없으면 붙이지 않음');
  const hostile=window.TitlePoster.render({collected:2,per:5,mood:'"><script>',moodAt:1});
  assert.doesNotMatch(hostile,/<script>/);
});
