// B5 — cross-device cart durability (server/data side).
//
// The inquiry lineup (the "cart") is server-backed via `saved_talent`, keyed by
// `client_user_id` (authed) or `guest_session_id` (guest). The in-flight inquiry
// row carries the SAME selection under `interpreted_query.talent.selected_ids`.
// Those two stores can drift, and on a new device / cleared guest cookie the
// `saved_talent` cart is unreachable while the inquiry row (relinked by the
// magic-link claim, see merge_guest_session_to_client) survives.
//
// This module keeps the two in sync WITHOUT inverting the model:
//
//   • `saved_talent` stays the AUTHORITATIVE cart.
//   • `interpreted_query.talent.selected_ids` is a strict WRITE-THROUGH
//     PROJECTION of that cart — and, after a claim, the RECOVERY SOURCE used to
//     rebuild the cart on a fresh device.
//
// Both helpers are best-effort: they NEVER throw and NEVER create an inquiry
// (the chat path owns inquiry creation). When there is no live inquiry to mirror
// into, the directory add/remove is still correct via `saved_talent`; the
// projection simply has nothing to update yet.

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

// Terminal inquiry statuses we never mirror into — mirrors the "closed" bucket
// (toThreadStatus) + cancelled used by the guest-resume scope. A settled or
// cancelled inquiry's selected_ids is a historical record, not a live cart.
const TERMINAL_STATUSES: ReadonlySet<string> = new Set<string>([
  "cancelled",
  "closed",
  "archived",
  "rejected",
  "expired",
  "closed_lost",
  "converted",
  "booked",
]);

type ActorScope =
  | { kind: "client"; clientUserId: string }
  | { kind: "guest"; guestSessionId: string };

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length > 0),
    ),
  );
}

function applyTalentToQuery(
  interpreted: Record<string, unknown> | null | undefined,
  nextIds: string[],
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(interpreted ?? {}) };
  const prevTalent = (base.talent as Record<string, unknown> | undefined) ?? {};
  // selection_mode follows the same inference the chip path uses: any selected
  // talent ⇒ "i_know_who"; none ⇒ "agency_recommends". Preserve an explicit
  // mode the chip path may already have written when ids remain non-empty.
  const prevMode =
    prevTalent.selection_mode === "i_know_who" ||
    prevTalent.selection_mode === "agency_recommends" ||
    prevTalent.selection_mode === "similar_to_past"
      ? (prevTalent.selection_mode as string)
      : null;
  const selectionMode =
    nextIds.length === 0
      ? "agency_recommends"
      : prevMode && prevMode !== "agency_recommends"
        ? prevMode
        : "i_know_who";
  base.talent = {
    ...prevTalent,
    selected_ids: nextIds,
    selection_mode: selectionMode,
  };
  return base;
}

/**
 * WRITE-THROUGH: project a single directory add/remove onto the actor's live
 * (non-terminal) inquiry `interpreted_query.talent.selected_ids`, idempotently.
 *
 * Scope: the newest non-terminal inquiry owned by this actor on this tenant.
 * `saved_talent` is the source of truth, so this only mirrors the delta; if no
 * live inquiry exists yet, it is a no-op (the cart is still durable via
 * `saved_talent`, and submit rebuilds the selection from the cart).
 *
 * Idempotent: add of an id already present, or remove of an id absent, writes
 * nothing. Never throws — a projection failure must not fail the cart write.
 */
