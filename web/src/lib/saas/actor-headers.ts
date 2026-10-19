/**
 * Names of the internal request headers `updateSession` (supabase/middleware.ts)
 * writes after it has verified the session, and `getCachedActorSession`
 * (server/request-cache.ts) reads as a fast path.
 *
 * They are ONLY trustworthy when the proxy wrote them. Every proxy branch that
 * forwards the inbound request WITHOUT running `updateSession` (talent-site host
 * rewrite, dev surfaces, re-entry, host-unregistered) must therefore strip them
 * from the client's request, which `stripInboundHostContextHeaders` does from
 * this list. Keeping the names in one module means the writer, the reader and
 * the stripper cannot drift apart.
 */

export const ACTOR_ID_HEADER = "x-impronta-actor-id";
export const ACTOR_EMAIL_HEADER = "x-impronta-actor-email";
export const ACTOR_APP_ROLE_HEADER = "x-impronta-actor-app-role";
export const ACTOR_STATUS_HEADER = "x-impronta-actor-status";
export const ACTOR_ONBOARDED_HEADER = "x-impronta-actor-onboarded";
/** Hybrid accounts' chosen home, so the fast path routes like middleware does. */
export const ACTOR_HOME_PREF_HEADER = "x-impronta-actor-home-pref";

export const ACTOR_SIG_HEADER_NAME = "x-impronta-actor-sig";

export const ACTOR_HEADERS = [
  ACTOR_ID_HEADER,
  ACTOR_EMAIL_HEADER,
  ACTOR_APP_ROLE_HEADER,
  ACTOR_STATUS_HEADER,
  ACTOR_ONBOARDED_HEADER,
  ACTOR_HOME_PREF_HEADER,
  ACTOR_SIG_HEADER_NAME,
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_RE = /^[a-z_]{1,32}$/;

/**
 * Defence in depth for the fast path: even a header that somehow reached the
 * reader must at least have the shape the proxy writes (a UUID id, a snake_case
 * role and status). This does not authenticate anything; stripping inbound
 * copies is the control. It only refuses obvious garbage.
 */
export function isPlausibleForwardedActor(
  id: string | null,
  appRole: string | null,
  status: string | null,
): boolean {
  if (!id || !UUID_RE.test(id)) return false;
  if (appRole && !ROLE_RE.test(appRole)) return false;
  if (status && !ROLE_RE.test(status)) return false;
  return true;
}
