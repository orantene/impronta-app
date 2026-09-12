import "server-only";

/**
 * The Floor mode's server half: the same reads the workspace Spaces page
 * and the host stand make (`listFloor`, `loadHostStand`, the venue's zone),
 * plus the kitchen's active ticket per open check so a card can say whether
 * the food has been sent, seen, or is ready. Rendered by `page.tsx` when
 * `?mode=floor`; it owns no route of its own.
 *
 * The kitchen read is `listBoard`, the exact reader the station board uses,
 * narrowed here to the orders on this floor. The book is `loadHostStand`,
 * the exact reader the Reservations destination uses, so the Arriving list
 * on the till and the one on the host stand cannot disagree.
 */

import { createTranslator } from "@/i18n/messages";
import { listBoard } from "@/lib/preparation/tickets";
import { logServerError } from "@/lib/server/safe-error";
import { listPosStaff } from "@/lib/pos/staff";
import { tenantTimezone } from "@/lib/spaces/venues";
import { listFloor } from "@/lib/visits/floor";
import { partyWaitlistList } from "@/lib/venues/party-waitlist";
import { layoutsList } from "@/lib/venues/layouts";
import { issuesCopy } from "@/components/admin/pos/pos-copy";

import type { FloorBoardData } from "@/components/admin/floor/floor-types";
import { loadFloorBook } from "../reservations/floor-book";
import { floorCopy } from "./floor-copy";
import { FloorClient } from "./mode-clients";

type Admin = Parameters<typeof listFloor>[0];

/**
 * Everything the board draws, read once. Shared with the workspace's Live
 * Floor (`admin/reservations/page.tsx`), which mounts the same board in the
 * admin shell.
 */
export async function loadFloorBoardData(
  admin: Admin,
  tenantId: string,
  locale: string,
): Promise<{ ok: true; data: FloorBoardData } | { ok: false }> {
  const now = new Date();
  const [floor, timeZone, board, book, waitlist, layouts, staff] = await Promise.all([
    listFloor(admin, tenantId),
    tenantTimezone(tenantId),
    listBoard(admin, tenantId),
    loadFloorBook(tenantId, now),
    partyWaitlistList(admin, { tenantId }),
    layoutsList(admin, { tenantId }),
    // T17: the people a table can be given to. A failed read leaves the
    // change-server sheet saying nobody is listed, never a blank tile.
    listPosStaff(admin, tenantId),
  ]);
  if (!floor.ok) return { ok: false };

  let tables = floor.tables;
  let layoutCanvas: { w: number; h: number } | null = null;
  if (layouts.ok) {
    const active = layouts.layouts.find((row) => row.isActive) ?? null;
    if (active) {
      layoutCanvas = active.canvas;
      const bySpace = new Map(layouts.items.filter((item) => item.layoutId === active.id).map((item) => [item.spaceId, item]));
      tables = floor.tables.map((table) => {
        const item = bySpace.get(table.spaceId);
        return item ? { ...table, layoutRect: { x: item.x, y: item.y, w: item.w, h: item.h, shape: item.shape } } : table;
      });
    }
  }

  // A board that cannot be read is not a reason to hide the floor: the cards
  // then read "nothing sent yet", which is the honest fallback for a fact this
  // request could not establish. `listBoard` logs its own failure.
  const tickets: Record<string, FloorBoardData["tickets"][string]> = {};
  if (board.ok) {
    const onFloor = new Set(floor.tables.map((t) => t.orderId).filter((id): id is string => typeof id === "string"));
    for (const ticket of board.tickets) {
      if (!onFloor.has(ticket.orderId)) continue;
      if (ticket.status === "cancelled") continue;
      tickets[ticket.orderId] = { status: ticket.status, revision: ticket.revision };
    }
  }

  // Each check's OWN currency, read off its order row. A total is minor
  // units of whatever the order was priced in, and printing ARS minor units
  // under a dollar sign is the defect the money notes warn about; the counter
  // reads the same column for the same reason. A failed read leaves the map
  // empty and the client falls back to the counter's default, USD.
  const currencies: Record<string, string> = {};
  const orderIds = [...new Set(floor.tables.flatMap((t) => t.orderIds))];
  if (orderIds.length > 0) {
    const read = await admin.from("orders").select("id, currency").eq("tenant_id", tenantId).in("id", orderIds);
    if (read.error) logServerError("pos.floor.currency", read.error);
    const rows: Array<{ id: string; currency: string | null }> = read.data ?? [];
    for (const row of rows) {
      if (row.currency) currencies[row.id] = row.currency;
    }
  }

  return {
    ok: true,
    data: {
      locale,
      timeZone,
      nowIso: now.toISOString(),
      service: book.service,
      defaultTurnMinutes: book.defaultTurnMinutes,
      tables,
      layoutCanvas,
      book: book.entries,
      partyWaitlist: waitlist.ok ? waitlist.rows : [],
      tickets,
      currencies,
      walkinsEnabled: book.walkinsEnabled,
      waitlistEnabled: book.waitlistEnabled,
      bookable: book.bookable,
      servers: staff.ok ? staff.staff.filter((p) => p.name).map((p) => ({ userId: p.userId, name: p.name })) : [],
    },
  };
}

export async function FloorScreen(props: {
  admin: Admin;
  tenantId: string;
  locale: string;
  workspaceName: string;
  locationName?: string;
  posPath: string;
  cashierName: string;
  drawerOpen: boolean;
  /** The Messages inbox's unread count for the rail badge (seam 10). */
  messagesUnread: number;
}) {
  const tr = await createTranslator(props.locale);
  const copy = floorCopy(tr);
  const loaded = await loadFloorBoardData(props.admin, props.tenantId, props.locale);

  if (!loaded.ok) {
    return (
      <main className="flex min-h-[60vh] w-full flex-col gap-4 p-4">
        <h1 className="m-0 text-[18px] font-semibold text-admin-ink">{copy.board.title}</h1>
        <p className="m-0 text-sm text-admin-red">{tr("dashboard.pos.floor.unavailable")}</p>
      </main>
    );
  }

  const workspacePath = props.posPath.replace(/\/pos$/, "");
  return (
    <FloorClient
      workspaceName={props.workspaceName}
      locationName={props.locationName}
      posPath={props.posPath}
      workspacePath={workspacePath}
      preparationPath={`${workspacePath}/preparation`}
      cashierName={props.cashierName}
      drawerOpen={props.drawerOpen}
      messagesUnread={props.messagesUnread}
      data={loaded.data}
      copy={copy}
      issuesCopy={issuesCopy(tr)}
      receiptsCopy={{ title: tr("dashboard.pos.counter.rail.receipts"), notWired: tr("dashboard.pos.floor.board.receiptsNotWired") }}
    />
  );
}
