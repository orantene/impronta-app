"use client";

/**
 * mode-clients.tsx — every POS mode's client, loaded on demand.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `page.tsx` is ONE route serving five modes (`?mode=counter|door|floor|
 * classes|projects`), and it used to import each mode's client statically.
 * A static import of a client component from a server route puts that
 * component's whole graph into the route's client bundle, so a cashier
 * opening the counter downloaded the door, the floor, the front desk and
 * collect as well — on a tablet, on venue wifi, at the start of every shift.
 * `scripts/app-bundle-budget.baseline.json` recorded the register at 8.92 MB
 * with the note that the modes were supposed to SPLIT this bundle rather
 * than add to it; the day four modes landed, the gate went red by 119 KB.
 *
 * Behind `next/dynamic` each mode is its own chunk, fetched only when that
 * mode is the one rendered. The route still decides WHICH mode on the
 * server, from the validated `?mode=` query, and renders it server-side as
 * before (`ssr` stays ON — this is not the `ssr: false` shape the builder's
 * closed drawers use): a hard load paints the requested mode's HTML at
 * first paint and hydrates it once its chunk arrives; what moves is only
 * the code for the modes NOT in use. `loading` renders nothing, as the
 * builder's deferred panels do: the only time it shows is a soft mode
 * switch, where the admin segment's own `loading.tsx` skeleton has just
 * cleared and a second skeleton for the chunk hop would be noise.
 *
 * Every importer of a mode's client goes through here — `page.tsx` for the
 * counter, the door and the classes desk; `floor-screen.tsx` and
 * `_projects/projects-mode-page.tsx` (server halves) for their own client
 * halves — so a direct `import { PosClient } from "./pos-client"` in a route
 * file is the regression the bundle budget will catch.
 */

import dynamic from "next/dynamic";

export const PosClient = dynamic(
  () => import("./pos-client").then((m) => ({ default: m.PosClient })),
  { loading: () => null },
);

export const DoorClient = dynamic(
  () => import("./door-client").then((m) => ({ default: m.DoorClient })),
  { loading: () => null },
);

export const ClassesClient = dynamic(
  () => import("./classes-client").then((m) => ({ default: m.ClassesClient })),
  { loading: () => null },
);

export const FloorClient = dynamic(
  () => import("./floor-client").then((m) => ({ default: m.FloorClient })),
  { loading: () => null },
);

// The Messages & Inquiries view every mode's rail opens (`?view=messages`,
// seam 2): its own chunk for the same reason as the modes, since a cashier
// who never opens the inbox should not download it.
export const MessagesModeClient = dynamic(
  () => import("./messages-client").then((m) => ({ default: m.MessagesModeClient })),
  { loading: () => null },
);

export const ProjectsModeClient = dynamic(
  () =>
    import("./_projects/projects-mode-client").then((m) => ({
      default: m.ProjectsModeClient,
    })),
  { loading: () => null },
);
