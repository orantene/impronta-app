import "server-only";

/**
 * Cron half of hold-the-send: an offer that has waited AWAITING_TALENT_EXPIRY_HOURS for a talent
 * to approve goes back to the staff as a draft, with a staff-only note. Idempotent: the offer
 * update is a compare-and-set on `status = 'awaiting_talent'`, so a second sweep (or a talent who
 * approves in the same second) finds nothing to do.
 */

import { awaitingTalentCutoffIso, AWAITING_TALENT } from "@/lib/inquiry/offer-awaiting-talent";
import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export const AWAITING_TALENT_TIMEOUT_NOTE = "Talent didn't respond in 72 h. The offer is back in draft; edit it or re-send.";

export async function sweepAwaitingTalentOffers(
  admin: Admin,
  nowMs: number = Date.now(),
): Promise<{ returned: number; inquiryIds: string[] }> {
  const cutoff = awaitingTalentCutoffIso(nowMs);
  // `sent_at` is stamped when staff sent it; fall back to updated_at for a row with none.
  const { data, error } = await admin
    .from("inquiry_offers")
    .select("id, inquiry_id, tenant_id, sent_at, updated_at")
    .eq("status", AWAITING_TALENT)
    .limit(200);
  if (error) {
    logServerError("awaiting-talent-expiry.read", error);
    return { returned: 0, inquiryIds: [] };
  }
  const due = ((data ?? []) as Array<{ id: string; inquiry_id: string; tenant_id: string; sent_at: string | null; updated_at: string | null }>).filter(
    (o) => (o.sent_at ?? o.updated_at ?? "9999") < cutoff,
  );
  const inquiryIds: string[] = [];
  for (const o of due) {
    const { data: flipped, error: flipErr } = await admin
      .from("inquiry_offers")
      .update({ status: "draft", updated_at: new Date(nowMs).toISOString() })
      .eq("id", o.id)
      .eq("status", AWAITING_TALENT)
      .select("id");
    if (flipErr) {
      logServerError("awaiting-talent-expiry.flip", flipErr);
      continue;
    }
    if (!flipped || (flipped as unknown[]).length === 0) continue;
    inquiryIds.push(o.inquiry_id);
    const { error: inqErr } = await admin
      .from("inquiries")
      .update({ status: "coordination" })
      .eq("id", o.inquiry_id)
      .eq("current_offer_id", o.id)
      .eq("status", "offer_pending");
    if (inqErr) logServerError("awaiting-talent-expiry.inquiry", inqErr);
    const { error: noteErr } = await admin.from("inquiry_messages").insert({
      inquiry_id: o.inquiry_id,
      tenant_id: o.tenant_id,
      thread_type: "private",
      sender_user_id: null,
      body: AWAITING_TALENT_TIMEOUT_NOTE,
      message_kind: "internal_note",
    });
    if (noteErr) logServerError("awaiting-talent-expiry.note", noteErr);
  }
  return { returned: inquiryIds.length, inquiryIds };
}
