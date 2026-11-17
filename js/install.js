// 홈 화면 앱. 기록은 GameStorage만 다루며 캐시에는 게임 기록·비밀번호를 넣지 않는다.
if ('serviceWorker' in navigator && window.isSecureContext) {
  let controlled=Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(controlled&&!window.GameStorage?.pending)window.location.reload();
    controlled=true;
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* 브라우저로는 계속 사용한다. */ });
  }, {once:true});
}
