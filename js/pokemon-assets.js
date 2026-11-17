// 포켓몬 원본은 외부 자료원에서 필요할 때 받는다. 게임 배포물에 원작 그림·음원을 넣지 않는다.
(function (root) {
  'use strict';
  const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/';
  const MODEL = SPRITES + 'pokemon/versions/generation-viii/brilliant-diamond-shining-pearl/';
  const CRIES = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/';
  function validId(value) { return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 493; }
  function image(id, view = 'front') {
    if (!validId(id)) return null;
    id = Number(id);
    if (view === 'front') return MODEL + id + '.webp';
    if (view === 'back') return MODEL + 'back/' + id + '.webp';
    if (view === 'artwork') return SPRITES + 'pokemon/other/official-artwork/' + id + '.png';
    if (view === 'thumb') return SPRITES + 'pokemon/other/official-artwork/' + id + '.png';
    if (view === 'shiny') return SPRITES + 'pokemon/other/home/shiny/' + id + '.png';
    return null;
  }
  function cry(id) { return validId(id) ? CRIES + Number(id) + '.ogg' : null; }
  function sprite(motion) {
    const source = motion?.sourceUrl;
    return typeof source === 'string' && /^https:\/\/raw\.githubusercontent\.com\/PMDCollab\/SpriteCollab\/[a-f0-9]{40}\/sprite\/(?:\d{4}\/){1,4}(?:Walk|Idle|WalkFast)-Anim\.png$/.test(source) ? source : null;
  }
  function berry() { return SPRITES + 'items/dream-world/razz-berry.png'; }
  const names = new Map();
  const slugKey='poke-adventure:cry-names:v1';
  let savedNames={};
  try { const value=JSON.parse(root.localStorage?.getItem(slugKey)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))for(const[id,name]of Object.entries(value))if(validId(id)&&typeof name==='string'&&/^[a-z0-9]{1,40}$/.test(name))savedNames[id]=name; } catch { /* 자원 이름 캐시는 없어도 된다. */ }
  async function playableCry(id, oggSupported = true) {
    if (!validId(id)) return null;
    if (oggSupported) return cry(id);
    if(savedNames[id])return 'https://play.pokemonshowdown.com/audio/cries/'+savedNames[id]+'.mp3';
    if (!names.has(Number(id))) {
      names.set(Number(id), root.fetch('https://pokeapi.co/api/v2/pokemon/'+Number(id)+'/', {signal:AbortSignal.timeout(6000),credentials:'omit'}).then(async response=>{
        if(!response.ok)throw Error('울음소리 정보 요청 실패');
        const data=await response.json();
        if(data.id!==Number(id)||!/^[-a-z0-9]{1,40}$/.test(data.name))throw Error('울음소리 정보 확인 실패');
        const name=data.name.replace(/-(normal|altered|land|plant)$/,'').replaceAll('-','');
        savedNames[id]=name;
        try { root.localStorage?.setItem(slugKey,JSON.stringify(savedNames)); } catch { /* 다음 접속 때 다시 확인한다. */ }
        return name;
      }));
    }
    try { return 'https://play.pokemonshowdown.com/audio/cries/'+await names.get(Number(id))+'.mp3'; }
    catch { names.delete(Number(id));return null; }
  }
  root.PokemonAssets = Object.freeze({ image, cry, sprite, berry, playableCry });
})(typeof window === 'undefined' ? globalThis : window);
