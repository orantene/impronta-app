"use server";

/**
 * Public server actions for the marketing newsletter (Wave 2).
 *
 * Called from the unauthenticated `/resources` capture module. There is no
 * logged-in user and no tenant, so writes go through the service-role client
 * (RLS would otherwise block the anon key — and there are intentionally no anon
 * policies on marketing_subscribers). Defenses live here, not in RLS:
 *   - email validation
 *   - a honeypot field that silently no-ops obvious bots
 *   - a per-IP in-memory rate limit (shared helper `tryConsumeRateLimit`)
 *   - on-conflict-do-nothing so a re-signup never errors or re-sends.
 */

import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { buildWelcomeEmail } from "./welcome-email";
import type {
  SubscribeInput,
  SubscribeLocale,
  SubscribeResult,
} from "./types";

// Deliberately permissive but real: rejects the obvious garbage (no @, spaces,
// missing TLD) without trying to fully parse RFC 5322. A zod schema would be
// equivalent here; the project already leans on hand-rolled guards for tiny
// public inputs, so this keeps the dependency surface flat.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254;

// Per-IP fixed window. Generous enough for a legitimate user who mistypes and
// retries, tight enough to blunt scripted list-stuffing. NOTE: the limiter is
// in-process (see lib/rate-limit.ts) — the effective budget is multiplied by
// serverless instance count and resets on cold start. Acceptable for a signup
// form; swap for a shared store if abuse warrants it.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function normalizeLocale(locale: string): SubscribeLocale {
  return locale === "es" ? "es" : "en";
}

async function clientIpKey(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
    const real = h.get("x-real-ip")?.trim();
    if (real) return real;
  } catch {
    /* non-request context — fall through */
  }
  return "unknown";
}

function buildUnsubscribeUrl(token: string, locale: SubscribeLocale): string {
  const base = `https://${PLATFORM_BRAND.domain}`;
  const prefix = locale === "es" ? `${base}/es` : base;
  return `${prefix}/resources/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Subscribe an email to the marketing list and send the localized welcome mail.
 * Never throws — always returns a SubscribeResult the client renders.
 */
export async function subscribeToNewsletter(
  input: SubscribeInput,
): Promise<SubscribeResult> {
  // Honeypot: a filled `company` means a bot. Return `ok` so it learns nothing;
  // write nothing.
  if (input.company && input.company.trim() !== "") {
    return { status: "ok" };
  }

  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return { status: "invalid" };
  }

  const locale = normalizeLocale(input.locale);
  const source =
    typeof input.source === "string" && input.source.trim()
      ? input.source.trim().slice(0, 64)
      : "resources";

  const ipKey = await clientIpKey();
  if (!tryConsumeRateLimit(`newsletter:${ipKey}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return { status: "rate_limited" };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("marketing.subscribe", new Error("service role client unavailable"));
    return { status: "error" };
  }

  // Insert; on unique-email conflict do nothing. `select` returns the inserted
  // row only when a NEW row landed, so an empty result means "already on list".
  const { data, error } = await admin
    .from("marketing_subscribers")
    .upsert(
      { email, locale, source },
      { onConflict: "email", ignoreDuplicates: true },
    )
    .select("id, unsubscribe_token");

  if (error) {
    logServerError("marketing.subscribe.insert", error);
    return { status: "error" };
  }

  const row = data?.[0] as { id: string; unsubscribe_token: string } | undefined;
  if (!row) {
    // Already subscribed — no duplicate welcome send.
    return { status: "already" };
  }

  // Fire the welcome email. A send failure must NOT lose the subscriber: the
  // row is already committed. `sendEmail` never throws (logs + returns null on
  // failure, skips silently when RESEND_API_KEY is unset in dev), so we log and
  // still report success to the user.
  try {
    const unsubscribeUrl = buildUnsubscribeUrl(row.unsubscribe_token, locale);
    const { subject, html } = buildWelcomeEmail({ locale, unsubscribeUrl });
    const id = await sendEmail({ to: email, subject, html });
    void improntaLog("marketing.subscribe.welcome", {
      status: id ? "sent" : "skipped_or_failed",
      locale,
      source,
    });
  } catch (err) {
    logServerError("marketing.subscribe.welcome", err);
  }

  return { status: "ok" };
}

/**
 * Flip `unsubscribed_at` for the row matching this token. Idempotent — an
 * already-unsubscribed token still resolves to `ok`. Returns false only for an
 * unknown/malformed token or a server error, so the page can show a neutral
 * "link not recognised" state without leaking whether the token ever existed.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const trimmed = (token ?? "").trim();
  // UUID shape guard — avoids a pointless DB round-trip on obvious junk.
  if (!/^[0-9a-f-]{36}$/i.test(trimmed)) return false;

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("marketing.unsubscribe", new Error("service role client unavailable"));
    return false;
  }

  const { data, error } = await admin
    .from("marketing_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", trimmed)
    .select("id");

  if (error) {
    logServerError("marketing.unsubscribe.update", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
