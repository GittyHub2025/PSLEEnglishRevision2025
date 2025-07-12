// --------------------
// script.js
// --------------------


// --- Configuration ---
const QUESTIONS_PER_SET = 15;
const AUTO_PROCEED_DELAY = 1800;
const USER_NAME_STORAGE_KEY = 'psleEnglishApp_v1_index';


// --- State Variables ---
let allFlashcardSets = {};
let userHistoricalResults = {}; 
let currentSetData = [];
let currentQuestionIndex = 0;
let score = 0;
let incorrectAnswers = [];
let startTime;
let endTime;
let isRedoing = false;
let proceedTimeoutId = null;
let isWaitingToProceed = false;
let userName = localStorage.getItem(USER_NAME_STORAGE_KEY) || '';


// --- Sound Synthesis & Confetti ---
const correctSound = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.2 }, }).toDestination();
const incorrectSound = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.2 } }).toDestination();
const confettiCanvas = document.getElementById('confettiCanvas');
const myConfetti = confetti.create(confettiCanvas, { resize: true, useWorker: true });


// --- DOM Elements ---
const nameModal = document.getElementById('nameModal');
const userNameInput = document.getElementById('userNameInput');
const mainIndexScreen = document.getElementById('mainIndexScreen');
const mainIndexContainer = document.getElementById('mainIndexContainer');
const welcomeName = document.getElementById('welcomeName');
const flashcardScreen = document.getElementById('flashcardScreen');
const resultsScreen = document.getElementById('resultsScreen');
const progressText = document.getElementById('progressText');
const progressBarFill = document.getElementById('progressBarFill');
const flashcard = document.getElementById('flashcard');
const questionText = document.getElementById('questionText');
const feedbackText = document.getElementById('feedbackText');
const feedbackIconContainer = document.getElementById('feedbackIconContainer');
const continueText = document.getElementById('continueText');
const choiceButtons = [ document.getElementById('choice1'), document.getElementById('choice2'), document.getElementById('choice3'), document.getElementById('choice4') ];
const scoreDisplayEl = document.getElementById('scoreDisplay');
const percentageEl = document.getElementById('percentage');
const timeTakenEl = document.getElementById('timeTaken');
const incorrectListContainer = document.getElementById('incorrectListContainer');
const incorrectList = document.getElementById('incorrectList');
const noIncorrectText = document.getElementById('noIncorrectText');
const redoIncorrectButton = document.getElementById('redoIncorrectButton');
const encouragementTextEl = document.getElementById('encouragementText');
const resultsHeadingEl = document.getElementById('resultsHeading');
const raceTrackContainer = document.querySelector('#resultsScreen .race-track-container');
const raceTrackFillEl = document.getElementById('raceTrackFill');
const rocketEl = document.getElementById('rocketEl');


// --- Event Listeners ---
flashcard.addEventListener('click', () => {
    if (isWaitingToProceed && !flashcard.classList.contains('incorrect-state')) {
        proceedToNext();
    }
});
userNameInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        saveUserName();
    }
});


// --- Utility Functions ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}


// --- Core Application Logic ---
function saveUserName() {
    const name = userNameInput.value.trim();
    userName = name ? name : 'Student';
    localStorage.setItem(USER_NAME_STORAGE_KEY, userName);
    nameModal.style.display = 'none';
    loadInitialData();
}


