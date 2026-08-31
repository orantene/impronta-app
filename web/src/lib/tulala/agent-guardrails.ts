/**
 * agent-guardrails.ts — what the Agent is not allowed to say.
 *
 * Follows the house pattern (`support-ai-guardrails.ts`): structured or streamed
 * model output goes through a post-processor before anyone reads it. The rules
 * differ because the risk differs. Support gets a wrong answer; the intake Agent
 * gets a wrong PROMISE, at the exact moment someone is deciding whether to enter
 * a card. A quoted price the business does not charge has to be either honoured
 * or broken, and both are expensive.
 *
 * So the single biggest rule here is: no numbers about money. Not because the
 * model would invent them maliciously, but because it has no reliable way to
 * know them — prices, trial lengths and commission live in the DB catalog, and
 * the prompt deliberately withholds them. Any figure in the output is therefore
 * a hallucination by construction, and stripping the sentence is strictly safer
 * than shipping it.
 *
 * Prices reach the screen from React, rendered off the resolved recommendation.
 */

// Longest reply kept. The prompt asks for two or three sentences; this is the
// backstop for when it monologues, and it truncates at a sentence boundary so
// the result still reads as finished.
export const AGENT_REPLY_MAX_CHARS = 700;

export type AgentGuardrailResult = {
  text: string;
  /** Which rules fired. Logged, never shown. */
  violations: string[];
};

/** Money, in any of the forms a model reaches for. */
const MONEY_PATTERNS: Array<[string, RegExp]> = [
  ["currency_symbol", /[$€£]\s?\d/],
  ["currency_code", /\b\d+(?:[.,]\d+)?\s?(?:usd|eur|mxn|gbp|dollars?|euros?|pesos?)\b/i],
  ["percent", /\b\d+(?:[.,]\d+)?\s?(?:%|per\s?cent|por\s?ciento)/i],
  ["free_months", /\b(?:first|primer[oa]?|two|three|dos|tres)\s+\w{0,8}\s?months?\s+(?:free|gratis)\b/i],
  ["trial_length", /\b\d+\s?(?:day|día|dia)s?\s+(?:free|trial|gratis|de prueba)\b/i],
  ["per_month", /\b\d+\s?(?:\/|per\s|al\s|por\s)\s?(?:mo\b|month|mes)\b/i],
];

/**
 * Plan names the model must not commit to.
 *
 * Not censorship for its own sake: naming a tier IS a recommendation, and the
 * recommendation is the engine's output, shown on screen with its reasons. A
 * model that says "you want Studio" while the panel says Website makes the
 * product look like it disagrees with itself, and the user believes the sentence
 * over the panel.
 */
const PLAN_NAME_PATTERN =
  /\b(?:studio|agency|network|website)\s+(?:plan|tier|package|paquete|plan)\b/i;

/** Claims about actions the Agent cannot take. */
const FALSE_ACTION_PATTERNS: Array<[string, RegExp]> = [
  ["claims_built", /\bi(?:'ve| have)\s+(?:built|created|set up|published|made)\s+(?:your|the)\b/i],
  ["claims_charged", /\bi(?:'ve| have)\s+(?:charged|billed|subscribed)\b/i],
  ["claims_emailed", /\bi(?:'ve| have)\s+(?:sent|emailed)\s+you\b/i],
  ["claims_saved_account", /\byour account (?:is|has been) (?:created|ready|set up)\b/i],
];

/**
 * Sentence-split that keeps the terminator.
 *
 * Sentence granularity is the right unit: dropping one sentence containing an
 * invented price keeps a reply that is otherwise a good question, whereas
 * dropping the whole message loses the turn over one clause.
 */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+/).filter((s) => s.trim().length > 0);
}

/**
 * Clean a streamed reply.
 *
 * Applied to the FULL text, never to a partial stream: a rule spanning a token
 * boundary would fire on a fragment and mangle text that was about to be fine.
 */
export function sanitizeAgentReply(
  raw: string,
  context: { locale: "en" | "es"; move: string },
): AgentGuardrailResult {
  const violations: string[] = [];
  let text = (raw ?? "").trim();
  if (!text) return { text: "", violations: ["empty"] };

  // Markdown the prompt forbade but models emit by habit. Stripped rather than
  // rejected: the words are usually fine, the formatting just is not ours.
  text = text
    .replace(/^\s*[#>]+\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1");

  // House style, enforced by a repo-wide ratchet elsewhere. Cheaper to normalise
  // than to hope a model honours a negative instruction.
  if (/[—–]/.test(text)) {
    violations.push("dash");
    text = text.replace(/\s*[—–]\s*/g, ", ");
  }

  const kept: string[] = [];
  for (const sentence of splitSentences(text)) {
    const hit = [...MONEY_PATTERNS, ...FALSE_ACTION_PATTERNS].find(([, pattern]) =>
      pattern.test(sentence),
    );
    if (hit) {
      violations.push(hit[0]);
      continue;
    }
    if (PLAN_NAME_PATTERN.test(sentence)) {
      violations.push("plan_name");
      continue;
    }
    kept.push(sentence.trim());
  }

  text = kept.join(" ").replace(/\s{2,}/g, " ").trim();

  // Every sentence was a violation. Better to say nothing and let the caller's
  // deterministic fallback speak than to ship a mangled fragment.
  if (!text) return { text: "", violations: [...violations, "all_sentences_dropped"] };

  if (text.length > AGENT_REPLY_MAX_CHARS) {
    violations.push("too_long");
    text = truncateAtSentence(text, AGENT_REPLY_MAX_CHARS);
  }

  // One question per turn, per the prompt. A stacked pair is answered as one and
  // the second silently goes unanswered, which is where the intake starts losing
  // facts it thinks it has asked for.
  const questionMarks = (text.match(/\?/g) ?? []).length;
  if (questionMarks > 1) {
    violations.push("multiple_questions");
    text = keepThroughFirstQuestion(text);
  }

  void context;
  return { text, violations };
}

function truncateAtSentence(text: string, limit: number): string {
  const slice = text.slice(0, limit);
  const lastStop = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (lastStop > limit * 0.5) return slice.slice(0, lastStop + 1).trim();
  return `${slice.trim()}.`;
}

/**
 * Keep everything up to and including the first question mark.
 *
 * The first question is the one the flow decided to ask, and it is the one the
 * client is tracking as `pendingQuestionId`. Keeping the LAST one instead would
 * mean the recorded question and the asked question disagree, which corrupts
 * every yield measurement for both.
 */
function keepThroughFirstQuestion(text: string): string {
  const index = text.indexOf("?");
  if (index === -1) return text;
  return text.slice(0, index + 1).trim();
}
