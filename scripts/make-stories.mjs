// Rebuild the built-in story bank: one AI-written story per theme.
//   GROQ_API_KEY=... node scripts/make-stories.mjs            -> writes stories.json
//   GROQ_API_KEY=... node scripts/make-stories.mjs out.json   -> writes somewhere else
// Read the results before using them with students!

import fs from "node:fs/promises";
import { generateStory, THEMES } from "../stories.js";

const out = process.argv[2] || new URL("../stories.json", import.meta.url);
const stories = [];
for (const theme of THEMES) {
  try {
    const s = await generateStory(theme);
    stories.push(s);
    console.log(`ok   ${theme}: "${s.title}" (${s.story.split(/\s+/).length} words)`);
  } catch (err) {
    console.log(`FAIL ${theme}: ${err.message}`);
  }
}
await fs.writeFile(out, JSON.stringify(stories, null, 2) + "\n");
console.log(`\nWrote ${stories.length} stories.`);
