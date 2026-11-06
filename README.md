# Reading Comp

Reading comprehension & summary practice for 7th grade. Claude writes a fresh short story, the student writes a summary, and Claude grades it on the class scale:

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
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Open http://localhost:3000.

Optional environment variables:

- `PORT` – default `3000`
- `CLAUDE_MODEL` – default `claude-opus-5-5`. `claude-haiku-5-5` is much cheaper if cost matters for a whole class.

## How it works

- `server.js` – tiny Node server with two endpoints: `POST /api/story` and `POST /api/grade`. Both use structured outputs so responses are always valid JSON. The grading rubric lives in `GRADER_SYSTEM`; edit it to tune strictness.
- `public/index.html` – the student page (no build step).

The API key stays on the server; students never see it.
