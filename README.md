# Reading Comp

Reading comprehension & summary practice for 7th grade. An AI (Google Gemini by default, or Claude) writes a fresh 1–2 paragraph story, the student writes a summary, and the AI grades it on the class scale:

| Grade | Meaning |
|---|---|
| 4 | Excellent: main character, problem, key events in order, ending, own words, concise |
| 3+ | Very good, one small gap |
| 3 | Good: main idea + most key events, but misses something or includes extra detail |
| 2+ | Understood the basics, but missing several key events or mostly retelling |
| 2 | Only part of the story, misunderstandings, or mostly copied |
| 1 | Little to no evidence of understanding |

Grading is intentionally lenient: ties go to the higher grade, and spelling/grammar don't count against students unless the summary is unreadable. Each grade comes with kid-friendly feedback (what went well + what to try next).

## Run it

Requires Node 18+ and a free Gemini API key from https://aistudio.google.com/apikey.

```bash
npm install
GEMINI_API_KEY=... TEACHER_PASSWORD=pick-something npm start
```

Windows (PowerShell):

```powershell
$env:GEMINI_API_KEY="..."; $env:TEACHER_PASSWORD="pick-something"; npm start
```

- Students: http://localhost:3000 (they type their name, read, summarize, get a grade)
- Teacher: http://localhost:3000/teacher (enter `TEACHER_PASSWORD`)

Optional environment variables:

- `PORT` – default `3000`
- `TEACHER_PASSWORD` – required for the teacher gradebook; without it `/teacher` stays locked
- `DATA_FILE` – where submissions are saved, default `data/submissions.json`
- `AI_PROVIDER` – `gemini` (default) or `claude`
- `GEMINI_MODEL` – default `gemini-2.5-flash`. If Google retires it, set this to their current free Flash model.
- `CLAUDE_MODEL` – default `claude-haiku-5-5`, run at low effort (paid, but roughly 10 cents for a whole class). Needs `ANTHROPIC_API_KEY`.

## Before using this with students: read Google's terms

- **Age:** check the Gemini API terms (https://ai.google.dev/gemini-api/terms) for restrictions on apps used by people under 18. A 7th-grade class is squarely in that group.
- **Data:** on the free tier, Google may use what's sent (stories and student summaries) to improve its products, and humans may review it. Student names are **not** sent to the AI; they stay on this server.
- **Rate limits:** the free tier allows only a few requests per minute. The app waits and retries automatically, but if a whole class submits at once some students may see "try again in a minute." Staggering submissions helps.

If any of that is a problem, switch to Claude with `AI_PROVIDER=claude` and an `ANTHROPIC_API_KEY`; nothing else changes.

## Teacher gradebook

`/teacher` shows every graded submission: time, student name, story, grade, and summary. Click a row to see the full summary, the feedback the student got, and the story they read. You can search by student or story, filter by grade, show only each student's latest attempt, download everything as a CSV (opens in Excel / Google Sheets), or clear the list.

Submissions are saved to a JSON file on the server. If you host it somewhere with a temporary disk (e.g. free tiers that reset on redeploy), download the CSV regularly or attach a persistent disk and point `DATA_FILE` at it.

## How it works

- `llm.js` – the AI layer: Gemini via its REST API, or Claude via the Anthropic SDK. Both return JSON checked against the same schema.
- `server.js` – tiny Node server with endpoints `POST /api/story`, `POST /api/grade`, and the password-protected `GET`/`DELETE /api/submissions`. Both use structured outputs so responses are always valid JSON. The grading rubric lives in `GRADER_SYSTEM`; edit it to tune strictness.
- `public/index.html` – the student page (no build step).
- `public/teacher.html` – the teacher gradebook.

The API key stays on the server; students never see it.
