const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');
const { STAT_KEYS, STAT_START, clampStat, requireAuth, isAdminUid } = require('./common');
const {
  STAGES,
  PRISON_CHOICES,
  LOVER_ROUTE_CHOICES,
  resolveEnding,
  buildCollapseEnding,
  buildBankruptcyEnding,
  buildObscurityEnding,
  buildDespairEnding,
  buildIsolationEnding
} = require('./game-data');
const { linkGoogleAccount } = require('./google');
const { linkKakaoAccount } = require('./kakao');

// 다섯 스탯 중 하나라도 0 이하로 떨어지면 그 즉시 삶이 끝난다(health만 있던
// 걸 전부로 확장). 한 선택에서 여러 스탯이 동시에 0을 찍을 수도 있어 순서를
// 고정해 둔다 - health(즉사)가 가장 결정적이라 최우선, 그다음은 원래
// STAT_KEYS 순서(wealth·fame·happiness·relationship 중 fame·happiness는
// STAT_KEYS 순서 그대로, health만 앞으로 뺀 것).
const INSTANT_ENDING_BUILDERS = [
  { stat: 'health', build: buildCollapseEnding },
  { stat: 'wealth', build: buildBankruptcyEnding },
  { stat: 'fame', build: buildObscurityEnding },
  { stat: 'happiness', build: buildDespairEnding },
  { stat: 'relationship', build: buildIsolationEnding }
];

initializeApp();

const MAX_NAME_LEN = 40;
const MAX_REPORT_REASON_LEN = 300;

// STAGES.id로 빠르게 찾기 위한 매핑 - choiceLog(stageId+choiceId만 담긴 압축 기록)를
// 엔딩 화면의 "지금까지 선택한 선택지" 목록으로 풀어낼 때 매번 STAGES.find를
// 반복하지 않기 위함.
const STAGE_BY_ID = new Map(STAGES.map((s) => [s.id, s]));

// choiceLog를 사람이 읽을 수 있는 형태로 풀어준다 - 이미 끝난 판이라 스포일러
// 우려가 없으므로(publicStage와 달리 아직 안 고른 선택지의 결과를 감출 필요가 없음)
// 실제 고른 선택지의 text를 그대로 내려도 된다. entry.stats(그 선택 직후의 다섯
// 스탯 스냅샷, 2026-08-18 추가 - "엔딩에서 인생 종합 점수를 선그래프로" 기능용)를
// 그대로 실어 보낸다 - 이 필드가 생기기 전에 저장된 오래된 choiceLog 항목은
// stats가 없을 수 있어 null로 채운다(클라이언트가 그 지점만 건너뛰고 그림).
// prizeTable(복권 등)처럼 결과가 무작위로 정해지는 선택지는 그 순간의 실제 결과가
// 반영된 stats를 그대로 저장해두는 게, choiceLog만 보고 나중에 다시 계산(replay)
// 하는 것보다 정확하다 - replay는 그 순간 어떤 등수가 뽑혔었는지 알 수 없다.
function buildChoiceHistory(choiceLog) {
  if (!Array.isArray(choiceLog)) return [];
  const history = [];
  for (const entry of choiceLog) {
    const stage = STAGE_BY_ID.get(entry.stageId);
    if (!stage) continue;
    // syntheticText(2026-08-22, guaranteeCure 안전망) - 합성 치료 선택지
    // (id 'treat:<conditionId>')는 game-data.js의 stage.choices에 없어
    // 아래 find로 못 찾으므로, choiceLog에 그때 보여준 문구를 그대로 저장해둔
    // syntheticText가 있으면 그걸 우선 쓴다.
    if (entry.syntheticText) {
      history.push({ stageId: stage.id, stageName: stage.name, ageRange: stage.ageRange, choiceText: entry.syntheticText, stats: entry.stats || null });
      continue;
    }
    const choice = findChoiceById(stage, entry.choiceId);
    if (!choice) continue;
    history.push({ stageId: stage.id, stageName: stage.name, ageRange: stage.ageRange, choiceText: choice.text, stats: entry.stats || null });
  }
  return history;
}

// choiceLog를 훑어 "직업이 바뀐" 선택(setOccupation이 붙은 것)만 시간순으로
// 뽑아낸다 - 건강 상세/가족 상세와 달리 직업은 저장 슬롯에 별도 필드를 두지
// 않는다. choiceLog 자체가 이미 "무엇을 골랐는지"의 정답표라, 직업 이력도
// 매번 여기서 다시 계산하면 충분하고 별도로 동기화해둘 상태가 없어 더 안전하다.
// 현재 직업은 이 배열의 마지막 항목(가장 최근에 바뀐 직업)이다.
function buildOccupationHistory(choiceLog) {
  if (!Array.isArray(choiceLog)) return [];
  const history = [];
  for (const entry of choiceLog) {
    const stage = STAGE_BY_ID.get(entry.stageId);
    const rawChoice = stage && findChoiceById(stage, entry.choiceId);
    if (!stage || !rawChoice) continue;
    const choice = resolveEffectiveChoiceForEntry(rawChoice, entry);
    if (!choice.setOccupation) continue;
    history.push({ id: choice.setOccupation.id, label: choice.setOccupation.label, stageId: stage.id, ageRange: stage.ageRange });
  }
  return history;
}

// 현재 장소(2026-08-18, 사용자 지시 - "[현재 장소] 기능도 추가해줘. 초기는
// 무조건 '국내'로 시작하고, 추후에 추가할 선택지에 따라 해외지역으로 여행,
// 이민, 노동가는 사건도 추가할거야") - buildOccupationHistory와 완전히 같은
// 패턴(setLocation이 붙은 선택만 시간순으로 뽑아 저장 슬롯에 별도 필드 없이
// choiceLog에서 매번 다시 계산). 딱 하나 다른 점은 기본값 유무 - 직업은
// "아직 없음"(null)이 정상 상태이지만 장소는 태어난 순간부터 항상 어딘가에는
// 있어야 하므로, 이 배열이 비어 있으면(해외 이동 선택을 한 번도 안 골랐으면)
// DEFAULT_LOCATION(국내)을 currentLocation으로 대신 쓴다 - 아래
// resolveCurrentLocation 참고. 아직 해외 이동 선택지는 없지만(추후 추가 예정),
// 게이팅용 requiresLocation 필드까지 미리 pickVisibleChoiceIds·applyChoice
// 검증에 넣어둬 나중에 그 선택지들을 추가할 때 이 파일을 다시 건드릴 필요가
// 없게 했다.
const DEFAULT_LOCATION = { id: 'domestic', label: '🇰🇷 국내' };
function buildLocationHistory(choiceLog) {
  if (!Array.isArray(choiceLog)) return [];
  const history = [];
  for (const entry of choiceLog) {
    const stage = STAGE_BY_ID.get(entry.stageId);
    const rawChoice = stage && findChoiceById(stage, entry.choiceId);
    if (!stage || !rawChoice) continue;
    const choice = resolveEffectiveChoiceForEntry(rawChoice, entry);
    if (!choice.setLocation) continue;
    history.push({ id: choice.setLocation.id, label: choice.setLocation.label, stageId: stage.id, ageRange: stage.ageRange });
  }
  return history;
}
function resolveCurrentLocation(locationHistory) {
  return locationHistory.length ? locationHistory[locationHistory.length - 1] : DEFAULT_LOCATION;
}

// 징역 루트(2026-08-23, 사용자 지시 - "일탈로 인해 발각됐을때 징역에 가는
// 루트도 있으면 재밌을것같은데") 전용 선택지 풀. 다른 루트(배우·축구 등)는
// 진입 나이가 고정이라 STAGES의 해당 나이 구간에 콘텐츠를 심어두면 됐지만,
// 징역은 100개 일탈 중 아무 "중범죄"에서나(25~87세 사이 어느 나이든) 걸릴 수
// 있고 복역 3~5년도 매번 달라 진입 나이 자체가 불특정하다. "나이에 상관없이
// 진입하면 3~5년간 징역 이벤트만 보여달라"(사용자 확정)를 만족하려면 특정
// 나이 구간에 콘텐츠를 심는 대신, activeRoute===prison일 때 stage.choices 대신
// 이 전역 풀(PRISON_CHOICES)에서 매번 4개를 새로 뽑도록 pickVisibleChoiceIds를
// 특별 취급한다(아래 참고). game-data.js STAGES 안에는 존재하지 않는
// choiceId라, treat:/farewell:pet 같은 합성 선택지와 동일하게 stage.choices에서
// 못 찾으면 이 배열에서 한 번 더 찾아야 한다(findChoiceById 참고) - choiceLog
// replay(buildOccupationHistory 등)·publicStage·submitChoice 전부 이 경로를 탄다.
function findChoiceById(stage, choiceId) {
  const real = stage && stage.choices.find((c) => c.id === choiceId);
  if (real) return real;
  return PRISON_CHOICES.find((c) => c.id === choiceId) || null;
}

// prizeTable이 붙은 선택지(복권·일탈 발각 등)는 매번 랜덤으로 갈래가 정해지는데,
// 그 갈래에 setOccupation/startsRoute 같은 구조적 효과(2026-08-23, 징역 갈래
// 전용)가 실려 있을 수 있다. choiceLog는 choiceId만 저장하므로 나중에 replay할
// 때 "그때 어느 갈래가 뽑혔는지"를 알아야 하는데, 이를 위해 applyChoice가 그
// 갈래의 label을 logEntry.prizeLabel로 같이 저장해둔다(아래 참고). 이 함수는
// choice와 entry(둘 다)를 받아 그 갈래의 필드를 base choice 위에 덮어써
// "이 순간 실제로 적용됐던 선택지"를 재구성한다 - prizeTable이 없거나
// prizeLabel이 없으면(기존 복권처럼 구조적 효과가 없는 갈래) 원래 choice
// 그대로다.
function resolveEffectiveChoiceForEntry(choice, entry) {
  if (choice.prizeTable && entry.prizeLabel) {
    const picked = choice.prizeTable.find((p) => p.label === entry.prizeLabel);
    if (picked) return Object.assign({}, choice, picked);
  }
  return choice;
}

// 직업엔 만료 개념이 없어(buildOccupationHistory는 마지막 setOccupation을 그대로
// 씀) 복역 기간이 끝나 prison 루트가 자동 만료돼도 직업은 'inmate'로 그대로
// 남는다. 그래서 occupationHistory의 마지막 값을 그대로 쓰는 대신 항상 이
// 함수를 거친다 - 마지막 직업이 inmate인데 지금 활성 루트가 prison이
// 아니면(=이미 출소했으면) 자동으로 ex-convict(출소자)로 바꿔치기한다. 특정
// 선택지가 아니라 엔진 차원의 자동 규칙(보험료 자동 납입·건강 조건 페널티와
// 같은 급)이라 game-data.js에 "출소" 선택지를 별도로 만들 필요가 없다.
const EX_CONVICT_OCCUPATION = { id: 'ex-convict', label: '🔓 출소자' };
function resolveEffectiveOccupation(occupationHistory, activeRoute) {
  const last = occupationHistory.length ? occupationHistory[occupationHistory.length - 1] : null;
  if (last && last.id === 'inmate' && (!activeRoute || activeRoute.id !== 'prison')) {
    return EX_CONVICT_OCCUPATION;
  }
  return last;
}

// STAGES 인덱스가 곧 나이라는 전제(pickNextStageIndex 참고)를 이용해 stage.id로
// 그 나이(=인덱스)를 바로 찾기 위한 맵 - 트리거 루트의 기간 만료 계산
// (buildRouteState)에 필요.
const STAGE_INDEX_BY_ID = new Map(STAGES.map((s, i) => [s.id, i]));

// 트리거 루트(14장, 2026-08-22 구현 - 사용자 설계) - 직업·장소와 완전히 같은
// 원칙으로 저장 슬롯에 전용 필드를 두지 않고 choiceLog에서 매번 다시 계산한다.
// choiceLog를 시간순으로 훑어 가장 최근 startsRoute 이후, 그 루트를 끝내는
// endsRoute:true 선택이 아직 한 번도 없었으면 "활성"으로 본다. 활성이어도
// (asOfStageIndex - 루트 시작 stageIndex) >= maxDurationYears면 기간 만료로
// 더 이상 활성이 아닌 것으로 취급(별도 종료 선택 없이 자동 종료). 재진입 방지를
// 위해 "이미 겪은 루트 id 목록"도 같이 반환한다 - choiceLog에 그 startsRoute.id가
// 단 한 번이라도 나타난 적 있으면 겪은 것으로 간주(끝까지 갔든 조기 종료했든).
//
// routeCompletedIds/routeEndAges(2026-08-22, "연예계 루트→배우 루트" 후속 루트
// 설계용 - 사용자 지시: "연예계 루트가 끝나고 3턴안에 배우 루트에 진입 가능한
// 트리거", 이어서 "연예계 루트를 끝까지 마친 경우에만"으로 확정) - 다음 루트로
// 이어지려면 "그 루트가 언제 끝났는지"와 "조기 포기가 아니라 끝까지 다 마쳤는지"를
// 구분해서 알아야 한다. endsRoute 선택으로 중도 포기한 경우엔 routeCompletedIds에
// 안 들어가고(끝까지 못 갔으므로), maxDurationYears를 다 채워 자동 만료된 경우만
// 들어간다. routeEndAges는 두 경우 모두(조기 포기든 자동 만료든) 그 루트가 끝난
// 나이를 기록한다 - 조기 포기면 그 선택을 고른 나이, 자동 만료면 시작 나이 +
// maxDurationYears. 진입 나이를 "끝까지 마친 경우"로 좁혀두면 자동 만료 나이가
// 항상 고정값(시작 나이+maxDurationYears)이라 다음 루트 콘텐츠를 몇 가지 정해진
// 나이 폭 안에서만 설계하면 된다(요청·구현 배경은 기획서.html 14장 참고).
function buildRouteState(choiceLog, asOfStageIndex) {
  if (!Array.isArray(choiceLog)) return { activeRoute: null, experiencedRouteIds: [], routeCompletedIds: [], routeEndAges: {} };
  const experiencedRouteIds = [];
  const routeCompletedIds = [];
  const routeEndAges = {};
  let activeRoute = null;
  for (const entry of choiceLog) {
    const stage = STAGE_BY_ID.get(entry.stageId);
    const rawChoice = stage && findChoiceById(stage, entry.choiceId);
    if (!stage || !rawChoice) continue;
    const choice = resolveEffectiveChoiceForEntry(rawChoice, entry);
    if (choice.startsRoute) {
      // 앞서 활성 루트가 있었는데 명시적 endsRoute 없이 새 루트가 시작됐다면
      // (이론상 basePool이 활성 루트 중엔 다른 startsRoute를 후보에서 빼므로
      // 실제로는 발생하지 않지만, 방어적으로) 그 사이에 자동 만료된 것으로 본다.
      if (activeRoute) {
        routeCompletedIds.push(activeRoute.id);
        routeEndAges[activeRoute.id] = activeRoute.startStageIndex + activeRoute.maxDurationYears;
      }
      experiencedRouteIds.push(choice.startsRoute.id);
      // routeDurationOverride(2026-08-23, 징역 루트 전용) - 다른 루트는
      // maxDurationYears가 game-data.js에 고정값으로 박혀 있지만, 징역은
      // "3~5년, 매번 무작위"(사용자 확정)라 고정값을 둘 수 없다. applyChoice가
      // 징역 갈래가 뽑힌 바로 그 순간 3~5 중 하나를 굴려 logEntry에 저장해둔
      // 값을 여기서 그대로 재사용한다 - 매번 다시 굴리면 재접속마다 복역
      // 기간이 바뀌는 모순이 생기므로 반드시 저장된 값을 써야 한다.
      activeRoute = {
        id: choice.startsRoute.id,
        label: choice.startsRoute.label,
        maxDurationYears: entry.routeDurationOverride || choice.startsRoute.maxDurationYears,
        startStageIndex: STAGE_INDEX_BY_ID.get(stage.id)
      };
    } else if (choice.endsRoute && activeRoute) {
      routeEndAges[activeRoute.id] = STAGE_INDEX_BY_ID.get(stage.id);
      activeRoute = null;
    }
  }
  if (activeRoute && (asOfStageIndex - activeRoute.startStageIndex) >= activeRoute.maxDurationYears) {
    routeCompletedIds.push(activeRoute.id);
    routeEndAges[activeRoute.id] = activeRoute.startStageIndex + activeRoute.maxDurationYears;
    activeRoute = null;
  }
  return { activeRoute, experiencedRouteIds, routeCompletedIds, routeEndAges };
}

// 계정당 저장 슬롯 1개 - lifeGame/playthroughs/{uid}가 push id 없이 그 유저의
// "그 한 판"을 직접 가리킨다(예전엔 .../{uid}/{playId}로 여러 판을 쌓을 수
// 있었지만, "창을 꺼도 이어할 수 있게" 요청에 맞춰 계정당 1개로 단순화했다 -
// 새로 시작하면 기존 진행 중이던 판을 덮어쓴다).
function playRefFor(db, uid) {
  return db.ref('lifeGame/playthroughs/' + uid);
}

// 해금 도감(16장, 2026-08-21 사용자 설계 - 2026-08-22 구현, 루트 칸은
// 2026-08-22 14장 ①번 루트 완료 후 추가) - 열람·저장 모두 로그인 유저
// 전용이다(익명 uid는 기기·브라우저 저장소에 묶여 다른 기기에서 진행도가
// 안 이어지므로, 도감처럼 여러 판에 걸쳐 계속 누적돼야 하는 기능은 로그인
// 요구로 근본적으로 해결). 그래서 이 계정이 실제로 구글·카카오·스트리머
// 인증 중 하나로 "보호"된 상태일 때만 기록한다 - googleLinked/kakaoLinked/
// streamerVerified(users/{uid})는 이미 이 생태계 다른 프로젝트가 쓰는 필드를
// 그대로 공유한다. lifeGame/playthroughs/{uid}는 계정당 슬롯이 1개라 새 판을
// 시작하면 덮어써지므로, 여러 판에 걸쳐 누적돼야 하는 도감은 별도 노드
// (lifeGame/collection/{uid}/endings|routes/{id})에 둔다.
async function recordCollectionEntryIfLoggedIn(db, uid, category, entryId) {
  const userSnap = await db.ref('users/' + uid).get();
  const user = userSnap.val() || {};
  const isLoggedIn = !!(user.googleLinked || user.kakaoLinked || user.streamerVerified);
  if (!isLoggedIn) return;
  await db.ref('lifeGame/collection/' + uid + '/' + category + '/' + entryId).set(true);
}

