"use client";

/**
 * T26 — kitchen/pickup station board.
 *
 * `ticket.revision > 1` on a `queued` ticket is an AMENDMENT, not a first
 * send: `submitOrderToPreparation` (lib/preparation/tickets.ts) re-queues and
 * clears `acknowledged_at` on every amend, so the row looks identical to a
 * brand-new ticket except for the revision number. That is exactly the
 * ambiguity a station must not have to resolve by memory, so this screen
 * says it in words, "Amended. Acknowledge again.", rather than leaving the
 * station to notice a number went from 1 to 2.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prepAcknowledge, prepHandoff, prepReady } from "./actions";
import type { PrepTicketView } from "@/lib/preparation/tickets";
import { interpolate } from "@/i18n/interpolate";

export type PreparationCopy = {
  empty: string;
  acknowledge: string;
  ready: string;
  handoff: string;
  revision: string;
  destination: string;
  destinationTable: string;
  destinationPickup: string;
  destinationCounter: string;
  statusQueued: string;
  statusAcknowledged: string;
  statusReady: string;
  amended: string;
  handedOff: string;
  promisedBy: string;
};

const DESTINATION_KEY: Record<PrepTicketView["destination"], keyof PreparationCopy> = {
  table: "destinationTable",
  pickup: "destinationPickup",
  counter: "destinationCounter",
};

const STATUS_KEY: Record<Exclude<PrepTicketView["status"], "cancelled">, keyof PreparationCopy> = {
  queued: "statusQueued",
  acknowledged: "statusAcknowledged",
  ready: "statusReady",
};

function hhmm(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "--:--";
  }
}

export function PreparationClient(props: { locale: string; tickets: PrepTicketView[]; copy: PreparationCopy }) {
  const { copy } = props;
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

  if (props.tickets.length === 0) return <p className="text-sm text-muted-foreground">{copy.empty}</p>;

  return (
    <div>
      {msg ? (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {msg}
        </p>
      ) : null}
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {props.tickets.map((ticket) => {
          const isAmended = ticket.status === "queued" && ticket.revision > 1;
          return (
            <li key={ticket.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span className="font-medium">{ticket.station}</span>
                <span className="text-muted-foreground">
                  · {copy.destination}: {copy[DESTINATION_KEY[ticket.destination]]}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    isAmended
                      ? "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {ticket.status === "cancelled" ? ticket.status : copy[STATUS_KEY[ticket.status]]}
                </span>
                {ticket.revision > 1 ? (
                  <span className="text-xs text-muted-foreground">
                    {copy.revision} {ticket.revision}
                  </span>
                ) : null}
              </div>
              {isAmended ? <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">{copy.amended}</p> : null}
              {ticket.promisedAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {interpolate(copy.promisedBy, { time: hhmm(ticket.promisedAt, props.locale) })}
                </p>
              ) : null}
              {ticket.handedOffAt ? <p className="mt-1 text-xs text-muted-foreground">{copy.handedOff}</p> : null}

              <ul className="mt-2 list-none space-y-0.5 p-0 text-sm text-foreground">
                {ticket.snapshotLines.map((line) => (
                  <li key={line.id}>
                    {line.label} × {line.units}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap gap-2">
                {ticket.status === "queued" ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="min-h-11 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
                    onClick={() => void run(() => prepAcknowledge(ticket.id))}
                  >
                    {copy.acknowledge}
                  </button>
                ) : null}
                {ticket.status === "queued" || ticket.status === "acknowledged" ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:bg-accent disabled:opacity-40"
                    onClick={() => void run(() => prepReady(ticket.id))}
                  >
                    {copy.ready}
                  </button>
                ) : null}
                {ticket.status === "ready" && !ticket.handedOffAt ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:bg-accent disabled:opacity-40"
                    onClick={() => void run(() => prepHandoff(ticket.id))}
                  >
                    {copy.handoff}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
