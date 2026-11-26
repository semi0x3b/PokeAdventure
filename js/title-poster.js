// 타이틀 장면: 하늘의 구름, 로고, 트레이너 이름 칸(○○ 트레이너 / N마리와 모험 중), 같은 땅에서 통통 뛰는 포켓몬 넷,
// 가장 큰 「모험 시작」과 색이 다른 작은 메뉴 카드, 출석 요약 카드 하나.
(function(root){
  'use strict';
  function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  // 뒤 줄 두 마리는 조금 작고 높게, 앞 줄 두 마리는 크고 낮게 세워 같은 땅 위 원근을 만든다.
  const PARTY=[[7,'꼬부기','squirtle'],[4,'파이리','charmander'],[25,'피카츄','pikachu'],[1,'이상해씨','bulbasaur']];
  const MOOD_NAMES={joy:'기쁨',sad:'슬픔',calm:'편안함',angry:'화남'};
  const icon=name=>`<span class="ui-icon icon-${name}" aria-hidden="true"></span>`;
  function render(input={}){
    const per=Number.isInteger(input.per)&&input.per>0?input.per:5;
    const collected=Number.isInteger(input.collected)?Math.min(per,Math.max(0,input.collected)):0;
    const caught=Number.isInteger(input.caught)?Math.max(0,input.caught):0;
    const ready=Boolean(input.ready);
    const pop=order=>` pop" style="--order:${order}`;
    // 말풍선 인사는 두지 않는다(2026-11-13 사용자). 이름 칸 두 줄: 「○○ 트레이너」·「N마리와 모험 중」.
    const together=caught?`${caught}마리와 모험 중`:'첫 포켓몬을 찾는 중';
    const trainer=input.trainerName?`<p class="title-trainer"><strong>${escape(input.trainerName)} 트레이너</strong><span>${together}</span></p>`:'';
    const party=PARTY.map(([id,name,kind],index)=>`<span class="title-pokemon title-pokemon--${kind}${pop(index+1)}"><img src="${root.PokemonAssets.image(id)}" alt="${name}" role="button" tabindex="0" data-cry="${id}" aria-label="${name} 울음소리 듣기" draggable="false"></span>`).join('');
    // 출석은 이 카드 한 곳에서만 연다. 글 없이 작은 배지 칸(모은 것은 색, 남은 것은 회색)과 늘 보이는 선물 상자만(2026-11-13 사용자: 「5개 중 n개」·「선물까지 n번」 같은 설명 빼기).
    // 배지와 선물 상자 사이마다 점선(…)을 두어 선물까지 같은 간격으로 이어 보이게 한다(2026-11-13 사용자).
    const dots='<span class="stamp-card-dots" aria-hidden="true"></span>';
    // 오늘 고른 기분 스티커는 오늘 도장 배지 귀퉁이에 작게 붙인다(js/game.js 기분 스티커).
    const mood=/^(joy|sad|calm|angry)$/.test(input.mood||'')&&Number.isInteger(input.moodAt)&&input.moodAt>=0?input.mood:null;
    const badge=index=>`<img src="img/art/badges/badge-${index%5+1}${index<collected?'':'-off'}.png" alt=""${index<collected?' data-on="true"':''}>`;
    const badges=Array.from({length:per},(_,index)=>mood&&index===input.moodAt?`<span class="stamp-card-badge">${badge(index)}<img class="stamp-card-mood" src="img/art/moods/${mood}.webp" alt=""></span>`:badge(index)).join(dots);
    const stamps=`<button class="stamp-card${ready?' ready':''}${pop(6)}" data-action="stamps" aria-label="출석 도장 ${per}개 중 ${collected}개${mood?', 오늘 기분 '+MOOD_NAMES[mood]:''}${ready?', 선물 열기':''}"><span class="stamp-card-badges">${badges}${dots}<span class="stamp-card-gift"><img src="img/art/gift/${ready?'gift-box':'gift-box-off'}.webp" alt=""></span></span></button>`;
    const menu=`<nav class="title-menu${pop(5)}" aria-label="메뉴"><button class="button menu-card menu-card--start" data-action="start">${icon('play')}<span>모험 시작</span></button><button class="button menu-card menu-card--dex" data-action="dex">${icon('dex')}<span>도감</span></button><button class="button menu-card menu-card--words" data-action="wordbook">${icon('pencil')}<span>글자 쓰기</span></button><button class="button menu-card menu-card--yard" data-action="yard">${icon('yard')}<span>내 마당</span></button></nav>`;
    return `<section class="title-scene${input.entering?' is-entering':''}"><div class="title-backdrop" aria-hidden="true"></div><span class="title-cloud title-cloud--one" aria-hidden="true"></span><span class="title-cloud title-cloud--two" aria-hidden="true"></span>${input.ambient||''}<div class="title-layout"><div class="title-heading${pop(0)}"><h1 aria-label="두근두근 모험"><img class="title-logo" src="img/ui-art/adventure-logo.webp" alt="" draggable="false"></h1>${trainer}</div><div class="title-party">${party}</div>${menu}${stamps}</div></section>`;
  }
  root.TitlePoster=Object.freeze({render});
})(window);
