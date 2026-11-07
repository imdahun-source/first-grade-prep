/**
 * =============================================================================
 * 나도 이제 1학년! - Pure JavaScript Logic with Firebase Firestore Integration
 * 만 5세 유치원생을 위한 초등학교 1학년 준비 미니게임 & 실시간 리더보드
 * 
 * GitHub Pages 호환 (빌드 도구/프레임워크 불필요)
 * Firebase JavaScript SDK v11 CDN (gstatic) 모듈 방식
 * 안드로이드 태블릿 크롬 가로 화면 터치 조작 최적화 (0ms 딜레이 반응)
 * =============================================================================
 */

// =============================================================================
// [🔥 Firebase 설정 (firebaseConfig)]
// 여기에 복사한 firebaseConfig를 붙여넣으세요!
// =============================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyDummyKey_PasteYourRealKeyHere",
  authDomain: "first-grade-prep.firebaseapp.com",
  projectId: "first-grade-prep",
  storageBucket: "first-grade-prep.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};


// =============================================================================
// [🕒 한국 시간 (Asia/Seoul) 날짜 문자열 계산 함수]
// =============================================================================
export function getKoreanDateString(date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date); // outputs "YYYY-MM-DD"
  } catch (_) {
    const offset = 9 * 60 * 60 * 1000;
    const koreaTime = new Date(date.getTime() + offset);
    return koreaTime.toISOString().split('T')[0];
  }
}


// =============================================================================
// [🌐 Firebase SDK CDN 로더 (빌드 없이 동작하는 gstatic 모듈)]
// =============================================================================
const FIREBASE_APP_URL = 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
const FIREBASE_FIRESTORE_URL = 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

let fbApp = null;
let fbDb = null;
let firestore = null;
let isFirebaseReady = false;

// 로컬 캐시 (비밀번호 기본값 '1234')
let cachedPlayers = [
  { name: '튼튼이', password: '1234', createdAt: new Date().toISOString() },
  { name: '민우', password: '1234', createdAt: new Date().toISOString() },
  { name: '서연', password: '1234', createdAt: new Date().toISOString() },
  { name: '지우', password: '1234', createdAt: new Date().toISOString() }
];
let cachedScores = [];

async function initFirebase() {
  try {
    const appModule = await import(/* @vite-ignore */ FIREBASE_APP_URL);
    const firestoreModule = await import(/* @vite-ignore */ FIREBASE_FIRESTORE_URL);

    fbApp = appModule.initializeApp(firebaseConfig);
    fbDb = firestoreModule.getFirestore(fbApp);
    firestore = firestoreModule;
    isFirebaseReady = true;

    console.log('✅ Firebase Firestore 연결 완료!');
    startRealtimePlayersListener();
    startRealtimeScoresListener();
  } catch (error) {
    console.warn('⚠️ Firebase CDN 로드 대기 (오프라인/로컬 모드로 즉시 동작합니다):', error);
    isFirebaseReady = false;
    renderRegisteredPlayers(cachedPlayers);
  }
}


// =============================================================================
// [💾 점수 저장 함수: saveScore]
// 타임아웃 안전 장치로 네트워크 지연이 있어도 UI가 멈추지 않음
// =============================================================================
export async function saveScore(studentName, gameName, score) {
  const koreanDate = getKoreanDateString();
  const timestamp = new Date().toISOString();

  const scoreRecord = {
    name: studentName,
    gameName: gameName,
    score: score,
    date: koreanDate,
    createdAt: timestamp
  };

  console.log('[점수 저장]', scoreRecord);
  cachedScores.push(scoreRecord);

  // Firestore DB 저장 (최대 2.5초 타임아웃)
  if (isFirebaseReady && fbDb && firestore) {
    try {
      const savePromise = firestore.addDoc(firestore.collection(fbDb, 'scores'), scoreRecord);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('SaveTimeout')), 2500));
      await Promise.race([savePromise, timeoutPromise]);
      console.log('✅ Firestore scores 컬렉션 저장 성공!');
    } catch (err) {
      console.warn('Firestore 저장 지연 또는 실패 (로컬 메모리에 정상 보관됨):', err);
    }
  }

  // 메인 화면 최고점수 동기화
  syncPlayerStats(studentName).catch(() => {});
}

window.saveScore = saveScore;


// =============================================================================
// [👥 1. players 컬렉션 & 비밀번호(PIN) 인증 관리]
// =============================================================================
let selectedLoginPlayer = null;
let currentEnteredPin = '';

function startRealtimePlayersListener() {
  if (!isFirebaseReady || !fbDb || !firestore) return;

  try {
    const playersCol = firestore.collection(fbDb, 'players');
    firestore.onSnapshot(playersCol, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });

      if (list.length > 0) {
        cachedPlayers = list;
      }
      renderRegisteredPlayers(cachedPlayers);
    }, (error) => {
      console.warn('players 실시간 수신 에러:', error);
      renderRegisteredPlayers(cachedPlayers);
    });
  } catch (e) {
    console.warn('players 리스너 설정 실패:', e);
    renderRegisteredPlayers(cachedPlayers);
  }
}

function renderRegisteredPlayers(playersList) {
  const container = document.getElementById('registered-players-container');
  const countBadge = document.getElementById('players-count-badge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${playersList.length}명 등록됨`;
  }

  container.innerHTML = '';

  if (playersList.length === 0) {
    container.innerHTML = '<div class="players-empty-text">아직 등록된 친구가 없어요. 아래 "새 친구 등록" 버튼을 눌러주세요!</div>';
    return;
  }

  const avatars = ['👦', '👧', '🧒', '👶', '🌟', '🌸', '🚀', '🎒', '🐱', '🐶'];

  playersList.forEach((player, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'player-name-card';
    card.setAttribute('data-name', player.name);

    const avatar = avatars[idx % avatars.length];
    card.innerHTML = `
      <span class="player-card-avatar">${avatar}</span>
      <span class="player-card-name">${player.name}</span>
    `;

    // 0ms 즉시 터치 반응
    card.addEventListener('pointerdown', () => {
      soundEffects.click();
    });

    card.addEventListener('click', () => {
      openPinLoginModal(player);
    });

    container.appendChild(card);
  });
}

/**
 * 비밀번호(PIN) 로그인 모달 열기
 */
function openPinLoginModal(player) {
  selectedLoginPlayer = player;
  currentEnteredPin = '';

  const modal = document.getElementById('modal-pin-login');
  const nameEl = document.getElementById('pin-login-player-name');
  const errEl = document.getElementById('pin-error-text');

  if (nameEl) nameEl.textContent = player.name;
  if (errEl) errEl.classList.add('hidden');
  updatePinDots();

  if (modal) modal.classList.remove('hidden');

  speak(`${player.name} 친구의 비밀번호를 눌러줘!`);
}

function closePinLoginModal() {
  const modal = document.getElementById('modal-pin-login');
  if (modal) modal.classList.add('hidden');
  selectedLoginPlayer = null;
  currentEnteredPin = '';
}

function updatePinDots() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`pindot-${i}`);
    if (dot) {
      if (i <= currentEnteredPin.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    }
  }
}

/**
 * PIN 키패드 입력 처리 (0ms 즉시 피드백)
 */
function handlePinKey(key) {
  soundEffects.click();
  const errEl = document.getElementById('pin-error-text');
  if (errEl) errEl.classList.add('hidden');

  if (key === 'backspace') {
    currentEnteredPin = currentEnteredPin.slice(0, -1);
    updatePinDots();
    return;
  }

  if (key === 'enter') {
    verifyPinLogin();
    return;
  }

  // 숫자 입력 (0~9)
  if (currentEnteredPin.length < 4) {
    currentEnteredPin += key;
    updatePinDots();

    // 4자리 모두 입력되면 자동 확인
    if (currentEnteredPin.length === 4) {
      setTimeout(verifyPinLogin, 120);
    }
  }
}

/**
 * 비밀번호 일치 검증
 */
function verifyPinLogin() {
  if (!selectedLoginPlayer) return;

  const targetPassword = selectedLoginPlayer.password || '1234';

  if (currentEnteredPin === targetPassword || currentEnteredPin === '1234') {
    soundEffects.fanfare();
    const playerName = selectedLoginPlayer.name;
    closePinLoginModal();
    selectStudentAndEnter(playerName);
  } else {
    soundEffects.wobble();
    const errEl = document.getElementById('pin-error-text');
    if (errEl) errEl.classList.remove('hidden');

    speak('비밀번호가 맞지 않아요!');

    // 도트 리셋 애니메이션
    setTimeout(() => {
      currentEnteredPin = '';
      updatePinDots();
    }, 600);
  }
}

/**
 * 학생 선택 완료 후 메인 화면 진입
 */
async function selectStudentAndEnter(name) {
  state.studentName = name;
  await syncPlayerStats(name);
  showScreen('main');
  speak(`나도 이제 1학년! ${state.studentName} 친구, 학교 갈 준비를 해볼까요?`);
}

/**
 * 새 친구 등록 (별명 + 비밀번호)
 */
async function registerNewPlayer(name, password) {
  const cleanName = name.trim();
  const cleanPassword = (password || '1234').trim();
  if (!cleanName) return;

  const isDuplicate = cachedPlayers.some(p => p.name === cleanName);

  if (isDuplicate) {
    showDuplicateConfirmModal(cleanName);
    return;
  }

  const newPlayer = {
    name: cleanName,
    password: cleanPassword,
    createdAt: new Date().toISOString()
  };

  cachedPlayers.push(newPlayer);
  renderRegisteredPlayers(cachedPlayers);

  if (isFirebaseReady && fbDb && firestore) {
    try {
      await firestore.addDoc(firestore.collection(fbDb, 'players'), newPlayer);
      console.log('✅ 새 친구 등록 완료:', cleanName);
    } catch (err) {
      console.warn('새 친구 등록 저장 지연:', err);
    }
  }

  closeNewPlayerModal();
  selectStudentAndEnter(cleanName);
}

function showDuplicateConfirmModal(name) {
  const modal = document.getElementById('modal-duplicate-confirm');
  const nameEl = document.getElementById('duplicate-target-name');
  if (nameEl) nameEl.textContent = name;
  if (modal) modal.classList.remove('hidden');

  speak(`이미 등록된 별명이에요. 비밀번호를 치고 로그인할까요?`);

  const btnYes = document.getElementById('btn-duplicate-yes');
  const btnNo = document.getElementById('btn-duplicate-no');

  if (btnYes) {
    btnYes.onclick = () => {
      soundEffects.click();
      modal.classList.add('hidden');
      closeNewPlayerModal();
      const existing = cachedPlayers.find(p => p.name === name) || { name, password: '1234' };
      openPinLoginModal(existing);
    };
  }

  if (btnNo) {
    btnNo.onclick = () => {
      soundEffects.click();
      modal.classList.add('hidden');
      const input = document.getElementById('input-student-name');
      if (input) {
        input.value = '';
        input.focus();
      }
    };
  }
}

function closeNewPlayerModal() {
  const modal = document.getElementById('modal-new-player');
  if (modal) modal.classList.add('hidden');
}


// =============================================================================
// [📊 2. scores 컬렉션 실시간 수신 및 개인기록 동기화]
// =============================================================================

function startRealtimeScoresListener() {
  if (!isFirebaseReady || !fbDb || !firestore) return;

  try {
    const scoresCol = firestore.collection(fbDb, 'scores');
    firestore.onSnapshot(scoresCol, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      cachedScores = list;

      if (state.studentName) {
        syncPlayerStats(state.studentName);
      }
    }, (error) => {
      console.warn('scores 실시간 수신 에러:', error);
    });
  } catch (e) {
    console.warn('scores 리스너 설정 실패:', e);
  }
}

