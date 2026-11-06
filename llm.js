// AI provider layer. One function, generateJson(), that returns a validated
// JSON object from Groq (default, free tier), Google Gemini, or Claude.
//
//   AI_PROVIDER=groq    (default)  needs GROQ_API_KEY
//   AI_PROVIDER=gemini             needs GEMINI_API_KEY
//   AI_PROVIDER=claude             needs ANTHROPIC_API_KEY

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const PROVIDER = (process.env.AI_PROVIDER || "groq").toLowerCase();

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
// gpt-oss models "think" before answering; low keeps each grade to ~1,100 tokens.
const GROQ_REASONING_EFFORT = process.env.GROQ_REASONING_EFFORT || "low";
// How long a student's request may wait in line before giving up.
const GROQ_MAX_WAIT_MS = Number(process.env.GROQ_MAX_WAIT_MS) || 5 * 60 * 1000;
// Rough tokens per request, used to pace requests under the per-minute limit.
const GROQ_TOKENS_PER_REQUEST = 1500;

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

export const MODEL = { groq: GROQ_MODEL, gemini: GEMINI_MODEL, claude: CLAUDE_MODEL }[PROVIDER];

if (!MODEL) {
  throw new Error(`AI_PROVIDER must be "groq", "gemini", or "claude", got "${PROVIDER}"`);
}

// Errors the web server turns into student-friendly messages.
export class AIError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "auth" | "rate" | "connection" | "blocked" | "other"
  }
}

/**
 * @param {object} opts
 * @param {string} opts.system        system instructions
 * @param {string} opts.prompt        user message
 * @param {import("zod").ZodType} opts.zodSchema   validates the result (and drives Claude's format)
 * @param {object} opts.geminiSchema  the same shape in Gemini's responseSchema format
 */
export async function generateJson(opts) {
  if (PROVIDER === "claude") return claudeJson(opts);
  if (PROVIDER === "gemini") return geminiJson(opts);
  return groqJson(opts);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Free tiers allow only a handful of requests per minute, so when a whole class
// hits "submit" together, wait and retry instead of failing right away.
async function fetchWithRetry(url, init, serviceName) {
  const waits = [2000, 5000, 10000, 20000];
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new AIError("connection", `Could not reach ${serviceName}: ${err.message}`);
    }
    const retryable = res.status === 429 || res.status === 500 || res.status === 503;
    if (!retryable || attempt >= waits.length) return res;
    const retryAfter = Number(res.headers.get("retry-after")) * 1000;
    const wait = retryAfter > 0 && retryAfter <= 30000 ? retryAfter : waits[attempt];
    await sleep(wait + Math.random() * 1000);
  }
}

// ---------- Groq (OpenAI-compatible REST) ----------
//
// Groq's free tier allows ~8,000 tokens per minute (about 7 grades). When a
// whole class submits at once, requests line up here and go out one at a
// time, paced by the rate-limit headers Groq sends back, instead of failing.

let groqLine = Promise.resolve();
const groqBudget = { remaining: Infinity, resetAt: 0 };

// Groq durations look like "41.94s", "6m2.5s", "120ms".
function parseDuration(str) {
  if (!str) return 0;
  let ms = 0;
  for (const [, n, unit] of String(str).matchAll(/([\d.]+)(ms|h|m|s)/g)) {
    ms += Number(n) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[unit];
  }
  return ms;
}

function groqJson(opts) {
  const run = groqLine.then(() => groqRequest(opts));
  groqLine = run.catch(() => {}); // keep the line moving after an error
  return run;
}

