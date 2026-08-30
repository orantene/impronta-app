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

function isAllowedUrl(url: string): boolean {
  // MD_LINK / BARE_URL only ever match absolute http(s) URLs, so an allowed
  // link must be on a Tulala host, full stop. Path-prefix allowances would be
  // host-blind (https://evil.example/{slug}/… would pass) — never add one.
  const host = hostOf(url);
  if (!host) return false;
  if (ALLOWED_HOSTS.has(host) || ALLOWED_HOSTS.has(`www.${host}`)) return true;
  return host.endsWith(".tulala.digital");
}

export function sanitizeSupportAiOutput(raw: string): SupportAiGuardrailResult {
  const escalate = FORBIDDEN.test(raw);
  let s = raw;

  s = s.replace(MD_LINK, (full, label: string, href: string) => {
    if (isAllowedUrl(href)) return full;
    return label;
  });
  s = s.replace(BARE_URL, (url) => {
    if (isAllowedUrl(url)) return url;
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

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,}\d{3,4}/g;
const MONEY_RE = /(?:\$|€|£)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|MXN|pesos?)\b/gi;

function sentenceHasUngroundedMoney(sentence: string, grounding: string): boolean {
  const amounts = sentence.match(MONEY_RE);
  if (!amounts) return false;
  return amounts.some((amt) => !grounding.includes(amt));
}

/** Guest-surface guardrail: strip phones/emails and ungrounded prices. */
export function sanitizeGuestAiOutput(
  raw: string,
  groundingText: string,
): SupportAiGuardrailResult {
  const base = sanitizeSupportAiOutput(raw);
  let escalate = base.escalate;
  let s = base.text.replace(EMAIL_RE, "").replace(PHONE_RE, "");
  const kept: string[] = [];
  for (const sentence of s.split(/(?<=[.!?])\s+/)) {
    if (sentenceHasUngroundedMoney(sentence, groundingText)) {
      escalate = true;
      continue;
    }
    kept.push(sentence);
  }
  s = kept.join(" ").replace(/\s{2,}/g, " ").trim();
  if (s.length > SUPPORT_AI_MAX_CHARS) s = s.slice(0, SUPPORT_AI_MAX_CHARS).trimEnd();
  return {
    text: s,
    escalate,
    escalateReason: escalate ? "ai_suggested" : null,
  };
}
