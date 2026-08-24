import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getDatabase, ref, get, set, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithPopup, signInWithCustomToken, linkWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

// 이 생태계 다른 프로젝트들과 동일한 Firebase 프로젝트(soop-stock-market)를 공유한다
// - stocks 노드(스트리머 이름 검색)를 새 프로젝트 설정 없이 바로 읽기 위함.
const firebaseConfig = {
  apiKey: "AIzaSyAZcjQPHphENs-Bb7IfdL2qTtOMhJrRP54",
  authDomain: "soop-stock-market.firebaseapp.com",
  databaseURL: "https://soop-stock-market-default-rtdb.firebaseio.com",
  projectId: "soop-stock-market",
  storageBucket: "soop-stock-market.firebasestorage.app",
  messagingSenderId: "997788925900",
  appId: "1:997788925900:web:b58db2970489bf18a3a769"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');

// devbar 게임 링크를 RTDB(devbarLinks, admin-center에서 관리)에서 가져와 하드코딩된
// 링크를 대체한다 - 다른 배경/배팅/주식/배경시장 페이지들과 동일한 패턴(08번 마이그레이션).
// 노드가 비어있거나 조회 실패 시 기존 하드코딩된 data-game-id 링크를 그대로 둔다
// (devbar가 통째로 사라지는 사고 방지) - "방송국" 링크는 devbarLinks 대상이 아니라
// 항상 하드코딩 그대로 유지된다.
(async function () {
  const SELF_GAME_ID = 'lifeGame';
  try {
    const snap = await get(ref(db, 'devbarLinks'));
    const data = snap.val();
    if (!data) return;
    const links = Object.keys(data)
      .filter((id) => id !== SELF_GAME_ID && data[id] && data[id].url)
      .map((id) => Object.assign({ id }, data[id]))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!links.length) return;
    const track = document.getElementById('devbarTrack');
    if (!track) return;
    track.querySelectorAll('a[data-game-id]').forEach((el) => el.remove());
    links.forEach((link) => {
      const a = document.createElement('a');
      a.className = 'dev-game-link';
      a.dataset.gameId = link.id;
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = link.label;
      track.appendChild(a);
    });
    window.dispatchEvent(new Event('resize')); // 마퀴 재계산 트리거
  } catch (e) {
    console.error('devbar 링크 갱신 실패(기존 링크 유지):', e);
  }
})();

const startPlaythroughFn = httpsCallable(functions, 'startPlaythrough');
const resumePlaythroughFn = httpsCallable(functions, 'resumePlaythrough');
const submitChoiceFn = httpsCallable(functions, 'submitChoice');
const rollDiceFn = httpsCallable(functions, 'rollDice');
const shareToGalleryFn = httpsCallable(functions, 'shareToGallery');
const linkGoogleAccountFn = httpsCallable(functions, 'linkGoogleAccount');
const linkKakaoAccountFn = httpsCallable(functions, 'linkKakaoAccount');
const adminDeleteGalleryEntryFn = httpsCallable(functions, 'adminDeleteGalleryEntry');
// requestStreamerVerification은 이 레포에 없는 함수다 - 같은 Firebase 프로젝트
// (soop-stock-market)에 이미 배포돼 있는 걸 codebase 구분 없이 이름으로 그대로
// 호출한다(16장 참고, StreamBet-Market·admin-center CLAUDE.md와 동일 원칙 -
// "다른 앱 소스에 없다고 삭제하면 안 되는 함수" 목록에 있는 것과 반대로, 여기선
// 우리가 그 목록에 있는 함수를 갖다 쓰는 입장).
const requestStreamerVerificationFn = httpsCallable(functions, 'requestStreamerVerification');
const googleProvider = new GoogleAuthProvider();

let currentUser = null;
let resumeChecked = false;
// 관리자 여부(2026-08-24, 사용자 지시 - "관리자 uid로 다른 인생 갤러리에서
// 로그 삭제 가능하게" UI 연결) - adminCenter/adminUids 자체는
// database.rules.json에서 .read:false라 클라이언트가 직접 "내가 관리자인가"를
// 읽을 방법이 없다. 대신 관리자만 읽을 수 있는 다른 노드(lifeGame/galleryReports,
// 신고 열람용)를 한 번 읽어보는 방식으로 우회 확인한다 - 성공하면 관리자,
// permission-denied면 일반 유저. 갤러리 렌더링이 이 판정보다 먼저 끝날 수 있어
// isAdminUser가 true로 바뀌면 renderGalleryList로 마지막 스냅샷을 다시 그린다.
let isAdminUser = false;
let latestGallerySnapVal = null;
async function checkAdminStatus(uid) {
  try {
    await get(ref(db, 'lifeGame/galleryReports'));
    isAdminUser = true;
    if (latestGallerySnapVal !== null) renderGalleryList(latestGallerySnapVal);
  } catch (e) {
    isAdminUser = false;
  }
}
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!user) {
    signInAnonymously(auth).catch((e) => console.error('익명 로그인 실패:', e));
    return;
  }
  checkAdminStatus(user.uid);
  // 계정당 저장 슬롯 1개 - 로그인(익명 포함)이 확정되면 저장된 판이 있는지 한 번만
  // 확인한다. 검색 화면을 먼저 보여줬다가 뒤늦게 "이어하기"로 바꾸면 화면이
  // 깜빡여서, 확인이 끝나기 전까진 검색/이어하기 둘 다 숨겨둔다(아래 checkResume).
  if (!resumeChecked) {
    resumeChecked = true;
    checkResume(user.uid);
  }
});

// ------------------------------------------------------------
// 로그인 연동(16장, 2026-08-22) - soop-stock-market이 이미 구현해둔 구글/카카오
// "익명 계정 승격" 패턴을 그대로 따른다(기획서.html sec16 참고). 새 계정을
// 만드는 게 아니라 지금 쓰던 익명 uid를 그대로 보호·승격하는 것이라, 이전에
// 쌓인 playthroughs/collection 진행도가 로그인 후에도 그대로 이어진다.
// ------------------------------------------------------------
// Kakao SDK 스크립트가 네트워크 문제 등으로 못 불러와졌을 때 여기서 바로
// throw하면 이 모듈(app.js) 전체가 죽어 게임 자체가 안 켜진다 - 로그인은
// 부가 기능이라 게임 플레이 자체를 막으면 안 되므로 존재 여부만 확인하고 넘어간다.
if (typeof Kakao !== 'undefined') Kakao.init('ed4f01d6903ca41d5dc0ab32b6ae143c');

// 구글 팝업 인증 직후처럼 "활성 탭이 아니다"로 오판되기 쉬운 순간엔 네이티브
// confirm()이 브라우저에 따라 조용히 억제될 수 있다(soop-stock-market이 이미
// 겪은 문제 - 그쪽은 커스텀 확인 모달로 우회해뒀다). 여기서는 그 정도로 자주
// 겪는 경로가 아니라(구글 계정이 이미 다른 uid에 연동된 극히 드문 경우에만
// 탐) 일단 네이티브 confirm을 쓰고, 실제로 문제 제보가 오면 그때 커스텀
// 모달로 교체한다.
async function completeAccountSwitch(customToken) {
  await signInWithCustomToken(auth, customToken);
  alert('✅ 이제 이 기기에서도 같은 계정을 이어서 쓸 수 있어요.');
  // 계정이 중간에 바뀌면 앱이 메모리에 들고 있던 상태(uid 등)가 예전 걸 그대로
  // 참조해 화면이 갱신되지 않는다 - 새로고침으로 전체 상태를 새 계정 기준으로
  // 다시 초기화한다.
  window.location.reload();
}

window.loginWithGoogle = async function () {
  try {
    await linkWithPopup(auth.currentUser, googleProvider);
    await linkGoogleAccountFn();
    alert('✅ 구글 연동 완료! 이제 이 계정의 도감·진행도가 안전하게 보호돼요.');
    refreshCollectionView();
  } catch (e) {
    console.error('구글 로그인 실패:', e);
    if (e && e.code === 'auth/credential-already-in-use') {
      if (!confirm('🔗 이미 보호된 계정을 발견했어요!\n이 기기에서도 같은 계정으로 이어서 진행할까요?\n(이 기기에서 지금까지 쌓은 진행도는 함께 옮겨지지 않아요)')) return;
      try {
        await signInWithPopup(auth, googleProvider);
        await linkGoogleAccountFn();
        alert('✅ 이제 이 기기에서도 같은 계정을 이어서 쓸 수 있어요.');
        window.location.reload();
      } catch (e2) {
        console.error('계정 전환용 재인증 실패:', e2);
        alert('⚠️ 계정 전환 중 오류가 발생했습니다. 카카오 로그인이나 다른 브라우저로 다시 시도해주세요.');
      }
    } else if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) {
      // 유저가 팝업을 닫은 경우 - 조용히 무시
    } else {
      alert('⚠️ 구글 로그인 중 오류가 발생했습니다: ' + (e.message || e));
    }
  }
};

