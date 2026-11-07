/**
 * =============================================================================
 * 나도 이제 1학년! - Pure JavaScript Logic
 * 만 5세 유치원생을 위한 초등학교 1학년 준비 미니게임
 * (책가방 챙기기, 교과서 펼치기)
 * 
 * GitHub Pages 호환 (빌드 도구/프레임워크 불필요)
 * 안드로이드 태블릿 크롬 가로 화면 터치 조작 최적화
 * =============================================================================
 */

// =============================================================================
// [중요 함수: 점수 저장 - saveScore]
// 요구사항: 게임이 끝나면 saveScore(이름, 게임이름, 점수) 함수를 호출.
// 콘솔에 출력하고, 다음 단계에서 데이터베이스 저장으로 쉽게 교체할 수 있도록 분리.
// =============================================================================
export function saveScore(studentName, gameName, score) {
  const timestamp = new Date().toISOString();
  console.log('----------------------------------------------------');
  console.log(`🎉 [점수 저장 완료]`);
  console.log(`👤 학생 이름: ${studentName}`);
  console.log(`🎮 게임 종류: ${gameName}`);
  console.log(`⭐️ 최종 점수: ${score}점`);
  console.log(`⏱️ 저장 일시: ${timestamp}`);
  console.log('----------------------------------------------------');

  // 다음 단계 DB 연동을 위한 전역 이벤트 발행
  window.dispatchEvent(
    new CustomEvent('scoreSaved', {
      detail: { studentName, gameName, score, timestamp }
    })
  );
}

// Window 전역 객체에도 등록하여 외부 스크립트에서도 호출 가능하도록 함
window.saveScore = saveScore;


// =============================================================================
// [1. 상태 관리 (State Management)]
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
  currentGame: null, // 'backpack' | 'book'
  timerInterval: null,
  timeLeft: 60,
  currentScore: 0,

  // 책가방 챙기기 게임 상태
  backpack: {
    targetItems: [], // 이번 라운드에 챙겨야 할 물건 목록
    packedItems: [], // 이미 가방에 넣은 물건
    shelfItems: [],  // 선반에 올려진 8개 물건
  },

  // 교과서 펼치기 게임 상태
  book: {
    targetPage: 47,
    currentSpreadLeft: 46, // 왼쪽 짝수 쪽
    currentSpreadRight: 47, // 오른쪽 홀수 쪽
    isBookOpen: false,
  }
};


// =============================================================================
// [2. 음성 합성 (Web Speech API) & 효과음 (Web Audio API)]
// 5세 어린이를 위해 친절하고 또렷한 음성 및 부드러운 효과음 제공
// =============================================================================

// Web Audio Context (사용자 첫 터치 시 활성화)
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

/**
 * 부드러운 효과음 합성기 (외부 사운드 파일 없이 브라우저에서 즉시 재생)
 */
