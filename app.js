// --- IndexedDB Setup ---
const DB_NAME = 'codeTrainerDB';
const DB_VERSION = 1;
let db = null;

// --- Sound System ---
class SoundManager {
  constructor() {
    this.audioContext = null;
    this.enabled = true;
    this.initAudioContext();
  }
  
  initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported');
      this.enabled = false;
    }
  }
  
  async resumeAudioContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
  
  playClickSound() {
    if (!this.enabled || !this.audioContext) return;
    
    this.resumeAudioContext();
    
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    // Much lower, softer frequency range for pleasant pops
    const baseFreq = 400;
    const randomVariation = Math.random() * 100 - 50; // ±50Hz variation
    oscillator.frequency.setValueAtTime(baseFreq + randomVariation, this.audioContext.currentTime);
    
    // Gentle attack and smooth decay for a soft "pop"
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.04, this.audioContext.currentTime + 0.02); // Much quieter
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.15); // Longer decay
    
    // Use sine wave for smooth, pleasant sound
    oscillator.type = 'sine';
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.15);
  }
  
  playSuccessSound() {
    if (!this.enabled || !this.audioContext) return;
    
    this.resumeAudioContext();
    
    // Create a pleasant ascending chord progression
    const frequencies = [300, 375, 450]; // Lower pitched major chord
    const startTime = this.audioContext.currentTime;
    
    frequencies.forEach((freq, index) => {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.frequency.setValueAtTime(freq, startTime + index * 0.05);
      oscillator.type = 'sine'; // Smooth sine waves
      
      // Gentle volume envelope
      gainNode.gain.setValueAtTime(0, startTime + index * 0.05);
      gainNode.gain.linearRampToValueAtTime(0.02, startTime + index * 0.05 + 0.05); // Much quieter
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + index * 0.05 + 0.3);
      
      oscillator.start(startTime + index * 0.05);
      oscillator.stop(startTime + index * 0.05 + 0.3);
    });
  }
  
  playErrorSound() {
    if (!this.enabled || !this.audioContext) return;

    this.resumeAudioContext();

    // Two-tone error sound
    const now = this.audioContext.currentTime;

    // First tone
    const osc1 = this.audioContext.createOscillator();
    const gain1 = this.audioContext.createGain();
    osc1.connect(gain1);
    gain1.connect(this.audioContext.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(340, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.04, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc1.start(now);
    osc1.stop(now + 0.13);

    // Second tone: lower, longer, starts just after first
    const osc2 = this.audioContext.createOscillator();
    const gain2 = this.audioContext.createGain();
    osc2.connect(gain2);
    gain2.connect(this.audioContext.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(180, now + 0.09);
    gain2.gain.setValueAtTime(0, now + 0.09);
    gain2.gain.linearRampToValueAtTime(0.045, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.36);
  }
}

const soundManager = new SoundManager();

// Helper function to add click sound to buttons
function addClickSound(element) {
  if (element && element.addEventListener) {
    element.addEventListener('click', () => soundManager.playClickSound());
  }
}

// Helper function to add click sounds to multiple elements
function addClickSounds(elements) {
  if (elements) {
    if (elements.length !== undefined) {
      // NodeList or Array
      elements.forEach(addClickSound);
    } else {
      // Single element
      addClickSound(elements);
    }
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function(e) {
      db = e.target.result;
      if (!db.objectStoreNames.contains('quizzes')) {
        db.createObjectStore('quizzes', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = function(e) {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = function(e) {
      reject(e);
    };
  });
}

async function saveQuiz(quizObj) {
  const db = await openDB();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction('quizzes', 'readwrite');
    const store = tx.objectStore('quizzes');
    store.add({ ...quizObj, highScore: 0, highStreak: 0 });
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e);
  });
}

async function getQuizzes() {
  const db = await openDB();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction('quizzes', 'readonly');
    const store = tx.objectStore('quizzes');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e);
  });
}

