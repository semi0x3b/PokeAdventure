import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function worker() {
 const handlers = new Map(), requests = [], stores = new Map();
 const caches = {async open(name) {if (!stores.has(name)) stores.set(name,new Map());const rows=stores.get(name);return {async match(req){return rows.get(typeof req==='string'?req:req.url);},async put(req,res){rows.set(typeof req==='string'?req:req.url,res);},async keys(){return [...rows.keys()];},async delete(key){rows.delete(key);}};}};
 const scope={URL,Request,Response,Headers,AbortController,setTimeout,clearTimeout,caches,importScripts(){},self:{APP_REVISION:'recovery',APP_SHELL:[],location:{origin:'https://game.example'},addEventListener(name,fn){handlers.set(name,fn);}},fetch:async req=>{requests.push(req.url||req);throw Error('primary unavailable');}};
 vm.runInNewContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),scope);
 const get=async (url,init)=>{let result;handlers.get('fetch')({request:new Request(url,init),respondWith(value){result=value;}});return await result;};
 return {scope,requests,get};
}
test('원본 GitHub 연결 실패 때 같은 공개 파일의 CDN 주소로 동행·3D 그림을 복구한다',async()=>{
 const w=worker();w.scope.fetch=async req=>{const url=req.url||req;w.requests.push(url);if(url.startsWith('https://cdn.jsdelivr.net/gh/'))return new Response('pixel',{headers:{'Content-Type':'image/png'}});throw Error('primary unavailable');};
 for (const path of ['PokeAPI/sprites/master/sprites/pokemon/other/home/25.png','PMDCollab/SpriteCollab/85d87bc6c4237c29dbe268c99ebb8cfaa1d54918/sprite/0025/Walk-Anim.png']) {
  assert.equal(await(await w.get('https://raw.githubusercontent.com/'+path)).text(),'pixel');
 }
 assert.ok(w.requests.includes('https://cdn.jsdelivr.net/gh/PMDCollab/SpriteCollab@85d87bc6c4237c29dbe268c99ebb8cfaa1d54918/sprite/0025/Walk-Anim.png'));
});
test('확장자는 ogg지만 실제 MP3인 울음의 MIME을 맞춰 브라우저에 반환한다',async()=>{
 const w=worker();w.scope.fetch=async()=>new Response(new Uint8Array([255,251,148,196,0,0]),{headers:{'Content-Type':'audio/ogg'}});
 const response=await w.get('https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/25.ogg');
 assert.equal(response.headers.get('Content-Type'),'audio/mpeg');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[255,251,148,196,0,0]);
});
test('CORS 헤더 없는 Showdown MP3는 오디오 태그의 원래 요청 모드를 유지한다',async()=>{
 const w=worker();let mode;
 w.scope.fetch=async req=>{mode=req.mode;return new Response('mp3');};
 await w.get('https://play.pokemonshowdown.com/audio/cries/pikachu.mp3');
 assert.equal(mode,'cors');
 // 실제 audio 태그 요청(no-cors)도 같은 Request 그대로 넘기는 것을 검증한다.
 const w2=worker();w2.scope.fetch=async req=>{assert.equal(req.mode,'no-cors');return new Response('mp3');};
 await w2.get('https://play.pokemonshowdown.com/audio/cries/pikachu.mp3',{mode:'no-cors'});
});
