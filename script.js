 /*********************************************************************************
 * Know Your Friend / Compatibility Game - script.fixed.js
 *
 * Fixed and cleaned version of the original script.js
 * - fixes listener cleanup bugs
 * - normalizes where `host` is read (room root vs players list)
 * - avoids shadowing/conflicting get() names
 * - more defensive DOM handling
 * - various small bugfixes and comments
 ********************************************************************************/

// Prevent any logic from running on auth.html
// (Do not use return at top level)

// -----------------------------
// Firebase imports
// -----------------------------
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
    getDatabase,
    ref,
    set,
    get,
    onValue,
    off,
    push,
    update,
    remove,
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// -----------------------------
// Firebase configuration
// -----------------------------
const firebaseConfig = {
    // Use your project's config here. Below are the values you provided previously;
    // confirm these match your Firebase console settings.
    apiKey: "AIzaSyDgzBOkv2FExN19icsZhgIM-VZ0WJQuXK4",
    authDomain: "crenza-d0bd7.firebaseapp.com",
    databaseURL: "https://crenza-d0bd7-default-rtdb.firebaseio.com/",
    projectId: "crenza-d0bd7",
    storageBucket: "crenza-d0bd7.firebasestorage.app",
    messagingSenderId: "451744056247",
    appId: "1:451744056247:web:a87eaa604e7d8381c3de32",
    measurementId: "G-Y7NFGT1PFT"
};

// Initialize Firebase app & DB handle
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// -----------------------------
// DOM elements (from your HTML) — defensive lookups
// -----------------------------
const nameSection = document.getElementById('name-section');
const roomSection = document.getElementById('room-section');
const progressSection = document.getElementById('progress-section');
const quizSection = document.getElementById('quiz-section');
const resultsSection = document.getElementById('results-section');
const leaderboardSection = document.getElementById('leaderboard-section');

const playerNameInput = document.getElementById('player-name');
const nameBtn = document.getElementById('name-btn');

const roomCodeInput = document.getElementById('room-code');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');

const roomStatus = document.getElementById('room-status');
const progressText = document.getElementById('progress-text');
const progressFill = document.getElementById('progress-fill');

const questionText = document.getElementById('question-text');
const optionBtns = Array.from(document.querySelectorAll('.option-btn'));
const questionCounter = document.getElementById('question-counter');

const scoreText = document.getElementById('score-text');
const playAgainBtn = document.getElementById('play-again-btn');

const leaderboardList = document.getElementById('leaderboard-list');

const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalContent = document.getElementById('modal-content');
const modalConfirmBtn = document.getElementById('modal-confirm');
const modalCancelBtn = document.getElementById('modal-cancel');
const modalClose = document.querySelector('.modal-close');

// -----------------------------
// Game state variables
// -----------------------------
let playerName = '';
let roomCode = '';
let isHost = false;
let roomType = ''; // 'couple' or 'friend'
let maxPlayers = 2; // depends on roomType
let playersList = {}; // mirror of rooms/{roomCode}/players
let roomHost = null; // host stored at room root (rooms/{roomCode}.host)
let currentQuestionIndex = 0;
let questions = []; // the 5 questions chosen for the room
let answersLocal = {}; // answersLocal[qIndex] = chosenOptionIndex (for current player)
let finished = false;
let roomListenerRef = null;
let leaderboardListenerRef = null;

// -----------------------------
// Utility helpers
// -----------------------------
function log(...args) {
    console.log('[Game]', ...args);
}

function showSection(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    if (section) section.classList.add('active');
}

function showModal(title, htmlContent, showFooter = true) {
    if (!modalTitle || !modalContent || !modalOverlay) return;
    modalTitle.textContent = title;
    modalContent.innerHTML = htmlContent;
    const modalFooter = document.querySelector('.modal-footer');
    if (modalFooter) modalFooter.style.display = showFooter ? 'flex' : 'none';
    modalOverlay.style.display = 'flex';
}

function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.style.display = 'none';
    if (modalConfirmBtn) modalConfirmBtn.onclick = null;
    if (modalCancelBtn) modalCancelBtn.onclick = null;
    if (modalClose) modalClose.onclick = null;
}