// 구간마다 최대 6~8개까지 채워둔 choices 중 실제로 그 회차에 "노출"할 4개를
// 무작위로 고른다(2026-08-23, 원래 3개 - "일탈" 100개 추가로 선택지 총량이
// 크게 늘면서 기존 위험 선택지들의 노출 빈도가 희석돼 즉사 비율이 15%대→
// 10.6%로 떨어지는 걸 시뮬레이션으로 확인, 사용자 지시로 4개로 늘려 원래
// 범위로 복원 - 아래 회귀 시뮬레이션 결과 참고). 매번 같은 4개만 뜨면 재미가
// 없고, 그렇다고 다 보여주면 화면이 복잡해지니 매 판마다 다른 4개가 뜨게
// 한다. requiresCondition이 붙은
// 선택지(부상·질병 회복용)는 activeConditionIds에 그 조건이 없으면 애초에
// 후보에서 빠진다 - 부러진 적 없는 팔이 "다 나았다"고 나오는 일이 없도록.
// requiresFamilyMember(배열, 그 중 하나라도 있어야 후보)/requiresNoFamilyMember
// (배열, 그 중 하나라도 있으면 후보에서 빠짐)도 같은 방식 - 배우자 없는데
// "이혼한다"가 뜨거나, 이미 결혼했는데 "결혼한다"가 다시 뜨는 일이 없도록.
// requiresNoCondition(배열, 그 중 하나라도 활성 상태면 후보에서 빠짐)은
// requiresNoFamilyMember와 정확히 같은 원리를 건강 상세에 적용한 것 -
// 발목 부상(ankle-sprain) 중인데 체육대회에서 반 대표로 뛰는 선택지가 뜨는
// 일이 없도록(2026-08-17, 사용자 지시).
// requiresOccupation(배열, 지금 직업이 그 중 하나여야 후보)도 마찬가지 -
// 은퇴한 적 없는데 "재취업한다"가 뜨는 일이 없도록. 직업은 가족과 달리
// 동시에 하나뿐이라 currentOccupationId는 문자열(or null) 하나다.
// requiresAnyOccupation(불리언, 특정 직업이 아니라 "아무 직업이나 있어야"
// 후보)는 동료·팀원·회식처럼 특정 직업명과 무관하게 "직장인이기만 하면"
// 자연스러운 선택지용 - requiresOccupation처럼 매번 모든 직업 id를 나열할
// 필요가 없다(2026-08-16, 아무 직업도 없는 플레이어에게 "팀원의 성장을
// 지켜본다" 같은 선택지가 뜨던 버그 수정).
// requiresIntro(문자열, 그 구간에서 이번에 뽑힌 상황 설명 id와 정확히 같아야
// 후보)는 상황 설명(intro)이 여러 개인 구간에서 "이 상황일 때만 자연스러운
// 선택지"를 만들기 위한 것 - 지정 안 하면(대부분) 어떤 상황이 뽑히든 항상
// 공용 후보로 들어간다. currentIntroId는 그 구간에 상황 설명이 하나뿐이면
// null(=intros 없는 구간에선 애초에 어떤 선택지도 requiresIntro를 못 건다).
// requiresAsset(문자열, 그 재산을 지금 갖고 있어야 후보)은 requiresCondition을
// 재산 상세에 그대로 적용한 것 - 복권을 산 사람에게만 "당첨 확인" 선택지가
// 뜨게 하기 위함(2026-08-17, 사용자 지시).
// requiresNoAsset(문자열, 그 재산이 없어야 후보 - 2026-08-22, 18장 보험)은
// requiresNoFamilyMember를 재산 상세에 그대로 적용한 것 - 이미 보험에 가입한
// 사람에게 가입 선택지가 다시 뜨지 않게 하기 위함.
// requiresAssetType(문자열, 그 타입(realestate/movable/cash/insurance)의 재산을
// 하나라도 갖고 있어야 후보 - 2026-08-23, 사용자 제보로 발견된 재산 게이팅
// 감사) - requiresAsset은 정확히 하나의 id만 검사할 수 있는데, "집을 세놓는다"
// 처럼 부동산 자산 중 아무거나(내 집·오피스텔·상가·넓은 집·별장 등 5종) 하나만
// 있어도 자연스러운 선택지엔 특정 id 하나로 못 좁힌다 - requiresAnyOccupation과
// 같은 "아무 값이나 있으면" 결을 재산의 type 축에 적용한 것.
// requiresLocation(배열, 지금 있는 장소가 그 중 하나여야 후보)은 requiresOccupation과
// 같은 결 - 장소는 직업과 달리 항상 값이 있어서(기본 DEFAULT_LOCATION='국내')
// requiresAnyOccupation 같은 "아무 값이나 있으면" 변형은 필요 없다. 아직 이
// 필드를 쓰는 선택지는 없지만(추후 해외 여행·이민·노동 콘텐츠 추가 예정,
// 2026-08-18 사용자 지시) 게이팅 로직만 미리 마련해둔다.
// requiresAnyAcquaintance(불리언, 지인이 하나라도 있어야 후보)는
// requiresAnyOccupation과 같은 결을 지인 상세에 적용한 것 - "지인이 있을 때
// 배신 당하는" 선택지들(2026-08-18, 사용자 지시)처럼 배신할 대상 자체가
// 없으면 애초에 후보에 들어가면 안 되는 경우용.
// requiresTalent/requiresAnyTalent, requiresHobby/requiresAnyHobby(2026-08-21,
// 사용자 설계 - 17장 "나의 재능·나의 취미")는 재산·지인과 완전히 같은 결을
// 재능·취미 상세에 적용한 것. 값 구조는 지인처럼 여러 개를 동시에 누적 보유하되
// (activeTalentIds/activeHobbyIds가 배열), 획득 시점은 직업처럼 특정 선택지를
// 고르는 순간이다(addTalent/addHobby, applyChoice 참고).
// 후보가 4개 이하면 그냥 전부 노출한다. mandatory가 붙은 선택지(자격만
// 되면 반드시 겪어야 하는 이벤트 - 예: 50대에 부모님과 사별)는 4개 무작위
// 추첨에서 밀려날 일 없이 항상 노출 목록에 들어가고, 나머지 자리만 무작위로
// 채운다.
// guaranteeCure(불리언, 2026-08-22 - 4장 1년단위 진행 되돌리기 후속 조치)는
// "건강 조건이 있는 상태로 3턴째"일 때 true가 된다(계산은 applyChoice의
// sickStreak 참고) - 이 경우 그 조건을 치료하는 선택지(removeCondition이
// 지금 조건 중 하나와 일치하거나, removeAllConditions가 붙은 건강검진류)가
// 후보 중에 있으면 mandatory와 똑같이 4개 추첨에서 밀려나지 않고 강제로
// 노출된다. 도입 배경: 1년단위 진행으로 평균 선택 횟수가 38회→101회로
// 늘면서, 무작위 플레이로는 치료 선택지를 자주 못 골라 조건이 계속 쌓이고
// 조건이 쌓일수록 건강 회복이 더뎌지는(활성 조건 개수 페널티) 악순환으로
// 즉사 엔딩 비율이 시뮬레이션 기준 1.44%→48.8%까지 치솟는 문제가 있었다 -
// 이 강제 노출로 무작위 플레이에서도 최소 3턴에 한 번은 회복 기회가
// 보장된다.
// activeRouteId/experiencedRouteIds(2026-08-22, 14장 트리거 루트 - 사용자
// 설계) - 지금까지의 requires*와 성격이 다르다: 다른 필드들은 전부 "AND로
// 후보를 좁히기만" 했는데, 루트는 그 나이 선택지 풀 전체를 통째로 대체한다.
// activeRouteId가 있으면 requiresRoute가 그 루트와 일치하는 선택지만이
// 유일한 후보 풀이 되고(다른 모든 선택지 - mandatory 포함 - 는 예외 없이
// 안 뜬다), 그 안에서만 기존 requires* 게이팅이 추가로 적용된다. 없으면
// requiresRoute가 붙은 선택지 전부와, 이미 겪은 적 있는 루트로 진입시키는
// startsRoute 선택지(재진입 방지)가 후보에서 빠진다.
//
// 위치 인자가 12개까지 늘어나 순서를 헷갈리기 쉬워진 시점이라(17장 코드
// 주석에서 이미 예고했던 리팩터링), 이번에 옵션 객체(ctx) 하나로 바꿨다 -
// 호출부는 필드명으로 값을 넘기므로 순서 실수로 값이 뒤바뀔 위험이 없어진다.
function pickVisibleChoiceIds(choices, ctx) {
  ctx = ctx || {};
  const conditionIds = ctx.conditionIds || [];
  const familyIds = ctx.familyIds || [];
  const currentOccupationId = ctx.occupationId || null;
  // requiresEverOccupation(2026-08-23, 사용자 지시 - "루트 본문 이후 리더쉽
  // 관련 추가 루트 만들어줘. 대학 학생회장을 한적있을때 진입가능") - 기존
  // requiresOccupation은 "지금" 직업만 보는데, 이건 "과거에 한 번이라도"
  // 그 직업을 가졌는지가 기준이라 다르다(지금은 다른 직업이어도, 심지어
  // 은퇴했어도 통과). occupationHistory 전체를 훑어야 하므로 ctx로
  // everOccupationIds(과거 직업 id 배열, 중복 가능)를 따로 받는다.
  const everOccupationIds = ctx.everOccupationIds || [];
  const currentIntroId = ctx.introId || null;
  const assetIds = ctx.assetIds || [];
  const assetTypes = ctx.assetTypes || [];
  const locationId = ctx.locationId || DEFAULT_LOCATION.id;
  const hasAnyAcquaintance = !!(ctx.acquaintances && ctx.acquaintances.length);
  // requiresAnyLover(2026-08-23, 사용자 지시 - "연인-결혼-결혼생활-육아가
  // 연결되는 이벤트") - requiresAnyAcquaintance는 관계 종류를 안 가리는데(친구·
  // 동료·짝사랑도 다 통과), "연애 중" 전용 콘텐츠(데이트·다툼·프로포즈 고민 등)는
  // 지인 관계가 정확히 lover여야 한다. requiresAnyOccupation과 같은 결.
  const hasAnyLover = !!(ctx.acquaintances && ctx.acquaintances.some((a) => a.relation === 'lover'));
  const talentIds = ctx.talentIds || [];
  const hobbyIds = ctx.hobbyIds || [];
  const guaranteeCure = !!ctx.guaranteeCure;
  const activeRouteId = ctx.activeRouteId || null;
  const experiencedRouteIds = ctx.experiencedRouteIds || [];
  const routeCompletedIds = ctx.routeCompletedIds || [];
  const routeEndAges = ctx.routeEndAges || {};
  const currentAge = ctx.currentAge;

  // 징역 루트(2026-08-23)는 진입 나이가 불특정해 그 나이 stage.choices 안에
  // 콘텐츠를 심어둘 수 없다 - activeRouteId가 'prison'이면 그 나이가 몇 살이든
  // PRISON_CHOICES(전역 풀)에서만 뽑는다. 연애(romance) 루트(2026-08-26)도
  // 같은 이유(18~60세 아무 때나 진입 가능)로 LOVER_ROUTE_CHOICES 전역 풀을
  // 쓴다. 다른 루트는 기존과 완전히 동일하게 그 나이의 choices 배열 안에서만
  // 찾는다.
  const routeChoicePool = activeRouteId === 'prison'
    ? PRISON_CHOICES
    : activeRouteId === 'romance'
      ? LOVER_ROUTE_CHOICES
      : choices;
  const basePool = activeRouteId
    ? routeChoicePool.filter((c) => c.requiresRoute === activeRouteId)
    : choices.filter((c) => !c.requiresRoute && !(c.startsRoute && experiencedRouteIds.includes(c.startsRoute.id)));

  const eligible = basePool.filter((c) => {
    if (c.requiresCondition && !conditionIds.includes(c.requiresCondition)) return false;
    if (c.requiresNoCondition && c.requiresNoCondition.some((id) => conditionIds.includes(id))) return false;
    if (c.requiresAnyCondition && !conditionIds.length) return false;
    if (c.requiresFamilyMember && !c.requiresFamilyMember.some((id) => familyIds.includes(id))) return false;
    if (c.requiresNoFamilyMember && c.requiresNoFamilyMember.some((id) => familyIds.includes(id))) return false;
    if (c.requiresAllFamilyMemberGroups && !c.requiresAllFamilyMemberGroups.every((group) => group.some((id) => familyIds.includes(id)))) return false;
    if (c.requiresOccupation && !c.requiresOccupation.includes(currentOccupationId || null)) return false;
    if (c.requiresAnyOccupation && !currentOccupationId) return false;
    if (c.requiresEverOccupation && !c.requiresEverOccupation.some((id) => everOccupationIds.includes(id))) return false;
    if (c.requiresIntro && c.requiresIntro !== currentIntroId) return false;
    if (c.requiresAsset && !assetIds.includes(c.requiresAsset)) return false;
    if (c.requiresNoAsset && assetIds.includes(c.requiresNoAsset)) return false;
    if (c.requiresAssetType && !assetTypes.includes(c.requiresAssetType)) return false;
    if (c.requiresLocation && !c.requiresLocation.includes(locationId)) return false;
    if (c.requiresAnyAcquaintance && !hasAnyAcquaintance) return false;
    if (c.requiresAnyLover && !hasAnyLover) return false;
    if (c.requiresTalent && !talentIds.includes(c.requiresTalent)) return false;
    if (c.requiresAnyTalent && !talentIds.length) return false;
    if (c.requiresHobby && !hobbyIds.includes(c.requiresHobby)) return false;
    if (c.requiresAnyHobby && !hobbyIds.length) return false;
    // requiresRouteCompletedWithin({routeId, maxYears}, 2026-08-22 - "연예계
    // 루트→배우 루트" 후속 루트) - 그 routeId가 "끝까지 다 마친" 적이 있고
    // (routeCompletedIds - 조기 포기는 해당 안 됨), 그 종료 나이로부터 1~
    // maxYears년 이내(0년째=종료된 바로 그 나이는 아직 "그 후"가 아니므로 제외)
    // 일 때만 후보에 든다.
    if (c.requiresRouteCompletedWithin) {
      const { routeId, maxYears } = c.requiresRouteCompletedWithin;
      if (!routeCompletedIds.includes(routeId)) return false;
      const endAge = routeEndAges[routeId];
      const yearsSince = currentAge - endAge;
      if (endAge === undefined || yearsSince < 1 || yearsSince > maxYears) return false;
    }
    // appearChance(0~1, 2026-08-26, 연애 루트 - "연인이 있으면 선택지의 노출
    // 확률이 20%, 선택하면 100% 진입") - 다른 requires*는 정적 조건이라
    // "자격이 되면 후보 풀에 얼마나 자주 뽑히느냐"는 eligible 크기에 좌우되는데,
    // 이 필드는 "자격이 돼도 이번 턴엔 아예 등장 안 할 확률"을 선택지 자체에
    // 박아 넣는다. 여기서 실패하면 이번 턴 eligible에서 완전히 빠지고(다음
    // 해에 다시 시도), 통과하면 아래에서 mandatory 취급돼 반드시 노출된다 -
    // "노출되면 100% 진입"은 이 선택지 자체가 prizeTable 없이 곧장
    // startsRoute를 갖기 때문에 자동으로 만족된다.
    if (typeof c.appearChance === 'number' && Math.random() >= c.appearChance) return false;
    return true;
  });
  let resultIds;
  if (eligible.length <= 4) {
    resultIds = eligible.map((c) => c.id);
  } else {
    const mandatory = eligible.filter((c) => c.mandatory || typeof c.appearChance === 'number');
    let optional = eligible.filter((c) => !c.mandatory && typeof c.appearChance !== 'number');

    if (guaranteeCure && conditionIds.length) {
      const curative = optional.filter((c) => (c.removeCondition && conditionIds.includes(c.removeCondition)) || c.removeAllConditions);
      if (curative.length) {
        const forced = curative[Math.floor(Math.random() * curative.length)];
        mandatory.push(forced);
        optional = optional.filter((c) => c.id !== forced.id);
      }
    }

    const shuffled = optional.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const remainingSlots = Math.max(0, 4 - mandatory.length);
    resultIds = mandatory.concat(shuffled.slice(0, remainingSlots)).map((c) => c.id);
  }

  // requiresSufficientCash 안전망(2026-08-23) - "출현율은 그대로"라는 요청대로
  // requiresSufficientCash는 위 eligible 필터링에 전혀 관여하지 않는다. 그
  // 결과 극히 드물게(시뮬레이션 기준 0.36%, 2026-08-23 노출 개수 4개 변경 후
  // 재검증 결과도 아래 참고) 무작위로 뽑힌 4개가 전부 requiresSufficientCash이면서
  // 넷 다 지금 현금으로 감당이 안 되면, 그 턴에 고를 수 있는 선택지가 하나도
  // 없어 진행이 완전히 막히는 문제가 생긴다.
  // 이 극단적 경우에만(4개 전부 감당 불가능할 때만) 마지막 자리 하나를 감당
  // 가능한 다른 후보로 바꿔치기해 최소 하나는 항상 고를 수 있게 한다 -
  // 나머지 절대다수(99.6%+)의 턴은 전혀 손대지 않으므로 노출 확률 자체는
  // 사실상 그대로 유지된다(guaranteeCure와 같은 급의 안전망).
  const cashHoldings = ctx.cashHoldings || 0;
  const costOf = (c) => Math.abs((c.deltas && c.deltas.wealth) || 0) * cashUnitForAge(currentAge);
  const canAfford = (c) => !c.requiresSufficientCash || cashHoldings >= costOf(c);
  if (resultIds.length && resultIds.every((id) => {
    const c = routeChoicePool.find((x) => x.id === id);
    return c && !canAfford(c);
  })) {
    const alternative = eligible.find((c) => !resultIds.includes(c.id) && canAfford(c));
    if (alternative) resultIds = resultIds.slice(0, -1).concat(alternative.id);
  }
  return resultIds;
}

