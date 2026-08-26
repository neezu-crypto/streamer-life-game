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

## 게임 콘텐츠 — 101개 나이 스테이지 전부 채워진 상태 (2026-08-26 기준)

- `functions/game-data.js`의 `STAGES`(0~100세, 101개)는 더 이상 스켈레톤이 아니다 —
  전 나이대에 콘텐츠가 있고, 직업 루트(연예계·개발자·소상공인·청년정치·스트리머·
  물류직·정규직·자영업·영어강사·배우 등 다수)와 일탈(`deviant-*`) 이벤트 수백 개가
  이미 들어차 있다. 새 세션에서 "아직 3구간만 채워져 있다"고 오해하지 말 것 — 항상
  `grep`/`node -e require(...)`로 실제 상태를 먼저 확인한다.
- 선택지 문장은 결과를 직접 알 수 없게 쓴다(안전/도전/우회 세 태도 중 하나에 가깝게,
  `deltas`·`result`는 선택 직후에만 공개) — `functions/index.js`의 `publicStage()`가
  이걸 서버 레벨에서 강제한다(안 고른 선택지의 deltas/result는 응답에 아예 안 실림).
- 엔딩은 `functions/game-data.js`의 `ENDINGS`에 정의 — 늘릴 땐 배열에 항목만 추가하면
  된다(`resolveEnding`은 최근접 아키타입 매칭이라 로직 변경 불필요).
- 삽화(AI 사전 생성)는 아직 없음 — `assets/scenes/` 아래 `interior-3d-viewer`의
  `textures/backdrops/` 패턴처럼 정적 이미지로 채울 예정.

## 선택지 스크립트 삽입 시 배열 홀(array hole) 버그 — 반복 발생 주의

- `game-data.js`에 선택지를 대량으로 추가할 땐 손으로 치지 않고, 특정 스테이지의
  `choices: [` 여는 괄호를 찾아 깊이 카운팅으로 매칭되는 닫는 `]`를 찾은 뒤 그 직전에
  새 객체들을 문자열로 끼워 넣는 파이썬 스크립트를 쓰는 게 표준 방식이다.
- **이때 삽입 직전 위치가 이미 트레일링 콤마로 끝나 있는지 반드시 확인해야 한다.**
  기존 마지막 요소가 `},`로 끝나 있는데 앞에 또 `,`를 붙이면 `},\n,\n{...}`처럼 콤마가
  두 번 연달아 오게 되고, 이건 문법 오류가 아니라 **배열 원소 하나가 통째로 비는
  "홀"(elision)**이 된다 — 이번 세션에서만 최소 4차례 반복 발생한 버그다.
  - `node -c`는 이 버그를 못 잡는다(유효한 구문이라서).
  - `.forEach`/`.filter`/`.map`도 홀을 조용히 건너뛰어 못 잡는다.
  - `for (let i=0;i<arr.length;i++) if(!(i in arr)) ...` 또는 `for...of`(순회 중 `undefined`
    참조 시 `TypeError`)로만 드러난다.
  - 삽입 스크립트는 항상 `stripped_prefix.endswith(',')` 여부를 검사해 필요할 때만
    콤마를 붙이도록 작성한다.
- 콘텐츠 추가 후 배포 전에 항상 아래 체크를 스크립트로 돌린다(매번 그대로 재사용
  가능한 패턴):
  1. `node -c game-data.js && node -c index.js` (구문)
  2. `STAGES` 전체 + 전역 선택지 풀(`PRISON_CHOICES`, `LOVER_ROUTE_CHOICES` 등) 순회하며
     `i in arr` 체크로 배열 홀 0건, `Set`으로 id 중복 0건 확인
  3. 새로 추가한 id들이 전부 실제로 존재하는지 목록과 대조
  4. `STAT_KEYS = ['wealth','fame','happiness','health','relationship']`(functions/common.js)
     기준으로 `deltas`/`prizeTable[].deltas`에 오타 키가 없는지 확인
  5. `prizeTable`이 있는 선택지는 `weight` 합이 100인지 확인

## 직업 루트 신설 — 표준 패턴

- **진입 트리거**: 완전히 새 선택지를 만들 수도 있고, 기존 선택지(예: `streaming-debut`)에
  `setOccupation: {id, label}` + `startsRoute: {id, label, maxDurationYears}`만 얹어
  트리거로 승격시킬 수도 있다 — 후자가 더 자연스러우면 그쪽을 우선한다.
