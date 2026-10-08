/**
 * TUL-117 (Live QA on batch 3): `/start` is the guided sign-up flow and lives on
 * the marketing host ONLY (see MARKETING_PAGE_PREFIXES for why a tenant's own
 * branded domain must not offer it). Pros still land on the platform's other
 * doors, though: `app.tulala.digital/start` and any `/signup` link returned the
 * branded 404. This is the one decision, pure so it is tested without a request.
 *
 * - platform app host: `/start` and `/signup` go to the marketing `/start`.
 * - marketing host: `/signup` goes to `/start` (no `/signup` page exists).
 * - everything else (talent hosts, agency custom domains, hub) returns `null`
 *   and keeps the 404, which is the intended behavior.
 *
 * The query string is kept so `?lang=` and `?choice=` survive the hop.
 */

export type StartDoorInput = {
  pathname: string;
  search: string;
  method: string;
  /** `hostContext.kind` from the proxy. */
  hostKind: string;
  /** Marketing origin without a trailing slash, e.g. `https://tulala.digital`. */
  marketingOrigin: string;
};

const DOOR_PATHS = new Set(["/start", "/signup"]);

export function startDoorRedirect(input: StartDoorInput): string | null {
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  const path = input.pathname.length > 1 ? input.pathname.replace(/\/+$/, "") : input.pathname;
  if (!DOOR_PATHS.has(path)) return null;

  const origin = input.marketingOrigin.replace(/\/$/, "");
  const search = input.search && input.search !== "?" ? input.search : "";

  if (input.hostKind === "app") return `${origin}/start${search}`;
  if (input.hostKind === "marketing" && path === "/signup") return `${origin}/start${search}`;
  return null;
}
