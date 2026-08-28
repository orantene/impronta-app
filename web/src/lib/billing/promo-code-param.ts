/**
 * promo-code-param.ts — carry `?promo=CODE` from an in-app page into checkout.
 *
 * WHY THIS EXISTS: `/get-started?promo=CODE` threads a campaign code all the
 * way to the Checkout Session, so a NEW customer never types anything. Every
 * in-app upgrade path — the account page, talent settings, the global upgrade
 * modal, the premium-pages drawer — created its Checkout Session with no promo
 * at all, so an EXISTING customer following the same campaign link saw the
 * offer and then had to retype the code into Stripe's box. A campaign aimed at
 * people who already have a workspace was the one it worked worst for.
 *
 * The value is browser-supplied and stays untrusted: it is normalised here only
 * so the wire is clean. `resolveCheckoutDiscount` re-validates the code on the
 * server — window, active flag, total cap, plan family, per-account limit —
 * before it can discount anything, exactly as it does for the signup funnel.
 */

/** Max code length accepted by `createDiscount`; longer input cannot be real. */
const MAX_CODE_LENGTH = 32;

/**
 * Normalise a raw `?promo=` value to the shape codes are stored in, or null.
 *
 * Pure and exported for tests: the browser hook below is a thin wrapper so the
 * parsing rules can be asserted without rendering anything.
 */
export function normalizePromoParam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length < 3 || trimmed.length > MAX_CODE_LENGTH) return null;
  // Same alphabet the create form enforces. Anything else is a stale or
  // hand-mangled link, and silently dropping it beats sending junk to Stripe.
  if (!/^[A-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Read `?promo=` from the CURRENT url, for a client component.
 *
 * Deliberately reads `window.location` rather than `useSearchParams()`: these
 * upgrade buttons render inside the workspace shell, and the hook would force
 * a Suspense boundary on every one of them for a value that is only read
 * inside a click handler. Returns null during SSR.
 */
export function readPromoCodeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizePromoParam(new URL(window.location.href).searchParams.get("promo"));
  } catch {
    return null;
  }
}
