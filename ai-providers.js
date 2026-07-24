/* ==========================================================================
   SCHOLAR'S CAMP LMS — FREE AI PROVIDER LAYER
   Tries each configured free provider in order and automatically falls
   back to the next one if a call fails or is rate-limited, per spec §1.
   >>> Add your free API keys below. Leave a key blank to skip that provider. <<<
   ========================================================================== */

const PROVIDER_KEYS = {
  gemini:     "YOUR_GEMINI_API_KEY",      // https://aistudio.google.com/app/apikey (free tier)
  huggingface:"YOUR_HUGGINGFACE_API_KEY", // https://huggingface.co/settings/tokens (free tier)
  cloudflare: {                            // https://developers.cloudflare.com/workers-ai (free tier)
    accountId: "YOUR_CLOUDFLARE_ACCOUNT_ID",
    apiToken:  "YOUR_CLOUDFLARE_API_TOKEN"
  },
  ollamaUrl:  "http://localhost:11434"     // optional self-hosted fallback, only reachable on local networks
};

const PROVIDER_ORDER = ['gemini', 'huggingface', 'cloudflare', 'ollama'];

async function callGemini(prompt){
  const key = PROVIDER_KEYS.gemini;
  if(!key || key.startsWith('YOUR_')) throw new Error('gemini not configured');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] })
  });
  if(!res.ok) throw new Error('gemini request failed');
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callHuggingFace(prompt){
  const key = PROVIDER_KEYS.huggingface;
  if(!key || key.startsWith('YOUR_')) throw new Error('huggingface not configured');
  const res = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3', {
    method:'POST', headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ inputs: prompt, parameters:{ max_new_tokens: 512 } })
  });
  if(!res.ok) throw new Error('huggingface request failed');
  const data = await res.json();
  return Array.isArray(data) ? (data[0]?.generated_text || '') : (data?.generated_text || '');
}

async function callCloudflare(prompt){
  const { accountId, apiToken } = PROVIDER_KEYS.cloudflare;
  if(!accountId || accountId.startsWith('YOUR_')) throw new Error('cloudflare not configured');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3-8b-instruct`, {
    method:'POST', headers:{ 'Authorization':`Bearer ${apiToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ messages:[{ role:'user', content: prompt }] })
  });
  if(!res.ok) throw new Error('cloudflare request failed');
  const data = await res.json();
  return data?.result?.response || '';
}

async function callOllama(prompt){
  const res = await fetch(`${PROVIDER_KEYS.ollamaUrl}/api/generate`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ model:'llama3', prompt, stream:false })
  });
  if(!res.ok) throw new Error('ollama request failed');
  const data = await res.json();
  return data?.response || '';
}

const CALLERS = { gemini: callGemini, huggingface: callHuggingFace, cloudflare: callCloudflare, ollama: callOllama };

/**
 * askAi — sends a prompt to the first available free provider, falling back
 * automatically through PROVIDER_ORDER if a provider errors out or isn't configured.
 * Returns { text, provider } or throws if every provider fails.
 */
export async function askAi(prompt){
  const errors = [];
  for(const name of PROVIDER_ORDER){
    try{
      const text = await CALLERS[name](prompt);
      if(text && text.trim()) return { text: text.trim(), provider: name };
    }catch(err){ errors.push(`${name}: ${err.message}`); }
  }
  throw new Error('All AI providers are currently unavailable. ' + errors.join(' | '));
}

/* ---------- Higher-level helpers used by the dashboards ---------- */
export const aiTutorPrompt = (subject, question) =>
  `You are a patient, encouraging tutor for a K-12/A-Level student studying ${subject}. ` +
  `Explain step by step, use simple language, and end with a short check-for-understanding question. Question: ${question}`;

export const aiHomeworkPrompt = (subject, task) =>
  `You are a homework assistant for ${subject}. Guide the student toward the answer with hints first, ` +
  `then give the full worked solution. Task: ${task}`;

export const aiExamGeneratorPrompt = (subject, level, topic, count) =>
  `Generate ${count} exam questions (mix of objective with 4 options and short theory) for ${subject}, ` +
  `class level ${level}, topic "${topic}". Return as a numbered list with answers marked clearly at the end.`;

export const aiLessonPlannerPrompt = (subject, level, topic, weeks) =>
  `Create a ${weeks}-week lesson plan for teaching "${topic}" in ${subject} to ${level} students. ` +
  `Include weekly objectives, activities, and an assessment idea for each week.`;

export const aiTranslatePrompt = (text, targetLanguage) =>
  `Translate the following text into ${targetLanguage}. Only return the translation, no notes:\n\n${text}`;
