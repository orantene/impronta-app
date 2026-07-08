# Handoff: Admin-shell i18n (localize the agency staff workspace)

> **First read `web/docs/handoffs/README.md` (shared context: the i18n system, house rules, gates, dev/QA env, single-catalog-writer rule) and memory `project_premium_finish_2026.md`.**

## Goal
Make the **agency staff workspace (admin shell) bilingual (en/es)**, the same way the public + client + talent surfaces already are. Impronta is a Spanish-market agency, so its staff work in Spanish — this is real value, not just completeness. The public funnel, client dashboard, talent settings, InquiryDrawer, and shared enums were localized on **PR #712**; the admin shell is the last surface still hardcoded English.

## Where this stands (updated after waves 1-26)
**The entire AGENCY staff workspace is now bilingual — done and committed on PR #712** (`fix/premium-finish-wave1`, worktree `/Users/oranpersonal/Desktop/impronta-polish`), across 26 serialized waves. Catalog grew to **5092 `dashboard.*` JSON keys** (en/es parity exact) plus **~1967 `ES_TEXT` entries**; every wave was tsc + lint gated. What's localized:
- Inbox thread (admin-2/admin-4/StatusSheet + all machinery-* tabs) for admin + talent + client POVs
- Overview, command palette, daily surfaces (Work/Inbox/Clients/Calendar), roster (wave2.tsx)
- Management pages (Workspace/Operations/Billing), site/website builder, Pitches
- ALL 11 talent-drawers, ALL 23 `light-*` drawers (~130 drawers), all standalone drawers
- `drawer-shared.tsx` (5.5K-line hub) bodies, and the cross-consumer discriminant slices (`nextActionFor`/`STAGE_LABEL`/`describeSource`/`FREE_PLAN_VALUE`/`PLAN_META` etc.)

**Branch discipline:** if #712 has merged, work off `main`; else continue on `fix/premium-finish-wave1` (the catalog lives there). Verify current parity before adding more.

## The ONLY remaining surface: Platform HQ (lowest ROI — decide before doing)
`/platform/admin/*` (`src/app/(workspace)/platform/admin/**`) is the platform **super-admin console** — **116 files, ~87 still English** (tenants, catalog, taxonomy, flags, integrations, audit log, currency/payout settings). It is used by a **single super_admin** (the owner) to administer the whole platform, so its i18n ROI is near-zero (one bilingual user) and it's ~10 more serialized waves. **Recommendation: leave it unless the owner explicitly wants it.** If doing it: same patterns/gates as above; these are mostly `useT()`+catalog server/client pages (29 already use a translator). Go by traffic: `page.tsx` landings → `tenants/*` → `catalog/*` + `taxonomy/*` → `settings/*` → `operations/integrations/audit-log/languages`.

## Notes carried out of the agency-shell waves
- **`StatusSheet` discriminant maps** (`stage`/`status` unions) were solved with an OPTIONAL `t?` + a discriminant→key map inside StatusSheet (render label via `t()`, keep switching on the raw union) — reuse this pattern anywhere a value is both rendered and switched on.
- **Dead cones skipped** (never localize): the unmounted `admin-shell.tsx` cone; `LegacyTalentTypesDrawer`; `WorkspaceRevenueDrawer`; assorted fixture record CONTENT + persisted enum `value`s.
- **De-gold follow-up:** many drawers still carry `COLORS.amber*`/`bg-admin-amber-*` literals (owner bans admin gold). Waves 14/16/19/21/22/23/26 flagged specific file:lines; a de-gold task (`task_9ffdbaae`) was spawned. This is a separate sweep (see `premium-finish-longtail.md`).

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
