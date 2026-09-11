import "server-only";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type MessageSearchHit = {
  inquiryId: string;
  messageId: string;
  snippet: string;
};

export async function searchMessaging(
  admin: Admin,
  input: { tenantId: string; query: string },
): Promise<{ ok: true; hits: MessageSearchHit[] } | { ok: false; reason: "unavailable" | "invalid" }> {
  const q = input.query.trim();
  if (q.length < 2) return { ok: false, reason: "invalid" };
  const { data, error } = await admin
    .from("inquiry_messages")
    .select("id, inquiry_id, body, tenant_id")
    .eq("tenant_id", input.tenantId)
    .textSearch("body_tsv", q, { type: "websearch" })
    .limit(40);
  if (error) return { ok: false, reason: "unavailable" };
  return {
    ok: true,
    hits: ((data ?? []) as { id: string; inquiry_id: string; body: string | null }[]).map((row) => ({
      inquiryId: row.inquiry_id,
      messageId: row.id,
      snippet: snippet(row.body ?? "", q),
    })),
  };
}

function snippet(body: string, query: string): string {
  const lower = body.toLowerCase();
  const at = lower.indexOf(query.toLowerCase());
  if (at < 0) return body.slice(0, 140);
  const start = Math.max(0, at - 40);
  return `${start > 0 ? "…" : ""}${body.slice(start, start + 140)}`;
}
