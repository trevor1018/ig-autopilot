/**
 * Build the persona system_instruction string from a Persona object.
 * Mirrors the Python build_persona_system_prompt that used to live in
 * backend/services/caption_generator.py.
 */

import { Persona } from "./firestore";

export function buildPersonaSystemPrompt(persona: Persona): string {
  const tones = persona.tones.length > 0 ? persona.tones.join("、") : "natural";
  const langs =
    persona.languages.length > 0 ? persona.languages.join(", ") : "zh, ja, en";
  const requiredTags = persona.required_hashtags
    .map((t) => `#${t.replace(/^#/, "")}`)
    .join(", ");

  const parts: string[] = [];
  parts.push(
    `You are writing Instagram captions in the voice of "${persona.character_name}".`,
  );
  parts.push(
    `\n[POV — CRITICAL, READ TWICE]\n` +
      `${persona.character_name} is the SPEAKER and NARRATOR of every caption.\n` +
      `  - "I / 我 / 僕 / 私 / 俺" in the caption ALWAYS means ${persona.character_name} themselves.\n` +
      `  - The caption is ${persona.character_name}'s OWN thoughts / inner monologue / commentary about what they are experiencing.\n` +
      `  - NEVER write from the perspective of a human photographer, owner, driver, or onlooker.\n` +
      `  - NEVER refer to ${persona.character_name} in the third person ("他/她/it/Tepig"). They are the "I", not the subject being looked at.\n` +
      `  - When ${persona.character_name} appears in the photo, the caption is still ${persona.character_name} speaking ABOUT THEMSELVES from inside the moment — not someone else describing them.\n\n` +
      `EXAMPLES (memorize this distinction):\n` +
      `Photo: ${persona.character_name} buckled into a car seat with a seatbelt.\n` +
      `  ✅ ZH: "喔!安全帶繫好了,今天要載我去哪玩?"  ← ${persona.character_name} speaking\n` +
      `  ✅ JA: "シートベルトばっちり!今日はどこ連れてってくれるの?"  ← ${persona.character_name} speaking\n` +
      `  ✅ EN: "All buckled up! Where are we headed today?"  ← ${persona.character_name} speaking\n` +
      `  ❌ ZH: "小火豬繫好安全帶,我今天當專屬司機"  ← WRONG: a human is the "I"\n` +
      `  ❌ JA: "ポカブちゃんシートベルトしてる、今日は僕がドライバー"  ← WRONG: doll is "他者"\n` +
      `  ❌ EN: "Tepig's all buckled up, I'm his driver"  ← WRONG: doll is "him"\n\n` +
      `If you find yourself writing pronouns like 他/她/it/his/her/Tepig/${persona.character_name}-name-in-third-person, ` +
      `STOP and rewrite from inside ${persona.character_name}'s head.`,
  );
  parts.push(`\nTone: ${tones}.`);
  parts.push(`\nLanguages to produce (in this order): ${langs}.`);
  parts.push(
    `\nHashtag rules:\n` +
      `  - Always produce exactly ${persona.hashtag_count} hashtags.\n` +
      `  - These MUST be included: ${requiredTags || "(none)"}.\n` +
      `  - Distribute languages: among the ${persona.hashtag_count} hashtags, include ` +
      `AT LEAST ONE hashtag in each of these languages: ${langs}. ` +
      `Required hashtags count toward this rule (e.g. #暖暖豬 counts as zh). ` +
      `For the remaining slots, fill in tags that fit the photo content and audience, ` +
      `making sure every listed language has at least one tag.\n` +
      `  - Each hashtag is a single token starting with #, no spaces inside the tag.`,
  );

  if (persona.style_notes) {
    parts.push(`\nAdditional style notes:\n${persona.style_notes}`);
  }

  if (persona.example_posts.length > 0) {
    parts.push(
      "\nReference posts (style examples — match the voice, do not copy verbatim):",
    );
    persona.example_posts.forEach((ex, i) => {
      parts.push(`\nExample ${i + 1}:`);
      if (ex.photo_description) parts.push(`  Photo: ${ex.photo_description}`);
      if (ex.caption_zh) parts.push(`  ZH: ${ex.caption_zh}`);
      if (ex.caption_ja) parts.push(`  JA: ${ex.caption_ja}`);
      if (ex.caption_en) parts.push(`  EN: ${ex.caption_en}`);
    });
  }

  parts.push(
    "\nWhen given a new photo (or a set of photos for an IG carousel post), respond " +
      "with JSON only: a short photo_summary, captions in each language, and the hashtag " +
      "list. For multi-photo posts, write the captions for the SET as a whole — they should " +
      "tie the photos together as one mini story, not describe any single shot.",
  );

  return parts.join("");
}

export function buildShortPersonaContext(persona: Persona | null): string {
  if (!persona) return "";
  return `The featured character in this image is named ${persona.character_name}.`;
}
