# Media & Platform Execution Plan — 2026-08-15

Successor to `media-ownership-and-brand-library-plan-2026-08-10.md` (phases 0-4 all shipped)
and `media-pricing-pass-2026-08-15.md` (decisions accepted, wired in #1109).

**How this was produced:** three independent read-only audits against `origin/main`
@ `daead02b8` (UX, correctness/security with live SQL against production, ops/infra),
plus the owner's open-decision list and screenshot findings from the live drawer.
Every finding below was **verified in code or SQL**, not speculated. File:line refs
are as of `daead02b8`.

**State of the world this plan starts from:** media-ownership program complete
(#1092, #1100–#1109 all live), both flags ON in prod, quotas enforced, reaper merged
in dry-run, `media_grants` = 0 rows / `talent_agency_permission_requests` = 0 rows —
meaning **every release-flow bug below fires on the FIRST real release**, not on
existing data. That is the window this plan exists to use.

---

## 0. The honest headline

The program's read paths are solid: one predicate in one place, tenant-scoped
helpers, implicit grants that made both flag flips true no-ops, a reaper that
aborts rather than guesses. The defects cluster in exactly two places:

1. **Failure paths.** Writes that half-succeed (watermark bake), caches that
   don't bust (all-hubs revoke), errors that fall open (resolver RPC), and
   promises in copy with no code behind them (14-day objection window, 30-day
   request expiry, "un-publish everywhere").
2. **The last mile of UX.** The features work but don't explain themselves:
   dead-looking buttons, a "0 selected" that reads as an empty site,
   notifications that deep-link to a stub drawer.

Plus one **design-level P0** that is not a bug but a fact to decide on: all
1,940 live media objects sit in a `public = true` bucket, so the two-key rule
and watermark-on-release control *which URL pages render*, not *who can fetch
the bytes*. Revocation is advisory against anyone who saved the URL.

---

## 1. P0s — decide or fix before the first real release happens

### P0-1. Enforcement is presentation-only over a world-readable bucket  (DESIGN DECISION, L)
`storage.buckets`: `media-public` is `public=true`; 100% of live media is in it.
The two-key predicate and watermark condition gate URL *selection*
(`talent-media-for-hub.ts:405`, `watermark-on-release.ts:143`); the
unwatermarked original stays permanently fetchable at a stable public URL.
Concrete: hub B gets a watermark-required release, right-clicks agency A's own
storefront (where the implicit owner key serves it unwatermarked), and embeds
the original. Revoke stops *rendering* it; the URL keeps working forever.

**Options:**
- (a) **Accept and re-document** — two-key + watermark are curation controls,
  not access controls. Fix the copy that says "un-publish everywhere"
  (`admin-media-release.ts:16`, `media-release-requests.ts:427`). Effort S.
- (b) **Private bucket + signed URLs or `/api/media/[id]` proxy** calling the
  predicate per request. Real access control, real revocation. Effort L, touches
  every render path, has CDN/caching costs on the free tier.
- **Recommendation:** (a) now — with the copy fix in Batch B — and put (b) on
  the roadmap gated on the first paying workspace that asks for real takedown.
  Pre-revenue, the exposure is reputational, not contractual.

### P0-2. Release notifications land on a drawer that does not exist  (S)
`media-grants-shared.ts:222-234` emits `targetDrawer:"talent-media"`; `:269`
emits `"media-releases"`. Neither id exists in the shell switch
(`drawers.tsx:94-235`) → both open the `SimpleStubDrawer` placeholder
("Coming up next"). Both halves of the two-key flow hit this at their moment of
highest attention. **Fix:** map `talent-media` → talent profile shell
`{mode:"edit-self", section:"media"}`; `media-releases` → workspace media page.
Add a static test asserting every emitted `targetDrawer` resolves to a real case.

### P0-3. "0 selected" reads as "nothing on your site" — it is false  (S/M)
With no curation the site serves the **default rank**; the resolver even returns
`source: "curation"|"default"` for exactly this purpose and no UI consumes it
(`talent-media-for-hub.ts:184-190`; panel `talent-hub-face-panel.tsx:364-371`).
Staff panic-curate or believe the site is blank. **Fix:** empty-state copy
"Showing the default selection — pick photos below to choose your own," and
(M variant) outline the tiles the default rank currently picks.

### P0-4. Curation saves are silent no-ops when the faces flag is off  (S)
`isPerHubFacesEnabled()` is read by the resolver only; zero components import it.
With the flag off, every write succeeds, audits, busts caches, and prints
"Selection saved." while the site is byte-identical. Prod is ON today so this is
a QA/preview/local trap, not a live customer bug — but it is the exact "save
that looks like nothing happened" class the program was built to kill.
**Fix:** pass the flag into the panel; render a banner "Per-site photo selection
is not switched on yet — your selection will apply when it is." Keep the writes.

---

## 2. Batch A — trust & safety hotfix (1 migration + 1 PR, all S/M)

One lane, highest value per line of code. Everything here is verified.

| # | Finding | Fix | Effort |
|---|---|---|---|
| A1 | `mg_update_own_subject` WITH CHECK checks only `grant_kind='subject'` — an authenticated talent with one asset can PATCH their subject grant to point at ANY asset UUID, forge `granted_by`, clear `revoked_at` (migration `20261115000000`:305-318, confirmed live in pg_policy). Bounded today (owner key still gates publishing) but it forges consent records and becomes a bypass the moment owner grants are written independently. | Copy the `EXISTS(… tp.user_id = auth.uid())` subquery into WITH CHECK + require `granted_by = auth.uid()`. One ~8-line migration. | S |
| A2 | `media_grant_active` / `media_asset_presentable_on_tenant` / `media_assets_presentable_on_tenant` are `GRANT EXECUTE TO anon` — an anonymous caller holding an asset UUID can enumerate every hub that asset presents on, leaking non-public roster membership (the predicate joins `agency_talent_roster` directly). The storefront never calls these as anon. | `REVOKE EXECUTE FROM anon` on all three, same migration as A1. | S |
| A3 | Resolver **fails open** on the privacy predicate: `talent-media-for-hub.ts:124` returns ALL candidates on any RPC error. A Supabase throttle event (chronic on this free tier) publishes un-consented photos on third hubs, silently. The cosmetic path (watermark) fails closed; the privacy path fails open — backwards. | Fail closed on error (cards fall back to defaults/initials). | S |
| A4 | Failed watermark bake ships an approved, notified, **invisible** release: `admin-media-release.ts:123-135` discards `bakeWatermarkedVariant` results; bake can fail on download/fetch/sharp/upload; grant already exists with `watermark_required=true`, resolver correctly refuses the original → photo invisible on target hub, both parties told success, nothing retries, and the manual bake route refuses when the preset is disabled. | Collect bake results; on failure roll the approval back (or partial-success message naming failed assets) + a repair action for missing derivatives. | M |
| A5 | Revoking an `all_hubs` release busts **no cache on any hub that showed it**: `media-grants-shared.ts:297-305` busts owner tenant + `targetTenantId`, which is NULL for all_hubs by check constraint. Third hubs serve the photo until natural cache expiry. | For null target, resolve affected hubs (active roster + curation rows) and bust each; or add a global `media-grants` tag every hub resolver keys on. | M |
| A6 | Revoke is **over-broad**: `media-release-requests.ts:462-467` revokes ALL owner grants on the asset (no tenant filter) while the UI card is per-target with a named hub. Staff ending release-to-B silently kills releases to C and D. | Decide the semantic (see D-6), then either scope the UPDATE by target or change the card copy to say "everywhere". | S |
| A7 | SSRF in the bake: `watermark-bake.ts:247` fetches `agencies.settings.branding.logo_url` verbatim — tenant-admin-controlled, no scheme/host check (blind SSRF, authenticated). | Allowlist the Supabase storage host. | S |
| A8 | Signed-upload finalize checks quota **after** the object is in storage (`admin/media/actions.ts:2208-2241`); refusal leaves a real orphan the dry-run reaper won't delete → a capped talent can burn unbounded storage. | Check the count before issuing the signed URL, or delete the object on refusal. | S |
| A9 | Reaper: 4 of 5 reference loaders paginate with `.range()` and **no ORDER BY** (`reap-orphaned-media-scan.ts:168,195,244,271`) — unstable order can skip rows at >1 page; a skipped reference is a live object deleted. All sources fit one page today; detonates with growth + `MEDIA_REAPER_ENABLED=true`. | Add `.order("id")` to all four. Must land BEFORE any live run. | S |
| A10 | Reaper's weekly report reaches nobody: full report only in the HTTP response Vercel discards; only failures alert. | Structured-log `wouldDelete`/`keptByReason`; platform notification when wouldDelete crosses a threshold. | S |

**Definition of done for Batch A:** migration applied via MCP (CLI db push is
blocked by history drift — record the version row), all existing test lanes
green, plus new tests: WITH CHECK refusal, fail-closed resolver, bake-failure
rollback, all-hubs bust set.

---

## 3. Batch B — UX honesty pass (1-2 PRs, mostly S)

The panel works; it just lies by omission. Ordered by user pain.

| # | Finding | Fix | Effort |
|---|---|---|---|
| B1 | P0-2 stub-drawer notifications (listed above; belongs in this PR). | Map both drawer ids + static test. | S |
| B2 | P0-3 "0 selected" empty-state (above). | Copy + optional default-tile outline. | S/M |
| B3 | P0-4 flag-off banner (above). | Server passes flag → banner. | S |
| B4 | "Make cover" contrast is **inverted**: enabled `text-admin-ink-dim` (0.38 alpha) vs disabled `text-admin-ink-muted` (0.72) — the dead button is twice as loud (`talent-hub-face-panel.tsx:263-272`, `admin-color-bridge.css:48-49`). Same inversion on ↑/↓ (:282,:291) and Decline (`media-release-requests-panel.tsx:217`). | Swap the pair AND hide Make-cover until the tile is selected. Grep the admin tree for the same pair — this token trap will recur. | S |
| B5 | Two commit models in one panel: selection is deferred (Save selection) but cover/caption/visibility/reorder write **immediately** — Make-cover during a dirty selection changes the live site without a save, shares `saveState`, and shows no confirmation (`talent-hub-face-panel.tsx:94-178,364-371`; `setHubCoverAsset` persists a cover with an empty selection while `setHubMediaSelection` clears covers outside it). | Make-cover auto-selects the tile and joins the deferred save (one commit model). | M |
| B6 | Captions/visibility/reorder only appear after save: strip gates on server-persisted `photo.selected`, not draft `isSelected` (`:274`). #1104's features are invisible until you save once. | Gate on `isSelected`, disable-until-saved with tooltip. | S |
| B7 | Visibility toggle unexplained: `◉/◎` glyphs, tooltip and aria-label disagree, and the actual semantic (hidden keeps caption+order) exists only in a server type comment. | "Hide from site (keeps caption and order)" + eye-slash icon. | S |
| B8 | Two "Cover" concepts on one screen: profile 16:9 banner vs per-hub card face, and the per-hub one silently outranks on cards. | Rename by where it shows: "Profile banner · 16:9" vs "Card face on this site" + one-line hint. | S |
| B9 | Locked tile says "Ask them to release it" with no link — the request UI is in a different surface. | Deep-link "Request release" from the locked tile (`media-picker-drawer.tsx:389-401` → profile shell media section). | S |
| B10 | Declined release is indistinguishable from never-asked; no decline reason captured anywhere; notification is DB-row only. | Return `deniedAt` in the lock payload → "Not released. You can ask again."; optional reason textarea on Decline. | M |
| B11 | No withdraw for a pending request ( `'cancelled'` status exists in schema, never written) and **no server-side duplicate guard** (`requestMediaRelease` inserts unconditionally). | "Withdraw request" action + pending-lookup guard. | S |
| B12 | 14-day objection window & 30-day request expiry are decoration (see D-3). The "14" is hardcoded in the string, separate from the constant; `objectionDeadline` reaches zero .tsx files; no talent-side objection action exists; talent can't read the audit trail. | Per decision D-3: cut the copy now (S) or build enforcement (M/L). Either way, interpolate the constant. | S→M |
| B13 | Quota has no pre-upload warning anywhere and nothing shows "N of M photos"; only 1 of 8 surfaces renders the 80% warn, post-hoc; `actionReassignMediaToTalent` is ungated. | Return `{used, cap, remaining}` from library endpoints; usage line in picker + Media header; warn field on the 7 server actions; gate reassign. | M |
| B14 | Watermark tick never says the choice is permanent-per-release (revoke-and-redo is the only edit). | One sentence in the hint. | S |
| B15 | Declined/revoked requests vanish with no history. | Collapsed "Past decisions" list. | S |
| B16 | Collections: creation is one date field in a folder modal; no chip on the folder row, no header in the grid. | "Collection" chip + shoot-date grid header. | S |
| B17 | Download row explains original-vs-web-size but never mentions watermark status. | One line in the result copy. | S |
| B18 | Cross-hub story (§P3 "three faces") has zero UI — the flagship differentiator is one sentence of body copy. | "Also represented on: {hubs} — each site chooses its own photos" strip (roster query only; do NOT show other hubs' selections). | M |

---

## 4. Batch C — ops & infra debt (small PRs, independent)

| # | Item | Current state (verified) | Action | Effort |
|---|---|---|---|---|
| C1 | Perf budget CI | `builder-fidelity.yml:147` still `continue-on-error`, and the job is RED today: renderer CSS 88.5 KB vs 70 KB ceiling, identical across all 7 themes = one shared regression (suspect: recent builder feature, likely social_feed). | Bisect the CSS addition; trim or deliberately re-tune to ~90-95 KB; then remove `continue-on-error`. Do not silently bump. | S diagnose / M fix |
| C2 | Orphaned crons | `domain-verification`, `inquiry-engine`, `publish-scheduled` route files exist, CRON_SECRET-gated, look production-intended — and have NO schedule in vercel.json, likely never ran since April. Scheduled publishes / inquiry sweeps may be a live functional gap. | Owner decides per route: dead code (delete) or missing schedule (add). Don't guess. | S |
| C3 | E2E secrets | `admin-boot.yml` runs on every PR but all real steps skip without `E2E_SUPABASE_*` (visible warning, easy to miss) — the sev-1 chunk-eval crash class (#971) has zero regression coverage. `builder-e2e.yml` is dispatch-only. | Provision an isolated test Supabase project; add 3 secrets (+2 admin creds for builder-e2e). No code changes needed. | S |
| C4 | Social token refresh kills integrations permanently | Any single refresh failure (incl. transient Meta 500) writes `status:"error"`, excluded from every future sweep; TikTok tokens live ~24h vs 6h cron; nobody is notified; TikTok's rotated refresh token is stored in two non-atomic writes. | Retry 5xx/network with `consecutive_failures`; only `needs_reconnect` on 4xx or N failures; notify the tenant on transition; single atomic secret write. | M |
| C5 | Feed cache cleanup | `feed-cache.ts:175-181` builds a PostgREST filter by string interpolation from vendor ids, discards the error; `:162` returns before deleting when an account empties — stale posts render indefinitely. | `.filter()` chaining or RPC; check errors; handle the empty-account path. | S |
| C6 | Parked WIP `wip/topbar-identity-logo-park` | 3 code files (TulalaBrandLockup wordmark+tagline; platform topbar swap; IdentityBar unification) apply to today's main with ZERO conflicts; the 751-line launch.json diff is dev-machine noise. | Cherry-pick the 3 files onto a fresh branch, drop launch.json, PR. The design call ("always show tagline everywhere?") is the owner's. | S |
| C7 | Stale remote branch | `feat/staff-accept-for-roster-talent` verified fully subsumed by #1099. | `git push origin --delete feat/staff-accept-for-roster-talent` | S |
| C8 | Branch hygiene | 787 local branches in the shared checkout; 70 are git-provable ancestors of main; the rest need content checks because the repo squash-merges (SHA-based `--merged` undercounts). | Run the safe one-liner for the 70; script a "key symbol exists on main" check for the rest; `git remote prune origin`. | S now / M full |
| C9 | Backfill script annotation | `backfill-media-ownership.NOT-A-MIGRATION.sql` has no run-record. It WAS run against prod 2026-08-15 (survey verified: 6 provenance-mirrored, 1,933 tagged, split unchanged). | Add "RAN 2026-08-15" header line so no future agent re-runs or wonders. | S |
| C10 | `media_asset_activity` retention | No retention job (workspace-audit-trim covers a different table); payloads carry user ids indefinitely. 11 rows today. | Fold into the existing trim cron with a long horizon (e.g. 24 months). | S |

---

## 5. Batch D — decisions the owner must make (each blocks specific work)

| # | Decision | Options & recommendation |
|---|---|---|
| D-1 | **Reaper first live run** | Dry-run cron fires weekly (Sun 03:40 UTC). After A9+A10 land: read one report → storage backup → `MEDIA_REAPER_ENABLED=true` + `MEDIA_REAPER_MAX_DELETIONS=25` → verify surfaces → raise cap. **Do not run before A9.** |
| D-2 | **social_feed downgrade policy** | A downgraded workspace keeps rendering the paid widget on published pages until republish. Options: (a) accept (publish-gate only — simplest, current behavior), (b) resolver-side plan check at render (correct but adds a plan read to every page render), (c) demote on downgrade event (needs a billing webhook hook). **Recommendation: (a) now, (c) when billing events exist.** |
| D-3 | **Objection window: build or cut** | The 14-day undo and 30-day expiry are copy-only, and the undo isn't even talent-triggerable. (a) Cut both promises from copy — S, honest, ship in Batch B; (b) build: talent-side objection action + expiry sweep cron — M/L. **Recommendation: (a) immediately, (b) queued behind the first real claim dispute.** |
| D-4 | **Storage access design (P0-1)** | See above. Recommendation: re-document now, private-bucket design when a paying workspace needs true takedown. |
| D-5 | **Orphaned crons (C2)** | Per-route: were scheduled publishes / inquiry-engine sweeps / domain verification ever supposed to run? If yes this is a silent 4-month functional gap. |
| D-6 | **Revoke scope semantic (A6)** | Per-target revoke (matches the UI card) vs revoke-everywhere (matches the current write + notification copy). **Recommendation: per-target**, since the card names a hub. |
| D-7 | **`expires_at` on grants: drop or build** | Predicates honor it; no writer sets it; no sweep busts caches at expiry — anyone wiring the UI later inherits a stale-cache bug. (a) Drop the column S; (b) build expiry sweep + cache bust M. **Recommendation: (a)** until a product need exists. |
| D-8 | **Parked topbar/brand lockup (C6)** | The change makes every surface show the Tulala lockup + tagline. Ship, adjust, or drop — 10-minute visual review of a small PR. |

---

## 6. Suggested execution order

1. **Batch A** (trust & safety) — one migration + one PR. Everything is S/M and
   fires on first real use. A9/A10 are prerequisites for D-1.
2. **Batch B core** (B1-B8) — the honesty pass on the panel + notifications.
   B12's copy-cut lands here per D-3(a).
3. **C1, C2, C3** — the CI gate is red *today*; the orphaned crons may be a
   live functional gap; the e2e secrets are one-time provisioning.
4. **D-1 reaper live run** — after A9, owner-triggered.
5. **Batch B extended (B9-B18) + C4-C10** — steady-state cleanup lanes,
   parallelizable across agents.
6. **The L-items** — i18n errorCode lane (~20 files, ~14 surfaces, multi-day),
   private-bucket design (D-4b), reaper resumability at 50k assets.

## 7. Standing items NOT in this plan (tracked elsewhere)

Cross-tenant audit G7 P0 (hub-filed exclusive inquiries), XTENANT_REHOME,
page-builder 8.5 program (#1014 + E2E secrets overlap with C3), /directory
client crash (blocked on user's browser console), directory profile modal #941,
favorites #699, premium finish, reviews v5. See memory index.

## 8. What is verified solid (so this reads in proportion)

`is_staff_of_tenant()` correctly tenant-scoped (the `is_agency_staff()` footgun
was avoided); all SECURITY DEFINER helpers pin `search_path`; the
one-predicate-one-place discipline held; implicit grants made both flag flips
true no-ops; the reaper's abort-on-partial-input architecture and protected
prefixes are right; claim-tool predicates re-assert on UPDATE; release decisions
re-derive eligibility at decision time; quota code correctly avoided the fetch-
memoization trap. The foundation is good. This plan is about the failure paths
and the last mile.
