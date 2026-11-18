import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function load(){const scope={window:{}};vm.createContext(scope);vm.runInContext(fs.readFileSync(new URL('../js/pokemon-assets.js',import.meta.url),'utf8'),scope);return scope.window.PokemonAssets;}
test('포켓몬 그림·앞뒤·울음은 배포물 대신 PokeAPI 원본 URL이다',()=>{
 const assets=load();
 assert.match(assets.image(25),/^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/.+\/25\.webp$/);
 assert.ok(assets.image(25,'back').includes('/back/25.webp'));
 assert.ok(assets.image(25,'artwork').endsWith('/official-artwork/25.png'));
 assert.match(assets.cry(25),/^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/cries\/.+\/25\.ogg$/);
 assert.equal(assets.image(0),null);assert.equal(assets.cry(494),null);assert.equal(assets.image('../25'),null);assert.equal(assets.image(25,'unknown'),null);
});

test('OGG를 못 읽는 Safari는 검증한 종 이름으로 외부 MP3를 고르고 실패하면 조용히 중단한다',async()=>{
 const scope={window:{fetch:async()=>({ok:true,json:async()=>({id:25,name:'pikachu'})})},AbortController,setTimeout,clearTimeout};vm.createContext(scope);vm.runInContext(fs.readFileSync(new URL('../js/pokemon-assets.js',import.meta.url),'utf8'),scope);
 assert.equal(await scope.window.PokemonAssets.playableCry(25,false),'https://play.pokemonshowdown.com/audio/cries/pikachu.mp3');
 assert.equal(await scope.window.PokemonAssets.playableCry(26,false),null,'다른 번호 응답을 재생하지 않음');
 assert.equal(await scope.window.PokemonAssets.playableCry(0,false),null);
});
test('픽셀 시트는 검증한 원본만 받으며 임의 사이트·data·로컬 경로를 받지 않는다',()=>{
 const assets=load(),source='https://raw.githubusercontent.com/PMDCollab/SpriteCollab/85d87bc6c4237c29dbe268c99ebb8cfaa1d54918/sprite/0025/Walk-Anim.png';
 assert.equal(assets.sprite({sourceUrl:source,src:'img/field/25/walk.png'}),source);
 for(const url of ['https://evil.example/a.png','data:image/png;base64,AAAA','img/field/25/walk.png',source+'?token=private',source.replace('https:','http:')])assert.equal(assets.sprite({sourceUrl:url}),null);
 assert.equal(assets.sprite({src:source}),null);
});

test('확장자를 믿지 않고 MP3와 실제 OGG 바이트에 맞는 재생 Blob을 만든다',async()=>{
 for (const [bytes,type] of [[new Uint8Array([255,251,148,196,0,0]),'audio/mpeg'],[new Uint8Array([79,103,103,83,0,0]),'audio/ogg']]) {
  const scope={window:{fetch:async()=>new Response(bytes)},AbortController,setTimeout,clearTimeout,Blob,URL,Uint8Array};
  vm.runInNewContext(fs.readFileSync(new URL('../js/pokemon-assets.js',import.meta.url),'utf8'),scope);
  const url=await scope.window.PokemonAssets.playableCry(25),response=await fetch(url);
  assert.equal(response.headers.get('content-type'),type);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[...bytes]);
  URL.revokeObjectURL(url);
 }
});
test('앞모습은 HOME 3D PNG, 뒷모습은 실제 존재하는 back GIF로 복구하고 무한 반복하지 않는다',()=>{
 const a=load();assert.ok(a.alternatives(a.image(25))[0].endsWith('/home/25.png'));
 assert.ok(a.alternatives(a.image(25,'back'))[0].endsWith('/showdown/back/25.gif'));
 assert.equal(a.alternatives(a.alternatives(a.image(25))[1]).length,0);
 assert.equal(a.alternatives('https://untrusted.example/25.webp').length,0);
});
