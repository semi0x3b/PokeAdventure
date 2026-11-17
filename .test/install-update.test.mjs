import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
test('홈화면 앱 업데이트는 미저장 진행이 있으면 자동 새로고침하지 않는다',()=>{
 for(const pending of [false,true]){
  let changed,reloads=0;const window={isSecureContext:true,GameStorage:{pending},location:{reload(){reloads++;}},addEventListener(){}};
  const navigator={serviceWorker:{controller:{},addEventListener(_name,callback){changed=callback;}}};
  vm.runInNewContext(fs.readFileSync(new URL('../js/install.js',import.meta.url),'utf8'),{window,navigator});changed();
  assert.equal(reloads,pending?0:1);
 }
});