window.loginWithKakao = function () {
  if (typeof Kakao === 'undefined' || !Kakao.isInitialized()) {
    return alert('카카오 로그인을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
  Kakao.Auth.login({
    // 서버는 계정 식별에 카카오 고유 ID만 쓰고 닉네임·프로필은 전혀 저장하지
    // 않는다 - 실명 노출을 꺼리는 스트리머 유저의 진입장벽을 낮추기 위해
    // 프로필 동의 항목은 아예 요청하지 않는다.
    success: async (authObj) => {
      try {
        const result = await linkKakaoAccountFn({ kakaoAccessToken: authObj.access_token });
        if (result.data.action === 'switch') {
          if (!confirm('🔗 이미 보호된 계정을 발견했어요!\n이 기기에서도 같은 계정으로 이어서 진행할까요?\n(이 기기에서 지금까지 쌓은 진행도는 함께 옮겨지지 않아요)')) return;
          await completeAccountSwitch(result.data.customToken);
        } else if (result.data.action === 'linked') {
          alert('✅ 카카오 연동 완료! 이제 이 계정의 도감·진행도가 안전하게 보호돼요.');
          refreshCollectionView();
        } else {
          alert('✅ 이미 연동된 계정입니다.');
        }
      } catch (e) {
        alert('카카오 연동 중 오류가 발생했습니다: ' + (e.message || e));
      }
    },
    fail: () => alert('카카오 로그인이 취소되었거나 실패했습니다.')
  });
};

// ------------------------------------------------------------
// 스트리머 인증(구글·카카오를 꺼리는 유저를 위한 대체 계정 보호 경로) -
// requestStreamerVerification은 신청/재확인을 겸하는 단일 엔드포인트라,
// "신청하기"와 "승인됐는지 확인하기" 버튼 둘 다 같은 함수를 그대로 호출한다.
// ------------------------------------------------------------
const streamerVerifyModal = document.getElementById('streamerVerifyModal');
const streamerVerifyForm = document.getElementById('streamerVerifyForm');
const streamerVerifyPending = document.getElementById('streamerVerifyPending');
const streamerVerifyPendingText = document.getElementById('streamerVerifyPendingText');
const streamerVerifyNicknameInput = document.getElementById('streamerVerifyNickname');
const streamerVerifySoopIdInput = document.getElementById('streamerVerifySoopId');

window.openStreamerVerifyModal = function () {
  streamerVerifyForm.classList.remove('hidden');
  streamerVerifyPending.classList.add('hidden');
  streamerVerifyNicknameInput.value = '';
  streamerVerifySoopIdInput.value = '';
  streamerVerifyModal.classList.remove('hidden');
};
window.closeStreamerVerifyModal = function () {
  streamerVerifyModal.classList.add('hidden');
};
document.getElementById('closeStreamerVerifyBtn').addEventListener('click', closeStreamerVerifyModal);

function showStreamerVerifyPending(nickname, isSwitch) {
  streamerVerifyForm.classList.add('hidden');
  streamerVerifyPending.classList.remove('hidden');
  streamerVerifyPendingText.textContent = isSwitch
    ? '"' + nickname + '" 계정 전환 신청이 관리자에게 전달됐어요. 확인 후 이 기기에서도 기존 계정을 이어서 쓸 수 있어요.'
    : '"' + nickname + '" 인증 신청이 관리자에게 전달됐어요. 확인 후 승인해드려요.';
}

async function submitOrCheckStreamerVerification(data) {
  try {
    const result = await requestStreamerVerificationFn(data);
    const { action, nickname, isSwitch, customToken } = result.data;
    if (action === 'switch') {
      closeStreamerVerifyModal();
      await completeAccountSwitch(customToken);
    } else if (action === 'already-verified') {
      closeStreamerVerifyModal();
      alert('✅ 이미 스트리머 인증이 완료된 계정이에요.');
      refreshCollectionView();
    } else {
      showStreamerVerifyPending(nickname, isSwitch);
      if (!data.nickname) alert('아직 관리자 확인 전이에요. 잠시 후 다시 확인해주세요.');
    }
  } catch (e) {
    alert('스트리머 인증 처리 중 오류가 발생했습니다: ' + (e.message || e));
  }
}

document.getElementById('submitStreamerVerifyBtn').addEventListener('click', () => {
  const nickname = streamerVerifyNicknameInput.value.trim();
  if (!nickname) return alert('닉네임을 입력해주세요.');
  const soopId = streamerVerifySoopIdInput.value.trim();
  if (!/^[a-z0-9]{2,20}$/.test(soopId)) return alert('SOOP 아이디는 영문 소문자/숫자 2~20자로 입력해주세요.');
  // source(2026-08-22, 사용자 확정) - 관리자 디스코드 알림에서 어느 앱에서 온
  // 신청인지 구분하기 위한 필드. 값을 안 보내면 서버가 기본값 'stock-market'로
  // 처리하므로(하위 호환), 이 게임에서 보낼 땐 반드시 명시한다.
  submitOrCheckStreamerVerification({ nickname, soopId, source: 'life-game' });
});
document.getElementById('checkStreamerVerifyBtn').addEventListener('click', () => {
  submitOrCheckStreamerVerification({ source: 'life-game' });
});

// ------------------------------------------------------------
// 해금 도감(16장) - 엔딩 16종(ENDINGS 11종 + 즉사 엔딩 5종)을 그리드로 나열.
// functions/game-data.js의 ENDINGS·build*Ending()과 반드시 같은 id·title을
// 유지해야 한다(서버는 이 목록을 클라이언트에 따로 안 내려주므로 수동 동기화).
// ------------------------------------------------------------
const ENDINGS_META = [
  { id: 'all-in-success', title: '올인 성공형', icon: '💎' },
  { id: 'all-in-failure', title: '올인 실패형', icon: '💸' },
  { id: 'burnout', title: '번아웃형', icon: '🔥' },
  { id: 'stable', title: '안정형', icon: '🏡' },
  { id: 'relationship-first', title: '관계 중심형', icon: '💞' },
  { id: 'recluse', title: '은둔형', icon: '🌙' },
  { id: 'full-family-legacy', title: '대를 이은 가족형', icon: '👨‍👩‍👧‍👦' },
  { id: 'living-with-illness', title: '평생을 안고 살아온 삶형', icon: '🏥' },
  { id: 'rising-after-the-fall', title: '다시 일어난 삶형', icon: '🌱' },
  { id: 'solitary-path', title: '홀로 걸어온 길형', icon: '🚶' },
  { id: 'enduring-companion', title: '오랜 동행형', icon: '🤝' },
  { id: 'collapse', title: '쓰러진 삶', icon: '💥' },
  { id: 'bankruptcy', title: '파산한 삶', icon: '📉' },
  { id: 'obscurity', title: '완전히 잊힌 삶', icon: '🌫️' },
  { id: 'despair', title: '완전히 지쳐버린 삶', icon: '😞' },
  { id: 'isolation', title: '완전히 홀로 남은 삶', icon: '🕸️' }
];

// 트리거 루트 목록(14장) - functions/game-data.js의 startsRoute와 반드시 같은
// id·label을 유지해야 한다(서버는 이 목록을 클라이언트에 따로 안 내려주므로
// 수동 동기화). 학생 리더십 루트(2026-08-23)까지 추가됨 - 앞으로 새 루트가
// 추가되면 여기에도 그대로 이어 붙이면 된다.
const ROUTES_META = [
  { id: 'entertainment-industry', title: '🎤 연예계 연습생', icon: '🎤' },
  { id: 'actor', title: '🎭 배우', icon: '🎭' },
  { id: 'artist', title: '🎨 예술가', icon: '🎨' },
  { id: 'sports-elite', title: '⚽ 축구', icon: '⚽' },
  { id: 'soccer-manager', title: '🧢 축구 감독', icon: '🧢' },
  { id: 'study-abroad-usa', title: '🇺🇸 조기유학(미국)', icon: '🇺🇸' },
  { id: 'us-settled-life', title: '🇺🇸 미국 정착', icon: '🇺🇸' },
  { id: 'pro-gamer', title: '🎮 프로게이머', icon: '🎮' },
  { id: 'esports-coach', title: '🎯 프로게이머 감독', icon: '🎯' },
  { id: 'teen-entrepreneur', title: '💼 10대 창업가', icon: '💼' },
  { id: 'student-leadership', title: '👑 학생 리더십', icon: '👑' },
  { id: 'prison', title: '🔒 수감 생활', icon: '🔒' },
  { id: 'developer', title: '💻 개발자', icon: '💻' },
  { id: 'youth-politics', title: '🏛️ 청년 정치', icon: '🏛️' },
  { id: 'small-business', title: '🏪 자영업', icon: '🏪' },
  { id: 'regular-employee', title: '💼 정규직 직장인', icon: '💼' },
  { id: 'logistics', title: '🚚 물류직', icon: '🚚' }
];

// 재능·재산 목록(17장/재산 상세) - functions/game-data.js의 addTalent/addAsset
// id·label과 반드시 같아야 한다(서버가 클라이언트에 따로 안 내려주므로 수동
// 동기화, 2026-08-23 사용자 지시 - "나의 도감에 [재산 해금], [재능 해금]도
// 추가해줘"). 새 재능·재산이 추가되면 여기에도 그대로 이어 붙이면 된다.
const TALENTS_META = [
  { id: 'arts', title: '🎵 음악', icon: '🎵' },
  { id: 'math', title: '🔢 수학', icon: '🔢' },
  { id: 'dance', title: '💃 춤', icon: '💃' },
  { id: 'speaking', title: '🗣️ 말솜씨', icon: '🗣️' },
  { id: 'sports', title: '🏃 운동', icon: '🏃' },
  { id: 'gaming', title: '🎮 게임', icon: '🎮' },
  { id: 'business', title: '💼 사업 수완', icon: '💼' },
  { id: 'leadership', title: '👑 리더십', icon: '👑' },
  { id: 'acting', title: '🎭 연기', icon: '🎭' },
  { id: 'hidden-talent', title: '✨ 숨은 끼', icon: '✨' },
  { id: 'coding', title: '💻 코딩', icon: '💻' }
];
const ASSETS_META = [
  { id: 'lottery-ticket', title: '🎟️ 복권', icon: '🎟️' },
  { id: 'insurance', title: '🛡️ 보험', icon: '🛡️' },
  { id: 'seed-money', title: '💰 종잣돈', icon: '💰' },
  { id: 'bonus-cash', title: '💰 성과급 목돈', icon: '💰' },
  { id: 'first-car', title: '🚗 중고차', icon: '🚗' },
  { id: 'fine-jewelry', title: '💍 예물/보석', icon: '💍' },
  { id: 'premium-appliances', title: '🛋️ 고급 가전', icon: '🛋️' },
  { id: 'maturity-savings', title: '💰 만기 적금', icon: '💰' },
  { id: 'first-home', title: '🏠 내 집', icon: '🏠' },
  { id: 'studio-unit', title: '🏢 오피스텔', icon: '🏢' },
  { id: 'commercial-unit', title: '🏬 상가', icon: '🏬' },
  { id: 'impulse-luxury-item', title: '✨ 충동 구매품', icon: '✨' },
  { id: 'bigger-home', title: '🏡 넓은 집', icon: '🏡' },
  { id: 'collectibles', title: '🎨 수집품', icon: '🎨' },
  { id: 'severance-payout', title: '💰 퇴직금', icon: '💰' },
  { id: 'vacation-home', title: '🏖️ 별장', icon: '🏖️' },
  { id: 'compact-car', title: '🚙 소형차', icon: '🚙' }
];
// 직업 목록(2026-08-23, 사용자 지시 - "나의 도감에 직업도 추가해줘") - 재능·
// 재산과 완전히 같은 패턴. functions/game-data.js에서 setOccupation으로 쓰이는
// 모든 id·label을 그대로 옮겼다(ex-convict는 특정 선택지가 아니라 엔진 자동
// 규칙으로 붙는 직업이라 game-data.js엔 없지만 여기엔 포함).
const OCCUPATIONS_META = [
  { id: 'actor-newcomer', title: '🎭 무명 배우', icon: '🎭' },
  { id: 'artist-writer', title: '🎨 예술가', icon: '🎨' },
  { id: 'career-changer', title: '✨ 진로 전환', icon: '✨' },
  { id: 'career-pivot', title: '🔄 커리어 전환자', icon: '🔄' },
  { id: 'civil-servant', title: '🏛️ 공무원', icon: '🏛️' },
  { id: 'class-president', title: '👑 전교 회장', icon: '👑' },
  { id: 'consultant', title: '🎤 컨설턴트/강사', icon: '🎤' },
  { id: 'entrepreneur', title: '🚀 창업가', icon: '🚀' },
  { id: 'esports-coach', title: '🎯 프로게이머 감독', icon: '🎯' },
  { id: 'ex-convict', title: '🔓 출소자', icon: '🔓' },
  { id: 'healthcare-worker', title: '🏥 의료직', icon: '🏥' },
  { id: 'idol', title: '⭐ 아이돌', icon: '⭐' },
  { id: 'inmate', title: '🔒 수감자', icon: '🔒' },
  { id: 'job-changed', title: '🏢 이직 후 직장인', icon: '🏢' },
  { id: 'junior-developer', title: '💻 주니어 개발자', icon: '💻' },
  { id: 'logistics-worker', title: '🚚 물류직', icon: '🚚' },
  { id: 'national-athlete', title: '🥇 축구 국가대표', icon: '🥇' },
  { id: 'office-worker', title: '💼 정규직 직장인', icon: '💼' },
  { id: 'pro-athlete', title: '⚽ 프로 축구선수', icon: '⚽' },
  { id: 'pro-gamer', title: '🎮 프로게이머', icon: '🎮' },
  { id: 'public-corp-employee', title: '🏢 공기업 직원', icon: '🏢' },
  { id: 're-employed', title: '💼 재취업', icon: '💼' },
  { id: 'retired', title: '🌿 은퇴자', icon: '🌿' },
  { id: 'rising-actor', title: '🎬 라이징 배우', icon: '🎬' },
  { id: 'sales-rep', title: '💼 영업직', icon: '💼' },
  { id: 'senior-developer', title: '👨‍💻 시니어 개발자', icon: '👨‍💻' },
  { id: 'small-business-owner', title: '🏪 자영업자', icon: '🏪' },
  { id: 'soccer-manager', title: '🧢 축구 감독', icon: '🧢' },
  { id: 'startup-founder', title: '🚀 초기 창업가', icon: '🚀' },
  { id: 'student-athlete', title: '⚽ 축구 유망주', icon: '⚽' },
  { id: 'student-council-president', title: '👑 대학 학생회장', icon: '👑' },
  { id: 'teacher', title: '📚 교사', icon: '📚' },
  { id: 'team-lead', title: '📈 팀장/부서장', icon: '📈' },
  { id: 'tech-worker', title: '🔧 기술직 사원', icon: '🔧' },
  { id: 'teen-entrepreneur', title: '💼 10대 창업가', icon: '💼' },
  { id: 'trainee', title: '🎤 연습생', icon: '🎤' },
  { id: 'veteran-actor', title: '🏆 베테랑 배우', icon: '🏆' },
  { id: 'volunteer-work', title: '🤝 재능기부/파트타임', icon: '🤝' },
  { id: 'local-council-candidate', title: '🗳️ 지방의회 후보', icon: '🗳️' },
  { id: 'local-council-member', title: '🏛️ 지방의원', icon: '🏛️' }
];

const collectionModal = document.getElementById('collectionModal');
const collectionLoggedOut = document.getElementById('collectionLoggedOut');
const collectionLoggedIn = document.getElementById('collectionLoggedIn');
const collectionProgress = document.getElementById('collectionProgress');
const collectionGrid = document.getElementById('collectionGrid');
const collectionRouteProgress = document.getElementById('collectionRouteProgress');
const collectionRouteGrid = document.getElementById('collectionRouteGrid');
const collectionTalentProgress = document.getElementById('collectionTalentProgress');
const collectionTalentGrid = document.getElementById('collectionTalentGrid');
const collectionAssetProgress = document.getElementById('collectionAssetProgress');
const collectionAssetGrid = document.getElementById('collectionAssetGrid');
const collectionOccupationProgress = document.getElementById('collectionOccupationProgress');
const collectionOccupationGrid = document.getElementById('collectionOccupationGrid');

function renderMetaGrid(gridEl, progressEl, meta, unlockedIds, progressLabel) {
  gridEl.innerHTML = '';
  meta.forEach((e) => {
    const unlocked = unlockedIds.includes(e.id);
    const card = document.createElement('div');
    // 미해금이어도 이름은 그대로 공개한다(2026-08-22, 사용자 지시 - "???" 대신
    // 이름 표시) - 아이콘만 자물쇠로 가려서 "아직 못 겪었다"는 표시만 남긴다.
    card.className = 'collection-card' + (unlocked ? '' : ' locked');
    card.innerHTML = '<span class="cc-icon">' + (unlocked ? e.icon : '🔒') + '</span><span class="cc-title">' + escapeHtml(e.title) + '</span>';
    gridEl.appendChild(card);
  });
  progressEl.textContent = progressLabel + ' ' + meta.length + '종 중 ' + unlockedIds.length + '개 해금';
}

// 로그인 여부(구글·카카오·스트리머 인증 중 하나) 판별 - users/{uid}는 이
// 생태계 다른 프로젝트가 이미 쓰는 공유 노드라 그 필드를 그대로 읽는다.
async function refreshCollectionView() {
  if (!currentUser) return;
  const userSnap = await get(ref(db, 'users/' + currentUser.uid));
  const userData = userSnap.val() || {};
  const isLoggedIn = !!(userData.googleLinked || userData.kakaoLinked || userData.streamerVerified);
  if (!isLoggedIn) {
    collectionLoggedOut.classList.remove('hidden');
    collectionLoggedIn.classList.add('hidden');
    return;
  }
  collectionLoggedOut.classList.add('hidden');
  collectionLoggedIn.classList.remove('hidden');
  const collectionSnap = await get(ref(db, 'lifeGame/collection/' + currentUser.uid));
  const collectionData = collectionSnap.val() || {};
  renderMetaGrid(collectionGrid, collectionProgress, ENDINGS_META, Object.keys(collectionData.endings || {}), '엔딩');
  renderMetaGrid(collectionRouteGrid, collectionRouteProgress, ROUTES_META, Object.keys(collectionData.routes || {}), '루트');
  renderMetaGrid(collectionTalentGrid, collectionTalentProgress, TALENTS_META, Object.keys(collectionData.talents || {}), '재능');
  renderMetaGrid(collectionAssetGrid, collectionAssetProgress, ASSETS_META, Object.keys(collectionData.assets || {}), '재산');
  renderMetaGrid(collectionOccupationGrid, collectionOccupationProgress, OCCUPATIONS_META, Object.keys(collectionData.occupations || {}), '직업');
}

document.getElementById('openCollectionBtn').addEventListener('click', () => {
  collectionModal.classList.remove('hidden');
  refreshCollectionView();
});
document.getElementById('closeCollectionBtn').addEventListener('click', () => {
  collectionModal.classList.add('hidden');
});
document.getElementById('collectionLoginGoogleBtn').addEventListener('click', () => window.loginWithGoogle());
document.getElementById('collectionLoginKakaoBtn').addEventListener('click', () => window.loginWithKakao());
document.getElementById('collectionLoginStreamerBtn').addEventListener('click', () => {
  collectionModal.classList.add('hidden');
  window.openStreamerVerifyModal();
});

// ------------------------------------------------------------
// 1) 스트리머 검색 - {id,name} 목록을 정적 파일(streamer-names.json)에서 받아
// 클라이언트에서 부분일치 필터(soop-stock-market 자체 검색창과 동일한 패턴 -
// 인덱스가 없어서 이 방식이 맞다). stocks 노드를 직접 읽던 걸 정적 파일로
// 바꾼 이유(2026-08-18) - stocks는 가격·거래량 등 이 검색엔 안 쓰는 필드까지
// 포함해 매번 훨씬 큰 용량을 받게 되고, 접속자마다 각자 다운로드하는 구조라
// 앞으로 시청자도 같은 페이지에 동시 접속하는 멀티플레이가 되면 그 인원수만큼
// RTDB 다운로드 비용이 곱해진다. streamer-names.json은 이름 검색에 필요한
// 최소 데이터만 담아 정적 호스팅(CDN 캐시)으로 서빙하고, scripts/update-
// streamer-names.js를 수동 실행할 때만 최신화한다(스케줄러 없음 - 사용자 지시).
// ------------------------------------------------------------
let allStocks = [];
fetch('./streamer-names.json').then((res) => res.json()).then((data) => {
  allStocks = data;
}).catch((e) => console.error('스트리머 이름 목록을 불러오지 못했습니다:', e));

const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchResults.innerHTML = '';
  if (!q) return;
  const matches = allStocks.filter((s) => s.name.includes(q)).slice(0, 12);
  if (!matches.length) {
    searchResults.innerHTML = '<p class="empty-msg">일치하는 스트리머가 없어요. 이름을 직접 입력해도 괜찮아요.</p>';
    return;
  }
  matches.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'streamer-row';
    row.innerHTML = '<span>' + escapeHtml(s.name) + '</span>';
    row.addEventListener('click', () => selectStreamer(s.name, s.id));
    searchResults.appendChild(row);
  });
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------
// 화면 전환 페이드 - 패널이 통째로 바뀌는 모든 지점(검색→이름짓기→게임 시작/
// 이어하기→다음 구간→엔딩)에서 뚝 끊기지 않고 페이드아웃 후 페이드인 되게
// 하는 공통 헬퍼. hidden 클래스는 display:none이라 그 자체로는 트랜지션이
// 안 되므로, 사라질 땐 opacity를 0으로 줄인 뒤에 hidden을 붙이고, 나타날 땐
// 반대로 hidden을 먼저 뗀 다음 opacity를 0→1로 올린다.
// ------------------------------------------------------------
const REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FADE_MS = REDUCE_MOTION ? 0 : 260;
// setTimeout 스케줄링은 브라우저 부하에 따라 살짝 밀릴 수 있어, 콘텐츠를
// 실제로 교체/숨기는 타이밍은 CSS 트랜지션 재생 시간보다 이만큼 더 기다린다 -
// 트랜지션이 채 안 끝난 상태에서 내용이 바뀌어 보이는 걸 방지.
const SWAP_BUFFER_MS = REDUCE_MOTION ? 0 : 100;

// 알츠하이머(causesChoiceFadeout)를 갖고 있으면 선택지가 뜨자마자 10초에
// 걸쳐 서서히 투명해져 10초 후엔 완전히 안 보이게 된다 - 이건 화면
// 전환용 장식이 아니라 실제 게임 난이도(제한 시간)라서, 다른 트랜지션과
// 달리 prefers-reduced-motion과 무관하게 항상 10초로 고정한다.
const CHOICE_FADEOUT_MS = 10000;

function fadeOut(els) {
  const visible = els.filter((el) => el && !el.classList.contains('hidden'));
  if (!visible.length) return Promise.resolve();
  return new Promise((resolve) => {
    // transition 프로퍼티와 opacity 값을 같은 틱에서 같이 바꾸면 크로미움이
    // "이전 상태"를 제대로 커밋하지 못해 트랜지션이 늦게 시작되거나 끝까지
    // 안 끝난 채로 다음 단계로 넘어가는 경우가 있다 - 그래서 먼저 transition을
    // 끈 채로 지금 상태(opacity:1)를 리플로우로 확정한 다음에야 실제 트랜지션을
    // 건다.
    visible.forEach((el) => { el.style.transition = 'none'; el.style.opacity = '1'; });
    void document.body.offsetWidth;
    visible.forEach((el) => {
      el.style.transition = 'opacity ' + FADE_MS + 'ms ease';
      el.style.opacity = '0';
    });
    setTimeout(() => {
      visible.forEach((el) => { el.classList.add('hidden'); el.style.opacity = ''; el.style.transition = ''; });
      resolve();
    }, FADE_MS + SWAP_BUFFER_MS);
  });
}

function fadeIn(els) {
  const list = els.filter(Boolean);
  list.forEach((el) => {
    el.classList.remove('hidden');
    el.style.transition = 'none';
    el.style.opacity = '0';
  });
  void document.body.offsetWidth; // 강제 리플로우 - opacity:0이 실제로 적용된 뒤에 트랜지션이 걸리게
  list.forEach((el) => {
    el.style.transition = 'opacity ' + FADE_MS + 'ms ease';
    el.style.opacity = '1';
  });
}

let selectedStreamerId = null;
const searchSection = document.getElementById('searchSection');
const nameSection = document.getElementById('nameSection');
const nameInput = document.getElementById('nameInput');
function selectStreamer(name, id) {
  selectedStreamerId = id || null;
  nameInput.value = name;
  fadeOut([searchSection]).then(() => fadeIn([nameSection]));
}

document.getElementById('backToSearchBtn').addEventListener('click', async () => {
  await fadeOut([nameSection]);
  fadeIn([searchSection]);
  searchInput.focus();
});

// ------------------------------------------------------------
// 계정당 저장 슬롯 1개 - 창을 껐다 다시 열어도 이어할 수 있게. 매 선택마다
// 서버가 이미 lifeGame/playthroughs/{uid}에 진행 상태를 저장해두므로
// (functions/index.js), 여기선 로그인 직후 그 저장이 있는지만 가볍게
// 직접 읽어서(.read가 본인 uid만 허용) 확인한다 - 함수 호출은 실제로
// "이어하기"를 누를 때만 한다.
// ------------------------------------------------------------
const resumeSection = document.getElementById('resumeSection');
const resumeInfo = document.getElementById('resumeInfo');
const resumeBtn = document.getElementById('resumeBtn');

