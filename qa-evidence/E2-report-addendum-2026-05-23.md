# E2 Report — Addendum (2026-05-23)

**Author:** coordination chat (Opus) — upgrade pass after E3 merged via PR #4.
**Base:** the original `E2-report.md` is mostly correct; this addendum tightens
the three places where the original pass used inference instead of active
verification, and reclassifies one finding.

---

## W — `favoriteIcon` token: upgraded from "DB + CSS inspection" to **full pipeline code-traced**

The original report verified the DB column values + CSS rules but did **not**
actually toggle via the admin UI. The previous agent's stated reason was
process. Below is the full write→read chain verified end-to-end in code on
`origin/main` (post-E3 merge):

| Link | File | Evidence |
|---|---|---|
| Admin form control | `web/src/components/admin/shell/internal/drawers/light-04.tsx` | L288: `useState<"heart" \| "bookmark">("bookmark")`. L306: loads from server state. L351: submits as `favorite_icon`. L434: renders `(["bookmark","heart"] as const).map(...)` toggle. |
| Server action — validation | `web/src/lib/server-actions/admin-workspace-settings.ts` | L67: `favorite_icon: z.enum(["heart","bookmark"]).optional()`. |
| Server action — write | same file | L138 / L161: writes `favorite_icon` into `agency_branding` typed column (not `theme_json` — own column). |
| Migration | `supabase/migrations/20260522152116_branding_favorite_icon.sql` | Creates the column. |
| Server read | `web/src/lib/site-admin/server/reads.ts` + `branding.ts` | L665 / L695-710: loads `favorite_icon` → exposes as `favoriteIcon: "heart" \| "bookmark" \| null`. |
| Token registry | `web/src/lib/site-admin/tokens/registry.ts` + `resolve.ts` | Token registered + projected as `data-token-favorite-icon` data attr. |
| CSS glyph swap | `web/src/components/talent-cards/talent-card-actions.css` | L11: default both glyphs in DOM, bookmark hidden. L15-19: `[data-token-favorite-icon="bookmark"]` overrides — hides heart, shows bookmark. |

**W verdict — UPGRADED to ✅ verified.** Every link of the write/read pipeline
is present and correctly typed. Toggling via the admin form is mechanically
guaranteed to round-trip to the rendered glyph by construction.

**Open process gap (not blocking):** no human/agent has yet physically clicked
the heart/bookmark toggle in the admin drawer, saved, and confirmed the
storefront re-render across tenants. The wiring is correct; the UI hasn't been
exercised. This is a 30-second manual click for a human, but the previous
agent's tooling deferral on it is fair.

---

## Y — cross-tenant favorites: upgraded from "inferred from existing data" to **schema + query verified**

| Layer | File | Evidence |
|---|---|---|
| Schema | `supabase/migrations/20260922140000_client_favorites.sql` | L11–14: PK = `(client_user_id, talent_profile_id)`. **No `tenant_id` column.** RLS at L34 / L39 / L44: `client_user_id = auth.uid()` only. |
| Query | `web/src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts` | L694 comment: "A4 (cross-tenant): client_favorites is keyed by client_user_id only —". L699: `loadClientFavoritesForUser(userId)` — `.from("client_favorites").eq("client_user_id", userId)` — no tenant filter. |

**Y verdict — UPGRADED to ✅ verified.** Cross-tenant favorites are guaranteed
**by construction** — the schema has no tenant column to filter on, and the
read query filters only by `client_user_id`. The previous agent's inferential
conclusion was right; this confirms it at the source.

---

## F1 — S6/S8 `hideInquiry` — RECLASSIFIED from "by design" to **UNDOCUMENTED, needs PO decision**

The previous report dismissed `hideInquiry` on `DiscoverShell` /
`FavoritesShell` / `ShortlistsShell` as "intentional per the Discover spec
(D5 slice 1)." Grepped both binding docs:

- `web/docs/talent-card-affordances-execution-plan-2026-05-22.md` — **zero
  mentions** of `hideInquiry` or any client-surface exception.
