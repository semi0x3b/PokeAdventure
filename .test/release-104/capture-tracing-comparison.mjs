// 실제 글꼴 자료의 전후 중심선을 같은 네이티브 Canvas에 그려 Aside에서 확인한다.
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
function glyphs(source) { const context = { window: {} }; vm.runInNewContext(source, context); return context.window.TRACING_FONT_GLYPHS; }
const before = glyphs(execFileSync('git', ['show', '1988aa5:js/data/strokes-font.js'], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }));
const after = glyphs(fs.readFileSync('js/data/strokes-font.js', 'utf8'));
const characters = ['렛', '구', 'd', 'B'];
const pairs = characters.map(character => ({ character, before: before[character], after: after[character] }));
const script = `
const p=await openTab('http://127.0.0.1:4426/');await p.bringToFront();await p.setViewportSize({width:1024,height:768});console.log((await snapshot(p,{interactive:true})).tree);
const data=await p.evaluate(pairs=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=550;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1000,550);c.font='bold 24px sans-serif';c.fillStyle='#4b3a5a';c.fillText('수정 전',15,35);c.fillText('수정 후',15,310);for(let row=0;row<2;row++)pairs.forEach((pair,col)=>{const g=row?pair.after:pair.before;c.save();c.translate(120+col*215,50+row*275);c.fillStyle='#4b3a5a';c.font='bold 22px sans-serif';c.fillText(pair.character,60,0);c.translate(0,10);c.scale(1.85,1.85);c.fillStyle='#dedce2';c.fill(new Path2D(g.outline));g.strokes.forEach((points,i)=>{const color=['#ff6b6b','#248bd4','#24a35c','#a26add','#9e6a26','#176c72','#d050a0','#705eab'][i%8];c.strokeStyle=color;c.lineWidth=1;c.beginPath();points.forEach(([x,y],n)=>n?c.lineTo(x,y):c.moveTo(x,y));c.stroke();const [x,y]=points[0];c.fillStyle=color;c.beginPath();c.arc(x,y,1.6,0,Math.PI*2);c.fill();c.font='bold 8px sans-serif';c.fillText(String(i+1),x-6,y-3);});c.restore();});return canvas.toDataURL('image/png');},${JSON.stringify(pairs)});console.log('QA_IMAGE tracing-comparison '+data.split(',')[1]);`;
fs.writeFileSync('.test/release-104/tracing-comparison.js', script);
