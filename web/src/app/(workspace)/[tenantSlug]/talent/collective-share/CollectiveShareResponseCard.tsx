"use client";

import { useState, useTransition } from "react";
import { respondToOwnerShare } from "@/lib/service-hub/friends-collective-actions";
import { COLLECTIVE_COPY } from "@/lib/service-hub/friends-collective-copy";

export type ShareProposal = { proposedAt: string; tenantId: string; workspaceName: string; preview: string };

function Row({ proposal, locale }: { proposal: ShareProposal; locale: "en" | "es" }) {
  const c = COLLECTIVE_COPY[locale];
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const answer = (accept: boolean) =>
    start(async () => {
      const r = await respondToOwnerShare({ tenantId: proposal.tenantId, accept, proposedAt: proposal.proposedAt });
      if (r.ok) setDone(true);
    });
  return (
    <div data-testid="share-proposal" style={{ padding: "14px 0", borderBottom: "1px solid rgba(24,24,27,0.08)" }}>
      <div style={{ fontWeight: 600 }}>{proposal.workspaceName}</div>
      <p style={{ margin: "6px 0 10px", lineHeight: 1.6 }}>{proposal.preview}</p>
      {done ? (
        <span role="status">{c.answered}</span>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" disabled={pending} onClick={() => answer(true)} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "var(--color-admin-brand)", color: "#fff", fontWeight: 600 }}>
            {c.accept}
          </button>
          <button type="button" disabled={pending} onClick={() => answer(false)} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid rgba(24,24,27,0.2)", background: "transparent", fontWeight: 600 }}>
            {c.decline}
          </button>
        </div>
      )}
    </div>
  );
}

export function CollectiveShareResponseCard({ locale, proposals }: { locale: "en" | "es"; proposals: ShareProposal[] }) {
  const c = COLLECTIVE_COPY[locale];
  if (proposals.length === 0) return <p style={{ opacity: 0.7 }}>{c.nothingPending}</p>;
  return (
    <div>
      {proposals.map((p) => (
        <Row key={p.tenantId} proposal={p} locale={locale} />
      ))}
    </div>
  );
}
