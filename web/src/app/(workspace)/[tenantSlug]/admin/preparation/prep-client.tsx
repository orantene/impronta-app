"use client";

/**
 * T26 — the kitchen station (`POSKitchen`, `K09_KitchenAmendment`).
 *
 * The board is the station's own screen: a header with the station's name,
 * the clock, how many tickets are preparing and queued, and the three tabs
 * Preparing · Queued · Ready; then one card per ticket with a timer counting
 * from the send, the lines with their quantities, a `New` pill on every line
 * this revision added, and ONE next action for the ticket's step: `Start`
 * (queued → acknowledged), `Mark ready`, `Confirm handoff`.
 *
 * `ticket.revision > 1` on a `queued` ticket is an AMENDMENT, not a first
 * send: `submitOrderToPreparation` (lib/preparation/tickets.ts) re-queues and
 * clears `acknowledged_at` on every amend, so the row looks identical to a
 * brand-new ticket except for the revision number. That is exactly the
 * ambiguity a station must not have to resolve by memory, so the card says
 * it in words ("Amended. Acknowledge again."), draws the lines that changed
 * with the `New` pill, and its action reads `Acknowledge change`. The
 * amendment is also the banner under the grid (K09), which `Got it` clears
 * on this screen only.
 *
 * THE CLOCK. Times print in the VENUE's zone (`lib/spaces/venue-clock.ts`).
 * The timers count from the server's read at render and tick on the client
 * inside an effect, never during render.
 */

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  POS_OUTLINE_ACTION,
  POS_PILL,
  POS_PILL_CORAL,
  POS_PILL_GREEN,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
  POS_SEGMENT,
  POS_SEGMENT_ACTIVE,
  POS_SEGMENT_IDLE,
  POS_SEGMENT_TRACK,
} from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import type { PrepTicketView } from "@/lib/preparation/tickets";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import { cn } from "@/lib/utils";

import { prepAcknowledge, prepHandoff, prepReady, type PrepActionResult, type PrepRefusalReason } from "./actions";

export type PreparationCopy = {
  empty: string;
  statusCancelled: string;
  acknowledge: string;
  acknowledgeChange: string;
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
  /** `#{n}` */
  orderRef: string;
  /** `{n} guests` */
  guests: string;
  lineNew: string;
  tabPreparing: string;
  tabQueued: string;
  tabReady: string;
  recall: string;
  recallReason: string;
  /** `{date} · {time} · {preparing} preparing · {queued} queued · {ready} ready` */
  subtitle: string;
  /** `Fired {time}` */
  fired: string;
  /** `{code} · amended · revision {n}` */
  amendmentBanner: string;
  gotIt: string;
  emptyTab: string;
  /**
   * One sentence per refusal the actions can return. A station board that
   * printed the code instead would put `invalid_state` in front of a cook.
   */
  refusal: Record<PrepRefusalReason, string>;
};

type Tab = "preparing" | "queued" | "ready";

const DESTINATION_KEY: Record<PrepTicketView["destination"], "destinationTable" | "destinationPickup" | "destinationCounter"> = {
  table: "destinationTable",
  pickup: "destinationPickup",
  counter: "destinationCounter",
};

/**
 * A refusal, as a sentence in the reader's language. An unknown code (a
 * server ahead of this bundle) reads as the generic sentence rather than as
 * the raw token, which is the failure this function exists to prevent.
 */
export function refusalText(copy: PreparationCopy, result: Extract<PrepActionResult, { ok: false }>): string {
  return copy.refusal[result.reason] ?? copy.refusal.unavailable;
}