async function checkResume(uid) {
  try {
    const snap = await get(ref(db, 'lifeGame/playthroughs/' + uid));
    const play = snap.val();
    if (play && !play.completed) {
      resumeInfo.textContent = (play.streamerName || '이름 없음') + '님의 인생이 저장되어 있어요 (' + (play.stageIndex + 1) + '번째 구간까지 진행).';
      fadeIn([resumeSection]);
      return;
    }
  } catch (e) {
    console.error('저장된 진행 확인 실패:', e);
  }
  fadeIn([searchSection]);
}

resumeBtn.addEventListener('click', async () => {
  resumeBtn.disabled = true;
  try {
    const res = await resumePlaythroughFn();
    await fadeOut([resumeSection]);
    if (res.data.completed) {
      showEnding(res.data.ending, res.data.stats, res.data.choiceHistory, res.data.familyMembers, res.data.occupationHistory, res.data.assets, res.data.cashHoldings, res.data.acquaintances, res.data.healthConditions, res.data.locationHistory, res.data.talents, res.data.hobbies);
    } else {
      await fadeOut([mainHeader]);
      renderStatBars(statBars, res.data.stats);
      renderAssets(res.data.assets);
      renderCashHoldings(cashHoldingsEl, res.data.cashHoldings);
      renderHealthConditions(res.data.healthConditions);
      renderFamilyMembers(res.data.familyMembers);
      renderAcquaintances(res.data.acquaintances);
      renderCurrentOccupation(res.data.currentOccupation);
      renderCurrentLocation(res.data.currentLocation);
      renderTalents(res.data.talents);
      renderHobbies(res.data.hobbies);
      renderStage(res.data.stage);
      initAchievementBaseline(res.data);
      // 이어하기 시점엔 이미 진행 중이던 루트를 "방금 진입"으로 오인해 삽화를
      // 다시 띄우지 않도록, 보여주지 않고 상태만 기록해둔다.
      lastKnownRouteId = res.data.currentRoute ? res.data.currentRoute.id : null;
      enterHostMode();
      fadeIn([gameSection]);
    }
  } catch (e) {
    console.error('이어하기 실패:', e);
    alert('이어하지 못했어요: ' + (e.message || e));
    resumeBtn.disabled = false;
  }
});

document.getElementById('restartFreshBtn').addEventListener('click', async () => {
  await fadeOut([resumeSection]);
  fadeIn([searchSection]);
});

// ------------------------------------------------------------
// 2) 인생 시작 + 3) 선택 진행
// ------------------------------------------------------------
const mainHeader = document.getElementById('mainHeader');
const gameSection = document.getElementById('gameSection');
const stageContent = document.getElementById('stageContent');
const stageName = document.getElementById('stageName');
const stageAge = document.getElementById('stageAge');
const storyText = document.getElementById('storyText');
const choiceList = document.getElementById('choiceList');
const resultBox = document.getElementById('resultBox');
const statBars = document.getElementById('statBars');
const nextBtn = document.getElementById('nextBtn');
const startBtn = document.getElementById('startBtn');
const diceOverlay = document.getElementById('diceOverlay');
const DICE_REVEAL_MS = 3000;
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const TOAST_MS = 2200;

let toastTimer = null;
// PC(마우스 사용 가능 기기)에서는 토스트를 화면 하단 고정 대신 마지막 마우스
// 위치 근처에 띄운다 - 모바일은 마우스 좌표 자체가 없으므로 기존 하단 고정
// 위치를 그대로 유지한다.
const IS_MOUSE_DEVICE = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
let lastMouseX = null;
let lastMouseY = null;
if (IS_MOUSE_DEVICE) {
  window.addEventListener('mousemove', (e) => { lastMouseX = e.clientX; lastMouseY = e.clientY; });
}
function showToast(message) {
  toastMsg.textContent = message;
  if (IS_MOUSE_DEVICE && lastMouseX !== null && lastMouseY !== null) {
    const rect = toast.getBoundingClientRect();
    const w = rect.width || 200;
    const h = rect.height || 40;
    const x = Math.min(Math.max(lastMouseX + 18, 12), window.innerWidth - w - 12);
    const y = Math.min(Math.max(lastMouseY - h / 2, 12), window.innerHeight - h - 12);
    toast.style.left = x + 'px';
    toast.style.top = y + 'px';
    toast.style.bottom = 'auto';
    toast.style.transform = 'none';
  } else {
    toast.style.left = '';
    toast.style.top = '';
    toast.style.bottom = '';
    toast.style.transform = '';
  }
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), TOAST_MS);
}

// 좌측 패널 항목 호버 설명(2026-08-24, 사용자 지시 - "이 곳에 표시되는 모든
// 항목에 마우스를 올리면 설명이 뜨고 마우스를 따라다니게 해줘. 마우스가
// 벗어나면 다시 사라지게 해줘") - 재산/건강/가족/지인/재능/취미 칩과 스탯 바는
// renderXXX가 innerHTML로 매번 통째로 새로 그려서 개별 엘리먼트에 리스너를
// 붙이면 재렌더링마다 다시 붙여야 한다. 대신 안 바뀌는 부모(gameLeftPage) 하나에
// 위임(delegation)해서, data-tooltip 속성이 있는 엘리먼트 위에서만 반응하게
// 한다 - 렌더 함수는 그 속성만 채워주면 되고 리스너를 신경 쓸 필요가 없다.
const hoverTooltipEl = document.getElementById('hoverTooltip');
let hoverTooltipTarget = null;
function positionHoverTooltip(x, y) {
  const rect = hoverTooltipEl.getBoundingClientRect();
  const w = rect.width || 160;
  const h = rect.height || 30;
  const px = Math.min(Math.max(x + 16, 8), window.innerWidth - w - 8);
  const py = Math.min(Math.max(y + 16, 8), window.innerHeight - h - 8);
  hoverTooltipEl.style.left = px + 'px';
  hoverTooltipEl.style.top = py + 'px';
}
function hideHoverTooltip() {
  hoverTooltipTarget = null;
  hoverTooltipEl.classList.remove('show');
}
function setupHoverTooltips(root) {
  if (!root) return;
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (!el || el === hoverTooltipTarget) return;
    hoverTooltipTarget = el;
    hoverTooltipEl.textContent = el.dataset.tooltip;
    hoverTooltipEl.classList.add('show');
    positionHoverTooltip(e.clientX, e.clientY);
  });
  root.addEventListener('mousemove', (e) => {
    if (!hoverTooltipTarget) return;
    positionHoverTooltip(e.clientX, e.clientY);
  });
  root.addEventListener('mouseout', (e) => {
    if (!hoverTooltipTarget) return;
    // relatedTarget이 여전히 같은 데이터-툴팁 엘리먼트 안이면(자식 태그 사이
    // 이동 등) 유지하고, 완전히 벗어났을 때만 숨긴다.
    if (e.relatedTarget && hoverTooltipTarget.contains(e.relatedTarget)) return;
    hideHoverTooltip();
  });
}
setupHoverTooltips(document.getElementById('gameLeftPage'));

// ------------------------------------------------------------
// 방송 콘텐츠 백로그 3번째 항목: 복권 1등·2등 대박 축하 이펙트
// (2026-08-17). 서버가 prizeTable로 등수를 뽑았을 때만 응답에
// prizeLabel('1등'~'꽝')을 실어주므로, 그 값만 보고 판단한다(딜타 크기로
// 추측하지 않음 - index.js의 resolvedLabel 참고).
// ------------------------------------------------------------
const confettiCanvas = document.getElementById('confettiCanvas');
const confettiCtx = confettiCanvas.getContext('2d');
const CONFETTI_COLORS = ['#d4a24c', '#7ea987', '#cd7256', '#c97ab0', '#6f93c9'];

function burstConfetti() {
  if (REDUCE_MOTION) return;
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  confettiCanvas.classList.remove('hidden');

  const particles = [];
  const count = 140;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * confettiCanvas.width,
      y: -20 - Math.random() * confettiCanvas.height * 0.4,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      vy: 2.5 + Math.random() * 3.5,
      vx: (Math.random() - 0.5) * 2.5,
      rotation: Math.random() * 360,
      vr: (Math.random() - 0.5) * 12
    });
  }

  const durationMs = 2600;
  const startedAt = performance.now();
  function frame(now) {
    const elapsed = now - startedAt;
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate((p.rotation * Math.PI) / 180);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      confettiCtx.restore();
    });
    if (elapsed < durationMs) {
      requestAnimationFrame(frame);
    } else {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      confettiCanvas.classList.add('hidden');
    }
  }
  requestAnimationFrame(frame);
}

// Web Audio API로 즉석에서 합성한 짧은 팡파르 - 외부 오디오 파일을 쓰지
// 않기 위한 선택(저작권 확인 불필요). 브라우저 자동재생 정책상 사용자
// 클릭(선택지 클릭) 이후 호출되는 경로에서만 쓰므로 문제없다.
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(ctx, freq, startTime, duration, gainPeak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}
function playJackpotFanfare() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5-E5-G5-C6 상승 아르페지오
  const now = ctx.currentTime;
  notes.forEach((freq, i) => playTone(ctx, freq, now + i * 0.11, 0.5, 0.12));
}

// prizeLabel이 1등/2등일 때만 자축 이펙트를 튼다(3~5등·꽝은 평소 결과
// 박스 톤 차별화만으로 충분 - 매번 컨페티가 뜨면 오히려 특별함이 옅어짐).
function celebrateIfJackpot(prizeLabel) {
  if (prizeLabel !== '1등' && prizeLabel !== '2등') return;
  burstConfetti();
  playJackpotFanfare();
}

// ------------------------------------------------------------
// 방송 콘텐츠 백로그 4번째 항목: 즉시 사망 엔딩 5종(collapse·bankruptcy·
// obscurity·despair·isolation - INSTANT_ENDING_BUILDERS 참고) 진입 시
// 위기 이펙트(2026-08-17). 이 5개 id는 game-data.js의 build*Ending()이
// 고정으로 반환하는 값이라 서버 응답을 더 손댈 필요 없이 ending.id만
// 보고 판단 가능.
// ------------------------------------------------------------
const INSTANT_ENDING_IDS = ['collapse', 'bankruptcy', 'obscurity', 'despair', 'isolation'];
const crisisFlashEl = document.getElementById('crisisFlash');
const wrapEl = document.querySelector('.wrap');

function playCrisisWarning() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // 낮은 음 두 번 - 경고음 느낌의 하강 톤
  playTone(ctx, 220, now, 0.35, 0.14);
  playTone(ctx, 164.81, now + 0.22, 0.45, 0.14);
}

function triggerCrisisEffect() {
  playCrisisWarning();
  if (REDUCE_MOTION) {
    // 흔들림은 생략해도 붉은 플래시는 짧게 한 번만 보여준다(모션 없이도
    // "위기" 신호는 필요).
    crisisFlashEl.classList.remove('hidden');
    requestAnimationFrame(() => crisisFlashEl.classList.add('active'));
    setTimeout(() => { crisisFlashEl.classList.remove('active'); setTimeout(() => crisisFlashEl.classList.add('hidden'), 150); }, 300);
    return;
  }
  wrapEl.classList.remove('crisis-shake');
  void wrapEl.offsetWidth;
  wrapEl.classList.add('crisis-shake');
  crisisFlashEl.classList.remove('hidden');
  requestAnimationFrame(() => crisisFlashEl.classList.add('active'));
  setTimeout(() => crisisFlashEl.classList.remove('active'), 180);
  setTimeout(() => crisisFlashEl.classList.add('hidden'), 400);
  setTimeout(() => wrapEl.classList.remove('crisis-shake'), 650);
}

let pendingNextStage = null;

const STAT_LABELS = { wealth: '재산', fame: '인기', happiness: '행복', health: '건강', relationship: '관계' };
const STAT_COLORS = { wealth: 'var(--gold)', fame: 'var(--coral)', happiness: 'var(--rose)', health: 'var(--sage)', relationship: 'var(--sky)' };
// 스탯 호버 설명(2026-08-24) - 각 스탯이 0이 됐을 때 어떤 즉시 사망 엔딩으로
// 이어지는지(INSTANT_ENDING_BUILDERS, functions/index.js 참고)까지 같이 알려준다.
const STAT_TOOLTIPS = {
  wealth: '재산 — 보유 자산과 소득 수준. 0이 되면 파산으로 삶이 끝나요.',
  fame: '인기 — 대중적 인지도와 화제성. 0이 되면 잊혀진 삶으로 삶이 끝나요.',
  happiness: '행복 — 삶에 대한 만족도. 0이 되면 절망으로 삶이 끝나요.',
  health: '건강 — 신체·정신 건강 상태. 0이 되면 건강 붕괴로 삶이 끝나요.',
  relationship: '관계 — 가족·지인과의 유대감. 0이 되면 고립으로 삶이 끝나요.'
};

function renderStatBars(el, stats) {
  el.innerHTML = '';
  Object.keys(STAT_LABELS).forEach((key) => {
    const row = document.createElement('div');
    row.className = 'stat-bar-row';
    row.dataset.stat = key;
    row.dataset.tooltip = STAT_TOOLTIPS[key];
    row.innerHTML =
      '<span class="stat-bar-label">' + STAT_LABELS[key] + '</span>' +
      '<span class="stat-bar-track"><span class="stat-bar-fill" style="width:' + (stats[key] || 0) + '%; background:' + STAT_COLORS[key] + ';"></span></span>' +
      '<span class="stat-bar-val">' + (stats[key] || 0) + '</span>';
    el.appendChild(row);
  });
}

// 스탯 변화 강조 - |delta|가 큰(기본 5 이상) 스탯만 막대에 잠깐 글로우를
// 준다(2026-08-17, 방송 콘텐츠 백로그 2번째 항목 - "+1이든 +25든 똑같이
// 부드럽게 바뀌기만 해서 큰 사건이라는 느낌이 안 남"). renderStatBars() 직후
// 호출해야 한다 - renderStatBars가 innerHTML을 통째로 새로 그리기 때문에
// 애니메이션 클래스는 항상 그다음에 얹는다.
const STAT_PULSE_THRESHOLD = 5;
function flashStatChanges(el, deltas) {
  if (!deltas) return;
  Object.keys(deltas).forEach((key) => {
    const delta = deltas[key];
    if (Math.abs(delta) < STAT_PULSE_THRESHOLD) return;
    const fill = el.querySelector('.stat-bar-row[data-stat="' + key + '"] .stat-bar-fill');
    if (!fill) return;
    fill.classList.add(delta > 0 ? 'pulse-positive' : 'pulse-negative');
  });
}

const assetsEl = document.getElementById('assets');
const endingAssetsEl = document.getElementById('endingAssets');
const cashHoldingsEl = document.getElementById('cashHoldings');
const endingCashHoldingsEl = document.getElementById('endingCashHoldings');

// ------------------------------------------------------------
// 인생 종합 점수 선그래프(2026-08-18, 사용자 지시 - "엔딩에 도달했을때 인생
// 종합 점수를 선그래프로 볼수있는 기능을 추가하고 싶어"). 서버가 choiceLog
// 각 항목에 그 선택 직후의 다섯 스탯 스냅샷을 실어 choiceHistory로 내려주면
// (functions/index.js buildChoiceHistory), 그 다섯 스탯의 평균을 "종합
// 점수"(0~100)로 계산해 나이순으로 이은 선그래프를 그린다. 차트 라이브러리
// 없이(번들러 없는 정적 HTML 원칙) Canvas 2D로 직접 그린다.
// ------------------------------------------------------------
const scoreChartEl = document.getElementById('scoreChart');
const scoreChartSummaryEl = document.getElementById('scoreChartSummary');

function parseAgeFromRange(ageRange) {
  const n = parseInt(ageRange, 10);
  return Number.isFinite(n) ? n : 0;
}
function compositeScore(stats) {
  const keys = ['wealth', 'fame', 'happiness', 'health', 'relationship'];
  const sum = keys.reduce((acc, k) => acc + (stats[k] || 0), 0);
  return sum / keys.length;
}