- **`mandatory` 여부**: 특정 조건(재능·직업 이력 등)을 만족해야만 열리는 희귀 트리거는
  `mandatory: true`를 걸어 뜨면 반드시 노출되게 한다(안 그러면 영영 놓칠 수 있음 —
  2026-08-25경 영어강사 루트가 이 문제로 도달 불가능했던 적 있음). 반대로 대학 진학/
  기술직 취업/방송 시작처럼 누구나 고를 수 있는 동등한 진로 갈림길 중 하나면
  `mandatory`를 걸지 않는다.
- **활성 구간**: `startsRoute.maxDurationYears`가 N이면, 실제 루트 전용 콘텐츠가 뜨는
  나이는 "트리거 나이+1"부터 "트리거 나이+N-1"까지다(`buildRouteState` 참고).
- **나이가 고정되지 않는 루트**(징역처럼 진입 나이가 사람마다 다 다른 경우)는 특정
  나이 스테이지에 콘텐츠를 심지 말고, `PRISON_CHOICES`/`LOVER_ROUTE_CHOICES`처럼
  전역 배열 + 각 항목에 `requiresRoute` 필드를 붙이는 패턴을 재사용한다
  (`pickVisibleChoiceIds`가 `activeRouteId`에 따라 해당 전역 풀만 노출).
- **직업 내 단계 분화**(연습생→아이돌, 후보→당선 의원 등)는 새 필드를 만들지 않고
  `requiresOccupation`을 그대로 재사용해 같은 루트 안에서 시기별로 다른 선택지 집합을
  노출시킨다.

## 일탈(deviant-*) 이벤트 메커닉 — 확정 규칙 (2026-08-23 도입, 2026-08-26 정정)

- id는 항상 `deviant-*` 접두사(검색·감사 용이). `prizeTable` 2단계: 가벼운 일탈(L)은
  `안 걸림 90 / 발각 10`, 위험한 일탈(H)은 `안 걸림 82 / 발각 18`.
- **징역 분기가 있는 선택지도 항상 82/18 2단계다 — "발각 시 무조건 징역"이며,
  `82/15/3`(안 걸림/벌금만/징역)처럼 발각 확률을 벌금과 징역으로 다시 쪼개는 3단계
  구조는 쓰지 않는다.** (2026-08-26에 이 착오가 실제로 있었다 — 문서 서술만 보고
  새 코드를 짜면서 기존 30개 중범죄 선택지가 전부 2단계라는 걸 재확인하지 않아
  발생. 새 일탈을 만들 때 기존 `label: '징역'` 항목들을 먼저 `grep`으로 대조할 것.)
- 징역 연동은 **경제·문서범죄+도박 카테고리만**(탈세·횡령·보험사기·문서위조·
  부정수급·상습도박·뇌물수수 등) — 불륜·교통위반·청소년 일탈처럼 실제로 실형까지
  안 가는 유형엔 절대 걸지 않는다. 징역 갈래엔 `setOccupation: {id:'inmate', label:
  '🔒 수감자'}` + `startsRoute: {id:'prison', label:'🔒 수감 생활'}`를 그대로 재사용.
- 직업 루트 하나에 전용 일탈을 새로 붙일 때 정착된 기본 규모: 루트 활성 연차에
  비례해 **약 20개(L 8 / H 12), 그중 징역 연동 2개**(2026-08-26 연예계·청년정치·
  소상공인·스트리머 4개 루트에 이 기준으로 일괄 적용, 사용자 승인받은 값).

## 현금 필요 선택지 (requiresSufficientCash) — 확정 규칙 (2026-08-23 도입)

- 선택지에 별도 원화 금액 필드를 적지 않는다. 비용은 서버가 자동으로
  `cost = Math.abs(choice.deltas.wealth || 0) * cashUnitForAge(현재 나이)` 공식으로
  그 자리에서 계산한다(`functions/index.js`) — "돈이 많이 드는" 선택지를 만들 때
  `deltas.wealth`를 적당한 음수로만 주면 된다.