/** `mm:ss` since an instant; never negative. */
export function elapsedLabel(fromIso: string | null, nowMs: number): string {
  if (!fromIso) return "--:--";
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return "--:--";
  const total = Math.max(0, Math.floor((nowMs - from) / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function tabOf(ticket: PrepTicketView): Tab {
  if (ticket.status === "ready") return "ready";
  if (ticket.status === "acknowledged") return "preparing";
  return "queued";
}

export function PreparationClient(props: {
  locale: string;
  /** The VENUE's IANA zone — see `lib/spaces/venue-clock.ts`. */
  timeZone: string;
  /** The zone as a sentence, built on the server (it reads a clock). */
  zoneNote: string;
  /** The server's clock at render, ISO; the timers count from it. */
  nowIso: string;
  tickets: PrepTicketView[];
  copy: PreparationCopy;
}) {
  const { copy, timeZone, locale } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // The first tab with something on it: a station opening the board sees
  // what just came in (queued) before what it is already cooking.
  const [tab, setTab] = useState<Tab>(() => {
    const open = props.tickets.filter((t) => t.status !== "cancelled" && !(t.status === "ready" && t.handedOffAt));
    if (open.some((t) => t.status === "queued")) return "queued";
    if (open.some((t) => t.status === "acknowledged")) return "preparing";
    return open.some((t) => t.status === "ready") ? "ready" : "queued";
  });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.parse(props.nowIso));

  // The timers tick on the client; the first paint is the server's read.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  async function run(fn: () => Promise<PrepActionResult>) {
    setBusy(true);
    setMsg(null);
    let r: PrepActionResult;
    try {
      r = await fn();
    } catch {
      // A crashed request is not a refusal the engine chose, but a cook
      // still needs a sentence and a working board, not a greyed button.
      r = { ok: false, reason: "unavailable" };
    } finally {
      setBusy(false);
    }
    if (!r.ok) setMsg(refusalText(copy, r));
    else router.refresh();
  }

  const live = props.tickets.filter((t) => t.status !== "cancelled" && !(t.status === "ready" && t.handedOffAt));
  const counts = { preparing: 0, queued: 0, ready: 0 };
  for (const t of live) counts[tabOf(t)] += 1;
  const shown = live.filter((t) => tabOf(t) === tab);
  const amendment = live.find((t) => t.status === "queued" && t.revision > 1 && `${t.id}:${t.revision}` !== dismissed) ?? null;

  const tabs: Array<[Tab, string]> = [
    ["preparing", copy.tabPreparing],
    ["queued", copy.tabQueued],
    ["ready", copy.tabReady],
  ];

  function card(ticket: PrepTicketView) {
    const isAmended = ticket.status === "queued" && ticket.revision > 1;
    const who = ticket.tableCode ?? interpolate(copy.orderRef, { n: ticket.orderId.slice(0, 4).toUpperCase() });
    const kind = copy[DESTINATION_KEY[ticket.destination]];
    const guests = ticket.partySize != null ? interpolate(copy.guests, { n: ticket.partySize }) : null;
    const since = ticket.status === "ready" ? ticket.readyAt : ticket.status === "acknowledged" ? ticket.acknowledgedAt : ticket.submittedAt;
    const long = ticket.status !== "ready" && ticket.submittedAt != null && nowMs - Date.parse(ticket.submittedAt) > 15 * 60_000;
    const topTone = isAmended || long ? "bg-admin-coral" : ticket.status === "acknowledged" ? "bg-admin-brand" : ticket.status === "ready" ? "bg-admin-success" : "bg-admin-amber";
    const footerPill =
      ticket.status === "ready"
        ? copy.statusReady
        : ticket.status === "acknowledged"
          ? copy.statusAcknowledged
          : ticket.submittedAt
            ? interpolate(copy.fired, { time: venueHhmm(ticket.submittedAt, timeZone, locale) })
            : copy.statusQueued;
    return (
      <li
        key={ticket.id}
        data-prep-ticket={ticket.id}
        data-prep-status={ticket.status}
        className="flex flex-col overflow-hidden rounded-[16px] border-[1.5px] border-admin-border bg-admin-card"
      >
        <i aria-hidden className={cn("block h-1.5 w-full", topTone)} />
        <div className="flex items-center gap-2.5 border-b border-admin-border-soft px-4 py-3">
          <strong className="text-[19px] font-semibold text-admin-ink">{who}</strong>
          <span className="min-w-0 flex-1 truncate text-[14px] text-admin-ink-muted">
            {kind}
            {guests ? ` · ${guests}` : ""}
          </span>
          <span
            data-prep-timer
            className={cn("font-mono text-[20px] font-semibold tabular-nums", isAmended || long ? "text-admin-coral" : ticket.status === "ready" ? "text-admin-success" : "text-admin-brand")}
          >
            {elapsedLabel(since, nowMs)}
          </span>
        </div>
        {isAmended && (
          <p className="m-0 flex items-center gap-2 border-b border-admin-border-soft bg-admin-coral-soft px-4 py-2 text-[13.5px] font-semibold text-admin-coral-deep">
            <AlertTriangle aria-hidden size={14} strokeWidth={1.75} />
            {copy.amended} {copy.revision} {ticket.revision}
          </p>
        )}
        {!isAmended && ticket.revision > 1 && (
          <p className="m-0 border-b border-admin-border-soft px-4 py-1.5 text-[12.5px] text-admin-ink-muted">
            {copy.revision} {ticket.revision}
          </p>
        )}
        <ul className="m-0 flex flex-1 list-none flex-col p-0">
          {ticket.snapshotLines.map((line) => (
            <li key={line.id} className="flex items-start gap-2.5 border-b border-admin-border-soft px-4 py-3 last:border-b-0">
              <span className="w-8 shrink-0 text-[18px] font-bold tabular-nums text-admin-ink">{line.units}×</span>
              <span className="min-w-0 flex-1 text-[17px] font-semibold text-admin-ink">{line.label}</span>
              {ticket.addedLineIds.includes(line.id) && ticket.status === "queued" && (
                <span className={cn(POS_PILL, POS_PILL_GREEN, "mt-1")}>{copy.lineNew}</span>
              )}
            </li>
          ))}
        </ul>
        {ticket.promisedAt && (
          <p className="m-0 px-4 pb-1 text-[12.5px] text-admin-ink-muted">
            {interpolate(copy.promisedBy, { time: venueHhmm(ticket.promisedAt, timeZone, locale) })}
          </p>
        )}
        <div className="flex items-center gap-3 border-t border-admin-border-soft px-4 py-3">
          <span className={cn(POS_PILL, isAmended ? POS_PILL_CORAL : ticket.status === "ready" ? POS_PILL_GREEN : "bg-admin-surface-alt text-admin-ink-muted")}>{footerPill}</span>
          <span className="flex-1" />
          {ticket.status === "queued" ? (
            <button
              type="button"
              disabled={busy}
              className={cn(isAmended ? POS_PRIMARY_ACTION : POS_OUTLINE_ACTION, "h-11 px-4 text-[15px]")}
              onClick={() => void run(() => prepAcknowledge(ticket.id))}
            >
              {isAmended ? copy.acknowledgeChange : copy.acknowledge}
            </button>
          ) : null}
          {ticket.status === "acknowledged" ? (
            <button type="button" disabled={busy} className={cn(POS_PRIMARY_ACTION, "h-11 px-4 text-[15px]")} onClick={() => void run(() => prepReady(ticket.id))}>
              {copy.ready}
            </button>
          ) : null}
          {ticket.status === "ready" && !ticket.handedOffAt ? (
            <button type="button" disabled={busy} className={cn(POS_PRIMARY_ACTION, "h-11 px-4 text-[15px]")} onClick={() => void run(() => prepHandoff(ticket.id))}>
              {copy.handoff}
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2.5 px-6 pb-3">
        <div role="tablist" className={POS_SEGMENT_TRACK}>
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} data-prep-tab={id} onClick={() => setTab(id)} className={cn(POS_SEGMENT, "px-4", tab === id ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}>
              {label} {counts[id]}
            </button>
          ))}
        </div>
        <button type="button" className={POS_SECONDARY_ACTION} disabled title={copy.recallReason}>
          {copy.recall}
        </button>
        <span className="basis-full text-[12.5px] text-admin-ink-muted">{copy.recallReason}</span>
      </div>
      {msg ? (
        <p role="alert" className="mx-6 mb-3 rounded-[12px] border-[1.5px] border-admin-red/40 bg-admin-critical-soft px-4 py-3 text-[14px] text-admin-red">
          {msg}
        </p>
      ) : null}
      {live.length === 0 ? (
        <p className="m-0 px-6 text-[15px] text-admin-ink-muted">{copy.empty}</p>
      ) : shown.length === 0 ? (
        <p className="m-0 px-6 text-[15px] text-admin-ink-muted">{copy.emptyTab}</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 px-6 p-0 md:grid-cols-2 xl:grid-cols-3">{shown.map(card)}</ul>
      )}
      <p className="m-0 px-6 pt-4 text-[12.5px] text-admin-ink-muted">{props.zoneNote}</p>
      {amendment && (
        <div role="status" data-prep-amendment className="mx-6 mt-4 flex items-center gap-3 rounded-[12px] border-[1.5px] border-admin-coral bg-admin-card px-4 py-3">
          <AlertTriangle aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-admin-coral-deep" />
          <p className="m-0 flex-1 text-[15px] font-semibold text-admin-coral-deep">
            {interpolate(copy.amendmentBanner, {
              code: amendment.tableCode ?? interpolate(copy.orderRef, { n: amendment.orderId.slice(0, 4).toUpperCase() }),
              n: amendment.revision,
            })}
          </p>
          <button type="button" className={POS_OUTLINE_ACTION} onClick={() => setDismissed(`${amendment.id}:${amendment.revision}`)}>
            {copy.gotIt}
          </button>
        </div>
      )}
    </div>
  );
}