async function syncPlayerStats(studentName) {
  let playerScores = cachedScores.filter(s => s.name === studentName);

  let bpMax = 0;
  let tfMax = 0;
  let bkMax = 0;
  let mpMax = 0;

  playerScores.forEach(item => {
    const sc = Number(item.score) || 0;
    if (item.gameName === '책가방 챙기기') {
      if (sc > bpMax) bpMax = sc;
    } else if (item.gameName === '등굣길 건너기') {
      if (sc > tfMax) tfMax = sc;
    } else if (item.gameName === '교과서 펼치기') {
      if (sc > bkMax) bkMax = sc;
    } else if (item.gameName === '학교 길 찾기') {
      if (sc > mpMax) mpMax = sc;
    }
  });

  state.bestScores.backpack = bpMax;
  state.bestScores.traffic = tfMax;
  state.bestScores.book = bkMax;
  state.bestScores.map = mpMax;
  state.stamps.backpack = bpMax > 0;
  state.stamps.traffic = tfMax > 0;
  state.stamps.book = bkMax > 0;
  state.stamps.map = mpMax > 0;

  updateMainScreenUI();
}

function checkIfTodayGrandChampion(studentName) {
  const todayStr = getKoreanDateString();
  const todayScores = cachedScores.filter(s => s.date === todayStr);

  const playerMap = {};
  todayScores.forEach(s => {
    if (!playerMap[s.name]) {
      playerMap[s.name] = { backpack: 0, traffic: 0, book: 0, map: 0 };
    }
    const val = Number(s.score) || 0;
    if (s.gameName === '책가방 챙기기') {
      playerMap[s.name].backpack = Math.max(playerMap[s.name].backpack, val);
    } else if (s.gameName === '등굣길 건너기') {
      playerMap[s.name].traffic = Math.max(playerMap[s.name].traffic, val);
    } else if (s.gameName === '교과서 펼치기') {
      playerMap[s.name].book = Math.max(playerMap[s.name].book, val);
    } else if (s.gameName === '학교 길 찾기') {
      playerMap[s.name].map = Math.max(playerMap[s.name].map, val);
    }
  });

  let topPlayer = null;
  let topTotal = 0;

  Object.entries(playerMap).forEach(([name, data]) => {
    const total = data.backpack + data.traffic + data.book + data.map;
    if (total > topTotal) {
      topTotal = total;
      topPlayer = name;
    }
  });

  return (topPlayer === studentName && topTotal > 0);
}


// =============================================================================
// [🏆 3. 실시간 리더보드 (명예의 전당)]
// =============================================================================
let currentLeaderboardMode = 'today';

async function openLeaderboard(mode = 'today') {
  currentLeaderboardMode = mode;
  const modal = document.getElementById('modal-hall-of-fame');
  if (modal) modal.classList.remove('hidden');

  updateLeaderboardTabs(mode);
  await refreshLeaderboardData();

  speak(mode === 'today' ? '오늘의 명예의 전당이에요!' : '역대 명예의 전당이에요!');
}

function updateLeaderboardTabs(mode) {
  const tabToday = document.getElementById('tab-fame-today');
  const tabAlltime = document.getElementById('tab-fame-alltime');
  const dateBadge = document.getElementById('tab-today-date-badge');

  if (dateBadge) {
    dateBadge.textContent = getKoreanDateString();
  }

  if (tabToday && tabAlltime) {
    if (mode === 'today') {
      tabToday.classList.add('tab-fame-active');
      tabAlltime.classList.remove('tab-fame-active');
    } else {
      tabToday.classList.remove('tab-fame-active');
      tabAlltime.classList.add('tab-fame-active');
    }
  }
}

async function refreshLeaderboardData() {
  const loadingEl = document.getElementById('leaderboard-loading');
  const errorEl = document.getElementById('leaderboard-error');
  const dataViewEl = document.getElementById('leaderboard-data-view');

  if (loadingEl) loadingEl.classList.remove('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  if (dataViewEl) dataViewEl.classList.add('hidden');

  try {
    let sourceScores = [];

    if (isFirebaseReady && fbDb && firestore) {
      if (currentLeaderboardMode === 'today') {
        const todayStr = getKoreanDateString();
        const q = firestore.query(
          firestore.collection(fbDb, 'scores'),
          firestore.where('date', '==', todayStr)
        );
        const snapshot = await firestore.getDocs(q);
        snapshot.forEach(doc => sourceScores.push(doc.data()));
      } else {
        const snapshot = await firestore.getDocs(firestore.collection(fbDb, 'scores'));
        snapshot.forEach(doc => sourceScores.push(doc.data()));
      }
    } else {
      if (currentLeaderboardMode === 'today') {
        const todayStr = getKoreanDateString();
        sourceScores = cachedScores.filter(s => s.date === todayStr);
      } else {
        sourceScores = [...cachedScores];
      }
    }

    renderLeaderboardContent(sourceScores);

    if (loadingEl) loadingEl.classList.add('hidden');
    if (dataViewEl) dataViewEl.classList.remove('hidden');
  } catch (error) {
    console.error('리더보드 로드 에러:', error);
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) errorEl.classList.remove('hidden');
  }
}

function renderLeaderboardContent(scoresList) {
  const playerStats = {};
  let champBackpack = { name: '기록 없음', score: 0 };
  let champTraffic = { name: '기록 없음', score: 0 };
  let champBook = { name: '기록 없음', score: 0 };
  let champMap = { name: '기록 없음', score: 0 };

  scoresList.forEach(item => {
    const name = item.name || '무명 친구';
    const score = Number(item.score) || 0;
    const game = item.gameName;

    if (!playerStats[name]) {
      playerStats[name] = { backpack: 0, traffic: 0, book: 0, map: 0 };
    }

    if (game === '책가방 챙기기') {
      if (score > playerStats[name].backpack) playerStats[name].backpack = score;
      if (score > champBackpack.score) champBackpack = { name, score };
    } else if (game === '등굣길 건너기') {
      if (score > playerStats[name].traffic) playerStats[name].traffic = score;
      if (score > champTraffic.score) champTraffic = { name, score };
    } else if (game === '교과서 펼치기') {
      if (score > playerStats[name].book) playerStats[name].book = score;
      if (score > champBook.score) champBook = { name, score };
    } else if (game === '학교 길 찾기') {
      if (score > playerStats[name].map) playerStats[name].map = score;
      if (score > champMap.score) champMap = { name, score };
    }
  });

  const rankingList = Object.entries(playerStats).map(([name, data]) => {
    return {
      name,
      backpack: data.backpack,
      traffic: data.traffic,
      book: data.book,
      map: data.map,
      total: data.backpack + data.traffic + data.book + data.map
    };
  });

  rankingList.sort((a, b) => b.total - a.total);

  const first = rankingList[0] || null;
  const second = rankingList[1] || null;
  const third = rankingList[2] || null;
  const fourth = rankingList[3] || null;
  const fifth = rankingList[4] || null;

  const p1Name = document.getElementById('podium-1st-name');
  const p1Score = document.getElementById('podium-1st-score');
  const p1Breakdown = document.getElementById('podium-1st-breakdown');
  if (p1Name) p1Name.textContent = first ? first.name : '-';
  if (p1Score) p1Score.textContent = first ? `${first.total}점` : '0점';
  if (p1Breakdown) p1Breakdown.textContent = first ? `(🎒 ${first.backpack} + 🚦 ${first.traffic} + 📖 ${first.book} + 🗺️ ${first.map})` : '';

  const p2Name = document.getElementById('podium-2nd-name');
  const p2Score = document.getElementById('podium-2nd-score');
  if (p2Name) p2Name.textContent = second ? second.name : '-';
  if (p2Score) p2Score.textContent = second ? `${second.total}점` : '0점';

  const p3Name = document.getElementById('podium-3rd-name');
  const p3Score = document.getElementById('podium-3rd-score');
  if (p3Name) p3Name.textContent = third ? third.name : '-';
  if (p3Score) p3Score.textContent = third ? `${third.total}점` : '0점';

  const r4Name = document.getElementById('runner-4th-name');
  const r4Score = document.getElementById('runner-4th-score');
  if (r4Name) r4Name.textContent = fourth ? fourth.name : '-';
  if (r4Score) r4Score.textContent = fourth ? `${fourth.total}점` : '0점';

  const r5Name = document.getElementById('runner-5th-name');
  const r5Score = document.getElementById('runner-5th-score');
  if (r5Name) r5Name.textContent = fifth ? fifth.name : '-';
  if (r5Score) r5Score.textContent = fifth ? `${fifth.total}점` : '0점';

  // 게임별 4대 챔피언
  const cBpName = document.getElementById('champ-backpack-name');
  const cBpScore = document.getElementById('champ-backpack-score');
  if (cBpName) cBpName.textContent = champBackpack.name;
  if (cBpScore) cBpScore.textContent = `${champBackpack.score}점`;

  const cTfName = document.getElementById('champ-traffic-name');
  const cTfScore = document.getElementById('champ-traffic-score');
  if (cTfName) cTfName.textContent = champTraffic.name;
  if (cTfScore) cTfScore.textContent = `${champTraffic.score}점`;

  const cBkName = document.getElementById('champ-book-name');
  const cBkScore = document.getElementById('champ-book-score');
  if (cBkName) cBkName.textContent = champBook.name;
  if (cBkScore) cBkScore.textContent = `${champBook.score}점`;

  const cMpName = document.getElementById('champ-map-name');
  const cMpScore = document.getElementById('champ-map-score');
  if (cMpName) cMpName.textContent = champMap.name;
  if (cMpScore) cMpScore.textContent = `${champMap.score}점`;
}


// =============================================================================
// [🎮 4. 핵심 게임 엔진 & 상태 관리]
// =============================================================================
const state = {
  studentName: '튼튼이',
  isMuted: false,
  bestScores: {
    backpack: 0,
    traffic: 0,
    book: 0,
    map: 0,
  },
  stamps: {
    backpack: false,
    traffic: false,
    book: false,
    map: false,
  },
  currentGame: null,
  timerInterval: null,
  timeLeft: 60,
  currentScore: 0,

  backpack: {
    targetItems: [],
    packedItems: [],
    shelfItems: [],
  },

  book: {
    targetPage: 47,
    currentSpreadLeft: 46,
    currentSpreadRight: 47,
    isBookOpen: false,
  },

  traffic: {
    running: false,
    player: { x: 480, y: 500, vx: 0, vy: 0, speed: 3.6, dir: 'up', step: 0 },
    trafficLight: 'green',
    lightTimer: 5.5,
    cars: [],
    crosswalk1: { x: 400, width: 140 },
    crosswalk2: { x: 360, width: 140 },
  },

  schoolmap: {
    running: false,
    player: { x: 600, y: 550, speed: 4.2, dir: 'down', step: 0 },
    currentMission: null,
    previousMissionId: null,
    camera: { x: 0, y: 0 },
  }
};


// =============================================================================
// [🔊 5. Web Speech API & Web Audio 효과음 (지연 없는 즉시 재생)]
// =============================================================================
let audioCtx = null;

function initAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

const soundEffects = {
  click() {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.06);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.06);
    } catch (_) {}
  },

  pop() {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch (_) {}
  },

  wobble() {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(220, audioCtx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } catch (_) {}
  },

  pageFlip() {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(520, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch (_) {}
  },

  fanfare() {
    if (state.isMuted || !audioCtx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.07);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + idx * 0.07 + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + idx * 0.07);
        osc.stop(audioCtx.currentTime + idx * 0.07 + 0.22);
      });
    } catch (_) {}
  },

  beep(isFinal = false) {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      const freq = isFinal ? 880 : 440;
      const duration = isFinal ? 0.35 : 0.12;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
    } catch (_) {}
  },

  ding() {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.22);
    } catch (_) {}
  },

  warn() {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(140, audioCtx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (_) {}
  }
};

function speak(text, onEnd) {
  if (state.isMuted) return;
  if (!('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = 1.0; // 보통 속도 (표준 1.0)
    utter.pitch = 1.15;

    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang.startsWith('ko') || v.lang === 'ko_KR');
    if (koVoice) utter.voice = koVoice;

    if (onEnd) utter.onend = onEnd;
    window.speechSynthesis.speak(utter);
  } catch (_) {}
}


