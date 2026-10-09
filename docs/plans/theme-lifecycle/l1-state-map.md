# L1 — Theme lifecycle state map (research)

**Ticket:** [TUL-419](https://app.notion.com/p/3f32c5ee974381859375c505d40549d6)  
**Scope:** Research only — state map + arrow → `file:function` + covering test. No release, publish, theme edit, or production writes.  
**As of:** `origin/main` @ 2026-10-09  
**Naming:** Code channels are `draft | demos | optin | default`. UI: Draft / Demos / Opt-in / Default (“Make default”). There is no channel named `stable`; **stable ≈ `default`**.

---

## Path (product)

```
Builder Lab edit → draft → release channel → catalog → update notice
  → talent preview → apply (draft) → publish → live site
```

---

## 1. States (entity → values → table.column)

### A. Factory design draft (`talent_theme_drafts`)

| Field | Values | Notes |
|---|---|---|
| `status` | `open` \| `published` \| `discarded` | One open draft per design |
| `design` | slug | Design being edited |
| `base_version` | int | Snapshot the draft started from |
| `payload` | jsonb | Full `DesignPayload` |
| `rev` | int | CAS for saves / publish |
| `published_version` | int \| null | Set when draft closes via publish |
| `release_id` | uuid \| null | FK → `talent_theme_releases` after publish |

### B. Version snapshot (`talent_theme_versions`)

| Field | Values | Notes |
|---|---|---|
| `(design, version)` | unique | Full payload at that version |
| `source` | e.g. `authored` | Set by `publish_theme_template_draft` |
| `payload` | jsonb | Merge base / release target |

### C. Theme release (`talent_theme_releases`)

| Field | Values | Notes |
|---|---|---|
| `channel` | `draft` \| `demos` \| `optin` \| `default` | Ladder; one step at a time |
| `status` | `draft` \| `published` \| `paused` \| `archived` | demos→status `draft`; optin/default→`published` |
| `from_version` / `to_version` | int | Unique `(design_slug, to_version)` |
| `rollout_pct` | 0–100 | Required > 0 before optin |
| `items` / `notes` | jsonb | Diff items + EN/ES notes |
| `dry_run_report` | jsonb \| null | Required fresh before channel move |

**Talent RLS:** SELECT only when `status='published' AND channel IN ('optin','default')`. Demos-channel rows stay invisible to talents.

### D. Catalog row (`talent_theme_catalog`)

| Field | Values | Notes |
|---|---|---|
| `kind` | `design` \| `look` | |
| `slug` | text | e.g. `maison-v2` |
| `status` | `draft` \| `published` \| `archived` | Gallery / RLS read = `published` |
| `version` | int | **Does not advance on Factory publish**; flips on **Make default** |
| `payload` | jsonb | May lag newest released snapshot until flip |

**Apply/gallery effective version:** `loadApplyDesignRow` / `pickApplyDesign` — newest **published** `optin`/`default` snapshot wins over a stale catalog row.

### E. Per-site pin + draft/live (`talent_sites` + pages)

| Field | Role |
|---|---|
| `theme_design_slug` | Which design the site wears |
| `theme_design_version` | **Pinned version** (merge base; update comparator) |
| `theme_look_slug` | Applied look |
| `shell_tree` / `design_tokens_draft` / page `blocks` | **Draft** (editor) |
| `shell_published` / `design_tokens` / `blocks_published` | **Live** after publish |
| `site_published_at` | Non-null ⇒ site is live |
| `draft_rev` | CAS for draft writes |

**Pinned site:** A non-demo site may only pin a version covered by a published `optin`/`default` release. Demos may pin demos-channel versions. See `pin-guard.ts` `canPinSiteToVersion`.

### F. Update notice (`talent_site_theme_updates`)

| Field | Values |
|---|---|
| `state` | `available` \| `previewed` \| `applied` \| `dismissed` \| `undone` |
| `release_id` | FK release |
| `talent_site_id` / `talent_profile_id` | Owner scope |
| `report` | Merge summary jsonb |
| `applied_at` | Set on apply |

### G. Notifications

| Table | Role |
|---|---|
| `user_notifications` | Fan-out bells; `origin_event_id` = release id; `target_drawer: "theme-update"` |

---

## 2. Channels

| Channel | Code | What happens | Who is written | Talent-visible? |
|---|---|---|---|---|
| Draft | `draft` | Version + release row minted; dry-run only | Snapshots + release row | No |
| Demos | `demos` | Merge/reapply **demo** sites (`is_demo`); status stays `draft` | Demo `talent_sites` | No (RLS) |
| Opt-in | `optin` | Demos first, then fan-out update rows + bells; status `published` | Notices only (sites unchanged until Apply) | Yes |
| Default (“stable”) | `default` | Flip catalog → demos → fan-out → optional auto-improve | Catalog + notices (+ optional draft auto-improve) | Yes |

**Guards (`checkChannelChange`):** forward one step only; fresh dry run; zero dry-run errors; not paused/archived. Optin requires `rollout_pct > 0` and authored-overlay gate.

---

## 3. Arrows — `file:function` + covering test

Paths under `web/src/` unless noted.

| From → To | file:function | Covering test | Notes |
|---|---|---|---|
| *(open editor)* → **open design draft** | `lib/talent-site/theme-template/drafts.server.ts:openThemeDraft` | **NO test** (pure helpers only in `drafts.test.ts`) | Inserts `talent_theme_drafts` status=`open` |
| open draft → **saved draft edits** | `drafts.server.ts:saveThemeDraftTree` / `saveThemeDraftTokens` | **NO test** on DB CAS path (pure helpers only) | CAS on `rev` |
| *(optional)* → **new hidden design** | `theme-template/new-design.server.ts:createDesignFromDraft` | `theme-template/new-design.test.ts` | Catalog `status=draft`, snapshot v1 |
| open draft → **published version + draft release** | `theme-template/publish.server.ts:publishThemeDraft` → `publish-core.ts:publishWithPorts` → RPC `publish_theme_template_draft` | `theme-template/publish-core.test.ts` | Writes versions + releases (`channel=draft`). **Does not bump catalog.version** |
| draft release → **demos channel** | `publish.server.ts:publishAndUpdateDemos` → `release-manager.server.ts:changeChannel` → `manager/channel.ts:executeChannelChange` | Channel pieces: `manager/manager.test.ts`. **NO e2e test of `publishAndUpdateDemos`** | Dry run first; demo sites updated |
| demos → **optin** | `release-manager.server.ts:changeChannel` → `executeChannelChange` → `fanOut` | `manager/manager.test.ts` | Inserts `talent_site_theme_updates` + bells |
| optin → **default** (catalog flip) | `executeChannelChange` → `flipCatalogToRelease` | `manager.test.ts`; `make-default-rule.test.ts` | Updates `talent_theme_catalog.version`+`payload` |
| *(any after draft)* → **re-sync demos** | `release-manager.server.ts:resyncDemos` | `manager.test.ts` | Talents never touched |
| open release → **paused / resumed** | `release-manager.server.ts:setReleasePaused` | `resume-release.test.ts` | Resume re-fans out if open |
| rollout % raise | `changeRollout` → `setRollout` + `fanOut` | `manager.test.ts` | Only newly in-bucket sites get notices |
| *(site under open release)* → **lazy notice** | `lazy-fan-out.server.ts:ensureSiteThemeUpdates` | `apply-version-and-lazy-fan-out.test.ts` | Idempotent |
| notice **available** → **previewed** | `talent-update.server.ts:loadThemeUpdatePreviewSnapshot` / `previewThemeUpdate` | `talent-update.test.ts`, `combined-offer.test.ts`, `resume-release.test.ts` | In-memory preview; marks `previewed` |
| notice → **applied (site draft)** | `talent-update.server.ts:applyThemeUpdate` → `history.server.ts:applyThemeUpdateToDraft` | `talent-update.test.ts`, `combined-offer.test.ts`, `critical-noBase.test.ts` | Draft + pin bump; live unchanged |
| notice → **dismissed** | `talent-update.server.ts:dismissThemeUpdate` | talent-update / combined-offer suites | |
| applied → **undone** | `history.server.ts:undoThemeUpdateEntry` | `talent-update.test.ts`, `combined-offer.test.ts` | Rows → `undone` |
| **gallery pick → site draft pin** | `theme-apply-core.ts:applyDesign` via `theme-actions.ts:applySiteDesignAction` | Pin: `pin-guard.test.ts`. **NO e2e of `applySiteDesignAction`** | Pins slug+version |
| site **draft → live** | `site-management-actions.ts:publishMaxSiteAction` | Static: `talent-page-draft-publish.static.test.ts`. **NO full behavioral test** | Copies draft → published columns |
| demo draft → live (pipeline) | `demo-pipeline.server.ts:publishDemoSite` | Static: `revalidate-and-base.test.ts` | Inside demos channel apply |
| Dry-run gate | `release-manager.server.ts:runDryRun` → `merge-site.server.ts:mergeSite` | `manager.test.ts`; `merge.test.ts` | Not a product state |

---

## 4. Arrows with **NO** (or only weak) test

1. **`openThemeDraft` server insert/race** — only pure mappers in `drafts.test.ts`
2. **`saveThemeDraftTree` / `saveThemeDraftTokens` DB CAS path** — pure helpers only
3. **`publishAndUpdateDemos` end-to-end** — pieces tested separately; orchestrator untested as one call
4. **`actionPublishDesign` / `actionPublishDesignAndUpdateDemos` / `actionChangeChannel` server-action gates** — wiring static check only
5. **`publishMaxSiteAction` full publish** — static body grep only
6. **`applySiteDesignAction` end-to-end** (gallery → pin) — pin guard pure tests exist; action path not
7. **`discardThemeDraft`** — no test found
8. **Authored-channel gate refusal in live `changeChannel`** — unit-tested; not integrated into channel e2e beyond manager mocks

**Well-covered:** channel ladder (`executeChannelChange`), catalog flip, fan-out planning, talent preview/apply/dismiss/undo, pin guard, merge engine, publish-core planning.

---

## 5. Compressed diagram

```
[Builder Lab editor]
        │ openThemeDraft / saveThemeDraft*
        ▼
 talent_theme_drafts (open)
        │ publishThemeDraft / publish_theme_template_draft
        ▼
 talent_theme_versions(vN) + talent_theme_releases(channel=draft)
        │ dry run → changeChannel(demos)   [or publishAndUpdateDemos]
        ▼
 channel=demos  ──writes──► demo talent_sites (pin + draft + often live)
        │ changeChannel(optin) + rollout>0
        ▼
 talent_site_theme_updates(available) + user_notifications
        │ (optional) changeChannel(default)
        ▼
 talent_theme_catalog.version = N   (+ auto-improve drafts)
        │ talent: previewThemeUpdate / loadThemeUpdatePreviewSnapshot
        ▼
 state=previewed   (site draft untouched)
        │ applyThemeUpdate → applyThemeUpdateToDraft
        ▼
 site DRAFT updated + theme_design_version=N + state=applied
        │ publishMaxSiteAction
        ▼
 shell_published / blocks_published / design_tokens + site_published_at
        = LIVE SITE
```

---

## 6. Clarifications

1. **“Catalog” is two concepts:** (a) `talent_theme_catalog` row version (flips on **default**); (b) gallery / apply payload via `loadApplyDesignRow`, which can serve optin snapshots before catalog flips.
2. **Apply ≠ live.** Apply mutates site **draft** + pin; public host reads published columns until `publishMaxSiteAction`.
3. **Demos are automatic; talents are opt-in.** Real sites do not receive design writes from Factory channel moves except Phase-4 auto-improve on **default** (or experimental `DESIGN_AUTO_UPGRADE`).
4. **Product “stable” = channel `default`.**

---

## 7. Out of this PR (card steps 3–4)

- End-to-end proof run on fxlank / TAL-93900 with screenshots
- Negative paths: pinned unreleased version, demo following demos channel, stale notice close (#2919)
- Writing the missing tests listed in §4

---

## Key paths (index)

- Factory: `lib/talent-site/theme-template/{drafts,publish,publish-core,new-design}.server.ts`, `…/talent-designs/publish-actions.ts`
- Release: `lib/talent-site/theme-releases/manager/{release-manager.server,channel,dry-run,demos,fan-out,notify,merge-site.server}.ts`, `pin-guard.ts`, `lazy-fan-out.server.ts`
- Talent: `theme-releases/talent-update/{talent-update.server,talent-update-actions}.ts`, `history/history.server.ts`, `server/{theme-apply-core,theme-actions,site-management-actions}.ts`
- Tests: `manager/manager.test.ts`, `talent-update/talent-update.test.ts`, `pin-guard.test.ts`, `publish-core.test.ts`
