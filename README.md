# Reading Comp

Reading comprehension & summary practice for 7th grade. Students read a short 1–2 paragraph story (from a built-in bank of reviewed stories), write a summary, and an AI (Groq by default, or Google Gemini / Claude) grades it on the class scale:

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

Requires Node 18+ and a free Groq API key: sign up at https://console.groq.com, then **API Keys → Create API Key**. No credit card needed.

```bash
npm install
GROQ_API_KEY=gsk_... TEACHER_PASSWORD=pick-something npm start
```

Windows (PowerShell):

```powershell
$env:GROQ_API_KEY="gsk_..."; $env:TEACHER_PASSWORD="pick-something"; npm start
```

- Students: http://localhost:3000 (they type their name, read, summarize, get a grade)
- Teacher: http://localhost:3000/teacher (enter `TEACHER_PASSWORD`)

Optional environment variables:

- `PORT` – default `3000`
- `TEACHER_PASSWORD` – required for the teacher gradebook; without it `/teacher` stays locked
- `DATA_FILE` – where submissions are saved, default `data/submissions.json`
- `SHEETS_WEBHOOK_URL`, `SHEETS_SECRET` – optional, copy every grade to a Google Sheet (see below)
- `AI_PROVIDER` – `groq` (default), `gemini`, or `claude`
- `GROQ_MODEL` – default `openai/gpt-oss-120b`. Groq retires models regularly; if you get "model not found" errors, pick a current one from https://console.groq.com/docs/models.
- `STORY_SOURCE` – `bank` (default: stories from `stories.json`, instant and free) or `ai` (the AI writes a new story every time; uses up the free rate limit fast)
- `GEMINI_API_KEY` – needed only with `AI_PROVIDER=gemini` (free key from https://aistudio.google.com/apikey; school Google accounts usually can't create one)
- `GEMINI_MODEL` – default `gemini-2.5-flash`. If Google retires it, set this to their current free Flash model.
- `CLAUDE_MODEL` – default `claude-haiku-5-5`, run at low effort (paid, but roughly 10 cents for a whole class). Needs `ANTHROPIC_API_KEY`.

## Before using this with students: read the AI provider's terms

- **Age:** check the provider's terms (Groq: https://groq.com/terms-of-use; Gemini: https://ai.google.dev/gemini-api/terms) for age requirements and rules about apps used by minors. A 7th-grade class is under 18.
- **Data:** check how the provider uses what's sent on the free tier. Stories and student summaries go to the AI; student names do **not** (they stay on this server).
- **Rate limits:** Groq's free tier allows about 8,000 tokens per minute (roughly 7 grades per minute) and 1,000 requests per day. When a whole class submits at once, summaries wait in line and are graded one after another; students see a "you're in line" message. With 25 students submitting at the same moment, the last one waits about 4 minutes. Staggering submissions helps.

If any of that is a problem, switch providers with `AI_PROVIDER` (e.g. `claude` with an `ANTHROPIC_API_KEY`); nothing else changes.

## Teacher gradebook

`/teacher` shows every graded submission: time, student name, story, grade, and summary. Click a row to see the full summary, the feedback the student got, and the story they read. You can search by student or story, filter by grade, show only each student's latest attempt, download everything as a CSV (opens in Excel / Google Sheets), or clear the list.

Submissions are saved to a JSON file on the server. On free hosting (like Render's free plan) that file is **wiped whenever the app restarts or wakes from sleep**, so either download the CSV after each class or set up the Google Sheet below.

## Save grades to a Google Sheet (recommended on free hosting)

Every graded summary is also added as a row in a Google Sheet, so grades are never lost. Takes about 5 minutes. Use a personal Google account; school accounts often block Apps Script.

1. Create a new Google Sheet (name it something like "Summary Grades").
2. In the Sheet: **Extensions → Apps Script**. Delete what's there and paste in all of [`scripts/google-sheet.gs`](scripts/google-sheet.gs).
3. At the top of the script, replace `PASTE-YOUR-SECRET-HERE` with a long made-up phrase (e.g. `purple-otter-ladder-7392`). Click **Save** (disk icon).
4. Click **Deploy → New deployment**. Click the gear next to "Select type" → **Web app**. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone

   Click **Deploy**, then **Authorize access** and pick your account. Google will warn "Google hasn't verified this app": click **Advanced → Go to (your project) (unsafe)** → **Allow**. (It's your own script, only writing to your own sheet.)
5. Copy the **Web app URL** (ends in `/exec`).
6. In Render → your service → **Environment**, add:
   - `SHEETS_WEBHOOK_URL` = the Web app URL
   - `SHEETS_SECRET` = the same phrase from step 3

   Save; Render restarts the app.
7. Open `/teacher`, log in, click **Test Google Sheet**. A test row should appear on a "Grades" tab in your Sheet.

If you change the script later, you must **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** for changes to take effect (the URL stays the same).

"Who has access: Anyone" only means the app can send rows without logging in to Google; nobody can *read* your sheet, and the secret stops strangers from adding rows. If Google is briefly down, the app retries in the background for a few minutes.

## Story bank

`stories.json` holds the stories students read. Edit it by hand (each entry is `{"title": ..., "story": ...}`, paragraphs separated by a blank line), or regenerate it with AI and then **read every story before using it**:

```bash
GROQ_API_KEY=gsk_... node scripts/make-stories.mjs
```

Each browser remembers which stories it has seen, so "New story" won't repeat until a student has read them all.

## How it works

- `stories.json` – the story bank; `stories.js` – AI story writing (for `STORY_SOURCE=ai` and the bank script)
- `llm.js` – the AI layer: Groq or Gemini via their REST APIs, or Claude via the Anthropic SDK. Every answer is checked against the same schema.
- `server.js` – tiny Node server with endpoints `POST /api/story`, `POST /api/grade`, and the password-protected `GET`/`DELETE /api/submissions`. The grading rubric lives in `GRADER_SYSTEM`; edit it to tune strictness.
- `public/index.html` – the student page (no build step).
- `public/teacher.html` – the teacher gradebook.
- `scripts/google-sheet.gs` – Google Apps Script that receives grades and appends them to a Sheet.

The API key stays on the server; students never see it.
