"use client";

import { useState } from "react";
import { REFUND_EFFECTS, type RefundEffect } from "@/lib/orders/refund-effects";
import { loadOrderLinesForDesk, refundOrderAtDesk } from "./refund-actions";

const EFFECT_COPY: Record<RefundEffect, string> = {
  keep_entitlement: "Refund part of the price. The guest keeps what they bought.",
  cancel_ticket: "Cancel one ticket. That admission is revoked and the seat comes back.",
  adjustment_after_service: "Refund after the service. Nothing else changes.",
  revoke_unused_admission: "Revoke an unused admission. Refund is optional.",
  refund_hybrid_component: "Refund one part of a package. The other parts stand.",
};

export function OrdersRefundForm({
  orderId,
  labels,
}: {
  orderId: string;
  labels: { refund: string; effect: string; confirm: string };
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Array<{ id: string; name: string; totalCents: number }>>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [effect, setEffect] = useState<RefundEffect>("cancel_ticket");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function openForm() {
    setOpen(true);
    setMsg(null);
    const res = await loadOrderLinesForDesk(orderId);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setLines(res.lines.filter((l) => l.totalCents > l.refundedCents));
  }

  return (
    <div>
      {!open ? (
        <button type="button" onClick={() => void openForm()} style={{ fontSize: 12 }}>
          {labels.refund}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (picked.length === 0) {
              setMsg("pick a line");
              return;
            }
            setBusy(true);
            void refundOrderAtDesk({ orderId, lineIds: picked, effect }).then((r) => {
              setBusy(false);
              setMsg(r.ok ? "ok" : r.error);
              if (r.ok) setOpen(false);
            });
          }}
          style={{ display: "grid", gap: 8, maxWidth: 320 }}
        >
          {lines.map((line) => (
            <label key={line.id} style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={picked.includes(line.id)}
                onChange={(e) => {
                  setPicked((cur) =>
                    e.target.checked ? [...cur, line.id] : cur.filter((id) => id !== line.id),
                  );
                }}
              />{" "}
              {line.name}
            </label>
          ))}
          <label style={{ fontSize: 12 }}>
            {labels.effect}
            <select
              value={effect}
              onChange={(e) => setEffect(e.target.value as RefundEffect)}
              style={{ display: "block", width: "100%", minHeight: 36 }}
            >
              {REFUND_EFFECTS.map((id) => (
                <option key={id} value={id}>
                  {EFFECT_COPY[id]}
                </option>
              ))}
            </select>
          </label>
          <p style={{ fontSize: 12, margin: 0 }}>{EFFECT_COPY[effect]}</p>
          <button type="submit" disabled={busy} style={{ minHeight: 36 }}>
            {labels.confirm}
          </button>
          {msg ? <p role="status" style={{ fontSize: 12, margin: 0 }}>{msg}</p> : null}
        </form>
      )}
    </div>
  );
}