const soundEffects = {
  // 일반 버튼 클릭음
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

  // 물건을 가방에 쏙 넣었을 때 나는 경쾌한 방울 소리
  pop() {
    if (state.isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.15); // G5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (_) {}
  },

  // 실패해도 무섭지 않은 부드러운 우당탕/통통 소리 (gentle boing)
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

  // 책장 넘기는 사운드 (whoosh)
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

  // 성공 축하 팡파르
  fanfare() {
    if (state.isMuted || !audioCtx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
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

  // 카운트다운 비프음
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

/**
 * 한국어 음성 안내 (speechSynthesis)
 * - 5세 어린이에 맞춰 속도 조금 느리게 (rate 0.85), 친근한 톤
 */
function speak(text, onEnd) {
  if (state.isMuted) return;
  if (!('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel(); // 이전 음성 중단
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = 0.85; // 천천히 또박또박
    utter.pitch = 1.15; // 친근하고 밝은 목소리

    // 한국어 음성이 목록에 있다면 우선 지정
    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang.startsWith('ko') || v.lang === 'ko_KR');
    if (koVoice) utter.voice = koVoice;

    if (onEnd) {
      utter.onend = onEnd;
    }
    window.speechSynthesis.speak(utter);
  } catch (_) {}
}


// =============================================================================
// [3. 아이템 데이터베이스 (학교 물건 & 방해 물건)]
// 국어책/수학책 등 비슷한 물건은 색과 글자로 확실히 구분
// =============================================================================
const SCHOOL_ITEMS = [
  {
    id: 'korean_book',
    name: '국어책',
    emoji: '📙',
    badge: '국어 1-1',
    cssClass: 'item-korean-book',
    colorName: '주황색 국어책'
  },
  {
    id: 'math_book',
    name: '수학책',
    emoji: '📘',
    badge: '수학 1-1',
    cssClass: 'item-math-book',
    colorName: '파란색 수학책'
  },
  {
    id: 'notebook',
    name: '공책',
    emoji: '📗',
    badge: '알록달록 공책',
    cssClass: 'item-note-book',
    colorName: '초록색 공책'
  },
  {
    id: 'pencil_case',
    name: '필통',
    emoji: '✏️',
    badge: '필통',
    cssClass: 'item-pencil-case',
    colorName: '연필 필통'
  },
  {
    id: 'slippers',
    name: '실내화',
    emoji: '👟',
    badge: '하얀 실내화',
    cssClass: 'item-slippers',
    colorName: '깨끗한 실내화'
  },
  {
    id: 'water_bottle',
    name: '물통',
    emoji: '🍶',
    badge: '시원한 물통',
    cssClass: 'item-water-bottle',
    colorName: '물통'
  },
  {
    id: 'notice_book',
    name: '알림장',
    emoji: '📒',
    badge: '알림장',
    cssClass: 'item-notice-book',
    colorName: '노란 알림장'
  },
  {
    id: 'crayons',
    name: '색연필',
    emoji: '🖍️',
    badge: '12색 색연필',
    cssClass: 'item-crayons',
    colorName: '색연필'
  },
  {
    id: 'scissors',
    name: '가위',
    emoji: '✂️',
    badge: '안전 가위',
    cssClass: 'item-scissors',
    colorName: '가위'
  },
  {
    id: 'glue',
    name: '풀',
    emoji: '🧴',
    badge: '딱풀',
    cssClass: 'item-glue',
    colorName: '풀'
  }
];

const DISTRACTOR_ITEMS = [
  {
    id: 'toy_car',
    name: '장난감 자동차',
    emoji: '🚗',
    badge: '장난감',
    cssClass: 'item-distractor',
    colorName: '장난감 자동차'
  },
  {
    id: 'doll',
    name: '곰인형',
    emoji: '🧸',
    badge: '인형',
    cssClass: 'item-distractor',
    colorName: '곰인형'
  },
  {
    id: 'game_console',
    name: '게임기',
    emoji: '🎮',
    badge: '게임기',
    cssClass: 'item-distractor',
    colorName: '게임기'
  },
  {
    id: 'cookie',
    name: '과자',
    emoji: '🍪',
    badge: '간식',
    cssClass: 'item-distractor',
    colorName: '달콤한 과자'
  },
  {
    id: 'ball',
    name: '축구공',
    emoji: '⚽',
    badge: '축구공',
    cssClass: 'item-distractor',
    colorName: '축구공'
  }
];


// =============================================================================
// [4. 화면 전환 및 내비게이션 (Screen Router)]
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
  // 모든 화면 숨김
  Object.values(screens).forEach(screen => {
    if (screen) {
      screen.classList.remove('screen-active');
    }
  });

  const target = screens[screenKey];
  if (target) {
    target.classList.add('screen-active');
  }

  // 화면 진입 시 안내 음성
  if (screenKey === 'name') {
    speak('이름이 뭐예요? 이름을 콕 적어봐요.');
  } else if (screenKey === 'main') {
    updateMainScreenUI();
  }
}


// =============================================================================
// [5. 메인 화면 UI 업데이트]
// =============================================================================
function updateMainScreenUI() {
  const greetingEl = document.getElementById('label-student-greeting');
  if (greetingEl) {
    greetingEl.textContent = `${state.studentName} 예비 1학년, 안녕!`;
  }

  // 책가방 챙기기 최고점수 & 도장
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

  // 교과서 펼치기 최고점수 & 도장
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
// [6. 카운트다운 (3, 2, 1, 시작!)]
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


// =============================================================================
// [7. 공통 타이머 & 점수 HUD 관리]
// =============================================================================
function startGameTimer(gameKey, onTimeUp) {
  state.timeLeft = 60;
  state.currentScore = 0;

  updateHUD(gameKey);

  if (state.timerInterval) {
    clearInterval(state.timerInterval);
  }

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
  const prefix = gameKey; // 'backpack' or 'book'
  const timerTextEl = document.getElementById(`${prefix}-timer-text`);
  const timerBarEl = document.getElementById(`${prefix}-timer-bar`);
  const scoreEl = document.getElementById(`${prefix}-current-score`);

  if (timerTextEl) timerTextEl.textContent = `${state.timeLeft}초`;
  if (timerBarEl) {
    const percent = Math.max(0, (state.timeLeft / 60) * 100);
    timerBarEl.style.width = `${percent}%`;
  }
  if (scoreEl) scoreEl.textContent = state.currentScore;
}


// =============================================================================
// [8. 결과 화면 (Result Screen)]
// =============================================================================
function finishGame(gameKey) {
  stopGameTimer();
  window.speechSynthesis.cancel();

  const gameTitle = gameKey === 'backpack' ? '책가방 챙기기' : '교과서 펼치기';
  const score = state.currentScore;
  const prevBest = state.bestScores[gameKey];
  const isNewRecord = score > prevBest;

  // 최고 점수 갱신 및 도장 수여
  if (isNewRecord) {
    state.bestScores[gameKey] = score;
  }
  state.stamps[gameKey] = true;

  // [중요 요구사항] saveScore(이름, 게임이름, 점수) 호출!
  saveScore(state.studentName, gameTitle, score);

  // 결과 화면 UI 바인딩
  const titleEl = document.getElementById('result-game-title');
  const currScoreEl = document.getElementById('result-current-score');
  const bestScoreEl = document.getElementById('result-best-score');
  const newRecordBanner = document.getElementById('result-new-record-banner');
  const praiseMsgEl = document.getElementById('result-praise-message');

  if (titleEl) titleEl.textContent = `${gameTitle} 완료!`;
  if (currScoreEl) currScoreEl.textContent = score;
  if (bestScoreEl) bestScoreEl.textContent = state.bestScores[gameKey];

  if (newRecordBanner) {
    if (isNewRecord && score > 0) {
      newRecordBanner.classList.remove('hidden');
      triggerConfetti();
    } else {
      newRecordBanner.classList.add('hidden');
    }
  }

  // 칭찬 문구
  if (praiseMsgEl) {
    if (score >= 40) {
      praiseMsgEl.textContent = '🌟 "스스로 척척! 초등학교 갈 준비가 완벽해요!"';
    } else if (score > 0) {
      praiseMsgEl.textContent = '💮 "참 잘했어요! 한 걸음 더 멋진 1학년이 되었어요!"';
    } else {
      praiseMsgEl.textContent = '💖 "포기하지 않고 끝까지 해낸 모습이 멋져요!"';
    }
  }

  showScreen('result');
  soundEffects.fanfare();

  if (isNewRecord && score > 0) {
    speak(`와아! ${score}점으로 최고 기록을 세웠어요! 참 잘했어요!`);
  } else {
    speak(`놀이 끝! 이번 점수는 ${score}점이에요. 참 잘했어요!`);
  }
}


// =============================================================================
// [9. 게임 1: 🎒 책가방 챙기기 (Pack the Backpack)]
// 60초, 성공 1회당 20점, 오답 시 -5점(0점 이상) + "이건 오늘 필요 없어요"
// =============================================================================
function startBackpackGame() {
  state.currentGame = 'backpack';
  showScreen('backpack');

  // 내부 가방 비우기
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
  // 오늘 챙길 물건 2~3개 무작위 선정
  const targetCount = Math.random() < 0.5 ? 2 : 3;
  const shuffledSchool = [...SCHOOL_ITEMS].sort(() => 0.5 - Math.random());
  state.backpack.targetItems = shuffledSchool.slice(0, targetCount);
  state.backpack.packedItems = [];

  // 선반에 올려놓을 8개 물건 구성:
  // (필수 물건들 + 다른 학교 물건 + 방해 물건)
  const otherSchool = shuffledSchool.slice(targetCount);
  const shuffledDistractors = [...DISTRACTOR_ITEMS].sort(() => 0.5 - Math.random());

  const neededOthers = 8 - targetCount;
  const distractorCount = Math.min(3, Math.floor(Math.random() * 2) + 2); // 2~3개 방해 물건
  const schoolOthersCount = neededOthers - distractorCount;

  const shelfPool = [
    ...state.backpack.targetItems,
    ...otherSchool.slice(0, schoolOthersCount),
    ...shuffledDistractors.slice(0, distractorCount)
  ];

  // 순서 섞기
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
  const speechText = `오늘은 ${names}을 챙겨요!`;
  speak(speechText);
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
  // 이미 넣은 물건이면 무시
  if (state.backpack.packedItems.some(i => i.id === item.id)) return;

  const isTarget = state.backpack.targetItems.some(i => i.id === item.id);

  if (isTarget) {
    // [정답]: 가방으로 쏙 들어가는 효과
    soundEffects.pop();
    state.backpack.packedItems.push(item);

    // 카드 애니메이션 및 숨김
    cardEl.classList.add('flying-into-bag');
    setTimeout(() => {
      cardEl.style.visibility = 'hidden';
    }, 380);

    // 미션 칩 완료 표시
    const chip = document.getElementById(`mission-chip-${item.id}`);
    if (chip) chip.classList.add('completed');

    // 가방 안에 아이템 추가
    addItemToBagView(item);

    // 모든 물건을 다 챙겼는지 확인
    if (state.backpack.packedItems.length === state.backpack.targetItems.length) {
      // 1회 성공! 20점 획득
      state.currentScore += 20;
      updateHUD('backpack');
      soundEffects.fanfare();

      speak('참 잘했어요! 다음 물건을 챙겨볼까요?', () => {
        // 잠시 후 다음 라운드 진행
        setTimeout(nextBackpackRound, 400);
      });
    }
  } else {
    // [오답]: 필요 없는 물건을 누르면 흔들리는 효과 + 5점 감점(0점 아래로 내려가지 않음) + 음성
    soundEffects.wobble();
    cardEl.classList.remove('shake-anim');
    void cardEl.offsetWidth; // reflow
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
// [10. 게임 2: 📖 교과서 펼치기 (Open the Textbook)]
// 60초, 성공 1회당 10점, 오답 시 -5점(0점 이상) + "다시 찾아봐요"
// 책은 1쪽부터 100쪽. 옆모습 터치 시 비례 ±3~5쪽 어긋남 -> ◀ ▶ 한 장씩(두 쪽씩) 넘겨서 맞추기
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
  // 1쪽부터 100쪽 중 무작위 목표 쪽수 선정
  state.book.targetPage = Math.floor(Math.random() * 98) + 2; // 2 ~ 99 쪽 위주
  state.book.isBookOpen = false;

  const targetNumEl = document.getElementById('book-target-page-num');
  if (targetNumEl) targetNumEl.textContent = state.book.targetPage;

  // 책을 덮은 옆모습 뷰 표시
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

/**
 * 책 옆면 두께 슬라이더 클릭/터치 시 처리
 * 누른 위치에 비례한 쪽수 + 3~5쪽 무작위 오차
 */
function handleBookThicknessClick(event) {
  const slider = document.getElementById('book-thickness-slider');
  if (!slider) return;

  const rect = slider.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));

  // 비례 쪽수 (1 ~ 100)
  const basePage = Math.round(1 + ratio * 99);

  // 단, 누른 위치와 정확히 같은 쪽이 아니라 3~5쪽 정도 무작위로 어긋나게 펼쳐지도록 해줘.
  const sign = Math.random() < 0.5 ? -1 : 1;
  const offset = (3 + Math.floor(Math.random() * 3)) * sign; // ±3, ±4, ±5
  let openedPage = basePage + offset;
  openedPage = Math.max(1, Math.min(100, openedPage));

  // 펼쳤을 때의 짝수/홀수 두 쪽 설정
  // standard: 왼쪽 짝수 p, 오른쪽 홀수 p+1
  let left = Math.floor(openedPage / 2) * 2;
  if (left < 2) left = 2;
  if (left > 100) left = 100;

  state.book.currentSpreadLeft = left;
  state.book.currentSpreadRight = left + 1 <= 100 ? left + 1 : 100;

  soundEffects.pageFlip();
  showBookOpenView();
}

/**
 * 펼쳐진 책 두 쪽 UI 갱신
 */
function updateBookSpreadUI(isAnimated = false) {
  const leftNumEl = document.getElementById('page-left-num');
  const rightNumEl = document.getElementById('page-right-num');
  const bookSpread = document.getElementById('book-spread-container');

  if (leftNumEl) leftNumEl.textContent = `${state.book.currentSpreadLeft} 쪽`;
  if (rightNumEl) rightNumEl.textContent = `${state.book.currentSpreadRight} 쪽`;

  // 페이지 내용에 귀여운 두들 테마 변경
  updateBookIllustrations(state.book.currentSpreadLeft, state.book.currentSpreadRight);

  if (isAnimated && bookSpread) {
    bookSpread.classList.remove('page-flip-anim');
    void bookSpread.offsetWidth; // reflow
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

/**
 * ◀ 이전 2쪽 넘기기
 */
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

/**
 * ▶ 다음 2쪽 넘기기
 */
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

/**
 * "다 폈어요!" 확인 버튼 클릭 시
 */
function handleBookSubmit() {
  const target = state.book.targetPage;
  const left = state.book.currentSpreadLeft;
  const right = state.book.currentSpreadRight;

  const isSuccess = (left === target || right === target);

  if (isSuccess) {
    // [성공]: 10점 획득 + 축하 + 다음 문제
    state.currentScore += 10;
    updateHUD('book');
    soundEffects.fanfare();

    speak('참 잘했어요! 정확히 찾았어요!', () => {
      // 성공하면 책이 다시 덮이고 옆모습으로 돌아가서 다음 문제
      setTimeout(nextBookProblem, 500);
    });
  } else {
    // [오답]: 5점 감점(0점 아래 안 내려감) + "다시 찾아봐요" 음성
    soundEffects.wobble();
    state.currentScore = Math.max(0, state.currentScore - 5);
    updateHUD('book');

    const bookSpread = document.getElementById('book-spread-container');
    if (bookSpread) {
      bookSpread.classList.remove('shake-anim');
      void bookSpread.offsetWidth;
      bookSpread.classList.add('shake-anim');
    }

    // 아이를 위한 친절한 방향 힌트
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
// [11. 축하 콘페티 (Confetti Animation)]
// =============================================================================
function triggerConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;

  container.innerHTML = '';
  const colors = ['#FF1744', '#FF9100', '#FFEA00', '#00E676', '#2979FF', '#D500F9'];

  for (let i = 0; i < 40; i++) {
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
// [12. 이벤트 리스너 바인딩 (DOM Events)]
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {

  // 1. 시작 화면 -> 이름 입력 화면 (오디오 컨텍스트 언락 및 음성 초기화)
  const btnStartApp = document.getElementById('btn-start-app');
  if (btnStartApp) {
    btnStartApp.addEventListener('click', () => {
      initAudioContext();
      soundEffects.click();
      showScreen('name');
    });
  }

  // 2. 이름 입력 화면 컨트롤
  const inputName = document.getElementById('input-student-name');
  const btnClearName = document.getElementById('btn-clear-name');
  const btnNameConfirm = document.getElementById('btn-name-confirm');
  const quickChips = document.querySelectorAll('.chip-name');

  if (btnClearName && inputName) {
    btnClearName.addEventListener('click', () => {
      soundEffects.click();
      inputName.value = '';
      inputName.focus();
    });
  }

  quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      soundEffects.click();
      const chosen = chip.getAttribute('data-name');
      if (chosen && inputName) {
        inputName.value = chosen;
      }
    });
  });

  if (btnNameConfirm) {
    btnNameConfirm.addEventListener('click', () => {
      soundEffects.click();
      const entered = inputName ? inputName.value.trim() : '';
      state.studentName = entered || '튼튼이';

      showScreen('main');
      speak(`${state.studentName} 예비 1학년, 안녕! 학교 갈 준비를 해볼까요?`);
    });
  }

  // 3. 메인 화면 인사 다시 듣기 & 음소거 토글
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
      if (muteIcon) {
        muteIcon.textContent = state.isMuted ? '🔇' : '🔊';
      }
      if (state.isMuted) {
        window.speechSynthesis.cancel();
      } else {
        soundEffects.click();
        speak('소리를 켰어요!');
      }
    });
  }

  // 4. 메인 화면 게임 선택 카드
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

  // 5. 하단: 명예의 전당 & 다음 친구
  const btnFame = document.getElementById('btn-hall-of-fame');
  const modalFame = document.getElementById('modal-hall-of-fame');
  const btnCloseFame = document.getElementById('btn-close-fame');
  const fameBackpackScore = document.getElementById('fame-score-backpack');
  const fameBookScore = document.getElementById('fame-score-book');

  if (btnFame && modalFame) {
    btnFame.addEventListener('click', () => {
      soundEffects.click();
      if (fameBackpackScore) fameBackpackScore.textContent = `${state.bestScores.backpack}점`;
      if (fameBookScore) fameBookScore.textContent = `${state.bestScores.book}점`;
      modalFame.classList.remove('hidden');
      speak('명예의 전당이에요! 곧 친구들의 멋진 기록이 연결돼요.');
    });
  }

  if (btnCloseFame && modalFame) {
    btnCloseFame.addEventListener('click', () => {
      soundEffects.click();
      modalFame.classList.add('hidden');
    });
  }

  const btnNextFriend = document.getElementById('btn-next-friend');
  if (btnNextFriend) {
    btnNextFriend.addEventListener('click', () => {
      soundEffects.click();
      if (inputName) inputName.value = '';
      showScreen('name');
    });
  }

  // 6. 게임 1 HUD 버튼들
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

  // 7. 게임 2 HUD & 컨트롤 버튼들
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

  // 8. 결과 화면 버튼들
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

  const btnResultHome = document.getElementById('btn-result-home');
  if (btnResultHome) {
    btnResultHome.addEventListener('click', () => {
      soundEffects.click();
      showScreen('main');
    });
  }
});
