// build가 만든 화면 목록만 미리 받는다. 외부 자원은 본 것만, API/인증/기록은 캐시하지 않는다.
importScripts('/precache-manifest.js');
const SHELL='poke-adventure-shell-'+self.APP_REVISION;
const MEDIA='poke-adventure-media-v1';
const ALLOWED=/^https:\/\/(?:raw\.githubusercontent\.com\/(?:PokeAPI\/(?:sprites|cries)|PMDCollab\/SpriteCollab)\/|play\.pokemonshowdown\.com\/audio\/cries\/)/;
const denied=url=>url.pathname.startsWith('/api/')||url.pathname.includes('/.');
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL);await cache.addAll(self.APP_SHELL);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('poke-adventure-shell-')&&key!==SHELL)await caches.delete(key);await self.clients.claim();})()));
async function trim(cache,limit){const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-limit)))await cache.delete(key);}
async function cachedResource(req, own) {
 let cache;
 try {
  if(own){const shell=await caches.open(SHELL);const fixed=await shell.match(req,{ignoreSearch:true});if(fixed)return fixed;}
  cache=await caches.open(MEDIA);const hit=await cache.match(req);if(hit)return hit;
 } catch { /* 자원 캐시를 못 열어도 인터넷으로 계속 받는다. */ }
 const response=await fetch(req);
 if(cache&&response.ok&&response.type!=='opaque'&&!response.redirected){
  try {await cache.put(req,response.clone());await trim(cache,100);}catch{/* 저장 공간 부족은 받은 그림까지 실패시키지 않는다. */}
 }
 return response;
}
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||denied(url))return;
 if(url.origin===self.location.origin){
  if(req.mode==='navigate')event.respondWith(fetch(req).catch(async()=>{const cache=await caches.open(SHELL);return await cache.match('/index.html')||Response.error();}));
  else event.respondWith(cachedResource(req,true));
 }else if(ALLOWED.test(url.href))event.respondWith(cachedResource(req,false));
});