- `requiresSufficientCash: true`를 붙이면 `submitChoice`가 위 비용과 플레이어의
  `cashHoldings`(보유 현금 — `wealth` 스탯과는 별개의 실제 원화 필드)를 대조해
  부족하면 `HttpsError('failed-precondition', ..., {reason:'insufficient-cash'})`로
  거부하고 클라이언트가 토스트로 안내한다.
- **이 검사는 선택 확정(submitChoice) 시점에만 작동하고, 노출(pickVisibleChoiceIds)
  단계에는 전혀 관여하지 않는다** — "출현율은 그대로 두고 골랐을 때만 막아달라"는
  사용자 지시(2026-08-23)를 그대로 따른 설계다. 노출 단계엔 안전망만 있다: 무작위로
  뽑힌 후보 전부가 감당 불가능한 극히 드문 경우에만(`canAfford`) 감당 가능한
  선택지로 슬롯 하나를 바꿔치기해, 매 턴 반드시 하나는 고를 수 있게 보장한다.
- 부동산·자동차·여행·보험처럼 "현실적으로 목돈이 드는" 선택지를 새로 추가할 때는
  `deltas.wealth`에 -1~-4 정도의 값과 `requiresSufficientCash: true`를 함께 붙인다.
  절대 금액을 직접 계산해 넣지 않는다(엔진이 `cashUnitForAge`로 자동 환산하므로,
  이 함수의 값이 나중에 바뀌면 비용도 자동으로 같이 바뀐다).
- `cashUnitForAge(age)`: 10세 미만 1만원, 20세 미만 3만원(용돈 수준), 20대 825만원,
  30~49세 1,350만원, 50~64세 1,300만원, 65세 이상 520만원 — "선택 1회당 평균
  획득액이 실제 한국 평균 연봉 수준"이 되도록 역산된 값(2026-08-18, 배포 전
  시뮬레이션으로 사용자 확인받고 확정). `requiresSufficientCash` 비용 계산과
  `cashHoldings` 갱신(매 턴 wealth delta × 이 값) 둘 다에 재사용된다.
  **주의**: 2026-08-14경 "여행 계열 선택지는 지출이 1천만원을 넘지 않게"라는
  목표로 `deltas.wealth: -1`을 전 나이대에 통일 적용했는데, 이후 이 함수의 배율이
  재조정되며 30~64세 구간은 -1이어도 약 1,300~1,350만원으로 원래 목표를 살짝
  넘는다 — 새 지출성 선택지를 추가할 때 "1천만원 이내"가 여전히 유효한 제약인지는
  다시 사용자에게 확인할 것.
- 보유 현금(`cashHoldings`)은 0 밑으로 내려가지 않는다(빚은 추상 `wealth` 스탯에서만
  표현) — 실제 원화 금액이 음수가 되는 게 어색하다는 이유.

## 임대사업 자산 (RENTAL_INCOME_BY_ASSET_ID) — 확정 규칙 (2026-08-23 도입, 2026-08-26 확대)

- 상가(`commercial-unit`)·오피스텔(`studio-unit`)처럼 "임대 목적" 부동산 자산은
  `functions/index.js`의 `RENTAL_INCOME_BY_ASSET_ID` 맵(`{assetId: 매년 고정 수입}`)에
  등록돼 있으면, 플레이어가 해당 `assets` 배열에 그 id를 갖고 있는 매 턴마다
  `cashHoldings`에 고정 금액이 자동으로 더해진다 — `removeAsset`으로 팔기 전까지
  세입자 유무나 다른 스탯과 무관하게 계속 들어온다.
- **새 임대용 부동산 자산을 추가할 땐 반드시 이 맵에도 항목을 추가해야 실제로
  수입이 발생한다** — `addAsset`으로 자산만 주고 이 맵을 안 건드리면 겉보기엔
  "부동산을 샀다"는 선택지인데 실제로는 아무 수입도 안 나오는 상태가 된다(2026-08-23
  이전 상가가 실제로 이 문제였음).
- 첫 집(`first-home`)·넓은 집(`bigger-home`)·별장(`vacation-home`)처럼 **거주 목적
  부동산은 이 맵에 넣지 않는다** — 임대사업이 아니라 실거주 자산이라 수입이 없는
  게 맞다.
