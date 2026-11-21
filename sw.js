// build가 만든 화면 목록만 미리 받는다. 외부 자원은 본 것만, API/인증/기록은 캐시하지 않는다.
importScripts('/precache-manifest.js');
const SHELL='poke-adventure-shell-'+self.APP_REVISION;
const LOCAL='poke-adventure-assets-'+self.APP_REVISION;
// 기존에 받은 원격 자료를 유지한다. 로컬 그림은 별도 캐시에 보관한다.
const MEDIA='poke-adventure-media-v2';
const MEDIA_LIMIT=360;
const denied=url=>url.pathname==='/api'||url.pathname.startsWith('/api/')||url.pathname.includes('/.');
function remoteSource(url) {
 if(url.search||url.username||url.password)return null;
 let source=url.href;
 const cdn=source.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/(PokeAPI\/(?:sprites|cries)|PMDCollab\/SpriteCollab)@([^/]+)\/(.+)$/);
 if(cdn)source='https://raw.githubusercontent.com/'+cdn[1]+'/'+cdn[2]+'/'+cdn[3];
 const allowed=/^https:\/\/(?:raw\.githubusercontent\.com\/(?:PokeAPI\/sprites\/master\/sprites\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|gif|webp)|PokeAPI\/cries\/main\/cries\/pokemon\/latest\/\d+\.ogg|PMDCollab\/SpriteCollab\/[a-f0-9]{40}\/sprite\/(?:\d{4}\/){1,4}(?:Walk|Idle|WalkFast)-Anim\.png)|play\.pokemonshowdown\.com\/audio\/cries\/[a-z0-9]+\.mp3)$/;
 return allowed.test(source)?source:null;
}
const localAsset=url=>/^\/(?:img|sounds|js|css)\//.test(url.pathname)||url.pathname==='/manifest.webmanifest'||url.pathname==='/precache-manifest.js';
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(SHELL);
 await cache.addAll(self.APP_SHELL);
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys()){
  if(key.startsWith('poke-adventure-shell-')&&key!==SHELL||key.startsWith('poke-adventure-assets-')&&key!==LOCAL)await caches.delete(key);
 }
 try{
  const media=await caches.open(MEDIA);
  for(const request of await media.keys()){
   const url=new URL(typeof request==='string'?request:request.url,self.location.origin);
   if(url.origin===self.location.origin)await media.delete(request);
  }
  await trim(media,MEDIA_LIMIT);
 }catch{/* 이전 캐시를 정리하지 못해도 화면과 자료 로딩은 계속한다. */}
 await self.clients.claim();
})()));
async function trim(cache,limit){const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-limit)))await cache.delete(key);}
function mirror(url) {
 const match=url.match(/^https:\/\/raw\.githubusercontent\.com\/(PokeAPI\/(?:sprites|cries)|PMDCollab\/SpriteCollab)\/([^/]+)\/(.+)$/);
 return match ? 'https://cdn.jsdelivr.net/gh/'+match[1]+'@'+match[2]+'/'+match[3] : null;
}
async function externalResource(req) {
 const alternate=mirror(req.url);
 // Showdown과 직접 CDN 요청은 원래 Request의 모드를 유지한다.
 let response;
 if(!alternate)response=await fetch(req);
 else for(const url of [req.url,alternate]) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7000);
  try {
   response=await fetch(url,{mode:'cors',credentials:'omit',signal:controller.signal});
   if(response.ok)break;
  } catch(error) { if(url===alternate)throw error; }
  finally { clearTimeout(timer); }
 }
 // PokeAPI cries의 일부 .ogg 원본은 MP3 바이트다. nosniff 브라우저도 실제 형식으로 읽게 한다.
 if(response?.ok && /\/cries\/pokemon\/latest\/\d+\.ogg$/.test(req.url)) {
  const bytes=await response.arrayBuffer();
  const head=new Uint8Array(bytes,0,Math.min(4,bytes.byteLength));
  const mp3=head[0]===255&&(head[1]&224)===224 || head[0]===73&&head[1]===68&&head[2]===51;
  if(mp3){const headers=new Headers(response.headers);headers.set('Content-Type','audio/mpeg');headers.delete('Content-Length');headers.delete('Content-Encoding');return new Response(bytes,{status:200,headers});}
  return new Response(bytes,{status:response.status,headers:response.headers});
 }
 return response;
}
async function cachedResource(req, own, source) {
 let cache;
 const key=own?req:source;
 try {
  if(own){const shell=await caches.open(SHELL);const fixed=await shell.match(req,{ignoreSearch:true});if(fixed)return fixed;}
  cache=await caches.open(own?LOCAL:MEDIA);
  const hit=await cache.match(key);
  if(hit)return hit;
 } catch { /* 자원 캐시를 못 열어도 인터넷으로 계속 받는다. */ }
 const response=own?await fetch(req):await externalResource(req);
 if(cache&&response.ok&&response.type!=='opaque'&&!response.redirected){
  try {await cache.put(key,response.clone());await trim(cache,own?100:MEDIA_LIMIT);}catch{/* 저장 공간 부족은 받은 그림까지 실패시키지 않는다. */}
 }
 return response;
}
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||denied(url))return;
 if(url.origin===self.location.origin){
  if(req.mode==='navigate')event.respondWith(fetch(req).catch(async()=>{const cache=await caches.open(SHELL);return await cache.match('/index.html')||Response.error();}));
  else if(localAsset(url))event.respondWith(cachedResource(req,true));
 }else{
  const source=remoteSource(url);
  if(source)event.respondWith(cachedResource(req,false,source));
 }
});