function renderScoreChart(canvas, summaryEl, choiceHistory) {
  const points = (choiceHistory || [])
    .filter((h) => h.stats)
    .map((h) => ({ age: parseAgeFromRange(h.ageRange), score: compositeScore(h.stats) }));

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 300;
  const cssHeight = canvas.clientHeight || 160;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const style = getComputedStyle(document.documentElement);
  const gold = style.getPropertyValue('--gold').trim() || '#d4a24c';
  const line = style.getPropertyValue('--line').trim() || '#362f23';
  const textFaint = style.getPropertyValue('--text-faint').trim() || '#6e6552';

  if (points.length < 2) {
    summaryEl.textContent = points.length ? '아직 그래프로 보여주기엔 선택 기록이 부족해요.' : '';
    ctx.fillStyle = textFaint;
    ctx.font = '12.5px -apple-system, sans-serif';
    ctx.fillText('점수 추이를 그리기엔 기록이 너무 짧아요.', 8, cssHeight / 2);
    return;
  }

  const padL = 28, padR = 8, padT = 10, padB = 20;
  const plotW = cssWidth - padL - padR;
  const plotH = cssHeight - padT - padB;
  const minAge = points[0].age;
  const maxAge = points[points.length - 1].age;
  const ageSpan = Math.max(1, maxAge - minAge);
  const xFor = (age) => padL + ((age - minAge) / ageSpan) * plotW;
  const yFor = (score) => padT + (1 - score / 100) * plotH;

  // 가로 기준선(0/25/50/75/100점)
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.fillStyle = textFaint;
  ctx.font = '10.5px -apple-system, sans-serif';
  ctx.textBaseline = 'middle';
  [0, 25, 50, 75, 100].forEach((v) => {
    const y = yFor(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillText(String(v), 2, y);
  });

  // 나이 축 라벨(시작/끝 나이만 - 좁은 패널에 촘촘히 다 넣으면 안 읽힘)
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(minAge + '세', padL, cssHeight - 4);
  const endLabel = maxAge + '세';
  ctx.fillText(endLabel, padL + plotW - ctx.measureText(endLabel).width, cssHeight - 4);

  // 선 아래 옅은 채움
  ctx.beginPath();
  ctx.moveTo(xFor(points[0].age), yFor(points[0].score));
  points.forEach((p) => ctx.lineTo(xFor(p.age), yFor(p.score)));
  ctx.lineTo(xFor(points[points.length - 1].age), padT + plotH);
  ctx.lineTo(xFor(points[0].age), padT + plotH);
  ctx.closePath();
  ctx.fillStyle = mixGoldAlpha(gold, 0.14);
  ctx.fill();

  // 점수 선
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xFor(p.age), y = yFor(p.score);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 각 선택 지점 점 찍기
  ctx.fillStyle = gold;
  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(xFor(p.age), yFor(p.score), 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // 요약 문구 - 최고점/최저점을 나이와 함께
  let peak = points[0], trough = points[0];
  points.forEach((p) => {
    if (p.score > peak.score) peak = p;
    if (p.score < trough.score) trough = p;
  });
  const finalScore = Math.round(points[points.length - 1].score);
  summaryEl.textContent = '최종 ' + finalScore + '점 · 최고 ' + Math.round(peak.score) + '점(' + peak.age + '세) · 최저 ' +
    Math.round(trough.score) + '점(' + trough.age + '세)';
}

// canvas 2D API는 color-mix()를 못 받아서, "gold를 옅게 깐 채움색"만 간단히
// rgba로 근사한다(정확한 색 변환보다 "옅게 보이는지"가 중요한 배경 채움이라
// 이 정도 근사로 충분).
function mixGoldAlpha(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'rgba(212,162,76,' + alpha + ')';
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// 보유 현금자산(원 단위) - 서버(cashUnitForAge)가 wealth delta를 나이대별
// 원화로 환산해 누적한 값을 그대로 만원 단위로 표시만 한다. 재산 상세
// 패널 최상단, 자산 목록(assets-list)보다 위에 둔다(2026-08-17, 사용자
// 지시 - "재산 중에 보유 현금자산도 추가").
function formatCashHoldings(won) {
  const manwon = Math.round((won || 0) / 10000);
  return '💰 보유 현금 ' + manwon.toLocaleString('ko-KR') + '만원';
}
function renderCashHoldings(el, won) {
  el.textContent = formatCashHoldings(won);
}

// 재산 목록("현재 재산 상세") - 선택지가 addAsset/removeAsset을 붙이면 서버가
// 갱신해서 내려주는 assets를 그대로 표시만 한다(건강/가족 상세와 동일 패턴).
// container를 받아서 진행 화면(#assets)과 엔딩 화면(#endingAssets) 양쪽에
// 재사용한다.
// 재산 자산 종류(2026-08-24, 호버 설명용) - functions/game-data.js의
// addAsset.type과 그대로 대응(realestate/movable/cash/insurance/vehicle).
const ASSET_TYPE_LABELS = {
  realestate: '🏠 부동산',
  movable: '📦 동산',
  cash: '💵 현금성',
  insurance: '🛡️ 보험',
  vehicle: '🚗 차량'
};
function renderAssetsInto(container, assets) {
  container.innerHTML = '';
  if (!assets || !assets.length) {
    const empty = document.createElement('span');
    empty.className = 'asset-empty';
    empty.textContent = '아직 소유한 재산 없음';
    container.appendChild(empty);
    return;
  }
  assets.forEach((asset) => {
    const chip = document.createElement('span');
    chip.className = 'asset-chip';
    chip.textContent = asset.label;
    chip.dataset.tooltip = asset.label + ' — ' + (ASSET_TYPE_LABELS[asset.type] || '재산') + ' 자산';
    container.appendChild(chip);
  });
}
function renderAssets(assets) {
  renderAssetsInto(assetsEl, assets);
}

const healthConditionsEl = document.getElementById('healthConditions');
const endingHealthConditionsEl = document.getElementById('endingHealthConditions');

// renderStage()가 "지금 알츠하이머(causesChoiceFadeout)가 있는지" 알 수 있게
// 최신 healthConditions를 따로 기억해둔다 - applyOutcome()에서 다음 구간
// 데이터를 미리 받아도 실제 renderStage() 호출은 "다음" 버튼을 눌러 페이드
// 전환이 끝난 뒤에야 일어나므로, 그 사이에도 값이 남아있어야 한다.
let currentHealthConditions = [];

// 부상·질병 목록("현재 건강 상세") - 선택지가 addCondition/removeCondition을
// 붙이면 서버가 갱신해서 내려주는 healthConditions를 그대로 표시만 한다.
// container를 받아서 진행 화면(#healthConditions)과 엔딩 화면
// (#endingHealthConditions) 양쪽에 재사용한다(2026-08-18, 사용자 지시 -
// 엔딩 화면에 "현재 건강 상세"가 안 보인다는 제보로 추가 - 원래는 재산·가족·
// 지인·직업 이력과 달리 건강 상세만 엔딩 화면용 패널이 없이 설계돼 있었다).
function renderHealthConditionsInto(container, conditions) {
  container.innerHTML = '';
  if (!conditions || !conditions.length) {
    const empty = document.createElement('span');
    empty.className = 'health-empty';
    empty.textContent = '특별한 건강 이슈 없음';
    container.appendChild(empty);
    return;
  }
  conditions.forEach((cond) => {
    const chip = document.createElement('span');
    chip.className = 'health-chip';
    chip.textContent = cond.label;
    const tags = [cond.mental ? '정신 건강 조건' : '신체 건강 조건'];
    if (cond.permanent) tags.push('완치 불가(영구 지속)');
    chip.dataset.tooltip = cond.label + ' — ' + tags.join(' · ');
    container.appendChild(chip);
  });
}
function renderHealthConditions(conditions) {
  currentHealthConditions = conditions || [];
  renderHealthConditionsInto(healthConditionsEl, conditions);
}

const familyMembersEl = document.getElementById('familyMembers');

// 가족 목록("현재 가족 상세") - 선택지가 addFamilyMembers/removeFamilyMembers를
// 붙이면 서버가 갱신해서 내려주는 familyMembers를 그대로 표시만 한다(건강 상세와
// 동일 패턴). container를 받아서 진행 화면(#familyMembers)과 엔딩 화면
// (#endingFamilyMembers) 양쪽에 재사용한다.
// "OO세부터" 접미사(2026-08-24, 호버 설명용) - 가족/지인/재능/취미가 모두
// sinceStageId(예: 'teen-14')를 갖고 있어서, 끝의 나이 숫자만 뽑아 공통으로
// 쓴다. 형식이 안 맞거나 없으면(옛 저장분 등) 빈 문자열로 조용히 생략.
function sinceAgeSuffix(stageId) {
  if (!stageId) return '';
  const m = /-(\d+)$/.exec(stageId);
  return m ? ' (' + m[1] + '세부터)' : '';
}
function renderFamilyMembersInto(container, members) {
  container.innerHTML = '';
  if (!members || !members.length) {
    const empty = document.createElement('span');
    empty.className = 'family-empty';
    empty.textContent = '아직 특별한 가족 구성원 없음';
    container.appendChild(empty);
    return;
  }
  members.forEach((member) => {
    const chip = document.createElement('span');
    chip.className = 'family-chip';
    chip.textContent = member.name ? member.label + ' · ' + member.name : member.label;
    chip.dataset.tooltip = '가족 — ' + member.label + sinceAgeSuffix(member.sinceStageId);
    container.appendChild(chip);
  });
}
function renderFamilyMembers(members) {
  renderFamilyMembersInto(familyMembersEl, members);
}

const acquaintancesEl = document.getElementById('acquaintances');

// 지인 목록("현재 지인 상세") - 가족 상세와 거의 같은 패턴이지만, 가족은 고정
// 역할명(label)만 보여주면 되는 반면 지인은 관계(label)와 실제 이름(name, 서버가
// stocks 노드에서 무작위로 뽑아 내려줌)을 같이 보여준다.
function renderAcquaintancesInto(container, acquaintances) {
  container.innerHTML = '';
  if (!acquaintances || !acquaintances.length) {
    const empty = document.createElement('span');
    empty.className = 'family-empty';
    empty.textContent = '아직 특별한 지인 없음';
    container.appendChild(empty);
    return;
  }
  acquaintances.forEach((acq) => {
    const chip = document.createElement('span');
    chip.className = 'family-chip';
    chip.textContent = acq.label + ' · ' + acq.name;
    chip.dataset.tooltip = '지인 — ' + acq.label + ' ' + acq.name + sinceAgeSuffix(acq.sinceStageId);
    container.appendChild(chip);
  });
}
function renderAcquaintances(acquaintances) {
  renderAcquaintancesInto(acquaintancesEl, acquaintances);
}

const talentsEl = document.getElementById('talents');
const hobbiesEl = document.getElementById('hobbies');

// 재능·취미 목록("나의 재능"·"나의 취미", 2026-08-21 사용자 설계 - 17장) - 지인
// 상세와 거의 같은 패턴이지만 실제 이름이 없어 label만 보여준다(가족 상세와
// 동일). 제거 필드가 없어(applyChoice 참고) 한 번 생기면 그 판이 끝날 때까지
// 계속 유지된다.
function renderTalentsInto(container, talents) {
  container.innerHTML = '';
  if (!talents || !talents.length) {
    const empty = document.createElement('span');
    empty.className = 'family-empty';
    empty.textContent = '아직 발견한 재능 없음';
    container.appendChild(empty);
    return;
  }
  talents.forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'family-chip';
    chip.textContent = t.label;
    chip.dataset.tooltip = '재능 — ' + t.label + sinceAgeSuffix(t.sinceStageId);
    container.appendChild(chip);
  });
}
function renderTalents(talents) {
  renderTalentsInto(talentsEl, talents);
}
function renderHobbiesInto(container, hobbies) {
  container.innerHTML = '';
  if (!hobbies || !hobbies.length) {
    const empty = document.createElement('span');
    empty.className = 'family-empty';
    empty.textContent = '아직 생긴 취미 없음';
    container.appendChild(empty);
    return;
  }
  hobbies.forEach((h) => {
    const chip = document.createElement('span');
    chip.className = 'family-chip';
    chip.textContent = h.label;
    chip.dataset.tooltip = '취미 — ' + h.label + sinceAgeSuffix(h.sinceStageId);
    container.appendChild(chip);
  });
}
function renderHobbies(hobbies) {
  renderHobbiesInto(hobbiesEl, hobbies);
}

const currentOccupationEl = document.getElementById('currentOccupation');

// 현재 직업("현재 직업 상세") - 건강/가족과 달리 동시에 하나뿐이라 목록이 아니라
// 값 하나만 보여준다. 서버가 choiceLog에서 다시 계산해 내려주는 currentOccupation
// (없으면 null)을 그대로 표시만 한다.
function renderCurrentOccupation(occupation) {
  if (occupation && occupation.label) {
    currentOccupationEl.textContent = occupation.label;
    currentOccupationEl.classList.remove('is-empty');
    currentOccupationEl.dataset.tooltip = '직업 — ' + occupation.label +
      (occupation.ageRange ? ' (' + occupation.ageRange + '부터)' : '');
  } else {
    currentOccupationEl.textContent = '아직 특별한 직업 없음';
    currentOccupationEl.classList.add('is-empty');
    currentOccupationEl.dataset.tooltip = '직업 — 아직 특별한 직업을 갖지 않았어요.';
  }
}

// 직업 이력("지금까지의 직업 이력") - 엔딩 화면에서만 보여준다. 선택 요약
// (#choiceHistoryList)과 같은 "나이 + 텍스트" 행 스타일(.choice-history-item)을
// 그대로 재사용한다.
function renderOccupationHistoryInto(container, history) {
  container.innerHTML = '';
  if (!history || !history.length) {
    container.innerHTML = '<p class="empty-msg">직업 이력이 없어요.</p>';
    return;
  }
  history.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'choice-history-item';
    row.innerHTML =
      '<span class="chi-age">' + escapeHtml(h.ageRange || '') + '</span>' +
      '<span class="chi-text">' + escapeHtml(h.label || '') + '</span>';
    container.appendChild(row);
  });
}

const currentLocationEl = document.getElementById('currentLocation');

// 현재 장소("현재 장소") - 직업과 완전히 같은 패턴이지만, 값이 항상 있다는 점만
// 다르다(초기값은 서버가 내려주는 DEFAULT_LOCATION='국내' - 2026-08-18, 사용자
// 지시 "초기는 무조건 국내로 시작"). 아직 이 값을 바꾸는 선택지는 없지만
// (추후 해외 여행·이민·노동 콘텐츠 추가 예정), 표시 로직만 미리 마련해둔다.
function renderCurrentLocation(location) {
  currentLocationEl.textContent = location && location.label ? location.label : '🇰🇷 국내';
  currentLocationEl.classList.remove('is-empty');
  currentLocationEl.dataset.tooltip = '현재 장소 — ' + (location && location.label ? location.label : '🇰🇷 국내') +
    (location && location.ageRange ? ' (' + location.ageRange + '부터)' : '');
}

// 장소 이력("지금까지 머문 장소") - 엔딩 화면에서만 보여준다. 직업 이력과
// 완전히 같은 렌더 방식.
function renderLocationHistoryInto(container, history) {
  container.innerHTML = '';
  if (!history || !history.length) {
    container.innerHTML = '<p class="empty-msg">평생 국내에서만 지냈어요.</p>';
    return;
  }
  history.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'choice-history-item';
    row.innerHTML =
      '<span class="chi-age">' + escapeHtml(h.ageRange || '') + '</span>' +
      '<span class="chi-text">' + escapeHtml(h.label || '') + '</span>';
    container.appendChild(row);
  });
}

let choiceFadeoutTimer = null;

// 알츠하이머(causesChoiceFadeout)가 있으면 방금 채워 넣은 선택지들이 뜨자마자
// 10초에 걸쳐 서서히 투명해진다(10초 후 opacity 0). 조건이 없으면 예전에
// 남아있을 수 있는 스타일을 지워서 항상 정상적으로 다시 보이게 한다.
// transition과 opacity를 같은 틱에서 같이 바꾸면 트랜지션이 늦게 시작되는
// 문제가 있어(다른 페이드에서 이미 겪음), 여기서도 먼저 리플로우로 "보임"
// 상태를 확정한 뒤에야 실제 페이드아웃을 건다.
function applyAlzheimersFadeout() {
  clearTimeout(choiceFadeoutTimer);
  const hasFadeout = currentHealthConditions.some((c) => c.causesChoiceFadeout);
  if (!hasFadeout) {
    choiceList.style.transition = '';
    choiceList.style.opacity = '';
    return;
  }
  choiceList.style.transition = 'none';
  choiceList.style.opacity = '1';
  void choiceList.offsetWidth;
  choiceList.style.transition = 'opacity ' + CHOICE_FADEOUT_MS + 'ms linear';
  choiceList.style.opacity = '0';
}

function renderStage(stage) {
  stageName.textContent = stage.name;
  stageAge.textContent = stage.ageRange;
  storyText.textContent = stage.intro || '';
  choiceList.innerHTML = '';
  resultBox.classList.add('hidden');
  nextBtn.classList.add('hidden');

  if (stage.random) {
    // 태어날 집안처럼 스스로 고를 수 없는 구간 - 가능성만 미리보기로 보여주고,
    // 실제 결정은 "주사위 굴리기" 버튼 하나로만 진행한다(서버가 무작위로 뽑음).
    stage.choices.forEach((choice) => {
      const div = document.createElement('div');
      div.className = 'choice-preview';
      div.dataset.choiceId = choice.id;
      div.textContent = '🎲 ' + choice.text;
      choiceList.appendChild(div);
    });
    const rollBtn = document.createElement('button');
    rollBtn.className = 'dice-btn primary';
    rollBtn.textContent = '🎲 주사위 굴리기';
    rollBtn.addEventListener('click', rollDice);
    choiceList.appendChild(rollBtn);
    const hint = document.createElement('p');
    hint.className = 'dice-hint';
    hint.textContent = '이건 스스로 고를 수 없어요 - 0세~3세까지만 위 셋 중 하나가 무작위로 정해집니다.';
    choiceList.appendChild(hint);
    applyAlzheimersFadeout();
    return;
  }

  stage.choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.dataset.choiceId = choice.id;
    btn.textContent = choice.text;
    btn.addEventListener('click', () => pickChoice(choice.id));
    choiceList.appendChild(btn);
  });
  applyAlzheimersFadeout();
}