// 나이 스킵을 없애고 1년 단위 진행으로 되돌린다(2026-08-22, 4장 - 사용자
// 확정). 예전엔 5~99세 구간에서 선택 한 번에 1~5세를 무작위로 건너뛰어
// (평균 선택 횟수 약 38회) 101개 나이를 다 방문하지 않았는데, 되돌리기 전
// 2만 회 시뮬레이션으로 확인한 결과 즉사 엔딩 비율이 0.02%→1.44%(72배)로
// 오르고 평균 최종 행복이 80.6→96.0으로 치우치는 걸 확인했다 - 선택지를
// 더 많이 겪을수록 긍정 delta가 더 많이 설계된 기존 콘텐츠의 편향이
// 누적되기 때문. 이 편향을 상쇄하기 위해 나이당 불행한 사건 1개씩(총
// 101개, game-data.js의 unhappy-0~unhappy-100)을 추가해뒀다 - 되돌린 뒤
// 시뮬레이션 기준 평균 최종 행복 95.8→78.0, 즉사 비율은 4.19%로 완만하게만
// 상승. 예전엔 MANDATORY_WAYPOINTS(100세 외에 반드시 방문하는 나이, 54세
// 부모님 사별)로 건너뛰는 폭을 잘라내는 메커니즘이 있었지만, 이제 모든
// 나이를 어차피 다 지나가므로 그 배열·계산은 더 이상 필요 없어 제거했다 -
// 54세 사별 선택지 자체는 여전히 mandatory: true(pickVisibleChoiceIds가
// 4개 무작위 추첨에서 절대 밀어내지 않음)로 보장된다.
function pickNextStageIndex(currentIndex) {
  return currentIndex + 1;
}

// 단어 끝 글자에 받침이 있는지에 따라 을/를을 고른다(2026-08-22, 합성 치료
// 선택지 문구용) - 한글 완성형 유니코드 범위(가~힣)에서 (코드 - 0xAC00) % 28이
// 0이면 받침 없음(를), 아니면 받침 있음(을). 한글이 아닌 문자로 끝나면(이모지 등)
// 안전하게 받침 있는 쪽(을)을 기본값으로 쓴다.
function pickBatchimJosa(word, withBatchim, withoutBatchim) {
  const ch = (word || '').trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return withBatchim;
  return code % 28 === 0 ? withoutBatchim : withBatchim;
}

// 합성 치료 선택지(2026-08-22, 4장 1년단위 진행 되돌리기 후속 - 사용자 지시:
// "건강검진처럼 전체 치료 말고 하나의 건강이상을 직접 언급하고 치료"). 아래
// ensureGuaranteedCure()가, 건강 조건이 있는 채로 3턴째인데 그 나이의 실제
// 콘텐츠(game-data.js) 중엔 치료 선택지가 하나도 없을 때만 안전망으로 쓴다 -
// 나이·조건에 안 매인 범용 선택지라 game-data.js에 저장돼 있지 않고 매번
// 이 함수로 즉석에서 만든다. id는 'treat:' + 조건 id로 고정 패턴이라, 나중에
// submitChoice·publicStage가 stage.choices에서 못 찾으면 이 패턴으로 되짚어
// 같은 선택지를 다시 만들어낼 수 있다(healthConditions만 있으면 재구성
// 가능하므로 별도 저장 불필요). 영구 조건(rare-illness 등)은 애초에 이 함수를
// 호출하는 쪽에서 걸러진다(healthConditions.filter(c => !c.permanent)).
// hasInsurance(2026-08-22, 사용자 지시 - "강제 치료 선택지 선택했을때 보험
// 여부에 따라 현금 지출 일부 발생") - 18장 보험의 "회복 가능한 질병·부상 완전
// 회피" 규칙(addCondition이 있는 선택지 전용)과는 별개다. 이 합성 선택지는
// addCondition이 아니라 removeCondition(이미 있는 조건을 치료)이라 그 규칙
// 대상이 아니므로, 여기서 직접 보험 유무에 따른 치료비 차등을 둔다 - 보험
// 있으면 일부만(-1), 없으면 전액(-2) 부담. 텍스트(선택 전 노출)는 보험 여부와
// 무관하게 동일하게 유지하고("치료 여부"만 알 수 있어야 함), 실제 비용·결과
// 문구(선택 후에만 공개)만 갈린다.
function buildSyntheticTreatmentChoice(condition, hasInsurance) {
  const wealthCost = hasInsurance ? -1 : -2;
  if (condition.mental) {
    const josa = pickBatchimJosa(condition.label, '을', '를');
    return {
      id: 'treat:' + condition.id,
      text: condition.label + josa + ' 더는 미루지 않고 전문가와 상담을 받는다',
      deltas: { happiness: 4, wealth: wealthCost },
      result: hasInsurance
        ? '보험 덕분에 상담비 부담을 던 채로, 마음이 한결 편안해졌다.'
        : '마음먹고 나선 상담이 큰 위안이 됐지만, 상담비는 전부 직접 부담해야 했다.',
      removeCondition: condition.id
    };
  }
  const josa = pickBatchimJosa(condition.label, '을', '를');
  return {
    id: 'treat:' + condition.id,
    text: condition.label + josa + ' 더는 미루지 않고 병원에서 제대로 치료받는다',
    deltas: { health: 4, wealth: wealthCost },
    result: hasInsurance
      ? '보험 덕분에 치료비 부담을 던 채로, 몸이 한결 가벼워졌다.'
      : '진작 왔어야 했다는 생각이 들 만큼 몸은 가벼워졌지만, 치료비는 전액 그대로 나갔다.',
    removeCondition: condition.id
  };
}

// 'treat:<conditionId>' 형태의 합성 선택지 id를, 지금 healthConditions에서
// 그 조건을 찾아 다시 만들어낸다 - 그 조건이 이미 나아서 사라졌거나 애초에
// 없으면(저장 슬롯이 오래된 경우 등) null을 반환해 호출부가 "유효하지 않은
// 선택지"로 방어적으로 처리하게 한다. hasInsurance는 실제 치료비 차등에만
// 쓰이므로(위 buildSyntheticTreatmentChoice 참고), 선택지 미리보기용으로만
// 쓰는 publicStage 호출부는 굳이 안 넘겨도 무방하다(기본값 false - 텍스트에는
// 영향 없음).
function resolveSyntheticChoice(id, healthConditions, hasInsurance) {
  if (id === 'farewell:pet') return buildSyntheticPetFarewellChoice();
  if (!id.startsWith('treat:')) return null;
  const conditionId = id.slice('treat:'.length);
  const condition = (healthConditions || []).find((c) => c.id === conditionId);
  if (!condition) return null;
  return buildSyntheticTreatmentChoice(condition, !!hasInsurance);
}

// 반려동물 수명(2026-08-22, 사용자 지시 - "반려동물 수명을 추천해주고 해당기간이
// 지나면 반려동물을 떠나보내는 선택지가 뜨게 해줘"). 실제 반려견·반려묘 평균
// 수명(대략 12~15년)을 참고해 15년으로 추천 - 31세에 입양하는 pet-family-instead
// 기준 46세에 이별을 맞는 정도라, 너무 이르지도(입양 직후 상실감) 너무
// 늦지도(100세까지 안 겪음) 않은 지점.
const PET_LIFESPAN_YEARS = 15;

// 부모님 사별(54세 mandatory)과 달리 pet은 입양 나이가 매번 다르므로(현재는
// pet-family-instead 하나뿐이지만 나중에 다른 나이의 입양 선택지가 늘어도 이
// 함수는 그대로 재사용된다) game-data.js에 고정 나이로 심어둘 수 없다 -
// treat:(guaranteeCure 안전망)과 완전히 같은 합성 선택지 패턴으로, familyMembers에
// 남아 있는 pet 항목의 sinceStageId(=입양 나이)만으로 그때그때 다시 만들어낸다.
function buildSyntheticPetFarewellChoice() {
  return {
    id: 'farewell:pet',
    text: '나이 든 반려동물을 떠나보낸다',
    deltas: { happiness: -4 },
    resultOptions: [
      '오랫동안 곁을 지켜준 반려동물이 편안히 눈을 감았다. 빈자리가 유독 크게 느껴졌다.',
      '나이 든 반려동물이 잠든 듯 조용히 떠났다. 슬픔 속에서도, 함께한 시간만큼은 후회가 없었다.',
      '갑작스레 몸이 나빠지더니, 며칠을 넘기지 못하고 세상을 떠났다. 마음의 준비가 안 된 이별이었다.'
    ],
    removeFamilyMembers: ['pet']
  };
}

// 이번 선택으로 방금 막 pet을 들였다면(addFamilyMembers에 pet 포함) 그 순간의
// sinceStageId가 아직 이번 선택 이전 familyMembers 스냅샷엔 없으므로, 항상 "이번
// 선택 이후" 갱신된 familyMembers를 기준으로 호출해야 한다(ensurePetFarewell
// 호출부 참고 - applyChoice가 이미 갱신한 familyMembers를 넘긴다).
function ensurePetFarewell(stageChoices, ids, familyMembers, currentAge, activeRoute) {
  // 14장 트리거 루트 - "완전 배타적, 예외 없음"(사용자 확정)을 guaranteeCure와
  // 똑같이 따른다. 루트 진행 중엔 반려동물 이별도 뒤로 미뤄뒀다가, 루트가
  // 끝난 뒤 조건을 다시 검사해 그제서야 노출한다.
  if (activeRoute) return ids;
  const pet = (familyMembers || []).find((f) => f.id === 'pet');
  if (!pet) return ids;
  const adoptedAge = STAGE_INDEX_BY_ID.get(pet.sinceStageId);
  if (adoptedAge === undefined || currentAge - adoptedAge < PET_LIFESPAN_YEARS) return ids;
  if (ids.includes('farewell:pet')) return ids;
  // guaranteeCure가 같은 턴에 이미 'treat:'을 심어둔 자리는 밀어내지 않는다
  // (반대 방향 보호는 ensureGuaranteedCure 쪽에 'farewell:'로 걸어둠) - 두
  // 안전망이 같은 나이에 겹치면 그중 하나만 이번 턴에 반영되고, 나머지는
  // 다음 턴에 다시 시도된다(부모님 사별과 겹칠 때와 같은 원리).
  const mandatoryIds = new Set(stageChoices.filter((c) => c.mandatory).map((c) => c.id));
  let replaceIdx = -1;
  for (let i = ids.length - 1; i >= 0; i--) {
    if (!mandatoryIds.has(ids[i]) && !String(ids[i]).startsWith('treat:')) { replaceIdx = i; break; }
  }
  if (replaceIdx === -1) return ids;
  const newIds = ids.slice();
  newIds[replaceIdx] = 'farewell:pet';
  return newIds;
}

// guaranteeCure가 필요했는데 pickVisibleChoiceIds가 그 나이의 실제 콘텐츠
// 중에서 치료 선택지를 못 찾았을 때(그 나이엔 애초에 치료 선택지가 없는
// 경우가 대부분 - 101개 나이 중 36개만 치료·건강검진류 선택지를 갖고 있음)
// 마지막 안전망으로 합성 치료 선택지를 강제로 끼워 넣는다. mandatory(예:
// 54세 부모님 사별)가 붙은 자리는 밀어내지 않는다 - 두 보장이 겹치는 나이엔
// 부모님 사별 쪽을 우선한다.
function ensureGuaranteedCure(stageChoices, ids, healthConditions, guaranteeCure) {
  if (!guaranteeCure) return ids;
  const hasReal = stageChoices.some((c) => ids.includes(c.id) && (c.removeCondition || c.removeAllConditions));
  if (hasReal) return ids;
  const curable = (healthConditions || []).filter((c) => !c.permanent);
  if (!curable.length) return ids;
  const mandatoryIds = new Set(stageChoices.filter((c) => c.mandatory).map((c) => c.id));
  let replaceIdx = -1;
  for (let i = ids.length - 1; i >= 0; i--) {
    if (!mandatoryIds.has(ids[i]) && !String(ids[i]).startsWith('farewell:')) { replaceIdx = i; break; }
  }
  if (replaceIdx === -1) return ids;
  const target = curable[Math.floor(Math.random() * curable.length)];
  const newIds = ids.slice();
  newIds[replaceIdx] = 'treat:' + target.id;
  return newIds;
}

// 아직 안 고른 구간의 선택지는 deltas/result를 절대 클라이언트로 보내지 않는다
// (기획안 04장 "선택지 문장만 보고 결과를 예측할 수 없어야 한다"를 서버에서도
// 강제 - 개발자 도구로 응답을 뜯어봐도 결과가 안 보이게). random:true인 구간은
// "고르는" 게 아니라 "굴리는" 구간이라는 걸 클라이언트에 알려준다(태어날 집안처럼
// 본인이 선택할 수 없는 것들 - submitChoice가 아니라 rollDice로만 진행 가능).
//
// visibleIds가 주어지면(그 판의 저장 슬롯에 이미 뽑아둔 4개) choices를 그
// 4개로만 필터링해서 내려준다 - 안 보여준 선택지가 나중에 rollDice 결과로
// 튀어나오는 일이 없도록, "노출 = 실제로 뽑힐 수 있는 후보"가 항상 일치해야 함.
// introId가 주어지면(그 판의 저장 슬롯에 이미 뽑아둔 상황 설명 id) 그
// 상황의 텍스트를 resolveIntroText로 찾아 쓴다 - pickIntroId() 참고.
function publicStage(stage, visibleIds, introId, healthConditions) {
  const ids = visibleIds && visibleIds.length ? visibleIds : pickVisibleChoiceIds(stage.choices, { introId });
  // ids 중 'treat:'로 시작하는 항목은 stage.choices(game-data.js 콘텐츠)에
  // 없는 합성 치료 선택지(ensureGuaranteedCure 참고)라, resolveSyntheticChoice로
  // 그 자리에서 다시 만들어 끼워 넣는다.
  const visibleChoices = ids
    .map((id) => {
      const real = findChoiceById(stage, id);
      if (real) return { id: real.id, text: real.text };
      const synthetic = resolveSyntheticChoice(id, healthConditions);
      return synthetic ? { id: synthetic.id, text: synthetic.text } : null;
    })
    .filter(Boolean);
  return {
    id: stage.id,
    name: stage.name,
    ageRange: stage.ageRange,
    intro: resolveIntroText(stage, introId),
    random: !!stage.random,
    choices: visibleChoices
  };
}

// 상황 설명(intro)도 선택지와 같은 원리로 여러 개 중 하나가 무작위로 뜰 수
// 있게 한다 - stage.intros(배열, 각 항목은 {id, text})가 있으면 그중 하나를
// 무작위로 고르고, 없으면 기존처럼 stage.intro(단일 문자열) 그대로 쓴다.
// 상황마다 id를 두는 이유는 선택지 쪽에서 requiresIntro로 "이 상황일 때만
// 자연스러운 선택지"를 걸 수 있게 하기 위함(pickVisibleChoiceIds 참고) -
// 예를 들어 같은 나이라도 "실직 통보를 받았다"는 상황과 "승진했다"는 상황이
// 있다면, 각 상황에 어울리는 선택지만 그 상황일 때 후보에 들어가고 나머지는
// 안 뜨게 된다. 지금은 메커니즘만 먼저 구현된 상태라 실제로 intros 배열을
// 가진 구간은 아직 없다(전부 기존 방식인 intro 단일 문자열만 사용, 동작
// 변화 없음) - 나중에 특정 나이에 여러 상황을 추가하고 싶으면 그 STAGES
// 항목에 intros: [&#123;id:'a', text:'문구1'&#125;, &#123;id:'b', text:'문구2'&#125;]를 추가하고,
// 그 상황 전용 선택지엔 requiresIntro: 'a'를 붙이면 된다(추가 로직 변경
// 불필요). 텍스트가 아니라 id만 저장 슬롯에 남기는 건 visibleChoiceIds가
// 선택지 텍스트가 아니라 id만 저장하는 것과 같은 이유 - 나중에 문구를
// 수정해도 이미 진행 중인 판이 옛 문구를 계속 들고 있지 않는다.
function pickIntroId(stage) {
  if (Array.isArray(stage.intros) && stage.intros.length) {
    return stage.intros[Math.floor(Math.random() * stage.intros.length)].id;
  }
  return null;
}
function resolveIntroText(stage, introId) {
  if (Array.isArray(stage.intros) && stage.intros.length) {
    const found = stage.intros.find((i) => i.id === introId);
    return found ? found.text : stage.intros[0].text;
  }
  return stage.intro || '';
}

function freshStats() {
  const stats = {};
  for (const key of STAT_KEYS) stats[key] = STAT_START;
  return stats;
}

// 보유 현금자산(원 단위, 항상 만원의 배수) - 추상적인 wealth 스탯(0~100)과는
// 별개로, "실제로 돈을 모으는 재미"를 위해 선택지의 wealth delta를 그
// 나이대에 맞는 원화 단위로 환산해 누적하는 값(2026-08-17, 사용자 지시).
// game-data.js의 814개 선택지를 일일이 손대는 대신, wealth delta가 있는
// 모든 선택지에 서버가 자동으로 금액을 매긴다 - 나이대별 배수(cashUnitForAge)
// 는 전부 만원 단위라 곱한 결과도 항상 만원의 배수(요청한 "최소 1만원단위"
// 충족). 20세 미만(유년~청소년)은 "용돈 수준"인 1만/3만원을 그대로 두고,
// 20세부터는 "선택 1회당 평균 획득액"이 실제 한국 평균 연봉 수준(20대 약
// 3,000만/30~49세 약 4,500만/50~64세 약 4,000만/65세+ 약 1,500만원)에 오도록
// 배율 자체를 키웠다(2026-08-18, 두 단계 조정 - 1차: "20세 이후로는 1년 평균
// 연봉 수준으로 배율을 조정해줘" → 배율을 절대 연봉 금액으로 바로 쓰면 wealth
// 1점이 이미 연봉 하나라 배포 시뮬레이션 기준 생애 누적 보유 현금이 최대
// 20억원대까지 치솟아, "금액은 비슷하게 두고 상대적 비율만 연봉 곡선에
// 맞추자"는 지시로 일단 비율만 반영한 20대 30만/30~49세 45만/50~64세 40만/
// 65세+ 15만원으로 축소 적용했었음. 2차: "실제 현실 평균 연봉처럼 x천만원
// 수준으로 높이려면?" 질문에 "선택 1회당 평균이 연봉 수준"이 되도록 시뮬레이션
// 기준 평균 wealth delta(대략 2.9~3.6점)로 역산해 다시 대폭 키움 → 지금 이
// 값. 그 결과 생애 누적 보유 현금도 같이 커진다(무작위 플레이 중앙값 약
// 7,000만원, 그리디 최댓값 약 8억원 수준 - 배포 전 시뮬레이션으로 사용자에게
// 확인받고 진행). 실제 원화 금액이라 "보유 현금"이 음수가 되는 건 어색해서
// 0 밑으로는 안 내려가게 막는다(빚은 추상 wealth 스탯에서만 표현됨).
function cashUnitForAge(age) {
  if (age < 10) return 10000;
  if (age < 20) return 30000;
  if (age < 30) return 8250000;
  if (age < 50) return 13500000;
  if (age < 65) return 13000000;
  return 5200000;
}

