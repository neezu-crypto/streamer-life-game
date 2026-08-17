#!/usr/bin/env node
// stocks RTDB 노드(주식 시세 등 거래 관련 필드까지 포함된 원본, 실시간으로 자주
// 바뀜)에서 검색·지인 상세 기능에 필요한 {id,name}만 뽑아 정적 파일로 저장한다.
// 클라이언트(스트리머 검색 자동완성)와 서버(functions/index.js의 지인 이름 뽑기)
// 양쪽 다 이 정적 파일을 쓰고, 매 요청마다 RTDB를 읽지 않는다 - 멀티플레이로
// 동시 접속자가 늘어도 이 데이터 다운로드 비용은 곱해지지 않는다.
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
const targets = [
  path.join(__dirname, '..', 'streamer-names.json'),
  path.join(__dirname, '..', 'functions', 'streamer-names.json')
];
targets.forEach((p) => fs.writeFileSync(p, json));

console.log('스트리머 이름 ' + names.length + '명을 다음 파일에 동일하게 기록함:');
targets.forEach((p) => console.log(' - ' + p));
console.log('(바이트: ' + Buffer.byteLength(json, 'utf8') + ')');
