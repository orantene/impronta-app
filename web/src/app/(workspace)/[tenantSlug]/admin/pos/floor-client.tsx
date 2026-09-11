"use client";

/**
 * FloorClient: the Tables mode of the point of sale (`POSLiveFloor`,
 * `POSFloorTimeline`, `POSFloorList` and the sheets behind them). Mode id
 * `floor`; the switch and the settings card call it "Tables"; its rail is
 * Floor · Orders · Prep · Receipts · Issues.
 *
 * WHAT THIS IS. The counter's frame and header around the SAME board the
 * workspace's Live Floor draws (`components/admin/floor/FloorBoard`). Every
 * write the board makes goes through the workspace Spaces page's own server
 * actions (`../tables/actions`), the host stand's walk-in
 * (`../reservations/actions`), the counter's own kitchen send
 * (`posSubmitPrep`) and the till's staff reservation (`./floor-actions`).
 * No second engine, no second list of tables.
 *
 * THE CHECK IS THE COUNTER'S BASKET, reached with `?mode=counter&order=`:
 * the floor never grows a basket of its own. Receipts and Issues are the
 * counter's own screens and have no reader on this mode yet (D-POS-28,
 * D-POS-48): both rows open one sentence, never a blank.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FloorBoard } from "@/components/admin/floor/FloorBoard";
import { panelCounts } from "@/components/admin/floor/FloorSidePanel";
import { floorSubtitle } from "@/components/admin/floor/FloorViews";
import type { FloorActions, FloorBoardData } from "@/components/admin/floor/floor-types";
import { IssuesScreen, PosFrame, PosHeader, initialsOf, type IssuesCopy } from "@/components/admin/pos";
import { interpolate } from "@/i18n/interpolate";
import { venueHhmm } from "@/lib/spaces/venue-clock";

import { reservationsTakeWalkIn } from "../reservations/actions";
import { tablesCloseVisit, tablesMoveVisit, tablesResetTable, tablesSeatParty } from "../tables/actions";
import { posSubmitPrep } from "./actions";
import { floorCreateReservation, floorLoadReserveTimes } from "./floor-actions";
import type { FloorCopy } from "./floor-copy";
import { kitchenOutcome } from "./floor-kitchen";

export type FloorClientProps = {
  readonly workspaceName: string;
  /** This request's own `/…/admin/pos` path, so links keep the host shape. */
  readonly posPath: string;
  readonly workspacePath: string;
  readonly preparationPath: string;
  readonly cashierName: string;
  readonly drawerOpen: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorCopy;
  readonly issuesCopy: IssuesCopy;
  readonly receiptsCopy: { readonly title: string; readonly notWired: string };
};

type Destination = "tables" | "orders" | "receipts" | "issues";
type View = "floor" | "timeline" | "list";

const FLOOR_ACTIONS: FloorActions = {
  seatParty: (input) => tablesSeatParty(input),
  closeVisit: (input) => tablesCloseVisit(input),
  moveVisit: (input) => tablesMoveVisit(input),
  resetTable: (spaceId) => tablesResetTable(spaceId),
  sendToKitchen: async (orderId) => kitchenOutcome(await posSubmitPrep({ orderId, destination: "table" })),
  takeWalkIn: (input) => reservationsTakeWalkIn(input),
  loadReserveTimes: (input) => floorLoadReserveTimes(input),
  createReservation: (input) => floorCreateReservation(input),
};

