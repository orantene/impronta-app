"use client";

/**
 * jon360-funnel-events.ts — Phase 0c CRO instrumentation for the Jon 360 guest
 * inquiry arc. A thin, ADDITIVE wrapper over the existing dual-write client
 * (trackProductEvent in track-client.ts -> GA4 + the internal analytics_events
 * table via /api/analytics/events). It does NOT replace that pipeline; it only
 * standardizes the Jon-360 funnel props and pins two behaviors the CRO read
 * depends on:
 *
 *   1. STANDARD PROPS. Every funnel event carries the same shape so the funnel
 *      stitches cleanly: { inquiry_id?, tenant_id?, lineup_count, identity,
 *      source, holdout_arm }. tenant_id is left top-level in the payload so
 *      track-client.ts promotes it to the analytics_events.tenant_id COLUMN
 *      (per-tenant funnel queries then match real rows).
 *
 *   2. PRIMARY-METRIC ANCHORING. contact_promoted (the send/airlock conversion)
 *      is the funnel's bottom line. GA4 is consent-gated and undercounts, so the
 *      primary metric is anchored on the INTERNAL table via trackInternalOnly():
 *      it skips GA4 and writes straight to analytics_events (guaranteed write).
 *      Secondary/diagnostic events still dual-write through trackProductEvent.
 *
 * HOLDOUT FLAG. The 360 arc is bucketed per-visitor into "on" | "off" arms via
 * the FROZEN FNV-1a bucketer the page-builder experiment engine already uses
 * (assignExperimentVariant), seeded by a stable per-visitor id persisted in
 * localStorage. The arm rides on every funnel event as `holdout_arm` so lift is
 * measured against a real control. A master kill/scope switch
 * (NEXT_PUBLIC_JON360_HOLDOUT) lets ops force all visitors into "on" (holdout
 * disabled) or run the 50/50 split. Bucketing is read-only + deterministic, so
 * first paint and later hydration never desync.
 *
 * MDE / POWER (honest): a 1% absolute lift on a ~5% baseline conversion (95%
 * confidence, 80% power) needs ~7.8k visitors PER ARM (~15.6k total). The /t
 * profile surface alone will not hit that quickly. Run the holdout on the
 * higher-traffic directory surface to read a result inside a sane window.
 */

import { trackProductEvent } from "./track-client";
import {
  PRODUCT_ANALYTICS_EVENTS,
  type ProductAnalyticsPayload,
} from "./product-events";
import { assignExperimentVariant } from "@/lib/site-admin/builder-node/experiment";

// ─────────────────────────────────────────────────────────────────────────────
// Holdout bucketing
// ─────────────────────────────────────────────────────────────────────────────

/** Salt for the holdout bucket. Stable forever — changing it re-buckets everyone. */
const JON360_HOLDOUT_ID = "jon360_arc";
const VISITOR_SEED_KEY = "tulala_visitor_seed";

export type Jon360HoldoutArm = "on" | "off";

/**
 * Stable per-visitor seed for deterministic bucketing. Persisted in
 * localStorage so the same visitor keeps the same arm across sessions on this
 * device. Best-effort: when storage is blocked (privacy modes) we fall back to
 * a per-page-load random seed (the visitor still gets ONE consistent arm for
 * the life of the page, which is enough for the funnel to stitch within a
 * session). Returns null only on the server.
 */
