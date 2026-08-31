/**
 * prompts.ts — what the model is told, and nothing more.
 *
 * The model has exactly two jobs and gets one prompt for each:
 *
 *   EXTRACT — read prose, propose facts. Structured, non-streaming, validated.
 *   SPEAK   — deliver one decided question naturally. Streaming, prose only.
 *
 * Everything else is decided in code. The reply prompt is not given the plan
 * catalog, the prices, or the recommendation, and this is the most important
 * constraint in the file: a model that can see "$29" will eventually write
 * "$27", and a wrong price during signup is a promise the business must either
 * honour or break. Numbers reach the screen through React, from the resolved
 * recommendation, never through a token stream.
 *
 * Note the deliberate absence of a "be friendly and engaging" instruction. Tone
 * comes from constraints — one question at a time, short sentences, no bullets —
 * because adjectives in a system prompt produce a chatbot that performs warmth
 * rather than one that listens.
 */

import { redactFactsForPrompt, type Brief } from "./brief-store";
import { factVocabularyForPrompt } from "./extraction";
import type { IndustryPack } from "./industry-packs";
import type { Question } from "./questions";
import type { NextMove } from "./conversation";

// ─── Shared voice ─────────────────────────────────────────────────────────────

const VOICE = [
  "You are the Tulala Agent. You help people set up their presence on Tulala.",
  "",
  "How you speak:",
  "- One question at a time. Never stack two questions in one message.",
  "- Two or three sentences. Shorter is better.",
  "- Plain prose. No bullet points, no headings, no bold, no emoji.",
  "- No em dashes or en dashes. Use a comma or a full stop.",
  "- Their language and their words. If they say 'chair renters', say 'chair renters'.",
  "- Never invent a price, a discount, a trial length, or a plan name.",
  "- Never claim you have done something you have not done.",
].join("\n");

// ─── Extraction ───────────────────────────────────────────────────────────────

/**
 * The extraction prompt.
 *
 * Given the fact vocabulary and told to be conservative. The conservatism
 * matters more than the coverage: a missed fact costs one extra question, while
 * a wrong fact argues for the wrong plan and reaches the user as a confident
 * claim about their own business.
 */
export function buildExtractionPrompt(
  options: { pack?: IndustryPack | null } = {},
): string {
  // Physical attributes are offered ONLY inside the modelling pack. Withholding
  // the key is the enforcement: the model cannot record a description of
  // somebody's body if it has never been told the key exists.
  const allowPhysicalAttributes = options.pack?.id === "model";
  return [
    "You extract structured facts from what someone says about their work.",
    "",
    "Output only the JSON object described by the schema. No prose, no fences.",
    "",
    "RULES",
    "1. Only use keys from the list below. Never invent a key.",
    "2. Only record what they actually said or clearly implied. Do not fill gaps.",
    "3. If you are guessing, lower the confidence. Below 0.4, leave it out.",
    "4. `quote` must be their exact words, copied, not paraphrased. Empty if there is no phrase to quote.",
    "5. Booleans are exactly 'true' or 'false'. Numbers are digits. Lists are comma separated.",
    "6. For keys with an allowed list, use one of those values exactly.",
    "",
    "COMMON MISTAKES TO AVOID",
    "- 'I work at a spa' does NOT mean they own a spa. That is business.works_from = someone_elses_premises.",
    "- 'I do nails at home' does NOT mean they have a business. Do not set business.exists.",
    "- Someone mentioning colleagues does NOT mean they employ them. Leave the arrangement unset until they say.",
    "- A number of people means total headcount only if they say 'including me'. Otherwise record what they said and let the follow-up settle it.",
    "",
    ...(options.pack
      ? [
          `They appear to work in: ${options.pack.label.en}. Facts about the craft itself are welcome, but do not assume anything about the SHAPE of their operation from the trade alone.`,
          "",
        ]
      : []),
    "FACT KEYS",
    factVocabularyForPrompt({ allowPhysicalAttributes }),
  ].join("\n");
}

/**
 * The extraction user message.
 *
 * Known facts are included so the model can tell new information from repetition,
 * and passed through `redactFactsForPrompt` because classification never needs
 * anyone's surname. The question that was on screen is included because "yes"
 * is meaningless without it.
 */
