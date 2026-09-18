import "server-only";

import { currentInquiryName } from "./inquiry-name";
import { toRecordChip, type ConversationRecordRow } from "./record-chip";
import type { Essentials, IdentityLevel } from "./types";

export type { Essentials };

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function loadMessagingEssentials(
  admin: Admin,
  input: { tenantId: string; inquiryId: string },
): Promise<{ ok: true; essentials: Essentials } | { ok: false; reason: "unavailable" | "not_found" | "wrong_tenant" }> {
  const { data: inquiry, error } = await admin
    .from("inquiries")
    .select("id, tenant_id, contact_name, contact_email, contact_phone, message, source_page, version")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };
  if (!inquiry) return { ok: false, reason: "not_found" };
  const row = inquiry as {
    tenant_id: string;
    contact_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    message: string | null;
    source_page: string | null;
    version: number;
  };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };

  const [{ data: identity }, { data: links }, { data: notes }] = await Promise.all([
    admin.from("conversation_identity").select("level, method").eq("inquiry_id", input.inquiryId).maybeSingle(),
    admin
      .from("conversation_records")
      .select("record_kind, record_id, payment_state, fulfilment_state, record_date")
      .eq("inquiry_id", input.inquiryId)
      .is("unlinked_at", null),
    admin
      .from("inquiry_messages")
      .select("id, body, created_at")
      .eq("inquiry_id", input.inquiryId)
      .eq("message_kind", "internal_note")
      .order("created_at", { ascending: false }),
  ]);

  const ident = (identity ?? null) as { level: IdentityLevel; method: string | null } | null;
  const name = await currentInquiryName(admin, input.inquiryId, row.contact_name);
  return {
    ok: true,
    essentials: {
      name,
      version: row.version,
      customer: {
        name: row.contact_name,
        email: row.contact_email,
        phone: row.contact_phone,
        identityLevel: ident?.level ?? "none",
        identityMethod: ident?.method ?? null,
        request: row.message,
        source: row.source_page,
      },
      linked: ((links ?? []) as ConversationRecordRow[]).map(toRecordChip),
      notes: ((notes ?? []) as { id: string; body: string; created_at: string }[]).map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.created_at,
      })),
    },
  };
}
