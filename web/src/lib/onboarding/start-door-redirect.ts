/**
 * TUL-117 (Live QA on batch 3): `/start` is the guided sign-up flow and lives on
 * the marketing host ONLY (see MARKETING_PAGE_PREFIXES for why a tenant's own
 * branded domain must not offer it). Pros still land on the platform's other
 * doors, though: `app.tulala.digital/start` and any `/signup` link returned the
 * branded 404, a dead end (TUL-163: talent sign-up lives only on tulala.digital).
 * This is the one decision, pure so it is tested without a request.
 *
 * - platform app host, agency hosts and talent sites: `/start` and `/signup`
 *   go to the marketing `/start`.
 * - marketing host: `/signup` goes to `/start` (no `/signup` page exists).
 * - marketing host: the legacy `/onboarding/role` URL (old emails, bookmarks) also
 *   goes to `/start`; on the app host that page still exists and stays.
 * - everything else (hub, unregistered hosts) returns `null`.
 *
 * The query string is kept so `?lang=` and `?choice=` survive the hop, and a
 * Spanish prefix is kept on the target (`app…/es/start` → `tulala.digital/es/start`).
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

const REDIRECT_KINDS = new Set(["app", "agency", "talent_site"]);
const DOOR_PATHS = new Set(["/start", "/signup", "/onboarding/role"]);
const LOCALE_PREFIX = /^\/es(?=\/)/;

export function startDoorRedirect(input: StartDoorInput): string | null {
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  const trimmed = input.pathname.length > 1 ? input.pathname.replace(/\/+$/, "") : input.pathname;
  const prefix = LOCALE_PREFIX.exec(trimmed)?.[0] ?? "";
  const path = trimmed.slice(prefix.length);
  if (!DOOR_PATHS.has(path)) return null;

  const search = input.search && input.search !== "?" ? input.search : "";
  const target = `${input.marketingOrigin.replace(/\/$/, "")}${prefix}/start${search}`;

  // The legacy role page is a real page on the app host: only the marketing host (where it 404s) hands it off.
  if (path === "/onboarding/role") return input.hostKind === "marketing" ? target : null;
  if (REDIRECT_KINDS.has(input.hostKind)) return target;
  if (input.hostKind === "marketing" && path === "/signup") return target;
  return null;
}