window.copyRoomCode = function (code) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(code).then(() => {
        log('Room code copied to clipboard:', code);
    }).catch(e => console.error('Clipboard error: ', e));
};

function showRulesModal() {
    const htmlContent = `
    <p>1️⃣ Enter your name to start.</p>
    <p>2️⃣ Choose a game mode — Couple or Friend.</p>
    <p>3️⃣ Create or join a room.</p>
    <p>4️⃣ Answer the same 5 random questions as your friend or partner.</p>
    <p>5️⃣ Matching answers earn points — highest score wins!</p>
  `;
    showModal('How to Play', htmlContent, false);
}

// Close modal handler
if (modalClose) modalClose.addEventListener('click', closeModal);
if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);

// -----------------------------
// Start / Init
// -----------------------------
function init() {
    if (nameBtn) nameBtn.addEventListener('click', onNameSubmit);
    if (createRoomBtn) createRoomBtn.addEventListener('click', onCreateRoomClick);
    if (joinRoomBtn) joinRoomBtn.addEventListener('click', onJoinRoomClick);
    if (playAgainBtn) playAgainBtn.addEventListener('click', restartGame);

    optionBtns.forEach((btn, idx) => {
        btn.addEventListener('click', () => onOptionSelected(idx));
    });

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);

    // Prevent redirect logic on auth.html
    if (window.location.pathname.endsWith('auth.html')) return;

    const leaderboardNavBtn = document.getElementById('leaderboard-nav-btn');
    console.log('[App] leaderboardNavBtn:', leaderboardNavBtn);
    if (leaderboardNavBtn) leaderboardNavBtn.addEventListener('click', async () => {
        console.log('[App] Leaderboard clicked - checking Clerk login');
        if (window.Clerk) {
            await window.Clerk.load();
            const user = window.Clerk.user;
            if (!user || !user.id) {
                console.log('[App] User not logged in - redirecting to login page');
                window.location.href = 'auth.html';
                return;
            }
            console.log('[App] User logged in - showing leaderboard');
            showGlobalLeaderboard();
        } else {
            console.error('[App] Clerk not loaded - redirecting to login page');
            window.location.href = 'auth.html';
        }
    });

    const rulesBtn = document.getElementById('rules-btn');
    console.log('[App] rulesBtn:', rulesBtn);
    if (rulesBtn) rulesBtn.addEventListener('click', () => { console.log('[App] Rules clicked'); showRulesModal(); });

    const homeBtn = document.getElementById('home-btn');
    console.log('[App] homeBtn:', homeBtn);
    if (homeBtn) homeBtn.addEventListener('click', () => { console.log('[App] Home clicked'); window.location.href = 'index.html'; });
    // Show leaderboard section if hash is #leaderboard
    if (window.location.hash === '#leaderboard') {
        showGlobalLeaderboard();
    } else {
        showSection(nameSection);
    }
    log('Init complete');
}

function onNameSubmit() {
    const name = playerNameInput ? playerNameInput.value.trim() : '';
    if (!name) {
        showModal('Error', '<p>Please enter your name!</p>', false);
        if (modalConfirmBtn) {
            modalConfirmBtn.textContent = 'OK';
            modalConfirmBtn.onclick = closeModal;
        }
        // Do not use return at top level. You may use an if block or redirect only.
    }
    playerName = name;
    showSection(roomSection);
}

async function loadClerkUser() {
    // Wait for Clerk to finish loading
    await window.Clerk.load();

    // Get current user object
    const user = window.Clerk.user;

    // Extract email
    let email = "anonymous";
    if (user?.primaryEmailAddress?.emailAddress) {
        email = user.primaryEmailAddress.emailAddress;
        console.log('User email from primaryEmailAddress:', email);

    }

    return { user, email };
}

async function checkIfEmailPlayed(email) {
    const coupleRef = ref(db, 'leaderboard/couple');
    const friendRef = ref(db, 'leaderboard/friend');

    const coupleSnap = await get(coupleRef);
    const friendSnap = await get(friendRef);

    const inCouple = coupleSnap.exists()
        && Object.values(coupleSnap.val()).some(item => item.email === email);

    const inFriend = friendSnap.exists()
        && Object.values(friendSnap.val()).some(item => item.email === email);

    return inCouple || inFriend;
}

