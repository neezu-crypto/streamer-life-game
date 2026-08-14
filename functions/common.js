const { HttpsError } = require('firebase-functions/v2/https');
const { getDatabase } = require('firebase-admin/database');

// 다섯 스탯 - 기획안(life-game-plan.html) 03장 참고. 순서 고정 - 클라이언트도 이 순서로 그린다.
const STAT_KEYS = ['wealth', 'fame', 'happiness', 'health', 'relationship'];
const STAT_MIN = 0;
const STAT_MAX = 100;
const STAT_START = 50; // 모든 스탯은 중립값에서 시작 - 특정 결말로 쏠리지 않게

function clampStat(v) {
  return Math.max(STAT_MIN, Math.min(STAT_MAX, v));
}

// uid 위변조 검증 원칙 - 소유자 uid는 클라이언트가 보낸 값을 절대 신뢰하지 않고
// 항상 request.auth.uid에서만 가져온다 (이 생태계 다른 프로젝트들과 동일 원칙).
function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }
  return request.auth.uid;
}

async function isAdminUid(uid) {
  const db = getDatabase();
  const snap = await db.ref('adminCenter/adminUids/' + uid).get();
  return snap.val() === true;
}

module.exports = {
  STAT_KEYS,
  STAT_MIN,
  STAT_MAX,
  STAT_START,
  clampStat,
  requireAuth,
  isAdminUid
};
