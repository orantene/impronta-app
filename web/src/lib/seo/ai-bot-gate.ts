/**
 * TUL-1326 (one toggle): the per-site "IA puede leer mi sitio" switch also gates
 * the JSON and markdown read endpoints, not only robots.txt.
 *
 * A request whose User-Agent is one of the known AI bots is refused (no data)
 * when the site's AI access is OFF, or when the switch cannot be read (fail
 * closed). Browsers, guests and every other client are never affected.
 *
 * PURE. The server half that reads the stored flag lives in `ai-bot-gate.server.ts`.
 *
 * TODO(#4110): this list duplicates `AI_CRAWLER_USER_AGENTS` from
 * `lib/seo/robots-rules.ts`. Once #4110 is on main, import that list instead and
 * delete this copy (keep it identical until then).
 */
export const AI_BOT_USER_AGENTS: readonly string[] = [
  // training crawlers
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  // AI search / user-initiated agents
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Claude-SearchBot",
  "Claude-User",
];

/** True when the User-Agent header names one of the AI bots (token match, case-insensitive). */
export function isAiBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return false;
  return AI_BOT_USER_AGENTS.some((bot) => ua.includes(bot.toLowerCase()));
}

export type AiReadVerdict = "allow" | "refuse";

/**
 * `aiAccess`: the stored flag. true = on, false = off, null = could not be read.
 * Only an AI bot is ever refused; it needs an explicit `true` to be let in.
 */
export function aiReadVerdict(userAgent: string | null | undefined, aiAccess: boolean | null): AiReadVerdict {
  if (!isAiBotUserAgent(userAgent)) return "allow";
  return aiAccess === true ? "allow" : "refuse";
}