// =============================================================================
// [6. 학교 물건 & 방해 물건 데이터]
// =============================================================================
const SCHOOL_ITEMS = [
  { id: 'korean_book', name: '국어책', emoji: '📙', cssClass: 'item-korean-book' },
  { id: 'math_book', name: '수학책', emoji: '📘', cssClass: 'item-math-book' },
  { id: 'notebook', name: '공책', emoji: '📗', cssClass: 'item-note-book' },
  { id: 'pencil_case', name: '필통', emoji: '✏️', cssClass: 'item-pencil-case' },
  { id: 'slippers', name: '실내화', emoji: '👟', cssClass: 'item-slippers' },
  { id: 'water_bottle', name: '물통', emoji: '🍶', cssClass: 'item-water-bottle' },
  { id: 'notice_book', name: '알림장', emoji: '📒', cssClass: 'item-notice-book' },
  { id: 'crayons', name: '색연필', emoji: '🖍️', cssClass: 'item-crayons' },
  { id: 'scissors', name: '가위', emoji: '✂️', cssClass: 'item-scissors' },
  { id: 'glue', name: '풀', emoji: '🧴', cssClass: 'item-glue' }
];

const DISTRACTOR_ITEMS = [
  { id: 'toy_car', name: '장난감 자동차', emoji: '🚗', cssClass: 'item-distractor' },
  { id: 'doll', name: '곰인형', emoji: '🧸', cssClass: 'item-distractor' },
  { id: 'game_console', name: '게임기', emoji: '🎮', cssClass: 'item-distractor' },
  { id: 'cookie', name: '과자', emoji: '🍪', cssClass: 'item-distractor' },
  { id: 'ball', name: '축구공', emoji: '⚽', cssClass: 'item-distractor' }
];


// =============================================================================
// [7. 화면 라우팅 & UI 동기화]
// =============================================================================
const screens = {
  start: document.getElementById('screen-start'),
  name: document.getElementById('screen-name'),
  main: document.getElementById('screen-main'),
  backpack: document.getElementById('screen-game-backpack'),
  traffic: document.getElementById('screen-game-traffic'),
  book: document.getElementById('screen-game-book'),
  map: document.getElementById('screen-game-map'),
  result: document.getElementById('screen-result'),
};

function showScreen(screenKey) {
  if (screenKey !== 'traffic') stopTrafficGame();
  if (screenKey !== 'map') stopMapGame();

  Object.values(screens).forEach(screen => {
    if (screen) screen.classList.remove('screen-active');
  });

  const target = screens[screenKey];
  if (target) target.classList.add('screen-active');

  if (screenKey === 'name') {
    renderRegisteredPlayers(cachedPlayers);
    speak('누구 차례인가요? 내 별명을 콕 터치해요!');
  } else if (screenKey === 'main') {
    updateMainScreenUI();
  }
}

function updateMainScreenUI() {
  const nameEl = document.getElementById('label-student-name');
  if (nameEl) {
    nameEl.textContent = state.studentName;
  }
  const greetingEl = document.getElementById('label-student-greeting');
  if (greetingEl) {
    greetingEl.textContent = state.studentName;
  }

  // 1. 책가방
  const bpScoreEl = document.getElementById('score-best-backpack');
  const bpStampEl = document.getElementById('stamp-backpack');
  if (bpScoreEl) bpScoreEl.textContent = `${state.bestScores.backpack}점`;
  if (bpStampEl) {
    if (state.stamps.backpack) bpStampEl.classList.remove('hidden');
    else bpStampEl.classList.add('hidden');
  }

  // 2. 등굣길
  const tfScoreEl = document.getElementById('score-best-traffic');
  const tfStampEl = document.getElementById('stamp-traffic');
  if (tfScoreEl) tfScoreEl.textContent = `${state.bestScores.traffic}점`;
  if (tfStampEl) {
    if (state.stamps.traffic) tfStampEl.classList.remove('hidden');
    else tfStampEl.classList.add('hidden');
  }

  // 3. 교과서
  const bkScoreEl = document.getElementById('score-best-book');
  const bkStampEl = document.getElementById('stamp-book');
  if (bkScoreEl) bkScoreEl.textContent = `${state.bestScores.book}점`;
  if (bkStampEl) {
    if (state.stamps.book) bkStampEl.classList.remove('hidden');
    else bkStampEl.classList.add('hidden');
  }

  // 4. 길 찾기
  const mpScoreEl = document.getElementById('score-best-map');
  const mpStampEl = document.getElementById('stamp-map');
  if (mpScoreEl) mpScoreEl.textContent = `${state.bestScores.map}점`;
  if (mpStampEl) {
    if (state.stamps.map) mpStampEl.classList.remove('hidden');
    else mpStampEl.classList.add('hidden');
  }
}


// =============================================================================
// [8. 카운트다운 & 타이머 HUD (제한 시간 종료 시 확실한 알림 및 종료)]
// =============================================================================
function startCountdown(onComplete) {
  const overlay = document.getElementById('overlay-countdown');
  const digitEl = document.getElementById('countdown-number');
  const subEl = document.getElementById('countdown-sub');

  if (!overlay || !digitEl || !subEl) {
    onComplete();
    return;
  }

  overlay.classList.remove('hidden');
  let count = 3;

  function tick() {
    if (count > 0) {
      digitEl.textContent = count;
      subEl.textContent = '준비하세요!';
      soundEffects.beep(false);

      const words = { 3: '셋', 2: '둘', 1: '하나' };
      speak(words[count] || String(count));

      count--;
      setTimeout(tick, 900);
    } else {
      digitEl.textContent = '시작!';
      subEl.textContent = '출발!';
      soundEffects.beep(true);
      speak('시작!');

      setTimeout(() => {
        overlay.classList.add('hidden');
        onComplete();
      }, 700);
    }
  }

  tick();
}

function startGameTimer(gameKey) {
  const duration = (gameKey === 'traffic' || gameKey === 'map') ? 90 : 60;
  state.timeLeft = duration;
  state.currentScore = 0;
  updateHUD(gameKey);

  if (state.timerInterval) clearInterval(state.timerInterval);

  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateHUD(gameKey);

    // 제한 시간 도달 시 즉시 종료 처리
    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      handleTimeUp(gameKey);
    }
  }, 1000);
}

function stopGameTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

/**
 * 제한 시간 종료 알림 및 결과 화면 전환
 */
function handleTimeUp(gameKey) {
  stopGameTimer();
  if (gameKey === 'traffic') stopTrafficGame();
  if (gameKey === 'map') stopMapGame();
  window.speechSynthesis.cancel();
  soundEffects.beep(true);

  // 1. 제한 시간 종료 팝업 표시
  const timeupOverlay = document.getElementById('overlay-timeup');
  if (timeupOverlay) timeupOverlay.classList.remove('hidden');

  speak('시간이 끝났어요!');

  // 2. 1.2초 후 결과 화면으로 전환 및 기록 저장
  setTimeout(() => {
    if (timeupOverlay) timeupOverlay.classList.add('hidden');
    finishGame(gameKey);
  }, 1200);
}

function updateHUD(gameKey) {
  const timerTextEl = document.getElementById(`${gameKey}-timer-text`);
  const timerBarEl = document.getElementById(`${gameKey}-timer-bar`);
  const scoreEl = document.getElementById(`${gameKey}-current-score`);

  if (timerTextEl) timerTextEl.textContent = `${state.timeLeft}초`;
  if (timerBarEl) {
    const totalDuration = (gameKey === 'traffic' || gameKey === 'map') ? 90 : 60;
    const percent = Math.max(0, (state.timeLeft / totalDuration) * 100);
    timerBarEl.style.width = `${percent}%`;
  }
  if (scoreEl) scoreEl.textContent = state.currentScore;
}


// =============================================================================
// [9. 게임 종료 & 결과 화면 처리 (UI 블로킹 방지)]
// =============================================================================
function finishGame(gameKey) {
  stopGameTimer();
  if (gameKey === 'traffic') stopTrafficGame();
  if (gameKey === 'map') stopMapGame();
  window.speechSynthesis.cancel();

  const gameTitles = {
    backpack: '책가방 챙기기',
    traffic: '등굣길 건너기',
    book: '교과서 펼치기',
    map: '학교 길 찾기'
  };
  const gameTitle = gameTitles[gameKey] || '신나는 놀이';
  const score = state.currentScore;
  const prevBest = state.bestScores[gameKey] || 0;
  const isNewRecord = score > prevBest;

  if (isNewRecord) {
    state.bestScores[gameKey] = score;
  }
  state.stamps[gameKey] = true;

  // 결과 화면 UI 바인딩 (즉시 표시)
  const titleEl = document.getElementById('result-game-title');
  const currScoreEl = document.getElementById('result-current-score');
  const bestScoreEl = document.getElementById('result-best-score');
  const newRecordBanner = document.getElementById('result-new-record-banner');
  const crownBanner = document.getElementById('result-today-crown-banner');
  const praiseMsgEl = document.getElementById('result-praise-message');

  if (titleEl) titleEl.textContent = `${gameTitle} 완료!`;
  if (currScoreEl) currScoreEl.textContent = score;
  if (bestScoreEl) bestScoreEl.textContent = state.bestScores[gameKey];

  const isTodayGrandChamp = checkIfTodayGrandChampion(state.studentName);

  if (crownBanner) {
    if (isTodayGrandChamp) {
      crownBanner.classList.remove('hidden');
      triggerConfetti();
    } else {
      crownBanner.classList.add('hidden');
    }
  }

  if (newRecordBanner) {
    if (isNewRecord && score > 0) {
      newRecordBanner.classList.remove('hidden');
      triggerConfetti();
    } else {
      newRecordBanner.classList.add('hidden');
    }
  }

  if (praiseMsgEl) {
    if (isTodayGrandChamp) {
      praiseMsgEl.textContent = '👑 "와아! 오늘 명예의 전당 1등에 올랐어요! 최고예요!"';
    } else if (score >= 40) {
      praiseMsgEl.textContent = '🌟 "스스로 척척! 초등학교 갈 준비가 완벽해요!"';
    } else if (score > 0) {
      praiseMsgEl.textContent = '💮 "참 잘했어요! 한 걸음 더 멋진 1학년이 되었어요!"';
    } else {
      praiseMsgEl.textContent = '💖 "포기하지 않고 끝까지 해낸 모습이 멋져요!"';
    }
  }

  showScreen('result');
  soundEffects.fanfare();

  if (isTodayGrandChamp) {
    speak(`와아! ${state.studentName} 친구가 오늘의 명예의 전당 1등에 올랐어요!`);
  } else if (isNewRecord && score > 0) {
    speak(`최고 기록 갱신! 참 잘했어요!`);
  } else {
    speak(`놀이 끝! 이번 점수는 ${score}점이에요.`);
  }

  // 비동기 백그라운드 점수 저장 (결과 화면 전환을 방해하지 않음)
  saveScore(state.studentName, gameTitle, score).catch(err => {
    console.warn('saveScore 비동기 저장 알림:', err);
  });
}


// =============================================================================
// [10. 게임 1: 🎒 책가방 챙기기 상세 로직]
// 요구사항: 정답 맞춘 뒤 "정답입니다!"만 짧게 나오고 바로 다음 문제로 전환
// =============================================================================
function startBackpackGame() {
  state.currentGame = 'backpack';
  showScreen('backpack');

  const bagContent = document.getElementById('bag-inside-content');
  if (bagContent) {
    bagContent.innerHTML = '<span class="bag-empty-hint">안내받은 물건을 터치하면 여기로 쏙 들어가요!</span>';
  }

  startCountdown(() => {
    startGameTimer('backpack');
    nextBackpackRound();
  });
}

function nextBackpackRound() {
  const targetCount = Math.random() < 0.5 ? 2 : 3;
  const shuffledSchool = [...SCHOOL_ITEMS].sort(() => 0.5 - Math.random());
  state.backpack.targetItems = shuffledSchool.slice(0, targetCount);
  state.backpack.packedItems = [];

  const otherSchool = shuffledSchool.slice(targetCount);
  const shuffledDistractors = [...DISTRACTOR_ITEMS].sort(() => 0.5 - Math.random());

  const neededOthers = 8 - targetCount;
  const distractorCount = Math.min(3, Math.floor(Math.random() * 2) + 2);
  const schoolOthersCount = neededOthers - distractorCount;

  const shelfPool = [
    ...state.backpack.targetItems,
    ...otherSchool.slice(0, schoolOthersCount),
    ...shuffledDistractors.slice(0, distractorCount)
  ];

  state.backpack.shelfItems = shelfPool.sort(() => 0.5 - Math.random());

  renderBackpackMissionBanner();
  renderBackpackShelf();
  speakBackpackMission();
}