// 지인 상세용 이름 목록 - stocks 노드를 매번(또는 캐시 만료마다) RTDB에서 직접
// 읽던 걸 정적 파일 require로 바꿨다(2026-08-18, 사용자 지시 - 앞으로 시청자도
// 같은 판에 동시 접속하는 멀티플레이가 되면 요청량이 크게 늘 텐데, RTDB를 매번
// 읽는 구조로는 그만큼 다운로드 비용이 곱해지기 때문). scripts/update-streamer-
// names.js를 수동 실행하면 이 파일과 클라이언트가 쓰는 루트의 동명 파일이 함께
// 갱신된다 - 스케줄러 없음, 필요할 때만 사용자가 직접 실행. require는 콜드
// 스타트 시 한 번만 파일을 읽고 이후엔 메모리에 상주하므로 이제 TTL 캐시나
// db 인자, async 처리가 전부 필요 없다.
const STREAMER_NAMES = require('./streamer-names.json').map((s) => s.name).filter(Boolean);

function pickRandomStreamerName() {
  if (!STREAMER_NAMES.length) return '이름 모를 이';
  return STREAMER_NAMES[Math.floor(Math.random() * STREAMER_NAMES.length)];
}

// submitChoice/rollDice 공통 로직 - 하나의 선택(choice)을 스탯에 반영하고, 다음
// 구간으로 넘기거나(마지막 구간이면) 엔딩을 확정한다. 어느 경로로 골랐든(직접
// 클릭 vs 주사위) 반영 방식은 동일해야 하므로 여기 한 곳에만 둔다.
async function applyChoice(db, playRef, play, stage, choice) {
  // 이 선택이 요구하는 건강 조건(requiresCondition·requiresNoCondition)/가족
  // 구성원(requiresFamilyMember·requiresNoFamilyMember)이 실제로 지금 안 맞는데도 들어왔다면(정상 흐름이면
  // pickVisibleChoiceIds가 애초에 후보에서 뺐을 것) - 저장 슬롯이 오래돼 해당
  // 필드가 없던 시절 것이거나 하는 예외 상황이니 방어적으로 막는다.
  const currentConditions = Array.isArray(play.healthConditions) ? play.healthConditions : [];
  if (choice.requiresCondition && !currentConditions.some((c) => c.id === choice.requiresCondition)) {
    throw new HttpsError('failed-precondition', '지금 상태에서는 고를 수 없는 선택지입니다.');
  }
  if (choice.requiresNoCondition && choice.requiresNoCondition.some((id) => currentConditions.some((c) => c.id === id))) {
    throw new HttpsError('failed-precondition', '지금 상태에서는 고를 수 없는 선택지입니다.');
  }
  if (choice.requiresAnyCondition && !currentConditions.length) {
    throw new HttpsError('failed-precondition', '지금 상태에서는 고를 수 없는 선택지입니다.');
  }
  const currentFamilyMembers = Array.isArray(play.familyMembers) ? play.familyMembers : [];
  const currentFamilyIds = currentFamilyMembers.map((f) => f.id);
  if (choice.requiresFamilyMember && !choice.requiresFamilyMember.some((id) => currentFamilyIds.includes(id))) {
    throw new HttpsError('failed-precondition', '지금 가족 상태에서는 고를 수 없는 선택지입니다.');
  }
  if (choice.requiresNoFamilyMember && choice.requiresNoFamilyMember.some((id) => currentFamilyIds.includes(id))) {
    throw new HttpsError('failed-precondition', '지금 가족 상태에서는 고를 수 없는 선택지입니다.');
  }
  // requiresFamilyMember는 배열 안에서 하나만 있으면 되는 OR 조건인데,
  // "부모님도 계시고 형제자매도 있어야" 하는 경우처럼 서로 다른 두 그룹이
  // 각각 OR로 만족되면서 그 둘끼리는 AND로 묶여야 하는 경우가 있다.
  // requiresAllFamilyMemberGroups: [[id,...], [id,...]]는 각 하위 배열을
  // OR로, 하위 배열끼리는 AND로 검사한다.
  if (choice.requiresAllFamilyMemberGroups && !choice.requiresAllFamilyMemberGroups.every((group) => group.some((id) => currentFamilyIds.includes(id)))) {
    throw new HttpsError('failed-precondition', '지금 가족 상태에서는 고를 수 없는 선택지입니다.');
  }
  // priorRouteState를 직업 판정보다 먼저 계산해야 한다 - 징역 루트가 이미
  // 끝났는데도 occupationHistory엔 'inmate'가 그대로 남아있어(resolveEffectiveOccupation
  // 주석 참고) 활성 루트 정보 없이는 "출소했는지"를 판단할 수 없기 때문.
  const priorRouteState = buildRouteState(Array.isArray(play.choiceLog) ? play.choiceLog : [], play.stageIndex);
  const priorOccupationHistory = buildOccupationHistory(Array.isArray(play.choiceLog) ? play.choiceLog : []);
  const priorOccupation = resolveEffectiveOccupation(priorOccupationHistory, priorRouteState.activeRoute);
  const priorOccupationId = priorOccupation ? priorOccupation.id : null;
  if (choice.requiresOccupation && !choice.requiresOccupation.includes(priorOccupationId)) {
    throw new HttpsError('failed-precondition', '지금 직업 상태에서는 고를 수 없는 선택지입니다.');
  }
  if (choice.requiresAnyOccupation && !priorOccupationId) {
    throw new HttpsError('failed-precondition', '지금 직업 상태에서는 고를 수 없는 선택지입니다.');
  }
  // requiresEverOccupation - pickVisibleChoiceIds와 완전히 같은 조건을 여기서도
  // 검증한다. 과거 직업이므로 priorOccupationHistory 전체(원본 setOccupation
  // 로그, resolveEffectiveOccupation 보정 전)에서 찾는다.
  const priorEverOccupationIds = priorOccupationHistory.map((o) => o.id);
  if (choice.requiresEverOccupation && !choice.requiresEverOccupation.some((id) => priorEverOccupationIds.includes(id))) {
    throw new HttpsError('failed-precondition', '지금까지의 직업 이력으로는 고를 수 없는 선택지입니다.');
  }
  if (choice.requiresIntro && choice.requiresIntro !== play.currentIntroId) {
    throw new HttpsError('failed-precondition', '지금 상황에서는 고를 수 없는 선택지입니다.');
  }
  // requiresAsset(문자열, 그 재산을 지금 갖고 있어야 후보) - 복권 당첨 확인처럼
  // "먼저 산 사람만 결과를 확인할 수 있는" 흐름을 위한 것(2026-08-17, 사용자
  // 지시). requiresCondition과 완전히 같은 패턴을 재산 상세에 적용했다.
  const playAssetsForValidation = Array.isArray(play.assets) ? play.assets : [];
  if (choice.requiresAsset && !playAssetsForValidation.some((a) => a.id === choice.requiresAsset)) {
    throw new HttpsError('failed-precondition', '지금 재산 상태에서는 고를 수 없는 선택지입니다.');
  }
  // requiresNoAsset(문자열, 그 재산이 없어야 후보 - 2026-08-22, 18장 보험) -
  // requiresNoFamilyMember와 완전히 같은 패턴을 재산 상세에 적용했다. "이미
  // 보험에 가입했으면 가입 선택지가 다시 안 뜨게" 하기 위한 것.
  if (choice.requiresNoAsset && playAssetsForValidation.some((a) => a.id === choice.requiresNoAsset)) {
    throw new HttpsError('failed-precondition', '지금 재산 상태에서는 고를 수 없는 선택지입니다.');
  }
  // requiresAssetType - pickVisibleChoiceIds와 완전히 같은 조건을 여기서도 검증한다.
  if (choice.requiresAssetType && !playAssetsForValidation.some((a) => a.type === choice.requiresAssetType)) {
    throw new HttpsError('failed-precondition', '지금 재산 상태에서는 고를 수 없는 선택지입니다.');
  }
  // requiresLocation(배열, 지금 있는 장소가 그 중 하나여야 후보) - requiresOccupation과
  // 완전히 같은 패턴을 현재 장소에 적용한 것.
  const priorLocation = resolveCurrentLocation(buildLocationHistory(Array.isArray(play.choiceLog) ? play.choiceLog : []));
  if (choice.requiresLocation && !choice.requiresLocation.includes(priorLocation.id)) {
    throw new HttpsError('failed-precondition', '지금 있는 장소에서는 고를 수 없는 선택지입니다.');
  }
  // requiresAnyAcquaintance(불리언, 지인이 하나라도 있어야 후보) - "지인이
  // 있을 때 배신 당하는" 선택지들(2026-08-18, 사용자 지시)을 위한 것.
  // requiresAnyOccupation과 완전히 같은 패턴을 지인 상세에 적용했다.
  const priorAcquaintances = Array.isArray(play.acquaintances) ? play.acquaintances : [];
  if (choice.requiresAnyAcquaintance && !priorAcquaintances.length) {
    throw new HttpsError('failed-precondition', '지금 지인이 없어서 고를 수 없는 선택지입니다.');
  }
  // requiresAnyLover - pickVisibleChoiceIds와 완전히 같은 조건을 여기서도 검증한다.
  if (choice.requiresAnyLover && !priorAcquaintances.some((a) => a.relation === 'lover')) {
    throw new HttpsError('failed-precondition', '지금 연인이 없어서 고를 수 없는 선택지입니다.');
  }
  // requiresTalent/requiresAnyTalent, requiresHobby/requiresAnyHobby - requiresAsset·
  // requiresAnyAcquaintance와 완전히 같은 패턴을 재능·취미 상세에 적용했다.
  const priorTalents = Array.isArray(play.talents) ? play.talents : [];
  if (choice.requiresTalent && !priorTalents.some((t) => t.id === choice.requiresTalent)) {
    throw new HttpsError('failed-precondition', '지금 재능 상태에서는 고를 수 없는 선택지입니다.');
  }
  if (choice.requiresAnyTalent && !priorTalents.length) {
    throw new HttpsError('failed-precondition', '지금 재능이 없어서 고를 수 없는 선택지입니다.');
  }
  const priorHobbies = Array.isArray(play.hobbies) ? play.hobbies : [];
  if (choice.requiresHobby && !priorHobbies.some((h) => h.id === choice.requiresHobby)) {
    throw new HttpsError('failed-precondition', '지금 취미 상태에서는 고를 수 없는 선택지입니다.');
  }
  if (choice.requiresAnyHobby && !priorHobbies.length) {
    throw new HttpsError('failed-precondition', '지금 취미가 없어서 고를 수 없는 선택지입니다.');
  }
  // 트리거 루트(14장) - requiresRoute는 지금 그 루트가 활성 상태일 때만,
  // startsRoute는 그 루트를 이미 겪은 적이 없을 때만(재진입 방지) 허용한다.
  // priorRouteState는 위 직업 판정 때 이미 계산해뒀다(재사용).
  if (choice.requiresRoute && (!priorRouteState.activeRoute || priorRouteState.activeRoute.id !== choice.requiresRoute)) {
    throw new HttpsError('failed-precondition', '지금은 그 루트가 활성 상태가 아니라 고를 수 없는 선택지입니다.');
  }
  if (choice.startsRoute && priorRouteState.experiencedRouteIds.includes(choice.startsRoute.id)) {
    throw new HttpsError('failed-precondition', '이미 겪은 루트라 다시 시작할 수 없습니다.');
  }
  // requiresRouteCompletedWithin({routeId, maxYears}, 2026-08-22, "연예계
  // 루트→배우 루트" 후속 루트) - pickVisibleChoiceIds와 완전히 같은 조건을
  // 여기서도 검증한다(buildRouteState 주석 참고).
  if (choice.requiresRouteCompletedWithin) {
    const { routeId, maxYears } = choice.requiresRouteCompletedWithin;
    const endAge = priorRouteState.routeEndAges[routeId];
    const yearsSince = play.stageIndex - endAge;
    if (!priorRouteState.routeCompletedIds.includes(routeId) || endAge === undefined || yearsSince < 1 || yearsSince > maxYears) {
      throw new HttpsError('failed-precondition', '지금은 고를 수 없는 선택지입니다.');
    }
  }
  // requiresSufficientCash(불리언, 2026-08-23, 사용자 지시 - "돈이 많이 필요한
  // 재산(부동산, 중고차 등)은 충분한 현금이 있을때 선택 가능하게 해줘. 출현율은
  // 그대로. 현금이 부족하면 토스트메시지가 뜨게 해줘") - 다른 requires*와 달리
  // "노출 후보에서 빼는" 게 아니라(요청대로 노출 확률은 안 건드림) "골랐을 때
  // 막는" 용도라 pickVisibleChoiceIds가 아니라 여기(제출 시점 검증)에만 존재한다.
  // 실제 원화 비용은 cashUnitForAge(현재 나이)를 곱한 값이 그대로 이 선택의
  // wealth delta만큼 cashHoldings에 반영되는 기존 로직(아래 참고)과 같은 환산을
  // 미리 써서, "이 선택을 고르면 나갈 현금"이 지금 보유 현금보다 큰지만 본다.
  // details.reason으로 클라이언트가 일반 오류 알림 대신 토스트를 띄우게 구분한다.
  if (choice.requiresSufficientCash) {
    const cost = Math.abs((choice.deltas && choice.deltas.wealth) || 0) * cashUnitForAge(play.stageIndex);
    if ((play.cashHoldings || 0) < cost) {
      throw new HttpsError('failed-precondition', '보유 현금이 부족해서 고를 수 없는 선택지입니다.', { reason: 'insufficient-cash' });
    }
  }

  // prizeTable(가중치 배열)이 붙은 선택지(복권 당첨 확인 등)는 choice.deltas·
  // choice.result가 고정값이 아니라, 이 순간 서버에서 무작위로 뽑은 등수의
  // deltas·result로 완전히 대체된다 - resultOptions(문구만 랜덤)와 달리 결과의
  // "방향"(득/실) 자체가 매번 달라지는 경우를 위한 것. weight 합계를 기준으로
  // 가중 추첨한다.
  let resolvedDeltas = choice.deltas;
  let resolvedResult = choice.result;
  let resolvedLabel = null;
  // pickedBranch(2026-08-23, 징역 루트 전용) - 예전엔 이 if 블록 안에서만
  // picked를 썼지만(deltas/result/label만 갈래별로 다름), 징역 갈래는
  // setOccupation/startsRoute 같은 구조적 효과도 갈래별로 달라야 해서
  // 블록 밖 pickedBranch에 그대로 남겨둔다 - 아래 logEntry.prizeLabel 저장,
  // routeDurationOverride 굴리기, effectiveChoice 구성에 재사용.
  let pickedBranch = null;
  if (choice.prizeTable && choice.prizeTable.length) {
    const totalWeight = choice.prizeTable.reduce((sum, p) => sum + p.weight, 0);
    let roll = Math.random() * totalWeight;
    let picked = choice.prizeTable[choice.prizeTable.length - 1];
    for (const p of choice.prizeTable) {
      if (roll < p.weight) { picked = p; break; }
      roll -= p.weight;
    }
    pickedBranch = picked;
    resolvedDeltas = picked.deltas;
    resolvedResult = picked.result;
    resolvedLabel = picked.label;
  }
  // prizeTable 갈래에 startsRoute가 실려 있는데(현재는 징역 갈래뿐)
  // maxDurationYears가 없으면 "3~5년, 매번 무작위"(사용자 확정)라는 뜻이라
  // 여기서 굴려서 logEntry에 저장해둔다 - buildRouteState가 재구성할 때마다
  // 다시 굴리면 재접속마다 복역 기간이 바뀌는 모순이 생기므로 반드시 이
  // 시점에 한 번만 굴리고 고정한다.
  // +1 보정: buildRouteState의 만료 판정은 "(다음 나이 - 시작 나이) >=
  // maxDurationYears"라, 선고를 받은 그 나이 자체는 아직 감옥 콘텐츠가 아닌
  // 일반 콘텐츠 턴이고 실제 감옥 전용 턴 수는 maxDurationYears보다 정확히
  // 1 적게 나온다(시뮬레이션으로 확인 - maxDurationYears=3을 그대로 쓰면
  // 실제로는 2년치만 노출됨). "3~5년"이 실제 체감 복역 기간이 되도록 굴리는
  // 값 자체를 1씩 올려 저장한다.
  const routeDurationOverride = (pickedBranch && pickedBranch.startsRoute && !pickedBranch.startsRoute.maxDurationYears)
    ? (4 + Math.floor(Math.random() * 3))
    : undefined;

  // blocksHealthRecovery가 붙은 조건(예: 희귀 난치병)을 이미 갖고 있으면,
  // 이번 선택이 건강을 "회복시키는" 방향(양수 delta)이어도 그 효과가 막힌다 -
  // 난치병을 안고 있는 한 몸은 더 나빠질 순 있어도 완전히 좋아지진 않는다는
  // 의도. 실제로 막혔을 때만 클라이언트에 알려줘서(healthRecoverySuppressed)
  // "선택했는데 건강 바가 그대로"인 게 버그처럼 안 보이게 한다.
  const healthRecoveryBlocked = currentConditions.some((c) => c.blocksHealthRecovery);
  const effectiveDeltas = Object.assign({}, resolvedDeltas || {});

  // 부상·질병 개수 페널티(2026-08-18, 사용자 지시) - 지금 앓고 있는 조건이
  // 많을수록 건강 회복도 더뎌지고 악화도 더 커진다. health delta가 있는
  // 선택지는 이번 선택이 반영되기 전 기준 조건 개수만큼 그대로 차감한다 -
  // 회복(+)이면 그만큼 덜 오르고, 악화(-)면 그만큼 더 떨어진다(조건 1개일 때
  // +6→+5, -5→-6 되는 식). 조건이 없으면(0개) 기존과 동일.
  const activeConditionCount = currentConditions.length;
  if (activeConditionCount > 0 && effectiveDeltas.health !== undefined) {
    effectiveDeltas.health -= activeConditionCount;
  }

  // 정신질환 개수 페널티(2026-08-18, 사용자 지시 - "정신 질환도 발병갯수에 따라
  // 행복&관계 점수 변동시 건강처럼 보정계수 추가해줘") - 위 부상·질병 개수
  // 페널티와 완전히 같은 원리를, 정신질환(healthConditions 중 mental: true인
  // 것)만 따로 세어 happiness·relationship에 적용한다. 신체 질환은 이 카운트에
  // 안 들어간다 - 정신질환이 많을수록 감정·관계 변화가 둔감해진다는 의도라, 다리
  // 골절 개수는 상관없어야 하기 때문. health 페널티와 별개의 카운터라 같은 판에서
  // 신체 질환 3개 + 정신질환 1개면 health는 -3, happiness/relationship은 -1만
  // 적용된다.
  const activeMentalConditionCount = currentConditions.filter((c) => c.mental).length;
  if (activeMentalConditionCount > 0) {
    if (effectiveDeltas.happiness !== undefined) effectiveDeltas.happiness -= activeMentalConditionCount;
    if (effectiveDeltas.relationship !== undefined) effectiveDeltas.relationship -= activeMentalConditionCount;
  }

  let healthRecoverySuppressed = false;
  if (healthRecoveryBlocked && effectiveDeltas.health > 0) {
    effectiveDeltas.health = 0;
    healthRecoverySuppressed = true;
  }

  // 보험 가입 중 - 회복 가능한 질병·부상 완전 회피(2026-08-22, 18장 사용자
  // 확정) - 이 선택지가 addCondition을 붙였고 그 조건이 permanent(희귀질환·
  // 사고후유증·치매 3종만 true)가 아니고 wealth 델타가 음수이면, 진단·병원비를
  // 아예 피한 것으로 본다: wealth 손실을 취소하고(0으로) addCondition 자체를
  // 건너뛴다. health·happiness 등 다른 델타는 그대로 둔다 - 몸은 축나고
  // 기분은 상해도 "진단은 피하고 병원비도 안 든다"는 뜻. 특정 선택지를 고쳐
  // 만드는 게 아니라 game-data.js를 하나도 안 건드리는 엔진 차원의 자동
  // 규칙이다(건강 조건 개수 페널티와 같은 급). 무단횡단 사고(sudden-accident-
  // injury)처럼 addCondition이 permanent인 경우는 애초에 이 규칙 대상이
  // 아니라 별도 처리 없이도 자동으로 제외된다.
  const hasInsurance = (Array.isArray(play.assets) ? play.assets : []).some((a) => a.id === 'insurance');
  const insuranceAvoidsCondition = !!(hasInsurance && choice.addCondition && !choice.addCondition.permanent && effectiveDeltas.wealth < 0);
  if (insuranceAvoidsCondition) {
    effectiveDeltas.wealth = 0;
  }

  const stats = Object.assign({}, play.stats);
  for (const key of Object.keys(effectiveDeltas)) {
    stats[key] = clampStat((stats[key] || 0) + effectiveDeltas[key]);
  }

  // 보유 현금자산 갱신 - wealth delta가 있는 선택지만 영향을 준다(cashUnitForAge
  // 주석 참고). blocksHealthRecovery처럼 별도로 막는 조건은 없다 - 재산은
  // health와 달리 "회복 불가" 컨셉이 없어서 항상 그대로 적용.
  const wealthDelta = effectiveDeltas.wealth || 0;
  let cashHoldings = Math.max(0, (play.cashHoldings || 0) + wealthDelta * cashUnitForAge(play.stageIndex));

  // 건강 상세 - 선택지가 addCondition을 붙였으면 부상/질병이 새로 생기고(이미
  // 있으면 중복 추가 안 함), removeCondition을 붙였으면 그 조건이 나아서 빠진다.
  // permanent(rare-illness·accident-aftereffects·alzheimers 셋만 true - "의도적으로
  // 영구 지속") 플래그도 그대로 실어둔다 - removeAllConditions가 이 플래그를 보고
  // 영구 조건은 건너뛰기 위해서다.
  let healthConditions = currentConditions.slice();
  if (choice.addCondition && !insuranceAvoidsCondition && !healthConditions.some((c) => c.id === choice.addCondition.id)) {
    healthConditions.push({
      id: choice.addCondition.id,
      label: choice.addCondition.label,
      sinceStageId: stage.id,
      blocksHealthRecovery: !!choice.addCondition.blocksHealthRecovery,
      causesChoiceFadeout: !!choice.addCondition.causesChoiceFadeout,
      permanent: !!choice.addCondition.permanent,
      mental: !!choice.addCondition.mental
    });
  }
  if (choice.removeCondition) {
    healthConditions = healthConditions.filter((c) => c.id !== choice.removeCondition);
  }
  // removeAllConditions(2026-08-18, 사용자 지시 - "건강검진같은 선택지는 부상/질병
  // 상관없이 모두 치료되게 해줘") - 지금 앓고 있는 조건을 전부 지운다, 단 영구
  // 조건(permanent)만은 예외로 남겨둔다("의도적으로 영구 지속"이라는 기존 설계를
  // 깨지 않기 위해).
  if (choice.removeAllConditions) {
    healthConditions = healthConditions.filter((c) => c.permanent);
  }

  // 가족 상세 - addFamilyMembers에 담긴 항목들이 새 가족으로 생기고(이미 있으면
  // 중복 추가 안 함), removeFamilyMembers에 담긴 id들은 가족에서 빠진다(사망·
  // 이혼 등). 부모님 사망처럼 "father/mother/single-parent 중 있는 걸 전부
  // 제거"하는 경우도 있어 removeFamilyMembers는 항상 배열이다.
  //
  // 연애-결혼 연결(2026-08-18, 사용자 지시 - "연애-결혼 간 연결성 부여해줘") -
  // 결혼(addFamilyMembers에 spouse 포함)하는 순간, 지인 목록에 이미 연인(lover)이
  // 있으면 "그 사람과 결혼한 것"으로 보고 이름을 배우자 항목에 그대로 이어받는다
  // (가족 상세는 원래 이름이 없고 역할 label만 있었는데, 배우자만 이 경우 name을
  // 추가로 가짐). 연인이 여러 번 쌓였다면(예: 19세 소개팅 + 28세 우연한 만남) 가장
  // 최근에 생긴 쪽을 배우자로 이어받는다. 이어받은 연인은 지인 목록에서도 빠진다 -
  // 안 그러면 결혼한 뒤에도 "지인: 연인 ○○○"과 "가족: 배우자"가 서로 다른 사람인
  // 것처럼 따로 표시되는 문제가 있었다. 연인이 하나도 없었으면(결혼에 연인 지인
  // 선택이 필수 조건은 아님) 기존처럼 이름 없는 배우자로 생긴다.
  const currentAcquaintances = Array.isArray(play.acquaintances) ? play.acquaintances : [];
  let familyMembers = currentFamilyMembers.slice();
  let marriedLoverId = null;
  if (choice.addFamilyMembers) {
    const marriesSpouse = choice.addFamilyMembers.some((m) => m.id === 'spouse');
    const loverEntries = marriesSpouse ? currentAcquaintances.filter((a) => a.relation === 'lover') : [];
    const marriedLover = loverEntries.length ? loverEntries[loverEntries.length - 1] : null;
    if (marriedLover) marriedLoverId = marriedLover.id;
    for (const member of choice.addFamilyMembers) {
      if (!familyMembers.some((f) => f.id === member.id)) {
        const entry = { id: member.id, label: member.label, sinceStageId: stage.id };
        if (member.id === 'spouse' && marriedLover) entry.name = marriedLover.name;
        familyMembers.push(entry);
      }
    }
  }
  if (choice.removeFamilyMembers) {
    familyMembers = familyMembers.filter((f) => !choice.removeFamilyMembers.includes(f.id));
  }

  // 지인 상세 - choice.addAcquaintance가 있으면 정적 이름 목록(STREAMER_NAMES)에서
  // 무작위로 뽑은 실제 스트리머 이름으로 새 지인이 생긴다(2026-08-17, 사용자
  // 지시 - "임의 이름이 아니라 경로에 있는 스트리머 이름중에 랜덤하게"). 가족과
  // 달리 이름이 매번 달라지므로 id를 역할명으로 쓸 수 없어 "이 구간-이 선택지"
  // 조합으로 유일성을 보장한다(한 구간은 한 판에서 한 번만 지나가므로 안전).
  // count(기본 1)를 붙이면 한 선택으로 여러 명이 한꺼번에 생긴다 - 보육 시설처럼
  // "그 시절 함께 자란 여럿"을 한 선택으로 표현해야 하는 경우용(2026-08-18,
  // 사용자 지시). count>1일 때만 id 끝에 순번을 붙여 서로 구분한다(기존
  // count=1 선택지들의 id 형식은 그대로 유지). 같은 판 안에서 이름이 겹치면
  // (같은 사람이 친구이자 동료로 두 번 등장하는 것처럼 보여) 어색하므로, 이미
  // 쓴 이름과 겹치면 다시 뽑아본다(최대 10회 재시도, 그래도 겹치면 그냥 둠).
  // 지인을 잃는 선택지(2026-08-18, 사용자 지시 - "반대로 지인을 잃는 선택지도
  // 찾아줘" → "7개에 추천안대로 진행해줘") - removeAcquaintance: {relation}이 붙은
  // 선택지는 그 relation(friend/colleague/lover 등) 타입의 지인이 지금 있으면
  // 가장 최근에 생긴 것 하나를 지인 목록에서 뺀다. 이 선택지들은 원래 특정 인물을
  // 전제하지 않고 항상 노출되는 범용 문구라(가족과 달리 지인은 필수 조건이 아님)
  // 노출 조건(requires류)은 건드리지 않고, 마침 그 타입의 지인을 갖고 있었을 때만
  // 부가 효과로 제거한다 - 갖고 있지 않으면 조용히 아무 일도 없다(에러 없음).
  // relation을 안 붙이면(빈 객체 {}) 타입 상관없이 아무 지인이나 대상이 된다 -
  // "지인이 있을 때 배신 당하는" 선택지들(2026-08-18, 사용자 지시)은 배신하는
  // 지인의 관계 유형을 특정하지 않으므로, 이 30개는 requiresAnyAcquaintance로
  // 노출 자체를 지인 있을 때로 미리 걸러두고(그래서 "갖고 있지 않으면 조용히
  // 아무 일도 없다"는 사실상 발생하지 않음) relation 없는 removeAcquaintance로
  // 가장 최근 지인 하나를 잃는다.
  let acquaintances = currentAcquaintances.slice();
  if (marriedLoverId) {
    acquaintances = acquaintances.filter((a) => a.id !== marriedLoverId);
  }
  if (choice.removeAcquaintance) {
    const targetRelation = choice.removeAcquaintance.relation;
    const lostMatches = targetRelation ? acquaintances.filter((a) => a.relation === targetRelation) : acquaintances;
    if (lostMatches.length) {
      const lost = lostMatches[lostMatches.length - 1];
      acquaintances = acquaintances.filter((a) => a.id !== lost.id);
    }
  }
  // 멀티플레이 - 지인 이름을 그 선택지에 투표한 참가자 닉네임으로(2026-08-24,
  // 13장 설계 구현 - "지인 추가 시 어느 참가자 닉네임을 쓸지" 확정안). uid당
  // multiplayerSessions 존재 확인은 이 함수 안에서 딱 한 번만(mpSessionVal,
  // 아래 미러링 단계에서 재사용) - addAcquaintance가 있을 때만 투표 노드까지
  // 추가로 읽는다. 투표자가 없으면(참가자 없음/아무도 이 선택지에 투표 안 함)
  // voterNicknames가 빈 배열로 남아 기존처럼 pickRandomStreamerName()만 쓰인다.
  const uid = playRef.key;
  const mpSessionSnap = await db.ref('lifeGame/multiplayerSessions/' + uid).get();
  const mpSessionVal = mpSessionSnap.exists() ? mpSessionSnap.val() : null;
  let voterNicknames = [];
  if (choice.addAcquaintance && mpSessionVal) {
    const votesSnap = await db.ref('lifeGame/multiplayerVotes/' + uid + '/' + stage.id).get();
    const votesVal = votesSnap.val() || {};
    const participants = mpSessionVal.participants || {};
    voterNicknames = Object.keys(votesVal)
      .filter((participantUid) => votesVal[participantUid] === choice.id && participants[participantUid])
      .map((participantUid) => participants[participantUid]);
    for (let i = voterNicknames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = voterNicknames[i]; voterNicknames[i] = voterNicknames[j]; voterNicknames[j] = tmp;
    }
  }
  if (choice.addAcquaintance) {
    const addCount = choice.addAcquaintance.count || 1;
    const usedNames = new Set(acquaintances.map((a) => a.name));
    const pickFallbackName = () => {
      let name = pickRandomStreamerName();
      let retries = 0;
      while (usedNames.has(name) && retries < 10) {
        name = pickRandomStreamerName();
        retries++;
      }
      return name;
    };
    let voterIdx = 0;
    for (let i = 0; i < addCount; i++) {
      const acquaintanceId = addCount > 1 ? stage.id + '-' + choice.id + '-' + i : stage.id + '-' + choice.id;
      if (acquaintances.some((a) => a.id === acquaintanceId)) continue;
      let acquaintanceName = null;
      if (voterIdx < voterNicknames.length) {
        const candidate = voterNicknames[voterIdx];
        voterIdx++;
        if (!usedNames.has(candidate)) acquaintanceName = candidate;
      }
      if (!acquaintanceName) acquaintanceName = pickFallbackName();
      usedNames.add(acquaintanceName);
      acquaintances.push({
        id: acquaintanceId,
        name: acquaintanceName,
        relation: choice.addAcquaintance.relation,
        label: choice.addAcquaintance.label,
        sinceStageId: stage.id
      });
    }
  }

  // 재산 상세 - 건강/가족 상세와 완전히 같은 패턴. 선택지가 addAsset을 붙였으면
  // 현금/부동산/동산 중 하나가 새로 생기고(이미 있으면 중복 추가 안 함),
  // removeAsset을 붙였으면 그 재산이 처분돼서 빠진다.
  const currentAssets = Array.isArray(play.assets) ? play.assets : [];
  let assets = currentAssets.slice();
  const isNewAsset = !!(choice.addAsset && !assets.some((a) => a.id === choice.addAsset.id));
  if (isNewAsset) {
    assets.push({
      id: choice.addAsset.id,
      label: choice.addAsset.label,
      type: choice.addAsset.type,
      sinceStageId: stage.id
    });
  }
  if (choice.removeAsset) {
    assets = assets.filter((a) => a.id !== choice.removeAsset);
  }

  // 보험료 자동 납입·3년 연체 해지(2026-08-22, 18장 사용자 확정 - 4장 1년단위
  // 진행 전환으로 선행 조건 충족돼 구현). 선택지가 아니라 매 턴(=매년) 자동으로
  // 적용되는 배경 효과라 건강 조건 페널티와 같은 급이다. hasInsurance는 이번
  // 선택 "이전" 상태(위에서 이미 계산)를 기준으로 삼는다 - 이번 턴에 막 가입한
  // 경우(buys-insurance-25 등) 가입 즉시 같은 턴에 첫 보험료까지 나가면 이중
  // 부담처럼 느껴져서, 보장은 다음 턴부터 시작되는 걸로 본다. 연체 카운터
  // (insuranceUnpaidYears)는 assets[] 항목이 아니라 저장 슬롯의 별도 필드다 -
  // assets[]의 다른 항목은 전부 "있다/없다"만 표현하는 정적 데이터라, 매 턴
  // 갱신되는 카운터를 항목 하나에 얹으면 그 패턴이 깨진다.
  const INSURANCE_PREMIUM_WON = 2000000;
  const priorUnpaidYears = play.insuranceUnpaidYears || 0;
  let insuranceUnpaidYears = 0;
  let insuranceLapsed = false;
  if (hasInsurance) {
    if (priorUnpaidYears >= 3) {
      // "3년째 해에서 다음 해로 넘어가는 시점"에 해지 - 이번 턴의 납입
      // 시도 자체를 건너뛰고 먼저 계약부터 해지한다.
      assets = assets.filter((a) => a.id !== 'insurance');
      insuranceLapsed = true;
      insuranceUnpaidYears = 0;
    } else if (cashHoldings >= INSURANCE_PREMIUM_WON) {
      cashHoldings -= INSURANCE_PREMIUM_WON;
      insuranceUnpaidYears = 0;
    } else {
      insuranceUnpaidYears = priorUnpaidYears + 1;
    }
  }

  // 재능·취미 상세(2026-08-21, 사용자 설계 - 17장) - 재산 상세와 완전히 같은
  // 패턴이지만 제거 필드는 두지 않는다(removeTalent/removeHobby 없음) - 재산처럼
  // 처분되거나 지인처럼 관계가 끊기는 게 아니라, 한 번 익힌 재능·취미는 그 판이
  // 끝날 때까지 계속 유지된다고 보는 게 자연스럽기 때문(기획서.html 17장 참고).
  const currentTalents = Array.isArray(play.talents) ? play.talents : [];
  let talents = currentTalents.slice();
  const isNewTalent = !!(choice.addTalent && !talents.some((t) => t.id === choice.addTalent.id));
  if (isNewTalent) {
    talents.push({ id: choice.addTalent.id, label: choice.addTalent.label, sinceStageId: stage.id });
  }
  const currentHobbies = Array.isArray(play.hobbies) ? play.hobbies : [];
  let hobbies = currentHobbies.slice();
  if (choice.addHobby && !hobbies.some((h) => h.id === choice.addHobby.id)) {
    hobbies.push({ id: choice.addHobby.id, label: choice.addHobby.label, sinceStageId: stage.id });
  }

  const choiceLog = Array.isArray(play.choiceLog) ? play.choiceLog.slice() : [];
  const logEntry = { stageId: stage.id, choiceId: choice.id, at: Date.now(), stats };
  // 합성 치료 선택지(id가 'treat:'로 시작)는 game-data.js에 없어 나중에
  // STAGES에서 다시 못 찾으므로, 그때 보여준 문구를 그대로 같이 저장해둔다
  // (buildChoiceHistory 참고). undefined 필드는 RTDB set/update가 거부하므로
  // synthetic이 아닐 때는 이 키 자체를 안 만든다.
  if (String(choice.id).startsWith('treat:') || choice.id === 'farewell:pet') logEntry.syntheticText = choice.text;
  // prizeLabel/routeDurationOverride(2026-08-23, 징역 루트 전용) - 나중에
  // buildOccupationHistory/buildRouteState가 이 항목을 다시 훑을 때 "그때
  // 어느 갈래가 뽑혔는지"를 알아야 그 갈래의 setOccupation/startsRoute를
  // 재구성할 수 있다(resolveEffectiveChoiceForEntry 참고). undefined 필드는
  // RTDB가 거부하므로 값이 있을 때만 키를 만든다.
  if (resolvedLabel) logEntry.prizeLabel = resolvedLabel;
  if (routeDurationOverride !== undefined) logEntry.routeDurationOverride = routeDurationOverride;
  choiceLog.push(logEntry);

  // 100년 버튼(2026-08-26, 사용자 지시 - "선택지를 선택하면 다음해에 지금
  // 가진 모든것을 소유한채로 0세로 돌아갈수 있는 기회를 얻는거야 ... 돌아가면
  // 가지고있던 모든것을 유지하고 스탯만 전부 50으로 초기화된채 0세로
  // 돌아가게돼") - choice.resetToInfancy가 붙은 선택지(91~99세 사이 등장하는
  // "100년 버튼"을 누른 다음 해의 "돌아가기" 갈래)를 고르면, 가족·재산·재능·
  // 취미·지인은 그대로 두고 나이·스탯·건강 상태만 새로 태어난 것처럼 리셋한다.
  // 직업·활성 루트·거주지는 별도 필드가 아니라 choiceLog를 매번 다시 훑어
  // 계산하는 구조라(buildOccupationHistory/buildRouteState/buildLocationHistory
  // 참고) choiceLog 자체를 비우면 셋 다 자동으로 초기화된다 - 이 사용자
  // 확인사항(직업·루트·건강·거주지는 초기화)을 위해 따로 손볼 코드가 없다.
  // nextIndex를 0으로 강제하는 처리는 아래에서 한다.
  if (choice.resetToInfancy) {
    choiceLog.length = 0;
    for (const key of STAT_KEYS) stats[key] = STAT_START;
    healthConditions = [];
  }

  // 현재 장소 - buildLocationHistory 주석 참고. 이번 선택이 setLocation을
  // 붙였다면 이 시점의 마지막 항목이 곧 새 장소이고, 한 번도 해외로 나간 적
  // 없으면 DEFAULT_LOCATION(국내) 그대로다.
  const locationHistory = buildLocationHistory(choiceLog);
  const currentLocation = resolveCurrentLocation(locationHistory);

  // 다섯 스탯 중 하나라도 0 이하로 떨어지면 100세를 못 채우고 그 자리에서
  // 삶이 끝난다 - pickNextStageIndex가 정한 다음 나이와 무관하게 즉시
  // completed 처리. INSTANT_ENDING_BUILDERS 순서대로 검사해 가장 먼저 해당된
  // 스탯의 전용 엔딩을 쓴다(여러 스탯이 같은 선택에서 동시에 0을 찍어도
  // 항상 같은 결과가 나오도록 순서 고정).
  const instantEnding = INSTANT_ENDING_BUILDERS.find((e) => stats[e.stat] <= 0);
  const collapsed = !!instantEnding;

  const nextIndex = choice.resetToInfancy ? 0 : pickNextStageIndex(play.stageIndex);
  const completed = collapsed || nextIndex >= STAGES.length;
  // sickStreak(2026-08-22, guaranteeCure 참고) - 건강 조건이 하나라도 있는
  // 채로 몇 턴째인지 세는 카운터. 조건이 없어지면(전부 나으면) 0으로
  // 리셋되고, 있으면 매 턴 1씩 늘어난다. pickVisibleChoiceIds가 이 값이
  // 3의 배수일 때 치료 선택지를 강제 노출한다.
  const sickStreak = healthConditions.length ? (play.sickStreak || 0) + 1 : 0;

  // 트리거 루트(14장) - 방금 갱신된 choiceLog 기준으로 "다음 구간(nextIndex)
  // 시점에" 활성 루트가 무엇인지 다시 계산한다(buildRouteState 주석 참고).
  // 직업 판정(occupationHistory)보다 먼저 계산해야 resolveEffectiveOccupation이
  // "출소했는지"를 알 수 있다.
  const { activeRoute: nextActiveRoute, experiencedRouteIds, routeCompletedIds: nextRouteCompletedIds, routeEndAges: nextRouteEndAges } = buildRouteState(choiceLog, nextIndex);

  // 직업 상세 - 별도 필드 없이 방금 갱신한 choiceLog에서 다시 계산한다(위
  // buildOccupationHistory 주석 참고). 이번 선택이 setOccupation을 붙였다면
  // 이 시점의 마지막 항목이 곧 그 선택으로 바뀐 새 직업이다. resolveEffectiveOccupation은
  // 징역 루트가 이미 끝났는데 직업이 'inmate'로 남아있는 경우만 ex-convict로
  // 바꿔치기한다(그 외엔 마지막 항목 그대로).
  const occupationHistory = buildOccupationHistory(choiceLog);
  const currentOccupation = resolveEffectiveOccupation(occupationHistory, nextActiveRoute);

  // 출소 회복 보정(2026-08-23, 사용자 지시 - "출소하면 스탯을 소폭 상승시키면
  // 어때?") - 발각 시 무조건 징역(위 30개 중범죄)으로 바꾼 뒤 즉사 비율이
  // 16.79%→19.18%로 튀는 걸 시뮬레이션으로 확인, 그 완충용으로 추가한 배경
  // 효과. priorRouteState.activeRoute가 prison이었는데 이번 선택으로 막
  // 끝났을 때(nextActiveRoute가 더 이상 prison이 아님) 딱 한 번만, "자유의
  // 안도감"으로 happiness·health를 소폭 회복시킨다 - 매 턴 반복되는 예술가
  // 소득·상가 임대료와 달리 "출소하는 그 순간" 1회성 사건이라 조건을
  // completed가 아닐 때로 한정한다(그 턴에 죽었으면 출소를 못 봤으므로).
  if (priorRouteState.activeRoute && priorRouteState.activeRoute.id === 'prison'
    && (!nextActiveRoute || nextActiveRoute.id !== 'prison') && !completed) {
    stats.happiness = clampStat(stats.happiness + 5);
    // blocksHealthRecovery(2026-08-24, 사용자 지시 - "건강 상태 보정이
    // 적용안되는거 찾아줘"로 발견) - 이 보너스는 위 effectiveDeltas 파이프라인을
    // 거치지 않고 stats.health를 직접 올리는 유일한 지점이라, 희귀질환·
    // 사고후유증·치매처럼 blocksHealthRecovery가 붙은 영구 조건을 갖고
    // 출소해도 이 +3만은 그대로 새 나가고 있었다. "영구 조건을 안고 있는 한
    // 건강은 더 나빠질 순 있어도 완전히 좋아지진 않는다"는 규칙과 어긋나
    // 다른 모든 양수 health delta와 동일하게 이 조건도 걸었다.
    if (!healthConditions.some((c) => c.blocksHealthRecovery)) {
      stats.health = clampStat(stats.health + 3);
    }
  }

  // 예술가 루트 인기 연동 추가 소득(2026-08-23, 사용자 지시 - "인기 스탯에
  // 따라 추가 소득 보정도 구현해줘") - 보험료 자동 납입과 같은 급의 매 턴
  // 배경 효과. 선택지와 무관하게, 루트가 활성인 동안(21~34세) 그 순간의
  // 인기 스탯이 높을수록 유명세가 곧 작품 판매·강연·의뢰로 이어진다는 설정으로
  // 현금이 자동으로 더 들어온다. cashUnitForAge(다음 나이)를 그대로 재사용해
  // "인기 50이면 그 나이대 선택 1번의 wealth 1점만큼", 인기가 오를수록
  // 최대 2배(인기 100)까지 비례해서 늘어난다.
  if (nextActiveRoute && nextActiveRoute.id === 'artist') {
    cashHoldings += Math.round(stats.fame * cashUnitForAge(nextIndex) / 50);
  }

  // 창업가·자영업자 계열 인기 연동 추가 소득(2026-08-24, 사용자 지시 - "창업가 /
  // 자영업자 계열(비슷한 계열도 포함)은 인기 스탯에 따라 추가 소득 발생하게 해줘")
  // - 예술가 루트와 같은 공식(Math.round(fame * cashUnitForAge / 50))을 그대로
  // 재사용하되, 예술가처럼 특정 루트 활성 구간(21~34세)에만 붙이지 않고
  // currentOccupation 기준으로 건다 - 자영업은 small-business 루트(21~35세)가
  // 끝난 뒤(36세~)에도 폐업 전까지 평생 그 직업을 유지하는 게 보통이라, 소득도
  // 루트 종료와 무관하게 계속 나와야 자연스럽다. entrepreneur(창업가)·
  // startup-founder(초기 창업가)·small-business-owner(자영업자)·
  // teen-entrepreneur(10대 창업가) 4개 - 전부 본인이 직접 운영하는 사업체를
  // 가진 직업이라 "인기=고객 유입·평판"으로 이어진다는 설정이 성립하고, 회사
  // 소속 직업(COMPANY_OCCUPATION_IDS)이나 컨설턴트처럼 사업체가 없는 직업은
  // 제외했다.
  const ENTREPRENEUR_OCCUPATION_IDS = ['entrepreneur', 'startup-founder', 'small-business-owner', 'teen-entrepreneur'];
  if (currentOccupation && ENTREPRENEUR_OCCUPATION_IDS.includes(currentOccupation.id)) {
    cashHoldings += Math.round(stats.fame * cashUnitForAge(nextIndex) / 50);
  }

  // 아이돌·배우 인기 연동 추가 소득(2026-08-26, 사용자 지적 - "아이돌 루트를
  // 플레이해보니 현금 수입이 전혀 없던데?") - 확인 결과 idol 직업 선택지 51개 중
  // wealth 델타가 있는 게 9개뿐이고(actor도 96개 중 28개), 예술가·창업가처럼
  // 인기 연동 패시브 소득도 아예 없어서 운이 나쁘면 활동 기간 내내 현금을 한 번도
  // 못 만질 수 있었다. 같은 공식을 그대로 재사용. 아이돌은 연습생 시절(트레이니)엔
  // 정식 수입이 없는 게 자연스러워 currentOccupation이 'idol'로 전환된 뒤부터만
  // 적용(연습생 트레이니 급여 없음 컨셉 유지) - 반면 배우는 예술가와 동일하게 무명
  // 시절(actor-newcomer)부터도 단역 출연료가 있는 게 자연스러워 루트 활성 구간
  // 전체(actor 루트, 32~46세)에 적용한다.
  if (currentOccupation && currentOccupation.id === 'idol') {
    cashHoldings += Math.round(stats.fame * cashUnitForAge(nextIndex) / 50);
  }
  if (nextActiveRoute && nextActiveRoute.id === 'actor') {
    cashHoldings += Math.round(stats.fame * cashUnitForAge(nextIndex) / 50);
  }

  // 임대사업 소득(2026-08-23 상가 도입, 2026-08-26 오피스텔로 확대 - 사용자
  // 지시 "모든 임대사업이 해당 부동산을 팔때까지 매년 일정 수입이 들어오게
  // 해줘") - 예술가 루트의 인기 연동 소득과 같은 급의 매 턴 배경 효과. 인기처럼
  // 오르내리는 스탯에 비례시킬 이유가 없어서(임대료는 세입자 유무와 무관하게
  // 고정) 통장을 팔지 않는 한(removeAsset) 매 턴 고정 금액을 그대로 더한다.
  // 상가(commercial-unit)가 오피스텔(studio-unit)보다 매입가가 더 비싸
  // (wealth -9 vs -7) 수익도 더 크게 잡았다. 첫 집(first-home)·넓은 집
  // (bigger-home)·별장(vacation-home)은 임대가 아니라 거주용 자산이라 제외.
  const RENTAL_INCOME_BY_ASSET_ID = { 'commercial-unit': 5000000, 'studio-unit': 3000000 };
  for (const assetId of Object.keys(RENTAL_INCOME_BY_ASSET_ID)) {
    if (assets.some((a) => a.id === assetId)) {
      cashHoldings += RENTAL_INCOME_BY_ASSET_ID[assetId];
    }
  }

  const updates = { stats, choiceLog, stageIndex: nextIndex, completed, healthConditions, familyMembers, acquaintances, assets, cashHoldings, talents, hobbies, sickStreak, insuranceUnpaidYears };

  let ending = null;
  let nextVisibleIds = null;
  let nextIntroId = null;
  if (completed) {
    ending = collapsed ? instantEnding.build(stage.ageRange) : resolveEnding(stats, familyMembers, healthConditions);
    updates.ending = { id: ending.id, title: ending.title, text: ending.text };
    updates.endedAt = ServerValue.TIMESTAMP;
  } else {
    // 상황 설명(intro)을 선택지보다 먼저 뽑는다 - 선택지 쪽 requiresIntro가
    // "이번에 뽑힌 상황 id"를 기준으로 걸러야 하므로 순서가 중요하다
    // (pickIntroId 참고 - 지금은 intros 배열을 가진 구간이 없어 항상 null).
    nextIntroId = pickIntroId(STAGES[nextIndex]);
    updates.currentIntroId = nextIntroId;
    // 다음 구간에서 보여줄 4개를 여기서 미리 뽑아 저장 슬롯에 남겨둔다 - 이걸
    // 지금 뽑아둬야 이어하기로 재접속했을 때도 같은 4개가 다시 뜬다. 이때
    // 방금 갱신된 healthConditions/familyMembers/assets를 기준으로
    // requiresCondition·requiresFamilyMember·requiresNoFamilyMember·
    // requiresAsset을 걸러야 "이번 선택으로 막 낫거나 생긴 조건/가족/재산"이
    // 다음 구간 노출에 바로 반영된다(예: 복권을 산 바로 다음 구간부터 "당첨
    // 확인" 선택지가 뜰 수 있어야 함).
    // 루트 진행 중엔 "완전 배타적, 예외 없음"(14장 사용자 확정)이라 건강 조건
    // 강제 치료 안전망(guaranteeCure)도 예외 없이 적용하지 않는다 - 그 몇 년
    // 동안은 루트 전용 콘텐츠만 뜨는 게 맞다.
    const guaranteeCureNow = !nextActiveRoute && sickStreak > 0 && sickStreak % 3 === 0;
    nextVisibleIds = pickVisibleChoiceIds(STAGES[nextIndex].choices, {
      conditionIds: healthConditions.map((c) => c.id),
      familyIds: familyMembers.map((f) => f.id),
      occupationId: currentOccupation ? currentOccupation.id : null,
      everOccupationIds: occupationHistory.map((o) => o.id),
      introId: nextIntroId,
      assetIds: assets.map((a) => a.id),
      assetTypes: assets.map((a) => a.type),
      locationId: currentLocation.id,
      acquaintances,
      talentIds: talents.map((t) => t.id),
      hobbyIds: hobbies.map((h) => h.id),
      guaranteeCure: guaranteeCureNow,
      activeRouteId: nextActiveRoute ? nextActiveRoute.id : null,
      experiencedRouteIds,
      routeCompletedIds: nextRouteCompletedIds,
      routeEndAges: nextRouteEndAges,
      currentAge: nextIndex,
      cashHoldings
    });
    if (!nextActiveRoute) {
      nextVisibleIds = ensureGuaranteedCure(STAGES[nextIndex].choices, nextVisibleIds, healthConditions, guaranteeCureNow);
      nextVisibleIds = ensurePetFarewell(STAGES[nextIndex].choices, nextVisibleIds, familyMembers, nextIndex, nextActiveRoute);
    }
    updates.visibleChoiceIds = nextVisibleIds;
  }

  // 선택지·엔딩 통계 카운터 - "선택지 로그"/"엔딩 로그" 통계(admin-center에서 확인)용.
  // 원본 choiceLog(플레이어별)는 이미 위 updates.choiceLog에 남으니, 여기서는 관리
  // 화면이 매번 전체 플레이스루를 훑지 않아도 되게 사전 집계된 카운터만 따로 쌓는다.
  const statWrites = [
    playRef.update(updates),
    db.ref('lifeGame/stats/choices/' + stage.id + '/' + choice.id).set(ServerValue.increment(1))
  ];
  // 해금 도감 - 루트 칸(2026-08-22, 사용자 지시로 ①번 루트 완료 후 추가) - 이번
  // 선택 이전엔 활성 루트가 있었는데(priorRouteState), 이번 선택으로 그 루트가
  // 끝났거나(endsRoute를 골랐거나 maxDurationYears 만료로 nextActiveRoute가
  // null이 됨) 그도 아니면 루트 도중에 삶 자체가 끝났으면(completed) 그 순간
  // "겪은 루트"로 기록한다 - 끝까지 못 가고 죽었어도 그 루트를 실제로 겪은
  // 건 맞기 때문.
  if (priorRouteState.activeRoute && (!nextActiveRoute || completed)) {
    statWrites.push(recordCollectionEntryIfLoggedIn(db, playRef.key, 'routes', priorRouteState.activeRoute.id));
  }
  // 해금 도감 - 재능·재산 칸(2026-08-23, 사용자 지시 - "나의 도감에 [재산 해금],
  // [재능 해금]도 추가해줘") - 루트·엔딩과 완전히 같은 패턴. isNewAsset/isNewTalent는
  // "이번 선택으로 처음 생겼다"(이미 갖고 있었으면 false)는 뜻이라, 그 항목을
  // 정확히 이번 턴에 처음 발견한 순간에만 기록된다(중복 기록 없음).
  if (isNewAsset) {
    statWrites.push(recordCollectionEntryIfLoggedIn(db, playRef.key, 'assets', choice.addAsset.id));
  }
  if (isNewTalent) {
    statWrites.push(recordCollectionEntryIfLoggedIn(db, playRef.key, 'talents', choice.addTalent.id));
  }
  // 해금 도감 - 직업 칸(2026-08-23, 사용자 지시 - "나의 도감에 직업도 추가해줘") -
  // 재능·재산과 달리 "새로" 생겼는지가 아니라 "이번 선택으로 직업이 바뀌었는지"를
  // 본다(priorOccupation !== currentOccupation) - ex-convict(징역 루트 출소,
  // resolveEffectiveOccupation의 엔진 자동 규칙)처럼 특정 선택지의 setOccupation이
  // 아니라 배경 규칙으로 바뀌는 직업도 똑같이 잡아내려면 이 방식이 맞다.
  // recordCollectionEntryIfLoggedIn은 set(true)라 이미 겪은 직업으로 다시
  // 바뀌어도(예: 이직 후 같은 직군 복귀) 그냥 덮어쓰기라 안전하다.
  if (currentOccupation && (!priorOccupation || priorOccupation.id !== currentOccupation.id)) {
    statWrites.push(recordCollectionEntryIfLoggedIn(db, playRef.key, 'occupations', currentOccupation.id));
  }
  if (completed) {
    statWrites.push(db.ref('lifeGame/stats/endings/' + ending.id).set(ServerValue.increment(1)));
    statWrites.push(db.ref('lifeGame/stats/totals/completed').set(ServerValue.increment(1)));
    statWrites.push(recordCollectionEntryIfLoggedIn(db, playRef.key, 'endings', ending.id));
  }
  // 멀티플레이 - 엔딩 도달 시에만 여기서 즉시 정리(2026-08-24, 13장 설계 구현,
  // 2026-08-24 재조정 - "호스트가 다음 버튼을 눌르면 참가자도 다음 이벤트를
  // 같이 보는거야?" 질문으로 시차가 있다는 걸 확인 후 "고쳐줘" 지시). 애초엔
  // 이 시점(선택 제출 직후)에 바로 stats/stage를 미러에 반영했는데, 그러면
  // 호스트가 결과 문구를 읽고 "다음"을 누르기도 전에 참가자 화면이 먼저
  // 다음 나이로 넘어가버리는 시차가 생겼다. 진행 중(non-completed) 갱신은
  // advanceMultiplayerSession(아래)으로 옮기고, 호스트가 실제로 "다음"을
  // 눌렀을 때만 미러가 갱신되게 했다 - 엔딩은 "다음" 단계 자체가 없이
  // 결과 확인 즉시 엔딩 화면으로 넘어가므로 여기서 바로 정리한다.
  if (mpSessionVal && completed) {
    statWrites.push(db.ref('lifeGame/multiplayerSessions/' + uid).remove());
    statWrites.push(db.ref('lifeGame/multiplayerVotes/' + uid).remove());
  } else if (mpSessionVal) {
    // 호스트가 고른 선택지를 참가자에게도 즉시 알림(2026-08-24, 사용자 지시 -
    // "호스트가 선택지 결정후에... 참여자에게도 적용시켜 호스트가 어떤
    // 선택지를 결정했는지 알게해줘") - stage/stats와 달리 이건 "다음"을
    // 누르기 전, 선택하는 그 즉시 반영해야 한다(호스트 화면의 markSelectedChoice와
    // 같은 타이밍). advanceMultiplayerSession이 다음 나이로 넘어갈 때 다시
    // null로 되돌린다.
    statWrites.push(db.ref('lifeGame/multiplayerSessions/' + uid + '/selectedChoiceId').set(choice.id));
  }
  await Promise.all(statWrites);

  // resultOptions가 붙은 선택지(예: 부모님과의 사별 - 이유를 고정하지 않고
  // 매번 랜덤으로)는 그 중 하나를 여기서 골라 보여준다. 어떤 문구가
  // 뽑혔는지는 따로 저장하지 않는다 - 다른 선택 결과 텍스트와 마찬가지로
  // 그 순간 한 번 보여주고 마는 연출이라, choiceLog에는 choiceId만 남고
  // 다시 볼 일이 없다.
  const result = choice.resultOptions && choice.resultOptions.length
    ? choice.resultOptions[Math.floor(Math.random() * choice.resultOptions.length)]
    : resolvedResult;

  return {
    stats,
    result,
    deltas: effectiveDeltas,
    prizeLabel: resolvedLabel,
    healthRecoverySuppressed,
    insuranceAvoidsCondition,
    insuranceLapsed,
    completed,
    ending: ending ? { id: ending.id, title: ending.title, text: ending.text } : null,
    nextStage: completed ? null : publicStage(STAGES[nextIndex], nextVisibleIds, nextIntroId, healthConditions),
    healthConditions,
    familyMembers,
    acquaintances,
    assets,
    cashHoldings,
    talents,
    hobbies,
    currentOccupation,
    currentLocation,
    currentRoute: completed ? null : (nextActiveRoute ? { id: nextActiveRoute.id, label: nextActiveRoute.label } : null),
    choiceHistory: completed ? buildChoiceHistory(choiceLog) : null,
    occupationHistory: completed ? occupationHistory : null,
    locationHistory: completed ? locationHistory : null
  };
}

