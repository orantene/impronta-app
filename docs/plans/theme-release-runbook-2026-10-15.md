# Theme release chain: dry-run plan and write runbook (TUL-15, TUL-165, TUL-370, TUL-38)

Oct 15, 2026. Plan only: no data, no secrets, nothing here was run. Every command below is quoted from the script's own header; the one rule that overrides all of it:

- **Reads** (dry runs) need prod credentials or a platform-admin session. The Posts builder chat has neither and does not handle secrets.
- **Writes** (release, close, demo rebuild, stamp, apply) change the shared database. They go only through the **Production-Migrate** chat with Oran watching. Never **TAL-93938** (the real Jorgelina site): demos first, her site last and only with Oran's explicit yes.

## The chain in code
| Step | Entry point | Writes? |
|---|---|---|
| Draft authored | Builder Lab, table `talent_theme_drafts`; `previewThemeDraftPublish` (`theme-template/publish.server.ts`) | preview: no |
| Version cut | `publishThemeDraft`, `publishAndUpdateDemos` (same file) | **yes** |
| Release row | `app/(workspace)/platform/admin/builder-lab/themes/actions.ts`: `actionRunDryRun` (read-only); `actionSaveRelease`, `actionChangeChannel`, `actionResyncDemos`, `actionSetRollout`, `actionSetPaused` | dry run: no; rest **yes** |
| Update notice | `theme-releases/lazy-fan-out.server.ts` (only for published `optin`/`default` releases); UI `ThemeUpdateNotice` / `ThemeUpdateSheet` | creates `talent_site_theme_updates` rows |
| Talent applies | `theme-releases/talent-update/talent-update-actions.ts`: `previewThemeUpdate` (read); `applyThemeUpdate` (**write**) | apply: yes |
| Demos refreshed | `npm run demos:rebuild` (`scripts/demo-talents/rebuild.mjs`) | dry run by default; `--write` **writes** |

Tables: `talent_theme_releases`, `talent_theme_versions`, `talent_theme_drafts`, `talent_site_theme_updates`.

## Read-only dry runs (what to run, in this order)
Run from `web/`. Output of each is the proof attached to the card.
1. **Draft/release state, all designs.** `NODE_PATH=scripts/demo-talents/stubs npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local scripts/theme-releases/sync-status.mts` (add `--only maison-v2` or `--only gridline`). Reads only; shows catalog version, snapshots, releases, and whether a sync would cut a release.
2. **Gridline dry run (TUL-370).** Builder Lab, platform admin: `actionRunDryRun` for gridline's draft. Read-only. Gridline = 8 real sites at v1, no release rows, one open draft (audit `docs/plans/theme-system-audit-2026-10-08.md` section 5).
3. **Empty drafts.** `npx tsx --env-file=.env.local scripts/theme-releases/delete-empty-drafts.mts` (no `--yes`): lists what it would delete.
4. **Stamp report.** `scripts/theme-releases/stamp-sites.mts` with no flags: dry run, reads only, per-site report (pinned vs catalog version, matched nodes, talent-added nodes). A site with no snapshot is never written.
5. **Drift (TUL-165).** `npm run site:design-drift`: SELECT only. Lists published sites BEHIND the latest published release, and stale shell stamps. **Exit 1 means TAL-93900 or TAL-93938 is drifted: stop and tell Oran.**
6. **Demo rebuild preview (TUL-15).** `npm run demos:rebuild` (no `--write`): dry run for every design. Needs the dev server up and `CRON_SECRET` from `.env.local` (sent as a bearer token, never printed).

## Per card
- **TUL-370, release or close old drafts.** Stale open drafts: solace (v15), mono (v15), folio (v23), gridline (v1, 8 real sites), plus 2 QA designs. Decision table per draft: release (needs the gridline dry run first) or close. The 7 no-op drafts are already closed (PM, 10:26 AM). Deliverable: the table with dry-run output; releasing or closing is a write.
- **TUL-15, prove the chain live.** Evidence in this order: (a) steps 1 and 5 before; (b) the approved Maison v2 staged release (demos first, TAL-93938 last): release row `actionSaveRelease` then rollout `actionSetRollout`, then `demos:rebuild --design maison-v2 --write` (backup/restore exists: `--restore <runId>`); (c) on ONE QA talent: update notice appears, Apply works; (d) steps 1 and 5 after: new release row present, demos at the new version. All of (b) and (c) are writes.
- **TUL-165, updates not reaching Maison v2 sites.** Evidence only: step 5 shows 0 behind. The card's "0 behind for 7 days" is time-gated; no code change expected. If sites are behind, the cause is a missing published release row or a never-applied notice, and the fix is TUL-15's release.
- **TUL-38, a theme per demo talent.** On hold (Oran: no new themes beyond Folio, Maison and Gridline; blocked by TUL-408). Plan only: the mapping is `theme-catalog/theme-demos.ts` (`THEME_DEMOS`) and the apply tools are in `scripts/demo-talents/`. Nothing to build until Oran releases the hold.

## Write runbook (Production-Migrate only)
1. Take a backup/snapshot as the tools require (`demos:rebuild` writes a run id for `--restore`).
2. Order: Maison v2 demos, then one QA talent, then opt-in rollout. TAL-93938 last and only with Oran's explicit yes. `stamp-sites --yes-write` also needs `--allow <codes>` and refuses TAL-93938.
3. After each write run steps 1 and 5 and paste the output on the card.
4. Rollback: `demos:rebuild --restore <runId>`; for a release, `actionSetPaused` pauses rollout (does not undo applied updates).

## Not verified here
I read the code and script headers only. Not confirmed: the exact `actionRunDryRun` UI path, whether the `sync-status` output format matches the QA expectations on the cards, and any row counts. First dry-run output replaces these assumptions.