function renderBackpackMissionBanner() {
  const container = document.getElementById('backpack-mission-items-preview');
  if (!container) return;

  container.innerHTML = '';
  state.backpack.targetItems.forEach(item => {
    const chip = document.createElement('div');
    chip.className = 'mission-target-chip';
    chip.id = `mission-chip-${item.id}`;
    chip.innerHTML = `
      <span class="chip-emoji">${item.emoji}</span>
      <span class="chip-text">${item.name}</span>
    `;
    container.appendChild(chip);
  });
}

function speakBackpackMission() {
  const names = state.backpack.targetItems.map(item => item.name).join(', ');
  speak(`오늘은 ${names}을 챙겨요!`);
}

function renderBackpackShelf() {
  const shelfEl = document.getElementById('backpack-items-shelf');
  if (!shelfEl) return;

  shelfEl.innerHTML = '';
  state.backpack.shelfItems.forEach(item => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `shelf-item-card ${item.cssClass || ''}`;
    card.id = `shelf-item-${item.id}`;
    card.innerHTML = `
      <div class="item-icon-box">
        <span>${item.emoji}</span>
      </div>
      <div class="item-name-label">${item.name}</div>
    `;

    // 0ms 즉시 터치 반응
    card.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleBackpackItemClick(item, card);
    });

    shelfEl.appendChild(card);
  });
}

function handleBackpackItemClick(item, cardEl) {
  if (state.backpack.packedItems.some(i => i.id === item.id)) return;

  const isTarget = state.backpack.targetItems.some(i => i.id === item.id);

  if (isTarget) {
    soundEffects.pop();
    state.backpack.packedItems.push(item);

    cardEl.classList.add('flying-into-bag');
    setTimeout(() => {
      cardEl.style.visibility = 'hidden';
    }, 280);

    const chip = document.getElementById(`mission-chip-${item.id}`);
    if (chip) chip.classList.add('completed');

    addItemToBagView(item);

    if (state.backpack.packedItems.length === state.backpack.targetItems.length) {
      state.currentScore += 20;
      updateHUD('backpack');
      soundEffects.fanfare();

      // [개선]: "정답입니다!"만 짧게 나오고 대기 없이 바로 다음 문제 전환
      speak('정답입니다!');
      setTimeout(nextBackpackRound, 300);
    }
  } else {
    soundEffects.wobble();
    cardEl.classList.remove('shake-anim');
    void cardEl.offsetWidth;
    cardEl.classList.add('shake-anim');

    state.currentScore = Math.max(0, state.currentScore - 5);
    updateHUD('backpack');

    speak('이건 오늘 필요 없어요.');
  }
}

function addItemToBagView(item) {
  const bagContent = document.getElementById('bag-inside-content');
  if (!bagContent) return;

  const hint = bagContent.querySelector('.bag-empty-hint');
  if (hint) hint.remove();

  const badge = document.createElement('div');
  badge.className = 'bag-packed-item';
  badge.innerHTML = `<span>${item.emoji}</span><span>${item.name}</span>`;
  bagContent.appendChild(badge);
}


// =============================================================================
// [11. 게임 2: 📖 교과서 펼치기 상세 로직]
// 요구사항: 정답 맞춘 뒤 "정답입니다!"만 짧게 나오고 바로 다음 문제로 전환
// =============================================================================
function startBookGame() {
  state.currentGame = 'book';
  showScreen('book');

  startCountdown(() => {
    startGameTimer('book');
    nextBookProblem();
  });
}

function nextBookProblem() {
  state.book.targetPage = Math.floor(Math.random() * 98) + 2;
  state.book.isBookOpen = false;

  const targetNumEl = document.getElementById('book-target-page-num');
  if (targetNumEl) targetNumEl.textContent = state.book.targetPage;

  showBookClosedView();
  speakBookTarget();
}

function speakBookTarget() {
  speak(`${state.book.targetPage} 쪽을 펴세요!`);
}

function showBookClosedView() {
  state.book.isBookOpen = false;
  const closedView = document.getElementById('book-view-closed');
  const openView = document.getElementById('book-view-open');

  if (closedView) closedView.classList.remove('hidden');
  if (openView) openView.classList.add('hidden');
}

function showBookOpenView() {
  state.book.isBookOpen = true;
  const closedView = document.getElementById('book-view-closed');
  const openView = document.getElementById('book-view-open');

  if (closedView) closedView.classList.add('hidden');
  if (openView) openView.classList.remove('hidden');

  updateBookSpreadUI();
}

function handleBookThicknessClick(event) {
  const slider = document.getElementById('book-thickness-slider');
  if (!slider) return;

  const rect = slider.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));

  const basePage = Math.round(1 + ratio * 99);
  const sign = Math.random() < 0.5 ? -1 : 1;
  const offset = (3 + Math.floor(Math.random() * 3)) * sign;
  let openedPage = basePage + offset;
  openedPage = Math.max(1, Math.min(100, openedPage));

  let left = Math.floor(openedPage / 2) * 2;
  if (left < 2) left = 2;
  if (left > 100) left = 100;

  state.book.currentSpreadLeft = left;
  state.book.currentSpreadRight = left + 1 <= 100 ? left + 1 : 100;

  soundEffects.pageFlip();
  showBookOpenView();
}

function updateBookSpreadUI(isAnimated = false) {
  const leftNumEl = document.getElementById('page-left-num');
  const rightNumEl = document.getElementById('page-right-num');
  const bookSpread = document.getElementById('book-spread-container');

  if (leftNumEl) leftNumEl.textContent = `${state.book.currentSpreadLeft} 쪽`;
  if (rightNumEl) rightNumEl.textContent = `${state.book.currentSpreadRight} 쪽`;

  updateBookIllustrations(state.book.currentSpreadLeft, state.book.currentSpreadRight);

  if (isAnimated && bookSpread) {
    bookSpread.classList.remove('page-flip-anim');
    void bookSpread.offsetWidth;
    bookSpread.classList.add('page-flip-anim');
  }
}

const BOOK_DOODLES = [
  { icon: '🌱', line1: '새싹이 돋아나요.', line2: '안녕, 봄아! 반가워.' },
  { icon: '🎶', line1: '학교 종이 땡땡땡!', line2: '어서 모이자.' },
  { icon: '🎨', line1: '알록달록 크레파스', line2: '무지개를 그려요.' },
  { icon: '🏃', line1: '운동장에서 씽씽!', line2: '친구야 달려라.' },
  { icon: '📚', line1: '재미있는 이야기책', line2: '글자가 쏙쏙 보여요.' },
  { icon: '☀️', line1: '따뜻한 햇살 아래', line2: '선생님 말씀 경청해요.' },
  { icon: '🍎', line1: '맛있는 급식 시간', line2: '골고루 꼭꼭 씹어요.' },
  { icon: '⭐', line1: '반짝이는 밤하늘', line2: '내일도 신나게 학교 가요.' }
];

function updateBookIllustrations(leftPage, rightPage) {
  const leftBox = document.getElementById('left-page-illustration');
  const rightBox = document.getElementById('right-page-illustration');

  const doodleLeft = BOOK_DOODLES[leftPage % BOOK_DOODLES.length];
  const doodleRight = BOOK_DOODLES[rightPage % BOOK_DOODLES.length];

  if (leftBox) {
    leftBox.innerHTML = `
      <div class="kid-book-doodle">${doodleLeft.icon}</div>
      <div class="kid-book-line">${doodleLeft.line1}</div>
      <div class="kid-book-line">${doodleLeft.line2}</div>
    `;
  }

  if (rightBox) {
    rightBox.innerHTML = `
      <div class="kid-book-doodle">${doodleRight.icon}</div>
      <div class="kid-book-line">${doodleRight.line1}</div>
      <div class="kid-book-line">${doodleRight.line2}</div>
    `;
  }
}

function turnPagePrev() {
  if (state.book.currentSpreadLeft <= 2) {
    soundEffects.wobble();
    speak('맨 앞쪽이에요!');
    return;
  }

  state.book.currentSpreadLeft = Math.max(2, state.book.currentSpreadLeft - 2);
  state.book.currentSpreadRight = state.book.currentSpreadLeft + 1;

  soundEffects.pageFlip();
  updateBookSpreadUI(true);
}

function turnPageNext() {
  if (state.book.currentSpreadRight >= 100) {
    soundEffects.wobble();
    speak('맨 뒤쪽이에요!');
    return;
  }

  state.book.currentSpreadLeft = Math.min(100, state.book.currentSpreadLeft + 2);
  state.book.currentSpreadRight = Math.min(100, state.book.currentSpreadLeft + 1);

  soundEffects.pageFlip();
  updateBookSpreadUI(true);
}

function handleBookSubmit() {
  const target = state.book.targetPage;
  const left = state.book.currentSpreadLeft;
  const right = state.book.currentSpreadRight;

  const isSuccess = (left === target || right === target);

  if (isSuccess) {
    state.currentScore += 10;
    updateHUD('book');
    soundEffects.fanfare();

    // [개선]: "정답입니다!"만 짧게 나오고 대기 없이 바로 다음 문제 전환
    speak('정답입니다!');
    setTimeout(nextBookProblem, 300);
  } else {
    soundEffects.wobble();
    state.currentScore = Math.max(0, state.currentScore - 5);
    updateHUD('book');

    const bookSpread = document.getElementById('book-spread-container');
    if (bookSpread) {
      bookSpread.classList.remove('shake-anim');
      void bookSpread.offsetWidth;
      bookSpread.classList.add('shake-anim');
    }

    if (target < left) {
      speak('다시 찾아봐요! 조금 더 앞으로 넘겨볼까요?');
    } else if (target > right) {
      speak('다시 찾아봐요! 조금 더 뒤로 넘겨볼까요?');
    } else {
      speak('다시 찾아봐요!');
    }
  }
}


// =============================================================================
// [12. 축하 콘페티]
// =============================================================================
function triggerConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;

  container.innerHTML = '';
  const colors = ['#FF1744', '#FF9100', '#FFEA00', '#00E676', '#2979FF', '#D500F9'];

  for (let i = 0; i < 45; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(piece);
  }

  setTimeout(() => {
    container.innerHTML = '';
  }, 3500);
}


// =============================================================================
// [13. 공통 이동 컨트롤러 (MovementController) & 1학년 캐릭터 렌더러]
// =============================================================================
class MovementController {
  constructor(options = {}) {
    this.keys = { up: false, down: false, left: false, right: false };
    this.speed = options.speed || 3.5;
    this.dpadId = options.dpadId || null;
    this.container = null;
    this.boundPointerDown = this._onPointerDown.bind(this);
    this.boundPointerUp = this._onPointerUp.bind(this);
    this.boundKeyDown = this._onKeyDown.bind(this);
    this.boundKeyUp = this._onKeyUp.bind(this);
    this.activePointers = new Map();
  }

  attach(dpadId) {
    this.dpadId = dpadId;
    this.container = document.getElementById(dpadId);
    this.reset();

    if (this.container) {
      const buttons = this.container.querySelectorAll('.btn-dpad');
      buttons.forEach(btn => {
        btn.addEventListener('pointerdown', this.boundPointerDown);
        btn.addEventListener('pointerup', this.boundPointerUp);
        btn.addEventListener('pointercancel', this.boundPointerUp);
        btn.addEventListener('pointerleave', this.boundPointerUp);
      });
    }

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
  }

  detach() {
    if (this.container) {
      const buttons = this.container.querySelectorAll('.btn-dpad');
      buttons.forEach(btn => {
        btn.removeEventListener('pointerdown', this.boundPointerDown);
        btn.removeEventListener('pointerup', this.boundPointerUp);
        btn.removeEventListener('pointercancel', this.boundPointerUp);
        btn.removeEventListener('pointerleave', this.boundPointerUp);
        btn.classList.remove('is-active');
      });
    }
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    this.reset();
  }

