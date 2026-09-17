import "server-only";

import type { RecordKind } from "./types";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type MergeResult =
  | { ok: true; mergedInto: string; version: number }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "invalid" | "conflict" | "not_allowed" | "unavailable" };

// D-MSG-4 (decisions.md): only `order` (orders.status) and `offer`
// (inquiry_offers.status) have a real, cheaply-readable paid/confirmed
// signal today. `appointment` / `reservation` / `class_enrolment` /
// `tickets` / `project` have no dedicated status table wired into Messages
// v5 yet — RecordChip.paymentState/fulfilmentState are null everywhere in
// the existing engine too (see inbox.ts `loadChips`, essentials.ts). Those
// kinds are not checked here; documented, not silently assumed safe.
const PAID_ORDER_STATUSES = new Set(["paid", "fulfilled", "partially_refunded"]);
const CONFIRMED_OFFER_STATUSES = new Set(["accepted"]);

/**
 * S4: move a duplicate conversation's messages into the target, mark the
 * duplicate resolved+"merged", and link the pair on both sides via
 * inquiry_action_log. Never deletes a row.
 *
 * Race safety: the FIRST write is an optimistic-locked UPDATE on the
 * duplicate's own `version` (`WHERE id = duplicate AND version =
 * expectedVersion`). Two concurrent merges of the same duplicate — same or
 * racing expectedVersion — can both reach this function, but Postgres
 * serializes the two UPDATE statements on that row; only one matches the
 * WHERE clause and proceeds, the other gets back no row and reports
 * `conflict`. The row-moving steps after that point are themselves
 * idempotent (`UPDATE ... WHERE inquiry_id = duplicate`): if a losing
 * racer's steps ever ran, they would move zero rows, not duplicate them.
 */
export async function mergeInquiries(
  admin: Admin,
  input: {
    tenantId: string;
    duplicateInquiryId: string;
    intoInquiryId: string;
    expectedVersion: number;
    actorUserId: string;
  },
): Promise<MergeResult> {
  if (input.duplicateInquiryId === input.intoInquiryId) return { ok: false, reason: "invalid" };

  const [{ data: dupRow }, { data: intoRow }] = await Promise.all([
    admin
      .from("inquiries")
      .select("id, tenant_id, version")
      .eq("id", input.duplicateInquiryId)
      .maybeSingle(),
    admin.from("inquiries").select("id, tenant_id, version").eq("id", input.intoInquiryId).maybeSingle(),
  ]);
  if (!dupRow || !intoRow) return { ok: false, reason: "not_found" };
  const dup = dupRow as { id: string; tenant_id: string; version: number };
  const into = intoRow as { id: string; tenant_id: string; version: number };
  if (dup.tenant_id !== input.tenantId || into.tenant_id !== input.tenantId || dup.tenant_id !== into.tenant_id) {
    return { ok: false, reason: "wrong_tenant" };
  }

  if (await eitherHasPaidOrConfirmedRecord(admin, input.tenantId, [dup.id, into.id])) {
    await admin.from("inquiry_action_log").insert({
      inquiry_id: dup.id,
      actor_user_id: input.actorUserId,
      action_type: "messaging_merge",
      result: "failure",
      reason: "paid_or_confirmed_record",
      metadata: { counterpart_id: into.id },
    });
    return { ok: false, reason: "not_allowed" };
  }

  const { data: locked, error: lockError } = await admin
    .from("inquiries")
    .update({ version: dup.version + 1 })
    .eq("id", dup.id)
    .eq("version", input.expectedVersion)
    .select("version")
    .maybeSingle();
  if (lockError) return { ok: false, reason: "unavailable" };
  if (!locked) return { ok: false, reason: "conflict" };

  await moveByInquiryId(admin, "inquiry_messages", dup.id, into.id);
  await moveByInquiryId(admin, "inquiry_attachments", dup.id, into.id);
  await mergeMessageReads(admin, dup.id, into.id);

  await admin
    .from("inquiries")
    .update({
      conversation_state: "resolved",
      lost_reason: "merged",
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: input.actorUserId,
    })
    .eq("id", dup.id);

  await admin.from("inquiry_action_log").insert([
    {
      inquiry_id: dup.id,
      actor_user_id: input.actorUserId,
      action_type: "messaging_merge",
      result: "success",
      metadata: { direction: "moved_into", counterpart_id: into.id },
    },
    {
      inquiry_id: into.id,
      actor_user_id: input.actorUserId,
      action_type: "messaging_merge",
      result: "success",
      metadata: { direction: "moved_from", counterpart_id: dup.id },
    },
  ]);

  return { ok: true, mergedInto: into.id, version: (locked as { version: number }).version };
}