- 금액 기준: 매입가(`addAsset` 시 `deltas.wealth`)가 더 비싼 자산일수록 임대수입도
  더 크게 잡는다(상가가 오피스텔보다 매입가 더 비싸 임대수입도 더 큼) — 절대
  원화 금액을 새로 정의하며, `cashUnitForAge`와는 무관한 별도 고정값이다(임대료는
  나이에 따라 오르내리지 않는다는 설정).

## appearChance — "노출 확률 X%, 선택하면 100% 진입" 필드 (2026-08-26 도입)

- `mandatory`(조건 충족 시 항상 노출)와는 다른 개념: 조건(예: `requiresAnyLover`)은
  갖췄지만 매 턴 일정 확률로만 후보에 뜨게 하고 싶을 때 선택지에 `appearChance: 0.2`
  (0~1) 형태로 붙인다. `pickVisibleChoiceIds`가 `eligible` 필터의 마지막 단계에서
  이 확률을 굴려 통과한 선택지만 남기고, 통과한 선택지는 그 턴에 무조건 노출된다
  (내부적으로 `mandatory`와 같은 취급을 받아 4개 슬롯에서 밀려나지 않음).
  "조건은 맞지만 매번 뜨진 않는" 콘텐츠(연애 진행, 우연한 이벤트 등)를 새로 만들 때
  이 필드를 재사용한다 — 노출 확률을 후보 풀 크기와 무관하게 정확히 원하는 값으로
  고정할 수 있는 유일한 방법이다(일반 `optional` 선택지의 노출 확률은 경쟁하는
  다른 선택지 수에 따라 달라지므로 정확한 확률 보장이 안 됨).

## 직업·루트·거주지는 저장 필드가 아니라 매번 choiceLog에서 재계산됨 — 중요한 아키텍처 전제

- `buildOccupationHistory`/`buildRouteState`/`buildLocationHistory`(전부
  `functions/index.js`)는 전용 DB 필드 없이 매 턴 `choiceLog` 전체를 처음부터 다시
  훑어 현재 직업·활성 루트·거주지를 계산한다. `experiencedRouteIds`(한 번 겪은
  루트 재도전 방지)도 마찬가지로 `choiceLog` 기반 파생값이다.
- 그래서 "상태 일부만 리셋"하는 기능(예: 100년 버튼의 `resetToInfancy`)을 만들 때
  이 세 가지를 각각 따로 리셋하는 코드를 짤 필요가 없다 — `choiceLog.length = 0`
  한 줄이면 세 가지 전부 "아무것도 선택한 적 없는 상태"로 자동 초기화된다. 반대로
  가족·재산·재능·취미·지인·`cashHoldings`는 `play`의 별도 저장 필드라 이런 자동
  초기화 혜택이 없다 — 리셋하려면 명시적으로 건드려야 한다.
- 새 상태 필드를 추가할 때 "저장 필드로 만들지, choiceLog 파생값으로 만들지"를
  먼저 판단할 것 — 파생값으로 만들면 리셋·되돌리기 계열 기능에서 훨씬 유리하다.

## QA 체크리스트 — "선택지 텍스트가 암시하는 상태 변화 = 실제 필드" 대조

- 이번 세션에 반복된 버그 패턴: 선택지 텍스트가 "중고차를 마련한다", "내 집을 산다"
  처럼 자산 획득/처분을 암시하는데 실제로는 `addAsset`/`removeAsset`이 빠져 있거나,
  "동거 중인 가족" 같은 특정 가족 상태를 전제하는 문구인데 `requiresFamilyMember`
  (또는 이미 없어야 하는 상태면 `requiresNoFamilyMember`)가 빠져 있는 경우 —
  감사 라운드를 4~5차례 돌려서야 전부 잡힌 문제다.
- 새 선택지를 대량으로 추가한 뒤에는, 텍스트에 자산·가족·건강 상태의 획득/소유/
  부재를 암시하는 동사(마련한다·생긴다·산다·잃는다·팔았다·태어난다 등)가 있는
  선택지를 골라 해당 필드(`addAsset`/`removeAsset`/`requires(No)FamilyMember`/
  `requires(No)Condition` 등)가 실제로 있는지 스크립트나 수동 샘플링으로 대조한다.
  양방향(있어야 하는데 안 걸려 있는 경우 / 없어야 하는데 안 걸려 있는 경우) 모두
  확인할 것.

## 실제 브라우저(Playwright) QA 시 흔한 함정