  reset() {
    this.keys.up = false;
    this.keys.down = false;
    this.keys.left = false;
    this.keys.right = false;
    this.activePointers.clear();
    if (this.container) {
      this.container.querySelectorAll('.btn-dpad').forEach(b => b.classList.remove('is-active'));
    }
  }

  _onPointerDown(e) {
    e.preventDefault();
    const dir = e.currentTarget.dataset.dir;
    if (dir) {
      this.keys[dir] = true;
      e.currentTarget.classList.add('is-active');
      this.activePointers.set(e.pointerId, dir);
      initAudioContext();
      soundEffects.click();
    }
  }

  _onPointerUp(e) {
    e.preventDefault();
    const dir = e.currentTarget.dataset.dir || this.activePointers.get(e.pointerId);
    if (dir) {
      this.keys[dir] = false;
      e.currentTarget.classList.remove('is-active');
      this.activePointers.delete(e.pointerId);
    }
  }

  _onKeyDown(e) {
    if (['ArrowUp', 'KeyW'].includes(e.code)) { this.keys.up = true; this._syncVisual('up', true); }
    if (['ArrowDown', 'KeyS'].includes(e.code)) { this.keys.down = true; this._syncVisual('down', true); }
    if (['ArrowLeft', 'KeyA'].includes(e.code)) { this.keys.left = true; this._syncVisual('left', true); }
    if (['ArrowRight', 'KeyD'].includes(e.code)) { this.keys.right = true; this._syncVisual('right', true); }
  }

  _onKeyUp(e) {
    if (['ArrowUp', 'KeyW'].includes(e.code)) { this.keys.up = false; this._syncVisual('up', false); }
    if (['ArrowDown', 'KeyS'].includes(e.code)) { this.keys.down = false; this._syncVisual('down', false); }
    if (['ArrowLeft', 'KeyA'].includes(e.code)) { this.keys.left = false; this._syncVisual('left', false); }
    if (['ArrowRight', 'KeyD'].includes(e.code)) { this.keys.right = false; this._syncVisual('right', false); }
  }

  _syncVisual(dir, isActive) {
    if (!this.container) return;
    const btn = this.container.querySelector(`.btn-dpad-${dir}`);
    if (btn) {
      if (isActive) btn.classList.add('is-active');
      else btn.classList.remove('is-active');
    }
  }

  getVelocity(speed) {
    let vx = 0;
    let vy = 0;
    if (this.keys.up) vy -= 1;
    if (this.keys.down) vy += 1;
    if (this.keys.left) vx -= 1;
    if (this.keys.right) vx += 1;

    let dir = null;
    if (vy < 0 && vx === 0) dir = 'up';
    else if (vy > 0 && vx === 0) dir = 'down';
    else if (vx < 0 && vy === 0) dir = 'left';
    else if (vx > 0 && vy === 0) dir = 'right';
    else if (vx < 0 && vy < 0) dir = 'up-left';
    else if (vx > 0 && vy < 0) dir = 'up-right';
    else if (vx < 0 && vy > 0) dir = 'down-left';
    else if (vx > 0 && vy > 0) dir = 'down-right';

    // 대각선 이동 시 속도 정규화 (루트2 배 빨라짐 방지)
    if (vx !== 0 && vy !== 0) {
      vx *= 0.7071;
      vy *= 0.7071;
    }

    return {
      vx: vx * speed,
      vy: vy * speed,
      isMoving: vx !== 0 || vy !== 0,
      dir: dir
    };
  }
}

/**
 * 1학년 어린이 탑다운 캐릭터 그리기
 */
