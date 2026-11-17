import fs from 'node:fs';
import vm from 'node:vm';

// 소비처 단위도 브라우저와 같은 URL 공급자를 읽는다. 로컬 그림으로 대체하지 않는다.
export function loadPokemonAssets(context) {
  context.URL ||= URL;
  vm.runInContext(fs.readFileSync(new URL('../js/pokemon-assets.js', import.meta.url), 'utf8'), context);
  return context.window.PokemonAssets;
}
