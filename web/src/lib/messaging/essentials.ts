import "server-only";

import type { Essentials, IdentityLevel, RecordChip } from "./types";

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
    .select("id, tenant_id, contact_name, contact_email, contact_phone")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };
  if (!inquiry) return { ok: false, reason: "not_found" };
  const row = inquiry as {
    tenant_id: string;
    contact_name: string;
    contact_email: string | null;
    contact_phone: string | null;
  };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };

  const [{ data: identity }, { data: links }, { data: notes }] = await Promise.all([
    admin.from("conversation_identity").select("level, method").eq("inquiry_id", input.inquiryId).maybeSingle(),
    admin
      .from("conversation_records")
      .select("record_kind, record_id")
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
  return {
    ok: true,
    essentials: {
      customer: {
        name: row.contact_name,
        email: row.contact_email,
        phone: row.contact_phone,
        identityLevel: ident?.level ?? "none",
        identityMethod: ident?.method ?? null,
      },
      linked: ((links ?? []) as { record_kind: RecordChip["kind"]; record_id: string }[]).map((link) => ({
        kind: link.record_kind,
        recordId: link.record_id,
        label: link.record_kind,
        paymentState: null,
        fulfilmentState: null,
      })),
      notes: ((notes ?? []) as { id: string; body: string; created_at: string }[]).map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.created_at,
      })),
    },
  };
}
