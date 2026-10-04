/**
 * Support Desk master switch (`SUPPORT_DESK_ENABLED`).
 *
 * Contract:
 *   - Explicit `SUPPORT_DESK_ENABLED=1|true|on` → ON.
 *   - Explicit `SUPPORT_DESK_ENABLED=0|false|off` → OFF.
 *   - Unset → OFF everywhere (local, preview, production). No NODE_ENV default.
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
  return false;
}
