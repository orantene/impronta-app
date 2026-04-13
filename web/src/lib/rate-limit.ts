import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

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
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
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