startBtn.addEventListener('click', async () => {
  const streamerName = nameInput.value.trim();
  if (!streamerName) return;
  startBtn.disabled = true;
  try {
    const multiplayerEnabled = !!multiplayerToggleStart.checked;
    const res = await startPlaythroughFn({ streamerName, streamerId: selectedStreamerId, multiplayerEnabled });
    await fadeOut([searchSection, nameSection, mainHeader]);
    renderStatBars(statBars, res.data.stats);
    renderAssets(res.data.assets);
    renderCashHoldings(cashHoldingsEl, res.data.cashHoldings);
    renderHealthConditions(res.data.healthConditions);
    renderFamilyMembers(res.data.familyMembers);
    renderAcquaintances(res.data.acquaintances);
    renderCurrentOccupation(res.data.currentOccupation);
    renderCurrentLocation(res.data.currentLocation);
    renderTalents(res.data.talents);
    renderHobbies(res.data.hobbies);
    renderStage(res.data.stage);
    initAchievementBaseline(res.data);
    lastKnownRouteId = res.data.currentRoute ? res.data.currentRoute.id : null;
    enterHostMode();
    fadeIn([gameSection]);
  } catch (e) {
    console.error('인생 시작 실패:', e);
    alert('시작하지 못했어요: ' + (e.message || e));
  } finally {
    startBtn.disabled = false;
  }
});

// 결과 박스 색상 차별화 - deltas의 순합으로 이번 선택이 전체적으로 득이었는지
// 실이었는지 판정해 결과 박스 톤을 다르게 준다(2026-08-17, 사용자 지시 -
// "방송으로써 아쉬운 부분" 점검에서 나온 "결과가 좋은지 나쁜지 색으로도
// 구분이 안 됨" 항목). 완벽한 판단은 아니고(스탯 5종을 그냥 더한 값이라
// 스탯별 가중치는 없음) 어디까지나 시각적 힌트용 근사치.
function resultTone(deltas) {
  if (!deltas) return 'neutral';
  const sum = Object.values(deltas).reduce((acc, v) => acc + v, 0);
  if (sum > 0) return 'positive';
  if (sum < 0) return 'negative';
  return 'neutral';
}

// submitChoice/rollDice 응답을 공통으로 처리 - 결과 텍스트 반영, 완료 시 엔딩
// 화면으로, 아니면 "다음" 버튼을 보여준다.
// 방송 콘텐츠 백로그 5번째 항목: 사별·이혼처럼 감정적 무게가 큰 선택지는
// 다른 밝은 이벤트와 같은 속도로 넘어가면 어긋나 보여서, 화면 채도를
// 낮추고 천천히 되돌아오는 톤다운 효과를 준다(2026-08-17). 이 6개는
// game-data.js에서 removeFamilyMembers로 사망·이혼을 표현하는 선택지
// 전부(father/mother-passes-away·choosing-divorce·losing-a-parent·
// parent-passing-50s·spouse-passes-away) - id가 고정값이라 서버 응답에
// 별도 필드 없이 selectedChoiceId만으로 판단 가능.
const EMOTIONAL_TONEDOWN_IDS = ['father-passes-away', 'mother-passes-away', 'choosing-divorce', 'losing-a-parent', 'parent-passing-50s', 'spouse-passes-away'];
const TONEDOWN_HOLD_MS = 3200;
let tonedownTimer = null;
function applyTonedownIfNeeded(selectedChoiceId) {
  if (!EMOTIONAL_TONEDOWN_IDS.includes(selectedChoiceId)) return;
  gameSection.classList.add('tonedown');
  clearTimeout(tonedownTimer);
  tonedownTimer = setTimeout(() => gameSection.classList.remove('tonedown'), TONEDOWN_HOLD_MS);
}

// ------------------------------------------------------------
// 방송 콘텐츠 백로그 6번째 항목: 재산 획득·승진/전직·새 가족·건강 회복
// 이벤트를 작은 배지 팝업 + 짧은 사운드로 알린다(2026-08-17). 서버는
// "지금 상태"만 내려주고 "이번에 뭐가 바뀌었는지"는 안 알려주므로,
// 직전 상태를 클라이언트가 따로 기억해뒀다가 diff로 판단한다.
// ------------------------------------------------------------
const achievementPopupsEl = document.getElementById('achievementPopups');
let prevAssetIds = [];
let prevFamilyIds = [];
let prevAcquaintanceIds = [];
let prevOccupationId = null;
let prevLocationId = null;
let prevConditions = [];
let prevTalentIds = [];
let prevHobbyIds = [];

function playAchievementPop() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  playTone(ctx, 880, ctx.currentTime, 0.28, 0.1);
}
function showAchievementBadge(icon, text) {
  const badge = document.createElement('span');
  badge.className = 'achievement-badge';
  badge.innerHTML = '<span class="achievement-icon">' + icon + '</span><span>' + text + '</span>';
  achievementPopupsEl.appendChild(badge);
  setTimeout(() => badge.remove(), 2300);
}

// 재시작·이어하기 시점의 "이미 갖고 있던" 상태를 기준점으로 잡아둔다 -
// 안 그러면 이어하기 직후 첫 선택에서 원래 있던 자산·가족까지 "새로
// 얻었다"고 오판할 수 있다.
function initAchievementBaseline(data) {
  prevAssetIds = (data.assets || []).map((a) => a.id);
  prevFamilyIds = (data.familyMembers || []).map((f) => f.id);
  prevAcquaintanceIds = (data.acquaintances || []).map((a) => a.id);
  prevOccupationId = data.currentOccupation ? data.currentOccupation.id : null;
  prevLocationId = data.currentLocation ? data.currentLocation.id : 'domestic';
  prevConditions = data.healthConditions || [];
  prevTalentIds = (data.talents || []).map((t) => t.id);
  prevHobbyIds = (data.hobbies || []).map((h) => h.id);
}

function celebrateAchievements(data) {
  const newAssetIds = (data.assets || []).map((a) => a.id);
  const addedAsset = (data.assets || []).find((a) => !prevAssetIds.includes(a.id));
  if (addedAsset) { showAchievementBadge('💰', addedAsset.label + ' 획득'); playAchievementPop(); }

  const newFamilyIds = (data.familyMembers || []).map((f) => f.id);
  const addedFamily = (data.familyMembers || []).find((f) => !prevFamilyIds.includes(f.id));
  if (addedFamily) { showAchievementBadge('👨‍👩‍👧', addedFamily.label + ' 생김'); playAchievementPop(); }

  const newAcquaintanceIds = (data.acquaintances || []).map((a) => a.id);
  const addedAcquaintance = (data.acquaintances || []).find((a) => !prevAcquaintanceIds.includes(a.id));
  if (addedAcquaintance) { showAchievementBadge('🤝', addedAcquaintance.label + ' ' + addedAcquaintance.name); playAchievementPop(); }

  const newOccId = data.currentOccupation ? data.currentOccupation.id : null;
  if (newOccId && newOccId !== prevOccupationId) { showAchievementBadge('💼', data.currentOccupation.label); playAchievementPop(); }

  const newLocId = data.currentLocation ? data.currentLocation.id : 'domestic';
  if (newLocId !== prevLocationId) { showAchievementBadge('✈️', data.currentLocation.label); playAchievementPop(); }

  const newConditions = data.healthConditions || [];
  const newConditionIds = newConditions.map((c) => c.id);
  const healed = prevConditions.find((c) => !newConditionIds.includes(c.id));
  if (healed) { showAchievementBadge('💊', healed.label + ' 회복'); playAchievementPop(); }

  const newTalentIds = (data.talents || []).map((t) => t.id);
  const addedTalent = (data.talents || []).find((t) => !prevTalentIds.includes(t.id));
  if (addedTalent) { showAchievementBadge('✨', addedTalent.label + ' 발견'); playAchievementPop(); }

  const newHobbyIds = (data.hobbies || []).map((h) => h.id);
  const addedHobby = (data.hobbies || []).find((h) => !prevHobbyIds.includes(h.id));
  if (addedHobby) { showAchievementBadge('🎨', addedHobby.label + ' 생김'); playAchievementPop(); }

  prevAssetIds = newAssetIds;
  prevFamilyIds = newFamilyIds;
  prevAcquaintanceIds = newAcquaintanceIds;
  prevOccupationId = newOccId;
  prevLocationId = newLocId;
  prevConditions = newConditions;
  prevTalentIds = newTalentIds;
  prevHobbyIds = newHobbyIds;
}

function applyOutcome(data, resultPrefix, selectedChoiceId) {
  updateRouteSceneImage(data.currentRoute);
  let resultText = (resultPrefix ? resultPrefix + '\n' : '') + data.result;
  // blocksHealthRecovery 조건(희귀 난치병뿐 아니라 사고 후유증 등 더 있을 수
  // 있음)을 갖고 있어서 이번 선택의 건강 회복 효과가 막혔을 때만 덧붙인다 -
  // 안 그러면 "골랐는데 건강 바가 그대로"인 게 버그처럼 보일 수 있어서.
  // 실제로 막은 조건이 무엇인지 healthConditions에서 찾아 그 라벨을 그대로
  // 써야 한다 - "난치병"으로 고정해두면 사고 후유증만 있는 플레이어에게도
  // "난치병 때문에"라고 잘못 표시되는 문제가 있었다.
  if (data.healthRecoverySuppressed) {
    const blockers = (data.healthConditions || []).filter((c) => c.blocksHealthRecovery);
    const blockerLabel = blockers.length ? blockers.map((c) => c.label).join(' · ') : '🎗️';
    resultText += '\n' + blockerLabel + ' 때문에 건강이 회복되지는 않았다.';
  }
  // 보험 가입 중 회복 가능한 질병·부상을 완전히 회피했을 때(2026-08-22, 18장 -
  // functions/index.js의 insuranceAvoidsCondition) - wealth 손실이 취소되고
  // addCondition이 아예 안 걸렸다는 걸 결과 문구에 덧붙여, "다쳤다는데 왜 재산
  // 상세에 아무 조건도 안 생기지"라는 혼란을 막는다.
  if (data.insuranceAvoidsCondition) {
    resultText += '\n🛡️ 보험 덕분에 진단은 피하고 병원비도 들지 않았다.';
  }
  // 보험료 3년 연체로 계약이 자동 해지됐을 때(2026-08-22, 18장 -
  // functions/index.js의 insuranceLapsed) - assets에서 조용히 사라지면
  // "왜 재산 상세에서 보험이 없어졌지"라는 혼란을 줄 수 있어 결과 문구로 알려준다.
  if (data.insuranceLapsed) {
    resultText += '\n⚠️ 보험료를 3년 연속 내지 못해 계약이 해지되었다.';
  }
  resultBox.textContent = resultText;
  resultBox.classList.remove('hidden');
  resultBox.classList.remove('tone-positive', 'tone-negative');
  const tone = resultTone(data.deltas);
  if (tone === 'positive') resultBox.classList.add('tone-positive');
  else if (tone === 'negative') resultBox.classList.add('tone-negative');
  renderStatBars(statBars, data.stats);
  flashStatChanges(statBars, data.deltas);
  celebrateIfJackpot(data.prizeLabel);
  applyTonedownIfNeeded(selectedChoiceId);
  celebrateAchievements(data);
  renderAssets(data.assets);
  renderCashHoldings(cashHoldingsEl, data.cashHoldings);
  renderHealthConditions(data.healthConditions);
  renderFamilyMembers(data.familyMembers);
  renderAcquaintances(data.acquaintances);
  renderCurrentOccupation(data.currentOccupation);
  renderCurrentLocation(data.currentLocation);
  renderTalents(data.talents);
  renderHobbies(data.hobbies);
  if (selectedChoiceId) markSelectedChoice(selectedChoiceId);
  // 선택 결과는 서버(applyChoice)가 이미 lifeGame/playthroughs/{uid}에 저장을
  // 마친 뒤 응답한 것이므로, 여기서 뜨는 토스트는 실제 저장 완료를 알리는
  // 정확한 신호다(낙관적 표시가 아님).
  showToast('💾 자동저장 되었습니다');
  if (data.completed) {
    pendingNextStage = null;
    showEnding(data.ending, data.stats, data.choiceHistory, data.familyMembers, data.occupationHistory, data.assets, data.cashHoldings, data.acquaintances, data.healthConditions, data.locationHistory, data.talents, data.hobbies);
  } else {
    pendingNextStage = data.nextStage;
    nextBtn.classList.remove('hidden');
  }
}

function disableChoiceList() {
  Array.from(choiceList.children).forEach((el) => {
    if (el.tagName === 'BUTTON') el.disabled = true;
  });
}

// 선택이 확정되면 고른 것만 원래 불투명도로 남기고, 나머지 선택지는
// 30%로 흐리게 해서 어떤 선택지가 결과를 만들었는지 한눈에 보이게 한다.
function markSelectedChoice(selectedId) {
  Array.from(choiceList.children).forEach((el) => {
    if (!el.dataset || !el.dataset.choiceId) return;
    el.style.opacity = el.dataset.choiceId === selectedId ? '1' : '0.3';
  });
}

async function pickChoice(choiceId) {
  disableChoiceList();
  try {
    const res = await submitChoiceFn({ choiceId });
    applyOutcome(res.data, undefined, choiceId);
  } catch (e) {
    console.error('선택 제출 실패:', e);
    // requiresSufficientCash(2026-08-23, 사용자 지시 - "돈이 많이 필요한 재산은
    // 충분한 현금이 있을때 선택 가능하게, 현금이 부족하면 토스트메시지가 뜨게")
    // 서버가 details.reason:'insufficient-cash'로 표시해준 경우만 토스트로,
    // 나머지 오류는 기존처럼 alert로 구분한다.
    if (e.details && e.details.reason === 'insufficient-cash') {
      showToast('💰 보유 현금이 부족해서 고를 수 없어요');
    } else {
      alert('선택을 처리하지 못했어요: ' + (e.message || e));
    }
    Array.from(choiceList.children).forEach((b) => { if (b.tagName === 'BUTTON') b.disabled = false; });
  }
}

async function rollDice() {
  disableChoiceList();
  diceOverlay.classList.remove('hidden');
  try {
    // 서버 응답이 3초보다 빨리 와도 화면이 어두워지고 주사위가 도는 연출을
    // 최소 3초는 보여준 뒤에 결과를 공개한다 - 반대로 응답이 늦어지면 그만큼
    // 더 기다렸다가 공개(즉, 3초는 최소 보장 시간이지 고정 시간이 아님).
    const [res] = await Promise.all([
      rollDiceFn(),
      new Promise((resolve) => setTimeout(resolve, DICE_REVEAL_MS))
    ]);
    diceOverlay.classList.add('hidden');
    applyOutcome(res.data, '🎲 ' + res.data.choiceText, res.data.choiceId);
  } catch (e) {
    diceOverlay.classList.add('hidden');
    console.error('주사위 굴리기 실패:', e);
    alert('주사위를 굴리지 못했어요: ' + (e.message || e));
    Array.from(choiceList.children).forEach((b) => { if (b.tagName === 'BUTTON') b.disabled = false; });
  }
}

// 구간 이동(0세→1세 등)은 화면 전체가 아니라 stageContent(구간명/스토리/
// 선택지/결과 텍스트)만 페이드아웃→내용 교체→페이드인 한다 - 이미 갱신된
// 스탯 바/건강 상세는 이 시점엔 변화가 없으니 같이 깜빡일 필요가 없다.
function fadeToStage(stage) {
  // fadeOut()과 같은 이유로, transition 재설정과 opacity 값 변경 사이에
  // 리플로우를 강제로 끼워 넣어야 페이드아웃이 매번 확실히 끝까지 재생된다.
  stageContent.style.transition = 'none';
  stageContent.style.opacity = '1';
  void stageContent.offsetWidth;
  stageContent.style.transition = 'opacity ' + FADE_MS + 'ms ease';
  stageContent.style.opacity = '0';
  // 콘텐츠 교체(swap) 타이밍은 CSS 트랜지션 재생 시간(FADE_MS)에 살짝 여유를
  // 더 둬서(SWAP_BUFFER_MS), 스케줄링 지연으로 트랜지션이 아직 다 안 끝난
  // 상태에서 다음 구간 내용이 바뀌어 보이는 일이 없게 한다.
  setTimeout(() => {
    renderStage(stage);
    void stageContent.offsetWidth;
    stageContent.style.opacity = '1';
  }, FADE_MS + SWAP_BUFFER_MS);
}

nextBtn.addEventListener('click', () => {
  if (pendingNextStage) fadeToStage(pendingNextStage);
  // 모바일에서는 결과 문구를 읽느라 화면 아래쪽까지 스크롤해 내려간 채로
  // "다음"을 누르는 경우가 많다 - 다음 구간 제목/상황 문구가 화면 위쪽에서
  // 시작되도록 맨 위로 스크롤을 되돌린다.
  window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
  // 멀티플레이(2026-08-24, 사용자 지시 - "호스트가 다음 버튼을 눌르면
  // 참가자도 다음 이벤트를 같이 보는거야?" → "고쳐줘") - 공개 미러는
  // 선택 제출 시점이 아니라 호스트가 실제로 "다음"을 눌러 넘어가는 이
  // 순간에만 갱신된다(functions/index.js의 advanceMultiplayerSession).
  // 실패해도 다음 턴에 다시 시도되므로(매번 호출) 조용히 무시한다.
  if (mpHostLatestSession) {
    advanceMultiplayerSessionFn().catch((e) => console.error('멀티플레이 미러 갱신 실패:', e));
  }
});