async function moveByInquiryId(admin: Admin, table: string, fromId: string, toId: string) {
  await admin.from(table).update({ inquiry_id: toId }).eq("inquiry_id", fromId);
}

/**
 * `inquiry_message_reads` is keyed (inquiry_id, thread_type, user_id) — not
 * trivially re-keyable by a blind UPDATE, since the target may already have
 * a row for the same (thread_type, user_id). Take the newer `last_read_at`
 * on conflict, otherwise move; never leaves a duplicate-inquiry row behind
 * with new data lost.
 */
async function mergeMessageReads(admin: Admin, fromId: string, toId: string) {
  const { data } = await admin
    .from("inquiry_message_reads")
    .select("thread_type, user_id, last_read_at, last_read_message_id")
    .eq("inquiry_id", fromId);
  const rows = (data ?? []) as Array<{
    thread_type: string;
    user_id: string;
    last_read_at: string;
    last_read_message_id: string | null;
  }>;
  for (const row of rows) {
    const { data: existing } = await admin
      .from("inquiry_message_reads")
      .select("last_read_at")
      .eq("inquiry_id", toId)
      .eq("thread_type", row.thread_type)
      .eq("user_id", row.user_id)
      .maybeSingle();
    if (existing) {
      const cur = existing as { last_read_at: string };
      if (row.last_read_at > cur.last_read_at) {
        await admin
          .from("inquiry_message_reads")
          .update({ last_read_at: row.last_read_at, last_read_message_id: row.last_read_message_id })
          .eq("inquiry_id", toId)
          .eq("thread_type", row.thread_type)
          .eq("user_id", row.user_id);
      }
    } else {
      await admin.from("inquiry_message_reads").insert({
        inquiry_id: toId,
        thread_type: row.thread_type,
        user_id: row.user_id,
        last_read_at: row.last_read_at,
        last_read_message_id: row.last_read_message_id,
      });
    }
    await admin
      .from("inquiry_message_reads")
      .delete()
      .eq("inquiry_id", fromId)
      .eq("thread_type", row.thread_type)
      .eq("user_id", row.user_id);
  }
}

async function eitherHasPaidOrConfirmedRecord(admin: Admin, tenantId: string, inquiryIds: string[]): Promise<boolean> {
  const { data } = await admin
    .from("conversation_records")
    .select("inquiry_id, record_kind, record_id")
    .eq("tenant_id", tenantId)
    .in("inquiry_id", inquiryIds)
    .is("unlinked_at", null);
  const links = (data ?? []) as Array<{ inquiry_id: string; record_kind: RecordKind; record_id: string }>;
  for (const link of links) {
    if (link.record_kind === "order") {
      const { data: order } = await admin.from("orders").select("status").eq("id", link.record_id).maybeSingle();
      const status = (order as { status: string } | null)?.status;
      if (status && PAID_ORDER_STATUSES.has(status)) return true;
    }
    if (link.record_kind === "offer") {
      const { data: offer } = await admin
        .from("inquiry_offers")
        .select("status")
        .eq("id", link.record_id)
        .maybeSingle();
      const status = (offer as { status: string } | null)?.status;
      if (status && CONFIRMED_OFFER_STATUSES.has(status)) return true;
    }
  }
  return false;
}
