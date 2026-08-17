const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');
const { STAT_KEYS, STAT_START, clampStat, requireAuth } = require('./common');
const {
  STAGES,
  resolveEnding,
  buildCollapseEnding,
  buildBankruptcyEnding,
  buildObscurityEnding,
  buildDespairEnding,
  buildIsolationEnding
} = require('./game-data');

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
// 실제 고른 선택지의 text를 그대로 내려도 된다.
function buildChoiceHistory(choiceLog) {
  if (!Array.isArray(choiceLog)) return [];
  const history = [];
  for (const entry of choiceLog) {
    const stage = STAGE_BY_ID.get(entry.stageId);
    const choice = stage && stage.choices.find((c) => c.id === entry.choiceId);
    if (!stage || !choice) continue;
    history.push({ stageId: stage.id, stageName: stage.name, ageRange: stage.ageRange, choiceText: choice.text });
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
    const choice = stage && stage.choices.find((c) => c.id === entry.choiceId);
    if (!stage || !choice || !choice.setOccupation) continue;
    history.push({ id: choice.setOccupation.id, label: choice.setOccupation.label, stageId: stage.id, ageRange: stage.ageRange });
  }
  return history;
}

// 계정당 저장 슬롯 1개 - lifeGame/playthroughs/{uid}가 push id 없이 그 유저의
// "그 한 판"을 직접 가리킨다(예전엔 .../{uid}/{playId}로 여러 판을 쌓을 수
// 있었지만, "창을 꺼도 이어할 수 있게" 요청에 맞춰 계정당 1개로 단순화했다 -
// 새로 시작하면 기존 진행 중이던 판을 덮어쓴다).
function playRefFor(db, uid) {
  return db.ref('lifeGame/playthroughs/' + uid);
}

// 구간마다 최대 6~8개까지 채워둔 choices 중 실제로 그 회차에 "노출"할 3개를
// 무작위로 고른다 - 매번 같은 3개만 뜨면 재미가 없고, 그렇다고 다 보여주면
// 화면이 복잡해지니 매 판마다 다른 3개가 뜨게 한다. requiresCondition이 붙은
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
// 후보가 3개 이하면 그냥 전부 노출한다. mandatory가 붙은 선택지(자격만
// 되면 반드시 겪어야 하는 이벤트 - 예: 50대에 부모님과 사별)는 3개 무작위
// 추첨에서 밀려날 일 없이 항상 노출 목록에 들어가고, 나머지 자리만 무작위로
// 채운다.
function pickVisibleChoiceIds(choices, activeConditionIds, activeFamilyMemberIds, currentOccupationId, currentIntroId) {
  const conditionIds = activeConditionIds || [];
  const familyIds = activeFamilyMemberIds || [];
  const eligible = choices.filter((c) => {
    if (c.requiresCondition && !conditionIds.includes(c.requiresCondition)) return false;
    if (c.requiresNoCondition && c.requiresNoCondition.some((id) => conditionIds.includes(id))) return false;
    if (c.requiresFamilyMember && !c.requiresFamilyMember.some((id) => familyIds.includes(id))) return false;
    if (c.requiresNoFamilyMember && c.requiresNoFamilyMember.some((id) => familyIds.includes(id))) return false;
    if (c.requiresAllFamilyMemberGroups && !c.requiresAllFamilyMemberGroups.every((group) => group.some((id) => familyIds.includes(id)))) return false;
    if (c.requiresOccupation && !c.requiresOccupation.includes(currentOccupationId || null)) return false;
    if (c.requiresAnyOccupation && !currentOccupationId) return false;
    if (c.requiresIntro && c.requiresIntro !== currentIntroId) return false;
    return true;
  });
  if (eligible.length <= 3) return eligible.map((c) => c.id);

  const mandatory = eligible.filter((c) => c.mandatory);
  const optional = eligible.filter((c) => !c.mandatory);
  const shuffled = optional.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const remainingSlots = Math.max(0, 3 - mandatory.length);
  return mandatory.concat(shuffled.slice(0, remainingSlots)).map((c) => c.id);
}

