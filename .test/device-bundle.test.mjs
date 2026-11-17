import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{execFileSync}from'node:child_process';
test('홈화면 앱 배포물에는 로컬 원작 그림·울음·API/비밀 파일이 없고 오프라인 화면 목록이 있다',()=>{
 execFileSync(process.execPath,['tools/build.mjs'],{stdio:'pipe'});
 for(const path of ['img/model','img/pokemon','img/thumb','img/field','sounds/cries','img/battle/berry-razz.png','img/art/stickers/pikachu-sticker.webp','api','.env.local'])assert.equal(fs.existsSync('dist/'+path),false,path);
 for(const path of ['manifest.webmanifest','sw.js','precache-manifest.js','privacy.html','terms.html','img/ui-art/app-icon-192.png','img/ui-art/app-icon-512.png'])assert.ok(fs.existsSync('dist/'+path),path);
 const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));assert.equal(manifest.display,'standalone');assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));
 const precache=fs.readFileSync('dist/precache-manifest.js','utf8');assert.ok(precache.includes('/js/storage.js'));assert.equal(precache.includes('/api/'),false);
});
