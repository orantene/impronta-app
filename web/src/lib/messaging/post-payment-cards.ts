import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from?: (table: string) => any;
};

/**
 * After a verified cash/transfer collection, write the cards the thread
 * already knows how to render. Skips a card that is already on the inquiry.
 * A missing door code is left off the tickets card. Never throws.
 */
export async function postVerifiedCollectionCards(
  admin: Admin,
  input: { tenantId: string; orderId: string },
): Promise<void> {
  if (typeof admin.from !== "function") return;
  const from = (table: string) => admin.from!(table);
  try {
    const { data: links } = await from("conversation_records")
      .select("inquiry_id")
      .eq("tenant_id", input.tenantId)
      .eq("record_id", input.orderId)
      .is("unlinked_at", null);
    const inquiryIds = [
      ...new Set(
        ((links ?? []) as Array<{ inquiry_id: string | null }>)
          .map((r) => r.inquiry_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (inquiryIds.length === 0) return;

    const { data: order } = await from("orders")
      .select("id, total_cents, currency")
      .eq("id", input.orderId)
      .maybeSingle();
    const sale = order as { total_cents?: number; currency?: string } | null;

    for (const inquiryId of inquiryIds) {
      const { data: existing } = await from("inquiry_messages")
        .select("id, message_kind")
        .eq("tenant_id", input.tenantId)
        .eq("inquiry_id", inquiryId)
        .in("message_kind", ["order_confirmation", "tickets_card"])
        .is("deleted_at", null);
      const kinds = new Set(((existing ?? []) as Array<{ message_kind: string }>).map((r) => r.message_kind));

      if (!kinds.has("order_confirmation")) {
        await from("inquiry_messages").insert({
          inquiry_id: inquiryId,
          tenant_id: input.tenantId,
          thread_type: "private",
          sender_user_id: null,
          body: "Order confirmed",
          message_kind: "order_confirmation",
          card_payload: {
            state: "sent",
            recordKind: "order",
            recordId: input.orderId,
            orderId: input.orderId,
            totalCents: sale?.total_cents ?? null,
            currency: sale?.currency ?? "USD",
          },
        });
      }

      if (kinds.has("tickets_card")) continue;
      const { data: lines } = await from("order_lines")
        .select("id, label")
        .eq("order_id", input.orderId);
      const lineRows = (lines ?? []) as Array<{ id: string; label?: string }>;
      if (lineRows.length === 0) continue;
      const { data: admissions } = await from("admissions")
        .select("id, order_line_id, status")
        .eq("tenant_id", input.tenantId)
        .in("order_line_id", lineRows.map((l) => l.id));
      const tickets = (admissions ?? []) as Array<{ id: string; order_line_id: string }>;
      if (tickets.length === 0) continue;
      const tiers = lineRows
        .filter((l) => tickets.some((t) => t.order_line_id === l.id))
        .map((l) => ({ id: l.id, label: l.label ?? "Ticket", priceCents: 0 }));
      await from("inquiry_messages").insert({
        inquiry_id: inquiryId,
        tenant_id: input.tenantId,
        thread_type: "private",
        sender_user_id: null,
        body: "Tickets",
        message_kind: "tickets_card",
        card_payload: {
          state: "paid",
          title: "Tickets",
          currency: sale?.currency ?? "USD",
          tiers,
        },
      });
    }
  } catch (err) {
    logServerError("messaging.postVerifiedCollectionCards", err);
  }
}
