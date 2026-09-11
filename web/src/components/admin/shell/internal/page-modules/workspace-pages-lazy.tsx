"use client";

/**
 * workspace-pages-lazy.tsx — every SPA page of the workspace shell, loaded
 * on demand.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `WorkspaceShell`'s `PageRouter` is a switch over `state.page`, and it used
 * to import every page statically: Catalog and its item editor, Events,
 * Appointments, People, Clients, Pitches, Reviews, Analytics, Website,
 * Media, Settings with all of its cards, Payouts, Calendar, Messages and the
 * Overview board. A static import of a client component puts its whole
 * graph into the shell's client chunk, and the shell is shared by every
 * route under `/admin` — so a cashier opening the register on a tablet
 * downloaded the catalog editor and the settings frame before the till
 * could hydrate, and every re-skin that landed a new page made that worse.
 * `scripts/app-bundle-budget.mjs` measures exactly that union.
 *
 * Behind `next/dynamic` each page is its own chunk, fetched when the shell
 * first renders it. `ssr` stays ON (the shape `admin/pos/mode-clients.tsx`
 * uses, NOT the `ssr: false` shape retired after the 2026-07-23 incident):
 * a hard load still paints the page's HTML on the server and hydrates it
 * when its chunk arrives, so nothing that was server-rendered before is
 * client-only now. What moves is the code for the pages NOT on screen.
 *
 * `loading` is the shell's own `PageSkeleton`, and it shows only on a soft
 * page switch (a rail click) the first time a page is opened in a session;
 * hard loads never see it because the chunk is in the HTML's preload list.
 *
 * Every importer of a workspace page goes through here — a direct
 * `import { CatalogPage } from "./catalog/CatalogPage"` in the shell is
 * the regression the bundle budget catches.
 */

import dynamic from "next/dynamic";

import { PageSkeleton } from "../primitives/page-skeleton";

const loading = () => <PageSkeleton />;

export const OverviewBoard = dynamic(
  () => import("./OverviewBoard").then((m) => ({ default: m.OverviewBoard })),
  { loading },
);
export const WorkspaceMessagesPage = dynamic(
  () => import("./InboxPage").then((m) => ({ default: m.WorkspaceMessagesPage })),
  { loading },
);
export const CalendarPage = dynamic(
  () => import("./CalendarPage").then((m) => ({ default: m.CalendarPage })),
  { loading },
);
export const CatalogPage = dynamic(
  () => import("./catalog/CatalogPage").then((m) => ({ default: m.CatalogPage })),
  { loading },
);
export const AppointmentsPage = dynamic(
  () => import("./AppointmentsPage").then((m) => ({ default: m.AppointmentsPage })),
  { loading },
);
export const EventsPage = dynamic(
  () => import("./events/EventsPage").then((m) => ({ default: m.EventsPage })),
  { loading },
);
export const TalentPage = dynamic(
  () => import("./TalentPage-1").then((m) => ({ default: m.TalentPage })),
  { loading },
);
export const ClientsPage = dynamic(
  () => import("./ClientsPage").then((m) => ({ default: m.ClientsPage })),
  { loading },
);
export const PitchesPage = dynamic(
  () => import("./PitchesPage-1").then((m) => ({ default: m.PitchesPage })),
  { loading },
);
export const ReviewsPage = dynamic(
  () => import("./ReviewsPage").then((m) => ({ default: m.ReviewsPage })),
  { loading },
);
export const AnalyticsPage = dynamic(
  () => import("./AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
  { loading },
);
export const WebsitePage = dynamic(
  () => import("./WebsitePage-1").then((m) => ({ default: m.WebsitePage })),
  { loading },
);
export const WorkspaceMediaPage = dynamic(
  () => import("../media-page").then((m) => ({ default: m.WorkspaceMediaPage })),
  { loading },
);
export const PayoutsPage = dynamic(
  () => import("./PayoutsPage").then((m) => ({ default: m.PayoutsPage })),
  { loading },
);
export const WorkspacePageView = dynamic(
  () => import("./WorkspacePageView").then((m) => ({ default: m.WorkspacePageView })),
  { loading },
);
