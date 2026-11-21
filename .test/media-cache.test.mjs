import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const origin = 'https://game.example';
const picture = id => 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/' + id + '.png';
const cry = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/25.ogg';
function worker() {
 const handlers = new Map(), stores = new Map(), requests = [];
 const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
 const caches = {
  async open(name) {
   if (!stores.has(name)) stores.set(name, new Map());
   const rows = stores.get(name);
   return {
    async match(request) { return rows.get(key(request))?.clone(); },
    async put(request, response) { rows.set(key(request), response.clone()); },
    async keys() { return [...rows.keys()].map(url => new Request(url)); },
    async delete(request) { return rows.delete(key(request)); },
    async addAll(paths) { for (const path of paths) rows.set(key(path), new Response('shell')); }
   };
  },
  async keys() { return [...stores.keys()]; },
  async delete(name) { return stores.delete(name); }
 };
 const self = {APP_REVISION:'cache-test', APP_SHELL:['/index.html','/js/storage.js'], location:{origin},
  addEventListener(name, fn) { handlers.set(name, fn); }, async skipWaiting() {}, clients:{async claim() {}}};
 const scope = {self, URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout, caches,
  importScripts() {}, async fetch(request) { requests.push(key(request)); return new Response('downloaded'); }};
 vm.runInNewContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), scope);
 async function get(url, init) {
  let response;
  handlers.get('fetch')({request:new Request(url, init), respondWith(value) { response = value; }});
  return response;
 }
 async function lifecycle(name) { let pending; handlers.get(name)({waitUntil(value) { pending = value; }}); await pending; }
 return {get, lifecycle, scope, stores, caches, requests};
}

test('본 포켓몬 이미지와 울음소리는 두 번째 요청과 오프라인에서 네트워크 없이 재사용한다', async () => {
 const w = worker();
 for (const url of [picture(25), cry]) assert.equal(await (await w.get(url)).text(), 'downloaded');
 assert.equal(w.requests.length, 2);
 w.scope.fetch = async () => { throw Error('offline'); };
 for (const url of [picture(25), cry]) assert.equal(await (await w.get(url)).text(), 'downloaded');
});

test('로컬 그림이 많아도 이전에 본 원격 이미지·울음과 앱 잠금 스크립트를 밀어내지 않는다', async () => {
 const w = worker();
 await w.lifecycle('install');
 await w.get(cry);
 for (let id = 1; id <= 180; id++) await w.get(picture(id));
 for (let id = 1; id <= 160; id++) await w.get(origin + '/img/yard/' + id + '.png');
 w.scope.fetch = async () => { throw Error('offline'); };
 for (const url of [picture(1), picture(180), cry]) assert.equal(await (await w.get(url)).text(), 'downloaded');
 assert.equal(await (await w.get(origin + '/js/storage.js')).text(), 'shell');
});

test('기존 v2 원격 캐시를 업데이트 뒤 유지하고 로컬 자료는 새 버전에서 다시 받는다', async () => {
 const w = worker(), legacy = await w.caches.open('poke-adventure-media-v2');
 await legacy.put(picture(25), new Response('previous-media'));
 await legacy.put(origin + '/js/game.js', new Response('previous-code'));
 await w.caches.open('poke-adventure-assets-old');
 await w.lifecycle('activate');
 assert.equal(await (await w.get(picture(25))).text(), 'previous-media');
 assert.equal(w.requests.length, 0);
 assert.equal(await (await w.get(origin + '/js/game.js')).text(), 'downloaded');
 assert.equal(await legacy.match(origin + '/js/game.js'), undefined);
 assert.equal(w.stores.has('poke-adventure-assets-old'), false);
});

test('허용된 같은 공개 파일의 CDN 주소는 원본과 캐시를 공유한다', async () => {
 const pairs = [
  [picture(25), 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/home/25.png'],
  [cry, 'https://cdn.jsdelivr.net/gh/PokeAPI/cries@main/cries/pokemon/latest/25.ogg'],
  ['https://raw.githubusercontent.com/PMDCollab/SpriteCollab/85d87bc6c4237c29dbe268c99ebb8cfaa1d54918/sprite/0025/Walk-Anim.png',
   'https://cdn.jsdelivr.net/gh/PMDCollab/SpriteCollab@85d87bc6c4237c29dbe268c99ebb8cfaa1d54918/sprite/0025/Walk-Anim.png']
 ];
 for (const [raw, cdn] of pairs) {
  const w = worker();
  assert.equal(await (await w.get(cdn)).text(), 'downloaded');
  assert.equal(w.requests.length, 1);
  w.scope.fetch = async () => { throw Error('offline'); };
  assert.equal(await (await w.get(cdn)).text(), 'downloaded');
  assert.equal(await (await w.get(raw)).text(), 'downloaded');
 }
});

test('다른 CDN 저장소·경로·API·사용자 페이지·POST는 가로채거나 캐시하지 않는다', async () => {
 const w = worker();
 for (const url of [
  'https://cdn.jsdelivr.net/npm/example/index.js',
  'https://cdn.jsdelivr.net/gh/Other/sprites@master/sprites/pokemon/25.png',
  'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/package.json',
  'https://cdn.jsdelivr.net/gh/PokeAPI/cries@main/api/game',
  'https://cdn.jsdelivr.net/gh/PMDCollab/SpriteCollab@master/README.md',
  origin + '/api/game', origin + '/api', origin + '/login', origin + '/account.json'
 ]) assert.equal(await w.get(url), undefined, url);
 assert.equal(await w.get(picture(25), {method:'POST'}), undefined);
 assert.equal(w.requests.length, 0);
});

test('원격 캐시는 방문한 자료만 제한된 개수로 보관한다', async () => {
 const w = worker();
 for (let id = 1; id <= 420; id++) await w.get(picture(id));
 const stored = await (await w.caches.open('poke-adventure-media-v2')).keys();
 assert.ok(stored.length >= 300 && stored.length <= 400);
 w.scope.fetch = async () => { throw Error('offline'); };
 assert.equal(await (await w.get(picture(420))).text(), 'downloaded');
 assert.ok(w.requests.length >= 420 && w.requests.length <= 421, '별도 선다운로드 없음');
});

test('오류 응답·opaque 응답은 보관하지 않고 캐시 저장 실패도 받은 응답을 막지 않는다', async () => {
 for (const response of [new Response('missing', {status:404}), {ok:false, type:'opaque'}]) {
  const w = worker(); let count = 0;
  w.scope.fetch = async () => { count++; return response; };
  await w.get(picture(25)); const first = count;
  await w.get(picture(25)); assert.equal(count, first * 2);
 }
 const w = worker(), open = w.caches.open;
 w.caches.open = async name => ({...await open(name), async put() { throw Error('QuotaExceededError'); }});
 assert.equal(await (await w.get(picture(25))).text(), 'downloaded');
});

test('CDN에서 먼저 받은 MP3 바이트도 올바른 MIME으로 원본 주소와 재사용한다', async () => {
 const w = worker();
 const cdn = 'https://cdn.jsdelivr.net/gh/PokeAPI/cries@main/cries/pokemon/latest/25.ogg';
 w.scope.fetch = async () => new Response(new Uint8Array([255,251,148,196]), {headers:{'Content-Type':'audio/ogg'}});
 assert.equal((await w.get(cdn)).headers.get('Content-Type'), 'audio/mpeg');
 w.scope.fetch = async () => { throw Error('offline'); };
 assert.equal((await w.get(cry)).headers.get('Content-Type'), 'audio/mpeg');
});