export async function projectCartChangeToInquiry(args: {
  admin: SupabaseClient;
  tenantId: string;
  actor: ActorScope;
  talentProfileId: string;
  saved: boolean;
}): Promise<void> {
  const { admin, tenantId, actor, talentProfileId, saved } = args;
  const id = talentProfileId.trim();
  if (!id || !tenantId) return;

  try {
    let query = admin
      .from("inquiries")
      .select("id, status, interpreted_query")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    query =
      actor.kind === "client"
        ? query.eq("client_user_id", actor.clientUserId)
        : query.eq("guest_session_id", actor.guestSessionId);

    const { data: rows, error } = await query;
    if (error) {
      logServerError("inquiry/projectCartChangeToInquiry/read", error);
      return;
    }
    // FREEZE ON SEND (W0-C, extended in dock-v2 live QA): a GUEST's cart may
    // only mirror into a private DRAFT. This projection used to target any
    // non-terminal row, so a cart add AFTER the first send silently rewrote a
    // submitted inquiry's lineup — exactly the class of invisible post-send
    // edit the freeze exists to prevent. Post-send lineup changes must arrive
    // as conversation (or a new draft), never as a silent data edit. Signed-in
    // clients keep the historical live-mirror behavior (their dashboard flows
    // edit inquiries through visible, audited surfaces).
    const target = (rows ?? []).find((r) =>
      actor.kind === "guest"
        ? String(r.status) === "draft"
        : !TERMINAL_STATUSES.has(String(r.status)),
    );
    // No live inquiry yet ⇒ nothing to project. saved_talent already holds the
    // cart; the projection becomes a no-op until an inquiry row exists.
    if (!target) return;

    const interpreted =
      (target.interpreted_query as Record<string, unknown> | null) ?? {};
    const talent =
      (interpreted.talent as Record<string, unknown> | undefined) ?? {};
    const currentIds = normalizeIds(talent.selected_ids);

    const has = currentIds.includes(id);
    if (saved === has) return; // idempotent — already in the desired state.

    const nextIds = saved
      ? [...currentIds, id]
      : currentIds.filter((x) => x !== id);

    const nextQuery = applyTalentToQuery(interpreted, nextIds);
    const { error: writeErr } = await admin
      .from("inquiries")
      .update({ interpreted_query: nextQuery, updated_at: new Date().toISOString() })
      .eq("id", target.id as string);
    if (writeErr) {
      logServerError("inquiry/projectCartChangeToInquiry/write", writeErr);
    }
  } catch (err) {
    logServerError("inquiry/projectCartChangeToInquiry", err);
  }
}

/**
 * RECOVERY: backfill a client's `saved_talent` cart from the talent the claimed
 * inquiry already records under `interpreted_query.talent.selected_ids`.
 *
 * Called right after the magic-link / guest->client claim relinks the inquiry by
 * contact_email (see mergeGuestActivity). On a new device the guest cookie is
 * gone, so the guest-session-keyed saved_talent merge finds nothing — but the
 * relinked inquiry row still carries the selection. This rebuilds the cart so it
 * survives the device switch.
 *
 * `saved_talent` stays authoritative: this only INSERTS (ON CONFLICT DO NOTHING
 * semantics via upsert+ignoreDuplicates); it never removes a talent the client
 * may have added on the new device. Never throws.
 *
 * Returns the number of selected ids found across the client's claimed
 * non-terminal inquiries (the recovery candidates), for telemetry.
 */
export async function backfillCartFromClaimedInquiries(args: {
  admin: SupabaseClient;
  clientUserId: string;
}): Promise<number> {
  const { admin, clientUserId } = args;
  if (!clientUserId) return 0;

  try {
    // The just-relinked inquiries now carry client_user_id. Pull their recorded
    // selection; ignore terminal threads (a settled inquiry's roster is history,
    // not a cart to resurrect).
    const { data: rows, error } = await admin
      .from("inquiries")
      .select("status, interpreted_query")
      .eq("client_user_id", clientUserId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      logServerError("inquiry/backfillCartFromClaimedInquiries/read", error);
      return 0;
    }

    const recovered = new Set<string>();
    for (const row of rows ?? []) {
      if (TERMINAL_STATUSES.has(String(row.status))) continue;
      const interpreted =
        (row.interpreted_query as Record<string, unknown> | null) ?? {};
      const talent =
        (interpreted.talent as Record<string, unknown> | undefined) ?? {};
      for (const id of normalizeIds(talent.selected_ids)) recovered.add(id);
    }
    if (recovered.size === 0) return 0;

    const { error: upsertErr } = await admin
      .from("saved_talent")
      .upsert(
        Array.from(recovered).map((talentId) => ({
          client_user_id: clientUserId,
          talent_profile_id: talentId,
        })),
        { onConflict: "client_user_id,talent_profile_id", ignoreDuplicates: true },
      );
    if (upsertErr) {
      logServerError("inquiry/backfillCartFromClaimedInquiries/upsert", upsertErr);
      return 0;
    }
    return recovered.size;
  } catch (err) {
    logServerError("inquiry/backfillCartFromClaimedInquiries", err);
    return 0;
  }
}