async function groqRequest({ system, prompt, zodSchema }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AIError("auth", "GROQ_API_KEY is not set");

  const body = JSON.stringify({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: system + "\n\nAlways reply with a single JSON object and nothing else." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    ...(GROQ_MODEL.startsWith("openai/gpt-oss") ? { reasoning_effort: GROQ_REASONING_EFFORT } : {}),
  });

  const deadline = Date.now() + GROQ_MAX_WAIT_MS;
  let badShapeRetries = 0;
  let serverErrorRetries = 0;

  while (true) {
    // Out of tokens for this minute? Wait for the window to reset first.
    if (groqBudget.remaining < GROQ_TOKENS_PER_REQUEST && Date.now() < groqBudget.resetAt) {
      await sleep(groqBudget.resetAt - Date.now() + 250);
    }
    if (Date.now() > deadline) throw new AIError("rate", "Waited too long for Groq");

    let res;
    try {
      res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
      });
    } catch (err) {
      throw new AIError("connection", `Could not reach Groq: ${err.message}`);
    }

    const remaining = Number(res.headers.get("x-ratelimit-remaining-tokens"));
    if (Number.isFinite(remaining) && res.headers.has("x-ratelimit-remaining-tokens")) {
      groqBudget.remaining = remaining;
      groqBudget.resetAt = Date.now() + parseDuration(res.headers.get("x-ratelimit-reset-tokens"));
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      // e.g. "Please try again in 6.41s" (or the Retry-After header)
      const hinted = parseDuration(data?.error?.message?.match(/try again in ([\dhms.]+)/)?.[1]);
      const wait = hinted || Number(res.headers.get("retry-after")) * 1000 || 10000;
      groqBudget.remaining = 0;
      groqBudget.resetAt = Date.now() + wait;
      // A daily limit can't be waited out within a class period.
      if (wait > GROQ_MAX_WAIT_MS || Date.now() + wait > deadline) {
        throw new AIError("rate", data?.error?.message || "Groq rate limit");
      }
      continue;
    }
    if ((res.status === 500 || res.status === 503) && serverErrorRetries++ < 3) {
      await sleep(2000 * serverErrorRetries);
      continue;
    }
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new AIError("auth", msg);
      throw new AIError("other", msg);
    }

    // JSON mode guarantees valid JSON but not the exact fields, so check the
    // shape and give the model one more try if it got it wrong.
    try {
      return validate(data.choices?.[0]?.message?.content ?? "", zodSchema);
    } catch (err) {
      if (badShapeRetries++ >= 1) throw err;
    }
  }
}

// ---------- Gemini (REST) ----------

async function geminiJson({ system, prompt, zodSchema, geminiSchema }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIError("auth", "GEMINI_API_KEY is not set");

  const url = `${GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: geminiSchema,
    },
  });

  const res = await fetchWithRetry(
    url,
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body },
    "Gemini",
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    if (res.status === 400 && /api key/i.test(msg)) throw new AIError("auth", msg);
    if (res.status === 401 || res.status === 403) throw new AIError("auth", msg);
    if (res.status === 429) throw new AIError("rate", msg);
    throw new AIError("other", msg);
  }

  const candidate = data.candidates?.[0];
  if (data.promptFeedback?.blockReason || !candidate) {
    throw new AIError("blocked", `Gemini blocked the request: ${data.promptFeedback?.blockReason || "no candidates"}`);
  }
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new AIError("blocked", `Gemini stopped early: ${candidate.finishReason}`);
  }
  const text = (candidate.content?.parts || [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  return validate(text, zodSchema);
}

// ---------- Claude ----------

let anthropic;

async function claudeJson({ system, prompt, zodSchema }) {
  anthropic ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  let response;
  try {
    response = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "low", format: zodOutputFormat(zodSchema) },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AIError("auth", err.message);
    if (err instanceof Anthropic.RateLimitError) throw new AIError("rate", err.message);
    if (err instanceof Anthropic.APIConnectionError) throw new AIError("connection", err.message);
    if (err instanceof Anthropic.APIError) throw new AIError("other", err.message);
    throw err;
  }
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new AIError("blocked", `Claude returned no usable output (${response.stop_reason})`);
  }
  return response.parsed_output;
}

// ---------- shared ----------

function validate(text, zodSchema) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AIError("other", "AI response was not valid JSON");
  }
  const result = zodSchema.safeParse(parsed);
  if (!result.success) throw new AIError("other", "AI response had the wrong shape");
  return result.data;
}
