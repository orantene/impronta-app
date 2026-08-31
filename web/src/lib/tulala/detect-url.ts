/**
 * detect-url.ts — finding the link in a sentence.
 *
 * Pure and shared by the composer and the import route, so the client and the
 * server agree on what counts as a link. If they disagreed, the chat would offer
 * to read something the server then refused, which reads as a broken promise.
 *
 * WHY IT IS NOT A REGEX FOR URLS
 * ──────────────────────────────
 * People do not paste URLs. They type "glowstudio.mx", "@glowstudio",
 * "instagram.com/glowstudio" and "check us out at glow-studio.com!" — no scheme,
 * sometimes no domain, sometimes trailing punctuation from the sentence around
 * it. A strict matcher finds none of those, which means the import feature
 * quietly never fires for most of the people it was built for.
 *
 * So this normalises instead of validating. The SSRF guard on the server is what
 * validates, and it is the only thing that should: a permissive detector plus a
 * strict fetch guard is safe, while a strict detector plus a permissive guard is
 * both broken and dangerous.
 */

/**
 * TLDs worth guessing a domain from without a scheme.
 *
 * Deliberately short. A long list turns every sentence containing a full stop
 * into a candidate link — "I do nails.So does my sister" would offer to read
 * "nails.so". These are the endings this product's market actually uses.
 */
const BARE_DOMAIN_TLDS = [
  "com",
  "mx",
  "net",
  "org",
  "co",
  "io",
  "app",
  "studio",
  "shop",
  "site",
  "es",
  "com.mx",
  "mx.com",
];

const SCHEME_RE = /\bhttps?:\/\/[^\s<>"']+/i;

const BARE_RE = new RegExp(
  `\\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${BARE_DOMAIN_TLDS.join("|")}))(\\/[^\\s<>"']*)?`,
  "i",
);

/** A bare @handle, which people give far more often than a full profile URL. */
const HANDLE_RE = /(?:^|\s)@([A-Za-z0-9_.]{2,30})\b/;

/**
 * Trailing characters that belong to the sentence, not the URL.
 *
 * "see glowstudio.mx." must not become a request for "glowstudio.mx." — closing
 * brackets are included because "(glowstudio.mx)" is how people parenthesise.
 */
function trimSentencePunctuation(candidate: string): string {
  return candidate.replace(/[.,;:!?)\]}'"»]+$/, "");
}

export type DetectedLink = {
  /** A fetchable absolute URL, scheme included. */
  url: string;
  /** What the person actually typed, for echoing back to them. */
  raw: string;
  /** True when the scheme, the host, or both were inferred rather than given. */
  inferred: boolean;
};

/**
 * The first link in a message, or null.
 *
 * First rather than all: an import is one fetch, and a message with three links
 * in it is a message where asking which one is better than guessing.
 */
export function detectLink(text: string): DetectedLink | null {
  const withScheme = SCHEME_RE.exec(text);
  if (withScheme) {
    const raw = trimSentencePunctuation(withScheme[0]);
    return { url: raw, raw, inferred: false };
  }

  const bare = BARE_RE.exec(text);
  if (bare) {
    const raw = trimSentencePunctuation(bare[0]);
    return { url: `https://${raw}`, raw, inferred: true };
  }

  const handle = HANDLE_RE.exec(text);
  if (handle?.[1]) {
    // An @handle with no platform named is assumed to be Instagram, which is
    // where this market lives. Wrong occasionally, and the confirmation step is
    // what makes being wrong survivable.
    return {
      url: `https://www.instagram.com/${handle[1]}/`,
      raw: `@${handle[1]}`,
      inferred: true,
    };
  }

  return null;
}

/** Host without `www.`, for showing the person what is about to be read. */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