// 그 유저의 저장 슬롯에서 진행 중인(아직 안 끝난) 플레이스루와 현재 구간을 함께
// 불러온다 - submitChoice/rollDice가 공통으로 하는 검증이라 한 곳에 모아둔다.
async function loadActivePlay(db, uid) {
  const playRef = playRefFor(db, uid);
  const snap = await playRef.get();
  const play = snap.val();
  if (!play) throw new HttpsError('not-found', '진행 중인 인생을 찾을 수 없습니다.');
  if (play.completed) throw new HttpsError('failed-precondition', '이미 끝난 인생입니다.');
  const stage = STAGES[play.stageIndex];
  if (!stage) throw new HttpsError('failed-precondition', '잘못된 진행 상태입니다.');
  return { playRef, play, stage };
}

// 04번 - 스트리머 이름을 검색해 주인공을 정하고 첫 생애 구간을 연다. 이미 그
// 계정에 저장된 판이 있었다면(진행 중이든 완료했든) 여기서 덮어쓴다 - 계정당
// 저장 슬롯 1개라, 클라이언트가 "이어하기" 대신 "새로 시작하기"를 선택했을
// 때만 이 함수를 부르게 되어 있다.
// streamerId는 선택값(검색 결과의 stocks 키) - 없어도(직접 입력한 이름) 진행 가능.
const startPlaythrough = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const streamerName = (request.data && request.data.streamerName || '').toString().trim();
  const streamerId = request.data && request.data.streamerId ? String(request.data.streamerId) : null;
  if (!streamerName || streamerName.length > MAX_NAME_LEN) {
    throw new HttpsError('invalid-argument', '주인공 이름을 1~' + MAX_NAME_LEN + '자로 입력해주세요.');
  }

  // 멀티플레이 - 시작할 때 이미 켜둔 경우의 초기값(2026-08-24, 13장 설계 구현).
  // 게임 도중에 언제든 setMultiplayerEnabled로 따로 켜고 끌 수 있어, 이 값은
  // "처음부터 켜져 있었는지"만 결정한다.
  const multiplayerEnabled = !!(request.data && request.data.multiplayerEnabled);

  const db = getDatabase();
  const stats = freshStats();
  const currentIntroId = pickIntroId(STAGES[0]);
  const visibleChoiceIds = pickVisibleChoiceIds(STAGES[0].choices, { introId: currentIntroId, locationId: DEFAULT_LOCATION.id });
  const writes = [
    playRefFor(db, uid).set({
      streamerName,
      streamerId,
      stats,
      stageIndex: 0,
      visibleChoiceIds,
      currentIntroId,
      healthConditions: [],
      familyMembers: [],
      acquaintances: [],
      assets: [],
      cashHoldings: 0,
      talents: [],
      hobbies: [],
      sickStreak: 0,
      insuranceUnpaidYears: 0,
      choiceLog: [],
      completed: false,
      // 멀티플레이 선호도 영속화(2026-08-24, 사용자 지시 - "호스트가 다시
      // 게임을 이어하면 그때 다시 참가 가능하게 해줘") - multiplayerSessions
      // 문서는 onDisconnect로 사라질 수 있어(연결 끊김 감지), "이 유저가
      // 멀티플레이를 켜뒀었는지" 자체는 이 필드로 따로 기억해둔다. 새로고침
      // 후 이어하기(enterHostMode)에서 이 값이 true인데 세션이 없으면
      // setMultiplayerEnabled(true)로 다시 만든다.
      multiplayerEnabled,
      startedAt: ServerValue.TIMESTAMP
    }),
    // 관리 센터 통계용 집계 카운터 - interior-3d-viewer의 presetGallery stats와 동일한
    // ServerValue.increment 패턴(원본 로그를 admin-center가 매번 다시 훑지 않도록
    // 이 함수가 직접 카운터를 올려둔다).
    db.ref('lifeGame/stats/totals/started').set(ServerValue.increment(1))
  ];
  if (multiplayerEnabled) {
    writes.push(db.ref('lifeGame/multiplayerSessions/' + uid).set({
      streamerName,
      streamerId,
      stats,
      stage: publicStage(STAGES[0], visibleChoiceIds, currentIntroId, []),
      participants: {},
      kickedNicknames: {},
      kickedUids: {},
      completed: false,
      createdAt: ServerValue.TIMESTAMP
    }));
  }
  await Promise.all(writes);

  return { stats, healthConditions: [], familyMembers: [], acquaintances: [], assets: [], cashHoldings: 0, talents: [], hobbies: [], currentOccupation: null, currentLocation: DEFAULT_LOCATION, currentRoute: null, stage: publicStage(STAGES[0], visibleChoiceIds, currentIntroId, []) };
});