// Removed stats table and related functions
// app.js - CodeTrainer Quiz core logic

// --- State ---
let quiz = null;
let current = 0;
let score = 0;
let streak = 0;
let maxStreak = 0;

// --- DOM ---
const h1 = document.querySelector('h1');
const setupForm = document.getElementById('setup-form');
const homeArea = document.getElementById('home-area');
const savedQuizzesList = document.getElementById('saved-quizzes-list');
const quizArea = document.getElementById('quiz-area');
const questionMeta = document.getElementById('question-meta');
const questionPrompt = document.getElementById('question-prompt');
const codeContainer = document.getElementById('code-container');
const optionsDiv = document.getElementById('options');
const feedbackDiv = document.getElementById('feedback');
const nextBtn = document.getElementById('next-btn');
const resultsDiv = document.getElementById('results');
const restartBtn = document.getElementById('restart-btn');
const homeBtn = document.getElementById('home-btn');
const nextLvlBtn = document.getElementById('nextlvl-btn');
const nextLvlText = document.getElementById('nextlvl-text');
const loadingOverlay = document.getElementById('loading-overlay');

// --- Event Listeners ---
setupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = setupForm.querySelector('button[type="submit"]');
  const topic = setupForm.topic.value.trim();
  const difficulty = setupForm.difficulty.value;
  const numQuestions = parseInt(setupForm['num-questions'].value, 10);
  
  // Show loading state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Generating...';
  loadingOverlay.classList.remove('hidden');
  
  // Reset progress bar
  const progressFill = document.querySelector('#progress-fill');
  const progressText = document.querySelector('#progress-text');
  if (progressFill) progressFill.style.width = '0%';
  if (progressText) progressText.textContent = '0%';
  
  resetState();
  
  try {
    quiz = await fetchQuiz(topic, difficulty, numQuestions);
    
    setupForm.classList.add('hidden');
    homeArea.classList.add('hidden');
    quizArea.classList.remove('hidden');
    h1.classList.add('hidden');
    
    renderQuestion();
  } catch (err) {
    console.error('Quiz generation failed:', err);
    setFeedback(err.message || 'Failed to generate quiz. Please try again.', true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Start Quiz';
    loadingOverlay.classList.add('hidden');
  }
});

