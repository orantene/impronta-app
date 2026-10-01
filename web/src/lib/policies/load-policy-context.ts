import "server-only";

import { headers } from "next/headers";

import { resolveCommercialTerms } from "@/lib/billing/commercial-terms";
import {
  parseTalentBookingTerms,
  parseTenantCommercialTerms,
} from "@/lib/billing/commercial-terms";
import { loadPlatformCommercialDefaults } from "@/lib/platform/commercial-defaults";
import {
  HOST_CONTEXT_HEADER,
  HOST_TALENT_PROFILE_HEADER,
} from "@/lib/saas/host-context";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";

import type { BookingPolicyInput, PolicyOverride } from "./policy-text";

export type PolicyPageContext = {
  /** Public display name only. Never a legal name or an address. */
  name: string;
  kind: "talent" | "agency";
  terms: Omit<BookingPolicyInput, "locale" | "name">;
};

type OfferingRow = {
  id: string;
  title: string;
  currency: string | null;
  allow_pay_in_person: boolean | null;
};

/**
 * Resolve who the policy page speaks for from the PROXY-set headers (never the
 * URL): a `talent_site` host serves that talent, an agency host serves the
 * agency. Any other host returns null (the route 404s).
 */
export async function loadPolicyPageContext(): Promise<PolicyPageContext | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const h = await headers();

  const talentProfileId = resolveGatedTalentProfileId({
    hostContext: h.get(HOST_CONTEXT_HEADER),
    talentProfileId: h.get(HOST_TALENT_PROFILE_HEADER),
  });

  try {
    const platform = await loadPlatformCommercialDefaults();

    if (talentProfileId) {
      const { data: tp } = await admin
        .from("talent_profiles")
        .select(
          "display_name, first_name, last_name, profile_code, booking_terms, created_by_agency_id",
        )
        .eq("id", talentProfileId)
        .maybeSingle();
      if (!tp) return null;
      const row = tp as {
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        profile_code: string;
        booking_terms: unknown;
        created_by_agency_id: string | null;
      };
      // Public display name only: never fall back to a legal-name composite
      // beyond what the site itself already shows.
      const name =
        row.display_name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        row.profile_code;

      const tenantId = row.created_by_agency_id;
      let tenantTerms = null;
      if (tenantId) {
        const { data: ag } = await admin
          .from("agencies")
          .select("settings")
          .eq("id", tenantId)
          .maybeSingle();
        tenantTerms = parseTenantCommercialTerms(
          (ag as { settings?: unknown } | null)?.settings ?? null,
        );
      }
      const resolved = resolveCommercialTerms({
        platform,
        tenant: tenantTerms,
        talent: parseTalentBookingTerms(row.booking_terms),
      });

      const { data: offerings } = await admin
        .from("talent_offerings")
        .select("id, title, currency, allow_pay_in_person")
        .eq("talent_profile_id", talentProfileId)
        .eq("status", "published")
        .eq("visibility", "public");
      const offeringRows = (offerings ?? []) as OfferingRow[];

      const overrides: PolicyOverride[] = [];
      if (tenantId && offeringRows.length > 0) {
        const { data: ov } = await tenantScopedQuery(
          admin,
          "booking_policy_overrides",
          tenantId,
        )
          .select("offering_id, deposit_bps, cancel_free_hours, no_show_fee_cents")
          .in(
            "offering_id",
            offeringRows.map((o) => o.id),
          );
        const byId = new Map(offeringRows.map((o) => [o.id, o]));
        for (const r of (ov ?? []) as Array<{
          offering_id: string;
          deposit_bps: number | null;
          cancel_free_hours: number | null;
          no_show_fee_cents: number | null;
        }>) {
          const off = byId.get(r.offering_id);
          if (!off) continue;
          overrides.push({
            label: off.title,
            depositPct: r.deposit_bps == null ? null : r.deposit_bps / 100,
            cancelFreeHours: r.cancel_free_hours,
            noShowFeeCents: r.no_show_fee_cents,
            currency: off.currency ?? "USD",
          });
        }
      }

      return {
        name,
        kind: "talent",
        terms: {
          depositPct: resolved.depositPct,
          refundPolicy: resolved.refundPolicy,
          instantBookEnabled: resolved.instantBookEnabled,
          acceptsPayInPerson: offeringRows.some((o) => o.allow_pay_in_person === true),
          overrides,
        },
      };
    }

    const scope = await getPublicTenantScope();
    if (!scope) return null;
    const { data: ag } = await admin
      .from("agencies")
      .select("display_name, settings")
      .eq("id", scope.tenantId)
      .maybeSingle();
    if (!ag) return null;
    const agRow = ag as { display_name: string | null; settings: unknown };
    const name = agRow.display_name?.trim();
    if (!name) return null;
    const resolved = resolveCommercialTerms({
      platform,
      tenant: parseTenantCommercialTerms(agRow.settings),
      talent: null,
    });
    const { data: offerings } = await admin
      .from("talent_offerings")
      .select("id, title, currency, allow_pay_in_person")
      .eq("tenant_id", scope.tenantId)
      .eq("status", "published")
      .eq("visibility", "public");
    return {
      name,
      kind: "agency",
      terms: {
        depositPct: resolved.depositPct,
        refundPolicy: resolved.refundPolicy,
        instantBookEnabled: resolved.instantBookEnabled,
        acceptsPayInPerson: ((offerings ?? []) as OfferingRow[]).some(
          (o) => o.allow_pay_in_person === true,
        ),
        overrides: [],
      },
    };
  } catch (err) {
    logServerError("policies.loadPolicyPageContext", err);
    return null;
  }
}