// 창을 껐다가 다시 열었을 때 - 저장된 판이 있으면 지금 구간을 그대로 이어서
// 보여준다. 완료된 판이면(엔딩까지 보고 나간 경우) stage 없이 completed만
// 내려준다 - "이어할 진행"은 없지만 결과는 다시 보여줄 수 있게.
const resumePlaythrough = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const db = getDatabase();
  const snap = await playRefFor(db, uid).get();
  const play = snap.val();
  if (!play) throw new HttpsError('not-found', '이어할 인생이 없습니다.');

  if (play.completed) {
    return {
      streamerName: play.streamerName,
      stats: play.stats,
      completed: true,
      ending: play.ending,
      healthConditions: Array.isArray(play.healthConditions) ? play.healthConditions : [],
      familyMembers: Array.isArray(play.familyMembers) ? play.familyMembers : [],
      acquaintances: Array.isArray(play.acquaintances) ? play.acquaintances : [],
      assets: Array.isArray(play.assets) ? play.assets : [],
      cashHoldings: play.cashHoldings || 0,
      talents: Array.isArray(play.talents) ? play.talents : [],
      hobbies: Array.isArray(play.hobbies) ? play.hobbies : [],
      choiceHistory: buildChoiceHistory(play.choiceLog),
      occupationHistory: buildOccupationHistory(play.choiceLog),
      locationHistory: buildLocationHistory(play.choiceLog)
    };
  }
  const stage = STAGES[play.stageIndex];
  if (!stage) throw new HttpsError('failed-precondition', '잘못된 진행 상태입니다.');

  const healthConditions = Array.isArray(play.healthConditions) ? play.healthConditions : [];
  const familyMembers = Array.isArray(play.familyMembers) ? play.familyMembers : [];
  const acquaintances = Array.isArray(play.acquaintances) ? play.acquaintances : [];
  const assets = Array.isArray(play.assets) ? play.assets : [];
  const talents = Array.isArray(play.talents) ? play.talents : [];
  const hobbies = Array.isArray(play.hobbies) ? play.hobbies : [];
  const locationHistory = buildLocationHistory(play.choiceLog);
  const currentLocation = resolveCurrentLocation(locationHistory);
  const { activeRoute, experiencedRouteIds, routeCompletedIds, routeEndAges } = buildRouteState(play.choiceLog, play.stageIndex);
  const occupationHistory = buildOccupationHistory(play.choiceLog);
  const currentOccupation = resolveEffectiveOccupation(occupationHistory, activeRoute);

  // visibleChoiceIds/currentIntroId가 이미 저장돼 있으면 그대로 재사용해서
  // 재접속해도 같은 4개·같은 상황 설명이 다시 뜨게 한다(이 필드들이 생기기
  // 전에 만들어진 저장분 등 없을 때만 새로 뽑아서 지금부터라도 고정해둔다).
  // currentIntroId는 intros 없는 구간이면 정상값이 null이라(undefined가
  // 아니라) falsy 체크(!currentIntroId)를 쓰면 매번 다시 뽑게 되므로 반드시
  // undefined 여부로만 판단한다.
  const resumeUpdates = {};
  let currentIntroId = play.currentIntroId;
  if (currentIntroId === undefined) {
    currentIntroId = pickIntroId(stage);
    resumeUpdates.currentIntroId = currentIntroId;
  }
  let visibleChoiceIds = play.visibleChoiceIds;
  if (!visibleChoiceIds || !visibleChoiceIds.length) {
    const guaranteeCureNow = !activeRoute && (play.sickStreak || 0) > 0 && (play.sickStreak || 0) % 3 === 0;
    visibleChoiceIds = pickVisibleChoiceIds(stage.choices, {
      conditionIds: healthConditions.map((c) => c.id),
      familyIds: familyMembers.map((f) => f.id),
      occupationId: currentOccupation ? currentOccupation.id : null,
      everOccupationIds: occupationHistory.map((o) => o.id),
      introId: currentIntroId,
      assetIds: assets.map((a) => a.id),
      assetTypes: assets.map((a) => a.type),
      locationId: currentLocation.id,
      acquaintances,
      talentIds: talents.map((t) => t.id),
      hobbyIds: hobbies.map((h) => h.id),
      guaranteeCure: guaranteeCureNow,
      activeRouteId: activeRoute ? activeRoute.id : null,
      experiencedRouteIds,
      routeCompletedIds,
      routeEndAges,
      currentAge: play.stageIndex,
      cashHoldings: play.cashHoldings || 0
    });
    if (!activeRoute) {
      visibleChoiceIds = ensureGuaranteedCure(stage.choices, visibleChoiceIds, healthConditions, guaranteeCureNow);
      visibleChoiceIds = ensurePetFarewell(stage.choices, visibleChoiceIds, familyMembers, play.stageIndex, activeRoute);
    }
    resumeUpdates.visibleChoiceIds = visibleChoiceIds;
  }
  if (Object.keys(resumeUpdates).length) {
    await playRefFor(db, uid).update(resumeUpdates);
  }
  return {
    streamerName: play.streamerName,
    stats: play.stats,
    completed: false,
    healthConditions,
    familyMembers,
    acquaintances,
    assets,
    cashHoldings: play.cashHoldings || 0,
    talents,
    hobbies,
    currentOccupation,
    currentLocation,
    currentRoute: activeRoute ? { id: activeRoute.id, label: activeRoute.label } : null,
    stage: publicStage(stage, visibleChoiceIds, currentIntroId, healthConditions)
  };
});

