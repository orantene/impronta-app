"use server";

/**
 * Talent custom-domain purchase / search / help actions (Web Office unlock).
 *
 * Search + Checkout start here. Registrar BUY happens only in the Stripe
 * webhook after payment (`fulfillTalentDomainPurchase`).
 */

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { headers } from "next/headers";
import { getRequestLocale } from "@/i18n/request-locale";

import { normalizeCustomDomainHostname } from "@/app/(workspace)/[tenantSlug]/admin/settings/domain-utils";
import {
  checkRegistrarSearchRateLimit,
  readVercelRegistrarConfig,
  searchDomainQuote,
  type DomainSearchQuote,
} from "@/lib/saas/vercel-domains-registrar";
import { logServerError } from "@/lib/server/safe-error";
import {
  assertTalentCanConnectCustomDomain,
  requireTalentSelf,
} from "@/lib/server/talent-self-guard";
import { createSupportTicketAction } from "@/lib/support/actions";
import { loadTalentSubscriptionState } from "@/lib/stripe/talent-billing";
import {
  createTalentDomainPurchaseCheckoutSession,
  validateTalentDomainContact,
  type TalentDomainContactDraft,
} from "@/lib/stripe/talent-domain-billing";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { randomBytes } from "node:crypto";

export type TalentDomainSearchResult =
  | { ok: true; quote: DomainSearchQuote }
  | { ok: false; error: string };

export type TalentDomainCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export type TalentDomainHelpResult =
  | { ok: true; ticketId: string; ticketNumber: number }
  | { ok: false; error: string };

/** True only when Vercel Registrar env is present (search/buy). Connect/help do not need this. */
export async function isTalentDomainSearchConfiguredAction(): Promise<boolean> {
  return readVercelRegistrarConfig() != null;
}

async function guardUnlockedDomainOwner(): Promise<
  | {
      ok: true;
      talentProfileId: string;
      userId: string;
      email: string;
      displayName: string;
      supabase: import("@supabase/supabase-js").SupabaseClient;
      siteSlug: string | null;
    }
  | { ok: false; error: string }
> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return {
      ok: false,
      error:
        scope.code === "not_authenticated"
          ? "You must be signed in."
          : "We could not find your talent profile.",
    };
  }
  if (!assertTalentCanConnectCustomDomain(scope.planKey)) {
    return {
      ok: false,
      error: "Custom domains need Web Office. Upgrade to unlock this feature.",
    };
  }
  const subscription = await loadTalentSubscriptionState(
    scope.talentProfile.id,
    scope.session.supabase,
  );
  if (subscription?.status === "trialing") {
    return {
      ok: false,
      error: "Custom domains unlock after the Web Office trial ends.",
    };
  }

  const email = scope.session.user.email?.trim() || "";
  if (!email) {
    return { ok: false, error: "Add an email to your account before buying a domain." };
  }

  let siteSlug: string | null = null;
  const { data: siteRow, error: siteError } = await scope.session.supabase
    .from("talent_sites")
    .select("site_slug")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();
  if (siteError) {
    // Non-fatal: checkout metadata can omit the slug; registrar buy still works.
    logServerError("talent-domain-purchase.siteSlug", siteError);
    siteSlug = null;
  } else {
    siteSlug = (siteRow?.site_slug as string | undefined) ?? null;
  }

  return {
    ok: true,
    talentProfileId: scope.talentProfile.id,
    userId: scope.session.user.id,
    email,
    displayName: scope.talentProfile.displayName || email.split("@")[0] || "Talent",
    supabase: scope.session.supabase,
    siteSlug,
  };
}

export async function searchTalentDomainAction(
  rawHostname: string,
): Promise<TalentDomainSearchResult> {
  const guard = await guardUnlockedDomainOwner();
  if (!guard.ok) return { ok: false, error: guard.error };

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) return { ok: false, error: normalized.message };

  const limited = checkRegistrarSearchRateLimit(guard.talentProfileId);
  if (!limited.ok) {
    return { ok: false, error: "Too many searches. Try again in a minute." };
  }

  const result = await searchDomainQuote(normalized.hostname);
  if (!result.attempted) {
    return {
      ok: false,
      error: "Domain search is not configured yet. Use Connect or Get help instead.",
    };
  }
  if (result.errorCode || !result.quotes[0]) {
    return {
      ok: false,
      error: result.errorMessage ?? "Could not check that domain.",
    };
  }
  const quote = result.quotes[0];
  if (quote.available && quote.priceCents != null) {
    const currency = (quote.currency ?? "usd").toLowerCase();
    if (currency !== "usd") {
      return {
        ok: false,
        error: "Only USD registrar quotes are supported right now. Try Connect or Get help.",
      };
    }
  }
  return { ok: true, quote };
}

