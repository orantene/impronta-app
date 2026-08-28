/**
 * Post-process support AI answers. Complements the system prompt.
 * Modeled on inquiry-draft-guardrails.ts.
 */

export const SUPPORT_AI_MAX_CHARS = 1200;

const ALLOWED_HOSTS = new Set(["tulala.digital", "app.tulala.digital", "www.tulala.digital"]);

const FORBIDDEN =
  /\b(refund(?:s|ed|able)?\s+(?:of\s+)?(?:\$|€|£)?\s*\d|\blegal(?:ly)?\s+(?:advice|guarantee|obligation)\b|\bwe (?:will|can) pay you\b|\bpayout (?:of|is|will)\b|\bi (?:have|just) (?:updated|changed|fixed|applied|booked|refunded)\b)/i;

const MD_LINK = /\[([^\]]+)\]\((https?:[^)]+)\)/gi;
const BARE_URL = /\bhttps?:\/\/[^\s)]+/gi;

export type SupportAiGuardrailResult = {
  text: string;
  escalate: boolean;
  escalateReason: "ai_suggested" | null;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isAllowedUrl(url: string, extraPathPrefixes: string[]): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (ALLOWED_HOSTS.has(host) || ALLOWED_HOSTS.has(`www.${host}`)) return true;
  if (host.endsWith(".tulala.digital")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.origin === "null") return false;
    return extraPathPrefixes.some((p) => parsed.pathname.startsWith(p));
  } catch {
    return false;
  }
}

export function sanitizeSupportAiOutput(
  raw: string,
  opts: { extraPathPrefixes?: string[] } = {},
): SupportAiGuardrailResult {
  const escalate = FORBIDDEN.test(raw);
  let s = raw;

  s = s.replace(MD_LINK, (full, label: string, href: string) => {
    if (isAllowedUrl(href, opts.extraPathPrefixes ?? [])) return full;
    return label;
  });
  s = s.replace(BARE_URL, (url) => {
    if (isAllowedUrl(url, opts.extraPathPrefixes ?? [])) return url;
    return "";
  });

  s = s.replace(/\u2014/g, " - ").replace(/\n{3,}/g, "\n\n").trim();
  if (s.length > SUPPORT_AI_MAX_CHARS) s = s.slice(0, SUPPORT_AI_MAX_CHARS).trimEnd();

  return {
    text: s,
    escalate,
    escalateReason: escalate ? "ai_suggested" : null,
  };
}
