/**
 * checkout-session-key.ts (TUL-1280 retest fix): the Checkout idempotency key
 * follows the params it is sent with.
 *
 * Stripe remembers a key for 24h and REFUSES it with different params ("Keys
 * for idempotent requests can only be used with the same parameters"). The old
 * key (`cs_talent_<profile>_<plan>[_year][_r…]`) did not change when the trial
 * decision, promo, price or locale did, so a talent who cancelled and came back
 * the same day (now without a trial) could not open Checkout at all.
 *
 * The key is now the readable base plus a short hash of the exact params:
 * identical params (a double click) still give the same key and collapse to one
 * session; any change gives a fresh key. Pure.
 */
import { createHash } from "node:crypto";

/** JSON with object keys sorted at every level; undefined values dropped; arrays keep order. */
export function stableParamsJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(o)
          .sort()
          .filter((k) => o[k] !== undefined)
          .map((k) => [k, o[k]]),
      );
    }
    return v;
  });
}

/** `<base>_p<12 hex of sha256(params)>`: deterministic per params, readable per subject/plan. */
export function checkoutSessionKey(base: string, params: unknown): string {
  const hash = createHash("sha256").update(stableParamsJson(params)).digest("hex").slice(0, 12);
  return `${base}_p${hash}`;
}
