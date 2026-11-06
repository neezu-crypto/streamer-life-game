'use strict';

const { getDatabase: getSharedDatabase, getDatabaseWithUrl } = require('firebase-admin/database');

const LIFE_GAME_DATABASE_URL = 'https://streamer-life-game-rtdb.firebaseio.com';
const LIFE_GAME_DATABASE_INSTANCE = 'streamer-life-game-rtdb';

function sharedDb() {
  return getSharedDatabase();
}

function lifeDb() {
  return getDatabaseWithUrl(LIFE_GAME_DATABASE_URL);
}

function isLifePath(path) {
  const value = String(path || '').replace(/^\/+/, '');
  return value === 'lifeGame' || value.startsWith('lifeGame/');
}

// 인생게임 함수는 기존 코드처럼 db.ref(path)를 사용하되, lifeGame 아래만 전용
// 인스턴스로 보낸다. users·stocks·인증·공통 접속 집계는 기본 인스턴스에 남는다.
function routedDb() {
  const shared = sharedDb();
  const life = lifeDb();
  return {
    ref(path) {
      if (path === undefined || path === null || path === '') return life.ref();
      return isLifePath(path) ? life.ref(path) : shared.ref(path);
    },
  };
}

module.exports = {
  LIFE_GAME_DATABASE_URL,
  LIFE_GAME_DATABASE_INSTANCE,
  sharedDb,
  lifeDb,
  routedDb,
};
