/**
 * Talent custom-domain purchase billing.
 *
 * Pass-through only: charge the talent the exact Vercel Registrar quoted USD
 * price for that domain/year (no markup, no prepaid domain wallet). Checkout
 * `mode: "payment"` + `price_data` uses the live quote cents. The webhook buys
 * via Vercel Registrar ONLY after payment succeeds, then attaches the hostname
 * to the project and upserts `talent_site_domains`.
 */

import "server-only";

import { randomBytes } from "node:crypto";

import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { ensureCustomDomainOnVercelProject } from "@/lib/saas/custom-domain-actions";
import {
  buyDomain,
  REGISTRAR_AUTO_RENEW_POLICY,
  REGISTRAR_PURCHASE_YEARS,
  type RegistrarContactInformation,
} from "@/lib/saas/vercel-domains-registrar";
import {
  getOrCreateTalentStripeCustomer,
  type BillingResult,
} from "@/lib/stripe/talent-billing";

export const TALENT_DOMAIN_CHECKOUT_TYPE = "talent_domain_purchase" as const;

export type TalentDomainContactDraft = RegistrarContactInformation;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{7,14}$/;
const ISO2_RE = /^[A-Z]{2}$/;

/** Shared contact validator for Checkout start + webhook reconstruct. */
export function validateTalentDomainContact(
  contact: TalentDomainContactDraft,
): { ok: true; contact: TalentDomainContactDraft } | { ok: false; error: string } {
  const firstName = contact.firstName?.trim() ?? "";
  const lastName = contact.lastName?.trim() ?? "";
  const email = contact.email?.trim() ?? "";
  const phone = contact.phone?.trim() ?? "";
  const address1 = contact.address1?.trim() ?? "";
  const address2 = contact.address2?.trim() || undefined;
  const city = contact.city?.trim() ?? "";
  const state = contact.state?.trim() ?? "";
  const zip = contact.zip?.trim() ?? "";
  const country = (contact.country?.trim() ?? "").toUpperCase();

  if (!firstName || !lastName) return { ok: false, error: "Enter your first and last name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email for the registrant." };
  if (!E164_RE.test(phone)) {
    return { ok: false, error: "Phone must be E.164 (e.g. +15551234567)." };
  }
  if (!address1 || !city || !state || !zip) {
    return { ok: false, error: "Enter a full registrant address." };
  }
  if (!ISO2_RE.test(country)) {
    return { ok: false, error: "Country must be a 2-letter ISO code (e.g. US)." };
  }
  return {
    ok: true,
    contact: {
      firstName,
      lastName,
      email,
      phone,
      address1,
      address2,
      city,
      state,
      zip,
      country,
    },
  };
}

export async function createTalentDomainPurchaseCheckoutSession(opts: {
  userId: string;
  talentProfileId: string;
  email: string;
  displayName: string;
  domain: string;
  expectedPriceCents: number;
  contact: TalentDomainContactDraft;
  appBaseUrl: string;
  returnPath?: string;
}): Promise<BillingResult<{ url: string; sessionId: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  if (!opts.domain.trim() || opts.expectedPriceCents < 100) {
    return { ok: false, error: "Invalid domain quote." };
  }

  const validated = validateTalentDomainContact(opts.contact);
  if (!validated.ok) return { ok: false, error: validated.error };

  const stripe = getStripe()!;
  const customerResult = await getOrCreateTalentStripeCustomer(
    opts.userId,
    opts.email,
    opts.displayName,
  );
  if (!customerResult.ok) return customerResult;

  const domain = opts.domain.trim().toLowerCase();
  const returnPath = opts.returnPath ?? "/talent/site";
  const contact = validated.contact;

  const contactMeta = {
    contact_first_name: contact.firstName,
    contact_last_name: contact.lastName,
    contact_email: contact.email,
    contact_phone: contact.phone,
    contact_address1: contact.address1,
    contact_address2: contact.address2 ?? "",
    contact_city: contact.city,
    contact_state: contact.state,
    contact_zip: contact.zip,
    contact_country: contact.country,
  };

  try {
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerResult.data,
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: opts.expectedPriceCents,
              product_data: {
                name: `Domain: ${domain}`,
                description:
                  "1-year registration at the Vercel Registrar quoted price. Tulala charges this amount and registers the domain on your behalf.",
              },
            },
          },
        ],
        success_url: `${opts.appBaseUrl}${returnPath}?domainCheckout=done`,
        cancel_url: `${opts.appBaseUrl}${returnPath}?domainCheckout=cancel`,
        // Pass-through: charge must equal Registrar quote. No promo codes and
        // no adaptive pricing (those can diverge from expected_price_cents).
        metadata: {
          checkout_type: TALENT_DOMAIN_CHECKOUT_TYPE,
          talent_id: opts.talentProfileId,
          talent_profile_id: opts.talentProfileId,
          user_id: opts.userId,
          domain,
          expected_price_cents: String(opts.expectedPriceCents),
          ...contactMeta,
        },
        payment_intent_data: {
          metadata: {
            checkout_type: TALENT_DOMAIN_CHECKOUT_TYPE,
            talent_id: opts.talentProfileId,
            user_id: opts.userId,
            domain,
            expected_price_cents: String(opts.expectedPriceCents),
          },
        },
      },
      {
        // Nonce so cancel/retry opens a fresh session (do not pin forever to
        // talent+domain+price alone).
        idempotencyKey: `cs_talent_domain_${opts.talentProfileId}_${domain}_${opts.expectedPriceCents}_${randomBytes(4).toString("hex")}`,
      },
    );

    if (!session.url) {
      return { ok: false, error: "Stripe returned no checkout URL." };
    }
    return { ok: true, data: { url: session.url, sessionId: session.id } };
  } catch (err) {
    logServerError("talent-domain-billing.createCheckout", err);
    return { ok: false, error: "Could not create domain checkout session." };
  }
}

