/**
 * commerce-audit.ts — every write that changes what Tulala charges leaves a trace.
 *
 * WHY THIS EXISTS
 * ───────────────
 * As of the 2026-09-02 commerce audit, exactly ONE of the platform's commercial
 * write surfaces recorded who changed what: `commerce/commission/actions.ts`.
 * The other twenty-six actions — price create / update / archive, tier renames,
 * feature rows, discounts, account-level discount grants, trial offers, pricing
 * defaults and plan downgrades — wrote to production with no actor, no reason,
 * no before/after and no way to answer "who changed this price, and when".
 * `FeaturesTab` said it out loud: "archive (hard-delete; features have no audit
 * trail)".
 *
 * That is the wrong posture for a table that decides what a customer's card is
 * charged. This module makes the audited write the easy one to write.
 *
 * DESIGN
 * ──────
 * One call, taken AFTER the write succeeds, carrying the before and after
 * states. It deliberately does NOT wrap the write: a helper that owns the
 * transaction would have to know every table's shape, and the actions differ
 * too much (some sync to Stripe mid-write, some archive-and-insert). Instead it
 * is a single line each action adds, and the static guard in
 * `commerce-audit.static.test.ts` fails CI if a write action forgets it.
 *
 * NEVER THROWS
 * ────────────
 * An audit failure must not fail the operator's write. The change already
 * happened; refusing to report it does not un-happen it, and turning a logging
 * outage into a commerce outage is a bad trade. Failures are logged and
 * swallowed. The static guard, not a runtime exception, is what keeps coverage
 * honest.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * `action` values. Dotted, past-tense-neutral, and stable: these strings are
 * queried by the audit-log surface and must not be renamed casually.
 */
export const COMMERCE_AUDIT = {
  PRICE_ADDED: "platform.commerce.price.added",
  PRICE_UPDATED: "platform.commerce.price.updated",
  PRICE_ARCHIVED: "platform.commerce.price.archived",
  TIER_DISPLAY_UPDATED: "platform.commerce.tier.display_updated",
  FEATURE_ADDED: "platform.commerce.feature.added",
  FEATURE_UPDATED: "platform.commerce.feature.updated",
  FEATURE_ARCHIVED: "platform.commerce.feature.archived",
  FEATURE_REORDERED: "platform.commerce.feature.reordered",
  DISCOUNT_CREATED: "platform.commerce.discount.created",
  DISCOUNT_UPDATED: "platform.commerce.discount.updated",
  DISCOUNT_ARCHIVED: "platform.commerce.discount.archived",
  DISCOUNT_IMPORTED: "platform.commerce.discount.imported",
  ACCOUNT_DISCOUNT_GRANTED: "platform.commerce.account_discount.granted",
  ACCOUNT_DISCOUNT_REVOKED: "platform.commerce.account_discount.revoked",
  TRIAL_OFFER_UPDATED: "platform.commerce.trial_offer.updated",
  PRICING_DEFAULTS_UPDATED: "platform.commerce.pricing_defaults.updated",
  PLAN_DOWNGRADED: "platform.commerce.plan.downgraded",
  ENTITLEMENT_UPDATED: "platform.commerce.entitlement.updated",
} as const;

export type CommerceAuditAction =
  (typeof COMMERCE_AUDIT)[keyof typeof COMMERCE_AUDIT];

/**
 * Severity for the audit row.
 *
 *   warn  — changes what a customer is charged or what they can access.
 *           Prices, discounts, entitlements, plan moves.
 *   info  — changes presentation only. Tier display names, feature labels,
 *           feature ordering.
 *
 * The split exists so the audit surface can answer "show me only the changes
 * that could have moved money" without reading every row's metadata.
 */
export type CommerceAuditSeverity = "info" | "warn";

export type CommerceAuditEntry = {
  action: CommerceAuditAction;
  actorId: string;
  /**
   * The actor's role at the time of the write. Most of these surfaces are
   * platform-admin only, but plan downgrades and per-tenant pricing defaults
   * are performed by WORKSPACE STAFF on their own tenant. Recording
   * "super_admin" for those would be a false statement in the audit log.
   */
  actorRole?: "super_admin" | "workspace_staff";
  /**
   * Set for tenant-scoped changes so the row is filterable by workspace.
   * Null for platform-wide catalog edits, which belong to no single tenant.
   */
  tenantId?: string | null;
  /** The table the change landed in, e.g. `product_prices`. */
  targetType: string;
  /** Row id, or a stable synthetic id like `singleton` / `${tier}:${interval}`. */
  targetId: string;
  severity?: CommerceAuditSeverity;
  /** Row state before the write. `null` for a create. */
  before?: unknown;
  /** Row state after the write. `null` for a delete. */
  after?: unknown;
  /**
   * Operator-supplied reason, when the surface collects one. Not yet collected
   * everywhere; the column is nullable and the audit surface renders "not
   * given" rather than pretending one exists.
   */
  reason?: string | null;
  /** Anything else worth keeping: Stripe ids touched, sync outcome, counts. */
  context?: Record<string, unknown>;
};

