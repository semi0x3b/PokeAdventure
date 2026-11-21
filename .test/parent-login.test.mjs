import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const DEVICE_KEY='poke-adventure:device-save:v1';
const REMEMBER_KEY='poke-adventure:remember-parent-name:v1';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const MINUTE=60*1000;
async function realStorage(values=new Map()) {
 const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 const window={crypto:webcrypto,addEventListener(){},dispatchEvent(){}};
 const context=vm.createContext({window,localStorage,TextEncoder,Uint8Array,Date,Intl,CustomEvent:class{},setTimeout,clearTimeout});
 vm.runInContext(read('js/core.js'),context);context.GameRules=window.GameRules;
 vm.runInContext(read('js/storage.js'),context);await window.GameStorage.init();
 return {storage:window.GameStorage,values};
}
function gameHarness(storage,values=new Map()) {
 let now=0, document;
 const listeners=new Map(),documentListeners=new Map(),nodes=new Map(),intervals=[];
 function listen(map,type,callback){if(!map.has(type))map.set(type,[]);map.get(type).push(callback);}
 function element(html='') {
  const handlers=new Map(),children=new Map(),classes=new Set();
  const node={value:'',checked:false,isConnected:true,tagName:'DIV',dataset:{},style:{setProperty(){},removeProperty(){}},disabled:false,textContent:'',
   classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(){}},
   setAttribute(){},removeAttribute(){},getAttribute(){return null;},remove(){this.isConnected=false;},append(){},
   querySelector(selector){
    if(!children.has(selector)) {
     const child=element();
     if(selector==='#auth-form') {
      child.elements={};
      for(const match of html.matchAll(/<input\b([^>]*)>/g)) {
       const name=match[1].match(/\bname="([^"]+)"/)?.[1];if(!name)continue;
       const input=element();input.tagName='INPUT';input.checked=/\bchecked\b/.test(match[1]);input.value=match[1].match(/\bvalue="([^"]*)"/)?.[1]||'';child.elements[name]=input;
      }
     }
     children.set(selector,child);
    }
    return children.get(selector);
   },
   querySelectorAll(selector){return selector==='.pin-dots i'?[element(),element(),element(),element()]:[];},
   addEventListener(type,callback){listen(handlers,type,callback);},removeEventListener(){},
   focus(){document.activeElement=this;},getBoundingClientRect(){return {width:390,height:844};},
   fire(type,event={}){return Promise.all((handlers.get(type)||[]).map(callback=>callback(event)));}
  };
  Object.defineProperty(node,'innerHTML',{get:()=>html,set:value=>{html=String(value);for(const child of children.values())child.isConnected=false;children.clear();}});
  return node;
 }
 const body=element();
 document={body,documentElement:body,hidden:false,activeElement:element(),createElement:element,querySelector(selector){if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);},querySelectorAll(){return[];},addEventListener(type,callback){listen(documentListeners,type,callback);}};
 const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 const window={document,localStorage,innerWidth:390,innerHeight:844,matchMedia:()=>({matches:false,addEventListener(){}}),scrollTo(){},addEventListener(type,callback){listen(listeners,type,callback);},setInterval(callback){intervals.push(callback);},dispatchEvent(){}};
 class Clock extends Date{static now(){return now;}}
 const context=vm.createContext({window,document,GameStorage:storage,Date:Clock,navigator:{},Image:class{},performance:{now:()=>now},requestAnimationFrame(){},cancelAnimationFrame(){},setTimeout(){return 1;},clearTimeout(){},AbortController,getComputedStyle:()=>({}),TitlePoster:{render:()=>''},DexHint:{say:()=>''},QuestionBank:{levels:{math:[10],korean:['자음'],english:['알파벳']}}});
 for(const file of ['js/core.js','js/data/pokemon.js','js/pokemon-assets.js','js/pokemon-text.js','js/battle-view.js','js/adventure-motion.js','js/tutorial.js']){
  vm.runInContext(read(file),context);for(const[name,value]of Object.entries(window))if(name!=='document')context[name]=value;
 }
 const source=read('js/game.js'),startup=source.lastIndexOf('  title();\n');
 assert.ok(startup>=0);
 vm.runInContext(source.slice(0,startup)+'window.__login={authModal,get locked(){return sessionLocked;}};})();',context);
 async function fire(map,type,event={}){for(const callback of map.get(type)||[])await callback(event);}
 return {storage,values,document,window,game:window.__login,
  form:()=>document.querySelector('#modal-root').querySelector('#auth-form'),
  open:()=>window.__login.authModal(false,()=>{}),
  setTime:value=>{now=value;},tick:async()=>{for(const callback of intervals)await callback();await Promise.resolve();},
  documentEvent:(type,event)=>fire(documentListeners,type,event),windowEvent:(type,event)=>fire(listeners,type,event)};
}
function unlockedStorage(){return {user:{name:'별수첩'},hasAccount:true,state:{caught:[25],stamps:[],companions:[25],companion:25,settings:{sound:false}},async logout(){this.user=null;}};}
const submit=async form=>form.fire('submit',{preventDefault(){}});

