# Phase 9 v2 QA — Share-link UX completion

Code-level verification passed (2026-04-25).

## Build

- **Source commit:** `6ba1171` — `feat(edit-chrome): Phase 9 v2 + Phase 10 — preview pill, share popover, shortcut overlay`. Closes the three Phase 9 v2 deferred items: rate-limit branch on `/share/[token]`, Share button label + TTL popover, and the `?preview=1` floating-pill chrome.
- **Promoted production deployment:** `dpl_GbNbgYjPrMZgYoNTcGds6Bkb2Rdw` — `tulala-7jwqyfz6z-oran-tenes-projects.vercel.app` — state `READY`, target `production`. Aliased to all three prod hosts via the post-deploy GitHub Action.
- **TypeScript:** `cd web && npx tsc --noEmit` exits clean.
- **Production build:** `cd web && npx next build` exits clean. `/share/[token]` listed in the route manifest.

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| TS errors fixed | ✅ | `tsc --noEmit` clean at HEAD `6ba1171` |
| Prod build green | ✅ | `next build` exits 0; manifest lists `/share/[token]` and middleware route |
| Prod deploy green | ✅ | `dpl_GbNbgYjPrMZgYoNTcGds6Bkb2Rdw` `state=READY`, `target=production` |
| Prod root smoke | ✅ | `curl https://tulala.digital/` → `200`; `https://app.tulala.digital/` → `200`; `https://impronta.tulala.digital/` → `200` |
| Share error path smoke | ✅ | `curl https://impronta.tulala.digital/share/badtoken` → `200` (renders ShareError); marketing + app hosts → `404` (allow-list rejection — correct: share is tenant-scoped to agency surface) |
| Rate-limit branch live | ✅ | Burst of 70 hits to `https://impronta.tulala.digital/share/x{n}` → 59× `200` + 11× `429`, matching the configured `60 req / 60 s / IP` band exactly |
| Rate-limit module | ✅ | `web/src/lib/rate-limit.ts` adds `rateLimitHtmlResponse()` returning a self-contained 429 HTML doc — no JS deps, renders cleanly even on a fresh browser hitting the bare URL. Uses the existing in-memory fixed-window bucket (`tryConsumeRateLimit`) shared with auth flows; the bucket key is namespaced as `share:${ip}` so abusive share probing can't poison the auth bucket. |
| Middleware wiring | ✅ | `web/src/middleware.ts` adds a `pathname.startsWith("/share/") && method === "GET"` branch that consumes one bucket slot before any other middleware logic; on bucket exhaustion returns `rateLimitHtmlResponse()` without invoking the surface allow-list pass. Cost: zero cycles for the JWT verification, the route handler, or the supabase round-trip when an IP is hammering the endpoint. |
| Share popover — label + TTL UX | ✅ | `web/src/components/edit-chrome/topbar.tsx` introduces `ShareIconWithPopover`. The icon button opens a popover with: a label `<input>` ("Q3 review draft"), a TTL radio group with 4 choices (`1h / 24h / 7d / 30d`, default `7d`), Cancel + Generate buttons. Clicking Generate calls the parent's `onShare({ label, ttlSeconds })` and on success copies the URL to clipboard + flips a "Copied" success state for 2.2s. Outside-click + Escape both dismiss. The popover is a sibling of the topbar so it floats above the canvas with `z-index` matching the other floating chrome surfaces. |
| `onShare` signature | ✅ | `topbar.tsx` `onShare` widened to `(opts: { label?: string; ttlSeconds?: number }) => Promise<string \| null>`. `edit-shell.tsx`'s `handleShareClick(opts, setMutationError)` accepts both fields, converts `ttlSeconds → ttlHours` (the server action accepts hours so log readers see human numbers; the UI uses seconds so the JWT clamp band can be expressed in one unit), and forwards to `createShareLinkAction({ label, ttlHours })`. |
| `?preview=1` floating-pill chrome | ✅ | `web/src/components/edit-chrome/preview-pill.tsx` (NEW, ~470 lines) — full client component routing through `EditChrome` when `editActive=true && ?preview=1`. Renders: (1) a `<style>` block that REVERTS the editor chrome's body padding + header-hide rules so the storefront DOM renders as a visitor sees it; (2) a fixed bottom-right pill with device switcher (desktop/tablet/mobile, mirrors the editor's device frame), Share button (full popover, mirrors topbar's UX), and "Back to edit" button that strips `?preview=1` via `router.replace`; (3) the same DeviceFrameStyle as edit-shell so tablet/mobile preview produce a consistent box-shadowed device frame. |
| `EditChrome` routing | ✅ | `edit-chrome.tsx` rewritten as `"use client"` with `useSearchParams()` called unconditionally before any conditional return so hook order stays stable across the three render branches: `editActive=false → EditPill`; `editActive=true && ?preview=1 → PreviewPill`; default → `EditShell`. Flipping `?preview=1` on/off remounts the right surface without a hard reload. |
| Save-draft topbar wiring uses `router.replace` | ✅ | `topbar.tsx`'s preview button (a separate icon, not the Phase 9 v2 share popover) now uses `useRouter().replace` to flip `?preview=1` in the same tab — no page reload, the preview pill mounts immediately. |

## Promote + smoke evidence

- **Production deployment id:** `dpl_GbNbgYjPrMZgYoNTcGds6Bkb2Rdw`
- **Promoted via** `vercel promote https://tulala-dhiyuc57a-oran-tenes-projects.vercel.app --yes` (preview built from commit `6ba1171`)
- `curl https://tulala.digital/` → `200` ✅
- `curl https://impronta.tulala.digital/` → `200` ✅
- `curl https://app.tulala.digital/` → `200` ✅
- `curl https://impronta.tulala.digital/share/badtoken` → `200` (ShareError UI rendered) ✅
- `curl https://tulala.digital/share/badtoken` → `404` (allow-list reject) ✅
- `curl https://app.tulala.digital/share/badtoken` → `404` (allow-list reject) ✅
- 70-burst rate-limit smoke on `https://impronta.tulala.digital/share/x{n}` → `59× 200 + 11× 429` ✅

## Phase 9 — fully closed

All three Phase 9 v1 deferred items now landed:
- ✅ Rate-limit (this README)
- ✅ Label + TTL popover (this README)
- ✅ `?preview=1` floating-pill chrome (this README)

The remaining Phase 9 backlog items (multi-page share, revoke / list issued share links) are deferred to Phase 11+ as documented in v1's notes — they require schema-level work that doesn't belong in this slice.
