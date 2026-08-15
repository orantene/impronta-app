# Media pricing pass — quotas, watermark tier, release limits

**Date:** 2026-08-15
**Status:** DECISION DOC. Nothing here is implemented. It exists to unblock plan §9 decision 5 ("Pricing tie-in ... worth a separate pricing pass before phase 4") now that phase 4 has shipped the seam (#1105).
**Scope:** the three knobs in `web/src/lib/billing/media-entitlements.ts`. Nothing else.
**Currency:** USD only, per `feedback_primary_currency_usd`. No number in this doc is a price anyway — see §4.

**Headline:** the data says do almost nothing. Two of the three levers should stay off, and the third should be set to a number no real user can reach. The scaffold was built for a scale this product has not reached.

---

## 1. What the scaffold already supports

`web/src/lib/billing/media-entitlements.ts` is one config object plus four pure readers. It is deliberately toothless: every limit is `null`, every feature is `true`. There is a tripwire test in `web/src/lib/media/phase4-policy.test.ts` ("media entitlements ship permissive: nothing is gated yet") that fails the moment anyone lands a number here without this pass. That test working as designed is the reason this doc exists.

| Knob | Type | Today | Readers | Wiring it would need |
|---|---|---|---|---|
| `talentStorage[plan].maxBytes` | `number \| null` (bytes) | `null` on all 3 plans | `talentMediaStorageQuota`, `checkTalentStorageAllowance` | **Not wired to anything.** Needs (1) a usage reader that sums a talent's live bytes, (2) a call to `checkTalentStorageAllowance` in `web/src/app/api/talent/media/upload/route.ts` and `web/src/app/api/admin/media/upload/register/route.ts` before the `media_assets` insert, (3) UI for the `allowed:false` branch. |
| `talentStorage[plan].maxAssets` | `number \| null` (row count) | `null` on all 3 plans | `talentMediaStorageQuota` only | **Not wired, and no checker function exists.** `checkTalentStorageAllowance` only reads `maxBytes` and ignores `maxAssets` entirely. A count check has to be written. |
| `watermarkOnRelease[tier]` | `boolean` | `true` on all 5 tiers | `checkWatermarkOnReleaseEntitlement` | **Fully wired.** `lib/server-actions/admin-media-release.ts:96` already pre-flights it before recording a decision, with a plain-language refusal. Flipping a tier to `false` takes effect immediately with no other change. |
| `releaseRequestsPerMonth[tier]` | `number \| null` | `null` on all 5 tiers | `workspaceReleaseRequestAllowance` | **Read by nothing.** No call site, no counter, no rolling-window query. Everything would have to be built. |

Two properties worth preserving: unknown plan keys degrade to the *most permissive* entry (`talent_portfolio` / `network`), and the module is pure (no `server-only`, no Supabase), so callers pass in the plan key they already loaded. Both are correct. Do not change either.

Plan-key sources, for the record. Do not invent a new helper:
- Talent: `talent_profiles.talent_plan_key`, canonical helper `web/src/lib/access/talent-membership.ts` (`talent_basic` / `talent_pro` / `talent_portfolio`).
- Workspace: `agencies.plan_tier`, read by `web/src/lib/agency/exclusivity-resolver.ts`.

---

## 2. Real usage today

Measured against production Supabase (`pluhdapdnuiulvxmyspd`) on 2026-08-15, read-only.

**Column note before the numbers.** `media_assets` carries three size columns. Only one is real: `file_size_bytes` is populated on 2,307 of 2,380 rows; `file_size` on 141 and `byte_size` on 92 are legacy stragglers. All figures below use `coalesce(file_size_bytes, file_size, byte_size)`, which covers 99.6% of live talent rows. Cross-checked by joining `media_assets.storage_path` to `storage.objects` — the two agree to the byte (274.2 MB both ways), so the recorded sizes are trustworthy.

### Per-talent distribution

Cohort B is the one to design against: real talents (excluding the 39 starter seeds and 38 test accounts) that have at least one live photo.

| Cohort | Talents | p50 photos | p90 photos | p99 photos | max photos | p50 MB | p90 MB | p99 MB | max MB |
|---|---|---|---|---|---|---|---|---|---|
| A — anyone with ≥1 live photo | 113 | 1 | 48 | 85 | 108 | 0.3 | 6.9 | 13.3 | 17.3 |
| **B — real (not seed/test), ≥1 photo** | **86** | **13** | **52** | **91** | **108** | **1.5** | **8.1** | **14.4** | **17.3** |
| C — claimed (`user_id` set) | 12 | 15 | 51 | 102 | 108 | 1.8 | 5.8 | 16.0 | 17.3 |

Cohort A's p50 of 1 photo is the 39 starter seeds dragging the median down. That is why B is the design cohort.

### Totals and context

| Measure | Value |
|---|---|
| Talent profiles | 159 (12 with `user_id`, 1 with `claimed_at`, 39 starter seed, 38 test, 0 deleted) |
| Talents on each plan | `talent_basic` 153 · `talent_pro` 4 · `talent_portfolio` 2 |
| `media_assets` rows | 2,380 total · 1,940 live · 440 soft-deleted |
| Live talent assets | 1,939 (1,775 gallery · 113 card · 49 hero · 2 original) |
| Live talent bytes | 274.2 MB across 107 talents |
| Per-asset size | p50 138 KB · p90 218 KB · avg 145 KB · **max 470 KB** |
| Storage buckets | `media-public` 2,287 objects / 352.9 MB (largest object 7.13 MB) · `media-originals` 15 objects / 1.8 MB · `inquiry-files` 4 objects / ~0 MB |
| Unreferenced storage | **381 objects / 81.2 MB** with no live `media_assets` row — 23% of the bucket |
| Workspaces | 32 total: `free` 28 (27 agency + 1 hub) · `network` 2 · `agency` 1 · `studio` 1. **4 of 32 are on a paid tier.** |
| `media_grants` | **0** |
| `talent_agency_permission_requests` | **0** |
| `agency_talent_media` (curation rows) | 2 |

### Upload volume over time

| Month | Assets | Distinct talents touched | MB |
|---|---|---|---|
| 2026-04 | 5 | 5 | 0.8 |
| 2026-05 | 758 | 23 | 95.1 |
| 2026-06 | 923 | 43 | 140.9 |
| 2026-07 | 45 | 2 | 7.2 |
| 2026-08 (to date) | 208 | 65 | 30.3 |

Lumpy, roster-import-shaped, not organic-growth-shaped. The May/June spike is bulk onboarding, not 43 talents each uploading a portfolio.

### Three findings that should change the shape of any decision

1. **We are not storing originals.** The largest recorded asset is 470 KB and `media-originals` holds 15 objects totalling 1.8 MB. Everything in `media-public` is a web derivative. Phase 4 shipped an originals *policy* (`lib/media/originals-policy.ts`) but there is effectively no originals *retention*. Any byte quota calibrated on today's distribution is measuring a pipeline that does not do the expensive thing yet.

2. **Turning originals retention on would move bytes by roughly 10-40x.** A 24MP camera JPEG is typically 6-12 MB against today's 145 KB average derivative. *This is an estimate, not a measurement* — the 15 objects in `media-originals` are too few to characterise. What would firm it up: retain originals for one real shoot and re-run the per-talent byte percentiles.

3. **Soft delete does not free storage.** 440 soft-deleted rows, 381 unreferenced objects, 81.2 MB. There is no reaper. This matters directly for quota design and is called out again in §3a and §4.

Platform-wide storage is 355 MB against the Supabase Free-plan 1 GB ceiling that `web/src/app/api/cron/usage-audit/route.ts` already alarms on at 60% and 80%. The binding constraint today is the platform's own Supabase bill, not any individual talent.

---

## 3. Three decisions

### 3a. Talent storage quota by plan

**RECOMMENDATION: set generous caps that no current user can reach, and treat them as an abuse backstop rather than a product line. Ship the count check; hold the byte check until a storage reaper exists.**

| Plan | `maxAssets` | `maxBytes` | Multiple of the p90 real talent (52 photos / 8.1 MB) |
|---|---|---|---|
| Basic (free) | 150 | 2 GB (`2_147_483_648`) | 2.9x photos, 265x bytes |
| Pro ($12/mo) | 600 | 10 GB (`10_737_418_240`) | 11.5x photos |
| Portfolio ($29/mo) | `null` (uncapped) | 50 GB (`53_687_091_200`) | — |

Rationale, grounded:

- The single largest real portfolio on the platform is **108 photos / 17.3 MB**. A Basic cap of 150 clears that by 39% and clears the p90 by 2.9x. **Zero current talents would be blocked, including the outlier.** That is the point: a quota that bites the p90 is a tax on your best users, and with 153 of 159 talents on Basic it would be a tax on essentially everyone.
- The byte caps are deliberately absurd against today's data (2 GB is 265x the p90). They are not sized for today's derivatives; they are sized so that when originals retention lands, a talent storing 200 full-resolution originals still fits on the free plan. Sizing bytes to today's numbers would produce a cap that a single real shoot breaks the week originals turn on.
- Sell the count, not the bytes. "150 photos" is a number a talent understands and can act on. "2 GB" is a number they cannot estimate and will only ever encounter as a surprise.

**What happens at the limit.** In order:

1. **Soft warn at 80%** of the count cap, in the media manager, stating the number remaining. Per `feedback_admin_edit_ux`, no silent state.
2. **Block the upload at 100%**, before the `media_assets` insert, with the specific reason and the two ways out (delete some, or upgrade). `checkTalentStorageAllowance` already returns a ready-to-show `message`; the count check needs an equivalent.
3. **Never auto-downscale.** The whole media-ownership model says the talent owns their uploads. Silently re-encoding an asset the talent owns, to stay under a limit we imposed, is the ownership violation the entire phase 1-4 program was built to prevent.
4. **Never retro-delete or retro-block.** Anyone already over a cap on the day it ships is grandfathered and can keep their photos; they simply cannot add more. With the caps above this affects nobody, which is how you want to launch a limit.

**Blocking dependency for the byte cap.** 23% of the bucket is unreferenced. A byte quota computed from `media_assets` rows lets a delete-and-reupload loop burn unbounded real storage while reporting a talent as under quota. A byte quota computed from `storage.objects` bills people for photos they deleted. Both are wrong. **Ship `maxAssets` first; leave `maxBytes` at `null` until a reaper deletes storage objects when `deleted_at` is set.** Splitting them this way is free — they are separate fields already.

### 3b. Watermark-on-release: free for all, or Studio+ only?

**RECOMMENDATION: free on every tier. Leave `watermarkOnRelease` exactly as it is. Do not gate this.**

Rationale, grounded:

- **`media_grants` = 0. `talent_agency_permission_requests` = 0.** Not one release has ever happened. Gating a feature with zero usage cannot produce revenue; it can only suppress the first use, which is the thing you actually need in order to learn whether the release flow works at all.
- **The addressable population is 4 workspaces.** 28 of 32 are on `free`. Studio+ gating would apply to 4 workspaces that could already do it and lock out 28 that have never tried. Best case that converts a fraction of 28 tiny workspaces; realistic case it converts zero and you have added a support burden.
- **The watermark is the thing that makes "yes" possible.** An agency deciding whether to release a photo to a hub is choosing between "yes, marked" and "no". Gating the mark deletes the middle option and pushes the answer to "no". Release liquidity is the product; charging for the mechanism that produces it is charging at exactly the wrong point in the funnel.
- **It protects the talent too, not only the agency.** The brief asks whether "it protects the agency's asset, so gating it may be reasonable" outweighs "a watermark protects the talent". It does not. The talent is the party who cannot pay the Studio fee and has no say in whether the workspace does. Putting a protection behind a paywall billed to someone other than the protected party is the wrong shape regardless of the revenue.
- **It costs nothing to leave on.** The cost is CPU per bake, at approval time. At 0 releases that is $0. Revisit if bake volume ever becomes a real line item, which is a very long way from here.

**The honest counter-argument, and where to put it instead.** Watermark-on-release is the most premium-shaped feature in this lane, and if a Studio+ media differentiator is eventually needed, this is where it would live. The right split then is **branded vs plain**: a plain platform mark stays free for everyone, and the *workspace-logo* watermark becomes Studio+. That keeps the safety floor universal and sells the polish. It is also half-built already — `admin-media-release.ts:100` already refuses a watermarked release when the workspace has no logo. That split needs a second config key (`brandedWatermarkOnRelease`), not a change to this one. **Not now. Revisit after 50 real releases.**

### 3c. Release-request volume limits

**RECOMMENDATION: no limit. Leave `releaseRequestsPerMonth` at `null` on every tier. Instrument a counter instead of shipping a cap.**

This is the easy one and the honest answer is the boring one. Zero release requests have ever been created. Zero grants exist. There is no abuse to prevent, no cost to contain, and no signal about what a reasonable monthly volume even looks like. A cap here would be a number invented from nothing, wired into a code path with no call sites, gating a feature nobody has used.

**Revisit trigger, so this is a decision and not a deferral.** Build the cap when either fires:

- any single workspace exceeds **100 release requests in a rolling 30 days**, or
- platform-wide release requests exceed **1,000 per month**.

Both are cheap to watch: `talent_agency_permission_requests` already has the rows and the timestamps, and `web/src/app/api/cron/usage-audit/route.ts` already has a threshold-and-alert pattern to hang it on. Add the counter now; the counter is what makes the eventual cap defensible instead of invented.

---

## 4. What NOT to do

The data says all of the following would be premature:

- **Do not price storage in USD per GB, and do not build metered or overage billing.** Total platform storage across every bucket is 355 MB. At commodity rates that is under $1/month. Building a metering and overage path for a sub-dollar cost centre is negative-value work.
- **Do not gate watermark-on-release.** See §3b. Zero uses, 4 paying workspaces.
- **Do not cap release requests.** See §3c. Zero requests, ever.
- **Do not auto-downscale at the quota limit.** It contradicts the ownership model this entire program exists to establish.
- **Do not ship a byte quota before the storage reaper.** 81.2 MB across 381 unreferenced objects means byte accounting is currently wrong in both available directions.
- **Do not build a per-workspace storage quota.** Workspace-owned media is **one asset** platform-wide (`purpose='branding'`, `ownership_kind='agency'`). There is nothing to limit.
- **Do not treat today's byte distribution as predictive.** It describes a derivatives-only pipeline. The moment originals retention turns on it is obsolete by an estimated order of magnitude. Recalibrate then; that is why the byte caps in §3a carry so much headroom.
- **Do not add a fourth knob.** The config object covers every decision on the table. Resist adding `maxCollections`, per-tenant media caps, or a bandwidth knob until something in the data asks for one.

---

## 5. Implementation sketch

No migration is needed for any of this. `idx_media_assets_owner` already exists as a partial btree on `owner_talent_profile_id WHERE deleted_at IS NULL`, so the per-talent count query is cheap.

### 5a. Talent count quota (the only decision that changes code)

1. **`web/src/lib/billing/media-entitlements.ts`** — set `maxAssets` to `150` / `600` / `null` for `talent_basic` / `talent_pro` / `talent_portfolio`. Leave every `maxBytes` at `null`. Add a `checkTalentAssetCountAllowance({ planKey, usedAssets, incomingAssets })` returning the existing `QuotaVerdict` shape (`remainingBytes` becomes the wrong field name for it, so give it a sibling type with `remainingAssets` rather than overloading). Add a `SOFT_WARN_RATIO = 0.8` constant so the warn threshold has one home too.
2. **`web/src/lib/media/phase4-policy.test.ts`** — the tripwire test asserts all three groups are `null`/`true` and **will go red by design**. That is the gate working. Replace the `talentStorage` half with assertions on the specific agreed numbers, keep the `watermarkOnRelease` and `releaseRequestsPerMonth` halves asserting permissive, and add a regression test that a talent at 108 assets (today's real maximum) is still allowed on Basic.
3. **New usage reader** — `web/src/lib/media/talent-storage-usage.ts`: `select count(*) from media_assets where owner_talent_profile_id = $1 and deleted_at is null and purpose = 'talent'`. One function, service-role client passed in, no caching (the count must be read-after-write correct — see `incident_next_fetch_memoization_render_writes`).
4. **Call sites, before the insert:**
   - `web/src/app/api/talent/media/upload/route.ts:151` (talent's own upload)
   - `web/src/app/api/admin/media/upload/register/route.ts:294` (workspace uploading on a talent's behalf) — same cap, charged to the talent's plan, because the row is owned by the talent either way.
5. **UI** — the `allowed:false` branch surfaces the returned `message`; the 80% warn surfaces in the media manager. Existing plain-language message strings are already in the module and are already em-dash-free.

### 5b. Watermark

No change. `watermarkOnRelease` stays `true` on all five tiers and the tripwire assertion for it stays as written. If the branded-vs-plain split is taken later, that is a new `brandedWatermarkOnRelease` key plus a branch in `admin-media-release.ts` around the existing logo pre-flight — not an edit to this key.

### 5c. Release requests

No cap. `releaseRequestsPerMonth` stays `null` and `workspaceReleaseRequestAllowance` stays unreferenced. Add a counting probe to `web/src/app/api/cron/usage-audit/route.ts` alongside the existing storage/DB/orphan checks: rolling-30-day `talent_agency_permission_requests` per tenant, WARN at 100 for any single tenant, plus platform-wide WARN at 1,000/month. It reuses the existing `platform_alerts` delivery path, so it is one query and one threshold block.

### 5d. Prerequisite for anything byte-based

A storage reaper: on soft delete, remove the `storage.objects` row; plus a one-time sweep of the 381 currently unreferenced objects (81.2 MB). Until that exists, `maxBytes` stays `null` on every plan. This is a separate piece of work and should not be bundled into a pricing change.

---

## 6. Open questions that only the owner can close

1. Are the Basic/Pro/Portfolio prices ($0 / $12 / $29, currently marked placeholder in `project_talent_subscriptions.md`) firm enough that storage becomes a stated plan benefit in marketing copy? If they are still placeholder, ship the cap as an unadvertised abuse backstop and say nothing about it on the pricing page.
2. Is originals retention actually coming? The answer sets whether the byte caps in §3a are headroom or fantasy. If it is not on the roadmap, drop `maxBytes` from the conversation entirely rather than carrying dead config.
3. Is a workspace uploading on behalf of a talent charged to the talent's plan? §5a step 4 assumes yes, on the grounds that the row is talent-owned. The alternative (workspace-funded uploads bypass the talent cap) is defensible and would need a different call-site rule.