function renderMainIndex() {
    mainIndexContainer.innerHTML = '';
    welcomeName.textContent = userName;
    Object.keys(allFlashcardSets).forEach(setName => {
        const set = allFlashcardSets[setName];
        if (set.length === 0) return;
        const card = document.createElement('div');
        card.className = 'index-card';
        const result = userHistoricalResults[setName];
        let statusHTML = '';
        let buttonText = 'Start';
        let buttonClass = 'bg-blue-500 hover:bg-blue-600 text-white';
        if (result) {
            statusHTML = `<span class="score-badge completed">Done: ${result.score}/${result.total}</span>`;
            buttonText = 'Redo';
            buttonClass = 'bg-orange-500 hover:bg-orange-600 text-white';
        }
        card.innerHTML = `<div class="flex-grow pr-4"><h3 class="font-semibold text-lg text-slate-800">${setName}</h3>${statusHTML}</div><button class="py-2 px-5 text-md ${buttonClass}">${buttonText}</button>`;
        card.querySelector('button').onclick = () => startFlashcardSession(set, setName);
        mainIndexContainer.appendChild(card);
    });
}


function startFlashcardSession(selectedSet, setName) {
    Tone.start().catch(e => console.warn("Audio context could not start:", e));
    let fullSetCopy = [...selectedSet];
    if (fullSetCopy.length < QUESTIONS_PER_SET) {
        alert(`Error: The set "${setName}" only has ${fullSetCopy.length} questions, but ${QUESTIONS_PER_SET} are required. Please add more questions to the Google Sheet.`);
        return;
    }
    shuffleArray(fullSetCopy);
    currentSetData = fullSetCopy.slice(0, QUESTIONS_PER_SET);
    currentSetData.setName = setName;
    currentQuestionIndex = 0;
    score = 0;
    incorrectAnswers = [];
    isRedoing = false;
    mainIndexScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    flashcardScreen.classList.remove('hidden');
    updateProgress();
    startTime = new Date();
    displayQuestion();
}


function resetCardState() {
    if (proceedTimeoutId) { clearTimeout(proceedTimeoutId); } isWaitingToProceed = false;
    flashcard.classList.remove('shake', 'correct-state-static', 'incorrect-state', 'clickable-card');
    questionText.classList.remove('hidden'); feedbackText.innerHTML = '';
    feedbackIconContainer.classList.add('hidden'); continueText.classList.add('hidden');
    choiceButtons.forEach(btn => { btn.className = 'choice-button bg-slate-100 hover:bg-slate-200 text-slate-700'; });
}


function displayQuestion() {
    resetCardState();
    if (currentQuestionIndex >= currentSetData.length) { showResults(); return; }
    const questionData = currentSetData[currentQuestionIndex];
    questionText.innerHTML = questionData.question.replace(/\n/g, '<br>');
    let displayOptions = [...questionData.options]; shuffleArray(displayOptions);
    choiceButtons.forEach((button, index) => {
        if (displayOptions[index] !== undefined) {
            button.innerHTML = displayOptions[index]; button.disabled = false;
            button.dataset.answer = displayOptions[index]; button.onclick = () => checkAnswer(button);
            button.style.display = 'flex';
        } else { button.style.display = 'none'; }
    });
}


function updateProgress() {
    const totalQuestions = currentSetData.length; const completed = currentQuestionIndex;
    const progressPercentage = totalQuestions > 0 ? (completed / totalQuestions) * 100 : 0;
    progressText.textContent = `${completed} / ${totalQuestions}`;
    progressBarFill.style.width = `${progressPercentage}%`;
}


