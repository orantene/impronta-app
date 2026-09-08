"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  posAddLine,
  posCancelSale,
  posCloseShift,
  posCreateDraft,
  posOpenShift,
  posReprice,
  posRemoveLine,
  posStartCollection,
  posSubmitPrep,
  posUpdateLine,
} from "./actions";
import type { PosSaleView } from "@/lib/pos/commands";

export type PosCatalogItem = {
  id: string;
  title: string;
  amountCents: number;
  kind: string | null;
};

export type PosShiftView = {
  id: string;
  version: number;
  openingCashCents: number;
  openedAt: string | null;
};

function parseCents(raw: string, fallback: number): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return fallback;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export function PosClient(props: {
  tenantSlug: string;
  sale: PosSaleView | null;
  openSales: Array<{ id: string; totalCents: number }>;
  catalog: PosCatalogItem[];
  shift: PosShiftView | null;
  copy: {
    newSale: string;
    openSales: string;
    guest: string;
    items: string;
    discount: string;
    deposit: string;
    outstanding: string;
    prep: string;
    payment: string;
    next: string;
    collectCash: string;
    collectCard: string;
    cancel: string;
    contactHint: string;
    email: string;
    phone: string;
    applyCode: string;
    sendToPrep: string;
    emptyCatalog: string;
    emptyOpen: string;
    amount: string;
    tendered: string;
    change: string;
    shiftTitle: string;
    shiftOpen: string;
    shiftClose: string;
    shiftOpening: string;
    shiftCounted: string;
    shiftExpected: string;
    shiftVariance: string;
    shiftNone: string;
    shiftOpenHint: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [promo, setPromo] = useState("");
  const [amount, setAmount] = useState("");
  const [tendered, setTendered] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const sale = props.sale;

  function go(orderId: string) {
    router.push(`/${props.tenantSlug}/admin/pos?order=${orderId}`);
    router.refresh();
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string } | { ok: true }>) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setMsg("error" in r && r.error ? r.error : "unavailable");
    else router.refresh();
    return r;
  }

  async function collect(method: "cash" | "online_card") {
    if (!sale) return { ok: false as const, error: "unavailable" };
    const amountCents = parseCents(amount, sale.outstandingCents);
    if (amountCents == null || amountCents <= 0) {
      return { ok: false as const, error: "amount" };
    }
    const tenderedCents = parseCents(tendered, amountCents);
    if (tenderedCents == null) {
      return { ok: false as const, error: "tendered" };
    }
    const r = await posStartCollection({
      orderId: sale.orderId,
      method,
      email: email || undefined,
      phone: phone || undefined,
      amountCents,
      tenderedCents: method === "cash" ? tenderedCents : undefined,
      idempotencyKey: crypto.randomUUID(),
    });
    if (r.ok && method === "online_card" && "checkoutUrl" in r && r.checkoutUrl) {
      window.location.href = r.checkoutUrl;
    }
    return r;
  }

  return (
    <div>
      <section style={{ marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid rgba(24,24,27,0.08)" }}>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>{props.copy.shiftTitle}</h2>
        <p style={{ color: "rgba(11,11,13,0.55)", marginTop: 0 }}>{props.copy.shiftOpenHint}</p>
        {props.shift ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <p style={{ margin: 0 }}>
              {props.copy.shiftOpening}: {props.shift.openingCashCents}
            </p>
            <label>
              {props.copy.shiftCounted}
              <input
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                inputMode="numeric"
                style={{ display: "block", minHeight: 44, width: 140 }}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              style={{ minHeight: 44 }}
              onClick={() => {
                const closingCashCents = parseCents(countedCash, -1);
                if (closingCashCents == null || closingCashCents < 0) {
                  setMsg("amount");
                  return;
                }
                void run(() =>
                  posCloseShift({
                    closingCashCents,
                    expectedVersion: props.shift?.version,
                  }),
                );
              }}
            >
              {props.copy.shiftClose}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <p style={{ margin: 0 }}>{props.copy.shiftNone}</p>
            <label>
              {props.copy.shiftOpening}
              <input
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                inputMode="numeric"
                style={{ display: "block", minHeight: 44, width: 140 }}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              style={{ minHeight: 44 }}
              onClick={() => {
                const openingCashCents = parseCents(openingCash, 0);
                if (openingCashCents == null) {
                  setMsg("amount");
                  return;
                }
                void run(() => posOpenShift(openingCashCents));
              }}
            >
              {props.copy.shiftOpen}
            </button>
          </div>
        )}
      </section>
      <div style={{ display: "grid", gap: 28, gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)" }}>
      <section>
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy}
            style={{ minHeight: 44 }}
            onClick={() => {
              void run(async () => {
                const r = await posCreateDraft();
                if (r.ok && "orderId" in r) go(r.orderId);
                return r;
              });
            }}
          >
            {props.copy.newSale}
          </button>
        </div>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>{props.copy.items}</h2>
        {props.catalog.length === 0 ? (
          <p>{props.copy.emptyCatalog}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {props.catalog.map((item) => (
              <li key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid rgba(24,24,27,0.08)", minHeight: 44 }}>
                <span>
                  {item.title}
                  <span style={{ color: "rgba(11,11,13,0.55)", marginLeft: 8 }}>{item.amountCents}</span>
                </span>
                <button
                  type="button"
                  disabled={busy || !sale}
                  onClick={() => {
                    if (!sale) return;
                    void run(() => posAddLine({ orderId: sale.orderId, offeringId: item.id, units: 1 }));
                  }}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        )}
        <h2 style={{ fontSize: 16, margin: "24px 0 8px" }}>{props.copy.openSales}</h2>
        {props.openSales.length === 0 ? (
          <p>{props.copy.emptyOpen}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {props.openSales.map((row) => (
              <li key={row.id}>
                <button type="button" style={{ minHeight: 44 }} onClick={() => go(row.id)}>
                  {row.id.slice(0, 8)} · {row.totalCents}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside style={{ borderLeft: "1px solid rgba(24,24,27,0.08)", paddingLeft: 20 }}>
        {!sale ? (
          <p>{props.copy.next}</p>
        ) : (
          <>
            <p>
              {sale.customerId ? sale.customerId.slice(0, 8) : props.copy.guest}
              {sale.context ? ` · ${sale.context}` : ""}
            </p>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {sale.lines.map((line) => (
                <li key={line.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0" }}>
                  <span>{line.label} × {line.units}</span>
                  <span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => posUpdateLine({ orderId: sale.orderId, lineId: line.id, units: line.units + 1 }))}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => posRemoveLine({ orderId: sale.orderId, lineId: line.id }))}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <p>{props.copy.discount}: {sale.discountCents}</p>
            <label>
              {props.copy.applyCode}
              <input value={promo} onChange={(e) => setPromo(e.target.value)} style={{ display: "block", minHeight: 44, width: "100%" }} />
            </label>
            <button
              type="button"
              disabled={busy}
              style={{ minHeight: 44, marginTop: 8 }}
              onClick={() => void run(() => posReprice({ orderId: sale.orderId, promoCode: promo }))}
            >
              {props.copy.applyCode}
            </button>
            <p>{props.copy.deposit}: {sale.depositPaidCents}</p>
            <p>{props.copy.outstanding}: {sale.outstandingCents}</p>
            <p>{props.copy.prep}: {sale.prepState}</p>
            <p>{props.copy.payment}: {sale.paymentState}</p>
            <p>{props.copy.contactHint}</p>
            <label>
              {props.copy.email}
              <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: "block", minHeight: 44, width: "100%" }} />
            </label>
            <label>
              {props.copy.phone}
              <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ display: "block", minHeight: 44, width: "100%" }} />
            </label>
            <label>
              {props.copy.amount}
              <input
                value={amount}
                placeholder={String(sale.outstandingCents)}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                style={{ display: "block", minHeight: 44, width: "100%" }}
              />
            </label>
            <label>
              {props.copy.tendered}
              <input
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                inputMode="numeric"
                style={{ display: "block", minHeight: 44, width: "100%" }}
              />
            </label>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                disabled={busy || sale.paymentState === "paid"}
                style={{ minHeight: 44 }}
                onClick={() => void run(() => collect("cash"))}
              >
                {props.copy.collectCash}
              </button>
              <button
                type="button"
                disabled={busy || sale.paymentState === "paid"}
                style={{ minHeight: 44 }}
                onClick={() => void run(() => collect("online_card"))}
              >
                {props.copy.collectCard}
              </button>
              <button
                type="button"
                disabled={busy}
                style={{ minHeight: 44 }}
                onClick={() =>
                  void run(async () => {
                    const r = await posSubmitPrep(sale.orderId);
                    if (!r.ok) setMsg("error" in r && r.error ? r.error : "unavailable");
                    return r;
                  })
                }
              >
                {props.copy.sendToPrep}
              </button>
              <button
                type="button"
                disabled={busy}
                style={{ minHeight: 44 }}
                onClick={() =>
                  void run(async () => {
                    const r = await posCancelSale(sale.orderId);
                    if (r.ok) router.push(`/${props.tenantSlug}/admin/pos`);
                    return r;
                  })
                }
              >
                {props.copy.cancel}
              </button>
            </div>
            {msg ? <p>{msg}</p> : null}
          </>
        )}
      </aside>
      </div>
    </div>
  );
}
