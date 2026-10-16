# AUTH · Custom-domain edit hand-off (C2)

**Status:** implemented · ready for PM review (Auth) · not merged  
**Surface:** Admin Editar → storefront `?edit=1` on a verified CUSTOM domain  
**Auth gate:** PM review before any batch / merge

## Problem

Auth cookies share across `*.tulala.digital` / `*.lvh.me` only (`cookieDomainForHost`). Tenant CUSTOM domains stay host-only. Admin sits on `app.tulala.digital` with a readable session, then "Editar" opens `https://<custom>/…?edit=1`. The custom host has no session, so the page renders public and the editor never mounts.

## Design one-liner

App host mints a signed one-time short-lived hand-off token; the custom domain redeems it, sets a fresh host-only session, then lands on `?edit=1`.

## Flow

1. Operator is signed in on the app host (session readable).
2. Editar computes the absolute storefront editor URL (`https://<custom>/<path>?edit=1&panel=…`).
3. If the target host needs a hand-off (custom / non-shared cookie parent), open  
   `{appUrl}/auth/sso/start?return={encodeURIComponent(editorUrl)}`  
   instead of the bare editor URL.
4. `/auth/sso/start` (app host): require session; require `return` is `https:` and host is a verified `agency_domains` row with `kind=custom` and status in `active|verified|ssl_provisioned`; mint row in `sso_handoff_tokens` (`user_id`, `target_host`, `expires_at`); redirect to `https://<custom>/auth/sso?token=<uuid>&next=<path+query>`.
5. `/auth/sso` (custom host): redeem (validate + atomic claim); mint a FRESH host-only session via Supabase `generateLink` + `verifyOtp` (no session tokens cross the wire or sit at rest); redirect to `next` (normalized relative path, which includes `?edit=1`).
6. Storefront loads with host-only session; existing edit-mode gates apply.

Shared cookie parents (`*.tulala.digital`, `*.lvh.me`) skip the hand-off and open the editor URL directly.

## Reuse

Reuse the existing `sso_handoff_tokens` table and mint/redeem routes (Tenant Registration Engine S6). No new migration. Edit hand-off is the same nonce mechanism with a different caller (Admin Editar URL builder) and a `next` that carries `?edit=1`.

## Threat model

| Threat | Mitigation |
|---|---|
| Token theft / interception | HTTPS-only return + redeem; short TTL (120 s); token is a DB UUID, not a JWT with claims |
| Replay | Atomic claim: `UPDATE … SET used_at = now() WHERE token = ? AND used_at IS NULL`; second claim returns no row → fail closed |
| Expiry | `expires_at` checked before claim; mint sets `now + 120s` |
| Host swap / open redirect | Redeem requires `requestHost === row.target_host`; mint requires verified custom host; `next` is path-normalized (`normalizeNextPath`) so it cannot escape the target origin |
| Session token leakage | Row stores only `user_id` (no access/refresh tokens). Session is minted fresh on the target host |
| Privilege escalation | Mint requires an authenticated session on the app host. Redeem creates a session for that same user only. Edit capability still uses existing tenant membership / edit-mode checks on the custom host |
| Cross-tenant mint | Token is bound to `target_host`, not tenant_id. A user who can mint may still land logged-in on a custom host they do not admin; the editor chrome remains gated by membership. Acceptable for v1; PM may ask for an explicit membership check at mint |
| Brute force UUID | 122-bit UUID space; rate-limit left to platform defaults; fail closed with logged-out redirect (no oracle) |

## Expiry / single use / replay (contract)

- **TTL:** 120 seconds from mint (`SSO_HANDOFF_TTL_MS`).
- **Single use:** `used_at` NULL → timestamp via atomic update; used tokens never redeem again.
- **Replay:** same token twice → second redeem fails; expired unused token fails; wrong host fails.
- **Safe degrade:** any redeem failure redirects to `next` logged-out (public page), never 500s a partial session.

## Call sites (implementation)

Central helper: `resolveStorefrontEditorOpenUrl({ editorAbsoluteUrl, currentHostname, appUrl })`  
returns either the bare editor URL or the `/auth/sso/start?return=…` wrapper.

Wire into Admin Website openers that `window.open` editor URLs:

- `use-website-page-links.ts` (Páginas → Editar)
- `WebsitePage-1.tsx` (homepage editor)
- `WebsitePagesSurface.tsx` (create-page open)

Leave talent personal-site flows and D-theme PRs alone.

## Tests (required before PM ready)

Pure unit coverage (no live DB / no prod writes):

1. **needs hand-off** — custom host yes; shared `*.tulala.digital` no; same host no
2. **mint URL shape** — `/auth/sso/start?return=` encodes full `?edit=1` editor URL
3. **redeem validate** — happy path; used_at set → reject; expired → reject; host mismatch → reject
4. **replay** — second claim after successful claim fails

## NOT done (post-PM)

- Live custom-domain QA (redeem cookie lands host-only; editor mounts)
- Optional mint-time membership check (PM call)
- Merge / `db:push` / batch (Auth = PM review)
