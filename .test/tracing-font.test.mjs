import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const scope={window:{}};vm.createContext(scope);
for(const file of ['strokes-font','strokes','words','pokemon','questions'])vm.runInContext(fs.readFileSync(new URL('../js/data/'+file+'.js',import.meta.url),'utf8'),scope);
const letters=scope.window.StrokeLetters;
const glyphs=scope.window.TRACING_FONT_GLYPHS;
vm.runInContext(fs.readFileSync(new URL('../js/guided-tracing.js',import.meta.url),'utf8'),scope);
function contours(svg){
 const tokens=svg.match(/[MLQZ]|-?\d+(?:\.\d+)?/g);const result=[];let active=[],current=null;
 for(let i=0;i<tokens.length;){const command=tokens[i++];if(command==='Z'){result.push(active);active=[];continue;}const x=Number(tokens[i++]),y=Number(tokens[i++]);if(command==='M'){current={x,y};active.push(current);}else if(command==='L'){current={x,y};active.push(current);}else if(command==='Q'){const end={x:Number(tokens[i++]),y:Number(tokens[i++])},start=current;for(let n=1;n<=12;n++){const t=n/12,u=1-t;active.push({x:u*u*start.x+2*u*t*x+t*t*end.x,y:u*u*start.y+2*u*t*y+t*t*end.y});}current=end;}}
 return result;
}
function inside(point,paths){let winding=0,near=Infinity;for(const path of paths)for(let i=0,j=path.length-1;i<path.length;j=i++){
 const a=path[j],b=path[i],cross=(b.x-a.x)*(point.y-a.y)-(point.x-a.x)*(b.y-a.y);
 if(a.y<=point.y&&b.y>point.y&&cross>0)winding++;
 else if(a.y>point.y&&b.y<=point.y&&cross<0)winding--;
 const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy,t=n?Math.min(1,Math.max(0,((point.x-a.x)*dx+(point.y-a.y)*dy)/n)):0;near=Math.min(near,Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy));
 }return winding!==0||near<=.9;}

test('실제 게임 낱말·배틀·포켓몬 이름의 모든 문자에 실제 글꼴 윤곽이 있다',()=>{
 const expected=JSON.parse(execFileSync('node',['tools/tracing-font-characters.mjs'],{cwd:new URL('..',import.meta.url),maxBuffer:10*1024*1024}));
 for(const character of Object.keys(expected)){const glyph=letters.glyph(character);assert.ok(glyph.outline?.startsWith('M'),character);assert.equal(glyph.strokes.length,expected[character].strokes.length,character+' 획수');assert.ok(['Korean','Latin'].includes(glyph.font));}
 assert.ok(Object.keys(expected).length>=480);
});

test('화살표 중심선은 실제 폰트 윤곽 안에 있고 한글을 도형 획으로 다시 그리지 않는다',()=>{
 for(const[character,data]of Object.entries(glyphs)){
  const paths=contours(data.outline);
  for(const stroke of data.strokes)for(const[x,y]of stroke)assert.ok(inside({x,y},paths),`${character}: 글꼴 밖 (${x}, ${y})`);
 }
});

test('b·p는 세로줄기를 먼저 내리고 bowl은 위쪽 왼편에서 오른쪽으로 돈다',()=>{
 for(const character of ['b','p']){
  const[stem,bowl]=letters.glyph(character).strokes;
  assert.ok(stem[0].y<stem.at(-1).y);
  assert.ok(Math.max(...stem.map(p=>p.x))-Math.min(...stem.map(p=>p.x))<5,'줄기는 곧게');
  assert.ok(bowl[0].y<bowl.at(-1).y,'bowl 위에서 출발');
  assert.ok(bowl.slice(1,8).some(p=>p.x>bowl[0].x+1),'첫 구간에서 오른쪽으로');
  assert.ok(Math.min(...bowl.slice(0,8).map(p=>p.y))<=bowl[0].y,'아래에서 거꾸로 올라가지 않음');
 }
});

test('글꼴 자료를 호출자가 바꿔도 다음 연습의 윤곽·획 자료는 보존된다',()=>{
 const first=letters.glyph('사');const x=first.strokes[0][0].x;first.strokes[0][0].x=999;assert.equal(letters.glyph('사').strokes[0][0].x,x);
 for(const file of ['NanumGothic-OFL.txt','Andika-OFL.txt'])assert.match(fs.readFileSync(new URL('../img/fonts/'+file,import.meta.url),'utf8'),/SIL OPEN FONT LICENSE/);
});

test('실제 글꼴 모든 지원 문자의 중심선을 화살표대로 쓰면 다음 획으로 끝까지 간다',()=>{
 for(const character of Object.keys(glyphs)){
  const glyph=letters.glyph(character);
  const tracker=scope.window.GuidedTracingPad.createTracker(glyph.strokes.map(s=>s.map(p=>({x:p.x*2,y:p.y*2}))),{tolerance:24,maxStep:36});
  let previous=-1,move=0;
  for(;move<3500&&!tracker.progress.complete;move++){
   const state=tracker.progress;
   if(state.strokeIndex!==previous){tracker.end();tracker.begin(state.marker);previous=state.strokeIndex;}
   tracker.move({x:state.marker.x+Math.cos(state.marker.angle)*4,y:state.marker.y+Math.sin(state.marker.angle)*4});
  }
  assert.ok(tracker.progress.complete,character+' 화살표 진행 '+JSON.stringify(tracker.progress));
 }
});

test('ㅊ의 첫 짧은 획은 초성·받침 모두 본체 가로획 위에 따로 놓인다',()=>{
 const characters=Object.keys(glyphs).filter(c=>c==='ㅊ'||c>='가'&&c<='힣'&&(Math.floor((c.charCodeAt(0)-0xAC00)/588)===14||(c.charCodeAt(0)-0xAC00)%28===23));
 assert.ok(characters.includes('꽃')&&characters.includes('차')&&characters.includes('치'));
 for(const character of characters){
  const glyph=letters.glyph(character);
  const index=character!=='ㅊ'&&(character.charCodeAt(0)-0xAC00)%28===23?glyph.strokes.length-3:0;
  const [dot,body]=glyph.strokes.slice(index,index+2);
  assert.ok(Math.max(...dot.map(p=>p.y))+4<Math.min(...body.map(p=>p.y)),character+' ㅊ 첫 획이 본체 가로획과 겹치지 않음');
  assert.ok(dot[0].x<dot.at(-1).x,character+' 짧은 획은 왼쪽에서 오른쪽으로');
 }
});
