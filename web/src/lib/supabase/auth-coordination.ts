import { processLock } from "@supabase/supabase-js";

/**
 * Refresh-token rotation coordination (flag-gated).
 *
 * THE BUG
 * -------
 * `@supabase/ssr`'s `createServerClient` is built with `autoRefreshToken: false`
 * and NO lock (auth-js falls back to `lockNoOp` off the browser). A session is
 * treated as expired — and silently refreshed inside `getUser()` /
 * `getSession()` — once it is within `EXPIRY_MARGIN_MS` (90s) of `expires_at`.
 * That refresh ROTATES the refresh token: the old token is consumed
 * server-side and a new one is issued.
 *
 * Within a single navigation the app constructs MULTIPLE independent server
 * clients that each read the SAME refresh token from cookies:
 *   - the proxy (`lib/supabase/middleware.ts` → `updateSession`)
 *   - the request-cached RSC client (`lib/server/request-cache.ts` → `server.ts`)
 *   - plus the browser client, which has its own auto-refresh ticker
 *
 * The per-instance `refreshingDeferred` de-dupe in auth-js only covers calls on
 * ONE client object. Two different server-client instances (or two concurrent
 * requests) racing the same near-expiry token therefore BOTH call refresh; the
 * second hits a token the Auth server already rotated and throws
 * `AuthApiError: Invalid Refresh Token: Already Used`, which bounces the user
 * to /login mid-session.
 *
 * THE FIX (flag-on)
 * -----------------
 * auth-js ships `processLock`: a module-global, per-name async mutex keyed by
 * `lock:${storageKey}`. The storageKey is the auth-cookie name
 * (`sb-<ref>-auth-token`), which is identical for every server client in the
 * process. Passing `auth.lock = processLock` to every server client makes all
 * concurrent `getUser` calls in the same Node process SERIALIZE through one
 * mutex: the first caller that crosses the expiry margin rotates the token once
 * and writes the new session back to the shared cookie storage; every other
 * caller then reads the already-refreshed (no-longer-expired) session and
 * REUSES it instead of re-rotating the now-consumed token.
 *
 * This is the upstream-blessed coordination primitive — it is exactly what the
 * browser client uses (via `navigatorLock`) to avoid the same race across tabs.
 *
 * FLAG-OFF (default) is a strict no-op: when `AUTH_REFRESH_COORDINATION` is not
 * `"1"`, {@link authCoordinationOptions} returns `undefined` and callers spread
 * nothing, so the client is constructed byte-for-byte as it is today
 * (`lockNoOp`, unchanged behavior).
 *
 * SCOPE NOTE: `processLock` is per-process. On serverless this serializes the
 * common in-instance overlap (RSC prefetch + navigation, parallel server
 * actions, proxy + RSC double-pass landing on the same warm lambda). It does
 * not coordinate across two different lambda instances or across the
 * server/browser boundary — but those are the rarer arms of the race, and the
 * existing graceful-recovery path (getUser().catch + forwarded-header fast
 * path) already absorbs them without logging the user out.
 */

/** True when the refresh-coordination flag is explicitly enabled. */
export function isAuthRefreshCoordinationEnabled(): boolean {
  return process.env.AUTH_REFRESH_COORDINATION === "1";
}

/**
 * The `auth` option block to spread into a `createServerClient({ ... })` call.
 *
 * - Flag OFF → `undefined`. Callers spread nothing; behavior is unchanged.
 * - Flag ON  → `{ auth: { lock: processLock } }`. All server clients in the
 *   process serialize their refresh on the shared `lock:${storageKey}` mutex.
 *
 * Note `createServerClient` hard-codes `autoRefreshToken`, `flowType`,
 * `persistSession`, `detectSessionInUrl`, `skipAutoInitialize` and `storage`
 * AFTER spreading `options.auth`, so only `lock` (and other non-overridden
 * fields) survives — we cannot accidentally re-enable auto-refresh here.
 */
export function authCoordinationOptions():
  | { auth: { lock: typeof processLock } }
  | undefined {
  if (!isAuthRefreshCoordinationEnabled()) return undefined;
  return { auth: { lock: processLock } };
}
