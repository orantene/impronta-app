# Phase 9 QA — Preview & share link

Code-level verification passed (2026-04-25).

## Build

- **Source commits:**
  - `21ec2eb` — `feat(edit-chrome): Phase 9 — share-link generation + public viewer`. Six files: `lib/site-admin/share-link/jwt.ts` (HS256 sign + verify), `share-actions.ts` (server action that loads the latest revision and mints a token), `app/share/[token]/page.tsx` (token-gated public viewer), `lib/saas/surface-allow-list.ts` (`/share` added to agency storefront prefixes), `components/edit-chrome/topbar.tsx` (Share icon now mints + clipboard-copies via `onShare`), `components/edit-chrome/edit-shell.tsx` + `edit-context.tsx` (`reportMutationError` plumbed so chrome surfaces share the toast).
  - `367b641` — `edit chrome: surface Share preview link in command palette`. Two files: command palette gains a Share row that mirrors the topbar flow; shortcut registry gains `share-link` (⌘⇧S, editing category, `paletteAction:true`).
- **Promoted production deployment:** `dpl_4ehhDfSCLHG8C7KepPVFKiFtudVQ` — `tulala-gy8occjw7-oran-tenes-projects.vercel.app` — state `READY`, target `production`. Aliased to `impronta.tulala.digital` after the manual `vercel promote`. The post-deploy GitHub Action will re-attach `tulala.digital` + `app.tulala.digital` on the next push-triggered prod deploy.
- **TypeScript:** `cd web && npx tsc --noEmit` exits clean (zero errors) at both commits.

## Strategy note — service-role on a public route