test('로그인 이름은 기본 체크로 미리 채우고 Enter는 제출 대신 PIN으로 초점을 옮긴다',async()=>{
 const data=await realStorage();await data.storage.authenticate('register','별수첩','2468');await data.storage.logout();
 const h=gameHarness(data.storage,data.values);h.open();const form=h.form();
 assert.equal(form.elements.name.value,'별수첩');assert.equal(form.elements.rememberName.checked,true);
 let prevented=false;
 await form.elements.name.fire('keydown',{key:'Enter',isComposing:false,preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(h.document.activeElement,form.elements.pin);assert.equal(data.storage.user,null);
});

test('체크 해제는 성공한 로그인 뒤에만 반영하고 다음 폼의 이름·선택을 비운다',async()=>{
 const data=await realStorage();await data.storage.authenticate('register','별수첩','2468');await data.storage.logout();
 const h=gameHarness(data.storage,data.values);h.open();let form=h.form();
 form.elements.rememberName.checked=false;form.elements.name.value='다른수첩';form.elements.pin.value='2468';await form.fire('input');await submit(form);
 assert.equal(data.values.has(REMEMBER_KEY),false,'실패 로그인에서는 기억 설정을 바꾸지 않음');
 assert.equal(data.storage.loginName,'별수첩','실패한 이름이 기존 계정 별명을 덮어쓰지 않음');
 form.elements.name.value='별수첩';form.elements.pin.value='2468';await form.fire('input');await submit(form);
 assert.equal(data.values.get(REMEMBER_KEY),'false');
 await data.storage.logout();h.open();form=h.form();
 assert.equal(form.elements.name.value,'');assert.equal(form.elements.rememberName.checked,false);
 form.elements.name.value='별수첩';form.elements.pin.value='2468';form.elements.rememberName.checked=true;await form.fire('input');await submit(form);
 await data.storage.logout();h.open();assert.equal(h.form().elements.name.value,'별수첩');assert.equal(h.form().elements.rememberName.checked,true);
});

test('숫자판 입력·폼 제출을 유지하고 PIN·해제 세션은 추가 저장하지 않는다',async()=>{
 const data=await realStorage();await data.storage.authenticate('register','별수첩','2468');await data.storage.logout();
 const h=gameHarness(data.storage,data.values);h.open();const form=h.form(),pad=form.querySelector('.pin-pad');
 for(const digit of ['2','4','6','8'])await pad.fire('click',{target:{closest:()=>({dataset:{pinKey:digit}})}});
 assert.equal(form.elements.pin.value,'2468');assert.equal(form.querySelector('[type=submit]').disabled,false);
 await submit(form);assert.equal(data.storage.user.name,'별수첩');assert.equal(form.elements.pin.value,'');
 assert.deepEqual([...data.values.keys()].filter(key=>key!==DEVICE_KEY),[],'기본 체크는 별도 이름·PIN·세션 값을 저장하지 않음');
 const fresh=await realStorage(data.values);assert.equal(fresh.storage.user,null);assert.equal(fresh.storage.loginName,'별수첩');
 assert.equal(JSON.parse(data.values.get(DEVICE_KEY)).credential.pin,undefined);
});

test('30분 미만 무입력은 유지하고 30분부터 부모 잠금을 건다',async()=>{
 const h=gameHarness(unlockedStorage());h.setTime(30*MINUTE-1);await h.tick();assert.equal(h.game.locked,false);
 h.setTime(30*MINUTE);await h.tick();assert.equal(h.game.locked,true);assert.equal(h.storage.user,null);
});

test('포인터·터치·휠·키보드 입력은 무입력 기준을 갱신한다',async()=>{
 for(const type of ['pointerdown','pointermove','touchstart','wheel','keydown']){
  const h=gameHarness(unlockedStorage());h.setTime(25*MINUTE);
  if(type==='keydown')await h.windowEvent(type,{key:'x',target:{tagName:'INPUT'}});else await h.documentEvent(type,{});
  h.setTime(45*MINUTE);await h.tick();assert.equal(h.game.locked,false,type);
  h.setTime(55*MINUTE);await h.tick();assert.equal(h.game.locked,true,type);
 }
});

test('짧은 배경 전환은 유지하고 배경에서 30분 지난 뒤 복귀하면 잠근다',async()=>{
 const h=gameHarness(unlockedStorage());h.setTime(MINUTE);h.document.hidden=true;await h.documentEvent('visibilitychange');assert.equal(h.game.locked,false);
 h.setTime(2*MINUTE);h.document.hidden=false;await h.documentEvent('visibilitychange');assert.equal(h.game.locked,false);
 h.document.hidden=true;h.setTime(31*MINUTE);h.document.hidden=false;await h.documentEvent('visibilitychange');assert.equal(h.game.locked,true);
});

test('배경 복귀 직후 입력이 와도 이미 지난 30분 잠금을 건너뛰지 않는다',async()=>{
 for(const type of ['pointerdown','keydown']){
  const h=gameHarness(unlockedStorage());h.setTime(31*MINUTE);
  if(type==='keydown')await h.windowEvent(type,{key:'x',target:{tagName:'INPUT'}});else await h.documentEvent(type,{});
  await h.tick();assert.equal(h.game.locked,true,type);
 }
});

test('뒤로 가기로 복원된 페이지는 PIN을 다시 받고 새 페이지도 잠금 해제를 복원하지 않는다',async()=>{
 const h=gameHarness(unlockedStorage());await h.windowEvent('pageshow',{persisted:false});assert.equal(h.game.locked,false);
 await h.windowEvent('pageshow',{persisted:true});assert.equal(h.game.locked,true);
});
