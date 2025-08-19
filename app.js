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
let apiKey = null;

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
  
  // Store API key for later use in follow-up quizzes
  apiKey = setupForm['api-key'].value.trim();
  
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
    quiz = await fetchQuiz(topic, difficulty, numQuestions, apiKey);
    if (!quiz || !quiz.questions || !quiz.questions.length) throw new Error('No quiz data.');
    // Save generated quiz to IndexedDB and get its id
    const created = new Date().toISOString();
    await saveQuiz({
      topic,
      difficulty,
      questions: quiz.questions,
      created
    });
    // Fetch the quiz back to get its id
    const quizzes = await getQuizzes();
    const saved = quizzes.find(qz => qz.created === created && qz.topic === topic && qz.difficulty === difficulty);
    if (saved) {
      quiz.id = saved.id;
    }
    
    // Hide loading and show quiz
    loadingOverlay.classList.add('hidden');
    setupForm.classList.add('hidden');
    homeArea.classList.add('hidden');
    quizArea.classList.remove('hidden');
    h1.classList.add('hidden');
    renderQuestion();
  } catch (err) {
    // Hide loading and show error
    loadingOverlay.classList.add('hidden');
    showError('Failed to generate quiz. Please try again.');
  } finally {
    // Reset submit button
    submitBtn.disabled = false;
    submitBtn.textContent = 'Start';
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
    const followupQuiz = await fetchFollowupQuiz(quiz.topic, nextDifficulty, quiz.questions.length, quiz, apiKey);
    
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
function resetState() {
    quiz = null;
    current = 0;
    score = 0;
    streak = 0;
    maxStreak = 0;
    apiKey = null; // Clear API key when resetting
    setFeedback('');
    nextBtn.classList.add('hidden');
    resultsDiv.classList.add('hidden');
    restartBtn.classList.add('hidden');
    homeBtn.classList.add('hidden');
    h1.classList.remove('hidden');
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
// --- OpenAI API Integration ---

// Helper function to handle streaming responses
async function handleStreamingResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let quizData = null;

  // Update loading indicator to show streaming
  const loadingTitle = document.querySelector('#loading-overlay h2');
  const loadingText = document.querySelector('#loading-overlay p');
  const progressFill = document.querySelector('#progress-fill');
  const progressText = document.querySelector('#progress-text');
  
  if (loadingTitle) loadingTitle.textContent = 'Generating Quiz...';
  if (loadingText) loadingText.textContent = 'Establishing connection...';

  // Get number of questions to estimate total updates (110x multiplier)
  const numQuestions = parseInt(document.getElementById('num-questions').value, 10) || 10;
  const estimatedUpdates = numQuestions * 110;

  // Set up timeout to prevent hanging
  const timeout = setTimeout(() => {
    reader.cancel('Request timeout');
  }, 120000); // 2 minutes timeout

  try {
    let eventCount = 0;
    let lastEventTime = Date.now();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      lastEventTime = Date.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the incomplete line
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;
        
        const eventData = line.slice(6); // Remove 'data: ' prefix
        if (eventData === '[DONE]') continue;
        
        try {
          const event = JSON.parse(eventData);
          eventCount++;
          
          // Update progress bar (cap at 95% until completion)
          const progress = Math.min(95, (eventCount / estimatedUpdates) * 100);
          if (progressFill) {
            progressFill.style.width = `${progress}%`;
          }
          if (progressText) {
            progressText.textContent = `${Math.round(progress)}%`;
          }
          
          // Debug logging for key events
          if (event.type === 'response.completed') {
            if (event.response?.output) {
              event.response.output.forEach((output, index) => {
                if (output.content?.[0]?.text) {
                  // console.log(`Output ${index} text preview:`, output.content[0].text.substring(0, 100) + '...');
                }
              });
            }
          }
          
          // Update progress indicator based on event type
          if (loadingText) {
            switch (event.type) {
              case 'response.created':
                loadingText.textContent = 'AI is thinking about your quiz...';
                break;
              case 'response.output_text.delta':
                loadingText.textContent = `Generating questions... ${Math.round(progress)}% complete`;
                break;
              case 'response.in_progress':
                loadingText.textContent = 'Quiz generation in progress...';
                break;
              case 'response.completed':
                loadingText.textContent = 'Finalizing quiz structure...';
                // Set progress to 100% on completion
                if (progressFill) progressFill.style.width = '100%';
                if (progressText) progressText.textContent = '100%';
                break;
              default:
                if (eventCount % 10 === 0) { // Update every 10th event to avoid too frequent updates
                  loadingText.textContent = `Processing... ${Math.round(progress)}% complete`;
                }
            }
          }
          
          // Handle different event types
          if (event.type === 'response.completed') {
            // Check for parsed output first (structured responses)
            if (event.response?.output_parsed) {
              quizData = event.response.output_parsed;
            } 
            // Check for text output in the response (JSON string responses)
            // GPT-5 may have multiple outputs (reasoning + message), so check all of them
            else if (event.response?.output) {
              for (const output of event.response.output) {
                if (output?.content?.[0]?.text) {
                  try {
                    const parsedData = JSON.parse(output.content[0].text);
                    // Verify this looks like quiz data (has questions array)
                    if (parsedData.questions && Array.isArray(parsedData.questions)) {
                      quizData = parsedData;
                      break; // Found valid quiz data, stop looking
                    }
                  } catch (parseError) {
                    // This output might be reasoning or other content, continue to next
                  }
                }
              }
            }
            if (loadingText && quizData) {
              loadingText.textContent = 'Quiz ready! Loading interface...';
            }
          } else if (event.type === 'response.output_text.done' && event.content?.[0]?.text) {
            // Fallback for text-based responses
            try {
              quizData = JSON.parse(event.content[0].text);
              if (loadingText) {
                loadingText.textContent = 'Quiz ready! Loading interface...';
              }
            } catch (parseError) {
              console.warn('Failed to parse quiz data from text response:', parseError);
            }
          } else if (event.type === 'error') {
            throw new Error(`Streaming error: ${event.error?.message || 'Unknown streaming error'}`);
          }
        } catch (parseError) {
          console.warn('Failed to parse streaming event:', parseError);
        }
      }
      
      // Check for stalled connection (no events for 30 seconds)
      if (Date.now() - lastEventTime > 30000) {
        throw new Error('Connection stalled - no data received for 30 seconds');
      }
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  
  // Final debugging
  // console.log('Final quizData:', quizData);
  // if (!quizData) {
  //   console.error('No quiz data extracted from streaming response');
  // }
  
  return quizData;
}

// JSON Schema for structured quiz output
const QUIZ_SCHEMA = {
  type: "object",
  properties: {
    topic: { type: "string" },
    difficulty: { type: "string", enum: ["Beginner", "Intermediate", "Advanced"] },
    questions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          prompt: { type: "string" },
          code_snippet: { type: "string" },
          correct_answer: { type: "string" },
          wrong_answers: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: { type: "string" }
          },
          explanation: { type: "string" }
        },
        required: ["id", "prompt", "code_snippet", "correct_answer", "wrong_answers", "explanation"],
        additionalProperties: false
      }
    }
  },
  required: ["topic", "difficulty", "questions"],
  additionalProperties: false
};

