// 게임 콘텐츠(생애 구간·선택지·엔딩) - 기획안(life-game-plan.html) 기준.
// 처음엔 스켈레톤 단계로 10개 생애 카테고리 중 3개(유아기/초등학생/스무살)만
// 채워서 검색→이름짓기→선택→저장→갤러리 공유까지 전체 파이프라인이 실제로
// 동작하는 걸 확인했고, 이후 나머지 카테고리를 한 살 단위로 순서대로 채워
// 지금은 유아기~황혼(0~100세) 10카테고리가 전부 구현되어 있다. 아래 각
// 카테고리별 설명에 STAGES 배열 안에서의 정확한 id 범위와 연도별 주제가
// 정리되어 있다.
//
// 선택지 작성 원칙(기획안 04장) - 문장만 보고 결과를 예측할 수 없게, 매 구간
// 선택지는 항상 안전/도전/우회 세 태도 중 하나에 가깝게 쓴다. deltas는
// 선택 직후 결과 텍스트가 뜬 다음에만 공개된다(클라이언트에는 절대 미리 안 보냄).
//
// text는 [행동만 명시]로 쓴다 - [행동+결과]를 한 문장에 섞어 쓰지 않는다
// (2026-08-17, 사용자 지시). "행동을 하는 것"까지만 text에 담고, 그 행동이
// 잘 됐는지/못 됐는지, 어떤 감정을 남겼는지는 전부 result에서만 드러낸다.
// 예: text에 "성공한다"/"실패한다"/"기뻐한다"/"좌절한다"/"인정받아"처럼
// 결과·감정을 미리 알려주는 단어를 쓰지 않는다 - "야근하며 성과를
// 인정받는다"(X, 결과가 이미 긍정으로 드러남) 대신 "야근하며 한 달을
// 보낸다"(O, 잘 됐는지는 result에서만 확인 가능)처럼. 이 원칙을 어긴 기존
// 선택지 152개를 감사해 전부 고쳤다(2026-08-17).
//
// 위 1차 감사는 "성공/실패/기뻐한다"류 감정·평가 단어만 걸러냈는데, 감정
// 단어가 없어도 "목돈을 날린다"/"팔이 부러진다"처럼 사건 자체가 곧 결과인
// 표현도 결과를 유추 가능하게 만든다는 걸 재확인해(2026-08-17) 32개를
// 추가로 찾아냈다. 이 중 건강 상세(addCondition)를 새로 얻는 선택지 30개는
// "정글짐에서 뛰어내리다 팔이 부러진다"처럼 진단명·부상명을 text에 직접
// 명시하고 있었던 것 - 이제 이런 병/부상 발병 선택지는 진단·부상명을 절대
// text에 쓰지 않고, "정글짐 꼭대기에서 겁 없이 뛰어내린다"/"급하게
// 무단횡단을 한다"처럼 그 병/부상이 생길 가능성이 있는 위험 행동만
// 서술한다(예전엔 "행동=결과가 하나인 사건"은 예외로 허용했었는데, 이제는
// 그 예외가 사라졌다 - 항상 행동만 쓰고 실제 진단명·부상명은 addCondition의
// label로만 드러난다). 나머지(재산/관계/이혼/사별 등 22개)는 케이스별로
// 판단이 필요해 아직 미정리 상태로 남아 있다.
//
// intro - 그 구간이 시작될 때 보여주는 1~2문장짜리 장면 설명. 게임이 시작된
// 뒤엔 화면 상단의 일반 소개 문구(헤더)를 숨기고 이 텍스트로 대체한다
// (index.html의 renderStage 참고) - "지금 어떤 이야기 안에 있는지"를 매
// 구간마다 새로 알려주기 위함. 결과/deltas와 달리 이건 숨길 이유가 없어
// publicStage()가 그대로 클라이언트에 보낸다.
//
// choices는 구간마다 최대 6개까지 채워둔다 - 실제 플레이에서는 이 중 서버가
// 무작위로 3개만 골라(index.js의 pickVisibleChoiceIds) 보여준다. 재접속/이어하기
// 때도 같은 3개가 유지되도록 그 회차에 고른 3개의 id를 저장 슬롯(visibleChoiceIds)에
// 남겨두고, 주사위 구간의 rollDice도 반드시 그 3개 중에서만 뽑는다(화면에 안 보여준
// 선택지가 당첨되는 일이 없도록). choices가 3개 이하인 구간은 그냥 전부 보여준다.
//
// 유아기(0~6세)는 한 살 단위로 쪼개서 STAGES에 infancy-0 ~ infancy-6 총 7개
// 항목으로 넣는다. 이 중 infancy-0~infancy-3(0~3세)만 random:true(주사위
// 전용) - 갓난아기~걸음마 시기에 벌어지는 일은 아이 본인이 "선택"할 수 있는
// 게 아니라는 취지. infancy-4~infancy-6(4~6세)부터는 스스로 뭔가를 좋아하고
// 싫어하기 시작하는 나이라 다시 일반 선택(6개 중 3개 노출)으로 바뀐다.
//
// 초등학생(7~12세)도 유아기와 같은 방식으로 elementary-7 ~ elementary-12
// 총 6개 항목으로 쪼갰다. 전부 random 없이 일반 선택 - 이 나이대는 본인
// 의사로 고르는 게 자연스러워서 주사위 구간은 없다.
//
// "청소년기"도 같은 패턴 - 기획안 4장의 "사춘기(13~15세)"·"고등학생
// (16~18세)" 두 카테고리를 한 살 단위 6개 항목(teen-13 ~ teen-18)으로
// 묶어서 구현했다. 역시 전부 random 없이 일반 선택.
//
// "스무 살"(19~23세)도 같은 방식으로 twenties-19 ~ twenties-23 총 5개
// 항목으로 쪼갰다. 19세엔 대학/방송/취업 등 큰 방향을 가르는 원래
// 선택지 6개를 그대로 두고, 20~23세는 그 방향과 무관하게 벌어질 법한
// 일(자취, 알바, 인턴, 취업 준비 등)로 새로 채웠다 - 이 게임은 이전
// 선택에 따라 이후 구간 내용이 달라지지 않으므로(스탯에만 반영) 19세에
// 뭘 골랐든 20~23세 선택지는 동일하게 노출된다.
//
// "사회 초년생"(24~29세)도 같은 패턴으로 rookie-24 ~ rookie-29 총 6개
// 항목으로 구현했다. 신입 적응(24세) → 업무 숙련/이직 고민(25세) →
// 독립·재테크(26세) → 방향 재점검(27세) → 성과·책임 증가(28세) →
// 20대 정리(29세) 순.
//
// "서른, 자리잡기"(30~39세)는 10년짜리 카테고리라 settling-30 ~
// settling-39 총 10개 항목으로 구현했다(다른 카테고리보다 기간이 길어
// 항목 수도 더 많음). 서른의 무게(30세) → 결혼·비혼(31세) → 내 집
// 마련·재테크(32세) → 가족계획(33세) → 커리어 전환점(34세) → 중간
// 관리자(35세) → 부모 부양(36세) → 자기계발(37세) → 건강 체감(38세)
// → 서른대 마무리(39세) 순.
//
// "중년, 선택의 무게"(40~54세)는 15년짜리로 가장 긴 카테고리라
// midlife-40 ~ midlife-54 총 15개 항목으로 구현했다. 마흔의 무게(40세)
// → 자녀교육·커리어 안정(41세) → 건강 이상 신호(42세) → 조직 내 입지
// (43세) → 관계 재정비(44세) → 중년의 위기(45세) → 재도전(46세) →
// 부모님 노환·이별(47세) → 커리어 정점(48세) → 갱년기 초입(49세) →
// 쉰(50세) → 빈 둥지(51세) → 은퇴 준비(52세) → 재무 재점검(53세) →
// 중년 마무리(54세) 순.
//
// "노년 준비"(55~69세, 15년)는 이제 전부 구현됐다 - oldprep-55 ~
// oldprep-69 총 15개. 정년퇴직(55세) → 정체성 재정립(56세) → 새로운
// 관계망(57세) → 손주·가족 관계(58세) → 건강 관리 본격화(59세) →
// 환갑(60세) → 새 삶의 리듬(61세) → 연금(62세) → 취미·가족 심화(63세)
// → 몸의 변화 수용(64세) → 법정 노인 연령(65세) → 부부 관계 재조명
// (66세) → 유언·상속 정리(67세) → 상실 경험(68세) → 노년 준비 마무리
// (69세) 순.
//
// "황혼"(70~100세, 31년)은 twilight-70~twilight-100 총 31개로 전부
// 구현 완료됐다 - 이로써 생애 10카테고리(유아기~황혼, 0~100세)가 모두
// 채워졌다. 칠순(70세) → 소소한 일상(71세) → 손주 세대 성취(72세) →
// 신체 저하 수용(73세) → 마지막 장거리 여행(74세) → 남은 삶 재구성
// (75세) → 배우자 간병(76세) → 희수(77세) → 기억력 저하 체감(78세) →
// 팔순 준비(79세) → 팔순(80세) → 감사한 하루하루(81세) → 오랜 인연들
// (82세) → 도움이 필요해짐(83세) → 삶의 의미 되새김(84세) → 요양·
// 재가돌봄(85세) → 지혜를 전하는 어른(86세) → 잦아진 병원 방문(87세)
// → 미수(88세) → 구순 준비(89세) → 구순(90세) → 선물 같은 하루하루
// (91세) → 병상에서의 시간(92세) → 못다 한 말 전하기(93세) → 삶의
// 정리(94세) → 살아있음의 기적(95세) → 마음의 평화(96세) → 백수를
// 앞두고(97세) → 백 살을 실감(98세) → 백수(99세) → 백세, 인생의
// 완주(100세) 순.
//
// 건강 상세(healthConditions) - 선택지에 addCondition({id,label})을 붙이면
// 부상/질병이 "생기고", removeCondition(id)을 붙이면 그 조건이 나아서
// "없어진다". 서버(index.js의 applyChoice)가 그 판의 저장 슬롯에
// healthConditions 배열로 계속 들고 다니고, 클라이언트는 "현재 건강 상세"
// 패널에 그대로 보여준다. requiresCondition(id)을 붙인 회복용 선택지는 그
// 조건이 지금 없으면 애초에 노출 후보에서 빠진다(pickVisibleChoiceIds가
// 필터링) - 부러진 적 없는 팔이 "다 나았다"고 나오는 일이 없도록. 이런
// 조건부 선택지는 3개 노출에 항상 끼일 필요는 없고, 오히려 가끔만 등장하는
// 게 자연스럽다.
//
// requiresNoCondition([id,...])는 requiresCondition의 반대 - 배열 안의
// 조건 중 하나라도 지금 활성 상태면 그 선택지는 노출 후보에서 빠진다
// (2026-08-17, 사용자 지시: "발목 부상일 때 축구 선택지는 선택 못한다"
// 같은 케이스). 지금 붙어있는 예: 발목 부상(ankle-sprain) 중엔
// sports-day-star(체육대회 반 대표)가, 손목 부상·손목터널증후군
// (wrist-sprain·carpal-tunnel) 중엔 logistics-recognized-as-ace(빠른
// 손놀림으로 유명해짐)가 안 뜬다. 새 콘텐츠를 추가할 때 특정 신체 부위를
// 쓰는 행동(달리기·손 기술 등)이면서 그 부위의 부상 조건이 이미 게임에
// 있다면 이 필드로 걸어줄 것.
//
// COMPANY_OCCUPATION_IDS(2026-08-17) - "회사/조직 소속" 계열 직업 목록.
// 승진·부서 이동·조직 개편·회식·사내 연애·팀원처럼 회사 위계가 있어야 말이
// 되는 선택지는 requiresAnyOccupation(아무 직업이나 OK) 대신 이 배열을
// requiresOccupation으로 걸어서, 자영업자·예술가·창업가·컨설턴트·재능기부·
// 은퇴자처럼 회사 소속이 아닌 직업일 때는 안 뜨게 한다(예: 자영업자인데
// "부서장으로 승진한다"가 뜨는 일이 없도록). 새 "회사원 계열" 직업을 추가할
// 땐 이 배열에도 id를 추가해야 그 직업에서도 이 선택지들이 정상 노출된다.
const COMPANY_OCCUPATION_IDS = [
  'tech-worker', 'civil-servant', 'logistics-worker', 'teacher', 'healthcare-worker',
  'public-corp-employee', 'sales-rep', 'office-worker', 'job-changed', 'team-lead',
  're-employed', 'career-changer'
];

// LOTTERY_PRIZE_TABLE(2026-08-17, 사용자 지시) - 복권을 산 뒤(addAsset로
// lottery-ticket 재산 획득) "당첨 결과를 확인" 선택지가 prizeTable로 이 표를
// 참조하면, 그 선택의 deltas·result가 고정값이 아니라 이 중 하나를 가중치
// 기준으로 무작위로 뽑아 대체된다(index.js의 applyChoice 참고). weight 합이
// 정확히 100이라 각 값 자체가 당첨 확률(%)이다 - 1등 2%부터 꽝 50%까지.
// wealth 값은 cashUnitForAge와 곱해져 실제 원화로 환산되므로, 1등이 다른
// 어떤 기존 선택지보다도 압도적으로 큰 액수가 되도록 의도적으로 크게 잡았다.
const LOTTERY_PRIZE_TABLE = [
  { weight: 2, label: '1등', deltas: { wealth: 25, happiness: 15, fame: 5 }, result: '떨리는 손으로 번호를 맞춰보다, 숨이 턱 막혔다. 1등이었다.' },
  { weight: 3, label: '2등', deltas: { wealth: 12, happiness: 8 }, result: '한 자리가 아쉬웠지만, 2등도 인생에 몇 번 없을 행운이었다.' },
  { weight: 5, label: '3등', deltas: { wealth: 6, happiness: 4 }, result: '기대 이상의 금액에, 하루 종일 실실 웃음이 났다.' },
  { weight: 15, label: '4등', deltas: { wealth: 2, happiness: 2 }, result: '큰돈은 아니어도, 공돈이 생긴 기분은 나쁘지 않았다.' },
  { weight: 25, label: '5등', deltas: { wealth: 1, happiness: 1 }, result: '본전 조금 넘는 정도였지만, 그래도 당첨은 당첨이었다.' },
  { weight: 50, label: '꽝', deltas: {}, result: '역시나, 번호는 하나도 맞지 않았다.' }
];

const STAGES = [
  {
    id: 'infancy-0',
    name: '유아기',
    ageRange: '0세',
    intro: '세상에 막 태어난 순간. 어떤 집에서 태어날지는 스스로 고를 수 없습니다 — 주사위를 굴려 당신이 자랄 환경을 정해보세요.',
    random: true,
    choices: [
      {
        id: 'warm-poor',
        text: '차는 없지만 부모님이 늘 곁에 있는 집에서 태어난다',
        deltas: { happiness: 8, relationship: 6, wealth: -4 },
        result: '넉넉하진 않았지만, 그 시절 저녁 밥상의 온기는 지금도 선명하다.',
        addFamilyMembers: [
          { id: 'father', label: '👨 아버지' },
          { id: 'mother', label: '👩 어머니' }
        ]
      },
      {
        id: 'busy-rich',
        text: '부모님이 사업을 크게 벌이며 바쁘게 사는 집에서 태어난다',
        deltas: { wealth: 8, fame: 2, relationship: -6, health: -2 },
        result: '집은 늘 넓었지만, 부모님 얼굴을 보는 날은 손에 꼽았다.',
        addFamilyMembers: [
          { id: 'father', label: '👨 아버지' },
          { id: 'mother', label: '👩 어머니' }
        ]
      },
      {
        id: 'big-family',
        text: '형제자매 여럿과 북적거리는 대가족에서 태어난다',
        deltas: { relationship: 8, happiness: 3, wealth: -3 },
        result: '내 것과 남의 것의 경계가 늘 흐릿했던, 시끄럽고 정신없던 첫 해.',
        addFamilyMembers: [
          { id: 'father', label: '👨 아버지' },
          { id: 'mother', label: '👩 어머니' },
          { id: 'sibling', label: '🧒 형제자매' }
        ]
      },
      {
        id: 'single-parent-close',
        text: '부모님 한 분과 유독 끈끈하게 지내는 집에서 태어난다',
        deltas: { relationship: 7, happiness: 4, wealth: -3 },
        result: '둘뿐이라 부족한 것도 있었지만, 그만큼 서로에게 전부였다.',
        addFamilyMembers: [{ id: 'single-parent', label: '🧑 부모님' }]
      },
      {
        id: 'foster-care',
        text: '여러 어른의 손을 거치며 자라는 보육 시설에서 태어난다',
        deltas: { relationship: -4, health: -2, happiness: -2, wealth: -2 },
        result: '어느 한 사람의 것도 아니었지만, 그래서 여러 사람이 조금씩 나를 키웠다.'
      },
      {
        id: 'spotlight-family',
        text: '이미 동네에서 꽤 알려진 집안에서 태어난다',
        deltas: { fame: 10, wealth: 5, relationship: -4, happiness: -2 },
        result: '태어나자마자 "그 집 아이"라는 꼬리표가 먼저 붙었다.',
        addFamilyMembers: [
          { id: 'father', label: '👨 아버지' },
          { id: 'mother', label: '👩 어머니' }
        ]
      }
    ]
  },
  {
    id: 'infancy-1',
    name: '유아기',
    ageRange: '1세',
    intro: '이제 막 걸음마를 시작할 시기. 몸이 자라는 속도는 아이마다 다 다릅니다.',
    random: true,
    choices: [
      {
        id: 'early-walker',
        text: '또래보다 일찍 걸음마를 뗀다',
        deltas: { health: 5, fame: 2 },
        result: '뒤뚱뒤뚱 걷는 게 뭐가 그리 자랑스러웠는지, 온 집안이 박수를 쳐줬다.'
      },
      {
        id: 'late-bloomer',
        text: '걸음마는 느리지만 대신 눈치가 빠르다',
        deltas: { health: -3, happiness: 3, relationship: 2 },
        result: '걷기보다 관찰하는 걸 먼저 배운 아이였다.'
      },
      {
        id: 'accident-prone',
        text: '자주 넘어지고 부딪히는 편이다',
        deltas: { health: -6, relationship: 4 },
        result: '멍이 마를 새가 없었지만, 그만큼 안아주는 손길도 늘었다.'
      },
      {
        id: 'calm-baby',
        text: '울음 없이 순한 아기로 소문난다',
        deltas: { relationship: 6, happiness: 2 },
        result: '키우기 편한 아기라는 말이 동네에 퍼졌다.'
      },
      {
        id: 'sickly-infant',
        text: '잔병치레가 유독 잦다',
        deltas: { health: -8, relationship: 5 },
        result: '병원을 문턱 닳도록 드나들었지만, 그만큼 온 가족이 정성을 쏟았다.'
      },
      {
        id: 'energetic-baby',
        text: '잠도 안 자고 기운이 넘치는 아기다',
        deltas: { health: 3, happiness: 4, relationship: -3 },
        result: '부모님은 녹초가 됐지만, 아기는 세상 즐거워 보였다.'
      },
      {
        id: 'asthma-onset',
        text: '찬바람에도 얇게 입고 밖에서 자주 논다',
        deltas: { health: -6, relationship: 2 },
        result: '작은 기침 소리에도 온 가족이 귀를 기울이게 됐다.',
        addCondition: { id: 'asthma', label: '🌬️ 천식' }
      },
      {
        id: 'rare-illness-onset',
        text: '원인 모를 증상이 반복돼 정밀 검사를 받는다',
        deltas: { health: -12, happiness: -6, wealth: -6, relationship: 5 },
        result: '치료법이 없다는 말 앞에서도, 가족은 무너지지 않고 서로를 더 꽉 붙잡았다.',
        addCondition: { id: 'rare-illness', label: '🎗️ 희귀 난치병', blocksHealthRecovery: true }
      }
    ]
  },
  {
    id: 'infancy-2',
    name: '유아기',
    ageRange: '2세',
    intro: '말문이 트이기 시작하는 나이. 이 시기 성격의 씨앗이 은근히 오래갑니다.',
    random: true,
    choices: [
      {
        id: 'early-talker',
        text: '또래보다 말을 빨리 뗀다',
        deltas: { fame: 4, happiness: 3 },
        result: '문장을 만들기 시작하자 어른들이 신기해하며 몰려들었다.'
      },
      {
        id: 'silent-observer',
        text: '말은 늦지만 표정으로 다 알아챈다',
        deltas: { relationship: 3, happiness: 2 },
        result: '말이 없어도 무슨 생각을 하는지 다 티가 나는 아이였다.'
      },
      {
        id: 'stubborn-toddler',
        text: '떼쓰기 대장, "미운 두 살"을 제대로 겪는다',
        deltas: { relationship: -5, happiness: 4 },
        result: '싫은 건 끝까지 싫다고 온몸으로 표현했다.'
      },
      {
        id: 'copycat',
        text: '어른들 말투를 그대로 따라 한다',
        deltas: { fame: 3, relationship: 4 },
        result: '어디서 배웠는지 모를 말투로 온 가족을 웃겼다.'
      },
      {
        id: 'shy-around-strangers',
        text: '낯가림이 유독 심하다',
        deltas: { relationship: -3, health: 2 },
        result: '집 밖에만 나가면 부모님 다리 뒤로 숨는 아이였다.'
      },
      {
        id: 'little-chatterbox',
        text: '쉬지 않고 옹알이하듯 말을 건다',
        deltas: { fame: 5, happiness: 3, health: -2 },
        result: '조용할 틈이 없는 나날이었다.'
      },
      {
        id: 'broken-arm-onset',
        text: '정글짐 꼭대기에서 겁 없이 뛰어내린다',
        deltas: { health: -8, relationship: 3 },
        result: '깁스에 낙서를 잔뜩 받으며, 팔 하나로도 못 할 게 없다는 걸 배웠다.',
        addCondition: { id: 'broken-arm', label: '🦴 팔 골절' }
      }
    ]
  },
  {
    id: 'infancy-3',
    name: '유아기',
    ageRange: '3세',
    intro: '처음으로 집 밖 세상(어린이집)과 마주하는 시기.',
    random: true,
    choices: [
      {
        id: 'daycare-star',
        text: '어린이집 인기쟁이로 등극한다',
        deltas: { fame: 6, relationship: 4 },
        result: '등원할 때마다 이름을 부르며 반겨주는 친구들이 생겼다.'
      },
      {
        id: 'clingy-kid',
        text: '엄마 아빠와 떨어지기 싫어 매일 운다',
        deltas: { relationship: 5, happiness: -3 },
        result: '등원 문 앞에서의 눈물 배웅이 한동안 일과가 됐다.'
      },
      {
        id: 'loner-in-class',
        text: '무리에 섞이기보다 혼자 노는 걸 더 좋아한다',
        deltas: { happiness: 3, relationship: -4 },
        result: '구석 자리에서 혼자 쌓기 놀이를 하던 시간이 제일 편했다.'
      },
      {
        id: 'troublemaker',
        text: '장난이 심해 선생님께 자주 불려간다',
        deltas: { fame: 4, relationship: -3, happiness: 2 },
        result: '말썽쟁이라는 별명이 이때 처음 붙었다.'
      },
      {
        id: 'allergic-kid',
        text: '알레르기 때문에 이것저것 못 먹는다',
        deltas: { health: -5, relationship: 3 },
        result: '간식 시간마다 유독 신경 써야 했던 아이였다.'
      },
      {
        id: 'early-helper',
        text: '동생이나 친구를 잘 챙기는 아이로 소문난다',
        deltas: { relationship: 6, happiness: 2 },
        result: '작은 손으로도 남을 챙길 줄 아는 아이였다.'
      },
      {
        id: 'weak-stomach-onset',
        text: '손을 잘 씻지 않고 아무 음식이나 집어 먹는다',
        deltas: { health: -5, relationship: 2 },
        result: '먹을 수 있는 게 자꾸 줄어드는 게 서러웠던 시기.',
        addCondition: { id: 'weak-stomach', label: '🤢 잦은 배탈' }
      }
    ]
  },
  {
    id: 'infancy-4',
    name: '유아기',
    ageRange: '4세',
    intro: '좋아하는 것과 싫어하는 것이 뚜렷해지기 시작하는 나이.',
    choices: [
      {
        id: 'dino-obsessed',
        text: '공룡 박사가 될 기세로 한 가지에 파고든다',
        deltas: { happiness: 4, fame: 2 },
        result: '어려운 공룡 이름을 줄줄 외워 어른들을 놀라게 했다.'
      },
      {
        id: 'picky-eater',
        text: '편식이 심해 매 끼니가 작은 전쟁이다',
        deltas: { health: -4, relationship: -2 },
        result: '식탁 위 실랑이가 하루도 빠지지 않았다.'
      },
      {
        id: 'dance-kid',
        text: '노래만 나오면 즉흥 춤을 춘다',
        deltas: { fame: 5, happiness: 3 },
        result: '거실이 곧 무대였던 시절.'
      },
      {
        id: 'book-lover',
        text: '똑같은 그림책을 수십 번 읽어달라 조른다',
        deltas: { happiness: 3, wealth: -2 },
        result: '책장이 너덜너덜해질 때까지 같은 이야기를 사랑했다.'
      },
      {
        id: 'outdoor-kid',
        text: '놀이터에서 살다시피 한다',
        deltas: { health: 5, relationship: 3 },
        result: '해가 질 때까지 흙투성이로 뛰어놀았다.'
      },
      {
        id: 'drama-queen',
        text: '사소한 일에도 크게 우는 감정 기복을 보인다',
        deltas: { relationship: -3, happiness: 2 },
        result: '감정 하나만큼은 누구보다 솔직하게 드러내는 아이였다.'
      },
      {
        id: 'broken-arm-heal',
        text: '깁스를 풀고 팔을 마음껏 쓸 수 있게 된다',
        deltas: { health: 6, happiness: 3 },
        result: '깁스를 풀던 날, 가려웠던 팔을 실컷 긁으며 세상을 다 가진 기분이었다.',
        requiresCondition: 'broken-arm',
        removeCondition: 'broken-arm'
      }
    ]
  },
  {
    id: 'infancy-5',
    name: '유아기',
    ageRange: '5세',
    intro: '유치원에서 작은 사회생활이 본격적으로 시작됩니다.',
    choices: [
      {
        id: 'class-leader',
        text: '유치원 반장 노릇을 자처한다',
        deltas: { fame: 5, relationship: 3 },
        result: '줄 세우기부터 인사 구호까지, 앞장서는 걸 좋아했다.'
      },
      {
        id: 'best-friend-forever',
        text: '평생 갈 것 같은 단짝을 만난다',
        deltas: { relationship: 7, happiness: 3 },
        result: '어디를 가든 손을 꼭 잡고 다니던 사이가 생겼다.'
      },
      {
        id: 'competitive-streak',
        text: '뭐든 1등을 하려는 승부욕이 생긴다',
        deltas: { fame: 3, relationship: -3, happiness: 2 },
        result: '달리기든 가위바위보든, 지는 걸 못 참는 아이였다.'
      },
      {
        id: 'stage-fright',
        text: '재롱잔치 무대 위에서 얼어붙는다',
        deltas: { happiness: -3, relationship: 2 },
        result: '입도 뻥긋 못 했지만, 가족들은 그대로도 예쁘다며 웃어줬다.'
      },
      {
        id: 'money-curious',
        text: '처음으로 용돈의 개념을 깨닫는다',
        deltas: { wealth: 3, happiness: 2 },
        result: '동전 몇 개를 손에 쥐고 세상을 다 가진 기분이었다.'
      },
      {
        id: 'protective-sibling',
        text: '동생을 끔찍이 챙기는 언니·오빠·형·누나가 된다',
        deltas: { relationship: 6, health: -2 },
        result: '작은 몸으로 동생을 업어주겠다고 나서던 시절.',
        requiresFamilyMember: ['sibling']
      },
      {
        id: 'weak-stomach-heal',
        text: '식습관을 고쳐 배앓이가 눈에 띄게 줄어든다',
        deltas: { health: 5, happiness: 2 },
        result: '더는 배를 부여잡고 우는 밤이 없어졌다.',
        requiresCondition: 'weak-stomach',
        removeCondition: 'weak-stomach'
      }
    ]
  },
  {
    id: 'infancy-6',
    name: '유아기',
    ageRange: '6세',
    intro: '초등학교 입학을 앞두고, 유아기의 마지막 한 해가 저뭅니다.',
    choices: [
      {
        id: 'early-reader',
        text: '한글을 스스로 뗀다',
        deltas: { fame: 3, happiness: 3 },
        result: '간판 글자를 하나씩 읽어내며 스스로도 뿌듯해했다.'
      },
      {
        id: 'separation-anxiety',
        text: '초등학교에 갈 날을 앞두고 있다',
        deltas: { happiness: -4, relationship: 3 },
        result: '새 학교 이야기만 나오면 표정이 어두워졌지만, 가족이 옆에서 다독여줬다.'
      },
      {
        id: 'neighborhood-fixture',
        text: '동네에서 모르는 사람이 없는 마당발 꼬마가 된다',
        deltas: { fame: 6, relationship: 2 },
        result: '골목을 지날 때마다 여기저기서 이름을 불러줬다.'
      },
      {
        id: 'family-event',
        text: '동생이 태어나 갑자기 형·누나·오빠·언니가 된다',
        deltas: { relationship: 5, happiness: -2, wealth: -3 },
        result: '축하할 일이었지만, 관심이 나눠지는 건 조금 낯설었다.',
        addFamilyMembers: [{ id: 'younger-sibling', label: '🧒 동생' }]
      },
      {
        id: 'big-move',
        text: '이사를 하며 낯선 동네에 적응해야 한다',
        deltas: { relationship: -4, wealth: 3 },
        result: '새 방은 마음에 들었지만, 옛 동네 친구들이 자꾸 눈에 밟혔다.'
      },
      {
        id: 'confident-starter',
        text: '입학이 마냥 기대되는 씩씩한 아이가 된다',
        deltas: { happiness: 5, fame: 2 },
        result: '새 책가방을 메고 거울 앞을 몇 번이나 서성였다.'
      },
      {
        id: 'jump-rope-habit',
        text: '매일 아침 줄넘기를 하는 습관을 들인다',
        deltas: { health: 4, happiness: 2 },
        result: '별거 아닌 습관 하나가 몸을 조금씩 단단하게 만들었다.'
      }
    ]
  },
  {
    id: 'elementary-7',
    name: '초등학생',
    ageRange: '7세',
    intro: '처음으로 또래들과 부대끼기 시작하는 시기. 학교 규칙, 시간표, 새 얼굴들 — 모든 게 낯설고 정신없습니다.',
    choices: [
      {
        id: 'school-rules-overwhelm',
        text: '학교 규칙과 시간표에 적응하느라 정신없이 보낸다',
        deltas: { happiness: -2, health: -2, relationship: 2 },
        result: '종이 울릴 때마다 뭘 해야 하는지 몰라 두리번거리던 3월이었다.'
      },
      {
        id: 'first-deskmate-bff',
        text: '짝꿍과 급속도로 단짝이 된다',
        deltas: { relationship: 6, happiness: 3 },
        result: '쉬는 시간마다 손을 잡고 화장실까지 같이 가던 사이.'
      },
      {
        id: 'always-raising-hand',
        text: '발표 시간마다 손을 번쩍 든다',
        deltas: { fame: 4, happiness: 2 },
        result: '틀려도 부끄럽지 않았던, 유일하게 용감했던 시기.'
      },
      {
        id: 'spelling-test-struggle',
        text: '받아쓰기 시험에서 자주 헤맨다',
        deltas: { happiness: -3, relationship: 2 },
        result: '틀린 글자에 동그라미가 잔뜩이었지만, 선생님은 그때마다 더 다정해졌다.'
      },
      {
        id: 'well-rounded',
        text: '반 친구들과 두루두루 무난하게 지낸다',
        deltas: { relationship: 5, happiness: 3 },
        result: '딱히 튀지도, 겉돌지도 않은 채로 1학년이 흘렀다.'
      },
      {
        id: 'clean-plate-club',
        text: '급식 반찬을 하나도 남기지 않으려 애쓴다',
        deltas: { health: 3, happiness: 1 },
        result: '싫어하는 반찬도 꾹 참고 삼키던, 나름의 첫 인내심 훈련.'
      }
    ]
  },
  {
    id: 'elementary-8',
    name: '초등학생',
    ageRange: '8세',
    intro: '학교가 조금은 익숙해진 만큼, 친구 관계도 한층 복잡해지기 시작합니다.',
    choices: [
      {
        id: 'playground-king',
        text: '운동장을 평정하는 골목대장으로 지낸다',
        deltas: { fame: 8, health: 4, relationship: -3 },
        result: '따르는 애들도, 눈치 보는 애들도 많았던 시절.'
      },
      {
        id: 'solo-creative',
        text: '혼자 그림 그리거나 책 읽는 걸 더 좋아한다',
        deltas: { happiness: 5, wealth: 2, relationship: -4 },
        result: '조용했지만, 그때 쌓은 상상력은 어른이 되어서도 종종 꺼내 쓰게 된다.'
      },
      {
        id: 'first-fight-and-makeup',
        text: '친구와 크게 싸운다',
        deltas: { relationship: 4, happiness: -2 },
        result: '평생 안 볼 것처럼 싸우고도, 다음 날이면 또 나란히 걷고 있었다.'
      },
      {
        id: 'seat-change-anxiety',
        text: '자리 바꾸는 날마다 잔뜩 긴장한다',
        deltas: { happiness: -2, relationship: 1 },
        result: '제비뽑기 하나에 그날의 기분이 통째로 좌우됐다.'
      },
      {
        id: 'hagwon-starts',
        text: '학원을 하나둘 다니기 시작한다',
        deltas: { wealth: -3, happiness: -1, fame: 1 },
        result: '놀이터에서 노는 시간이 그만큼 조용히 줄어들었다.'
      },
      {
        id: 'asthma-managed',
        text: '꾸준한 수영으로 어릴 적 천식을 관리한다',
        deltas: { health: 7, happiness: 3 },
        result: '가쁘게 몰아쉬던 숨이, 이제는 옛날이야기가 됐다.',
        requiresCondition: 'asthma',
        removeCondition: 'asthma'
      },
      {
        id: 'childhood-best-friend',
        text: '학교에서 마음이 잘 맞는 짝꿍과 급속도로 친해진다',
        deltas: { happiness: 3, relationship: 2 },
        result: '쉬는 시간마다 붙어 다니다 보니, 어느새 제일 친한 사이가 됐다.',
        addAcquaintance: { relation: 'friend', label: '🧑‍🤝‍🧑 친구' }
      }
    ]
  },
  {
    id: 'elementary-9',
    name: '초등학생',
    ageRange: '9세',
    intro: '취미와 특기가 하나둘 뚜렷해지는 시기. 좋아하는 게 무엇인지 스스로 알아가기 시작합니다.',
    choices: [
      {
        id: 'bookworm',
        text: '도서관에 파묻혀 사는 책벌레로 지낸다',
        deltas: { happiness: 4, wealth: 2, relationship: -3 },
        result: '친구는 적었지만, 책 속 세계만큼은 누구보다 넓었다.'
      },
      {
        id: 'arts-talent',
        text: '미술·음악 학원에서 남다른 재능을 보인다',
        deltas: { fame: 3, happiness: 3, wealth: -2 },
        result: '선생님이 부모님을 따로 불러 칭찬했던, 은근히 우쭐했던 기억.'
      },
      {
        id: 'youtube-binge',
        text: '유튜브에 빠져 하루 종일 영상만 본다',
        deltas: { happiness: 2, health: -3, relationship: -2 },
        result: '눈은 침침해졌지만, 그 시절 유행은 전부 꿰고 있었다.'
      },
      {
        id: 'first-pet',
        text: '반려동물을 키우기 시작한다',
        deltas: { happiness: 5, relationship: 3, wealth: -2 },
        result: '매일 밥 주고 산책시키는 일이 그렇게 뿌듯할 줄 몰랐다.'
      },
      {
        id: 'first-sleepover',
        text: '처음으로 친구 생일파티에 초대받아 밤새 논다',
        deltas: { happiness: 4, relationship: 4 },
        result: '잠도 안 자고 떠들었던 그 밤이, 오래도록 좋은 기억으로 남았다.'
      },
      {
        id: 'little-entrepreneur',
        text: '학교 앞에서 작은 장사(문구 되팔기 등)를 벌인다',
        deltas: { wealth: 7, fame: 2, relationship: -2 },
        result: '몇 백 원씩 모은 동전이 그때는 세상에서 제일 큰 재산 같았다.'
      }
    ]
  },
  {
    id: 'elementary-10',
    name: '초등학생',
    ageRange: '10세',
    intro: '몸도 마음도 슬슬 달라지기 시작하는 나이. 사춘기의 첫 신호가 은근슬쩍 찾아옵니다.',
    choices: [
      {
        id: 'competitive-athlete',
        text: '계주 대표로 뽑혀 매일 운동장을 뛴다',
        deltas: { health: 7, fame: 3, happiness: -2 },
        result: '손바닥의 굳은살이 그때는 훈장처럼 자랑스러웠다.'
      },
      {
        id: 'early-puberty-mood',
        text: '이유 없이 부쩍 예민해지는 날이 많아진다',
        deltas: { relationship: -3, happiness: -2, health: 1 },
        result: '왜 그러는지는 본인도 잘 몰랐던, 그런 시기였다.'
      },
      {
        id: 'first-crush',
        text: '처음으로 짝사랑을 경험한다',
        deltas: { happiness: 3, relationship: -1 },
        result: '별것도 아닌 눈맞춤 하나에 하루 종일 마음이 두근거렸다.'
      },
      {
        id: 'online-gaming-nights',
        text: '온라인 게임에 빠져 친구들과 밤늦게까지 접속한다',
        deltas: { happiness: 3, health: -4, relationship: 2 },
        result: '헤드셋 너머로 듣던 친구들 목소리가, 그 시절 가장 가까운 사이였다.'
      },
      {
        id: 'class-president-run',
        text: '전교 회장 선거에 나가본다',
        deltas: { fame: 6, relationship: -2, happiness: 2 },
        result: '떨어져도 후회는 없었다 — 단상에 서봤다는 것만으로 충분했다.'
      },
      {
        id: 'ankle-sprain-onset',
        text: '축구 경기 중 무리하게 몸을 던진다',
        deltas: { health: -4, relationship: 2 },
        result: '별거 아니라며 넘겼는데, 그 뒤로 가끔씩 시큰거렸다.',
        addCondition: { id: 'ankle-sprain', label: '🦶 발목 부상' }
      }
    ]
  },
  {
    id: 'elementary-11',
    name: '초등학생',
    ageRange: '11세',
    intro: '성적과 진로라는 단어가 슬슬 남 얘기가 아니게 되는 시기입니다.',
    choices: [
      {
        id: 'grade-sensitivity',
        text: '처음으로 성적표에 예민해지기 시작한다',
        deltas: { happiness: -4, wealth: -2 },
        result: '숫자 하나에 그날 저녁 집안 분위기가 통째로 바뀌었다.'
      },
      {
        id: 'dream-job-flip-flop',
        text: '장래희망이 자꾸 바뀐다',
        deltas: { happiness: 2, fame: 1 },
        result: '이번 주는 우주비행사, 다음 주는 요리사 — 그래도 꿈꾸는 건 즐거웠다.'
      },
      {
        id: 'class-officer-duty',
        text: '학급 임원을 맡아 책임감을 느낀다',
        deltas: { fame: 4, relationship: 3, happiness: -1 },
        result: '작은 완장 하나가 생각보다 무겁다는 걸 그때 처음 배웠다.'
      },
      {
        id: 'late-night-texting',
        text: '몰래 스마트폰으로 밤새 친구들과 채팅을 한다',
        deltas: { happiness: 3, health: -3, relationship: 2 },
        result: '이불 속 화면 불빛이 그 시절 가장 은밀한 즐거움이었다.'
      },
      {
        id: 'first-big-fight-with-parents',
        text: '부모님과 처음으로 크게 다툰다',
        deltas: { relationship: -5, happiness: -3 },
        result: '문을 쾅 닫고 들어간 방 안에서, 처음으로 혼자라는 기분을 느꼈다.'
      },
      {
        id: 'streamer-roleplay',
        text: '좋아하는 스트리머를 따라 방송 흉내를 내본다',
        deltas: { fame: 3, happiness: 3 },
        result: '카메라도 없는 방에서 혼자 떠들면서도 이상하게 신이 났다.'
      }
    ]
  },
  {
    id: 'elementary-12',
    name: '초등학생',
    ageRange: '12세',
    intro: '초등학교의 마지막 한 해. 졸업과 중학교 진학이 코앞으로 다가옵니다.',
    choices: [
      {
        id: 'yearbook-message',
        text: '졸업을 앞두고 문집에 남길 말을 오래 고민한다',
        deltas: { happiness: 2, relationship: 2 },
        result: '몇 마디 안 되는 문장을 쓰는 데 며칠이 걸렸다.'
      },
      {
        id: 'middle-school-assignment-nerves',
        text: '중학교 배정 결과에 촉각을 곤두세운다',
        deltas: { happiness: -2, relationship: 1 },
        result: '친구들과 같은 학교인지 아닌지가 세상에서 제일 중요한 문제였다.'
      },
      {
        id: 'final-talent-show-lead',
        text: '마지막 학예회 무대에서 주인공을 맡는다',
        deltas: { fame: 6, happiness: 4 },
        result: '커튼콜 때 쏟아진 박수 소리가 오래도록 귓가에 남았다.'
      },
      {
        id: 'separating-from-bff',
        text: '단짝과 다른 중학교에 배정된다',
        deltas: { relationship: -4, happiness: -3 },
        result: '"연락 끊지 말자"는 약속을 몇 번이고 주고받았다.'
      },
      {
        id: 'growth-spurt',
        text: '키가 부쩍 자라며 몸이 눈에 띄게 달라지기 시작한다',
        deltas: { health: 4, happiness: 1 },
        result: '작년에 산 교복 재킷 소매가 벌써 짧아졌다.'
      },
      {
        id: 'last-field-trip',
        text: '초등학교 마지막 소풍에서 반 전체와 어울려 논다',
        deltas: { relationship: 5, happiness: 4 },
        result: '별거 아닌 김밥 한 줄도, 그날따라 유난히 맛있었다.'
      }
    ]
  },
  {
    id: 'teen-13',
    name: '청소년기',
    ageRange: '13세',
    intro: '중학교에 입학하며 몸도 마음도 부쩍 낯설어지는 시기. 거울 속 내가 어제와 조금 달라 보입니다.',
    choices: [
      {
        id: 'voice-and-growth-spurt',
        text: '목소리가 갈라지거나 몸이 부쩍 자라며 낯설어진다',
        deltas: { health: 3, happiness: -2 },
        result: '거울에 비친 낯선 얼굴이 며칠 동안 어색했다.'
      },
      {
        id: 'first-real-exam-rank',
        text: '중학교 첫 시험에서 등수라는 걸 처음 실감한다',
        deltas: { happiness: -3, relationship: 1 },
        result: '숫자 하나로 줄 세워진다는 게 이렇게 초조한 일인 줄 몰랐다.'
      },
      {
        id: 'first-sns-account',
        text: 'SNS 계정을 처음 만들어 또래들과 소통한다',
        deltas: { fame: 4, relationship: 3, happiness: 1 },
        result: '프로필 사진 하나 고르는 데도 삼십 분이 걸렸다.'
      },
      {
        id: 'mirror-self-conscious',
        text: '거울 앞에서 외모에 부쩍 신경 쓰기 시작한다',
        deltas: { happiness: -2, wealth: -2 },
        result: '거울 앞에 서 있는 시간이 부쩍 길어졌다.'
      },
      {
        id: 'quiet-observer-newschool',
        text: '새 학교, 새 얼굴들 사이에서 조용히 관찰만 한다',
        deltas: { relationship: -2, happiness: 1 },
        result: '말은 별로 안 했지만, 누가 누구인지는 누구보다 빨리 파악했다.'
      },
      {
        id: 'mood-swings-surprise',
        text: '급격히 예민해진 감정 기복에 스스로도 당황한다',
        deltas: { relationship: -3, happiness: -2 },
        result: '왜 갑자기 눈물이 나는지 스스로도 설명할 수 없었다.'
      }
    ]
  },
  {
    id: 'teen-14',
    name: '청소년기',
    ageRange: '14세',
    intro: '친구 관계가 요동치고 스스로도 잘 모르겠는 감정이 많아지는 나이. 흔히 "중2병"이라 부르는 그 시기입니다.',
    choices: [
      {
        id: 'pushed-out-of-group',
        text: '친했던 무리에서 은근히 밀려나는 기분을 느낀다',
        deltas: { relationship: -5, happiness: -3 },
        result: '단톡방 알림이 줄어드는 걸 눈치채는 데 며칠이 걸렸다.'
      },
      {
        id: 'new-crew-new-persona',
        text: '새로운 친구 무리에 합류하며 완전히 다른 캐릭터로 지내본다',
        deltas: { relationship: 4, happiness: 2, fame: 2 },
        result: '전혀 다른 나로 살아보는 게 의외로 홀가분했다.'
      },
      {
        id: 'teacher-clashes',
        text: '선생님과 사사건건 부딪히는 반항기를 겪는다',
        deltas: { relationship: -3, fame: 3 },
        result: '옳고 그름을 떠나, 그냥 뭐든 반박하고 싶은 시기였다.'
      },
      {
        id: 'idol-fandom-splurge',
        text: '좋아하는 아이돌·스트리머에 푹 빠져 용돈을 쏟아붓는다',
        deltas: { happiness: 4, wealth: -5 },
        result: '용돈은 순식간에 굿즈로 바뀌었지만, 후회는 없었다.'
      },
      {
        id: 'locked-door-solitude',
        text: '혼자만의 세계에 깊이 몰입하며 방문을 걸어 잠근다',
        deltas: { happiness: 2, relationship: -4 },
        result: '문 하나만 닫으면 온전히 내 세상이 됐다.'
      },
      {
        id: 'follower-count-obsession',
        text: 'SNS 팔로워 수에 하루하루 일희일비한다',
        deltas: { fame: 3, happiness: -2 },
        result: '숫자 하나가 그렇게 크게 느껴진 적이 없었다.'
      },
      {
        id: 'acne-breakout-onset',
        text: '시험 스트레스를 야식으로 풀며 밤을 새운다',
        deltas: { health: -3, happiness: -3 },
        result: '거울을 볼 때마다 마음까지 덩달아 움츠러들었다.',
        addCondition: { id: 'acne-breakout', label: '🌱 스트레스성 트러블' }
      },
      {
        id: 'teen-crush-confession',
        text: '짝사랑하던 반 친구에게 용기 내어 마음을 고백한다',
        deltas: { happiness: 4, relationship: 3 },
        result: '심장이 터질 것 같던 그 몇 초가, 지금도 가장 선명한 기억으로 남아 있다.',
        addAcquaintance: { relation: 'crush', label: '💌 짝사랑' }
      }
    ]
  },
  {
    id: 'teen-15',
    name: '청소년기',
    ageRange: '15세',
    intro: '중학교의 마지막 해. 처음으로 "진로"라는 단어가 남 얘기가 아니게 됩니다.',
    choices: [
      {
        id: 'highschool-track-dilemma',
        text: '특성화고, 일반고 사이에서 처음으로 진로를 고민한다',
        deltas: { happiness: -3 },
        result: '선택지 하나하나가 인생을 통째로 바꿀 것처럼 무겁게 느껴졌다.'
      },
      {
        id: 'hagwon-marathon-begins',
        text: '밤늦게까지 학원을 도는 입시 레이스에 본격 합류한다',
        deltas: { wealth: -4, health: -3 },
        result: '집에 돌아오면 밤 11시, 그게 일상이 됐다.'
      },
      {
        id: 'club-activity-deepdive',
        text: '동아리 활동에 푹 빠져 실력을 키운다',
        deltas: { fame: 3, happiness: 3 },
        result: '성적표엔 안 나오지만, 그 시절 가장 자신 있던 건 이거였다.'
      },
      {
        id: 'confess-to-crush',
        text: '졸업을 앞두고 짝사랑 상대에게 고백해본다',
        deltas: { happiness: 3, relationship: 2 },
        result: '결과가 어떻든, 말하고 나니 속은 후련했다.'
      },
      {
        id: 'passion-over-grades',
        text: '성적보다 하고 싶은 걸 먼저 정하고 밀어붙인다',
        deltas: { happiness: 4, wealth: -2 },
        result: '남들 눈엔 무모해 보였지만, 후회는 하지 않았다.'
      },
      {
        id: 'allnight-cramming',
        text: '중학교 마지막 시험을 앞두고 밤새 벼락치기를 한다',
        deltas: { health: -4, happiness: -1 },
        result: '졸린 눈을 비비며 마신 커피믹스만 다섯 잔이었다.'
      }
    ]
  },
  {
    id: 'teen-16',
    name: '청소년기',
    ageRange: '16세',
    intro: '고등학교라는 새로운 세계로 첫발을 내딛는 시기. 교복도, 얼굴도, 규칙도 전부 낯섭니다.',
    choices: [
      {
        id: 'new-uniform-new-faces',
        text: '낯선 교복, 낯선 얼굴들 사이에서 다시 적응기를 겪는다',
        deltas: { happiness: -2, relationship: 1 },
        result: '교복 하나 걸쳤을 뿐인데, 완전히 다른 사람이 된 기분이었다.'
      },
      {
        id: 'club-and-council-active',
        text: '동아리·학생회 활동에 적극적으로 뛰어든다',
        deltas: { fame: 5, relationship: 3, happiness: -1 },
        result: '회의 준비로 밤을 새는 날도 이상하게 뿌듯했다.'
      },
      {
        id: 'grade-competition-tension',
        text: '내신 경쟁이 본격화되며 친구 사이에도 미묘한 긴장이 생긴다',
        deltas: { relationship: -3, wealth: -2 },
        result: '같이 밥 먹던 친구가 문득 경쟁자처럼 느껴지는 순간들이 있었다.'
      },
      {
        id: 'first-highschool-romance',
        text: '처음 사귄 남자친구·여자친구와 풋풋한 연애를 시작한다',
        deltas: { happiness: 5, relationship: 3, wealth: -2 },
        result: '쉬는 시간마다 문자 하나에 마음이 오르락내리락했다.'
      },
      {
        id: 'caught-slacking-nightstudy',
        text: '야간자율학습 시간에 몰래 딴짓을 하다 걸린다',
        deltas: { happiness: 2, relationship: -1 },
        result: '선생님한테 걸린 순간 심장이 내려앉았지만, 나중엔 웃긴 추억이 됐다.'
      },
      {
        id: 'sports-day-star',
        text: '체육대회에서 반 대표로 활약하며 존재감을 알린다',
        deltas: { fame: 6, health: 3 },
        result: '이겨서라기보다, 반 전체가 한마음이 됐던 그 하루가 오래 남았다.',
        requiresNoCondition: ['ankle-sprain']
      },
      {
        id: 'wrist-sprain-onset',
        text: '체육대회 계주에서 무리하게 힘을 준다',
        deltas: { health: -4, relationship: 2 },
        result: '붕대를 감은 손목이 며칠 동안 필기를 방해했다.',
        addCondition: { id: 'wrist-sprain', label: '🤕 손목 부상' }
      },
      {
        id: 'acne-breakout-heal',
        text: '피부과 치료를 꾸준히 받아 트러블이 눈에 띄게 가라앉는다',
        deltas: { health: 4, happiness: 3, wealth: -2 },
        result: '거울 보는 시간이 다시 편해지기까지 꽤 오래 걸렸다.',
        requiresCondition: 'acne-breakout',
        removeCondition: 'acne-breakout'
      },
      {
        id: 'fame-mocked-among-friends',
        text: '친구들 앞에서 SNS 게시물이 놀림거리가 되며 창피를 당한다',
        deltas: { fame: -6, happiness: -4 },
        result: '지우고 또 지워봐도, 이미 다 본 사람들 앞에서는 소용없었다.'
      }
    ]
  },
  {
    id: 'teen-17',
    name: '청소년기',
    ageRange: '17세',
    intro: '진로와 성적이 본격적으로 무게를 갖기 시작하는 나이. 하루하루가 조금씩 빠듯해집니다.',
    choices: [
      {
        id: 'track-choice-future',
        text: '문·이과(혹은 진로 트랙)를 선택하며 본격적으로 미래를 그려본다',
        deltas: { happiness: -2, wealth: -1 },
        result: '펜 끝이 향한 방향이, 이후 몇 년의 방향을 정했다.'
      },
      {
        id: 'mock-exam-rollercoaster',
        text: '모의고사 성적에 일희일비하는 나날이 이어진다',
        deltas: { happiness: -4, health: -2 },
        result: '성적표 봉투를 뜯기 전 숨을 크게 들이쉬는 게 습관이 됐다.'
      },
      {
        id: 'broadcast-club-passion',
        text: '방송반·학보사 등에서 하고 싶은 걸 먼저 찾아 나선다',
        deltas: { fame: 4, happiness: 3 },
        result: '카메라 뒤든 앞이든, 그 시간만큼은 온전히 즐거웠다.'
      },
      {
        id: 'first-part-time-job',
        text: '친구와 함께 처음으로 아르바이트를 시작한다',
        deltas: { wealth: 5, health: -2 },
        result: '첫 월급을 받던 날, 통장 잔고보다 뿌듯함이 더 컸다.'
      },
      {
        id: 'parents-friction-examstress',
        text: '입시 스트레스로 부모님과 자주 부딪힌다',
        deltas: { relationship: -4, happiness: -2 },
        result: '서로 사랑해서 더 날카로워지는 말들이 있다는 걸 그때 알았다.'
      },
      {
        id: 'skip-study-sneak-out',
        text: '야자를 땡땡이치고 친구들과 몰래 놀러 나간다',
        deltas: { happiness: 4, relationship: 3, wealth: -2 },
        result: '들키면 큰일이라는 걸 알면서도, 그 밤바람이 유독 달았다.'
      },
      {
        id: 'exam-stress-gastritis-onset',
        text: '입시 스트레스로 끼니를 거르거나 폭식을 반복한다',
        deltas: { health: -5, happiness: -2 },
        result: '책상 서랍엔 어느새 소화제가 상비약처럼 자리 잡았다.',
        addCondition: { id: 'exam-stress-gastritis', label: '🤒 스트레스성 위염' }
      }
    ]
  },
  {
    id: 'teen-18',
    name: '청소년기',
    ageRange: '18세',
    intro: '고등학교의 마지막 해. 수능과 졸업이라는 두 단어가 하루하루를 채웁니다.',
    choices: [
      {
        id: 'suneung-weight',
        text: '수능이라는 단어 하나에 하루하루가 짓눌린다',
        deltas: { happiness: -5, health: -4 },
        result: '달력의 D-day 숫자가 매일 줄어드는 걸 보는 게 곤욕이었다.'
      },
      {
        id: 'no-retake-determination',
        text: '재수 없이 한 번에 원하는 결과를 내겠다며 이를 악문다',
        deltas: { health: -3, wealth: -2 },
        result: '딱 한 번뿐이라는 생각이, 오히려 이를 악물게 만들었다.'
      },
      {
        id: 'senior-festival-blowout',
        text: '고3 마지막 축제에서 반 전체와 마음껏 논다',
        deltas: { happiness: 5, relationship: 4 },
        result: '공부 얘기는 잠깐 잊고, 그냥 다 같이 웃고 떠들었다.'
      },
      {
        id: 'early-admission-choice',
        text: '수시 원서를 쓰며 진로를 스스로 결정짓는다',
        deltas: { happiness: 2, wealth: -2 },
        result: '원서에 적어 낸 몇 글자가, 앞으로의 몇 년을 결정지었다.'
      },
      {
        id: 'graduation-day-tears',
        text: '졸업식 날, 그동안의 시간을 돌아보며 울컥한다',
        deltas: { relationship: 3, happiness: 2 },
        result: '울지 않으려 했는데, 교문을 나서는 순간 결국 눈물이 났다.'
      },
      {
        id: 'postexam-first-job',
        text: '시험이 끝나자마자 아르바이트로 첫 사회 경험을 쌓는다',
        deltas: { wealth: 6, health: -2 },
        result: '시험만 끝나면 다 끝날 줄 알았는데, 새로운 시작이 기다리고 있었다.'
      },
      {
        id: 'wrist-sprain-heal',
        text: '다 나은 손목으로 홀가분하게 시험장에 들어간다',
        deltas: { health: 5, happiness: 2 },
        result: '이제야 마음 편히 답안지에 마킹할 수 있었다.',
        requiresCondition: 'wrist-sprain',
        removeCondition: 'wrist-sprain'
      },
      {
        id: 'exam-stress-gastritis-heal',
        text: '수능이 끝나자마자 위염이 거짓말처럼 가라앉는다',
        deltas: { health: 6, happiness: 3 },
        result: '몸이 먼저 알고 있었다 — 이제 정말 끝났다는 걸.',
        requiresCondition: 'exam-stress-gastritis',
        removeCondition: 'exam-stress-gastritis'
      },
      {
        id: 'relationship-friend-falling-out',
        text: '친했던 친구와 사소한 오해로 틀어진다',
        deltas: { relationship: -8, happiness: -3 },
        result: '먼저 연락해볼까 몇 번을 망설이다, 결국 그러지 못했다.'
      },
      {
        id: 'fame-viral-video-18',
        text: '우연히 찍은 영상이 학교 밖까지 퍼진다',
        deltas: { fame: 5, happiness: 1 },
        result: '몰라보는 사람들이 아는 척을 해오자, 얼떨떨하면서도 신기했다.'
      },
      {
        id: 'fame-embarrassing-moment-18',
        text: '실수한 순간이 온라인에서 놀림거리가 된다',
        deltas: { fame: -4, happiness: -4 },
        result: '몇 번을 지워도, 캡처는 어딘가에서 계속 돌아다녔다.'
      },
      {
        id: 'fame-school-celebrity-18',
        text: '교내에서 유명 인사 취급을 받는다',
        deltas: { fame: 3, relationship: 1 },
        result: '복도를 걸을 때마다 쏟아지는 시선이, 아직은 낯설었다.'
      },
      {
        id: 'fame-rumor-spread-18',
        text: '근거 없는 소문이 SNS에서 퍼진다',
        deltas: { fame: -3, happiness: -3 },
        result: '해명 글을 올려도, 소문은 이미 저만치 앞서 달려가고 있었다.'
      },
      {
        id: 'fame-contest-recognition-18',
        text: '교내 대회에서 두각을 나타내며 이름이 알려진다',
        deltas: { fame: 4, happiness: 2 },
        result: '낯선 후배들이 먼저 알은체를 해오는 게, 나쁘지 않았다.'
      },
      {
        id: 'fame-overshadowed-18',
        text: '더 눈에 띄는 친구들 사이에서 존재감이 옅어진다',
        deltas: { fame: -2, happiness: -2 },
        result: '딱히 잘못한 것도 없는데, 자꾸 뒷전으로 밀리는 기분이었다.'
      }
    ]
  },
  {
    id: 'twenties-19',
    name: '스무 살',
    ageRange: '19세',
    intro: '인생의 첫 갈림길. 대학과 방송, 혹은 곧장 돈이 되는 길 — 스무 살의 선택은 이후 모든 걸 조금씩 흔들어놓습니다.',
    choices: [
      {
        id: 'college',
        text: '무난하게 대학에 진학해 학점을 관리한다',
        deltas: { wealth: 5, health: 3, fame: -2 },
        result: '특별할 것 없는 4년이었지만, 졸업장은 훗날 여러 번 방패가 돼줬다.'
      },
      {
        id: 'streaming-debut',
        text: '다니던 학교를 관두고 방송을 시작해본다',
        deltas: { fame: 12, wealth: -6, health: -4, happiness: 4 },
        result: '통장은 늘 아슬아슬했지만, 카메라 앞에 있는 순간만큼은 살아있는 기분이었다.'
      },
      {
        id: 'trade-skill',
        text: '바로 돈이 되는 기술을 배워 취업 전선에 뛰어든다',
        deltas: { wealth: 8, happiness: -3, relationship: -2 },
        result: '또래보다 몇 년 빨리 사회에 들어섰다는 자부심, 그리고 그만큼 빨리 늙는 기분.',
        setOccupation: { id: 'tech-worker', label: '🔧 기술직 사원' }
      },
      {
        id: 'startup-gamble',
        text: '친구들과 의기투합해 작은 창업에 뛰어든다',
        deltas: { wealth: -5, fame: 4, happiness: 3, health: -3 },
        result: '성공이라 부르기도, 실패라 부르기도 애매한 자리에서 스무 살의 여름이 다 갔다.',
        setOccupation: { id: 'startup-founder', label: '🚀 초기 창업가' }
      },
      {
        id: 'working-holiday',
        text: '훌쩍 해외로 워킹홀리데이를 떠난다',
        deltas: { wealth: -4, happiness: 6, relationship: -5, health: 2 },
        result: '낯선 언어 속에서 오히려 나 자신과 더 친해진 1년이었다.'
      },
      {
        id: 'family-support',
        text: '집안 사정으로 스무 살부터 생계를 돕는다',
        deltas: { wealth: 4, happiness: -5, relationship: 3, health: -2 },
        result: '또래들의 스무 살과는 조금 다른 방식으로 어른이 되어갔다.'
      },
      {
        id: 'ankle-treated',
        text: '미뤄뒀던 발목을 제대로 병원에서 치료받는다',
        deltas: { health: 5, wealth: -3 },
        result: '진작 왔어야 했다는 의사 말에 뜨끔했지만, 발목은 한결 가벼워졌다.',
        requiresCondition: 'ankle-sprain',
        removeCondition: 'ankle-sprain'
      },
      {
        id: 'civil-servant-exam',
        text: '안정성을 좇아 공무원 시험에 매달린다',
        deltas: { wealth: 2, happiness: 3 },
        result: '합격자 명단에서 내 이름을 확인한 순간, 몇 년의 수험 생활이 스쳐 지나갔다.',
        setOccupation: { id: 'civil-servant', label: '🏛️ 공무원' },
        mandatory: true
      },
      {
        id: 'logistics-center-job',
        text: '물류센터에 취업해 몸으로 뛰는 일을 시작한다',
        deltas: { wealth: 3, health: -2 },
        result: '하루 종일 걷고 나르는 일이었지만, 첫 월급의 무게는 그만큼 묵직했다.',
        setOccupation: { id: 'logistics-worker', label: '🚚 물류직' },
        mandatory: true
      },
      {
        id: 'first-blind-date',
        text: '소개팅에서 마음이 통하는 상대를 만난다',
        deltas: { happiness: 4, relationship: 4 },
        result: '몇 마디 나누지도 않았는데, 다음이 궁금해지는 사람이었다.',
        addAcquaintance: { relation: 'lover', label: '💕 연인' }
      }
    ]
  },
  {
    id: 'twenties-20',
    name: '스무 살',
    ageRange: '20세',
    intro: '갓 어른이 된 티가 조금씩 빠지는 나이. 독립과 자유가 생각보다 훨씬 손이 많이 간다는 걸 알아갑니다.',
    choices: [
      {
        id: 'move-out-independence',
        text: '본가를 떠나 자취를 시작한다',
        deltas: { wealth: -4, happiness: 3, relationship: -2 },
        result: '부모님과의 통금 없는 삶이 이렇게 홀가분할 줄 몰랐다.'
      },
      {
        id: 'deep-community-belonging',
        text: '동아리·팬덤 등 새로운 공동체에 깊이 소속된다',
        deltas: { relationship: 5, happiness: 3 },
        result: '비슷한 걸 좋아하는 사람들 틈에서 처음으로 완전히 스며든 기분이었다.'
      },
      {
        id: 'juggling-part-time-jobs',
        text: '생활비를 벌기 위해 여러 알바를 전전한다',
        deltas: { wealth: 4, health: -3 },
        result: '시급 몇 백 원 차이에 마음이 오가던 시절이었다.'
      },
      {
        id: 'blind-date-scene',
        text: '미팅·소개팅에 나가며 연애 시장에 뛰어든다',
        deltas: { happiness: 3, relationship: 2 },
        result: '몇 번의 어색한 첫 만남 끝에, 사람 보는 눈이 조금씩 늘었다.'
      },
      {
        id: 'metrics-anxiety',
        text: '학점·구독자 수 등 성과 지표에 예민해진다',
        deltas: { happiness: -3, fame: 2 },
        result: '숫자 하나에 하루 기분이 좌우되는 게 이상하다는 걸 알면서도 멈출 수 없었다.'
      },
      {
        id: 'lifestyle-collapse',
        text: '자유로워진 만큼 생활 패턴이 크게 바뀐다',
        deltas: { health: -4, happiness: 2 },
        result: '새벽에 자고 오후에 일어나는 게 어느새 당연해졌다.'
      },
      {
        id: 'back-pain-onset',
        text: '무거운 짐 나르는 알바를 몸 상태와 상관없이 계속한다',
        deltas: { health: -4, wealth: 3 },
        result: '택배 상자를 나르던 어느 날부터, 허리가 삐걱대기 시작했다.',
        addCondition: { id: 'back-pain', label: '🦴 허리 통증' }
      },
      {
        id: 'fame-first-content-backlash',
        text: '처음 올린 콘텐츠에 악플이 쏟아진다',
        deltas: { fame: -7, happiness: -5 },
        result: '댓글창을 닫을까 수십 번 고민했다.'
      },
      {
        id: 'small-business-startup',
        text: '작은 가게를 차려 자영업을 시작한다',
        deltas: { wealth: -5, happiness: 3 },
        result: '내 손으로 켠 첫 간판 불빛이, 생각보다 오래 눈에 밟혔다.',
        setOccupation: { id: 'small-business-owner', label: '🏪 자영업자' },
        mandatory: true
      },
      {
        id: 'pursuing-artist-path',
        text: '작가·화가로 전업해 창작 활동에 뛰어든다',
        deltas: { wealth: -4, happiness: 4 },
        result: '벌이는 불안정했지만, 처음으로 "내 일"을 한다는 느낌이 들었다.',
        setOccupation: { id: 'artist-writer', label: '🎨 예술가' },
        mandatory: true
      },
      {
        id: 'lottery-buy-20',
        text: '친구들과 의기투합해 로또를 사본다',
        deltas: { happiness: 1 },
        result: '번호를 고르고 나니, 괜히 기분이 들떴다.',
        addAsset: { id: 'lottery-ticket', label: '🎟️ 복권', type: 'movable' }
      },
      {
        id: 'lottery-skip-20',
        text: '돈이 아깝다는 생각에 그냥 지나친다',
        deltas: { happiness: 1 },
        result: '쓸데없는 데 돈 쓸 뻔했다며 스스로를 다독였다.'
      },
      {
        id: 'college-club-friend',
        text: '동아리 활동을 하다 마음 맞는 친구를 새로 사귄다',
        deltas: { happiness: 2, relationship: 3 },
        result: '몇 번 밤새 작업을 같이 하고 나니, 말하지 않아도 통하는 사이가 됐다.',
        addAcquaintance: { relation: 'friend', label: '🧑‍🤝‍🧑 친구' }
      }
    ]
  },
  {
    id: 'twenties-21',
    name: '스무 살',
    ageRange: '21세',
    intro: '방향을 조금씩 좁혀가는 나이. 막연했던 미래가 서서히 구체적인 모양을 갖추기 시작합니다.',
    choices: [
      {
        id: 'stacking-credentials',
        text: '복수전공·자격증 등으로 스펙을 본격적으로 쌓기 시작한다',
        deltas: { happiness: -1, fame: 2, wealth: -2 },
        result: '자격증 하나 딸 때마다, 뭔가 되어가는 기분이 들었다.'
      },
      {
        id: 'gap-year-trip',
        text: '휴학하고 훌쩍 장기 여행을 떠난다',
        deltas: { wealth: -6, happiness: 6 },
        result: '통장은 텅 비었지만, 그 몇 달이 평생 곱씹을 이야깃거리가 됐다.'
      },
      {
        id: 'building-portfolio',
        text: '본격적으로 콘텐츠·포트폴리오를 만들며 커리어를 준비한다',
        deltas: { fame: 3, wealth: -2, happiness: 2 },
        result: '밤새 만든 결과물을 올리는 순간마다 손끝이 떨렸다.'
      },
      {
        id: 'comparing-to-peers',
        text: '동기들과 나를 계속 비교하게 된다',
        deltas: { happiness: -4, relationship: -1 },
        result: 'SNS 속 남들의 속도에 자꾸만 내 속도를 맞춰보게 됐다.'
      },
      {
        id: 'leading-small-team',
        text: '작은 프로젝트·창업 동아리에서 팀을 이끈다',
        deltas: { fame: 4, relationship: 2, happiness: -1 },
        result: '처음 맡아본 "팀장"이라는 자리가 생각보다 무거웠다.'
      },
      {
        id: 'serious-relationship-talk',
        text: '만나던 사람과 진지하게 미래를 이야기한다',
        deltas: { relationship: 5, happiness: 2 },
        result: '미래를 함께 그려본다는 게, 설레면서도 조금 무서웠다.'
      },
      {
        id: 'sudden-accident-injury',
        text: '급하게 무단횡단을 한다',
        deltas: { health: -15, happiness: -8, wealth: -5 },
        result: '눈을 떴을 때는 이미 병실 천장이었다. 예전과 똑같은 몸으로는 돌아갈 수 없다는 말을, 몇 번이고 곱씹어야 했다.',
        addCondition: { id: 'accident-aftereffects', label: '🩹 사고 후유증', blocksHealthRecovery: true }
      },
      {
        id: 'teacher-certification',
        text: '임용고시를 치르고 교단에 선다',
        deltas: { wealth: 2, relationship: 3 },
        result: '첫 수업 시간, 목소리가 떨리는 걸 애써 감췄다.',
        setOccupation: { id: 'teacher', label: '📚 교사' },
        mandatory: true
      },
      {
        id: 'healthcare-worker-job',
        text: '간호사·의료직으로 취업해 병원에서 일하기 시작한다',
        deltas: { wealth: 3, health: -3 },
        result: '3교대 근무는 고됐지만, 누군가를 돕는다는 실감이 매일 있었다.',
        setOccupation: { id: 'healthcare-worker', label: '🏥 의료직' },
        mandatory: true
      },
      {
        id: 'lottery-check-21',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'twenties-22',
    name: '스무 살',
    ageRange: '22세',
    intro: '현실과 제대로 부딪히기 시작하는 나이. 이상과 실전 사이의 간극을 몸으로 배웁니다.',
    choices: [
      {
        id: 'harsh-internship-reality',
        text: '첫 인턴십에서 현실을 마주한다',
        deltas: { happiness: -4, wealth: 2 },
        result: '이상과 현실 사이의 거리를 온몸으로 배운 몇 달이었다.'
      },
      {
        id: 'rejection-streak',
        text: '면접에서 줄줄이 떨어진다',
        deltas: { happiness: -5, relationship: 2 },
        result: '탈락 메일함이 늘어갈수록, 자신감도 조금씩 깎여나갔다.'
      },
      {
        id: 'unexpected-career-offer',
        text: '우연한 기회로 예상 못한 진로 제안을 받는다',
        deltas: { fame: 3, wealth: 3 },
        result: '전혀 예상 못한 곳에서 문 하나가 갑자기 열렸다.',
        setOccupation: { id: 'career-changer', label: '✨ 진로 전환' }
      },
      {
        id: 'pushing-past-limits',
        text: '체력이 바닥날 때까지 스스로를 몰아붙인다',
        deltas: { health: -5, wealth: 3 },
        result: '쓰러지고 나서야 몸이 보내던 신호들을 되짚어봤다.'
      },
      {
        id: 'friends-drifting-apart',
        text: '친구들과의 관계가 각자의 바쁜 일상 속에 뜸해진다',
        deltas: { relationship: -4, happiness: -1 },
        result: '단톡방은 그대로인데, 대화는 점점 줄어들었다.'
      },
      {
        id: 'small-joys-gratitude',
        text: '작은 성취 하나에도 의미를 두기 시작한다',
        deltas: { happiness: 5, relationship: 2 },
        result: '커피 한 잔의 여유에도 진심으로 행복해질 수 있다는 걸 알게 됐다.'
      },
      {
        id: 'burnout-onset',
        text: '인턴 생활 내내 야근과 철야를 반복한다',
        deltas: { health: -6, happiness: -4 },
        result: '인턴 생활에 몸과 마음을 갈아 넣다 어느 순간 완전히 방전됐다.',
        addCondition: { id: 'burnout-syndrome', label: '🔥 번아웃 증후군' }
      },
      {
        id: 'back-pain-heal',
        text: '필라테스·운동을 꾸준히 하며 허리를 관리한다',
        deltas: { health: 5, wealth: -2 },
        result: '필라테스를 꾸준히 다니고 나서야, 허리가 예전 같아졌다.',
        requiresCondition: 'back-pain',
        removeCondition: 'back-pain'
      },
      {
        id: 'relationship-betrayed-by-close-one',
        text: '가까운 사람과의 관계에 균열이 생긴다',
        deltas: { relationship: -10, happiness: -5 },
        result: '믿었던 만큼, 그 자리가 텅 빈 것처럼 느껴졌다.'
      },
      {
        id: 'public-corp-hire',
        text: '공기업 공채에 지원해 결과를 기다린다',
        deltas: { wealth: 4, happiness: 3 },
        result: '치열한 경쟁을 뚫었다는 사실이, 한동안 실감 나지 않았다.',
        setOccupation: { id: 'public-corp-employee', label: '🏢 공기업 직원' },
        mandatory: true
      },
      {
        id: 'sales-rep-job',
        text: '영업직으로 입사해 실적 압박 속에 뛰어든다',
        deltas: { wealth: 4, happiness: -2 },
        result: '첫 계약을 따낸 날의 짜릿함이, 그 뒤의 압박감을 잠시 잊게 했다.',
        setOccupation: { id: 'sales-rep', label: '💼 영업직' },
        mandatory: true
      },
      {
        id: 'startup-founder-investment',
        text: '투자 유치에 나서 사업을 키워본다',
        deltas: { wealth: 8, fame: 3 },
        result: '통장에 찍힌 투자금을 보며, 이제 진짜 시작이라는 걸 실감했다.',
        requiresOccupation: ['startup-founder']
      }
    ]
  },
  {
    id: 'twenties-23',
    name: '스무 살',
    ageRange: '23세',
    intro: '스무 살대의 마지막 해. 자립이라는 단어가 더는 남 얘기가 아니게 됩니다.',
    choices: [
      {
        id: 'first-full-time-contract',
        text: '첫 정규직 계약서에 서명한다',
        deltas: { wealth: 6, happiness: 3 },
        result: '계약서에 서명하는 손이 미세하게 떨렸다.',
        setOccupation: { id: 'office-worker', label: '💼 정규직 직장인' },
        mandatory: true
      },
      {
        id: 'self-sufficient-living',
        text: '독립적인 생계를 스스로 책임지기 시작한다',
        deltas: { wealth: 3, relationship: -2, happiness: 1 },
        result: '월급이 통장을 스쳐 지나가는 속도에 새삼 놀랐다.'
      },
      {
        id: 'letter-to-nineteen',
        text: '그동안의 선택을 돌아보며 스무 살의 나에게 편지를 써본다',
        deltas: { happiness: 4, relationship: 2 },
        result: '그때는 몰랐던 것들이, 이제는 조금씩 보이기 시작했다.'
      },
      {
        id: 'reconnect-old-friend',
        text: '오랜 친구와 크게 멀어졌다가 다시 연락이 닿는다',
        deltas: { relationship: 5, happiness: 3 },
        result: '몇 년 만의 연락인데도, 어제 본 것처럼 자연스러웠다.'
      },
      {
        id: 'setting-new-goals',
        text: '다가올 서른을 준비하며 새로운 목표를 세운다',
        deltas: { happiness: 2, fame: 1 },
        result: '서른이라는 숫자가 두렵기보다, 조금 궁금해지기 시작했다.'
      },
      {
        id: 'quarter-life-crisis',
        text: '문득 "이대로 괜찮은가" 하는 생각이 든다',
        deltas: { happiness: -4, relationship: -1 },
        result: '잘 살고 있다는 확신이 문득 흔들리는 밤들이 있었다.'
      },
      {
        id: 'burnout-heal',
        text: '충분히 쉬며 페이스를 되찾으려 한다',
        deltas: { health: 6, happiness: 4, wealth: -3 },
        result: '충분히 쉬고 나서야, 다시 뭔가를 시작할 힘이 생겼다.',
        requiresCondition: 'burnout-syndrome',
        removeCondition: 'burnout-syndrome'
      },
      {
        id: 'new-job-close-colleague',
        text: '입사 초기, 유독 마음이 맞는 동료가 생긴다',
        deltas: { happiness: 2, relationship: 3 },
        result: '낯설던 사무실에서, 유독 편하게 말을 붙일 수 있는 사람이 생겼다.',
        requiresAnyOccupation: true,
        addAcquaintance: { relation: 'colleague', label: '💼 동료' }
      }
    ]
  },
  {
    id: 'rookie-24',
    name: '사회 초년생',
    ageRange: '24세',
    intro: '조직이든 방송판이든, 어엿한 한 사람 몫을 해내야 하는 첫 해. "신입"이라는 이름표가 아직은 낯섭니다.',
    choices: [
      {
        id: 'learning-the-ropes',
        text: '신입 딱지를 떼려 필사적으로 배운다',
        deltas: { happiness: -2, fame: 2, wealth: 2 },
        result: '메모장 하나가 너덜너덜해질 때까지 모든 걸 적었다.',
        requiresAnyOccupation: true
      },
      {
        id: 'scolded-by-mentor',
        text: '사수·선배에게 혼나며 하나씩 배워간다',
        deltas: { relationship: 2, happiness: -3 },
        result: '혼나는 것도 배우는 과정이라는 말을, 그땐 몰랐다.'
      },
      {
        id: 'first-team-dinner',
        text: '첫 회식 자리에서 조직 문화에 적응한다',
        deltas: { relationship: 4, health: -2 },
        result: '낯선 얼굴들 사이에서 웃는 법부터 다시 배웠다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'first-paycheck-for-parents',
        text: '월급을 받고 처음으로 부모님께 용돈을 드린다',
        deltas: { happiness: 4, relationship: 3, wealth: -3 },
        result: '봉투를 내미는 손이 뿌듯함으로 살짝 떨렸다.'
      },
      {
        id: 'confidence-crushed',
        text: '업무 실수로 크게 깨지고 자신감을 잃는다',
        deltas: { happiness: -5, relationship: -1 },
        result: '그날 밤은 유독 천장이 낯설게 느껴졌다.',
        requiresAnyOccupation: true
      },
      {
        id: 'rookie-camaraderie',
        text: '동기들과 끈끈한 생존 동료애를 쌓는다',
        deltas: { relationship: 5, happiness: 3 },
        result: '다 같이 신입이라는 이유 하나로 뭉쳤던 시절.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'fame-colleague-expose-damages-image',
        text: '믿었던 동료의 폭로로 이미지에 큰 타격을 입는다',
        deltas: { fame: -9, relationship: -3 },
        result: '사실이 아니라고 말해도, 이미 퍼진 이야기는 잘 지워지지 않았다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'logistics-peak-season-overload',
        text: '물량이 폭주하는 시즌에 몸이 남아나지 않는다',
        deltas: { health: -6 },
        result: '컨베이어 벨트처럼, 하루하루가 멈추지 않고 흘러갔다.',
        requiresOccupation: ['logistics-worker']
      }
    ]
  },
  {
    id: 'rookie-25',
    name: '사회 초년생',
    ageRange: '25세',
    intro: '일이 조금씩 손에 익기 시작하는 해. 그만큼 다른 고민들도 하나둘 고개를 듭니다.',
    choices: [
      {
        id: 'work-becomes-easier',
        text: '어느 정도 일이 손에 익어간다',
        deltas: { happiness: 3, fame: 1 },
        result: '이제야 주변을 둘러볼 여유가 조금 생겼다.'
      },
      {
        id: 'job-change-consideration',
        text: '더 나은 조건을 찾아 이직을 진지하게 고민한다',
        deltas: { fame: 2, happiness: -2 },
        result: '채용 공고 창을 몰래 켜두는 날이 늘었다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'overtime-recognition',
        text: '밤낮없이 야근하며 성과를 보고한다',
        deltas: { wealth: 4, health: -4, fame: 2 },
        result: '인정받는 기쁨과 몸이 축나는 속도가 나란히 갔다.',
        requiresAnyOccupation: true
      },
      {
        id: 'preburnout-escape-trip',
        text: '번아웃 직전, 훌쩍 짧은 퇴사 여행을 다녀온다',
        deltas: { happiness: 5, wealth: -3 },
        result: '퇴사는 아니었지만, 며칠은 온전히 도망쳤다.',
        requiresAnyOccupation: true
      },
      {
        id: 'office-romance',
        text: '회사 사람과 사내 연애를 시작한다',
        deltas: { happiness: 4, relationship: 3 },
        result: '비밀 연애의 스릴이 은근히 재밌었다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'sns-comparison-fatigue',
        text: 'SNS 속 친구들의 화려한 삶과 나를 자꾸 비교한다',
        deltas: { happiness: -4, relationship: -1 },
        result: '남의 하이라이트와 내 일상을 비교하는 게 부질없다는 걸 알면서도 멈추지 못했다.'
      },
      {
        id: 'carpal-tunnel-onset',
        text: '쉬는 시간 없이 매일 키보드·마우스 작업을 반복한다',
        deltas: { health: -4, wealth: 2 },
        result: '타이핑을 칠 때마다 손끝이 찌릿하게 저려왔다.',
        addCondition: { id: 'carpal-tunnel', label: '✋ 손목터널증후군' }
      },
      {
        id: 'tech-new-equipment-manual',
        text: '새로운 장비·기술을 익히느라 매뉴얼과 밤새 씨름한다',
        deltas: { happiness: -2, wealth: 2 },
        result: '두꺼운 매뉴얼을 다 외울 즈음에야, 손이 저절로 움직이기 시작했다.',
        requiresOccupation: ['tech-worker']
      },
      {
        id: 'small-biz-sales-booming',
        text: '장사가 잘돼 매출이 눈에 띄게 는다',
        deltas: { wealth: 6, happiness: 3 },
        result: '문 닫을 때 세는 매출이, 요즘 들어 유독 든든했다.',
        requiresOccupation: ['small-business-owner']
      },
      {
        id: 'lottery-check-25',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      },
      {
        id: 'adult-crush-confession',
        text: '오래 마음에 품고 있던 상대에게 고백한다',
        deltas: { happiness: 3, relationship: 3 },
        result: '오래 망설인 만큼, 말을 뱉고 난 순간은 오히려 담담했다.',
        addAcquaintance: { relation: 'crush', label: '💌 짝사랑' }
      }
    ]
  },
  {
    id: 'rookie-26',
    name: '사회 초년생',
    ageRange: '26세',
    intro: '독립과 재테크라는 현실적인 단어들이 성큼 다가오는 해입니다.',
    choices: [
      {
        id: 'apartment-hunting',
        text: '전셋집을 구하려 발품을 팔며 부동산을 알아본다',
        deltas: { wealth: -3, happiness: -1 },
        result: '계약서 도장 하나 찍는 데 이렇게 긴장될 줄 몰랐다.'
      },
      {
        id: 'first-investment-steps',
        text: '적금·투자를 시작하며 처음으로 재테크에 눈을 뜬다',
        deltas: { wealth: 5, happiness: 2 },
        result: '통장이 불어나는 걸 보는 재미를 그제야 알았다.'
      },
      {
        id: 'first-wedding-invitation',
        text: '결혼한 친구의 청첩장을 처음 받아본다',
        deltas: { happiness: 1, relationship: 2 },
        result: '축하하는 마음 한편으로, 내 인생 시계도 문득 돌아봤다.'
      },
      {
        id: 'mentoring-a-junior',
        text: '회사에서 처음으로 후배를 맡아 가르친다',
        deltas: { relationship: 3, fame: 2, happiness: -1 },
        result: '누군가를 가르치며, 스스로도 다시 배우게 됐다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'mastering-solo-time',
        text: '혼자만의 시간을 즐기는 법을 제대로 배운다',
        deltas: { happiness: 4, relationship: -2 },
        result: '혼밥, 혼영, 혼자 하는 여행 — 전부 생각보다 괜찮았다.'
      },
      {
        id: 'routine-boredom',
        text: '쳇바퀴 같은 일상에 문득 권태를 느낀다',
        deltas: { happiness: -3, health: -1 },
        result: '매일이 똑같다는 생각이 문득 무겁게 다가왔다.'
      },
      {
        id: 'insomnia-onset',
        text: '업무 생각에 잠자리에서도 휴대폰을 손에서 놓지 못한다',
        deltas: { health: -5, happiness: -3 },
        result: '천장 무늬를 셀 수 있을 정도로, 밤이 길어졌다.',
        addCondition: { id: 'insomnia', label: '😵 불면증' },
        requiresAnyOccupation: true
      },
      {
        id: 'relationship-drifting-apart-busy',
        text: '바쁘다는 핑계로 소중한 사람들과 연락이 뜸해진다',
        deltas: { relationship: -7, happiness: -2 },
        result: '연락처는 그대로였지만, 마음의 거리는 점점 벌어졌다.'
      },
      {
        id: 'first-seed-money',
        text: '허리띠를 졸라매 첫 종잣돈을 마련한다',
        deltas: { wealth: 4, happiness: -2 },
        result: '통장에 찍힌 숫자가 작아도, 처음으로 "내 돈"이라는 게 생겼다.',
        addAsset: { id: 'seed-money', label: '💰 종잣돈', type: 'cash' }
      },
      {
        id: 'unexpected-bonus-windfall',
        text: '예상 밖의 두둑한 성과급을 받는다',
        deltas: { wealth: 7, happiness: 4 },
        result: '통장에 찍힌 숫자를 보고 몇 번이나 다시 확인했다.',
        addAsset: { id: 'bonus-cash', label: '💰 성과급 목돈', type: 'cash' }
      },
      {
        id: 'first-used-car',
        text: '중고차를 마련해 첫 차 주인이 된다',
        deltas: { wealth: -4, happiness: 4 },
        result: '낡았어도, 내 이름으로 된 첫 차라는 게 뿌듯했다.',
        addAsset: { id: 'first-car', label: '🚗 중고차', type: 'movable' }
      },
      {
        id: 'startup-founder-equity-fight',
        text: '동업자와 지분 문제로 크게 다툰다',
        deltas: { relationship: -6, happiness: -4 },
        result: '같이 꾸던 꿈이, 숫자 앞에서 이렇게 쉽게 흔들릴 줄 몰랐다.',
        requiresOccupation: ['startup-founder']
      },
      {
        id: 'artist-unexpected-recognition',
        text: '작품이 뜻밖의 주목을 받으며 이름이 알려진다',
        deltas: { fame: 6, happiness: 3 },
        result: '아무도 안 볼 줄 알았던 작업물이, 어느새 사람들 입에 오르내렸다.',
        requiresOccupation: ['artist-writer']
      }
    ]
  },
  {
    id: 'rookie-27',
    name: '사회 초년생',
    ageRange: '27세',
    intro: '지금 가는 길이 맞는 길인지, 처음으로 진지하게 되묻게 되는 해입니다.',
    choices: [
      {
        id: 'questioning-the-path',
        text: '지금 하는 일이 정말 맞는 길인지 진지하게 고민한다',
        deltas: { happiness: -3, fame: 1 },
        result: '정답 없는 질문을 붙들고 몇 날 며칠을 보냈다.'
      },
      {
        id: 'side-project-launch',
        text: '부업·사이드 프로젝트를 시작하며 새 가능성을 시험한다',
        deltas: { wealth: 3, happiness: 3, health: -2 },
        result: '퇴근 후 시간이 온전히 내 것처럼 느껴졌다.'
      },
      {
        id: 'marriage-talk',
        text: '오래 만난 연인과 결혼을 진지하게 이야기한다',
        deltas: { relationship: 5, wealth: -2 },
        result: '농담처럼 꺼낸 말이, 어느새 진지한 대화가 됐다.'
      },
      {
        id: 'grad-school-consideration',
        text: '대학원·유학 등 다시 공부를 시작할지 고민한다',
        deltas: { happiness: -2, wealth: -2 },
        result: '다시 학생이 된다는 상상만으로도 설레고 두려웠다.'
      },
      {
        id: 'coworker-departure-jitters',
        text: '동료의 퇴사·이직 소식을 듣는다',
        deltas: { happiness: -2, relationship: -1 },
        result: '축하 인사를 건네면서도, 마음 한구석이 복잡했다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'first-real-checkup',
        text: '그동안 미뤄온 건강검진을 처음으로 제대로 받는다',
        deltas: { health: 4, wealth: -2 },
        result: '결과지를 받아 들기 전까지, 괜히 긴장했다.'
      },
      {
        id: 'carpal-tunnel-heal',
        text: '손목 보호대를 차고 스트레칭을 꾸준히 하며 저림이 사라진다',
        deltas: { health: 5, wealth: -2 },
        result: '저릿함 없이 마우스를 쥘 수 있다는 게 이렇게 감사한 일일 줄 몰랐다.',
        requiresCondition: 'carpal-tunnel',
        removeCondition: 'carpal-tunnel'
      },
      {
        id: 'civil-servant-difficult-complainant',
        text: '무리한 요구를 하는 민원인을 상대한다',
        deltas: { happiness: -4 },
        result: '억울해도 웃으며 응대해야 하는 순간들이, 조용히 쌓여갔다.',
        requiresOccupation: ['civil-servant']
      },
      {
        id: 'teacher-touching-letter',
        text: '제자가 보낸 편지를 받는다',
        deltas: { happiness: 5, relationship: 2 },
        result: '삐뚤빼뚤한 글씨 몇 줄이, 지친 하루를 다 녹였다.',
        requiresOccupation: ['teacher']
      }
    ]
  },
  {
    id: 'rookie-28',
    name: '사회 초년생',
    ageRange: '28세',
    intro: '작은 성과와 함께 책임도 조금씩 무거워지는 해. 어느새 "선배"라는 말이 낯설지 않습니다.',
    choices: [
      {
        id: 'small-promotion',
        text: '더 큰 책임을 맡겠다고 자원한다',
        deltas: { fame: 4, wealth: 3, happiness: -2 },
        result: '명함에 적힌 직급 하나가 어깨를 조금 더 무겁게 했다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'first-team-lead',
        text: '팀을 이끌며 사람 관리의 어려움을 처음 겪는다',
        deltas: { relationship: -2, fame: 3, happiness: -1 },
        result: '일보다 사람이 더 어렵다는 걸, 이제야 실감했다.'
      },
      {
        id: 'parents-aging-realization',
        text: '부모님의 건강이 예전 같지 않다는 걸 실감한다',
        deltas: { relationship: 3, happiness: -4 },
        result: '전화 너머 목소리가 예전보다 조금 작게 느껴졌다.'
      },
      {
        id: 'first-home-savings-goal',
        text: '그동안 모은 돈으로 내 집 마련의 첫걸음을 뗀다',
        deltas: { wealth: -5, happiness: 5 },
        result: '숫자로만 보던 목표가, 처음으로 손에 잡히는 것 같았다.'
      },
      {
        id: 'work-life-balance-thought',
        text: '일과 삶의 균형을 처음으로 진지하게 고민한다',
        deltas: { happiness: 3, health: 2 },
        result: '야근이 능력이 아니라는 걸 인정하기까지 오래 걸렸다.'
      },
      {
        id: 'being-called-senior',
        text: '후배들 사이에서 어느새 "선배"로 불리는 게 낯설다',
        deltas: { relationship: 2, fame: 2 },
        result: '엊그제 신입이었던 것 같은데, 어느새 불리는 호칭이 달라져 있었다.',
        requiresAnyOccupation: true
      },
      {
        id: 'insomnia-heal',
        text: '수면 습관을 개선하며 불면증에서 서서히 벗어난다',
        deltas: { health: 6, happiness: 3 },
        result: '베개에 머리를 대자마자 잠드는 밤이, 다시 찾아왔다.',
        requiresCondition: 'insomnia',
        removeCondition: 'insomnia'
      },
      {
        id: 'fame-failed-venture-mockery',
        text: '무리하게 벌인 도전이 실패하며 세간의 웃음거리가 된다',
        deltas: { fame: -7, wealth: -4 },
        result: '야심 차게 알렸던 시작이, 가장 부끄러운 실패담이 됐다.'
      },
      {
        id: 'healthcare-night-shift-exhaustion',
        text: '밤샘 근무를 이어간다',
        deltas: { health: -6 },
        result: '해 뜨는 걸 보며 퇴근하는 날이, 몸에 켜켜이 쌓였다.',
        requiresOccupation: ['healthcare-worker']
      },
      {
        id: 'office-worker-overtime-exhaustion',
        text: '반복되는 야근을 이어간다',
        deltas: { health: -4, happiness: -3 },
        result: '막차 시간표를 외울 지경이 되자, 뭔가 잘못됐다는 걸 느꼈다.',
        requiresOccupation: ['office-worker']
      },
      {
        id: 'lottery-buy-28',
        text: '월급날 기념으로 로또 한 장을 사본다',
        deltas: { happiness: 1 },
        result: '봉투에 고이 넣어둔 종이 한 장이, 왠지 든든했다.',
        addAsset: { id: 'lottery-ticket', label: '🎟️ 복권', type: 'movable' }
      },
      {
        id: 'lottery-skip-28',
        text: '그 돈으로 차라리 저녁을 사 먹는다',
        deltas: { happiness: 1 },
        result: '그 돈으로 먹은 저녁이, 나름 남는 장사였다.'
      },
      {
        id: 'chance-encounter-lover',
        text: '우연한 자리에서 새로운 인연을 만난다',
        deltas: { happiness: 4, relationship: 4 },
        result: '예정에 없던 만남이었는데, 자꾸 다시 떠올랐다.',
        addAcquaintance: { relation: 'lover', label: '💕 연인' }
      }
    ]
  },
  {
    id: 'rookie-29',
    name: '사회 초년생',
    ageRange: '29세',
    intro: '20대의 마지막 해. 지나온 시간을 한 번쯤 정리하게 됩니다.',
    choices: [
      {
        id: 'last-twenties-birthday',
        text: '20대의 마지막 생일을 조용히, 혹은 왁자지껄하게 보낸다',
        deltas: { happiness: 4, relationship: 3 },
        result: '촛불을 끄며, 지난 10년이 스쳐 지나갔다.'
      },
      {
        id: 'resume-reflection',
        text: '지난 5년의 커리어를 이력서 한 장으로 정리해본다',
        deltas: { happiness: 2, fame: 1 },
        result: '몇 줄 안 되는 문장에, 생각보다 많은 것들이 담겨 있었다.'
      },
      {
        id: 'bucket-list-before-thirty',
        text: '서른 전에 꼭 해보고 싶던 버킷리스트를 실행에 옮긴다',
        deltas: { happiness: 5, wealth: -4 },
        result: '미루기만 하던 일을 마침내 해치웠을 때의 후련함.'
      },
      {
        id: 'twenties-friends-trip',
        text: '20대를 함께한 친구들과 여행을 떠난다',
        deltas: { relationship: 5, happiness: 4, wealth: -3 },
        result: '다들 조금씩 변했지만, 웃는 포인트는 여전히 똑같았다.'
      },
      {
        id: 'weight-of-turning-thirty',
        text: '다가올 서른이 주는 무게감에 잠시 마음이 복잡해진다',
        deltas: { happiness: -3, relationship: -1 },
        result: '숫자 하나 바뀌는 것뿐인데, 이상하게 마음이 요동쳤다.'
      },
      {
        id: 'no-regrets-affirmation',
        text: '지난 20대를 돌아보며 후회 없다고 스스로에게 말해준다',
        deltas: { happiness: 3, health: 1 },
        result: '완벽하진 않았지만, 그래도 최선을 다했다고 인정해주기로 했다.'
      },
      {
        id: 'logistics-recognized-as-ace',
        text: '빠른 손놀림으로 현장에서 이름이 알려진다',
        deltas: { happiness: 4, wealth: 2 },
        result: '별거 아닌 별명 같아도, 불릴 때마다 어깨가 으쓱했다.',
        requiresOccupation: ['logistics-worker'],
        requiresNoCondition: ['wrist-sprain', 'carpal-tunnel']
      },
      {
        id: 'public-corp-job-security-relief',
        text: '안정적인 정년 보장에 마음이 놓인다',
        deltas: { happiness: 3 },
        result: '남들의 이직 소식을 들을 때마다, 이 안정감이 새삼 크게 느껴졌다.',
        requiresOccupation: ['public-corp-employee']
      },
      {
        id: 'career-changer-adapting-struggle',
        text: '새 분야 적응이 쉽지 않아 애를 먹는다',
        deltas: { happiness: -3 },
        result: '기초부터 다시 배운다는 게, 생각보다 훨씬 더디고 어려웠다.',
        requiresOccupation: ['career-changer']
      },
      {
        id: 'lottery-check-29',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'settling-30',
    name: '서른, 자리잡기',
    ageRange: '30세',
    intro: '서른이라는 숫자 하나가, 이유 없이 인생을 다시 돌아보게 만듭니다.',
    choices: [
      {
        id: 'thirty-pressure',
        text: '서른이 되고 나니 뭔가 달라져야 할 것 같다는 생각이 든다',
        deltas: { happiness: -3, fame: 1 },
        result: '딱히 뭐가 바뀐 건 없는데, 마음만 자꾸 조급해졌다.'
      },
      {
        id: 'commit-to-one-path',
        text: '그동안의 방황을 접고 한 우물을 파기로 결심한다',
        deltas: { happiness: 2, wealth: 2 },
        result: '더 이상 흔들리지 않기로 한 순간, 오히려 마음이 편해졌다.'
      },
      {
        id: 'reunion-pace-check',
        text: '동창회에서 서로 다른 삶의 속도를 확인한다',
        deltas: { happiness: -2, relationship: 2 },
        result: '다들 비슷하게 살 줄 알았는데, 생각보다 제각각이었다.'
      },
      {
        id: 'big-thirty-gift',
        text: '서른 기념으로 스스로에게 큰 선물을 한다',
        deltas: { happiness: 5, wealth: -4 },
        result: '나에게 주는 선물이 이렇게 뿌듯한 일인 줄 몰랐다.'
      },
      {
        id: 'considering-parenthood',
        text: '부모가 되는 것에 대해 진지하게 고민하기 시작한다',
        deltas: { happiness: 1, relationship: 2 },
        result: '막연했던 질문이, 이제는 현실적인 계획표 위에 올라왔다.'
      },
      {
        id: 'nothing-settled-anxiety',
        text: '여전히 정해진 게 없다는 사실에 조급해진다',
        deltas: { happiness: -4, health: -1 },
        result: '남들은 다 자리 잡은 것 같은데, 나만 제자리인 기분이었다.'
      },
      {
        id: 'relationship-breakup-long-relationship',
        text: '오래된 연인과 크게 다투고 갈라선다',
        deltas: { relationship: -9, happiness: -4 },
        result: '함께 그리던 미래가, 한순간에 지워졌다.'
      },
      {
        id: 'fine-jewelry-purchase',
        text: '스스로에게 주는 선물로 고가의 예물을 마련한다',
        deltas: { wealth: -4, happiness: 4 },
        result: '큰맘 먹고 산 물건인데, 볼 때마다 웃음이 났다.',
        addAsset: { id: 'fine-jewelry', label: '💍 예물/보석', type: 'movable' }
      },
      {
        id: 'premium-appliance-set',
        text: '가전을 고급으로 싹 바꾼다',
        deltas: { wealth: -3, happiness: 3 },
        result: '별거 아닌 것 같아도, 집에 들어오는 기분이 확 달라졌다.',
        addAsset: { id: 'premium-appliances', label: '🛋️ 고급 가전', type: 'movable' }
      },
      {
        id: 'savings-milestone',
        text: '몇 년째 부어온 적금 만기일이 찾아온다',
        deltas: { wealth: 6, happiness: 3 },
        result: '매달 조금씩 넣은 돈이, 어느새 이렇게 불어나 있었다.',
        addAsset: { id: 'maturity-savings', label: '💰 만기 적금', type: 'cash' }
      },
      {
        id: 'tech-near-miss-accident',
        text: '현장에서 큰 사고가 날 뻔한다',
        deltas: { health: -4, happiness: -3 },
        result: '몇 초 차이였다는 걸 되새길 때마다, 등골이 서늘해졌다.',
        requiresOccupation: ['tech-worker']
      },
      {
        id: 'startup-founder-word-of-mouth',
        text: '서비스가 입소문을 타기 시작한다',
        deltas: { fame: 5, wealth: 3 },
        result: '사용자 수 그래프가 꺾이지 않고 올라가는 걸, 몇 번이고 새로고침했다.',
        requiresOccupation: ['startup-founder']
      },
      {
        id: 'small-biz-rent-increase',
        text: '임대료 인상 통보를 받는다',
        deltas: { wealth: -4, happiness: -3 },
        result: '숫자 하나가 이렇게 밤잠을 설치게 할 줄 몰랐다.',
        requiresOccupation: ['small-business-owner']
      },
      {
        id: 'sales-rep-top-performer',
        text: '큰 계약을 따내며 실적 1위에 오른다',
        deltas: { wealth: 6, fame: 3 },
        result: '전광판에 뜬 내 이름을, 몇 번이고 다시 확인했다.',
        requiresOccupation: ['sales-rep']
      }
    ]
  },
  {
    id: 'settling-31',
    name: '서른, 자리잡기',
    ageRange: '31세',
    intro: '곁에 남을 사람과 앞으로의 삶을 어떻게 그릴지, 조금 더 구체적으로 고민하는 나이입니다.',
    choices: [
      {
        id: 'wedding-day',
        text: '오래 만난 연인과 결혼식을 올린다',
        deltas: { happiness: 6, relationship: 5, wealth: -6 },
        result: '많은 사람 앞에서 서약하는 그 몇 분이, 유독 길게 느껴졌다.',
        requiresNoFamilyMember: ['spouse'],
        addFamilyMembers: [{ id: 'spouse', label: '💍 배우자' }]
      },
      {
        id: 'declaring-single-life',
        text: '비혼을 선언하고 혼자만의 삶을 설계한다',
        deltas: { happiness: 4, wealth: 2, relationship: -2 },
        result: '누구의 눈치도 보지 않는 삶의 방식이, 홀가분하게 느껴졌다.'
      },
      {
        id: 'wedding-budget-compromise',
        text: '결혼식 비용과 현실 사이에서 씁쓸한 타협을 한다',
        deltas: { happiness: -3, wealth: -3 },
        result: '꿈꾸던 것과 가계부 사이에서, 결국 가계부가 이겼다.',
        requiresNoFamilyMember: ['spouse'],
        addFamilyMembers: [{ id: 'spouse', label: '💍 배우자' }]
      },
      {
        id: 'first-shared-home',
        text: '배우자·파트너와 함께 살 집을 처음으로 계약한다',
        deltas: { wealth: -5, relationship: 4 },
        result: '도장 하나로 삶의 반경이 통째로 바뀌었다.',
        requiresNoFamilyMember: ['spouse'],
        addFamilyMembers: [{ id: 'spouse', label: '💍 배우자' }]
      },
      {
        id: 'inlaws-negotiation',
        text: '양가 부모님 사이를 조율한다',
        deltas: { happiness: -3, relationship: 1 },
        result: '둘의 문제인 줄 알았는데, 생각보다 훨씬 많은 사람이 얽혀 있었다.',
        requiresNoFamilyMember: ['spouse'],
        addFamilyMembers: [{ id: 'spouse', label: '💍 배우자' }]
      },
      {
        id: 'pet-family-instead',
        text: '결혼 대신 반려동물을 입양해 새 가족을 만든다',
        deltas: { happiness: 5, relationship: 3, wealth: -2 },
        result: '작은 발소리 하나가 집 안 공기를 완전히 바꿔놓았다.'
      },
      {
        id: 'artist-creative-block',
        text: '창작의 벽에 부딪혀 오랫동안 슬럼프에 빠진다',
        deltas: { happiness: -5 },
        result: '텅 빈 화면 앞에서 몇 시간을 보내는 날이, 점점 잦아졌다.',
        requiresOccupation: ['artist-writer']
      },
      {
        id: 'fame-early-career-notice-31',
        text: '업무 성과가 사내에서 화제가 된다',
        deltas: { fame: 3, happiness: 1 },
        result: '복도에서 마주치는 사람들의 인사가, 며칠 새 부쩍 늘었다.'
      },
      {
        id: 'fame-social-post-backfire-31',
        text: '무심코 올린 게시물이 논란을 부른다',
        deltas: { fame: -4, happiness: -3 },
        result: '지우고 나서도 한참을, 댓글 창을 다시 열어보게 됐다.'
      },
      {
        id: 'fame-industry-mention-31',
        text: '업계 소식지에 이름이 짧게 언급된다',
        deltas: { fame: 3, happiness: 1 },
        result: '단 한 줄이었지만, 몇 번을 다시 읽어봤다.'
      },
      {
        id: 'fame-compared-unfavorably-31',
        text: '동기와 비교당하며 위축된다',
        deltas: { fame: -3, happiness: -3 },
        result: '애써 태연한 척했지만, 그 말은 오래도록 머릿속을 맴돌았다.'
      },
      {
        id: 'fame-networking-boost-31',
        text: '여러 모임에 나가며 이름을 알린다',
        deltas: { fame: 3, relationship: 2 },
        result: '명함을 주고받는 손이, 조금씩 익숙해져 갔다.'
      },
      {
        id: 'fame-quiet-obscurity-31',
        text: '눈에 띄지 않는 자리에서 조용히 지낸다',
        deltas: { fame: -2, happiness: 1 },
        result: '주목받지 않는 하루하루가, 의외로 편안하게 느껴졌다.'
      }
    ]
  },
  {
    id: 'settling-32',
    name: '서른, 자리잡기',
    ageRange: '32세',
    intro: '자산과 미래를 숫자로 계획하기 시작하는 시기. 통장 잔고가 곧 마음의 안정과 이어집니다.',
    choices: [
      {
        id: 'first-home-purchase',
        text: '영끌해서 내 집 마련에 성공한다',
        deltas: { wealth: -8, happiness: 6 },
        result: '등기부등본에 내 이름이 찍힌 걸 보고 또 봤다.',
        addAsset: { id: 'first-home', label: '🏠 내 집', type: 'realestate' }
      },
      {
        id: 'loan-interest-struggle',
        text: '무리한 대출 이자에 매달 허덕인다',
        deltas: { wealth: -4, happiness: -3, health: -1 },
        result: '월급날이 즐거운 날에서 이자 빠져나가는 날로 바뀌었다.'
      },
      {
        id: 'investment-study-group',
        text: '재테크 스터디에 들어가 투자 지식을 넓힌다',
        deltas: { wealth: 4, happiness: 2 },
        result: '용어 하나 알아들을 때마다, 세상이 조금 더 보이는 기분이었다.'
      },
      {
        id: 'investment-loss',
        text: '무리하게 대출까지 받아 투자에 뛰어든다',
        deltas: { wealth: -6, happiness: -4 },
        result: '숫자가 녹아내리는 걸 보면서도, 손이 얼어붙어 아무것도 못 했다.'
      },
      {
        id: 'side-income-relief',
        text: '부수입을 만들어본다',
        deltas: { wealth: 5, happiness: 3 },
        result: '두 번째 월급이 주는 안정감은 생각보다 컸다.'
      },
      {
        id: 'time-over-money',
        text: '돈보다 시간이 더 중요하다는 걸 깨닫는다',
        deltas: { happiness: 4, wealth: -1 },
        result: '벌기만 하다가, 처음으로 쓰는 법을 고민하기 시작했다.'
      },
      {
        id: 'fame-viral-mistake',
        text: '사소한 실수가 캡처되어 온라인에서 두고두고 놀림거리가 된다',
        deltas: { fame: -8, happiness: -4 },
        result: '해명 글을 올릴수록 오히려 화제성만 커졌다.'
      },
      {
        id: 'studio-investment',
        text: '오피스텔에 투자해 임대 수익을 노린다',
        deltas: { wealth: -7, happiness: 2 },
        result: '매달 들어오는 월세를 볼 때마다, 잘한 선택이었다는 확신이 들었다.',
        addAsset: { id: 'studio-unit', label: '🏢 오피스텔', type: 'realestate' }
      },
      {
        id: 'commercial-property-purchase',
        text: '상가를 매입해 임대업에 뛰어든다',
        deltas: { wealth: -9, happiness: 3 },
        result: '큰돈이 묶였지만, 이름 앞으로 된 상가 하나가 든든했다.',
        addAsset: { id: 'commercial-unit', label: '🏬 상가', type: 'realestate' }
      },
      {
        id: 'civil-servant-seniority-promotion',
        text: '연공서열에 따라 안정적으로 승급한다',
        deltas: { wealth: 3, happiness: 2 },
        result: '화려하진 않아도, 꾸준함이 결국 자리를 만들어줬다.',
        requiresOccupation: ['civil-servant']
      },
      {
        id: 'teacher-parent-complaints',
        text: '학부모 민원 전화를 자주 받는다',
        deltas: { happiness: -5 },
        result: '전화벨이 울릴 때마다, 심장이 먼저 철렁 내려앉았다.',
        requiresOccupation: ['teacher']
      }
    ]
  },
  {
    id: 'settling-33',
    name: '서른, 자리잡기',
    ageRange: '33세',
    intro: '가족을 이루는 방식에 대해 스스로 답을 찾아가는 나이입니다.',
    choices: [
      {
        id: 'first-childbirth',
        text: '첫 아이를 임신·출산하며 인생의 큰 전환점을 맞는다',
        deltas: { happiness: 5, health: -4, wealth: -3 },
        result: '작은 손가락 하나에, 삶의 순서가 전부 다시 매겨졌다.',
        requiresFamilyMember: ['spouse'],
        requiresNoFamilyMember: ['child'],
        addFamilyMembers: [{ id: 'child', label: '👶 자녀' }]
      },
      {
        id: 'dink-satisfaction',
        text: '아이 없이 둘만의 삶(딩크)을 선택한다',
        deltas: { happiness: 4, relationship: 3 },
        result: '우리 둘의 속도로 사는 삶이, 누구보다 우리에게 잘 맞았다.'
      },
      {
        id: 'maternity-leave-anxiety',
        text: '육아휴직을 낸다',
        deltas: { happiness: -3, wealth: -4, relationship: 2 },
        result: '아이는 예뻤지만, 자리가 사라질까 봐 조바심이 났다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'sleepless-parenting',
        text: '밤낮없는 육아로 체력이 완전히 바닥난다',
        deltas: { health: -6, happiness: -2 },
        result: '하루가 어떻게 지나가는지도 모르게 흘러갔다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'niece-nephew-babysitting',
        text: '조카·친구 아이를 돌보며 육아의 무게를 간접 체험한다',
        deltas: { relationship: 3, happiness: 1 },
        result: '몇 시간 봐준 것만으로도, 부모들이 새삼 대단해 보였다.'
      },
      {
        id: 'career-over-kids',
        text: '아이 대신 커리어에 더 집중하기로 결심한다',
        deltas: { wealth: 4, fame: 3, relationship: -2 },
        result: '선택에 후회는 없었지만, 가끔 명절마다 듣는 질문은 피곤했다.'
      },
      {
        id: 'healthcare-saved-a-patient',
        text: '위중한 환자를 담당해 밤새 지켜본다',
        deltas: { happiness: 6 },
        result: '보호자의 울먹이는 인사 한마디가, 그간의 고됨을 다 씻어냈다.',
        requiresOccupation: ['healthcare-worker']
      },
      {
        id: 'office-worker-unexpected-bonus',
        text: '예상 밖의 성과급을 받아 기분이 들뜬다',
        deltas: { wealth: 5, happiness: 3 },
        result: '입금 문자를 몇 번이고 다시 열어봤다.',
        requiresOccupation: ['office-worker']
      },
      {
        id: 'lottery-check-33',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'settling-34',
    name: '서른, 자리잡기',
    ageRange: '34세',
    intro: '지금 걷는 길이 맞는지, 방향을 다시 점검하게 되는 시기입니다.',
    choices: [
      {
        id: 'bold-job-change',
        text: '과감히 이직해 새로운 조직에 적응한다',
        deltas: { fame: 3, wealth: 4, happiness: -1 },
        result: '낯선 자리였지만, 그만큼 배우는 것도 많았다.',
        setOccupation: { id: 'job-changed', label: '🏢 이직 후 직장인' },
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'startup-attempt-30s',
        text: '그동안 준비한 창업에 도전한다',
        deltas: { wealth: -6, fame: 4, health: -3 },
        result: '월급쟁이일 땐 몰랐던 무게를, 사장이 되고서야 알았다.',
        setOccupation: { id: 'entrepreneur', label: '🚀 창업가' }
      },
      {
        id: 'staying-safe',
        text: '안정적인 현재를 지키며 변화를 미룬다',
        deltas: { happiness: -1, wealth: 2 },
        result: '도전보다 안정을 택한 선택이, 늘 옳았다고는 확신할 수 없었다.'
      },
      {
        id: 'department-transfer',
        text: '부서 이동으로 완전히 새로운 업무를 맡는다',
        deltas: { happiness: -2, fame: 2 },
        result: '처음부터 다시 배우는 기분이었지만, 그 나름의 재미도 있었다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'recognized-expert',
        text: '동종 업계에서 이름이 오르내리기 시작한다',
        deltas: { fame: 5, wealth: 2 },
        result: '이름 석 자로 불리는 자리에, 어느새 도달해 있었다.'
      },
      {
        id: 'fading-achievement-sense',
        text: '일에서 오는 성취감이 예전 같지 않음을 느낀다',
        deltas: { happiness: -3, fame: -1 },
        result: '똑같이 열심히 하는데, 예전만큼 벅차지가 않았다.'
      },
      {
        id: 'hypertension-onset',
        text: '야근과 회식이 겹치며 무리한 나날을 보낸다',
        deltas: { health: -5, wealth: -2 },
        result: '건강검진 결과지의 빨간 숫자가 처음으로 눈에 들어왔다.',
        addCondition: { id: 'hypertension', label: '🩸 고혈압 전조' }
      },
      {
        id: 'relationship-colleague-turns-away',
        text: '믿었던 동료와 이해관계가 얽힌다',
        deltas: { relationship: -8, wealth: 2 },
        result: '일은 남았지만, 예전 같은 사이로는 돌아가지 못했다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'logistics-back-injury',
        text: '혼자서 무거운 짐을 무리하게 나른다',
        deltas: { health: -5 },
        result: '순간의 삐끗함이, 오래도록 몸에 남는 흔적이 됐다.',
        requiresOccupation: ['logistics-worker'],
        addCondition: { id: 'back-pain', label: '🦴 허리 통증' }
      },
      {
        id: 'public-corp-nepotism-controversy',
        text: '낙하산 인사 논란이 불거진다',
        deltas: { happiness: -3 },
        result: '실력보다 다른 게 앞선다는 말이, 사무실 여기저기서 돌았다.',
        requiresOccupation: ['public-corp-employee']
      },
      {
        id: 'career-changer-prior-experience-strength',
        text: '이전 경력이 뜻밖의 강점으로 작용한다',
        deltas: { wealth: 3, happiness: 2 },
        result: '전혀 다른 분야인 줄 알았는데, 예전 경험이 의외의 곳에서 빛을 냈다.',
        requiresOccupation: ['career-changer']
      }
    ]
  },
  {
    id: 'settling-35',
    name: '서른, 자리잡기',
    ageRange: '35세',
    intro: '위아래를 모두 살펴야 하는 자리에 서게 되면서, 일이 곧 관계의 문제라는 걸 배웁니다.',
    choices: [
      {
        id: 'sandwiched-manager',
        text: '중간관리자가 되어 위아래 사이에 낀 기분을 느낀다',
        deltas: { happiness: -3, relationship: -1, fame: 2 },
        result: '위로도, 아래로도 완전히 편할 수 없는 자리였다.'
      },
      {
        id: 'watching-team-grow',
        text: '팀원의 성장을 가까이서 지켜본다',
        deltas: { relationship: 3, happiness: 4 },
        result: '내 성과보다, 남의 성장이 더 뿌듯할 수 있다는 걸 처음 알았다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'reorg-instability',
        text: '조직 개편의 여파로 내 자리가 바뀐다',
        deltas: { happiness: -4, wealth: -2 },
        result: '내 자리는 내가 지키는 게 아니라는 걸, 씁쓸하게 배웠다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'fear-of-being-outdated',
        text: '후배들에게 꼰대 소리를 들을까 봐 조심스러워진다',
        deltas: { happiness: -2, relationship: 1 },
        result: '좋은 뜻으로 한 말도 한 번씩 곱씹게 됐다.',
        requiresAnyOccupation: true
      },
      {
        id: 'headhunted-with-good-offer',
        text: '그동안의 경력으로 스카우트 제안을 받는다',
        deltas: { wealth: 6, fame: 3 },
        result: '제안서를 받아 든 순간, 그동안의 시간이 헛되지 않았다는 걸 알았다.'
      },
      {
        id: 'people-harder-than-work',
        text: '일보다 사람 관계가 훨씬 어렵다는 걸 다시 한번 느낀다',
        deltas: { relationship: -2, happiness: -2 },
        result: '업무는 매뉴얼이 있는데, 사람은 매번 처음이었다.'
      },
      {
        id: 'frozen-shoulder-onset',
        text: '하루 종일 자세를 바꾸지 않고 책상 앞에 앉아 있는다',
        deltas: { health: -4, wealth: -1 },
        result: '머리 감을 때마다 어깨가 시큰거리는 게, 서른다섯의 몸이 보내는 신호였다.',
        addCondition: { id: 'frozen-shoulder', label: '💪 어깨 결림(삼십견)' }
      },
      {
        id: 'tech-mentoring-junior-worker',
        text: '후배 기술자를 지도하는 역할을 맡는다',
        deltas: { happiness: 4, relationship: 3 },
        result: '내가 헤매던 자리에서, 이번엔 누군가에게 손을 내밀고 있었다.',
        requiresOccupation: ['tech-worker']
      },
      {
        id: 'startup-founder-funding-crisis',
        text: '사업 확장을 서두르며 지출을 늘린다',
        deltas: { wealth: -8, happiness: -5 },
        result: '통장 잔고를 확인하는 손이, 매일 조금씩 더 무거워졌다.',
        requiresOccupation: ['startup-founder']
      },
      {
        id: 'small-biz-regular-customers',
        text: '단골 손님이 늘며 정이 쌓인다',
        deltas: { relationship: 4, happiness: 2 },
        result: '이름은 몰라도 얼굴만 봐도 반가운 사람들이, 하나둘 늘어갔다.',
        requiresOccupation: ['small-business-owner']
      },
      {
        id: 'sales-rep-quota-pressure',
        text: '실적 압박 속에 한 달을 보낸다',
        deltas: { happiness: -4 },
        result: '월말이 다가올 때마다, 숫자가 목을 조여오는 기분이었다.',
        requiresOccupation: ['sales-rep']
      }
    ]
  },
  {
    id: 'settling-36',
    name: '서른, 자리잡기',
    ageRange: '36세',
    intro: '나를 키워준 사람들을 이제는 내가 돌봐야 할 시기가 다가옵니다.',
    choices: [
      {
        id: 'caring-for-sick-parent',
        text: '부모님의 병간호를 시작하며 삶의 우선순위가 바뀐다',
        deltas: { relationship: 4, happiness: -4, health: -2 },
        result: '늘 나를 돌봐주던 사람을, 이제는 내가 돌보고 있었다.'
      },
      {
        id: 'medical-bill-burden',
        text: '부모님 의료비를 부담한다',
        deltas: { wealth: -5, happiness: -2 },
        result: '가계부를 펼 때마다 마음 한쪽이 무거워졌다.'
      },
      {
        id: 'sibling-caregiving-conflict',
        text: '형제자매와 부양 문제를 두고 이야기를 나눈다',
        deltas: { relationship: -4, happiness: -3 },
        result: '같은 부모 밑에서 자랐는데도, 생각은 이렇게나 달랐다.',
        requiresFamilyMember: ['sibling', 'younger-sibling']
      },
      {
        id: 'trip-with-parents',
        text: '부모님과 여행을 다녀오며 소중한 시간을 쌓는다',
        deltas: { relationship: 5, happiness: 4, wealth: -3 },
        result: '늦었지만, 그래도 지금이라 다행이라는 생각이 들었다.'
      },
      {
        id: 'balancing-two-families',
        text: '내 가족과 부모님 사이에서 균형을 잡으려 애쓴다',
        deltas: { health: -3, happiness: -2 },
        result: '양쪽 다 소홀히 하고 싶지 않다는 마음이, 몸을 갈아 넣게 했다.'
      },
      {
        id: 'parents-still-independent',
        text: '독립적으로 살아가시는 부모님을 보며 마음을 놓는다',
        deltas: { happiness: 3, relationship: 2 },
        result: '아직은 괜찮으시다는 사실 하나가, 이렇게 큰 위안이 될 줄 몰랐다.'
      },
      {
        id: 'father-passes-away',
        text: '아버지가 오랜 투병 끝에 세상을 떠나신다',
        deltas: { happiness: -8, relationship: -2 },
        result: '마지막 순간까지 손을 놓지 않았지만, 손끝의 온기가 식어가는 걸 그대로 느껴야 했다.',
        requiresFamilyMember: ['father'],
        removeFamilyMembers: ['father']
      },
      {
        id: 'mother-passes-away',
        text: '어머니가 지병으로 세상을 떠나신다',
        deltas: { happiness: -8, relationship: -2 },
        result: '전화기 너머 늘 들리던 목소리가, 이제는 다시 들을 수 없다는 게 실감 나지 않았다.',
        requiresFamilyMember: ['mother'],
        removeFamilyMembers: ['mother']
      },
      {
        id: 'fame-offhand-remark-backfires',
        text: '무심코 한 말이 예상외로 크게 번진다',
        deltas: { fame: -8, happiness: -3 },
        result: '말 한마디가 그렇게까지 커질 줄은, 나조차 몰랐다.'
      },
      {
        id: 'artist-unstable-income',
        text: '수입이 들쭉날쭉한 시기를 보낸다',
        deltas: { wealth: -5 },
        result: '좋아하는 일을 한다는 게, 통장 잔고를 대신 채워주진 않았다.',
        requiresOccupation: ['artist-writer']
      },
      {
        id: 'job-changed-culture-shock',
        text: '새 조직 문화에 적응해간다',
        deltas: { happiness: -3 },
        result: '같은 회사원인데도, 문화는 이렇게 다를 수 있다는 걸 새삼 느꼈다.',
        requiresOccupation: ['job-changed']
      },
      {
        id: 'lottery-buy-36',
        text: '혹시나 하는 마음에 로또를 사본다',
        deltas: { happiness: 1 },
        result: '밑져야 본전이라는 마음으로 지갑을 열었다.',
        addAsset: { id: 'lottery-ticket', label: '🎟️ 복권', type: 'movable' }
      },
      {
        id: 'lottery-skip-36',
        text: '부질없다 여기며 그냥 지나친다',
        deltas: { happiness: 1 },
        result: '실속을 차렸다는 생각에 마음이 편했다.'
      }
    ]
  },
  {
    id: 'settling-37',
    name: '서른, 자리잡기',
    ageRange: '37세',
    intro: '잊고 지내던 나 자신을 다시 챙기기 시작하는 나이입니다.',
    choices: [
      {
        id: 'reviving-old-hobby',
        text: '오랫동안 미뤄온 취미를 본격적으로 다시 시작한다',
        deltas: { happiness: 5, wealth: -2 },
        result: '까맣게 잊고 있던 감각이, 몸에 그대로 남아있었다.'
      },
      {
        id: 'new-exercise-routine',
        text: '새로운 운동을 시작한다',
        deltas: { health: 5, happiness: 2 },
        result: '땀 흘리고 나면 머릿속까지 개운해지는 걸, 오랜만에 느꼈다.',
        requiresNoCondition: ['back-pain', 'frozen-shoulder']
      },
      {
        id: 'hobby-account-mini-fame',
        text: 'SNS에 취미 계정을 만들어 소소한 인기를 얻는다',
        deltas: { fame: 4, happiness: 3 },
        result: '본업과 상관없는 곳에서 얻은 관심이, 묘하게 새로운 활력이 됐다.'
      },
      {
        id: 'postponing-self-time',
        text: '바쁘다는 핑계로 자기 시간을 계속 미룬다',
        deltas: { happiness: -3, health: -1 },
        result: '언젠가 하겠다던 일들이, 여전히 언젠가로 남아있었다.'
      },
      {
        id: 'new-club-connections',
        text: '동호회에서 또래와는 다른 새로운 인연을 만난다',
        deltas: { relationship: 4, happiness: 3 },
        result: '나이도, 하는 일도 다른 사람들과의 대화가 신선했다.'
      },
      {
        id: 'burnout-career-break',
        text: '번아웃 끝에 잠시 일을 쉬고 재충전한다',
        deltas: { health: 4, wealth: -4, happiness: 3 },
        result: '멈춰서야 보이는 것들이 있다는 걸, 그제야 알았다.'
      },
      {
        id: 'hypertension-heal',
        text: '식습관과 운동으로 혈압을 정상 수치까지 되돌린다',
        deltas: { health: 6, wealth: -2 },
        result: '숫자 하나가 정상으로 돌아왔을 뿐인데, 마음이 다 놓였다.',
        requiresCondition: 'hypertension',
        removeCondition: 'hypertension'
      },
      {
        id: 'civil-servant-bureaucracy-frustration',
        text: '관행적인 업무 처리 방식에 답답함을 느낀다',
        deltas: { happiness: -3 },
        result: '이래야 하는 이유를 물어도, 돌아오는 답은 늘 "원래 그렇다"였다.',
        requiresOccupation: ['civil-servant']
      },
      {
        id: 'teacher-homeroom-duties',
        text: '담임을 맡아 책임이 부쩍 무거워진다',
        deltas: { happiness: -2, wealth: 1 },
        result: '반 아이들 한 명 한 명이, 이제 다 내 몫으로 느껴졌다.',
        requiresOccupation: ['teacher']
      },
      {
        id: 'lottery-check-37',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'settling-38',
    name: '서른, 자리잡기',
    ageRange: '38세',
    intro: '몸이 예전 같지 않다는 걸, 무시할 수 없을 만큼 또렷하게 느끼게 됩니다.',
    choices: [
      {
        id: 'shocking-checkup-result',
        text: '건강검진에서 예상 못한 결과를 받고 충격받는다',
        deltas: { health: -4, happiness: -4 },
        result: '숫자 몇 개가, 그동안의 생활 습관을 전부 되돌아보게 만들었다.'
      },
      {
        id: 'declining-stamina',
        text: '체력이 예전 같지 않음을 절실히 느낀다',
        deltas: { health: -3, happiness: -2 },
        result: '예전엔 아무렇지 않던 일들이, 이제는 다음 날까지 갔다.'
      },
      {
        id: 'overhauling-habits',
        text: '식습관과 생활 습관을 전면적으로 뜯어고친다',
        deltas: { health: 6, happiness: 2 },
        result: '작은 습관 몇 개를 바꿨을 뿐인데, 몸이 먼저 반응했다.'
      },
      {
        id: 'consistent-exercise-routine',
        text: '정기적인 운동 루틴을 만들어 꾸준히 지킨다',
        deltas: { health: 5, wealth: -2 },
        result: '작심삼일이 아니라 진짜 습관이 된 첫 운동이었다.',
        requiresNoCondition: ['back-pain', 'frozen-shoulder']
      },
      {
        id: 'visible-aging-signs',
        text: '노안·흰머리 등 눈에 보이는 변화를 마주한다',
        deltas: { happiness: -2, wealth: -1 },
        result: '거울 속 낯선 디테일 하나하나가, 세월을 실감하게 했다.'
      },
      {
        id: 'learning-to-not-overdo',
        text: '무리하지 않는 법을 비로소 배워간다',
        deltas: { happiness: 3, health: 3 },
        result: '버티는 것만이 능사가 아니라는 걸, 이제야 받아들였다.'
      },
      {
        id: 'frozen-shoulder-heal',
        text: '도수치료와 스트레칭을 꾸준히 받는다',
        deltas: { health: 5, wealth: -3 },
        result: '팔을 머리 위로 쭉 뻗을 수 있다는 게, 이렇게 큰 자유일 줄 몰랐다.',
        requiresCondition: 'frozen-shoulder',
        removeCondition: 'frozen-shoulder'
      },
      {
        id: 'relationship-family-conflict-cutoff',
        text: '가족과 갈등을 겪은 뒤 한동안 왕래를 끊는다',
        deltas: { relationship: -9, happiness: -4 },
        result: '먼저 손 내밀기엔, 서로 너무 오래 등을 돌리고 있었다.'
      },
      {
        id: 'healthcare-infection-exposure',
        text: '감염 위험에 늘 노출된 채 일한다',
        deltas: { health: -3 },
        result: '보호구를 벗을 때마다, 오늘 하루도 무사했다는 안도가 먼저 들었다.',
        requiresOccupation: ['healthcare-worker']
      },
      {
        id: 'office-worker-politics',
        text: '직장 내 파벌 다툼에 휘말린다',
        deltas: { happiness: -4, relationship: -2 },
        result: '누구 편도 들지 않으려 했는데, 결국 눈치를 보게 됐다.',
        requiresOccupation: ['office-worker']
      },
      {
        id: 'entrepreneur-stable-revenue',
        text: '사업 운영 방식을 전면 재정비한다',
        deltas: { wealth: 7 },
        result: '매달 들쭉날쭉하던 매출이, 처음으로 예측 가능한 숫자가 됐다.',
        requiresOccupation: ['entrepreneur']
      },
      {
        id: 'fame-conference-speaker-38',
        text: '업계 컨퍼런스에서 발표를 맡는다',
        deltas: { fame: 4, happiness: 2 },
        result: '마이크를 잡은 손이 떨렸지만, 준비한 만큼 말이 술술 나왔다.'
      },
      {
        id: 'fame-negative-review-38',
        text: '내놓은 결과물에 대해 혹평을 받는다',
        deltas: { fame: -4, happiness: -4 },
        result: '조목조목 짚힌 지적들이, 며칠 동안 마음을 무겁게 짓눌렀다.'
      },
      {
        id: 'fame-media-mention-38',
        text: '관련 매체에 이름이 짧게 실린다',
        deltas: { fame: 3, happiness: 1 },
        result: '기사 한 귀퉁이였지만, 캡처해서 저장해두었다.'
      },
      {
        id: 'fame-forgotten-project-38',
        text: '한때 몸담았던 프로젝트가 기억에서 잊혀간다',
        deltas: { fame: -3, happiness: -2 },
        result: '검색해도 잘 나오지 않는 결과물을 보며, 씁쓸함이 남았다.'
      },
      {
        id: 'fame-award-nomination-38',
        text: '직무 관련 상에 후보로 이름이 오른다',
        deltas: { fame: 4, happiness: 2 },
        result: '결과와 상관없이, 후보 명단에 오른 것만으로도 실감이 났다.'
      },
      {
        id: 'fame-anonymous-contributor-38',
        text: '성과는 냈지만 이름은 드러나지 않는다',
        deltas: { fame: -2, wealth: 2 },
        result: '공은 다른 이름으로 돌아갔지만, 통장 잔고는 늘어 있었다.'
      }
    ]
  },
  {
    id: 'settling-39',
    name: '서른, 자리잡기',
    ageRange: '39세',
    intro: '서른대의 마지막 해. 다가올 10년을 조용히 준비하게 됩니다.',
    choices: [
      {
        id: 'reflecting-on-thirties',
        text: '서른아홉, 지난 10년을 찬찬히 돌아본다',
        deltas: { happiness: 3, relationship: 2 },
        result: '길다면 길고 짧다면 짧았던 10년이, 파노라마처럼 스쳐 갔다.'
      },
      {
        id: 'forty-goals-bucketlist',
        text: '마흔을 앞두고 새로운 목표와 버킷리스트를 세운다',
        deltas: { happiness: 4, fame: 1 },
        result: '아직 하고 싶은 게 이렇게 많다는 사실이, 스스로도 반가웠다.'
      },
      {
        id: 'pride-in-what-built',
        text: '그동안 쌓아온 것들을 돌아본다',
        deltas: { happiness: 5, wealth: 2 },
        result: '거창하진 않아도, 분명히 여기까지 걸어온 흔적들이었다.'
      },
      {
        id: 'still-not-enough-anxiety',
        text: '여전히 부족하다는 생각에 조급함이 밀려온다',
        deltas: { happiness: -4, relationship: -1 },
        result: '남들과 비교하는 습관은, 서른아홉이 되어도 쉽게 사라지지 않았다.'
      },
      {
        id: 'farewell-to-thirties-with-friends',
        text: '오랜 친구들과 서른의 마지막을 함께 보낸다',
        deltas: { relationship: 5, happiness: 4, wealth: -2 },
        result: '변한 것도 많았지만, 함께 웃는 얼굴만큼은 그대로였다.'
      },
      {
        id: 'calm-before-forty',
        text: '마흔이라는 숫자 앞에서 담담해지기로 마음먹는다',
        deltas: { happiness: 2, health: 1 },
        result: '두려워하기보다, 그냥 자연스럽게 받아들이기로 했다.'
      },
      {
        id: 'logistics-dawn-coworker-bonding',
        text: '동료들과 새벽 시간을 함께 보내며 끈끈해진다',
        deltas: { relationship: 4 },
        result: '아무도 안 깬 새벽, 같이 짐을 나르던 얼굴들이 가족처럼 느껴졌다.',
        requiresOccupation: ['logistics-worker']
      },
      {
        id: 'public-corp-project-success',
        text: '맡은 공공 프로젝트를 마무리 짓는다',
        deltas: { happiness: 4, fame: 2 },
        result: '이름 없이 끝나는 일이었지만, 뿌듯함만큼은 온전히 내 것이었다.',
        requiresOccupation: ['public-corp-employee']
      },
      {
        id: 'career-changer-jargon-struggle',
        text: '낯선 업무 용어와 매일 씨름한다',
        deltas: { happiness: -2 },
        result: '회의 시간마다 모르는 단어를 몰래 검색하는 게 일상이 됐다.',
        requiresOccupation: ['career-changer']
      }
    ]
  },
  {
    id: 'midlife-40',
    name: '중년, 선택의 무게',
    ageRange: '40세',
    intro: '인생의 절반 지점. 마흔이라는 숫자가 이유 없이 지난 시간을 돌아보게 만듭니다.',
    choices: [
      {
        id: 'midlife-halfway-realization',
        text: '마흔이 되고 나니 인생의 절반을 지났다는 게 실감난다',
        deltas: { happiness: -2, health: -1 },
        result: '숫자 하나가 이렇게 무겁게 다가올 줄 몰랐다.'
      },
      {
        id: 'finally-being-myself',
        text: '이제야 진짜 나답게 사는 법을 알 것 같다',
        deltas: { happiness: 5, fame: 1 },
        result: '남 눈치 보지 않는 법을, 마흔이 되어서야 조금 알 것 같았다.'
      },
      {
        id: 'fulfilling-a-long-delayed-wish',
        text: '마흔 기념으로 오랫동안 미뤄온 일을 실행에 옮긴다',
        deltas: { happiness: 4, wealth: -3 },
        result: '더 미루면 영영 못 할 것 같아서, 마침내 저질렀다.'
      },
      {
        id: 'generation-gap-with-juniors',
        text: '젊은 후배들 사이에서 세대 차이를 실감한다',
        deltas: { happiness: -3, relationship: -1 },
        result: '농담 하나도 통하지 않는 순간들이 늘어갔다.',
        requiresAnyOccupation: true
      },
      {
        id: 'confidence-in-life-so-far',
        text: '지금까지의 삶에 나름의 확신이 생긴다',
        deltas: { happiness: 4, wealth: 2 },
        result: '완벽하진 않았지만, 그래도 내 선택들이었다.'
      },
      {
        id: 'planning-second-half',
        text: '인생 후반전을 위해 새로운 계획을 세운다',
        deltas: { happiness: 3, fame: 1 },
        result: '전반전을 마친 선수처럼, 잠시 숨을 고르고 다음을 그렸다.'
      },
      {
        id: 'fame-trend-fading',
        text: '한물간 유행이 되어 예전만큼 주목받지 못한다',
        deltas: { fame: -6, happiness: -3 },
        result: '한때 앞서갔다고 생각한 것들이, 어느새 낡은 것이 되어 있었다.'
      },
      {
        id: 'tech-extra-certification',
        text: '자격증을 추가로 따내 몸값을 높인다',
        deltas: { wealth: 5 },
        result: '자격증 한 장이, 다음 몸값 협상의 든든한 카드가 됐다.',
        requiresOccupation: ['tech-worker']
      },
      {
        id: 'startup-founder-overwork-health',
        text: '밤낮없이 일하며 건강을 크게 해친다',
        deltas: { health: -6 },
        result: '몸이 보내는 경고를, 너무 오래 뒷전으로 미뤄뒀다.',
        requiresOccupation: ['startup-founder']
      },
      {
        id: 'small-biz-competitor-nearby',
        text: '경쟁 점포가 바로 옆에 생겨 긴장한다',
        deltas: { happiness: -3 },
        result: '새 간판이 켜지던 날, 나도 모르게 매출표부터 다시 훑어봤다.',
        requiresOccupation: ['small-business-owner']
      },
      {
        id: 'sales-rep-entertainment-health',
        text: '거래처와의 접대 자리가 잦아진다',
        deltas: { health: -4 },
        result: '웃으며 잔을 채우는 손이, 속으로는 지쳐가고 있었다.',
        requiresOccupation: ['sales-rep']
      },
      {
        id: 'job-changed-better-treatment',
        text: '이전 회사와 처우를 비교해본다',
        deltas: { wealth: 4, happiness: 3 },
        result: '왜 진작 옮기지 않았을까 싶을 정도로, 처우가 달랐다.',
        requiresOccupation: ['job-changed']
      },
      {
        id: 'veteran-work-colleague',
        text: '오랜 직장 생활 속에서 각별한 동료가 생긴다',
        deltas: { happiness: 2, relationship: 3 },
        result: '같은 풍파를 겪고 나니, 동료 이상의 무언가가 생겼다.',
        requiresAnyOccupation: true,
        addAcquaintance: { relation: 'colleague', label: '💼 동료' }
      }
    ]
  },
  {
    id: 'midlife-41',
    name: '중년, 선택의 무게',
    ageRange: '41세',
    intro: '자녀 교육이든 커리어든, 뭔가를 본격적으로 다잡아야 할 것 같은 압박이 느껴지는 나이입니다.',
    choices: [
      {
        id: 'focus-on-childs-education',
        text: '자녀 교육에 본격적으로 신경 쓰기 시작한다',
        deltas: { wealth: -4, happiness: 2, relationship: 2 },
        result: '학원비 영수증이 쌓여갈수록, 마음도 함께 쌓여갔다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'solidifying-position-at-work',
        text: '회사에서 확고한 입지를 다진다',
        deltas: { fame: 4, wealth: 3 },
        result: '이제는 없어서는 안 될 사람이라는 말을, 처음으로 들었다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'juggling-work-and-parenting',
        text: '일과 육아를 동시에 챙기느라 몸이 두 개였으면 좋겠다고 느낀다',
        deltas: { health: -4, happiness: -2 },
        result: '하루가 24시간이라는 게 새삼 야속했다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'enjoying-childfree-freedom',
        text: '아이 없는 삶에서 자유로움을 만끽한다',
        deltas: { happiness: 4, wealth: 2 },
        result: '평일 저녁의 여유가, 그 무엇과도 바꿀 수 없이 소중했다.'
      },
      {
        id: 'seeking-new-stimulation',
        text: '커리어 정체를 느끼며 새로운 자극을 찾는다',
        deltas: { happiness: -2, fame: 1 },
        result: '익숙함이 편안함인지 정체인지, 헷갈리는 날들이었다.'
      },
      {
        id: 'anxious-comparison-with-peers',
        text: '동년배들과 비교하며 조급함을 느낀다',
        deltas: { happiness: -3, relationship: -1 },
        result: '동창회 소식 하나에 며칠을 심란해했다.'
      },
      {
        id: 'artist-exhibition-opportunity',
        text: '전시회·출간 기회를 제안받는다',
        deltas: { happiness: 4, fame: 3 },
        result: '내 이름이 박힌 포스터를 몇 번이고 다시 들여다봤다.',
        requiresOccupation: ['artist-writer']
      },
      {
        id: 'lottery-check-41',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'midlife-42',
    name: '중년, 선택의 무게',
    ageRange: '42세',
    intro: '몸이 보내는 신호를 더 이상 못 본 척할 수 없게 되는 나이입니다.',
    choices: [
      {
        id: 'multiple-health-flags',
        text: '건강검진에서 여러 이상 소견을 받는다',
        deltas: { health: -5, happiness: -3 },
        result: '결과지를 읽는 손이 자꾸만 느려졌다.'
      },
      {
        id: 'starting-serious-exercise',
        text: '본격적으로 운동을 시작하며 체력을 관리한다',
        deltas: { health: 5, wealth: -2 },
        result: '숨이 턱까지 차오르면서도, 이상하게 개운했다.',
        requiresNoCondition: ['back-pain']
      },
      {
        id: 'visible-signs-of-aging',
        text: '흰머리와 노안이 눈에 띄게 늘어난다',
        deltas: { happiness: -2, wealth: -1 },
        result: '돋보기 없이는 메뉴판도 안 보이는 날이 왔다.'
      },
      {
        id: 'cutting-back-on-drinking',
        text: '회식·과음이 줄고 건강한 생활을 택한다',
        deltas: { health: 4, relationship: -1 },
        result: '다음 날이 무서워, 한 잔 더를 거절하는 법을 배웠다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'ignoring-body-signals',
        text: '몸에서 보내는 신호를 무시하고 계속 무리한다',
        deltas: { health: -6, wealth: 2 },
        result: '괜찮다는 말을 스스로에게 몇 번이나 되뇌었는지 모른다.'
      },
      {
        id: 'preventive-checkups-for-family-history',
        text: '가족력 있는 질환을 예방하려 정기 검진을 시작한다',
        deltas: { health: 3, wealth: -2 },
        result: '미리 챙기는 게 결국 남는 장사라는 걸 이제야 알았다.'
      },
      {
        id: 'relationship-old-friend-fades-out',
        text: '오랜 친구와의 관계가 서서히, 그러나 완전히 끊어진다',
        deltas: { relationship: -7, happiness: -3 },
        result: '마지막 연락이 언제였는지도 이제는 가물가물했다.'
      },
      {
        id: 'civil-servant-work-life-balance',
        text: '칼퇴근과 안정적인 워라밸을 만끽한다',
        deltas: { happiness: 5, health: 2 },
        result: '퇴근길 하늘이 아직 밝다는 것만으로도, 하루가 여유로워졌다.',
        requiresOccupation: ['civil-servant']
      },
      {
        id: 'teacher-late-night-prep',
        text: '수업 준비와 잡무로 밤늦게까지 학교에 남는다',
        deltas: { health: -3 },
        result: '텅 빈 교무실 불빛 아래, 다음 날 수업 자료를 붙잡고 있었다.',
        requiresOccupation: ['teacher']
      },
      {
        id: 'entrepreneur-first-hire',
        text: '직원을 처음 채용하며 책임감이 커진다',
        deltas: { happiness: -2, wealth: 2 },
        result: '나 하나만 책임지던 삶이, 이제 다른 이의 생계까지 걸린 일이 됐다.',
        requiresOccupation: ['entrepreneur']
      },
      {
        id: 'fame-press-feature-42',
        text: '지역 매체에서 인터뷰를 요청해온다',
        deltas: { fame: 4, happiness: 1 },
        result: '작은 매체였지만, 내 이야기가 활자로 남는다는 게 낯설고도 뿌듯했다.'
      },
      {
        id: 'fame-online-controversy-42',
        text: '무심코 한 말이 온라인에서 논란이 된다',
        deltas: { fame: -3, happiness: -3 },
        result: '해명을 몇 번이나 다시 써 내려갔지만, 논란은 쉽게 가라앉지 않았다.'
      },
      {
        id: 'fame-industry-award-42',
        text: '업계 시상식에 후보로 이름이 오른다',
        deltas: { fame: 5, happiness: 2 },
        result: '수상은 못 했지만, 후보에 올랐다는 것만으로도 어깨가 으쓱했다.'
      },
      {
        id: 'fame-viral-moment-42',
        text: '우연히 찍힌 영상이 온라인에서 퍼진다',
        deltas: { fame: 6, happiness: 1 },
        result: '의도한 적 없는 관심이, 며칠 동안 일상을 뒤흔들었다.'
      },
      {
        id: 'fame-privacy-exposed-42',
        text: '사생활이 원치 않게 알려진다',
        deltas: { fame: -4, happiness: -4, relationship: -1 },
        result: '숨기고 싶던 부분까지 드러나자, 한동안 사람 만나기가 꺼려졌다.'
      },
      {
        id: 'fame-quiet-recognition-42',
        text: '동네에서 알아보는 사람들이 하나둘 생긴다',
        deltas: { fame: 2, happiness: 2 },
        result: '거창하진 않아도, 낯익은 인사가 늘어가는 게 나쁘지 않았다.'
      }
    ]
  },
  {
    id: 'midlife-43',
    name: '중년, 선택의 무게',
    ageRange: '43세',
    intro: '조직 안에서 자신의 자리를 다시 확인하게 되는 시기입니다.',
    choices: [
      {
        id: 'promoted-to-manager',
        text: '부서장·팀장 자리에 도전한다',
        deltas: { fame: 5, wealth: 4, happiness: -2 },
        result: '명함이 바뀐 날, 어깨도 함께 무거워졌다.',
        setOccupation: { id: 'team-lead', label: '📈 팀장/부서장' },
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'sidelined-in-reorg',
        text: '조직 개편에서 다른 자리로 옮겨진다',
        deltas: { happiness: -5, fame: -2 },
        result: '회의실 자리 배치 하나로도, 많은 게 짐작됐다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'respected-senior-figure',
        text: '후배들의 존경을 받는 선배로 자리매김한다',
        deltas: { relationship: 4, fame: 3 },
        result: '가르친 적도 없는데, 어느새 모범이 되어 있었다.',
        requiresAnyOccupation: true
      },
      {
        id: 'threatened-by-young-talent',
        text: '젊은 인재들과 나란히 평가받는 자리에 선다',
        deltas: { happiness: -4, fame: -1 },
        result: '따라잡히는 게 아니라, 이미 추월당한 건 아닐까 싶었다.'
      },
      {
        id: 'weighing-job-offer',
        text: '이직 제안을 받고 진지하게 고민한다',
        deltas: { fame: 2, wealth: 2, happiness: -1 },
        result: '익숙함을 버릴 용기가 있는지, 스스로에게 묻고 또 물었다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'planning-venture-with-colleague',
        text: '오랜 동료와 함께 새로운 사업을 구상한다',
        deltas: { wealth: -3, happiness: 3 },
        result: '커피 한 잔 하며 나눈 얘기가, 진짜 계획이 되어가고 있었다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'healthcare-verbal-abuse',
        text: '환자·보호자의 폭언에 마음의 상처를 입는다',
        deltas: { happiness: -5 },
        result: '아무렇지 않은 척 돌아섰지만, 그 말들은 오래 남았다.',
        requiresOccupation: ['healthcare-worker']
      },
      {
        id: 'office-worker-mentor-growth',
        text: '사수의 도움으로 업무 실력이 빠르게 는다',
        deltas: { wealth: 2, happiness: 3 },
        result: '묻지도 않은 걸 먼저 챙겨주는 그 배려가, 오래 기억에 남았다.',
        requiresOccupation: ['office-worker']
      }
    ]
  },
  {
    id: 'midlife-44',
    name: '중년, 선택의 무게',
    ageRange: '44세',
    intro: '가까운 사이일수록 소원해지기 쉬운 나이. 관계를 다시 들여다보게 됩니다.',
    choices: [
      {
        id: 'teen-child-conflict',
        text: '사춘기에 접어든 자녀와 자주 부딪힌다',
        deltas: { relationship: -5, happiness: -3 },
        result: '문 닫는 소리가 유독 크게 들리는 날들이었다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'drifting-from-spouse',
        text: '배우자와의 관계를 돌아보며 소원해진 사이를 자각한다',
        deltas: { relationship: -4, happiness: -2 },
        result: '언제부터 대화가 이렇게 줄었는지, 기억도 나지 않았다.',
        requiresFamilyMember: ['spouse']
      },
      {
        id: 'choosing-divorce',
        text: '오랜 갈등 끝에 이혼을 결정한다',
        deltas: { happiness: -6, relationship: -3, wealth: -5 },
        result: '한때는 평생을 약속했던 사람과, 이제는 남남이 되어 각자의 길을 걷는다.',
        requiresFamilyMember: ['spouse'],
        removeFamilyMembers: ['spouse']
      },
      {
        id: 'reconnecting-old-friend-40s',
        text: '오랜 친구와 다시 가까워지며 위안을 얻는다',
        deltas: { relationship: 5, happiness: 3 },
        result: '몇 년 만의 연락인데도, 옛날 그대로였다.'
      },
      {
        id: 'bonding-over-hobby-with-kid',
        text: '자녀와 취미를 공유하며 관계가 돈독해진다',
        deltas: { relationship: 5, happiness: 4, wealth: -2 },
        result: '같은 걸 좋아한다는 것만으로, 대화가 다시 이어졌다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'solo-time-reset-40s',
        text: '혼자만의 시간을 갖고 관계를 재정비한다',
        deltas: { happiness: 3, relationship: -1 },
        result: '잠시 거리를 두고 나니, 오히려 더 선명하게 보였다.'
      },
      {
        id: 'family-trip-reconciliation',
        text: '소원했던 가족과 함께 여행을 떠난다',
        deltas: { relationship: 5, happiness: 4, wealth: -4 },
        result: '낯선 풍경 앞에서, 오랜만에 다 같이 웃었다.'
      },
      {
        id: 'knee-pain-onset',
        text: '준비 운동 없이 무리하게 운동을 강행한다',
        deltas: { health: -4, wealth: -1 },
        result: '계단을 오를 때마다 무릎에서 신호가 왔다.',
        addCondition: { id: 'knee-pain', label: '🦵 무릎 통증' }
      },
      {
        id: 'fame-public-controversy-trust-lost',
        text: '공개적인 논란에 휘말린다',
        deltas: { fame: -9, relationship: -4 },
        result: '해명도 사과도, 이미 돌아선 마음을 다 되돌리진 못했다.'
      },
      {
        id: 'logistics-automation-anxiety',
        text: '자동화 설비가 하나둘 도입되는 걸 지켜본다',
        deltas: { happiness: -4 },
        result: '기계가 대신하는 구간이 늘어날 때마다, 내 자리도 줄어드는 것 같았다.',
        requiresOccupation: ['logistics-worker']
      },
      {
        id: 'public-corp-rigid-culture',
        text: '경직된 조직 문화에 답답함을 느낀다',
        deltas: { happiness: -3 },
        result: '결재판이 몇 단계를 거치는 동안, 열정도 조금씩 식어갔다.',
        requiresOccupation: ['public-corp-employee']
      },
      {
        id: 'career-changer-confirmation-moment',
        text: '전환이 옳았다는 확신이 드는 순간을 맞는다',
        deltas: { happiness: 5 },
        result: '늦었다고 생각했던 그 선택이, 결국 옳았다는 걸 스스로 확인했다.',
        requiresOccupation: ['career-changer']
      },
      {
        id: 'job-changed-awkward-new-colleagues',
        text: '새 동료들과 서먹한 시간을 보낸다',
        deltas: { relationship: -2 },
        result: '농담 하나에도 눈치를 보게 되는, 낯선 자리였다.',
        requiresOccupation: ['job-changed']
      },
      {
        id: 'lottery-buy-44',
        text: '동료들과 함께 로또를 사본다',
        deltas: { happiness: 1 },
        result: '다 같이 사면 왠지 더 될 것 같은 기분이 들었다.',
        addAsset: { id: 'lottery-ticket', label: '🎟️ 복권', type: 'movable' }
      },
      {
        id: 'lottery-skip-44',
        text: '다음 기회를 노리며 넘어간다',
        deltas: { happiness: 1 },
        result: '언제든 살 수 있다며 스스로를 다독였다.'
      }
    ]
  },
  {
    id: 'midlife-45',
    name: '중년, 선택의 무게',
    ageRange: '45세',
    intro: '다 가진 것 같은데도 문득 공허해지는, 이른바 중년의 위기가 찾아오는 나이입니다.',
    choices: [
      {
        id: 'existential-emptiness',
        text: '이유 모를 공허함에 삶의 의미를 되묻는다',
        deltas: { happiness: -5, health: -1 },
        result: '다 가진 것 같은데, 뭔가 텅 빈 기분이었다.'
      },
      {
        id: 'flirting-with-escape',
        text: '새로운 사람을 만나며 일탈을 꿈꾼다',
        deltas: { happiness: 2, relationship: -3 },
        result: '설렘과 죄책감 사이에서, 마음이 복잡하게 흔들렸다.'
      },
      {
        id: 'reviving-old-dream',
        text: '그동안 억눌러온 꿈을 다시 꺼내본다',
        deltas: { happiness: 4, wealth: -2 },
        result: '서랍 깊숙이 넣어뒀던 꿈이, 먼지를 털고 다시 나왔다.'
      },
      {
        id: 'impulsive-big-purchase',
        text: '갑작스레 큰 지출을 하며 스스로를 위로한다',
        deltas: { happiness: 3, wealth: -6 },
        result: '카드를 긁는 순간만큼은, 마음이 후련했다.',
        addAsset: { id: 'impulse-luxury-item', label: '✨ 충동 구매품', type: 'movable' }
      },
      {
        id: 'therapy-and-meditation',
        text: '명상·상담 등으로 마음을 다잡는다',
        deltas: { happiness: 5, wealth: -2 },
        result: '낯설었던 대화가, 어느새 한 주의 낙이 되어 있었다.'
      },
      {
        id: 'accepting-enough',
        text: '지금 이대로도 충분하다는 걸 받아들인다',
        deltas: { happiness: 4, health: 2 },
        result: '더 채우려 애쓰지 않아도 된다는 걸, 비로소 알았다.'
      },
      {
        id: 'larger-home-upgrade',
        text: '더 넓은 집으로 옮기며 자산을 불린다',
        deltas: { wealth: -8, happiness: 4 },
        result: '넓어진 거실만큼, 마음에도 여유가 생긴 것 같았다.',
        addAsset: { id: 'bigger-home', label: '🏡 넓은 집', type: 'realestate' }
      },
      {
        id: 'art-collection-investment',
        text: '미술품·시계 등 수집품에 투자한다',
        deltas: { wealth: -6, happiness: 3 },
        result: '보는 눈이 느는 만큼, 애정도 함께 쌓여갔다.',
        addAsset: { id: 'collectibles', label: '🎨 수집품', type: 'movable' }
      },
      {
        id: 'tech-repetitive-strain',
        text: '반복 작업으로 손목·어깨에 무리가 온다',
        deltas: { health: -5 },
        result: '몸에 새겨진 숙련의 흔적이, 통증으로도 함께 남았다.',
        requiresOccupation: ['tech-worker']
      },
      {
        id: 'small-biz-solo-burnout',
        text: '혼자 다 하려다 몸이 축난다',
        deltas: { health: -5 },
        result: '사장이자 직원이자 청소부인 하루가, 몸에 고스란히 쌓였다.',
        requiresOccupation: ['small-business-owner']
      },
      {
        id: 'sales-rep-difficult-client',
        text: '고객에게 무리한 요구를 받고도 웃어야 한다',
        deltas: { happiness: -4 },
        result: '"고객님 말씀이 맞습니다"를, 오늘도 몇 번이나 되뇌었다.',
        requiresOccupation: ['sales-rep']
      },
      {
        id: 'team-lead-taking-blame',
        text: '팀원의 실수를 대신 보고한다',
        deltas: { happiness: -4 },
        result: '"제 관리 부족입니다"라는 말이, 입에 붙어버렸다.',
        requiresOccupation: ['team-lead']
      },
      {
        id: 'midlife-consulting-side-gig-45',
        text: '쌓아온 경력을 살려 사이드 컨설팅을 시작한다',
        deltas: { wealth: 5, happiness: 1 },
        result: '부업치고는 꽤 짭짤한 수입이었다.'
      },
      {
        id: 'midlife-real-estate-flip-45',
        text: '그동안 눈여겨보던 부동산에 다시 손을 댄다',
        deltas: { wealth: 4 },
        result: '타이밍이 나쁘지 않았던 모양이다.'
      },
      {
        id: 'midlife-stock-account-check-45',
        text: '묵혀뒀던 주식 계좌를 오랜만에 들여다본다',
        deltas: { wealth: 6, happiness: 1 },
        result: '잊고 있던 사이, 계좌가 제법 불어나 있었다.'
      },
      {
        id: 'midlife-job-offer-negotiation-45',
        text: '이직 제안을 받고 조건을 적극적으로 협상한다',
        deltas: { wealth: 5, happiness: -1 },
        result: '밀어붙인 보람이 있었다, 연봉이 꽤 올랐다.'
      },
      {
        id: 'midlife-family-asset-help-45',
        text: '부모님의 재산 정리를 도와드린다',
        deltas: { wealth: 4, relationship: 2 },
        result: '고생했다며 부모님이 얼마간을 손에 쥐여주셨다.'
      },
      {
        id: 'midlife-old-debt-collection-45',
        text: '예전에 빌려줬던 돈을 받으러 연락해본다',
        deltas: { wealth: 3 },
        result: '미안해하며 건넨 돈이, 잊고 있던 만큼 반가웠다.'
      },
      {
        id: 'lottery-check-45',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'midlife-46',
    name: '중년, 선택의 무게',
    ageRange: '46세',
    intro: '늦지 않았다는 걸 스스로 증명하고 싶어지는 나이입니다.',
    choices: [
      {
        id: 'new-certification-40s',
        text: '새로운 자격증·학위에 도전하며 재교육을 받는다',
        deltas: { wealth: -3, happiness: 3, fame: 2 },
        result: '책상 앞에 다시 앉는 게 이렇게 어색할 줄 몰랐다.'
      },
      {
        id: 'career-pivot-40s',
        text: '완전히 다른 분야로 커리어를 전환한다',
        deltas: { wealth: -4, happiness: 4, fame: -1 },
        result: '처음부터 다시 시작한다는 게, 두려우면서도 짜릿했다.',
        setOccupation: { id: 'career-pivot', label: '🔄 커리어 전환자' }
      },
      {
        id: 'learning-with-younger-generation',
        text: '젊은 세대와 함께 배우며 신선한 자극을 받는다',
        deltas: { happiness: 4, relationship: 3 },
        result: '나이 차이는 있어도, 배우는 마음은 다르지 않았다.'
      },
      {
        id: 'new-challenge-setback',
        text: '새 도전을 시작했다가 예상보다 가파른 벽을 만난다',
        deltas: { happiness: -4, health: -2 },
        result: '예상보다 훨씬 가파른 언덕이었다.'
      },
      {
        id: 'consulting-with-experience',
        text: '오랜 경력을 살려 컨설팅·강의를 시작한다',
        deltas: { wealth: 5, fame: 3 },
        result: '그동안 쌓아온 경험이, 이렇게 값진 걸 줄 몰랐다.',
        setOccupation: { id: 'consultant', label: '🎤 컨설턴트/강사' }
      },
      {
        id: 'choosing-to-stay-put',
        text: '안주하는 편을 택하며 도전을 미룬다',
        deltas: { happiness: -2, wealth: 1 },
        result: '안전한 선택이었지만, 마음 한켠은 계속 근질거렸다.'
      },
      {
        id: 'relationship-used-by-trusted-person',
        text: '믿었던 사람에게 이용만 당했다는 걸 뒤늦게 깨닫는다',
        deltas: { relationship: -8, happiness: -4 },
        result: '관계였다고 생각한 것이, 사실은 아니었을지도 몰랐다.'
      },
      {
        id: 'artist-irregular-schedule',
        text: '밤낮없이 작업하며 불규칙한 생활을 이어간다',
        deltas: { health: -4 },
        result: '해가 뜨고 지는 걸, 작업이 끝나야만 알아챌 때가 많았다.',
        requiresOccupation: ['artist-writer']
      },
      {
        id: 'entrepreneur-competitor-pressure',
        text: '경쟁사가 공격적인 마케팅을 시작한다',
        deltas: { happiness: -3 },
        result: '어제까진 없던 광고가, 오늘은 골목 어귀마다 걸려 있었다.',
        requiresOccupation: ['entrepreneur']
      },
      {
        id: 'midlife-crush-confession',
        text: '우연히 다시 만난 옛 인연에게 뒤늦게 마음을 고백한다',
        deltas: { happiness: 3, relationship: 3 },
        result: '그때 못 한 말을, 이렇게 늦게라도 하게 될 줄은 몰랐다.',
        addAcquaintance: { relation: 'crush', label: '💌 짝사랑' }
      }
    ]
  },
  {
    id: 'midlife-47',
    name: '중년, 선택의 무게',
    ageRange: '47세',
    intro: '나를 키워준 사람들의 노년을 마주하며, 삶과 죽음을 조금 더 가까이서 보게 됩니다.',
    choices: [
      {
        id: 'parent-to-nursing-home',
        text: '부모님을 요양시설에 모시며 마음이 무겁다',
        deltas: { relationship: 2, happiness: -5, wealth: -4 },
        result: '최선의 선택이라 믿으면서도, 발걸음이 떨어지지 않았다.',
        requiresFamilyMember: ['father', 'mother', 'single-parent']
      },
      {
        id: 'losing-a-parent',
        text: '부모님을 떠나보낸다',
        deltas: { happiness: -7, relationship: 3 },
        result: '이제 전화할 곳이 하나 줄었다는 게, 실감이 나지 않았다.',
        requiresFamilyMember: ['father', 'mother', 'single-parent'],
        removeFamilyMembers: ['father', 'mother', 'single-parent']
      },
      {
        id: 'cherishing-parent-memories',
        text: '부모님과 함께한 시간을 소중히 기억하며 정리한다',
        deltas: { relationship: 4, happiness: 2 },
        result: '오래된 사진첩을 넘기며, 잊고 있던 순간들을 되찾았다.'
      },
      {
        id: 'caring-for-parent-with-siblings',
        text: '형제자매와 함께 부모님을 정성껏 돌본다',
        deltas: { relationship: 4, happiness: -2, wealth: -3 },
        result: '각자의 몫을 나누면서, 오히려 더 가까워졌다.',
        requiresAllFamilyMemberGroups: [['father', 'mother', 'single-parent'], ['sibling', 'younger-sibling']]
      },
      {
        id: 'parents-blessing-new-start',
        text: '부모님의 응원 속에 새로운 도전을 시작한다',
        deltas: { happiness: 4, relationship: 3 },
        result: '여전히 나를 믿어주는 그 한마디가, 큰 힘이 됐다.',
        requiresFamilyMember: ['father', 'mother', 'single-parent']
      },
      {
        id: 'weight-of-being-a-parent-40s',
        text: '부모가 된다는 것의 무게를 새삼 깨닫는다',
        deltas: { happiness: 1, relationship: 3 },
        result: '내 부모를 보며, 내 모습도 다시 돌아보게 됐다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'knee-pain-heal',
        text: '체중 관리와 재활 운동을 이어간다',
        deltas: { health: 5, wealth: -2 },
        result: '계단을 편하게 오를 수 있다는 게, 새삼 감사했다.',
        requiresCondition: 'knee-pain',
        removeCondition: 'knee-pain'
      },
      {
        id: 'civil-servant-audit-stress',
        text: '감사(監査) 대상이 되어 며칠간 초긴장 상태로 지낸다',
        deltas: { health: -3, happiness: -3 },
        result: '서류 한 장 한 장을 다시 들여다볼 때마다, 잠이 달아났다.',
        requiresOccupation: ['civil-servant']
      },
      {
        id: 'teacher-department-head',
        text: '부장교사로 발탁되며 역할이 커진다',
        deltas: { wealth: 3, fame: 2 },
        result: '"부장님"이라는 호칭이, 아직은 낯설고 무거웠다.',
        requiresOccupation: ['teacher']
      }
    ]
  },
  {
    id: 'midlife-48',
    name: '중년, 선택의 무게',
    ageRange: '48세',
    intro: '커리어가 정점에 이르거나, 정체를 마주하거나 — 갈림이 뚜렷해지는 나이입니다.',
    choices: [
      {
        id: 'career-peak-achievement',
        text: '커리어의 정점에서 큰 성과를 이룬다',
        deltas: { fame: 6, wealth: 5, happiness: 3 },
        result: '그동안의 시간이 헛되지 않았다는 걸, 결과로 증명받았다.'
      },
      {
        id: 'reaching-executive-position',
        text: '오랜 노력 끝에 임원 자리에 오른다',
        deltas: { fame: 7, wealth: 5, happiness: -2 },
        result: '축하 인사만큼이나, 책임의 무게도 함께 따라왔다.'
      },
      {
        id: 'career-stagnation-doubt',
        text: '정체된 커리어에 회의감을 느낀다',
        deltas: { happiness: -4, fame: -2 },
        result: '제자리걸음이 이렇게 지치는 일인 줄 몰랐다.'
      },
      {
        id: 'preparing-to-pass-the-torch',
        text: '후배들에게 자리를 물려줄 준비를 시작한다',
        deltas: { relationship: 3, happiness: 2 },
        result: '내려놓는 법을 배우는 것도, 결국 리더의 몫이었다.',
        requiresAnyOccupation: true
      },
      {
        id: 'restructuring-anxiety',
        text: '구조조정 소문이 도는 시기를 보낸다',
        deltas: { happiness: -5, health: -2 },
        result: '메일함을 열 때마다 심장이 철렁했다.'
      },
      {
        id: 'satisfaction-in-achievements',
        text: '지금까지의 성취를 되돌아본다',
        deltas: { happiness: 4, wealth: 1 },
        result: '생각보다 많은 걸 이뤄왔다는 걸, 그제야 인정했다.'
      },
      {
        id: 'fame-overshadowed-by-newcomers',
        text: '후배·신인들에게 밀려 존재감이 옅어진다',
        deltas: { fame: -6, happiness: -3 },
        result: '화려했던 자리가, 조용히 다른 사람의 것이 되어가고 있었다.'
      },
      {
        id: 'healthcare-head-nurse-promotion',
        text: '수간호사급 직책을 제안받는다',
        deltas: { wealth: 4, fame: 2 },
        result: '신입 때의 서툴던 손이, 어느새 후배들이 의지하는 손이 되어 있었다.',
        requiresOccupation: ['healthcare-worker']
      },
      {
        id: 'office-worker-remote-balance',
        text: '재택근무로 워라밸이 눈에 띄게 개선된다',
        deltas: { happiness: 4, health: 2 },
        result: '출퇴근길에 쓰던 시간이, 고스란히 내 것이 됐다.',
        requiresOccupation: ['office-worker']
      },
      {
        id: 'job-changed-regret',
        text: '이직한 선택을 다시 떠올려본다',
        deltas: { happiness: -4 },
        result: '그만두고 온 자리가, 자꾸만 더 좋아 보였다.',
        requiresOccupation: ['job-changed']
      },
      {
        id: 'team-lead-performance-recognized',
        text: '팀 성과가 좋아 상부의 인정을 받는다',
        deltas: { wealth: 3, fame: 3 },
        result: '팀원들과 나눠 든 트로피가, 혼자 받은 것보다 훨씬 묵직했다.',
        requiresOccupation: ['team-lead']
      },
      {
        id: 'career-pivot-beginner-again',
        text: '완전히 새로운 분야에서 초심자로 돌아간 기분을 느낀다',
        deltas: { happiness: -3 },
        result: '이 나이에 다시 "처음"이라는 단어를 쓸 줄은 몰랐다.',
        requiresOccupation: ['career-pivot']
      }
    ]
  },
  {
    id: 'midlife-49',
    name: '중년, 선택의 무게',
    ageRange: '49세',
    intro: '몸이 새로운 국면으로 접어드는 걸 느끼기 시작하는 나이입니다.',
    choices: [
      {
        id: 'new-hobby-menopause-relief',
        text: '새로운 취미로 몸과 마음의 변화를 다스린다',
        deltas: { happiness: 4, wealth: -2 },
        result: '손을 움직이는 동안만큼은, 잡생각이 사라졌다.'
      },
      {
        id: 'mood-swings-midlife',
        text: '감정 기복이 심해져 스스로도 낯설다',
        deltas: { happiness: -4, relationship: -2 },
        result: '별것 아닌 일에도 눈물이 핑 도는 날들이 늘었다.'
      },
      {
        id: 'learning-about-hormones',
        text: '호르몬 변화에 대해 배우며 몸을 이해해간다',
        deltas: { health: 2, happiness: 2 },
        result: '몸이 왜 이러는지 알고 나니, 마음이 한결 가벼워졌다.'
      },
      {
        id: 'adjusting-to-lower-stamina',
        text: '체력 저하를 인정하고 생활 방식을 조정한다',
        deltas: { health: 3, happiness: 1 },
        result: '예전처럼 무리하지 않는 법을, 천천히 익혀갔다.'
      },
      {
        id: 'leaning-on-peers-menopause',
        text: '비슷한 변화를 겪는 또래들과 서로 의지한다',
        deltas: { relationship: 4, happiness: 3 },
        result: '나만 그런 게 아니라는 사실이, 이상하게 위안이 됐다.'
      },
      {
        id: 'accepting-natural-change',
        text: '이 시기를 자연스러운 변화로 받아들이려 애쓴다',
        deltas: { happiness: 3, health: 1 },
        result: '거스르기보다, 함께 가기로 마음먹었다.'
      },
      {
        id: 'menopause-onset',
        text: '예전과 다르게 몸이 보내는 신호를 느낀다',
        deltas: { health: -5, happiness: -3 },
        result: '열감과 불면이 번갈아 찾아오는 밤들이 계속됐다.',
        addCondition: { id: 'menopause-symptoms', label: '🌡️ 갱년기 증상' }
      },
      {
        id: 'public-corp-overseas-training',
        text: '해외 연수 기회를 얻어 견문을 넓힌다',
        deltas: { happiness: 4, wealth: 2 },
        result: '낯선 나라에서 보낸 몇 주가, 오랜만에 숨통을 틔워줬다.',
        requiresOccupation: ['public-corp-employee']
      },
      {
        id: 'career-changer-behind-peers',
        text: '또래보다 늦게 시작했다는 걸 의식하게 된다',
        deltas: { happiness: -3 },
        result: '남들보다 몇 걸음 늦게 시작했다는 생각이, 문득문득 마음을 조였다.',
        requiresOccupation: ['career-changer']
      },
      {
        id: 'consultant-overwhelmed-with-requests',
        text: '강연 요청이 줄줄이 들어와 몸이 두 개라도 모자라다',
        deltas: { wealth: 5, health: -2 },
        result: '스케줄표가 빼곡해질수록, 몸은 못 따라가고 있었다.',
        requiresOccupation: ['consultant']
      },
      {
        id: 'lottery-check-49',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      },
      {
        id: 'fame-mentor-spotlight-49',
        text: '후배를 이끈 공로로 조명을 받는다',
        deltas: { fame: 4, relationship: 2 },
        result: '내 성과보다 누군가를 키운 일이 먼저 회자되는 게, 묘하게 뭉클했다.'
      },
      {
        id: 'fame-scandal-rumor-49',
        text: '근거 없는 소문에 휘말린다',
        deltas: { fame: -5, happiness: -4 },
        result: '아니라고 몇 번을 말해도, 소문은 이미 저 혼자 퍼져나가고 있었다.'
      },
      {
        id: 'fame-profile-feature-49',
        text: '경력을 다룬 기사에 소개된다',
        deltas: { fame: 5, happiness: 2 },
        result: '오려둔 기사 한 장이, 오래도록 책상 서랍에 남았다.'
      },
      {
        id: 'fame-outdated-criticism-49',
        text: '시대에 뒤떨어졌다는 평가를 듣는다',
        deltas: { fame: -3, happiness: -3 },
        result: '틀린 말은 아닌 것 같아서, 더 마음에 오래 남았다.'
      },
      {
        id: 'fame-community-recognition-49',
        text: '지역 사회에서 공로를 인정받는다',
        deltas: { fame: 4, relationship: 2 },
        result: '큰 무대는 아니었지만, 얼굴을 아는 사람들의 박수가 더 크게 다가왔다.'
      },
      {
        id: 'fame-fading-relevance-49',
        text: '예전만큼 연락이 오지 않는다는 걸 알아챈다',
        deltas: { fame: -3, happiness: -2 },
        result: '바빠서 그런 거라 여겼지만, 마음 한구석은 자꾸 신경이 쓰였다.'
      }
    ]
  },
  {
    id: 'midlife-50',
    name: '중년, 선택의 무게',
    ageRange: '50세',
    intro: '쉰이라는 숫자 앞에서, 지나온 시간의 무게를 새삼 느끼게 됩니다.',
    choices: [
      {
        id: 'mixed-feelings-turning-fifty',
        text: '쉰이라는 나이 앞에서 만감이 교차한다',
        deltas: { happiness: -2, relationship: 1 },
        result: '축하한다는 말에, 웃어야 할지 씁쓸해야 할지 헷갈렸다.'
      },
      {
        id: 'wisdom-of-fifty',
        text: '지천명, 인생의 이치를 조금은 알 것 같은 기분이 든다',
        deltas: { happiness: 5, fame: 1 },
        result: '화낼 일에 화내지 않는 법을, 이제야 조금 알 것 같았다.'
      },
      {
        id: 'big-fiftieth-celebration',
        text: '쉰 살 기념으로 큰 파티·여행을 계획한다',
        deltas: { happiness: 5, wealth: -5, relationship: 4 },
        result: '촛불 오십 개를 다 끄는 데, 숨이 꽤 찼다.'
      },
      {
        id: 'planning-second-half-of-life',
        text: '인생의 후반전을 준비하며 새로운 목표를 세운다',
        deltas: { happiness: 3, wealth: 1 },
        result: '남은 시간을 어떻게 쓸지, 진지하게 그려보기 시작했다.'
      },
      {
        id: 'looking-back-at-old-photos',
        text: '젊은 날의 사진들을 꺼내보며 세월을 실감한다',
        deltas: { happiness: -1, relationship: 1 },
        result: '사진 속 얼굴이 낯설면서도, 그리웠다.'
      },
      {
        id: 'most-comfortable-with-myself',
        text: '지금의 나 자신이 가장 편안하다는 걸 깨닫는다',
        deltas: { happiness: 5, health: 2 },
        result: '잘 보이려 애쓰지 않아도 되는 지금이, 제일 나답게 느껴졌다.'
      },
      {
        id: 'relationship-conflict-with-family-midlife',
        text: '가족과 깊은 갈등을 겪는다',
        deltas: { relationship: -8, happiness: -3 },
        result: '한 지붕 아래 살면서도, 대화는 점점 짧아졌다.'
      },
      {
        id: 'sales-rep-trust-built-client',
        text: '오랜 노력 끝에 신뢰 관계를 쌓은 거래처가 생긴다',
        deltas: { relationship: 4, wealth: 2 },
        result: '이제는 계약서 없이도 믿어주는 사이가, 무엇보다 든든했다.',
        requiresOccupation: ['sales-rep']
      },
      {
        id: 'entrepreneur-industry-recognition',
        text: '오랜 노력 끝에 업계 사람들 사이에서 내 이름이 오르내린다',
        deltas: { fame: 5, happiness: 3 },
        result: '무명이었던 이름이, 어느새 업계에서 회자되고 있었다.',
        requiresOccupation: ['entrepreneur']
      },
      {
        id: 'career-pivot-diverse-experience-asset',
        text: '다양한 경험이 새 분야에서 예상외의 무기가 된다',
        deltas: { wealth: 3, happiness: 3 },
        result: '멀리 돌아온 길이, 결국 남들에게 없는 무기가 되어 있었다.',
        requiresOccupation: ['career-pivot']
      }
    ]
  },
  {
    id: 'midlife-51',
    name: '중년, 선택의 무게',
    ageRange: '51세',
    intro: '자녀가 떠난 자리, 그 빈자리를 어떻게 채우느냐가 이 시기의 숙제입니다.',
    choices: [
      {
        id: 'empty-nest-syndrome',
        text: '자녀가 독립하며 빈 둥지 증후군을 겪는다',
        deltas: { happiness: -5, relationship: -2 },
        result: '아이 방문이 유독 조용한 게, 자꾸만 마음에 걸렸다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'celebrating-child-independence',
        text: '자녀가 독립해 집을 나선다',
        deltas: { happiness: 5, wealth: 2 },
        result: '짐을 다 싸서 나가는 뒷모습이, 대견하면서도 시원섭섭했다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'rekindled-couple-time',
        text: '부부만의 시간이 다시 늘며 관계가 새롭게 깊어진다',
        deltas: { relationship: 5, happiness: 4 },
        result: '신혼 때 같던 대화가, 오랜만에 다시 오갔다.'
      },
      {
        id: 'lingering-emptiness',
        text: '독립한 자녀의 빈자리가 유독 크게 느껴진다',
        deltas: { happiness: -4, relationship: -1 },
        result: '밥상에 놓인 수저 두 벌이, 그렇게 낯설 수가 없었다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'new-hobbies-and-travel',
        text: '취미·부부 여행으로 새로운 일상을 채워간다',
        deltas: { happiness: 4, wealth: -3 },
        result: '둘만의 여행이 이렇게 홀가분할 줄, 예전엔 몰랐다.'
      },
      {
        id: 'grandchild-news-excitement',
        text: '자녀에게서 손주 소식을 듣는다',
        deltas: { happiness: 5, relationship: 3 },
        result: '할머니, 할아버지라는 말이, 벌써부터 낯설고도 설렜다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'menopause-heal',
        text: '호르몬 치료·생활 관리로 갱년기 증상이 눈에 띄게 안정된다',
        deltas: { health: 6, wealth: -2 },
        result: '오랜만에 밤새 푹 잔 아침이, 이렇게 개운할 줄 몰랐다.',
        requiresCondition: 'menopause-symptoms',
        removeCondition: 'menopause-symptoms'
      },
      {
        id: 'team-lead-caught-in-middle',
        text: '팀원과 임원 사이에서 이러지도 저러지도 못한다',
        deltas: { happiness: -4 },
        result: '위에서도 아래에서도 이해받지 못하는 자리라는 걸, 뒤늦게 알았다.',
        requiresOccupation: ['team-lead']
      },
      {
        id: 'fame-parenting-recognition-51',
        text: '자녀 교육 노하우로 주변에서 화제가 된다',
        deltas: { fame: 3, relationship: 2 },
        result: '묻는 사람이 늘어날수록, 나눠줄 이야기도 하나둘 늘어갔다.'
      },
      {
        id: 'fame-career-plateau-51',
        text: '더 이상 눈에 띄는 성과가 없다는 평을 듣는다',
        deltas: { fame: -3, happiness: -3 },
        result: '틀린 말은 아니라는 생각이, 자꾸 마음에 걸렸다.'
      },
      {
        id: 'fame-community-leader-51',
        text: '지역 모임에서 리더 역할을 맡으며 알려진다',
        deltas: { fame: 4, relationship: 2 },
        result: '작은 모임이었지만, 이름 앞에 직함이 붙는 게 새삼스러웠다.'
      },
      {
        id: 'fame-replaced-by-younger-51',
        text: '젊은 인재에게 주목받던 자리를 내준다',
        deltas: { fame: -4, happiness: -3 },
        result: '박수를 쳐주면서도, 마음 한켠은 복잡했다.'
      },
      {
        id: 'fame-seminar-invited-51',
        text: '경험을 나누는 세미나에 강연자로 초청받는다',
        deltas: { fame: 4, happiness: 2 },
        result: '준비한 자료보다, 질문에 답하는 시간이 더 길어졌다.'
      },
      {
        id: 'fame-social-fatigue-51',
        text: 'SNS 활동을 줄이며 존재감이 옅어진다',
        deltas: { fame: -2, happiness: 1 },
        result: '알림이 줄어든 휴대폰이, 오히려 마음을 가볍게 했다.'
      }
    ]
  },
  {
    id: 'midlife-52',
    name: '중년, 선택의 무게',
    ageRange: '52세',
    intro: '은퇴라는 단어가 더는 먼 이야기가 아니게 되는 나이입니다.',
    choices: [
      {
        id: 'planning-life-after-retirement',
        text: '은퇴 후 삶을 구체적으로 계획하기 시작한다',
        deltas: { happiness: 2, wealth: -1 },
        result: '막연했던 은퇴가, 조금씩 구체적인 그림이 되어갔다.'
      },
      {
        id: 'reviewing-pension-and-savings',
        text: '연금·노후 자금을 꼼꼼히 재점검한다',
        deltas: { wealth: 3, happiness: -1 },
        result: '숫자를 두드릴 때마다, 마음이 오락가락했다.'
      },
      {
        id: 'exploring-second-act-business',
        text: '제2의 인생을 위한 창업·귀농을 알아본다',
        deltas: { wealth: -3, happiness: 3 },
        result: '완전히 다른 삶의 방식을, 처음으로 진지하게 그려봤다.'
      },
      {
        id: 'offered-early-retirement',
        text: '회사에서 명예퇴직을 제안받는다',
        deltas: { happiness: -4, wealth: 2 },
        result: '받아들일지 버틸지, 며칠 밤을 뒤척였다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'looking-forward-to-retirement',
        text: '은퇴가 두렵기보다 기대되기 시작한다',
        deltas: { happiness: 4, fame: -1 },
        result: '끝이 아니라 다음 챕터라는 생각이, 마음을 가볍게 했다.'
      },
      {
        id: 'still-wanting-to-work',
        text: '아직은 일을 더 하고 싶다는 마음을 확인한다',
        deltas: { happiness: 2, wealth: 2 },
        result: '손을 놓기엔, 아직 하고 싶은 일이 많았다.'
      },
      {
        id: 'fame-old-remark-resurfaces',
        text: '지나간 발언이 다시 수면 위로 떠오른다',
        deltas: { fame: -8, happiness: -4 },
        result: '그때는 아무렇지 않던 말이, 지금은 무겁게 되돌아왔다.'
      },
      {
        id: 'consultant-criticized-out-of-touch',
        text: '실전과 동떨어진 조언이라는 평을 듣는다',
        deltas: { happiness: -4 },
        result: '현장을 떠난 지 오래됐다는 지적이, 뼈아프게 다가왔다.',
        requiresOccupation: ['consultant']
      },
      {
        id: 'lottery-buy-52',
        text: '은퇴 자금에 보태겠다는 마음으로 로또를 사본다',
        deltas: { happiness: 1 },
        result: '작은 희망 하나를 지갑 속에 품었다.',
        addAsset: { id: 'lottery-ticket', label: '🎟️ 복권', type: 'movable' }
      },
      {
        id: 'lottery-skip-52',
        text: '괜한 기대는 접어두기로 한다',
        deltas: { happiness: 1 },
        result: '헛된 기대보다 현실을 택하기로 했다.'
      },
      {
        id: 'neighborhood-new-friend',
        text: '동네 모임에서 말이 잘 통하는 친구를 새로 사귄다',
        deltas: { happiness: 3, relationship: 2 },
        result: '나이 들어 사귄 친구가 더 편할 수 있다는 걸, 이제야 알았다.',
        addAcquaintance: { relation: 'friend', label: '🧑‍🤝‍🧑 친구' }
      }
    ]
  },
  {
    id: 'midlife-53',
    name: '중년, 선택의 무게',
    ageRange: '53세',
    intro: '숫자로 남은 시간을 가늠하게 되는, 현실적인 재정비의 시기입니다.',
    choices: [
      {
        id: 'organizing-assets-for-retirement',
        text: '그동안의 자산을 정리하며 노후 계획을 세운다',
        deltas: { wealth: 4, happiness: 2 },
        result: '숫자로 정리하고 나니, 막연한 불안이 조금 가셨다.'
      },
      {
        id: 'unexpected-expense-hits-savings',
        text: '예상치 못한 지출로 노후 자금에 구멍이 난다',
        deltas: { wealth: -6, happiness: -3 },
        result: '차곡차곡 쌓아온 것이, 순식간에 흔들렸다.'
      },
      {
        id: 'consulting-financial-advisor',
        text: '재무 설계사와 상담하며 자산을 재배치한다',
        deltas: { wealth: 3, happiness: 1 },
        result: '혼자 끙끙대던 걸 함께 풀어보니, 훨씬 명확해졌다.'
      },
      {
        id: 'funding-childs-wedding',
        text: '자녀 결혼 자금을 지원하며 통장이 크게 준다',
        deltas: { wealth: -7, happiness: 3, relationship: 3 },
        result: '통장은 가벼워졌지만, 마음은 오히려 꽉 찼다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'late-remarriage',
        text: '새로운 인연을 만나 인생 후반부에 결혼한다',
        deltas: { happiness: 7, relationship: 5, wealth: -3 },
        result: '예상 못 했던 챕터가 이렇게 새로 열릴 줄은, 스스로도 몰랐다.',
        requiresNoFamilyMember: ['spouse'],
        addFamilyMembers: [{ id: 'spouse', label: '💍 배우자' }]
      },
      {
        id: 'liquidating-property-for-cashflow',
        text: '부동산을 정리하며 현금 흐름을 확보한다',
        deltas: { wealth: 5, happiness: -1 },
        result: '오래 품고 있던 걸 놓아주는 데도, 결심이 필요했다.'
      },
      {
        id: 'health-and-time-over-money',
        text: '돈보다 건강과 시간이 우선이라는 걸 재확인한다',
        deltas: { happiness: 4, health: 2 },
        result: '통장 잔고보다 오늘 하루가 더 소중하다는 걸, 이제는 안다.'
      },
      {
        id: 'job-changed-quickly-recognized',
        text: '새 회사에서 빠르게 자리를 잡아간다',
        deltas: { wealth: 3, fame: 2 },
        result: '낯설던 자리가, 어느새 내 자리처럼 편안해졌다.',
        requiresOccupation: ['job-changed']
      },
      {
        id: 'entrepreneur-risky-expansion-loan',
        text: '사업 확장을 위해 무리한 대출을 받는다',
        deltas: { wealth: -4 },
        result: '서명 한 번에, 다음 몇 년의 무게가 달라졌다.',
        requiresOccupation: ['entrepreneur']
      },
      {
        id: 'career-pivot-intimidated-by-younger',
        text: '나이 어린 동료들과 함께 일한다',
        deltas: { happiness: -3 },
        result: '경력은 짧아도, 그들이 훨씬 능숙해 보이는 순간들이 있었다.',
        requiresOccupation: ['career-pivot']
      },
      {
        id: 'lottery-check-53',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      },
      {
        id: 'fame-veteran-status-53',
        text: '업계 원로로 대접받기 시작한다',
        deltas: { fame: 4, happiness: 2 },
        result: '어느새 신참이 아니라 어른 취급을 받는다는 게, 낯설고도 새삼스러웠다.'
      },
      {
        id: 'fame-younger-overshadowed-53',
        text: '더 젊은 인물들에게 관심이 옮겨가는 걸 지켜본다',
        deltas: { fame: -4, happiness: -3 },
        result: '질투는 아니라고 되뇌었지만, 씁쓸함까지 감출 순 없었다.'
      },
      {
        id: 'fame-panel-invitation-53',
        text: '전문가 패널로 초청받는다',
        deltas: { fame: 3, happiness: 1 },
        result: '오랜만에 정장을 꺼내 입으며, 조금은 설레는 마음이 들었다.'
      },
      {
        id: 'fame-old-clip-resurfaces-53',
        text: '예전 영상이 다시 화제가 된다',
        deltas: { fame: 5, happiness: 2 },
        result: '까맣게 잊고 있던 순간이, 이렇게 다시 불려 나올 줄은 몰랐다.'
      },
      {
        id: 'fame-out-of-touch-label-53',
        text: '요즘과 안 맞는다는 평을 듣는다',
        deltas: { fame: -3, happiness: -3 },
        result: '세대가 다르다는 말이, 생각보다 오래 마음에 걸렸다.'
      },
      {
        id: 'fame-quiet-fanbase-53',
        text: '여전히 곁을 지키는 이들의 존재를 새삼 느낀다',
        deltas: { fame: 2, relationship: 3, happiness: 2 },
        result: '화려하진 않아도, 꾸준한 마음들이 더 크게 다가왔다.'
      }
    ]
  },
  {
    id: 'midlife-54',
    name: '중년, 선택의 무게',
    ageRange: '54세',
    intro: '중년의 마지막 해. 다가올 노년을 향해 조용히 마음을 다잡습니다.',
    choices: [
      {
        id: 'reflecting-on-fifteen-years',
        text: '중년의 마지막 해, 지난 15년을 돌아본다',
        deltas: { happiness: 3, relationship: 2 },
        result: '짧지 않은 시간이었는데, 돌아보니 순식간이었다.'
      },
      {
        id: 'calm-resolve-for-old-age',
        text: '다가올 노년을 향한 담담한 각오를 다진다',
        deltas: { happiness: 2, health: 1 },
        result: '두렵기보다, 담담하게 받아들이기로 했다.'
      },
      {
        id: 'more-gratitude-than-regret',
        text: '그동안의 인생에 후회보다 감사가 더 크다는 걸 느낀다',
        deltas: { happiness: 5, relationship: 2 },
        result: '아쉬운 것보다, 감사한 것들이 더 많이 떠올랐다.'
      },
      {
        id: 'unfulfilled-dreams-linger',
        text: '여전히 못다 이룬 꿈이 있다는 사실이 아쉽다',
        deltas: { happiness: -3, wealth: 1 },
        result: '시간이 더 있었으면, 하는 생각이 문득 스쳤다.'
      },
      {
        id: 'closing-chapter-with-loved-ones',
        text: '오랜 친구·가족과 함께 조용히 이 시기를 매듭짓는다',
        deltas: { relationship: 5, happiness: 4 },
        result: '거창하지 않아도, 곁의 사람들만으로 충분했다.'
      },
      {
        id: 'preparing-new-chapter',
        text: '쉰다섯을 앞두고 새로운 챕터를 준비한다',
        deltas: { happiness: 3, fame: 1 },
        result: '끝이 아니라, 또 다른 시작이라고 되뇌었다.'
      },
      {
        id: 'parent-passing-50s',
        text: '부모님을 떠나보내며 인생의 한 장을 닫는다',
        deltas: { happiness: -8, relationship: 2 },
        resultOptions: [
          '오랫동안 앓아오시던 지병 끝에, 결국 부모님을 떠나보냈다. 마지막까지 손을 놓지 않았던 그 순간이, 오래도록 마음에 남았다.',
          '전혀 예상치 못한 사고 소식에, 제대로 된 마지막 인사조차 나누지 못한 채 이별을 맞았다.',
          '오랜 세월을 다 살아내신 끝에, 편안한 얼굴로 눈을 감으셨다. 슬픔 속에서도, 그 평온함이 작은 위로가 됐다.',
          '갑작스러운 심장마비 소식에, 온 가족이 손 쓸 겨를도 없이 황망하게 이별을 맞았다.'
        ],
        mandatory: true,
        requiresFamilyMember: ['father', 'mother', 'single-parent'],
        removeFamilyMembers: ['father', 'mother', 'single-parent']
      }
    ]
  },
  {
    id: 'oldprep-55',
    name: '노년 준비',
    ageRange: '55세',
    intro: '정년이라는 단어가 더는 남 얘기가 아니게 되는 나이. 매일 출근하던 삶이 조용히 막을 내립니다.',
    choices: [
      {
        id: 'official-retirement',
        text: '정년퇴직을 맞아 회사를 떠난다',
        deltas: { happiness: -3, wealth: -2, relationship: 2 },
        result: '마지막 출근길이, 그렇게 길게 느껴질 줄 몰랐다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'spending-severance-freely',
        text: '퇴직금으로 그동안 미뤄온 것들을 해본다',
        deltas: { happiness: 5, wealth: -4 },
        result: '늘 "나중에"라고 미뤘던 일들을, 하나씩 해치우기 시작했다.'
      },
      {
        id: 'first-monday-without-work',
        text: '출근하지 않는 첫 월요일을 맞는다',
        deltas: { happiness: -4, health: -1 },
        result: '알람을 꺼버린 아침이, 홀가분하기보다 낯설었다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'seeking-new-work',
        text: '새로운 일(재취업·재능기부)을 찾아 나선다',
        deltas: { wealth: 3, happiness: 3 },
        result: '월급보다, 갈 곳이 있다는 사실 자체가 반가웠다.',
        setOccupation: { id: 'volunteer-work', label: '🤝 재능기부/파트타임' }
      },
      {
        id: 'finding-post-retirement-job',
        text: '퇴직 후에도 계속 일할 수 있는 자리를 찾는다',
        deltas: { wealth: 5, happiness: 2 },
        result: '완전히 손을 놓지 않아도 된다는 게, 큰 위안이 됐다.'
      },
      {
        id: 'mixed-reactions-to-retirement',
        text: '은퇴 소식에 주변에서 축하와 걱정이 뒤섞여 쏟아진다',
        deltas: { relationship: 2, happiness: -1 },
        result: '축하한다는 말 뒤에 숨은 걱정이, 은근히 신경 쓰였다.',
        setOccupation: { id: 'retired', label: '🌿 은퇴자' }
      },
      {
        id: 'fame-retirement-announcement-55',
        text: '은퇴 소식이 알려지며 관심을 받는다',
        deltas: { fame: 3, happiness: 1 },
        result: '축하와 아쉬움이 섞인 인사들이, 하루 종일 이어졌다.'
      },
      {
        id: 'fame-being-replaced-55',
        text: '후임 소식에 밀려 존재감이 사라진다',
        deltas: { fame: -4, happiness: -3 },
        result: '당연한 순서인데도, 자리를 비운 게 이렇게 빠를 줄 몰랐다.'
      },
      {
        id: 'fame-farewell-tribute-55',
        text: '동료들이 마련한 송별 자리에서 주목받는다',
        deltas: { fame: 4, relationship: 2, happiness: 2 },
        result: '준비된 줄 몰랐던 자리에, 눈시울이 뜨거워졌다.'
      },
      {
        id: 'fame-quietly-exits-55',
        text: '요란하지 않게 조용히 자리를 정리한다',
        deltas: { fame: -2, happiness: 1 },
        result: '인사도 없이 나온 게 서운할 법도 한데, 오히려 홀가분했다.'
      },
      {
        id: 'fame-legacy-project-55',
        text: '마지막으로 남긴 성과가 한동안 회자된다',
        deltas: { fame: 4, happiness: 2 },
        result: '떠난 뒤에도 이름이 오르내린다는 소식이, 뿌듯하게 다가왔다.'
      },
      {
        id: 'fame-irrelevant-now-55',
        text: '이제는 관련 없는 사람 취급을 받는다',
        deltas: { fame: -3, happiness: -2 },
        result: '틀린 말은 아니었지만, 그 말이 유독 서운하게 들렸다.'
      }
    ]
  },
  {
    id: 'oldprep-56',
    name: '노년 준비',
    ageRange: '56세',
    intro: '평생 "어디 소속"으로 나를 소개하던 습관이 사라지며, 나는 누구인가를 새삼 다시 묻게 됩니다.',
    choices: [
      {
        id: 'questioning-identity',
        text: '"내가 누구인가"라는 질문을 새삼 다시 던진다',
        deltas: { happiness: -3, health: -1 },
        result: '명함 없이 나를 소개하는 법을, 처음부터 다시 배워야 했다.'
      },
      {
        id: 'discovering-hidden-talent',
        text: '새로운 취미에서 뜻밖의 재능을 발견한다',
        deltas: { happiness: 5, fame: 2 },
        result: '이 나이에 이런 걸 다 잘할 줄은, 스스로도 몰랐다.'
      },
      {
        id: 'volunteering-for-meaning',
        text: '봉사활동을 시작하며 삶의 의미를 다시 찾는다',
        deltas: { happiness: 4, relationship: 3 },
        result: '누군가에게 도움이 된다는 감각이, 오랜만에 선명했다.'
      },
      {
        id: 'post-retirement-lethargy',
        text: '무기력한 나날이 이어지며 우울감을 느낀다',
        deltas: { happiness: -5, health: -2 },
        result: '딱히 할 일이 없는 하루가, 이렇게 무거울 줄 몰랐다.'
      },
      {
        id: 'new-friction-with-spouse',
        text: '배우자와 하루 종일 붙어 지낸다',
        deltas: { relationship: -4, happiness: -2 },
        result: '서로의 하루 리듬이 이렇게 다른 줄, 이제야 알았다.',
        requiresFamilyMember: ['spouse']
      },
      {
        id: 'building-a-solo-routine',
        text: '혼자만의 루틴을 만들어 하루하루를 채워간다',
        deltas: { happiness: 3, health: 2 },
        result: '작은 규칙 몇 개가, 하루를 다시 단단하게 만들어줬다.'
      },
      {
        id: 'cataract-onset',
        text: '밝은 화면의 스마트폰과 TV를 오래 들여다본다',
        deltas: { health: -4, happiness: -2 },
        result: '안경을 써도 뿌옇게 보이는 세상이 낯설었다.',
        addCondition: { id: 'cataract', label: '👁️ 백내장' }
      },
      {
        id: 'fame-fading-before-retirement',
        text: '은퇴를 앞두고 관심에서 서서히 잊혀져 간다',
        deltas: { fame: -5, happiness: -2 },
        result: '화려했던 이름 석 자가, 조금씩 낯설어지고 있었다.'
      },
      {
        id: 'consultant-well-received-insight',
        text: '오랜 경력에서 우러난 통찰로 큰 호응을 얻는다',
        deltas: { fame: 4, happiness: 3 },
        result: '몇 마디 안 되는 조언에, 사람들 눈빛이 달라지는 걸 봤다.',
        requiresOccupation: ['consultant']
      }
    ]
  },
  {
    id: 'oldprep-57',
    name: '노년 준비',
    ageRange: '57세',
    intro: '직장이라는 울타리 없이 새로운 사람들과 관계를 다시 엮어가야 하는 시기입니다.',
    choices: [
      {
        id: 'joining-local-community',
        text: '동네 커뮤니티·모임에 나가며 새 친구를 사귄다',
        deltas: { relationship: 5, happiness: 4 },
        result: '나이도, 살아온 길도 다른 사람들과 새로 친구가 됐다.'
      },
      {
        id: 'fading-work-connections',
        text: '오랜 직장 동료들과의 인연이 자연스레 옅어진다',
        deltas: { relationship: -4, happiness: -2 },
        result: '한때 매일 보던 얼굴들이, 어느새 연락이 뜸해졌다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'reunion-nostalgia',
        text: '동창 모임에 나간다',
        deltas: { relationship: 4, happiness: 3 },
        result: '수십 년 만인데도, 말투 하나는 그대로였다.'
      },
      {
        id: 'staying-home-avoiding-people',
        text: '낯선 사람들과 어울리는 대신 집에 머문다',
        deltas: { happiness: -3, relationship: -2 },
        result: '나가는 것보다, 집에 있는 게 자꾸 더 편해졌다.'
      },
      {
        id: 'online-community-connection',
        text: '온라인 커뮤니티에서 또래들과 소통하는 재미를 붙인다',
        deltas: { relationship: 3, happiness: 3 },
        result: '화면 너머였지만, 대화만큼은 진심으로 즐거웠다.'
      },
      {
        id: 'couples-gathering-energy',
        text: '부부 동반 모임에 나가며 새로운 활력을 얻는다',
        deltas: { relationship: 5, happiness: 4, wealth: -2 },
        result: '오랜만에 둘이 함께 웃을 일이 생겼다.'
      },
      {
        id: 'osteoporosis-onset',
        text: '운동을 멀리하고 실내에서만 지내는 날이 많아진다',
        deltas: { health: -4, wealth: -1 },
        result: '뼈도 나이를 먹는다는 걸, 숫자로 마주하니 실감이 났다.',
        addCondition: { id: 'osteoporosis', label: '🦴 골다공증' }
      },
      {
        id: 'team-lead-learning-leadership',
        text: '힘들어하는 팀원을 다독이며 리더십을 배운다',
        deltas: { relationship: 3, happiness: 2 },
        result: '가르치려다, 오히려 내가 더 배우고 있다는 걸 깨달았다.',
        requiresOccupation: ['team-lead']
      },
      {
        id: 'oldprep-flea-market-57',
        text: '안 쓰는 물건을 모아 동네 벼룩시장에 나가본다',
        deltas: { wealth: 2, happiness: 2, relationship: 1 },
        result: '잡동사니인 줄 알았는데, 제법 짭짤했다.'
      },
      {
        id: 'oldprep-community-class-fee-57',
        text: '배운 걸 살려 동네에서 작은 강습을 열어본다',
        deltas: { wealth: 3, happiness: 2 },
        result: '수강료가 쌓이는 재미에 매주가 기다려졌다.'
      },
      {
        id: 'oldprep-old-savings-review-57',
        text: '잊고 지내던 통장들을 하나씩 정리해본다',
        deltas: { wealth: 3 },
        result: '여기저기 흩어져 있던 돈이 생각보다 많았다.'
      },
      {
        id: 'oldprep-part-time-consulting-57',
        text: '은퇴 전 마지막으로 자문 요청을 받아들인다',
        deltas: { wealth: 4, happiness: 1 },
        result: '경력이 아직 쓸모 있다는 확인이자, 짭짤한 부수입이었다.'
      },
      {
        id: 'oldprep-golden-handshake-57',
        text: '명예퇴직 조건을 검토하고 서명한다',
        deltas: { wealth: 6, happiness: -2 },
        result: '서운함보다, 통장에 찍힌 숫자가 먼저 눈에 들어왔다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'oldprep-selling-commute-car-57',
        text: '출퇴근길에 쓰던 차를 처분한다',
        deltas: { wealth: 3 },
        result: '이제 필요 없어진 차가, 마지막으로 한몫했다.'
      },
      {
        id: 'lottery-check-57',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'oldprep-58',
    name: '노년 준비',
    ageRange: '58세',
    intro: '자녀 세대가 이제 자기 가정을 꾸리며, 가족 안에서의 내 역할도 조금씩 달라집니다.',
    choices: [
      {
        id: 'becoming-a-grandparent',
        text: '손주가 태어나 할머니·할아버지가 된다',
        deltas: { happiness: 6, relationship: 4 },
        result: '작은 손을 처음 잡던 순간, 말로는 설명이 안 됐다.',
        requiresFamilyMember: ['child'],
        requiresNoFamilyMember: ['grandchild'],
        addFamilyMembers: [{ id: 'grandchild', label: '👶 손주' }]
      },
      {
        id: 'babysitting-grandchild',
        text: '손주를 돌보며 다시 육아의 세계로 들어간다',
        deltas: { health: -4, happiness: 3, relationship: 3 },
        result: '몸은 힘들었지만, 예전엔 못 느꼈던 여유로 아이를 봐줄 수 있었다.',
        requiresFamilyMember: ['child'],
        requiresNoFamilyMember: ['grandchild'],
        addFamilyMembers: [{ id: 'grandchild', label: '👶 손주' }]
      },
      {
        id: 'keeping-healthy-distance',
        text: '자녀 가족과 적당한 거리를 유지하려 애쓴다',
        deltas: { relationship: 1, happiness: 2 },
        result: '너무 가깝지도, 너무 멀지도 않은 거리를 찾는 데 시간이 걸렸다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'grandchild-daily-joy',
        text: '손주와 자주 시간을 보낸다',
        deltas: { happiness: 5, relationship: 4 },
        result: '전화기 속 사진 한 장에도, 하루 종일 웃을 수 있었다.',
        requiresFamilyMember: ['child'],
        requiresNoFamilyMember: ['grandchild'],
        addFamilyMembers: [{ id: 'grandchild', label: '👶 손주' }]
      },
      {
        id: 'continued-financial-support-for-kids',
        text: '자녀에게 경제적으로 계속 도움을 주며 통장이 준다',
        deltas: { wealth: -5, relationship: 2 },
        result: '내 노후보다 자식 걱정이 먼저 앞서는 건, 어쩔 수 없었다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'new-role-in-family-gatherings',
        text: '가족 모임의 중심에서 예전과 다른 역할을 맡는다',
        deltas: { relationship: 3, happiness: 2 },
        result: '이끄는 자리에서, 지켜보는 자리로 슬며시 옮겨갔다.'
      },
      {
        id: 'cataract-heal',
        text: '백내장 수술을 받고 시야가 다시 선명해진다',
        deltas: { health: 5, wealth: -3 },
        result: '뿌옇던 세상이 다시 또렷해진 순간, 색깔마저 새로 보이는 것 같았다.',
        requiresCondition: 'cataract',
        removeCondition: 'cataract'
      },
      {
        id: 'relationship-acquaintances-drift-away',
        text: '친했던 지인들과 하나둘 연락이 끊긴다',
        deltas: { relationship: -6, happiness: -2 },
        result: '명절에도, 이제는 안부를 물을 사람이 줄어 있었다.'
      },
      {
        id: 'career-pivot-new-vitality',
        text: '새로운 도전이 인생에 활력을 불어넣는다',
        deltas: { happiness: 5, health: 2 },
        result: '멈춰 있던 줄 알았던 삶이, 다시 움직이기 시작했다.',
        requiresOccupation: ['career-pivot']
      },
      {
        id: 'volunteer-rich-in-spirit',
        text: '작은 보수에도 마음만은 부자가 된 기분을 느낀다',
        deltas: { happiness: 4 },
        result: '통장은 얇아도, 마음이 이렇게 두둑할 수 있다는 걸 처음 알았다.',
        requiresOccupation: ['volunteer-work']
      },
      {
        id: 'fame-farewell-coverage-58',
        text: '은퇴를 앞두고 언론의 취재 요청을 받는다',
        deltas: { fame: 5, happiness: 2 },
        result: '마지막이라는 말이 붙자, 평소보다 질문 하나하나가 더 깊게 다가왔다.'
      },
      {
        id: 'fame-being-forgotten-58',
        text: '예전 동료들에게서 소식이 뜸해진 걸 느낀다',
        deltas: { fame: -4, happiness: -3 },
        result: '먼저 연락해볼까 몇 번을 망설이다, 그냥 휴대폰을 내려놓았다.'
      },
      {
        id: 'fame-retrospective-feature-58',
        text: '지난 경력을 돌아보는 특집에 소개된다',
        deltas: { fame: 4, happiness: 2 },
        result: '지나온 시간을 남이 정리해주는 걸 보니, 기분이 묘했다.'
      },
      {
        id: 'fame-replaced-in-spotlight-58',
        text: '후임에게 자리를 완전히 넘긴다',
        deltas: { fame: -5, happiness: -3 },
        result: '당연한 순서라 여기면서도, 마음 한켠이 허전한 건 어쩔 수 없었다.'
      },
      {
        id: 'fame-legacy-recognition-58',
        text: '업계에 남긴 발자취를 인정받는다',
        deltas: { fame: 4, happiness: 3 },
        result: '거창한 말은 아니었지만, 오래 들어온 어떤 칭찬보다 크게 남았다.'
      },
      {
        id: 'fame-name-forgotten-58',
        text: '새로 온 사람들이 이름조차 모른다는 걸 깨닫는다',
        deltas: { fame: -3, happiness: -2 },
        result: '당연한 일이라 되뇌면서도, 소개하는 말이 조금 길어졌다.'
      }
    ]
  },
  {
    id: 'oldprep-59',
    name: '노년 준비',
    ageRange: '59세',
    intro: '건강이 더 이상 당연한 게 아니라는 걸 받아들이고, 본격적으로 몸을 챙기기 시작하는 나이입니다.',
    choices: [
      {
        id: 'morning-walk-routine',
        text: '매일 아침 산책을 루틴으로 삼는다',
        deltas: { health: 5, happiness: 2 },
        result: '별거 아닌 걸음이, 하루의 기분을 바꿔놓았다.'
      },
      {
        id: 'starting-supplements',
        text: '건강기능식품과 영양제를 하나둘 챙기기 시작한다',
        deltas: { health: 3, wealth: -2 },
        result: '식탁 한쪽이 어느새 약통들로 채워졌다.'
      },
      {
        id: 'more-frequent-checkups',
        text: '정기 건강검진을 예전보다 자주 받는다',
        deltas: { health: 4, wealth: -2 },
        result: '미리 아는 게 낫다는 걸, 이제는 안다.'
      },
      {
        id: 'reducing-activity-due-to-stamina',
        text: '체력 저하를 실감하며 활동량을 줄인다',
        deltas: { health: -3, happiness: -1 },
        result: '예전만큼 움직이지 못하는 게, 못내 아쉬웠다.'
      },
      {
        id: 'reviewing-medical-insurance',
        text: '노년을 위한 실손보험·의료 계획을 재점검한다',
        deltas: { wealth: -2, happiness: 2 },
        result: '서류를 다시 훑어보는 것만으로도, 마음이 한결 든든해졌다.'
      },
      {
        id: 'accepting-physical-limits',
        text: '몸이 예전 같지 않다는 걸 받아들이고 무리하지 않는다',
        deltas: { happiness: 3, health: 2 },
        result: '버티기보다 맞춰가는 법을, 천천히 익혀갔다.'
      },
      {
        id: 'retired-every-day-sunday',
        text: '매일이 일요일 같은 생활 리듬에 적응해간다',
        deltas: { happiness: 4 },
        result: '요일 개념이 흐려질 때쯤, 비로소 은퇴가 실감 났다.',
        requiresOccupation: ['retired']
      },
      {
        id: 'liquidating-old-investment-59',
        text: '미뤄뒀던 투자 상품을 정리해본다',
        deltas: { wealth: 4, happiness: 1 },
        result: '예상보다 쏠쏠한 금액이 통장에 들어왔다.'
      },
      {
        id: 'part-time-hobby-income-59',
        text: '소일거리 삼아 작은 부업을 시작한다',
        deltas: { wealth: 2, happiness: 2 },
        result: '큰돈은 아니어도, 스스로 번 돈이라는 게 뿌듯했다.'
      },
      {
        id: 'old-insurance-matures-59',
        text: '오래전 들어둔 보험 하나의 만기 통지서를 받는다',
        deltas: { wealth: 3 },
        result: '젊은 날의 선택이, 이렇게 도움이 될 줄 몰랐다.'
      }
    ]
  },
  {
    id: 'oldprep-60',
    name: '노년 준비',
    ageRange: '60세',
    intro: '환갑. 예순 해를 지나온 삶을 가족과 함께 돌아보는 해입니다.',
    choices: [
      {
        id: 'big-sixtieth-celebration',
        text: '환갑을 맞아 가족·친지가 모여 크게 잔치를 연다',
        deltas: { happiness: 6, relationship: 5, wealth: -4 },
        result: '오랜만에 온 가족이 한자리에 모인 것만으로도, 마음이 벅찼다.'
      },
      {
        id: 'mixed-feelings-turning-sixty',
        text: '예순이라는 숫자 앞에서 만감이 교차한다',
        deltas: { happiness: -2, relationship: 1 },
        result: '축하 인사를 받으면서도, 마음 한쪽은 복잡했다.'
      },
      {
        id: 'dream-trip-for-sixtieth',
        text: '환갑 기념으로 평생 가보고 싶던 곳으로 여행을 떠난다',
        deltas: { happiness: 6, wealth: -6 },
        result: '더 늦기 전에 다녀오길 잘했다는 생각이 내내 들었다.'
      },
      {
        id: 'quiet-family-day',
        text: '조용히 가족끼리만 소박하게 하루를 보낸다',
        deltas: { happiness: 4, relationship: 3 },
        result: '거창한 잔치보다, 이런 하루가 오히려 더 오래 남았다.'
      },
      {
        id: 'reflecting-on-sixty-years',
        text: '지난 60년을 돌아보며 담담히 다음 10년을 그려본다',
        deltas: { happiness: 3, health: 1 },
        result: '길다면 길었던 시간을, 몇 문장으로는 다 담을 수 없었다.'
      },
      {
        id: 'confidence-in-still-being-strong',
        text: '여전히 정정한지 스스로 확인해본다',
        deltas: { happiness: 4, health: 3 },
        result: '나이는 숫자일 뿐이라는 말이, 이제는 조금 실감이 났다.'
      },
      {
        id: 'osteoporosis-heal',
        text: '꾸준한 칼슘 섭취와 운동으로 골밀도가 개선된다',
        deltas: { health: 5, wealth: -2 },
        result: '매일 챙겨 먹은 칼슘과 걷기 운동이, 헛되지 않았다.',
        requiresCondition: 'osteoporosis',
        removeCondition: 'osteoporosis'
      },
      {
        id: 'fame-generational-gap-controversy',
        text: '젊은 세대와의 감각 차이로 구설수에 오른다',
        deltas: { fame: -6, relationship: -2 },
        result: '좋은 의도로 한 말이, 전혀 다르게 받아들여졌다.'
      },
      {
        id: 'severance-payout',
        text: '퇴직금을 목돈으로 받는다',
        deltas: { wealth: 10, happiness: 3 },
        result: '평생 일한 값이 통장에 찍히던 순간, 만감이 교차했다.',
        addAsset: { id: 'severance-payout', label: '💰 퇴직금', type: 'cash' }
      },
      {
        id: 'vacation-home-purchase',
        text: '여유 자금으로 별장을 마련한다',
        deltas: { wealth: -10, happiness: 5 },
        result: '주말마다 내려갈 곳이 생겼다는 것만으로도, 마음이 한결 가벼워졌다.',
        addAsset: { id: 'vacation-home', label: '🏖️ 별장', type: 'realestate' }
      },
      {
        id: 'downsizing-to-compact-car',
        text: '차를 작고 실속 있는 걸로 바꾼다',
        deltas: { wealth: 3, happiness: 1 },
        result: '크고 화려한 차보다, 이제는 이 편이 훨씬 편했다.',
        addAsset: { id: 'compact-car', label: '🚙 소형차', type: 'movable' }
      },
      {
        id: 'team-lead-review-season-stress',
        text: '인사 평가철을 맞는다',
        deltas: { health: -3, happiness: -3 },
        result: '누군가의 1년을 숫자로 매겨야 한다는 게, 해마다 더 무거워졌다.',
        requiresOccupation: ['team-lead']
      },
      {
        id: 'consultant-work-dries-up',
        text: '일감이 뚝 끊긴 시기를 보낸다',
        deltas: { wealth: -4, happiness: -3 },
        result: '전화벨이 울리지 않는 날들이, 생각보다 길게 이어졌다.',
        requiresOccupation: ['consultant']
      },
      {
        id: 'lottery-buy-60',
        text: '인생 한 방을 노리며 연금복권을 사본다',
        deltas: { happiness: 1 },
        result: '노후에 보탬이 될지도 모른다는 기대를 품었다.',
        addAsset: { id: 'lottery-ticket', label: '🎟️ 복권', type: 'movable' }
      },
      {
        id: 'lottery-skip-60',
        text: '차라리 그 돈을 저축하기로 한다',
        deltas: { happiness: 1 },
        result: '티끌 모아 태산이라는 말을 되새겼다.'
      },
      {
        id: 'late-life-new-lover',
        text: '인생 후반부, 마음이 통하는 새로운 사람을 만난다',
        deltas: { happiness: 4, relationship: 4 },
        result: '이 나이에 이런 감정을 다시 느낄 줄은, 스스로도 몰랐다.',
        addAcquaintance: { relation: 'lover', label: '💕 연인' }
      }
    ]
  },
  {
    id: 'oldprep-61',
    name: '노년 준비',
    ageRange: '61세',
    intro: '은퇴 이후의 삶이 서서히 새로운 리듬을 찾아가는 시기입니다.',
    choices: [
      {
        id: 'new-life-rhythm-settles',
        text: '새로운 삶의 리듬이 완전히 자리 잡는다',
        deltas: { happiness: 4, health: 2 },
        result: '더는 허둥대지 않는 하루가, 이제는 당연해졌다.'
      },
      {
        id: 'neighborhood-strolls',
        text: '동네 마실을 다니며 소소한 낙을 찾는다',
        deltas: { happiness: 3, relationship: 2 },
        result: '별거 아닌 산책길에서도, 매일 새로운 게 눈에 들어왔다.'
      },
      {
        id: 'reviving-youthful-side-hustle',
        text: '젊을 때 꿈꾸던 소일거리를 다시 시작한다',
        deltas: { happiness: 4, wealth: -2 },
        result: '늦었다고 생각했던 일이, 지금 해보니 딱 알맞은 때였다.'
      },
      {
        id: 'missing-the-old-office',
        text: '무료함에 지쳐 예전 직장 생각이 자꾸 난다',
        deltas: { happiness: -3, relationship: -1 },
        result: '그렇게 벗어나고 싶던 곳이, 가끔은 그리웠다.',
        requiresOccupation: COMPANY_OCCUPATION_IDS
      },
      {
        id: 'grandchild-daycare-duty',
        text: '손주 육아를 도맡으며 하루가 순식간에 지나간다',
        deltas: { health: -3, happiness: 3, relationship: 3 },
        result: '힘에 부쳤지만, 그만큼 하루하루가 꽉 찼다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'gardening-hobby',
        text: '텃밭·화분 가꾸기 같은 잔잔한 취미에 빠진다',
        deltas: { happiness: 4, health: 2 },
        result: '작은 화분 하나 돌보는 일이, 마음까지 차분하게 만들었다.'
      },
      {
        id: 'shingles-onset',
        text: '무리한 일정을 소화하며 잠을 줄인다',
        deltas: { health: -6, happiness: -3 },
        result: '피부에 닿는 옷깃마저 아플 줄은 몰랐다.',
        addCondition: { id: 'shingles', label: '🔥 대상포진' }
      },
      {
        id: 'volunteer-body-not-what-it-was',
        text: '몸이 예전 같지 않아 파트타임 일도 버겁게 느껴진다',
        deltas: { health: -3 },
        result: '가벼운 일이라 여겼던 것도, 이제는 하루를 다 쓰게 만들었다.',
        requiresOccupation: ['volunteer-work']
      },
      {
        id: 'oldprep-handmade-crafts-market-61',
        text: '취미로 만든 공예품을 장터에 내놓는다',
        deltas: { wealth: 2, happiness: 2 },
        result: '손으로 만든 것들이, 뜻밖에 하나둘 팔려나갔다.'
      },
      {
        id: 'oldprep-retirement-fund-lumpsum-61',
        text: '퇴직연금을 일시금으로 받기로 한다',
        deltas: { wealth: 7 },
        result: '매달 나눠 받는 대신, 한 번에 크게 받는 쪽을 택했다.'
      },
      {
        id: 'oldprep-frugal-savings-61',
        text: '생활 규모를 줄이며 남는 돈을 따로 모아본다',
        deltas: { wealth: 2, happiness: 1 },
        result: '씀씀이를 줄이니, 통장이 조금씩 두툼해졌다.'
      },
      {
        id: 'oldprep-land-rental-61',
        text: '갖고 있던 땅 한 뙈기를 임대로 내놓는다',
        deltas: { wealth: 3 },
        result: '묵혀뒀던 땅이, 매달 조금씩 보탬이 됐다.'
      },
      {
        id: 'oldprep-selling-golf-membership-61',
        text: '이제 안 쓰는 골프 회원권을 처분한다',
        deltas: { wealth: 5 },
        result: '오래 묵혀둔 회원권이, 마지막으로 값을 했다.'
      },
      {
        id: 'oldprep-family-business-stake-61',
        text: '자녀의 사업을 도와주고 지분을 조금 받는다',
        deltas: { wealth: 3, relationship: 2 },
        result: '작은 지분이지만, 함께한다는 뿌듯함이 더 컸다.'
      },
      {
        id: 'lottery-check-61',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'oldprep-62',
    name: '노년 준비',
    ageRange: '62세',
    intro: '연금이라는 단어가 현실적인 숫자로 다가오기 시작하는 나이입니다.',
    choices: [
      {
        id: 'starting-pension',
        text: '국민연금 수령을 시작하며 새로운 수입 흐름이 생긴다',
        deltas: { wealth: 4, happiness: 2 },
        result: '매달 들어오는 돈이, 새삼 든든하게 느껴졌다.'
      },
      {
        id: 'tightening-budget-on-pension',
        text: '연금만으로는 부족해 씀씀이를 줄인다',
        deltas: { wealth: 2, happiness: -3 },
        result: '아껴 쓰는 게 습관이 되기까지, 시간이 조금 걸렸다.'
      },
      {
        id: 'private-pension-pays-off',
        text: '젊을 때 들어둔 개인연금을 받기 시작한다',
        deltas: { wealth: 5, happiness: 3 },
        result: '그때의 작은 선택이, 지금 이렇게 돌아올 줄 몰랐다.'
      },
      {
        id: 'disappointing-pension-amount',
        text: '예상보다 적은 연금액에 실망한다',
        deltas: { happiness: -4, wealth: 1 },
        result: '계산기를 두드릴수록, 한숨이 늘었다.'
      },
      {
        id: 'reemployment-for-extra-income',
        text: '재취업으로 연금 외 소득을 보탠다',
        deltas: { wealth: 4, health: -2 },
        result: '다시 일한다는 게, 생각보다 나쁘지 않았다.',
        requiresOccupation: ['retired'],
        setOccupation: { id: 're-employed', label: '💼 재취업' }
      },
      {
        id: 'gratitude-for-financial-ease',
        text: '돈 걱정 없이 지낼 수 있음에 감사함을 느낀다',
        deltas: { happiness: 5, relationship: 2 },
        result: '많지 않아도 충분하다는 걸, 이제는 안다.'
      },
      {
        id: 'relationship-old-friend-permanent-rift',
        text: '오랜 벗과 사소한 일로 다시는 안 볼 사이가 된다',
        deltas: { relationship: -7, happiness: -3 },
        result: '몇십 년 지기였다는 게 무색하게, 화해할 틈도 없이 멀어졌다.'
      },
      {
        id: 'retired-sudden-boredom',
        text: '갑자기 늘어난 시간에 무료함을 느낀다',
        deltas: { happiness: -3 },
        result: '바쁘게 살고 싶었던 순간들이, 이렇게 그리워질 줄 몰랐다.',
        requiresOccupation: ['retired']
      },
      {
        id: 'fame-recognized-in-public-62',
        text: '동네에서 알아보는 사람을 우연히 마주친다',
        deltas: { fame: 2, happiness: 3 },
        result: '오랜만에 듣는 반가운 인사에, 걸음이 절로 가벼워졌다.'
      },
      {
        id: 'fame-social-silence-62',
        text: 'SNS에 올린 소식에 반응이 뜸해진 걸 느낀다',
        deltas: { fame: -3, happiness: -2 },
        result: '예전 같지 않은 숫자를 보며, 괜히 화면을 몇 번 더 넘겨봤다.'
      },
      {
        id: 'fame-reunion-spotlight-62',
        text: '동창회에서 옛 활약을 추억하며 이야기 중심에 선다',
        deltas: { fame: 3, relationship: 2, happiness: 2 },
        result: '다들 그때 얘기를 꺼내자, 잊고 있던 순간들이 새삼 생생해졌다.'
      },
      {
        id: 'fame-anonymous-life-62',
        text: '아무도 못 알아보는 일상에 조금씩 적응해간다',
        deltas: { fame: -4, happiness: -1 },
        result: '불편함보다 오히려 홀가분함이 조금씩 자리를 잡아갔다.'
      },
      {
        id: 'fame-documentary-request-62',
        text: '다큐멘터리 출연 제안을 받는다',
        deltas: { fame: 5, happiness: 2 },
        result: '카메라 앞에 다시 서보니, 옛 감각이 낯설게 되살아났다.'
      },
      {
        id: 'fame-comparison-to-past-62',
        text: '예전에 잘나가지 않았냐는 말을 듣는다',
        deltas: { fame: -2, happiness: -2 },
        result: '칭찬인 듯 아닌 듯한 그 말이, 오래도록 귓가에 맴돌았다.'
      }
    ]
  },
  {
    id: 'oldprep-63',
    name: '노년 준비',
    ageRange: '63세',
    intro: '취미와 가족, 두 가지 모두에서 깊이가 더해지는 시기입니다.',
    choices: [
      {
        id: 'watching-grandchild-grow',
        text: '손주가 훌쩍 커가는 모습을 지켜본다',
        deltas: { happiness: 5, relationship: 3 },
        result: '작던 아이가 어느새 저만큼 자란 게, 믿기지 않았다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'mastering-old-hobby',
        text: '오래된 취미를 전문가 수준으로 갈고닦는다',
        deltas: { happiness: 4, fame: 3 },
        result: '수십 년 쌓아온 손끝의 감각이, 비로소 빛을 발했다.'
      },
      {
        id: 'leading-a-hobby-club',
        text: '동호회 회장을 맡아 새로운 책임을 진다',
        deltas: { relationship: 4, fame: 2, happiness: -1 },
        result: '작은 모임 하나 이끄는 일도, 나름의 무게가 있었다.'
      },
      {
        id: 'generation-gap-with-grandchild',
        text: '손주와 세대 차이를 느끼며 서운해한다',
        deltas: { happiness: -3, relationship: -1 },
        result: '무슨 말인지 못 알아듣는 순간들이, 조금씩 늘었다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'sorting-old-photos',
        text: '옛 사진을 정리하며 지나온 삶을 되짚는다',
        deltas: { happiness: 2, relationship: 2 },
        result: '빛바랜 사진 한 장에도, 그 시절이 고스란히 담겨 있었다.'
      },
      {
        id: 'travel-club-adventures',
        text: '여행 동호회에 가입해 전국을 누빈다',
        deltas: { happiness: 5, wealth: -4 },
        result: '이 나이에도 새로운 곳을 다닐 수 있다는 게, 새삼 즐거웠다.'
      },
      {
        id: 'hearing-loss-onset',
        text: '이어폰 소리를 크게 키운 채 오래 사용한다',
        deltas: { health: -4, relationship: -1 },
        result: '못 알아들어 되묻는 일이, 조금씩 잦아졌다.',
        addCondition: { id: 'hearing-loss', label: '👂 난청' }
      },
      {
        id: 'career-pivot-transition-costs',
        text: '전환에 든 비용 때문에 살림이 빠듯해진다',
        deltas: { wealth: -4 },
        result: '새로 시작하는 데도, 이렇게 돈이 많이 드는 줄 몰랐다.',
        requiresOccupation: ['career-pivot']
      },
      {
        id: 'pre-retirement-colleague',
        text: '은퇴를 앞두고 함께 일해온 동료와 유독 가까워진다',
        deltas: { happiness: 3, relationship: 2 },
        result: '떠날 날이 가까워질수록, 함께한 시간의 무게가 더 크게 느껴졌다.',
        requiresAnyOccupation: true,
        addAcquaintance: { relation: 'colleague', label: '💼 동료' }
      }
    ]
  },
  {
    id: 'oldprep-64',
    name: '노년 준비',
    ageRange: '64세',
    intro: '몸의 변화를 있는 그대로 받아들이는 연습이 필요한 나이입니다.',
    choices: [
      {
        id: 'anxious-over-checkup-results',
        text: '건강검진 결과 하나하나에 예민해진다',
        deltas: { happiness: -3, health: -1 },
        result: '숫자 하나에 하루 기분이 오르락내리락했다.'
      },
      {
        id: 'accepting-bodys-signals',
        text: '몸이 보내는 신호를 순순히 받아들이기 시작한다',
        deltas: { happiness: 3, health: 2 },
        result: '거스르기보다 맞춰가는 게, 훨씬 편하다는 걸 알았다.'
      },
      {
        id: 'pride-in-good-health',
        text: '또래보다 건강한 몸 상태에 자부심을 느낀다',
        deltas: { happiness: 4, health: 3 },
        result: '건강검진 결과지를 받아 들고, 어깨가 절로 펴졌다.'
      },
      {
        id: 'managing-chronic-condition',
        text: '만성 질환 관리를 위해 매일 약을 챙긴다',
        deltas: { health: 2, wealth: -2 },
        result: '아침마다 약을 챙기는 게, 어느새 익숙한 일과가 됐다.'
      },
      {
        id: 'exercise-group-together',
        text: '운동 모임에 나가며 건강을 다 함께 챙긴다',
        deltas: { health: 4, relationship: 3 },
        result: '혼자 하면 작심삼일이던 운동이, 함께 하니 꾸준해졌다.',
        requiresNoCondition: ['back-pain', 'knee-pain']
      },
      {
        id: 'cautiously-reducing-activity',
        text: '몸에 무리가 갈까 조심하며 활동을 줄인다',
        deltas: { health: 1, happiness: -2 },
        result: '하고 싶은 걸 참는 것도, 나름의 용기가 필요했다.'
      },
      {
        id: 'shingles-heal',
        text: '꾸준한 치료 끝에 대상포진 통증이 씻은 듯 가라앉는다',
        deltas: { health: 5, happiness: 2 },
        result: '다시 옷깃이 스쳐도 아무렇지 않은 게, 이렇게 반가울 일이었다.',
        requiresCondition: 'shingles',
        removeCondition: 'shingles'
      },
      {
        id: 'fame-old-content-recriticized',
        text: '예전 발언·행동이 재조명되며 다시 비판받는다',
        deltas: { fame: -7, happiness: -3 },
        result: '시대가 달라졌다는 걸, 뒤늦게야 실감했다.'
      },
      {
        id: 'consultant-student-growth-fulfillment',
        text: '제자·수강생의 성장을 지켜본다',
        deltas: { happiness: 4, relationship: 2 },
        result: '내가 건넨 말 한마디가 누군가의 길이 되는 걸 지켜보는 일이었다.',
        requiresOccupation: ['consultant']
      },
      {
        id: 'volunteer-new-connections',
        text: '재능기부로 만난 사람들과 새로운 인연을 쌓는다',
        deltas: { relationship: 4 },
        result: '보수 없이 만난 사이인데, 오히려 마음은 더 깊어졌다.',
        requiresOccupation: ['volunteer-work']
      }
    ]
  },
  {
    id: 'oldprep-65',
    name: '노년 준비',
    ageRange: '65세',
    intro: '법정 노인 연령. 사회가 부르는 호칭이 바뀌는 걸 마주하게 됩니다.',
    choices: [
      {
        id: 'senior-benefits-begin',
        text: '법정 노인 연령이 되어 각종 경로 우대를 받는다',
        deltas: { happiness: 3, wealth: 2 },
        result: '할인받는 게 반갑기도, 낯설기도 했다.'
      },
      {
        id: 'uncomfortable-with-senior-label',
        text: '"노인"이라는 호칭이 낯설고 서운하게 느껴진다',
        deltas: { happiness: -4, relationship: -1 },
        result: '마음은 그대로인데, 불리는 말만 훌쩍 앞서갔다.'
      },
      {
        id: 'first-visit-to-senior-center',
        text: '경로당에 처음 나가보며 새로운 인연을 만든다',
        deltas: { relationship: 4, happiness: 3 },
        result: '문턱을 넘기까지가 어려웠지, 막상 들어가니 편안했다.'
      },
      {
        id: 'free-subway-adventures',
        text: '지하철 무임승차로 여기저기 나들이를 다닌다',
        deltas: { happiness: 4, wealth: 1 },
        result: '교통비 걱정 없이 떠나는 하루 나들이가, 소소하게 즐거웠다.'
      },
      {
        id: 'not-ready-to-be-called-old',
        text: '아직 스스로를 노인이라 부르고 싶지 않다',
        deltas: { happiness: -2, health: 1 },
        result: '숫자와 마음 사이의 거리가, 생각보다 멀었다.'
      },
      {
        id: 'age-is-just-a-number',
        text: '나이는 숫자일 뿐이라며 활기차게 지낸다',
        deltas: { happiness: 5, health: 3 },
        result: '마음가짐 하나로, 걸음걸이부터 달라지는 기분이었다.'
      },
      {
        id: 'diabetes-onset',
        text: '단 음식과 불규칙한 식사를 즐긴다',
        deltas: { health: -6, happiness: -2, wealth: -2 },
        result: '좋아하던 단 음식들과 하나씩 거리를 둬야 했다.',
        addCondition: { id: 'diabetes', label: '🍬 당뇨병' }
      },
      {
        id: 'retired-diving-into-hobbies',
        text: '그동안 못 했던 취미 생활에 푹 빠진다',
        deltas: { happiness: 5, health: 2 },
        result: '미뤄뒀던 취미가, 뒤늦게 인생에서 가장 큰 즐거움이 됐다.',
        requiresOccupation: ['retired']
      },
      {
        id: 're-employed-rookie-again',
        text: '젊은 동료들 사이에서 다시 신입이 된 기분을 느낀다',
        deltas: { happiness: -2 },
        result: '나이는 가장 많은데, 자리는 가장 낮은 게 새삼스러웠다.',
        requiresOccupation: ['re-employed']
      },
      {
        id: 'lottery-check-65',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      },
      {
        id: 'fame-retirement-life-feature-65',
        text: '은퇴 후 일상을 다룬 기사에 소개된다',
        deltas: { fame: 3, happiness: 2 },
        result: '평범한 하루가 남의 눈엔 특별해 보인다는 게, 새삼스러웠다.'
      },
      {
        id: 'fame-forgotten-by-colleagues-65',
        text: '예전 동료들의 연락이 완전히 끊긴다',
        deltas: { fame: -4, happiness: -2, relationship: -1 },
        result: '먼저 연락해볼까 몇 번을 망설이다, 결국 그만두었다.'
      },
      {
        id: 'fame-hobby-community-recognition-65',
        text: '취미 모임에서 실력을 인정받아 알려진다',
        deltas: { fame: 3, happiness: 2 },
        result: '뒤늦게 시작한 일로 이름이 알려질 줄은, 생각도 못 했다.'
      },
      {
        id: 'fame-outdated-skills-65',
        text: '가진 기술·지식이 낡았다는 말을 듣는다',
        deltas: { fame: -3, happiness: -2 },
        result: '세상이 그새 얼마나 바뀌었는지, 새삼 실감이 났다.'
      },
      {
        id: 'fame-senior-mentor-65',
        text: '후배들에게 조언을 구하는 자리가 늘어난다',
        deltas: { fame: 3, relationship: 2 },
        result: '묻는 말에 답하다 보니, 잊고 있던 경험들이 하나둘 되살아났다.'
      },
      {
        id: 'fame-passed-over-65',
        text: '행사에 초대받지 못하고 소외된다',
        deltas: { fame: -3, happiness: -3 },
        result: '소식을 뒤늦게 전해 듣고서야, 초대받지 못했다는 걸 알았다.'
      }
    ]
  },
  {
    id: 'oldprep-66',
    name: '노년 준비',
    ageRange: '66세',
    intro: '오랜 세월을 함께한 배우자와의 관계를 다시 들여다보게 되는 나이입니다.',
    choices: [
      {
        id: 'gratitude-for-long-marriage',
        text: '오랜 결혼 생활을 돌아보며 배우자에게 새삼 고마움을 느낀다',
        deltas: { relationship: 5, happiness: 4 },
        result: '수십 년을 함께한다는 게, 얼마나 대단한 일인지 새삼 느꼈다.',
        requiresFamilyMember: ['spouse']
      },
      {
        id: 'considering-late-divorce',
        text: '황혼 이혼을 진지하게 고민한다',
        deltas: { relationship: -5, happiness: -2 },
        result: '이제 와서, 라는 말과 지금이라도, 라는 말 사이에서 흔들렸다.'
      },
      {
        id: 'respecting-each-others-time',
        text: '부부가 각자의 시간을 존중하는 법을 익힌다',
        deltas: { relationship: 3, happiness: 3 },
        result: '붙어 있지 않아도 가까울 수 있다는 걸, 이제야 알았다.'
      },
      {
        id: 'frequent-spousal-friction',
        text: '배우자의 잔소리에 자주 부딪힌다',
        deltas: { relationship: -3, happiness: -2 },
        result: '같은 말도, 나이가 드니 더 날카롭게 들렸다.',
        requiresFamilyMember: ['spouse']
      },
      {
        id: 'new-shared-hobby',
        text: '부부가 함께 새로운 취미를 시작한다',
        deltas: { relationship: 5, happiness: 4, wealth: -2 },
        result: '처음 배우는 걸 나란히 서툴게 해보는 게, 오히려 즐거웠다.'
      },
      {
        id: 'seeing-a-widowed-friend',
        text: '혼자가 된 친구를 보며 곁의 배우자를 다시 본다',
        deltas: { relationship: 4, happiness: 2 },
        result: '당연하게 여겼던 존재가, 갑자기 소중하게 느껴졌다.',
        requiresFamilyMember: ['spouse']
      },
      {
        id: 'hearing-loss-heal',
        text: '보청기를 맞추고 세상의 소리가 다시 선명해진다',
        deltas: { health: 5, wealth: -3 },
        result: '오랜만에 또렷하게 듣는 새소리에, 마음이 다 환해졌다.',
        requiresCondition: 'hearing-loss',
        removeCondition: 'hearing-loss'
      },
      {
        id: 'relationship-distant-from-children',
        text: '자식들과의 거리가 좀처럼 좁혀지지 않는다',
        deltas: { relationship: -6, happiness: -2 },
        result: '전화를 걸어도, 짧은 안부 몇 마디로 끝나는 날이 많았다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'oldprep-joint-account-reorganize-66',
        text: '부부가 함께 재산을 다시 정리해본다',
        deltas: { wealth: 3, relationship: 2 },
        result: '따로 흩어져 있던 것들을 모으니, 생각보다 든든했다.'
      },
      {
        id: 'oldprep-anniversary-gift-cash-66',
        text: '결혼기념일에 자녀들이 두둑한 용돈을 보낸다',
        deltas: { wealth: 2, relationship: 2, happiness: 2 },
        result: '봉투 안 숫자보다, 잊지 않고 챙긴 마음이 더 컸다.'
      },
      {
        id: 'oldprep-selling-second-car-66',
        text: '부부가 차를 한 대로 줄인다',
        deltas: { wealth: 4 },
        result: '차 한 대로도 충분하다는 걸, 새삼 깨달았다.'
      },
      {
        id: 'oldprep-hobby-workshop-66',
        text: '부부가 함께 작은 공방을 열어본다',
        deltas: { wealth: 2, relationship: 2, happiness: 1 },
        result: '취미로 시작한 일이, 소소한 용돈벌이가 됐다.'
      },
      {
        id: 'oldprep-old-life-insurance-payout-66',
        text: '오래 부어온 저축성 보험 하나가 만기를 맞는다',
        deltas: { wealth: 5 },
        result: '까맣게 잊고 있던 돈이, 때맞춰 돌아왔다.'
      },
      {
        id: 'oldprep-renting-spare-room-66',
        text: '빈 방 하나를 세놓기로 한다',
        deltas: { wealth: 3 },
        result: '빈 방 하나가, 매달 쏠쏠한 보탬이 됐다.'
      }
    ]
  },
  {
    id: 'oldprep-67',
    name: '노년 준비',
    ageRange: '67세',
    intro: '남겨질 것들에 대해 조금씩 마음의 준비를 시작하는 나이입니다.',
    choices: [
      {
        id: 'writing-a-will',
        text: '유언장을 미리 써두며 마음을 정리한다',
        deltas: { happiness: 2, relationship: 1 },
        result: '펜을 든 순간은 무거웠지만, 다 쓰고 나니 마음이 가벼워졌다.'
      },
      {
        id: 'early-inheritance-dilemma',
        text: '자산을 자녀에게 미리 나눠주는 문제로 고민한다',
        deltas: { wealth: -3, relationship: 1 },
        result: '언제, 얼마나가 이렇게 어려운 계산일 줄 몰랐다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'inheritance-conflict-with-kids',
        text: '상속·증여 문제를 자녀들과 의논한다',
        deltas: { relationship: -4, happiness: -3 },
        result: '돈 얘기 앞에서, 가족도 예외는 아니었다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'relief-after-organizing',
        text: '정리하고 나니 오히려 홀가분해진다',
        deltas: { happiness: 4, health: 1 },
        result: '미뤄뒀던 숙제 하나를 끝낸 기분이었다.'
      },
      {
        id: 'postponing-the-topic',
        text: '아직은 그런 생각을 하고 싶지 않다며 미룬다',
        deltas: { happiness: -1, relationship: 0 },
        result: '언젠가는 마주해야 할 일이라는 걸, 알면서도 미뤘다.'
      },
      {
        id: 'gathering-family-to-share-wishes',
        text: '가족 모두를 불러 앉혀 놓고 뜻을 직접 전한다',
        deltas: { relationship: 4, happiness: 3 },
        result: '어렵게 꺼낸 이야기였지만, 다들 진지하게 들어줬다.'
      },
      {
        id: 'hip-fracture-onset',
        text: '빙판길을 서둘러 걷는다',
        deltas: { health: -6, wealth: -2 },
        result: '순식간에 넘어진 그 몇 초가, 이후 몇 달을 바꿔놓았다.',
        addCondition: { id: 'hip-fracture', label: '🦴 고관절 골절' }
      },
      {
        id: 'volunteer-financially-tight',
        text: '경제적으로 넉넉하지 않아 계속 아등바등한다',
        deltas: { wealth: -2, happiness: -2 },
        result: '큰돈은 아니어도, 매달 계산기를 두드리는 습관은 여전했다.',
        requiresOccupation: ['volunteer-work']
      },
      {
        id: 'fame-nostalgia-piece-67',
        text: '옛 시절을 다룬 특집 기사에 인터뷰이로 실린다',
        deltas: { fame: 4, happiness: 2 },
        result: '지나간 시절 얘기인데도, 어제 일처럼 술술 말이 나왔다.'
      },
      {
        id: 'fame-younger-dont-know-67',
        text: '젊은 사람들이 전혀 못 알아본다는 걸 실감한다',
        deltas: { fame: -4, happiness: -2 },
        result: '설명을 덧붙여야 하는 순간이, 조금씩 익숙해져 갔다.'
      },
      {
        id: 'fame-award-lifetime-67',
        text: '공로상 후보로 이름이 오른다',
        deltas: { fame: 5, happiness: 3 },
        result: '상보다도, 그 자리에 이름이 불렸다는 사실만으로 충분했다.'
      },
      {
        id: 'fame-old-rival-more-famous-67',
        text: '옛 경쟁자가 여전히 화제인 걸 지켜본다',
        deltas: { fame: -3, happiness: -3 },
        result: '축하한다는 말 뒤로, 복잡한 마음이 슬쩍 스쳤다.'
      },
      {
        id: 'fame-local-celebrity-67',
        text: '동네에서 소소하게 유명 인사로 불린다',
        deltas: { fame: 2, relationship: 2, happiness: 2 },
        result: '거창한 호칭은 아니어도, 부를 때마다 웃음이 났다.'
      },
      {
        id: 'fame-irrelevant-feeling-67',
        text: '이제는 무대 밖 사람이 된 것 같은 기분이 든다',
        deltas: { fame: -3, happiness: -3 },
        result: '서운함과 홀가분함이, 이상하게 동시에 밀려왔다.'
      }
    ]
  },
  {
    id: 'oldprep-68',
    name: '노년 준비',
    ageRange: '68세',
    intro: '가까운 이들의 부고를 마주하며, 남은 삶의 무게를 다시 느끼게 됩니다.',
    choices: [
      {
        id: 'grieving-an-old-friend',
        text: '오랜 친구의 부고 소식에 크게 상심한다',
        deltas: { happiness: -6, health: -2 },
        result: '어제까지 통화하던 목소리가, 이제는 들을 수 없었다.'
      },
      {
        id: 'reconnecting-at-a-funeral',
        text: '장례식에서 오랜만에 만난 얼굴들과 안부를 나눈다',
        deltas: { relationship: 3, happiness: -1 },
        result: '슬픈 자리였지만, 그 덕에 다시 이어진 인연도 있었다.'
      },
      {
        id: 'cherishing-life-more',
        text: '떠난 이를 기리며 남은 삶을 더 소중히 여기게 된다',
        deltas: { happiness: 2, relationship: 2 },
        result: '당연했던 하루하루가, 갑자기 다르게 보이기 시작했다.'
      },
      {
        id: 'grateful-for-good-health',
        text: '건강히 지내는 것 자체가 얼마나 큰 행운인지 깨닫는다',
        deltas: { happiness: 4, health: 2 },
        result: '아무 일 없이 흘러가는 하루가, 그렇게 감사할 수 없었다.'
      },
      {
        id: 'fear-of-being-left-alone',
        text: '혼자 남겨질 상황을 문득 떠올려본다',
        deltas: { happiness: -4, relationship: -1 },
        result: '밤이 되면, 그 생각이 유독 선명해졌다.'
      },
      {
        id: 'resolving-to-meet-friends-more',
        text: '남은 친구들과 더 자주 만나기로 다짐한다',
        deltas: { relationship: 5, happiness: 3 },
        result: '미루지 말자는 다짐이, 그 어느 때보다 절실했다.'
      },
      {
        id: 'diabetes-managed',
        text: '철저한 식단 관리와 운동으로 혈당 수치가 안정적으로 조절된다',
        deltas: { health: 5, happiness: 2 },
        result: '숫자 하나하나에 예민하던 나날을 지나, 이제는 익숙한 습관이 됐다.',
        requiresCondition: 'diabetes',
        removeCondition: 'diabetes'
      },
      {
        id: 'fame-forgotten-by-new-generation',
        text: '후배 세대에게 완전히 자리를 내주며 잊힌 존재가 된다',
        deltas: { fame: -6, happiness: -2 },
        result: '한때는 모두가 알던 이름이었는데, 이제는 설명이 필요했다.'
      },
      {
        id: 'retired-income-anxiety',
        text: '고정 수입이 끊긴 생활에 적응해간다',
        deltas: { happiness: -3, wealth: -2 },
        result: '월급날이 없어졌다는 사실이, 생각보다 오래 낯설었다.',
        requiresOccupation: ['retired']
      },
      {
        id: 're-employed-easier-finances',
        text: '연금에 더해진 소득으로 살림이 한결 넉넉해진다',
        deltas: { wealth: 4 },
        result: '두 줄기 소득이 만나니, 마음 씀씀이도 조금 여유로워졌다.',
        requiresOccupation: ['re-employed']
      },
      {
        id: 'lottery-buy-68',
        text: '매주 사던 번호로 로또를 또 사본다',
        deltas: { happiness: 1 },
        result: '늘 사던 번호라, 이번엔 될 것 같은 예감이 들었다.',
        addAsset: { id: 'lottery-ticket', label: '🎟️ 복권', type: 'movable' }
      },
      {
        id: 'lottery-skip-68',
        text: '이번 주는 그냥 넘어간다',
        deltas: { happiness: 1 },
        result: '이번 주는 그냥 마음 편히 넘어갔다.'
      }
    ]
  },
  {
    id: 'oldprep-69',
    name: '노년 준비',
    ageRange: '69세',
    intro: '노년 준비의 마지막 해. 진짜 노년이 코앞으로 다가옵니다.',
    choices: [
      {
        id: 'reflecting-on-fifteen-years-oldprep',
        text: '노년 준비의 마지막 해, 지난 15년을 돌아본다',
        deltas: { happiness: 3, relationship: 2 },
        result: '정년퇴직하던 날이, 바로 어제처럼 생생했다.'
      },
      {
        id: 'preparing-for-seventieth',
        text: '다가올 칠순을 준비하며 마음을 가다듬는다',
        deltas: { happiness: 2, health: 1 },
        result: '숫자 일흔이, 이번엔 그렇게 두렵지 않았다.'
      },
      {
        id: 'comforting-oneself-for-enduring',
        text: '그동안 잘 버텨온 스스로를 다독인다',
        deltas: { happiness: 5, health: 2 },
        result: '수고했다는 그 한마디를, 이제는 스스로에게 건넬 줄 알았다.'
      },
      {
        id: 'lingering-worries',
        text: '여전히 남은 걱정거리를 안고 지낸다',
        deltas: { happiness: -3, wealth: -1 },
        result: '나이가 든다고 걱정까지 사라지는 건 아니었다.'
      },
      {
        id: 'planning-seventieth-party',
        text: '가족들과 다가올 칠순 잔치를 미리 계획한다',
        deltas: { relationship: 4, happiness: 3 },
        result: '함께 계획을 짜는 시간부터, 이미 잔치가 시작된 기분이었다.'
      },
      {
        id: 'calm-at-the-threshold-of-old-age',
        text: '진짜 노년의 문턱 앞에서 담담해진다',
        deltas: { happiness: 3, health: 1 },
        result: '두려움보다, 이상하게 차분한 마음이 앞섰다.'
      },
      {
        id: 'hip-fracture-heal',
        text: '재활 치료를 마치고 다시 혼자 걸을 수 있게 된다',
        deltas: { health: 6, wealth: -3 },
        result: '지팡이 없이 내딛은 첫걸음이, 그 어떤 순간보다 벅찼다.',
        requiresCondition: 'hip-fracture',
        removeCondition: 'hip-fracture'
      },
      {
        id: 'lottery-check-69',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'twilight-70',
    name: '황혼',
    ageRange: '70세',
    intro: '칠순. 황혼이라 불리는 시간의 첫걸음을 내딛습니다.',
    choices: [
      {
        id: 'grand-seventieth-celebration',
        text: '칠순을 맞아 온 가족이 모여 성대한 잔치를 연다',
        deltas: { happiness: 6, relationship: 5, wealth: -5 },
        result: '자식들, 손주들까지 다 모인 얼굴을 보는 것만으로도 벅찼다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'realizing-a-new-chapter-at-seventy',
        text: '일흔이라는 나이 앞에서 인생의 새 장을 실감한다',
        deltas: { happiness: 2, health: -1 },
        result: '한 챕터가 끝나고, 또 다른 챕터가 시작되는 기분이었다.'
      },
      {
        id: 'quiet-day-with-spouse',
        text: '조용히 부부끼리만 특별한 하루를 보낸다',
        deltas: { happiness: 4, relationship: 3 },
        result: '요란하지 않아도, 둘만의 하루는 그 자체로 충분했다.'
      },
      {
        id: 'final-big-trip',
        text: '칠순 기념으로 인생 마지막 큰 여행을 떠난다',
        deltas: { happiness: 6, wealth: -6 },
        result: '"마지막"이라는 말을 붙이니, 매 순간이 더 선명하게 남았다.'
      },
      {
        id: 'writing-life-story',
        text: '지난 70년의 인생을 글로 정리해본다',
        deltas: { happiness: 4, relationship: 2 },
        result: '한 문장 한 문장 써 내려가며, 잊었던 기억들이 되살아났다.'
      },
      {
        id: 'grateful-for-health-and-mind-at-seventy',
        text: '일흔의 몸과 마음 상태를 돌아본다',
        deltas: { happiness: 5, health: 3 },
        result: '일흔에도 이렇게 웃을 수 있다는 게, 새삼 감사했다.'
      },
      {
        id: 'relationship-fewer-people-remain',
        text: '곁에 남은 사람이 하나둘 줄어드는 걸 실감한다',
        deltas: { relationship: -6, happiness: -3 },
        result: '부고 소식이 낯설지 않게 되어가는 나이였다.'
      },
      {
        id: 'volunteer-still-useful',
        text: '내가 아직 쓸모 있다는 확신이 든다',
        deltas: { happiness: 5 },
        result: '누군가 나를 필요로 한다는 사실 하나가, 하루를 버티게 했다.',
        requiresOccupation: ['volunteer-work']
      },
      {
        id: 'fame-seventieth-media-70',
        text: '칠순을 맞아 지역 매체의 관심을 받는다',
        deltas: { fame: 4, happiness: 2 },
        result: '별거 아니라 여겼던 삶이, 인터뷰를 하며 새삼 다르게 보였다.'
      },
      {
        id: 'fame-generation-gap-70',
        text: '젊은 세대와의 거리감을 느끼며 위축된다',
        deltas: { fame: -3, happiness: -2 },
        result: '무슨 말을 해도 어긋나는 대화에, 점점 말수가 줄었다.'
      },
      {
        id: 'fame-lifetime-story-70',
        text: '살아온 이야기가 소책자로 만들어진다',
        deltas: { fame: 4, happiness: 3 },
        result: '내 이야기가 활자로 묶여 나온다는 게, 몇 번을 봐도 신기했다.'
      },
      {
        id: 'fame-nobody-visits-70',
        text: '찾아오는 이가 줄어든 걸 실감한다',
        deltas: { fame: -3, happiness: -3, relationship: -1 },
        result: '현관 벨소리가 뜸해진 만큼, 하루가 더 길게 느껴졌다.'
      },
      {
        id: 'fame-community-elder-70',
        text: '동네 어른으로서 존중받는 자리가 늘어난다',
        deltas: { fame: 3, relationship: 2 },
        result: '어른 대접이 낯설면서도, 싫지만은 않았다.'
      },
      {
        id: 'fame-old-news-70',
        text: '한때 화제였던 일들이 이제는 옛말이 됐다는 걸 느낀다',
        deltas: { fame: -2, happiness: -2 },
        result: '그때 그 이야기를 꺼내도, 알아듣는 사람이 점점 줄어갔다.'
      }
    ]
  },
  {
    id: 'twilight-71',
    name: '황혼',
    ageRange: '71세',
    intro: '거창한 일 없이도, 하루하루의 작은 순간들이 새삼 소중하게 다가오는 나이입니다.',
    choices: [
      {
        id: 'morning-tea-happiness',
        text: '매일 아침 차 한 잔을 마신다',
        deltas: { happiness: 4, health: 1 },
        result: '별거 아닌 그 한 잔이, 하루를 여는 작은 의식이 됐다.'
      },
      {
        id: 'grateful-for-ordinary-day',
        text: '특별할 것 없는 하루를 보낸다',
        deltas: { happiness: 5, relationship: 1 },
        result: '아무 일 없이 지나가는 하루가, 이렇게 귀할 줄 몰랐다.'
      },
      {
        id: 'video-call-with-grandchild',
        text: '손주와 영상통화를 하며 하루를 시작한다',
        deltas: { happiness: 4, relationship: 3 },
        result: '화면 속 작은 얼굴 하나로, 아침이 환해졌다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'sudden-nostalgia',
        text: '지나간 것들에 대한 그리움이 문득 밀려온다',
        deltas: { happiness: -3, relationship: 0 },
        result: '아무 이유 없이, 옛 생각이 밀려드는 오후가 있었다.'
      },
      {
        id: 'library-book-borrowing',
        text: '동네 도서관에서 책을 빌려 읽는 낙을 찾는다',
        deltas: { happiness: 3, health: 1 },
        result: '한 장씩 넘기는 시간이, 조용하고 알찼다.'
      },
      {
        id: 'plant-finally-blooms',
        text: '오래 키운 화초에 꽃이 핀 걸 발견한다',
        deltas: { happiness: 4, health: 1 },
        result: '몇 달을 정성 들인 보람이, 꽃 한 송이로 돌아왔다.'
      },
      {
        id: 'retired-peer-gatherings',
        text: '동년배 모임에서 서로의 근황을 나누며 위안을 얻는다',
        deltas: { relationship: 3, happiness: 2 },
        result: '같은 시절을 살아낸 사람들과의 대화는, 설명 없이도 통했다.',
        requiresOccupation: ['retired']
      },
      {
        id: 're-employed-physically-harder',
        text: '체력적으로 예전만 못해 일이 버겁게 느껴진다',
        deltas: { health: -3 },
        result: '몸이 마음을 못 따라가는 날이, 부쩍 늘었다.',
        requiresOccupation: ['re-employed']
      },
      {
        id: 'twilight-selling-old-books-71',
        text: '오래 모은 책들을 도서 장터에 내놓는다',
        deltas: { wealth: 1, happiness: 1 },
        result: '먼지 쌓인 책들이, 누군가에겐 반가운 물건이었다.'
      },
      {
        id: 'twilight-antique-appraisal-71',
        text: '서랍 속 오래된 골동품 하나를 감정받아본다',
        deltas: { wealth: 3, happiness: 1 },
        result: '별생각 없이 넣어뒀던 물건이, 뜻밖의 값을 받았다.'
      },
      {
        id: 'twilight-pension-benefit-review-71',
        text: '놓치고 있던 노령연금 추가 혜택을 신청한다',
        deltas: { wealth: 3 },
        result: '진작 알았더라면 싶은 혜택이, 이제라도 들어왔다.'
      },
      {
        id: 'twilight-old-stamp-collection-71',
        text: '서랍 속에 있던 오래된 우표책을 발견한다',
        deltas: { wealth: 4, happiness: 2 },
        result: '젊은 날의 취미가, 이렇게 남아있을 줄 몰랐다.'
      },
      {
        id: 'twilight-community-fund-payout-71',
        text: '오래 부어온 계 모임이 마침내 순서가 돌아온다',
        deltas: { wealth: 5 },
        result: '오랜 기다림 끝에, 드디어 순서가 왔다.'
      },
      {
        id: 'twilight-selling-unused-appliances-71',
        text: '안 쓰는 가전을 정리해 내놓는다',
        deltas: { wealth: 2 },
        result: '자리만 차지하던 것들이, 작게나마 돈이 됐다.'
      }
    ]
  },
  {
    id: 'twilight-72',
    name: '황혼',
    ageRange: '72세',
    intro: '자녀와 손주 세대가 저마다의 성취를 이뤄가는 걸 지켜보는 나이입니다.',
    choices: [
      {
        id: 'grandchild-college-news',
        text: '손주에게서 대학 입시 관련 소식을 듣는다',
        deltas: { happiness: 6, relationship: 4 },
        result: '내 일도 아닌데, 눈물이 핑 돌 만큼 기뻤다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'mixed-pride-and-envy',
        text: '손주의 성취를 보며 대견함과 부러움이 교차한다',
        deltas: { happiness: 3, relationship: 2 },
        result: '기특한 마음 한편으로, 내 젊은 날도 스쳐 지나갔다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'celebrating-childs-success',
        text: '자녀 세대의 성취를 지켜본다',
        deltas: { relationship: 4, happiness: 3 },
        result: '내 몫을 넘어선 성취를 보는 것도, 부모의 큰 기쁨이었다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'growing-generation-gap',
        text: '손주와의 세대 차이가 점점 크게 느껴진다',
        deltas: { happiness: -3, relationship: -1 },
        result: '무슨 말인지 몰라 자꾸 되묻는 일이, 조금씩 늘었다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'less-active-at-family-events',
        text: '가족 행사에서 예전만큼 활발히 나서지 못해 아쉽다',
        deltas: { happiness: -2, health: -1 },
        result: '거들고 싶은 마음은 그대로인데, 몸이 조금 뒤처졌다.'
      },
      {
        id: 'not-wanting-to-burden-kids',
        text: '자녀에게 짐이 되고 싶지 않아 스스로를 더 챙긴다',
        deltas: { health: 3, happiness: 2 },
        result: '스스로를 돌보는 게, 결국 자식들을 위한 일이기도 했다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'setting-new-hobby-goal',
        text: '오랜 취미에 새로운 목표를 세워 도전한다',
        deltas: { happiness: 4, health: 1 },
        result: '나이가 무슨 상관이냐며, 새로운 목표를 향해 다시 뛰었다.'
      },
      {
        id: 'small-pride-with-friends',
        text: '동네 친구들 모임에서 소소한 자랑거리를 나눈다',
        deltas: { relationship: 4, happiness: 3 },
        result: '별거 아닌 이야기에도 다들 눈을 반짝이며 들어줬다.'
      },
      {
        id: 'fame-nobody-listens-anymore',
        text: '옛 이야기를 꺼내도 아무도 귀 기울이지 않는다',
        deltas: { fame: -5, happiness: -2 },
        result: '한때는 모두가 궁금해하던 이야기였는데, 이제는 그저 옛날 이야기였다.'
      }
    ]
  },
  {
    id: 'twilight-73',
    name: '황혼',
    ageRange: '73세',
    intro: '몸이 더는 예전 같지 않다는 걸, 이제는 확실히 받아들여야 하는 시기입니다.',
    choices: [
      {
        id: 'stairs-become-harder',
        text: '계단 오르내리기조차 버거워짐을 느낀다',
        deltas: { health: -4, happiness: -2 },
        result: '한 층 한 층이, 예전과는 다른 무게로 다가왔다.'
      },
      {
        id: 'starting-to-use-a-cane',
        text: '지팡이를 짚고 다니기 시작한다',
        deltas: { health: -2, happiness: -1 },
        result: '손에 익지 않은 지팡이가, 처음엔 낯설고 서글펐다.'
      },
      {
        id: 'finding-a-slower-pace',
        text: '느려진 몸에 맞춰 새로운 일상 속도를 찾는다',
        deltas: { happiness: 3, health: 2 },
        result: '서두르지 않아도 된다는 걸, 이제야 받아들였다.'
      },
      {
        id: 'pride-in-doing-it-alone',
        text: '그래도 아직은 혼자 다 할 수 있다는 자부심을 느낀다',
        deltas: { happiness: 4, health: 2 },
        result: '작은 일 하나를 스스로 해낼 때마다, 뿌듯함이 컸다.'
      },
      {
        id: 'physical-therapy-effort',
        text: '물리치료를 받으며 남은 체력을 지키려 애쓴다',
        deltas: { health: 3, wealth: -2 },
        result: '꾸준히 다닌 병원이, 조금씩 몸을 지켜주고 있었다.'
      },
      {
        id: 'accepting-help-from-others',
        text: '몸이 예전 같지 않다는 걸 받아들이고 도움을 청한다',
        deltas: { happiness: 2, relationship: 3 },
        result: '도와달라는 말 한마디가, 생각보다 어렵지 않았다.'
      },
      {
        id: 'downsizing-home-profit-73',
        text: '그동안 살던 집을 정리하고 작은 곳으로 옮긴다',
        deltas: { wealth: 5, health: -1 },
        result: '짐은 줄었지만, 통장은 오히려 두둑해졌다.'
      },
      {
        id: 'selling-old-belongings-73',
        text: '짐을 줄이며 오래된 물건들을 하나둘 내놓는다',
        deltas: { wealth: 1, happiness: 1 },
        result: '안 쓰는 물건들이었는데, 의외로 값을 쳐줬다.'
      },
      {
        id: 'small-garden-harvest-sale-73',
        text: '작은 텃밭에서 기른 것들을 이웃에게 나눠 판다',
        deltas: { wealth: 1, relationship: 2, happiness: 1 },
        result: '텃밭 하나가 소소한 용돈벌이가 됐다.'
      },
      {
        id: 'lottery-check-73',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'twilight-74',
    name: '황혼',
    ageRange: '74세',
    intro: '다리에 힘이 있을 때, 라는 말이 부쩍 자주 나오는 나이입니다.',
    choices: [
      {
        id: 'last-long-trip-with-friends',
        text: '다리에 힘 있을 때라며 친구들과 마지막 장거리 여행을 떠난다',
        deltas: { happiness: 6, wealth: -5, health: -2 },
        result: '더 늦기 전에 나서길 잘했다는 생각이, 내내 떠나지 않았다.'
      },
      {
        id: 'giving-up-trip-over-stamina',
        text: '체력을 고려해 여행 계획을 접는다',
        deltas: { happiness: -3, health: 1 },
        result: '아쉬움은 컸지만, 무리하지 않는 편을 택했다.'
      },
      {
        id: 'exhausted-from-overexertion',
        text: '무리한 여행 일정에 몸살이 난다',
        deltas: { health: -4, happiness: 2 },
        result: '즐거웠던 만큼, 몸은 그 값을 톡톡히 치렀다.'
      },
      {
        id: 'unexpected-friendship-on-trip',
        text: '여행지에서 낯선 사람과 대화를 나눈다',
        deltas: { happiness: 5, relationship: 3 },
        result: '낯선 곳에서 생긴 인연이, 여행의 가장 큰 선물이었다.'
      },
      {
        id: 'short-local-outing',
        text: '짧은 근교 나들이로 아쉬움을 달랜다',
        deltas: { happiness: 3, wealth: -2 },
        result: '멀리 못 가도, 바람 쐬는 것만으로 충분했다.'
      },
      {
        id: 'revisiting-travel-photos',
        text: '여행 사진을 보며 몇 번이고 그날을 되새긴다',
        deltas: { happiness: 4, relationship: 1 },
        result: '사진 한 장으로, 그날의 공기까지 떠오르는 것 같았다.'
      },
      {
        id: 'pneumonia-onset',
        text: '감기 기운이 있는데도 무리하게 외출한다',
        deltas: { health: -6, happiness: -3 },
        result: '무리한 일정 끝에 찾아온 병치레였다.',
        addCondition: { id: 'pneumonia', label: '🫁 폐렴' }
      },
      {
        id: 'relationship-isolation-deepens',
        text: '주변과의 교류가 점점 줄어든다',
        deltas: { relationship: -7, happiness: -4 },
        result: '찾아오는 발걸음이 점점 뜸해지는 걸, 애써 모른 척했다.'
      },
      {
        id: 're-employed-renewed-vitality',
        text: '다시 일을 시작한다',
        deltas: { happiness: 5 },
        result: '아침에 갈 곳이 있다는 것만으로도, 하루가 달라졌다.',
        requiresOccupation: ['re-employed']
      },
      {
        id: 'fame-tribute-event-74',
        text: '지난 활약을 기리는 자리에 초대받는다',
        deltas: { fame: 4, happiness: 3, relationship: 2 },
        result: '오랜만에 만난 얼굴들과, 그때 그 시절 이야기로 시간 가는 줄 몰랐다.'
      },
      {
        id: 'fame-almost-forgotten-74',
        text: '이름을 검색해도 옛 기록만 남아있다는 걸 발견한다',
        deltas: { fame: -4, happiness: -3 },
        result: '화면 속 흐릿해진 기록이, 꼭 자신의 모습 같았다.'
      },
      {
        id: 'fame-young-fan-message-74',
        text: '뜻밖에도 젊은 팬에게 메시지를 받는다',
        deltas: { fame: 3, happiness: 3 },
        result: '까맣게 잊고 있던 이름을 누군가 기억해줬다는 게, 뭉클했다.'
      },
      {
        id: 'fame-media-silence-74',
        text: '연락 오던 매체들의 발길이 완전히 끊긴다',
        deltas: { fame: -4, happiness: -2 },
        result: '한때는 성가시던 전화가, 이제는 그리워질 줄 몰랐다.'
      },
      {
        id: 'fame-archive-feature-74',
        text: '지역 기록관에 이름이 남겨진다',
        deltas: { fame: 3, happiness: 2 },
        result: '거창한 자리는 아니었지만, 이름 석 자가 남는다는 게 든든했다.'
      },
      {
        id: 'fame-unremembered-74',
        text: '함께 활동했던 이들도 하나둘 소식이 끊긴다',
        deltas: { fame: -3, happiness: -2, relationship: -1 },
        result: '연락처만 남고 목소리는 점점 희미해져 갔다.'
      }
    ]
  },
  {
    id: 'twilight-75',
    name: '황혼',
    ageRange: '75세',
    intro: '남은 시간을 어떻게 채워갈지, 다시 한번 진지하게 그려보는 나이입니다.',
    choices: [
      {
        id: 'rethinking-how-to-fill-remaining-time',
        text: '남은 삶을 어떻게 채울지 다시 한번 진지하게 그려본다',
        deltas: { happiness: 2, health: 1 },
        result: '남은 시간이 무한하지 않다는 걸, 이제는 자연스레 받아들였다.'
      },
      {
        id: 'giving-life-a-high-score',
        text: '그동안 살아온 인생에 스스로 높은 점수를 준다',
        deltas: { happiness: 5, wealth: 1 },
        result: '완벽하진 않았지만, 후하게 점수를 줘도 될 것 같았다.'
      },
      {
        id: 'lingering-regrets',
        text: '이루지 못한 것들에 대한 미련이 남는다',
        deltas: { happiness: -3, relationship: 0 },
        result: '다 내려놓았다고 생각했는데, 가끔 그 생각이 고개를 들었다.'
      },
      {
        id: 'more-time-with-family',
        text: '남은 시간을 가족과 더 많이 보내기로 다짐한다',
        deltas: { relationship: 4, happiness: 3 },
        result: '함께하는 시간이야말로, 가장 남는 장사라는 걸 알았다.'
      },
      {
        id: 'valuing-alone-time-too',
        text: '혼자만의 시간도 소중히 여기기로 한다',
        deltas: { happiness: 3, health: 1 },
        result: '혼자 있는 시간이, 외로움이 아니라 평온함으로 다가왔다.'
      },
      {
        id: 'new-bucket-list-for-late-life',
        text: '인생 후반부의 버킷리스트를 새로 적어본다',
        deltas: { happiness: 4, wealth: -2 },
        result: '몇 개 안 되는 목록이었지만, 적는 것만으로도 설렜다.'
      },
      {
        id: 'fame-neighborhood-story-75',
        text: '동네 소식지에 살아온 이야기가 실린다',
        deltas: { fame: 3, happiness: 2 },
        result: '작은 소식지 한 귀퉁이였지만, 여러 장을 오려 간직해두었다.'
      },
      {
        id: 'fame-isolated-from-news-75',
        text: '세상 돌아가는 소식에서 점점 멀어진다',
        deltas: { fame: -3, happiness: -2 },
        result: '뉴스에 나오는 이름들이, 갈수록 낯설게만 느껴졌다.'
      },
      {
        id: 'fame-grandchild-boast-75',
        text: '손주가 학교에서 자랑스럽게 이야기한다',
        deltas: { fame: 2, relationship: 2, happiness: 2 },
        result: '전해 들은 그 말 한마디에, 하루 종일 웃음이 났다.'
      },
      {
        id: 'fame-name-rarely-mentioned-75',
        text: '이름이 언급되는 일이 확연히 줄었다는 걸 안다',
        deltas: { fame: -3, happiness: -2 },
        result: '서운함도 잠시, 이내 그런가 보다 하고 넘겼다.'
      },
      {
        id: 'fame-wisdom-sought-75',
        text: '인생 조언을 구하는 젊은이들이 찾아온다',
        deltas: { fame: 3, relationship: 2, happiness: 2 },
        result: '별거 아닌 이야기에도, 다들 진지하게 귀를 기울여줬다.'
      },
      {
        id: 'fame-quiet-days-75',
        text: '요란함 없는 조용한 나날을 보낸다',
        deltas: { fame: -2, happiness: 1 },
        result: '특별할 것 없는 하루하루가, 그 나름대로 평온했다.'
      }
    ]
  },
  {
    id: 'twilight-76',
    name: '황혼',
    ageRange: '76세',
    intro: '평생을 함께한 배우자의 건강이 흔들리는 걸 지켜보게 되는, 힘겨운 나이입니다.',
    choices: [
      {
        id: 'spouse-diagnosed-with-illness',
        text: '배우자가 큰 병을 진단받아 간병을 시작한다',
        deltas: { relationship: 3, happiness: -6, health: -3 },
        result: '진단 소식을 듣던 그 순간부터, 세상이 다르게 보였다.',
        requiresFamilyMember: ['spouse']
      },
      {
        id: 'exhausted-from-caregiving',
        text: '간병을 계속 이어간다',
        deltas: { health: -4, happiness: -3 },
        result: '누군가를 돌보는 일이, 나를 돌보는 일까지 잊게 만들었다.'
      },
      {
        id: 'stronger-bond-through-illness',
        text: '함께 병을 이겨내며 부부 사이가 더 단단해진다',
        deltas: { relationship: 5, happiness: 2 },
        result: '힘든 시간을 함께 넘기고 나니, 서로가 더 소중해졌다.'
      },
      {
        id: 'kids-help-with-caregiving',
        text: '자녀들의 도움을 받아 간병 부담을 나눈다',
        deltas: { relationship: 3, wealth: -3, happiness: 2 },
        result: '혼자 짊어지지 않아도 된다는 게, 큰 위안이 됐다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'spouse-recovers-well',
        text: '배우자의 건강 상태를 지켜본다',
        deltas: { happiness: 5, relationship: 4 },
        result: '가슴 졸이던 시간 끝에, 겨우 한숨을 돌릴 수 있었다.',
        requiresFamilyMember: ['spouse']
      },
      {
        id: 'quietly-preparing-for-loss',
        text: '혹시 모를 이별을 마음속으로 그려본다',
        deltas: { happiness: -4, relationship: 2 },
        result: '입 밖에 낼 수 없는 생각이, 자꾸만 마음 한구석을 맴돌았다.'
      },
      {
        id: 'pneumonia-heal',
        text: '충분한 치료와 요양 기간을 갖는다',
        deltas: { health: 6, wealth: -3 },
        result: '숨쉬기가 다시 편해진 순간, 살았다는 실감이 났다.',
        requiresCondition: 'pneumonia',
        removeCondition: 'pneumonia'
      },
      {
        id: 'fame-drifting-from-media',
        text: 'SNS·미디어와 점점 멀어진다',
        deltas: { fame: -5, happiness: -1 },
        result: '요란하던 세상이, 어느새 저 멀리서 들리는 소리가 됐다.'
      },
      {
        id: 'lottery-buy-76',
        text: '손주 용돈이라도 벌어보자며 로또를 사본다',
        deltas: { happiness: 1 },
        result: '손주 얼굴을 떠올리며 슬쩍 지갑을 열었다.',
        addAsset: { id: 'lottery-ticket', label: '🎟️ 복권', type: 'movable' }
      },
      {
        id: 'lottery-skip-76',
        text: '이제 와서 무슨 소용이냐며 넘어간다',
        deltas: { happiness: 1 },
        result: '괜한 기대보다 마음 편한 쪽을 택했다.'
      }
    ]
  },
  {
    id: 'twilight-77',
    name: '황혼',
    ageRange: '77세',
    intro: '희수(喜壽). 예로부터 기쁘게 오래 산 것을 기리는 나이입니다.',
    choices: [
      {
        id: 'huisu-family-celebration',
        text: '희수(喜壽)를 맞아 가족들이 작은 잔치를 열어준다',
        deltas: { happiness: 5, relationship: 4, wealth: -3 },
        result: '작은 잔치였지만, 마음만큼은 그 어느 때보다 풍성했다.'
      },
      {
        id: 'weight-of-seventy-seven',
        text: '일흔일곱이라는 숫자에 새삼 세월의 무게를 느낀다',
        deltas: { happiness: -1, health: 0 },
        result: '숫자 하나가, 지나온 시간을 새삼 실감 나게 했다.'
      },
      {
        id: 'blessing-of-long-life',
        text: '오래 산다는 것 자체가 축복임을 실감한다',
        deltas: { happiness: 5, health: 2 },
        result: '당연하게 여기던 하루하루가, 사실은 축복이었다.'
      },
      {
        id: 'new-family-photo',
        text: '조용히 가족사진을 새로 찍으며 이 순간을 남긴다',
        deltas: { happiness: 4, relationship: 3 },
        result: '카메라 앞에 모인 얼굴들을 보며, 마음이 뭉클했다.'
      },
      {
        id: 'remembering-departed-friends',
        text: '먼저 떠난 친구들을 떠올리며 숙연해진다',
        deltas: { happiness: -3, relationship: 1 },
        result: '함께였다면 더 좋았을 얼굴들이, 하나둘 떠올랐다.'
      },
      {
        id: 'grateful-for-still-being-well',
        text: '아직 정정한 몸과 마음 상태를 돌아본다',
        deltas: { happiness: 4, health: 3 },
        result: '이만큼 건강한 것도, 결코 당연한 일이 아니었다.'
      },
      {
        id: 're-employed-taking-orders-from-younger',
        text: '젊은 관리자에게 지시받는 게 낯설게 느껴진다',
        deltas: { happiness: -2 },
        result: '내 아이뻘 되는 이의 지시를, 묵묵히 받아들이는 법을 배웠다.',
        requiresOccupation: ['re-employed']
      },
      {
        id: 'twilight-huisu-envelope-77',
        text: '희수(喜壽) 잔치에 손님들이 저마다 축하를 보태 온다',
        deltas: { wealth: 3, relationship: 2, happiness: 2 },
        result: '봉투마다 담긴 마음이, 숫자보다 크게 느껴졌다.'
      },
      {
        id: 'twilight-old-policy-review-77',
        text: '오래전 든 보험 하나를 다시 살펴본다',
        deltas: { wealth: 4 },
        result: '잊고 지내던 보험이, 뒤늦게 제 몫을 했다.'
      },
      {
        id: 'twilight-selling-jewelry-77',
        text: '예물로 받았던 패물 일부를 정리한다',
        deltas: { wealth: 5 },
        result: '오래 간직했던 것들이, 마지막으로 큰 보탬이 됐다.'
      },
      {
        id: 'twilight-grandchild-repaying-favor-77',
        text: '예전에 도와줬던 손주가 마음을 표한다',
        deltas: { wealth: 2, relationship: 3, happiness: 2 },
        result: '베푼 걸 기억해준다는 것만으로도, 마음이 뭉클했다.'
      },
      {
        id: 'twilight-old-friend-visit-77',
        text: '오래전 소식이 끊겼던 친구가 불쑥 연락해온다',
        deltas: { wealth: 2, relationship: 2, happiness: 2 },
        result: '반가운 얼굴과 함께, 오래된 셈도 정리가 됐다.'
      },
      {
        id: 'twilight-selling-car-final-77',
        text: '이제 운전을 그만두며 차를 처분한다',
        deltas: { wealth: 3 },
        result: '운전대를 놓는 마음이 아쉬웠지만, 통장은 채워졌다.'
      },
      {
        id: 'lottery-check-77',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'twilight-78',
    name: '황혼',
    ageRange: '78세',
    intro: '기억이 예전만큼 또렷하지 않다는 걸, 스스로 느끼기 시작하는 나이입니다.',
    choices: [
      {
        id: 'forgetting-where-things-are',
        text: '일정과 물건 정리를 메모 없이 기억에만 의존한다',
        deltas: { happiness: -3, health: -2 },
        result: '방금 놓아둔 안경을 또 찾아 헤맸다.',
        addCondition: { id: 'mild-cognitive-decline', label: '🧠 가벼운 건망증' }
      },
      {
        id: 'old-memories-clear-recent-fuzzy',
        text: '예전 일은 생생한데 방금 일은 자꾸 잊는다',
        deltas: { happiness: -2, relationship: -1 },
        result: '수십 년 전 일은 또렷한데, 어제 일은 가물가물했다.'
      },
      {
        id: 'developing-notekeeping-habit',
        text: '메모하는 습관을 들이며 일상을 관리한다',
        deltas: { happiness: 2, health: 1 },
        result: '작은 수첩 하나가, 든든한 두 번째 기억이 되어줬다.'
      },
      {
        id: 'grateful-for-familys-care',
        text: '가족들이 세심하게 챙겨주는 것에 고마움을 느낀다',
        deltas: { relationship: 4, happiness: 3 },
        result: '잊어버려도 괜찮다는 그 말이, 큰 위안이 됐다.'
      },
      {
        id: 'getting-checked-out-of-worry',
        text: '혹시나 하는 걱정에 병원을 찾아 검사를 받는다',
        deltas: { health: 1, wealth: -2 },
        result: '결과를 기다리는 며칠이, 유독 길게 느껴졌다.'
      },
      {
        id: 'still-sharp-surprising-everyone',
        text: '여전히 총기 있는 모습으로 주변을 놀라게 한다',
        deltas: { happiness: 4, fame: 2 },
        result: '옛날 일 하나하나를 또렷이 짚어낼 때마다, 다들 감탄했다.'
      }
    ]
  },
  {
    id: 'twilight-79',
    name: '황혼',
    ageRange: '79세',
    intro: '팔순을 코앞에 두고, 지나온 삶을 조용히 정리해보는 한 해입니다.',
    choices: [
      {
        id: 'organizing-belongings-before-eighty',
        text: '팔순을 앞두고 남길 물건과 이야기들을 정리한다',
        deltas: { happiness: 2, relationship: 2 },
        result: '물건 하나하나에 얽힌 이야기가, 생각보다 많았다.'
      },
      {
        id: 'flipping-through-life-album-again',
        text: '그동안의 인생 사진첩을 다시 한번 넘겨본다',
        deltas: { happiness: 4, relationship: 1 },
        result: '몇 번을 봐도, 볼 때마다 새로운 기억이 떠올랐다.'
      },
      {
        id: 'planning-eightieth-with-kids',
        text: '자녀들과 팔순 잔치를 어떻게 치를지 상의한다',
        deltas: { relationship: 4, happiness: 3 },
        result: '함께 계획을 짜는 시간부터, 이미 즐거웠다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'preferring-quiet-gathering',
        text: '큰 잔치보다 조용한 가족 모임을 원한다고 말한다',
        deltas: { happiness: 3, wealth: 1 },
        result: '요란한 것보다, 곁의 사람들이면 충분하다고 생각했다.'
      },
      {
        id: 'eightieth-doesnt-feel-real',
        text: '다가오는 팔순이 실감 나지 않는다',
        deltas: { happiness: 1, health: 0 },
        result: '숫자와 마음 사이의 거리가, 여전히 낯설었다.'
      },
      {
        id: 'grateful-for-this-very-moment',
        text: '지금 이 순간에 마음을 둔다',
        deltas: { happiness: 5, health: 2 },
        result: '내일보다 오늘에 마음을 두는 법을, 이제는 안다.'
      },
      {
        id: 'fame-rediscovery-79',
        text: '온라인에서 옛 활약이 다시 회자된다',
        deltas: { fame: 6, happiness: 3 },
        result: '손주가 보여준 화면 속에서, 젊은 날의 자신을 다시 만났다.'
      },
      {
        id: 'fame-complete-obscurity-79',
        text: '이제는 누구도 이름을 모른다는 사실을 마주한다',
        deltas: { fame: -5, happiness: -3 },
        result: '서운함도 잠시, 이내 담담해지는 스스로를 발견했다.'
      },
      {
        id: 'fame-family-pride-79',
        text: '자녀·손주가 옛 활약을 자랑스러워한다',
        deltas: { fame: 2, relationship: 3, happiness: 3 },
        result: '내 이야기가 아이들 입을 통해 다시 전해지는 게, 새삼 뿌듯했다.'
      },
      {
        id: 'fame-legacy-questioned-79',
        text: '남긴 게 정말 있었는지 스스로 되묻는다',
        deltas: { fame: -3, happiness: -3 },
        result: '답을 쉽게 내리지 못한 채, 며칠을 곱씹었다.'
      },
      {
        id: 'fame-local-honor-79',
        text: '동네 어르신 모임에서 존재감을 인정받는다',
        deltas: { fame: 2, relationship: 2, happiness: 2 },
        result: '작은 모임이었지만, 그 안에서만큼은 여전히 주인공이었다.'
      },
      {
        id: 'fame-erased-from-records-79',
        text: '관련 기록마저 하나둘 사라지고 있다는 걸 안다',
        deltas: { fame: -4, happiness: -2 },
        result: '흔적이 옅어져 가는 걸 보면서도, 달리 할 수 있는 일이 없었다.'
      }
    ]
  },
  {
    id: 'twilight-80',
    name: '황혼',
    ageRange: '80세',
    intro: '팔순. 여든 해를 살아낸 삶을 온 가족과 함께 기립니다.',
    choices: [
      {
        id: 'grand-eightieth-celebration',
        text: '팔순을 맞아 온 가족, 친지가 모여 큰 잔치를 연다',
        deltas: { happiness: 6, relationship: 5, wealth: -5 },
        result: '이렇게 많은 얼굴이 다 모인 게, 얼마 만인지 몰랐다.'
      },
      {
        id: 'looking-back-at-eighty-years',
        text: '여든이라는 나이 앞에서 지나온 세월을 되짚는다',
        deltas: { happiness: 3, health: 0 },
        result: '한 문장으로는 다 담을 수 없는 세월이었다.'
      },
      {
        id: 'quiet-eightieth-with-spouse',
        text: '조용히 부부끼리만 소박하게 하루를 기념한다',
        deltas: { happiness: 4, relationship: 3 },
        result: '둘이서 보낸 조용한 하루가, 그 어떤 잔치보다 따뜻했다.'
      },
      {
        id: 'telling-life-story-to-grandkids',
        text: '여든 평생 살아온 이야기를 손주들에게 들려준다',
        deltas: { happiness: 5, relationship: 4 },
        result: '눈을 반짝이며 듣는 손주들 앞에서, 이야기가 절로 술술 나왔다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'pride-in-still-being-well-at-eighty',
        text: '아직 건재한 몸과 마음에 스스로 대견함을 느낀다',
        deltas: { happiness: 5, health: 3 },
        result: '여든에도 이만큼 지낼 수 있다는 게, 스스로도 뿌듯했다.'
      },
      {
        id: 'no-regrets-after-eighty-years',
        text: '지난 80년, 후회 없이 살았다고 스스로에게 말해준다',
        deltas: { happiness: 5, relationship: 2 },
        result: '완벽하지 않았지만, 그거면 충분했다고 되뇌었다.'
      },
      {
        id: 'mild-cognitive-decline-heal',
        text: '두뇌 활동과 규칙적인 생활을 이어간다',
        deltas: { health: 5, happiness: 3 },
        result: '오늘 아침엔 안경을 어디 뒀는지 바로 떠올랐다.',
        requiresCondition: 'mild-cognitive-decline',
        removeCondition: 'mild-cognitive-decline'
      },
      {
        id: 'fame-eightieth-celebration-media-80',
        text: '팔순 잔치 소식이 동네에서 화제가 된다',
        deltas: { fame: 4, relationship: 2, happiness: 3 },
        result: '오랜만에 모인 얼굴들 앞에서, 웃음과 눈물이 함께 났다.'
      },
      {
        id: 'fame-forgotten-achievements-80',
        text: '이룬 것들이 점점 기억 속에서 흐려진다는 걸 느낀다',
        deltas: { fame: -3, happiness: -2 },
        result: '자신조차 가물가물해지는 순간들이, 조금씩 늘어갔다.'
      },
      {
        id: 'fame-life-story-request-80',
        text: '살아온 이야기를 듣고 싶다는 요청을 받는다',
        deltas: { fame: 3, happiness: 2 },
        result: '어디서부터 말해야 할지 몰라, 한참을 웃기만 했다.'
      },
      {
        id: 'fame-outlived-recognition-80',
        text: '함께 활동하던 이들이 대부분 세상을 떠났다는 걸 안다',
        deltas: { fame: -4, happiness: -3, relationship: -1 },
        result: '이름을 나눌 사람이 줄어든다는 게, 이런 의미였다는 걸 이제야 안다.'
      },
      {
        id: 'fame-honored-elder-80',
        text: '마을 어르신 대표로 소개된다',
        deltas: { fame: 3, relationship: 2 },
        result: '대단한 자리는 아니었지만, 이름이 불릴 때마다 어깨가 펴졌다.'
      },
      {
        id: 'fame-anonymous-among-young-80',
        text: '젊은 사람들 사이에서는 그저 평범한 노인일 뿐이라는 걸 느낀다',
        deltas: { fame: -3, happiness: -1 },
        result: '서운함보다, 그것도 자연스러운 일이라는 생각이 더 컸다.'
      }
    ]
  },
  {
    id: 'twilight-81',
    name: '황혼',
    ageRange: '81세',
    intro: '매일 눈을 뜨는 것 자체가, 새삼 감사하게 느껴지는 나이입니다.',
    choices: [
      {
        id: 'grateful-just-to-wake-up',
        text: '매일 아침 눈을 뜨는 순간을 새삼 의식한다',
        deltas: { happiness: 5, health: 1 },
        result: '별거 아니던 아침이, 이제는 하나의 선물처럼 느껴졌다.'
      },
      {
        id: 'surrendering-to-slower-pace',
        text: '느려진 하루의 속도에 온전히 몸을 맡긴다',
        deltas: { happiness: 3, health: 2 },
        result: '서두를 이유가 없다는 걸, 이제는 정말로 받아들였다.'
      },
      {
        id: 'grandchild-visit-brings-energy',
        text: '손주가 찾아와 함께 시간을 보내며 활력을 얻는다',
        deltas: { happiness: 5, relationship: 3 },
        result: '작은 웃음소리 하나가, 집 안 공기를 다 바꿔놓았다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'loneliness-of-more-alone-time',
        text: '혼자 있는 시간이 늘며 적적함을 느낀다',
        deltas: { happiness: -3, relationship: -1 },
        result: '조용한 방 안에서, 가끔은 그 조용함이 버거웠다.'
      },
      {
        id: 'same-walking-path-comfort',
        text: '매일 같은 산책로를 걸으며 익숙한 위안을 얻는다',
        deltas: { happiness: 4, health: 2 },
        result: '늘 걷던 길이었지만, 매일 조금씩 다르게 보였다.'
      },
      {
        id: 'realizing-body-has-changed-again',
        text: '몸이 예전 같지 않다는 걸 다시 한번 실감한다',
        deltas: { happiness: -2, health: -2 },
        result: '작년과 또 달라진 몸이, 새삼 낯설게 느껴졌다.'
      },
      {
        id: 'grandchildren-generous-birthday-gift-81',
        text: '온 가족이 모여 생신을 챙긴다',
        deltas: { wealth: 2, relationship: 3, happiness: 3 },
        result: '다들 십시일반 모아온 마음이, 봉투 하나에 담겨 있었다.'
      },
      {
        id: 'long-held-land-sells-81',
        text: '오래전부터 갖고 있던 땅을 처분하기로 한다',
        deltas: { wealth: 8 },
        result: '평생 붙들고 있던 땅이, 마지막으로 큰 보탬이 됐다.'
      },
      {
        id: 'lottery-check-81',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'twilight-82',
    name: '황혼',
    ageRange: '82세',
    intro: '오랜 인연들의 안부가, 그 어느 때보다 소중하게 다가오는 나이입니다.',
    choices: [
      {
        id: 'calling-an-old-friend',
        text: '오랜 친구에게 안부 전화를 건다',
        deltas: { relationship: 4, happiness: 3 },
        result: '몇 마디 안부만으로도, 마음이 한결 든든해졌다.'
      },
      {
        id: 'more-friends-passing-away',
        text: '먼저 세상을 뜬 친구들이 하나둘 늘어간다',
        deltas: { happiness: -4, relationship: 0 },
        result: '전화번호부 속 이름들이, 조금씩 줄어들고 있었다.'
      },
      {
        id: 'meeting-remaining-friends-more',
        text: '몇 안 남은 친구와 더 자주 만나기로 한다',
        deltas: { relationship: 5, happiness: 4 },
        result: '남은 시간이 많지 않다는 걸 알기에, 더 자주 만나고 싶었다.'
      },
      {
        id: 'phone-checkins-with-friends',
        text: '전화 통화만으로도 서로의 안부를 확인하며 안심한다',
        deltas: { relationship: 3, happiness: 2 },
        result: '목소리 하나 듣는 것만으로도, 걱정이 반은 사라졌다.'
      },
      {
        id: 'comforting-a-widowed-friend',
        text: '혼자 남은 친구를 위로하며 자신의 처지를 돌아본다',
        deltas: { relationship: 3, happiness: -1 },
        result: '친구를 위로하면서, 나 자신도 함께 위로받는 기분이었다.'
      },
      {
        id: 'sharing-old-friend-stories-with-kids',
        text: '옛 친구와의 추억을 자녀에게 들려준다',
        deltas: { happiness: 4, relationship: 2 },
        result: '오래된 이야기를 꺼낼 때마다, 그 시절로 잠시 돌아간 기분이었다.',
        requiresFamilyMember: ['child']
      }
    ]
  },
  {
    id: 'twilight-83',
    name: '황혼',
    ageRange: '83세',
    intro: '혼자 해내던 일들에, 조금씩 다른 이의 손길이 필요해지는 시기입니다.',
    choices: [
      {
        id: 'daily-tasks-become-harder',
        text: '혼자 힘으로 하기 버거운 일들이 늘어난다',
        deltas: { health: -3, happiness: -2 },
        result: '늘 혼자 해오던 일들이, 하나둘 버거워지기 시작했다.'
      },
      {
        id: 'learning-to-accept-help',
        text: '가족의 도움을 받아들이는 법을 배운다',
        deltas: { relationship: 3, happiness: 2 },
        result: '도움을 받는 것도 용기가 필요하다는 걸, 이제는 안다.'
      },
      {
        id: 'going-out-less-due-to-mobility',
        text: '거동이 불편해지며 외출이 줄어든다',
        deltas: { health: -3, happiness: -2 },
        result: '바깥바람을 쐬는 일이, 점점 더 큰마음을 먹어야 하는 일이 됐다.'
      },
      {
        id: 'using-a-walker-carefully',
        text: '보행 보조기를 사용하며 조심스레 활동을 이어간다',
        deltas: { health: 2, happiness: 1 },
        result: '느리더라도, 스스로 걸을 수 있다는 게 감사했다.'
      },
      {
        id: 'trying-harder-out-of-guilt',
        text: '도움받는 게 미안해 스스로 더 애쓴다',
        deltas: { happiness: -2, health: -1 },
        result: '미안한 마음에 무리하다, 오히려 더 힘에 부쳤다.'
      },
      {
        id: 'appetite-loss-onset',
        text: '혼자 식사를 챙기기 귀찮아 대충 때운다',
        deltas: { health: -4, happiness: -2 },
        result: '젓가락을 몇 번 대다 마는 날이 늘었다.',
        addCondition: { id: 'appetite-loss', label: '🍚 식욕부진' }
      },
      {
        id: 'twilight-family-covers-expenses-83',
        text: '가족이 생활비 일부를 보태준다',
        deltas: { wealth: 3, relationship: 1 },
        result: '미안한 마음이 컸지만, 큰 힘이 됐다.'
      },
      {
        id: 'twilight-old-account-found-83',
        text: '정리하던 서랍에서 오래된 통장 하나를 발견한다',
        deltas: { wealth: 4 },
        result: '있는 줄도 몰랐던 돈이, 뜻밖의 반가움을 안겼다.'
      },
      {
        id: 'twilight-selling-remaining-furniture-83',
        text: '이제 안 쓰는 가구를 정리해 내놓는다',
        deltas: { wealth: 2 },
        result: '자리만 차지하던 것들이, 조금이나마 값을 했다.'
      },
      {
        id: 'twilight-insurance-claim-83',
        text: '미뤄뒀던 건강보험 실비 청구를 처리한다',
        deltas: { wealth: 2 },
        result: '진작 챙겼어야 했는데, 늦게라도 돌려받았다.'
      },
      {
        id: 'twilight-long-term-care-benefit-83',
        text: '장기요양보험 혜택을 새로 신청한다',
        deltas: { wealth: 3 },
        result: '모르고 지나칠 뻔한 혜택이, 뒤늦게 도움이 됐다.'
      },
      {
        id: 'twilight-children-pooling-money-83',
        text: '자녀들이 돌아가며 용돈을 챙겨준다',
        deltas: { wealth: 2, relationship: 2 },
        result: '한 달 한 달, 자식들의 마음이 통장에 쌓였다.'
      }
    ]
  },
  {
    id: 'twilight-84',
    name: '황혼',
    ageRange: '84세',
    intro: '지나온 삶 전체를 조용히 되새기게 되는, 사색의 시간이 깊어지는 나이입니다.',
    choices: [
      {
        id: 'quietly-reflecting-on-lifes-meaning',
        text: '지나온 인생의 의미를 조용히 되새긴다',
        deltas: { happiness: 3, health: 1 },
        result: '정답은 없었지만, 되짚어보는 것만으로도 충분했다.'
      },
      {
        id: 'gratitude-outweighs-regret-again',
        text: '후회보다 감사가 더 크다는 걸 다시 확인한다',
        deltas: { happiness: 5, relationship: 2 },
        result: '몇 번을 곱씹어도, 결론은 늘 같은 곳으로 향했다.'
      },
      {
        id: 'calmly-thinking-of-life-and-death',
        text: '삶과 죽음에 대해 담담하게 생각해본다',
        deltas: { happiness: 0, health: 0 },
        result: '두렵기보다, 자연스러운 순리로 받아들여졌다.'
      },
      {
        id: 'passing-wisdom-to-grandchildren',
        text: '손주들에게 살아온 지혜를 나눠준다',
        deltas: { relationship: 4, happiness: 4 },
        result: '내가 어렵게 배운 것들이, 조금은 쉽게 전해지길 바랐다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'treasuring-each-moment-as-if-last',
        text: '매 순간이 마지막일 수 있다는 생각에 하루를 더 소중히 여긴다',
        deltas: { happiness: 4, health: 1 },
        result: '그런 마음으로 보니, 평범한 하루도 다르게 보였다.'
      },
      {
        id: 'deeper-conversations-with-family',
        text: '가족과 더 깊은 대화를 나누며 서로를 이해한다',
        deltas: { relationship: 5, happiness: 3 },
        result: '이제야 서로에게 하지 못했던 말들을, 조금씩 꺼낼 수 있었다.'
      },
      {
        id: 'lottery-buy-84',
        text: '오랜만에 로또 한 장을 사본다',
        deltas: { happiness: 1 },
        result: '오랜만의 설렘이, 나쁘지 않았다.',
        addAsset: { id: 'lottery-ticket', label: '🎟️ 복권', type: 'movable' }
      },
      {
        id: 'lottery-skip-84',
        text: '굳이 안 사도 그만이라 여긴다',
        deltas: { happiness: 1 },
        result: '그 돈은 다른 데 쓰는 게 낫다고 여겼다.'
      }
    ]
  },
  {
    id: 'twilight-85',
    name: '황혼',
    ageRange: '85세',
    intro: '누군가의 손길이 일상 속에 자연스레 스며드는 시기입니다.',
    choices: [
      {
        id: 'starting-caregiver-support',
        text: '요양보호사의 도움을 받기 시작한다',
        deltas: { health: 3, wealth: -3 },
        result: '낯선 손길이었지만, 그만큼 몸도 마음도 한결 편해졌다.'
      },
      {
        id: 'awkward-with-strangers-help',
        text: '낯선 사람의 도움을 받는 게 처음엔 어색하다',
        deltas: { happiness: -2, relationship: 0 },
        result: '익숙해지기까지, 생각보다 시간이 걸렸다.'
      },
      {
        id: 'home-care-service-eases-life',
        text: '재가돌봄 서비스를 신청한다',
        deltas: { health: 3, happiness: 2 },
        result: '작은 도움 하나가, 하루 전체를 다르게 만들어줬다.'
      },
      {
        id: 'children-take-turns-visiting',
        text: '자녀들이 번갈아 찾아와 곁을 지켜준다',
        deltas: { relationship: 5, happiness: 4 },
        result: '누군가 찾아오는 발소리만 들려도, 마음이 환해졌다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'finding-peace-in-solitude',
        text: '혼자만의 시간에도 나름의 평온을 찾는다',
        deltas: { happiness: 3, health: 1 },
        result: '외로움이라 부르지 않기로, 스스로 마음을 정했다.'
      },
      {
        id: 'accepting-a-life-with-help',
        text: '도움을 받으며 살아가는 삶도 나쁘지 않다고 여긴다',
        deltas: { happiness: 3, relationship: 2 },
        result: '기대는 것도, 살아가는 방법 중 하나였다.'
      },
      {
        id: 'spouse-passes-away',
        text: '평생을 함께한 배우자를 먼저 떠나보낸다',
        deltas: { happiness: -9, health: -3, relationship: -2 },
        result: '옆자리가 이렇게 크게 비어 보일 줄은, 그 전엔 미처 몰랐다.',
        requiresFamilyMember: ['spouse'],
        removeFamilyMembers: ['spouse']
      },
      {
        id: 'lottery-check-85',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      },
      {
        id: 'fame-final-interview-85',
        text: '생애 마지막이 될지 모를 인터뷰를 요청받는다',
        deltas: { fame: 5, happiness: 2 },
        result: '카메라 앞에서, 평소보다 더 신중하게 말을 골랐다.'
      },
      {
        id: 'fame-world-moved-on-85',
        text: '세상은 이미 다른 이야기로 넘어갔다는 걸 느낀다',
        deltas: { fame: -4, happiness: -2 },
        result: '낯선 뉴스들 사이에서, 자신의 자리를 찾기가 어려웠다.'
      },
      {
        id: 'fame-honored-by-community-85',
        text: '오래 지켜온 동네에서 감사패를 받는다',
        deltas: { fame: 3, relationship: 2, happiness: 3 },
        result: '소박한 패 하나가, 평생의 시간을 인정받은 것 같아 뭉클했다.'
      },
      {
        id: 'fame-name-misremembered-85',
        text: '누군가 이름을 잘못 기억하고 있다는 걸 듣는다',
        deltas: { fame: -2, happiness: -2 },
        result: '굳이 바로잡지 않고, 그냥 웃어넘겼다.'
      },
      {
        id: 'fame-quiet-legacy-85',
        text: '요란하지 않은 흔적들을 하나씩 돌아본다',
        deltas: { fame: 2, happiness: 3 },
        result: '크게 알려지지 않았어도, 분명 남긴 게 있었다는 걸 깨달았다.'
      },
      {
        id: 'fame-completely-anonymous-85',
        text: '이제는 완전히 평범한 사람으로 지낸다',
        deltas: { fame: -3, happiness: 0 },
        result: '특별할 것 없는 하루하루가, 의외로 편안하게 느껴졌다.'
      }
    ]
  },
  {
    id: 'twilight-86',
    name: '황혼',
    ageRange: '86세',
    intro: '말보다 존재만으로도, 가족에게 무언가를 전할 수 있는 나이입니다.',
    choices: [
      {
        id: 'passing-life-wisdom-to-family',
        text: '자녀 세대에게 인생의 지혜를 전한다',
        deltas: { relationship: 4, happiness: 4 },
        result: '살아본 사람만 할 수 있는 말이, 조용히 전해졌다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'listening-to-grandchilds-worries',
        text: '손주의 고민을 들어준다',
        deltas: { relationship: 5, happiness: 3 },
        result: '해결책은 없어도, 들어주는 것만으로 충분할 때가 있었다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'clashing-over-old-habits',
        text: '예전 방식을 고집하다 자녀와 부딪힌다',
        deltas: { relationship: -3, happiness: -2 },
        result: '옳고 그름을 떠나, 서로 다른 시대를 살아온 탓이었다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'just-being-there-speaks-enough',
        text: '말보다 그저 곁에 있어주는 것으로 마음을 전한다',
        deltas: { relationship: 4, happiness: 3 },
        result: '아무 말 없이 앉아 있는 것만으로도, 충분한 날들이 있었다.'
      },
      {
        id: 'sense-of-presence-at-family-gathering',
        text: '가족 모임에서 어른으로서의 존재감을 느낀다',
        deltas: { happiness: 4, relationship: 2 },
        result: '한자리에 앉아 있는 것만으로도, 자리의 무게가 달랐다.'
      },
      {
        id: 'appetite-loss-heal',
        text: '식사를 조금씩 다시 챙기기 시작한다',
        deltas: { health: 5, happiness: 3 },
        result: '가족이 정성껏 차려준 밥상 앞에서, 오랜만에 숟가락이 가벼웠다.',
        requiresCondition: 'appetite-loss',
        removeCondition: 'appetite-loss'
      },
      {
        id: 'fame-milestone-recognition-86',
        text: '장수를 축하하는 자리에서 주목받는다',
        deltas: { fame: 3, happiness: 3, relationship: 2 },
        result: '긴 세월을 축하받는 자리가, 생각보다 훨씬 뭉클했다.'
      },
      {
        id: 'fame-world-unfamiliar-86',
        text: '달라진 세상이 낯설게만 느껴진다',
        deltas: { fame: -3, happiness: -2 },
        result: '눈앞의 것들이 어색해도, 애써 하나씩 다시 익혀나갔다.'
      },
      {
        id: 'fame-family-legacy-story-86',
        text: '가족 모임에서 살아온 이야기의 주인공이 된다',
        deltas: { fame: 3, relationship: 3, happiness: 2 },
        result: '몇 번을 들은 이야기인데도, 다들 처음인 듯 귀 기울여줬다.'
      },
      {
        id: 'fame-completely-unknown-86',
        text: '이제는 정말 아무도 알아보지 못한다는 걸 깨닫는다',
        deltas: { fame: -4, happiness: -2 },
        result: '당연한 일인데도, 마음 한구석이 허전한 건 어쩔 수 없었다.'
      },
      {
        id: 'fame-quiet-honor-86',
        text: '작은 표창을 조용히 받는다',
        deltas: { fame: 2, happiness: 2 },
        result: '화려하진 않았지만, 오래 살아온 시간을 인정받은 것 같았다.'
      },
      {
        id: 'fame-fading-into-history-86',
        text: '살아온 흔적이 조금씩 옛일로 흘러가고 있음을 느낀다',
        deltas: { fame: -3, happiness: -1 },
        result: '아쉬움보다는, 그 또한 자연스러운 흐름이라 받아들였다.'
      }
    ]
  },
  {
    id: 'twilight-87',
    name: '황혼',
    ageRange: '87세',
    intro: '병원을 오가는 일이 조금씩 일상의 한 부분이 되어가는 시기입니다.',
    choices: [
      {
        id: 'frequent-hospital-visits',
        text: '병원 방문이 부쩍 잦아진다',
        deltas: { health: -3, wealth: -3 },
        result: '대기실 의자가, 어느새 익숙한 자리가 됐다.'
      },
      {
        id: 'daily-medication-routine',
        text: '정기적인 검진과 약 복용이 일상이 된다',
        deltas: { health: 2, wealth: -2 },
        result: '아침저녁으로 챙기는 약이, 하루의 리듬이 되어줬다.'
      },
      {
        id: 'keeping-mind-sharp-despite-body',
        text: '몸은 쇠약해져도 정신만은 또렷하게 지키려 애쓴다',
        deltas: { happiness: 3, health: 1 },
        result: '몸이 따라주지 않아도, 생각만큼은 여전히 선명했다.'
      },
      {
        id: 'family-accompanies-hospital-trips',
        text: '가족들이 병원을 오갈 때마다 함께해준다',
        deltas: { relationship: 5, happiness: 3 },
        result: '혼자가 아니라는 사실 하나가, 큰 힘이 됐다.'
      },
      {
        id: 'sensitive-to-small-aches',
        text: '작은 통증에도 예민해지는 스스로를 다독인다',
        deltas: { happiness: -2, health: 0 },
        result: '별거 아닐 거라 되뇌면서도, 신경이 자꾸 쓰였다.'
      },
      {
        id: 'staying-tough-despite-it-all',
        text: '그래도 견딜 만하다며 씩씩하게 지낸다',
        deltas: { happiness: 4, health: 2 },
        result: '엄살보다는, 씩씩한 쪽을 택하기로 했다.'
      },
      {
        id: 'parkinsons-onset',
        text: '작은 움직임에도 예전과 다름을 느낀다',
        deltas: { health: -9, happiness: -5, relationship: 3 },
        result: '컵 하나 드는 것도 조심스러워졌지만, 가족들이 곁에서 손을 더 자주 잡아줬다.',
        addCondition: { id: 'parkinsons', label: '✋ 파킨슨병' }
      },
      {
        id: 'twilight-medical-expense-refund-87',
        text: '과다 청구됐던 병원비를 환급받는다',
        deltas: { wealth: 2 },
        result: '따져보길 잘했다, 생각보다 많이 돌아왔다.'
      },
      {
        id: 'twilight-pension-cost-of-living-adjustment-87',
        text: '연금 수령액이 물가에 맞춰 조정된다',
        deltas: { wealth: 2 },
        result: '많지는 않아도, 매달 조금씩 더 들어왔다.'
      },
      {
        id: 'twilight-family-covers-hospital-87',
        text: '자녀들이 병원비 일부를 대신 부담해준다',
        deltas: { wealth: 3, relationship: 2 },
        result: '자식들 덕에, 병원비 걱정이 한시름 놓였다.'
      },
      {
        id: 'twilight-selling-last-valuables-87',
        text: '남은 귀중품 몇 가지를 정리한다',
        deltas: { wealth: 4 },
        result: '오래 간직했던 것들이, 마지막으로 힘이 됐다.'
      },
      {
        id: 'twilight-welfare-support-applied-87',
        text: '지역 복지 지원금을 새로 신청한다',
        deltas: { wealth: 3 },
        result: '몰랐던 지원 제도가, 뒤늦게 도움을 줬다.'
      },
      {
        id: 'twilight-community-support-fund-87',
        text: '다니던 모임에서 작은 위로금을 전해온다',
        deltas: { wealth: 2, relationship: 1 },
        result: '큰돈은 아니었지만, 잊지 않았다는 게 고마웠다.'
      }
    ]
  },
  {
    id: 'twilight-88',
    name: '황혼',
    ageRange: '88세',
    intro: '미수(米壽). 쌀 미(米) 자에 여든여덟이라는 숫자가 담긴, 풍성한 나이입니다.',
    choices: [
      {
        id: 'misu-family-celebration',
        text: '미수(米壽)를 맞아 가족들이 정성껏 잔치를 준비한다',
        deltas: { happiness: 5, relationship: 4, wealth: -3 },
        result: '정성이 가득 담긴 잔치상 앞에서, 마음이 뭉클했다.'
      },
      {
        id: 'weight-of-eighty-eight',
        text: '여든여덟이라는 나이가 새삼 아득하게 느껴진다',
        deltas: { happiness: 0, health: 0 },
        result: '숫자를 되뇔 때마다, 지나온 세월이 새삼스러웠다.'
      },
      {
        id: 'meaning-of-rice-character',
        text: '쌀 미(米) 자에 담긴 뜻처럼, 풍성한 삶이었다고 되뇐다',
        deltas: { happiness: 5, relationship: 2 },
        result: '풍성하다는 말이, 이렇게 딱 들어맞을 줄 몰랐다.'
      },
      {
        id: 'quiet-day-for-misu',
        text: '조용히 가족들과 소박한 하루를 보낸다',
        deltas: { happiness: 4, relationship: 3 },
        result: '요란하지 않은 하루가, 오히려 더 오래 마음에 남았다.'
      },
      {
        id: 'thanking-those-who-stayed',
        text: '이 나이까지 함께해준 사람들에게 인사를 전한다',
        deltas: { relationship: 5, happiness: 4 },
        result: '고맙다는 말 한마디가, 생각보다 하기 쉽지 않았지만 꼭 하고 싶었다.'
      },
      {
        id: 'living-well-over-living-long',
        text: '오래 살았다는 것보다, 잘 살았다는 것에 방점을 찍는다',
        deltas: { happiness: 5, health: 1 },
        result: '길이보다 밀도가 중요하다는 걸, 이제는 안다.'
      },
      {
        id: 'misu-envelope-from-descendants-88',
        text: '미수(米壽) 잔치에 자손들이 저마다 마음을 보태 온다',
        deltas: { wealth: 3, relationship: 3, happiness: 3 },
        result: '봉투 두께보다, 마음의 두께가 더 크게 느껴졌다.'
      },
      {
        id: 'lifelong-collection-sold-88',
        text: '오랫동안 모아온 수집품을 정리해 내놓는다',
        deltas: { wealth: 4, happiness: 1 },
        result: '평생 취미로 모은 것들이, 뜻밖에 값진 마무리가 됐다.'
      }
    ]
  },
  {
    id: 'twilight-89',
    name: '황혼',
    ageRange: '89세',
    intro: '구순을 코앞에 두고, 마음을 가만히 가다듬는 한 해입니다.',
    choices: [
      {
        id: 'preparing-for-ninetieth',
        text: '다가오는 구순을 준비하며 마음을 가다듬는다',
        deltas: { happiness: 2, health: 1 },
        result: '아흔이라는 숫자가, 이번엔 낯설지 않게 다가왔다.'
      },
      {
        id: 'each-day-still-feels-new',
        text: '여전히 하루하루가 새롭게 느껴진다',
        deltas: { happiness: 4, health: 2 },
        result: '몇 번째 봄인지 셀 수 없어도, 매번 새로웠다.'
      },
      {
        id: 'noticeable-decline-in-strength',
        text: '몸의 기력이 눈에 띄게 줄어드는 걸 느낀다',
        deltas: { health: -4, happiness: -2 },
        result: '어제와 오늘이 눈에 띄게 다르다는 걸, 이제는 느낀다.'
      },
      {
        id: 'comfort-in-clear-mind',
        text: '그래도 정신만은 또렷하다는 사실에 위안을 얻는다',
        deltas: { happiness: 4, health: 1 },
        result: '몸은 예전만 못해도, 생각만큼은 여전히 나였다.'
      },
      {
        id: 'parkinsons-managed',
        text: '꾸준한 약물 치료와 재활로 떨림 증상이 눈에 띄게 안정된다',
        deltas: { health: 5, happiness: 3 },
        result: '완전히 사라지진 않았지만, 컵을 쥔 손이 다시 제법 든든해졌다.',
        requiresCondition: 'parkinsons',
        removeCondition: 'parkinsons'
      },
      {
        id: 'planning-ninetieth-with-kids',
        text: '자녀들과 구순 잔치 계획을 상의한다',
        deltas: { relationship: 4, happiness: 3 },
        result: '함께 이야기 나누는 시간부터, 이미 잔치 같았다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'grateful-for-those-present',
        text: '지금 곁에 있는 사람들에게 새삼 고마움을 느낀다',
        deltas: { relationship: 5, happiness: 4 },
        result: '당연한 얼굴들이 아니라는 걸, 이제는 안다.'
      },
      {
        id: 'lottery-check-89',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'twilight-90',
    name: '황혼',
    ageRange: '90세',
    intro: '구순. 아흔 해를 살아낸 시간이, 온 가족의 축하 속에 다시 한번 빛납니다.',
    choices: [
      {
        id: 'grand-ninetieth-gathering',
        text: '구순을 맞아 온 가족이 다시 한번 크게 모인다',
        deltas: { happiness: 6, relationship: 5, wealth: -4 },
        result: '몇 대에 걸친 얼굴들이 한자리에 모인 걸 보며, 가슴이 벅찼다.'
      },
      {
        id: 'looking-back-at-ninety-years',
        text: '아흔이라는 숫자 앞에서 지나온 세월을 되돌아본다',
        deltas: { happiness: 3, health: 0 },
        result: '한 번의 인생이 이렇게 길고도 깊을 수 있다는 걸, 새삼 느꼈다.'
      },
      {
        id: 'quiet-special-day-at-ninety',
        text: '조용히 곁의 사람과 하루를 특별하게 보낸다',
        deltas: { happiness: 4, relationship: 2 },
        result: '요란하지 않아도, 그 하루는 분명 특별했다.'
      },
      {
        id: 'passing-down-ninety-years-of-story',
        text: '아흔 평생 이야기를 후손들에게 전한다',
        deltas: { happiness: 5, relationship: 4 },
        result: '몇 번을 들려줘도, 이야기할 때마다 새로운 기억이 딸려 나왔다.'
      },
      {
        id: 'grateful-to-be-alive-and-loved',
        text: '살아온 날들과 곁의 사람들을 떠올려본다',
        deltas: { happiness: 6, relationship: 3 },
        result: '이만큼 사랑받으며 살아온 인생이라면, 충분하다고 생각했다.'
      },
      {
        id: 'no-regrets-after-ninety-years',
        text: '지난 90년을 돌아보며 여한이 없다고 말한다',
        deltas: { happiness: 5, health: 1 },
        result: '길게도, 짧게도 느껴지는 아흔 해였지만, 후회는 없었다.'
      }
    ]
  },
  {
    id: 'twilight-91',
    name: '황혼',
    ageRange: '91세',
    intro: '하루하루가 마치 선물처럼 느껴지는, 그런 나이입니다.',
    choices: [
      {
        id: 'every-day-feels-like-a-gift',
        text: '매일이 선물처럼 느껴지는 요즘이다',
        deltas: { happiness: 5, health: 1 },
        result: '눈을 뜨는 것 자체가, 이제는 당연한 일이 아니었다.'
      },
      {
        id: 'strength-fading-day-by-day',
        text: '몸의 기력이 하루가 다르게 줄어드는 걸 느낀다',
        deltas: { health: -3, happiness: -2 },
        result: '어제 할 수 있던 일이, 오늘은 힘에 부칠 때가 있었다.'
      },
      {
        id: 'joy-with-great-grandchildren',
        text: '손주, 증손주와 함께하는 시간이 가장 큰 낙이 된다',
        deltas: { happiness: 5, relationship: 4 },
        result: '작은 손님들이 다녀갈 때마다, 집 안이 환해졌다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'grateful-for-lifetime-of-bonds',
        text: '지난 세월 쌓아온 인연들을 하나씩 떠올려본다',
        deltas: { relationship: 4, happiness: 3 },
        result: '스쳐 간 얼굴 하나하나가, 다 소중한 인연이었다.'
      },
      {
        id: 'heart-still-feels-young',
        text: '몸은 느려져도 마음만은 여전히 청춘 같다',
        deltas: { happiness: 4, health: 1 },
        result: '거울 속 모습과 마음속 나이가, 여전히 조금 달랐다.'
      },
      {
        id: 'accepting-each-day-as-it-comes',
        text: '하루하루를 있는 그대로 받아들이는 법을 배운다',
        deltas: { happiness: 4, health: 2 },
        result: '바라는 것을 줄이니, 오히려 채워지는 것들이 많아졌다.'
      },
      {
        id: 'alzheimers-onset',
        text: '정밀 건강검진을 받으러 병원에 간다',
        deltas: { health: -8, happiness: -6, relationship: -3 },
        result: '나조차 낯설어지는 순간들이 늘어갔지만, 가족들은 그런 나를 몇 번이고 다시 소개해주었다.',
        addCondition: { id: 'alzheimers', label: '🧩 알츠하이머', causesChoiceFadeout: true }
      },
      {
        id: 'fame-remembered-fondly-91',
        text: '옛 동료들이 안부를 물으며 이름을 불러준다',
        deltas: { fame: 3, relationship: 3, happiness: 3 },
        result: '긴 세월에도 잊지 않고 불러주는 이름 하나가, 크게 다가왔다.'
      },
      {
        id: 'fame-name-fading-91',
        text: '세상에 남긴 이름이 서서히 옅어지고 있음을 느낀다',
        deltas: { fame: -4, happiness: -2 },
        result: '당연한 흐름이라 여기면서도, 마음 한구석은 허전했다.'
      },
      {
        id: 'fame-story-passed-down-91',
        text: '가족들이 살아온 이야기를 후손에게 전한다',
        deltas: { fame: 2, relationship: 3, happiness: 2 },
        result: '직접 말하지 않아도, 이야기가 대를 이어 전해진다는 게 든든했다.'
      },
      {
        id: 'fame-forgotten-by-industry-91',
        text: '한때 몸담았던 업계에서 더 이상 이름이 오르내리지 않는다',
        deltas: { fame: -4, happiness: -2 },
        result: '서운함보다는, 이제 다 지나간 일이라는 실감이 더 컸다.'
      },
      {
        id: 'fame-last-mention-91',
        text: '오래된 기사 한 줄에서 자신의 이름을 발견한다',
        deltas: { fame: 1, happiness: 1 },
        result: '바랜 종이 위 작은 글자가, 그날 하루를 따뜻하게 채웠다.'
      },
      {
        id: 'fame-obscurity-accepted-91',
        text: '유명했던 기억을 담담하게 떠올려본다',
        deltas: { fame: -2, happiness: 1 },
        result: '화려했던 날들도, 이제는 그저 지나온 시간의 일부일 뿐이었다.'
      }
    ]
  },
  {
    id: 'twilight-92',
    name: '황혼',
    ageRange: '92세',
    intro: '침상에서 보내는 시간이 조금씩 늘어가는, 조용한 나날입니다.',
    choices: [
      {
        id: 'more-time-spent-in-bed',
        text: '병상에서 보내는 시간이 조금씩 늘어난다',
        deltas: { health: -4, happiness: -2 },
        result: '창밖 하늘의 색이 바뀌는 걸로, 하루의 흐름을 가늠했다.'
      },
      {
        id: 'chatting-with-family-from-bed',
        text: '누워있는 시간에도 가족과 담소를 나누며 하루를 채운다',
        deltas: { relationship: 4, happiness: 3 },
        result: '몸은 누워 있어도, 대화만큼은 여전히 생생했다.'
      },
      {
        id: 'grateful-yet-sorry-to-caregivers',
        text: '간병하는 가족에게 미안함과 고마움을 동시에 느낀다',
        deltas: { relationship: 3, happiness: -1 },
        result: '고맙다는 말을 하면서도, 미안한 마음은 쉽게 가시지 않았다.'
      },
      {
        id: 'keeping-a-smile-despite-discomfort',
        text: '몸은 불편해도 표정만은 잃지 않으려 애쓴다',
        deltas: { happiness: 3, health: 1 },
        result: '가족들이 걱정할까 봐, 애써 웃음을 지어 보였다.'
      },
      {
        id: 'comfort-in-the-view-from-window',
        text: '병실 창밖 풍경 하나에도 위안을 얻는다',
        deltas: { happiness: 4, health: 1 },
        result: '나뭇가지 흔들리는 모습 하나로도, 마음이 차분해졌다.'
      },
      {
        id: 'still-finding-small-things-to-do-alone',
        text: '스스로 할 수 있는 것들을 찾아본다',
        deltas: { happiness: 4, health: 2 },
        result: '작은 것 하나라도 스스로 해내는 게, 큰 의미가 됐다.'
      },
      {
        id: 'twilight-bedside-account-check-92',
        text: '가족이 대신 통장을 정리해 알려준다',
        deltas: { wealth: 3, relationship: 1 },
        result: '몰랐던 돈이 남아있었다는 소식에, 작은 안도가 됐다.'
      },
      {
        id: 'twilight-old-collection-passed-on-92',
        text: '간직해온 물건 몇 가지가 새 주인을 찾는다',
        deltas: { wealth: 3 },
        result: '오래 곁에 뒀던 것들이, 마지막으로 값을 했다.'
      },
      {
        id: 'twilight-care-insurance-claim-92',
        text: '간병보험금을 청구한다',
        deltas: { wealth: 4 },
        result: '젊은 날 들어둔 보험이, 지금 이렇게 도움이 됐다.'
      },
      {
        id: 'twilight-family-gathers-support-92',
        text: '자녀들이 십시일반 병간호 비용을 모은다',
        deltas: { wealth: 3, relationship: 2 },
        result: '흩어져 있던 가족의 마음이, 한데 모였다.'
      },
      {
        id: 'twilight-pension-continues-92',
        text: '매달 들어오는 연금이 꾸준히 쌓인다',
        deltas: { wealth: 2 },
        result: '큰 액수는 아니어도, 꾸준함이 주는 안정감이 있었다.'
      },
      {
        id: 'twilight-old-friend-remembers-92',
        text: '문병 온 오랜 지인이 마음을 전하고 간다',
        deltas: { wealth: 1, relationship: 2, happiness: 1 },
        result: '작은 봉투 하나에, 오래된 인연의 무게가 담겨 있었다.'
      },
      {
        id: 'lottery-buy-92',
        text: '가족이 대신 사다 준 복권을 받아둔다',
        deltas: { happiness: 1 },
        result: '고맙다는 말과 함께, 봉투를 조심스레 받아뒀다.',
        addAsset: { id: 'lottery-ticket', label: '🎟️ 복권', type: 'movable' }
      },
      {
        id: 'lottery-skip-92',
        text: '괜찮다며 사양한다',
        deltas: { happiness: 1 },
        result: '마음만 받겠다며 웃어 보였다.'
      }
    ]
  },
  {
    id: 'twilight-93',
    name: '황혼',
    ageRange: '93세',
    intro: '못다 한 말들을, 이제는 하나씩 꺼내어 전하는 시기입니다.',
    choices: [
      {
        id: 'sharing-unspoken-stories-with-family',
        text: '자녀, 손주들과 그동안 못다 한 이야기를 나눈다',
        deltas: { relationship: 5, happiness: 4 },
        result: '이제야 꺼낸 이야기들이, 오히려 더 깊이 가닿았다.',
        requiresFamilyMember: ['child']
      },
      {
        id: 'telling-family-what-mattered',
        text: '가족들에게 하고 싶던 말을 하나씩 전한다',
        deltas: { relationship: 4, happiness: 4 },
        result: '오래 미뤄뒀던 말 한마디가, 생각보다 담백하게 나왔다.'
      },
      {
        id: 'silent-handhold-says-enough',
        text: '말없이 손을 맞잡는 것만으로도 마음이 통한다',
        deltas: { relationship: 4, happiness: 3 },
        result: '굳이 말하지 않아도, 손끝으로 전해지는 것들이 있었다.'
      },
      {
        id: 'every-moment-was-precious',
        text: '지난 삶의 매 순간이 다 소중했다는 걸 새삼 느낀다',
        deltas: { happiness: 5, health: 0 },
        result: '힘들었던 날들조차, 돌아보니 다 나름의 의미가 있었다.'
      },
      {
        id: 'looking-long-at-each-familiar-face',
        text: '가족 한 사람 한 사람의 얼굴을 오래도록 바라본다',
        deltas: { relationship: 5, happiness: 4 },
        result: '눈에 담아두고 싶은 얼굴들이, 그렇게나 많았다.'
      },
      {
        id: 'frailty-onset',
        text: '몸을 움직이기 귀찮아 하루 대부분을 누워 지낸다',
        deltas: { health: -5, happiness: -2 },
        result: '일어나 앉는 것조차, 이제는 큰일이 됐다.',
        addCondition: { id: 'frailty', label: '🕊️ 노쇠' }
      },
      {
        id: 'lottery-check-93',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'twilight-94',
    name: '황혼',
    ageRange: '94세',
    intro: '지녀온 것들과 마음을, 차분히 정리해보는 한 해입니다.',
    choices: [
      {
        id: 'sorting-belongings-and-thoughts',
        text: '그동안의 물건과 마음을 하나씩 정리한다',
        deltas: { happiness: 2, relationship: 2 },
        result: '물건 하나를 정리할 때마다, 그에 얽힌 시간도 함께 정리됐다.'
      },
      {
        id: 'writing-short-letters-to-loved-ones',
        text: '남길 이들에게 짧은 편지를 써본다',
        deltas: { happiness: 3, relationship: 3 },
        result: '몇 줄 안 되는 문장을 쓰는 데, 오랜 시간이 걸렸다.'
      },
      {
        id: 'a-lifetime-folded-into-each-item',
        text: '정리하는 손길에, 지나온 세월이 함께 담긴다',
        deltas: { happiness: 3, health: 0 },
        result: '낡은 물건 하나에도, 잊고 있던 하루가 고스란히 담겨 있었다.'
      },
      {
        id: 'choosing-presence-over-organizing',
        text: '복잡한 정리보다, 지금 곁의 사람에게 마음을 쓰기로 한다',
        deltas: { relationship: 4, happiness: 3 },
        result: '남기는 것보다, 지금 함께하는 게 더 중요하게 느껴졌다.'
      },
      {
        id: 'thinking-of-how-to-be-remembered',
        text: '무엇을 남기느냐보다, 어떻게 기억되고 싶은지를 생각한다',
        deltas: { happiness: 3, relationship: 1 },
        result: '따뜻한 사람으로 기억되고 싶다는 마음이, 가장 컸다.'
      },
      {
        id: 'lighter-heart-after-organizing',
        text: '정리를 마치고 나니, 마음이 한결 가벼워진다',
        deltas: { happiness: 4, health: 1 },
        result: '짐을 덜어낸 만큼, 마음도 홀가분해졌다.'
      }
    ]
  },
  {
    id: 'twilight-95',
    name: '황혼',
    ageRange: '95세',
    intro: '아흔다섯 해를 살아냈다는 사실이, 스스로도 믿기지 않는 나이입니다.',
    choices: [
      {
        id: 'amazed-at-ninety-five-years-lived',
        text: '아흔다섯 해를 살아냈다는 사실이 새삼 놀랍다',
        deltas: { happiness: 4, health: 0 },
        result: '숫자로 세어보니, 스스로도 믿기지 않았다.'
      },
      {
        id: 'being-alive-feels-miraculous',
        text: '여전히 살아있다는 것 자체가 기적처럼 느껴진다',
        deltas: { happiness: 5, health: 1 },
        result: '당연했던 것들이, 어느새 하나하나 기적이 되어 있었다.'
      },
      {
        id: 'grateful-for-devoted-family-care',
        text: '가족의 보살핌 속에서 하루하루를 보낸다',
        deltas: { relationship: 5, happiness: 4 },
        result: '곁을 지켜주는 손길 하나하나가, 그저 감사할 따름이었다.'
      },
      {
        id: 'weak-body-but-certain-of-love',
        text: '몸은 쇠약해도, 사랑받고 있다는 확신만은 뚜렷하다',
        deltas: { happiness: 5, relationship: 3 },
        result: '몸이 약해질수록, 사랑받고 있다는 확신은 오히려 더 선명해졌다.'
      },
      {
        id: 'past-life-feels-like-a-dream',
        text: '가끔 지난 생을 꿈처럼 떠올린다',
        deltas: { happiness: 2, health: 0 },
        result: '살아온 세월이, 마치 긴 꿈 하나를 꾼 것처럼 느껴졌다.'
      },
      {
        id: 'relief-at-getting-through-another-day',
        text: '오늘 하루도 무사히 넘겼다는 사실에 안도한다',
        deltas: { happiness: 3, health: 1 },
        result: '거창한 것 없이도, 무사한 하루 자체가 충분했다.'
      }
    ]
  },
  {
    id: 'twilight-96',
    name: '황혼',
    ageRange: '96세',
    intro: '몸은 약해져도 마음의 평화를 지켜내려 애쓰는, 고요한 나이입니다.',
    choices: [
      {
        id: 'guarding-inner-peace-despite-frailty',
        text: '몸은 쇠약해져도 정신의 평화를 지키려 애쓴다',
        deltas: { happiness: 4, health: 1 },
        result: '몸이 힘들수록, 마음만은 더 단단히 붙잡으려 했다.'
      },
      {
        id: 'frailty-heal',
        text: '정성 어린 돌봄과 재활을 이어간다',
        deltas: { health: 6, happiness: 3 },
        result: '며칠 만에 다시 앉을 수 있게 된 것만으로도, 온 가족이 기뻐했다.',
        requiresCondition: 'frailty',
        removeCondition: 'frailty'
      },
      {
        id: 'peace-in-the-familiar-rhythm-of-days',
        text: '익숙한 자장가 같은 하루의 리듬 속에 평온을 느낀다',
        deltas: { happiness: 4, health: 1 },
        result: '매일 같은 순서로 흘러가는 하루가, 오히려 큰 안정이 됐다.'
      },
      {
        id: 'reassured-by-a-familiar-voice',
        text: '가족의 목소리 하나로도 마음이 놓인다',
        deltas: { relationship: 4, happiness: 3 },
        result: '멀리서 들려오는 익숙한 목소리에도, 마음이 금세 편안해졌다.'
      },
      {
        id: 'reminiscing-with-old-songs',
        text: '예전 노래를 들으며 옛 시절을 추억한다',
        deltas: { happiness: 4, relationship: 1 },
        result: '멜로디 하나에, 잊고 있던 장면들이 줄줄이 떠올랐다.'
      },
      {
        id: 'quiet-happiness-in-a-still-day',
        text: '고요한 하루를 보낸다',
        deltas: { happiness: 4, health: 2 },
        result: '큰 사건 하나 없는 하루가, 그 자체로 평화로웠다.'
      }
    ]
  },
  {
    id: 'twilight-97',
    name: '황혼',
    ageRange: '97세',
    intro: '백수(白壽)를 코앞에 두고, 마음 한구석이 설레는 나이입니다.',
    choices: [
      {
        id: 'excited-for-upcoming-baeksu',
        text: '백수(白壽)를 코앞에 두고 있다',
        deltas: { happiness: 4, health: 1 },
        result: '살면서 이런 숫자를 마주할 줄은, 상상도 못 했다.'
      },
      {
        id: 'ninety-seven-years-not-a-short-journey',
        text: '아흔일곱 해, 짧지 않은 여정이었음을 실감한다',
        deltas: { happiness: 3, relationship: 1 },
        result: '길었던 만큼, 그 안에 담긴 이야기도 무수히 많았다.'
      },
      {
        id: 'family-prepares-baeksu-celebration-early',
        text: '가족들이 백수 잔치를 미리부터 준비한다',
        deltas: { relationship: 5, happiness: 4 },
        result: '준비하는 모습을 지켜보는 것만으로도, 마음이 벅찼다.'
      },
      {
        id: 'morning-gratitude-for-being-alive',
        text: '매일 아침 살아있음을 새삼 의식한다',
        deltas: { happiness: 5, health: 1 },
        result: '눈을 뜨는 순간마다, 짧은 감사 기도가 절로 나왔다.'
      },
      {
        id: 'quietly-mourning-those-who-went-first',
        text: '먼저 떠난 이들을 그리워하며 조용히 추모한다',
        deltas: { happiness: -2, relationship: 1 },
        result: '함께였다면 좋았을 얼굴들이, 오늘따라 유독 그리웠다.'
      },
      {
        id: 'this-moment-matters-most',
        text: '지금 이 순간이 가장 소중하다는 걸 되새긴다',
        deltas: { happiness: 4, health: 1 },
        result: '지나간 날도, 다가올 날도 아닌, 지금이 전부였다.'
      },
      {
        id: 'twilight-baeksu-early-gifts-97',
        text: '백수를 앞두고 여기저기서 미리 축하가 도착한다',
        deltas: { wealth: 3, relationship: 2, happiness: 2 },
        result: '이르게 도착한 마음들이, 벌써부터 가슴을 채웠다.'
      },
      {
        id: 'twilight-old-savings-final-check-97',
        text: '평생 모아온 돈을 마지막으로 정리해본다',
        deltas: { wealth: 2 },
        result: '숫자를 세어보니, 스스로도 놀랄 만큼 남아있었다.'
      },
      {
        id: 'twilight-pension-final-years-97',
        text: '연금이 마지막까지 꾸준히 들어온다',
        deltas: { wealth: 2 },
        result: '평생 부어온 것이, 끝까지 제 몫을 했다.'
      },
      {
        id: 'twilight-old-debt-finally-repaid-97',
        text: '잊고 있던 옛 빚 하나를 뒤늦게 돌려받는다',
        deltas: { wealth: 3 },
        result: '까맣게 잊고 있었는데, 이렇게 돌아올 줄 몰랐다.'
      },
      {
        id: 'twilight-community-recognition-gift-97',
        text: '장수를 축하하며 마을에서 작은 성금을 전해온다',
        deltas: { wealth: 2, relationship: 1, happiness: 1 },
        result: '마을 사람들의 마음이, 뜻밖의 선물로 돌아왔다.'
      },
      {
        id: 'twilight-simple-gift-from-grandchildren-97',
        text: '손주들이 마음을 담아 용돈을 모아온다',
        deltas: { wealth: 2, relationship: 2, happiness: 2 },
        result: '작은 액수였지만, 담긴 정성이 훨씬 컸다.'
      },
      {
        id: 'lottery-check-97',
        text: '사둔 복권의 당첨 결과를 확인해본다',
        result: '결과를 확인했다.',
        requiresAsset: 'lottery-ticket',
        removeAsset: 'lottery-ticket',
        mandatory: true,
        prizeTable: LOTTERY_PRIZE_TABLE
      }
    ]
  },
  {
    id: 'twilight-98',
    name: '황혼',
    ageRange: '98세',
    intro: '백 살이라는 숫자가, 이제는 정말 눈앞으로 성큼 다가온 나이입니다.',
    choices: [
      {
        id: 'realizing-a-hundred-is-near',
        text: '백 살이라는 숫자가 성큼 다가온 걸 실감한다',
        deltas: { happiness: 3, health: 0 },
        result: '평생 남 얘기 같던 숫자가, 이제는 코앞에 와 있었다.'
      },
      {
        id: 'family-talks-about-upcoming-baeksu',
        text: '가족들과 다가올 백수를 위한 이야기를 나눈다',
        deltas: { relationship: 4, happiness: 3 },
        result: '함께 계획을 나누는 시간만으로도, 이미 설렘이 가득했다.'
      },
      {
        id: 'quietly-tracing-a-century-of-time',
        text: '지나온 한 세기에 가까운 시간을 가만히 되짚는다',
        deltas: { happiness: 4, relationship: 1 },
        result: '한 세기에 가까운 시간이, 한 사람 안에 고스란히 담겨 있었다.'
      },
      {
        id: 'receiving-each-day-as-a-gift',
        text: '매일을 하루하루 받아들인다',
        deltas: { happiness: 5, health: 1 },
        result: '더 바랄 것 없이, 그저 오늘 하루가 감사했다.'
      },
      {
        id: 'brightened-by-great-grandchildren',
        text: '손주, 증손주들의 재롱에 하루하루가 환해진다',
        deltas: { happiness: 5, relationship: 4 },
        result: '어린 웃음소리 하나가, 집안 전체를 밝혔다.',
        requiresFamilyMember: ['grandchild']
      },
      {
        id: 'safe-today-the-greatest-greeting',
        text: '오늘도 무사히, 라는 말이 가장 큰 안부가 된다',
        deltas: { happiness: 4, health: 1 },
        result: '거창한 안부 대신, 그 한마디면 충분했다.'
      }
    ]
  },
  {
    id: 'twilight-99',
    name: '황혼',
    ageRange: '99세',
    intro: '백수(白壽). 백(百)에서 한 획을 뺀 흰 백(白) 자로, 아흔아홉 해를 기립니다.',
    choices: [
      {
        id: 'baeksu-village-wide-celebration',
        text: '백수(白壽)를 맞아 가족과 마을 사람들이 모인다',
        deltas: { happiness: 6, relationship: 5, wealth: -3 },
        result: '이렇게 많은 이들의 축하를 받을 줄은, 미처 몰랐다.'
      },
      {
        id: 'meaning-of-the-white-character',
        text: '백에서 하나를 뺀 흰 백(白) 자에 담긴 뜻을 되새긴다',
        deltas: { happiness: 4, health: 0 },
        result: '글자 하나에 담긴 그 마음이, 새삼 애틋하게 다가왔다.'
      },
      {
        id: 'lived-a-century-minus-one-fully',
        text: '백 년에 하나 모자란 세월을, 온전히 살아냈다고 느낀다',
        deltas: { happiness: 5, relationship: 2 },
        result: '모자란 게 아니라, 그 자체로 완전한 세월이었다.'
      },
      {
        id: 'quietly-sharing-this-moment-with-family',
        text: '조용히 가족들과 소박하게 이 순간을 나눈다',
        deltas: { happiness: 4, relationship: 3 },
        result: '요란하지 않은 축하가, 오히려 더 깊이 마음에 남았다.'
      },
      {
        id: 'no-regrets-in-any-moment',
        text: '지나온 모든 순간에 후회 없다고 스스로에게 말해준다',
        deltas: { happiness: 5, health: 1 },
        result: '완벽하지 않았던 순간들까지도, 이제는 다 끌어안을 수 있었다.'
      },
      {
        id: 'still-cant-believe-turning-a-hundred',
        text: '내일이면 백 살이라는 사실이 아직도 믿기지 않는다',
        deltas: { happiness: 4, health: 0 },
        result: '숫자 하나가, 이렇게 비현실적으로 느껴질 줄 몰랐다.'
      }
    ]
  },
  {
    id: 'twilight-100',
    name: '황혼',
    ageRange: '100세',
    intro: '백세. 한 세기를 온전히 살아낸 삶이, 마침내 이 자리에 도착합니다.',
    choices: [
      {
        id: 'overwhelmed-completing-a-century',
        text: '백 년의 인생을 마침내 완주했다는 벅찬 마음이 든다',
        deltas: { happiness: 6, relationship: 4, health: 1 },
        result: '결승선 같은 건 없었지만, 완주했다는 감각만은 또렷했다.'
      },
      {
        id: 'whole-world-celebrates-the-century',
        text: '온 가족, 온 세상이 그 100년을 함께한다',
        deltas: { happiness: 6, relationship: 5, wealth: -3 },
        result: '백 년이라는 시간이, 이렇게 많은 사람과 이어져 있었다.'
      },
      {
        id: 'still-loved-at-a-hundred',
        text: '백 살이 된 지금도, 여전히 사랑받고 있음을 느낀다',
        deltas: { happiness: 6, relationship: 4 },
        result: '나이가 백이 되어도, 사랑받는 마음만은 변하지 않았다.'
      },
      {
        id: 'a-century-of-moments-woven-into-one',
        text: '지나온 백 년의 모든 순간이 하나로 이어져 보인다',
        deltas: { happiness: 5, health: 1 },
        result: '흩어져 있던 장면들이, 이제 하나의 긴 이야기로 이어졌다.'
      },
      {
        id: 'a-life-fully-lived-no-regrets',
        text: '후회도 미련도 없이, 온전히 살아낸 삶이었다고 되뇐다',
        deltas: { happiness: 6, health: 2 },
        result: '완벽한 삶은 아니었지만, 온전한 삶이었다.'
      },
      {
        id: 'leaving-a-century-of-story-to-the-next',
        text: '백 년의 이야기를 마지막으로 후손들에게 남긴다',
        deltas: { happiness: 5, relationship: 5 },
        result: '이 이야기가, 다음 세대에게 작은 등불 하나가 되어주길 바랐다.'
      }
    ]
  }
  // 생애 10카테고리 전부 구현 완료(유아기~황혼, 0~100세). 이후 확장은
  // 엔딩 종류 추가(현재 6종) 등 콘텐츠 다양화 방향으로.
];

// 대표 엔딩 6개(기획안 07/09장 - v1 확정 스코프) - 각 아키타입에 가장 가까운
// 최종 스탯 조합(유클리드 거리)을 골라 배정한다. 여기에 가족/건강 상세를
// 반영한 4종을 더해 총 10종 - 이 4종은 스탯만으로는 절대 나올 수 없고,
// requiresAllFamilyMemberGroups(가족 상세와 동일한 AND-of-OR 문법)·
// requiresNoFamilyMember·requiresCondition 중 하나라도 붙어 있으면 그
// 조건을 만족한 판에서만 후보에 오른다(resolveEnding 참고) - 조건 없는
// 기존 6종은 항상 후보. 늘릴 땐 이 배열에 항목만 추가하면 된다(로직 변경
// 불필요, 조건이 필요 없으면 그냥 안 붙이면 됨).
const ENDINGS = [
  {
    id: 'all-in-success',
    title: '올인 성공형',
    archetype: { wealth: 90, fame: 85, happiness: 70, health: 55, relationship: 40 },
    text: '판을 크게 벌였고, 대부분 맞아떨어졌다. 무모하다는 말을 들을 때마다 결과로 답했고, 그 결과들이 차곡차곡 쌓여 지금의 이름을 만들었다.\n\n다만 그 판을 벌이는 동안 옆을 오래 비워둔 것도 사실이다. 명함은 두꺼워졌지만, 저녁을 함께 먹자고 편하게 부를 사람은 많지 않다. 남들은 운이라 부르지만, 본인은 안다 — 그 판을 벌인 순간들이 전부 선택이었다는 걸.'
  },
  {
    id: 'all-in-failure',
    title: '올인 실패형',
    archetype: { wealth: 15, fame: 20, happiness: 25, health: 35, relationship: 30 },
    text: '몇 번의 도박 같은 선택이 하나도 맞아떨어지지 않았다. 통장 잔고도, 이름값도, 몸 상태도 남들 앞에 자랑스레 내놓을 만한 건 딱히 없다.\n\n그래도 후회는 이상하게 크지 않다. 안 될 걸 알면서도 손을 뻗었던 순간들이, 아무것도 시도하지 않고 흘려보낸 시간보다는 낫다고 믿기 때문이다. 적어도 시도는 해봤다 — 그 한 줄이 지금 가진 전부이자, 유일한 자부심이다.'
  },
  {
    id: 'burnout',
    title: '번아웃형',
    archetype: { wealth: 70, fame: 60, happiness: 25, health: 15, relationship: 20 },
    text: '원하던 걸 대부분 손에 넣었다. 이름이 알려지고 통장도 두둑해졌지만, 정작 그걸 즐길 몸과 마음이 남아있지 않다.\n\n스케줄에는 빈틈이 없는데 마음 한 켠은 늘 헛헛하다. 성공의 증거들에 둘러싸인 채로, 오늘 하루를 버텨내는 게 유일한 목표가 되어버린 삶. 손에 쥔 게 많을수록 내려놓기가 더 두려워진다는 걸, 이제는 안다.'
  },
  {
    id: 'stable',
    title: '안정형',
    archetype: { wealth: 55, fame: 45, happiness: 65, health: 70, relationship: 60 },
    text: '화려한 순간은 많지 않았다. 대신 크게 무너진 적도 없다. 재산도, 인기도, 관계도 어느 하나 넘치지 않지만 어느 하나 바닥을 친 적도 없는, 고르게 채워온 인생이다.\n\n남들이 부러워할 만한 극적인 서사는 없을지 몰라도, 매일 아침 눈을 떴을 때 무너뜨릴 게 없다는 감각은 생각보다 귀하다. 화려하진 않았지만, 무너진 적도 없는 인생 — 어쩌면 그게 제일 어려운 거였을지도 모른다.'
  },
  {
    id: 'relationship-first',
    title: '관계 중심형',
    archetype: { wealth: 40, fame: 35, happiness: 75, health: 65, relationship: 90 },
    text: '통장 잔고보다 곁에 남은 사람 수를 세는 게 더 익숙한 인생이었다. 남들이 인맥과 실적을 쌓는 동안, 이쪽은 저녁 식탁에 둘러앉을 얼굴들을 하나씩 늘려왔다.\n\n부자는 못 됐고 유명해지지도 않았지만, 힘든 날 전화를 걸 수 있는 사람의 목록만큼은 누구보다 길다. 화려한 이력서 한 줄보다, 오래 곁을 지켜준 몇 사람의 이름이 이 삶을 더 정확하게 설명한다.'
  },
  {
    id: 'recluse',
    title: '은둔형',
    archetype: { wealth: 30, fame: 10, happiness: 55, health: 60, relationship: 15 },
    text: '세상의 소음에서 한 발, 또 한 발 물러섰다. 사람들과 부대끼며 얻는 것보다 잃는 게 더 커 보이던 어느 순간부터, 조용한 쪽을 택하는 게 자연스러워졌다.\n\n외로웠던 날이 없었다면 거짓말이다. 하지만 그보다 훨씬 많은 날이 그저 평온했다. 시끄러웠던 날은 거의 없었고, 그 고요함이 결국 이 삶을 지켜낸 가장 큰 이유였다.'
  },
  {
    id: 'full-family-legacy',
    title: '대를 이은 가족형',
    archetype: { wealth: 45, fame: 30, happiness: 75, health: 60, relationship: 95 },
    requiresAllFamilyMemberGroups: [['spouse'], ['child'], ['grandchild']],
    text: '이력서보다 가족사진첩이 훨씬 두꺼운 인생이었다. 결혼해서 가정을 이루고, 아이를 낳아 기르고, 그 아이가 다시 부모가 되는 걸 지켜보기까지 — 한 세대가 다음 세대로 이어지는 그 흐름 안에 언제나 함께 있었다.\n\n대단한 성취나 화려한 이력은 없었을지 몰라도, 명절마다 북적이는 밥상 앞에 앉을 때마다 이 삶이 헛되지 않았다는 걸 실감했다. 대를 이어 남긴 것이야말로, 가장 확실한 유산이었다.'
  },
  {
    id: 'living-with-illness',
    title: '평생을 안고 살아온 삶형',
    archetype: { wealth: 40, fame: 25, happiness: 55, health: 20, relationship: 65 },
    requiresCondition: 'rare-illness',
    text: '어릴 때 찾아온 병은 끝내 다 낫지 않았다. 완치라는 말 대신, "함께 살아가는 법"을 배우며 지나온 나날이었다. 몸이 마음처럼 따라주지 않는 날이 훨씬 많았지만, 그렇다고 멈춰 서 있지만은 않았다.\n\n남들보다 조금 느리고 조심스러운 걸음이었을 뿐, 걸어온 거리 자체는 결코 짧지 않았다. 아픈 몸으로도 여기까지 왔다는 사실 하나가, 스스로에게 건네는 가장 큰 위로였다.'
  },
  {
    id: 'rising-after-the-fall',
    title: '다시 일어난 삶형',
    archetype: { wealth: 30, fame: 20, happiness: 45, health: 15, relationship: 55 },
    requiresCondition: 'accident-aftereffects',
    text: '한순간의 사고가 그 이후의 모든 걸음을 바꿔놓았다. 예전과 같은 몸으로는 다시 설 수 없었지만, 그렇다고 완전히 주저앉지도 않았다. 남은 것들로 다시 걷는 법을 익히는 데, 그저 남들보다 조금 더 오랜 시간이 걸렸을 뿐이다.\n\n잃은 것을 세는 대신 버텨낸 하루하루를 세기 시작하면서부터, 삶은 다시 앞으로 나아갔다. 완전히 되돌아가진 못했어도 완전히 멈추지도 않았다는 것 — 그것만으로도 충분한 증거였다.'
  },
  {
    id: 'solitary-path',
    title: '홀로 걸어온 길형',
    archetype: { wealth: 35, fame: 20, happiness: 45, health: 55, relationship: 10 },
    requiresNoFamilyMember: ['father', 'mother', 'single-parent', 'sibling', 'younger-sibling', 'spouse', 'child'],
    text: '곁을 지켜줄 가족 없이, 온전히 혼자 힘으로 걸어온 인생이었다. 기댈 곳이 마땅치 않았던 순간들도 있었지만, 그때마다 스스로 자신의 버팀목이 되는 법을 익혀갔다.\n\n외로움이 아예 없었다면 거짓말이겠지만, 누구의 도움도 없이 여기까지 왔다는 사실은 무엇과도 바꿀 수 없는 자부심으로 남았다. 결국 가장 오래, 가장 가까이에서 함께한 건 자기 자신이었다.'
  },
  {
    id: 'enduring-companion',
    title: '오랜 동행형',
    archetype: { wealth: 45, fame: 30, happiness: 70, health: 55, relationship: 80 },
    requiresAllFamilyMemberGroups: [['spouse']],
    text: '화려한 경력도, 넓은 인맥도 아니었다. 한 사람과 오랜 세월을 함께 걸어왔다는 사실이, 이 인생을 설명하는 가장 정확한 한 줄이었다.\n\n크고 작은 다툼도 물론 있었지만, 그때마다 결국 서로에게 돌아왔다. 화려하진 않아도 단단했던 동행 — 그것으로 충분한 삶이었다.'
  }
];

// familyMembers/healthConditions를 넘기면, requiresAllFamilyMemberGroups·
// requiresNoFamilyMember·requiresCondition이 붙은 엔딩(가족/건강 상세
// 기반 4종)은 그 조건을 만족할 때만 후보에 오른다 - 조건이 없는 기존 6종은
// 항상 후보. 후보들 중에서는 여전히 최종 스탯과 가장 가까운(유클리드 거리)
// 것을 고른다 - 즉 조건을 만족한다고 무조건 그 엔딩이 나오는 게 아니라,
// "조건도 맞고 스탯도 그 아키타입에 가장 가까운" 경우에만 선택된다.
function resolveEnding(stats, familyMembers, healthConditions) {
  const familyIds = (familyMembers || []).map((f) => f.id);
  const conditionIds = (healthConditions || []).map((c) => c.id);

  const eligible = ENDINGS.filter((ending) => {
    if (ending.requiresAllFamilyMemberGroups && !ending.requiresAllFamilyMemberGroups.every((group) => group.some((id) => familyIds.includes(id)))) return false;
    if (ending.requiresNoFamilyMember && ending.requiresNoFamilyMember.some((id) => familyIds.includes(id))) return false;
    if (ending.requiresCondition && !conditionIds.includes(ending.requiresCondition)) return false;
    return true;
  });

  let best = eligible[0];
  let bestDist = Infinity;
  for (const ending of eligible) {
    let dist = 0;
    for (const key of Object.keys(ending.archetype)) {
      const diff = (stats[key] || 0) - ending.archetype[key];
      dist += diff * diff;
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = ending;
    }
  }
  return best;
}

// 건강이 0 이하로 떨어지면 100세까지 못 가고 그 자리에서 삶이 끝난다 - 대표
// 엔딩 6종처럼 최종 스탯 근접 매칭으로 고르는 게 아니라 "왜 끝났는지"가
// 명확한 별도 엔딩이라 항상 이 하나로 고정한다. 쓰러진 나이를 문구에 그대로
// 넣어서 몇 살에 삶이 멈췄는지 보여준다.
function buildCollapseEnding(ageRange) {
  return {
    id: 'collapse',
    title: '쓰러진 삶',
    text: (ageRange ? ageRange + ', ' : '') + '몸이 버틸 수 있는 한계를 이미 한참 전에 넘어서 있었다. 그리고 결국, 어느 하루 아침이 오지 않았다.\n\n하고 싶었던 일도, 만나고 싶었던 사람도 여전히 많이 남아 있었다. 그래도 지나온 시간이 헛되지 않았다는 것만은, 마지막 순간까지 스스로 알고 있었다.'
  };
}

// health와 마찬가지로 재산·인기·행복·관계 중 하나라도 0 이하로 떨어지면
// 그 즉시 삶이 멈춘다 - resolveEnding()의 스탯 근접 매칭을 타지 않고, "왜
// 끝났는지"가 분명한 전용 엔딩으로 고정된다. index.js의 applyChoice()에서
// health와 같은 우선순위 목록에 함께 등록해 사용한다.
function buildBankruptcyEnding(ageRange) {
  return {
    id: 'bankruptcy',
    title: '파산한 삶',
    text: (ageRange ? ageRange + ', ' : '') + '더 끌어다 쓸 곳도, 더 줄일 곳도 남아있지 않았다. 벌어들이는 속도보다 빠져나가는 속도가 언제나 더 빨랐고, 그 격차는 결국 메울 수 없는 지경까지 벌어졌다.\n\n돈이 전부는 아니라고 되뇌어 봐도, 매일의 걱정 앞에서는 공허한 말이었다. 그래도 빈털터리가 됐다고 해서, 지금까지 쌓아온 시간까지 전부 없던 일이 되는 건 아니었다.'
  };
}

function buildObscurityEnding(ageRange) {
  return {
    id: 'obscurity',
    title: '완전히 잊힌 삶',
    text: (ageRange ? ageRange + ', ' : '') + '어느 순간부터 아무도 이름을 기억하지 못했다. 한때는 화제의 중심에 있었다는 사실조차, 이제는 스스로도 가물가물했다.\n\n관심이 전부는 아니라고 믿고 싶었지만, 완전히 잊힌다는 건 생각보다 훨씬 조용하고 쓸쓸한 일이었다. 그래도 누구의 기억에도 없다고 해서, 그 시간을 살아낸 자신마저 사라지는 건 아니었다.'
  };
}

function buildDespairEnding(ageRange) {
  return {
    id: 'despair',
    title: '완전히 지쳐버린 삶',
    text: (ageRange ? ageRange + ', ' : '') + '더 이상 웃을 일이 남아있지 않은 것 같았다. 하루하루를 버텨내는 것 자체가 벅찬 날들이 계속됐고, 마음은 이미 오래전에 지쳐 있었다.\n\n괜찮다는 말을 스스로에게 몇 번이나 되풀이했는지 모른다. 그래도 완전히 무너진 그 순간에도, 여기까지 걸어온 발걸음만큼은 분명히 존재했다.'
  };
}

function buildIsolationEnding(ageRange) {
  return {
    id: 'isolation',
    title: '완전히 홀로 남은 삶',
    text: (ageRange ? ageRange + ', ' : '') + '곁에서 안부를 물어줄 사람이 더 이상 남아있지 않았다. 하나둘 멀어진 인연들은 결국 돌아오지 않았고, 연락처 목록만 조용히 남아 있었다.\n\n혼자가 편하다고 스스로를 다독여도, 완전한 고립은 생각보다 훨씬 무거웠다. 그래도 아무도 곁에 없다고 해서, 지금껏 나눴던 마음들까지 사라지는 건 아니었다.'
  };
}

module.exports = {
  STAGES,
  ENDINGS,
  resolveEnding,
  buildCollapseEnding,
  buildBankruptcyEnding,
  buildObscurityEnding,
  buildDespairEnding,
  buildIsolationEnding
};
