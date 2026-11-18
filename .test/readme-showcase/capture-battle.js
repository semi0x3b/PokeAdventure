const p=await openTab('http://127.0.0.1:4416/');
await p.bringToFront();await p.setViewportSize({width:1024,height:640});
console.log((await snapshot(p,{interactive:true})).tree);
await p.locator('.parent-lock [data-action=account]').waitFor({state:'visible'});
await p.locator('[data-action=account]').click();
await p.locator('#auth-form [name=name]').fill('꼬마탐험가');
for(const d of ['2','4','6','8'])await p.locator('[data-pin-key="'+d+'"]').click();
await p.locator('#auth-form [type=submit]').click();
await p.locator('.title-menu').waitFor({state:'visible',timeout:15000});
await p.waitForFunction(()=>!window.SceneFX?.active&&getComputedStyle(document.querySelector('.title-menu')).opacity>.95);
for(let n=0;n<2;n++)if(await p.locator('#modal-root [data-action=close-modal]').count())await p.locator('#modal-root [data-action=close-modal]').click();
await p.locator('.title-menu [data-action=start]').click();
await p.locator('.region-card[data-region=forest]').waitFor({state:'visible'});
await p.locator('.region-card[data-region=forest]').click();
await p.waitForFunction(()=>GameField.snapshot()?.ready);
await p.evaluate(()=>GameField.setGrassEncounters(false));
const ball=await p.evaluate(()=>GameField.snapshot().balls.findIndex(b=>!b.gold&&b.x>30&&b.y>90&&b.x<innerWidth-30&&b.y<innerHeight-30));
if(ball<0)throw Error('소개용 빨간 볼이 화면 밖에 있음');
await p.locator('[data-field-ball="'+ball+'"]').click({force:true});
await p.locator('.gb-answer').first().waitFor({state:'visible',timeout:30000});
await p.locator('.encounter-intro').waitFor({state:'detached',timeout:20000});
console.log((await snapshot(p,{interactive:true})).diff);
async function closeBrowserNotice() {
  const snap=await snapshot(p,{interactive:true});
  const found=snap.tree.match(/button "Close Aside notification" \[ref=([^\]]+)\]/);
  if(found){await p.locator(found[1]).click();console.log((await snapshot(p,{interactive:true})).diff);}
}
async function save(name){if(!name.startsWith('catch-'))await closeBrowserNotice();console.log('QA_IMAGE '+name+' '+Buffer.from(await p.screenshot({type:'jpeg',quality:80})).toString('base64'));}
await save('silhouette');
const wild=await p.evaluate(()=>{const img=document.querySelector('.gb-pokemon');const id=Number((img.dataset.assetSource||img.src).match(/\/(\d+)\.webp$/)?.[1]);return POKEMON.find(v=>v.id===id);});
if(!wild)throw Error('만난 포켓몬 확인 실패');
await p.locator('.gb-answer').filter({hasText:wild.name}).click();
let previous='';
for(let n=0;n<2;n++){
  if(previous)await p.waitForFunction(id=>{const q=document.querySelector('#gb-question');return q?.dataset.questionId&&q.dataset.questionId!==id&&document.querySelector('.gb-answer:not(:disabled)');},previous,{timeout:25000});
  await p.locator('[data-method=attack],#gb-question[data-question-id]').first().waitFor({state:'visible',timeout:25000});
  if(await p.locator('[data-method=attack]').isVisible())await p.locator('[data-method=attack]').click();
  await p.locator('#gb-question[data-question-id]').waitFor({state:'visible',timeout:20000});
  console.log((await snapshot(p,{interactive:true})).diff);
  await p.locator('#gb-question').evaluate(q=>Promise.all(q.closest('.gb-popup').getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect.getComputedTiming().iterations)).map(a=>a.finished.catch(()=>{}))));
  await p.waitForFunction(()=>{const popup=document.querySelector('.gb-popup');return popup&&Number(getComputedStyle(popup).opacity)>.99&&popup.getAnimations({subtree:true}).every(a=>a.playState==='finished'||!Number.isFinite(a.effect.getComputedTiming().iterations));});
  if(n===0)await save('battle');
  previous=await p.locator('#gb-question').getAttribute('data-question-id');
  const answer=await p.evaluate(id=>QUESTIONS.find(q=>q.id===id)?.answer,previous);
  if(answer===undefined)throw Error('출제 문제 확인 실패');
  await p.locator('.gb-answer:not(:disabled) .gb-answer-label').filter({hasText:new RegExp('^'+answer+'$')}).click();
}
await p.locator('.go-battle[data-phase=throwing]').waitFor({state:'visible',timeout:20000});
for(let i=0;i<24;i++){await save('catch-'+String(i).padStart(2,'0'));await sleep(150);}
await p.locator('.go-battle[data-phase=caught]').waitFor({state:'visible',timeout:20000});
await p.locator('.gb-result-actions [data-action]').first().waitFor({state:'visible',timeout:25000});
await save('caught');
console.log('QA_RESULT '+JSON.stringify({pass:true,fixture:true,walkedToBall:true,questions:2,captureFrames:24,caught:await p.evaluate(id=>GameStorage.state.caught.includes(id),wild.id)}));
