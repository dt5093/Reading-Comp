// AI provider layer. One function, generateJson(), that returns a validated
// JSON object from either Google Gemini (default, free tier) or Claude.
//
//   AI_PROVIDER=gemini  (default)  needs GEMINI_API_KEY
//   AI_PROVIDER=claude             needs ANTHROPIC_API_KEY

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

export const MODEL = PROVIDER === "claude" ? CLAUDE_MODEL : GEMINI_MODEL;

if (!["gemini", "claude"].includes(PROVIDER)) {
  throw new Error(`AI_PROVIDER must be "gemini" or "claude", got "${PROVIDER}"`);
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
  return PROVIDER === "claude" ? claudeJson(opts) : geminiJson(opts);
}

// ---------- Gemini (REST) ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // The free tier allows only a handful of requests per minute, so when a whole
  // class hits "submit" together, wait and retry instead of failing right away.
  const waits = [2000, 5000, 10000, 20000];
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
      });
    } catch (err) {
      throw new AIError("connection", `Could not reach Gemini: ${err.message}`);
    }
    const retryable = res.status === 429 || res.status === 500 || res.status === 503;
    if (!retryable || attempt >= waits.length) break;
    await sleep(waits[attempt] + Math.random() * 1000);
  }

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
