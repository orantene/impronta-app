/**
 * Renders the floor and the station board to static markup and prints it.
 *
 * A SEPARATE PROCESS IS THE POINT. `venue-clock.render.test.tsx` runs this
 * file under two different `TZ` values and requires byte-identical output.
 * It cannot do that in-process: Node resolves the default Intl timezone once,
 * at startup, so assigning `process.env.TZ` inside a test proves nothing —
 * which is precisely how a screen can go on formatting in the server's zone
 * while a green test says otherwise.
 *
 * NOT a `*.test.tsx` file, deliberately: the lane globs must not pick it up as
 * a suite with no tests in it.
 *
 * Usage:  RESTAURANT_RENDER_PROBE=1 TZ=<zone> tsx src/lib/visits/restaurant-render-probe.tsx <locale>
 */

import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { createTranslator } from "@/i18n/messages";
import { TablesClient } from "@/app/(workspace)/[tenantSlug]/admin/tables/tables-client";
import { tablesCopy } from "@/app/(workspace)/[tenantSlug]/admin/tables/tables-copy";
import { PreparationClient } from "@/app/(workspace)/[tenantSlug]/admin/preparation/prep-client";
import { preparationCopy } from "@/app/(workspace)/[tenantSlug]/admin/preparation/prep-copy";
import type { FloorTable } from "@/lib/visits/floor";
import type { PrepTicketView } from "@/lib/preparation/tickets";

/** The venue is in Mexico City. The host process is deliberately not. */
export const PROBE_TIME_ZONE = "America/Mexico_City";
/** 2026-09-11T02:00:00Z is 20:00 the previous evening in Mexico City. */
export const PROBE_DUE_ISO = "2026-09-11T02:00:00.000Z";
/** 2026-09-11T01:30:00Z is 19:30 in Mexico City. */
export const PROBE_ARRIVING_ISO = "2026-09-11T01:30:00.000Z";
/** 2026-09-11T00:45:00Z is 18:45 in Mexico City. */
export const PROBE_VACATED_ISO = "2026-09-11T00:45:00.000Z";
/** 2026-09-11T03:15:00Z is 21:15 in Mexico City. */
export const PROBE_PROMISED_ISO = "2026-09-11T03:15:00.000Z";

export const PROBE_TABLES: FloorTable[] = [
  {
    spaceId: "00000000-0000-4000-8000-000000000001",
    name: "Table 1",
    code: "T1",
    kind: "table",
    minSpendCents: 0,
    partyMin: 1,
    partyMax: 4,
    visitId: "00000000-0000-4000-8000-0000000000a1",
    visitVersion: 1,
    publicToken: "tok",
    orderId: "00000000-0000-4000-8000-0000000000b1",
    orderTotalCents: 0,
    remainingMinSpendCents: 0,
    serviceKind: "table",
    state: "occupied",
    partySize: 2,
    elapsedMinutes: 30,
    turnMinutes: 90,
    dueAtIso: PROBE_DUE_ISO,
    overdue: false,
    joinedWithSpaceId: null,
    joinedFromSpaceId: null,
    held: null,
    combinableWith: [],
    needsResetSinceIso: null,
  },
  {
    spaceId: "00000000-0000-4000-8000-000000000002",
    name: "Bar 1",
    code: "BAR1",
    kind: "table",
    minSpendCents: 0,
    partyMin: 1,
    partyMax: 2,
    visitId: "00000000-0000-4000-8000-0000000000a2",
    visitVersion: 1,
    publicToken: "tok2",
    orderId: null,
    orderTotalCents: 0,
    remainingMinSpendCents: 0,
    serviceKind: "tab",
    state: "occupied",
    partySize: null,
    elapsedMinutes: 12,
    turnMinutes: null,
    dueAtIso: null,
    overdue: false,
    joinedWithSpaceId: null,
    joinedFromSpaceId: null,
    held: null,
    combinableWith: [],
    needsResetSinceIso: null,
  },
  {
    spaceId: "00000000-0000-4000-8000-000000000003",
    name: "Table 3",
    code: "T3",
    kind: "table",
    minSpendCents: 0,
    partyMin: 1,
    partyMax: 2,
    visitId: null,
    visitVersion: null,
    publicToken: null,
    orderId: null,
    orderTotalCents: 0,
    remainingMinSpendCents: 0,
    serviceKind: "table",
    state: "held",
    partySize: null,
    elapsedMinutes: null,
    turnMinutes: null,
    dueAtIso: null,
    overdue: false,
    joinedWithSpaceId: null,
    joinedFromSpaceId: null,
    held: {
      admissionId: "00000000-0000-4000-8000-0000000000c1",
      holderName: "Ana Ruiz",
      partySize: 2,
      startsAtIso: PROBE_ARRIVING_ISO,
      late: false,
    },
    combinableWith: [],
    needsResetSinceIso: null,
  },
  {
    spaceId: "00000000-0000-4000-8000-000000000004",
    name: "Table 4",
    code: "T4",
    kind: "table",
    minSpendCents: 0,
    partyMin: 1,
    partyMax: 4,
    visitId: null,
    visitVersion: null,
    publicToken: null,
    orderId: null,
    orderTotalCents: 0,
    remainingMinSpendCents: 0,
    serviceKind: "table",
    state: "free",
    partySize: null,
    elapsedMinutes: null,
    turnMinutes: null,
    dueAtIso: null,
    overdue: false,
    joinedWithSpaceId: null,
    joinedFromSpaceId: null,
    held: null,
    combinableWith: [],
    needsResetSinceIso: PROBE_VACATED_ISO,
  },
];

export const PROBE_TICKETS: PrepTicketView[] = [
  {
    id: "00000000-0000-4000-8000-0000000000d1",
    orderId: "00000000-0000-4000-8000-0000000000b1",
    station: "Kitchen",
    destination: "table",
    status: "queued",
    revision: 2,
    visitId: null,
    promisedAt: PROBE_PROMISED_ISO,
    handedOffAt: null,
    tableCode: "T1",
    snapshotLines: [{ id: "l1", label: "Tacos al pastor", units: 3 }],
  },
];

const ROUTER = {
  push() {},
  replace() {},
  refresh() {},
  back() {},
  forward() {},
  prefetch() {},
} as never;

/** The two screens, rendered exactly as their pages render them. */
export function probeMarkup(locale: string): string {
  const tr = createTranslator(locale);
  const floor = renderToStaticMarkup(
    <AppRouterContext.Provider value={ROUTER}>
      <TablesClient
        tenantSlug="qa"
        locale={locale}
        timeZone={PROBE_TIME_ZONE}
        zoneNote="zone note"
        tables={PROBE_TABLES}
        copy={tablesCopy(tr)}
      />
    </AppRouterContext.Provider>,
  );
  const board = renderToStaticMarkup(
    <AppRouterContext.Provider value={ROUTER}>
      <PreparationClient
        locale={locale}
        timeZone={PROBE_TIME_ZONE}
        zoneNote="zone note"
        tickets={PROBE_TICKETS}
        copy={preparationCopy(tr)}
      />
    </AppRouterContext.Provider>,
  );
  return `${floor}\n<!--split-->\n${board}`;
}

// Printed only when explicitly asked. Importing this file from a test (for the
// fixtures above) must not write to stdout.
if (process.env.RESTAURANT_RENDER_PROBE === "1") {
  process.stdout.write(probeMarkup(process.argv[2] ?? "en"));
}