// ------------------------------------------------------------
// 4) 엔딩 + 갤러리 공유
// ------------------------------------------------------------
const endingSection = document.getElementById('endingSection');
const endingTitle = document.getElementById('endingTitle');
const endingSceneImage = document.getElementById('endingSceneImage');
// 엔딩 삽화(11장, 2026-08-24 착수) - 아직 16종 중 일부만 그려져 있다.
// assets/scenes/에 없는 엔딩은 그냥 <img>를 숨긴다(깨진 이미지 아이콘 방지).
// 새 삽화를 추가할 땐 이 맵에 한 줄만 더하면 된다.
const ENDING_SCENE_IMAGES = {
  'all-in-success': 'assets/scenes/all-in-success.jpg',
  'all-in-failure': 'assets/scenes/all-in-failure.jpg',
  'burnout': 'assets/scenes/burnout.jpg',
  'stable': 'assets/scenes/stable.jpg',
  'relationship-first': 'assets/scenes/relationship-first.jpg',
  'recluse': 'assets/scenes/recluse.jpg',
  'full-family-legacy': 'assets/scenes/full-family-legacy.jpg',
  'living-with-illness': 'assets/scenes/living-with-illness.jpg',
  'rising-after-the-fall': 'assets/scenes/rising-after-the-fall.jpg',
  'solitary-path': 'assets/scenes/solitary-path.jpg',
  'enduring-companion': 'assets/scenes/enduring-companion.jpg',
  'collapse': 'assets/scenes/collapse.jpg',
  'bankruptcy': 'assets/scenes/bankruptcy.jpg',
  'obscurity': 'assets/scenes/obscurity.jpg',
  'despair': 'assets/scenes/despair.jpg',
  'isolation': 'assets/scenes/isolation.jpg'
};

// 루트 진입 삽화(11장 2순위, 2026-08-24 착수) - 새 루트에 막 들어선 그
// 턴에만(이전 턴엔 없던 루트가 이번 턴부터 생김) 결과 박스 위에 한 번
// 보여준다. lastKnownRouteId는 시작/이어하기 응답으로 한 번 초기화해두고
// (이미 진행 중이던 루트를 "방금 진입"으로 오인해 다시 보여주지 않기 위해)
// applyOutcome이 매번 갱신한다.
const routeSceneImage = document.getElementById('routeSceneImage');
const ROUTE_SCENE_IMAGES = {
  'entertainment-industry': 'assets/scenes/entertainment-industry.jpg'
};
let lastKnownRouteId = null;
function updateRouteSceneImage(currentRoute) {
  const newRouteId = currentRoute ? currentRoute.id : null;
  if (newRouteId && newRouteId !== lastKnownRouteId && ROUTE_SCENE_IMAGES[newRouteId]) {
    routeSceneImage.src = ROUTE_SCENE_IMAGES[newRouteId];
    routeSceneImage.alt = currentRoute.label || '';
    routeSceneImage.classList.remove('hidden');
  } else {
    routeSceneImage.removeAttribute('src');
    routeSceneImage.classList.add('hidden');
  }
  lastKnownRouteId = newRouteId;
}
const endingText = document.getElementById('endingText');
const endingStatBars = document.getElementById('endingStatBars');
const endingFamilyMembersEl = document.getElementById('endingFamilyMembers');
const endingFamilyPanelTitle = document.getElementById('endingFamilyPanelTitle');
const endingAcquaintancesEl = document.getElementById('endingAcquaintances');
const occupationHistoryListEl = document.getElementById('occupationHistoryList');
const locationHistoryListEl = document.getElementById('locationHistoryList');
const endingTalentsEl = document.getElementById('endingTalents');
const endingHobbiesEl = document.getElementById('endingHobbies');
const choiceHistorySection = document.getElementById('choiceHistorySection');
const choiceHistoryList = document.getElementById('choiceHistoryList');
const gallerySection = document.getElementById('gallerySection');
const restartSection = document.getElementById('restartSection');
const shareBtn = document.getElementById('shareBtn');
const restartBtn = document.getElementById('restartBtn');

// 지금까지 선택한 선택지 목록 - 서버(choiceLog를 STAGES와 대조해 풀어낸 값)가
// 그대로 내려주는 stageName/ageRange/choiceText를 순서대로 나열만 한다. 내 엔딩
// 화면과 갤러리의 "다른 유저 선택 기록"이 같은 형식을 쓰므로 컨테이너만 받는다.
function renderChoiceHistoryInto(container, history) {
  container.innerHTML = '';
  if (!history || !history.length) {
    container.innerHTML = '<p class="empty-msg">기록된 선택이 없어요.</p>';
    return;
  }
  history.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'choice-history-item';
    row.innerHTML =
      '<span class="chi-age">' + escapeHtml(h.ageRange || '') + '</span>' +
      '<span class="chi-text">' + escapeHtml(h.choiceText || '') + '</span>';
    container.appendChild(row);
  });
}

// 엔딩 문구 표시 → 지금까지 선택한 선택지들 표시 → 다른 유저 인생 → 재시작
// 안내 순서로 보여준다(각 section의 DOM 순서가 곧 화면에 보이는 순서). 게임
// 화면에서 엔딩 화면으로 넘어가는 것도 다른 전환들과 같은 페이드로 통일한다.
async function showEnding(ending, stats, choiceHistory, familyMembers, occupationHistory, assets, cashHoldings, acquaintances, healthConditions, locationHistory, talents, hobbies) {
  if (INSTANT_ENDING_IDS.includes(ending.id)) {
    triggerCrisisEffect();
    await new Promise((resolve) => setTimeout(resolve, REDUCE_MOTION ? 200 : 650));
  }
  await fadeOut([mainHeader, gameSection]);

  endingTitle.textContent = ending.title;
  const sceneImageSrc = ENDING_SCENE_IMAGES[ending.id];
  if (sceneImageSrc) {
    endingSceneImage.src = sceneImageSrc;
    endingSceneImage.alt = ending.title;
    endingSceneImage.classList.remove('hidden');
  } else {
    endingSceneImage.removeAttribute('src');
    endingSceneImage.classList.add('hidden');
  }
  endingText.textContent = ending.text;
  renderStatBars(endingStatBars, stats);
  renderAssetsInto(endingAssetsEl, assets);
  renderCashHoldings(endingCashHoldingsEl, cashHoldings);
  renderHealthConditionsInto(endingHealthConditionsEl, healthConditions);
  // collapse/bankruptcy 등 즉시 종료 엔딩은 100세가 아니라 그 전 나이에
  // 끝나므로, "곁에 남은 가족" 패널 제목도 실제로 삶이 끝난 나이를 보여줘야
  // 한다 - choiceHistory의 마지막 항목이 곧 마지막으로 선택을 고른 구간
  // (=삶이 끝난 시점)이라 거기서 ageRange를 가져온다.
  const endedAtAgeRange = (choiceHistory && choiceHistory.length) ? choiceHistory[choiceHistory.length - 1].ageRange : '100세';
  endingFamilyPanelTitle.textContent = endedAtAgeRange + ', 곁에 남은 가족';
  renderFamilyMembersInto(endingFamilyMembersEl, familyMembers);
  renderAcquaintancesInto(endingAcquaintancesEl, acquaintances);
  renderOccupationHistoryInto(occupationHistoryListEl, occupationHistory);
  renderLocationHistoryInto(locationHistoryListEl, locationHistory);
  renderTalentsInto(endingTalentsEl, talents);
  renderHobbiesInto(endingHobbiesEl, hobbies);
  renderChoiceHistoryInto(choiceHistoryList, choiceHistory);
  shareBtn.disabled = false;

  fadeIn([endingSection, choiceHistorySection, gallerySection, restartSection]);
  // fadeIn이 hidden 클래스를 떼고 강제 리플로우까지 끝낸 뒤라, 이 시점엔
  // scoreChartEl.clientWidth가 이미 실제 레이아웃 폭을 갖고 있다(숨겨진 채로
  // 그리면 폭 0으로 그려져 버림).
  renderScoreChart(scoreChartEl, scoreChartSummaryEl, choiceHistory);
}

shareBtn.addEventListener('click', async () => {
  shareBtn.disabled = true;
  try {
    await shareToGalleryFn();
    shareBtn.textContent = '공유됐어요!';
  } catch (e) {
    console.error('공유 실패:', e);
    alert('공유하지 못했어요: ' + (e.message || e));
    shareBtn.disabled = false;
  }
});

restartBtn.addEventListener('click', () => window.location.reload());

// ------------------------------------------------------------
// 5) 공개 갤러리 - "다른 유저는 어떤 인생을 살았을까?"
// ------------------------------------------------------------
const galleryList = document.getElementById('galleryList');

// 갤러리 항목을 클릭(펼치기)하면 그때 그 항목의 선택 기록만 따로 불러온다 -
// lifeGame/galleryChoiceLogs/{entryId}는 gallery 목록 실시간 구독과는 별개
// 노드라, 펼치기 전까진 안 읽는다. 같은 항목을 다시 펼 때 또 읽지 않도록
// 항목별로 한 번 불러온 결과는 캐시해둔다.
const choiceLogCache = new Map();
// chartCanvas/chartSummaryEl은 선택사항 - #choiceHistorySection과 같은
// buildChoiceHistory() 결과를 쓰는 곳이면 어디든 재사용하려고 만든 렌더러라
// (엔딩 화면의 renderScoreChart 참고) 이미 stats가 함께 내려온다. 2026-08-18
// 사용자 지시("다른 인생을 펼쳐봤을때도 선그래프 확인 가능하게")로 갤러리
// 항목을 펼칠 때도 같은 함수로 그린다 - details가 열려야(펼쳐져야) canvas가
// 실제 레이아웃 폭을 가지므로, toggle 이벤트로 열린 뒤에만 호출한다.
async function loadGalleryChoiceLog(entryId, container, chartCanvas, chartSummaryEl) {
  if (choiceLogCache.has(entryId)) {
    const history = choiceLogCache.get(entryId);
    renderChoiceHistoryInto(container, history);
    renderScoreChart(chartCanvas, chartSummaryEl, history);
    return;
  }
  container.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  try {
    const snap = await get(ref(db, 'lifeGame/galleryChoiceLogs/' + entryId));
    const history = snap.val() || [];
    choiceLogCache.set(entryId, history);
    renderChoiceHistoryInto(container, history);
    renderScoreChart(chartCanvas, chartSummaryEl, history);
  } catch (err) {
    console.error('선택 기록 조회 실패:', err);
    container.innerHTML = '<p class="empty-msg">선택 기록을 불러오지 못했어요.</p>';
  }
}

// 갤러리 상세 패널(건강·가족·지인·재산·직업·장소, 2026-08-18 사용자 지시) -
// loadGalleryChoiceLog와 완전히 같은 lazy-load + 캐시 패턴. 옛날에 공유된
// 항목(galleryDetails가 생기기 전)은 스냅샷이 없을 수 있어 빈 배열/기본값으로
// 대체해 기존 renderXxxInto 함수들이 "특별한 OO 없음" 플레이스홀더를 그대로
// 보여주게 한다 - 에러로 처리하지 않는다.
const galleryDetailsCache = new Map();
function renderGalleryDetails(details, els) {
  renderAssetsInto(els.assetsListEl, details.assets || []);
  renderHealthConditionsInto(els.healthListEl, details.healthConditions || []);
  renderFamilyMembersInto(els.familyListEl, details.familyMembers || []);
  renderAcquaintancesInto(els.acquaintanceListEl, details.acquaintances || []);
  renderOccupationHistoryInto(els.occupationListEl, details.occupationHistory || []);
  renderLocationHistoryInto(els.locationListEl, details.locationHistory || []);
  renderTalentsInto(els.talentListEl, details.talents || []);
  renderHobbiesInto(els.hobbyListEl, details.hobbies || []);
}
async function loadGalleryDetails(entryId, els) {
  if (galleryDetailsCache.has(entryId)) {
    renderGalleryDetails(galleryDetailsCache.get(entryId), els);
    return;
  }
  try {
    const snap = await get(ref(db, 'lifeGame/galleryDetails/' + entryId));
    const details = snap.val() || {};
    galleryDetailsCache.set(entryId, details);
    renderGalleryDetails(details, els);
  } catch (err) {
    console.error('상세 정보 조회 실패:', err);
    renderGalleryDetails({}, els);
  }
}

function renderGalleryList(val) {
  const entries = Object.keys(val)
    .map((id) => Object.assign({ id }, val[id]))
    .sort((a, b) => (b.sharedAt || 0) - (a.sharedAt || 0))
    .slice(0, 30);
  if (!entries.length) {
    galleryList.innerHTML = '<p class="empty-msg">아직 공유된 인생이 없어요. 첫 번째가 되어보세요!</p>';
    return;
  }
  galleryList.innerHTML = '';
  entries.forEach((e) => {
    const details = document.createElement('details');
    details.className = 'gallery-entry';

    const summary = document.createElement('summary');
    summary.className = 'gallery-item';
    summary.innerHTML =
      '<span class="g-left"><span class="g-caret">▸</span><span class="g-name">' + escapeHtml(e.streamerName || '이름 없음') + '</span></span>' +
      '<span class="g-ending">' + escapeHtml((e.ending && e.ending.title) || '') + '</span>';
    details.appendChild(summary);

    // 관리자 전용 삭제 버튼(2026-08-24, 사용자 지시) - <summary> 안에 넣으면
    // 클릭이 details 토글과 겹치므로 바깥에 별도로 붙이고 stopPropagation으로
    // 분리한다.
    if (isAdminUser) {
      const adminDeleteBtn = document.createElement('button');
      adminDeleteBtn.type = 'button';
      adminDeleteBtn.className = 'gallery-admin-delete-btn';
      adminDeleteBtn.textContent = '🗑 관리자 삭제';
      adminDeleteBtn.addEventListener('click', async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        if (!confirm('"' + (e.streamerName || '이름 없음') + '"의 갤러리 항목을 삭제할까요? 되돌릴 수 없습니다.')) return;
        adminDeleteBtn.disabled = true;
        try {
          await adminDeleteGalleryEntryFn({ entryId: e.id });
        } catch (err) {
          console.error('갤러리 항목 삭제 실패:', err);
          alert('삭제에 실패했어요: ' + (err.message || err));
          adminDeleteBtn.disabled = false;
        }
      });
      details.appendChild(adminDeleteBtn);
    }

    // 다섯 스탯 최종값(2026-08-18, 사용자 지시 - "갤러리에 공유된 다른 유저
    // 인생을 볼때도 스탯과 상세 기능이 기록되게 해줘") - stats는 이미
    // lifeGame/gallery 목록 구독에 포함돼 있던 값이라(리더보드용으로 먼저
    // 저장돼 있었음) 따로 불러올 필요 없이 바로 그린다. 아래 건강·가족·지인·
    // 재산·직업·장소 상세와 달리 펼치기 전에도 이미 갖고 있는 데이터라 lazy
    // load 대상이 아니다.
    const statBarsWrap = document.createElement('div');
    statBarsWrap.className = 'stat-bars gallery-detail-panel';
    details.appendChild(statBarsWrap);
    renderStatBars(statBarsWrap, e.stats || {});

    const chartWrap = document.createElement('div');
    chartWrap.className = 'asset-panel gallery-score-chart-wrap';
    const chartTitle = document.createElement('p');
    chartTitle.className = 'asset-panel-title';
    chartTitle.textContent = '인생 종합 점수 추이';
    const chartSummary = document.createElement('p');
    chartSummary.className = 'score-chart-summary';
    const chartCanvas = document.createElement('canvas');
    chartCanvas.className = 'score-chart';
    chartWrap.appendChild(chartTitle);
    chartWrap.appendChild(chartSummary);
    chartWrap.appendChild(chartCanvas);
    details.appendChild(chartWrap);

    // 상세 패널들(건강·가족·지인·재산·직업·장소) - galleryChoiceLogs와 같은
    // 이유로 펼칠 때만 lifeGame/galleryDetails/{entryId}에서 따로 읽는다
    // (loadGalleryDetails 참고). 엔딩 화면과 똑같은 클래스를 재사용해 별도
    // CSS가 필요 없다.
    const assetWrap = document.createElement('div');
    assetWrap.className = 'asset-panel gallery-detail-panel';
    const assetTitle = document.createElement('p');
    assetTitle.className = 'asset-panel-title';
    assetTitle.textContent = '남긴 재산';
    const cashEl = document.createElement('p');
    cashEl.className = 'cash-holdings';
    renderCashHoldings(cashEl, e.cashHoldings || 0);
    const assetsListEl = document.createElement('div');
    assetsListEl.className = 'assets-list';
    assetWrap.appendChild(assetTitle);
    assetWrap.appendChild(cashEl);
    assetWrap.appendChild(assetsListEl);
    details.appendChild(assetWrap);

    const healthWrap = document.createElement('div');
    healthWrap.className = 'health-panel gallery-detail-panel';
    const healthTitle = document.createElement('p');
    healthTitle.className = 'health-panel-title';
    healthTitle.textContent = '마지막 건강 상태';
    const healthListEl = document.createElement('div');
    healthListEl.className = 'health-conditions';
    healthWrap.appendChild(healthTitle);
    healthWrap.appendChild(healthListEl);
    details.appendChild(healthWrap);

    const familyWrap = document.createElement('div');
    familyWrap.className = 'family-panel gallery-detail-panel';
    const familyTitle = document.createElement('p');
    familyTitle.className = 'family-panel-title';
    familyTitle.textContent = (e.endedAtAge || 100) + '세, 곁에 남은 가족';
    const familyListEl = document.createElement('div');
    familyListEl.className = 'family-members';
    familyWrap.appendChild(familyTitle);
    familyWrap.appendChild(familyListEl);
    details.appendChild(familyWrap);

    const acquaintanceWrap = document.createElement('div');
    acquaintanceWrap.className = 'family-panel gallery-detail-panel';
    const acquaintanceTitle = document.createElement('p');
    acquaintanceTitle.className = 'family-panel-title';
    acquaintanceTitle.textContent = '인생에서 만난 지인';
    const acquaintanceListEl = document.createElement('div');
    acquaintanceListEl.className = 'family-members';
    acquaintanceWrap.appendChild(acquaintanceTitle);
    acquaintanceWrap.appendChild(acquaintanceListEl);
    details.appendChild(acquaintanceWrap);

    const occupationWrap = document.createElement('div');
    occupationWrap.className = 'occupation-panel gallery-detail-panel';
    const occupationTitle = document.createElement('p');
    occupationTitle.className = 'occupation-panel-title';
    occupationTitle.textContent = '지금까지의 직업 이력';
    const occupationListEl = document.createElement('div');
    occupationListEl.className = 'choice-history-list';
    occupationWrap.appendChild(occupationTitle);
    occupationWrap.appendChild(occupationListEl);
    details.appendChild(occupationWrap);

    const locationWrap = document.createElement('div');
    locationWrap.className = 'occupation-panel gallery-detail-panel';
    const locationTitle = document.createElement('p');
    locationTitle.className = 'occupation-panel-title';
    locationTitle.textContent = '지금까지 머문 장소';
    const locationListEl = document.createElement('div');
    locationListEl.className = 'choice-history-list';
    locationWrap.appendChild(locationTitle);
    locationWrap.appendChild(locationListEl);
    details.appendChild(locationWrap);

    const talentWrap = document.createElement('div');
    talentWrap.className = 'family-panel gallery-detail-panel';
    const talentTitle = document.createElement('p');
    talentTitle.className = 'family-panel-title';
    talentTitle.textContent = '재능';
    const talentListEl = document.createElement('div');
    talentListEl.className = 'family-members';
    talentWrap.appendChild(talentTitle);
    talentWrap.appendChild(talentListEl);
    details.appendChild(talentWrap);

    const hobbyWrap = document.createElement('div');
    hobbyWrap.className = 'family-panel gallery-detail-panel';
    const hobbyTitle = document.createElement('p');
    hobbyTitle.className = 'family-panel-title';
    hobbyTitle.textContent = '취미';
    const hobbyListEl = document.createElement('div');
    hobbyListEl.className = 'family-members';
    hobbyWrap.appendChild(hobbyTitle);
    hobbyWrap.appendChild(hobbyListEl);
    details.appendChild(hobbyWrap);

    const logEl = document.createElement('div');
    logEl.className = 'choice-history-list gallery-choice-log';
    details.appendChild(logEl);

    details.addEventListener('toggle', () => {
      if (details.open) {
        loadGalleryChoiceLog(e.id, logEl, chartCanvas, chartSummary);
        loadGalleryDetails(e.id, { assetsListEl, healthListEl, familyListEl, acquaintanceListEl, occupationListEl, locationListEl, talentListEl, hobbyListEl });
      }
    });

    galleryList.appendChild(details);
  });
}

