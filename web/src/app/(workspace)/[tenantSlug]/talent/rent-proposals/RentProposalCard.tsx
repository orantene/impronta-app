"use client";

import { useState, useTransition } from "react";
import { memberEndRentPlan, respondRentPlan } from "@/lib/service-hub/rent/rent-actions";
import { RENT_COPY } from "@/lib/service-hub/rent/rent-copy";

export type RentProposal = { id: string; status: string; workspaceName: string; monthlyRentCents: number; percentBps: number; currency: string; startsOn: string };

function money(cents: number, currency: string, locale: "en" | "es"): string {
  try {
    return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function RentProposalCard({ locale, proposals }: { locale: "en" | "es"; proposals: RentProposal[] }) {
  const c = RENT_COPY[locale];
  const [done, setDone] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const open = proposals.filter((p) => !done[p.id]);
  if (open.length === 0 && Object.keys(done).length === 0) return <p>{c.proposalEmpty}</p>;
  return (
    <div>
      {open.map((p) => (
        <div key={p.id} data-testid="rent-proposal" style={{ padding: "14px 0", borderBottom: "1px solid rgba(24,24,27,0.08)" }}>
          <div style={{ fontWeight: 600 }}>{p.workspaceName}</div>
          <div style={{ fontSize: 15, margin: "4px 0" }}>{p.monthlyRentCents > 0 ? `${money(p.monthlyRentCents, p.currency, locale)} ${c.perMonth}` : ""}{p.monthlyRentCents > 0 && p.percentBps > 0 ? " + " : ""}{p.percentBps > 0 ? `${p.percentBps / 100}% ${c.ofSales}` : ""}</div>
          <div style={{ fontSize: 12.5, opacity: 0.7 }}>{c.startsOn} {p.startsOn}</div>
          <p style={{ fontSize: 12.5, opacity: 0.75 }}>{c.safetyNote}</p>
          {p.status !== "proposed" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={pending} onClick={() => start(async () => {
                const r = await memberEndRentPlan({ planId: p.id });
                setDone((d) => ({ ...d, [p.id]: r.ok ? c.saved : c.unavailable }));
              })}>{c.endMine}</button>
            </div>
          ) : (
          <div style={{ display: "flex", gap: 8 }}>
            {(["accept", "decline"] as const).map((k) => (
              <button
                key={k}
                type="button"
                disabled={pending}
                onClick={() => start(async () => {
                  const r = await respondRentPlan({ planId: p.id, accept: k === "accept", seenAmountCents: p.monthlyRentCents, seenPercentBps: p.percentBps });
                  setDone((d) => ({ ...d, [p.id]: r.ok ? c.saved : c.unavailable }));
                })}
              >{c[k]}</button>
            ))}
          </div>
          )}
        </div>
      ))}
      {Object.entries(done).map(([id, text]) => <p key={id} role="status">{text}</p>)}
    </div>
  );
}
