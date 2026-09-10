#!/usr/bin/env node
// stocks RTDB 노드(주식 시세 등 거래 관련 필드까지 포함된 원본, 실시간으로 자주
// 바뀜)에서 {id,name}만 뽑아 정적 파일로 저장한다.
//
// 2026-09 갱신: 클라이언트(스트리머 검색 자동완성)는 이제 이 정적 파일 대신
// RTDB 파생 노드(streamerNames, soop-stock-market의 syncStreamerNameOnStockChange
// 트리거가 자동으로 최신화)를 쓰도록 app.js가 바뀌어서, 루트의 streamer-names.json은
// 더 이상 아무도 안 읽는다(삭제됨). 이 스크립트가 여전히 필요한 이유는 서버
// (functions/index.js의 지인 이름 뽑기, pickRandomStreamerName)가 콜드 스타트 시
// require()로 한 번만 읽어 메모리에 상주시키는 방식을 그대로 쓰고 있기 때문(2026-08-18
// 결정 - RTDB를 매 호출마다 읽지 않으려는 목적, 이 목적 자체는 지금도 유효해서
// 그대로 유지). 그래서 이제 functions/streamer-names.json 하나만 갱신한다.
//
// 스케줄러 없이 수동 실행 전용(2026-08-18, 사용자 지시 - "이름 데이터 업데이트
// 주기는 스케줄러 대신 내가 필요할때 지시할게"). 새 스트리머가 생겼거나 이름이
// 바뀌어서 최신화가 필요할 때 이 스크립트만 실행하면 된다:
//
//   node scripts/update-streamer-names.js
//
// firebase-tools CLI 로그인 세션(admin SDK 서비스 계정이 아니라 내 개인 로그인)을
// 그대로 재사용한다 - 로컬에서 admin SDK로 직접 읽으려 하면 ADC(서비스 계정
// 자격 증명)가 없어 실패하지만, firebase CLI는 로그인 세션으로 동작해서 된다.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT = 'soop-stock-market';

console.log('stocks 노드를 RTDB에서 읽는 중...');
const raw = execSync(`firebase database:get /stocks --project ${PROJECT}`, {
  maxBuffer: 1024 * 1024 * 50
}).toString();

const data = JSON.parse(raw) || {};
const names = Object.keys(data)
  .map((id) => ({ id, name: (data[id] && data[id].name) || '' }))
  .filter((s) => s.name);

if (!names.length) {
  console.error('이름을 하나도 못 뽑았음 - stocks 노드가 비어있거나 형식이 바뀐 듯. 중단.');
  process.exit(1);
}

const json = JSON.stringify(names);
const target = path.join(__dirname, '..', 'functions', 'streamer-names.json');
fs.writeFileSync(target, json);

console.log('스트리머 이름 ' + names.length + '명을 다음 파일에 기록함:');
console.log(' - ' + target);
console.log('(바이트: ' + Buffer.byteLength(json, 'utf8') + ')');
