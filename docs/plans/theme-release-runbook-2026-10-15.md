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

## Results of the read-only checks and the resulting per-card plan (Oct 15, ~6:50 PM CUN)
Source: Production-Migrate ran the same SELECTs as `site-design-drift.mjs` plus the release and draft tables through the Supabase connector. No writes. Figures below are as reported to the Posts chat; not re-run here. The `demos:rebuild` preview was not run (needs the dev server and `CRON_SECRET`).

**One assumption in the first version of this runbook is false:** it assumed an open gridline draft for `actionRunDryRun`. There is none (all discarded 10-14), so that dry run has nothing to run on.

**STOP flag (for Oran): TAL-93900 (jorg-beauty-qa).** Site on maison-v2 v23, but its published shell is stamped v21. That is the "stale publish" case, and it trips the drift script's exit-1 rule for TAL-93900/TAL-93938. It is a QA site, not the real Jorgelina site. TAL-93938 itself is clean (v23, shell 23). Decision for Oran: re-publish the QA site's shell (a write, via Production-Migrate) or accept the stale stamp; no script should "fix" it automatically.

**Why mono and solace show base 15 while their sites sit on v1** (code read: `theme-template/drafts.server.ts` `openThemeDraft` sets `base_version` to the latest *snapshot* in `talent_theme_versions`, not to the live release). Their catalog snapshots reached v15 in code, but no release rows exist, so no site ever moved past v1. This is not a data bug; it is the TUL-222 hold. Releasing them would move real sites v1 to v15 in one merge, so it needs its own dry run first (see TUL-370).

| Card | Result reported | Plan |
|---|---|---|
| **TUL-165** drift | 43 published sites; 3 behind: TAL-93939 qa-fixture-free-talent v20, TAL-93901 valeria-unas v21, TAL-93940 qa-fixture-max-talent v22 (shell already 23); 1 stale shell: TAL-93900. TAL-93938 clean. Latest per design: folio 23, maison-v2 23, maison 14, frame/gridline/mono/solace 1. | All three "behind" sites are QA fixtures or personas, so no real maison-v2 tenant is behind. The "0 behind for 7 days" condition needs those three to apply the v23 update. That is the same Apply step TUL-15 proves, so use TAL-93939 or TAL-93940 as the one QA talent there and apply the other two afterwards. TAL-93900's stale shell is the Oran decision above. No code change. |
| **TUL-370** drafts | gridline: 8 sites all v1, no release rows, only draft discarded 10-14. solace: 2 sites v1, draft base 15 discarded. mono: 1 site v1, draft base 15 discarded. folio: 9 sites all v23; releases v16 and v23 published; release rows v17-v22 still `draft` although the drafts 17 to 22 show published; newest draft (base 23) discarded. | **gridline:** nothing pending. No v2 exists, so there is nothing to dry-run or release; close the card item and keep the first release for when a v2 is authored. **solace, mono:** do NOT release the v1 to v15 jump. Run `sync-status.mts` (read-only) and the Builder Lab dry run on a release cut from the v15 snapshot to see the item list per site, then decide release (staged, demos first) or leave on hold; closing the discarded drafts is already done. **folio:** the stuck v17-v22 rows are the documented case "a failed dry run or demo update leaves the release on draft; the version is published either way" (`publishAndUpdateDemos`). Every folio site is on v23, so they are obsolete. Run `delete-empty-drafts.mts` without `--yes` (it lists only empty, unreferenced drafts); any that carry items are closed through the release manager's channel change. Both are writes: Production-Migrate, Oran watching. |
| **TUL-15** chain proof | maison-v2 latest 23, all folio/maison-v2 demos current. | The staged Maison v2 release Oran approved is already reflected (latest 23). The remaining proof is the talent side: on ONE QA talent (TAL-93939 or TAL-93940) the update notice appears and Apply works, then the drift script shows 0 behind. Apply is a write as that talent: Production-Migrate. Demo rebuild preview still to run. |
| **TUL-38** | n/a | Still on hold (Oran, TUL-408). |

## Decisions (PM, Oct 15, 6:55 PM CUN) and the exact steps for Production-Migrate
Both writes below go through the Production-Migrate chat with Oran's live yes in that chat. **Never touch TAL-93938.** Run every `--dry-run` first and paste it on the card.

Decisions: (1) TAL-93900 (jorg-beauty-qa, QA site): republish its shell to v23; do not accept the stale stamp. (2) Apply v23 on TAL-93939 (qa-fixture-free-talent, v20) to unblock TUL-15 and TUL-165, then re-run the drift check. (3) Folio release rows v17-v22: leave them; a Later cleanup card owns them (`delete-empty-drafts.mts` stays unused for now). (4) The dry-run scripts that need keys are parked until Oran picks a time.

### A. Apply v23 on TAL-93939
From `web/` (the `.env.local` of the target database; same command shape as the script header):
```
TSX_TSCONFIG_PATH=scripts/demo-talents/tsconfig.json \
  node --require ./scripts/register-server-only-test.cjs --import tsx \
  --env-file=.env.local scripts/upgrade-site-designs.mjs --design maison-v2 --site TAL-93939
```
1. That is the default **dry run** (reads only): expect `v20 -> v23`, the sections/tokens changed, "edits kept", and either "publishable" or "needs publish (live differs from draft)". Paste it.
2. With Oran's yes, the same command plus `--apply` (**not** `--all --confirm-all`): the draft is written through the app's own draft writer (history entry, `draft_rev` check), and the site is published only when the live site already equals the draft. If it prints `draft written: needs publish`, the QA owner publishes from the builder (app-native), or it is left as a draft.
3. Verify: `npm run site:design-drift`. TAL-93939 must no longer be listed as behind. TAL-93938 must read v23 / shell 23 and the exit code must not be 1 for it.
Limit to know: this script path **does not exercise the update notice or the Apply button**. For TUL-165 (drift reaches 0) it is enough. For TUL-15's "notice appears, Apply works" proof the QA talent must apply from their own workspace (`applyThemeUpdate`); if nobody can sign in as TAL-93939, record the UI half of TUL-15 as not proven rather than counting the script run as proof.

### B. Republish TAL-93900's shell to v23
`upgrade-site-designs.mjs` only *flags* a site that is current but stale-published (`current ... STALE-PUBLISH (live shell stamped v21, needs publish)`); it never republishes it, so there is no script step.
1. Precondition (dry run above with `--site TAL-93900`): the row shows `v23 current  STALE-PUBLISH(v21)` and `pagesUnpublished`. Note unpublished page edits go live with a publish; it is a QA site, but write the count down.
2. Preferred: the QA owner clicks **Publish** in the builder (the app's own path, which rewrites the published shell from the draft). Needs a signed-in session as that owner.
3. Not recommended: a hand-written SQL update of `shell_published`. If it is ever the only option, diff `shell_tree` against `shell_published` first and confirm the design stamp inside reads v23, because a copy of a shell whose own stamp is older recreates the problem.
4. Verify: `npm run site:design-drift` shows no stale shell for TAL-93900 and exits 0.

## Not verified here
I read the code and script headers only. Not confirmed: the exact `actionRunDryRun` UI path, whether the `sync-status` output format matches the QA expectations on the cards, and any row counts. First dry-run output replaces these assumptions.
