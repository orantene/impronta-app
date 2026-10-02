/**
 * G3b: the ONE live-status input every public widget reads.
 *
 * Mechanism (cache-safe, no anon exposure, no migration):
 *  1. Request-time read. Public talent pages are `force-dynamic`
 *     (revalidate = 0), and `renderTalentMaxSite` reads the flag through the
 *     service-role loader on every render. HTML a crawler sees is computed per
 *     request, so view-source can never carry an "on" past `emergenciesUntil`.
 *  2. Tag bust on toggle. The toggle action busts the talent's site cache tags
 *     (`bustTalentSiteCache`) so any tagged data cache and `/t/<code>` are
 *     fresh on the next request.
 *  3. Client expiry island (`LiveStatusExpiry`). A tab left open across local
 *     midnight flips the site root's `data-emergencies-today` to "off" at
 *     `emergenciesUntil`; `LIVE_STATUS_CSS` then hides every "on" variant.
 *
 * Widget contract (G5 pill, G6 alert band, G8 matrix column, G12 dock):
 *  - read `dataSources.liveStatus` (a `LiveStatusRenderContext`; absent = off);
 *  - when `emergenciesToday` is false render only the off state (never emit
 *    "on" markup, so nothing stale can ever reach a crawler);
 *  - when it is true, mark "on"-only UI `data-live-when="on"` and, where the
 *    widget swaps, ALSO render the off variant marked `data-live-when="off"`,
 *    so the island can flip the page at midnight without a reload.
 *  - client components outside the root (the dock) can call
 *    `useEmergenciesToday(ctx)` from LiveStatusExpiry.tsx.
 */
import { emergenciesOn, type TalentLiveStatus } from "./live-status";

export type LiveStatusRenderContext = {
  /** "Atiendo emergencias hoy" is on at render time. */
  emergenciesToday: boolean;
  /** ISO instant it expires; null whenever `emergenciesToday` is false. */
  emergenciesUntil: string | null;
};

export const LIVE_STATUS_OFF: LiveStatusRenderContext = { emergenciesToday: false, emergenciesUntil: null };

export const LIVE_STATUS_ROOT_ATTR = "data-emergencies-today";

export function toLiveStatusRenderContext(
  status: TalentLiveStatus | null | undefined,
  now: Date = new Date(),
): LiveStatusRenderContext {
  if (!status?.emergenciesUntil || !emergenciesOn(status, now)) return { ...LIVE_STATUS_OFF };
  return { emergenciesToday: true, emergenciesUntil: status.emergenciesUntil };
}

/** Is the context still on at `now`? (A render-time "on" can lapse later.) */
export function liveStatusOnAt(ctx: LiveStatusRenderContext | null | undefined, now: number): boolean {
  if (!ctx?.emergenciesToday || !ctx.emergenciesUntil) return false;
  const at = Date.parse(ctx.emergenciesUntil);
  return Number.isFinite(at) && at > now;
}

/** Attributes for the site root (`data-talent-max-site`). */
export function liveStatusRootAttrs(ctx: LiveStatusRenderContext): Record<string, string> {
  return { [LIVE_STATUS_ROOT_ATTR]: ctx.emergenciesToday ? "on" : "off" };
}

/** setTimeout's max delay (2^31-1 ms). */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Milliseconds until the island must flip to off, or null when there is
 * nothing to schedule. 0 means "already expired, flip now".
 */
export function msUntilExpiry(until: string | null | undefined, now: number): number | null {
  if (!until) return null;
  const at = Date.parse(until);
  if (!Number.isFinite(at)) return 0;
  return Math.min(Math.max(0, at - now), MAX_TIMEOUT_MS);
}

/** Root-scoped rules: whichever state the root says, the other variant is hidden. */
export const LIVE_STATUS_CSS =
  `[${LIVE_STATUS_ROOT_ATTR}="off"] [data-live-when="on"],` +
  `[${LIVE_STATUS_ROOT_ATTR}="on"] [data-live-when="off"]{display:none!important}`;
