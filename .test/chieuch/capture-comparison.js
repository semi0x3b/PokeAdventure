const p=await openTab('http://127.0.0.1:4416/');await p.bringToFront();await p.setViewportSize({width:393,height:740});
console.log((await snapshot(p,{interactive:true})).tree);
try{await p.evaluate(async()=>{const r=await navigator.serviceWorker.ready;await r.update();});}catch{}
await p.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r?.installing&&!r?.waiting&&window.StrokeLetters?.glyph('꽃').strokes[4][0].y<60;},null,{timeout:25000});
await p.locator('[data-action=account]').click();await p.locator('#auth-form [name=name]').fill('꼬마탐험가');for(const d of ['2','4','6','8'])await p.locator('[data-pin-key="'+d+'"]').click();await p.locator('#auth-form [type=submit]').click();await p.locator('.title-menu').waitFor({state:'visible',timeout:20000});await p.waitForFunction(()=>!SceneFX.active&&Number(getComputedStyle(document.querySelector('.title-menu')).opacity)>.99);
console.log((await snapshot(p,{interactive:true})).diff);
await p.evaluate(()=>{GameStorage.update({settings:{sound:false}},true);window.qaFixedDot=TRACING_FONT_GLYPHS['꽃'].strokes[4];const original=GuidedTracingPad;window.GuidedTracingPad={...original,create(...args){window.qaPad=original.create(...args);return window.qaPad;}};});
await p.locator('.title-menu [data-action=wordbook]').click();await p.locator('.wordbook-canvas').waitFor({state:'visible',timeout:15000});await p.waitForFunction(()=>!SceneFX.active);
async function flower(){await p.locator('.wordbook-list-button').click();await p.locator('[data-wordbook-card="ko-flower"]').click();await p.locator('.wordbook-canvas').waitFor({state:'visible'});await p.waitForFunction(()=>document.querySelector('.wordbook-sample img').complete&&document.fonts.status==='loaded');}
async function save(name){await p.locator('.wordbook-intro').waitFor({state:'detached'});const data=await p.evaluate(()=>document.querySelector('.wordbook-canvas').toDataURL('image/png'));console.log('QA_IMAGE '+name+' '+data.split(',')[1]);}
await p.evaluate(dot=>{TRACING_FONT_GLYPHS['꽃'].strokes[4]=dot;},[[39.17,68.33],[40.86,68.33],[42.56,68.33],[44.26,68.33],[45.95,68.33],[47.65,68.33],[49.35,68.33],[51.04,68.33],[52.74,68.33],[54.43,68.33],[56.13,68.33],[57.83,68.33],[59.52,68.33],[61.22,68.33],[62.92,68.33]]);
await flower();await save('before');
await p.evaluate(()=>{TRACING_FONT_GLYPHS['꽃'].strokes[4]=window.qaFixedDot;});
await flower();await save('after');
console.log('QA_FLOWER '+JSON.stringify(await p.evaluate(()=>{const strokes=StrokeLetters.glyph('꽃').strokes;return {dotStart:strokes[4][0],bodyStart:strokes[5][0],count:strokes.length,guide:document.querySelector('.wordbook-canvas').getAttribute('aria-label')};})));
