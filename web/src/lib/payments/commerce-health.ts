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
import { WEBHOOK_LANES, laneForEventId, type WebhookLane } from "@/lib/stripe/webhook-lanes";

export type HealthRowStatus = "ok" | "warn" | "error";
export type KeyMode = "test" | "live" | "unset";

export const KEY_MODE_VARS = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_MX_SECRET_KEY",
  // Same order getStripeMxPublishableKey (stripe/client.ts) reads them: the
  // NEXT_PUBLIC_ name wins, the Vercel server-side name is the fallback.
  // Pinned against client.ts by commerce-health.test.ts.
  "NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY",
  "STRIPE_MX_PUBLISHABLE_KEY",
  "STRIPE_V2_SECRET_KEY",
] as const;

/** MX publishable key env names in client read order (first non-empty wins). */
export const MX_PUBLISHABLE_KEY_READ_ORDER = [
  "NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY",
  "STRIPE_MX_PUBLISHABLE_KEY",
] as const satisfies readonly (typeof KEY_MODE_VARS)[number][];

export const WEBHOOK_SECRET_VARS = [
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET_CONNECT",
  "STRIPE_MX_WEBHOOK_SECRET",
  "STRIPE_MX_WEBHOOK_SECRET_CONNECT",
] as const;

export type KeyModeVar = (typeof KEY_MODE_VARS)[number];
export type WebhookSecretVar = (typeof WEBHOOK_SECRET_VARS)[number];

export type HeldPayoutsHealth =
  | { state: "ok"; count: number }
  | { state: "capped"; count: number }
  | { state: "error" };

export interface CommerceHealthInput {
  keyModes: Record<KeyModeVar, KeyMode>;
  webhookSecretsSet: Record<WebhookSecretVar, boolean>;
  /** Held-payouts read: exact count, capped (lower bound), or a failed read. */
  heldPayouts: HeldPayoutsHealth;
  /** Transactions in payment_requested for more than 24h. */
  stuckPaymentRequestedCount: number;
  /** ISO timestamps (or null when no events). */
  lastWebhookAt: { platform: string | null; platform_mx: string | null };
  /** The Mexico lane in one place (TUL-186): optional so older callers and tests keep working. */
  mxLane?: MxLaneHealth;
  now: Date;
}

