import "server-only";

/**
 * The Floor mode's server half: the same reads the workspace Spaces page
 * makes (`listFloor`, the venue's zone), plus the kitchen's active ticket per
 * open check so a card can say whether the food has been sent, seen, or is
 * ready. Rendered by `page.tsx` when `?mode=floor`; it owns no route of its
 * own.
 *
 * The kitchen read is `listBoard`, the exact reader the station board uses,
 * narrowed here to the orders on this floor. One more query than the Spaces
 * page makes, and the reason is the brief's own rule: a figure on the screen
 * must trace to rows read by the rule the workspace uses, and the workspace's
 * rule for "what is the kitchen doing with this check" is that board.
 */

import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { listBoard } from "@/lib/preparation/tickets";
import { logServerError } from "@/lib/server/safe-error";
import { venueZoneLabel } from "@/lib/spaces/venue-clock";
import { tenantTimezone } from "@/lib/spaces/venues";
import { listFloor } from "@/lib/visits/floor";

import type { FloorTicket } from "./floor-client";
import { floorCopy } from "./floor-copy";
import { FloorClient } from "./mode-clients";

type Admin = Parameters<typeof listFloor>[0];

export async function FloorScreen(props: {
  admin: Admin;
  tenantId: string;
  locale: string;
  workspaceName: string;
  posPath: string;
}) {
  const tr = await createTranslator(props.locale);
  const copy = floorCopy(tr);
  const [floor, timeZone, board] = await Promise.all([
    listFloor(props.admin, props.tenantId),
    tenantTimezone(props.tenantId),
    listBoard(props.admin, props.tenantId),
  ]);
  const zoneNote = interpolate(tr("dashboard.tables.timesInZone"), {
    zone: venueZoneLabel(timeZone, props.locale, new Date()),
  });

  if (!floor.ok) {
    return (
      <main className="flex min-h-[60vh] w-full flex-col gap-4 p-4">
        <h1 className="m-0 text-[18px] font-semibold text-foreground">{copy.title}</h1>
        <p className="m-0 text-sm text-destructive">{tr("dashboard.pos.floor.unavailable")}</p>
      </main>
    );
  }

  // A board that cannot be read is not a reason to hide the floor: the cards
  // then read "nothing sent yet", which is the honest fallback for a fact this
  // request could not establish. `listBoard` logs its own failure.
  const tickets: Record<string, FloorTicket> = {};
  if (board.ok) {
    const onFloor = new Set(
      floor.tables.map((t) => t.orderId).filter((id): id is string => typeof id === "string"),
    );
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
  const orderIds = [
    ...new Set(floor.tables.map((t) => t.orderId).filter((id): id is string => typeof id === "string")),
  ];
  if (orderIds.length > 0) {
    const read = await props.admin
      .from("orders")
      .select("id, currency")
      .eq("tenant_id", props.tenantId)
      .in("id", orderIds);
    if (read.error) logServerError("pos.floor.currency", read.error);
    const rows: Array<{ id: string; currency: string | null }> = read.data ?? [];
    for (const row of rows) {
      if (row.currency) currencies[row.id] = row.currency;
    }
  }

  return (
    <FloorClient
      workspaceName={props.workspaceName}
      posPath={props.posPath}
      locale={props.locale}
      timeZone={timeZone}
      zoneNote={zoneNote}
      tables={floor.tables}
      tickets={tickets}
      currencies={currencies}
      copy={copy}
    />
  );
}
