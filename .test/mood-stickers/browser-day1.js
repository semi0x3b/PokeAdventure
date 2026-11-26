async function shot(p,name){const b=(await p.screenshot({type:"png"})).toString("base64");const n=Math.ceil(b.length/800);for(let i=0;i<n;i++)console.log("\nSHOT "+name+" "+i+"/"+n+" "+b.slice(i*800,i*800+800));}
async function login(p){await p.locator('[data-action=account]').click();await p.locator('#auth-form [name=name]').fill('기분시험');await p.locator('#auth-form [name=name]').press('Enter');for(const d of ['2','4','6','8'])await p.locator('[data-pin-key="'+d+'"]').click();await p.evaluate(()=>{for(const i of document.querySelectorAll('#auth-form input[type=password]'))i.type='text';});await p.locator('#auth-form [type=submit]').click();await sleep(1500);}
const vp=await openTab('http://127.0.0.1:4433/');await vp.setViewportSize({width:393,height:740});
await login(vp);
console.log('screen',await vp.evaluate(()=>document.body.dataset.screen));
await vp.evaluate(()=>GameStorage.update({caught:[1,4,7,25],companions:[25,1],companion:25,seen:['toured','stamps','wordbook','yard','settings']}));
await vp.locator('button[aria-label="처음 화면"]').click();
await vp.locator('.modal--stamps').waitFor({state:'visible'});await sleep(1800);
await shot(vp,'v1-auto-ask.png');
await sleep(3500);
console.log('still open after 5.3s:',await vp.locator('.modal--stamps').count(), 'moods:',JSON.stringify(await vp.evaluate(()=>GameStorage.state.moods??null)));
console.log((await snapshot(vp,{selector:'.modal--stamps'})).tree);
await vp.locator('.mood-pick--joy').click();await sleep(400);
await shot(vp,'v2-picked-joy.png');
await sleep(3500);
console.log('closed after pick:',await vp.locator('.modal--stamps').count(),'moods:',JSON.stringify(await vp.evaluate(()=>GameStorage.state.moods)));
await shot(vp,'v3-title-after.png');
await vp.reload();await sleep(1500);await login(vp);await sleep(1500);
console.log('after reload screen',await vp.evaluate(()=>document.body.dataset.screen),'auto board',await vp.locator('.modal--stamps').count());
await vp.locator('[data-action=stamps]').click();await sleep(1500);
await shot(vp,'v4-reload-board.png');
console.log('today aria',await vp.locator('.mood-day.today').getAttribute('aria-label'),'pressed',await vp.locator('.mood-pick--joy').getAttribute('aria-pressed'));
