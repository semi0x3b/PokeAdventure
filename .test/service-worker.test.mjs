import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
function worker(){
 const handlers=new Map(),stores=new Map();
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const rows=stores.get(name);return{async match(request){return rows.get(typeof request==='string'?request:request.url);},async put(request,response){rows.set(typeof request==='string'?request:request.url,response);},async keys(){return[...rows.keys()];},async delete(key){return rows.delete(key);},async addAll(paths){for(const path of paths)rows.set(path,new Response('locked-shell'));}};},async keys(){return[...stores.keys()];},async delete(name){return stores.delete(name);}};
 const self={APP_REVISION:'test',APP_SHELL:['/index.html','/js/storage.js'],location:{origin:'https://game.example'},addEventListener(name,fn){handlers.set(name,fn);},skipWaiting:async()=>{},clients:{claim:async()=>{}}};
 const scope={self,URL,Response,Headers,AbortController,setTimeout,clearTimeout,caches,importScripts(){},fetch:async()=>{throw Error('offline');}};
 vm.runInNewContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),scope);
 return{handlers,caches,scope};
}
test('연결이 끊겨도 준비된 앱 화면을 열고 부모 인증은 매번 클라이언트에서 다시 한다',async()=>{
 const w=worker();let installed;w.handlers.get('install')({waitUntil(p){installed=p;}});await installed;
 let response;w.handlers.get('fetch')({request:{url:'https://game.example/',method:'GET',mode:'navigate'},respondWith(p){response=p;}});
 assert.equal(await(await response).text(),'locked-shell');
});
test('서비스워커는 기록 API·POST·알 수 없는 외부 서버를 가로채거나 보관하지 않는다',()=>{
 const w=worker();for(const request of [{url:'https://game.example/api/game',method:'GET'},{url:'https://game.example/login',method:'POST'},{url:'https://unknown.example/pokemon.png',method:'GET'}]){
  let intercepted=false;w.handlers.get('fetch')({request,respondWith(){intercepted=true;}});assert.equal(intercepted,false);
 }
});
test('받은 그림이 많아도 별도 미디어 캐시가 화면·잠금 코드의 캐시를 밀어내지 않는다',async()=>{
 const w=worker();let installed;w.handlers.get('install')({waitUntil(p){installed=p;}});await installed;
 w.scope.fetch=async()=>new Response('image');
 for(let n=0;n<105;n++){let response;w.handlers.get('fetch')({request:{url:'https://game.example/img/'+n+'.png',method:'GET',mode:'cors'},respondWith(p){response=p;}});await response;}
 assert.ok(await(await w.caches.open('poke-adventure-shell-test')).match('/index.html'));
 assert.equal((await(await w.caches.open('poke-adventure-assets-test')).keys()).length,100);
});

test('캐시 저장 공간이 부족해도 정상으로 받은 외부 그림 응답을 반환한다',async()=>{
 const w=worker(),open=w.caches.open;
 w.caches.open=async name=>{const cache=await open(name);return{...cache,async put(){throw Error('QuotaExceededError');}};};
 w.scope.fetch=async()=>new Response('downloaded');
 let response;w.handlers.get('fetch')({request:{url:'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',method:'GET',mode:'cors'},respondWith(p){response=p;}});
 assert.equal(await(await response).text(),'downloaded');
});
