# L3 — Change theme from the dashboard (behaviour table)

**Ticket:** [TUL-421](https://app.notion.com/p/3f32c5ee97438148a52ce4d36458fe97)  
**Epic:** EPIC L · Theme lifecycle  
**Priors:** L1 state map (#3003), L5 history/undo audit (#3004)  
**Scope:** Talent picks another finished Design from the dashboard gallery. No new themes. No theme releases.

---

## Product rules (locked)

1. Switch is **draft-first** (TUL-321): live `shell_published` / `blocks_published` / `design_tokens` stay until Publish.
2. Business data never moves: services, prices, currency, booking, policies, reviews, bio, contact, gallery media rows.
3. Page content she wrote **carries** into the new design where a matching section exists; where none exists it is **kept** (not deleted) and she is **warned**.
4. Switching back via **Undo** always restores the old design **exactly**. Gallery re-pick of the prior Design restores **exactly** only when the draft is **unchanged since she left** that Design (`draft_rev` still matches the leave history row); if she edited after the switch, re-pick **carries** current content onto the prior Design instead.
5. Gallery offers only finished / published Designs (TUL-327 / TUL-331).
6. Site languages (es base + en) stay; carried i18n props travel with content.

---

## Behaviour table

| Surface | Fate | Detail |
|---|---|---|
| Services, prices, currency, booking settings, policies, reviews | **Kept** | Never written by `applyDesign`. Live menus / booking still read business tables. |
| Profile bio, contact, headshot, gallery media library | **Kept** | Unchanged in DB. New trees re-hydrate empty slots from profile tokens / live media. |
| Live published columns (`shell_published`, `blocks_published`, `design_tokens`, `site_published_at`) | **Kept** | Draft-only write. Visitors see the old Design until Publish. |
| Design pin (`theme_design_slug` / `theme_design_version`) on draft | **Mapped** | Points at the new Design + released version (`loadApplyDesignRow`). |
| Look / colour tokens (`design_tokens_draft`, `theme_look_slug`) | **Warned** (default) | A Design switch does not auto-apply a Look. Existing draft colours stay until she picks a Look / palette. Dialog already says colours can change when she also picks a palette. |
| Stamped section with **same design key** in new Design | **Mapped** | Content-owned props + `i18n` carried (`carryContent`). New layout / design-owned props come from the new Design. |
| Stamped section with **no** matching key in new Design | **Kept** + **Warned** | Node stays appended on the home (or shell) draft so nothing she wrote is deleted. Report lists the key / kind for the warn list. |
| Talent-added (unstamped) section | **Kept** + **Warned** | Appended after carried trees. Report lists it. |
| Section order / visibility she set | **Dropped** (layout) | New Design's order wins for matched keys. Hidden matched sections: visibility carried when the prop still exists on the new node; otherwise warned as unmappable. |
| Custom text / photo on a matched key | **Mapped** | Travels via content-owned props. |
| Custom text / photo on an unmatched key | **Kept** + **Warned** | Stays on the kept orphan node. |
| Extra pages (non-home) | **Kept** | `applyDesign` only rewrites shell + home. Other `talent_pages` untouched. |
| SEO / meta on home | **Kept** | Page patch writes `blocks` only. |
| Open theme-update notice | **Warned** | After apply, `ensureSiteThemeUpdates` may surface a pending update for the new pin (existing F108). |
| History entry | **Mapped** | `kind=design_apply`, `undoable=true`, `snapshot_ref` = **pre-switch** draft (G-L5-01). Report stores from/to + carry summary. |
| Undo this design change | **Mapped** | Restores the pre-switch snapshot exactly (draft only). |
| Gallery re-pick of prior Design (draft unchanged since leave) | **Mapped** | **restore-exact** from latest pre-leave snapshot for that slug. |
| Gallery re-pick of prior Design (draft edited since leave) | **Mapped** | **carry-over** onto the re-picked Design (same as a first-time switch); do not wipe her post-switch edits. |

---

## Fate legend

| Label | Meaning |
|---|---|
| **Kept** | Unchanged in DB, or still present in the draft after the switch. |
| **Mapped** | Copied or rewritten into the new draft by a defined rule. |
| **Dropped** | Not preserved as-is (layout / structure of the new Design wins). |
| **Warned** | Surfaced in the apply report (and later UI) so she knows before / after. |

---

## Code (this PR)

| Piece | Path | Status |
|---|---|---|
| Pure carry + warn plan | `web/src/lib/talent-site/server/design-switch.ts` | done |
| Apply wire-up (draft-first, pre-snapshot, restore-on-repick) | `web/src/lib/talent-site/server/theme-apply-core.ts` | done |
| Undo design switch | `history.server.ts` + timeline + history list copy | done |
| Tests | `design-switch.test.ts`, `timeline.test.ts` | done |

---

## Out of this PR

- New themes or Factory releases (Oran)
- Live QA round-trip screenshots on fxlank / TAL-93900 (PM-run)
- L2 theme-update matrix (TUL-420)
- Retention policy (L5 G-L5-02)
- Warn UI sheet polish beyond what the report already enables (bucket if needed)
