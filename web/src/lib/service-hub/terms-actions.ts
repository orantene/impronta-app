"use server";

/**
 * TUL-1368 · Service hub terms: server actions.
 *
 * - respondToHubTermsAction: the signed-in talent accepts or declines a pending version.
 * - proposeHubTermsAction: an active owner/admin of a workspace proposes terms to a talent
 *   (used on invite, Discover join and direct add; the owner screen ships with the
 *   Service hub settings card).
 *
 * Both call SECURITY DEFINER RPCs with the USER session, so the database checks who may
 * do what. While the held migration is not applied the actions answer "unavailable".
 */
import { revalidatePath } from "next/cache";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { createClient } from "@/lib/supabase/server";
import { validateProposedTerms, type ProposedTerms } from "./terms";

export type HubTermsActionResult =
  | { ok: true; status: string }
  | { ok: false; error: "unavailable" | "forbidden" | "invalid" | "failed" };

function isMissingRpc(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42883" || isPostgrestMissingColumnError(err);
}

export async function respondToHubTermsAction(termsId: string, accept: boolean): Promise<HubTermsActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: "forbidden" };
  if (typeof termsId !== "string" || !/^[0-9a-f-]{36}$/i.test(termsId)) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "unavailable" };
  const { data, error } = await supabase.rpc("respond_workspace_talent_terms", {
    p_terms_id: termsId,
    p_accept: accept === true,
  });
  if (error) {
    if (isMissingRpc(error)) return { ok: false, error: "unavailable" };
    if ((error as { code?: string }).code === "42501") return { ok: false, error: "forbidden" };
    logServerError("serviceHub.terms.respond", error);
    return { ok: false, error: "failed" };
  }
  revalidatePath("/talent", "layout");
  return { ok: true, status: String(data ?? "") };
}

/** Form wrapper for the card buttons (no client JS needed). */
export async function respondToHubTermsFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("termsId") ?? "");
  const accept = String(formData.get("answer") ?? "") === "accept";
  await respondToHubTermsAction(id, accept);
}

export async function proposeHubTermsAction(
  tenantId: string,
  talentProfileId: string,
  terms: ProposedTerms,
): Promise<HubTermsActionResult & { version?: number }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: "forbidden" };
  if (!validateProposedTerms(terms).ok) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "unavailable" };
  const { data, error } = await supabase.rpc("propose_workspace_talent_terms", {
    p_tenant_id: tenantId,
    p_talent_profile_id: talentProfileId,
    p_work_model: terms.workModel,
    p_share_kind: terms.shareKind,
    p_share_bps: terms.shareBps,
    p_share_amount_cents: terms.shareAmountCents,
    p_share_currency: terms.shareCurrency,
    p_client_price_mode: terms.clientPriceMode,
    p_show_identity: terms.showIdentity,
    p_show_contact: terms.showContact,
    p_client_contact: terms.clientContact,
    p_exclusive: terms.exclusive,
    p_no_poaching: terms.noPoaching,
  });
  if (error) {
    if (isMissingRpc(error)) return { ok: false, error: "unavailable" };
    if ((error as { code?: string }).code === "42501") return { ok: false, error: "forbidden" };
    logServerError("serviceHub.terms.propose", error);
    return { ok: false, error: "failed" };
  }
  return { ok: true, status: "pending", version: Number(data) };
}
