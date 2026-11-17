import test from'node:test';import assert from'node:assert/strict';import handler from'../api/game.mjs';
test('기기 저장 앱의 옛 게임 API는 모든 요청을 거절하며 게임 기록을 읽거나 쓰지 않는다',()=>{
 for(const method of ['GET','POST','DELETE']){
  const headers={};let body;const res={setHeader(k,v){headers[k]=v;},end(value){body=JSON.parse(value);}};
  handler({method,body:{action:'register',name:'시험',pin:'1234'}},res);
  assert.equal(res.statusCode,410);assert.equal(headers['Cache-Control'],'no-store');assert.equal(Object.hasOwn(body,'state'),false);assert.equal(Object.hasOwn(body,'user'),false);
 }
});