// Show saved quizzes on home
function showSavedQuizzes() {
  savedQuizzesList.innerHTML = '<li>Loading...</li>';
  getQuizzes().then(quizzes => {
    if (!quizzes.length) {
        homeArea.classList.add('hidden');
      savedQuizzesList.innerHTML = '<li>No saved quizzes yet.</li>';
      return;
    }
    homeArea.classList.remove('hidden');
    savedQuizzesList.innerHTML = '';
    
    // Sort quizzes by creation date (newest first) - use only date field
    quizzes.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    quizzes.forEach(qz => {
      const li = document.createElement('li');
    // Format date as "19 Aug 2025" - handle both ISO strings and legacy formats
    let dateObj;
    try {
      // Try parsing as ISO string first (new format)
      dateObj = new Date(qz.date);
      // If the date is invalid, it will be NaN
      if (isNaN(dateObj.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (e) {
      // Fallback: use current date if parsing fails
      console.warn('Invalid date format in saved quiz:', qz.date);
      dateObj = new Date();
    }
    
    const dateStr = dateObj.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    li.innerHTML = `
    <div class="quiz-meta">
      <div class="quiz-details">
      <span class="quiz-topic">
      <strong>${qz.topic}</strong> (${qz.difficulty})
      </span>
      <span class="quiz-date">${dateStr}</span>
      </div>
      <div class="quiz-stats">
      <span class="quiz-high-score">High Score: ${qz.highScore ?? 0}</span>
      <span class="quiz-max-streak">Max Streak: ${qz.highStreak ?? 0}</span>
      </div>
    </div>
      <div class="quiz-actions">
      <button class="attempt-btn">Attempt</button>
      <span class="delete-icon" title="Delete Quiz">❌</span>
      </div>
    `;
      li.querySelector('button').onclick = () => {
        quiz = qz;
        current = 0;
        score = 0;
        streak = 0;
        maxStreak = 0;
        homeArea.classList.add('hidden');
        setupForm.classList.add('hidden');
        quizArea.classList.remove('hidden');
        renderQuestion();
        //Smooth scroll to top
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      };
      addClickSound(li.querySelector('button'));
      // Delete icon logic
      const deleteIcon = li.querySelector('.delete-icon');
      let confirmDelete = false;
      deleteIcon.onclick = function() {
        if (!confirmDelete) {
          deleteIcon.textContent = '✔️';
          deleteIcon.style.background = 'rgba(255, 80, 80, 0.8)';
          deleteIcon.title = 'Click again to confirm delete';
          confirmDelete = true;
          setTimeout(() => {
            deleteIcon.textContent = '❌';
            deleteIcon.style.background = '';
            deleteIcon.title = 'Delete Quiz';
            confirmDelete = false;
          }, 2000);
        } else {
          // Delete from DB
          openDB().then(db => {
            const tx = db.transaction('quizzes', 'readwrite');
            const store = tx.objectStore('quizzes');
            store.delete(qz.id);
            tx.oncomplete = () => {
              showSavedQuizzes();
            };
          });
        }
      };
      addClickSound(deleteIcon);
      savedQuizzesList.appendChild(li);
    });
  });
}

nextBtn.addEventListener('click', () => {
  // Animate slide out
  quizArea.classList.add('slide-out');

  // Handler for animation end
  function handleAnimationEnd(e) {
    if (e.animationName !== 'slideOut') return; // Optional: check animation name
    quizArea.removeEventListener('animationend', handleAnimationEnd);
    quizArea.classList.remove('slide-out');
    current++;
    
    const totalQuestions = quiz.totalQuestions || quiz.questions.length;
    
    if (current < totalQuestions) {
      quizArea.classList.add('slide-in');
      renderQuestion(); // This will handle loading state if question isn't ready
      // Smooth scroll to top of page
      window.scrollTo({ top: 0, behavior: 'smooth' });  
      // Remove slide-in after animation completes
      quizArea.addEventListener('animationend', function removeSlideIn(ev) {
        if (ev.animationName !== 'slideIn') return;
        quizArea.classList.remove('slide-in');
        quizArea.removeEventListener('animationend', removeSlideIn);
      });
    } else {
      showResults();
    }
  }

  quizArea.addEventListener('animationend', handleAnimationEnd);
});


restartBtn.addEventListener('click', () => {
  // Restart quiz from question 1
  current = 0;
  score = 0;
  streak = 0;
  maxStreak = 0;
  resetState(false);
  resultsDiv.classList.add('hidden');
  restartBtn.classList.add('hidden');
  nextLvlBtn.classList.add('hidden');
  homeBtn.classList.add('hidden');
  quizArea.classList.remove('hidden');
  renderQuestion();
});

homeBtn.addEventListener('click', () => {
  setupForm.classList.remove('hidden');
  homeArea.classList.remove('hidden');
  quizArea.classList.add('hidden');
  resultsDiv.classList.add('hidden');
  restartBtn.classList.add('hidden');
  nextLvlBtn.classList.add('hidden');
  homeBtn.classList.add('hidden');
  h1.classList.remove('hidden');
  resetState();
  showSavedQuizzes();
});

nextLvlBtn.addEventListener('click', async () => {
  await generateFollowupQuiz();
});

// Generate a follow-up quiz with increased difficulty
async function generateFollowupQuiz() {
  const nextLvlBtn = document.getElementById('nextlvl-btn');
  
  try {
    // Determine next difficulty level
    const difficultyLevels = ['Beginner', 'Intermediate', 'Advanced'];
    const currentDifficultyIndex = difficultyLevels.indexOf(quiz.difficulty);
    const nextDifficulty = currentDifficultyIndex < difficultyLevels.length - 1 
      ? difficultyLevels[currentDifficultyIndex + 1] 
      : quiz.difficulty; // Stay at Advanced if already there
    
    // Show loading state
    nextLvlBtn.disabled = true;
    nextLvlBtn.textContent = 'Generating...';
    loadingOverlay.classList.remove('hidden');
    
    // Reset progress bar
    const progressFill = document.querySelector('#progress-fill');
    const progressText = document.querySelector('#progress-text');
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
    
    // Reset state for new quiz
    current = 0;
    score = 0;
    streak = 0;
    maxStreak = 0;
    
    // Generate follow-up quiz - this now handles all the UI state management
    await fetchFollowupQuiz(quiz.topic, nextDifficulty, quiz.questions.length, quiz);
    
  } catch (err) {
    // Hide loading and show error
    loadingOverlay.classList.add('hidden');
    alert('Failed to generate follow-up quiz: ' + err.message);
  } finally {
    // Reset button
    nextLvlBtn.disabled = false;
    nextLvlBtn.textContent = 'Next Level';
  }
}

function setFeedback(message, isError = false) {
  feedbackDiv.textContent = message;
  feedbackDiv.classList.toggle('error', isError);
  if (!message || message.trim() === '') {
    feedbackDiv.classList.add('hidden');
  } else {
    feedbackDiv.classList.remove('hidden');
  }
}

// --- Core Functions ---
function resetState(full = true) {
    quiz = full ? null : quiz;
    current = 0;
    score = 0;
    streak = 0;
    maxStreak = 0;
    setFeedback('');
    nextBtn.classList.add('hidden');
    resultsDiv.classList.add('hidden');
    restartBtn.classList.add('hidden');
    homeBtn.classList.add('hidden');
    h1.classList.remove('hidden');
    nextLvlText.classList.add('hidden');
}

function showLoading(msg) {
  setFeedback(msg);
  quizArea.classList.remove('hidden');
  questionMeta.textContent = '';
  questionPrompt.textContent = '';
  codeContainer.innerHTML = '';
  optionsDiv.innerHTML = '';
  nextBtn.classList.add('hidden');
}

function showError(msg) {
  setFeedback(msg, true);
  quizArea.classList.remove('hidden');
  questionMeta.textContent = '';
  questionPrompt.textContent = '';
  codeContainer.innerHTML = '';
  optionsDiv.innerHTML = '';
  nextBtn.classList.add('hidden');
}


let selectedOptionText = null;

function renderQuestion(fillAllBlanks = false) {
  // Check if the current question exists
  if (!quiz.questions[current]) {
    // Question not loaded yet - show loading state
    questionMeta.textContent = `Loading question ${current + 1}...`;
    questionPrompt.textContent = 'Please wait while we generate your next question...';
    codeContainer.innerHTML = '<div class="question-loading">Generating question...</div>';
    optionsDiv.innerHTML = '';
    nextBtn.classList.add('hidden');
    setFeedback('');
    
    // Poll for the question to be loaded
    const checkQuestion = setInterval(() => {
      if (quiz.questions[current]) {
        clearInterval(checkQuestion);
        renderQuestion(fillAllBlanks); // Re-render when question is available
      }
    }, 500);
    
    return;
  }

  const q = quiz.questions[current];
  questionMeta.textContent = `Question ${current + 1} of ${quiz.totalQuestions || quiz.questions.length} | Streak: ${streak} | Score: ${score}`;
  questionPrompt.textContent = q.prompt;
  setFeedback('');
  nextBtn.classList.remove('hidden');
  nextBtn.disabled = true;
  optionsDiv.innerHTML = '';
  homeBtn.classList.remove('hidden');
  h1.classList.add('hidden');

  // Render code with blanks as spans
  codeContainer.innerHTML = '';
  const codeLines = q.code_snippet.split('\n');
  let blankIndex = 0;
  codeLines.forEach(line => {
    const lineDiv = document.createElement('span');
    lineDiv.className = 'code-line';
    let idx = 0;
    while (idx < line.length) {
      if (line.slice(idx, idx + 4) === '____') {
        const blankSpan = document.createElement('span');
        blankSpan.className = 'blank';
        blankSpan.dataset.blankIndex = blankIndex;
        if (fillAllBlanks && selectedOptionText) {
          blankSpan.textContent = selectedOptionText;
          blankSpan.classList.add('filled');
        } else {
          blankSpan.textContent = '____';
        }
        lineDiv.appendChild(blankSpan);
        idx += 4;
        blankIndex++;
      } else {
        lineDiv.append(line[idx]);
        idx++;
      }
    }
    codeContainer.appendChild(lineDiv);
    codeContainer.appendChild(document.createElement('br'));
  });

  // Render options
  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.textContent = opt.option;
    btn.onclick = () => handleAnswer(btn, opt, q, idx);
    addClickSound(btn);
    optionsDiv.appendChild(btn);
  });
}




// Accepts option object instead of just isCorrect
function handleAnswer(btn, selectedOpt, q, idx) {
  // Fill all blanks with the selected answer
  selectedOptionText = selectedOpt.option;
  renderQuestion(true);

  // Determine if answer is correct
  // In new format: correct answer is marked with isCorrect flag (set during shuffle)
  // Legacy format: check old properties
  let isCorrect = false;
  
  if (selectedOpt.isCorrect !== undefined) {
    // New format: isCorrect flag set during shuffle
    isCorrect = selectedOpt.isCorrect;
  } else if (selectedOpt.is_best || selectedOpt.is_correct || selectedOpt.answer_type === 'best') {
    // Legacy format compatibility
    isCorrect = true;
  }

  Array.from(optionsDiv.children).forEach((b, i) => {
    b.disabled = true;
    
    // Mark correct answer
    const opt = q.options[i];
    if (opt.isCorrect || opt.is_best || opt.is_correct || opt.answer_type === 'best') {
      b.classList.add('correct');
    }
    
    // Mark selected answer
    if (i === idx) {
      b.classList.add('selected');
      if (!isCorrect) b.classList.add('incorrect');
    }
  });
  
  // Highlight blanks as correct/incorrect
  const blankSpans = codeContainer.querySelectorAll('.blank');
  if (blankSpans.length > 0) {
    blankSpans.forEach(span => {
      if (isCorrect) {
        span.classList.add('filled');
      } else {
        span.classList.add('incorrect');
      }
    });
  }
  
  // Scoring and feedback
  if (isCorrect) {
    score++;
    streak++;
    maxStreak = Math.max(maxStreak, streak);
    setFeedback('✅ Correct! ' + q.explanation);
    soundManager.playSuccessSound();
  } else {
    streak = 0;
    setFeedback('❌ Incorrect. ' + q.explanation);
    soundManager.playErrorSound();
  }
  nextBtn.disabled = false;
  //scroll to next button
  nextBtn.scrollIntoView({ behavior: 'smooth' });
}


function showResults() {
  quizArea.classList.add('hidden');
  resultsDiv.classList.remove('hidden');
  restartBtn.classList.remove('hidden');
  nextLvlBtn.classList.remove('hidden');
  
  const totalQuestions = quiz.totalQuestions || quiz.questions.length;
  const questionsAnswered = Math.min(current, quiz.questions.length);
  
  //Follow up is enabled if score was over 50% of answered questions
  if (score > questionsAnswered / 2) {
    nextLvlBtn.disabled = false;
    nextLvlText.classList.add('hidden');
  } else {
    nextLvlBtn.disabled = true;
    nextLvlText.classList.remove('hidden');
  }
  homeBtn.classList.remove('hidden');
  nextBtn.classList.add('hidden');
  
  resultsDiv.innerHTML = `
    <h2>Quiz Complete!</h2>
    <p>Score: ${score} / ${questionsAnswered}</p>
    <p>Accuracy: ${Math.round((score / questionsAnswered) * 100)}%</p>
    <p>Max Streak: ${maxStreak}</p>
    ${questionsAnswered < totalQuestions ? `<p><em>Note: ${totalQuestions - questionsAnswered} questions were still loading</em></p>` : ''}
  `;
  codeContainer.innerHTML = '';
  // Update high score/streak for this quiz (save first attempt as highscore if not set)
  if (quiz && quiz.id !== undefined) {
    openDB().then(db => {
      const tx = db.transaction('quizzes', 'readwrite');
      const store = tx.objectStore('quizzes');
      store.get(quiz.id).onsuccess = function(e) {
        const savedQuiz = e.target.result;
        let updated = false;
        // If highScore/highStreak are not set, set them to this attempt
        if (savedQuiz.highScore === undefined || savedQuiz.highScore === 0) {
          savedQuiz.highScore = score;
          updated = true;
        } else if (score > savedQuiz.highScore) {
          savedQuiz.highScore = score;
          updated = true;
        }
        if (savedQuiz.highStreak === undefined || savedQuiz.highStreak === 0) {
          savedQuiz.highStreak = maxStreak;
          updated = true;
        } else if (maxStreak > savedQuiz.highStreak) {
          savedQuiz.highStreak = maxStreak;
          updated = true;
        }
        if (updated) {
          store.put(savedQuiz);
        }
      };
    });
  }
}

// --- On load, show saved quizzes and initialize topic banner ---
window.addEventListener('DOMContentLoaded', () => {
  showSavedQuizzes();
  initializeTopicBanner();
  
  // Add click sounds to all existing buttons
  addClickSounds([
    setupForm.querySelector('button[type="submit"]'),
    nextBtn,
    restartBtn,
    homeBtn,
    nextLvlBtn,
    document.getElementById('start-quiz-btn')
  ]);
});

// Initialize the scrolling topic banner
async function initializeTopicBanner() {
  try {
    // Fetch the topics from examples.txt
    const response = await fetch('./examples.json');
    const topics = await response.json();
    
    const topicInput = document.getElementById('topic');
    
    // Pick 10 random topics
    const shuffledTopics = [...topics].sort(() => Math.random() - 0.5);
    const selectedTopics = shuffledTopics.slice(0, 10);
    
    // Create topic buttons for original content
    const originalContent = document.getElementById('topic-banner');
    const duplicateContent = document.getElementById('topic-banner-duplicate');
    
    // Function to create topic buttons
    const createButtons = (container) => {
      selectedTopics.forEach(topic => {
        const button = document.createElement('button');
        button.className = 'topic-button';
        button.type = 'button';
        button.textContent = topic;
        button.onclick = () => {
          topicInput.value = topic;
          topicInput.focus();

          // Add a subtle highlight effect
          button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
          setTimeout(() => {
            button.style.background = '';
          }, 300);
        };
        addClickSound(button);
        container.appendChild(button);
      });
    };
    
    // Create buttons for both original and duplicate content
    createButtons(originalContent);
    createButtons(duplicateContent);
    
    // Safari-specific fix: Force animation restart after DOM is ready
    setTimeout(() => {
      const bannerElements = [originalContent, duplicateContent];
      bannerElements.forEach(element => {
        if (element) {
          // Force reflow to restart animations in Safari
          const animationName = element.style.animationName;
          element.style.animationName = 'none';
          element.offsetHeight; // Trigger reflow
          element.style.animationName = animationName;
          
          // Additional Safari-specific restart
          element.style.webkitAnimationName = 'none';
          element.offsetHeight; // Trigger reflow
          element.style.webkitAnimationName = animationName;
        }
      });
    }, 100);
    
    // Additional check for iOS/Safari - restart animation if it appears frozen
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) || /Safari/.test(navigator.userAgent)) {
      setTimeout(() => {
        const container = document.querySelector('#topic-banner-container');
        if (container) {
          // Force a repaint by toggling hardware acceleration
          container.style.transform = 'translateZ(0.1px)';
          setTimeout(() => {
            container.style.transform = 'translateZ(0)';
          }, 50);
        }
      }, 500);
    }
    
  } catch (error) {
    console.error('Failed to load topic examples:', error);
    // Fallback: hide the banner if examples can't be loaded
    document.querySelector('.topic-banner-container').style.display = 'none';
  }
}

