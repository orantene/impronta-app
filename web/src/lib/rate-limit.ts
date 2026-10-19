import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

/**
 * H3: two capped tables, so a spray on a public endpoint can never evict or
 * reset a sensitive counter.
 *
 * - STRICT keys (sign-in, OTP, password, ticket lookup, staging gate, join):
 *   their own table. When it is full, expired buckets are swept (at most once a
 *   second, so an insert is not an O(n) scan); if it is still full a NEW key is
 *   DENIED (fail closed). An existing key keeps its counter: nothing is evicted.
 * - Everything else: oldest-first eviction in batches (10% at a time, amortised
 *   O(1) per insert), which is fine for low-stakes public limits.
 *
 * This table is per instance and in memory. Sensitive limits should use
 * `rate-limit-kv.ts` (shared store); this is only the last line of defence.
 */
export const RATE_LIMIT_MAX_BUCKETS = 5000;

const STRICT_PREFIXES = ["auth-", "staging-gate", "ticket-lookup", "ticket-refund", "verifyIp", "join-studio", "acct-"];

const buckets = new Map<string, Bucket>();
const strictBuckets = new Map<string, Bucket>();
let lastStrictSweep = 0;

function isStrictKey(key: string): boolean {
  return STRICT_PREFIXES.some((p) => key.startsWith(p));
}

export function rateLimitBucketCount(): number {
  return buckets.size;
}

export function rateLimitStrictBucketCount(): number {
  return strictBuckets.size;
}

/** Public table: drop the oldest 10% in one batch when full. */
function evictOldestBatch(): void {
  if (buckets.size < RATE_LIMIT_MAX_BUCKETS) return;
  let drop = Math.ceil(RATE_LIMIT_MAX_BUCKETS / 10);
  for (const k of buckets.keys()) {
    if (drop-- <= 0) break;
    buckets.delete(k);
  }
}

/** Strict table: sweep expired (rate limited); true when there is room for a new key. */
function strictHasRoom(now: number): boolean {
  if (strictBuckets.size < RATE_LIMIT_MAX_BUCKETS) return true;
  if (now - lastStrictSweep >= 1000) {
    lastStrictSweep = now;
    for (const [k, b] of strictBuckets) {
      if (now >= b.resetAt) strictBuckets.delete(k);
    }
  }
  return strictBuckets.size < RATE_LIMIT_MAX_BUCKETS;
}

/**
 * Fixed-window counter stored in process memory.
 *
 * Limitations (acceptable for an early hardening pass, not a final prod story):
 * - Each Node/Edge **instance** has its own Map — limits are not shared across
 *   serverless cold starts or horizontal replicas; effective budget is
 *   multiplied by instance count.
 * - No persistence — restarts reset counters.
 * - IP keys from `x-forwarded-for` can be spoofed if your edge does not strip
 *   untrusted values (trust your platform’s proxy headers).
 *
 * Replace with a shared store (Redis, KV, edge rate-limit product) when abuse
 * or scale requires a single global view of client usage.
 *
 * @returns true if request is allowed, false if limit exceeded
 */
export function tryConsumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const strict = isStrictKey(key);
  const table = strict ? strictBuckets : buckets;
  let bucket = table.get(key);
  if (!bucket || now >= bucket.resetAt) {
    if (strict) {
      // A new window for a key that already has a bucket needs no room; a brand-new key does.
      if (!bucket && !strictHasRoom(now)) return false; // fail closed
    } else {
      evictOldestBatch();
    }
    bucket = { count: 0, resetAt: now + windowMs };
    table.set(key, bucket);
  }
  if (bucket.count >= limit) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export function rateLimitJsonResponse(): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Try again shortly." },
    { status: 429, headers: { "cache-control": "no-store" } },
  );
}

/**
 * 429 response shaped for HTML routes (share-link viewer, future
 * public-comment surfaces). Body is a tiny self-contained HTML doc so a
 * fuzzer/bot sees a humane wall, not a JSON blob, and a real visitor who
 * tripped the limit gets a coherent message instead of a parsed error.
 */
export function rateLimitHtmlResponse(): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Slow down</title></head><body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#fafafa;color:#27272a;"><div style="max-width:380px;padding:32px;text-align:center;"><h1 style="font-size:18px;margin:0 0 8px;">Too many requests</h1><p style="font-size:14px;margin:0;color:#52525b;">Wait a moment and try again.</p></div></body></html>`,
    {
      status: 429,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
