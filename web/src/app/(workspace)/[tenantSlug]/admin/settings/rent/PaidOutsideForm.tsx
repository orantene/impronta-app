"use client";

/**
 * TUL-1646: "Mark a month as paid outside Tulala" (cash or bank transfer). Owner only (the action enforces it).
 * No fee is shown because none applies. The amount defaults to the fixed rent; the owner types what was received.
 */
import { useState, useTransition } from "react";
import { markRentPaidOutside } from "@/lib/service-hub/rent/rent-outside-actions";
import { RENT_COPY, rentRefusalText } from "@/lib/service-hub/rent/rent-copy";

function monthOptions(startsOn: string, now: Date): string[] {
  const out: string[] = [];
  for (let back = -1; back < 12; back += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const p = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (p >= startsOn.slice(0, 7)) out.push(p);
  }
  return out;
}

export function PaidOutsideForm({ planId, startsOn, defaultAmountCents, locale, autopayOn = false }: { planId: string; startsOn: string; defaultAmountCents: number; locale: "en" | "es"; autopayOn?: boolean }) {
  const c = RENT_COPY[locale];
  const months = monthOptions(startsOn, new Date());
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(months[1] ?? months[0] ?? "");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [amount, setAmount] = useState(defaultAmountCents > 0 ? String(defaultAmountCents / 100) : "");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = { padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(24,24,27,0.15)" } as const;

  if (!open) {
    return (
      <button type="button" style={{ marginTop: 8, fontSize: 12.5 }} onClick={() => setOpen(true)}>
        {c.paidOutsideOpen}
      </button>
    );
  }
  return (
    <div data-testid="rent-paid-outside" style={{ marginTop: 10, padding: 10, border: "1px solid rgba(24,24,27,0.1)", borderRadius: 10 }}>
      <div style={{ fontSize: 12.5, opacity: 0.75, marginBottom: 6 }}>{autopayOn ? c.paidOutsideHintAutopay : c.paidOutsideHint}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={c.paidOutsideMonth} style={field}>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value as "cash" | "transfer")} aria-label={c.paidOutsideMethod} style={field}>
          <option value="cash">{c.cash}</option>
          <option value="transfer">{c.transfer}</option>
        </select>
        <input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={c.paidOutsideAmount} placeholder={c.paidOutsideAmount} style={{ ...field, width: 120 }} />
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label={c.paidOutsideNote} placeholder={c.paidOutsideNote} style={{ ...field, width: 200 }} />
        <button
          type="button"
          disabled={pending || !period || !Number(amount)}
          onClick={() => start(async () => {
            setMsg(null);
            const r = await markRentPaidOutside({ planId, period, method, amountCents: Math.round(Number(amount) * 100), note });
            setMsg(r.ok ? { ok: true, text: c.paidOutsideDone } : { ok: false, text: rentRefusalText(r.reason, c) });
          })}
        >
          {c.paidOutsideSave}
        </button>
        <button type="button" onClick={() => setOpen(false)}>{c.cancel}</button>
      </div>
      {msg && <p role="status" style={{ fontSize: 12.5, color: msg.ok ? "var(--color-admin-green)" : "var(--color-admin-red)" }}>{msg.text}</p>}
    </div>
  );
}
