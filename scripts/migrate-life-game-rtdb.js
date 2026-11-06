'use strict';

// 인생게임 전용 RTDB 전환 도구. 원본 삭제 기능은 의도적으로 제공하지 않는다.
// --apply는 직전에 생성·검증한 원본/대상 백업을 다시 대조한 경우에만 허용한다.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const PROJECT_ID = 'soop-stock-market';
const SHARED_URL = 'https://soop-stock-market-default-rtdb.firebaseio.com';
const LIFE_URL = 'https://streamer-life-game-rtdb.firebaseio.com';
const LIFE_ROOT = 'lifeGame';
const ADMIN_PATH = 'adminCenter/adminUids';
// RTDB는 대규모 트리 전체 PUT 시 하위 Cloud Functions 트리거 폭주를 차단한다.
// 256 KiB 이하 PATCH/PUT으로 나눠 전용 인스턴스에 같은 구조를 재현한다.
const MAX_WRITE_BYTES = 256 * 1024;
const MAX_TRIGGERED_LEAVES = 100;

function options() {
  const result = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    if (!key.startsWith('--')) continue;
    result.set(key, process.argv[index + 1] && !process.argv[index + 1].startsWith('--') ? process.argv[++index] : true);
  }
  return result;
}

function token() {
  const value = execFileSync('gcloud', ['auth', 'print-access-token', '--project', PROJECT_ID], { encoding: 'utf8' }).trim();
  if (!value) throw new Error('Google Cloud 인증 토큰을 가져오지 못했습니다.');
  return value;
}

