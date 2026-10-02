/**
 * Support Desk master switch (`SUPPORT_DESK_ENABLED`).
 *
 * Contract (Phase 1a):
 *   - Local `next dev` (NODE_ENV=development, no Vercel env): ON by default.
 *   - Production / preview (VERCEL_ENV set): OFF unless explicitly enabled.
 *   - Explicit `SUPPORT_DESK_ENABLED=1|true|on` forces ON.
 *   - Explicit `SUPPORT_DESK_ENABLED=0|false|off` forces OFF.
 *
 * When OFF, `support.tulala.digital` is dead at the proxy even if the host is
 * seeded in `agency_domains`, and the local QA route
 * `/platform/admin/support/desk` returns notFound().
 *
 * Pure helpers (no Next.js imports) so unit tests can pass a fake env.
 */

export type DeskFlagEnv = {
  SUPPORT_DESK_ENABLED?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

function readRaw(env: DeskFlagEnv): string {
  return (env.SUPPORT_DESK_ENABLED ?? "").trim().toLowerCase();
}

/** True when the Support Desk surface may render / admit its host. */
export function isSupportDeskEnabled(
  env: DeskFlagEnv = typeof process !== "undefined" ? process.env : {},
): boolean {
  const raw = readRaw(env);
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  // Unset: never on in a Vercel deploy (production or preview). On only for
  // local next-dev where an agent can QA without flipping a remote env var.
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
    return false;
  }
  return env.NODE_ENV === "development";
}
