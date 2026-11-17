(function(root){
  'use strict';
  const positions={forest:'0% 0%',city:'100% 0%',desert:'0% 100%',sea:'100% 100%'};
  function kindOf(region){return Object.hasOwn(positions,region)?region:'forest';}
  // 타이틀·배틀 배경 위 장식(잎 가지·구름·모래바람·파도 그림 두 장).
  function html(region){
    const kind=kindOf(region);
    return `<div class="ambient-world ambient--${kind}" aria-hidden="true" style="--ambient-position:${positions[kind]}"><span class="ambient-accent ambient-accent--one"></span><span class="ambient-accent ambient-accent--two"></span></div>`;
  }

  // ---------- 필드(도트 지도) ----------
  // 물결·높은 풀 흔들림은 지도 캔버스가 타일로 그린다. 여기서는 그 위에 얹는 가벼운 장면만 만든다(모두 transform·opacity).
  // 반복 장면이 한꺼번에 움직이지 않게 시작 시각을 흩는다.
  function delay(index,period){return `-${(index*0.37*period%period).toFixed(2)}s`;}
  // 지도와 함께 움직이는 층: 도시는 지나가는 구름 그림자.
  function worldLayer(kind){
    const clouds=kind==='city'?'<span class="field-cloud-track" style="top:18%"><span class="field-cloud-shadow"></span></span><span class="field-cloud-track field-cloud-track--slow" style="top:58%"><span class="field-cloud-shadow"></span></span>':'';
    return `<div class="field-ambient-world" aria-hidden="true">${clouds}</div>`;
  }
  // 화면에 붙어 있는 층: 숲은 흩날리는 도트 나뭇잎, 사막은 옆으로 날리는 모래 알갱이(바다 물빛은 지도 캔버스가 물 칸에 그린다).
  function weatherLayer(kind){
    const pieces={
      forest:[8,22,37,51,66,79,92].map((x,index)=>`<span class="field-leaf" style="left:${x}%;animation-delay:${delay(index,9)}"><span style="animation-delay:${delay(index+3,2.2)}"></span></span>`),
      desert:[12,26,41,55,68,83].map((y,index)=>`<span class="field-grain" style="top:${y}%;animation-delay:${delay(index,5)}"></span>`),
    }[kind]||[];
    return `<div class="field-weather field-weather--${kind}" aria-hidden="true">${pieces.join('')}</div>`;
  }
  function field(region){
    const kind=kindOf(region);
    return{world:worldLayer(kind),weather:weatherLayer(kind)};
  }
  root.AmbientScene=Object.freeze({html,field});
})(window);