export function FloorClient(props: FloorClientProps) {
  const { copy, data } = props;
  const router = useRouter();
  const [destination, setDestination] = useState<Destination>("tables");
  const [view, setView] = useState<View>("floor");

  const checkHref = (orderId: string) => `${props.posPath}?mode=counter&order=${encodeURIComponent(orderId)}`;
  const counts = useMemo(() => panelCounts(data), [data]);
  const openChecks = data.tables.filter((t) => t.state === "occupied" && t.orderId && !t.joinedFromSpaceId).length;

  const header =
    destination === "orders"
      ? { title: copy.board.titleOrders, subtitle: interpolate(copy.board.subtitleOrders, { n: openChecks }) }
      : destination === "issues"
        ? { title: props.issuesCopy.title, subtitle: props.issuesCopy.subtitle }
        : destination === "receipts"
          ? { title: props.receiptsCopy.title, subtitle: props.receiptsCopy.notWired }
          : view === "timeline"
            ? {
                title: copy.board.titleTimeline,
                subtitle: interpolate(copy.board.subtitleTimeline, {
                  service: data.service
                    ? interpolate(copy.board.service, {
                        label: data.service.label,
                        start: venueHhmm(data.service.startsAtIso, data.timeZone, data.locale),
                        end: venueHhmm(data.service.endsAtIso, data.timeZone, data.locale),
                      })
                    : copy.board.serviceNone,
                  time: venueHhmm(data.nowIso, data.timeZone, data.locale),
                }),
              }
            : { title: view === "list" ? copy.board.titleList : copy.board.title, subtitle: floorSubtitle(data, copy.board, counts.waiting) };

  const body =
    destination === "issues" ? (
      <IssuesScreen copy={props.issuesCopy} />
    ) : destination === "receipts" ? (
      <div className="p-6">
        <p className="m-0 max-w-[560px] rounded-[12px] bg-admin-surface-alt px-4 py-3 text-[14px] text-admin-ink-muted" data-floor-receipts-note>
          {props.receiptsCopy.notWired}
        </p>
      </div>
    ) : (
      <FloorBoard
        data={data}
        actions={FLOOR_ACTIONS}
        copy={copy.board}
        checkHref={checkHref}
        view={view}
        onViewChange={setView}
        ordersOnly={destination === "orders"}
      />
    );

  return (
    <div className="flex min-h-[calc(100vh-56px)] w-full flex-col" data-tulala-pos-chrome>
      <PosFrame
        mode="floor"
        navLabel={copy.board.railLabel}
        activeDestination={destination}
        onSelectDestination={(id) => {
          if (id === "prep") {
            router.push(props.preparationPath);
            return;
          }
          if (id === "tables" || id === "orders" || id === "receipts" || id === "issues") setDestination(id);
        }}
        destinationLabels={copy.board.rail}
        counts={{ orders: openChecks, prep: Object.keys(data.tickets).length }}
        modeLabel={copy.modeLabel}
        modeEyebrow={copy.chrome.modeEyebrow}
        lock={{ label: copy.chrome.lock, disabledReason: copy.chrome.lockUnavailable }}
        workspace={{ label: copy.chrome.workspace, href: props.workspacePath }}
        className="flex-1 rounded-none border-0"
      >
        <PosHeader
          title={header.title}
          subtitle={header.subtitle}
          location={props.workspaceName}
          cashier={{
            initials: initialsOf(props.cashierName || props.workspaceName),
            label: `${props.cashierName || props.workspaceName} · ${props.drawerOpen ? copy.chrome.drawerOpen : copy.chrome.drawerNone}`,
          }}
          cashierMenuLabel={copy.chrome.cashierMenu}
          portraitMenu={{
            label: copy.modeLabel,
            menuLabel: copy.board.railLabel,
            items: [
              { id: "tables", label: copy.board.rail.tables ?? "tables", onSelect: () => setDestination("tables") },
              { id: "orders", label: copy.board.rail.orders ?? "orders", onSelect: () => setDestination("orders") },
              { id: "prep", label: copy.board.rail.prep ?? "prep", onSelect: () => router.push(props.preparationPath) },
              { id: "workspace", label: copy.chrome.workspace, onSelect: () => router.push(props.workspacePath) },
            ],
          }}
          live={destination === "tables" ? copy.board.live : undefined}
        />
        <div className="relative flex min-h-0 flex-1 flex-col">{body}</div>
      </PosFrame>
    </div>
  );
}