// 선택 하나를 제출 - 서버가 정답표(game-data.js)를 갖고 있는 쪽에서만 스탯을
// 계산·반영한다(클라이언트가 stats를 직접 보내는 방식은 위변조 가능해서 안 씀).
// random:true인 구간(예: 유아기)은 여기로 못 들어온다 - 주사위로만 진행되므로
// rollDice를 쓰라고 안내한다.
const submitChoice = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const db = getDatabase();
  const choiceId = request.data && request.data.choiceId;
  if (!choiceId) throw new HttpsError('invalid-argument', 'choiceId가 필요합니다.');

  const { playRef, play, stage } = await loadActivePlay(db, uid);
  if (stage.random) {
    throw new HttpsError('failed-precondition', '이 구간은 직접 고를 수 없습니다. rollDice로 진행해주세요.');
  }
  // 합성 치료 선택지(id 'treat:<conditionId>', ensureGuaranteedCure 참고)는
  // game-data.js의 stage.choices에 없으므로 resolveSyntheticChoice로 따로
  // 되짚어 찾는다. 보험 가입 중이면 치료비가 일부만(할인) 나가므로 지금
  // 재산 상태에서 hasInsurance를 같이 넘긴다.
  const choice = (String(choiceId).startsWith('treat:') || choiceId === 'farewell:pet')
    ? resolveSyntheticChoice(
        choiceId,
        Array.isArray(play.healthConditions) ? play.healthConditions : [],
        (Array.isArray(play.assets) ? play.assets : []).some((a) => a.id === 'insurance')
      )
    : findChoiceById(stage, choiceId);
  if (!choice) throw new HttpsError('invalid-argument', '유효하지 않은 선택지입니다.');
  // 화면에 노출되지 않은(그 회차에 뽑히지 않은) 선택지를 우회로 제출하는 걸 막는다.
  if (play.visibleChoiceIds && play.visibleChoiceIds.length && !play.visibleChoiceIds.includes(choiceId)) {
    throw new HttpsError('invalid-argument', '지금 화면에 없는 선택지입니다.');
  }

  return applyChoice(db, playRef, play, stage, choice);
});

// 주사위 굴리기 - random:true인 구간(예: 유아기, "태어날 집안은 스스로 고를 수
// 없다") 전용. 클라이언트는 choiceId를 보내지 않고, 서버가 stage.choices 중
// 하나를 균등 확률로 직접 뽑는다 - 어떤 결과가 나왔는지는 응답의 choiceId/result로
// 알려준다.
const rollDice = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const db = getDatabase();
  const { playRef, play, stage } = await loadActivePlay(db, uid);
  if (!stage.random) {
    throw new HttpsError('failed-precondition', '이 구간은 주사위가 아니라 직접 골라야 합니다.');
  }
  // 화면에 보여준(노출된) 4개 중에서만 뽑는다 - 미리보기로 안 보여준 선택지가
  // 당첨되면 플레이어 입장에서 "보지도 못한 결과"가 튀어나오는 셈이라 안 됨.
  const pool = play.visibleChoiceIds && play.visibleChoiceIds.length
    ? stage.choices.filter((c) => play.visibleChoiceIds.includes(c.id))
    : stage.choices;
  const choice = pool[Math.floor(Math.random() * pool.length)];

  const outcome = await applyChoice(db, playRef, play, stage, choice);
  return Object.assign({ choiceId: choice.id, choiceText: choice.text }, outcome);
});