async function fetchQuiz(topic, difficulty, numQuestions, providedApiKey) {
  const currentApiKey = providedApiKey || document.getElementById('api-key').value.trim();
  
  if (!currentApiKey) {
    throw new Error('OpenAI API key is required');
  }

  // Configure OpenAI API endpoint
  const baseUrl = 'https://api.openai.com/v1';
  const authHeader = `Bearer ${currentApiKey}`;

  const systemPrompt = `You are a code quiz generator. Create programming quizzes with fill-in-the-blank questions where students complete code snippets. Each question must have exactly one "____" placeholder in the code_snippet that students will fill. Provide one correct answer and exactly 3 incorrect/alternative answers separately.

  Generate a ${difficulty} level quiz about "${topic}" with exactly ${numQuestions} questions. Each question should:
  1. Have a clear, specific prompt asking what to fill in the blank. The prompt must not be ambiguous or vague, or give away the answer.
  2. Include a code_snippet with exactly one "____" (4 underscores) placeholder.
  3. Provide one correct_answer and exactly 3 wrong_answers. Wrong answers should not be partially correct or technically accurate.
  4. Include a helpful explanation.
  5. Use realistic, practical coding scenarios.
  6. Ensure the code_snippet is syntactically correct when the correct_answer fills the blank.
  7. There must always be a change required to the code. Do not return complete code.

  Make sure the quiz covers different aspects of ${topic} and progresses appropriately for ${difficulty} level.`;

  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        input: [
          { role: 'system', content: systemPrompt }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'CodeTrainerQuiz',
            schema: QUIZ_SCHEMA,
            strict: true
          }
        },
        stream: true,
        reasoning: {
          effort: "minimal"
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    // Handle streaming response
    const quizData = await handleStreamingResponse(response);
    
    if (!quizData) {
      throw new Error('No data received from streaming response');
    }

    // Validate and normalize the quiz data
    if (!quizData.questions || !Array.isArray(quizData.questions)) {
      throw new Error('Invalid quiz format: missing questions array');
    }

    // Ensure we have the requested number of questions
    quizData.questions = quizData.questions.slice(0, numQuestions);
    
    // Helper function to shuffle an array
    function shuffleArray(array) {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    // Normalize question IDs and create shuffled options from correct/wrong answers
    quizData.questions.forEach((q, idx) => {
      q.id = idx + 1;
      
      // Create options array from correct_answer and wrong_answers
      const allOptions = [
        { option: q.correct_answer, isCorrect: true },
        ...q.wrong_answers.map(wrongAnswer => ({ option: wrongAnswer, isCorrect: false }))
      ];
            
      // Shuffle the options
      q.options = shuffleArray(allOptions);
            
      // Clean up the original fields since we now have options array
      delete q.correct_answer;
      delete q.wrong_answers;
    });

    // Validate each question has required fields (main fetchQuiz)
    for (const q of quizData.questions) {
      if (!q.prompt || !q.code_snippet || !q.options || !Array.isArray(q.options) || q.options.length !== 4) {
        throw new Error('Invalid question format - must have exactly 4 options');
      }
      
      // Ensure exactly one option is marked as correct
      const correctOptions = q.options.filter(opt => opt.isCorrect);
      if (correctOptions.length !== 1) {
        throw new Error(`Question ${q.id}: Must have exactly one correct option, found ${correctOptions.length}`);
      }
    }

    return quizData;

  } catch (error) {
    console.error('Failed to fetch quiz from API:', error);
    
    // Fallback to sample quiz for development/testing
    // console.log('Falling back to sample quiz...');
    const fallbackQuiz = {
      topic,
      difficulty,
      questions: [
        {
          id: 1,
          prompt: "Complete the for loop to print each item in the list.",
          code_snippet: "items = ['a', 'b', 'c']\nfor ____ in items:\n    print(____)",
          correct_answer: "item",
          wrong_answers: ["i", "items", "list"],
          explanation: "The loop variable should be 'item' to iterate through each element in 'items'. While 'i' will work, it is less descriptive in this context."
        },
        {
          id: 2,
          prompt: "Fix the syntax error in this while loop.",
          code_snippet: "count = 0\nwhile count < 5\n    print(count)\n    count += 1",
          correct_answer: "Add ':' after while condition",
          wrong_answers: ["Change 'while' to 'for'", "Indent 'while' line", "Remove 'count += 1'"],
          explanation: "Python requires a colon after the 'while' condition."
        }
      ]
    };
    
    // Process fallback quiz through same normalization logic
    fallbackQuiz.questions.forEach((q, idx) => {
      const allOptions = [
        { option: q.correct_answer, isCorrect: true },
        ...q.wrong_answers.map(wrongAnswer => ({ option: wrongAnswer, isCorrect: false }))
      ];
      q.options = shuffleArray(allOptions);
      delete q.correct_answer;
      delete q.wrong_answers;
    });
    
    return fallbackQuiz;
  }
}

