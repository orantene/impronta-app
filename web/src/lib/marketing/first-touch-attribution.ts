"use client";

/**
 * Where a visitor actually came from, remembered across the whole visit.
 *
 * The signup form reads utm_* from its OWN url. That only works for links
 * pointing straight at /get-started. The real journey is a campaign link to
 * the homepage, a look at pricing, a feature page, and only then the form,
 * by which point the query string is long gone and the lead records nothing.
 * So the channels we could actually evaluate were the ones we were least
 * likely to be running.
 *
 * This captures attribution on the FIRST marketing page of a visit and holds
 * it until the visit ends.
 *
 * FIRST touch, not last: the campaign that earned the visit is the one worth
 * paying for, not whichever internal page happened to be last. Once a value
 * is stored it is never overwritten within the session.
 *
 * PRIVACY. utm_* values are our own campaign labels and the referrer is a
 * hostname. No personal data, nothing identifying, nothing shared with a
 * third party. It lives in sessionStorage, so it is gone when the tab closes
 * and never travels between visits.
 */

const KEY = "tulala.attribution.v1";

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  /** The page the visit started on. Tells us which content earns signups. */
  landing_path?: string;
};

const FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

/**
 * The hostname of an EXTERNAL referrer, or undefined.
 *
 * Our own domain is not a referrer, it is just the previous page, and
 * recording it overwrites the real source with ourselves. This lived inline
 * inside the capture path once, and the resolver below quietly reintroduced
 * the bug by falling back to `document.referrer` unconditionally. One rule,
 * one place, used by both.
 */
function externalReferrerHost(referrer: string | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).hostname;
    if (!host) return undefined;
    const here = typeof window !== "undefined" ? window.location.hostname : "";
    return host === here ? undefined : host;
  } catch {
    return undefined;
  }
}

function read(): Attribution | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    // Private mode, blocked storage, quota. Attribution is a nice-to-have and
    // must never break a page that is trying to take a signup.
    return null;
  }
}

/**
 * Record attribution if this is the first marketing page of the visit.
 * Safe to call on every page; only the first call in a session stores.
 */
export function captureFirstTouch(): void {
  if (typeof window === "undefined") return;
  if (read()) return; // First touch wins. Never overwrite.

  try {
    const params = new URLSearchParams(window.location.search);
    const attribution: Attribution = { landing_path: window.location.pathname };

    for (const f of FIELDS) {
      const v = params.get(f);
      if (v) attribution[f] = v.slice(0, 120);
    }

    const ref = externalReferrerHost(document.referrer);
    if (ref) attribution.referrer = ref;

    sessionStorage.setItem(KEY, JSON.stringify(attribution));
  } catch {
    /* storage unavailable; carry on without attribution */
  }
}

/**
 * What we know about where this visit came from. Empty object when nothing
 * was captured, which is honest: unknown is a real answer and better than a
 * guess that would pollute every channel report built on it.
 */
export function getAttribution(): Attribution {
  return read() ?? {};
}

/**
 * What to record for a signup, given the url the form is on.
 *
 * The url wins when a campaign links straight to the form, because that is
 * the most specific signal we have. Otherwise fall back to the first touch of
 * the visit. Reading only the url meant a campaign to the homepage recorded
 * no source at all by the time the visitor reached the form.
 */
export function resolveSignupAttribution(search: string, documentReferrer: string): Attribution {
  const params = new URLSearchParams(search);
  const first = getAttribution();
  const out: Attribution = {};

  for (const f of FIELDS) {
    const v = params.get(f) || first[f];
    if (v) out[f] = v;
  }

  out.referrer = first.referrer || externalReferrerHost(documentReferrer);
  return out;
}
