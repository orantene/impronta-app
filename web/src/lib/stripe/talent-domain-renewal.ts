/**
 * D5 (TUL-526): renewal billing for domains bought through Tulala.
 *
 * The registrar auto-renews a purchased domain and bills TULALA. This module makes the talent pay that
 * renewal at cost (the registrar's renewal price, no markup) before it happens:
 *
 *   1. read expiry / renewal price / auto-renew from the registrar (shared `registrar_expires_at` column);
 *   2. inside the charge window, charge the talent's saved card off-session; if there is no usable saved card
 *      or the bank wants the cardholder, mint a Checkout session and send it with the notice;
 *   3. remind (spaced, capped) while unpaid;
 *   4. at the deadline, still unpaid: turn auto-renew OFF at the registrar and tell the talent.
 *
 * What to do per domain is decided by `planRenewal` (pure). A paid Checkout session settles through the Stripe
 * webhook (`talent_domain_renewal`, see `fulfillTalentDomainRenewal`); a late payment before expiry turns
 * auto-renew back ON.
 *
 * Ships dark: with no registrar token the sweep reports `registrar_not_configured` and touches nothing.
 */

import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import {
  planRenewal,
  type RenewalAction,
  type RenewalRow,
  type RenewalState,
} from "@/lib/domains/domain-renewal-plan";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { emitNotification } from "@/lib/notifications/emit";
import { logServerError } from "@/lib/server/safe-error";
import {
  getRegistrarDomain,
  readVercelRegistrarConfig,
  setDomainAutoRenew,
} from "@/lib/saas/vercel-domains-registrar";
import { getStripe } from "@/lib/stripe/client";

export const TALENT_DOMAIN_RENEWAL_CHECKOUT_TYPE = "talent_domain_renewal" as const;

type DomainRow = {
  id: string;
  domain: string;
  talent_profile_id: string;
  registrant_email: string | null;
  registrar_expires_at: string | null;
  registrar_auto_renew: boolean | null;
  renewal_price_cents: number | null;
  renewal_state: RenewalState;
  renewal_cycle_expires_at: string | null;
  renewal_attempts: number;
  renewal_last_attempt_at: string | null;
  renewal_payment_method_id: string | null;
  renewal_consent_at: string | null;
};

const COLUMNS =
  "id, domain, talent_profile_id, registrant_email, registrar_expires_at, registrar_auto_renew, renewal_price_cents, renewal_state, renewal_cycle_expires_at, renewal_attempts, renewal_last_attempt_at, renewal_payment_method_id, renewal_consent_at";

export type RenewalSweepDeps = {
  nowMs?: () => number;
  getDomain?: typeof getRegistrarDomain;
  setAutoRenew?: typeof setDomainAutoRenew;
  stripe?: () => Stripe | null;
  notify?: typeof emitNotification;
  appBaseUrl?: string;
  registrarConfigured?: () => boolean;
};

export type RenewalSweepReport = {
  skipped: "registrar_not_configured" | null;
  scanned: number;
  charged: number;
  linksSent: number;
  reminded: number;
  autoRenewOff: number;
  needsAttention: number;
  failed: number;
};

function toRenewalRow(row: DomainRow): RenewalRow {
  return {
    registrarExpiresAt: row.registrar_expires_at,
    registrarAutoRenew: row.registrar_auto_renew,
    renewalPriceCents: row.renewal_price_cents,
    renewalState: row.renewal_state,
    renewalCycleExpiresAt: row.renewal_cycle_expires_at,
    renewalAttempts: row.renewal_attempts,
    renewalLastAttemptAt: row.renewal_last_attempt_at,
  };
}

function localeOf(preferred: string | null | undefined): "en" | "es" | "fr" {
  const l = (preferred ?? "").toLowerCase();
  if (l.startsWith("es")) return "es";
  if (l.startsWith("fr")) return "fr";
  return "en";
}

type Notice = "charged" | "pay" | "autorenewOff";

const NOTICE_KEYS: Record<Notice, { title: string; body: string }> = {
  charged: { title: "dashboard.domainRenewal.chargedTitle", body: "dashboard.domainRenewal.chargedBody" },
  pay: { title: "dashboard.domainRenewal.payTitle", body: "dashboard.domainRenewal.payBody" },
  autorenewOff: { title: "dashboard.domainRenewal.autorenewOffTitle", body: "dashboard.domainRenewal.autorenewOffBody" },
};

