"use server";

/**
 * Talent custom-domain purchase / search / help actions (Web Office unlock).
 *
 * Search + Checkout start here. Registrar BUY happens only in the Stripe
 * webhook after payment (`fulfillTalentDomainPurchase`).
 */

import { headers } from "next/headers";

import { normalizeCustomDomainHostname } from "@/app/(workspace)/[tenantSlug]/admin/settings/domain-utils";
import {
  checkRegistrarSearchRateLimit,
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
  type TalentDomainContactDraft,
} from "@/lib/stripe/talent-domain-billing";

export type TalentDomainSearchResult =
  | { ok: true; quote: DomainSearchQuote }
  | { ok: false; error: string };

export type TalentDomainCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export type TalentDomainHelpResult =
  | { ok: true; ticketId: string; ticketNumber: number }
  | { ok: false; error: string };

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
  return { ok: true, quote: result.quotes[0] };
}

export async function startTalentDomainPurchaseCheckoutAction(input: {
  domain: string;
  expectedPriceCents: number;
  contact: TalentDomainContactDraft;
}): Promise<TalentDomainCheckoutResult> {
  const guard = await guardUnlockedDomainOwner();
  if (!guard.ok) return { ok: false, error: guard.error };

  const normalized = normalizeCustomDomainHostname(input.domain);
  if (!normalized.ok) return { ok: false, error: normalized.message };
  if (!Number.isFinite(input.expectedPriceCents) || input.expectedPriceCents < 100) {
    return { ok: false, error: "Invalid domain price." };
  }

  // Re-quote so the client cannot underpay.
  const quote = await searchDomainQuote(normalized.hostname);
  const liveCents = quote.quotes[0]?.priceCents ?? null;
  if (!quote.quotes[0]?.available || liveCents == null) {
    return { ok: false, error: "That domain is no longer available at this price." };
  }
  if (liveCents !== input.expectedPriceCents) {
    return {
      ok: false,
      error: "The price changed. Search again before checkout.",
    };
  }

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
    contact: input.contact,
    appBaseUrl,
    returnPath: "/talent/site",
  });
  if (!session.ok) return { ok: false, error: session.error };
  return { ok: true, url: session.data.url };
}

export async function requestTalentDomainHelpAction(input: {
  hostname?: string;
  note?: string;
}): Promise<TalentDomainHelpResult> {
  const guard = await guardUnlockedDomainOwner();
  if (!guard.ok) return { ok: false, error: guard.error };

  const hostname = input.hostname?.trim() || "";
  const note = input.note?.trim() || "";
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
      category: "domain-setup",
      body,
      originSlug: "talent-domain-setup",
    });
    if (!result.ok) return { ok: false, error: result.error };
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
