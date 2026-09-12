/**
 * Bridge slices: the parts of the admin bridge a page needs before it can
 * paint, named, so the layout can load ONLY those before the first byte and
 * the shell can fetch the rest after.
 *
 * WHY. The admin layout used to await twenty-two loaders (about a hundred
 * Supabase reads: every inquiry with its messages, every client, the whole
 * calendar, the media library, the website's pages and posts, the payouts
 * snapshot, the team with one auth read per member) before it could send a
 * single byte of ANY admin page, including the catalog, which reads none of
 * them. Warm TTFB on the deployed host was 1.8-2.6 s on every route.
 *
 * THE SPLIT. What the chrome itself renders on first paint (identity, session,
 * unread count, notifications, locale, plan switches, the KPI counts behind
 * the rail badges) stays in the layout. Everything else is a slice: the layout
 * loads the slices of the page the URL names, the shell asks for the missing
 * ones in one server action after hydration, and a page whose slice has not
 * arrived shows its skeleton instead of an empty (or, worse, mock) body.
 *
 * This module is imported by both the client shell and the server layout, so
 * it carries no server imports: only names and the page map.
 */

import type { WorkspacePage } from "./state/types";

export const BRIDGE_SLICE_NAMES = [
  "roster",
  "inquiries",
  "clients",
  "calendarEvents",
  "bookings",
  "pitches",
  "teamMembers",
  "media",
  "website",
  "recentActivity",
  "payoutsSurface",
] as const;

export type BridgeSliceName = (typeof BRIDGE_SLICE_NAMES)[number];

/**
 * The slices a page reads on first paint. A page absent from this map needs
 * none (the overview reads its own snapshot from `/admin/page.tsx`; catalog,
 * appointments and events load through their own actions; canonical server
 * pages render inside the shell from their own data).
 *
 * Drawers read slices too (a client drawer reads `clients`, an inquiry drawer
 * reads `inquiries`); they are covered by the post-hydration fetch of every
 * missing slice, not by this map, because a drawer can open from any page.
 */
const PAGE_SLICES: Partial<Record<WorkspacePage, readonly BridgeSliceName[]>> = {
  messages: ["inquiries", "clients", "roster", "bookings"],
  inbox: ["inquiries", "clients", "roster", "bookings"],
  work: ["inquiries", "clients", "roster", "bookings"],
  projects: ["inquiries", "clients", "roster", "bookings"],
  calendar: ["calendarEvents", "bookings", "inquiries"],
  people: ["roster", "teamMembers"],
  roster: ["roster", "teamMembers"],
  talent: ["roster", "teamMembers"],
  clients: ["clients", "bookings"],
  pitches: ["pitches", "clients", "roster"],
  analytics: ["inquiries", "bookings"],
  website: ["website", "teamMembers", "inquiries", "bookings"],
  site: ["website", "teamMembers", "inquiries", "bookings"],
  media: ["media"],
  payments: ["payoutsSurface"],
  payouts: ["payoutsSurface"],
  financials: ["payoutsSurface"],
  billing: ["payoutsSurface"],
  settings: ["teamMembers", "website", "clients"],
  workspace: ["teamMembers", "website", "clients"],
  appts: ["bookings"],
  sessions: ["bookings"],
  appointments: ["bookings"],
};

export function slicesForPage(page: WorkspacePage): readonly BridgeSliceName[] {
  return PAGE_SLICES[page] ?? [];
}

export function isBridgeSliceName(value: string): value is BridgeSliceName {
  return (BRIDGE_SLICE_NAMES as readonly string[]).includes(value);
}