function contactFromMetadata(
  metadata: Record<string, string | undefined> | null | undefined,
): RegistrarContactInformation | null {
  if (!metadata) return null;
  const draft: TalentDomainContactDraft = {
    firstName: metadata.contact_first_name ?? "",
    lastName: metadata.contact_last_name ?? "",
    email: metadata.contact_email ?? "",
    phone: metadata.contact_phone ?? "",
    address1: metadata.contact_address1 ?? "",
    address2: metadata.contact_address2 ?? undefined,
    city: metadata.contact_city ?? "",
    state: metadata.contact_state ?? "",
    zip: metadata.contact_zip ?? "",
    country: metadata.contact_country ?? "",
  };
  const validated = validateTalentDomainContact(draft);
  return validated.ok ? validated.contact : null;
}

async function refundDomainPaymentIntent(
  paymentIntentId: string | null | undefined,
  reason: string,
): Promise<void> {
  if (!paymentIntentId || !isStripeConfigured()) return;
  try {
    const stripe = getStripe()!;
    await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        reason: "requested_by_customer",
        metadata: {
          checkout_type: TALENT_DOMAIN_CHECKOUT_TYPE,
          refund_reason: reason.slice(0, 400),
        },
      },
      { idempotencyKey: `rf_talent_domain_${paymentIntentId}` },
    );
  } catch (err) {
    logServerError("talent-domain-billing.refund", err);
  }
}

/**
 * Fulfill a paid talent domain Checkout session: Registrar buy → Vercel attach
 * → upsert `talent_site_domains`. Idempotent on stripe_checkout_session_id /
 * vercel_order_id. Buy ONLY runs from this post-payment path.
 *
 * Permanent fail paths (amount mismatch, registrar reject after pay) refund the
 * PaymentIntent when possible, write an error row, and return ok so Stripe does
 * not retry forever.
 */
