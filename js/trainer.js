// 필드 도트 트레이너의 그림 칸 고르기. direction 은 아래(앞)·위(뒤)·왼쪽·오른쪽 순서 번호(0~3),
// frame 은 걷기 네 장 가운데 몇 번째인지(멈추면 0). 그림판마다 방향이 행인지 열인지는 game.js 가 안다.
(function (root) {
  'use strict';
  const directions = ['front', 'back', 'left', 'right'];
  const WALK_FRAMES = 4;
  const FRAMES_PER_SECOND = 8;
  function frameFor(direction, moving, time, reducedMotion = false) {
    const index = Math.max(0, directions.indexOf(direction));
    if (!moving || reducedMotion) return { walking: false, direction: index, frame: 0, frames: WALK_FRAMES };
    const seconds = Number.isFinite(time) ? Math.max(0, time) : 0;
    return { walking: true, direction: index, frame: Math.floor(seconds * FRAMES_PER_SECOND + 1e-8) % WALK_FRAMES, frames: WALK_FRAMES };
  }
  root.TrainerView = Object.freeze({ frameFor });
})(window);
