# Reading Comp

Reading comprehension & summary practice for 7th grade. Claude writes a fresh 1–2 paragraph story, the student writes a summary, and Claude grades it on the class scale:

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

Requires Node 18+ and an Anthropic API key.

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... TEACHER_PASSWORD=pick-something npm start
```

- Students: http://localhost:3000 (they type their name, read, summarize, get a grade)
- Teacher: http://localhost:3000/teacher (enter `TEACHER_PASSWORD`)

Optional environment variables:

- `PORT` – default `3000`
- `TEACHER_PASSWORD` – required for the teacher gradebook; without it `/teacher` stays locked
- `DATA_FILE` – where submissions are saved, default `data/submissions.json`
- `CLAUDE_MODEL` – default `claude-opus-5-5`. `claude-haiku-5-5` is much cheaper if cost matters for a whole class.

## Teacher gradebook

`/teacher` shows every graded submission: time, student name, story, grade, and summary. Click a row to see the full summary, the feedback the student got, and the story they read. You can search by student or story, filter by grade, show only each student's latest attempt, download everything as a CSV (opens in Excel / Google Sheets), or clear the list.

Submissions are saved to a JSON file on the server. If you host it somewhere with a temporary disk (e.g. free tiers that reset on redeploy), download the CSV regularly or attach a persistent disk and point `DATA_FILE` at it.

## How it works

- `server.js` – tiny Node server with endpoints `POST /api/story`, `POST /api/grade`, and the password-protected `GET`/`DELETE /api/submissions`. Both use structured outputs so responses are always valid JSON. The grading rubric lives in `GRADER_SYSTEM`; edit it to tune strictness.
- `public/index.html` – the student page (no build step).
- `public/teacher.html` – the teacher gradebook.

The API key stays on the server; students never see it.
