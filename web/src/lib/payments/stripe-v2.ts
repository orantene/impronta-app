/**
 * lib/payments/stripe-v2.ts
 *
 * Minimal fetch-based client for the Stripe **v2 (preview) Money Movement API**
 * that Global Payouts requires. The app's main SDK (`lib/stripe/client.ts`) is
 * pinned to a stable v1 `apiVersion` and, on the stable release channel, does
 * NOT expose `stripe.v2.moneyManagement` — so we talk to v2 over HTTPS with the
 * preview version header instead. This keeps the v1 integration 100% untouched
 * and pins the preview version in exactly one place.
 *
 * Differences from v1 (see docs.stripe.com/api-v2-overview):
 *   • Request bodies are **JSON** (not form-encoded).
 *   • Requires the `Stripe-Version: <preview>` header.
 *   • Errors come back as `{ error: { code, type, message, request_log_url } }`.
 *   • List responses are `{ data: [...], next_page_url, previous_page_url }`.
 *   • Recipient-scoped resources (payout methods) need a `Stripe-Context` header.
 *
 * Server-only: never import from a client component.
 */

import "server-only";

/**
 * The pinned Stripe v2 preview version used for Global Payouts. Bump here when
 * Stripe advances the preview (currently the version the GP docs publish).
 */
export const STRIPE_V2_PREVIEW_VERSION = "2026-05-27.preview";

const STRIPE_API_BASE = "https://api.stripe.com";

export type StripeV2Error = {
  code?: string;
  type?: string;
  message?: string;
  request_log_url?: string;
};

export type StripeV2Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: StripeV2Error };

/** Generic shape of a v2 list response. */
export type StripeV2List<T> = {
  data: T[];
  next_page_url: string | null;
  previous_page_url: string | null;
};

export function isStripeV2Configured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export type StripeV2RequestOpts = {
  body?: Record<string, unknown>;
  /** Sent as the `Idempotency-Key` header — safe-retries a POST without double-acting. */
  idempotencyKey?: string;
  /** `Stripe-Context` header — required for recipient-scoped resources (payout methods). */
  stripeContext?: string;
  /** Override the secret key (tests). */
  secretKey?: string;
  /** Injected fetch (tests). */
  fetchImpl?: typeof fetch;
};

/**
 * Low-level v2 request. Never throws — network/parse failures and non-2xx
 * responses are returned as `{ ok: false, ... }` so callers branch cleanly.
 */
export async function stripeV2Request<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: StripeV2RequestOpts = {},
): Promise<StripeV2Result<T>> {
  const key = opts.secretKey ?? process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return {
      ok: false,
      status: 0,
      error: { code: "not_configured", message: "Stripe is not configured (no STRIPE_SECRET_KEY)." },
    };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": STRIPE_V2_PREVIEW_VERSION,
  };
  if (opts.body) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  if (opts.stripeContext) headers["Stripe-Context"] = opts.stripeContext;

  let res: Response;
  try {
    res = await doFetch(`${STRIPE_API_BASE}${path}`, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: { code: "network_error", message: err instanceof Error ? err.message : "network error" },
    };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* empty / non-JSON body */
  }

  if (!res.ok) {
    const error = (json as { error?: StripeV2Error } | null)?.error ?? {
      message: `HTTP ${res.status}`,
    };
    return { ok: false, status: res.status, error };
  }
  return { ok: true, data: json as T };
}

export const stripeV2 = {
  get: <T = unknown>(path: string, opts?: Omit<StripeV2RequestOpts, "body">) =>
    stripeV2Request<T>("GET", path, opts),
  post: <T = unknown>(
    path: string,
    body: Record<string, unknown>,
    opts?: Omit<StripeV2RequestOpts, "body">,
  ) => stripeV2Request<T>("POST", path, { ...opts, body }),
};