onValue(ref(db, 'lifeGame/gallery'), (snap) => {
  const val = snap.val() || {};
  latestGallerySnapVal = val;
  renderGalleryList(val);
}, (err) => {
  console.error('갤러리 읽기 실패:', err);
  galleryList.innerHTML = '<p class="empty-msg">갤러리를 불러올 수 없습니다.</p>';
});

// ------------------------------------------------------------
// 방송 콘텐츠 백로그 7번째 항목: 리더보드("역대 최고 기록", 2026-08-17).
// 위 갤러리 구독은 최근 30건만 유지하므로(entries.slice(0, 30)) 그걸로는
// "역대" 기록을 정확히 매길 수 없다 - 별도로 lifeGame/gallery 전체를 한 번
// get()으로 읽어와 직접 계산한다(이미 전체가 공개 읽기 노드라 새 보안 규칙
// 불필요). 두 카테고리만 우선 구현: 💰 역대 최고 부자 엔딩(cashHoldings
// 최댓값), 💀 최연소 사망(즉시 사망 엔딩 5종 중 endedAtAge 최솟값 - 100세
// 완주는 "사망"이 아니라 집계에서 제외).
// ------------------------------------------------------------
const leaderboardEl = document.getElementById('leaderboard');
function renderLeaderboardRow(icon, label, name, valueText) {
  const row = document.createElement('div');
  row.className = 'leaderboard-row';
  row.innerHTML =
    '<span class="lb-icon">' + icon + '</span>' +
    '<span class="lb-label">' + label + '</span>' +
    '<span class="lb-name">' + escapeHtml(name) + '</span>' +
    '<span class="lb-value">' + escapeHtml(valueText) + '</span>';
  return row;
}
async function loadLeaderboard() {
  try {
    const snap = await get(ref(db, 'lifeGame/gallery'));
    const val = snap.val() || {};
    const entries = Object.values(val);
    if (!entries.length) return;

    leaderboardEl.innerHTML = '';

    const richest = entries.reduce((best, e) => ((e.cashHoldings || 0) > ((best && best.cashHoldings) || -1) ? e : best), null);
    if (richest && richest.cashHoldings > 0) {
      leaderboardEl.appendChild(renderLeaderboardRow('💰', '최고 부자', richest.streamerName || '이름 없음', formatCashHoldings(richest.cashHoldings)));
    }

    const deaths = entries.filter((e) => e.ending && INSTANT_ENDING_IDS.includes(e.ending.id) && typeof e.endedAtAge === 'number');
    const youngestDeath = deaths.reduce((best, e) => (e.endedAtAge < ((best && best.endedAtAge) ?? 101) ? e : best), null);
    if (youngestDeath) {
      leaderboardEl.appendChild(renderLeaderboardRow('💀', '최연소 사망', youngestDeath.streamerName || '이름 없음', youngestDeath.endedAtAge + '세 · ' + (youngestDeath.ending.title || '')));
    }
  } catch (err) {
    console.error('리더보드 읽기 실패:', err);
  }
}
loadLeaderboard();

// ------------------------------------------------------------
// devbar 자동 스크롤 (넘칠 때만) - 다른 페이지들과 동일 로직
// ------------------------------------------------------------
(function setupDevbarMarquee() {
  const viewport = document.getElementById('devbarViewport');
  const track = document.getElementById('devbarTrack');
  if (!viewport || !track) return;
  function rebuild() {
    track.querySelectorAll('[data-clone]').forEach((el) => el.remove());
    track.classList.remove('auto-scroll');
    track.style.removeProperty('--devbar-duration');
    if (track.scrollWidth <= viewport.clientWidth) return;
    const originalWidth = track.scrollWidth;
    Array.prototype.slice.call(track.children).forEach((child) => {
      const clone = child.cloneNode(true);
      clone.setAttribute('data-clone', 'true');
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      track.appendChild(clone);
    });
    const duration = Math.max(8, originalWidth / 40);
    track.style.setProperty('--devbar-duration', duration + 's');
    track.classList.add('auto-scroll');
  }
  rebuild();
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 200);
  });
})();
// ============================================================
// 멀티플레이 시청자 참여(13장, 2026-08-24 구현) - 설계는 기획서 13장 참고.
// 호스트 단독 결정권(투표는 표시용) - 실제 스탯을 바꾸는 유일한 경로는
// submitChoiceFn/rollDiceFn뿐이고, 여기서는 그 위에 얹는 표시·투표 레이어만
// 다룬다.
// ============================================================
const multiplayerToggleStart = document.getElementById('multiplayerToggleStart');
const multiplayerToggleGame = document.getElementById('multiplayerToggleGame');
const mpHostPanel = document.getElementById('mpHostPanel');
const mpParticipantListEl = document.getElementById('mpParticipantList');
const mpParticipantBanner = document.getElementById('mpParticipantBanner');
const mpParticipantHostLabel = document.getElementById('mpParticipantHostLabel');
const mpLeaveBtn = document.getElementById('mpLeaveBtn');
const multiplayerSessionListEl = document.getElementById('multiplayerSessionList');
const joinMultiplayerModal = document.getElementById('joinMultiplayerModal');
const joinMultiplayerHostName = document.getElementById('joinMultiplayerHostName');
const joinMultiplayerNicknameInput = document.getElementById('joinMultiplayerNicknameInput');
const joinMultiplayerSubmitBtn = document.getElementById('joinMultiplayerSubmitBtn');
const closeJoinMultiplayerBtn = document.getElementById('closeJoinMultiplayerBtn');
const joinAdModal = document.getElementById('joinAdModal');
const closeJoinAdBtn = document.getElementById('closeJoinAdBtn');

const setMultiplayerEnabledFn = httpsCallable(functions, 'setMultiplayerEnabled');
const joinMultiplayerSessionFn = httpsCallable(functions, 'joinMultiplayerSession');
const kickParticipantFn = httpsCallable(functions, 'kickParticipant');
const advanceMultiplayerSessionFn = httpsCallable(functions, 'advanceMultiplayerSession');
const leaveMultiplayerSessionFn = httpsCallable(functions, 'leaveMultiplayerSession');

let mpHostListenersAttached = false;
let mpHostLatestSession = null;
let mpHostLatestVotes = {};
let mpFrozenVoteCounts = null;
let mpParticipantMode = false;
let mpParticipantHostUid = null;
let mpParticipantUnsub = null;
let mpParticipantVotesUnsub = null;
let mpParticipantLatestVotes = {};
let mpParticipantCurrentStage = null;
let mpPendingJoinHostUid = null;
let mpPendingJoinHostName = '';
let mpMyLastVoteChoiceId = null;
let mpMyLastVoteStageId = null;

// ---- 호스트 쪽: 내 uid 기준 세션·투표를 한 번만 구독해두고, 존재 여부로
// 패널 표시를 그때그때 판단한다(2026-08-19 "게임도중 토글 변경 가능" 대응 -
// 별도 활성화 신호 없이도 문서 존재 자체가 곧 상태) ----
function attachMultiplayerHostListeners() {
  if (mpHostListenersAttached || !currentUser) return;
  mpHostListenersAttached = true;
  const hostUid = currentUser.uid;
  const mySessionRef = ref(db, 'lifeGame/multiplayerSessions/' + hostUid);
  onValue(mySessionRef, (snap) => {
    mpHostLatestSession = snap.val();
    renderHostMultiplayerPanel();
    // 연결이 끊기면 처음 화면에서도 참가 불가능하게(2026-08-24, 사용자 지시 -
    // "호스트의 연결이 끊기면... 확인해줘" → "그렇게 해주고") - 세션이 있을
    // 때마다(재접속·재생성 포함) onDisconnect를 다시 걸어 이 커넥션이 끊기는
    // 순간 서버가 자동으로 이 문서를 지우게 한다. RTDB 규칙상 호스트 본인
    // uid는 자기 세션을 "삭제"만 할 수 있어(생성/수정은 여전히 Cloud
    // Function 전용) 이 등록 자체가 데이터 무결성을 해치지 않는다. 세션이
    // 없어지면(정상 종료) 이미 걸어둔 예약은 취소한다 - 안 그러면 다음에
    // 재접속해 새로 만든 세션을 "이전 연결"의 onDisconnect가 뒤늦게 지워버릴
    // 수 있다.
    if (mpHostLatestSession) {
      onDisconnect(mySessionRef).remove().catch((e) => console.error('onDisconnect 등록 실패:', e));
    } else {
      onDisconnect(mySessionRef).cancel().catch(() => {});
    }
  });
  onValue(ref(db, 'lifeGame/multiplayerVotes/' + hostUid), (snap) => {
    mpHostLatestVotes = snap.val() || {};
    renderHostMultiplayerPanel();
  });
}

function renderHostMultiplayerPanel() {
  if (mpParticipantMode) return; // 참가자 모드에서는 이 패널 자체를 안 씀
  multiplayerToggleGame.checked = !!mpHostLatestSession;
  mpParticipantListEl.innerHTML = '';
  if (!mpHostLatestSession) return;
  const participants = mpHostLatestSession.participants || {};
  // 선택지별 투표 수 - choiceList 버튼 옆에 배지로 붙인다(주사위 구간도 동일).
  // mpFrozenVoteCounts(2026-08-24, 사용자 지시 - "호스트가 선택하면 참가자들의
  // 최종투표결과가 사라지는데... 호스트의 선택 후에도 보이게 해줘") - 호스트가
  // 선택을 제출하는 순간 세션 미러의 stage는 이미 다음 나이로 넘어가 있어서
  // (mpHostLatestSession.stage.id가 곧바로 다음 턴 것이 됨), 라이브 투표 집계를
  // 그대로 쓰면 방금 끝난 턴의 투표가 즉시 0으로 보였다. disableChoiceList
  // 시점(제출 직전, 아직 이전 나이 기준)에 한 번 얼려두고, 다음 renderStage가
  // 실제로 다음 나이 화면을 그릴 때(= "다음" 버튼을 눌러 진짜로 넘어갈 때)
  // 해제해 그 사이(결과 확인 중)엔 계속 보이게 한다.
  let countByChoiceId;
  if (mpFrozenVoteCounts) {
    countByChoiceId = mpFrozenVoteCounts;
  } else {
    const currentStageId = mpHostLatestSession.stage && mpHostLatestSession.stage.id;
    const votesForStage = (currentStageId && mpHostLatestVotes[currentStageId]) || {};
    countByChoiceId = {};
    Object.values(votesForStage).forEach((choiceId) => {
      countByChoiceId[choiceId] = (countByChoiceId[choiceId] || 0) + 1;
    });
  }
  Array.from(choiceList.children).forEach((el) => {
    const cid = el.dataset && el.dataset.choiceId;
    if (!cid) return;
    const existingBadge = el.querySelector('.mp-vote-count');
    if (existingBadge) existingBadge.remove();
    const count = countByChoiceId[cid] || 0;
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'mp-vote-count';
      badge.textContent = count + '표';
      el.appendChild(badge);
    }
  });
  const participantUids = Object.keys(participants);
  if (!participantUids.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.style.margin = '0';
    empty.textContent = '아직 참가자가 없어요.';
    mpParticipantListEl.appendChild(empty);
    return;
  }
  participantUids.forEach((puid) => {
    const row = document.createElement('div');
    row.className = 'mp-participant-row';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = '🙋 ' + participants[puid];
    row.appendChild(nameSpan);
    const kickBtn = document.createElement('button');
    kickBtn.type = 'button';
    kickBtn.className = 'mp-kick-btn';
    kickBtn.textContent = '강퇴';
    kickBtn.addEventListener('click', async () => {
      if (!confirm('"' + participants[puid] + '"님을 강퇴할까요?')) return;
      kickBtn.disabled = true;
      try {
        await kickParticipantFn({ targetUid: puid });
      } catch (e) {
        console.error('강퇴 실패:', e);
        alert('강퇴에 실패했어요: ' + (e.message || e));
        kickBtn.disabled = false;
      }
    });
    row.appendChild(kickBtn);
    mpParticipantListEl.appendChild(row);
  });
}

multiplayerToggleGame.addEventListener('change', async () => {
  const enabled = multiplayerToggleGame.checked;
  multiplayerToggleGame.disabled = true;
  try {
    await setMultiplayerEnabledFn({ enabled });
  } catch (e) {
    console.error('멀티플레이 토글 실패:', e);
    alert('설정을 바꾸지 못했어요: ' + (e.message || e));
    multiplayerToggleGame.checked = !enabled;
  } finally {
    multiplayerToggleGame.disabled = false;
  }
});

async function enterHostMode() {
  mpParticipantMode = false;
  document.body.classList.remove('mp-participant-mode');
  mpParticipantBanner.classList.add('hidden');
  mpHostPanel.classList.remove('hidden');
  attachMultiplayerHostListeners();
  // 새로고침 후 이어하기(2026-08-24, 사용자 지시 - "호스트가 페이지를
  // 새로고침해서 게임을 이어할때 참가자 목록을 다시 갱신되게 해줘") - 위
  // attachMultiplayerHostListeners()는 이미 구독 중이면 아무 일도 안 하므로
  // (mpHostListenersAttached 플래그), 이 화면이 다시 보이는 시점에 지금 갖고
  // 있는 최신 값으로 한 번 더 명시적으로 그려서 확실히 최신 상태로 맞춘다.
  renderHostMultiplayerPanel();
  if (!currentUser) return;

  // 연결 끊김 후 재접속 시 세션 재생성(2026-08-24, 사용자 지시 - "호스트가
  // 다시 게임을 이어하면 그때 다시 참가 가능하게 해줘") - onDisconnect로
  // 세션이 지워졌더라도, playthroughs에 저장해둔 "이 유저가 멀티플레이를
  // 켜뒀었는지" 선호도가 true이면 setMultiplayerEnabled(true)로 다시 만든다.
  // 세션이 이미 살아있는 상태에서 이걸 호출하면 참가자 목록이 빈 값으로
  // 통째로 덮어써지므로(setMultiplayerEnabled의 재생성 로직은 항상 새로
  // set()함), 반드시 "지금 세션이 없을 때만" 호출해야 한다 - 이미 있으면
  // (정상 이어하기, 아직 연결이 안 끊긴 경우) 대신 advanceMultiplayerSession으로
  // stage/stats만 최신화한다("다음"을 누르기 전에 새로고침한 경우의 시차 보정,
  // 기존 로직 그대로).
  try {
    const [sessionSnap, prefSnap] = await Promise.all([
      get(ref(db, 'lifeGame/multiplayerSessions/' + currentUser.uid)),
      get(ref(db, 'lifeGame/playthroughs/' + currentUser.uid + '/multiplayerEnabled'))
    ]);
    if (sessionSnap.exists()) {
      await advanceMultiplayerSessionFn();
    } else if (prefSnap.val()) {
      await setMultiplayerEnabledFn({ enabled: true });
    }
  } catch (e) {
    console.error('멀티플레이 세션 재확인 실패:', e);
  }
}

