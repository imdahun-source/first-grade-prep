/**
 * =============================================================================
 * 나도 이제 1학년! - Pure JavaScript Logic with Firebase Firestore Integration
 * 만 5세 유치원생을 위한 초등학교 1학년 준비 미니게임 & 실시간 리더보드
 * 
 * GitHub Pages 호환 (빌드 도구/프레임워크 불필요)
 * Firebase JavaScript SDK v11 CDN (gstatic) 모듈 방식
 * 안드로이드 태블릿 크롬 가로 화면 터치 조작 최적화
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
// 요구사항: 날짜는 반드시 한국 시간 기준 "YYYY-MM-DD" 문자열로 계산
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
    // Fallback if Intl timeZone is unsupported
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

// 로컬 캐시 (오프라인/에러 시에도 원활한 플레이 보장)
let cachedPlayers = [
  { name: '튼튼이', createdAt: new Date().toISOString() },
  { name: '민우', createdAt: new Date().toISOString() },
  { name: '서연', createdAt: new Date().toISOString() },
  { name: '지우', createdAt: new Date().toISOString() }
];
let cachedScores = [];

/**
 * Firebase Firestore 초기화
 */
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
    console.warn('⚠️ Firebase CDN 로드 또는 초기화 대기 (임시 로컬 모드로 동작합니다):', error);
    isFirebaseReady = false;
    renderRegisteredPlayers(cachedPlayers);
  }
}


// =============================================================================
// [💾 점수 저장 함수: saveScore]
// scores 컬렉션: 이름, 게임이름, 점수, 날짜(한국 시간 YYYY-MM-DD), 기록 시각
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

  console.log('----------------------------------------------------');
  console.log(`🎉 [점수 저장]`);
  console.log(scoreRecord);
  console.log('----------------------------------------------------');

  // 로컬 캐시 추가
  cachedScores.push(scoreRecord);

  // Firestore DB 저장 시도
  if (isFirebaseReady && fbDb && firestore) {
    try {
      await firestore.addDoc(firestore.collection(fbDb, 'scores'), scoreRecord);
      console.log('✅ Firestore scores 컬렉션 저장 성공!');
    } catch (err) {
      console.error('❌ Firestore scores 저장 실패:', err);
    }
  }

  // 메인 화면 최고점수 및 도장 업데이트
  await syncPlayerStats(studentName);
}

// Window 전역 객체 등록
window.saveScore = saveScore;


// =============================================================================
// [👥 1. players 컬렉션 관리 (등록된 친구 목록 & 새 친구 추가)]
// =============================================================================

/**
 * Firestore players 실시간 수신 리스너
 */
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

/**
 * 등록된 친구 명단 UI 렌더링
 */
function renderRegisteredPlayers(playersList) {
  const container = document.getElementById('registered-players-container');
  const countBadge = document.getElementById('players-count-badge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${playersList.length}명 등록됨`;
  }

  container.innerHTML = '';

  if (playersList.length === 0) {
    container.innerHTML = '<div class="players-empty-text">아직 등록된 친구가 없어요. 아래 "새 친구예요" 버튼을 눌러 등록해주세요!</div>';
    return;
  }

  // 아바타 이모지 목록
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

    card.addEventListener('click', () => {
      soundEffects.click();
      selectStudentAndEnter(player.name);
    });

    container.appendChild(card);
  });
}

/**
 * 친구 선택 후 메인 화면 진입
 */
async function selectStudentAndEnter(name) {
  state.studentName = name;
  await syncPlayerStats(name);
  showScreen('main');
  speak(`${state.studentName} 예비 1학년, 안녕! 학교 갈 준비를 해볼까요?`);
}

/**
 * 새 친구 등록
 */
