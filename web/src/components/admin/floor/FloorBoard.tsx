"use client";

/**
 * FloorBoard — the room, as the boards draw it (`POSLiveFloor`,
 * `POSFloorTimeline`, `POSFloorList`, `LiveFloor`): the Arriving / Waiting /
 * Seated column on the left, the legend and the Floor · Timeline · List
 * switch over the map, the map itself, and the `Walk-in · New reservation ·
 * Pause online bookings` bar under it. A tap on a table opens its card
 * (T04); the card's moves open the sheets and dialogs (T05, T07, T08, T12,
 * T13, T23, T24, R01).
 *
 * ONE ENGINE. Every write is a function the caller handed in (`actions`),
 * which is the same server action the workspace Spaces page calls; every
 * refusal comes back as a code and is said here as a sentence in the
 * reader's language (`floorRefusalText`), never raw. A request that throws
 * is said the same way and the controls come back.
 *
 * THE CLOCK is the server's (`data.nowIso`), printed in the venue's zone.
 * The board re-reads itself once a minute so a party's time keeps moving.
 */

import { CalendarDays, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";
import {
  POS_PRIMARY_ACTION,
  POS_REFUSAL_BANNER,
  POS_SECONDARY_ACTION,
  POS_SEGMENT,
  POS_SEGMENT_ACTIVE,
  POS_SEGMENT_IDLE,
  POS_SEGMENT_TRACK,
} from "../pos/pos-classes";

import { floorRefusalText } from "./floor-copy";
import { isWaiting, tableCode, type FloorBookEntry } from "./floor-model";
import type { FloorBoardProps, FloorOutcome } from "./floor-types";
import { FloorDialogsHost } from "./FloorDialogsHost";
import { FloorLegend, FloorList, FloorTiles, FloorTimeline } from "./FloorViews";
import { FloorSidePanel, type PanelTab } from "./FloorSidePanel";
import { TablePopover } from "./TablePopover";

export type FloorOverlay =
  | { kind: "none" }
  | { kind: "seat"; table: FloorTable | null; entry: FloorBookEntry | null }
  | { kind: "walk-in" }
  | { kind: "waiting" }
  | { kind: "move"; table: FloorTable }
  | { kind: "merge"; table: FloorTable }
  | { kind: "server"; table: FloorTable }
  | { kind: "split"; table: FloorTable }
  | { kind: "departed"; table: FloorTable }
  | { kind: "reset"; table: FloorTable }
  | { kind: "reservation" };

export function FloorBoard(props: FloorBoardProps) {
  const { data, copy, actions, view, ordersOnly } = props;
  const router = useRouter();
  const floorRef = useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = useState<PanelTab>("arriving");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  /** The floor area's box at the moment of the tap; the card stays inside it. */
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  const [overlay, setOverlay] = useState<FloorOverlay>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  const selected = selectedId ? (data.tables.find((t) => t.spaceId === selectedId) ?? null) : null;

  const run = useCallback(
    async (fn: () => Promise<FloorOutcome>): Promise<FloorOutcome> => {
      setBusy(true);
      setRefusal(null);
      setNotice(null);
      let r: FloorOutcome;
      try {
        r = await fn();
      } catch {
        r = { ok: false, reason: "unavailable" };
      } finally {
        setBusy(false);
      }
      if (!r.ok) {
        setRefusal(floorRefusalText(copy, r.reason));
      } else {
        if (r.reservationWarning) {
          setNotice(`${copy.notices.seatedNotMarked} ${floorRefusalText(copy, r.reservationWarning)}`);
        }
        router.refresh();
      }
      return r;
    },
    [copy, router],
  );

  const select = useCallback((table: FloorTable | null, at: DOMRect | null) => {
    // A tap on the tile that is already open CLOSES its card, so a host can
    // put the card away with the same finger.
    setSelectedId((current) => (table ? (current === table.spaceId ? null : table.spaceId) : null));
    setAnchor(at);
    setBounds(floorRef.current?.getBoundingClientRect() ?? null);
    setRefusal(null);
    setNotice(null);
  }, []);

  /** A row in the Seated list: light its tile and open its card there. */
  function pickTable(table: FloorTable) {
    const tile = floorRef.current?.querySelector<HTMLElement>(`[data-floor-table="${tableCode(table)}"] button`);
    setSelectedId(table.spaceId);
    setAnchor(tile ? tile.getBoundingClientRect() : null);
    setBounds(floorRef.current?.getBoundingClientRect() ?? null);
  }

  function pickEntry(entry: FloorBookEntry) {
    if (isWaiting(entry)) {
      setOverlay({ kind: "waiting" });
      return;
    }
    const table = entry.spaceCode ? (data.tables.find((t) => tableCode(t) === entry.spaceCode) ?? null) : null;
    setOverlay({ kind: "seat", table, entry });
  }

  async function seat(input: { spaceId: string; joinedSpaceId?: string; partySize: number; admissionId?: string }) {
    const r = await run(() => actions.seatParty(input));
    if (r.ok) {
      setOverlay({ kind: "none" });
      setSelectedId(null);
    }
  }

  async function sendToKitchen(table: FloorTable) {
    if (!table.orderId || !actions.sendToKitchen) return;
    const orderId = table.orderId;
    const send = actions.sendToKitchen;
    await run(async () => {
      const r = await send(orderId);
      if (r.ok && r.revision != null) {
        setNotice(interpolate(r.amended ? copy.notices.amendedInKitchen : copy.notices.sentToKitchen, { n: r.revision }));
      }
      return r;
    });
  }

  const close = useCallback(() => setOverlay({ kind: "none" }), []);
  const closeCard = useCallback(() => select(null, null), [select]);

  const viewButtons: Array<["floor" | "timeline" | "list", string]> = [
    ["floor", copy.views.floor],
    ["timeline", copy.views.timeline],
    ["list", copy.views.list],
  ];

  const viewProps = { data, copy, selectedId, onSelect: select, busy };
  const actionsBar = !ordersOnly && (
    <div className={cn("flex flex-wrap items-center gap-2.5", props.header ? "justify-end" : "justify-center pt-1")}>
      <button type="button" data-floor-walk-in className={cn(POS_PRIMARY_ACTION, "h-12 text-[15px]")} disabled={busy} onClick={() => setOverlay({ kind: "walk-in" })}>
        <Plus aria-hidden size={18} strokeWidth={1.75} />
        {copy.actions.walkIn}
      </button>
      <button
        type="button"
        data-floor-new-reservation
        className={POS_SECONDARY_ACTION}
        disabled={busy || !actions.createReservation || !data.bookable}
        title={!actions.createReservation || !data.bookable ? copy.refusal.no_offering_configured : undefined}
        onClick={() => setOverlay({ kind: "reservation" })}
      >
        <CalendarDays aria-hidden size={18} strokeWidth={1.75} />
        {copy.actions.newReservation}
      </button>
      <button type="button" className={POS_SECONDARY_ACTION} disabled title={copy.actions.pauseOnlineReason}>
        {copy.actions.pauseOnline}
      </button>
    </div>
  );
  const body = ordersOnly ? (
    <FloorList {...viewProps} ordersOnly />
  ) : view === "timeline" ? (
    <FloorTimeline {...viewProps} />
  ) : view === "list" ? (
    <FloorList {...viewProps} />
  ) : (
    <FloorTiles {...viewProps} />
  );

  const board = (
    <div data-floor-board className={cn("relative flex min-h-0 flex-1", props.className)}>
      {refusal && (
        <div role="alert" data-floor-refusal className={cn(POS_REFUSAL_BANNER, "absolute left-1/2 top-3 z-30 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 shadow-admin-hover")}>
          <p className="m-0 flex-1">{refusal}</p>
        </div>
      )}
      {notice && !refusal && (
        <p role="status" data-floor-notice className="absolute left-1/2 top-3 z-30 m-0 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 rounded-[12px] border-[1.5px] border-admin-border bg-admin-card px-4 py-3 text-[14px] text-admin-ink shadow-admin-hover">
          {notice}
        </p>
      )}
      {/* The column belongs to the map (`POSLiveFloor`); the timeline and the
          list run the full width, as their boards draw them. */}
      {view === "floor" && !ordersOnly && (
        <FloorSidePanel data={data} copy={copy} tab={tab} onTabChange={setTab} onPickEntry={pickEntry} onPickTable={pickTable} selectedId={selectedId} className="max-[900px]:hidden" />
      )}
      <div ref={floorRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 bg-admin-surface px-[22px] pb-3 pt-3">
        {!ordersOnly && (
          <div className="flex flex-wrap items-center gap-2.5">
            {view === "floor" && <FloorLegend copy={copy} />}
            <span className="flex-1" />
            <div role="tablist" className={POS_SEGMENT_TRACK}>
              {viewButtons.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={view === id} data-floor-view={id} onClick={() => props.onViewChange(id)} className={cn(POS_SEGMENT, "px-4", view === id ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {body}
        {!props.header && actionsBar}
        {selected && overlay.kind === "none" && (
          <TablePopover
            table={selected}
            data={data}
            copy={copy}
            anchor={anchor}
            bounds={bounds}
            busy={busy}
            checkHref={props.checkHref}
            hasKitchen={Boolean(actions.sendToKitchen)}
            onClose={closeCard}
            onSeat={() => setOverlay({ kind: "seat", table: selected, entry: null })}
            onMoveOrJoin={() => setOverlay({ kind: "move", table: selected })}
            onChangeServer={actions.changeServer ? () => setOverlay({ kind: "server", table: selected }) : undefined}
            onSplit={actions.splitCheck && actions.loadCheckLines ? () => setOverlay({ kind: "split", table: selected }) : undefined}
            onPartyLeft={() => setOverlay({ kind: "departed", table: selected })}
            onReset={() => setOverlay({ kind: "reset", table: selected })}
            onSendKitchen={() => void sendToKitchen(selected)}
          />
        )}
      </div>
      <FloorDialogsHost
        overlay={overlay}
        data={data}
        copy={copy}
        actions={actions}
        busy={busy}
        run={run}
        checkHref={props.checkHref}
        onClose={close}
        onSeat={seat}
        onOpenWalkIn={() => setOverlay({ kind: "walk-in" })}
        onSeatEntry={(entry) => setOverlay({ kind: "seat", table: null, entry })}
        onSelect={(spaceId) => {
          setSelectedId(spaceId);
          setAnchor(null);
        }}
        onNotice={setNotice}
        onOpenMerge={(table) => setOverlay({ kind: "merge", table })}
        onOpenMove={(table) => setOverlay({ kind: "move", table })}
      />
    </div>
  );

  if (!props.header) return board;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-4 px-7 pb-4 pt-6">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em] text-admin-ink">{props.header.title}</h1>
          <p className="m-0 mt-1 text-[14px] text-admin-ink-muted">{props.header.subtitle}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-admin-success">
          <i aria-hidden className="inline-block h-2 w-2 rounded-full bg-admin-success" />
          {copy.live}
        </span>
        {actionsBar}
      </div>
      {board}
    </div>
  );
}
