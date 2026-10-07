/**
 * lib/payments/commerce-health.ts (TUL-147)
 *
 * Pure status function for the platform-admin "Commerce wiring" panel. No I/O.
 * Input is an env snapshot (modes and presence only, never key values) plus
 * counts and last-webhook timestamps; output is one row per check.
 *
 * Secrets rule: this module never returns a key. `snapshotKeyEnv` is the only
 * place that reads env values, and it reduces each key to a mode word or a
 * boolean before anything else sees it.
 */

import { checkStripeKeyModes, stripeKeyMode } from "@/lib/stripe/key-mode";

export type HealthRowStatus = "ok" | "warn" | "error";
export type KeyMode = "test" | "live" | "unset";

export const KEY_MODE_VARS = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_MX_SECRET_KEY",
  "STRIPE_MX_PUBLISHABLE_KEY",
  "STRIPE_V2_SECRET_KEY",
] as const;

export const WEBHOOK_SECRET_VARS = [
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET_CONNECT",
  "STRIPE_MX_WEBHOOK_SECRET",
  "STRIPE_MX_WEBHOOK_SECRET_CONNECT",
] as const;

export type KeyModeVar = (typeof KEY_MODE_VARS)[number];
export type WebhookSecretVar = (typeof WEBHOOK_SECRET_VARS)[number];

export interface CommerceHealthInput {
  keyModes: Record<KeyModeVar, KeyMode>;
  webhookSecretsSet: Record<WebhookSecretVar, boolean>;
  heldPayoutCount: number;
  /** Transactions in payment_requested for more than 24h. */
  stuckPaymentRequestedCount: number;
  /** ISO timestamps (or null when no events). */
  lastWebhookAt: { platform: string | null; platform_mx: string | null };
  now: Date;
}

export interface CommerceHealthRow {
  id: string;
  status: HealthRowStatus;
  /** English fallback line. Names, modes and counts only. */
  detail: string;
  /** Structured values the UI localizes from. */
  data?: Record<string, string | number | boolean | null>;
}

export const WEBHOOK_QUIET_HOURS = 24;

/** Reduce env to modes/booleans. The only function here that touches secrets. */
export function snapshotKeyEnv(
  env: Record<string, string | undefined> = process.env,
): Pick<CommerceHealthInput, "keyModes" | "webhookSecretsSet"> {
  const keyModes = {} as Record<KeyModeVar, KeyMode>;
  for (const n of KEY_MODE_VARS) keyModes[n] = stripeKeyMode(env[n]) ?? "unset";
  const webhookSecretsSet = {} as Record<WebhookSecretVar, boolean>;
  for (const n of WEBHOOK_SECRET_VARS) webhookSecretsSet[n] = Boolean(env[n]?.trim());
  return { keyModes, webhookSecretsSet };
}

function keyModeRow(keyModes: Record<KeyModeVar, KeyMode>): CommerceHealthRow {
  // Placeholders carry only the mode word so checkStripeKeyModes does the compare.
  const placeholders: Record<string, string> = {};
  for (const n of KEY_MODE_VARS) {
    if (keyModes[n] !== "unset") placeholders[n] = `sk_${keyModes[n]}_x`;
  }
  const check = checkStripeKeyModes(placeholders);
  const list = KEY_MODE_VARS.map((n) => `${n}: ${keyModes[n]}`).join(", ");
  return {
    id: "key-modes",
    status: check.ok ? "ok" : "error",
    detail: list,
    data: { mixed: !check.ok, mode: check.mode },
  };
}

function webhookSecretRows(set: Record<WebhookSecretVar, boolean>): CommerceHealthRow[] {
  return WEBHOOK_SECRET_VARS.map((n) => {
    const present = set[n];
    // The US base secret is required for any US event to verify; the rest are
    // warn (the MX connect one means held payouts only release via daily cron).
    const status: HealthRowStatus = present
      ? "ok"
      : n === "STRIPE_WEBHOOK_SECRET"
        ? "error"
        : "warn";
    return {
      id: `secret:${n}`,
      status,
      detail: `${n}: ${present ? "set" : "not set"}`,
      data: { name: n, present },
    };
  });
}

export function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 3_600_000;
}

function laneRow(
  id: "last-webhook:platform" | "last-webhook:platform_mx",
  iso: string | null,
  now: Date,
): CommerceHealthRow {
  const h = hoursSince(iso, now);
  if (h === null) {
    return { id, status: "warn", detail: "no events recorded", data: { hours: null } };
  }
  const hours = Math.floor(h);
  return {
    id,
    status: h > WEBHOOK_QUIET_HOURS ? "warn" : "ok",
    detail: `last event ${hours}h ago`,
    data: { hours },
  };
}

export function computeCommerceHealth(input: CommerceHealthInput): CommerceHealthRow[] {
  const rows: CommerceHealthRow[] = [keyModeRow(input.keyModes)];
  rows.push(...webhookSecretRows(input.webhookSecretsSet));
  rows.push({
    id: "held-payouts",
    status: input.heldPayoutCount > 0 ? "warn" : "ok",
    detail: `${input.heldPayoutCount} held`,
    data: { count: input.heldPayoutCount },
  });
  rows.push({
    id: "stuck-payment-requested",
    status: input.stuckPaymentRequestedCount > 0 ? "warn" : "ok",
    detail: `${input.stuckPaymentRequestedCount} older than 24h`,
    data: { count: input.stuckPaymentRequestedCount },
  });
  rows.push(laneRow("last-webhook:platform", input.lastWebhookAt.platform, input.now));
  rows.push(laneRow("last-webhook:platform_mx", input.lastWebhookAt.platform_mx, input.now));
  return rows;
}