// -----------------------------
// CREATE ROOM flow
// -----------------------------
async function onCreateRoomClick() {


    const playedOnce = localStorage.getItem("playedOnce");

    // If user has played once, check email
    if (playedOnce === "yes") {
        const { email } = await loadClerkUser();

        const exists = await checkIfEmailPlayed(email);

        if (exists) {
            showModal('Not Allowed', `<p>You already played.</p>`, false);
            return;
        }

        // Email NOT found → ALLOW

        // Continue normally...

    }
    // Ensure we have a player name; if not, prompt for one (landing page may skip name input)
    if (!playerName || playerName.trim() === '') {
        const entered = prompt('Enter your name to create the room:');
        if (!entered || !entered.trim()) {
            showModal('Error', '<p>Please enter your name to create a room.</p>', false);
            if (modalConfirmBtn) { modalConfirmBtn.textContent = 'OK'; modalConfirmBtn.onclick = closeModal; }
            return;
        }
        playerName = entered.trim();
    }

    roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    isHost = true;

    const html = `
        <div style="display:flex; gap:12px; justify-content:center; align-items:center;">
          <button id="modal-couple" class="modal-btn modal-btn-primary" style="padding:12px 18px;">❤️ Couple (2 players)</button>
          <button id="modal-friend" class="modal-btn modal-btn-primary" style="padding:12px 18px;">💚 Friends (many players)</button>
        </div>
      `;
    showModal('Choose Room Type', html, false);

    // attach handlers (delegate after modal content inserted)
    setTimeout(() => {
        const coupleBtn = document.getElementById('modal-couple');
        const friendBtn = document.getElementById('modal-friend');
        if (coupleBtn) coupleBtn.onclick = () => { closeModal(); setupRoom('couple', 2); };
        if (friendBtn) friendBtn.onclick = () => { closeModal(); setupRoom('friend', 10); };
    }, 50);
}

async function setupRoom(type, maxP) {
    roomType = type;
    maxPlayers = maxP;

    const initialRoom = {
        host: playerName,
        roomType: type,
        maxPlayers: maxP,
        gameStarted: false,
        timestamp: new Date().toISOString(),
        players: {
            [playerName]: {
                joinedAt: new Date().toISOString(),
                finished: false,
                score: 0
            }
        }
    };

    try {
        await set(ref(db, `rooms/${roomCode}`), initialRoom);
        log(`Room ${roomCode} created as host ${playerName} (type=${type}, maxPlayers=${maxP})`);
    } catch (err) {
        console.error('Error creating room in DB: ', err);
        showModal('Error', `<p>Unable to create room: ${err.message}</p>`, false);
        if (modalConfirmBtn) { modalConfirmBtn.textContent = 'OK'; modalConfirmBtn.onclick = closeModal; }
        // Removed illegal top-level return statement
    }

    try {
        questions = await fetchFiveRandomQuestions(type);
        await set(ref(db, `rooms/${roomCode}/questions`), questionsToRoomFormat(questions));
    } catch (err) {
        console.error('Error fetching questions: ', err);
        showModal('Error', `<p>Unable to load questions from Firebase: ${err}</p>`, false);
        if (modalConfirmBtn) { modalConfirmBtn.textContent = 'OK'; modalConfirmBtn.onclick = closeModal; }
        return;
    }

    if (progressSection) {
        showSection(progressSection);
        progressText.innerHTML = `
        <div class="room-code-display">
          <div class="room-code-label">Room Code:</div>
          <div class="room-code-value">${roomCode}</div>
          <div class="room-code-copy" onclick="navigator.clipboard.writeText('${roomCode}')">📋 Copy Code</div>
        </div>
        <div class="waiting-message">Room created. Share this code with friends to join!</div>
      `;
    }

    if (roomStatus) roomStatus.textContent = `Room created. Waiting for players...`;

    attachRoomListener();
}

function questionsToRoomFormat(questionsArray) {
    const obj = {};
    questionsArray.forEach((q, i) => {
        obj[i] = {
            id: q.id !== undefined ? q.id : i + 1,
            question: q.question || q.baseQuestion || q.text || `Question ${i + 1}`,
            options: q.options || q.choices || q.optionsArray || []
        };
    });
    return obj;
}

