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
// 강제 - 개발자 도구로 응답을 뜯어봐도 결과가 안 보이게).
function publicStage(stage) {
  return {
    id: stage.id,
    name: stage.name,
    ageRange: stage.ageRange,
    choices: stage.choices.map((c) => ({ id: c.id, text: c.text }))
  };
}

function freshStats() {
  const stats = {};
  for (const key of STAT_KEYS) stats[key] = STAT_START;
  return stats;
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
  await playRef.set({
    streamerName,
    streamerId,
    stats,
    stageIndex: 0,
    choiceLog: [],
    completed: false,
    startedAt: ServerValue.TIMESTAMP
  });

  return { playId: playRef.key, stats, stage: publicStage(STAGES[0]) };
});

// 선택 하나를 제출 - 서버가 정답표(game-data.js)를 갖고 있는 쪽에서만 스탯을
// 계산·반영한다(클라이언트가 stats를 직접 보내는 방식은 위변조 가능해서 안 씀).
const submitChoice = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request);
  const playId = request.data && request.data.playId;
  const choiceId = request.data && request.data.choiceId;
  if (!playId || !choiceId) {
    throw new HttpsError('invalid-argument', 'playId와 choiceId가 필요합니다.');
  }

  const db = getDatabase();
  const playRef = db.ref('lifeGame/playthroughs/' + uid + '/' + playId);
  const snap = await playRef.get();
  const play = snap.val();
  if (!play) throw new HttpsError('not-found', '진행 중인 인생을 찾을 수 없습니다.');
  if (play.completed) throw new HttpsError('failed-precondition', '이미 끝난 인생입니다.');

  const stage = STAGES[play.stageIndex];
  if (!stage) throw new HttpsError('failed-precondition', '잘못된 진행 상태입니다.');
  const choice = stage.choices.find((c) => c.id === choiceId);
  if (!choice) throw new HttpsError('invalid-argument', '유효하지 않은 선택지입니다.');

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

  await playRef.update(updates);

  return {
    stats,
    result: choice.result,
    deltas: choice.deltas || {},
    completed,
    ending: ending ? { id: ending.id, title: ending.title, text: ending.text } : null,
    nextStage: completed ? null : publicStage(STAGES[nextIndex])
  };
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
  await galleryRef.set({
    streamerName: play.streamerName,
    streamerId: play.streamerId || null,
    ending: play.ending,
    stats: play.stats,
    uid,
    sharedAt: ServerValue.TIMESTAMP
  });
  await playRef.update({ galleryEntryId: galleryRef.key });

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

module.exports = { startPlaythrough, submitChoice, shareToGallery, reportGalleryEntry };
