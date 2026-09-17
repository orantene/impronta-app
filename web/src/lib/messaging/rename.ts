import "server-only";

import { currentInquiryName } from "./inquiry-name";
import type { ActionResult } from "./types";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * S4: set the inquiry's internal name. There is no `subject`/`title` column
 * (D-MSG-2) — the rename is a fact recorded on `inquiry_action_log`
 * (`action_type = 'messaging_rename'`, `metadata: { old, new }`) and the
 * inquiry's own `version` is bumped so the write is still optimistically
 * locked exactly like every other messaging writer, even though no inquiry
 * column changes value.
 *
 * Caller (messaging-engine.ts) has already trimmed/length-checked `name`;
 * this is the mechanics: version check, no-op guard, log.
 */
export async function renameInquiry(
  admin: Admin,
  input: { tenantId: string; inquiryId: string; name: string; expectedVersion: number; actorUserId: string },
): Promise<ActionResult<{ name: string; version: number }>> {
  const { data: inquiry, error } = await admin
    .from("inquiries")
    .select("id, tenant_id, version, contact_name")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };
  if (!inquiry) return { ok: false, reason: "not_found" };
  const row = inquiry as { tenant_id: string; version: number; contact_name: string };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };
  if (row.version !== input.expectedVersion) return { ok: false, reason: "conflict" };

  const oldName = await currentInquiryName(admin, input.inquiryId, row.contact_name);
  if (oldName === input.name) {
    // Renaming to the current name is a no-op, not a conflict or a new log line.
    return { ok: true, name: input.name, version: row.version };
  }

  const { data: updated, error: updateError } = await admin
    .from("inquiries")
    .update({ version: row.version + 1, updated_at: new Date().toISOString() })
    .eq("id", input.inquiryId)
    .eq("version", row.version)
    .select("version")
    .maybeSingle();
  if (updateError) return { ok: false, reason: "unavailable" };
  if (!updated) return { ok: false, reason: "conflict" };

  await admin.from("inquiry_action_log").insert({
    inquiry_id: input.inquiryId,
    actor_user_id: input.actorUserId,
    action_type: "messaging_rename",
    result: "success",
    metadata: { old: oldName, new: input.name },
  });

  return { ok: true, name: input.name, version: (updated as { version: number }).version };
}
