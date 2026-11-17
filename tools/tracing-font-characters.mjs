// 글꼴 자료가 게임의 실제 낱말/문제/포켓몬 이름을 빠짐없이 포함하도록 모은다.
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
vm.createContext(context);
for(const file of ['words','pokemon','questions','strokes'])vm.runInContext(fs.readFileSync(new URL('../js/data/'+file+'.js',import.meta.url),'utf8'),context);
const characters=new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzㄱㄲㄳㄴㄵㄶㄷㄸㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅃㅄㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ가각간갈감강값꽃곽김국글꼬피츄');
function collect(value){
 if(Array.isArray(value)){value.forEach(collect);return;}
 if(!value||typeof value!=='object')return;
 for(const text of [value.word,value.trace])if(typeof text==='string')for(const character of text)characters.add(character);
 for(const child of Object.values(value))if(child&&typeof child==='object')collect(child);
}
collect(context.window.WORDBOOK_WORDS);
collect(context.window.QUESTIONS);
for(const pokemon of context.window.POKEMON)for(const character of pokemon.name)characters.add(character);
const templates=Object.fromEntries([...characters].sort().map(character=>[character,context.window.StrokeLetters.glyph(character)]).filter(([,glyph])=>glyph));
process.stdout.write(JSON.stringify(templates));
