// Talent → Friends collective share proposals (TUL-1374).
// A member sees what she would RECEIVE before she accepts the owner's share.
import { getRequestLocale } from "@/i18n/request-locale";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { parseOwnerShareRow } from "@/lib/service-hub/collective-split";
import { COLLECTIVE_COPY } from "@/lib/service-hub/friends-collective-copy";
import { memberNetPreview } from "@/lib/service-hub/friends-collective";
import { CollectiveShareResponseCard, type ShareProposal } from "./CollectiveShareResponseCard";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

export default async function CollectiveSharePage() {
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const c = COLLECTIVE_COPY[locale];
  const me = await requireTalentSelf();
  const admin = createServiceRoleClient();
  const proposals: ShareProposal[] = [];
  if (me.ok && admin) {
    const { data: rows, error: rowsErr } = await admin
      .from("agency_talent_roster")
      .select("tenant_id, pending_share_kind, pending_share_bps, pending_share_cents, pending_share_currency, pending_share_proposed_at, agencies:tenant_id ( display_name, default_currency )")
      .eq("talent_profile_id", me.talentProfile.id)
      .neq("status", "removed")
      .not("pending_share_kind", "is", null);
    if (rowsErr) logServerError("collective-share.proposals", rowsErr);
    for (const r of (rows ?? []) as Array<Record<string, unknown> & { tenant_id: string; agencies: { display_name: string | null; default_currency: string | null } | Array<{ display_name: string | null; default_currency: string | null }> | null }>) {
      const share = parseOwnerShareRow({ owner_share_kind: r.pending_share_kind, owner_share_bps: r.pending_share_bps, owner_share_cents: r.pending_share_cents, owner_share_currency: r.pending_share_currency });
      if (!share) continue;
      const ag = Array.isArray(r.agencies) ? r.agencies[0] : r.agencies;
      const currency = share.kind === "fixed" ? share.currency : (ag?.default_currency ?? "USD");
      const preview = memberNetPreview(share, currency, locale);
      if (!preview) continue; // a share with no honest preview (currency mismatch) is not offered for acceptance
      proposals.push({ proposedAt: String(r.pending_share_proposed_at ?? ""), tenantId: r.tenant_id, workspaceName: ag?.display_name ?? "", preview });
    }
  }
  return (
    <main style={{ padding: 24, maxWidth: 720, fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>{c.proposalHeading}</h1>
      <CollectiveShareResponseCard locale={locale} proposals={proposals} />
    </main>
  );
}