async function fetchQuiz(topic, difficulty, numQuestions, previousQuiz = null) {
  try {
    const questions = [];
    const progressFill = document.querySelector('#progress-fill');
    const progressText = document.querySelector('#progress-text');
    const loadingText = document.querySelector('#loading-text');
    const loadingOverlay = document.getElementById('loading-overlay');
    const startQuizBtn = document.getElementById('start-quiz-btn');
    
    // Reset and hide the start quiz button initially
    startQuizBtn.classList.remove('show');
    startQuizBtn.disabled = true;
    
    let quizStarted = false;
    let allQuestionsLoaded = false;
    
    // Store the quiz data globally so we can access it
    const quizData = {
      topic,
      difficulty,
      questions,
      isLoading: true,
      totalQuestions: numQuestions
    };
    
    // Function to start the quiz
    const startQuiz = () => {
      if (questions.length > 0 && !quizStarted) {
        quizStarted = true;
        quiz = quizData;
        quiz.id = Date.now();
        quiz.date = new Date().toISOString();
        quiz.attempts = 0;
        quiz.highScore = 0;
        quiz.maxStreak = 0;
        
        // Save quiz (will update as more questions load)
        saveQuiz(quiz);
        
        // Hide loading overlay and start quiz
        const setupForm = document.getElementById('setup-form');
        const homeArea = document.getElementById('home-area');
        const resultsDiv = document.getElementById('results');
        const restartBtn = document.getElementById('restart-btn');
        const nextLvlBtn = document.getElementById('nextlvl-btn');
        const homeBtn = document.getElementById('home-btn');
        const quizArea = document.getElementById('quiz-area');
        const h1 = document.querySelector('h1');
        
        if (setupForm) setupForm.classList.add('hidden');
        if (homeArea) homeArea.classList.add('hidden');
        if (resultsDiv) resultsDiv.classList.add('hidden');
        if (restartBtn) restartBtn.classList.add('hidden');
        if (nextLvlBtn) nextLvlBtn.classList.add('hidden');
        if (homeBtn) homeBtn.classList.add('hidden');
        if (h1) h1.classList.add('hidden');
        loadingOverlay.classList.add('hidden');
        quizArea.classList.remove('hidden');
        
        renderQuestion();
      }
    };
    
    // Set up the start quiz button click handler
    startQuizBtn.onclick = startQuiz;
    
    // Determine if this is a follow-up quiz for messaging
    const isFollowup = previousQuiz !== null;
    const questionTypeText = isFollowup ? 'follow-up question' : 'question';
    
    // Generate questions one by one
    for (let i = 0; i < numQuestions; i++) {
      try {
        if (loadingText) {
          loadingText.textContent = `Generating ${questionTypeText} ${i + 1} of ${numQuestions}...`;
        }
        
        // Build request body
        const requestBody = {
          topic,
          difficulty,
          questionIndex: i,
          totalQuestions: numQuestions,
          previousQuestions: questions
        };
        
        // Add previousQuiz for follow-up context if provided
        if (previousQuiz) {
          requestBody.previousQuiz = previousQuiz;
        }
        
        const response = await fetch('/.netlify/functions/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Netlify function error:', response.status, errorData);
          
          if (response.status === 401) {
            throw new Error('Invalid API key configuration. Please contact support.');
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
          } else if (response.status === 402) {
            throw new Error('Service temporarily unavailable. Please try again later.');
          } else {
            throw new Error(errorData.error || `Server error: ${response.status}. Please try again.`);
          }
        }

        const questionResponse = await response.json();
        
        if (!questionResponse.question) {
          throw new Error(`Failed to generate ${questionTypeText}. Please try again.`);
        }

        // Validate question has required fields
        const q = questionResponse.question;
        if (!q.prompt || !q.code_snippet || !q.options || !Array.isArray(q.options) || q.options.length !== 4) {
          throw new Error('Invalid question format - must have exactly 4 options');
        }
        
        // Ensure exactly one option is marked as correct
        const correctOptions = q.options.filter(opt => opt.isCorrect);
        if (correctOptions.length !== 1) {
          throw new Error(`Question ${q.id}: Must have exactly one correct option, found ${correctOptions.length}`);
        }

        questions.push(questionResponse.question);
        
        // Update progress bars AFTER question is loaded
        const progress = ((i + 1) / numQuestions) * 100;
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${Math.round(progress)}%`;
        
        // Show start button after first question is loaded
        if (i === 0 && !quizStarted) {
          startQuizBtn.classList.add('show');
          startQuizBtn.disabled = false;
          if (loadingText) {
            loadingText.textContent = `Question 1 ready! Loading remaining questions...`;
          }
        }
        
        // Update saved quiz with new questions if quiz has started
        if (quizStarted && quiz) {
          quiz.questions = [...questions];
          // Update the saved quiz
          openDB().then(db => {
            const tx = db.transaction('quizzes', 'readwrite');
            const store = tx.objectStore('quizzes');
            store.put(quiz);
          });
        }
        
      } catch (error) {
        // If this is not the first question and quiz has started, continue with what we have
        if (i > 0 && quizStarted) {
          console.warn(`Failed to load question ${i + 1}:`, error);
          continue;
        } else {
          throw error;
        }
      }
    }
    
    allQuestionsLoaded = true;
    quizData.isLoading = false;
    
    if (loadingText && !quizStarted) {
      loadingText.textContent = `All ${numQuestions} questions ready!`;
    }
    
    // If quiz hasn't started yet, auto-start it
    if (!quizStarted) {
      setTimeout(startQuiz, 500);
    }

    return quizData;
  } catch (error) {
    const errorType = previousQuiz ? 'Follow-up quiz' : 'Quiz';
    console.error(`${errorType} generation error:`, error);
    throw error;
  }
}

// Generate a follow-up quiz with increased difficulty
async function generateFollowupQuiz() {
  const nextLvlBtn = document.getElementById('nextlvl-btn');
  
  try {
    // Determine next difficulty level
    const difficultyLevels = ['Beginner', 'Intermediate', 'Advanced'];
    const currentDifficultyIndex = difficultyLevels.indexOf(quiz.difficulty);
    const nextDifficulty = currentDifficultyIndex < difficultyLevels.length - 1 
      ? difficultyLevels[currentDifficultyIndex + 1] 
      : quiz.difficulty; // Stay at Advanced if already there
    
    // Show loading state
    nextLvlBtn.disabled = true;
    nextLvlBtn.textContent = 'Generating...';
    loadingOverlay.classList.remove('hidden');
    
    // Reset progress bar
    const progressFill = document.querySelector('#progress-fill');
    const progressText = document.querySelector('#progress-text');
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
    
    // Reset state for new quiz
    current = 0;
    score = 0;
    streak = 0;
    maxStreak = 0;
    
    // Generate follow-up quiz using the unified fetchQuiz function
    await fetchQuiz(quiz.topic, nextDifficulty, quiz.questions.length, quiz);
    
  } catch (err) {
    // Hide loading and show error
    loadingOverlay.classList.add('hidden');
    alert('Failed to generate follow-up quiz: ' + err.message);
  } finally {
    // Reset button
    nextLvlBtn.disabled = false;
    nextLvlBtn.textContent = 'Next Level';
  }
}