// 완료한 인생을 공개 갤러리에 공유 - 실제 스트리머 이름이 걸린 채 공개되므로
// (기획안 09장 B) 같은 플레이는 한 번만 공유되게 막는다.
const shareToGallery = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const db = getDatabase();
  const playRef = playRefFor(db, uid);
  const snap = await playRef.get();
  const play = snap.val();
  if (!play) throw new HttpsError('not-found', '진행 중인 인생을 찾을 수 없습니다.');
  if (!play.completed) throw new HttpsError('failed-precondition', '아직 끝나지 않은 인생은 공유할 수 없습니다.');
  if (play.galleryEntryId) throw new HttpsError('already-exists', '이미 갤러리에 공유한 인생입니다.');

  const galleryRef = db.ref('lifeGame/gallery').push();
  // 리더보드(방송 콘텐츠 백로그 7번째 항목, 2026-08-17)용으로 cashHoldings·
  // endedAtAge를 추가로 저장한다 - 기존엔 stats/ending만 있어서 "역대 최고
  // 부자"/"최연소 사망" 같은 랭킹을 매길 수 없었다. endedAtAge는 showEnding()의
  // "곁에 남은 가족" 패널 제목 계산과 같은 방식(choiceHistory 마지막 항목의
  // ageRange)으로 구한다 - 즉시 사망 엔딩은 100세가 아니라 그 전 나이에
  // 끝나므로 이렇게 구해야 정확하다.
  const choiceHistoryForShare = buildChoiceHistory(play.choiceLog);
  const endedAtAge = choiceHistoryForShare.length
    ? parseInt(choiceHistoryForShare[choiceHistoryForShare.length - 1].ageRange, 10)
    : 100;
  // 갤러리 목록 실시간 구독(lifeGame/gallery 전체를 onValue로 받음)이 매번 이 선택
  // 기록까지 통째로 내려받지 않도록, 선택 로그는 별도 노드(galleryChoiceLogs)에
  // 따로 저장해둔다 - 클릭해서 펼칠 때만 그 항목 하나를 골라 읽는다.
  // galleryDetails(2026-08-18, 사용자 지시 - "갤러리에 공유된 다른 유저 인생을
  // 볼때도 스탯과 상세 기능이 기록되게 해줘")도 같은 이유로 별도 노드다 -
  // 건강·가족·지인·재산·직업·장소 상세는 목록 화면에서 전혀 안 쓰이고 펼쳤을
  // 때만 필요하므로, galleryChoiceLogs와 똑같이 펼칠 때만 그 항목 하나만 읽게
  // 분리한다. stats(다섯 스탯 최종값)는 이미 galleryRef 쪽에 있었지만 지금까지
  // 클라이언트가 렌더링을 안 하고 있었어서 이번에 같이 표시하게 됨.
  const galleryDetails = {
    healthConditions: Array.isArray(play.healthConditions) ? play.healthConditions : [],
    familyMembers: Array.isArray(play.familyMembers) ? play.familyMembers : [],
    acquaintances: Array.isArray(play.acquaintances) ? play.acquaintances : [],
    assets: Array.isArray(play.assets) ? play.assets : [],
    talents: Array.isArray(play.talents) ? play.talents : [],
    hobbies: Array.isArray(play.hobbies) ? play.hobbies : [],
    occupationHistory: buildOccupationHistory(play.choiceLog),
    locationHistory: buildLocationHistory(play.choiceLog)
  };
  await Promise.all([
    galleryRef.set({
      streamerName: play.streamerName,
      streamerId: play.streamerId || null,
      ending: play.ending,
      stats: play.stats,
      cashHoldings: play.cashHoldings || 0,
      endedAtAge,
      uid,
      sharedAt: ServerValue.TIMESTAMP
    }),
    db.ref('lifeGame/galleryChoiceLogs/' + galleryRef.key).set(buildChoiceHistory(play.choiceLog)),
    db.ref('lifeGame/galleryDetails/' + galleryRef.key).set(galleryDetails),
    playRef.update({ galleryEntryId: galleryRef.key }),
    db.ref('lifeGame/stats/totals/shared').set(ServerValue.increment(1))
  ]);

  return { galleryId: galleryRef.key };
});

// 갤러리 항목 신고 - StreamBet-Market의 nicknameReports와 동일 패턴(제출은 로그인만
// 하면 누구나, 열람은 관리자만 - database.rules.json 참고).
const reportGalleryEntry = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const entryId = request.data && request.data.entryId;
  const reason = (request.data && request.data.reason || '').toString().trim().slice(0, MAX_REPORT_REASON_LEN);
  if (!entryId) throw new HttpsError('invalid-argument', 'entryId가 필요합니다.');

  const db = getDatabase();
  const entrySnap = await db.ref('lifeGame/gallery/' + entryId).get();
  if (!entrySnap.exists()) throw new HttpsError('not-found', '갤러리 항목을 찾을 수 없습니다.');

  await db.ref('lifeGame/galleryReports').push({
    entryId,
    reason,
    reporterUid: uid,
    reportedAt: ServerValue.TIMESTAMP
  });

  return { ok: true };
});

// 관리자 - 다른 유저 인생 로그(진행 중이거나 완료된 플레이스루) 삭제(2026-08-24,
// 사용자 지시 - "관리자 uid는 다른 유저 인생 로그를 삭제 가능하게 해줘"). 이
// 생태계 다른 프로젝트들과 동일하게 adminCenter/adminUids/{uid}가 true인
// 계정만 허용(common.js의 isAdminUid, 이미 export만 돼 있고 그동안 실제로 쓰인
// 곳은 없었음). lifeGame/playthroughs/{targetUid} 하나만 지운다 - 해금 도감
// (lifeGame/collection)은 여러 판에 걸쳐 누적되는 별개 데이터라 같이 안
// 지운다(요청 범위는 "그 인생 로그"이지 도감 진행도가 아님). 이미 공유된
// 갤러리 항목(lifeGame/gallery)도 별도 노드라 영향 없음 - 그건 신고 처리
// (reportGalleryEntry)로 별도 관리한다.
const adminDeletePlaythrough = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  if (!(await isAdminUid(uid))) {
    throw new HttpsError('permission-denied', '관리자만 사용할 수 있는 기능입니다.');
  }
  const targetUid = request.data && request.data.targetUid;
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid가 필요합니다.');

  const db = getDatabase();
  const targetRef = db.ref('lifeGame/playthroughs/' + targetUid);
  const snap = await targetRef.get();
  if (!snap.exists()) throw new HttpsError('not-found', '해당 유저의 인생 로그를 찾을 수 없습니다.');

  await targetRef.remove();
  return { ok: true, deletedUid: targetUid };
});

// 관리자 - 갤러리에 공유된 항목 삭제(2026-08-24, 사용자 지시 - "관리자 uid로
// 다른 인생 갤러리에서 로그 삭제 가능하게 수정해달라고 지시했었는데 어떻게
// 삭제하는지 알려줘" → 실제로는 adminDeletePlaythrough가 playthroughs만
// 지우고 lifeGame/gallery는 별도 노드라 갤러리 화면엔 전혀 반영이 안 됐던
// 걸 발견해 새로 추가). galleryChoiceLogs·galleryDetails까지 같은 entryId로
// 함께 지우고, 원본 소유자의 playthroughs/{uid}에 남아있는 galleryEntryId가
// 이 entryId를 가리키고 있을 때만(이미 새 판을 시작해 galleryEntryId가
// 다른 값으로 바뀌었거나 아예 없어졌을 수 있어 무작정 지우면 안 됨) 그
// 필드만 제거해 재공유가 가능하게 정리한다 - playthroughs 자체는 건드리지
// 않는다(그건 adminDeletePlaythrough의 책임).
const adminDeleteGalleryEntry = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  if (!(await isAdminUid(uid))) {
    throw new HttpsError('permission-denied', '관리자만 사용할 수 있는 기능입니다.');
  }
  const entryId = request.data && request.data.entryId;
  if (!entryId) throw new HttpsError('invalid-argument', 'entryId가 필요합니다.');

  const db = getDatabase();
  const entryRef = db.ref('lifeGame/gallery/' + entryId);
  const entrySnap = await entryRef.get();
  if (!entrySnap.exists()) throw new HttpsError('not-found', '갤러리 항목을 찾을 수 없습니다.');
  const ownerUid = entrySnap.val().uid;

  const tasks = [
    entryRef.remove(),
    db.ref('lifeGame/galleryChoiceLogs/' + entryId).remove(),
    db.ref('lifeGame/galleryDetails/' + entryId).remove()
  ];
  if (ownerUid) {
    const ownerPlayRef = db.ref('lifeGame/playthroughs/' + ownerUid);
    const ownerSnap = await ownerPlayRef.get();
    if (ownerSnap.exists() && ownerSnap.val().galleryEntryId === entryId) {
      tasks.push(ownerPlayRef.child('galleryEntryId').remove());
    }
  }
  await Promise.all(tasks);
  return { ok: true, deletedEntryId: entryId };
});

// ------------------------------------------------------------
// 멀티플레이 시청자 참여(13장, 2026-08-24 구현 착수) - 설계는 기획서 13장 참고.
// 호스트 단독 결정권(투표는 표시용) 원칙이라, playthroughs는 그대로 두고
// multiplayerSessions/multiplayerVotes/multiplayerAdShown 세 개의 새 공개
// 노드만 쓴다.
// ------------------------------------------------------------

// 게임 도중 언제든 멀티플레이를 켜고 끄는 토글(2026-08-19, 사용자 확정 -
// "게임도중 멀티플레이 허용 토글 변경가능"). 켜면 그 순간의 현재 상태로
// multiplayerSessions를 새로 만들고(startPlaythrough가 처음부터 켠 경우와
// 결과가 같아지도록), 끄면 문서를 통째로 지운다 - 그 순간 접속해 있던
// 참가자들의 이후 투표 쓰기는 참가자 존재 확인이 실패하면서 자연히 막힌다.
const setMultiplayerEnabled = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const enabled = !!(request.data && request.data.enabled);
  const db = getDatabase();
  const mpRef = db.ref('lifeGame/multiplayerSessions/' + uid);
  const playRef = playRefFor(db, uid);
  if (!enabled) {
    await Promise.all([mpRef.remove(), playRef.child('multiplayerEnabled').set(false)]);
    return { ok: true, enabled: false };
  }
  const playSnap = await playRef.get();
  const play = playSnap.val();
  if (!play) throw new HttpsError('not-found', '진행 중인 인생을 찾을 수 없습니다.');
  if (play.completed) throw new HttpsError('failed-precondition', '이미 끝난 인생은 멀티플레이를 켤 수 없습니다.');
  await Promise.all([
    mpRef.set({
      streamerName: play.streamerName,
      streamerId: play.streamerId || null,
      stats: play.stats,
      stage: publicStage(STAGES[play.stageIndex], play.visibleChoiceIds, play.currentIntroId, play.healthConditions || []),
      participants: {},
      kickedNicknames: {},
      kickedUids: {},
      completed: false,
      createdAt: ServerValue.TIMESTAMP
    }),
    playRef.child('multiplayerEnabled').set(true)
  ]);
  return { ok: true, enabled: true };
});

// 호스트가 "다음" 버튼을 눌러 실제로 다음 나이 화면으로 넘어가는 그 순간에만
// 공개 미러를 갱신(2026-08-24, 사용자 지시 - "호스트가 다음 버튼을 눌르면
// 참가자도 다음 이벤트를 같이 보는거야?" → "고쳐줘"). submitChoice/rollDice
// 시점엔 이미 playthroughs/{uid}에 다음 나이 상태가 전부 저장돼 있으므로,
// 이 함수는 그걸 그대로 읽어 multiplayerSessions/{uid}에 옮겨 적기만 한다 -
// 새로 계산하는 게 없어 game-data.js 재해석 위험이 없다. 세션이 없으면
// (그 사이 토글이 꺼졌거나 애초에 멀티플레이가 아니면) 조용히 아무 일도
// 하지 않는다 - 클라이언트가 "호스트 모드일 때만" 호출하지만 방어적으로 둔다.
const advanceMultiplayerSession = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const db = getDatabase();
  const mpRef = db.ref('lifeGame/multiplayerSessions/' + uid);
  const mpSnap = await mpRef.get();
  if (!mpSnap.exists()) return { ok: true, mirrored: false };

  const playSnap = await playRefFor(db, uid).get();
  const play = playSnap.val();
  if (!play || play.completed) return { ok: true, mirrored: false };

  await mpRef.update({
    stats: play.stats,
    stage: publicStage(STAGES[play.stageIndex], play.visibleChoiceIds, play.currentIntroId, play.healthConditions || []),
    // 다음 나이로 넘어가는 시점이므로 지난 턴에 골랐던 선택지 표시는 지운다 -
    // 새 나이는 아직 아무도 고르지 않은 상태여야 한다.
    selectedChoiceId: null
  });
  return { ok: true, mirrored: true };
});

// 참가자 닉네임 형식(사용자 확정) - 한글 1~6자.
const MULTIPLAYER_NICKNAME_REGEX = /^[가-힣]{1,6}$/;

// 참가자가 진행중인 게임에 입장 - 닉네임 검증 → kickedUids/kickedNicknames
// 확인(2026-08-24, 사용자 지시로 kickedUids 추가 - 강퇴된 uid는 닉네임을
// 바꿔도 재입장 불가) → participants에 등록 → 전면 광고 노출 여부 판단
// (2026-08-22 확정, "그 세션당 1회" - multiplayerAdShown으로 판정).
const joinMultiplayerSession = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const hostUid = request.data && request.data.hostUid;
  const nickname = (request.data && request.data.nickname || '').toString().trim();
  if (!hostUid) throw new HttpsError('invalid-argument', 'hostUid가 필요합니다.');
  if (!MULTIPLAYER_NICKNAME_REGEX.test(nickname)) {
    throw new HttpsError('invalid-argument', '닉네임은 한글 1~6자로 입력해주세요.');
  }
  const db = getDatabase();
  const mpRef = db.ref('lifeGame/multiplayerSessions/' + hostUid);
  const mpSnap = await mpRef.get();
  if (!mpSnap.exists()) throw new HttpsError('not-found', '진행 중인 게임을 찾을 수 없습니다.');
  const mpVal = mpSnap.val();
  const kickedUids = mpVal.kickedUids || {};
  if (kickedUids[uid]) {
    throw new HttpsError('permission-denied', '이 게임에서 강퇴되어 다시 참여할 수 없습니다.');
  }
  const kickedNicknames = mpVal.kickedNicknames || {};
  if (kickedNicknames[nickname]) {
    throw new HttpsError('invalid-argument', '강퇴 이력이 있는 닉네임입니다. 다른 닉네임을 사용해주세요.');
  }

  const adShownRef = db.ref('lifeGame/multiplayerAdShown/' + hostUid + '/' + uid);
  const adShownSnap = await adShownRef.get();
  const alreadyShown = adShownSnap.exists();
  const tasks = [mpRef.child('participants/' + uid).set(nickname)];
  if (!alreadyShown) tasks.push(adShownRef.set(true));
  await Promise.all(tasks);
  return { ok: true, showAd: !alreadyShown };
});

// 참가자가 스스로 게임에서 나가기(2026-08-24, 사용자 지시 - "참가자가
// 호스트의 게임에서 나가면 호스트 화면에서도 갱신되게 해줘"). kickParticipant와
// 달리 자발적 퇴장이라 kickedUids/kickedNicknames는 건드리지 않는다 - 나중에
// 다시 참가하고 싶으면 그냥 다시 참가할 수 있어야 하기 때문. participants에서
// 빠지는 순간 호스트 쪽 multiplayerSessions 구독이 자동으로 다시 그려지고
// (기존 onValue 패턴), 참가자 본인의 이후 투표 쓰기도 participants 존재 확인이
// 실패하면서 자연히 막힌다.
const leaveMultiplayerSession = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const hostUid = request.data && request.data.hostUid;
  if (!hostUid) throw new HttpsError('invalid-argument', 'hostUid가 필요합니다.');
  const db = getDatabase();
  const mpRef = db.ref('lifeGame/multiplayerSessions/' + hostUid);
  const mpSnap = await mpRef.get();
  if (!mpSnap.exists()) return { ok: true, left: false };
  const mpVal = mpSnap.val();
  const participants = mpVal.participants || {};
  if (!participants[uid]) return { ok: true, left: false };

  const tasks = [mpRef.child('participants/' + uid).remove()];
  const stageId = mpVal.stage && mpVal.stage.id;
  if (stageId) {
    tasks.push(db.ref('lifeGame/multiplayerVotes/' + hostUid + '/' + stageId + '/' + uid).remove());
  }
  await Promise.all(tasks);
  return { ok: true, left: true };
});

// 호스트가 참가자를 강퇴 - 참가자 목록에서 제거하고, uid·닉네임 둘 다
// 블록리스트에 올려 재입장을 막는다(2026-08-24, 사용자 지시 - "강퇴시 uid도
// 해당게임에 재입장 불가하게 해줘"). 현재 구간 투표에서도 즉시 제외하고,
// 지인 이름 자동 재배정(2026-08-21 확정) - 호스트의 acquaintances/
// familyMembers 중 강퇴된 닉네임과 정확히 일치하는 이름을 새 무작위 이름으로
// 교체해 부적절한 이름이 남지 않게 한다.
const kickParticipant = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const hostUid = requireAuth(request);
  const targetUid = request.data && request.data.targetUid;
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid가 필요합니다.');
  const db = getDatabase();
  const mpRef = db.ref('lifeGame/multiplayerSessions/' + hostUid);
  const mpSnap = await mpRef.get();
  if (!mpSnap.exists()) throw new HttpsError('not-found', '진행 중인 게임을 찾을 수 없습니다.');
  const mpVal = mpSnap.val();
  const participants = mpVal.participants || {};
  const targetNickname = participants[targetUid];
  if (!targetNickname) throw new HttpsError('not-found', '참가자를 찾을 수 없습니다.');

  const tasks = [
    mpRef.child('participants/' + targetUid).remove(),
    mpRef.child('kickedUids/' + targetUid).set(true),
    mpRef.child('kickedNicknames/' + targetNickname).set(true)
  ];
  const stageId = mpVal.stage && mpVal.stage.id;
  if (stageId) {
    tasks.push(db.ref('lifeGame/multiplayerVotes/' + hostUid + '/' + stageId + '/' + targetUid).remove());
  }

  const hostPlayRef = playRefFor(db, hostUid);
  const hostPlaySnap = await hostPlayRef.get();
  const hostPlay = hostPlaySnap.val();
  if (hostPlay) {
    const usedNames = new Set([
      ...(Array.isArray(hostPlay.acquaintances) ? hostPlay.acquaintances.map((a) => a.name) : []),
      ...(Array.isArray(hostPlay.familyMembers) ? hostPlay.familyMembers.filter((f) => f.name).map((f) => f.name) : [])
    ]);
    const renamePick = () => {
      let name = pickRandomStreamerName();
      let retries = 0;
      while (usedNames.has(name) && retries < 10) { name = pickRandomStreamerName(); retries++; }
      usedNames.add(name);
      return name;
    };
    let acqChanged = false;
    const acquaintances = (Array.isArray(hostPlay.acquaintances) ? hostPlay.acquaintances : []).map((a) => {
      if (a.name === targetNickname) { acqChanged = true; return Object.assign({}, a, { name: renamePick() }); }
      return a;
    });
    let famChanged = false;
    const familyMembers = (Array.isArray(hostPlay.familyMembers) ? hostPlay.familyMembers : []).map((f) => {
      if (f.name === targetNickname) { famChanged = true; return Object.assign({}, f, { name: renamePick() }); }
      return f;
    });
    if (acqChanged) tasks.push(hostPlayRef.child('acquaintances').set(acquaintances));
    if (famChanged) tasks.push(hostPlayRef.child('familyMembers').set(familyMembers));
  }

  await Promise.all(tasks);
  return { ok: true, kickedUid: targetUid };
});

module.exports = { startPlaythrough, resumePlaythrough, submitChoice, rollDice, shareToGallery, reportGalleryEntry, linkGoogleAccount, linkKakaoAccount, adminDeletePlaythrough, adminDeleteGalleryEntry, setMultiplayerEnabled, joinMultiplayerSession, kickParticipant, advanceMultiplayerSession, leaveMultiplayerSession };
