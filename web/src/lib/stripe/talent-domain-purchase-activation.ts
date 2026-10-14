/**
 * Purchased-domain activation (D3).
 *
 * Domains bought through Tulala sit on Vercel DNS (registrar). After Stripe
 * payment + registrar buy + project attach, the row goes straight to `active`
 * with no talent TXT / DNS step. Renewal money stays with Payments (D5) —
 * this module does not change auto-renew or charge renewals.
 */

import type { VercelDomainSyncResult } from "@/lib/saas/custom-domain-actions";

export type PurchasedTalentDomainRow = {
  talent_profile_id: string;
  domain: string;
  status: "active" | "error";
  verification_token: null;
  acquisition: "purchased";
  stripe_checkout_session_id: string;
  vercel_order_id: string | null;
  registrant_email: string;
  failure_reason: string | null;
  verified_at: string | null;
  ssl_provisioned_at: string | null;
  last_health_check_at: string | null;
  is_primary: boolean;
};

/**
 * Pure row builder for post-purchase fulfillment.
 *
 * Attach failure → `error` (visible failure_reason).
 * Attach ok (or already on our project) → `active`, no verification token.
 * Vercel `verified` from attach/verify is recorded via timestamps; we do not
 * park purchased domains on the DIY TXT lifecycle status.
 */
export function buildPurchasedTalentDomainRow(opts: {
  talentProfileId: string;
  domain: string;
  sessionId: string;
  orderId: string | null;
  registrantEmail: string;
  attach: Pick<
    VercelDomainSyncResult,
    "attempted" | "attached" | "alreadyExists" | "verified" | "errorMessage" | "skippedReason"
  >;
  /** Result of a best-effort POST /verify after attach; ignored when attach failed. */
  verify: Pick<VercelDomainSyncResult, "verified"> | null;
  nowIso: string;
  makePrimary: boolean;
}): PurchasedTalentDomainRow {
  const onOurProject = opts.attach.attached || opts.attach.alreadyExists;
  if (!onOurProject) {
    const failureReason =
      opts.attach.errorMessage ??
      opts.attach.skippedReason ??
      "Vercel attach failed after purchase.";
    return {
      talent_profile_id: opts.talentProfileId,
      domain: opts.domain,
      status: "error",
      verification_token: null,
      acquisition: "purchased",
      stripe_checkout_session_id: opts.sessionId,
      vercel_order_id: opts.orderId,
      registrant_email: opts.registrantEmail,
      failure_reason: failureReason,
      verified_at: null,
      ssl_provisioned_at: null,
      last_health_check_at: opts.nowIso,
      is_primary: false,
    };
  }

  // Purchased + attached on Vercel DNS → live. No TXT step for the talent.
  // attach.verified / verify.verified are observational only (D2 owns challenge UX).
  void opts.attach.verified;
  void opts.verify;

  return {
    talent_profile_id: opts.talentProfileId,
    domain: opts.domain,
    status: "active",
    verification_token: null,
    acquisition: "purchased",
    stripe_checkout_session_id: opts.sessionId,
    vercel_order_id: opts.orderId,
    registrant_email: opts.registrantEmail,
    failure_reason: null,
    verified_at: opts.nowIso,
    ssl_provisioned_at: opts.nowIso,
    last_health_check_at: opts.nowIso,
    is_primary: opts.makePrimary,
  };
}