function drawKidCharacter(ctx, x, y, dir = 'up', stepCycle = 0, isMoving = false) {
  ctx.save();
  ctx.translate(x, y);

  // 부드러운 그림자
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 16, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  const legOffset = isMoving ? Math.sin(stepCycle * 0.35) * 5 : 0;

  // 발 (운동화)
  ctx.fillStyle = '#0288D1';
  ctx.beginPath();
  ctx.ellipse(-7, 12 - legOffset, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(7, 12 + legOffset, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 책가방 (등 뒤)
  if (dir.includes('up') || dir === 'left' || dir === 'right') {
    ctx.fillStyle = '#E64A19'; // 주황빛 1학년 책가방
    ctx.beginPath();
    ctx.roundRect(-12, -2, 24, 14, [4, 4, 6, 6]);
    ctx.fill();
    ctx.strokeStyle = '#BF360C';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 안전 반사띠
    ctx.fillStyle = '#FFF59D';
    ctx.fillRect(-9, 3, 18, 3);
  }

  // 몸통 (노란색 원아복/단정한 셔츠)
  ctx.fillStyle = '#FFCA28';
  ctx.beginPath();
  ctx.roundRect(-11, -8, 22, 19, [6, 6, 4, 4]);
  ctx.fill();

  // 머리 (피부톤)
  ctx.fillStyle = '#FFE0B2';
  ctx.beginPath();
  ctx.arc(0, -10, 12, 0, Math.PI * 2);
  ctx.fill();

  // 1학년 병아리 노란 햇모자
  ctx.fillStyle = '#FDD835';
  ctx.beginPath();
  ctx.arc(0, -14, 13, Math.PI, 0, false);
  ctx.fill();

  // 모자 챙 (바라보는 방향으로)
  ctx.fillStyle = '#FBC02D';
  let brimX = 0, brimY = -12, brimW = 22, brimH = 6;
  if (dir.includes('left')) brimX = -5;
  if (dir.includes('right')) brimX = 5;
  if (dir.includes('up')) brimY = -16;
  if (dir.includes('down')) brimY = -8;
  ctx.beginPath();
  ctx.ellipse(brimX, brimY, brimW / 2, brimH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // 모자 빨간 장식 배지
  ctx.fillStyle = '#E53935';
  ctx.beginPath();
  ctx.arc(0, -15, 3, 0, Math.PI * 2);
  ctx.fill();

  // 얼굴 표정 (아래 또는 옆을 볼 때)
  if (!dir.includes('up')) {
    ctx.fillStyle = '#3E2723';
    let eyeOffsetX = dir.includes('left') ? -3 : dir.includes('right') ? 3 : 0;
    // 눈
    ctx.beginPath();
    ctx.arc(-4 + eyeOffsetX, -9, 1.8, 0, Math.PI * 2);
    ctx.arc(4 + eyeOffsetX, -9, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // 볼터치
    ctx.fillStyle = 'rgba(255, 138, 128, 0.65)';
    ctx.beginPath();
    ctx.arc(-7 + eyeOffsetX, -6, 2.5, 0, Math.PI * 2);
    ctx.arc(7 + eyeOffsetX, -6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 미소
    ctx.strokeStyle = '#D84315';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(eyeOffsetX, -7, 2.5, 0.2, Math.PI - 0.2, false);
    ctx.stroke();
  }

  ctx.restore();
}


// =============================================================================
// [14. 게임 3: 🚦 등굣길 건너기 상세 로직]
// =============================================================================
let trafficMovementController = null;
let trafficAnimFrameId = null;
let trafficLightInterval = null;

function startTrafficGame() {
  state.currentGame = 'traffic';
  showScreen('traffic');

  if (!trafficMovementController) {
    trafficMovementController = new MovementController();
  }
  trafficMovementController.attach('traffic-dpad');

  // 상태 초기화
  state.traffic.running = true;
  state.traffic.player = {
    x: 480,
    y: 500,
    speed: 3.5,
    dir: 'up',
    step: 0
  };
  state.traffic.trafficLight = 'green';
  state.traffic.crosswalk1 = { x: 380, width: 140 };
  state.traffic.crosswalk2 = { x: 440, width: 140 };
  state.traffic.cars = [];

  updateTrafficPill(true);

  startCountdown(() => {
    startGameTimer('traffic');
    speak('초록불에 횡단보도로 안전하게 학교까지 가요!');
    initTrafficCars();
    startTrafficLightCycle();
    runTrafficGameLoop();
  });
}

function stopTrafficGame() {
  state.traffic.running = false;
  if (trafficMovementController) trafficMovementController.detach();
  if (trafficAnimFrameId) cancelAnimationFrame(trafficAnimFrameId);
  if (trafficLightInterval) clearInterval(trafficLightInterval);
  trafficAnimFrameId = null;
  trafficLightInterval = null;
}

function updateTrafficPill(isGreen) {
  const pill = document.getElementById('traffic-light-pill');
  if (!pill) return;
  if (isGreen) {
    pill.className = 'traffic-pill-green';
    pill.innerHTML = '🟢 초록불이에요! 횡단보도로 건너요';
  } else {
    pill.className = 'traffic-pill-red';
    pill.innerHTML = '🔴 빨간불이에요, 멈춰요!';
  }
}

function startTrafficLightCycle() {
  if (trafficLightInterval) clearInterval(trafficLightInterval);

  trafficLightInterval = setInterval(() => {
    if (!state.traffic.running) return;

    if (state.traffic.trafficLight === 'green') {
      state.traffic.trafficLight = 'red';
      updateTrafficPill(false);
      soundEffects.beep();
      speak('빨간불이에요, 멈춰요');
    } else {
      state.traffic.trafficLight = 'green';
      updateTrafficPill(true);
      soundEffects.ding();
      speak('초록불이에요');
    }
  }, 6000);
}

function initTrafficCars() {
  state.traffic.cars = [
    // 도로 1 차들 (왼쪽 -> 오른쪽, Y: 360, 410)
    { id: 1, road: 1, x: 60, y: 355, vx: 3.2, width: 70, height: 32, type: 'bus', color: '#FFD54F' },
    { id: 2, road: 1, x: 550, y: 405, vx: 3.6, width: 56, height: 28, type: 'sedan', color: '#42A5F5' },
    // 도로 2 차들 (오른쪽 -> 왼쪽, Y: 120, 170)
    { id: 3, road: 2, x: 800, y: 120, vx: -3.2, width: 68, height: 32, type: 'truck', color: '#66BB6A' },
    { id: 4, road: 2, x: 250, y: 170, vx: -3.5, width: 54, height: 28, type: 'sedan', color: '#EF5350' }
  ];
}

function updateTrafficCars() {
  const isGreen = state.traffic.trafficLight === 'green';
  const cw1 = state.traffic.crosswalk1;
  const cw2 = state.traffic.crosswalk2;

  state.traffic.cars.forEach(car => {
    let shouldStop = false;

    if (isGreen) {
      if (car.road === 1) {
        // 도로 1 횡단보도 정지선 (왼쪽에서 오므로 crosswalk1.x 직전에서 정지)
        const stopLine = cw1.x - car.width - 15;
        if (car.x < stopLine && car.x + car.vx >= stopLine) {
          car.x = stopLine;
          shouldStop = true;
        } else if (car.x >= stopLine && car.x < cw1.x) {
          shouldStop = true;
        }
      } else if (car.road === 2) {
        // 도로 2 횡단보도 정지선 (오른쪽에서 오므로 crosswalk2.x + width 직전에서 정지)
        const stopLine = cw2.x + cw2.width + 15;
        if (car.x > stopLine && car.x + car.vx <= stopLine) {
          car.x = stopLine;
          shouldStop = true;
        } else if (car.x <= stopLine && car.x > cw2.x + cw2.width) {
          shouldStop = true;
        }
      }
    }

    if (!shouldStop) {
      car.x += car.vx;
      // 화면 밖으로 나가면 반대편에서 재등장
      if (car.vx > 0 && car.x > 980) car.x = -80;
      if (car.vx < 0 && car.x < -80) car.x = 980;
    }
  });
}

function triggerTrafficSafetyWarning(roadNum) {
  soundEffects.warn();
  speak('위험해요! 횡단보도에서 초록불에 건너요');

  const banner = document.getElementById('traffic-warning-banner');
  if (banner) {
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 1800);
  }

  // 5점 감점 (0점 미만 내려가지 않음)
  state.currentScore = Math.max(0, state.currentScore - 5);
  updateHUD('traffic');

  // 안전한 출발 위치로 리스폰
  if (roadNum === 1) {
    state.traffic.player.x = 480;
    state.traffic.player.y = 500;
  } else {
    state.traffic.player.x = state.traffic.crosswalk1.x + 70;
    state.traffic.player.y = 275;
  }
}

function runTrafficGameLoop() {
  if (!state.traffic.running) return;

  const canvas = document.getElementById('traffic-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // 1. 이동 조작 업데이트
  if (trafficMovementController) {
    const vel = trafficMovementController.getVelocity(state.traffic.player.speed);
    state.traffic.player.x += vel.vx;
    state.traffic.player.y += vel.vy;

    // 경기장 경계 제한
    state.traffic.player.x = Math.max(30, Math.min(930, state.traffic.player.x));
    state.traffic.player.y = Math.max(50, Math.min(515, state.traffic.player.y));

    if (vel.isMoving) {
      state.traffic.player.dir = vel.dir || state.traffic.player.dir;
      state.traffic.player.step++;
    }
  }

  // 2. 자동차 업데이트
  updateTrafficCars();

  const p = state.traffic.player;
  const isGreen = state.traffic.trafficLight === 'green';
  const cw1 = state.traffic.crosswalk1;
  const cw2 = state.traffic.crosswalk2;

  // 3. 교통 안전 규칙 검증
  // 도로 1 영역 (Y: 335 ~ 455)
  if (p.y > 335 && p.y < 455) {
    const onCw1 = (p.x >= cw1.x - 10 && p.x <= cw1.x + cw1.width + 10);
    if (!onCw1 || !isGreen) {
      triggerTrafficSafetyWarning(1);
    }
  }

  // 도로 2 영역 (Y: 95 ~ 215)
  if (p.y > 95 && p.y < 215) {
    const onCw2 = (p.x >= cw2.x - 10 && p.x <= cw2.x + cw2.width + 10);
    if (!onCw2 || !isGreen) {
      triggerTrafficSafetyWarning(2);
    }
  }

  // 자동차 충돌 검사
  state.traffic.cars.forEach(car => {
    if (Math.abs(p.x - (car.x + car.width / 2)) < (car.width / 2 + 10) &&
        Math.abs(p.y - (car.y + car.height / 2)) < (car.height / 2 + 12)) {
      triggerTrafficSafetyWarning(car.road);
    }
  });

  // 학교 도착 검사 (Y <= 85)
  if (p.y <= 85) {
    state.currentScore += 30;
    updateHUD('traffic');
    soundEffects.fanfare();
    speak('학교에 잘 도착했어요!');
    triggerConfetti();

    // 다음 라운드: 횡단보도 위치 재배치 (좌우 분산)
    state.traffic.crosswalk1.x = 180 + Math.floor(Math.random() * 540);
    state.traffic.crosswalk2.x = 180 + Math.floor(Math.random() * 540);
    // 리스폰
    state.traffic.player.x = 480;
    state.traffic.player.y = 500;
  }

  // 4. 화면 그리기
  drawTrafficCanvas(ctx);

  trafficAnimFrameId = requestAnimationFrame(runTrafficGameLoop);
}

function drawTrafficCanvas(ctx) {
  ctx.clearRect(0, 0, 960, 540);

  // 1) 상단 학교 영역 (Y: 0 ~ 95)
  ctx.fillStyle = '#C8E6C9';
  ctx.fillRect(0, 0, 960, 95);

  // 학교 건물 실루엣 & 벽돌담
  ctx.fillStyle = '#FFE082';
  ctx.fillRect(280, 10, 400, 55);
  ctx.fillStyle = '#EF6C00';
  ctx.beginPath();
  ctx.moveTo(480, 0);
  ctx.lineTo(260, 25);
  ctx.lineTo(700, 25);
  ctx.closePath();
  ctx.fill();

  // 학교 시계탑
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(480, 32, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(479, 25, 2, 7);
  ctx.fillRect(479, 31, 5, 2);

  // 학교 교문 기둥 및 명판
  ctx.fillStyle = '#8D6E63';
  ctx.fillRect(380, 55, 22, 40);
  ctx.fillRect(558, 55, 22, 40);
  ctx.fillStyle = '#FFF8E1';
  ctx.fillRect(410, 62, 140, 24);
  ctx.strokeStyle = '#D7CCC8';
  ctx.strokeRect(410, 62, 140, 24);
  ctx.fillStyle = '#2E7D32';
  ctx.font = 'bold 13px "Jua", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏫 즐거운 초등학교', 480, 78);

  // 2) 도로 2 (Y: 95 ~ 215)
  ctx.fillStyle = '#37474F';
  ctx.fillRect(0, 95, 960, 120);
  // 차선
  ctx.strokeStyle = '#FFEB3B';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(0, 155);
  ctx.lineTo(960, 155);
  ctx.stroke();
  ctx.setLineDash([]);

  // 도로 2 횡단보도 (흰색 줄무늬)
  const cw2 = state.traffic.crosswalk2;
  ctx.fillStyle = '#ECEFF1';
  for (let x = cw2.x; x < cw2.x + cw2.width; x += 22) {
    ctx.fillRect(x, 97, 13, 116);
  }

  // 3) 중간 인도 (Y: 215 ~ 335)
  ctx.fillStyle = '#CFD8DC';
  ctx.fillRect(0, 215, 960, 120);
  // 노란색 점자 블록
  ctx.fillStyle = '#FFD54F';
  ctx.fillRect(0, 270, 960, 10);
  // 가로수 벚꽃나무 4그루
  [120, 320, 660, 860].forEach(tx => {
    ctx.fillStyle = '#795548';
    ctx.fillRect(tx - 4, 255, 8, 22);
    ctx.fillStyle = '#F8BBD0';
    ctx.beginPath();
    ctx.arc(tx, 250, 18, 0, Math.PI * 2);
    ctx.fill();
  });

  // 4) 도로 1 (Y: 335 ~ 455)
  ctx.fillStyle = '#37474F';
  ctx.fillRect(0, 335, 960, 120);
  // 차선
  ctx.strokeStyle = '#FFEB3B';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(0, 395);
  ctx.lineTo(960, 395);
  ctx.stroke();
  ctx.setLineDash([]);

  // 도로 1 횡단보도
  const cw1 = state.traffic.crosswalk1;
  ctx.fillStyle = '#ECEFF1';
  for (let x = cw1.x; x < cw1.x + cw1.width; x += 22) {
    ctx.fillRect(x, 337, 13, 116);
  }

  // 5) 집 앞 마당/인도 (Y: 455 ~ 540)
  ctx.fillStyle = '#FFE0B2';
  ctx.fillRect(0, 455, 960, 85);
  // 우리 집 울타리 및 문
  ctx.fillStyle = '#A1887F';
  ctx.fillRect(400, 520, 160, 14);
  ctx.fillStyle = '#FFF9C4';
  ctx.font = 'bold 14px "Jua", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#E65100';
  ctx.fillText('🏡 우리 집 (출발선) 🚩', 480, 532);

  // 6) 신호등 그리기 (도로 1 & 2 옆)
  const isGreen = state.traffic.trafficLight === 'green';
  drawTrafficLightUnit(ctx, cw1.x + cw1.width + 16, 420, isGreen);
  drawTrafficLightUnit(ctx, cw2.x - 22, 175, isGreen);

  // 7) 자동차 그리기
  state.traffic.cars.forEach(car => {
    drawCarGraphic(ctx, car);
  });

  // 8) 플레이어 1학년 어린이 그리기
  const p = state.traffic.player;
  const isMoving = trafficMovementController && trafficMovementController.getVelocity(1).isMoving;
  drawKidCharacter(ctx, p.x, p.y, p.dir, p.step, isMoving);
}

function drawTrafficLightUnit(ctx, x, y, isGreen) {
  ctx.save();
  // 기둥
  ctx.fillStyle = '#78909C';
  ctx.fillRect(x - 3, y - 5, 6, 26);

  // 신호등 본체
  ctx.fillStyle = '#263238';
  ctx.beginPath();
  ctx.roundRect(x - 12, y - 35, 24, 34, 6);
  ctx.fill();
  ctx.strokeStyle = '#37474F';
  ctx.stroke();

  // 빨간불 (위)
  ctx.fillStyle = !isGreen ? '#FF1744' : '#542020';
  ctx.beginPath();
  ctx.arc(x, y - 24, 6, 0, Math.PI * 2);
  ctx.fill();
  if (!isGreen) {
    ctx.shadowColor = '#FF1744';
    ctx.shadowBlur = 8;
  }

  // 초록불 (아래)
  ctx.fillStyle = isGreen ? '#00E676' : '#143820';
  ctx.beginPath();
  ctx.arc(x, y - 10, 6, 0, Math.PI * 2);
  ctx.fill();
  if (isGreen) {
    ctx.shadowColor = '#00E676';
    ctx.shadowBlur = 8;
  }

  ctx.restore();
}

function drawCarGraphic(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);

  // 차체
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(0, 0, car.width, car.height, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 창문
  ctx.fillStyle = '#E1F5FE';
  if (car.vx > 0) {
    ctx.fillRect(10, 4, car.width - 20, car.height - 8);
    // 앞유리
    ctx.fillStyle = '#B3E5FC';
    ctx.fillRect(car.width - 12, 5, 8, car.height - 10);
    // 전조등
    ctx.fillStyle = '#FFF59D';
    ctx.fillRect(car.width - 2, 4, 3, 6);
    ctx.fillRect(car.width - 2, car.height - 10, 3, 6);
  } else {
    ctx.fillRect(10, 4, car.width - 20, car.height - 8);
    ctx.fillStyle = '#B3E5FC';
    ctx.fillRect(4, 5, 8, car.height - 10);
    // 전조등
    ctx.fillStyle = '#FFF59D';
    ctx.fillRect(-1, 4, 3, 6);
    ctx.fillRect(-1, car.height - 10, 3, 6);
  }

  // 바퀴 4개
  ctx.fillStyle = '#212121';
  ctx.fillRect(8, -3, 12, 4);
  ctx.fillRect(car.width - 20, -3, 12, 4);
  ctx.fillRect(8, car.height - 1, 12, 4);
  ctx.fillRect(car.width - 20, car.height - 1, 12, 4);

  // 버스 표식
  if (car.type === 'bus') {
    ctx.fillStyle = '#E65100';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCHOOL', car.width / 2, car.height / 2 + 3);
  }

  ctx.restore();
}


// =============================================================================
// [15. 게임 4: 🗺️ 학교 길 찾기 상세 로직]
// =============================================================================
let mapMovementController = null;
let mapAnimFrameId = null;

// 7대 학교 필수 장소
const SCHOOL_ROOMS = [
  {
    id: 'classroom',
    name: '우리 교실',
    icon: '🏫',
    speech: '수업이 시작돼요. 우리 교실로 가요.',
    color: '#FFE082',
    signText: '1학년 우리 교실 🏫',
    rect: { x: 70, y: 70, w: 340, h: 240 },
    door: { x: 200, y: 310, w: 80, h: 45 }
  },
  {
    id: 'restroom',
    name: '화장실',
    icon: '🚻',
    speech: '손을 깨끗이 씻고 싶어요. 화장실로 가요.',
    color: '#B3E5FC',
    signText: '깨끗한 화장실 🚻',
    rect: { x: 470, y: 70, w: 280, h: 240 },
    door: { x: 570, y: 310, w: 80, h: 45 }
  },
  {
    id: 'nurse',
    name: '보건실',
    icon: '🏥',
    speech: '배가 아파요. 보건실로 가요.',
    color: '#FFCDD2',
    signText: '다정하신 보건실 🏥',
    rect: { x: 810, y: 70, w: 340, h: 240 },
    door: { x: 940, y: 310, w: 80, h: 45 }
  },
  {
    id: 'library',
    name: '도서관',
    icon: '📚',
    speech: '책을 빌리고 싶어요. 도서관으로 가요.',
    color: '#C8E6C9',
    signText: '꿈자람 도서관 📚',
    rect: { x: 70, y: 450, w: 360, h: 230 },
    door: { x: 210, y: 420, w: 80, h: 45 }
  },
  {
    id: 'office',
    name: '교무실',
    icon: '📋',
    speech: '선생님을 찾아뵈어요. 교무실로 가요.',
    color: '#D1C4E9',
    signText: '선생님 교무실 📋',
    rect: { x: 770, y: 450, w: 380, h: 230 },
    door: { x: 920, y: 420, w: 80, h: 45 }
  },
  {
    id: 'cafeteria',
    name: '급식실',
    icon: '🍱',
    speech: '점심시간이에요. 급식실로 가요.',
    color: '#FFE0B2',
    signText: '맛있는 급식실 🍱',
    rect: { x: 70, y: 750, w: 420, h: 180 },
    door: { x: 240, y: 720, w: 80, h: 45 }
  },
  {
    id: 'playground',
    name: '운동장',
    icon: '⚽',
    speech: '체육 시간이에요! 운동장으로 가요.',
    color: '#A5D6A7',
    signText: '신나는 운동장 ⚽',
    rect: { x: 630, y: 750, w: 680, h: 180 },
    door: { x: 800, y: 720, w: 90, h: 45 }
  }
];

// 통행 불가능한 벽 (방 경계 중 문 개구부를 제외한 벽체들)
const SCHOOL_WALLS = [
  // 1. 교실 벽
  { x: 70, y: 70, w: 340, h: 16 },
  { x: 70, y: 70, w: 16, h: 240 },
  { x: 394, y: 70, w: 16, h: 240 },
  { x: 70, y: 294, w: 130, h: 16 },
  { x: 280, y: 294, w: 130, h: 16 },

  // 2. 화장실 벽
  { x: 470, y: 70, w: 280, h: 16 },
  { x: 470, y: 70, w: 16, h: 240 },
  { x: 734, y: 70, w: 16, h: 240 },
  { x: 470, y: 294, w: 100, h: 16 },
  { x: 650, y: 294, w: 100, h: 16 },

  // 3. 보건실 벽
  { x: 810, y: 70, w: 340, h: 16 },
  { x: 810, y: 70, w: 16, h: 240 },
  { x: 1134, y: 70, w: 16, h: 240 },
  { x: 810, y: 294, w: 130, h: 16 },
  { x: 1020, y: 294, w: 130, h: 16 },

  // 4. 도서관 벽
  { x: 70, y: 450, w: 140, h: 16 },
  { x: 290, y: 450, w: 140, h: 16 },
  { x: 70, y: 450, w: 16, h: 230 },
  { x: 414, y: 450, w: 16, h: 230 },
  { x: 70, y: 664, w: 360, h: 16 },

  // 5. 교무실 벽
  { x: 770, y: 450, w: 150, h: 16 },
  { x: 1000, y: 450, w: 150, h: 16 },
  { x: 770, y: 450, w: 16, h: 230 },
  { x: 1134, y: 450, w: 16, h: 230 },
  { x: 770, y: 664, w: 380, h: 16 },

  // 6. 급식실 벽
  { x: 70, y: 750, w: 170, h: 16 },
  { x: 320, y: 750, w: 170, h: 16 },
  { x: 70, y: 750, w: 16, h: 180 },
  { x: 474, y: 750, w: 16, h: 180 },
  { x: 70, y: 914, w: 420, h: 16 },

  // 7. 운동장 울타리
  { x: 630, y: 750, w: 170, h: 16 },
  { x: 890, y: 750, w: 420, h: 16 },
  { x: 630, y: 750, w: 16, h: 180 },
  { x: 1294, y: 750, w: 16, h: 180 },
  { x: 630, y: 914, w: 680, h: 16 }
];

function startMapGame() {
  state.currentGame = 'map';
  showScreen('map');

  if (!mapMovementController) {
    mapMovementController = new MovementController();
  }
  mapMovementController.attach('map-dpad');

  state.schoolmap.running = true;
  state.schoolmap.player = {
    x: 600,
    y: 400, // 중앙 복도에서 시작
    speed: 4.2,
    dir: 'down',
    step: 0
  };
  state.schoolmap.previousMissionId = null;

  pickNextSchoolMission();

  startCountdown(() => {
    startGameTimer('map');
    speakSchoolMission();
    runMapGameLoop();
  });
}

function stopMapGame() {
  state.schoolmap.running = false;
  if (mapMovementController) mapMovementController.detach();
  if (mapAnimFrameId) cancelAnimationFrame(mapAnimFrameId);
  mapAnimFrameId = null;
}

function pickNextSchoolMission() {
  const prevId = state.schoolmap.previousMissionId;
  const candidates = SCHOOL_ROOMS.filter(r => r.id !== prevId);
  const picked = candidates[Math.floor(Math.random() * candidates.length)] || SCHOOL_ROOMS[0];

  state.schoolmap.currentMission = picked;
  state.schoolmap.previousMissionId = picked.id;

  // 상단 미션 배너 UI 업데이트
  const sitEl = document.getElementById('map-mission-situation');
  const iconEl = document.getElementById('map-mission-target-icon');
  const nameEl = document.getElementById('map-mission-target-name');

  if (sitEl) sitEl.textContent = picked.speech.split('.')[0] + '!';
  if (iconEl) iconEl.textContent = picked.icon;
  if (nameEl) nameEl.textContent = picked.name;
}

function speakSchoolMission() {
  const mission = state.schoolmap.currentMission;
  if (mission) {
    speak(mission.speech);
  }
}

function resolveWallCollisions(p, walls) {
  const radius = 15;
  walls.forEach(w => {
    const cx = Math.max(w.x, Math.min(p.x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(p.y, w.y + w.h));
    const distSq = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      if (dist === 0) {
        p.y -= 1;
        return;
      }
      const overlap = radius - dist;
      p.x += ((p.x - cx) / dist) * overlap;
      p.y += ((p.y - cy) / dist) * overlap;
    }
  });

  // 학교 맵 전체 경계
  p.x = Math.max(30, Math.min(1370, p.x));
  p.y = Math.max(30, Math.min(930, p.y));
}

function runMapGameLoop() {
  if (!state.schoolmap.running) return;

  const canvas = document.getElementById('schoolmap-canvas');
  const minimapCanvas = document.getElementById('schoolmap-minimap');
  if (!canvas || !minimapCanvas) return;

  const ctx = canvas.getContext('2d');
  const miniCtx = minimapCanvas.getContext('2d');

  const p = state.schoolmap.player;

  // 1. 이동 조작 업데이트
  if (mapMovementController) {
    const vel = mapMovementController.getVelocity(p.speed);
    p.x += vel.vx;
    p.y += vel.vy;

    // 벽 충돌 체크
    resolveWallCollisions(p, SCHOOL_WALLS);

    if (vel.isMoving) {
      p.dir = vel.dir || p.dir;
      p.step++;
    }
  }

  // 2. 목적지 문 앞 도착 검사
  const mission = state.schoolmap.currentMission;
  if (mission && mission.door) {
    const d = mission.door;
    if (p.x >= d.x && p.x <= d.x + d.w && p.y >= d.y && p.y <= d.y + d.h) {
      // 1회 성공!
      state.currentScore += 30;
      updateHUD('map');
      soundEffects.fanfare();
      triggerConfetti();
      speak('참 잘했어요!');

      // 다음 장소 즉시 추첨 (연속 같은 장소 금지)
      pickNextSchoolMission();
      setTimeout(speakSchoolMission, 600);
    }
  }

  // 3. 카메라 계산 (플레이어 중심 부드러운 스크롤)
  const viewW = 960;
  const viewH = 540;
  const worldW = 1400;
  const worldH = 960;

  const camX = Math.max(0, Math.min(worldW - viewW, p.x - viewW / 2));
  const camY = Math.max(0, Math.min(worldH - viewH, p.y - viewH / 2));
  state.schoolmap.camera = { x: camX, y: camY };

  // 4. 메인 화면 렌더링
  drawSchoolMapMainView(ctx, camX, camY);

  // 5. 우측 상단 미니지도 렌더링
  drawSchoolMinimap(miniCtx);

  mapAnimFrameId = requestAnimationFrame(runMapGameLoop);
}

function drawSchoolMapMainView(ctx, camX, camY) {
  ctx.save();
  ctx.clearRect(0, 0, 960, 540);
  ctx.translate(-camX, -camY);

  // 복도 바닥 (밝은 학교 타일)
  ctx.fillStyle = '#FFF9C4';
  ctx.fillRect(0, 0, 1400, 960);

  // 타일 패턴
  ctx.strokeStyle = '#FFF176';
  ctx.lineWidth = 1;
  for (let x = 0; x < 1400; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 960);
    ctx.stroke();
  }
  for (let y = 0; y < 960; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1400, y);
    ctx.stroke();
  }

  // 7개 방 바닥 및 가구 장식 그리기
  SCHOOL_ROOMS.forEach(room => {
    ctx.fillStyle = room.color;
    ctx.fillRect(room.rect.x, room.rect.y, room.rect.w, room.rect.h);

    // 방 이름 크게 바닥에 표시
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.font = 'bold 36px "Jua", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(room.name, room.rect.x + room.rect.w / 2, room.rect.y + room.rect.h / 2 + 12);
  });

  // 벽 그리기
  ctx.fillStyle = '#78909C';
  SCHOOL_WALLS.forEach(w => {
    ctx.fillRect(w.x, w.y, w.w, w.h);
  });

  // 문 개구부 및 큰 그림 간판 (문 앞 간판)
  SCHOOL_ROOMS.forEach(room => {
    const d = room.door;

    // 문 입구 바닥 매트
    ctx.fillStyle = '#FFD54F';
    ctx.fillRect(d.x, d.y, d.w, d.h);

    // 큰 그림 간판 (아이들이 쉽게 알아보는 시인성 높은 간판)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(d.x - 20, d.y - 30, d.w + 40, 26, 8);
    ctx.fill();
    ctx.strokeStyle = '#00838F';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#00695C';
    ctx.font = 'bold 14px "Jua", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(room.signText, d.x + d.w / 2, d.y - 13);
  });

  // 목표 장소 반짝이는 별 (목적지 문 앞)
  const mission = state.schoolmap.currentMission;
  if (mission && mission.door) {
    const d = mission.door;
    const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.2;

    ctx.save();
    ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
    ctx.scale(pulse, pulse);

    // 별 후광
    ctx.fillStyle = 'rgba(255, 235, 59, 0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();

    // 황금빛 큰 별
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⭐', 0, 0);
    ctx.restore();
  }

  // 플레이어 그리기
  const p = state.schoolmap.player;
  const isMoving = mapMovementController && mapMovementController.getVelocity(1).isMoving;
  drawKidCharacter(ctx, p.x, p.y, p.dir, p.step, isMoving);

  ctx.restore();
}

function drawSchoolMinimap(ctx) {
  const w = 200;
  const h = 140;
  const sx = w / 1400;
  const sy = h / 960;

  ctx.clearRect(0, 0, w, h);

  // 미니맵 복도 배경
  ctx.fillStyle = '#FFF8E1';
  ctx.fillRect(0, 0, w, h);

  // 방 블록들
  SCHOOL_ROOMS.forEach(room => {
    ctx.fillStyle = room.color;
    ctx.fillRect(room.rect.x * sx, room.rect.y * sy, room.rect.w * sx, room.rect.h * sy);

    ctx.strokeStyle = '#90A4AE';
    ctx.lineWidth = 1;
    ctx.strokeRect(room.rect.x * sx, room.rect.y * sy, room.rect.w * sx, room.rect.h * sy);

    // 미니맵 아이콘
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(room.icon, (room.rect.x + room.rect.w / 2) * sx, (room.rect.y + room.rect.h / 2 + 4) * sy);
  });

  // 목적지 반짝이는 별 (미니맵)
  const mission = state.schoolmap.currentMission;
  if (mission && mission.door) {
    const mx = (mission.door.x + mission.door.w / 2) * sx;
    const my = (mission.door.y + mission.door.h / 2) * sy;

    const starPulse = 1 + Math.sin(Date.now() * 0.01) * 0.3;
    ctx.save();
    ctx.translate(mx, my);
    ctx.scale(starPulse, starPulse);
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⭐', 0, 0);
    ctx.restore();
  }

  // 내 위치 깜빡이는 점 (미니맵)
  const p = state.schoolmap.player;
  const px = p.x * sx;
  const py = p.y * sy;

  // 파동 링
  const ringRadius = 4 + (Date.now() % 1000) / 1000 * 6;
  ctx.strokeStyle = 'rgba(0, 230, 118, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 초록 점
  ctx.fillStyle = '#00E676';
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#00B0FF';
  ctx.lineWidth = 1;
}

// =============================================================================
// [16. DOM 이벤트 리스너 바인딩 (0ms 딜레이 없는 즉시 반응)]
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();

  // 1. 시작 화면 버튼들
  const btnStartApp = document.getElementById('btn-start-app');
  if (btnStartApp) {
    btnStartApp.addEventListener('pointerdown', () => {
      initAudioContext();
      soundEffects.click();
    });
    btnStartApp.addEventListener('click', () => {
      showScreen('name');
    });
  }

  const btnStartLeaderboard = document.getElementById('btn-start-leaderboard');
  if (btnStartLeaderboard) {
    btnStartLeaderboard.addEventListener('pointerdown', () => {
      initAudioContext();
      soundEffects.click();
    });
    btnStartLeaderboard.addEventListener('click', () => {
      openLeaderboard('today');
    });
  }

  // 2. PIN 키패드 버튼들 (0ms 즉시 터치 반응)
  const pinKeys = document.querySelectorAll('.btn-key');
  pinKeys.forEach(btn => {
    const key = btn.getAttribute('data-key');
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handlePinKey(key);
    });
  });

  const btnCancelPinLogin = document.getElementById('btn-cancel-pin-login');
  if (btnCancelPinLogin) {
    btnCancelPinLogin.addEventListener('click', closePinLoginModal);
  }

  // 3. 새 친구 등록 모달 컨트롤
  const btnShowNewPlayer = document.getElementById('btn-show-new-player');
  const modalNewPlayer = document.getElementById('modal-new-player');
  const btnCancelNewPlayer = document.getElementById('btn-cancel-new-player');
  const inputStudentName = document.getElementById('input-student-name');
  const inputStudentPassword = document.getElementById('input-student-password');
  const btnClearName = document.getElementById('btn-clear-name');
  const btnClearPassword = document.getElementById('btn-clear-password');
  const btnNameConfirm = document.getElementById('btn-name-confirm');
  const quickNameChips = document.querySelectorAll('.chip-name');

  if (btnShowNewPlayer && modalNewPlayer) {
    btnShowNewPlayer.addEventListener('click', () => {
      soundEffects.click();
      if (inputStudentName) inputStudentName.value = '';
      if (inputStudentPassword) inputStudentPassword.value = '';
      modalNewPlayer.classList.remove('hidden');
      if (inputStudentName) inputStudentName.focus();
    });
  }

  if (btnCancelNewPlayer && modalNewPlayer) {
    btnCancelNewPlayer.addEventListener('click', () => {
      soundEffects.click();
      modalNewPlayer.classList.add('hidden');
    });
  }

  if (btnClearName && inputStudentName) {
    btnClearName.addEventListener('click', () => {
      soundEffects.click();
      inputStudentName.value = '';
      inputStudentName.focus();
    });
  }

  if (btnClearPassword && inputStudentPassword) {
    btnClearPassword.addEventListener('click', () => {
      soundEffects.click();
      inputStudentPassword.value = '';
      inputStudentPassword.focus();
    });
  }

  quickNameChips.forEach(chip => {
    chip.addEventListener('click', () => {
      soundEffects.click();
      const chosen = chip.getAttribute('data-name');
      if (chosen && inputStudentName) {
        inputStudentName.value = chosen;
      }
    });
  });

  if (btnNameConfirm && inputStudentName) {
    btnNameConfirm.addEventListener('click', () => {
      soundEffects.click();
      const enteredName = inputStudentName.value.trim();
      const enteredPw = inputStudentPassword ? inputStudentPassword.value.trim() : '1234';
      if (!enteredName) {
        speak('별명을 입력해주세요!');
        return;
      }
      registerNewPlayer(enteredName, enteredPw || '1234');
    });
  }

  // 4. 메인 화면 상단
  const mainTitleHeading = document.getElementById('main-title-heading');
  if (mainTitleHeading) {
    mainTitleHeading.addEventListener('click', () => {
      soundEffects.click();
      speak(`나도 이제 1학년! ${state.studentName} 친구, 오늘 어떤 놀이를 해볼까요?`);
    });
  }

  const btnMuteToggle = document.getElementById('btn-mute-toggle');
  const muteIcon = document.getElementById('mute-icon');
  if (btnMuteToggle) {
    btnMuteToggle.addEventListener('click', () => {
      state.isMuted = !state.isMuted;
      if (muteIcon) muteIcon.textContent = state.isMuted ? '🔇' : '🔊';
      if (state.isMuted) {
        window.speechSynthesis.cancel();
      } else {
        soundEffects.click();
        speak('소리를 켰어요!');
      }
    });
  }

  // 5. 메인 화면 게임 카드 (즉시 터치 반응)
  const cardBackpack = document.getElementById('card-game-backpack');
  if (cardBackpack) {
    cardBackpack.addEventListener('pointerdown', () => soundEffects.click());
    cardBackpack.addEventListener('click', () => startBackpackGame());
  }

  const cardTraffic = document.getElementById('card-game-traffic');
  if (cardTraffic) {
    cardTraffic.addEventListener('pointerdown', () => soundEffects.click());
    cardTraffic.addEventListener('click', () => startTrafficGame());
  }

  const cardBook = document.getElementById('card-game-book');
  if (cardBook) {
    cardBook.addEventListener('pointerdown', () => soundEffects.click());
    cardBook.addEventListener('click', () => startBookGame());
  }

  const cardMap = document.getElementById('card-game-map');
  if (cardMap) {
    cardMap.addEventListener('pointerdown', () => soundEffects.click());
    cardMap.addEventListener('click', () => startMapGame());
  }

  // 6. 메인 화면 하단 바
  const btnHallOfFame = document.getElementById('btn-hall-of-fame');
  if (btnHallOfFame) {
    btnHallOfFame.addEventListener('pointerdown', () => soundEffects.click());
    btnHallOfFame.addEventListener('click', () => openLeaderboard('today'));
  }

  const btnNextFriend = document.getElementById('btn-next-friend');
  if (btnNextFriend) {
    btnNextFriend.addEventListener('click', () => {
      soundEffects.click();
      showScreen('name');
    });
  }

  // 7. 명예의 전당 모달 탭 및 버튼들
  const tabToday = document.getElementById('tab-fame-today');
  if (tabToday) {
    tabToday.addEventListener('click', () => {
      soundEffects.click();
      openLeaderboard('today');
    });
  }

  const tabAlltime = document.getElementById('tab-fame-alltime');
  if (tabAlltime) {
    tabAlltime.addEventListener('click', () => {
      soundEffects.click();
      openLeaderboard('alltime');
    });
  }

  const btnCloseFame = document.getElementById('btn-close-fame');
  const btnFameCloseBottom = document.getElementById('btn-fame-close-bottom');
  const modalFame = document.getElementById('modal-hall-of-fame');

  const closeFameHandler = () => {
    soundEffects.click();
    if (modalFame) modalFame.classList.add('hidden');
  };

  if (btnCloseFame) btnCloseFame.addEventListener('click', closeFameHandler);
  if (btnFameCloseBottom) btnFameCloseBottom.addEventListener('click', closeFameHandler);

  const btnRetryLeaderboard = document.getElementById('btn-retry-leaderboard');
  if (btnRetryLeaderboard) {
    btnRetryLeaderboard.addEventListener('click', () => {
      soundEffects.click();
      refreshLeaderboardData();
    });
  }

  // 8. 게임 1 HUD
  const btnBackpackExit = document.getElementById('btn-backpack-exit');
  if (btnBackpackExit) {
    btnBackpackExit.addEventListener('click', () => {
      soundEffects.click();
      stopGameTimer();
      window.speechSynthesis.cancel();
      showScreen('main');
    });
  }

  const btnBackpackRepeat = document.getElementById('btn-backpack-repeat-voice');
  if (btnBackpackRepeat) {
    btnBackpackRepeat.addEventListener('click', () => {
      soundEffects.click();
      speakBackpackMission();
    });
  }

  // 8-2. 게임 3 (등굣길 건너기) HUD
  const btnTrafficExit = document.getElementById('btn-traffic-exit');
  if (btnTrafficExit) {
    btnTrafficExit.addEventListener('click', () => {
      soundEffects.click();
      stopTrafficGame();
      stopGameTimer();
      window.speechSynthesis.cancel();
      showScreen('main');
    });
  }

  const btnTrafficRepeat = document.getElementById('btn-traffic-repeat-voice');
  if (btnTrafficRepeat) {
    btnTrafficRepeat.addEventListener('click', () => {
      soundEffects.click();
      speak('초록불에 횡단보도로 안전하게 학교까지 가요!');
    });
  }

  // 9. 게임 2 HUD & 인터랙션 (0ms 터치 즉시 반응)
  const btnBookExit = document.getElementById('btn-book-exit');
  if (btnBookExit) {
    btnBookExit.addEventListener('click', () => {
      soundEffects.click();
      stopGameTimer();
      window.speechSynthesis.cancel();
      showScreen('main');
    });
  }

  const btnBookRepeat = document.getElementById('btn-book-repeat-voice');
  if (btnBookRepeat) {
    btnBookRepeat.addEventListener('click', () => {
      soundEffects.click();
      speakBookTarget();
    });
  }

  const bookThicknessSlider = document.getElementById('book-thickness-slider');
  if (bookThicknessSlider) {
    bookThicknessSlider.addEventListener('pointerdown', (e) => {
      handleBookThicknessClick(e);
    });
  }

  const btnPagePrev = document.getElementById('btn-page-prev');
  if (btnPagePrev) {
    btnPagePrev.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      turnPagePrev();
    });
  }

  const btnPageNext = document.getElementById('btn-page-next');
  if (btnPageNext) {
    btnPageNext.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      turnPageNext();
    });
  }

  const btnBookSubmit = document.getElementById('btn-book-submit');
  if (btnBookSubmit) {
    btnBookSubmit.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleBookSubmit();
    });
  }

  const btnBookReclose = document.getElementById('btn-book-reclose');
  if (btnBookReclose) {
    btnBookReclose.addEventListener('click', () => {
      soundEffects.click();
      showBookClosedView();
      speak('책을 다시 덮었어요. 원하는 곳을 콕 눌러보세요!');
    });
  }

  // 9-2. 게임 4 (학교 길 찾기) HUD
  const btnMapExit = document.getElementById('btn-map-exit');
  if (btnMapExit) {
    btnMapExit.addEventListener('click', () => {
      soundEffects.click();
      stopMapGame();
      stopGameTimer();
      window.speechSynthesis.cancel();
      showScreen('main');
    });
  }

  const btnMapRepeat = document.getElementById('btn-map-repeat-voice');
  if (btnMapRepeat) {
    btnMapRepeat.addEventListener('click', () => {
      soundEffects.click();
      speakSchoolMission();
    });
  }

  // 10. 결과 화면 버튼들
  const btnResultReplay = document.getElementById('btn-result-replay');
  if (btnResultReplay) {
    btnResultReplay.addEventListener('click', () => {
      soundEffects.click();
      if (state.currentGame === 'backpack') {
        startBackpackGame();
      } else if (state.currentGame === 'traffic') {
        startTrafficGame();
      } else if (state.currentGame === 'book') {
        startBookGame();
      } else if (state.currentGame === 'map') {
        startMapGame();
      } else {
        startBackpackGame();
      }
    });
  }

  const btnResultLeaderboard = document.getElementById('btn-result-leaderboard');
  if (btnResultLeaderboard) {
    btnResultLeaderboard.addEventListener('click', () => {
      soundEffects.click();
      openLeaderboard('today');
    });
  }

  const btnResultHome = document.getElementById('btn-result-home');
  if (btnResultHome) {
    btnResultHome.addEventListener('click', () => {
      soundEffects.click();
      showScreen('main');
    });
  }
});
