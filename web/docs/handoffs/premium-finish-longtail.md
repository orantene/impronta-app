# Handoff: Premium-finish long-tail (P2 polish + i18n remnants + ops)

> **First read `web/docs/handoffs/README.md`** (i18n system, house rules, gates, dev/QA env). These are the smaller remaining items from the 5-surface QA audit and the i18n passes. Each is independent — do them as small, separately-committed fixes (respect the single-catalog-writer rule for the i18n ones). Memory: `project_premium_finish_2026.md`.

## A. i18n remnants (finish the bilingual coverage)
All add keys to `web/messages/{en,es}.json` — **serialize** (one catalog writer at a time); keep parity `missing=0`. **Status updated 2026-07-08 after the full Platform HQ i18n sweep (waves 27-37).**
1. **`CURRENCY_LABELS`** (`web/src/lib/billing/currencies.ts`, ~7 consumers incl. platform-admin) — **DEFERRED (low priority).** Currency *names* ("US Dollar", "Euro") are semi-universal; the broad blast radius (7 consumers) is not worth it for near-zero user value. Additive pattern still applies if revisited: keep the English map, add `CURRENCY_LABEL_KEYS`, wire only the localized consumers.
2. **Taxonomy CHILD role labels** — **DEFERRED (large, separate effort).** #712 localized the 13 taxonomy PARENT labels (`TAXONOMY_PARENT_LABEL_KEYS`). The children are the full field-engine profession/skill set (hundreds of terms) — a dedicated taxonomy-i18n project, not a premium-finish remnant. Parent labels (the visible category chrome) are done.
3. **Commercial-terms/refund-policy consumers** — **DONE (wave 37, 2026-07-08).** Wired the ~5 consumers (`CommercialTermsSettingsCard`, `offer-terms-ui`, `profile-commercial-terms`, platform `PlatformCommercialDefaultsCard` + `tenant-commercial-terms-section`, light-site `ServiceMenuList`) from the raw English `REFUND_POLICY_LABELS` to the existing `REFUND_POLICY_LABEL_KEYS` via each file's translator. English map left intact (additive).
4. **`currency-options.ts` em dashes** — **DONE (2026-07-08, commit 815ef283e).** The 8 "USD — US Dollar" labels now use " · " (house middot).
5. **Backend server-action error strings** (`res.error` surfaced to users) — **DEFERRED (cross-cutting).** English regardless of locale; needs an error-code→key strategy or `getRequestLocale()` threaded into `"use server"` actions. Flagged repeatedly across the platform waves (taxonomy/operations/email/pricing/billing actions). Scope as its own task.

## B. Client P2 UX (from the client audit)
6. **Smart-reply chips can contradict thread state** — **DONE (2026-07-08, commit 078deb2db).** Chips whose normalized text matches one of the client's last 8 sent messages are now suppressed. The "coordinator reviewing" concern was already handled: `NextActionStrip` keys off `inquiry.next_action_by` (the canonical turn signal), not status alone — no change needed there (layering `last_message_from_me` heuristics would fight the authoritative field).
7. **Offer decision double-submit window** — **DONE (2026-07-08, commit c1a06cacb).** `DecisionRibbon` now tracks a `finalizing` flag: on Approve/Decline success the drawer fires `onFinalize`, which disables all three ribbon buttons and shows a persistent "Finalizing your decision…" strip until the parent refresh unmounts the ribbon (closing the stale-status gap). Counter is untouched (it doesn't finalize the offer).

## C. Admin P2 (from the admin audit)
8. **Emoji-as-icon in live chrome** — quick-create items (`internal/WorkspaceTopbar.tsx` 📨📅👤🏷👥💬🔗), `⚠`/`◆`/`✦` in `machinery-14`/`OverviewPage`/`machinery-6`. Replace with the existing `<Icon>` system for a finished look.
9. **Dead admin-shell nav (latent) — DO NOT bulk-delete; it is entangled.** Verified 2026-07-08: only `src/components/admin/shell/admin-shell.tsx` itself is provably unmounted (no `app/` route imports it — the live shell is `admin-shell-client.tsx`). But its dependencies are NOT dead: `admin-shell-top-bar.tsx` and `site-control-center/*` are shared with LIVE code — `useUpgradeModal` (from `site-control-center/upgrade-context.tsx`) is used by the live `account/account-drawer-content.tsx:77`, and `admin-nav.ts:184` references `site-control-center`. So the site-control-center directory (12 files: upgrade-modal, capability catalog, plan-tier toggle, etc.) is a LIVE feature and must stay. A safe cleanup would delete ONLY `admin-shell.tsx` (+ `admin-command-palette.tsx` if it has no live importer) after tracing each `from "@/components/admin/..."` importer and confirming it is inside the dead cone — a careful per-file untangling, not a `rm -r`. Low ROI (nothing ships from it); left deferred.

## D. Talent P2 (from the talent audit)
10. **Fixture/demo data in preview mode** — `internal/talent/shared/client-conversations-2.tsx` + `MY_TALENT_PROFILE` render fabricated conversations whenever there's no bridge identity. The bridge fallback is guarded for real talent (`conversation-adapter-1.tsx` returns `[]`), so real users are safe — but confirm no unauthenticated/preview path is reachable in production that would show fake talent.
11. **Booking-terms field-level errors** (`talent/settings/CommercialBookingTermsCard.tsx`) — one card-level `error` flag paints all three inputs red. Make error state per-field.

## E. Misc
12. **`/inquiry-sent` orphan route** (`web/src/app/(public)/inquiry-sent/page.tsx`) — unreferenced (nothing links to it); the success UX uses an inline panel. Delete it, or allow-list it if you find a real redirect. Left un-allow-listed on #712 (it 404s but nothing hits it).

## F. Ops (some are OWNER-only)
13. **Purge prod QA test rows** — test inquiries created during QA (e.g. `contact_email='jon360-qa@example.com'` and favorites-QA rows). Deleting prod data is **prohibited for the agent** — prepare a tight, `SELECT`-verified scoped `DELETE` and hand it to the owner to run (Supabase MCP `pluhdapdnuiulvxmyspd`).
14. **Reseed fidelity goldens** — after #712's intentional visual changes (avatars, admin colors) the CI fidelity PNGs are stale/red. Reseed via the fidelity `workflow_dispatch` (Actions-write; the agent's gh PAT can't dispatch — **owner runs it**).
15. **Teardown** — remove finished worktrees (`git worktree remove …` for `impronta-polish`/`impronta-rehome`/`impronta-golive`/`impronta-flowgaps` once their PRs merge) and stop any lingering dev servers/proxies.

## Done
Each item committed as its own small fix (grouped sensibly), tsc + lint clean, parity `missing=0` for the i18n ones, PR(s) to `main`. Items 13-14 are owner actions — surface them, don't attempt.