const LAST_STAGE_INDEX = STAGES.length - 1; // 100세(index 100)

// 100세 외에 "반드시 방문하는" 나이 - 오름차순으로 나열. 지금은 54세
// (parent-passing-50s - 부모님과의 사별, requiresFamilyMember로 걸려있어
// 실제 발동은 그 시점에 부모님이 가족에 있을 때만) 하나뿐이지만, 나중에
// 더 늘려도 이 배열에 나이만 추가하면 된다.
const MANDATORY_WAYPOINTS = [54];

// STAGES의 인덱스가 곧 나이(0~100)와 정확히 일치한다는 전제 하에, 다음 선택
// 후 몇 살로 넘어갈지 정한다. 0~4세는 지금까지처럼 선택 한 번에 1세씩 오르고,
// 5~99세는 선택 한 번에 1~5세를 무작위로 건너뛴다 - 단 아직 안 지난 필수
// 방문 나이(MANDATORY_WAYPOINTS, 없으면 100세)를 절대 지나치지 않도록 그
// 나이까지 남은 거리로 무작위 폭을 잘라낸다. 이 덕분에 100세뿐 아니라
// MANDATORY_WAYPOINTS에 넣은 나이도 스킵될 수 없이 반드시 방문되며(이후엔
// 다음 필수 방문 나이 - 없으면 100세 - 를 기준으로 같은 로직이 반복됨),
// 건너뛴 나이는 애초에 STAGES[nextIndex]로 방문된 적이 없으니 choiceLog(=
// 지금까지 선택한 선택지 로그)에도 자연히 안 남는다.
function pickNextStageIndex(currentIndex) {
  if (currentIndex >= LAST_STAGE_INDEX) return currentIndex + 1; // 100세 구간의 선택 -> 완료 처리
  if (currentIndex < 5) return currentIndex + 1;
  const nextWaypoint = MANDATORY_WAYPOINTS.find((age) => age > currentIndex) || LAST_STAGE_INDEX;
  const maxJump = Math.min(5, nextWaypoint - currentIndex);
  return currentIndex + 1 + Math.floor(Math.random() * maxJump);
}

