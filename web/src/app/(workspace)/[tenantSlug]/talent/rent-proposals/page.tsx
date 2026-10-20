// Talent → Station rent proposals (TUL-1376). A member sees the rent BEFORE agreeing to be charged.
import { getRequestLocale } from "@/i18n/request-locale";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { RENT_COPY } from "@/lib/service-hub/rent/rent-copy";
import { RentProposalCard, type RentProposal } from "./RentProposalCard";

export const dynamic = "force-dynamic";

export default async function RentProposalsPage() {
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const c = RENT_COPY[locale];
  const me = await requireTalentSelf();
  const admin = createServiceRoleClient();
  const proposals: RentProposal[] = [];
  if (me.ok && admin) {
    const { data: rows } = await admin
      .from("studio_rent_plans")
      .select("id, monthly_rent_cents, currency, starts_on, agencies:tenant_id ( display_name )")
      .eq("talent_profile_id", me.talentProfile.id)
      .eq("status", "proposed");
    for (const r of (rows ?? []) as Array<{ id: string; monthly_rent_cents: number; currency: string; starts_on: string; agencies: { display_name: string | null } | Array<{ display_name: string | null }> | null }>) {
      const ag = Array.isArray(r.agencies) ? r.agencies[0] : r.agencies;
      proposals.push({ id: r.id, workspaceName: ag?.display_name ?? "", monthlyRentCents: r.monthly_rent_cents, currency: r.currency, startsOn: r.starts_on });
    }
  }
  return (
    <main style={{ padding: 24, maxWidth: 720, fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>{c.proposalHeading}</h1>
      <RentProposalCard locale={locale} proposals={proposals} />
    </main>
  );
}
