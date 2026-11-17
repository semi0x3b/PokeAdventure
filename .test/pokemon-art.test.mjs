import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
const root={};vm.runInNewContext(fs.readFileSync(new URL('../js/pokemon-art.js',import.meta.url),'utf8'),{window:root});
test('외부 피카츄 앞뒤 원본도 꼬리를 보존하고 몸통 축을 칸 가운데 둔다',()=>{
 for(const input of [{bounds:[40,28,480,487],axis:162,width:640},{bounds:[30,37,474,475],axis:364,width:672}]){
  const g=root.PokemonArt.geometry(512,512,input.bounds,input.axis);
  assert.equal(g.width,input.width);assert.equal(input.axis-g.left+g.offset,g.width/2);
  assert.ok(g.offset>=0);assert.ok(g.offset+g.cropWidth<=g.width);
 }
});
test('다른 포켓몬은 원본 알파 여백만 잘라 기존 전신 크기를 유지한다',()=>{
 const g=root.PokemonArt.geometry(512,512,[100,80,400,480]);assert.equal(g.width,304);assert.equal(g.height,404);assert.equal(g.offset,0);
});
