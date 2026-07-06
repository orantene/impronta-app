# Handoff: Admin-shell i18n (localize the agency staff workspace)

> **First read `web/docs/handoffs/README.md` (shared context: the i18n system, house rules, gates, dev/QA env, single-catalog-writer rule) and memory `project_premium_finish_2026.md`.**

## Goal
Make the **agency staff workspace (admin shell) bilingual (en/es)**, the same way the public + client + talent surfaces already are. Impronta is a Spanish-market agency, so its staff work in Spanish — this is real value, not just completeness. The public funnel, client dashboard, talent settings, InquiryDrawer, and shared enums were localized on **PR #712**; the admin shell is the last surface still hardcoded English.

## Where this stands
- A QA audit found only ~31 of ~228 admin-shell files use translations; the SPA (thread renderer, overview, drawers, roster) is hardcoded English while the top bar already ships a locale toggle — so a staffer who picks Spanish gets a half-English workspace.
- **Wave 1 (the live inbox thread: `admin-2.tsx` = `AdminInquiryDetail`, `admin-4.tsx`) is DONE and committed** on PR #712's branch (`fix/premium-finish-wave1`, worktree `/Users/oranpersonal/Desktop/impronta-polish`, commit `c278d2cf3`): 72 `dashboard.adminThread.*` keys, en/es parity 2196/2196, tsc+lint clean. **Start at wave 2.**
- **Branch discipline:** check whether #712 has merged. If yes, work off `main`. If not, **continue on `fix/premium-finish-wave1`** (the catalog with all the i18n — 2196 keys — lives there; building off older `main` would collide the catalogs). Verify current namespace/parity before adding more.
- **Wave 1 left one thing for wave 2:** the `StatusSheet` component's typed discriminant literals (`stage`: "Inquiry"/"Offer sent"/"Approved"/"Booked"/"Wrapped"; offer/payment/talent `status` unions) are BOTH rendered AND switched on, so they can't be translated at the source. Fix them with a **discriminant→label map inside `StatusSheet` itself** (render the label via `t()`, keep switching on the raw union). Same for the avatar-stack tooltip status slug (needs the enum status-label map).

## Scope + the ONLY live surface
The live agency workspace mounts **`AdminShellClient`** (an SPA: `setPage`/`openDrawer` nav) rendering `src/components/admin/shell/internal/*`. **A second, fuller shell — `admin-shell.tsx` + `admin-shell-top-bar.tsx` + `admin-command-palette.tsx` + `site-control-center/*` — is imported by nothing and does NOT render.** Do not localize that dead cone (waste + it has stale routes). Confirm what's live by tracing `src/app/(workspace)/[tenantSlug]/admin/layout.tsx` (it renders `AdminShellClient`).

Prioritize by staff traffic (do them as serialized waves — one catalog-writing agent at a time):

| Wave | Surface | Key files (verify paths; they move) |
|---|---|---|
| 1 ✅ DONE | **Inbox thread** | `internal/messages/admin-2.tsx` (AdminInquiryDetail), `internal/messages/admin-4.tsx` — committed `c278d2cf3` |
| 2 | **Thread tabs** | `internal/messages/shared/machinery-6.tsx` (Payment/Logistics), `-8`, `-10`, `-12` (Offer), `-14`, `-16` (composer) |
| 3 | **Overview / landing** | `internal/page-modules/OverviewPage.tsx` (+ the "Needs you now" hero copy) |
| 4 | **Drawers** | `internal/drawers/*`, `internal/talent-drawers/*` (monetization/network/premium-pages/events already partly touched on #712 for dead-CTA hide) |
| 5 | **Roster + clients** | `internal/wave2.tsx` (roster), `internal/page-modules/ClientsPage.tsx`, the talent inbox `internal/messages/talent-1.tsx`/`talent-2.tsx`/`TalentJobShell.tsx` |
| 6 | **Settings + nav chrome** | `internal/WorkspaceTopbar.tsx`, admin settings pages under `src/app/(workspace)/[tenantSlug]/admin/settings/*`, quick-create menu |
| 7 (optional/low) | **Platform HQ** (`/platform/admin/*`, super-admin only) | lowest priority — single super-admin user |

Each wave is a big file set; if a wave is too large for one agent pass, split it by file and still keep ONE catalog writer at a time.

## The pattern (copy an existing localized sibling)
`useT()` is available throughout the admin shell (83 internal files already call it — grep `useT` under `src/components/admin/shell/internal` for a live example). For each user-facing English literal:
```ts
// before
<button>Mark received</button>
// after
import { useT } from "@/i18n/use-t";
const t = useT();
<button>{t("dashboard.adminThread.markReceived")}</button>
// with interpolation:
import { interpolate } from "@/i18n/interpolate";
<span>{interpolate(t("dashboard.adminThread.assignedTo"), { name })}</span>
```
Add the key to BOTH `web/messages/en.json` and `web/messages/es.json` (parity mandatory — verify with the script in README). Module-level label MAPS (status→label, event→label) become key-maps resolved via `t()` at render (see the `dashboard.enums.*` additive pattern from #712). Do NOT restructure components — only swap literals for translator calls. If a string is built from complex runtime concatenation, leave it and flag it.

## Constraints specific to this project
- **Serialize on the catalog** — never run two admin-i18n agents editing `messages/*.json` at once.
- While in a file, if you spot a residual **gold/amber literal** (owner bans admin gold) you may neutralize it to a cool `COLORS.*` token in place, and remove any **em dashes** — but don't hunt beyond the file you're localizing.
- Watch the **suppressions ratchet**: if you fix a suppressed lint violation, `npm run lint -- --prune-suppressions` and commit the pruned file (see README gotcha).

## Verification (the env blocks pixel QA)
Admin surfaces are auth-gated on the app host, which does not honor `/es/` or the locale cookie cleanly for curl. **Verify at the source level:** grep that the targeted English literals are gone (now `t(...)`) and that the `es` keys exist with real Spanish, plus tsc + lint green + parity `missing=0`. Optionally dev-sign-in as an admin (`/api/dev/signin?email=<admin>@impronta.test&next=/impronta/admin/work`, creds in memory `reference_qa_credentials.md`) and confirm the page renders 200 with some Spanish present.

## Definition of done
- Every LIVE admin surface (waves 1-6) renders through `t()`; no hardcoded user-facing English remains on them (grep-clean).
- `en`/`es` parity `missing=0`; real Spanish (glossary terms kept English).
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` exit 0; `npm run lint` clean (suppressions pruned if needed).
- Committed in themed waves on the correct branch (#712's branch if unmerged, else `main`); PR updated/opened.
- Flag the platform-HQ surface (wave 7) as intentionally deferred if you stop before it, and list any strings left as runtime-concat.