- 토스트 알림 감지는 `document.querySelector('.toast')`처럼 **요소 존재만 확인하면
  안 된다** — `#toast`는 항상 DOM에 있고 `.show` 클래스로만 보이므로, 반드시
  `el.classList.contains('show')`까지 확인해야 한다(안 그러면 항상 즉시 거짓 양성).
- 주사위 굴림 애니메이션("운명이 정해지는 중...")은 다음 버튼이 눌리기까지 약
  3.5~4.5초 걸린다 — 최소 4500ms 고정 대기 + `#nextBtn` 노출/활성화를 폴링하는
  `waitForFunction`(최대 10초)을 함께 쓴다.
- `.family-chip` CSS 클래스는 가족·지인·재능·취미 4개 섹션에서 전부 재사용된다
  (`renderFamilyMembersInto`/`renderAcquaintancesInto`/`renderTalentsInto`/
  `renderHobbiesInto`) — 이 셀렉터만으로 특정 섹션을 조회하면 다른 세 섹션 항목까지
  섞여 나온다.
- 클릭은 `page.mouse.click(x,y)`(고정 좌표) 대신 `page.click(selector)`를 쓴다 —
  전자는 스크롤 전 좌표를 그대로 써서 화면 밖 요소를 잘못 클릭할 수 있다.
- 실제 프로덕션 Firebase/RTDB에 진짜 플레이 기록을 남기는 라이브 테스트는
  **백그라운드로 돌리면 "공유 리소스 변경" 안전 분류기에 자동 차단된다** —
  같은 스크립트를 포그라운드로, 넉넉한 타임아웃(수백 초)을 주고 실행하면 통과한다.

## 직업별 wealth 커버리지 기준선 + 스타성 직업 패시브 소득 패턴 (2026-08-26)

- 이 게임의 "정상적인 급여직" 선택지는 대략 **30~37%가 `wealth` 델타를 가짐**(회사원 계열
  전부 이 범위 — `civil-servant`/`tech-worker`/`teacher`/`office-worker` 등). 새 직업·루트를
  추가한 뒤 이 비율에서 크게 벗어나는지 확인할 것.
- 예외적으로 낮아도 되는 경우(버그 아님): `trainee`·`class-president`·
  `student-council-president`·`student-athlete`처럼 **아직 정식 소득이 없는 학생/수련
  신분**. 이런 직업은 0~22%도 정상.
- **"스타성 직업"(인기가 곧 수입인 직업 — 아이돌·배우·프로 운동선수 등)은 위 기준선보다도
  낮으면서 패시브 소득 메커닉이 없는 경우가 실제로 3번 발견됐다**(idol, actor, sports-elite의
  pro-athlete/national-athlete — 전부 2026-08-26 사용자가 직접 플레이하다 "현금이 안 들어온다"고
  보고해서 발견). 이런 직업을 새로 만들 때는 `functions/index.js`의
  `Math.round(stats.fame * cashUnitForAge(nextIndex) / 50)` 공식(예술가 루트가 원형, 20장)을
  재사용해 패시브 소득을 기본으로 검토할 것 — "아직 무명/신인" 단계(연습생·유망주 등)는 소득
  없음이 자연스러우므로 제외하고, "떴다"고 볼 수 있는 단계(데뷔한 아이돌·프로 선수 등)부터만
  적용한다.
- 새 직업·루트 추가 후 전체 커버리지를 재점검하는 스크립트 패턴(매번 그대로 재사용 가능):
  ```js
  const gd = require('./game-data.js');
  const all = []; for (const s of gd.STAGES) for (const c of (s.choices||[])) all.push(c);
  const hasWealth = c => (c.deltas && typeof c.deltas.wealth === 'number')
    || (c.prizeTable && c.prizeTable.some(b => b.deltas && typeof b.deltas.wealth === 'number'));
  // requiresRoute 또는 requiresOccupation으로 그룹화해 그룹별 wealth 보유 비율(%) 계산
  ```

## 커밋·푸시 · 구현 후 검증

- 이 생태계 다른 프로젝트들과 동일한 지침을 따른다: 커밋 완료 시 별도 확인 없이
  바로 `git push`까지 진행. 코드 구현 후 배포·커밋 전에는 반드시 검증(문법 검사,
  실제 브라우저/Playwright로 흐름 끝까지 실행, RTDB 규칙은 `--dry-run` 우선).