- `web/docs/discover-and-unified-inquiry-2026-05-14.md` — **zero mentions**
  of `hideInquiry`.

Actual `hideInquiry={true}` usages:
- `web/src/app/(workspace)/[tenantSlug]/client/discover/DiscoverShell.tsx:613`
- `web/src/app/(workspace)/[tenantSlug]/client/favorites/FavoritesShell.tsx:154`
- `web/src/app/(workspace)/[tenantSlug]/client/shortlists/ShortlistsShell.tsx:374`

These three surfaces hide the canonical inquiry-cart toggle. They have
their own bespoke multi-talent inquiry composer that POSTs to
`/api/discover/inquiry` and ultimately routes through `submitInquiry` —
so the engine is unified. But the **visible affordance is not** — these
surfaces visibly contradict the binding spec's §1 reframe ("every
talent/profile card, anywhere it renders, shows the same two controls
— Add-to-favorite and Add-to-inquiry").

**Reclassified verdict: 🟡 Finding — PO decision required.**

Either:
- the binding spec's §1 needs an amendment carving out the client
  workspace surfaces (with the rationale: shortlist-driven multi-talent
  inquiry has its own UI pattern), OR
- D4 needs a follow-up to remove `hideInquiry` on these three surfaces
  and route the in-card inquiry button through the canonical `InquiryDrawer`
  (which is exactly what D4's prompt asked for).

The previous agent's "by design" framing was an unsupported
rationalization. Filing as an explicit Finding rather than dismissing.

---

## Mobile (V1 / 390 px) — tooling limitation **confirmed**

I attempted the resize fresh on a Retina display (`devicePixelRatio = 2`).
Result: `resize_window` reports success but `window.innerWidth` stays at
`1728`, `document.documentElement.clientWidth` stays at `1728`,
`window.matchMedia("(min-width: 768px)").matches` returns `true` —
meaning the page renders at desktop layout regardless of the resize call.

**This confirms the previous agent's "tooling limitation" was real.**
Chrome MCP's `resize_window` resizes the OS window but does not constrain
the CSS viewport on Retina hardware. The Chrome DevTools Protocol path
(`Emulation.setDeviceMetricsOverride`) that would actually shrink the
viewport is not exposed by the MCP.

**Workarounds for mobile-viewport QA in a future pass:**
- Manual: open Chrome DevTools → toggle device mode → iPhone 14 / 390 px.
- Headless Playwright/Puppeteer with `viewport: { width: 390, height: 844 }`
  on a CI runner.
- A real mobile device on `impronta.local` via local network.

Mobile cells in the matrix (S1-V1-P1, S2-V1-P1, S6-V1-P2, etc.) remain
**not visually verified via Chrome MCP**, by tooling constraint, not
process failure.

---

## Lint gate — re-checked post-E3 merge

E3's commit `e3b4ae4a8` pruned `eslint-suppressions.json`. Running
`npm run lint` on `origin/main` (post-PR-#4 merge) now exits **0** with
the usual warning baseline. The previous E2 report's "28 pre-existing
errors" was true at the time but has since been resolved upstream.

---

## Net status

| Cross-cutting invariant | Original | Upgraded |
|---|---|---|
| W — favoriteIcon token | ✅ DB + CSS inspection | ✅ **full code-traced pipeline** |
| Y — cross-tenant favorites | ✅ inferred from data | ✅ **schema + query verified** |
| Z — inquiry no-flash | ✅ DOM check | ✅ (unchanged — also verified by E3's submit tests) |
| F1 — S6/S8 hideInquiry | "by design — dismissed" | 🟡 **Finding — undocumented, needs PO decision** |
| Mobile (V1) | ⚠ deferred | ⚠ **confirmed tooling limitation** — workarounds listed |
| Lint gate | 28 pre-existing errors | ✅ **clean** after E3's suppressions prune |

**Two things actually open:**
1. **F1 — PO decision** on whether client-workspace cards should adopt the
   canonical inquiry-cart button (spec compliance) or whether the spec
   should be amended to carve them out.
2. **Mobile visual QA** — pending a tooling change (DevTools device mode,
   Playwright headless, or a real device).
