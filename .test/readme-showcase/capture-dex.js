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
await p.locator('.title-menu [data-action=dex]').click();
await p.locator('[data-filter=caught]').click();
await p.waitForFunction(()=>!window.SceneFX?.active&&[...document.querySelectorAll('.dex-grid img')].every(i=>i.complete&&i.naturalWidth>0));
await p.locator('.dex-grid').evaluate(grid=>Promise.all(grid.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect.getComputedTiming().iterations)).map(a=>a.finished.catch(()=>{}))));
const snap=await snapshot(p,{interactive:true});console.log(snap.tree);const notice=snap.tree.match(/button "Close Aside notification" \[ref=([^\]]+)\]/);if(notice){await p.locator(notice[1]).click();console.log((await snapshot(p,{interactive:true})).diff);}
console.log('QA_IMAGE dex '+Buffer.from(await p.screenshot({type:'jpeg',quality:85})).toString('base64'));
