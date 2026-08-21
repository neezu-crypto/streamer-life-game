const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getDatabase } = require('firebase-admin/database');

// ══════════════════════════════════════════════════════════
// 구글 로그인 연동 — 익명 계정 진행도를 유지한 채 구글 계정으로 보호
// (soop-stock-market/functions/google.js와 완전히 동일한 패턴, 2026-08-22
// 16장 - 도감 열람·저장을 로그인 유저 전용으로 제한하기 위한 선행 작업)
//
// 카카오와 달리 구글은 Firebase가 기본 지원하는 제공자라, 실제 계정 연결은
// 전부 클라이언트에서 Firebase SDK로 처리된다:
//   - 처음 연동: linkWithPopup(auth.currentUser, googleProvider) — 지금 쓰던
//     익명 uid에 구글 자격증명을 그대로 이어붙인다(별도 매핑 테이블 불필요).
//   - 이미 다른 uid에 연동된 구글 계정이면: linkWithPopup이
//     auth/credential-already-in-use로 실패 → 클라이언트가 signInWithPopup을
//     한 번 더 호출해 그 계정으로 전환한다(soop-stock-market이 이미 겪은
//     SDK 버그 - credential 재사용 시 내부 오류 - 를 피하는 방식).
//
// 이 함수는 그 이후 "정말 구글이 연동된 세션인지"만 서버에서 재확인하고
// (클라이언트가 링크 성공 여부를 속일 수 없도록) googleLinked 마킹을 한다.
// 이메일·이름·프로필 사진은 전혀 저장하지 않는다.
// ══════════════════════════════════════════════════════════
const linkGoogleAccount = onCall({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const auth = request.auth;
  if (!auth || !auth.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');

  // ID 토큰의 firebase.identities에 google.com이 있어야 실제로 구글이 연동된
  // 세션이다 - Firebase가 서명한 토큰이라 클라이언트가 위조할 수 없다.
  const identities = auth.token && auth.token.firebase && auth.token.firebase.identities;
  const hasGoogleIdentity = !!(identities && identities['google.com'] && identities['google.com'].length);
  if (!hasGoogleIdentity) {
    throw new HttpsError('failed-precondition', '구글 계정 연동이 확인되지 않았습니다.');
  }

  const db = getDatabase();
  await db.ref('users/' + auth.uid + '/googleLinked').set(true);

  return { ok: true, action: 'linked' };
});

module.exports = { linkGoogleAccount };
