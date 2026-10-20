import "server-only";

/**
 * TUL-1368 · Load the terms waiting for this talent's answer, one per workspace.
 * Read-only. Returns [] when the held migration is not applied yet (graceful).
 */
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseTermsRow, resolveTalentTermsState, type WorkspaceTalentTermsRow } from "./terms";

export type PendingHubTerms = {
  pending: WorkspaceTalentTermsRow;
  hasTermsInForce: boolean;
  workspaceName: string;
};

export async function loadPendingHubTermsForTalent(talentProfileId: string): Promise<PendingHubTerms[]> {
  if (!talentProfileId) return [];
  // Terms are read with the USER session: RLS lets a talent read only their own rows.
  const supabase = await createClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("workspace_talent_terms")
    .select(
      "id, tenant_id, talent_profile_id, version, work_model, share_kind, share_bps, share_amount_cents, share_currency, client_price_mode, show_identity, show_contact, client_contact, exclusive, no_poaching, status, proposed_at",
    )
    .eq("talent_profile_id", talentProfileId)
    .in("status", ["pending", "accepted"])
    .order("version", { ascending: true })
    .limit(200);
  if (error) {
    if (!isPostgrestMissingColumnError(error)) logServerError("serviceHub.terms.loadPending", error);
    return [];
  }
  const byTenant = new Map<string, WorkspaceTalentTermsRow[]>();
  for (const raw of data ?? []) {
    const row = parseTermsRow(raw as Record<string, unknown>);
    if (!row) continue;
    const list = byTenant.get(row.tenantId) ?? [];
    list.push(row);
    byTenant.set(row.tenantId, list);
  }
  const out: Omit<PendingHubTerms, "workspaceName">[] = [];
  for (const rows of byTenant.values()) {
    const state = resolveTalentTermsState(rows);
    if (state.pending) out.push({ pending: state.pending, hasTermsInForce: state.inForce !== null });
  }
  if (out.length === 0) return [];
  // Workspace display names only (public-facing names); the talent may not read agencies.
  const admin = createServiceRoleClient();
  if (!admin) return out.map((o) => ({ ...o, workspaceName: "" }));
  const { data: agencies, error: namesErr } = await admin
    .from("agencies")
    .select("id, display_name")
    .in("id", out.map((o) => o.pending.tenantId));
  // A failed name read still shows the card (the terms matter more than the title).
  if (namesErr) logServerError("serviceHub.terms.loadWorkspaceNames", namesErr);
  const names = new Map((agencies ?? []).map((a) => [String(a.id), String(a.display_name ?? "")]));
  return out.map((o) => ({ ...o, workspaceName: names.get(o.pending.tenantId) || "" }));
}