// renderStage가 선택지 버튼을 다시 그릴 때마다(구간 전환 등) 투표 수 배지도
// 함께 다시 붙어야 하므로, renderStage 호출 직후 이어서 패널을 다시 그린다 -
// renderStage 본체를 직접 수정하지 않고 감싸는 쪽이 기존 페이드 애니메이션
// 로직과 덜 얽힌다.
const originalRenderStageForMp = renderStage;
renderStage = function (stage) {
  // 다음 나이 화면이 실제로 그려지는 시점 = 얼려뒀던 투표 수를 해제하고 이번
  // 새 나이의 라이브 집계로 되돌아갈 시점(위 mpFrozenVoteCounts 주석 참고).
  mpFrozenVoteCounts = null;
  originalRenderStageForMp(stage);
  if (!mpParticipantMode) renderHostMultiplayerPanel();
};

const originalDisableChoiceListForMp = disableChoiceList;
disableChoiceList = function () {
  if (!mpParticipantMode && mpHostLatestSession) {
    const currentStageId = mpHostLatestSession.stage && mpHostLatestSession.stage.id;
    const votesForStage = (currentStageId && mpHostLatestVotes[currentStageId]) || {};
    const snapshot = {};
    Object.values(votesForStage).forEach((choiceId) => {
      snapshot[choiceId] = (snapshot[choiceId] || 0) + 1;
    });
    mpFrozenVoteCounts = snapshot;
  }
  originalDisableChoiceListForMp();
};

// ------------------------------------------------------------
// 검색 화면 - 진행중인 다른 유저의 게임 목록
// ------------------------------------------------------------
let mpLatestSessionListVal = {};
function renderMultiplayerSessionList() {
  const val = mpLatestSessionListVal;
  const myUid = currentUser ? currentUser.uid : null;
  const entries = Object.keys(val)
    .filter((hostUid) => hostUid !== myUid && val[hostUid] && val[hostUid].completed !== true)
    .map((hostUid) => Object.assign({ hostUid }, val[hostUid]))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 30);
  if (!entries.length) {
    multiplayerSessionListEl.innerHTML = '<p class="empty-msg">지금 진행중인 다른 유저의 게임이 없어요.</p>';
    return;
  }
  multiplayerSessionListEl.innerHTML = '';
  entries.forEach((e) => {
    const item = document.createElement('div');
    item.className = 'mp-session-item';
    const left = document.createElement('span');
    left.innerHTML = '<span class="mp-session-name">' + escapeHtml(e.streamerName || '이름 없음') + '</span>' +
      '<span class="mp-session-age">' + escapeHtml((e.stage && e.stage.ageRange) || '') + '</span>';
    item.appendChild(left);
    const joinBtn = document.createElement('button');
    joinBtn.type = 'button';
    joinBtn.className = 'primary';
    joinBtn.textContent = '참가하기';
    joinBtn.addEventListener('click', () => openJoinMultiplayerModal(e.hostUid, e.streamerName || '이름 없음'));
    item.appendChild(joinBtn);
    multiplayerSessionListEl.appendChild(item);
  });
}
onValue(ref(db, 'lifeGame/multiplayerSessions'), (snap) => {
  mpLatestSessionListVal = snap.val() || {};
  renderMultiplayerSessionList();
}, (err) => {
  console.error('진행중인 게임 목록 읽기 실패:', err);
  multiplayerSessionListEl.innerHTML = '<p class="empty-msg">목록을 불러올 수 없습니다.</p>';
});
// currentUser가 이 구독보다 늦게 확정될 수 있어(비동기 로그인), auth가
// 확정되는 시점에도 한 번 다시 그려서 "내 게임이 잠깐 내 목록에 뜨는" 경합을
// 없앤다.
onAuthStateChanged(auth, (user) => { if (user) renderMultiplayerSessionList(); });

function openJoinMultiplayerModal(hostUid, hostName) {
  mpPendingJoinHostUid = hostUid;
  mpPendingJoinHostName = hostName;
  joinMultiplayerHostName.textContent = hostName;
  joinMultiplayerNicknameInput.value = '';
  joinMultiplayerModal.classList.remove('hidden');
}
closeJoinMultiplayerBtn.addEventListener('click', () => joinMultiplayerModal.classList.add('hidden'));

joinMultiplayerSubmitBtn.addEventListener('click', async () => {
  const nickname = joinMultiplayerNicknameInput.value.trim();
  if (!/^[가-힣]{1,6}$/.test(nickname)) {
    alert('닉네임은 한글 1~6자로 입력해주세요.');
    return;
  }
  joinMultiplayerSubmitBtn.disabled = true;
  try {
    const res = await joinMultiplayerSessionFn({ hostUid: mpPendingJoinHostUid, nickname });
    joinMultiplayerModal.classList.add('hidden');
    if (res.data.showAd) {
      joinAdModal.classList.remove('hidden');
    } else {
      await enterParticipantMode(mpPendingJoinHostUid, mpPendingJoinHostName);
    }
  } catch (e) {
    console.error('참가 실패:', e);
    alert('참가하지 못했어요: ' + (e.message || e));
  } finally {
    joinMultiplayerSubmitBtn.disabled = false;
  }
});

closeJoinAdBtn.addEventListener('click', async () => {
  joinAdModal.classList.add('hidden');
  await enterParticipantMode(mpPendingJoinHostUid, mpPendingJoinHostName);
});

// ------------------------------------------------------------
// 참가자 모드 - #gameSection을 재사용하되, 선택지는 제출이 아니라 투표를
// 기록하고, 구간 진행은 호스트의 multiplayerSessions 구독으로만 반영된다
// (호스트가 다음 구간으로 넘어가면 참가자 화면도 자동으로 따라간다).
// ------------------------------------------------------------
async function enterParticipantMode(hostUid, hostName) {
  mpParticipantMode = true;
  mpParticipantHostUid = hostUid;
  mpMyLastVoteChoiceId = null;
  mpMyLastVoteStageId = null;
  document.body.classList.add('mp-participant-mode');
  mpHostPanel.classList.add('hidden');
  mpParticipantBanner.classList.remove('hidden');
  mpParticipantHostLabel.textContent = '🙋 ' + hostName + '님의 게임에 참가중';
  await fadeOut([searchSection, nameSection, resumeSection, mainHeader]);
  fadeIn([gameSection]);

  if (mpParticipantUnsub) mpParticipantUnsub();
  mpParticipantUnsub = onValue(ref(db, 'lifeGame/multiplayerSessions/' + hostUid), (snap) => {
    const val = snap.val();
    if (!val) {
      alert('게임이 종료됐어요.');
      leaveParticipantMode();
      return;
    }
    renderStatBars(statBars, val.stats || {});
    // 호스트가 고른 선택지 표시(2026-08-24, 사용자 지시 - "호스트가 선택지
    // 결정후에... 참여자에게도 적용시켜 어떤 선택지를 결정했는지 알게해줘") +
    // "다음" 버튼을 눌렀을 때만 다음 나이로 전환되는 페이드 애니메이션도
    // 참가자에게 적용(같은 지시). stage.id가 바뀐 경우에만 페이드 전환하고,
    // 같은 stage에서 selectedChoiceId만 새로 생긴 경우(호스트가 방금
    // 골랐지만 아직 "다음"은 안 누른 상태)엔 화면을 다시 그리지 않고 즉시
    // 불투명화만 적용한다 - 호스트 쪽 markSelectedChoice와 동일한 타이밍.
    const newStageId = val.stage && val.stage.id;
    const stageChanged = !mpParticipantCurrentStage || newStageId !== mpParticipantCurrentStage.id;
    if (stageChanged) {
      fadeToParticipantStage(val.stage, val.selectedChoiceId || null);
    } else {
      applyParticipantSelectionDimming(val.selectedChoiceId || null);
    }
  }, (err) => {
    console.error('참가자 구독 실패:', err);
  });

  // 참가자 화면에도 투표 수 표시(2026-08-24, 사용자 지시 - "참가자 화면에서도
  // 다음으로 넘어가기 전까지 투표수 보이게 해줘") - 호스트와 같은
  // multiplayerVotes/{hostUid} 전체를 구독해, 지금 보고 있는 stage.id 기준으로만
  // 배지를 뽑아 보여준다. 호스트 쪽과 달리 "얼려두기"가 필요 없다 - 참가자
  // 화면엔 결과 확인 대기 단계가 없어서, 다음 나이로 넘어가는 순간 stage.id가
  // 바뀌며 choiceList 자체가 다시 그려지므로 이전 투표 수는 자연스럽게 사라진다.
  if (mpParticipantVotesUnsub) mpParticipantVotesUnsub();
  mpParticipantVotesUnsub = onValue(ref(db, 'lifeGame/multiplayerVotes/' + hostUid), (snap) => {
    mpParticipantLatestVotes = snap.val() || {};
    renderParticipantVoteBadges();
  });
}

function renderParticipantVoteBadges() {
  if (!mpParticipantCurrentStage) return;
  const votesForStage = mpParticipantLatestVotes[mpParticipantCurrentStage.id] || {};
  const countByChoiceId = {};
  Object.values(votesForStage).forEach((choiceId) => {
    countByChoiceId[choiceId] = (countByChoiceId[choiceId] || 0) + 1;
  });
  Array.from(choiceList.children).forEach((el) => {
    const cid = el.dataset && el.dataset.choiceId;
    if (!cid) return;
    const existingBadge = el.querySelector('.mp-vote-count');
    if (existingBadge) existingBadge.remove();
    const count = countByChoiceId[cid] || 0;
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'mp-vote-count';
      badge.textContent = count + '표';
      el.appendChild(badge);
    }
  });
}

// 페이드아웃-인 전환(2026-08-24, 사용자 지시 - "호스트가 다음 버튼을 누르면
// 페이드아웃-인 애니메이션을 참여자에게도 적용해줘") - 호스트용 fadeToStage와
// 완전히 같은 타이밍·트랜지션(#stageContent, FADE_MS/SWAP_BUFFER_MS)을
// 그대로 재사용하되, 안에서 부르는 렌더 함수만 renderParticipantStage로
// 바꾼 참가자 전용 버전이다 - 호스트 쪽 fadeToStage/renderStage는 그대로
// 두고 건드리지 않는다.
function fadeToParticipantStage(stage, selectedChoiceId) {
  stageContent.style.transition = 'none';
  stageContent.style.opacity = '1';
  void stageContent.offsetWidth;
  stageContent.style.transition = 'opacity ' + FADE_MS + 'ms ease';
  stageContent.style.opacity = '0';
  setTimeout(() => {
    renderParticipantStage(stage, selectedChoiceId);
    void stageContent.offsetWidth;
    stageContent.style.opacity = '1';
  }, FADE_MS + SWAP_BUFFER_MS);
}

// 호스트가 고른 선택지를 참가자 화면에서도 불투명화(2026-08-24, 사용자
// 지시) - 호스트 쪽 markSelectedChoice와 동일한 방식(고른 것만 100%, 나머지
// 30%)이되, 다음 나이로 넘어가기 전까지는 더 이상 투표해도 의미가 없으므로
// 버튼도 함께 비활성화한다(주사위 굴리기 버튼 포함). selectedChoiceId가
// null이면(아직 호스트가 고르지 않았거나 새 나이로 넘어가 초기화된 상태)
// 원래대로 되돌린다.
function applyParticipantSelectionDimming(selectedChoiceId) {
  Array.from(choiceList.children).forEach((el) => {
    if (el.dataset && el.dataset.choiceId) {
      el.style.opacity = selectedChoiceId ? (el.dataset.choiceId === selectedChoiceId ? '1' : '0.3') : '';
      el.disabled = !!selectedChoiceId;
    } else if (el.classList && el.classList.contains('dice-btn')) {
      el.disabled = !!selectedChoiceId;
    }
  });
}

function renderParticipantStage(stage, selectedChoiceId) {
  if (!stage) return;
  mpParticipantCurrentStage = stage;
  if (stage.id !== mpMyLastVoteStageId) {
    mpMyLastVoteChoiceId = null;
    mpMyLastVoteStageId = stage.id;
  }
  stageName.textContent = stage.name;
  stageAge.textContent = stage.ageRange;
  storyText.textContent = stage.intro || '';
  choiceList.innerHTML = '';
  resultBox.classList.add('hidden');
  nextBtn.classList.add('hidden');

  (stage.choices || []).forEach((choice) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn mp-vote-btn';
    btn.dataset.choiceId = choice.id;
    btn.textContent = (stage.random ? '🎲 ' : '') + choice.text;
    if (choice.id === mpMyLastVoteChoiceId) btn.classList.add('mp-my-vote');
    btn.addEventListener('click', () => voteForChoice(stage.id, choice.id));
    choiceList.appendChild(btn);
  });

  if (stage.random) {
    // 참가자 쪽 "주사위 굴리기"(2026-08-24, 사용자 지시 - "참가자도 투표용으로
    // 주사위굴리기 가능하게 해줘") - 위 미리보기 선택지 중 하나를 무작위로 골라
    // 그걸 내 투표로 기록한다. 실제 결과에는 영향이 없다(호스트의 rollDice로만
    // 정해짐, 참가자 화면은 onValue 구독으로 자동 갱신) - 어느 쪽을 직접 눌러
    // 투표하든, 주사위로 무작위로 뽑아 투표하든 결과는 똑같이 표시용 집계일
    // 뿐이라는 원칙은 그대로다.
    const rollBtn = document.createElement('button');
    rollBtn.className = 'dice-btn';
    rollBtn.textContent = '🎲 주사위 굴려서 투표하기';
    rollBtn.addEventListener('click', () => {
      const choices = stage.choices || [];
      if (!choices.length) return;
      diceOverlay.classList.remove('hidden');
      setTimeout(() => {
        diceOverlay.classList.add('hidden');
        const picked = choices[Math.floor(Math.random() * choices.length)];
        voteForChoice(stage.id, picked.id);
      }, 1200);
    });
    choiceList.appendChild(rollBtn);
    const hint = document.createElement('p');
    hint.className = 'dice-hint';
    hint.textContent = '실제 결과는 방장이 굴리는 주사위로 정해져요. 위 선택지를 직접 눌러 투표하거나, 이 버튼으로 무작위로 투표할 수 있어요.';
    choiceList.appendChild(hint);
  }
  renderParticipantVoteBadges();
  applyParticipantSelectionDimming(selectedChoiceId || null);
}

async function voteForChoice(stageId, choiceId) {
  if (!mpParticipantHostUid || !currentUser) return;
  mpMyLastVoteChoiceId = choiceId;
  Array.from(choiceList.children).forEach((el) => {
    if (el.dataset && el.dataset.choiceId) el.classList.toggle('mp-my-vote', el.dataset.choiceId === choiceId);
  });
  try {
    await set(ref(db, 'lifeGame/multiplayerVotes/' + mpParticipantHostUid + '/' + stageId + '/' + currentUser.uid), choiceId);
  } catch (e) {
    console.error('투표 실패:', e);
  }
}

function leaveParticipantMode() {
  // 참가자가 나가면 호스트 화면에서도 곧바로 갱신되게(2026-08-24, 사용자
  // 지시) - participants에서 스스로를 빼는 건 클라이언트 쓰기 권한이 없어
  // (multiplayerSessions는 Cloud Function만 쓸 수 있음) 서버 함수를 호출한다.
  // 게임이 이미 끝나 세션이 사라진 경우(엔딩 도달로 이 함수가 호출된 경우)엔
  // 그냥 left:false로 조용히 끝나므로 매번 호출해도 안전하다.
  if (mpParticipantHostUid) {
    leaveMultiplayerSessionFn({ hostUid: mpParticipantHostUid }).catch((e) => console.error('나가기 처리 실패:', e));
  }
  if (mpParticipantUnsub) { mpParticipantUnsub(); mpParticipantUnsub = null; }
  if (mpParticipantVotesUnsub) { mpParticipantVotesUnsub(); mpParticipantVotesUnsub = null; }
  mpParticipantLatestVotes = {};
  mpParticipantCurrentStage = null;
  mpParticipantMode = false;
  mpParticipantHostUid = null;
  document.body.classList.remove('mp-participant-mode');
  mpParticipantBanner.classList.add('hidden');
  fadeOut([gameSection]).then(() => {
    fadeIn([searchSection, mainHeader]);
  });
}
mpLeaveBtn.addEventListener('click', leaveParticipantMode);

// 로그인이 확정되면(익명 포함) 호스트 리스너를 한 번 걸어둔다 - 세션이 없는
// 상태에서도 구독 자체는 걸려 있어야, 게임 시작/이어하기 이후 언제 토글을
// 켜도(또는 이미 켜진 채로 시작해도) 곧바로 패널이 반영된다.
onAuthStateChanged(auth, (user) => {
  if (user) attachMultiplayerHostListeners();
});
