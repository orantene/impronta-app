/**
 * Is this destination one the operator meant?
 *
 * Production QA 2026-09-05 pointed a code at a path the tenant does not have.
 * The resolver redirected faithfully and the guest hit a 404. Nothing anywhere
 * noticed — and that is worse than a broken code, because **the code works**:
 * an operator testing "does the QR scan" passes, and only a guest standing at
 * a table ever finds out.
 *
 * WHAT THIS IS NOT
 * It is not a refusal and it is not a probe.
 *
 * Not a refusal, because a destination can be legitimately unrecognisable to
 * us — a route added tomorrow, a page not yet published, a deep link with a
 * query. Refusing those would block real work to prevent a mistake.
 *
 * Not a probe, because fetching the path to see if it 404s would wrongly
 * condemn every dynamic route (`/t/<code>`, `/p/<slug>`) and would make saving
 * a link depend on the site being up. A guess about a URL is not worth a
 * network call that can be wrong in both directions.
 *
 * So: classify, flag, and let the operator decide. The flag is stored on the
 * link so the list can show which printed codes may point at nothing.
 */

/** Public route prefixes a link may legitimately point at. */
const KNOWN_PUBLIC_PREFIXES = [
  "/", "/contact", "/directory", "/book", "/models", "/posts", "/t", "/p",
  "/menu", "/reserve", "/events", "/c", "/me", "/checkout", "/share", "/r",
] as const;

export type DestinationVerdict =
  | { verified: true }
  | { verified: false; reason: string };

/**
 * Classify a link destination against what this tenant is known to serve.
 *
 * `publishedSlugs` are the tenant's own published page slugs, without a
 * leading slash. The caller loads them; this stays pure so the interesting
 * cases are testable without a database.
 */
export function checkDestination(
  to: string,
  publishedSlugs: readonly string[],
): DestinationVerdict {
  const value = to.trim();
  if (value.length === 0) {
    return { verified: false, reason: "The destination is empty." };
  }

  // An absolute URL is the operator's own business — it may be their booking
  // provider, their Instagram, a partner. We cannot know it and do not guess.
  if (/^https?:\/\//i.test(value)) return { verified: true };

  if (!value.startsWith("/")) {
    return {
      verified: false,
      reason: "A destination should start with / or be a full https:// address.",
    };
  }

  // Compare the PATH only. A query or hash is the operator's business and a
  // link with `?table=7` must not be flagged just because of the query.
  const path = value.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";

  if ((KNOWN_PUBLIC_PREFIXES as readonly string[]).includes(path)) {
    return { verified: true };
  }
  // A known prefix with something after it: /t/jane, /p/about, /posts/spring.
  if (KNOWN_PUBLIC_PREFIXES.some((p) => p !== "/" && path.startsWith(`${p}/`))) {
    return { verified: true };
  }

  const firstSegment = path.slice(1).split("/")[0] ?? "";
  if (publishedSlugs.includes(firstSegment)) return { verified: true };

  return {
    verified: false,
    reason:
      `Nothing on this site matches "${path}". The link will still work if you ` +
      "mean it, but a printed code pointing here would send people to a not-found page.",
  };
}
