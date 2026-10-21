"use client";

import { useState, useTransition } from "react";

import { acceptMatchAsTalent } from "@/lib/match-me/match-me-actions";
import { MATCH_OFFERS_COPY } from "@/lib/match-me/match-me-copy";
import type { MatchOffer } from "@/lib/match-me/views";

export function MatchOffersList({ locale, offers }: { locale: "en" | "es"; offers: MatchOffer[] }) {
  const c = MATCH_OFFERS_COPY[locale];
  const [done, setDone] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const open = offers.filter((o) => !done[o.requestId]);
  if (open.length === 0 && Object.keys(done).length === 0) return <p>{c.empty}</p>;
  return (
    <div>
      {open.map((o) => (
        <div key={o.requestId} data-testid="match-offer" style={{ padding: "14px 0", borderBottom: "1px solid rgba(24,24,27,0.08)" }}>
          {o.workspaceName ? <div style={{ fontSize: 12.5, opacity: 0.7 }}>{c.from} {o.workspaceName}</div> : null}
          <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{o.description}</p>
          {o.zone ? <div style={{ fontSize: 12.5, opacity: 0.7 }}>{c.where}: {o.zone}</div> : null}
          <button
            type="button"
            disabled={pending}
            style={{ marginTop: 8, minHeight: 44, padding: "0 16px" }}
            onClick={() => start(async () => {
              const r = await acceptMatchAsTalent({ requestId: o.requestId });
              const text = r.ok ? c.accepted : r.reason === "already_taken" ? c.taken : r.reason === "forbidden" ? c.forbidden : r.reason === "closed" || r.reason === "not_offered" ? c.closed : r.reason === "off" ? c.off : c.error;
              setDone((d) => ({ ...d, [o.requestId]: text }));
            })}
          >{pending ? c.accepting : c.accept}</button>
        </div>
      ))}
      {Object.entries(done).map(([id, text]) => <p key={id} role="status">{text}</p>)}
    </div>
  );
}
