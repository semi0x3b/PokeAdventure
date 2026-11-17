// 필드 동행 포켓몬: 걸어온 길 따라가기·픽셀 걷기 프레임 고르기(CompanionView). 지도의 걸을 수 있는 곳은 js/field-map.js.
// 화면(DOM·캔버스)에 손대지 않는 순수 계산이라 node 시험에서 그대로 읽는다.
(function(root){
  'use strict';
  function spriteFor(pokemon,direction) {
    const id=Number(pokemon?.id);
    const view=direction==='back'?'back':'front';
    return {url:Number.isInteger(id)&&id>=1&&id<=493?root.PokemonAssets.image(id,view):null,mirror:direction==='right',view};
  }
  // 걸어온 길(오래된 점 → 최근 점)에서 최근 점부터 gap(px)만큼 거슬러 간 자리.
  // dx·dy 는 그 자리에서 트레이너 쪽(더 최근 점)을 보는 방향(px)이다. 길이 짧으면 가장 오래된 점에 선다.
  function followPosition(points,gap,width,height){
    if(!points.length)return null;
    let remaining=gap;
    for(let i=points.length-1;i>0;i--){
      const newer=points[i],older=points[i-1];
      const dx=(newer.x-older.x)*width,dy=(newer.y-older.y)*height;
      const distance=Math.hypot(dx,dy);
      if(distance>=remaining&&distance>0){
        const ratio=remaining/distance;
        return{x:newer.x+(older.x-newer.x)*ratio,y:newer.y+(older.y-newer.y)*ratio,dx,dy};
      }
      remaining-=distance;
    }
    const first=points[0],second=points[1]||first;
    return{x:first.x,y:first.y,dx:(second.x-first.x)*width,dy:(second.y-first.y)*height};
  }
  function trailLength(points,width,height){
    let total=0;
    for(let i=1;i<points.length;i++)total+=Math.hypot((points[i].x-points[i-1].x)*width,(points[i].y-points[i-1].y)*height);
    return total;
  }
  // 길을 따라 minimum(px)부터 step 씩 뒤로 가며 blocked(자리)가 거짓인 첫 거리를 찾는다. 끝까지 막히면 길의 끝.
  function clearFollowDistance(points,minimum,step,width,height,blocked){
    const length=trailLength(points,width,height);
    for(let distance=Math.min(minimum,length);distance<length;distance+=step){
      if(!blocked(followPosition(points,distance,width,height)))return distance;
    }
    return length;
  }
  // 4방향 중 벡터에 가까운 쪽. 화면 아래(+y)가 앞(front)이다.
  function directionOf(dx,dy,fallback='front'){
    if(!dx&&!dy)return fallback;
    return Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'front':'back');
  }
  // 418ceee의 필드 시트 재생을 복원한다. spriteFor의 3D 경로는 fallback용으로 유지한다.
  function animationFor(pokemon, direction, moving, time, reducedMotion = false) {
    function valid(motion) {
      return motion && root.PokemonAssets.sprite(motion) &&
        Number.isInteger(motion.frames) && motion.frames >= 1 && motion.frames <= 4096 &&
        Number.isFinite(motion.frameWidth) && motion.frameWidth > 0 &&
        Number.isFinite(motion.frameHeight) && motion.frameHeight > 0;
    }
    const preferred = moving && !reducedMotion ? ['walk', 'idle'] : ['idle', 'walk'];
    const mode = preferred.find(name => valid(pokemon?.[name]));
    if (!mode) return null;
    const motion = pokemon[mode];
    const rows = Number.isInteger(motion.directions) && motion.directions >= 1 && motion.directions <= 8 ? motion.directions : 1;
    const names = { front: 'down', back: 'up', left: 'left', right: 'right' };
    const wanted = Number(motion.directionRows?.[direction] ?? motion.directionRows?.[names[direction]] ?? 0);
    const row = Number.isFinite(wanted) ? Math.min(rows - 1, Math.max(0, Math.trunc(wanted))) : 0;
    const durations = Array.from({ length: motion.frames }, (_, index) => {
      const duration = Number(motion.durationsMs?.[index]);
      return Number.isFinite(duration) && duration > 0 ? duration : 100;
    });
    let total = durations.reduce((sum, duration) => sum + duration, 0);
    if (!Number.isFinite(total)) { durations.fill(100); total = durations.length * 100; }
    let remaining = reducedMotion || !Number.isFinite(time) ? 0 : Math.max(0, time) * 1000 % total;
    if (!Number.isFinite(remaining)) remaining = 0;
    let column = 0;
    while (column < durations.length - 1 && remaining + 1e-7 >= durations[column]) {
      remaining -= durations[column];
      column++;
    }
    const geometry = motion.frameGeometry?.[row]?.[column];
    const validPoint = point => Array.isArray(point) && point.length >= 2 &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
      point[0] >= 0 && point[0] < motion.frameWidth && point[1] >= 0 && point[1] < motion.frameHeight;
    const bounds = geometry?.bounds;
    const validBounds = Array.isArray(bounds) && bounds.length >= 4 && bounds.every(Number.isFinite) &&
      bounds[0] >= 0 && bounds[1] >= 0 && bounds[2] > 0 && bounds[3] > 0 &&
      bounds[0] + bounds[2] <= motion.frameWidth && bounds[1] + bounds[3] <= motion.frameHeight;
    return {
      src: root.PokemonAssets.sprite(motion), width: motion.frameWidth, height: motion.frameHeight,
      columns: motion.frames, rows, column, row, mirror: false, mode,
      ground: validPoint(geometry?.ground) ? geometry.ground.slice(0, 2) : [motion.frameWidth / 2, motion.frameHeight * .8],
      body: validPoint(geometry?.body) ? geometry.body.slice(0, 2) : null,
      bounds: validBounds ? bounds.slice(0, 4) : [0, 0, motion.frameWidth, motion.frameHeight]
    };
  }
  root.CompanionView=Object.freeze({spriteFor,followPosition,trailLength,clearFollowDistance,directionOf,animationFor});
})(window);
