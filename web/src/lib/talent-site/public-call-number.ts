/**
 * G4: the public call number (tap-to-call in the site header).
 *
 * PRIVACY RULE. A `tel:` link exists only when the talent typed a number into
 * the "Show a call button" setting. It is stored as a `shell://tel/<digits>`
 * entry in `talent_profiles.social_links` (the WhatsApp pattern) and is NEVER
 * derived from her private profile phone. Clearing the setting removes the
 * entry, which removes the button everywhere.
 *
 * Pure: safe on server and client.
 */

export const TEL_SHELL = "shell://tel/";
export const TEL_SHELL_LABEL = "Shell · Public call number";

/** International numbers are 8 to 15 digits (E.164 allows 15, no leading 0). */
const E164_RE = /^\+[1-9]\d{7,14}$/;

/**
 * Normalise what a talent typed to E.164 (`+529981112233`) or null. The number
 * must carry its country code: a leading `+` or `00`. A bare national number is
 * rejected rather than guessed, because a wrong guess dials a stranger.
 */
export function normaliseE164(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const typed = input.trim();
  if (!typed) return null;
  if (/[^\d\s().+\-]/.test(typed)) return null;
  let s = typed.replace(/[\s().\-]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!s.startsWith("+")) return null;
  if (s.indexOf("+", 1) !== -1) return null;
  const e164 = `+${s.slice(1).replace(/\D/g, "")}`;
  return E164_RE.test(e164) ? e164 : null;
}

export function encodeShellTel(e164: string): string {
  const n = normaliseE164(e164);
  return n ? `${TEL_SHELL}${n.slice(1)}` : "";
}

/** The E.164 number inside a shell link, or null when it is not a valid one. */
export function decodeShellTel(href: string): string | null {
  if (typeof href !== "string" || !href.startsWith(TEL_SHELL)) return null;
  let raw = href.slice(TEL_SHELL.length);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!/^\d+$/.test(raw)) return null;
  return normaliseE164(`+${raw}`);
}

function hrefOf(link: unknown): string {
  if (!link || typeof link !== "object") return "";
  const rec = link as { href?: unknown; url?: unknown };
  if (typeof rec.href === "string") return rec.href.trim();
  return typeof rec.url === "string" ? rec.url.trim() : "";
}

/** The explicit public call number from a profile's social links, or null. */
export function findShellTel(links: unknown): string | null {
  if (!Array.isArray(links)) return null;
  for (const l of links) {
    const n = decodeShellTel(hrefOf(l));
    if (n) return n;
  }
  return null;
}

/** `tel:+...` for the explicit number only. Empty when she did not opt in. */
export function callHrefFromSocialLinks(links: unknown): string {
  const n = findShellTel(links);
  return n ? `tel:${n}` : "";
}

/**
 * Links with the public call number set (a valid E.164) or cleared (null /
 * invalid). Every other entry is kept in place; only tel shells are replaced.
 */
export function withPublicCallNumber(links: unknown, e164: string | null): unknown[] {
  const kept = (Array.isArray(links) ? links : []).filter((l) => !hrefOf(l).startsWith(TEL_SHELL));
  const href = e164 ? encodeShellTel(e164) : "";
  return href ? [...kept, { label: TEL_SHELL_LABEL, href }] : kept;
}