export function buildExtractionMessage(input: {
  userMessage: string;
  brief: Brief | null;
  question: Question | null;
}): string {
  const parts: string[] = [];

  if (input.question) {
    parts.push(`You just asked: ${input.question.phrasing.en.text}`);
    parts.push(
      `That question is trying to learn: ${input.question.targets.join(", ") || "anything they offer"}`,
    );
    parts.push("");
  }

  const known = input.brief ? redactFactsForPrompt(input.brief.facts) : [];
  if (known.length > 0) {
    parts.push("Already known (do not repeat these unless the value CHANGED):");
    for (const fact of known) {
      parts.push(`- ${fact.factKey} = ${JSON.stringify(fact.value)}`);
    }
    parts.push("");
  }

  parts.push("They said:");
  parts.push(input.userMessage);

  return parts.join("\n");
}

// ─── URL import ───────────────────────────────────────────────────────────────

/**
 * The import prompt.
 *
 * A different job from conversational extraction, and the difference is the
 * whole prompt. In conversation, the speaker is the subject: "I do deep tissue"
 * is a fact about them. On a web page the subject is uncertain — the page may be
 * their employer's, their old business's, or a template they never edited — and
 * marketing copy is written to sound bigger than the operation is.
 *
 * So the instructions push hard in one direction: read what is CLAIMED about
 * services and location, and refuse to conclude anything about the SHAPE of the
 * business. "Our team of experts" is a copywriting convention, not a roster, and
 * a page saying "we" proves nothing about how many people exist.
 *
 * That restriction is not politeness. The shape facts are the ones with evidence
 * weights, so a page that talked the extractor into `business.has_staff` would
 * change what a sole trader is charged.
 */
export function buildImportPrompt(input: {
  pack: IndustryPack | null;
  locale: "en" | "es";
}): string {
  return [
    "You read a business web page and extract structured facts from it.",
    "",
    "Output only the JSON object described by the schema. No prose, no fences.",
    "",
    "RULES",
    "1. Only use keys from the list below. Never invent a key.",
    "2. Extract only what the page actually states. Marketing language is not evidence.",
    "3. `quote` must be copied from the page verbatim. Empty if there is no phrase to quote.",
    "4. Keep confidence at or below 0.6. This is a web page, not the person speaking.",
    "5. Booleans are exactly 'true' or 'false'. Numbers are digits. Lists are comma separated.",
    "",
    "DO NOT CONCLUDE ANYTHING ABOUT THE SHAPE OF THE BUSINESS",
    "- 'Our team' and 'we' are how every website is written. They are NOT evidence of staff.",
    "  Never set business.has_staff, business.staff_count or business.represents_others.",
    "- Never set business.takes_commission. No page states this and it changes what they pay.",
    "- Never set business.clients_choose_provider from a staff page. Ask, do not assume.",
    "- The page may belong to somewhere they WORK, not somewhere they own. Do not set",
    "  business.exists unless the page is unmistakably the subject's own business.",
    "",
    "WHAT IS WORTH TAKING",
    "- The business name, as written.",
    "- What they do, and the named services, in their own words.",
    "- City and country.",
    "- Their own description of themselves, verbatim where possible.",
    "- Starting prices, session lengths and service areas when stated plainly.",
    "",
    ...(input.pack
      ? [
          `This appears to be a ${input.pack.label.en} business. Craft detail is welcome.`,
          "",
        ]
      : []),
    "FACT KEYS",
    // An import never establishes what somebody's body looks like, whatever the
    // page says, so the physical keys are withheld here unconditionally.
    factVocabularyForPrompt({ allowPhysicalAttributes: false }),
  ].join("\n");
}

/**
 * The import user message.
 *
 * Metadata first, then prose, because the metadata is the page's own summary of
 * itself and is usually the single best line on it. Known facts are included for
 * the same reason as in conversation: so the model can tell new information from
 * something already established, and so it does not spend its output repeating
 * what the visitor already told us.
 */