/** Bell notice to the talent, in her language. Best effort: never blocks the billing step. */
async function notifyTalent(
  sb: SupabaseClient,
  row: DomainRow,
  notice: Notice,
  deps: { notify: typeof emitNotification; payUrl?: string | null },
): Promise<void> {
  try {
    const { data } = await sb
      .from("talent_profiles")
      .select("user_id, preferred_locale")
      .eq("id", row.talent_profile_id)
      .maybeSingle();
    const profile = data as { user_id: string | null; preferred_locale: string | null } | null;
    if (!profile?.user_id) return;
    const locale = localeOf(profile.preferred_locale);
    const t = createTranslator(locale);
    const date = row.registrar_expires_at
      ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(row.registrar_expires_at))
      : "";
    const vars = {
      domain: row.domain,
      date,
      amount: row.renewal_price_cents ? formatDashboardMoneyCents(row.renewal_price_cents, "USD", locale) : "",
    };
    await deps.notify({
      userId: profile.user_id,
      tenantId: null,
      kind: "payment",
      surface: "talent",
      title: interpolate(t(NOTICE_KEYS[notice].title), vars),
      body: interpolate(t(NOTICE_KEYS[notice].body), vars),
      targetDrawer: "site",
      targetPayload: deps.payUrl ? { payUrl: deps.payUrl, domain: row.domain } : { domain: row.domain },
      originEventId: null,
      originKind: `domain_renewal_${notice}`,
    });
  } catch (err) {
    logServerError("domain-renewal.notify", err);
  }
}

async function markState(
  sb: SupabaseClient,
  row: DomainRow,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await sb
    .from("talent_site_domains")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) {
    logServerError("domain-renewal.markState", error);
    return false;
  }
  return true;
}

/** Mark this cycle paid; a late payment before expiry also turns auto-renew back on. */
async function recordPaid(
  sb: SupabaseClient,
  row: DomainRow,
  paid: { paymentIntentId: string | null; sessionId: string | null },
  deps: { setAutoRenew: typeof setDomainAutoRenew },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const wasOff = row.renewal_state === "unpaid_autorenew_off" || row.registrar_auto_renew === false;
  await markState(sb, row, {
    renewal_state: "paid",
    renewal_cycle_expires_at: row.registrar_expires_at,
    renewal_paid_at: nowIso,
    renewal_payment_intent_id: paid.paymentIntentId,
    renewal_checkout_session_id: paid.sessionId,
  });
  const expires = row.registrar_expires_at ? Date.parse(row.registrar_expires_at) : 0;
  if (wasOff && expires > Date.now()) {
    const back = await deps.setAutoRenew(row.domain, true);
    if (back.attempted && !back.ok) {
      logServerError("domain-renewal.reenable", `${row.domain}: ${back.errorCode ?? ""} ${back.errorMessage ?? ""}`);
      await markState(sb, row, { renewal_state: "needs_attention" });
      return;
    }
    await markState(sb, row, { registrar_auto_renew: true });
  }
}

function cycleKey(row: DomainRow): string {
  return (row.registrar_expires_at ?? "").slice(0, 10);
}