function getVisitorSeed(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let seed = window.localStorage.getItem(VISITOR_SEED_KEY);
    if (!seed) {
      seed =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(VISITOR_SEED_KEY, seed);
    }
    return seed;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Resolve the visitor's holdout arm.
 *   - NEXT_PUBLIC_JON360_HOLDOUT === "off"  -> holdout DISABLED, everyone "on".
 *   - NEXT_PUBLIC_JON360_HOLDOUT === "split" (or unset) -> 50/50 bucket.
 * Reuses the FROZEN 2-arm even FNV-1a split: bucket "a" -> "off" (control,
 * no 360 arc), "b" -> "on" (360 arc). Deterministic + read-only.
 */
export function resolveJon360HoldoutArm(): Jon360HoldoutArm {
  const mode = process.env.NEXT_PUBLIC_JON360_HOLDOUT;
  if (mode === "off") return "on"; // holdout disabled: ship the arc to everyone
  const seed = getVisitorSeed();
  if (!seed) return "on";
  // assignExperimentVariant("a"|"b"): "a" is always control -> the holdout (off).
  return assignExperimentVariant(JON360_HOLDOUT_ID, seed) === "a" ? "off" : "on";
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard funnel props
// ─────────────────────────────────────────────────────────────────────────────

export type Jon360Identity = "guest" | "client";

export type Jon360FunnelContext = {
  /** The single inquiry record id (null until the early-row draft is created). */
  inquiryId?: string | null;
  /** Agency/tenant uuid. Left top-level so track-client promotes it to the column. */
  tenantId?: string | null;
  /** Live lineup/cart size at the moment of the event. */
  lineupCount: number;
  /** Whether the actor is an anonymous guest or a signed-in client. */
  identity?: Jon360Identity;
  /** Source surface (e.g. "/t/TA-12345" or "/directory"). */
  source: string;
};

/**
 * Build the standard Jon-360 funnel payload. The holdout arm is resolved once
 * per call (cheap, deterministic) so every event self-describes its arm.
 */
export function buildJon360Props(
  ctx: Jon360FunnelContext,
  extra?: ProductAnalyticsPayload,
): ProductAnalyticsPayload {
  return {
    ...(ctx.inquiryId ? { inquiry_id: ctx.inquiryId } : {}),
    ...(ctx.tenantId ? { tenant_id: ctx.tenantId } : {}),
    lineup_count: ctx.lineupCount,
    identity: ctx.identity ?? "guest",
    source: ctx.source,
    holdout_arm: resolveJon360HoldoutArm(),
    ...(extra ?? {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal-only write (primary-metric anchor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write an event to the INTERNAL analytics_events table only, bypassing GA4.
 * Used for the PRIMARY conversion (contact_promoted) so the number is never
 * undercounted by GA4 consent gating. Mirrors track-client.ts/postInternal but
 * is intentionally NOT exported from there (the dual-write is the default; this
 * is the deliberate exception).
 */
function trackInternalOnly(
  name: (typeof PRODUCT_ANALYTICS_EVENTS)[keyof typeof PRODUCT_ANALYTICS_EVENTS],
  payload: ProductAnalyticsPayload,
): void {
  if (typeof window === "undefined") return;
  const path = window.location?.pathname ?? null;
  const tenantId =
    typeof payload.tenant_id === "string" && payload.tenant_id
      ? payload.tenant_id
      : undefined;
  const body = JSON.stringify({
    name,
    payload,
    path,
    locale:
      typeof document !== "undefined"
        ? document.documentElement.lang || undefined
        : undefined,
    ...(tenantId ? { tenant_id: tenantId } : {}),
  });
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* ignore — best-effort, never block the send flow */
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Funnel firing helpers — one per funnel point. Smallest possible call-site.
// ─────────────────────────────────────────────────────────────────────────────

export function trackLineupAdd(ctx: Jon360FunnelContext, talentProfileId?: string): void {
  trackProductEvent(
    PRODUCT_ANALYTICS_EVENTS.lineup_add,
    buildJon360Props(ctx, talentProfileId ? { talent_id: talentProfileId } : undefined),
  );
}

export function trackLineupRemove(ctx: Jon360FunnelContext, talentProfileId?: string): void {
  trackProductEvent(
    PRODUCT_ANALYTICS_EVENTS.lineup_remove,
    buildJon360Props(ctx, talentProfileId ? { talent_id: talentProfileId } : undefined),
  );
}

export function trackDraftCreated(ctx: Jon360FunnelContext): void {
  trackProductEvent(PRODUCT_ANALYTICS_EVENTS.draft_created, buildJon360Props(ctx));
}

export function trackChatOpened(ctx: Jon360FunnelContext): void {
  trackProductEvent(PRODUCT_ANALYTICS_EVENTS.chat_opened, buildJon360Props(ctx));
}

export function trackFieldFilled(ctx: Jon360FunnelContext, field: string): void {
  trackProductEvent(
    PRODUCT_ANALYTICS_EVENTS.field_filled,
    buildJon360Props(ctx, { field }),
  );
}

export function trackSendClicked(ctx: Jon360FunnelContext): void {
  trackProductEvent(PRODUCT_ANALYTICS_EVENTS.send_clicked, buildJon360Props(ctx));
}

/**
 * PRIMARY CONVERSION. Anchored on the internal table only (GA4 undercounts).
 */
export function trackContactPromoted(ctx: Jon360FunnelContext): void {
  trackInternalOnly(
    PRODUCT_ANALYTICS_EVENTS.contact_promoted,
    buildJon360Props(ctx),
  );
}

export function trackReceiptViewed(ctx: Jon360FunnelContext): void {
  trackProductEvent(PRODUCT_ANALYTICS_EVENTS.receipt_viewed, buildJon360Props(ctx));
}

export function trackReplyReceived(ctx: Jon360FunnelContext): void {
  trackProductEvent(PRODUCT_ANALYTICS_EVENTS.reply_received, buildJon360Props(ctx));
}

export function trackOfferViewed(ctx: Jon360FunnelContext): void {
  trackProductEvent(PRODUCT_ANALYTICS_EVENTS.offer_viewed, buildJon360Props(ctx));
}
