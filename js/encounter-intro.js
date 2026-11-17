/* 배틀 진입: 화면 전체에 야생 포켓몬 앞모습을 검은 그림자로 크게, 아래에 발견 문구. 실제 이름·색은 보이지 않는다.
   배경이 상대 쪽으로 당겨지는(확대) 동안 그림자가 떠오르고, 사라지면 같은 지점을 확대한 배틀 장면이 이어진다.
   모션 줄이기에서도 이 정지 단계는 같은 시간 보여 준다(움직임만 뺀다). guard 가 거짓이 되면 즉시 정리한다. */
(function(root){
  'use strict';
  // 어둠 → 그림자가 떠오름 → 문구 → 두근두근 두 번 → 사라짐. 아이가 긴장할 틈을 둔다(2026-11-13 사용자: 너무 빠름 → 「2배 느리게」).
  // 지루하지 않게 5초 안(4.5초). 시각은 css/encounter-intro.css 의 지연 값과 맞춘다(퇴장 페이드 .7s).
  const DURATION=4500, LEAVE_AT=3800;
  let current=null;
  function clear(){if(current){current.remove();current=null;}}
  function show({id,region='forest',gold=false,guard=()=>true}={}){
    clear();
    if(!guard())return Promise.resolve(false);
    if(!Number.isInteger(id)||id<1||id>493||!root.document||!root.AdventureMotion)return Promise.resolve(false);
    const kind=['forest','city','desert','sea'].includes(region)?region:'forest';
    const node=root.document.createElement('section');node.className='encounter-intro'+(gold?' encounter-intro--gold':'');node.dataset.region=kind;
    node.setAttribute('role','status');node.setAttribute('aria-live','polite');
    // 위쪽 이름표(아직 이름을 모르니 ???), 가운데 큰 그림자, 아래 흰 글씨 한 줄. 금색 볼은 큰 반짝임이 흩어진다.
    // 금색 볼도 반짝이 장식 없이 금빛 배경만(2026-11-13 사용자: 반짝이 삭제).
    const sparkles='';
    node.innerHTML='<div class="encounter-tag" aria-hidden="true"><span class="encounter-tag-ball"></span><span>???</span></div>'+sparkles+'<img class="encounter-silhouette" src="'+root.PokemonAssets.image(id)+'" alt="발견한 포켓몬의 그림자" draggable="false"><p>'+(gold?'특별한 포켓몬을 발견했다!':'야생의 포켓몬을 발견했다!')+'</p>';
    root.document.body.appendChild(node);current=node;
    const valid=()=>current===node&&node.isConnected&&guard();
    return root.AdventureMotion.sequence([
      {at:0,run:()=>{node.dataset.beat='appeared';}},
      {at:LEAVE_AT,run:()=>{node.classList.add('leaving');}}
    ],{duration:DURATION,guard:valid,keepTime:true}).then(done=>{if(current===node)current=null;node.remove();return done;});
  }
  root.EncounterIntro=Object.freeze({show,clear,get active(){return Boolean(current?.isConnected);}});
})(window);