async function customerIdFor(sb: SupabaseClient, talentProfileId: string): Promise<string | null> {
  const { data: profile } = await sb.from("talent_profiles").select("user_id").eq("id", talentProfileId).maybeSingle();
  const userId = (profile as { user_id: string | null } | null)?.user_id;
  if (!userId) return null;
  const { data } = await sb.from("talent_stripe_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  return (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;
}

/** A fresh Checkout session for this renewal (24h). Settles through the webhook. */
async function mintRenewalCheckout(
  sb: SupabaseClient,
  stripe: Stripe,
  row: DomainRow,
  priceCents: number,
  appBaseUrl: string,
  nowMs: number,
): Promise<{ url: string; sessionId: string } | null> {
  const customerId = await customerIdFor(sb, row.talent_profile_id);
  const meta = {
    checkout_type: TALENT_DOMAIN_RENEWAL_CHECKOUT_TYPE,
    talent_id: row.talent_profile_id,
    domain: row.domain,
    domain_row_id: row.id,
    cycle_expires_at: row.registrar_expires_at ?? "",
    expected_price_cents: String(priceCents),
  };
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        ...(customerId ? { customer: customerId } : row.registrant_email ? { customer_email: row.registrant_email } : {}),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: priceCents,
              product_data: {
                name: `Domain renewal: ${row.domain}`,
                description: "1-year renewal at the registrar's price. No markup.",
              },
            },
          },
        ],
        success_url: `${appBaseUrl}/talent/site?domainRenewal=done`,
        cancel_url: `${appBaseUrl}/talent/site?domainRenewal=cancel`,
        expires_at: Math.floor(nowMs / 1000) + 23 * 3600,
        metadata: meta,
        payment_intent_data: { metadata: meta },
      },
      { idempotencyKey: `cs_domain_renewal_${row.id}_${cycleKey(row)}_${row.renewal_attempts}` },
    );
    return session.url ? { url: session.url, sessionId: session.id } : null;
  } catch (err) {
    logServerError("domain-renewal.checkout", err);
    return null;
  }
}

async function chargeOrSendLink(
  sb: SupabaseClient,
  row: DomainRow,
  priceCents: number,
  deps: Required<Pick<RenewalSweepDeps, "stripe" | "notify" | "setAutoRenew">> & { appBaseUrl: string; nowMs: number },
  report: RenewalSweepReport,
): Promise<void> {
  const stripe = deps.stripe();
  if (!stripe) {
    report.needsAttention += 1;
    await markState(sb, row, { renewal_state: "needs_attention", renewal_cycle_expires_at: row.registrar_expires_at });
    logServerError("domain-renewal.charge", `Stripe not configured; ${row.domain} needs attention`);
    return;
  }
  const nowIso = new Date(deps.nowMs).toISOString();

  // 1. Off-session ONLY with consent: the payment method she saved at purchase after the renewal disclosure.
  // Never "her first saved card" (that is likely her plan card). No consent stored = pay link only.
  const customerId = await customerIdFor(sb, row.talent_profile_id);
  const pm = row.renewal_consent_at && row.renewal_payment_method_id ? row.renewal_payment_method_id : null;
  if (customerId && pm) {
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: priceCents,
          currency: "usd",
          customer: customerId,
          payment_method: pm,
          off_session: true,
          confirm: true,
          description: `Domain renewal: ${row.domain}`,
          metadata: {
            checkout_type: TALENT_DOMAIN_RENEWAL_CHECKOUT_TYPE,
            talent_id: row.talent_profile_id,
            domain: row.domain,
            domain_row_id: row.id,
            cycle_expires_at: row.registrar_expires_at ?? "",
          },
        },
        { idempotencyKey: `pi_domain_renewal_${row.id}_${cycleKey(row)}` },
      );
      if (intent.status === "succeeded") {
        await recordPaid(sb, row, { paymentIntentId: intent.id, sessionId: null }, deps);
        await notifyTalent(sb, row, "charged", deps);
        report.charged += 1;
        return;
      }
    } catch (err) {
      // authentication_required / card_declined / no method: fall through to the pay link.
      logServerError("domain-renewal.offSession", err);
    }
  }

  // 2. Pay link (Checkout), sent with the notice.
  const link = await mintRenewalCheckout(sb, stripe, row, priceCents, deps.appBaseUrl, deps.nowMs);
  if (!link) {
    report.failed += 1;
    return;
  }
  await markState(sb, row, {
    renewal_state: "awaiting_payment",
    renewal_cycle_expires_at: row.registrar_expires_at,
    renewal_attempts: row.renewal_attempts + 1,
    renewal_last_attempt_at: nowIso,
    renewal_checkout_session_id: link.sessionId,
  });
  await notifyTalent(sb, row, "pay", { ...deps, payUrl: link.url });
  report.linksSent += 1;
}