function checkAnswer(button) {
    Tone.start().catch(e => console.warn("Audio context failed:", e));
    if (isWaitingToProceed && !flashcard.classList.contains('incorrect-state')) return;
    const selectedAnswer = button.dataset.answer; const questionData = currentSetData[currentQuestionIndex];
    const correctAnswer = questionData.correctAnswer; choiceButtons.forEach(btn => btn.disabled = true);
    if (selectedAnswer === correctAnswer) {
        if (!isRedoing) score++; flashcard.classList.add('correct-state-static');
        feedbackIconContainer.innerHTML = '<span class="text-7xl md:text-8xl">✓</span>';
        feedbackIconContainer.classList.remove('hidden'); questionText.classList.add('hidden');
        feedbackText.textContent = 'Correct!'; myConfetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        correctSound.triggerAttackRelease("G5", "8n", Tone.now());
        button.className = 'choice-button bg-emerald-600 text-white ring-2 ring-emerald-800 shadow-md';
        isWaitingToProceed = true; flashcard.classList.add('clickable-card'); continueText.classList.remove('hidden');
        proceedTimeoutId = setTimeout(proceedToNext, AUTO_PROCEED_DELAY);
        currentQuestionIndex++; updateProgress();
    } else {
        flashcard.classList.add('shake', 'incorrect-state');
        feedbackIconContainer.innerHTML = '<span class="text-7xl md:text-8xl">✗</span>';
        feedbackIconContainer.classList.remove('hidden');
        questionText.classList.add('hidden');
        const explanation = questionData.explanation || "No explanation provided.";
        feedbackText.innerHTML = `<div class="explanation-container"><b>Explanation:</b> ${explanation}</div><div class="prompt-guidance">Click the correct answer to continue.</div>`;
        incorrectSound.triggerAttackRelease("C3", "8n");
        if (!isRedoing) { incorrectAnswers.push({ questionData: questionData, userAnswer: selectedAnswer }); }
        isWaitingToProceed = false; flashcard.classList.remove('clickable-card');
        if (proceedTimeoutId) { clearTimeout(proceedTimeoutId); }
        choiceButtons.forEach(btn => {
            if (btn.dataset.answer === correctAnswer) {
                btn.className = 'choice-button bg-emerald-500 hover:bg-emerald-600 text-white'; btn.disabled = false;
                btn.onclick = function() { currentQuestionIndex++; updateProgress(); proceedToNext(); };
            } else if (btn === button) {
                btn.className = 'choice-button bg-red-700 text-white ring-2 ring-red-900 shadow-md';
            } else { btn.className = 'choice-button bg-slate-200 text-slate-500 forced-disabled-look'; }
        });
    }
}


function proceedToNext() {
    if (proceedTimeoutId) { clearTimeout(proceedTimeoutId); } isWaitingToProceed = false; displayQuestion();
}


function showResults() {
    endTime = new Date(); const timeDiff = Math.round((endTime - startTime) / 1000);
    const totalQuestions = currentSetData.length; const currentScore = isRedoing ? (totalQuestions - incorrectAnswers.length) : score;
    const percentage = totalQuestions > 0 ? Math.round((currentScore / totalQuestions) * 100) : 0;
    resultsHeadingEl.textContent = isRedoing ? 'Mistakes Review Complete!' : `Set "${currentSetData.setName || 'Practice'}" Complete!`;
    scoreDisplayEl.textContent = `${currentScore} / ${totalQuestions}`; percentageEl.textContent = `${percentage}`;
    timeTakenEl.textContent = `${timeDiff}`;
    if (percentage === 100) encouragementTextEl.textContent = "Excellent! You're a top scorer!";
    else if (percentage >= 70) encouragementTextEl.textContent = "Great job! Keep up the good work!"; else encouragementTextEl.textContent = "Good effort! Practice makes perfect!";
    flashcardScreen.classList.add('hidden'); resultsScreen.classList.remove('hidden');
    requestAnimationFrame(() => { setTimeout(() => { const trackWidth = raceTrackContainer.offsetWidth; const effectiveTrackWidth = trackWidth - rocketEl.offsetWidth; const finalRocketPosition = Math.max(0, (percentage / 100) * effectiveTrackWidth); rocketEl.style.left = `${finalRocketPosition}px`; raceTrackFillEl.style.width = `${finalRocketPosition}px`; }, 100); });
    incorrectList.innerHTML = '';
    if (incorrectAnswers.length > 0) {
        incorrectListContainer.classList.remove('hidden'); noIncorrectText.classList.add('hidden');
        incorrectAnswers.forEach(item => { const li = document.createElement('li'); li.innerHTML = `<b>Q:</b> ${item.questionData.question.replace(/\n/g, ' ')}<br/><b>Your Answer:</b> <span class="text-red-500">${item.userAnswer}</span><br/><b>Correct Answer:</b> <span class="text-emerald-600">${item.questionData.correctAnswer}</span>`; incorrectList.appendChild(li); });
        redoIncorrectButton.classList.remove('hidden'); redoIncorrectButton.disabled = isRedoing || incorrectAnswers.length === 0;
    } else { incorrectListContainer.classList.add('hidden'); noIncorrectText.classList.remove('hidden'); redoIncorrectButton.classList.add('hidden'); }
    if (!isRedoing) {
        sendResultsToGoogleSheet({ name: userName, setName: currentSetData.setName, score: currentScore, totalQuestions: totalQuestions, percentage: percentage, timeTaken: timeDiff, incorrectAnswersJSON: JSON.stringify(incorrectAnswers.map(item => ({ q: item.questionData.question, u: item.userAnswer, c: item.questionData.correctAnswer }))) });
    }
    if (isRedoing) { incorrectAnswers = []; isRedoing = false; }
}