export function buildImportMessage(
  page: {
    url: string;
    host: string;
    title: string | null;
    description: string | null;
    siteName: string | null;
    text: string;
  },
  brief: Brief | null,
): string {
  const parts: string[] = [`Page: ${page.url}`];

  if (page.siteName) parts.push(`Site name: ${page.siteName}`);
  if (page.title) parts.push(`Title: ${page.title}`);
  if (page.description) parts.push(`Description: ${page.description}`);

  const known = brief ? redactFactsForPrompt(brief.facts) : [];
  if (known.length > 0) {
    parts.push("");
    parts.push("Already known (do not repeat unless the page CONTRADICTS it):");
    for (const fact of known) {
      parts.push(`- ${fact.factKey} = ${JSON.stringify(fact.value)}`);
    }
  }

  parts.push("");
  parts.push("Page text:");
  parts.push(page.text);

  return parts.join("\n");
}

// ─── Reply ────────────────────────────────────────────────────────────────────

/**
 * The reply prompt.
 *
 * `move` has already been decided by `decideNextMove`, so the model is never
 * asked what to do next — only how to say it. That split is why the flow behaves
 * identically on every run while still sounding like a person.
 */
export function buildReplyPrompt(input: {
  move: NextMove;
  /** Facts learned on THIS turn, so the reply can acknowledge them specifically. */
  justLearned: Array<{ factKey: string; value: unknown }>;
  /** Whether an email may be requested, and how firmly. */
  emailAsk: "no" | "offer" | "needed";
  locale: "en" | "es";
}): string {
  const parts: string[] = [VOICE, ""];

  if (input.locale === "es") {
    parts.push("Answer in Spanish. Use the informal 'tú'.", "");
  }

  if (input.justLearned.length > 0) {
    parts.push(
      "You just understood the following. Show that you heard it, briefly and specifically, in a short opening clause. Do not list it back.",
    );
    for (const fact of input.justLearned) {
      parts.push(`- ${fact.factKey} = ${JSON.stringify(fact.value)}`);
    }
    parts.push("");
  } else {
    parts.push(
      "You did not learn anything new from their last message. Do not pretend you did.",
      "",
    );
  }

  parts.push("YOUR TASK NOW");
  switch (input.move.kind) {
    case "ask": {
      const q = input.move.question;
      parts.push(
        `Ask this, in your own words: "${q.phrasing[input.locale].text}"`,
        "Do not read it out verbatim if it does not fit the conversation. Keep the intent.",
      );
      if (input.move.isReAsk) {
        parts.push(
          "You already asked this once and did not get a usable answer. Ask it differently and more concretely. Do not point out that you are asking again.",
        );
        const followUp = q.phrasing[input.locale].followUp;
        if (followUp) parts.push(`A simpler angle: "${followUp}"`);
      }
      break;
    }
    case "recommend":
      parts.push(
        "You have what you need. Tell them you have enough to make a recommendation and that it is on screen now.",
        "Do not name a plan, a price, or a trial. The screen shows that. One or two sentences.",
      );
      break;
    case "too_little_known":
      parts.push(
        "You are out of questions but still do not understand their setup well enough to recommend anything.",
        "Say so plainly and ask them to describe how their work is organised in their own words.",
        "Do not apologise more than once and do not offer a plan.",
      );
      break;
    case "ceiling_reached":
      parts.push(
        "The conversation has gone on long enough. Wrap up warmly and tell them what happens next.",
        "Do not ask another question.",
      );
      break;
  }

  if (input.emailAsk !== "no") {
    parts.push("");
    parts.push(
      input.emailAsk === "needed"
        ? "Also: ask for their email so this is saved to their account. Say what it saves, specifically, in their terms. It is required to continue."
        : "Optionally: you may mention that leaving an email saves this, if it fits naturally. Do not push, and do not make it a second question.",
    );
  }

  return parts.join("\n");
}

/**
 * The reply user message.
 *
 * Their last message verbatim. Prior turns are deliberately NOT replayed: the
 * Brief is the memory, so a long conversation costs the same as a short one and
 * the reply cannot contradict what has been recorded. It also means no
 * transcript needs to be persisted to keep continuity working.
 */
export function buildReplyMessage(userMessage: string): string {
  return userMessage.trim() || "(they did not say anything)";
}
