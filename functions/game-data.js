// 게임 콘텐츠(생애 구간·선택지·엔딩) - 기획안(life-game-plan.html) 기준.
// 지금은 스켈레톤 단계라 10개 생애 카테고리 중 3개(유아기/초등학생/스무살)만
// 채워뒀다 - 검색→이름짓기→선택→저장→갤러리 공유까지 전체 파이프라인이 실제로
// 동작하는 걸 확인하기 위한 최소 분량으로 시작했고, 이후 콘텐츠 분량을 늘렸다.
// 나머지 7개 카테고리는 이 형식(STAGES 배열에 항목 추가)을 그대로 따라 채우면 된다.
//
// 선택지 작성 원칙(기획안 04장) - 문장만 보고 결과를 예측할 수 없게, 매 구간
// 선택지는 항상 안전/도전/우회 세 태도 중 하나에 가깝게 쓴다. deltas는
// 선택 직후 결과 텍스트가 뜬 다음에만 공개된다(클라이언트에는 절대 미리 안 보냄).
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
// 건강 상세(healthConditions) - 선택지에 addCondition({id,label})을 붙이면
// 부상/질병이 "생기고", removeCondition(id)을 붙이면 그 조건이 나아서
// "없어진다". 서버(index.js의 applyChoice)가 그 판의 저장 슬롯에
// healthConditions 배열로 계속 들고 다니고, 클라이언트는 "현재 건강 상세"
// 패널에 그대로 보여준다. requiresCondition(id)을 붙인 회복용 선택지는 그
// 조건이 지금 없으면 애초에 노출 후보에서 빠진다(pickVisibleChoiceIds가
// 필터링) - 부러진 적 없는 팔이 "다 나았다"고 나오는 일이 없도록. 이런
// 조건부 선택지는 3개 노출에 항상 끼일 필요는 없고, 오히려 가끔만 등장하는
// 게 자연스럽다.

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
        text: '차는 없어도 매일 웃음이 끊이지 않는 집에서 태어난다',
        deltas: { happiness: 8, relationship: 6, wealth: -4 },
        result: '넉넉하진 않았지만, 그 시절 저녁 밥상의 온기는 지금도 선명하다.'
      },
      {
        id: 'busy-rich',
        text: '부모님이 사업을 크게 벌이며 바쁘게 사는 집에서 태어난다',
        deltas: { wealth: 8, fame: 2, relationship: -6, health: -2 },
        result: '집은 늘 넓었지만, 부모님 얼굴을 보는 날은 손에 꼽았다.'
      },
      {
        id: 'big-family',
        text: '형제자매 여럿과 북적거리는 대가족에서 태어난다',
        deltas: { relationship: 8, happiness: 3, wealth: -3 },
        result: '내 것과 남의 것의 경계가 늘 흐릿했던, 시끄럽고 정신없던 첫 해.'
      },
      {
        id: 'single-parent-close',
        text: '부모님 한 분과 유독 끈끈하게 지내는 집에서 태어난다',
        deltas: { relationship: 7, happiness: 4, wealth: -3 },
        result: '둘뿐이라 부족한 것도 있었지만, 그만큼 서로에게 전부였다.'
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
        result: '태어나자마자 "그 집 아이"라는 꼬리표가 먼저 붙었다.'
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
        text: '기침이 잦아지더니 천식 진단을 받는다',
        deltas: { health: -6, relationship: 2 },
        result: '작은 기침 소리에도 온 가족이 귀를 기울이게 됐다.',
        addCondition: { id: 'asthma', label: '🌬️ 천식' }
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
        text: '어른들 말투를 그대로 따라 해 웃음을 준다',
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
        text: '정글짐에서 뛰어내리다 팔이 부러진다',
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
        text: '장염을 달고 살아 배가 자주 아프다',
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
        result: '작은 몸으로 동생을 업어주겠다고 나서던 시절.'
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
        text: '초등학교에 갈 생각에 불안해한다',
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
        result: '축하할 일이었지만, 관심이 나눠지는 건 조금 낯설었다.'
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
        text: '친구와 크게 싸우고 화해하는 법을 배운다',
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
        text: '꾸준한 수영으로 어릴 적 천식을 완전히 극복한다',
        deltas: { health: 7, happiness: 3 },
        result: '가쁘게 몰아쉬던 숨이, 이제는 옛날이야기가 됐다.',
        requiresCondition: 'asthma',
        removeCondition: 'asthma'
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
        text: '축구를 하다 발목을 삐끗한다',
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
        text: '단짝과 다른 중학교에 배정돼 이별을 준비한다',
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
        text: '스트레스로 여드름이 부쩍 심해진다',
        deltas: { health: -3, happiness: -3 },
        result: '거울을 볼 때마다 마음까지 덩달아 움츠러들었다.',
        addCondition: { id: 'acne-breakout', label: '🌱 스트레스성 트러블' }
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
        result: '이겨서라기보다, 반 전체가 한마음이 됐던 그 하루가 오래 남았다.'
      },
      {
        id: 'wrist-sprain-onset',
        text: '체육대회 계주에서 무리하다 손목을 삐끗한다',
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
        text: '입시 스트레스로 위가 쓰리고 체하는 날이 잦아진다',
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
        result: '또래보다 몇 년 빨리 사회에 들어섰다는 자부심, 그리고 그만큼 빨리 늙는 기분.'
      },
      {
        id: 'startup-gamble',
        text: '친구들과 의기투합해 작은 창업에 뛰어든다',
        deltas: { wealth: -5, fame: 4, happiness: 3, health: -3 },
        result: '성공이라 부르기도, 실패라 부르기도 애매한 자리에서 스무 살의 여름이 다 갔다.'
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
        text: '자유로워진 만큼 생활 패턴이 완전히 무너진다',
        deltas: { health: -4, happiness: 2 },
        result: '새벽에 자고 오후에 일어나는 게 어느새 당연해졌다.'
      },
      {
        id: 'back-pain-onset',
        text: '잦은 알바 노동으로 허리에 무리가 온다',
        deltas: { health: -4, wealth: 3 },
        result: '택배 상자를 나르던 어느 날부터, 허리가 삐걱대기 시작했다.',
        addCondition: { id: 'back-pain', label: '🦴 허리 통증' }
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
        text: '동기들과 비교하며 초조함을 느낀다',
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
        text: '첫 인턴십에서 냉정한 현실을 마주한다',
        deltas: { happiness: -4, wealth: 2 },
        result: '이상과 현실 사이의 거리를 온몸으로 배운 몇 달이었다.'
      },
      {
        id: 'rejection-streak',
        text: '면접에서 줄줄이 떨어지며 좌절을 겪는다',
        deltas: { happiness: -5, relationship: 2 },
        result: '탈락 메일함이 늘어갈수록, 자신감도 조금씩 깎여나갔다.'
      },
      {
        id: 'unexpected-career-offer',
        text: '우연한 기회로 예상 못한 진로 제안을 받는다',
        deltas: { fame: 3, wealth: 3 },
        result: '전혀 예상 못한 곳에서 문 하나가 갑자기 열렸다.'
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
        text: '작은 성취 하나에도 크게 기뻐할 줄 알게 된다',
        deltas: { happiness: 5, relationship: 2 },
        result: '커피 한 잔의 여유에도 진심으로 행복해질 수 있다는 걸 알게 됐다.'
      },
      {
        id: 'burnout-onset',
        text: '인턴 생활에 몸과 마음을 갈아 넣다 번아웃이 온다',
        deltas: { health: -6, happiness: -4 },
        result: '인턴 생활에 몸과 마음을 갈아 넣다 어느 순간 완전히 방전됐다.',
        addCondition: { id: 'burnout-syndrome', label: '🔥 번아웃 증후군' }
      },
      {
        id: 'back-pain-heal',
        text: '필라테스·운동을 꾸준히 하며 허리 통증을 완전히 극복한다',
        deltas: { health: 5, wealth: -2 },
        result: '필라테스를 꾸준히 다니고 나서야, 허리가 예전 같아졌다.',
        requiresCondition: 'back-pain',
        removeCondition: 'back-pain'
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
        result: '계약서에 서명하는 손이 미세하게 떨렸다.'
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
        text: '문득 "이대로 괜찮은가" 하는 불안이 찾아온다',
        deltas: { happiness: -4, relationship: -1 },
        result: '잘 살고 있다는 확신이 문득 흔들리는 밤들이 있었다.'
      },
      {
        id: 'burnout-heal',
        text: '충분히 쉬며 번아웃에서 서서히 회복한다',
        deltas: { health: 6, happiness: 4, wealth: -3 },
        result: '충분히 쉬고 나서야, 다시 뭔가를 시작할 힘이 생겼다.',
        requiresCondition: 'burnout-syndrome',
        removeCondition: 'burnout-syndrome'
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
        result: '메모장 하나가 너덜너덜해질 때까지 모든 걸 적었다.'
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
        result: '낯선 얼굴들 사이에서 웃는 법부터 다시 배웠다.'
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
        result: '그날 밤은 유독 천장이 낯설게 느껴졌다.'
      },
      {
        id: 'rookie-camaraderie',
        text: '동기들과 끈끈한 생존 동료애를 쌓는다',
        deltas: { relationship: 5, happiness: 3 },
        result: '다 같이 신입이라는 이유 하나로 뭉쳤던 시절.'
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
        text: '어느 정도 일이 손에 익어 여유가 생긴다',
        deltas: { happiness: 3, fame: 1 },
        result: '이제야 주변을 둘러볼 여유가 조금 생겼다.'
      },
      {
        id: 'job-change-consideration',
        text: '더 나은 조건을 찾아 이직을 진지하게 고민한다',
        deltas: { fame: 2, happiness: -2 },
        result: '채용 공고 창을 몰래 켜두는 날이 늘었다.'
      },
      {
        id: 'overtime-recognition',
        text: '밤낮없이 야근하며 성과를 인정받는다',
        deltas: { wealth: 4, health: -4, fame: 2 },
        result: '인정받는 기쁨과 몸이 축나는 속도가 나란히 갔다.'
      },
      {
        id: 'preburnout-escape-trip',
        text: '번아웃 직전, 훌쩍 짧은 퇴사 여행을 다녀온다',
        deltas: { happiness: 5, wealth: -3 },
        result: '퇴사는 아니었지만, 며칠은 온전히 도망쳤다.'
      },
      {
        id: 'office-romance',
        text: '회사 사람과 사내 연애를 시작한다',
        deltas: { happiness: 4, relationship: 3 },
        result: '비밀 연애의 스릴이 은근히 재밌었다.'
      },
      {
        id: 'sns-comparison-fatigue',
        text: 'SNS 속 친구들의 화려한 삶과 나를 자꾸 비교한다',
        deltas: { happiness: -4, relationship: -1 },
        result: '남의 하이라이트와 내 일상을 비교하는 게 부질없다는 걸 알면서도 멈추지 못했다.'
      },
      {
        id: 'carpal-tunnel-onset',
        text: '매일 반복되는 키보드·마우스 작업으로 손목에 저림이 시작된다',
        deltas: { health: -4, wealth: 2 },
        result: '타이핑을 칠 때마다 손끝이 찌릿하게 저려왔다.',
        addCondition: { id: 'carpal-tunnel', label: '✋ 손목터널증후군' }
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
        result: '누군가를 가르치며, 스스로도 다시 배우게 됐다.'
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
        text: '업무 스트레스로 밤마다 잠들지 못하는 날이 늘어난다',
        deltas: { health: -5, happiness: -3 },
        result: '천장 무늬를 셀 수 있을 정도로, 밤이 길어졌다.',
        addCondition: { id: 'insomnia', label: '😵 불면증' }
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
        text: '동료의 퇴사·이직 소식에 나도 흔들린다',
        deltas: { happiness: -2, relationship: -1 },
        result: '축하 인사를 건네면서도, 마음 한구석이 복잡했다.'
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
        text: '작은 승진과 함께 책임이 부쩍 무거워진다',
        deltas: { fame: 4, wealth: 3, happiness: -2 },
        result: '명함에 적힌 직급 하나가 어깨를 조금 더 무겁게 했다.'
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
        result: '엊그제 신입이었던 것 같은데, 어느새 불리는 호칭이 달라져 있었다.'
      },
      {
        id: 'insomnia-heal',
        text: '수면 습관을 개선하며 불면증에서 서서히 벗어난다',
        deltas: { health: 6, happiness: 3 },
        result: '베개에 머리를 대자마자 잠드는 밤이, 다시 찾아왔다.',
        requiresCondition: 'insomnia',
        removeCondition: 'insomnia'
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
      }
    ]
  }
  // TODO: 서른 / 중년 / 노년 준비 / 황혼 - 4개 카테고리 남음.
];

// 대표 엔딩 6개(기획안 07/09장 - v1 확정 스코프) - 각 아키타입에 가장 가까운
// 최종 스탯 조합(유클리드 거리)을 골라 배정한다. 이후 버전에서 12~16개로
// 늘릴 땐 이 배열에 항목만 추가하면 된다(로직 변경 불필요).
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
  }
];

function resolveEnding(stats) {
  let best = ENDINGS[0];
  let bestDist = Infinity;
  for (const ending of ENDINGS) {
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

module.exports = { STAGES, ENDINGS, resolveEnding };