function redoIncorrect() {
    if (incorrectAnswers.length === 0) return; const originalSetName = currentSetData.setName.replace(" (Review)", "");
    currentSetData = incorrectAnswers.map(item => item.questionData); currentSetData.setName = `${originalSetName} (Review)`;
    currentQuestionIndex = 0; incorrectAnswers = []; isRedoing = true;
    resultsScreen.classList.add('hidden'); flashcardScreen.classList.remove('hidden');
    startTime = new Date(); updateProgress(); displayQuestion();
}


function showMainIndex() {
    if (proceedTimeoutId) { clearTimeout(proceedTimeoutId); }
    isWaitingToProceed = false; isRedoing = false;
    nameModal.style.display = 'none';
    flashcardScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    mainIndexScreen.classList.remove('hidden');
    renderMainIndex();
}


// --- NEW/MODIFIED Initialization Logic ---


function loadInitialData() {
    mainIndexScreen.classList.remove('hidden');
    mainIndexContainer.innerHTML = '<p class="text-center text-slate-500">Loading practice sets...</p>';
    const encodedUserName = encodeURIComponent(userName);


    const allSetsPromise = fetch(`${WEB_APP_URL}?action=getFlashcardData`).then(res => res.json());
    const userResultsPromise = fetch(`${WEB_APP_URL}?action=getUserResults&userName=${encodedUserName}`).then(res => res.json());


    Promise.all([allSetsPromise, userResultsPromise])
        .then(onDataLoaded)
        .catch(onDataError);
}


function sendResultsToGoogleSheet(data) {
    fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify(data),
    })
    .then(response => response.json())
    .then(result => {
        if (result.status === 'success') {
            userHistoricalResults[data.setName] = { score: data.score, total: data.totalQuestions, percentage: data.percentage };
            console.log("Results logged successfully.");
        } else {
            console.error("Failed to log results:", result.message);
        }
    })
    .catch(err => console.error("Error logging results:", err));
}


function onDataLoaded([sets, results]) {
    if (sets.error || results.error) {
        onDataError(sets.error || results.error);
        return;
    }
    allFlashcardSets = sets;
    userHistoricalResults = results;
    showMainIndex();
}


function onDataError(error) {
    document.getElementById('appContainer').innerHTML = `<div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert"><p class="font-bold">Error Loading Data</p><p>Could not load data from the Google Sheet. Please check the URL in config.js and ensure the Google Script is deployed correctly.</p><p class="text-sm mt-2">Details: ${JSON.stringify(error)}</p></div>`;
}


document.addEventListener('DOMContentLoaded', () => {
    userName = localStorage.getItem(USER_NAME_STORAGE_KEY) || '';
    if (userName) {
        loadInitialData();
    } else {
        nameModal.style.display = 'flex';
        userNameInput.focus();
    }
});