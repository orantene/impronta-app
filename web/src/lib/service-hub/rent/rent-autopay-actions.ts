"use server";

/**
 * TUL-1601: the MEMBER turns automatic monthly rent on (Stripe Checkout, subscription mode, recurring-charge consent
 * required) or off. Flag RENT_AUTOPAY_ENABLED + a TEST key; fixed rent only; the studio's connected account must be
 * ready; the Tulala service fee is the studio's current fee (fail closed when it cannot be confirmed); the first
 * automatic charge is the 1st of next month. The subscription lives on the studio's platform (US or MX, TUL-1610).
 */
import { revalidatePath } from "next/cache";
import { logWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { decidePassThrough } from "@/lib/billing/pass-through-arming";
import { loadSellerPassThroughBps } from "@/lib/billing/pass-through-rate";
import { resolveMarketingOrigin } from "@/lib/brand/marketing-origin";
import { getAppUrl } from "@/lib/auth-flow";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { getRequestLocale } from "@/i18n/request-locale";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { loadAccountPlatformStrict } from "@/lib/stripe/account-platform";
import { getStripeFor, type StripeAccountKey } from "@/lib/stripe/client";
import type Stripe from "stripe";
import { recurringConsentParams } from "@/lib/stripe/recurring-consent";
import { getOrCreateTalentStripeCustomer } from "@/lib/stripe/talent-billing";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { buildRentSubscriptionParams, decideRentAutopay, nextMonthAnchorSeconds, rentAutopayAmounts, rentAutopayFlagOn, rentAutopayGate, type RentAutopayRefusal } from "./rent-autopay";
import { cancelRentSubscription } from "./rent-autopay.server";
import { periodOfSeconds } from "./rent-autopay-routing";
import { planFromRow, PLAN_COLUMNS } from "./rent-store.server";

export type StartAutopayResult =
  | { ok: true; url: string }
  | { ok: false; reason: RentAutopayRefusal | "disabled" | "not_test_mode" | "unauthenticated" | "not_found" | "unavailable" };

export async function startRentAutopay(input: { planId: string }): Promise<StartAutopayResult> {
  await requireNotImpersonating();
  try {
    // The flag first (cheap); the TEST-key check needs the platform the subscription will live on, so it comes after it is read.
    if (!rentAutopayFlagOn()) return { ok: false, reason: "disabled" };
    const me = await requireTalentSelf();
    if (!me.ok) return { ok: false, reason: "unauthenticated" };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    const { data: row } = await admin
      .from("studio_rent_plans")
      .select(PLAN_COLUMNS)
      .eq("id", input.planId)
      .eq("talent_profile_id", me.talentProfile.id)
      .maybeSingle();
    if (!row) return { ok: false, reason: "not_found" };
    const plan = planFromRow(row as Parameters<typeof planFromRow>[0]);
    const autopayStatus = plan.autopayStatus ?? "off";

    // TUL-1610: the subscription and the member's customer live on the studio's own platform (US or MX).
    const platform = await loadAccountPlatformStrict("agencies", { column: "id", value: plan.tenantId }, admin);
    if (!platform) return { ok: false, reason: "unavailable" };
    const gate = rentAutopayGate(process.env, platform);
    if (!gate.ok) return gate;
    const stripe = getStripeFor(platform);
    if (!stripe) return { ok: false, reason: "unavailable" };
    const { data: ag } = await admin.from("agencies").select("stripe_account_id, stripe_charges_enabled").eq("id", plan.tenantId).maybeSingle();
    const studio = {
      accountId: (ag as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null,
      chargesEnabled: (ag as { stripe_charges_enabled?: boolean } | null)?.stripe_charges_enabled === true,
    };

    // The studio's CURRENT Tulala service fee, resolved exactly like a checkout (customer-only model only).
    const decision = await decidePassThrough(admin);
    const feeBps =
      decision.mode === "on"
        ? await loadSellerPassThroughBps(admin, { platformBps: decision.platformBps, planFeeBps: decision.planFeeBps, seller: { kind: "workspace", partyId: plan.tenantId } })
        : null;

    const verdict = decideRentAutopay({ plan, studio, feeBps, autopayStatus });
    if (!verdict.ok) return verdict;
    const amounts = rentAutopayAmounts(plan.monthlyRentCents, feeBps as number);
    if (!amounts) return { ok: false, reason: "fee_unavailable" };

    const email = me.session.user.email ?? "";
    const { data: tp } = await admin.from("talent_profiles").select("display_name").eq("id", me.talentProfile.id).maybeSingle();
    const displayName = (tp as { display_name?: string | null } | null)?.display_name ?? "";
    const customer =
      platform === "us"
        ? await getOrCreateTalentStripeCustomer(me.session.user.id, email, displayName)
        : await mxRentCustomer(admin, stripe, { talentProfileId: me.talentProfile.id, userId: me.session.user.id, email, displayName });
    if (!customer.ok) return { ok: false, reason: "unavailable" };

    const locale = (await getRequestLocale()) === "es" ? "es" : "en";
    const anchor = nextMonthAnchorSeconds(new Date());
    const base = `${getAppUrl()}/talent/rent-proposals`;
    const params = buildRentSubscriptionParams({
      plan,
      amounts,
      customerId: customer.data,
      studioAccountId: studio.accountId as string,
      successUrl: `${base}?autopay=started`,
      cancelUrl: `${base}?autopay=cancelled`,
      locale,
      anchorSeconds: anchor,
      rentLabel: locale === "es" ? "Renta de estación" : "Station rent",
      feeLabel: locale === "es" ? "Cargo por servicio de Tulala" : "Tulala service fee",
      consent: recurringConsentParams({ locale, interval: "month", marketingOrigin: resolveMarketingOrigin() }),
    });
    // One session per plan and terms version: a double click reuses it.
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `rent_sub_${plan.id}_v${plan.termsVersion}_${amounts.totalCents}` });
    if (!session.url) return { ok: false, reason: "unavailable" };
    await admin
      .from("studio_rent_plans")
      .update({ autopay_status: "pending", autopay_first_period: periodOfSeconds(anchor), autopay_platform: platform, autopay_customer_id: customer.data, updated_at: new Date().toISOString() })
      .eq("id", plan.id)
      .eq("talent_profile_id", me.talentProfile.id)
      .in("autopay_status", ["off", "canceled"]);
    await logWorkspaceAudit({
      tenantId: plan.tenantId,
      category: "billing",
      action: "workspace.rent_plan.autopay_started",
      summary: "Member started automatic monthly rent (Stripe Checkout)",
      targetType: "studio_rent_plan",
      targetId: plan.id,
      metadata: { rent_cents: amounts.rentCents, fee_cents: amounts.feeCents, transfer_percent: amounts.transferPercent },
    });
    return { ok: true, url: session.url };
  } catch (err) {
    logServerError("rent.autopay.start", err);
    return { ok: false, reason: "unavailable" };
  }
}

