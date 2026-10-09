# L5 — History / undo / restore audit (research)

**Ticket:** [TUL-423](https://app.notion.com/p/3f32c5ee97438125b6b5f77fe26590f4)  
**Scope:** Research only — what each surface records, when, retention, what restore brings back / misses; gap list vs the 7 must-work rules. No code changes.  
**As of:** `origin/main` @ 2026-10-09

**Surfaces audited:**
- `web/src/lib/talent-site/history/{history.server.ts,history-actions.ts,restore-plan.ts,types.ts}`
- `web/src/components/edit-chrome/talent-history-list.tsx`
- Builder undo: `web/src/components/edit-chrome/edit-context.tsx` (+ `edit-context-internal.ts`, `use-undo-persistence.ts`)
- Builder Lab: `web/src/components/builder-lab/template-revision-list.tsx`

---

## 1. Per-surface inventory

### 1.1 `history.server.ts`

| | |
|---|---|
| **What is recorded** | Rows in `talent_site_history` via `writeSiteDraft` / `recordSiteHistory`. Kinds: `edit`, `colors`, `design_apply`, `theme_update`, `restore`, `publish`, `auto_improve`. Snapshot = shell, tokens, design pin (slug/version/look), pages map. Theme updates also store merge `report` for reverse undo. |
| **When** | Every draft write that passes a history payload; publish via `recordSitePublish` after live publish (`publishMaxSiteAction`); theme update apply via `applyThemeUpdateToDraft`. |
| **Retention** | UI list: newest **50** (`LIST_LIMIT`). **No TTL / purge / trim** in migration or history module. Edits/colors fold within **60s** (`HISTORY_BATCH_SECONDS`). Table otherwise unbounded. |
| **Restore brings back** | Draft only: shell_tree, design_tokens_draft, theme_design_{slug,version}, theme_look_slug, existing page blocks. Adds a new `restore` history row. Never sets published columns. |
| **Misses** | Deleted pages skipped. Snapshot omits `theme_token_origin`, `style_classes`, `style_presets`, page SEO/meta. Business tables (services/bookings) never in snapshot. Publish history is **best-effort**. |

Key functions: `restoreHistoryEntry`, `undoThemeUpdateEntry`, `applyThemeUpdateToDraft`, `recordSitePublish`, `loadTalentTimeline`.

### 1.2 `history-actions.ts`

| | |
|---|---|
| **What** | Owner-gated wrappers: `loadTalentHistoryAction`, `restoreTalentHistoryAction`, `undoTalentThemeUpdateAction`, `loadTalentGoLiveAction`. |
| **When** | Builder Revisions drawer / Go Live chrome. |
| **Restore** | Same as server; CAS on `expectedDraftRev`; impersonation blocked. |
| **Misses** | No retention messaging; no publish-from-restore; no undo for non-`theme_update`/`auto_improve`. |

### 1.3 `restore-plan.ts`

| | |
|---|---|
| **`planRestore`** | Maps snapshot → draft patch; `guardTree` re-applies prop locks. Skips missing page ids. |
| **`planUndoUpdate`** | `reverseMerge` on shell + **home only** + tokens; re-pins `theme_design_version` to `fromVersion`. Keeps later talent edits when merge report still matches. |
| **Misses** | Undo does not reset `theme_design_slug` / `theme_token_origin`. Non-home pages untouched by undo-update. Restore never recreates deleted pages. |

### 1.4 `types.ts`

| | |
|---|---|
| **Recorded shape** | `HistorySnapshot` v1: `source`, `rev`, `shell`, `tokens`, `design`, `pages`. |
| **Batching** | `HISTORY_BATCH_SECONDS = 60` for edit/colors fold. |
| **Retention** | Not specified (no keep-N / keep-days constant). |

### 1.5 `talent-history-list.tsx`

| | |
|---|---|
| **Shows** | Actor, relative time, bilingual summary, edit_count, Live chip on latest publish, Preview / Restore / Undo this update (if `history.undoable`). |
| **Actions** | Restore → parent `onRestore`; Undo → `undoTalentThemeUpdateAction`. Confirm copy: draft-only, publish separate. |
| **Retention UI** | **None** — no “kept N versions / N days” copy. |
| **Misses** | Undo button only for theme_update/auto_improve (`timeline.ts:mapHistoryRowsToRevisions`). |

### 1.6 Builder undo — `edit-context.tsx`

| | |
|---|---|
| **What** | In-session stacks `past` / `future`. Cap **50**. Persist last **10** of `past` to localStorage. |
| **When** | Every `commitBuilderTreeMutation` (text/image/props/node ops); section insert/remove/move/duplicate; visibility/rename; template/page-design apply with undo helpers. |
| **Retention** | Session 50; reload 10; wiped on conflict/reload. Not server history. |
| **Undo brings back** | Prior tree / composition / field / section meta; selection restored. |
| **Misses** | Theme token / Look / Design gallery writes go through **server** history — ⌘Z does not undo those. Stack is per-page localStorage, not durable site versions. |

### 1.7 Builder Lab — `template-revision-list.tsx`

| | |
|---|---|
| **What** | Per-template revision trail: `version`, `status`, date, changelog `note`. |
| **When** | After publishes (`listTemplateRevisions` ← `builder_template_revisions`). |
| **Actions** | **Restore to draft** → `restoreTemplateRevision`. **Roll back** → `rollbackToRevision` (re-publish old snapshot as **new forward** version). |
| **Retention** | Append-only; no trim in UI. |
| **Site impact** | Catalog/template row only. Talent sites that already applied a prior tree are **not** rewritten. |
| **Misses vs theme channels** | This is **builder templates**, not `talent_theme_releases` channel demotion. Theme release channels are **forward-only** (`checkChannelChange`). |

---

## 2. Must-work rules vs today

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| 1 | Undo/redo in builder across text, image, section add/remove/reorder, style changes | **PARTIAL** | Text/image/node props + section structure ride `commitBuilderTreeMutation` / composition history. Theme colours / Look / Design apply are **server** history, not ⌘Z. Cap 50 / persist 10 / wipe on conflict. |
| 2 | Every publish creates a restorable version with time and plain label | **PARTIAL** | `recordSitePublish` → kind `publish`, summary “Published your site” / ES. Gaps: **best-effort** (failure does not fail publish); fixed label only. |
| 3 | Restore → draft first then publish; never business data | **PASS** | `restoreHistoryEntry` + `planRestore` draft columns only; never touches services/bookings. |
| 4 | Undo a theme update: one action → pre-update incl. customizations | **PARTIAL** | One-click `undoThemeUpdateEntry` / `planUndoUpdate`; keeps later talent edits; re-pins `fromVersion`. Gaps: home+shell+tokens only; does not restore `theme_token_origin` / slug. |
| 5 | Undo a theme switch via version made at switch time | **GAP** | `applyDesign` writes `design_apply` with snapshot **after** the write. `undoable` is false for `design_apply`. Recovery = Restore an **older** entry if one exists — no one-click pre-switch undo. |
| 6 | Retention: how many / how long; in doc and shown in panel | **GAP** | Soft UI cap 50. No time retention, no DB trim, no product doc, no panel copy. |
| 7 | Builder Lab: roll back released theme version for channel without breaking applied sites | **PARTIAL** | Lab template rollback **PASS** (forward re-publish, sites untouched). Theme **release channel** rollback **GAP**: forward-only; pause hides from talents but does not demote channel. |

---

## 3. Gap list

1. **G-L5-01 Theme switch pre-snapshot** — Capture pre-`design_apply` state (or mark switch undoable); today Restore of the switch entry restores the *new* design.
2. **G-L5-02 Retention policy** — Define keep-N and/or keep-days; implement trim; document; surface in History panel.
3. **G-L5-03 Publish history durability** — `recordSitePublish` is best-effort; failed append leaves a live publish with no restorable publish row.
4. **G-L5-04 Snapshot completeness** — Restore misses `theme_token_origin`, style registries, deleted pages; undo-update misses slug/token-origin and non-home pages.
5. **G-L5-05 Builder ⌘Z vs theme tokens** — Colour/Look/Design gallery changes are server history only.
6. **G-L5-06 Theme release channel rollback** — No demote path for `optin`/`default`; Lab template rollback ≠ theme release channel rollback.
7. **G-L5-07 Retention visibility** — Soft “last 50” list limit is not explained in the panel.

---

## 4. Cite index

| Concern | Cite |
|---|---|
| Timeline load (50) | `history.server.ts:loadTalentTimeline` |
| Restore draft | `history.server.ts:restoreHistoryEntry` → `restore-plan.ts:planRestore` |
| Undo theme update | `history-actions.ts:undoTalentThemeUpdateAction` → `history.server.ts:undoThemeUpdateEntry` → `restore-plan.ts:planUndoUpdate` |
| Publish history | `history.server.ts:recordSitePublish` ← `site-management-actions.ts:publishMaxSiteAction` |
| Theme switch record | `theme-apply-core.ts:applyDesign` (kind `design_apply`) |
| Snapshot SQL | `20261231299550_talent_site_history.sql` |
| Panel UI | `talent-history-list.tsx:TalentHistoryList` |
| Undoable gate | `timeline.ts:mapHistoryRowsToRevisions` |
| Builder undo stack | `edit-context.tsx:commitBuilderTreeMutation`, `edit-context.tsx:undo` |
| Lab rollback | `template-revision-list.tsx` → `registry-actions.ts:rollbackToRevision` |
| Channel forward-only | `dry-run.ts:checkChannelChange` |

---

## 5. Out of this PR

- Implementing the 7 rules / writing their tests
- Live proof on a test site with screenshots
