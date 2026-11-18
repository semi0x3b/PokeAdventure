const p=await openTab('http://127.0.0.1:4416/');await p.bringToFront();await p.setViewportSize({width:734,height:430});console.log((await snapshot(p,{interactive:true})).tree);
await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
await p.evaluate(()=>{
 const panel=document.createElement('section');panel.id='media-check';panel.style.cssText='position:fixed;inset:0;z-index:999999;background:#fffdf5;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#4b3a5a;font:24px sans-serif';
 const title=document.createElement('h1');title.textContent='3D 그림 로딩 오류 복구 시험';title.style.cssText='font-size:24px;margin:0';panel.append(title);
 const img=document.createElement('img');img.id='media-test-image';img.alt='피카츄';img.style.cssText='width:280px;height:280px;object-fit:contain';img.src='data:image/png;base64,AAAA';panel.append(img);document.body.append(panel);
});
await p.waitForFunction(()=>document.querySelector('#media-test-image').complete);
console.log('QA_IMAGE before '+Buffer.from(await p.screenshot({type:'jpeg',quality:85})).toString('base64'));
await p.evaluate(()=>{const i=document.querySelector('#media-test-image');i.dataset.assetSource=PokemonAssets.image(25);i.dispatchEvent(new Event('error'));});
await p.waitForFunction(()=>{const i=document.querySelector('#media-test-image');return i.complete&&i.naturalWidth>0&&i.src.includes('/home/25.png');},null,{timeout:20000});
console.log('QA_IMAGE after '+Buffer.from(await p.screenshot({type:'jpeg',quality:85})).toString('base64'));
console.log('QA_RESULT '+JSON.stringify(await p.evaluate(()=>({fallback:document.querySelector('#media-test-image').src,loaded:document.querySelector('#media-test-image').naturalWidth}))));
await p.evaluate(()=>document.querySelector('#media-check').remove());