export type StopAutopayResult = { ok: true } | { ok: false; reason: "unauthenticated" | "not_found" | "unavailable" };

/** The member turns automatic payments off; the plan stays and months go back to payment links. */
export async function stopRentAutopay(input: { planId: string }): Promise<StopAutopayResult> {
  await requireNotImpersonating();
  try {
    const me = await requireTalentSelf();
    if (!me.ok) return { ok: false, reason: "unauthenticated" };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    const { data } = await admin
      .from("studio_rent_plans")
      .select("id, tenant_id, stripe_subscription_id, autopay_status, autopay_platform")
      .eq("id", input.planId)
      .eq("talent_profile_id", me.talentProfile.id)
      .maybeSingle();
    const r = data as { id: string; tenant_id: string; stripe_subscription_id: string | null; autopay_status: string; autopay_platform: StripeAccountKey | null } | null;
    if (!r) return { ok: false, reason: "not_found" };
    if (r.stripe_subscription_id && r.autopay_status !== "canceled" && !(await cancelRentSubscription(r.stripe_subscription_id, r.autopay_platform === "mx" ? "mx" : "us"))) {
      return { ok: false, reason: "unavailable" };
    }
    await admin.from("studio_rent_plans").update({ autopay_status: "canceled", updated_at: new Date().toISOString() }).eq("id", r.id).eq("talent_profile_id", me.talentProfile.id);
    await logWorkspaceAudit({ tenantId: r.tenant_id, category: "billing", action: "workspace.rent_plan.autopay_stopped", summary: "Member stopped automatic monthly rent", targetType: "studio_rent_plan", targetId: r.id, metadata: {} });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("rent.autopay.stop", err);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * TUL-1610: the member's Stripe customer on the MX platform. The Plans customer table is US-only, so the MX
 * customer is kept on the member's rent plans: reuse one from any of her plans on MX, else create it once.
 */
async function mxRentCustomer(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  stripe: Stripe,
  p: { talentProfileId: string; userId: string; email: string; displayName: string },
): Promise<{ ok: true; data: string } | { ok: false }> {
  const { data: prior, error } = await admin
    .from("studio_rent_plans")
    .select("autopay_customer_id")
    .eq("talent_profile_id", p.talentProfileId)
    .eq("autopay_platform", "mx")
    .not("autopay_customer_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false };
  const existing = (prior as { autopay_customer_id?: string | null } | null)?.autopay_customer_id;
  if (existing) return { ok: true, data: existing };
  const created = await stripe.customers.create(
    { email: p.email || undefined, name: p.displayName || undefined, metadata: { user_id: p.userId, customer_type: "rent_member", talent_profile_id: p.talentProfileId } },
    { idempotencyKey: `rent_mx_customer_${p.talentProfileId}` },
  );
  return { ok: true, data: created.id };
}
