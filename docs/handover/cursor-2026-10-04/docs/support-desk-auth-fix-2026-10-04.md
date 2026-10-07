# Support Desk auth fix (2026-10-04)

Oran escalation: login redirection / caching / tokens / cookies broken on Support Desk. Evidence: Google chooser on `support.tulala.digital/login?next=%2Fdesk` stuck on “Opening Google…”, and `/admin` 404.

## Root causes

1. **`?next=/desk` was dropped after login**  
   `isPostAuthNextAllowedForActiveUser` only allowed `/admin` for `super_admin`. Active platform admins with `next=/desk` were sent to `/admin` instead.

2. **`/admin` 404s on the Desk host**  
   Support host surface allow-list excludes `/admin`. Platform-admin default landing is `/admin` → branded 404. Bookmarks of `/admin` hit the same wall.

3. **OAuth callback forced the app host**  
   Non-popup success always redirected to `getAppUrl() + destination`, leaving `support.tulala.digital`.

4. **Cross-scope cookie shadowing**  
   Desk cookies stay **host-only** (by design — never `Domain=.tulala.digital`). Browser still sends parent-domain talent/client sessions from `app.tulala.digital`. Duplicate `sb-…-auth-token` / `…-code-verifier` names → wrong session or PKCE fail (“Authentication failed” / stuck Google UI).

## Fixes (same PR as `/admin` → `/desk`)

| Change | Effect |
|---|---|
| Allow `/desk` (+ `/desk/*`) as post-auth `next` for `super_admin` | Honors `login?next=/desk` |
| `supportDeskPostAuthDestination` | On Desk hosts, `/admin` and `/` → `/desk` (query kept) |
| Proxy `supportDeskAdminRedirectResponse` | Inbound `/admin` → 308 `/desk` |
| OAuth callback stays on Desk origin when host is support | No bounce to `app.tulala.digital` |
| Expire parent-domain auth cookies on Desk Google start + callback + email/OTP login | Host-only Desk session wins |
| `app.tulala.digital/admin` unchanged | Talent/agency admin intact |

## Cookie model (unchanged intent)

- **App / marketing / tenant `*.tulala.digital`**: auth cookies use `Domain=.tulala.digital`.
- **Support Desk hosts**: auth cookies stay **host-only**. Logging into Desk clears parent-domain auth shadows in that browser so the Desk session is not poisoned by a talent/client app session. Signing out of Desk also clears both scopes (`deskSignOutToLogin`).

## Cache / token traps (operator notes)

- **Multiple Google accounts**: chooser overlay while the button says “Opening Google…” is normal until an account is picked. Pick the **platform-admin** Google account (not a talent/client workspace account).
- **Stuck “Opening Google…” after chooser closes**: usually popup blocked, or PKCE poisoned by a stale parent-domain `…-code-verifier`. Hard-refresh `/login?next=%2Fdesk`, or sign out of Desk, then retry. If still stuck, clear site cookies for `support.tulala.digital` **and** `.tulala.digital` auth cookies, then retry once.
- **Wrong account after Google**: you may land on Desk **forbidden** (honest non-admin page). Use Desk sign-out, then log in with the platform-admin account.
- **Do not use `/admin` on support** — use `/desk`. After deploy, `/admin` redirects.

## Verify

1. Signed-out: `https://support.tulala.digital/desk` → `/login?next=%2Fdesk`
2. Google or email as platform admin → land on `/desk` (queue), not `/admin` / homepage / 404
3. `https://support.tulala.digital/admin` → 308 `/desk` (query preserved)
4. `https://app.tulala.digital/admin` still serves talent/agency admin (no Desk remap)

## Code touchpoints

- `web/src/lib/auth-flow.ts` — `/desk` allowed for `super_admin` next=
- `web/src/lib/support/desk/desk-url.ts` — `supportDeskPostAuthDestination`
- `web/src/lib/support/desk-host.ts` + `proxy.ts` — `/admin` → `/desk`
- `web/src/lib/supabase/cookie-domain.ts` — parent-domain expire helpers
- `web/src/lib/support/desk/desk-auth-cookies.ts` — server-action helpers
- `web/src/app/auth/{callback,google}/route.ts`, `actions.ts`, `otp-actions.ts`