// -----------------------------
// JOIN ROOM flow
// -----------------------------
async function onJoinRoomClick() {

    const playedOnce = localStorage.getItem("playedOnce");

    if (playedOnce === "yes") {
        const { email } = await loadClerkUser();

        const exists = await checkIfEmailPlayed(email);

        if (exists) {
            showModal('Not Allowed', `<p>You already played.</p>`, false);
            return;
        }

        // Email NOT found → ALLOW

        // Continue your original join logic...
    }

    const code = (roomCodeInput ? roomCodeInput.value : '').toString().trim().toUpperCase();
    if (!code) {
        showModal('Error', '<p>Please enter a room code!</p>', false);
        if (modalConfirmBtn) { modalConfirmBtn.textContent = 'OK'; modalConfirmBtn.onclick = closeModal; }
        return;
    }
    roomCode = code;
    isHost = false;

    get(ref(db, `rooms/${roomCode}`)).then(snap => {
        if (!snap.exists()) {
            showModal('Error', `<p>Room not found: <strong>${roomCode}</strong></p>`, false);
            if (modalConfirmBtn) { modalConfirmBtn.textContent = 'OK'; modalConfirmBtn.onclick = closeModal; }
            return;
        }
        const roomData = snap.val();
        const curPlayers = roomData.players ? Object.keys(roomData.players).length : 0;
        const allowed = roomData.maxPlayers || 2;
        if (curPlayers >= allowed) {
            showModal('Room Full', `<p>Room ${roomCode} is already full.</p>`, false);
            if (modalConfirmBtn) { modalConfirmBtn.textContent = 'OK'; modalConfirmBtn.onclick = closeModal; }
            return;
        }

        update(ref(db, `rooms/${roomCode}/players/${playerName}`), {
            joinedAt: new Date().toISOString(),
            finished: false,
            score: 0
        }).then(() => {
            log(`Joined room ${roomCode} as ${playerName}`);
            if (progressSection) {
                showSection(progressSection);
                progressText.textContent = 'Joined room. Waiting for game to start...';
            }
            attachRoomListener();
        }).catch(err => {
            console.error('Error joining room: ', err);
            showModal('Error', `<p>Unable to join room: ${err.message}</p>`, false);
            if (modalConfirmBtn) { modalConfirmBtn.textContent = 'OK'; modalConfirmBtn.onclick = closeModal; }
        });
    }).catch(err => {
        console.error('Error reading room: ', err);
        showModal('Error', `<p>Unable to read room info: ${err.message}</p>`, false);
        if (modalConfirmBtn) { modalConfirmBtn.textContent = 'OK'; modalConfirmBtn.onclick = closeModal; }
    });
}

// -----------------------------
// Attach a real-time listener for the current room
// -----------------------------
function attachRoomListener() {
    if (!roomCode) return;

    if (roomListenerRef) {
        try { off(roomListenerRef); } catch (e) { /* ignore */ }
        roomListenerRef = null;
    }

    roomListenerRef = ref(db, `rooms/${roomCode}`);
    onValue(roomListenerRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            log('Room deleted or not found');
            return;
        }
        playersList = data.players || {};
        roomHost = data.host || null;
        updateRoomStatusUI();

        if (isHost && !data.gameStarted) {
            const count = Object.keys(playersList).length;
            const startBtn = document.getElementById('start-btn');

            if (data.roomType === 'couple' && count >= 2) {
                set(ref(db, `rooms/${roomCode}/gameStarted`), true).catch(err => console.error(err));
            } else if (data.roomType === 'friend') {
                if (count >= 2 && startBtn) {
                    startBtn.style.display = 'block';
                    startBtn.onclick = () => {
                        set(ref(db, `rooms/${roomCode}/gameStarted`), true).then(() => {
                            if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Starting...'; }
                        }).catch(err => console.error(err));
                    };
                } else if (startBtn) {
                    startBtn.style.display = 'none';
                }
            }
        } else {
            const startBtn = document.getElementById('start-btn');
            if (startBtn) startBtn.style.display = 'none';
        }

        if (data.gameStarted && !gameStartedLocal()) {
            const qObj = data.questions || {};
            questions = Object.values(qObj);
            if (!questions || questions.length === 0) {
                fetchFiveRandomQuestions(data.roomType || roomType).then(qs => {
                    questions = qs;
                    startLocalGame();
                }).catch(err => {
                    console.error('Unable to get questions for room game start: ', err);
                    showModal('Error', `<p>Unable to load questions for this room. ${err}</p>`, false);
                    if (modalConfirmBtn) { modalConfirmBtn.textContent = 'OK'; modalConfirmBtn.onclick = closeModal; }
                });
            } else {
                startLocalGame();
            }
        }

        if (data.players) {
            const allFinished = Object.values(data.players).every(p => p && p.finished === true);
            if (allFinished && (data.questions || (questions && questions.length > 0))) {
                computeAndShowResultsOnce();
            }
        }
    });
}

