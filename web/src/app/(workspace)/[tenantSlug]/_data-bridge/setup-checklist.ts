import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { computeProviderStatuses, readProviderStatusEnv } from "@/lib/payments/provider-status";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { pickAProfessional } from "@/lib/people/hats";
import type { SetupItem } from "@/lib/overview/model";
import { loadPeopleSurface } from "../admin/people/people-data";

/**
 * _data-bridge/setup-checklist.ts — the first-run checklist (W55) and the
 * Overview's setup readiness bar, from ONE reader so the two never disagree
 * about "3 of 8 ready".
 *
 * Eight facts, each read off the row that makes it true and never inferred:
 *
 *   timeZone           `agencies.timezone` is set (the venue's own clock)
 *   catalogItem        a workspace-owned `talent_offerings` row exists
 *   whoPerforms        somebody wears the Bookable hat (`pickAProfessional`,
 *                      the same gate the POS reads)
 *   bookableHours      a `talent_booking_hours` row exists
 *   onlinePayments     a provider other than cash is configured
 *   bookingPolicy      `agencies.settings.commercialTerms` carries a deposit
 *                      or a refund preset of its own
 *   payoutDestination  `stripe_account_id` set and payouts enabled
 *   websitePublished   a published `cms_pages` row exists
 *
 * Each item carries a one-line `detail` for the checklist: the fact itself
 * when it is done (the timezone, the item and its price, the person), the
 * consequence when it is not ("appointments cannot be booked"). Details that
 * are facts are `{ text }`; details that are sentences are `{ key }` and the
 * screen translates them.
 */

export type AgencySetupRow = {
  timezone: string | null;
  takes_reservations: boolean | null;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean | null;
  display_name: string | null;
  settings: Record<string, unknown> | null;
};

export async function readAgencySetupRow(tenantId: string): Promise<AgencySetupRow | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("agencies")
    .select("timezone, takes_reservations, stripe_account_id, stripe_payouts_enabled, display_name, settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("setupChecklist.agency", error);
    return null;
  }
  return (data as AgencySetupRow | null) ?? null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function loadSetupItems(tenantId: string, agency: AgencySetupRow | null): Promise<SetupItem[]> {
  const admin = createServiceRoleClient();
  const providers = computeProviderStatuses(readProviderStatusEnv());
  const online = providers.filter((p) => p.id !== "cash" && p.configured);

  let catalog: { title: string; amountCents: number | null; currency: string | null } | null = null;
  let hours = 0;
  let page: { title: string | null } | null = null;
  let performer: string | null = null;

  if (admin) {
    const [items, hoursRes, pages, people] = await Promise.all([
      admin
        .from("talent_offerings")
        .select("title, amount_cents, currency")
        .eq("tenant_id", tenantId)
        .eq("owner_kind", "workspace")
        .order("created_at", { ascending: true })
        .limit(1),
      admin.from("talent_booking_hours").select("talent_profile_id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      admin.from("cms_pages").select("title").eq("tenant_id", tenantId).eq("status", "published").limit(1),
      loadPeopleSurface(tenantId).catch((e: unknown) => {
        logServerError("setupChecklist.people", e);
        return null;
      }),
    ]);
    if (items.error) logServerError("setupChecklist.catalog", items.error);
    if (hoursRes.error) logServerError("setupChecklist.hours", hoursRes.error);
    if (pages.error) logServerError("setupChecklist.pages", pages.error);
    const item = (items.data?.[0] ?? null) as { title: string | null; amount_cents: number | string | null; currency: string | null } | null;
    if (item) {
      const cents = typeof item.amount_cents === "string" ? Number(item.amount_cents) : item.amount_cents;
      catalog = { title: item.title ?? "", amountCents: typeof cents === "number" && Number.isFinite(cents) ? cents : null, currency: item.currency };
    }
    hours = hoursRes.count ?? 0;
    page = (pages.data?.[0] ?? null) as { title: string | null } | null;
    if (people && !people.loadFailed) {
      const first = pickAProfessional(people.people)[0];
      performer = first?.name ?? null;
    }
  }

  const terms = isRecord(agency?.settings) && isRecord(agency.settings.commercialTerms) ? agency.settings.commercialTerms : null;
  const policySet = Boolean(terms && (typeof terms.depositPct === "number" || typeof terms.refundPolicy === "string"));
  const timezone = agency?.timezone?.trim() ?? "";
  const PROVIDER_NAME: Record<string, string> = {
    stripe_checkout: "Stripe",
    stripe_terminal: "Stripe Terminal",
    mercado_pago_point: "Mercado Pago",
  };
  const providerNames = online.map((p) => PROVIDER_NAME[p.id] ?? p.id);

  return [
    {
      key: "timeZone",
      done: timezone.length > 0,
      detail: timezone ? { text: timezone } : { key: "dashboard.setupPage.detail.timeZoneMissing" },
    },
    {
      key: "catalogItem",
      done: catalog !== null,
      detail: catalog
        ? { text: catalog.amountCents !== null ? `${catalog.title} · ${formatOrderMoney(catalog.amountCents, catalog.currency ?? "USD")}` : catalog.title }
        : { key: "dashboard.setupPage.detail.catalogMissing" },
    },
    {
      key: "whoPerforms",
      done: performer !== null,
      detail: performer ? { key: "dashboard.setupPage.detail.whoPerforms", params: { name: performer } } : { key: "dashboard.setupPage.detail.whoPerformsMissing" },
    },
    {
      key: "bookableHours",
      done: hours > 0,
      detail: hours > 0 ? { key: "dashboard.setupPage.detail.hoursSet", params: { count: hours } } : { key: "dashboard.setupPage.detail.hoursMissing" },
    },
    {
      key: "onlinePayments",
      done: online.length > 0,
      detail: online.length > 0 ? { key: "dashboard.setupPage.detail.paymentsOn", params: { providers: providerNames.join(", ") } } : { key: "dashboard.setupPage.detail.paymentsMissing" },
    },
    {
      key: "bookingPolicy",
      done: policySet,
      detail: policySet ? { key: "dashboard.setupPage.detail.policySet" } : { key: "dashboard.setupPage.detail.policyMissing" },
    },
    {
      key: "payoutDestination",
      done: Boolean(agency?.stripe_account_id) && agency?.stripe_payouts_enabled === true,
      detail:
        Boolean(agency?.stripe_account_id) && agency?.stripe_payouts_enabled === true
          ? { key: "dashboard.setupPage.detail.payoutOn" }
          : agency?.stripe_account_id
            ? { key: "dashboard.setupPage.detail.payoutPending" }
            : { key: "dashboard.setupPage.detail.payoutMissing" },
    },
    {
      key: "websitePublished",
      done: page !== null,
      detail: page ? { text: page.title ?? "" } : { key: "dashboard.setupPage.detail.websiteMissing" },
    },
  ];
}