The `/share/[token]` route is unauthenticated by design — the JWT IS the auth boundary. Inside the route we use `createServiceRoleClient()` to read `cms_page_revisions` because RLS on that table is staff-only. Three filters all sourced from signed claims (`tenant_id = claims.tid AND page_id = claims.pid AND id = claims.rev`) bound the read to exactly the revision the operator chose to share. The host the request landed on is cross-checked against `claims.tid` so a leaked token replayed against a different agency subdomain is rejected even though the JWT itself is still valid.

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| TS errors fixed | ✅ | `tsc --noEmit` clean at HEAD |
| Prod deploy green | ✅ | `dpl_4ehhDfSCLHG8C7KepPVFKiFtudVQ` `state=READY`, `target=production` |
| Prod root smoke | ✅ | `curl https://tulala.digital/` → `200`; `https://app.tulala.digital/` → `200`; `https://impronta.tulala.digital/` → `200` |
| Share error path smoke | ✅ | `curl https://impronta.tulala.digital/share/badtoken` → `200` (renders ShareError UI for `bad_signature`); `curl https://tulala.digital/share/badtoken` → `404` (allow-list correctly rejects on the marketing host); `curl https://app.tulala.digital/share/badtoken` → `404` (correctly rejected on the app/hub host — share links are tenant-scoped to the agency surface) |
| HS256 JWT module | ✅ | `web/src/lib/site-admin/share-link/jwt.ts`. `signShareJwt(claims, ttlSeconds)` returns `{token, expiresAt}`. `verifyShareJwt(token)` returns a discriminated union: `{ok:true, claims}` on success, `{ok:false, reason: "malformed" \| "bad_signature" \| "expired" \| "bad_issuer"}` on failure. Issuer pinned to `impronta-share` (distinct from the preview-mode JWTs that share the same `PREVIEW_JWT_SECRET`). Body claims: `iss / sub / tid / pid / rev / lbl / iat / exp / jti`. TTL clamped to `[1h, 30d]` with a default of 7 days. |
| Server action | ✅ | `web/src/lib/site-admin/share-link/share-actions.ts` — `"use server"` gated by `requireStaff` + `requireTenantScope`. `createShareLinkAction({ label?, ttlSeconds? })` loads the draft homepage, picks the latest `cms_page_revisions` row by `created_at DESC`, signs the JWT, and returns `{ok:true, path: "/share/<token>", token, pageId, revisionId, expiresAt, label}`. Failure returns `{ok:false, error, code?}`. Wraps a single supabase round-trip; never reads from a non-tenant-scoped table. |
| Surface allow-list update | ✅ | `web/src/lib/saas/surface-allow-list.ts` adds `/share` to `AGENCY_STOREFRONT_PREFIXES`. Tenant scope is enforced inside the route (the JWT's `tid` claim cross-checked against `getPublicHostContext().tenantId`); the allow-list bound is purely about which surface kind may host the route. Smoke confirms agency hosts serve and marketing/hub/app hosts reject. |
| Public viewer route | ✅ | `web/src/app/share/[token]/page.tsx` — server component, `dynamic = "force-dynamic"`, `metadata.robots = { index:false, follow:false }`. Verifies the JWT, cross-checks the resolved host's `tenantId` against `claims.tenantId`, then service-role reads the revision row by `(tenant_id, page_id, id)` — three filters all from signed claims. The snapshot is rendered through the same `HomepageCmsSections` dispatcher the published storefront uses, slot-by-slot, sorted by `sortOrder`. The agency header / footer / search bar are intentionally NOT rendered — this is a section-list viewer, not a fully impersonated storefront. |
| ShareBanner + ShareFooter chrome | ✅ | Sticky top banner (12px, paper-background, blurred) labels the snapshot kind ("Draft preview" / "Published version preview" / "Rollback preview"), shows the operator-supplied label when present, and surfaces "From {brand} · Expires {date}". Footer mirrors the brand label and prints both issued-at + expires-at dates. Distinguishes the share view from the live storefront at a glance. |
| ShareError UI | ✅ | Seven branches in `ShareError`: `expired`, `bad_signature`, `bad_issuer`, `malformed`, `tenant_mismatch`, `not_found`, `empty`. Centred card on a zinc-50 backdrop, contextual title + body for each reason, "Go to homepage" link as a graceful exit. Smoke against `/share/badtoken` confirms the UI renders for the `bad_signature` branch. |
| Topbar Share button wired | ✅ | `web/src/components/edit-chrome/topbar.tsx` — the existing Share icon now accepts `onShare?: () => Promise<string \| null>`. Clicking it: (1) calls `handleShare`, which awaits the URL from the parent, (2) writes to `navigator.clipboard` and flips `shareCopied=true` for 2.2s with a green checkmark + "Link copied" tooltip, (3) on clipboard rejection falls back to `window.prompt("Share link", url)`. Disabled while in-flight (`shareBusy`). Failure paths route to `reportMutationError` so the standard chrome toast surfaces them. |
| EditShell wiring | ✅ | `edit-shell.tsx` adds a module-level `handleShareClick(setMutationError)` that calls `createShareLinkAction({})`, returns `${origin}${result.path}` on success, surfaces `result.error` to the toast on failure. Wired as `onShare={() => handleShareClick(reportMutationError)}` on `<TopBar>`. |
| EditContext exposes `reportMutationError` | ✅ | `edit-context.tsx` adds `reportMutationError: (message: string) => void` to the public surface, set to the existing `setMutationError` setter. Lets chrome surfaces (Share button, future scheduled-publish pill, etc.) reuse the same auto-clearing 5-second toast that internal mutations use, instead of building a parallel error UI. |
| Command palette Share row | ✅ | `command-palette.tsx` adds an `actionRow("share-link", "Share preview link", …)` in the action group. Selecting the row mints the link via `createShareLinkAction({})` and copies the absolute URL to the clipboard inline (closes the palette immediately so the operator gets the same fire-and-forget feel as Save draft). Failures route through `ctx.reportMutationError`. |
| Shortcut registry entry | ✅ | `kit/shortcuts.ts` adds `{id:"share-link", label:"Share preview link", keys:["⌘","⇧","S"], category:"editing", paletteAction:true}`. The Share row in the palette pulls the chip set from the registry by id, so Phase 10's keyboard overlay and the palette will never disagree about the keybind. |

## Promote + smoke

- **Production deployment id:** `dpl_4ehhDfSCLHG8C7KepPVFKiFtudVQ`
- **Promoted via** `vercel promote https://tulala-p251abxlz-oran-tenes-projects.vercel.app --yes`
- `curl https://tulala.digital/` → `200` ✅
- `curl https://impronta.tulala.digital/` → `200` ✅
- `curl https://app.tulala.digital/` → `200` ✅
- `curl https://impronta.tulala.digital/share/badtoken` → `200` (ShareError UI rendered) ✅
- `curl https://tulala.digital/share/badtoken` → `404` (correctly rejected by surface allow-list on marketing host) ✅
- `curl https://app.tulala.digital/share/badtoken` → `404` (correctly rejected on the app/hub host) ✅

## Notes / deferred items

- **`?preview=1` floating-pill chrome (Phase 9 v2)** — the original Phase 9 spec name pairs share-link with a `?preview=1` mode that lets a staff operator with a logged-in session click into a section to deep-link a clean preview without the editor chrome. Tracked for Phase 9 v2; the JWT module + share-actions infrastructure is reusable verbatim — only the URL parameter handling and a chrome stripper component are needed.
- **Label + TTL UX on the topbar Share button** — today the button mints a 7-day default link with no label. A small popover with a label input ("Q3 review draft") and TTL choice (1h / 24h / 7d / 30d) is tracked as Phase 9 v2. The server action already accepts both fields; only the topbar UI is missing.
- **Rate-limit branch in `web/src/middleware.ts`** — token verification is cheap, but a fuzzer hitting `/share/<random>` 100×/sec would still consume edge cycles. Tracked for Phase 9 v2 as a `share:${ip}` bucket alongside the other rate-limit branches in middleware.
- **Visual screenshot capture** — pending a staff-authenticated session at `impronta.tulala.digital?edit=1`. Middleware blocks raw `*.vercel.app` so the share button + share viewer must be captured manually. Code evidence stands until then.
- **Multi-page share** — share links today are bound to the homepage page record only. When Phase 24 lights up the page picker, the share-actions API gains an explicit `pageId` parameter (the `pid` claim already exists in the JWT body, so the viewer route changes nothing).
- **Revoke / list issued share links** — there's no UI for an operator to see or revoke past share links. JWTs are stateless by design, so revocation requires either a server-side issued-tokens table with explicit invalidation, or a tenant-scoped issued-at threshold. Tracked for Phase 11+ once we know how often operators want to invalidate a leaked link.
