import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function load(){
 const players=[],calls=[],handlers=new Map();
 class Audio {constructor(){this.paused=true;this.currentTime=0;players.push(this);}setAttribute(){}pause(){this.paused=true;}play(){this.paused=false;calls.push(this.src);return this.src==='blob:broken'?Promise.reject(Error('decode')):Promise.resolve();}}
 let resolve;
 const assets={playableCry(id,primary=true){return primary?new Promise(done=>{resolve=done;}):Promise.resolve('https://play.pokemonshowdown.com/audio/cries/pikachu.mp3');}};
 const window={PokemonAssets:assets,addEventListener(name,fn){handlers.set(name,fn);}};
 vm.runInNewContext(fs.readFileSync(new URL('../js/audio.js',import.meta.url),'utf8'),{window,Audio,document:{hidden:false,addEventListener(){}},navigator:{},setTimeout,clearTimeout,fetch:async()=>{throw Error('not used');}});
 return {sfx:window.Sfx,players,calls,finish:source=>resolve(source)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('울음 디코딩 실패는 MP3로 한 번 복구한다',async()=>{const a=load();a.sfx.setOn(true);a.sfx.cry(25);a.finish('blob:broken');await tick();await tick();assert.deepEqual(a.calls,['blob:broken','https://play.pokemonshowdown.com/audio/cries/pikachu.mp3']);});
test('늦게 받은 울음은 소리를 끈 뒤 되살아나지 않는다',async()=>{const a=load();a.sfx.setOn(true);a.sfx.cry(25);a.sfx.setOn(false);a.finish('blob:ready');await tick();assert.equal(a.calls.length,0);});
