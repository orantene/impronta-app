import "server-only";

import { logServerError } from "@/lib/server/safe-error";

import type { ActionResult } from "./types";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * P5 / F07: the CLIENT sets their own name (owner decision 5). Staff
 * `renameInquiry` only bumps version and logs `messaging_rename` — it does
 * not write `contact_name`. This writer updates `inquiries.contact_name`,
 * the linked profile display name when `client_user_id` is set, and a
 * matching `customers.display_name` when one exists for the same email.
 * Email and phone are never touched.
 */
export async function renameClientContact(
  admin: Admin,
  input: { tenantId: string; inquiryId: string; name: string },
): Promise<ActionResult<{ name: string; email: string; previousName: string }>> {
  const { data: inquiry, error } = await admin
    .from("inquiries")
    .select("id, tenant_id, version, contact_name, contact_email, client_user_id")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };
  if (!inquiry) return { ok: false, reason: "not_found" };
  const row = inquiry as {
    tenant_id: string;
    version: number;
    contact_name: string;
    contact_email: string;
    client_user_id: string | null;
  };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };

  const name = input.name.trim();
  if (!name) return { ok: false, reason: "invalid" };
  const email = row.contact_email;
  const previousName = row.contact_name;

  if (row.contact_name === name) {
    return { ok: true, name, email, previousName: name };
  }

  const { data: updated, error: updateError } = await admin
    .from("inquiries")
    .update({ contact_name: name, version: row.version + 1, updated_at: new Date().toISOString() })
    .eq("id", input.inquiryId)
    .eq("version", row.version)
    .select("version, contact_email")
    .maybeSingle();
  if (updateError) return { ok: false, reason: "unavailable" };
  if (!updated) return { ok: false, reason: "conflict" };

  if (row.client_user_id) {
    await admin.from("profiles").update({ display_name: name }).eq("id", row.client_user_id);
  }
  if (email) {
    await admin
      .from("customers")
      .update({ display_name: name })
      .eq("tenant_id", input.tenantId)
      .eq("email", email);
  }

  // D-MSG-340 closes the D-MSG-220 workaround: `actor_user_id` is nullable now
  // and `actor_kind` carries the answer, so a guest edit is in staff history
  // like any other action. The thread line stays: it is what the person
  // reading the conversation sees.
  const { error: logError } = await admin.from("inquiry_action_log").insert({
    inquiry_id: input.inquiryId,
    tenant_id: input.tenantId,
    actor_user_id: row.client_user_id,
    actor_kind: "client",
    action_type: "messaging_client_edit",
    result: "success",
    metadata: { fields: ["name"] },
  });
  // A missing history line must never cost the client their own name change.
  if (logError) logServerError("messaging.client-rename/log", logError);

  return { ok: true, name, email: (updated as { contact_email: string }).contact_email ?? email, previousName };
}
