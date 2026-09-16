/* 오목지면시그 시그니처 오프닝 — 스트리머 게임시리즈 공용 브랜드 모먼트. */
(function () {
  var SEEN_KEY = 'ojmSigSplashSeen_lifeGame_v1';
  var DURATION_MS = 3400;
  var started = false;

  function play(onDone) {
    var stage = document.getElementById('sig-opening-stage');
    if (!stage) { onDone(); return; }
    stage.classList.add('is-playing');
    var finished = false;
    var timer = setTimeout(finish, DURATION_MS);
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      stage.removeEventListener('click', finish);
      stage.removeEventListener('keydown', onKeydown);
      stage.classList.add('is-leaving');
      setTimeout(function () {
        stage.classList.remove('is-playing', 'is-leaving');
        onDone();
      }, 400);
    }
    function onKeydown(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); }
    }
    stage.addEventListener('click', finish);
    stage.addEventListener('keydown', onKeydown);
  }

  function maybeShow(onDone) {
    if (started) return;
    started = true;
    var seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch (e) {}
    if (seen) {
      if (typeof onDone === 'function') onDone();
      return;
    }
    play(function () {
      try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
      if (typeof onDone === 'function') onDone();
    });
  }

  window.ojmMaybeShowBootSplash = maybeShow;

  // 이 스크립트는 시그니처 레이어 바로 다음에 로드된다. 모듈 Firebase
  // 초기화와 관계없이 최초 방문 오프닝을 즉시 띄워, 페이지·데이터 로딩을
  // 오프닝 하위 레이어에서 동시에 진행한다.
  maybeShow();
}());
