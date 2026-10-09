# L2 — Theme update on a site the talent already customized

**Ticket:** [TUL-420](https://app.notion.com/p/3f32c5ee974381b89e88c697b3c29dcc)  
**Builds on:** L1 state map ([TUL-419](https://app.notion.com/p/3f32c5ee974381859375c505d40549d6) / #3003), L5 history/undo ([TUL-423](https://app.notion.com/p/3f32c5ee97438125b6b5f77fe26590f4) / #3004), copy-release apply rule (#2911 / #2916 — never overwrite her edit).  
**Scope:** Behaviour contract + CI matrix for opt-in apply on a customized site. **No theme release.** Theme lifecycle → PM review.  
**Code:** `design-upgrade.ts` / `design-upgrade.server.ts`, `theme-apply-core.ts`, `theme-releases/merge.ts`, `theme-update/*`, `talent-update/*`.

---

## Goal

A talent who edited her site can take a theme update without losing anything she did, and knows exactly what will change before she says yes.

---

## Rules (product)

1. **Draft only.** Apply writes `shell_tree` / home `blocks` / `design_tokens_draft` + history. Never auto-publishes. Live columns stay until she Publishes (TUL-325).
2. **Never over her edit.** Design-owned props she changed stay hers (node fingerprint). Content-owned leaves (`{{token}}`, photos hydrated from profile) never move. Per-field **copy** ownership (#2911): base text + `i18n` leaves she changed stay; untouched copy leaves take the release when a `copy` item covers the key (#2916).
3. **Straight to latest.** Skipped versions collapse into one offer (pinned → newest). Same keep/update rules; later item wins on duplicate ids.
4. **Undo.** Theme-update history entry + reverse merge (L5). Sheet points her to History.
5. **Sheet before Apply.** What's new · What we keep · Decisions needed · one primary Apply.

---

## Behaviour matrix

Each row = one CI test in `web/src/lib/talent-site/theme-releases/l2-customized-update-matrix.test.ts` (lane `test:builder` via `list-test-files src/lib/talent-site`).

| # | Talent did | Update does | Kept | Updates | Conflicts / decisions | What she is told | Test id |
|---|---|---|---|---|---|---|---|
| 1 | Edited a text (design-owned label / copy leaf) | Changes the same default | Her text | Other untouched leaves on that node (copy pass) or nothing if whole node kept | Copy conflict when both changed the same leaf (#2911) | "We keep …" naming the section; copy line when texts kept | `L2-1` |
| 2 | Left a text untouched | Changes default and/or adds es+en translation | — | Base label + `i18n.es` + `i18n.en` when a `copy` item covers the key | Pending if release has items but no `copy` for that key | Listed under automatic improvements / What's new | `L2-2` |
| 3 | Changed colours / fonts | Theme tokens change | Her overridden tokens | Untouched tokens (equal to old default or matching `theme_token_origin`) | Critical token can override (rare) | Kept → colours; changes → token count in summary | `L2-3` |
| 4 | Replaced a photo | New default photo / headshot seed | Her photo (`cp` / content leaf) | Layout around it if untouched | — | Not listed as a design change to her photo | `L2-4` |
| 5 | Reordered / hid sections | Adds a new section | Her order; hidden/removed stay gone | New section after design neighbour (sensible place) | New block needs **Add this block** + placement (not in Apply) | New blocks group + kept-removed line | `L2-5` |
| 6 | Edited a section | Removes or renames that block kind | Her content (kept node / kind); never silently dropped | Untouched siblings | Conflict when both changed same design prop; kind swap skipped when edited | Warning in Decisions when kind/remove kept | `L2-6` |
| 7 | Added her own section | Anything | Her section untouched (no design key) | Design keys only | — | Not in What's new as removed | `L2-7` |
| 8 | Has unpublished draft edits | Update arrives | Draft edits | Apply merges into **draft only** | — | "Apply … to your draft"; live unchanged; Publish CTA after (TUL-325) | `L2-8` |
| 9 | Skipped several versions | Applies latest | Same keep rules vs pinned base → latest theirs | Combined items; pin → newest `to_version` | Same as single step | Version line `from → to` (latest) | `L2-9` |

### Deferred / dependency

| Row | Status on `main` without #2911 | After #2911 / integ #3066 |
|---|---|---|
| **L2-1** per-field | Node fingerprint keeps the **whole** edited node (stronger keep; her style+text stay). | Per-leaf: style can take design updates while her copy leaf stays. |
| **L2-2** es+en ship | Untouched **design-owned** label updates today. `i18n` is never written by the design prop pass. | `copy` release item writes untouched `label` + `i18n.es` + `i18n.en`. |

Matrix tests assert the **product contract** where the engine already implements it; L2-1/L2-2 include the main-safe assertions plus comments pointing at #2911 for the copy-item path. Do not treat a green L2-2 label-only assert as proof that translations shipped until #2911 lands.

---

## Sheet copy (EN / ES)

| Section | Role |
|---|---|
| **What's new** | Release notes + grouped items (critical / auto / blocks / layout). (i) = only parts you did not change, except critical. |
| **What we keep** | Kept edits, kept-removed sections, copy-kept texts (#2911). (i) = your wording, colours, photos, order. |
| **Decisions needed** | Conflicts (both changed), new blocks to place, kind-kept warnings. Empty → section hidden. |
| **Primary** | Apply N changes (never adds new blocks). Secondary: Not now. |

After apply: preview then Publish (TUL-325). Undo via History (L5).

---

## Apply path (arrows)

```
notice available → previewThemeUpdate (in-memory merge, no write)
  → ThemeUpdateSheet summary
  → applyThemeUpdate / applyThemeUpdateToDraft (CAS draft_rev, history theme_update)
  → draft only → Publish (separate) → live
```

Auto-upgrade hook (`DESIGN_AUTO_UPGRADE`, default off): `planSiteUpgrade` → `applySitePlan` publishes **only** when `isLiveEqualToDraft` (no unpublished talent edits). Customized drafts with pending edits → "needs publish", never silent live overwrite.

---

## NOT in this ticket

- Shipping a theme release / channel move / catalog flip
- Merging #2911 / #2916 / integ #3066
- Live QA on fxlank / TAL-93900 (PM-run)
- Changing L5 undo implementation