// Generate follow-up quiz with context from previous quiz
async function fetchFollowupQuiz(topic, difficulty, numQuestions, previousQuiz, providedApiKey) {
  const currentApiKey = providedApiKey || document.getElementById('api-key').value.trim();
  
  if (!currentApiKey) {
    throw new Error('API key is required');
  }

  // Configure OpenAI API endpoint
  const baseUrl = 'https://api.openai.com/v1';
  const authHeader = `Bearer ${currentApiKey}`;

  // Create context from previous quiz
  const previousContext = JSON.stringify({
    topic: previousQuiz.topic,
    difficulty: previousQuiz.difficulty,
    questions: previousQuiz.questions.map(q => ({
      prompt: q.prompt,
      code_snippet: q.code_snippet,
      explanation: q.explanation
    }))
  });

  const systemPrompt = `You are a code quiz generator creating follow-up quizzes. Given a previous quiz context, create new programming questions that build upon or complement the previous material without repeating the same concepts. Each question must have exactly one "____" placeholder in the code_snippet that students will fill. Provide one correct answer and exactly 3 incorrect/alternative answers separately.`;

  const userPrompt = `Create a ${difficulty} level follow-up quiz about "${topic}" with exactly ${numQuestions} questions. 

PREVIOUS QUIZ COVERED:
${previousContext}

Generate NEW questions that:
1. Build upon or complement the concepts from the previous quiz
2. Do NOT repeat the same exact scenarios or code patterns
3. Explore different aspects of ${topic} appropriate for ${difficulty} level
4. Increase complexity compared to the previous ${previousQuiz.difficulty} level quiz
5. Each question should have a clear prompt, code_snippet with one "____" (4 underscores) placeholder, one correct_answer, exactly 3 wrong_answers, and explanation
6. Provide one correct_answer and exactly 3 wrong_answers
7. Include a helpful explanation
8. Use realistic, practical coding scenarios
9. Ensure the code_snippet is syntactically correct when the correct_answer fills the blank
10. There must always be a change required to the code. Do not return complete code.

Focus on expanding the student's knowledge while maintaining continuity with what they've already learned.`;

  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'CodeTrainerQuiz',
            schema: QUIZ_SCHEMA,
            strict: true
          }
        },
        stream: true,
        reasoning: {
          effort: "minimal"
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    // Handle streaming response
    const quizData = await handleStreamingResponse(response);
    
    if (!quizData) {
      throw new Error('No data received from streaming response');
    }

    // Validate and normalize the quiz data
    if (!quizData.questions || !Array.isArray(quizData.questions)) {
      throw new Error('Invalid quiz format: missing questions array');
    }

    // Ensure we have the requested number of questions
    quizData.questions = quizData.questions.slice(0, numQuestions);
    
    // Helper function to shuffle an array
    function shuffleArray(array) {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    // Normalize question IDs and create shuffled options from correct/wrong answers
    quizData.questions.forEach((q, idx) => {
      q.id = idx + 1;
      
      // Create options array from correct_answer and wrong_answers
      const allOptions = [
        { option: q.correct_answer, isCorrect: true },
        ...q.wrong_answers.map(wrongAnswer => ({ option: wrongAnswer, isCorrect: false }))
      ];
            
      // Shuffle the options
      q.options = shuffleArray(allOptions);
            
      // Clean up the original fields since we now have options array
      delete q.correct_answer;
      delete q.wrong_answers;
    });

    // Validate each question has required fields
    for (const q of quizData.questions) {
      if (!q.prompt || !q.code_snippet || !q.options || !Array.isArray(q.options) || q.options.length !== 4) {
        throw new Error('Invalid question format - must have exactly 4 options');
      }
      
      // Ensure exactly one option is marked as correct
      const correctOptions = q.options.filter(opt => opt.isCorrect);
      if (correctOptions.length !== 1) {
        throw new Error(`Question ${q.id}: Must have exactly one correct option, found ${correctOptions.length}`);
      }
    }

    return quizData;

  } catch (error) {
    console.error('Failed to fetch follow-up quiz from API:', error);
    throw error; // Re-throw the error instead of falling back
  }
}
