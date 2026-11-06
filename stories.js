// AI story writing. Used by the server when STORY_SOURCE=ai, and by
// scripts/make-stories.mjs to (re)build the built-in story bank.

import { z } from "zod";
import { generateJson } from "./llm.js";

export const StorySchema = z.object({
  title: z.string(),
  story: z.string().describe("The story text, paragraphs separated by blank lines"),
});

const StoryGeminiSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    story: { type: "STRING", description: "The story text, paragraphs separated by blank lines" },
  },
  required: ["title", "story"],
  propertyOrdering: ["title", "story"],
};

export const THEMES = [
  "friendship", "a mystery at school", "a family secret", "an unexpected talent",
  "a camping trip gone wrong", "a lost pet", "a science fair", "moving to a new town",
  "a sports team underdog", "a kind stranger", "a strange old shop", "a storm",
  "a sibling rivalry", "a time capsule", "learning from a mistake", "a garden",
  "a contest", "an old letter", "a field trip", "standing up for someone",
  "a broken promise", "a talent show", "a new kid at school", "a grandparent's story",
];

export async function generateStory(theme = THEMES[Math.floor(Math.random() * THEMES.length)]) {
  const result = await generateJson({
    system:
      "You write original short stories for 7th-grade (age 12-13) reading comprehension practice. " +
      "Stories are school-appropriate, engaging, and written at roughly a 6th-7th grade reading level. " +
      "Use correct spelling and grammar.",
    prompt:
      `Write a brand-new very short story (1-2 paragraphs, 120-220 words total) loosely about: ${theme}.\n\n` +
      "Requirements:\n" +
      "- A clear main character with a problem or goal\n" +
      "- A clear beginning, middle, and end, with 2-4 key events a student could summarize\n" +
      "- A few minor details that are NOT essential (so students practice leaving them out)\n" +
      "- A satisfying resolution and an implied lesson or theme\n" +
      "- Exactly 1 or 2 paragraphs, separated by a blank line; vary sentence length; some vivid vocabulary but nothing obscure\n" +
      'Respond with JSON: {"title": ..., "story": ...}',
    zodSchema: StorySchema,
    geminiSchema: StoryGeminiSchema,
  });
  // Normalize paragraph breaks to one blank line.
  result.story = result.story.trim().split(/\n\s*/).filter(Boolean).join("\n\n");
  return result;
}