/**
 * Record one commercial change. Call AFTER the write succeeds.
 *
 * Never throws and never returns a failure the caller must handle: see the
 * module header for why an audit outage must not become a commerce outage.
 */
export async function recordCommerceAudit(
  entry: CommerceAuditEntry,
): Promise<void> {
  try {
    const sb = createServiceRoleClient();
    if (!sb) {
      logServerError(
        "commerce-audit.no-client",
        new Error(`no service client; ${entry.action} on ${entry.targetId} went unrecorded`),
      );
      return;
    }

    const { error } = await sb.from("platform_audit_log").insert({
      actor_profile_id: entry.actorId,
      actor_user_id: entry.actorId,
      actor_role: entry.actorRole ?? "super_admin",
      action: entry.action,
      target_type: entry.targetType,
      target_kind: entry.targetType,
      target_id: entry.targetId,
      tenant_id: entry.tenantId ?? null,
      severity: entry.severity ?? "warn",
      reason: entry.reason ?? null,
      before_jsonb: (entry.before ?? null) as never,
      after_jsonb: (entry.after ?? null) as never,
      metadata: {
        before: entry.before ?? null,
        after: entry.after ?? null,
        ...(entry.context ?? {}),
      } as never,
      context_jsonb: (entry.context ?? {}) as never,
    });

    if (error) {
      logServerError("commerce-audit.insert", error);
    }
  } catch (err) {
    logServerError("commerce-audit.insert", err);
  }
}

// ─── Discount shapes ─────────────────────────────────────────────────────────
//
// `admin-product-discounts.ts` sits a few lines under the 800-line file cap, so
// its four audit calls live here as named wrappers rather than as inline
// literals at the call sites. That is not only a size dodge: a discount audit
// has a fixed shape (the code, the Stripe pair, whether Stripe actually moved),
// and encoding it once means the four call sites cannot drift in what they
// record.

export async function auditDiscountCreated(args: {
  actorId: string;
  discountId: string;
  code: string;
  kind: string;
  value: number | string;
  stripeSynced: boolean;
  couponId: string | null;
  promotionCodeId: string | null;
}): Promise<void> {
  await recordCommerceAudit({
    action: COMMERCE_AUDIT.DISCOUNT_CREATED,
    actorId: args.actorId,
    targetType: "product_discounts",
    targetId: args.discountId,
    before: null,
    after: { code: args.code, kind: args.kind, value: args.value },
    context: {
      stripe_synced: args.stripeSynced,
      stripe_coupon_id: args.couponId,
      stripe_promotion_code_id: args.promotionCodeId,
    },
  });
}

export async function auditDiscountArchived(args: {
  actorId: string;
  discountId: string;
  stripePromotionCodeId: string | null;
}): Promise<void> {
  await recordCommerceAudit({
    action: COMMERCE_AUDIT.DISCOUNT_ARCHIVED,
    actorId: args.actorId,
    targetType: "product_discounts",
    targetId: args.discountId,
    before: { is_active: true },
    after: { is_active: false },
    context: { stripe_promotion_code_id: args.stripePromotionCodeId },
  });
}

export async function auditDiscountUpdated(args: {
  actorId: string;
  discountId: string;
  after: Record<string, unknown>;
}): Promise<void> {
  await recordCommerceAudit({
    action: COMMERCE_AUDIT.DISCOUNT_UPDATED,
    actorId: args.actorId,
    targetType: "product_discounts",
    targetId: args.discountId,
    after: args.after,
  });
}

export async function auditDiscountImported(args: {
  actorId: string;
  imported: number;
  linked: number;
  skipped: number;
}): Promise<void> {
  await recordCommerceAudit({
    action: COMMERCE_AUDIT.DISCOUNT_IMPORTED,
    actorId: args.actorId,
    targetType: "product_discounts",
    targetId: "stripe-import",
    severity: args.imported > 0 || args.linked > 0 ? "warn" : "info",
    context: { imported: args.imported, linked: args.linked, skipped: args.skipped },
  });
}
