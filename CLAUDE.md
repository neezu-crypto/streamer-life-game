# streamer-life-game (스트리머 인생게임)

스트리머 이름을 검색해 주인공을 짓고, 0세~100세를 3지선다로 살아보는 인터랙티브
소설 게임. 번들러 없는 정적 HTML(`index.html`) + Firebase. 기획안 원본은
`life-game-plan.html`(Artifact로 만든 초안, 이 레포엔 없음 — 대화 기록 참고).

## Firebase 프로젝트 공유 — 반드시 숙지

- 이 게임은 별도 Firebase 프로젝트를 새로 만들지 않고, **StreamBet-Market / soop-stock-market /
  interior-3d-viewer와 동일한 `soop-stock-market` 프로젝트(RTDB `soop-stock-market-default-rtdb`)를
  그대로 공유한다** — 스트리머 이름 검색에 필요한 `stocks` 노드를 새 프로젝트 설정 없이
  바로 읽기 위함. 이 게임 전용 데이터는 전부 `lifeGame/` 네임스페이스 아래에만 쓴다.
- Cloud Functions는 `codebase: "lifegame"`으로 격리 배포(`firebase.json`) — 다른 3개
  프로젝트가 쓰는 다른 codebase(기본 `default`, `presetgallery`)의 함수를 실수로
  건드리지 않기 위함. 배포 시 반드시 `firebase deploy --only functions:lifegame --project soop-stock-market`
  처럼 codebase를 지정한다(`--only functions`로 전체 배포하면 다른 프로젝트 함수까지
  삭제 대상으로 잡힐 수 있음 — 이 생태계 다른 CLAUDE.md들과 동일한 경고).

## database.rules.json — 4개 레포 동기화 필수 (2026-08-14, 사용자 명시 요청)

- **이 파일은 StreamBet-Market, soop-stock-market, interior-3d-viewer, streamer-life-game
  4개 레포가 전부 바이트 단위로 동일한 사본을 갖고 있어야 한다.** 넷 다 결국 같은
  RTDB(`soop-stock-market-default-rtdb`)에 배포되는 하나의 규칙 파일이기 때문 — 그중
  아무 레포에서나 규칙을 재배포하면 그 레포의 로컬 파일 내용으로 실제 서버 규칙이
  통째로 덮어써진다.
- **이 파일을 수정할 때마다(어느 레포에서 작업하든) 반드시 나머지 3개 레포의
  `database.rules.json`에도 동일한 변경을 그대로 복사해서 커밋한다.** 하나만 고치고
  넘어가면, 나중에 다른 레포에서 무심코 규칙을 재배포했을 때 방금 추가한 변경이
  조용히 사라진다(실제로 2026-08-14에 이 문제로 배포가 한 번 막혔던 적 있음).
- 동기화는 통째로 `cp`해서 diff가 0줄인지 확인하는 방식이 제일 안전하다 — 부분
  수동 편집으로 각 레포 파일이 미묘하게 갈라지지 않게 할 것.
- 배포 전엔 항상 `firebase deploy --only database --project soop-stock-market --dry-run`으로
  문법부터 확인한다.

## 스트리머 이름 데이터 — 정적 파일, 수동 갱신 (2026-08-18, 사용자 지시)

- 스트리머 이름 검색(자동완성)과 지인 상세 기능(랜덤 이름 배정) 둘 다 `stocks` RTDB
  노드를 매번 직접 읽지 않고, `streamer-names.json`(루트 - 클라이언트용, `functions/
  streamer-names.json` - 서버용, 내용은 항상 동일해야 함)이라는 정적 파일을 쓴다.
  이유: `stocks`는 가격·거래량 등 이름 검색엔 안 쓰는 필드까지 포함해 훨씬 크고,
  접속자마다 각자 다운로드하는 구조라 앞으로 시청자도 같은 판에 동시 접속하는
  멀티플레이가 되면 그 인원수만큼 RTDB 다운로드 비용이 곱해진다.
- **갱신은 스케줄러 없이 수동이다 — 사용자가 필요할 때 지시하면 그때만
  `node scripts/update-streamer-names.js`를 실행한다.** 이 스크립트는 `firebase
  database:get /stocks`(내 로그인 세션 재사용, admin SDK 서비스 계정 불필요)로
  최신 `stocks`를 읽어 `{id,name}` 목록을 루트/`functions/` 양쪽에 동일하게 써준다.
  실행 후 반드시 두 파일을 커밋(및 배포 필요 시 `firebase deploy --only
  functions:lifegame:...`)해야 실제로 반영된다 — 로컬에 파일만 써지고 커밋 안 하면
  배포된 서버·호스팅엔 그대로 안 남는다.
- `functions/index.js`는 이 파일을 모듈 스코프에서 `require`로 한 번만 읽는다(콜드
  스타트마다 1회, TTL 캐시나 async 처리 불필요). `index.html`은 페이지 로드 시
  `fetch('./streamer-names.json')`로 받는다(GitHub Pages가 루트를 그대로 정적
  서빙하므로 별도 배포 절차 없이 커밋·푸시만 하면 반영됨).

## 게임 콘텐츠 — 아직 스켈레톤 단계

- `functions/game-data.js`에 생애 10구간 중 3구간(유아기·초등학생·스무살)만 채워져
  있다. 나머지 7구간(사춘기/고등학생/사회초년생/서른/중년/노년준비/황혼)은 같은
  형식(`STAGES` 배열에 `{id, name, ageRange, choices:[{id,text,deltas,result}]}` 추가)으로
  이어서 채우면 된다.
- 선택지 문장은 결과를 직접 알 수 없게 쓴다(안전/도전/우회 세 태도 중 하나에 가깝게,
  `deltas`·`result`는 선택 직후에만 공개) — `functions/index.js`의 `publicStage()`가
  이걸 서버 레벨에서 강제한다(안 고른 선택지의 deltas/result는 응답에 아예 안 실림).
- 대표 엔딩은 6개(`functions/game-data.js`의 `ENDINGS`) — 이후 12~16개로 늘릴 땐
  `ENDINGS` 배열에 항목만 추가하면 된다(`resolveEnding`은 최근접 아키타입 매칭이라
  로직 변경 불필요).
- 삽화(AI 사전 생성)는 아직 없음 — `assets/scenes/` 아래 `interior-3d-viewer`의
  `textures/backdrops/` 패턴처럼 정적 이미지로 채울 예정.

## 커밋·푸시 · 구현 후 검증

- 이 생태계 다른 프로젝트들과 동일한 지침을 따른다: 커밋 완료 시 별도 확인 없이
  바로 `git push`까지 진행. 코드 구현 후 배포·커밋 전에는 반드시 검증(문법 검사,
  실제 브라우저/Playwright로 흐름 끝까지 실행, RTDB 규칙은 `--dry-run` 우선).