export async function fulfillTalentDomainPurchase(opts: {
  sessionId: string;
  talentProfileId: string;
  domain: string;
  expectedPriceCents: number;
  amountTotal?: number | null;
  currency?: string | null;
  paymentIntentId?: string | null;
  metadata: Record<string, string | undefined> | null | undefined;
}): Promise<BillingResult<{ orderId: string | null }>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  const domain = opts.domain.trim().toLowerCase();
  const sessionId = opts.sessionId;

  // Idempotency: already fulfilled for this Checkout session.
  const { data: existingBySession, error: existingBySessionError } = await sb
    .from("talent_site_domains")
    .select("id, vercel_order_id, status, failure_reason")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (existingBySessionError) {
    logServerError("talent-domain-billing.fulfill.bySession", existingBySessionError);
    return { ok: false, error: "Could not look up domain purchase." };
  }

  if (existingBySession?.vercel_order_id) {
    return { ok: true, data: { orderId: existingBySession.vercel_order_id as string } };
  }

  const charged = opts.amountTotal;
  const currency = (opts.currency ?? "usd").toLowerCase();
  if (
    charged == null ||
    charged !== opts.expectedPriceCents ||
    currency !== "usd"
  ) {
    const reason = `Checkout amount mismatch (charged=${charged ?? "null"} ${currency}, expected=${opts.expectedPriceCents} usd).`;
    await refundDomainPaymentIntent(opts.paymentIntentId, reason);
    await upsertPurchaseErrorRow(sb, {
      talentProfileId: opts.talentProfileId,
      domain,
      sessionId,
      registrantEmail: opts.metadata?.contact_email ?? null,
      failureReason: reason,
    });
    return { ok: true, data: { orderId: null } };
  }

  const contact = contactFromMetadata(opts.metadata);
  if (!contact) {
    const reason = "Missing or invalid registrant contact on paid Checkout session.";
    await refundDomainPaymentIntent(opts.paymentIntentId, reason);
    await upsertPurchaseErrorRow(sb, {
      talentProfileId: opts.talentProfileId,
      domain,
      sessionId,
      registrantEmail: opts.metadata?.contact_email ?? null,
      failureReason: reason,
    });
    return { ok: true, data: { orderId: null } };
  }

  const expectedPrice = opts.expectedPriceCents / 100;
  const buy = await buyDomain(domain, {
    expectedPrice,
    contactInformation: contact,
    years: REGISTRAR_PURCHASE_YEARS,
    autoRenew: REGISTRAR_AUTO_RENEW_POLICY,
  });

  if (!buy.purchased) {
    const reason =
      buy.skippedReason ??
      buy.errorMessage ??
      buy.errorCode ??
      "Registrar buy failed after payment.";
    await refundDomainPaymentIntent(opts.paymentIntentId, reason);
    await upsertPurchaseErrorRow(sb, {
      talentProfileId: opts.talentProfileId,
      domain,
      sessionId,
      registrantEmail: contact.email,
      failureReason: `${reason} (payment refunded when possible).`,
    });
    // Permanent: refund attempted + error row. Acknowledge so Stripe stops retrying.
    return { ok: true, data: { orderId: null } };
  }

  // Attach to the tulala project (best-effort; DNS may still need settle).
  const attach = await ensureCustomDomainOnVercelProject(domain);
  const verificationToken = `impronta-verify-${randomBytes(12).toString("hex")}`;
  const failureReason =
    attach.attempted && !attach.attached && !attach.alreadyExists
      ? attach.errorMessage ?? attach.skippedReason ?? "Vercel attach failed after purchase."
      : null;

  const { data: existingDomain, error: existingDomainError } = await sb
    .from("talent_site_domains")
    .select("id")
    .eq("talent_profile_id", opts.talentProfileId)
    .eq("domain", domain)
    .maybeSingle();
  if (existingDomainError) {
    logServerError("talent-domain-billing.fulfill.byDomain", existingDomainError);
    return { ok: false, error: "Could not look up domain row after purchase." };
  }

  const row = {
    talent_profile_id: opts.talentProfileId,
    domain,
    status: failureReason ? "error" : "dns_verification_sent",
    verification_token: verificationToken,
    acquisition: "purchased",
    stripe_checkout_session_id: sessionId,
    vercel_order_id: buy.orderId,
    registrant_email: contact.email,
    failure_reason: failureReason,
    verified_at: null,
    ssl_provisioned_at: null,
  };

  if (existingDomain?.id || existingBySession?.id) {
    const id = (existingDomain?.id ?? existingBySession?.id) as string;
    const { error } = await sb.from("talent_site_domains").update(row).eq("id", id);
    if (error) {
      logServerError("talent-domain-billing.fulfill.update", error);
      return { ok: false, error: "Could not update domain row after purchase." };
    }
  } else {
    const { error } = await sb.from("talent_site_domains").insert(row);
    if (error) {
      // Unique conflict on session id from a concurrent webhook = success.
      if ((error as { code?: string }).code === "23505") {
        return { ok: true, data: { orderId: buy.orderId } };
      }
      logServerError("talent-domain-billing.fulfill.insert", error);
      return { ok: false, error: "Could not save domain row after purchase." };
    }
  }

  return { ok: true, data: { orderId: buy.orderId } };
}

async function upsertPurchaseErrorRow(
  sb: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  opts: {
    talentProfileId: string;
    domain: string;
    sessionId: string;
    registrantEmail: string | null;
    failureReason: string;
  },
): Promise<void> {
  const { data: bySession, error: bySessionError } = await sb
    .from("talent_site_domains")
    .select("id")
    .eq("stripe_checkout_session_id", opts.sessionId)
    .maybeSingle();
  if (bySessionError) {
    logServerError("talent-domain-billing.fulfill.errorRow.bySession", bySessionError);
    return;
  }
  let byDomain: { id: string } | null = null;
  if (!bySession) {
    const { data, error: byDomainError } = await sb
      .from("talent_site_domains")
      .select("id")
      .eq("talent_profile_id", opts.talentProfileId)
      .eq("domain", opts.domain)
      .maybeSingle();
    if (byDomainError) {
      logServerError("talent-domain-billing.fulfill.errorRow.byDomain", byDomainError);
      return;
    }
    byDomain = data as { id: string } | null;
  }
  const existingId = (bySession?.id ?? byDomain?.id) as string | undefined;

  const row = {
    talent_profile_id: opts.talentProfileId,
    domain: opts.domain,
    status: "error",
    acquisition: "purchased",
    stripe_checkout_session_id: opts.sessionId,
    registrant_email: opts.registrantEmail,
    failure_reason: opts.failureReason,
  };

  if (existingId) {
    await sb.from("talent_site_domains").update(row).eq("id", existingId);
    return;
  }
  const { error } = await sb.from("talent_site_domains").insert(row);
  if (error) logServerError("talent-domain-billing.fulfill.errorRow", error);
}