export async function startTalentDomainPurchaseCheckoutAction(input: {
  domain: string;
  expectedPriceCents: number;
  contact: TalentDomainContactDraft;
}): Promise<TalentDomainCheckoutResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const guard = await guardUnlockedDomainOwner();
  if (!guard.ok) return { ok: false, error: guard.error };

  const normalized = normalizeCustomDomainHostname(input.domain);
  if (!normalized.ok) return { ok: false, error: normalized.message };
  if (!Number.isFinite(input.expectedPriceCents) || input.expectedPriceCents < 100) {
    return { ok: false, error: "Invalid domain price." };
  }

  // Re-quote so the client cannot underpay.
  const quote = await searchDomainQuote(normalized.hostname);
  const live = quote.quotes[0];
  const liveCents = live?.priceCents ?? null;
  if (!live?.available || liveCents == null) {
    return { ok: false, error: "That domain is no longer available at this price." };
  }
  if ((live.currency ?? "usd").toLowerCase() !== "usd") {
    return {
      ok: false,
      error: "Only USD registrar quotes are supported right now. Try Connect or Get help.",
    };
  }
  if (liveCents !== input.expectedPriceCents) {
    return {
      ok: false,
      error: "The price changed. Search again before checkout.",
    };
  }

  const contactCheck = validateTalentDomainContact(input.contact);
  if (!contactCheck.ok) return { ok: false, error: contactCheck.error };

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const appBaseUrl = `${proto}://${host}`;

  const session = await createTalentDomainPurchaseCheckoutSession({
    userId: guard.userId,
    talentProfileId: guard.talentProfileId,
    email: guard.email,
    displayName: guard.displayName,
    domain: normalized.hostname,
    expectedPriceCents: liveCents,
    contact: contactCheck.contact,
    appBaseUrl,
    returnPath: "/talent/site",
    locale: await getRequestLocale(),
  });
  if (!session.ok) return { ok: false, error: session.error };
  return { ok: true, url: session.data.url };
}

export async function requestTalentDomainHelpAction(input: {
  hostname?: string;
  note?: string;
}): Promise<TalentDomainHelpResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const guard = await guardUnlockedDomainOwner();
  if (!guard.ok) return { ok: false, error: guard.error };

  const hostnameRaw = input.hostname?.trim() || "";
  const note = input.note?.trim() || "";
  let hostname = "";
  if (hostnameRaw) {
    const normalized = normalizeCustomDomainHostname(hostnameRaw);
    if (!normalized.ok) return { ok: false, error: normalized.message };
    hostname = normalized.hostname;
  }
  const subject = "Domain setup help";
  const body = [
    "I need help setting up a custom domain for my website.",
    guard.siteSlug ? `Site slug: ${guard.siteSlug}` : null,
    hostname ? `Hostname: ${hostname}` : null,
    note ? `Notes: ${note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await createSupportTicketAction({
      tenantSlug: null,
      surface: "talent",
      subject,
      category: "Public site & domains",
      body,
      originSlug: "talent-domain-setup",
    });
    if (!result.ok) return { ok: false, error: result.error };

    if (hostname) {
      const admin = createServiceRoleClient() ?? guard.supabase;
      const { data: existing, error: existingError } = await admin
        .from("talent_site_domains")
        .select("id")
        .eq("talent_profile_id", guard.talentProfileId)
        .eq("domain", hostname)
        .maybeSingle();
      if (existingError) {
        logServerError("talentDomain.help.assistedLookup", existingError);
      } else {
        const assistedRow = {
          talent_profile_id: guard.talentProfileId,
          domain: hostname,
          acquisition: "assisted",
          registrant_email: guard.email,
          status: "pending",
          verification_token: `impronta-assist-${randomBytes(8).toString("hex")}`,
        };
        if (existing?.id) {
          const { error } = await admin
            .from("talent_site_domains")
            .update({
              acquisition: "assisted",
              registrant_email: guard.email,
            })
            .eq("id", existing.id);
          if (error) logServerError("talentDomain.help.assistedUpdate", error);
        } else {
          const { error } = await admin.from("talent_site_domains").insert(assistedRow);
          if (error) logServerError("talentDomain.help.assistedInsert", error);
        }
      }
    }

    return {
      ok: true,
      ticketId: result.ticketId,
      ticketNumber: result.ticketNumber,
    };
  } catch (error) {
    logServerError("talentDomain.help", error);
    return { ok: false, error: "Could not create the support ticket." };
  }
}
