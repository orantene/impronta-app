"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export type PosCatalogSession = {
  id: string;
  title: string;
  startsAt: string;
};

export type PosCatalogItem = {
  id: string;
  title: string;
  amountCents: number;
  kind: string | null;
  sessions: PosCatalogSession[];
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

/** http://*.local is not a secure context, so `crypto.randomUUID` is missing. */
function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const tap: React.CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  borderRadius: 12,
  border: "1px solid rgba(24,24,27,0.12)",
  background: "#fff",
  padding: "0 14px",
  fontSize: 14,
  cursor: "pointer",
};

const tapPrimary: React.CSSProperties = {
  ...tap,
  background: "#111",
  color: "#fff",
  borderColor: "#111",
  fontWeight: 600,
};

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
    prepDestination: string;
    prepPickup: string;
    prepTable: string;
    prepCounter: string;
    prepPromisedAt: string;
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
    tables?: string;
    catalog?: string;
    preparation?: string;
    discounts?: string;
    sales?: string;
    workspace?: string;
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
  const [classByOffering, setClassByOffering] = useState<Record<string, string>>({});
  const [catalogQuery, setCatalogQuery] = useState("");
  const [prepDestination, setPrepDestination] = useState<"table" | "pickup" | "counter">("counter");
  const [promisedAtLocal, setPromisedAtLocal] = useState("");
  const sale = props.sale;
  const base = `/${props.tenantSlug}/admin`;

  function go(orderId: string) {
    const onAgencyAdmin =
      typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
    const posPath = onAgencyAdmin ? "/admin/pos" : `${base}/pos`;
    window.location.assign(`${posPath}?order=${encodeURIComponent(orderId)}`);
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
    if (amountCents == null || amountCents < 0) {
      return { ok: false as const, error: "amount" };
    }
    if (sale.outstandingCents > 0 && amountCents <= 0) {
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
      idempotencyKey: newIdempotencyKey(),
    });
    if (r.ok && method === "online_card" && "checkoutUrl" in r && r.checkoutUrl) {
      window.location.href = r.checkoutUrl;
    }
    return r;
  }

  const visibleCatalog = props.catalog.filter((item) => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return true;
    return item.title.toLowerCase().includes(q);
  });
  const changeCents =
    sale && parseCents(tendered, sale.outstandingCents) != null
      ? Math.max(0, (parseCents(tendered, sale.outstandingCents) ?? 0) - (parseCents(amount, sale.outstandingCents) ?? 0))
      : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <nav
        aria-label="POS"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        <Link href={`${base}/pos`} style={{ ...tap, display: "inline-flex", alignItems: "center" }} title={props.copy.newSale}>
          ⊕ {props.copy.newSale}
        </Link>
        <Link href={`${base}/menu`} style={{ ...tap, display: "inline-flex", alignItems: "center" }} title={props.copy.catalog ?? "Catalog"}>
          ⊞ {props.copy.catalog ?? "Catalog"}
        </Link>
        <Link href={`${base}/tables`} style={{ ...tap, display: "inline-flex", alignItems: "center" }} title={props.copy.tables ?? "Tables"}>
          ▦ {props.copy.tables ?? "Tables"}
        </Link>
        <Link href={`${base}/preparation`} style={{ ...tap, display: "inline-flex", alignItems: "center" }} title={props.copy.preparation ?? "Prep"}>
          🍳 {props.copy.preparation ?? "Prep"}
        </Link>
        <Link href={`${base}/discounts`} style={{ ...tap, display: "inline-flex", alignItems: "center" }} title={props.copy.discounts ?? "Discounts"}>
          % {props.copy.discounts ?? "Discounts"}
        </Link>
        <Link href={`${base}/sales`} style={{ ...tap, display: "inline-flex", alignItems: "center" }} title={props.copy.sales ?? "Sales"}>
          ▤ {props.copy.sales ?? "Sales"}
        </Link>
        <Link href={`${base}`} style={{ ...tap, display: "inline-flex", alignItems: "center" }} title={props.copy.workspace ?? "Workspace"}>
          ← {props.copy.workspace ?? "Workspace"}
        </Link>
      </nav>

      <section style={{ padding: 16, borderRadius: 16, background: "rgba(24,24,27,0.03)" }}>
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
                style={{ display: "block", minHeight: 44, width: 140, borderRadius: 10 }}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              style={tap}
              title={props.copy.shiftClose}
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
                style={{ display: "block", minHeight: 44, width: 140, borderRadius: 10 }}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              style={tap}
              title={props.copy.shiftOpen}
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

      <div
        style={{
          display: "grid",
          gap: 20,
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 400px)",
        }}
      >
        <section>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy}
              style={tapPrimary}
              title={props.copy.newSale}
              onClick={() => {
                void run(async () => {
                  const r = await posCreateDraft();
                  if (r.ok && "orderId" in r) go(r.orderId);
                  return r;
                });
              }}
            >
              ⊕ {props.copy.newSale}
            </button>
            <label style={{ flex: "1 1 180px" }}>
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>{props.copy.items}</span>
              <input
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder={props.copy.items}
                style={{ display: "block", minHeight: 44, width: "100%", borderRadius: 12, padding: "0 12px" }}
              />
            </label>
          </div>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>{props.copy.items}</h2>
          {visibleCatalog.length === 0 ? (
            <p>{props.copy.emptyCatalog}</p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 10,
              }}
            >
              {visibleCatalog.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={busy || !sale}
                    title={item.title}
                    onClick={() => {
                      if (!sale) return;
                      const sessionId =
                        item.sessions.length > 0
                          ? (classByOffering[item.id] ?? item.sessions[0]?.id ?? null)
                          : null;
                      void run(() =>
                        posAddLine({
                          orderId: sale.orderId,
                          offeringId: item.id,
                          units: 1,
                          sessionId,
                          expectedVersion: sale.version,
                        }),
                      );
                    }}
                    style={{
                      ...tap,
                      width: "100%",
                      minHeight: 72,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      padding: 12,
                      textAlign: "left",
                    }}
                  >
                    <strong>{item.title}</strong>
                    <span style={{ color: "rgba(11,11,13,0.55)" }}>{item.amountCents}</span>
                  </button>
                  {item.sessions.length > 0 ? (
                    <select
                      value={classByOffering[item.id] ?? item.sessions[0]?.id ?? ""}
                      onChange={(e) =>
                        setClassByOffering((cur) => ({ ...cur, [item.id]: e.target.value }))
                      }
                      style={{ minHeight: 44, width: "100%", marginTop: 6, borderRadius: 10 }}
                      title={item.sessions[0]?.title}
                    >
                      {item.sessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {session.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <h2 style={{ fontSize: 16, margin: "24px 0 8px" }}>{props.copy.openSales}</h2>
          {props.openSales.length === 0 ? (
            <p>{props.copy.emptyOpen}</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {props.openSales.map((row) => (
                <li key={row.id}>
                  <button type="button" style={tap} onClick={() => go(row.id)}>
                    {row.id.slice(0, 8)} · {row.totalCents}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside
          style={{
            border: "1px solid rgba(24,24,27,0.08)",
            borderRadius: 16,
            padding: 16,
            position: "sticky",
            top: 12,
            background: "#fff",
          }}
        >
          {!sale ? (
            <p>{props.copy.next}</p>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                {sale.customerId ? sale.customerId.slice(0, 8) : props.copy.guest}
                {sale.context ? ` · ${sale.context}` : ""}
              </p>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {sale.lines.map((line) => (
                  <li key={line.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", minHeight: 44, alignItems: "center" }}>
                    <span>{line.label} × {line.units}</span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        disabled={busy}
                        style={tap}
                        title="+"
                        onClick={() =>
                          void run(() =>
                            posUpdateLine({
                              orderId: sale.orderId,
                              lineId: line.id,
                              units: line.units + 1,
                              expectedVersion: sale.version,
                            }),
                          )
                        }
                      >
                        +
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        style={tap}
                        title="×"
                        onClick={() =>
                          void run(() =>
                            posRemoveLine({
                              orderId: sale.orderId,
                              lineId: line.id,
                              expectedVersion: sale.version,
                            }),
                          )
                        }
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
                <input value={promo} onChange={(e) => setPromo(e.target.value)} style={{ display: "block", minHeight: 44, width: "100%", borderRadius: 10 }} />
              </label>
              <button
                type="button"
                disabled={busy}
                style={{ ...tap, marginTop: 8 }}
                title={props.copy.applyCode}
                onClick={() =>
                  void run(() =>
                    posReprice({ orderId: sale.orderId, promoCode: promo, expectedVersion: sale.version }),
                  )
                }
              >
                {props.copy.applyCode}
              </button>
              <p>{props.copy.deposit}: {sale.depositPaidCents}</p>
              <p style={{ fontSize: 18, fontWeight: 600 }}>{props.copy.outstanding}: {sale.outstandingCents}</p>
              <p>{props.copy.prep}: {sale.prepState}</p>
              <label>
                {props.copy.prepDestination}
                <select
                  value={prepDestination}
                  onChange={(e) =>
                    setPrepDestination(e.target.value as "table" | "pickup" | "counter")
                  }
                  style={{ display: "block", minHeight: 44, width: "100%", borderRadius: 10 }}
                >
                  <option value="counter">{props.copy.prepCounter}</option>
                  <option value="table">{props.copy.prepTable}</option>
                  <option value="pickup">{props.copy.prepPickup}</option>
                </select>
              </label>
              {prepDestination === "pickup" ? (
                <label>
                  {props.copy.prepPromisedAt}
                  <input
                    type="datetime-local"
                    value={promisedAtLocal}
                    onChange={(e) => setPromisedAtLocal(e.target.value)}
                    style={{ display: "block", minHeight: 44, width: "100%", borderRadius: 10 }}
                  />
                </label>
              ) : null}
              <p>{props.copy.payment}: {sale.paymentState}</p>
              <p>{props.copy.contactHint}</p>
              <label>
                {props.copy.email}
                <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: "block", minHeight: 44, width: "100%", borderRadius: 10 }} />
              </label>
              <label>
                {props.copy.phone}
                <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ display: "block", minHeight: 44, width: "100%", borderRadius: 10 }} />
              </label>
              <label>
                {props.copy.amount}
                <input
                  value={amount}
                  placeholder={String(sale.outstandingCents)}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="numeric"
                  style={{ display: "block", minHeight: 44, width: "100%", borderRadius: 10 }}
                />
              </label>
              <label>
                {props.copy.tendered}
                <input
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  inputMode="numeric"
                  style={{ display: "block", minHeight: 44, width: "100%", borderRadius: 10 }}
                />
              </label>
              <p>{props.copy.change}: {changeCents}</p>
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  marginTop: 12,
                  position: "sticky",
                  bottom: 0,
                  background: "#fff",
                  paddingTop: 8,
                }}
              >
                <button
                  type="button"
                  disabled={busy || sale.paymentState === "paid"}
                  style={tapPrimary}
                  title={props.copy.collectCash}
                  onClick={() => void run(() => collect("cash"))}
                >
                  {props.copy.collectCash}
                </button>
                <button
                  type="button"
                  disabled={busy || sale.paymentState === "paid"}
                  style={tap}
                  title={props.copy.collectCard}
                  onClick={() => void run(() => collect("online_card"))}
                >
                  {props.copy.collectCard}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  style={tap}
                  title={props.copy.sendToPrep}
                  onClick={() =>
                    void run(async () => {
                      let promisedAt: string | null = null;
                      if (prepDestination === "pickup") {
                        const when = new Date(promisedAtLocal);
                        if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
                          return { ok: false as const, error: "pickup_window" };
                        }
                        promisedAt = when.toISOString();
                      }
                      const r = await posSubmitPrep({
                        orderId: sale.orderId,
                        destination: prepDestination,
                        promisedAt,
                      });
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
                  style={tap}
                  title={props.copy.cancel}
                  onClick={() =>
                    void run(async () => {
                      const r = await posCancelSale(sale.orderId, sale.version);
                      if (r.ok) router.push(`${base}/pos`);
                      return r;
                    })
                  }
                >
                  {props.copy.cancel}
                </button>
              </div>
              {msg ? <p role="alert">{msg}</p> : null}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