async function registerNewPlayer(name) {
  const cleanName = name.trim();
  if (!cleanName) return;

  // 이미 존재하는지 확인
  const isDuplicate = cachedPlayers.some(p => p.name === cleanName);

  if (isDuplicate) {
    // 중복 확인 모달 표시: "이미 있는 이름이에요. 이 친구 맞아요?"
    showDuplicateConfirmModal(cleanName);
    return;
  }

  // 신규 등록
  const newPlayer = {
    name: cleanName,
    createdAt: new Date().toISOString()
  };

  cachedPlayers.push(newPlayer);
  renderRegisteredPlayers(cachedPlayers);

  if (isFirebaseReady && fbDb && firestore) {
    try {
      await firestore.addDoc(firestore.collection(fbDb, 'players'), newPlayer);
      console.log('✅ 새 친구 등록 완료:', cleanName);
    } catch (err) {
      console.error('새 친구 등록 실패:', err);
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

  speak(`이미 있는 이름이에요. ${name} 친구 맞아요?`);

  const btnYes = document.getElementById('btn-duplicate-yes');
  const btnNo = document.getElementById('btn-duplicate-no');

  if (btnYes) {
    btnYes.onclick = () => {
      soundEffects.click();
      modal.classList.add('hidden');
      closeNewPlayerModal();
      selectStudentAndEnter(name);
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
// [📊 2. scores 컬렉션 관리 (개인 최고기록 및 메인화면 동기화)]
// =============================================================================

function startRealtimeScoresListener() {
  if (!isFirebaseReady || !fbDb || !firestore) return;

  try {
    const scoresCol = firestore.collection(fbDb, 'scores');
    // 복합 색인 불필요: 단순 컬렉션 전체 가져오기
    firestore.onSnapshot(scoresCol, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      cachedScores = list;

      // 현재 선택된 학생의 점수 갱신
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

/**
 * 특정 학생의 게임별 최고 점수 및 도장 동기화
 */
async function syncPlayerStats(studentName) {
  let playerScores = cachedScores.filter(s => s.name === studentName);

  // Firestore 연결되어 있으면 직접 조회도 가능
  if (isFirebaseReady && fbDb && firestore) {
    try {
      const q = firestore.query(
        firestore.collection(fbDb, 'scores'),
        firestore.where('name', '==', studentName)
      );
      const snap = await firestore.getDocs(q);
      const list = [];
      snap.forEach(d => list.push(d.data()));
      if (list.length > 0) {
        playerScores = list;
      }
    } catch (_) {}
  }

  let bpMax = 0;
  let bkMax = 0;

  playerScores.forEach(item => {
    const sc = Number(item.score) || 0;
    if (item.gameName === '책가방 챙기기') {
      if (sc > bpMax) bpMax = sc;
    } else if (item.gameName === '교과서 펼치기') {
      if (sc > bkMax) bkMax = sc;
    }
  });

  state.bestScores.backpack = bpMax;
  state.bestScores.book = bkMax;
  state.stamps.backpack = bpMax > 0;
  state.stamps.book = bkMax > 0;

  updateMainScreenUI();
}

/**
 * 결과 화면에서 오늘 종합 1등 여부 검사
 */
function checkIfTodayGrandChampion(studentName) {
  const todayStr = getKoreanDateString();
  const todayScores = cachedScores.filter(s => s.date === todayStr);

  // 플레이어별 종합 점수 (게임별 최고 점수의 합) 계산
  const playerMap = {};
  todayScores.forEach(s => {
    if (!playerMap[s.name]) {
      playerMap[s.name] = { backpack: 0, book: 0 };
    }
    const val = Number(s.score) || 0;
    if (s.gameName === '책가방 챙기기') {
      playerMap[s.name].backpack = Math.max(playerMap[s.name].backpack, val);
    } else if (s.gameName === '교과서 펼치기') {
      playerMap[s.name].book = Math.max(playerMap[s.name].book, val);
    }
  });

  let topPlayer = null;
  let topTotal = 0;

  Object.entries(playerMap).forEach(([name, data]) => {
    const total = data.backpack + data.book;
    if (total > topTotal) {
      topTotal = total;
      topPlayer = name;
    }
  });

  return (topPlayer === studentName && topTotal > 0);
}


// =============================================================================
// [🏆 3. 실시간 리더보드 (명예의 전당) 계산 & 렌더링]
// 복합 색인 없이 브라우저에서 집계 및 정렬
// =============================================================================
let currentLeaderboardMode = 'today'; // 'today' | 'alltime'

async function openLeaderboard(mode = 'today') {
  currentLeaderboardMode = mode;
  const modal = document.getElementById('modal-hall-of-fame');
  if (modal) modal.classList.remove('hidden');

  // 탭 상태 업데이트
  updateLeaderboardTabs(mode);

  // 데이터 로드 및 렌더링
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
      // 단순 쿼리: date 하나로 필터(오늘) 또는 전체 가져오기(역대)
      // 복합 색인 전혀 필요 없음!
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
      // 로컬 캐시 사용
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

/**
 * 리더보드 계산 및 시상대 렌더링
 * 규칙: 각 게임에서의 최고 점수를 더한 값 (게임별 최고 기록의 합)
 */
function renderLeaderboardContent(scoresList) {
  // 1. 플레이어별 집계
  const playerStats = {};
  // 2. 게임별 챔피언 집계
  let champBackpack = { name: '기록 없음', score: 0 };
  let champBook = { name: '기록 없음', score: 0 };

  scoresList.forEach(item => {
    const name = item.name || '무명 친구';
    const score = Number(item.score) || 0;
    const game = item.gameName;

    if (!playerStats[name]) {
      playerStats[name] = { backpack: 0, book: 0 };
    }

    if (game === '책가방 챙기기') {
      if (score > playerStats[name].backpack) playerStats[name].backpack = score;
      if (score > champBackpack.score) {
        champBackpack = { name, score };
      }
    } else if (game === '교과서 펼치기') {
      if (score > playerStats[name].book) playerStats[name].book = score;
      if (score > champBook.score) {
        champBook = { name, score };
      }
    }
  });

  // 종합 점수 계산 (게임별 최고 점수의 합)
  const rankingList = Object.entries(playerStats).map(([name, data]) => {
    return {
      name,
      backpack: data.backpack,
      book: data.book,
      total: data.backpack + data.book
    };
  });

  // 내림차순 정렬
  rankingList.sort((a, b) => b.total - a.total);

  // 1등 ~ 3등 시상대 UI 바인딩
  const first = rankingList[0] || null;
  const second = rankingList[1] || null;
  const third = rankingList[2] || null;
  const fourth = rankingList[3] || null;
  const fifth = rankingList[4] || null;

  // 1등 (Gold)
  const p1Name = document.getElementById('podium-1st-name');
  const p1Score = document.getElementById('podium-1st-score');
  const p1Breakdown = document.getElementById('podium-1st-breakdown');
  if (p1Name) p1Name.textContent = first ? first.name : '-';
  if (p1Score) p1Score.textContent = first ? `${first.total}점` : '0점';
  if (p1Breakdown) {
    p1Breakdown.textContent = first ? `(🎒 ${first.backpack} + 📖 ${first.book})` : '';
  }

  // 2등 (Silver)
  const p2Name = document.getElementById('podium-2nd-name');
  const p2Score = document.getElementById('podium-2nd-score');
  if (p2Name) p2Name.textContent = second ? second.name : '-';
  if (p2Score) p2Score.textContent = second ? `${second.total}점` : '0점';

  // 3등 (Bronze)
  const p3Name = document.getElementById('podium-3rd-name');
  const p3Score = document.getElementById('podium-3rd-score');
  if (p3Name) p3Name.textContent = third ? third.name : '-';
  if (p3Score) p3Score.textContent = third ? `${third.total}점` : '0점';

  // 4등 & 5등
  const r4Name = document.getElementById('runner-4th-name');
  const r4Score = document.getElementById('runner-4th-score');
  if (r4Name) r4Name.textContent = fourth ? fourth.name : '-';
  if (r4Score) r4Score.textContent = fourth ? `${fourth.total}점` : '0점';

  const r5Name = document.getElementById('runner-5th-name');
  const r5Score = document.getElementById('runner-5th-score');
  if (r5Name) r5Name.textContent = fifth ? fifth.name : '-';
  if (r5Score) r5Score.textContent = fifth ? `${fifth.total}점` : '0점';

  // 게임별 챔피언 바인딩
  const cBpName = document.getElementById('champ-backpack-name');
  const cBpScore = document.getElementById('champ-backpack-score');
  if (cBpName) cBpName.textContent = champBackpack.name;
  if (cBpScore) cBpScore.textContent = `${champBackpack.score}점`;

  const cBkName = document.getElementById('champ-book-name');
  const cBkScore = document.getElementById('champ-book-score');
  if (cBkName) cBkName.textContent = champBook.name;
  if (cBkScore) cBkScore.textContent = `${champBook.score}점`;
}


// =============================================================================
// [🎮 4. 핵심 게임 엔진 & 상태 관리]
// =============================================================================
const state = {
  studentName: '튼튼이',
  isMuted: false,
  bestScores: {
    backpack: 0,
    book: 0,
  },
  stamps: {
    backpack: false,
    book: false,
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
  }
};


// =============================================================================
// [🔊 5. Web Speech API & Web Audio 효과음]
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
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(850, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch (_) {}
  },

  pop() {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (_) {}
  },

  wobble() {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(220, audioCtx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.22);
    } catch (_) {}
  },

  pageFlip() {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(480, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
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
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + idx * 0.08 + 0.22);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + idx * 0.08);
        osc.stop(audioCtx.currentTime + idx * 0.08 + 0.25);
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
      const duration = isFinal ? 0.3 : 0.12;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
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
    utter.rate = 0.85;
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
  book: document.getElementById('screen-game-book'),
  result: document.getElementById('screen-result'),
};

function showScreen(screenKey) {
  Object.values(screens).forEach(screen => {
    if (screen) screen.classList.remove('screen-active');
  });

  const target = screens[screenKey];
  if (target) target.classList.add('screen-active');

  if (screenKey === 'name') {
    renderRegisteredPlayers(cachedPlayers);
    speak('누구 차례인가요? 내 이름을 콕 터치해요!');
  } else if (screenKey === 'main') {
    updateMainScreenUI();
  }
}

function updateMainScreenUI() {
  const greetingEl = document.getElementById('label-student-greeting');
  if (greetingEl) {
    greetingEl.textContent = `${state.studentName} 예비 1학년, 안녕!`;
  }

  const bpScoreEl = document.getElementById('score-best-backpack');
  const bpStampEl = document.getElementById('stamp-backpack');
  if (bpScoreEl) bpScoreEl.textContent = `${state.bestScores.backpack}점`;
  if (bpStampEl) {
    if (state.stamps.backpack) {
      bpStampEl.classList.remove('hidden');
    } else {
      bpStampEl.classList.add('hidden');
    }
  }

  const bkScoreEl = document.getElementById('score-best-book');
  const bkStampEl = document.getElementById('stamp-book');
  if (bkScoreEl) bkScoreEl.textContent = `${state.bestScores.book}점`;
  if (bkStampEl) {
    if (state.stamps.book) {
      bkStampEl.classList.remove('hidden');
    } else {
      bkStampEl.classList.add('hidden');
    }
  }
}


// =============================================================================
// [8. 카운트다운 & 타이머 HUD]
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

function startGameTimer(gameKey, onTimeUp) {
  state.timeLeft = 60;
  state.currentScore = 0;
  updateHUD(gameKey);

  if (state.timerInterval) clearInterval(state.timerInterval);

  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateHUD(gameKey);

    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      onTimeUp();
    }
  }, 1000);
}

function stopGameTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateHUD(gameKey) {
  const timerTextEl = document.getElementById(`${gameKey}-timer-text`);
  const timerBarEl = document.getElementById(`${gameKey}-timer-bar`);
  const scoreEl = document.getElementById(`${gameKey}-current-score`);

  if (timerTextEl) timerTextEl.textContent = `${state.timeLeft}초`;
  if (timerBarEl) {
    const percent = Math.max(0, (state.timeLeft / 60) * 100);
    timerBarEl.style.width = `${percent}%`;
  }
  if (scoreEl) scoreEl.textContent = state.currentScore;
}


// =============================================================================
// [9. 게임 종료 & 결과 화면 처리]
// =============================================================================
async function finishGame(gameKey) {
  stopGameTimer();
  window.speechSynthesis.cancel();

  const gameTitle = gameKey === 'backpack' ? '책가방 챙기기' : '교과서 펼치기';
  const score = state.currentScore;
  const prevBest = state.bestScores[gameKey];
  const isNewRecord = score > prevBest;

  // DB에 점수 저장
  await saveScore(state.studentName, gameTitle, score);

  // 오늘 종합 1등 달성 여부 확인
  const isTodayGrandChamp = checkIfTodayGrandChampion(state.studentName);

  // 결과 화면 UI 바인딩
  const titleEl = document.getElementById('result-game-title');
  const currScoreEl = document.getElementById('result-current-score');
  const bestScoreEl = document.getElementById('result-best-score');
  const newRecordBanner = document.getElementById('result-new-record-banner');
  const crownBanner = document.getElementById('result-today-crown-banner');
  const praiseMsgEl = document.getElementById('result-praise-message');

  if (titleEl) titleEl.textContent = `${gameTitle} 완료!`;
  if (currScoreEl) currScoreEl.textContent = score;
  if (bestScoreEl) bestScoreEl.textContent = state.bestScores[gameKey];

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
    speak(`와아! ${state.studentName} 친구가 오늘의 명예의 전당 1등에 올랐어요! 대단해요!`);
  } else if (isNewRecord && score > 0) {
    speak(`와아! ${score}점으로 최고 기록을 세웠어요! 참 잘했어요!`);
  } else {
    speak(`놀이 끝! 이번 점수는 ${score}점이에요. 참 잘했어요!`);
  }
}


// =============================================================================
// [10. 게임 1: 🎒 책가방 챙기기 상세 로직]
// =============================================================================
function startBackpackGame() {
  state.currentGame = 'backpack';
  showScreen('backpack');

  const bagContent = document.getElementById('bag-inside-content');
  if (bagContent) {
    bagContent.innerHTML = '<span class="bag-empty-hint">안내받은 물건을 터치하면 여기로 쏙 들어가요!</span>';
  }

  startCountdown(() => {
    startGameTimer('backpack', () => {
      finishGame('backpack');
    });
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

    card.addEventListener('click', () => handleBackpackItemClick(item, card));
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
    }, 380);

    const chip = document.getElementById(`mission-chip-${item.id}`);
    if (chip) chip.classList.add('completed');

    addItemToBagView(item);

    if (state.backpack.packedItems.length === state.backpack.targetItems.length) {
      state.currentScore += 20;
      updateHUD('backpack');
      soundEffects.fanfare();

      speak('참 잘했어요! 다음 물건을 챙겨볼까요?', () => {
        setTimeout(nextBackpackRound, 400);
      });
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
// =============================================================================
function startBookGame() {
  state.currentGame = 'book';
  showScreen('book');

  startCountdown(() => {
    startGameTimer('book', () => {
      finishGame('book');
    });
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

    speak('참 잘했어요! 정확히 찾았어요!', () => {
      setTimeout(nextBookProblem, 500);
    });
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
// [13. DOM 이벤트 리스너 바인딩]
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {

  // Firebase 초기화 시작
  initFirebase();

  // 1. 시작 화면 버튼들
  const btnStartApp = document.getElementById('btn-start-app');
  if (btnStartApp) {
    btnStartApp.addEventListener('click', () => {
      initAudioContext();
      soundEffects.click();
      showScreen('name');
    });
  }

  // 시작 화면의 "명예의 전당" 버튼
  const btnStartLeaderboard = document.getElementById('btn-start-leaderboard');
  if (btnStartLeaderboard) {
    btnStartLeaderboard.addEventListener('click', () => {
      initAudioContext();
      soundEffects.click();
      openLeaderboard('today');
    });
  }

  // 2. 이름 선택 & 새 친구 등록 컨트롤
  const btnShowNewPlayer = document.getElementById('btn-show-new-player');
  const modalNewPlayer = document.getElementById('modal-new-player');
  const btnCancelNewPlayer = document.getElementById('btn-cancel-new-player');
  const inputStudentName = document.getElementById('input-student-name');
  const btnClearName = document.getElementById('btn-clear-name');
  const btnNameConfirm = document.getElementById('btn-name-confirm');
  const quickNameChips = document.querySelectorAll('.chip-name');

  if (btnShowNewPlayer && modalNewPlayer) {
    btnShowNewPlayer.addEventListener('click', () => {
      soundEffects.click();
      if (inputStudentName) inputStudentName.value = '';
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
      const entered = inputStudentName.value.trim();
      if (!entered) {
        speak('이름을 입력해주세요!');
        return;
      }
      registerNewPlayer(entered);
    });
  }

  // 3. 메인 화면 상단
  const btnSpeakGreeting = document.getElementById('btn-speak-greeting');
  if (btnSpeakGreeting) {
    btnSpeakGreeting.addEventListener('click', () => {
      speak(`${state.studentName} 예비 1학년, 안녕! 오늘 어떤 놀이를 해볼까요?`);
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

  // 4. 메인 화면 게임 카드
  const cardBackpack = document.getElementById('card-game-backpack');
  if (cardBackpack) {
    cardBackpack.addEventListener('click', () => {
      soundEffects.click();
      startBackpackGame();
    });
  }

  const cardBook = document.getElementById('card-game-book');
  if (cardBook) {
    cardBook.addEventListener('click', () => {
      soundEffects.click();
      startBookGame();
    });
  }

  // 5. 메인 화면 하단 바
  const btnHallOfFame = document.getElementById('btn-hall-of-fame');
  if (btnHallOfFame) {
    btnHallOfFame.addEventListener('click', () => {
      soundEffects.click();
      openLeaderboard('today');
    });
  }

  const btnNextFriend = document.getElementById('btn-next-friend');
  if (btnNextFriend) {
    btnNextFriend.addEventListener('click', () => {
      soundEffects.click();
      showScreen('name');
    });
  }

  // 6. 명예의 전당 모달 탭 및 버튼들
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

  // 7. 게임 1 HUD
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

  // 8. 게임 2 HUD & 인터랙션
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
    bookThicknessSlider.addEventListener('click', handleBookThicknessClick);
  }

  const btnPagePrev = document.getElementById('btn-page-prev');
  if (btnPagePrev) {
    btnPagePrev.addEventListener('click', turnPagePrev);
  }

  const btnPageNext = document.getElementById('btn-page-next');
  if (btnPageNext) {
    btnPageNext.addEventListener('click', turnPageNext);
  }

  const btnBookSubmit = document.getElementById('btn-book-submit');
  if (btnBookSubmit) {
    btnBookSubmit.addEventListener('click', handleBookSubmit);
  }

  const btnBookReclose = document.getElementById('btn-book-reclose');
  if (btnBookReclose) {
    btnBookReclose.addEventListener('click', () => {
      soundEffects.click();
      showBookClosedView();
      speak('책을 다시 덮었어요. 원하는 곳을 콕 눌러보세요!');
    });
  }

  // 9. 결과 화면 버튼들
  const btnResultReplay = document.getElementById('btn-result-replay');
  if (btnResultReplay) {
    btnResultReplay.addEventListener('click', () => {
      soundEffects.click();
      if (state.currentGame === 'backpack') {
        startBackpackGame();
      } else {
        startBookGame();
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
