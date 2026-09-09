import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PrepReadyCopy = {
  locale: "en" | "es";
  subject: string;
  heading: string;
  lines: string[];
  staffTitle: string;
  staffBody: string;
};

export function buildPrepReadyCopy(input: {
  locale?: string | null;
  destination: string;
}): PrepReadyCopy {
  const es = input.locale === "es";
  const pickup = input.destination === "pickup";
  if (es) {
    return {
      locale: "es",
      subject: pickup ? "Tu pedido esta listo para recoger" : "Tu pedido esta listo",
      heading: pickup ? "Tu pedido esta listo para recoger." : "Tu pedido esta listo.",
      lines: pickup
        ? ["Pasa a recogerlo. El personal confirmará la entrega."]
        : ["El personal te lo llevará a la mesa."],
      staffTitle: "Pedido listo",
      staffBody: "Hay un ticket listo para entregar.",
    };
  }
  return {
    locale: "en",
    subject: pickup ? "Your order is ready for pickup" : "Your order is ready",
    heading: pickup ? "Your order is ready for pickup." : "Your order is ready.",
    lines: pickup
      ? ["Come collect it. Staff will confirm handoff."]
      : ["Staff will bring it to the table."],
    staffTitle: "Order ready",
    staffBody: "A ticket is ready for handoff.",
  };
}

/**
 * Guest email + staff in-app when a prep ticket becomes ready.
 * Best-effort: a notify failure must never fail mark-ready.
 */
export async function notifyTicketReady(
  admin: Admin,
  input: { tenantId: string; ticketId: string },
): Promise<void> {
  try {
    const { data: ticket, error } = await admin
      .from("preparation_tickets")
      .select("id, tenant_id, order_id, destination, status")
      .eq("id", input.ticketId)
      .maybeSingle();
    if (error || !ticket) return;
    const row = ticket as {
      tenant_id: string;
      order_id: string;
      destination: string;
      status: string;
    };
    if (row.tenant_id !== input.tenantId || row.status !== "ready") return;

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, contact_email, locale")
      .eq("id", row.order_id)
      .maybeSingle();
    if (orderError) {
      logServerError("prep.notifyReady.order", orderError);
    }
    const orderRow = order as { contact_email?: string | null; locale?: string | null } | null;
    const copy = buildPrepReadyCopy({
      locale: orderRow?.locale ?? null,
      destination: row.destination,
    });

    await dispatchEventNotifications({
      type: "prep.order_ready",
      tenantId: input.tenantId,
      eventId: `prep-ready:${input.ticketId}`,
      payload: {
        ticketId: input.ticketId,
        guestEmail: orderRow?.contact_email ?? null,
        subject: copy.subject,
        heading: copy.heading,
        lines: copy.lines,
        staffTitle: copy.staffTitle,
        staffBody: copy.staffBody,
      },
    });
  } catch (err) {
    logServerError("prep.notifyReady", err);
  }
}
