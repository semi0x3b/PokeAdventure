import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function harness(supported=true){
 let time=0,seq=0;const tasks=new Map(),spoken=[];
 const root={addEventListener(){},removeEventListener(){},setTimeout(fn,delay=0){const id=++seq;tasks.set(id,{fn,at:time+delay});return id;},clearTimeout(id){tasks.delete(id);}};
 if(supported){root.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};root.speechSynthesis={speaking:false,pending:false,getVoices:()=>[],addEventListener(){},cancel(){this.speaking=false;},speak(u){spoken.push(u);this.speaking=true;u.onstart?.();}};}
 vm.runInNewContext(fs.readFileSync('js/narration.js','utf8'),{window:root});
 const advance=async duration=>{const until=time+duration;for(;;){const next=[...tasks].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [id,t]=next;tasks.delete(id);time=t.at;t.fn();await Promise.resolve();}time=until;await Promise.resolve();};
 return {n:root.Narration,spoken,advance,end(){root.speechSynthesis.speaking=false;spoken.at(-1).onend?.();}};
}
test('대사가 길어져도 실제 읽기 종료 전에는 완료되지 않는다',async()=>{const h=harness();let done=false;const wait=h.n.readAndWait({id:'throw',prompt:'가랏! 몬스터볼!',options:[]},{enabled:true});wait.then(()=>{done=true;});await h.advance(5000);assert.equal(done,false);assert.equal(h.spoken.length,1);h.end();assert.equal(await wait,true);});
test('소리 끔·읽기 미지원은 기다리지 않고, 취소·고장난 음성도 영원히 기다리지 않는다',async()=>{
 for(const h of [harness(false),harness()])assert.equal(await h.n.readAndWait({prompt:'가랏!',options:[]},{enabled:false}),false);
 const h=harness();const interrupted=h.n.readAndWait({prompt:'마음이 활짝 열렸어!',options:[]});await h.advance(100);h.n.cancel();assert.equal(await interrupted,false);
 const timed=h.n.readAndWait({prompt:'가랏!',options:[]});await h.advance(13000);assert.equal(await timed,false);
});
test('발로 차는 화면 원문을 바꾸지 않고 구별하기 쉬운 동사형으로 읽는다',()=>{const h=harness();assert.equal(h.n.clean('발로 차'),'발로 찬다');assert.equal(h.n.clean('발로 차기'),'발로 차기');});
