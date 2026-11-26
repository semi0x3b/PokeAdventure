// browser-day1.js 의 shot·login 함수를 앞에 붙여 Aside repl 로 실행한다.
const vp=await openTab('http://127.0.0.1:4433/');await vp.setViewportSize({width:393,height:740});
// 시험 수첩의 날짜를 하루 앞당겨 「다음 날」을 만든다(localhost 시험 기록만): 어제 기쁨·도장, 지난달 30일 편안함.
await sleep(3000);console.log(await vp.evaluate(()=>{const k='poke-adventure:device-save:v1';const r=JSON.parse(localStorage.getItem(k));r.state.stamps=['2026-11-25'];r.state.moods={'2026-10-30':'calm','2026-11-25':'joy'};localStorage.setItem(k,JSON.stringify(r));for(const key of Object.keys(localStorage))if(key.startsWith('pokemon-adventure:stamp-board:'))localStorage.setItem(key,'2026-11-25');return JSON.stringify(r.state.moods);}));
await vp.reload();await sleep(1500);await login(vp);
await vp.locator('.modal--stamps').waitFor({state:'visible'});await sleep(2000);
await shot(vp,'v5-nextday-ask.png');
console.log('yesterday',await vp.locator('.mood-day[aria-label^="11월 25일"]').getAttribute('aria-label'),'today',await vp.locator('.mood-day.today').getAttribute('aria-label'));
await vp.locator('.mood-pick--sad').click();await sleep(700);
await shot(vp,'v6-nextday-sad.png');
await sleep(3500);
console.log('closed',await vp.locator('.modal--stamps').count(),'card label',await vp.locator('.stamp-card').getAttribute('aria-label'));
await shot(vp,'v7-title-card.png');
await vp.locator('[data-action=stamps]').click();await sleep(1200);
await vp.locator('[data-action=mood-month][data-step="-1"]').click();await sleep(300);
await shot(vp,'v8-october.png');
console.log('oct30',await vp.locator('.mood-day[aria-label^="10월 30일"]').getAttribute('aria-label'),'prev disabled',await vp.locator('[data-action=mood-month][data-step="-1"]').isDisabled());
await vp.locator('[data-action=mood-month][data-step="1"]').click();await sleep(300);
await vp.locator('.mood-pick--calm').click();await sleep(500);
console.log('changed today',JSON.stringify(await vp.evaluate(()=>GameStorage.state.moods)),'still open (manual)',await vp.locator('.modal--stamps').count());
await vp.locator('.mood-pick--sad').click();await sleep(300);
await vp.setViewportSize({width:734,height:343});await sleep(600);await shot(vp,'v9-landscape-734.png');
await vp.setViewportSize({width:1024,height:768});await sleep(600);await shot(vp,'v10-tablet-1024.png');
