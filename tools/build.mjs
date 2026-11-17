// 브라우저에 필요한 파일만 배포한다. 서버 코드·문서·시험·환경 변수는 정적 경로에서 제외한다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist');
// 화면 코드가 더는 부르지 않는 원본 그림. Codex 원본 묶음은 tools/slice-ui-art.py 로 잘라 img/ui-art 에 둔 것만 쓴다.
// 코드(index.html·css·js)에 이름이 다시 나오면 그대로 배포해서, 다른 작업이 이 그림을 쓰기 시작해도 깨지지 않게 한다.
const unusedOriginals = [
  'img/art/redesign-2026-11',
  'img/art/region-atlas.png',
  'img/art/city-field.webp',
  'img/art/title-logo.png',
  'img/ui/audio-on.png',
  'img/ui/audio-off.png',
  'img/ui/music-on.png',
  'img/ui/music-off.png'
];
async function screenCode() {
  const texts = [await fs.readFile(path.join(root, 'index.html'), 'utf8')];
  for (const folder of ['css', 'js']) {
    for (const file of await fs.readdir(path.join(root, folder), { recursive: true })) {
      if (/\.(css|js)$/.test(file)) texts.push(await fs.readFile(path.join(root, folder, file), 'utf8'));
    }
  }
  return texts.join('\n');
}
const code = await screenCode();
const skipped = unusedOriginals.filter(relative => !code.includes(path.basename(relative))).map(relative => path.join(root, relative));
const externalOnly = ['img/model', 'img/pokemon', 'img/thumb', 'img/field', 'sounds/cries', 'img/art/stickers/pikachu-sticker.webp', 'img/art/stamps', 'img/battle/berry-razz.png', 'img/ui-art/title-logo-flat.webp', 'img/ui-art/title-logo.webp'].map(relative => path.join(root, relative));
const keep = source => ![...skipped, ...externalOnly].some(excluded => source === excluded || source.startsWith(excluded + path.sep));
// dist는 이 도구가 만든 재생성 가능한 결과물이다. 이전 배포의 미사용 파일을 남기지 않는다.
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const file of ['index.html', 'css', 'js', 'img', 'sounds', 'manifest.webmanifest', 'sw.js', 'privacy.html', 'terms.html']) {
  await fs.cp(path.join(root, file), path.join(output, file), { recursive: true, force: true, filter: keep });
}
const shell = ['index.html', 'manifest.webmanifest', 'privacy.html', 'terms.html'];
for (const folder of ['css', 'js']) for (const file of await fs.readdir(path.join(output, folder), { recursive:true })) if (/\.(css|js)$/.test(file)) shell.push(folder+'/'+file);
shell.push('img/ui-art/adventure-logo.webp','img/ui-art/app-icon-192.png','img/ui-art/app-icon-512.png');
const hash=createHash('sha256');for(const file of shell)hash.update(await fs.readFile(path.join(output,file)));
await fs.writeFile(path.join(output,'precache-manifest.js'),'self.APP_REVISION='+JSON.stringify(hash.digest('hex').slice(0,12))+';\nself.APP_SHELL='+JSON.stringify(shell.map(file=>'/'+file))+';\n');
console.log(`게임 화면·데이터·그림을 dist에 준비했습니다. 쓰지 않는 원본 ${skipped.length}개는 뺐습니다.`);
