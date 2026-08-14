const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');
const { STAT_KEYS, STAT_START, clampStat, requireAuth } = require('./common');
const { STAGES, resolveEnding } = require('./game-data');

initializeApp();

const MAX_NAME_LEN = 40;
const MAX_REPORT_REASON_LEN = 300;

// 아직 안 고른 구간의 선택지는 deltas/result를 절대 클라이언트로 보내지 않는다
// (기획안 04장 "선택지 문장만 보고 결과를 예측할 수 없어야 한다"를 서버에서도
// 강제 - 개발자 도구로 응답을 뜯어봐도 결과가 안 보이게). random:true인 구간은
// "고르는" 게 아니라 "굴리는" 구간이라는 걸 클라이언트에 알려준다(태어날 집안처럼
// 본인이 선택할 수 없는 것들 - submitChoice가 아니라 rollDice로만 진행 가능).
function publicStage(stage) {
  return {
    id: stage.id,
    name: stage.name,
    ageRange: stage.ageRange,
    random: !!stage.random,
    choices: stage.choices.map((c) => ({ id: c.id, text: c.text }))
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
  if (completed) {
    ending = resolveEnding(stats);
    updates.ending = { id: ending.id, title: ending.title, text: ending.text };
    updates.endedAt = ServerValue.TIMESTAMP;
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
    nextStage: completed ? null : publicStage(STAGES[nextIndex])
  };
}

// playId로 진행 중인(아직 안 끝난) 플레이스루와 현재 구간을 함께 불러온다 -
// submitChoice/rollDice가 공통으로 하는 검증이라 한 곳에 모아둔다.
async function loadActivePlay(db, uid, playId) {
  if (!playId) throw new HttpsError('invalid-argument', 'playId가 필요합니다.');
  const playRef = db.ref('lifeGame/playthroughs/' + uid + '/' + playId);
  const snap = await playRef.get();
  const play = snap.val();
  if (!play) throw new HttpsError('not-found', '진행 중인 인생을 찾을 수 없습니다.');
  if (play.completed) throw new HttpsError('failed-precondition', '이미 끝난 인생입니다.');
  const stage = STAGES[play.stageIndex];
  if (!stage) throw new HttpsError('failed-precondition', '잘못된 진행 상태입니다.');
  return { playRef, play, stage };
}

// 04번 - 스트리머 이름을 검색해 주인공을 정하고 첫 생애 구간을 연다.
// streamerId는 선택값(검색 결과의 stocks 키) - 없어도(직접 입력한 이름) 진행 가능.
const startPlaythrough = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const streamerName = (request.data && request.data.streamerName || '').toString().trim();
  const streamerId = request.data && request.data.streamerId ? String(request.data.streamerId) : null;
  if (!streamerName || streamerName.length > MAX_NAME_LEN) {
    throw new HttpsError('invalid-argument', '주인공 이름을 1~' + MAX_NAME_LEN + '자로 입력해주세요.');
  }

  const db = getDatabase();
  const playRef = db.ref('lifeGame/playthroughs/' + uid).push();
  const stats = freshStats();
  await Promise.all([
    playRef.set({
      streamerName,
      streamerId,
      stats,
      stageIndex: 0,
      choiceLog: [],
      completed: false,
      startedAt: ServerValue.TIMESTAMP
    }),
    // 관리 센터 통계용 집계 카운터 - interior-3d-viewer의 presetGallery stats와 동일한
    // ServerValue.increment 패턴(원본 로그를 admin-center가 매번 다시 훑지 않도록
    // 이 함수가 직접 카운터를 올려둔다).
    db.ref('lifeGame/stats/totals/started').set(ServerValue.increment(1))
  ]);

  return { playId: playRef.key, stats, stage: publicStage(STAGES[0]) };
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

  const { playRef, play, stage } = await loadActivePlay(db, uid, request.data && request.data.playId);
  if (stage.random) {
    throw new HttpsError('failed-precondition', '이 구간은 직접 고를 수 없습니다. rollDice로 진행해주세요.');
  }
  const choice = stage.choices.find((c) => c.id === choiceId);
  if (!choice) throw new HttpsError('invalid-argument', '유효하지 않은 선택지입니다.');

  return applyChoice(db, playRef, play, stage, choice);
});

// 주사위 굴리기 - random:true인 구간(예: 유아기, "태어날 집안은 스스로 고를 수
// 없다") 전용. 클라이언트는 choiceId를 보내지 않고, 서버가 stage.choices 중
// 하나를 균등 확률로 직접 뽑는다 - 어떤 결과가 나왔는지는 응답의 choiceId/result로
// 알려준다.
const rollDice = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const db = getDatabase();
  const { playRef, play, stage } = await loadActivePlay(db, uid, request.data && request.data.playId);
  if (!stage.random) {
    throw new HttpsError('failed-precondition', '이 구간은 주사위가 아니라 직접 골라야 합니다.');
  }
  const choice = stage.choices[Math.floor(Math.random() * stage.choices.length)];

  const outcome = await applyChoice(db, playRef, play, stage, choice);
  return Object.assign({ choiceId: choice.id, choiceText: choice.text }, outcome);
});

// 완료한 인생을 공개 갤러리에 공유 - 실제 스트리머 이름이 걸린 채 공개되므로
// (기획안 09장 B) 같은 플레이는 한 번만 공유되게 막는다.
const shareToGallery = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const playId = request.data && request.data.playId;
  if (!playId) throw new HttpsError('invalid-argument', 'playId가 필요합니다.');

  const db = getDatabase();
  const playRef = db.ref('lifeGame/playthroughs/' + uid + '/' + playId);
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

module.exports = { startPlaythrough, submitChoice, rollDice, shareToGallery, reportGalleryEntry };
