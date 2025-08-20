const fetch = require('node-fetch');

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

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { topic, difficulty, numQuestions, previousQuiz } = JSON.parse(event.body);
    
    // Get API key from environment variable
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({ error: 'OpenAI API key not configured' })
      };
    }

    // Validate required parameters
    if (!topic || !difficulty || !numQuestions) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({ error: 'Missing required parameters: topic, difficulty, numQuestions' })
      };
    }

    // Configure OpenAI API endpoint
    const baseUrl = 'https://api.openai.com/v1';
    const authHeader = `Bearer ${apiKey}`;

    let systemPrompt, userPrompt;

    if (previousQuiz) {
      // Generate follow-up quiz
      const previousContext = JSON.stringify({
        topic: previousQuiz.topic,
        difficulty: previousQuiz.difficulty,
        questions: previousQuiz.questions.map(q => ({
          prompt: q.prompt,
          code_snippet: q.code_snippet,
          explanation: q.explanation
        }))
      });

      systemPrompt = `You are a code quiz generator creating follow-up quizzes. Given a previous quiz context, create new programming questions that build upon or complement the previous material without repeating the same concepts. Each question must have exactly one "____" placeholder in the code_snippet that students will fill. Provide one correct answer and exactly 3 incorrect/alternative answers separately.`;

      userPrompt = `Create a ${difficulty} level follow-up quiz about "${topic}" with exactly ${numQuestions} questions. 

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
    } else {
      // Generate new quiz
      systemPrompt = `You are a code quiz generator. Create programming quizzes with fill-in-the-blank questions where students complete code snippets. Each question must have exactly one "____" placeholder in the code_snippet that students will fill. Provide one correct answer and exactly 3 incorrect/alternative answers separately.

Generate a ${difficulty} level quiz about "${topic}" with exactly ${numQuestions} questions. Each question should:
1. Have a clear, specific prompt asking what to fill in the blank. The prompt must not be ambiguous or vague, or give away the answer.
2. Include a code_snippet with exactly one "____" (4 underscores) placeholder.
3. Provide one correct_answer and exactly 3 wrong_answers. Wrong answers should not be partially correct or technically accurate.
4. Include a helpful explanation.
5. Use realistic, practical coding scenarios.
6. Ensure the code_snippet is syntactically correct when the correct_answer fills the blank.
7. There must always be a change required to the code. Do not return complete code.

Make sure the quiz covers different aspects of ${topic} and progresses appropriately for ${difficulty} level.`;

      userPrompt = `Generate exactly ${numQuestions} questions following the schema provided.`;
    }

    // Make streaming request to OpenAI
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'quiz_generation',
            schema: QUIZ_SCHEMA,
            strict: true
          }
        },
        stream: true,
        max_tokens: 4000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API Error:', response.status, errorText);
      return {
        statusCode: response.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({ 
          error: `OpenAI API error: ${response.status}`,
          details: errorText
        })
      };
    }

    // Set up streaming response
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // For Netlify functions, we need to handle streaming differently
    // We'll collect all chunks and return the complete response
    let buffer = '';
    let quizData = null;
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          
          if (trimmed.startsWith('data: ')) {
            try {
              const jsonStr = trimmed.slice(6);
              const parsed = JSON.parse(jsonStr);
              
              if (parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                
                // Try to parse as complete JSON
                try {
                  const potentialQuiz = JSON.parse(content);
                  if (potentialQuiz.questions && Array.isArray(potentialQuiz.questions)) {
                    quizData = potentialQuiz;
                    break;
                  }
                } catch (e) {
                  // Not complete JSON yet, continue collecting
                }
              }
            } catch (e) {
              // Skip malformed JSON
              continue;
            }
          }
        }

        if (quizData) break;
      }

      // Process any remaining buffer content
      if (!quizData && buffer.trim()) {
        try {
          const potentialQuiz = JSON.parse(buffer.trim());
          if (potentialQuiz.questions && Array.isArray(potentialQuiz.questions)) {
            quizData = potentialQuiz;
          }
        } catch (e) {
          // Final attempt failed
        }
      }

    } finally {
      reader.releaseLock();
    }

    if (!quizData) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({ error: 'Failed to parse quiz data from OpenAI response' })
      };
    }

    // Process quiz data (same as client-side processing)
    quizData.questions.forEach((q, idx) => {
      q.id = idx + 1;
      const allOptions = [
        { option: q.correct_answer, isCorrect: true },
        ...q.wrong_answers.map(ans => ({ option: ans, isCorrect: false }))
      ];
      
      // Shuffle options
      for (let i = allOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
      }
      
      q.options = allOptions;
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(quizData)
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message
      })
    };
  }
};
