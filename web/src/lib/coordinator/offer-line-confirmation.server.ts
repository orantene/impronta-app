import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { LineAnswer, LineAnswerStatus, LineAnswersRead } from "./offer-line-confirmation";

/**
 * TUL-1607: read and write each person's answer on their own offer line
 * (`offer_line_confirmations`, held migration 20261231422600). Fail closed like
 * TUL-1603: a missing table or any read error is "not ok", never confirmed.
 */

const TABLE = "offer_line_confirmations";
const MISSING = new Set(["42P01", "42703", "PGRST205"]);
const isMissing = (e: { code?: string } | null | undefined) => !!e?.code && MISSING.has(e.code);

export async function readOfferLineAnswers(
  admin: SupabaseClient,
  input: { tenantId: string; offerId: string },
): Promise<LineAnswersRead> {
  try {
    const { data, error } = await admin
      .from(TABLE)
      .select("offer_line_id, talent_profile_id, status")
      .eq("tenant_id", input.tenantId)
      .eq("offer_id", input.offerId);
    if (error) {
      if (!isMissing(error)) logServerError("offerLines.read", error);
      return { ok: false };
    }
    const answers: LineAnswer[] = [];
    for (const r of (data ?? []) as Array<{ offer_line_id?: unknown; talent_profile_id?: unknown; status?: unknown }>) {
      if (typeof r.offer_line_id !== "string" || typeof r.talent_profile_id !== "string") continue;
      if (r.status === "confirmed" || r.status === "declined") {
        answers.push({ lineId: r.offer_line_id, talentProfileId: r.talent_profile_id, status: r.status });
      }
    }
    return { ok: true, answers };
  } catch (err) {
    logServerError("offerLines.read", err);
    return { ok: false };
  }
}

/** Page loader: no service client means unknown, which is never confirmed. */
export async function loadOfferLineAnswers(tenantId: string, offerId: string): Promise<LineAnswersRead> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };
  return readOfferLineAnswers(admin, { tenantId, offerId });
}

export type AnswerOwnLineResult = { ok: true } | { ok: false; reason: "invalid" | "not_yours" | "unavailable" };

/** A person answers THEIR OWN line: the line's current person must be a profile owned by the signed-in user. */
export async function answerOwnOfferLine(
  admin: SupabaseClient,
  input: { userId: string; lineId: string; status: LineAnswerStatus },
): Promise<AnswerOwnLineResult> {
  if (input.status !== "confirmed" && input.status !== "declined") return { ok: false, reason: "invalid" };
  if (!input.userId || !input.lineId) return { ok: false, reason: "invalid" };
  try {
    // Identity first: the profiles this user owns. No profile means a non-participant, and the
    // service role never reads any offer line on their behalf.
    const mineRes = await admin.from("talent_profiles").select("id").eq("user_id", input.userId);
    if (mineRes.error) {
      logServerError("offerLines.answer.owner", mineRes.error);
      return { ok: false, reason: "unavailable" };
    }
    const myProfileIds = ((mineRes.data ?? []) as Array<{ id?: unknown }>).map((r) => r.id).filter((v): v is string => typeof v === "string");
    if (myProfileIds.length === 0) return { ok: false, reason: "not_yours" };

    // Then the read, scoped to lines whose CURRENT person is one of those profiles: another
    // person's (or another tenant's) line is never returned.
    const lineRes = await admin
      .from("inquiry_offer_line_items")
      .select("id, offer_id, tenant_id, talent_profile_id")
      .eq("id", input.lineId)
      .in("talent_profile_id", myProfileIds)
      .maybeSingle();
    if (lineRes.error) {
      logServerError("offerLines.answer.line", lineRes.error);
      return { ok: false, reason: "unavailable" };
    }
    const line = lineRes.data as { id: string; offer_id: string; tenant_id: string | null; talent_profile_id: string | null } | null;
    if (!line || !line.talent_profile_id || !line.tenant_id) return { ok: false, reason: "not_yours" };

    if (!myProfileIds.includes(line.talent_profile_id)) return { ok: false, reason: "not_yours" };

    // Preferred: one guarded statement (held migration 20261231423200) that locks the line and
    // writes only if the line's CURRENT person is the writer.
    const rpc = await admin.rpc("answer_offer_line_confirmation", {
      p_line: line.id,
      p_talent: line.talent_profile_id,
      p_status: input.status,
    });
    if (!rpc.error) {
      return rpc.data === "ok" ? { ok: true } : { ok: false, reason: "not_yours" };
    }
    if (rpc.error.code !== "PGRST202" && rpc.error.code !== "42883") {
      logServerError("offerLines.answer.rpc", rpc.error);
      return { ok: false, reason: "unavailable" };
    }

    const { error } = await admin.from(TABLE).upsert(
      {
        offer_line_id: line.id,
        offer_id: line.offer_id,
        tenant_id: line.tenant_id,
        talent_profile_id: line.talent_profile_id,
        status: input.status,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "offer_line_id" },
    );
    if (error) {
      if (!isMissing(error)) logServerError("offerLines.answer.write", error);
      return { ok: false, reason: "unavailable" };
    }
    // Fallback only: re-check the line; if its person changed meanwhile, undo our row (conditioned on our profile).
    const after = await admin.from("inquiry_offer_line_items").select("talent_profile_id").eq("id", line.id).maybeSingle();
    const still = (after.data as { talent_profile_id: string | null } | null)?.talent_profile_id;
    if (after.error || still !== line.talent_profile_id) {
      const del = await admin.from(TABLE).delete().eq("offer_line_id", line.id).eq("talent_profile_id", line.talent_profile_id);
      if (del.error) logServerError("offerLines.answer.undo", del.error);
      return { ok: false, reason: after.error ? "unavailable" : "not_yours" };
    }
    return { ok: true };
  } catch (err) {
    logServerError("offerLines.answer", err);
    return { ok: false, reason: "unavailable" };
  }
}