export async function runDomainRenewalSweep(
  sb: SupabaseClient,
  deps: RenewalSweepDeps = {},
): Promise<RenewalSweepReport> {
  const report: RenewalSweepReport = {
    skipped: null,
    scanned: 0,
    charged: 0,
    linksSent: 0,
    reminded: 0,
    autoRenewOff: 0,
    needsAttention: 0,
    failed: 0,
  };
  const configured = (deps.registrarConfigured ?? (() => readVercelRegistrarConfig() !== null))();
  if (!configured) {
    report.skipped = "registrar_not_configured";
    return report;
  }
  const getDomain = deps.getDomain ?? getRegistrarDomain;
  const setAutoRenew = deps.setAutoRenew ?? setDomainAutoRenew;
  const notify = deps.notify ?? emitNotification;
  const stripe = deps.stripe ?? getStripe;
  const nowMs = (deps.nowMs ?? Date.now)();
  const appBaseUrl = (deps.appBaseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.tulala.digital").replace(/\/$/, "");

  const { data, error } = await sb
    .from("talent_site_domains")
    .select(COLUMNS)
    .eq("acquisition", "purchased")
    .not("vercel_order_id", "is", null);
  if (error) {
    logServerError("domain-renewal.sweep.load", error);
    return report;
  }

  for (let row of (data ?? []) as DomainRow[]) {
    report.scanned += 1;
    try {
      // 1. Refresh from the registrar (the shared expiry column).
      const info = await getDomain(row.domain);
      if (info.ok) {
        const patch = {
          registrar_expires_at: info.expiresAt ?? row.registrar_expires_at,
          registrar_auto_renew: info.autoRenew ?? row.registrar_auto_renew,
          renewal_price_cents: info.renewalPriceCents ?? row.renewal_price_cents,
          registrar_checked_at: new Date(nowMs).toISOString(),
        };
        if (await markState(sb, row, patch)) {
          row = { ...row, ...patch };
        }
      } else if (info.attempted) {
        logServerError("domain-renewal.sweep.registrar", `${row.domain}: ${info.errorCode ?? ""} ${info.errorMessage ?? ""}`);
      }

      // 2. Decide and act.
      const action: RenewalAction = planRenewal(toRenewalRow(row), nowMs);
      if (action.kind === "charge") {
        await chargeOrSendLink(sb, row, action.priceCents, { stripe, notify, setAutoRenew, appBaseUrl, nowMs }, report);
      } else if (action.kind === "remind") {
        const s = stripe();
        const priceCents = row.renewal_price_cents;
        if (s && priceCents) {
          const link = await mintRenewalCheckout(sb, s, row, priceCents, appBaseUrl, nowMs);
          if (link) {
            await markState(sb, row, {
              renewal_attempts: row.renewal_attempts + 1,
              renewal_last_attempt_at: new Date(nowMs).toISOString(),
              renewal_checkout_session_id: link.sessionId,
            });
            await notifyTalent(sb, row, "pay", { notify, payUrl: link.url });
            report.reminded += 1;
          }
        }
      } else if (action.kind === "turn_off_autorenew") {
        const off = await setAutoRenew(row.domain, false);
        if (off.ok) {
          await markState(sb, row, {
            registrar_auto_renew: false,
            renewal_state: "unpaid_autorenew_off",
            renewal_cycle_expires_at: row.registrar_expires_at,
          });
          await notifyTalent(sb, row, "autorenewOff", { notify });
          report.autoRenewOff += 1;
        } else {
          // Could not stop the registrar: Tulala would pay. Loud, and retried by the next sweep.
          logServerError("domain-renewal.turnOff", `${row.domain}: ${off.skippedReason ?? off.errorCode ?? ""} ${off.errorMessage ?? ""}`);
          report.failed += 1;
        }
      } else if (action.kind === "needs_attention") {
        await markState(sb, row, { renewal_state: "needs_attention", renewal_cycle_expires_at: row.registrar_expires_at });
        logServerError("domain-renewal.needsAttention", `${row.domain}: ${action.reason}`);
        report.needsAttention += 1;
      }
    } catch (err) {
      logServerError("domain-renewal.sweep.row", err);
      report.failed += 1;
    }
  }
  return report;
}

/**
 * A paid renewal Checkout session (Stripe webhook). Idempotent on the PaymentIntent. The charge must equal the
 * stored renewal price: a mismatch is refunded-by-hand territory, so it is parked as needs_attention.
 */
export async function fulfillTalentDomainRenewal(
  sb: SupabaseClient,
  opts: {
    sessionId: string;
    domainRowId: string;
    amountTotal: number | null;
    currency: string | null;
    paymentIntentId: string | null;
  },
  deps: { setAutoRenew?: typeof setDomainAutoRenew } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await sb.from("talent_site_domains").select(COLUMNS + ", renewal_payment_intent_id").eq("id", opts.domainRowId).maybeSingle();
  if (error) {
    logServerError("domain-renewal.fulfill.load", error);
    return { ok: false, error: "Could not look up the domain." };
  }
  const row = data as (DomainRow & { renewal_payment_intent_id: string | null }) | null;
  if (!row) return { ok: true }; // domain removed since: nothing to settle, acknowledge
  if (opts.paymentIntentId && row.renewal_payment_intent_id === opts.paymentIntentId) return { ok: true };
  if (row.renewal_state === "paid" && row.renewal_cycle_expires_at === row.registrar_expires_at) return { ok: true };

  if (
    row.renewal_price_cents == null ||
    opts.amountTotal !== row.renewal_price_cents ||
    (opts.currency ?? "usd").toLowerCase() !== "usd"
  ) {
    logServerError(
      "domain-renewal.fulfill.mismatch",
      `${row.domain}: charged ${opts.amountTotal ?? "null"} ${opts.currency ?? ""}, expected ${row.renewal_price_cents ?? "null"} usd`,
    );
    await markState(sb, row, { renewal_state: "needs_attention", renewal_payment_intent_id: opts.paymentIntentId });
    return { ok: true };
  }
  await recordPaid(sb, row, { paymentIntentId: opts.paymentIntentId, sessionId: opts.sessionId }, { setAutoRenew: deps.setAutoRenew ?? setDomainAutoRenew });
  return { ok: true };
}

/**
 * Right after a purchase: store the registrar's expiry / renewal price / auto-renew on the new row, so the
 * renewal sweep and the D4 health cron start from the same column. Best effort: the daily sweep fills it too.
 */
export async function recordRegistrarSnapshot(
  sb: SupabaseClient,
  opts: { talentProfileId: string; domain: string },
  deps: { getDomain?: typeof getRegistrarDomain } = {},
): Promise<void> {
  try {
    const info = await (deps.getDomain ?? getRegistrarDomain)(opts.domain);
    if (!info.ok) return;
    const { error } = await sb
      .from("talent_site_domains")
      .update({
        registrar_expires_at: info.expiresAt,
        registrar_auto_renew: info.autoRenew,
        renewal_price_cents: info.renewalPriceCents,
        registrar_checked_at: new Date().toISOString(),
      })
      .eq("talent_profile_id", opts.talentProfileId)
      .eq("domain", opts.domain);
    if (error) logServerError("domain-renewal.snapshot", error);
  } catch (err) {
    logServerError("domain-renewal.snapshot", err);
  }
}

/**
 * At purchase: the Checkout disclosed the renewal terms and saved the payment method for off-session use.
 * Store THAT method on the domain row as the consent record. Without it the sweep sends a pay link only.
 */
export async function recordRenewalConsent(
  sb: SupabaseClient,
  opts: { talentProfileId: string; domain: string; paymentIntentId: string | null; consentGiven: boolean },
  deps: { stripe?: () => Stripe | null } = {},
): Promise<void> {
  try {
    if (!opts.consentGiven || !opts.paymentIntentId) return;
    const stripe = (deps.stripe ?? getStripe)();
    if (!stripe) return;
    const intent = await stripe.paymentIntents.retrieve(opts.paymentIntentId);
    const pm = typeof intent.payment_method === "string" ? intent.payment_method : (intent.payment_method?.id ?? null);
    if (!pm) return;
    const { error } = await sb
      .from("talent_site_domains")
      .update({ renewal_payment_method_id: pm, renewal_consent_at: new Date().toISOString() })
      .eq("talent_profile_id", opts.talentProfileId)
      .eq("domain", opts.domain);
    if (error) logServerError("domain-renewal.consent", error);
  } catch (err) {
    logServerError("domain-renewal.consent", err);
  }
}
