const url = 'http://127.0.0.1:4416/';
const p = await openTab(url);
await p.bringToFront();
await p.setViewportSize({width:1024,height:640});
console.log((await snapshot(p,{interactive:true})).tree);
async function login() {
  await p.locator('.parent-lock [data-action=account]').waitFor({state:'visible'});
  await p.locator('[data-action=account]').click();
  await p.locator('#auth-form [name=name]').fill('꼬마탐험가');
  for (const digit of ['2','4','6','8']) await p.locator('[data-pin-key="'+digit+'"]').click();
  await p.locator('#auth-form [type=submit]').click();
  await p.waitForFunction(()=>GameStorage.user!==null);
}
async function closeBrowserNotice() {
  const snap=await snapshot(p,{interactive:true});
  const found=snap.tree.match(/button "Close Aside notification" \[ref=([^\]]+)\]/);
  if(found){await p.locator(found[1]).click();console.log((await snapshot(p,{interactive:true})).diff);}
}
async function save(name) {
  if(!name.startsWith('walk-'))await closeBrowserNotice();
  if(name==='title')await p.locator('#toast.visible').waitFor({state:'hidden',timeout:7000});
  console.log('QA_IMAGE '+name+' '+Buffer.from(await p.screenshot({type:'jpeg',quality:85})).toString('base64'));
}
async function home() {
  for(let n=0;n<2;n++)if(await p.locator('#modal-root [data-action=close-modal]').count())await p.locator('#modal-root [data-action=close-modal]').click();
  for(let n=0;n<4&&!await p.locator('.title-menu').count();n++) {
    await p.locator('#home-button').click();
    await p.waitForFunction(()=>!window.SceneFX?.active);
  }
  await p.locator('.title-menu').waitFor({state:'visible'});
  await p.waitForFunction(()=>!window.SceneFX?.active&&getComputedStyle(document.querySelector('.title-menu')).opacity>.95);
  console.log((await snapshot(p,{interactive:true})).diff);
}
await login();
// 소개 사진 전용 시험 수첩. 실제 사용자나 서버에는 접근하지 않는다.
await p.evaluate(()=>GameStorage.update({caught:[1,4,7,25,39,52,54,133,143],companions:[25,1],companion:25,yard:[1,4,7,25,133],seen:['toured','stamps','wordbook','yard','settings'],settings:{sound:false,area:'math',difficulty:1,mathMax:10,trainerLook:'boy'}},true));
await p.goto(url);
await login();
await home();
await p.waitForFunction(()=>[...document.querySelectorAll('.title-pokemon img')].length===4&&[...document.querySelectorAll('.title-pokemon img')].every(i=>i.complete&&i.naturalWidth>0));
await save('title');
await p.locator('.title-menu [data-action=dex]').click();
await p.locator('[data-filter=caught]').click();
await p.waitForFunction(()=>!window.SceneFX?.active&&[...document.querySelectorAll('.dex-grid img')].every(i=>i.complete&&i.naturalWidth>0));
console.log((await snapshot(p,{interactive:true})).diff);
await save('dex');
await home();
await p.locator('.title-menu [data-action=wordbook]').click();
await p.locator('.wordbook-canvas').waitFor({state:'visible',timeout:15000});
await p.waitForFunction(()=>!window.SceneFX?.active);
await p.locator('.wordbook-list-button').click();
await p.locator('[data-wordbook-card="ko-apple"]').waitFor({state:'visible',timeout:15000});
await p.locator('[data-wordbook-card="ko-apple"]').click();
await p.locator('.wordbook-canvas').waitFor({state:'visible'});
await p.waitForFunction(()=>!window.SceneFX?.active&&document.fonts.status==='loaded');
console.log((await snapshot(p,{interactive:true})).diff);
await save('writing');
await home();
await p.locator('.title-menu [data-action=yard]').click();
await p.waitForFunction(()=>!window.SceneFX?.active&&document.querySelectorAll('.yard-sprite').length===5&&[...document.querySelectorAll('.yard-sprite')].every(n=>n.style.backgroundImage),null,{timeout:20000});
console.log((await snapshot(p,{interactive:true})).diff);
await save('yard');
await home();
await p.locator('.title-menu [data-action=start]').click();
await p.locator('.region-card').first().waitFor({state:'visible'});
await p.waitForFunction(()=>!window.SceneFX?.active);
await save('regions');
await p.locator('.region-card[data-region=forest]').click();
await p.locator('#field-canvas').waitFor({state:'visible'});
await p.waitForFunction(()=>GameField.snapshot()?.ready);
await p.evaluate(()=>GameField.setGrassEncounters(false));
console.log((await snapshot(p,{interactive:true})).diff);
await save('field');
await p.keyboard.down('d');
for(let i=0;i<16;i++) {
  await save('walk-'+String(i).padStart(2,'0'));
  await sleep(100);
}
await p.keyboard.up('d');
console.log('QA_RESULT '+JSON.stringify({pass:true,fixture:true,shots:['title','dex','writing','yard','regions','field'],walkingFrames:16,apiRequests:await p.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/api/game')).length)}));