async function request(base, path, auth, method = 'GET', value) {
  const url = new URL(`${path.replace(/^\/+/, '')}.json`, `${base}/`);
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${auth}`, ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: value === undefined ? undefined : JSON.stringify(value),
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${method} ${url} 실패 (${response.status}): ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function bytes(value) { return Buffer.byteLength(JSON.stringify(value)); }
function readJson(path) { return JSON.parse(fs.readFileSync(path, 'utf8')); }
function leafCount(value) {
  if (!value || typeof value !== 'object') return 1;
  if (Array.isArray(value)) return value.length || 1;
  const entries = Object.values(value);
  return entries.length ? entries.reduce((total, child) => total + leafCount(child), 0) : 1;
}
function isTriggerSensitivePath(path) {
  return path === 'lifeGame/multiplayerVotes' || path.startsWith('lifeGame/multiplayerVotes/') ||
    path === 'lifeGame/multiplayerSessions' || path.startsWith('lifeGame/multiplayerSessions/');
}
function isVotePath(path) {
  return path === 'lifeGame/multiplayerVotes' || path.startsWith('lifeGame/multiplayerVotes/');
}
function isSessionRoot(path) {
  return path === 'lifeGame/multiplayerSessions';
}

function compatiblePartial(source, target) {
  if (target === null || target === undefined) return true;
  if (source === null || source === undefined || typeof source !== typeof target) return false;
  if (!source || typeof source !== 'object') return source === target;
  if (Array.isArray(source) || Array.isArray(target)) return same(source, target);
  return Object.entries(target).every(([key, value]) => Object.hasOwn(source, key) && compatiblePartial(source[key], value));
}

async function writeChunked(path, value, existing, auth) {
  if (same(value, existing)) return 0;
  // 투표 변경 트리거는 participant 한 명의 값마다 실행된다. 상위 host/stage
  // 단위 PATCH도 한 요청으로 다수의 트리거를 발생시키므로, 이 경로는 leaf까지
  // 반드시 분해한다. (값은 문자열이라 마지막 단계의 PUT은 트리거 1회다.)
  if (isVotePath(path) && value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value).filter(([key, child]) => !same(child, existing && existing[key]));
    // stage 아래의 participant 값들은 서로 독립적인 문자열 leaf다. 한 요청에 합치지는
    // 않되, 8개씩만 병렬 처리해 마이그레이션 런타임 제한은 피하고 트리거 폭주는 막는다.
    if (path.split('/').length >= 4) {
      let requestCount = 0;
      for (let index = 0; index < entries.length; index += 8) {
        const batch = entries.slice(index, index + 8);
        const counts = await Promise.all(batch.map(([key, child]) =>
          writeChunked(`${path}/${key}`, child, existing && existing[key], auth)));
        requestCount += counts.reduce((total, count) => total + count, 0);
      }
      return requestCount;
    }
    let requestCount = 0;
    for (const [key, child] of entries) {
      requestCount += await writeChunked(`${path}/${key}`, child, existing && existing[key], auth);
    }
    return requestCount;
  }
  // 세션 공개 동기화는 host 단위 트리거다. 여러 host를 한 PATCH에 넣지 않고
  // host별 PUT으로 쪼개면 각 요청이 한 번의 동기화만 발생시킨다.
  if (isSessionRoot(path) && value && typeof value === 'object' && !Array.isArray(value)) {
    let requestCount = 0;
    for (const [key, child] of Object.entries(value)) {
      requestCount += await writeChunked(`${path}/${key}`, child, existing && existing[key], auth);
    }
    return requestCount;
  }
  // 최상위 lifeGame PATCH는 Firebase가 하위 트리거 폭주로 거절한다. 이 레벨은
  // 반드시 자식별 요청으로만 내려간다.
  if (path === LIFE_ROOT && value && typeof value === 'object' && !Array.isArray(value)) {
    let requestCount = 0;
    for (const [key, child] of Object.entries(value)) {
      requestCount += await writeChunked(`${path}/${key}`, child, existing && existing[key], auth);
    }
    return requestCount;
  }
  if ((bytes(value) <= MAX_WRITE_BYTES && (!isTriggerSensitivePath(path) || leafCount(value) <= MAX_TRIGGERED_LEAVES)) ||
      !value || typeof value !== 'object' || Array.isArray(value)) {
    await request(LIFE_URL, path, auth, 'PUT', value);
    return 1;
  }
  let requestCount = 0;
  let patch = {};
  let patchBytes = 2;
  const flush = async () => {
    if (!Object.keys(patch).length) return;
    await request(LIFE_URL, path, auth, 'PATCH', patch);
    requestCount += 1;
    patch = {};
    patchBytes = 2;
  };
  for (const [key, child] of Object.entries(value)) {
    if (same(child, existing && existing[key])) continue;
    const childBytes = bytes(child);
    if (childBytes > MAX_WRITE_BYTES || (isTriggerSensitivePath(`${path}/${key}`) && leafCount(child) > MAX_TRIGGERED_LEAVES)) {
      await flush();
      requestCount += await writeChunked(`${path}/${key}`, child, existing && existing[key], auth);
      continue;
    }
    const entryBytes = Buffer.byteLength(JSON.stringify(key)) + childBytes + 2;
    if (patchBytes + entryBytes > MAX_WRITE_BYTES && Object.keys(patch).length) await flush();
    patch[key] = child;
    patchBytes += entryBytes;
  }
  await flush();
  return requestCount;
}

async function loadCurrent(auth) {
  const [lifeGame, targetLifeGame, adminUids, targetAdminUids] = await Promise.all([
    request(SHARED_URL, LIFE_ROOT, auth),
    request(LIFE_URL, LIFE_ROOT, auth),
    request(SHARED_URL, ADMIN_PATH, auth),
    request(LIFE_URL, 'lifeGameAdminUids', auth),
  ]);
  const enabledAdmins = Object.fromEntries(Object.entries(adminUids || {}).filter(([, value]) => value === true));
  return { lifeGame, targetLifeGame, enabledAdmins, targetAdminUids };
}

async function main() {
  const args = options();
  const auth = token();
  const current = await loadCurrent(auth);
  console.log(JSON.stringify({
    sourceBytes: bytes(current.lifeGame),
    targetEmpty: current.targetLifeGame === null,
    sourceAdminCount: Object.keys(current.enabledAdmins).length,
    targetAdminEmpty: current.targetAdminUids === null,
  }, null, 2));
  if (!args.has('--apply')) return;

  const sourceBackup = args.get('--source-backup');
  const targetBackup = args.get('--target-backup');
  if (!sourceBackup || !targetBackup) {
    throw new Error('--apply에는 --source-backup <전체 기본DB 백업> 및 --target-backup <전용DB 빈 상태 백업>이 필요합니다.');
  }
  const sourceRoot = readJson(sourceBackup);
  const targetRoot = readJson(targetBackup);
  if (!same(sourceRoot && sourceRoot.lifeGame, current.lifeGame)) {
    throw new Error('원본 백업의 lifeGame과 직전 운영 원본이 다릅니다. 새 백업을 만든 뒤 다시 실행하세요.');
  }
  const liveTargetRoot = {};
  if (current.targetLifeGame !== null) liveTargetRoot.lifeGame = current.targetLifeGame;
  if (current.targetAdminUids !== null) liveTargetRoot.lifeGameAdminUids = current.targetAdminUids;
  if (!same(targetRoot, Object.keys(liveTargetRoot).length ? liveTargetRoot : null)) {
    throw new Error('대상 백업과 직전 운영 대상이 다릅니다. 현재 대상 상태를 다시 백업한 뒤 다시 실행하세요.');
  }
  if (targetRoot !== null && !args.has('--resume')) {
    throw new Error('대상 전용 DB가 비어 있지 않습니다. 부분 복사본을 대조한 뒤 --resume으로만 재개할 수 있습니다.');
  }
  if (!compatiblePartial(current.lifeGame, current.targetLifeGame) ||
      !compatiblePartial(current.enabledAdmins, current.targetAdminUids)) {
    throw new Error('대상 전용 DB의 기존 값이 원본과 다릅니다. 자동 재개를 중단합니다.');
  }
  const requestCount = await writeChunked(LIFE_ROOT, current.lifeGame, current.targetLifeGame, auth);
  const adminWrites = await writeChunked('lifeGameAdminUids', current.enabledAdmins, current.targetAdminUids, auth);
  const verified = await loadCurrent(auth);
  if (!same(verified.lifeGame, current.lifeGame) || !same(verified.targetLifeGame, current.lifeGame) ||
      !same(verified.targetAdminUids, current.enabledAdmins)) {
    throw new Error('복사 뒤 전용 DB 대조에 실패했습니다. 기본 DB 원본은 보존됐습니다.');
  }
  console.log(`복사 및 대조 완료: ${requestCount + adminWrites}개 분할 쓰기, 기본 DB 원본은 삭제하지 않았습니다.`);
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
