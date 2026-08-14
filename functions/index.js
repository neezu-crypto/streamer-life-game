const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');
const { STAT_KEYS, STAT_START, clampStat, requireAuth } = require('./common');
const { STAGES, resolveEnding } = require('./game-data');

initializeApp();

const MAX_NAME_LEN = 40;
const MAX_REPORT_REASON_LEN = 300;

// 계정당 저장 슬롯 1개 - lifeGame/playthroughs/{uid}가 push id 없이 그 유저의
// "그 한 판"을 직접 가리킨다(예전엔 .../{uid}/{playId}로 여러 판을 쌓을 수
// 있었지만, "창을 꺼도 이어할 수 있게" 요청에 맞춰 계정당 1개로 단순화했다 -
// 새로 시작하면 기존 진행 중이던 판을 덮어쓴다).
function playRefFor(db, uid) {
  return db.ref('lifeGame/playthroughs/' + uid);
}

// 구간마다 최대 6개까지 채워둔 choices 중 실제로 그 회차에 "노출"할 3개를
// 무작위로 고른다 - 매번 같은 3개만 뜨면 재미가 없고, 그렇다고 6개를 한꺼번에
// 다 보여주면 화면이 복잡해지니 매 판마다 다른 3개가 뜨게 한다. choices가
// 3개 이하인 구간(과거 콘텐츠)은 그냥 전부 노출한다.
function pickVisibleChoiceIds(choices) {
  if (choices.length <= 3) return choices.map((c) => c.id);
  const shuffled = choices.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3).map((c) => c.id);
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
function publicStage(stage, visibleIds) {
  const ids = visibleIds && visibleIds.length ? visibleIds : pickVisibleChoiceIds(stage.choices);
  const visibleChoices = stage.choices.filter((c) => ids.includes(c.id));
  return {
    id: stage.id,
    name: stage.name,
    ageRange: stage.ageRange,
    intro: stage.intro || '',
    random: !!stage.random,
    choices: visibleChoices.map((c) => ({ id: c.id, text: c.text }))
  };
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
  const stats = Object.assign({}, play.stats);
  for (const key of Object.keys(choice.deltas || {})) {
    stats[key] = clampStat((stats[key] || 0) + choice.deltas[key]);
  }

  const choiceLog = Array.isArray(play.choiceLog) ? play.choiceLog.slice() : [];
  choiceLog.push({ stageId: stage.id, choiceId: choice.id, at: Date.now() });

  const nextIndex = play.stageIndex + 1;
  const completed = nextIndex >= STAGES.length;
  const updates = { stats, choiceLog, stageIndex: nextIndex, completed };

  let ending = null;
  let nextVisibleIds = null;
  if (completed) {
    ending = resolveEnding(stats);
    updates.ending = { id: ending.id, title: ending.title, text: ending.text };
    updates.endedAt = ServerValue.TIMESTAMP;
  } else {
    // 다음 구간에서 보여줄 3개를 여기서 미리 뽑아 저장 슬롯에 남겨둔다 - 이걸
    // 지금 뽑아둬야 이어하기로 재접속했을 때도 같은 3개가 다시 뜬다.
    nextVisibleIds = pickVisibleChoiceIds(STAGES[nextIndex].choices);
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

  return {
    stats,
    result: choice.result,
    deltas: choice.deltas || {},
    completed,
    ending: ending ? { id: ending.id, title: ending.title, text: ending.text } : null,
    nextStage: completed ? null : publicStage(STAGES[nextIndex], nextVisibleIds)
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
  const visibleChoiceIds = pickVisibleChoiceIds(STAGES[0].choices);
  await Promise.all([
    playRefFor(db, uid).set({
      streamerName,
      streamerId,
      stats,
      stageIndex: 0,
      visibleChoiceIds,
      choiceLog: [],
      completed: false,
      startedAt: ServerValue.TIMESTAMP
    }),
    // 관리 센터 통계용 집계 카운터 - interior-3d-viewer의 presetGallery stats와 동일한
    // ServerValue.increment 패턴(원본 로그를 admin-center가 매번 다시 훑지 않도록
    // 이 함수가 직접 카운터를 올려둔다).
    db.ref('lifeGame/stats/totals/started').set(ServerValue.increment(1))
  ]);

  return { stats, stage: publicStage(STAGES[0], visibleChoiceIds) };
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
    return { streamerName: play.streamerName, stats: play.stats, completed: true, ending: play.ending };
  }
  const stage = STAGES[play.stageIndex];
  if (!stage) throw new HttpsError('failed-precondition', '잘못된 진행 상태입니다.');

  // visibleChoiceIds가 이미 저장돼 있으면 그대로 재사용해서 재접속해도 같은
  // 3개가 다시 뜨게 한다(이 필드가 생기기 전에 만들어진 저장분 등 없을 때만
  // 새로 뽑아서 지금부터라도 고정해둔다).
  let visibleChoiceIds = play.visibleChoiceIds;
  if (!visibleChoiceIds || !visibleChoiceIds.length) {
    visibleChoiceIds = pickVisibleChoiceIds(stage.choices);
    await playRefFor(db, uid).update({ visibleChoiceIds });
  }
  return { streamerName: play.streamerName, stats: play.stats, completed: false, stage: publicStage(stage, visibleChoiceIds) };
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
  await Promise.all([
    galleryRef.set({
      streamerName: play.streamerName,
      streamerId: play.streamerId || null,
      ending: play.ending,
      stats: play.stats,
      uid,
      sharedAt: ServerValue.TIMESTAMP
    }),
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
