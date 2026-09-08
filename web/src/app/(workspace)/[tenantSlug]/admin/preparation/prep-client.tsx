"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prepAcknowledge, prepHandoff, prepReady } from "./actions";
import type { PrepTicketView } from "@/lib/preparation/tickets";

export function PreparationClient(props: {
  tickets: PrepTicketView[];
  copy: {
    empty: string;
    acknowledge: string;
    ready: string;
    handoff: string;
    revision: string;
    destination: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setMsg("error" in r && r.error ? r.error : "unavailable");
    else router.refresh();
  }

  if (props.tickets.length === 0) return <p>{props.copy.empty}</p>;

  return (
    <div>
      {msg ? <p>{msg}</p> : null}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 16 }}>
        {props.tickets.map((ticket) => (
          <li
            key={ticket.id}
            style={{ border: "1px solid rgba(24,24,27,0.12)", borderRadius: 12, padding: 16 }}
          >
            <p style={{ margin: 0 }}>
              {ticket.station} · {props.copy.destination}: {ticket.destination} · {ticket.status}
              {ticket.revision > 1 ? ` · ${props.copy.revision} ${ticket.revision}` : ""}
              {ticket.promisedAt ? ` · ${ticket.promisedAt}` : ""}
              {ticket.destination === "pickup" && ticket.status === "ready" ? " · pickup" : ""}
            </p>
            <ul>
              {ticket.snapshotLines.map((line) => (
                <li key={line.id}>
                  {line.label} × {line.units}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ticket.status === "queued" ? (
                <button
                  type="button"
                  disabled={busy}
                  style={{ minHeight: 44 }}
                  onClick={() => void run(() => prepAcknowledge(ticket.id))}
                >
                  {props.copy.acknowledge}
                </button>
              ) : null}
              {ticket.status === "queued" || ticket.status === "acknowledged" ? (
                <button
                  type="button"
                  disabled={busy}
                  style={{ minHeight: 44 }}
                  onClick={() => void run(() => prepReady(ticket.id))}
                >
                  {props.copy.ready}
                </button>
              ) : null}
              {ticket.status === "ready" && !ticket.handedOffAt ? (
                <button
                  type="button"
                  disabled={busy}
                  style={{ minHeight: 44 }}
                  onClick={() => void run(() => prepHandoff(ticket.id))}
                >
                  {props.copy.handoff}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
