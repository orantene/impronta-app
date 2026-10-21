import "server-only";

/**
 * TUL-1476 · Send the owner's proposed terms right after a talent joins.
 *
 * Called by the three join paths (invite, Discover join approval, direct add) AFTER the
 * roster row exists, because the RPC only accepts a talent the workspace has (active or
 * pending roster row). It goes through #4158's propose_workspace_talent_terms with the
 * USER session, so the database checks the caller is an active owner or admin of THIS
 * workspace and the talent is on THIS workspace's roster. The result is always a PENDING
 * version: nothing is sold under it until the talent accepts it on their terms card.
 *
 * Joining never fails because of terms: the outcome is reported next to the join result.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { explicitDisplayCurrency } from "@/lib/reservations/deposit-currency";
import { canProposeJoinTerms, joinTermsDefaultModel, readJoinTerms, type JoinPath, type JoinTermsInput, type JoinTermsOutcome } from "./join-terms";
import type { WorkModel } from "./terms";
import { loadWorkStyle } from "./work-style.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type ProposeOnJoinInput = {
  /** The workspace resolved from the slug the owner is on, never from the client. */
  tenantId: string;
  /** The talent whose roster row on THIS workspace was just written. */
  talentProfileId: string;
  path: JoinPath;
  input: JoinTermsInput | null | undefined;
  /** Used when the step sent no model. */
  defaultModel: WorkModel;
};

function isMissingRpc(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42883" || code === "42P01" || isPostgrestMissingColumnError(err);
}

export async function proposeTermsOnJoin(client: RpcClient | null, p: ProposeOnJoinInput): Promise<JoinTermsOutcome> {
  const decision = readJoinTerms(p.input, p.defaultModel);
  if (decision.kind === "skip") return "skipped";
  if (decision.kind === "invalid") return "invalid";
  if (!UUID.test(p.tenantId) || !UUID.test(p.talentProfileId)) return "invalid";
  if (!client) return "unavailable";
  const t = decision.terms;
  const { error } = await client.rpc("propose_workspace_talent_terms", {
    p_tenant_id: p.tenantId,
    p_talent_profile_id: p.talentProfileId,
    p_work_model: t.workModel,
    p_share_kind: t.shareKind,
    p_share_bps: t.shareBps,
    p_share_amount_cents: t.shareAmountCents,
    p_share_currency: t.shareCurrency,
    p_client_price_mode: t.clientPriceMode,
    p_show_identity: t.showIdentity,
    p_show_contact: t.showContact,
    p_client_contact: t.clientContact,
    p_exclusive: t.exclusive,
    p_no_poaching: t.noPoaching,
  });
  if (error) {
    if (isMissingRpc(error)) return "unavailable";
    if ((error as { code?: string }).code === "42501") return "not_allowed";
    logServerError(`serviceHub.joinTerms.${p.path}`, error);
    return "failed";
  }
  return "sent";
}

export type JoinTermsContext = {
  defaultModel: WorkModel;
  canPropose: boolean;
  /** The workspace's EXPLICIT display currency, or null (never a USD fallback). */
  workspaceCurrency: string | null;
};

/**
 * The workspace's explicitly set display currency, read the way #4200 reads it
 * (reservations/reserve.ts workspaceCurrency): fail closed, so an unset, malformed or
 * unreadable value is null and the owner must pick the rent currency themselves.
 */
export async function loadJoinTermsCurrency(admin: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data, error } = await admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle();
  if (error) {
    logServerError("serviceHub.joinTerms.currency", error);
    return null;
  }
  return explicitDisplayCurrency((data as { settings?: unknown } | null)?.settings ?? null);
}

/**
 * The step's starting point for this workspace: its model (TUL-1442), its explicit
 * currency, and whether the signed-in user may send terms (active owner or admin).
 * Service role, tenant scoped. Any read failure falls back to the coordinator model,
 * no currency and "may not send" (fail closed).
 */
export async function loadJoinTermsContext(admin: SupabaseClient, tenantId: string, userId: string): Promise<JoinTermsContext> {
  const [style, workspaceCurrency] = await Promise.all([loadWorkStyle(admin, tenantId), loadJoinTermsCurrency(admin, tenantId)]);
  const defaultModel = joinTermsDefaultModel(style.kind === "chosen" ? style.choice : null);
  const { data, error } = await tenantScopedQuery(admin, "agency_memberships", tenantId)
    .select("role")
    .eq("profile_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    logServerError("serviceHub.joinTerms.role", error);
    return { defaultModel, canPropose: false, workspaceCurrency };
  }
  return { defaultModel, canPropose: canProposeJoinTerms((data as { role?: string } | null)?.role), workspaceCurrency };
}