/** What the Mexico lane has done, and whether anything should have reached it. */
export interface MxLaneHealth {
  /** Newest `platform_mx` event, or null when the lane has never recorded one. */
  lastEventAt: string | null;
  /** That event's livemode (true live, false test), null when unknown or no event. */
  lastEventLivemode: boolean | null;
  /** `platform_mx` events recorded in the last 24h. */
  eventsLast24h: number;
  /** Talents plus agencies connected on the MX platform (`stripe_account_platform = 'mx'`). */
  mxSellers: number;
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

/**
 * Panel lane classification for a stripe_processed_events row.
 * An explicit `lane` wins. A NULL lane is a legacy row (written before the lane
 * column existed, or by old code still running during the deploy window) and
 * falls back to the event_id prefix rule ONLY for those nulls: `platform_mx:` is
 * MX, no colon is the US lane. A non-null lane is never second-guessed by id.
 */
export function classifyEventLane(row: {
  lane: string | null | undefined;
  event_id: string;
}): WebhookLane | "other" {
  if (row.lane != null) {
    return (WEBHOOK_LANES as readonly string[]).includes(row.lane) ? (row.lane as WebhookLane) : "other";
  }
  return laneForEventId(row.event_id) ?? "other";
}

/**
 * PostgREST `or()` filters the loader applies, kept next to classifyEventLane
 * because they must express the same rule (tested for agreement). `*` is the
 * PostgREST like-wildcard.
 */
export const LANE_FILTER_OR = {
  platform: "lane.eq.platform,and(lane.is.null,event_id.not.like.*:*)",
  platform_mx: "lane.eq.platform_mx,and(lane.is.null,event_id.like.platform_mx:*)",
} as const;

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

/** Which env var the MX client actually reads, or "none". Mirrors client.ts's `||` chain. */
export function effectiveMxPublishableVar(
  keyModes: Record<KeyModeVar, KeyMode>,
): (typeof MX_PUBLISHABLE_KEY_READ_ORDER)[number] | "none" {
  return MX_PUBLISHABLE_KEY_READ_ORDER.find((n) => keyModes[n] !== "unset") ?? "none";
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
    data: {
      mixed: !check.ok,
      mode: check.mode,
      mxPublishableSource: effectiveMxPublishableVar(keyModes),
      // Per-variable modes so the UI can localize the list from data.
      ...Object.fromEntries(KEY_MODE_VARS.map((n) => [`m:${n}`, keyModes[n]])),
    },
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

function heldRow(h: HeldPayoutsHealth): CommerceHealthRow {
  if (h.state === "error") {
    // A failed read is an error row, never a silent zero.
    return {
      id: "held-payouts",
      status: "error",
      detail: "held payouts read failed",
      data: { state: "error" },
    };
  }
  if (h.state === "capped") {
    return {
      id: "held-payouts",
      status: "warn",
      detail: `${h.count}+ held`,
      data: { state: "capped", count: h.count, capped: true },
    };
  }
  return {
    id: "held-payouts",
    status: h.count > 0 ? "warn" : "ok",
    detail: `${h.count} held`,
    data: { state: "ok", count: h.count },
  };
}

/**
 * The MX lane row (TUL-186). Production had 0 MX events because nothing had ever used the lane; this makes
 * that visible, and warns when it stops being true quietly: an MX-connected seller exists but the lane
 * recorded nothing in 24h, or the Connect signing secret is unset while MX sellers exist. Presence only.
 */
export function mxLaneRow(mx: MxLaneHealth, connectSecretSet: boolean, now: Date): CommerceHealthRow {
  const hours = hoursSince(mx.lastEventAt, now);
  const mode = mx.lastEventAt == null ? null : mx.lastEventLivemode === true ? "live" : mx.lastEventLivemode === false ? "test" : "unknown";
  const silent = mx.mxSellers > 0 && mx.eventsLast24h === 0;
  const connectMissing = !connectSecretSet;
  const status: HealthRowStatus = silent || (mx.mxSellers > 0 && connectMissing) ? "warn" : "ok";
  const state = silent ? "silent" : mx.lastEventAt == null ? "no_events" : "last";
  const detail =
    state === "no_events"
      ? `no MX events yet; MX-connected sellers: ${mx.mxSellers}`
      : state === "silent"
        ? `${mx.mxSellers} MX-connected seller(s) but 0 platform_mx events in 24h`
        : `last MX event ${Math.floor(hours ?? 0)}h ago (${mode}); ${mx.eventsLast24h} in 24h; MX-connected sellers: ${mx.mxSellers}`;
  return {
    id: "mx-lane",
    status,
    detail: connectMissing ? `${detail}; Connect secret missing` : detail,
    data: {
      state,
      hours: hours === null ? null : Math.floor(hours),
      mode,
      events24h: mx.eventsLast24h,
      sellers: mx.mxSellers,
      connectMissing,
    },
  };
}

export function computeCommerceHealth(input: CommerceHealthInput): CommerceHealthRow[] {
  const rows: CommerceHealthRow[] = [keyModeRow(input.keyModes)];
  rows.push(...webhookSecretRows(input.webhookSecretsSet));
  rows.push(heldRow(input.heldPayouts));
  rows.push({
    id: "stuck-payment-requested",
    status: input.stuckPaymentRequestedCount > 0 ? "warn" : "ok",
    detail: `${input.stuckPaymentRequestedCount} older than 24h`,
    data: { count: input.stuckPaymentRequestedCount },
  });
  rows.push(laneRow("last-webhook:platform", input.lastWebhookAt.platform, input.now));
  rows.push(laneRow("last-webhook:platform_mx", input.lastWebhookAt.platform_mx, input.now));
  if (input.mxLane) rows.push(mxLaneRow(input.mxLane, input.webhookSecretsSet.STRIPE_MX_WEBHOOK_SECRET_CONNECT, input.now));
  return rows;
}
