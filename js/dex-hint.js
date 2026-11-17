/* 미포획 도감: 이름을 공개하지 않는 출현 지역 안내. 데이터는 호출자가 전달한다. */
(function (root) {
  'use strict';
  const fallbackOwners = new WeakMap();
  function escape(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  }
  function describe(pokemon, all, caught) {
    const rules = root.GameRules;
    const legendary = pokemon.tier === 'legend';
    const requiredGeneration = pokemon.gen;
    return {
      regions: Object.entries(rules.REGIONS)
        .filter(([, region]) => pokemon.types.some(type => region.types.includes(type)))
        .map(([id, region]) => ({ id, name: region.name })),
      locked: requiredGeneration > rules.generation(all, caught, legendary),
      requiredGeneration,
      gold: legendary || pokemon.tier === 'rare'
    };
  }
  function render(pokemon, all, caught) {
    const hint = describe(pokemon, all, caught);
    // 번호만 이미지 경로에 사용한다. 이름은 alt/data/title에도 넣지 않는다.
    const id = Number.isSafeInteger(pokemon.id) && pokemon.id > 0 ? pokemon.id : null;
    const portrait = id === null ? '<span class="dex-hint-unknown" aria-hidden="true">?</span>'
      : `<img class="dex-hint-silhouette silhouette" src="${root.PokemonAssets.image(id)}" alt="아직 만나지 못한 포켓몬의 실루엣">`;
    const regions = hint.regions.map(region => `<li class="dex-hint-region"><img src="${escape('img/ui-art/field-' + encodeURIComponent(region.id) + '.webp')}" alt=""><span>${escape(region.name)}</span></li>`).join('');
    const previous = hint.requiredGeneration - 1;
    const earlier = previous === 1 ? '1세대' : `1세대부터 ${escape(previous)}세대까지`;
    const family = pokemon.tier === 'legend' ? '전설' : '일반·희귀';
    const condition = hint.locked ? `<p class="dex-hint-condition">${earlier}의 ${family} 친구를 모두 만나면 <strong>${escape(hint.requiredGeneration)}세대</strong>가 열려!</p>` : '';
    const ball = hint.gold ? 'balls/ball-gold' : 'balls/ball-red';
    const ballText = hint.gold ? '금색 몬스터볼을 찾아보자!' : '빨간 몬스터볼을 찾아보자!';
    const challenge = hint.gold ? '<small>문제 4개를 맞히면 친구가 돼!</small>' : '';
    const action = hint.locked ? 'close-modal' : 'hint-regions';
    const label = hint.locked ? '알겠어!' : '모험하러 가기';
    return `<section class="dex-hint${hint.locked ? ' is-locked' : ''}" aria-label="어디서 만날까?"><div class="dex-hint-portrait">${portrait}</div><div class="dex-hint-content"><ul class="dex-hint-regions">${regions}</ul>${condition}</div><div class="dex-hint-ball"><img src="img/art/${ball}.png" alt=""><span>${ballText}${challenge}</span></div><button class="button dex-hint-go" data-action="${action}">${label}</button></section>`;
  }
  async function shake(node, guard = () => true) {
    if (!node || node.isConnected === false || typeof root.AdventureMotion?.sequence !== 'function') return false;
    const allowed = () => node.isConnected !== false && typeof guard === 'function' && guard();
    let animation = null;
    let fallback = null;
    let result = false;
    try {
      result = await root.AdventureMotion.sequence([{ at: 0, run() {
        if (root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        if (typeof node.animate === 'function') {
          animation = node.animate([
            { transform:'translateX(0)' },
            { offset:.22, transform:'translateX(-5px)' },
            { offset:.46, transform:'translateX(4px)' },
            { offset:.7, transform:'translateX(-2px)' },
            { transform:'translateX(0)' }
          ], { duration:280, easing:'ease-out' });
        } else if (node.style) {
          const previous = fallbackOwners.get(node);
          fallback = { original:previous ? previous.original : node.style.animation };
          fallbackOwners.set(node, fallback);
          node.style.animation = 'dex-hint-shake 280ms ease-out both';
        }
      } }], { duration:280, guard:allowed });
    } catch { result = false; }
    finally {
      try { animation?.cancel(); } catch { result = false; }
      if (fallback && node.style && fallbackOwners.get(node) === fallback) {
        node.style.animation = fallback.original;
        fallbackOwners.delete(node);
      }
    }
    return result === true;
  }
  // 도감 안에서 나오는 짧은 말. 상황별로 여러 문장 중 직전과 다른 것을 무작위로 고른다. %s 는 포켓몬 이름.
  const LINES = {
    // %s{이/가} 처럼 쓰면 받침에 맞춰 조사를 붙인다(PokemonText.josa).
    partnerSet: ['%s, 같이 가자!', '%s{이/가} 함께 간대!', '%s, 잘 부탁해!', '좋아, %s{와/과} 모험이다!', '%s{이/가} 신나 보여!'],
    partnerClear: ['잠깐 쉬러 갔어!', '다음에 또 같이 가자!', '칸이 비었어!', '푹 쉬고 있을게!'],
    unknown: ['어디서 만날까?', '어딘가에 숨어 있어!', '찾아보자, 어디 있을까?', '아직 못 만난 친구야!', '누구일까? 궁금해!'],
    complete: ['대단해! 다 모았어!', '우와, 모두 친구가 됐어!', '도감이 가득 찼어!', '최고의 트레이너야!']
  };
  const lastLine = {};
  function say(kind, name = '') {
    const lines = LINES[kind];
    const pool = lines.length > 1 ? lines.filter(line => line !== lastLine[kind]) : lines;
    const line = pool[Math.floor(Math.random() * pool.length)];
    lastLine[kind] = line;
    return line.replace(/%s\{([^}]+)\}/, (_, pair) => root.PokemonText ? root.PokemonText.josa(name, pair) : name).replace('%s', name);
  }
  root.DexHint = { describe, render, shake, say, LINES };
})(window);
