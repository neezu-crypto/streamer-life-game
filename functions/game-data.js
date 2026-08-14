// 게임 콘텐츠(생애 구간·선택지·엔딩) - 기획안(life-game-plan.html) 기준.
// 지금은 스켈레톤 단계라 10개 구간 중 3개만 채워뒀다 - 검색→이름짓기→선택→저장→
// 갤러리 공유까지 전체 파이프라인이 실제로 동작하는 걸 확인하기 위한 최소 분량.
// 나머지 7개 구간은 이 형식(STAGES 배열에 항목 추가)을 그대로 따라 채우면 된다.
//
// 선택지 작성 원칙(기획안 04장) - 문장만 보고 결과를 예측할 수 없게, 매 구간
// 선택지 3개는 항상 안전/도전/우회 세 태도 중 하나에 가깝게 쓴다. deltas는
// 선택 직후 결과 텍스트가 뜬 다음에만 공개된다(클라이언트에는 절대 미리 안 보냄).

const STAGES = [
  {
    id: 'infancy',
    name: '유아기',
    ageRange: '0–6세',
    // 태어날 집안은 스스로 고를 수 있는 게 아니다 - 이 구간만 3지선다가 아니라
    // 주사위 굴리기(서버가 choices 중 하나를 무작위로 뽑음, rollDice 함수)로
    // 진행한다. random:true가 있으면 클라이언트는 선택 버튼 대신 "주사위 굴리기"
    // 버튼만 보여준다(index.html의 renderStage 참고).
    random: true,
    choices: [
      {
        id: 'warm-poor',
        text: '차는 없어도 매일 웃음이 끊이지 않는 집에서 자란다',
        deltas: { happiness: 8, relationship: 6, wealth: -4 },
        result: '넉넉하진 않았지만, 그 시절 저녁 밥상의 온기는 지금도 선명하다.'
      },
      {
        id: 'busy-rich',
        text: '부모님이 사업을 크게 벌이며 바쁘게 사는 집에서 자란다',
        deltas: { wealth: 8, fame: 2, relationship: -6, health: -2 },
        result: '집은 늘 넓었지만, 부모님 얼굴을 보는 날은 손에 꼽았다.'
      },
      {
        id: 'big-family',
        text: '형제자매 여럿과 북적거리며 크는 대가족에서 자란다',
        deltas: { relationship: 8, happiness: 3, wealth: -3 },
        result: '내 것과 남의 것의 경계가 늘 흐릿했던, 시끄럽고 정신없던 유년기.'
      }
    ]
  },
  {
    id: 'elementary',
    name: '초등학생',
    ageRange: '7–12세',
    choices: [
      {
        id: 'well-rounded',
        text: '반 친구들과 두루두루 무난하게 지낸다',
        deltas: { relationship: 5, happiness: 3 },
        result: '딱히 튀지도, 겉돌지도 않은 채로 6년이 흘렀다.'
      },
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
      }
    ]
  },
  {
    id: 'twenties',
    name: '스무 살',
    ageRange: '19–23세',
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
      }
    ]
  }
  // TODO: 사춘기 / 고등학생 / 사회 초년생 / 서른 / 중년 / 노년 준비 / 황혼 - 7개 구간 남음.
];

// 대표 엔딩 6개(기획안 07/09장 - v1 확정 스코프) - 각 아키타입에 가장 가까운
// 최종 스탯 조합(유클리드 거리)을 골라 배정한다. 이후 버전에서 12~16개로
// 늘릴 땐 이 배열에 항목만 추가하면 된다(로직 변경 불필요).
const ENDINGS = [
  {
    id: 'all-in-success',
    title: '올인 성공형',
    archetype: { wealth: 90, fame: 85, happiness: 70, health: 55, relationship: 40 },
    text: '판을 크게 벌였고, 대부분 맞아떨어졌다. 남들은 운이라 부르지만, 본인은 안다 — 그 판을 벌인 순간들을.'
  },
  {
    id: 'all-in-failure',
    title: '올인 실패형',
    archetype: { wealth: 15, fame: 20, happiness: 25, health: 35, relationship: 30 },
    text: '몇 번의 도박 같은 선택이 하나도 맞아떨어지지 않았다. 그래도 후회는 별로 없다 — 적어도 시도는 해봤으니까.'
  },
  {
    id: 'burnout',
    title: '번아웃형',
    archetype: { wealth: 70, fame: 60, happiness: 25, health: 15, relationship: 20 },
    text: '원하던 걸 다 가졌는데, 정작 그걸 즐길 몸과 마음이 남아있지 않았다.'
  },
  {
    id: 'stable',
    title: '안정형',
    archetype: { wealth: 55, fame: 45, happiness: 65, health: 70, relationship: 60 },
    text: '화려하진 않았지만, 무너진 적도 없는 인생. 어쩌면 그게 제일 어려운 거였을지도.'
  },
  {
    id: 'relationship-first',
    title: '관계 중심형',
    archetype: { wealth: 40, fame: 35, happiness: 75, health: 65, relationship: 90 },
    text: '통장 잔고보다 곁에 남은 사람 수를 세는 게 더 익숙한 인생이었다.'
  },
  {
    id: 'recluse',
    title: '은둔형',
    archetype: { wealth: 30, fame: 10, happiness: 55, health: 60, relationship: 15 },
    text: '세상의 소음에서 한 발 물러나 조용히 살았다. 외로웠던 날도 있었지만, 시끄러웠던 날은 거의 없었다.'
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
