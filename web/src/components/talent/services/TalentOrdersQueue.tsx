"use client";

/**
 * TalentOrdersQueue — the talent's product-order fulfillment list.
 *
 * Shows product bookings (booking_sub_type='product') with one action: mark the
 * order shipped/completed. Marking it handed off releases the deferred payout
 * (the money was captured at purchase but held until fulfillment). Service and
 * package bookings never appear here — they have no shipment step.
 *
 * Lives under components/talent/services (not admin/shell) so it may use the
 * same inline-styled aesthetic as TalentOfferingsManager.
 */

import { useEffect, useState, useTransition } from "react";
import { loadTalentOrders, markBookingFulfillment } from "@/lib/talent/fulfillment-actions";
import type { TalentOrderRow } from "@/lib/bookings/fulfillment";

const C = {
  ink: "#14161d",
  inkMuted: "rgba(20,22,29,0.62)",
  inkSoft: "rgba(20,22,29,0.42)",
  border: "rgba(20,22,29,0.12)",
  surface: "#fbfcfe",
  accent: "#2f6d6a",
  accentSoft: "rgba(47,109,106,0.10)",
  ship: "#1f6f43",
  shipSoft: "rgba(31,111,67,0.10)",
};
const FONT = "ui-sans-serif, system-ui, -apple-system, sans-serif";

const STATUS_LABEL: Record<string, string> = {
  pending: "New order",
  preparing: "Preparing",
  ready_for_pickup: "Ready for pickup",
  shipped: "Shipped",
  delivered: "Delivered",
  picked_up: "Picked up",
  downloaded: "Downloaded",
  returned: "Returned",
  completed: "Completed",
};

function isHandedOff(status: string): boolean {
  return ["shipped", "delivered", "picked_up", "downloaded", "completed"].includes(status);
}

export function TalentOrdersQueue({ talentId }: { talentId: string }) {
  const [orders, setOrders] = useState<TalentOrderRow[] | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const reload = () => {
    startTransition(async () => {
      const rows = await loadTalentOrders(talentId);
      setOrders(rows);
    });
  };

  useEffect(() => {
    let live = true;
    loadTalentOrders(talentId).then((rows) => {
      if (live) setOrders(rows);
    });
    return () => {
      live = false;
    };
  }, [talentId]);

  const ship = async (bookingId: string) => {
    setBusyId(bookingId);
    setError(null);
    const res = await markBookingFulfillment(bookingId, {
      status: "shipped",
      trackingNumber: tracking[bookingId]?.trim() || null,
    });
    setBusyId(null);
    if (res.ok) reload();
    else setError(res.error);
  };

  // The surface stays quiet until the talent actually has product orders.
  if (orders === null) {
    return (
      <div style={{ marginTop: 28, fontSize: 13, color: C.inkSoft, fontFamily: FONT }}>Loading orders…</div>
    );
  }
  if (orders.length === 0) return null;

  return (
    <section style={{ marginTop: 32, fontFamily: FONT }} data-talent-orders>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>Product orders</h3>
      <p style={{ fontSize: 12.5, color: C.inkMuted, margin: "0 0 14px" }}>
        Mark an order shipped to release its payout. The money was collected at purchase and is held until you ship.
      </p>
      {error ? (
        <div style={{ fontSize: 12.5, color: "#b4232a", marginBottom: 10 }}>{error}</div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {orders.map((o) => {
          const shipped = isHandedOff(o.fulfillmentStatus) || !!o.shippedAt;
          return (
            <div
              key={o.bookingId}
              data-order={o.bookingId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                border: `1px solid ${C.border}`,
                background: C.surface,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: C.ink }}>{o.title}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.inkSoft }}>
                  {o.paymentStatus === "paid" ? "Paid" : o.paymentStatus} · {new Date(o.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "4px 9px",
                  borderRadius: 999,
                  color: shipped ? C.ship : C.accent,
                  background: shipped ? C.shipSoft : C.accentSoft,
                }}
              >
                {STATUS_LABEL[o.fulfillmentStatus] ?? o.fulfillmentStatus}
              </span>
              {shipped ? (
                <span style={{ fontSize: 12, color: C.inkMuted }}>
                  {o.trackingNumber ? `Tracking ${o.trackingNumber}` : "Fulfilled"}
                </span>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Tracking # (optional)"
                    value={tracking[o.bookingId] ?? ""}
                    disabled={busyId === o.bookingId}
                    onChange={(e) => setTracking((t) => ({ ...t, [o.bookingId]: e.target.value }))}
                    style={{
                      fontSize: 12.5,
                      padding: "7px 10px",
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      background: "#fff",
                      color: C.ink,
                      width: 150,
                    }}
                  />
                  <button
                    type="button"
                    disabled={busyId === o.bookingId}
                    onClick={() => ship(o.bookingId)}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: C.accent,
                      color: "#fff",
                      cursor: busyId === o.bookingId ? "default" : "pointer",
                      opacity: busyId === o.bookingId ? 0.6 : 1,
                    }}
                  >
                    {busyId === o.bookingId ? "Saving…" : "Mark shipped"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
