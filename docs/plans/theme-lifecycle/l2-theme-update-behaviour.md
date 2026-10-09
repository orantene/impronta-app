# L2 — Theme update on a customized site (behaviour table)

**Ticket:** [TUL-420](https://app.notion.com/p/3f32c5ee974381b89e88c697b3c29dcc)  
**Epic:** EPIC L · Theme lifecycle  
**Priors:** L1 state map (#3003), L5 history/undo audit (#3004), L3 change-theme (#3114, different surface)  
**Scope:** A talent who already customized her site takes a theme update for the **same** Design. No new themes. No Factory releases.

---

## Product rules (locked)

1. Apply is **draft-first**: live `shell_published` / `blocks_published` / `design_tokens` stay until Publish (TUL-325 CTA after apply).
2. Business data never moves: services, prices, currency, booking, policies, reviews, bio, contact, gallery media rows.
3. Three-way merge (`merge.ts`): base = pinned Design version, ours = her draft, theirs = target Design version. Match by design key, never id/position.
4. Content-owned props (`cp` / `{{token}}` leaves) and `i18n` are never overwritten by an update.
5. Design-owned props she edited stay hers (**Kept**); untouched design props take theirs (**Mapped**). Same prop both changed → hers wins + **Warned** (conflict).
6. Talent-added (unstamped) sections stay (**Kept**). New Design blocks arrive only via "Add this block" (Apply never inserts them, F78).
7. Skipped versions: combined offer goes straight to latest with the same rules (F110).
8. Undo this update restores the pre-apply draft and keeps later edits (L5).

---

## Behaviour table (Notion case matrix)

| Talent did | Update does | Fate | Detail |
|---|---|---|---|
| Edited a text (seeded label / design-owned) | Changes the same default text | **Kept** + **Warned** | Whole-node fingerprint keep today; per-leaf copy ownership lands with Theme core P0-1 (#2911) as **Mapped** for untouched copy leaves. |
| Left a text untouched | Changes it / adds a translation | **Mapped** | Untouched design label takes theirs; `i18n` locales she never had stay empty until she edits (P0-1). Both es and en when the release ships both. |
| Changed colours / fonts | Changes theme tokens | **Kept** / **Mapped** | Her draft token values kept; untouched tokens (or origin-hash match) take theirs (`tokens-merge.ts`). |
| Replaced a photo | New default photo | **Kept** | Content-owned `src` (`{{…}}`) never written; a talent-edited image src stays hers. |
| Reordered / hid sections | Adds a new section | **Kept** + **Mapped** | Hidden/removed stay out; new block placed after its design neighbour (or pending until Add this block). Her order wins when she reordered (`your_order`). |
| Edited a section | Update removes or renames that block kind | **Kept** + **Warned** | Edited node kept (not silently dropped). Kind/layout swap: untouched swaps; edited keeps hers or carries edits (`moved_edits`) / conflict. |
| Added her own section | Anything | **Kept** | Unstamped nodes untouched; travel with the section before them on reorder. |
| Has unpublished draft edits | Update arrives | **Mapped** (draft only) | Apply writes draft + history `theme_update`; never auto-publishes; live columns unchanged. |
| Skipped several versions | Applies latest | **Mapped** | Combined items to latest; same keep/map/warn rules. |

---

## Sheet surfaces (before Apply)

| Surface | Fate | Where |
|---|---|---|
| What's new (notes + grouped items) | **Mapped** | `ThemeUpdateSheet` groups: important / automatic / new blocks / layout |
| What we keep from her edits | **Warned** | `keptLine` + `keptRemovedLine` from preview merge |
| Where design and she both changed | **Warned** | `decisionLine` (conflict parts; we keep her version) |
| New blocks | **Warned** (her choice) | "Add this block" + placement; never via Apply |
| Live site | **Kept** | Until Publish |
| History undo | **Mapped** | `undoable=true` theme_update entry |

---

## Fate legend

| Label | Meaning |
|---|---|
| **Kept** | Unchanged in her draft (or still present after apply). |
| **Mapped** | Copied or rewritten into the draft by a defined merge rule. |
| **Dropped** | Design structure wins when she had not edited that part (e.g. untouched section removed by Design). |
| **Warned** | Surfaced in the preview sheet / report so she knows before Apply. |

---

## Code (this PR)

| Piece | Path | Status |
|---|---|---|
| Behaviour table (this doc) | `docs/plans/theme-lifecycle/l2-theme-update-behaviour.md` | done |
| Matrix tests (one per Notion row) | `web/src/lib/talent-site/theme-releases/l2-theme-update-matrix.test.ts` | done |
| Decision line (conflicts) EN+ES | `talent-update/copy.ts` + `view.ts` + `ThemeUpdateSheet.tsx` | done |

---

## Out of this PR

- New themes or Factory releases (Oran)
- Live QA on fxlank / TAL-93900 (PM-run)
- Merging Theme core P0-1 (#2911) / P0-2 (#2916) (separate leave-RM)
- L3 gallery Design switch (TUL-421 / #3114)
- Retention policy (L5 G-L5-02)