function updateRoomStatusUI() {
    const names = Object.keys(playersList || {});
    const namesText = names.length ? names.join(', ') : 'No players';
    if (roomStatus) roomStatus.textContent = `Players in room: ${namesText}`;
}

let _gameStartedLocal = false;
function gameStartedLocal() { return _gameStartedLocal; }
function startLocalGame() {
    _gameStartedLocal = true;
    currentQuestionIndex = 0;
    finished = false;
    answersLocal = {};
    showSection(quizSection);
    renderCurrentQuestion();
    animateProgress(0);
    log('Local game started for player', playerName);
}

// -----------------------------
// Fetch 5 random unique questions from DB for a question type
// -----------------------------
async function fetchFiveRandomQuestions(type) {
    if (!type) throw new Error('Question type is required (couple or friend)');
    const qRef = ref(db, `questions/${type}`);
    const snap = await get(qRef);
    if (!snap.exists()) throw new Error(`No questions found in DB at questions/${type}`);
    const raw = snap.val();
    const allQuestions = Object.values(raw).map(q => ({
        id: q.id !== undefined ? q.id : (Math.random()),
        question: (q.question || q.baseQuestion || q.text || '').toString(),
        options: Array.isArray(q.options) ? q.options.slice() : (q.options ? Object.values(q.options) : [])
    }));
    const shuffled = shuffleArray(allQuestions);
    const selected = shuffled.slice(0, Math.min(5, shuffled.length));
    log(`Selected ${selected.length} questions for type ${type}`);
    return selected;
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// -----------------------------
// Quiz rendering & answer flow
// -----------------------------
function renderCurrentQuestion() {
    const q = questions[currentQuestionIndex];
    if (!q) { log('No question at index', currentQuestionIndex); return; }
    const displayName = (opponentNameFromRoom() || 'your friend');
    let qText = q.question || q.baseQuestion || '';
    try { qText = qText.replace('{friendName}', displayName); } catch (e) { }
    if (questionText) questionText.textContent = qText;

    const opts = q.options || [];
    optionBtns.forEach((btn, idx) => {
        const optText = opts[idx] !== undefined ? opts[idx] : '';
        btn.innerHTML = optText;
        btn.disabled = false;
        btn.classList.remove('selected');
    });

    if (questionCounter) questionCounter.innerHTML = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
    const percent = Math.round((currentQuestionIndex / questions.length) * 100);
    animateProgress(percent);
}

function opponentNameFromRoom() {
    // Prefer the named host if not self, otherwise pick first player that's not self
    if (roomHost && roomHost !== playerName) return roomHost;
    const names = Object.keys(playersList || {});
    for (const n of names) if (n !== playerName) return n;
    return null;
}

async function onOptionSelected(optionIndex) {
    if (!questions || !questions[currentQuestionIndex]) { console.warn('No question to answer right now'); return; }
    if (finished) { console.warn('Player already finished'); return; }

    answersLocal[currentQuestionIndex] = optionIndex;
    optionBtns.forEach(b => b.disabled = true);
    if (optionBtns[optionIndex]) optionBtns[optionIndex].classList.add('selected');

    try {
        await set(ref(db, `rooms/${roomCode}/players/${playerName}/answers/${currentQuestionIndex}`), optionIndex);
        log('Stored answer for question', currentQuestionIndex, 'optionIndex', optionIndex);
    } catch (err) {
        console.error('Error saving answer to DB', err);
    }

    setTimeout(async () => {
        currentQuestionIndex++;
        if (currentQuestionIndex < questions.length) {
            renderCurrentQuestion();
        } else {
            finished = true;
            await set(ref(db, `rooms/${roomCode}/players/${playerName}/finished`), true).catch(e => console.error(e));
            showWaitingScreen('Waiting for other players to finish...');
        }
    }, 600);
}

function showWaitingScreen(message = 'Waiting for other players...') {
    if (progressText) {
        progressText.innerHTML = `
        <div class="waiting-container">
          <div class="waiting-spinner"></div>
          <div class="waiting-message">${message}</div>
        </div>
      `;
    }
    animateProgress(100);
    showSection(progressSection);
}

// -----------------------------
// Compute GROUP-WIDE results (Option 1: Pure Average)
// -----------------------------
let _resultsComputed = false;
async function computeAndShowResultsOnce() {
    if (_resultsComputed) return;
    localStorage.setItem("playedOnce", "yes");
    _resultsComputed = true;

    const snap = await get(ref(db, `rooms/${roomCode}`));
    if (!snap.exists()) { console.error('Room data missing'); return; }
    const roomData = snap.val();
    const players = roomData.players || {};
    const playerNames = Object.keys(players);
    const totalPlayers = playerNames.length;

    const questionCount = Object.keys(roomData.questions || {}).length || questions.length || 5;

    // Build answers matrix
    const answersMatrix = {};
    playerNames.forEach(name => {
        answersMatrix[name] = {};
        const ansObj = players[name].answers || {};
        for (let i = 0; i < questionCount; i++) {
            const val = ansObj[i] !== undefined ? Number(ansObj[i]) : null;
            answersMatrix[name][i] = val;
        }
    });

    // GROUP-WIDE calculation
    let questionScores = [];
    let matchedQuestions = 0;

    for (let qIndex = 0; qIndex < questionCount; qIndex++) {
        const optionMap = {};
        playerNames.forEach(name => {
            const ans = answersMatrix[name][qIndex];
            if (ans !== null) {
                if (!optionMap[ans]) optionMap[ans] = [];
                optionMap[ans].push(name);
            }
        });

        const groups = Object.values(optionMap);
        if (groups.length === 0) {
            questionScores.push(0);
            continue;
        }

        const largestGroupSize = Math.max(...groups.map(g => g.length));

        if (largestGroupSize >= 2) matchedQuestions++;

        const score = (largestGroupSize / totalPlayers) * 100;
        questionScores.push(score);
    }

    const globalPercent = Math.round(
        questionScores.reduce((a, b) => a + b, 0) / questionScores.length
    );

    // Save same score for all players
    const updates = {};
    playerNames.forEach(name => updates[`players/${name}/score`] = globalPercent);
    await update(ref(db, `rooms/${roomCode}`), updates);

    if (isHost) {
        const { email } = await loadClerkUser();
        const leaderboardPath = roomType === 'couple' ? 'leaderboard/couple' : 'leaderboard/friend';
        await push(ref(db, leaderboardPath), {
            score: globalPercent,
            matchedQuestions,
            totalQuestions: questionCount,
            roomPlayers: playerNames,
            roomCode,
            timestamp: new Date().toISOString(),
            email: email
        });
    }

    // Build DETAILED breakdown (B)
    let html = '';
    html += `<div class="results-header">
                <div class="compatibility-score">
                    <div class="score-number">${globalPercent}%</div>
                    <div class="score-label">Group Compatibility Score</div>
                </div>
                
             </div>`;

    // Question breakdown
    html += '<div class="answer-details">';
    for (let i = 0; i < questionCount; i++) {
        const qObj = roomData.questions[i];
        const qText = qObj.question;

        // Identify majority option
        const optionCount = {};
        playerNames.forEach(name => {
            const ans = answersMatrix[name][i];
            if (ans !== null) {
                optionCount[ans] = (optionCount[ans] || 0) + 1;
            }
        });
        const majorityOption = Number(Object.entries(optionCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);

        html += `<div class="answer-item">
                    <div class="question-number">Q${i + 1}</div>
                    <div class="question-text">${escapeHtml(qText)}</div>
                    <div class="choices">`;

        playerNames.forEach(name => {
            const idx = answersMatrix[name][i];
            const choiceText = qObj.options[idx] ?? 'No answer';
            const isMajor = idx === majorityOption;

            html += `<div class="${isMajor ? 'matched-choice' : ''}">
                        <span class="choice-label">${escapeHtml(name)}:</span>
                        <span class="choice-text">${escapeHtml(choiceText)}</span>
                     </div>`;
        });

        html += `</div></div>`;
    }
    html += '</div>';

    html += `<div class="results-actions">
                <button id="view-leaderboard-btn" class="action-btn">View Leaderboard</button>
                
             </div>`;

    scoreText.innerHTML = html;

    document.getElementById('view-leaderboard-btn').onclick = async () => {
        // Clerk auth check before showing leaderboard
        if (window.Clerk && window.Clerk.load) {
            await window.Clerk.load();
            const user = window.Clerk.user;
            if (!user || !user.id) {
                window.location.href = 'auth.html';
                return;
            }
            showGlobalLeaderboard();
        } else {
            window.location.href = 'auth.html';
        }
    };

    showSection(resultsSection);
    determineAndTriggerConfetti(globalPercent);
}

function optionGroupIndicesForQuestion(answersMatrix, qIndex, idx) {
    const groups = {};
    for (const [player, answers] of Object.entries(answersMatrix || {})) {
        const v = answers[qIndex];
        if (v === idx) {
            if (!groups[idx]) groups[idx] = [];
            groups[idx].push(player);
        }
    }
    return groups;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

// -----------------------------
// Confetti logic
// -----------------------------
async function determineAndTriggerConfetti(score) {
    try {
        const leaderboardPath = roomType === 'couple' ? 'leaderboard/couple' : 'leaderboard/friend';
        const snap = await get(ref(db, leaderboardPath));
        if (!snap.exists()) { triggerConfetti(); return; }
        const entries = Object.values(snap.val());
        const maxScore = entries.reduce((max, e) => Math.max(max, Number(e.score || 0)), 0);
        if (score > maxScore) triggerConfetti();
    } catch (err) { console.error('Error determining top score: ', err); }
}

function triggerConfetti() {
    try {
        if (typeof confetti === 'function') {
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        }
    } catch (e) { console.warn('Confetti not available or error', e); }
}

// -----------------------------
// Leaderboard UI
// -----------------------------
function showGlobalLeaderboard() {
    // Check Clerk login before showing leaderboard
    if (window.Clerk) {
        if (!window.Clerk.user || !window.Clerk.user.id) {
            window.location.href = 'auth.html';
            return;
        }
    }
    if (leaderboardListenerRef) {
        if (leaderboardListenerRef.coupleRef) try { off(leaderboardListenerRef.coupleRef); } catch (e) { }
        if (leaderboardListenerRef.friendRef) try { off(leaderboardListenerRef.friendRef); } catch (e) { }
        leaderboardListenerRef = null;
    }

    const coupleRef = ref(db, 'leaderboard/couple');
    const friendRef = ref(db, 'leaderboard/friend');

    // avoid duplicate button containers
    const existing = document.querySelector('.leaderboard-buttons');
    if (existing) existing.remove();

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'leaderboard-buttons';

    const coupleBtn = document.createElement('button');
    coupleBtn.textContent = '❤️ Couple Leaderboard';
    coupleBtn.className = 'leaderboard-btn active';

    const friendBtn = document.createElement('button');
    friendBtn.textContent = '💚 Friend Leaderboard';
    friendBtn.className = 'leaderboard-btn';

    buttonContainer.appendChild(coupleBtn);
    buttonContainer.appendChild(friendBtn);

    if (leaderboardSection && leaderboardList) leaderboardSection.insertBefore(buttonContainer, leaderboardList);

    let coupleData = null; let friendData = null; let currentType = 'couple';
    const render = () => renderLeaderboard(currentType, currentType === 'couple' ? coupleData : friendData);

    coupleBtn.onclick = () => { coupleBtn.classList.add('active'); friendBtn.classList.remove('active'); currentType = 'couple'; render(); };
    friendBtn.onclick = () => { friendBtn.classList.add('active'); coupleBtn.classList.remove('active'); currentType = 'friend'; render(); };

    const onCouple = (snapshot) => { coupleData = snapshot.val(); if (currentType === 'couple') render(); };
    const onFriend = (snapshot) => { friendData = snapshot.val(); if (currentType === 'friend') render(); };

    onValue(coupleRef, onCouple);
    onValue(friendRef, onFriend);

    render();
    showSection(leaderboardSection);
    leaderboardListenerRef = { coupleRef, friendRef };
}

function renderLeaderboard(type, data) {
    const arr = data ? Object.values(data) : [];
    arr.sort((a, b) => {
        const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        const tb = new Date(b.timestamp || 0).getTime();
        const ta = new Date(a.timestamp || 0).getTime();
        return tb - ta;
    });

    if (!leaderboardList) return;
    leaderboardList.innerHTML = '';

    if (arr.length === 0) {
        const li = document.createElement('li');
        li.textContent = `No scores yet in ${type} leaderboard! Be the first to play!`;
        li.style.textAlign = 'center'; li.style.color = '#666';
        leaderboardList.appendChild(li);
    } else {
        const header = document.createElement('li');
        header.classList.add('leaderboard-header');
        header.textContent = type === 'couple' ? '❤️ Couple Leaderboard' : '💚 Friend Leaderboard';
        leaderboardList.appendChild(header);

        arr.forEach((entry, idx) => {
            const li = document.createElement('li');
            li.classList.add('leaderboard-entry');
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎮';
            const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
            const roomPlayersText = entry.roomPlayers && Array.isArray(entry.roomPlayers) ? entry.roomPlayers.map(p => escapeHtml(p)).join(', ') : escapeHtml(entry.name);
            li.innerHTML = `
      <span class="rank">${medal} ${idx + 1}.</span>
      <div class="score-details">
        <div class="players">${roomPlayersText}</div>
        <div class="score-time">
          <span class="score">${escapeHtml(String(entry.score))}%</span>
          <span class="time"> ${escapeHtml(timestamp)}</span>
        </div>
      </div>
    `;
            leaderboardList.appendChild(li);
        });
    }
}

function gameInProgress() { return _gameStartedLocal || Object.values(playersList || {}).some(p => p && p.finished === false); }
function animateProgress(percent) { if (progressFill) progressFill.style.width = `${percent}%`; }

// -----------------------------
// Restart / cleanup (return to name screen)
// -----------------------------
async function restartGame() {
    try {
        if (roomListenerRef) { off(roomListenerRef); roomListenerRef = null; }
        if (leaderboardListenerRef) {
            if (leaderboardListenerRef.coupleRef) off(leaderboardListenerRef.coupleRef);
            if (leaderboardListenerRef.friendRef) off(leaderboardListenerRef.friendRef);
            leaderboardListenerRef = null;
        }
    } catch (e) { console.warn('Error detaching listeners:', e); }

    if (isHost && roomCode) {
        try { await remove(ref(db, `rooms/${roomCode}`)); } catch (err) { console.warn('Error removing room (host cleanup):', err); }
    } else if (!isHost && roomCode) {
        try { await remove(ref(db, `rooms/${roomCode}/players/${playerName}`)); } catch (err) { console.warn('Error removing player from room on restart: ', err); }
    }

    playerName = ''; roomCode = ''; isHost = false; roomType = ''; playersList = {}; roomHost = null;
    currentQuestionIndex = 0; questions = []; answersLocal = {}; finished = false; _gameStartedLocal = false; _resultsComputed = false;

    if (playerNameInput) playerNameInput.value = '';
    if (roomCodeInput) roomCodeInput.value = '';
    if (roomStatus) roomStatus.textContent = '';
    if (progressText) progressText.textContent = 'Loading...';
    animateProgress(0);
    showSection(nameSection);
}

// Polyfill for Object.values (if needed)
if (!Object.values) {
    Object.values = function (obj) { if (obj === null || obj === undefined) return []; return Object.keys(obj).map(k => obj[k]); };
}

console.log('Script loaded, adding DOMContentLoaded listener');
document.addEventListener('DOMContentLoaded', () => { console.log('DOMContentLoaded fired, calling init'); init(); });

