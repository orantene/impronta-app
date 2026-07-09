import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * insertOrEditTalentReview — write a client -> talent review through the CLIENT's
 * OWN authenticated session WITHOUT `ON CONFLICT DO UPDATE`.
 *
 * WHY NOT `.upsert()`: `INSERT ... ON CONFLICT DO UPDATE` needs TABLE-level SELECT
 * (Postgres checks the update-path privileges at plan time, conflict or not).
 * Migration `20261110070000` revoked table SELECT from anon/authenticated and
 * re-granted it column-by-column EXCEPT `private_note` (to stop the world reading
 * a talent's private coaching note). So an authed upsert 42501s
 * ("permission denied for table talent_reviews") — which silently broke EVERY
 * in-app review submission after that migration shipped.
 *
 * A plain INSERT (column INSERT grants) + a WHERE-based UPDATE (column UPDATE
 * grants + SELECT on the granted WHERE columns) BOTH work and preserve that
 * privacy posture. The BEFORE-INSERT verify trigger governs the INSERT; the
 * BEFORE-UPDATE edit-guard governs the UPDATE — identical to the old upsert.
 *
 * DO NOT reintroduce `.upsert()` / `ON CONFLICT` on talent_reviews from an authed
 * client — it will 42501 again. Service-role writes (guest path) are exempt
 * (service_role keeps full SELECT).
 */

/** The columns a client may edit — must match the edit-guard's allow-list. */
export type EditableReviewFields = {
  rating: number;
  body: string | null;
  would_book_again: boolean | null;
  attr_professionalism: number | null;
  attr_skill: number | null;
  attr_communication: number | null;
  attr_reliability: number | null;
  traits: string[] | null;
  private_note: string | null;
  anon: boolean;
};

export type NewTalentReviewRow = EditableReviewFields & {
  tenant_id: string;
  talent_profile_id: string;
  booking_id: string;
  client_user_id: string;
  status: "published";
};

export async function insertOrEditTalentReview(
  supabase: SupabaseClient,
  row: NewTalentReviewRow,
): Promise<{ ok: true } | { ok: false; error: { code?: string; message?: string } }> {
  const { error: insErr } = await supabase.from("talent_reviews").insert(row);
  if (!insErr) return { ok: true };

  // Unique (booking_id, talent_profile_id, client_user_id) → this client already
  // reviewed this booking's talent; edit only the client-writable columns (the
  // edit-guard enforces the 48h window + lock).
  if (insErr.code === "23505") {
    const { error: updErr } = await supabase
      .from("talent_reviews")
      .update({
        rating: row.rating,
        body: row.body,
        would_book_again: row.would_book_again,
        attr_professionalism: row.attr_professionalism,
        attr_skill: row.attr_skill,
        attr_communication: row.attr_communication,
        attr_reliability: row.attr_reliability,
        traits: row.traits,
        private_note: row.private_note,
        anon: row.anon,
      })
      .eq("booking_id", row.booking_id)
      .eq("talent_profile_id", row.talent_profile_id)
      .eq("client_user_id", row.client_user_id);
    if (updErr) return { ok: false, error: updErr };
    return { ok: true };
  }

  return { ok: false, error: insErr };
}
