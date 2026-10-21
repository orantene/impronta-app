"use client";

/**
 * Station rent card (TUL-1376): propose a monthly rent to a member, issue each month's rent
 * (one payment link per month, same link on a repeat), pause/end, and the read-only safety view.
 * The server actions enforce owner-only, the test-mode gate and member consent.
 */
import { useState, useTransition } from "react";
import { issueRent, proposeRentPlan, setRentPlanStatus } from "@/lib/service-hub/rent/rent-actions";
import { RENT_COPY, rentRefusalText } from "@/lib/service-hub/rent/rent-copy";
import type { SafetyRow } from "@/lib/service-hub/rent/rent-safety-view";

export type RentMember = { talentProfileId: string; name: string };
export type RentPlanView = {
  id: string;
  name: string;
  monthlyRentCents: number;
  currency: string;
  status: string;
  endedBy: string | null;
  /** The latest month's invoice and what its payment link is doing. */
  invoice: { period: string; state: "none" | "waiting" | "paid" | "needs_new_link" } | null;
};

const field = { padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(24,24,27,0.15)" } as const;
const primary = { padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--color-admin-brand)", color: "#fff", fontWeight: 600 } as const;

function money(cents: number, currency: string, locale: "en" | "es"): string {
  try {
    return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function RentCard({ locale, gate, plans, members, safety }: { locale: "en" | "es"; gate: "on" | "disabled" | "not_test_mode"; plans: RentPlanView[]; members: RentMember[]; safety: SafetyRow[] }) {
  const c = RENT_COPY[locale];
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [talent, setTalent] = useState(members[0]?.talentProfileId ?? "");
  const [rent, setRent] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [startsOn, setStartsOn] = useState(new Date().toISOString().slice(0, 10));

  if (gate !== "on") {
    return (
      <section>
        <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>{c.title}</h1>
        <p role="note">{gate === "disabled" ? c.off : c.notTest}</p>
      </section>
    );
  }

  const run = (fn: () => Promise<{ ok: boolean; reason?: string }>, okText: string) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.reason === "owner_only" ? c.ownerOnly : rentRefusalText(r.reason ?? "", c) });
    });
  };

  return (
    <section>
      <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>{c.title}</h1>
      <p style={{ fontSize: 13.5, opacity: 0.75 }}>{c.intro}</p>
      <p role="note" style={{ fontSize: 12.5, color: "var(--color-admin-red)" }}>{c.testOnly}</p>

      {plans.map((p) => (
        <div key={p.id} data-testid="rent-plan-row" style={{ padding: "12px 0", borderBottom: "1px solid rgba(24,24,27,0.08)" }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {p.name} · {money(p.monthlyRentCents, p.currency, locale)} {c.perMonth}
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 2 }}>
            {p.status === "proposed" ? c.waiting : p.status === "active" ? c.active : p.status === "paused" ? c.paused : p.status === "declined" ? c.declinedByMember : p.endedBy === "member" ? c.endedByMember : c.endedByOwner}
          </div>
          {p.invoice && (p.status === "active" || p.status === "paused") && (
            <div data-testid="rent-invoice-state" style={{ fontSize: 12.5, marginTop: 4, color: p.invoice.state === "needs_new_link" ? "var(--color-admin-red)" : "inherit" }}>
              {p.invoice.period} · {p.invoice.state === "paid" ? c.paid : p.invoice.state === "waiting" ? c.linkWaiting : p.invoice.state === "needs_new_link" ? c.linkNew : ""}
              {p.invoice.state === "needs_new_link" && (
                <button type="button" disabled={pending} style={{ marginLeft: 8 }} onClick={() => start(async () => {
                  setMsg(null);
                  const r = await issueRent({ planId: p.id, period: p.invoice!.period });
                  if (r.ok) { setLink(r.url); setMsg({ ok: true, text: c.copyLink }); }
                  else setMsg({ ok: false, text: rentRefusalText(r.reason, c) });
                })}>{c.sendNewLink}</button>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {p.status === "active" && (
              <button type="button" disabled={pending} style={primary} onClick={() => start(async () => {
                setMsg(null);
                const r = await issueRent({ planId: p.id });
                if (r.ok) { setLink(r.url); setMsg({ ok: true, text: r.already ? c.already : c.copyLink }); }
                else setMsg({ ok: false, text: rentRefusalText(r.reason, c) });
              })}>{c.issue}</button>
            )}
            {p.status === "active" && <button type="button" disabled={pending} onClick={() => run(() => setRentPlanStatus({ planId: p.id, status: "paused" }), c.saved)}>{c.pause}</button>}
            {p.status === "paused" && <button type="button" disabled={pending} onClick={() => run(() => setRentPlanStatus({ planId: p.id, status: "active" }), c.saved)}>{c.resume}</button>}
            {(p.status === "active" || p.status === "paused" || p.status === "proposed") && <button type="button" disabled={pending} onClick={() => run(() => setRentPlanStatus({ planId: p.id, status: "ended" }), c.saved)}>{c.end}</button>}
          </div>
        </div>
      ))}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 16 }}>
        <select value={talent} onChange={(e) => setTalent(e.target.value)} aria-label={c.member} style={field}>
          {members.map((m) => <option key={m.talentProfileId} value={m.talentProfileId}>{m.name}</option>)}
        </select>
        <input type="number" min={1} step={1} value={rent} onChange={(e) => setRent(e.target.value)} aria-label={c.rent} placeholder={c.rent} style={{ ...field, width: 120 }} />
        <input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} aria-label={c.currency} style={{ ...field, width: 64, textTransform: "uppercase" }} />
        <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} aria-label={c.startsOn} style={field} />
        <button type="button" disabled={pending || !talent} style={primary} onClick={() => run(() => proposeRentPlan({ talentProfileId: talent, monthlyRentCents: Math.round(Number(rent) * 100), currency, startsOn }), c.saved)}>{c.propose}</button>
      </div>

      {msg && <p role="status" style={{ fontSize: 13, color: msg.ok ? "var(--color-admin-green)" : "var(--color-admin-red)" }}>{msg.text}{link && msg.ok ? <> <a href={link}>{link}</a></> : null}</p>}

      <h2 style={{ fontSize: 17, margin: "28px 0 6px" }}>{c.safetyTitle}</h2>
      <p style={{ fontSize: 13, opacity: 0.7 }}>{c.safetyIntro}</p>
      {safety.length === 0 ? (
        <p style={{ fontSize: 13 }}>{c.safetyEmpty}</p>
      ) : (
        <ul data-testid="rent-safety-list" style={{ listStyle: "none", padding: 0 }}>
          {safety.map((s) => (
            <li key={s.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(24,24,27,0.08)", fontSize: 13.5 }}>
              <strong>{s.memberName}</strong> · {new Date(s.startsAt).toLocaleString(locale === "es" ? "es-MX" : "en-US", { dateStyle: "medium", timeStyle: "short" })}
              {s.title ? ` · ${s.title}` : ""}{s.clientLabel ? ` · ${s.clientLabel}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
