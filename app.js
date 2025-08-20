// --- IndexedDB Setup ---
const DB_NAME = 'codeTrainerDB';
const DB_VERSION = 1;
let db = null;

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
    quiz.id = Date.now();
    quiz.date = new Date().toLocaleDateString();
    quiz.attempts = 0;
    quiz.highScore = 0;
    quiz.maxStreak = 0;
    
    await saveQuiz(quiz);
    
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
    
    // Sort quizzes by creation date (newest first)
    quizzes.sort((a, b) => new Date(b.created) - new Date(a.created));
    
    quizzes.forEach(qz => {
      const li = document.createElement('li');
    // Format date as "19 Aug 2025"
    const dateObj = new Date(qz.created);
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
    if (current < quiz.questions.length) {
      quizArea.classList.add('slide-in');
      renderQuestion();
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
    
    // Generate follow-up quiz
    const followupQuiz = await fetchFollowupQuiz(quiz.topic, nextDifficulty, quiz.questions.length, quiz);
    
    if (!followupQuiz || !followupQuiz.questions || !followupQuiz.questions.length) {
      throw new Error('No follow-up quiz data.');
    }
    
    // Save the follow-up quiz
    const created = new Date().toISOString();
    await saveQuiz({
      topic: followupQuiz.topic,
      difficulty: followupQuiz.difficulty,
      questions: followupQuiz.questions,
      created
    });
    
    // Get the saved quiz ID
    const quizzes = await getQuizzes();
    const saved = quizzes.find(qz => qz.created === created && qz.topic === followupQuiz.topic && qz.difficulty === followupQuiz.difficulty);
    if (saved) {
      followupQuiz.id = saved.id;
    }
    
    // Start the follow-up quiz
    quiz = followupQuiz;
    current = 0;
    score = 0;
    streak = 0;
    maxStreak = 0;
    
    // Hide loading and results, show quiz
    loadingOverlay.classList.add('hidden');
    resultsDiv.classList.add('hidden');
    restartBtn.classList.add('hidden');
    nextLvlBtn.classList.add('hidden');
    homeBtn.classList.add('hidden');
    quizArea.classList.remove('hidden');
    renderQuestion();
    
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
  const q = quiz.questions[current];
  questionMeta.textContent = `Question ${current + 1} of ${quiz.questions.length} | Streak: ${streak} | Score: ${score}`;
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
  } else {
    streak = 0;
    setFeedback('❌ Incorrect. ' + q.explanation);
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
  //Follow up is enabled if score was over 50%
  if (score > quiz.questions.length / 2) {
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
    <p>Score: ${score} / ${quiz.questions.length}</p>
    <p>Accuracy: ${Math.round((score / quiz.questions.length) * 100)}%</p>
    <p>Max Streak: ${maxStreak}</p>
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

// --- On load, show saved quizzes ---
window.addEventListener('DOMContentLoaded', showSavedQuizzes);

async function fetchQuiz(topic, difficulty, numQuestions, providedApiKey = null) {
  try {
    const questions = [];
    const progressFill = document.querySelector('#progress-fill');
    const progressText = document.querySelector('#progress-text');
    const loadingText = document.querySelector('#loading-overlay p');
    
    // Generate questions one by one
    for (let i = 0; i < numQuestions; i++) {
      if (loadingText) {
        loadingText.textContent = `Generating question ${i + 1} of ${numQuestions}...`;
      }
      
      // Update progress bar
      const progress = ((i + 1) / numQuestions) * 100;
      if (progressFill) progressFill.style.width = `${progress}%`;
      if (progressText) progressText.textContent = `${Math.round(progress)}%`;
      
      const response = await fetch('/.netlify/functions/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topic,
          difficulty,
          questionIndex: i,
          totalQuestions: numQuestions,
          previousQuestions: questions // Send previously generated questions for context
        })
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
        throw new Error('Failed to generate question. Please try again.');
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
    }

    // Create final quiz data structure
    const quizData = {
      topic,
      difficulty,
      questions
    };

    return quizData;
  } catch (error) {
    console.error('Quiz generation error:', error);
    throw error;
  }
}

// Generate follow-up quiz with context from previous quiz
async function fetchFollowupQuiz(topic, difficulty, numQuestions, previousQuiz, providedApiKey = null) {
  try {
    const questions = [];
    const progressFill = document.querySelector('#progress-fill');
    const progressText = document.querySelector('#progress-text');
    const loadingText = document.querySelector('#loading-overlay p');
    
    // Generate questions one by one
    for (let i = 0; i < numQuestions; i++) {
      if (loadingText) {
        loadingText.textContent = `Generating follow-up question ${i + 1} of ${numQuestions}...`;
      }
      
      // Update progress bar
      const progress = ((i + 1) / numQuestions) * 100;
      if (progressFill) progressFill.style.width = `${progress}%`;
      if (progressText) progressText.textContent = `${Math.round(progress)}%`;
      
      const response = await fetch('/.netlify/functions/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topic,
          difficulty,
          questionIndex: i,
          totalQuestions: numQuestions,
          previousQuestions: questions, // Send previously generated questions for context
          previousQuiz // Send the previous quiz for follow-up context
        })
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
        throw new Error('Failed to generate follow-up question. Please try again.');
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
    }

    // Create final quiz data structure
    const quizData = {
      topic,
      difficulty,
      questions
    };

    return quizData;
  } catch (error) {
    console.error('Follow-up quiz generation error:', error);
    throw error;
  }
}