// 아직 안 고른 구간의 선택지는 deltas/result를 절대 클라이언트로 보내지 않는다
// (기획안 04장 "선택지 문장만 보고 결과를 예측할 수 없어야 한다"를 서버에서도
// 강제 - 개발자 도구로 응답을 뜯어봐도 결과가 안 보이게). random:true인 구간은
// "고르는" 게 아니라 "굴리는" 구간이라는 걸 클라이언트에 알려준다(태어날 집안처럼
// 본인이 선택할 수 없는 것들 - submitChoice가 아니라 rollDice로만 진행 가능).
//
// visibleIds가 주어지면(그 판의 저장 슬롯에 이미 뽑아둔 3개) choices를 그
// 3개로만 필터링해서 내려준다 - 안 보여준 선택지가 나중에 rollDice 결과로
// 튀어나오는 일이 없도록, "노출 = 실제로 뽑힐 수 있는 후보"가 항상 일치해야 함.
// introId가 주어지면(그 판의 저장 슬롯에 이미 뽑아둔 상황 설명 id) 그
// 상황의 텍스트를 resolveIntroText로 찾아 쓴다 - pickIntroId() 참고.
function publicStage(stage, visibleIds, introId) {
  const ids = visibleIds && visibleIds.length ? visibleIds : pickVisibleChoiceIds(stage.choices, null, null, null, introId);
  const visibleChoices = stage.choices.filter((c) => ids.includes(c.id));
  return {
    id: stage.id,
    name: stage.name,
    ageRange: stage.ageRange,
    intro: resolveIntroText(stage, introId),
    random: !!stage.random,
    choices: visibleChoices.map((c) => ({ id: c.id, text: c.text }))
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
  const priorOccupationHistory = buildOccupationHistory(Array.isArray(play.choiceLog) ? play.choiceLog : []);
  const priorOccupationId = priorOccupationHistory.length ? priorOccupationHistory[priorOccupationHistory.length - 1].id : null;
  if (choice.requiresOccupation && !choice.requiresOccupation.includes(priorOccupationId)) {
    throw new HttpsError('failed-precondition', '지금 직업 상태에서는 고를 수 없는 선택지입니다.');
  }
  if (choice.requiresAnyOccupation && !priorOccupationId) {
    throw new HttpsError('failed-precondition', '지금 직업 상태에서는 고를 수 없는 선택지입니다.');
  }
  if (choice.requiresIntro && choice.requiresIntro !== play.currentIntroId) {
    throw new HttpsError('failed-precondition', '지금 상황에서는 고를 수 없는 선택지입니다.');
  }

  // blocksHealthRecovery가 붙은 조건(예: 희귀 난치병)을 이미 갖고 있으면,
  // 이번 선택이 건강을 "회복시키는" 방향(양수 delta)이어도 그 효과가 막힌다 -
  // 난치병을 안고 있는 한 몸은 더 나빠질 순 있어도 완전히 좋아지진 않는다는
  // 의도. 실제로 막혔을 때만 클라이언트에 알려줘서(healthRecoverySuppressed)
  // "선택했는데 건강 바가 그대로"인 게 버그처럼 안 보이게 한다.
  const healthRecoveryBlocked = currentConditions.some((c) => c.blocksHealthRecovery);
  const effectiveDeltas = Object.assign({}, choice.deltas || {});
  let healthRecoverySuppressed = false;
  if (healthRecoveryBlocked && effectiveDeltas.health > 0) {
    effectiveDeltas.health = 0;
    healthRecoverySuppressed = true;
  }

  const stats = Object.assign({}, play.stats);
  for (const key of Object.keys(effectiveDeltas)) {
    stats[key] = clampStat((stats[key] || 0) + effectiveDeltas[key]);
  }

  // 건강 상세 - 선택지가 addCondition을 붙였으면 부상/질병이 새로 생기고(이미
  // 있으면 중복 추가 안 함), removeCondition을 붙였으면 그 조건이 나아서 빠진다.
  let healthConditions = currentConditions.slice();
  if (choice.addCondition && !healthConditions.some((c) => c.id === choice.addCondition.id)) {
    healthConditions.push({
      id: choice.addCondition.id,
      label: choice.addCondition.label,
      sinceStageId: stage.id,
      blocksHealthRecovery: !!choice.addCondition.blocksHealthRecovery,
      causesChoiceFadeout: !!choice.addCondition.causesChoiceFadeout
    });
  }
  if (choice.removeCondition) {
    healthConditions = healthConditions.filter((c) => c.id !== choice.removeCondition);
  }

  // 가족 상세 - addFamilyMembers에 담긴 항목들이 새 가족으로 생기고(이미 있으면
  // 중복 추가 안 함), removeFamilyMembers에 담긴 id들은 가족에서 빠진다(사망·
  // 이혼 등). 부모님 사망처럼 "father/mother/single-parent 중 있는 걸 전부
  // 제거"하는 경우도 있어 removeFamilyMembers는 항상 배열이다.
  let familyMembers = currentFamilyMembers.slice();
  if (choice.addFamilyMembers) {
    for (const member of choice.addFamilyMembers) {
      if (!familyMembers.some((f) => f.id === member.id)) {
        familyMembers.push({ id: member.id, label: member.label, sinceStageId: stage.id });
      }
    }
  }
  if (choice.removeFamilyMembers) {
    familyMembers = familyMembers.filter((f) => !choice.removeFamilyMembers.includes(f.id));
  }

  // 재산 상세 - 건강/가족 상세와 완전히 같은 패턴. 선택지가 addAsset을 붙였으면
  // 현금/부동산/동산 중 하나가 새로 생기고(이미 있으면 중복 추가 안 함),
  // removeAsset을 붙였으면 그 재산이 처분돼서 빠진다.
  const currentAssets = Array.isArray(play.assets) ? play.assets : [];
  let assets = currentAssets.slice();
  if (choice.addAsset && !assets.some((a) => a.id === choice.addAsset.id)) {
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

  const choiceLog = Array.isArray(play.choiceLog) ? play.choiceLog.slice() : [];
  choiceLog.push({ stageId: stage.id, choiceId: choice.id, at: Date.now() });

  // 직업 상세 - 별도 필드 없이 방금 갱신한 choiceLog에서 다시 계산한다(위
  // buildOccupationHistory 주석 참고). 이번 선택이 setOccupation을 붙였다면
  // 이 시점의 마지막 항목이 곧 그 선택으로 바뀐 새 직업이다.
  const occupationHistory = buildOccupationHistory(choiceLog);
  const currentOccupation = occupationHistory.length ? occupationHistory[occupationHistory.length - 1] : null;

  // 다섯 스탯 중 하나라도 0 이하로 떨어지면 100세를 못 채우고 그 자리에서
  // 삶이 끝난다 - pickNextStageIndex가 정한 다음 나이와 무관하게 즉시
  // completed 처리. INSTANT_ENDING_BUILDERS 순서대로 검사해 가장 먼저 해당된
  // 스탯의 전용 엔딩을 쓴다(여러 스탯이 같은 선택에서 동시에 0을 찍어도
  // 항상 같은 결과가 나오도록 순서 고정).
  const instantEnding = INSTANT_ENDING_BUILDERS.find((e) => stats[e.stat] <= 0);
  const collapsed = !!instantEnding;

  const nextIndex = pickNextStageIndex(play.stageIndex);
  const completed = collapsed || nextIndex >= STAGES.length;
  const updates = { stats, choiceLog, stageIndex: nextIndex, completed, healthConditions, familyMembers, assets };

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
    // 다음 구간에서 보여줄 3개를 여기서 미리 뽑아 저장 슬롯에 남겨둔다 - 이걸
    // 지금 뽑아둬야 이어하기로 재접속했을 때도 같은 3개가 다시 뜬다. 이때
    // 방금 갱신된 healthConditions/familyMembers를 기준으로 requiresCondition·
    // requiresFamilyMember·requiresNoFamilyMember를 걸러야 "이번 선택으로 막
    // 낫거나 생긴 조건/가족"이 다음 구간 노출에 바로 반영된다.
    nextVisibleIds = pickVisibleChoiceIds(
      STAGES[nextIndex].choices,
      healthConditions.map((c) => c.id),
      familyMembers.map((f) => f.id),
      currentOccupation ? currentOccupation.id : null,
      nextIntroId
    );
    updates.visibleChoiceIds = nextVisibleIds;
  }

  // 선택지·엔딩 통계 카운터 - "선택지 로그"/"엔딩 로그" 통계(admin-center에서 확인)용.
  // 원본 choiceLog(플레이어별)는 이미 위 updates.choiceLog에 남으니, 여기서는 관리
  // 화면이 매번 전체 플레이스루를 훑지 않아도 되게 사전 집계된 카운터만 따로 쌓는다.
  const statWrites = [
    playRef.update(updates),
    db.ref('lifeGame/stats/choices/' + stage.id + '/' + choice.id).set(ServerValue.increment(1))
  ];
  if (completed) {
    statWrites.push(db.ref('lifeGame/stats/endings/' + ending.id).set(ServerValue.increment(1)));
    statWrites.push(db.ref('lifeGame/stats/totals/completed').set(ServerValue.increment(1)));
  }
  await Promise.all(statWrites);

  // resultOptions가 붙은 선택지(예: 부모님과의 사별 - 이유를 고정하지 않고
  // 매번 랜덤으로)는 그 중 하나를 여기서 골라 보여준다. 어떤 문구가
  // 뽑혔는지는 따로 저장하지 않는다 - 다른 선택 결과 텍스트와 마찬가지로
  // 그 순간 한 번 보여주고 마는 연출이라, choiceLog에는 choiceId만 남고
  // 다시 볼 일이 없다.
  const result = choice.resultOptions && choice.resultOptions.length
    ? choice.resultOptions[Math.floor(Math.random() * choice.resultOptions.length)]
    : choice.result;

  return {
    stats,
    result,
    deltas: effectiveDeltas,
    healthRecoverySuppressed,
    completed,
    ending: ending ? { id: ending.id, title: ending.title, text: ending.text } : null,
    nextStage: completed ? null : publicStage(STAGES[nextIndex], nextVisibleIds, nextIntroId),
    healthConditions,
    familyMembers,
    assets,
    currentOccupation,
    choiceHistory: completed ? buildChoiceHistory(choiceLog) : null,
    occupationHistory: completed ? occupationHistory : null
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

  const db = getDatabase();
  const stats = freshStats();
  const currentIntroId = pickIntroId(STAGES[0]);
  const visibleChoiceIds = pickVisibleChoiceIds(STAGES[0].choices, [], [], null, currentIntroId);
  await Promise.all([
    playRefFor(db, uid).set({
      streamerName,
      streamerId,
      stats,
      stageIndex: 0,
      visibleChoiceIds,
      currentIntroId,
      healthConditions: [],
      familyMembers: [],
      assets: [],
      choiceLog: [],
      completed: false,
      startedAt: ServerValue.TIMESTAMP
    }),
    // 관리 센터 통계용 집계 카운터 - interior-3d-viewer의 presetGallery stats와 동일한
    // ServerValue.increment 패턴(원본 로그를 admin-center가 매번 다시 훑지 않도록
    // 이 함수가 직접 카운터를 올려둔다).
    db.ref('lifeGame/stats/totals/started').set(ServerValue.increment(1))
  ]);

  return { stats, healthConditions: [], familyMembers: [], assets: [], currentOccupation: null, stage: publicStage(STAGES[0], visibleChoiceIds, currentIntroId) };
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
      assets: Array.isArray(play.assets) ? play.assets : [],
      choiceHistory: buildChoiceHistory(play.choiceLog),
      occupationHistory: buildOccupationHistory(play.choiceLog)
    };
  }
  const stage = STAGES[play.stageIndex];
  if (!stage) throw new HttpsError('failed-precondition', '잘못된 진행 상태입니다.');

  const healthConditions = Array.isArray(play.healthConditions) ? play.healthConditions : [];
  const familyMembers = Array.isArray(play.familyMembers) ? play.familyMembers : [];
  const assets = Array.isArray(play.assets) ? play.assets : [];
  const occupationHistory = buildOccupationHistory(play.choiceLog);
  const currentOccupation = occupationHistory.length ? occupationHistory[occupationHistory.length - 1] : null;

  // visibleChoiceIds/currentIntroId가 이미 저장돼 있으면 그대로 재사용해서
  // 재접속해도 같은 3개·같은 상황 설명이 다시 뜨게 한다(이 필드들이 생기기
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
    visibleChoiceIds = pickVisibleChoiceIds(
      stage.choices,
      healthConditions.map((c) => c.id),
      familyMembers.map((f) => f.id),
      currentOccupation ? currentOccupation.id : null,
      currentIntroId
    );
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
    assets,
    currentOccupation,
    stage: publicStage(stage, visibleChoiceIds, currentIntroId)
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
  const choice = stage.choices.find((c) => c.id === choiceId);
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
  // 화면에 보여준(노출된) 3개 중에서만 뽑는다 - 미리보기로 안 보여준 선택지가
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
  // 갤러리 목록 실시간 구독(lifeGame/gallery 전체를 onValue로 받음)이 매번 이 선택
  // 기록까지 통째로 내려받지 않도록, 선택 로그는 별도 노드(galleryChoiceLogs)에
  // 따로 저장해둔다 - 클릭해서 펼칠 때만 그 항목 하나를 골라 읽는다.
  await Promise.all([
    galleryRef.set({
      streamerName: play.streamerName,
      streamerId: play.streamerId || null,
      ending: play.ending,
      stats: play.stats,
      uid,
      sharedAt: ServerValue.TIMESTAMP
    }),
    db.ref('lifeGame/galleryChoiceLogs/' + galleryRef.key).set(buildChoiceHistory(play.choiceLog)),
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

module.exports = { startPlaythrough, resumePlaythrough, submitChoice, rollDice, shareToGallery, reportGalleryEntry };
