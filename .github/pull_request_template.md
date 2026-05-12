## Summary

<!-- What changed and why (1–3 sentences). -->

## Dashboard UX Spec Compliance (Section R)

- [ ] Correct shell used (Section A)
- [ ] Approved components used (Section C)
- [ ] No forbidden patterns (Section S)
- [ ] Mobile rules respected (44px targets, no horizontal scroll tables)
- [ ] Exactly one primary action with gold treatment (Section H)
- [ ] Navigation is URL-driven (Section L)
- [ ] State sync follows Section O (server is truth)
- [ ] Interaction follows Section K (async contract, blocking explanations)
- [ ] Forms follow Section M (inline validation, explicit save)
- [ ] Error + recovery implemented (Section N)
- [ ] Empty, loading, error states covered (Section E)

## Edit chrome — drawer / overlay mutex (only if this PR touches `web/src/components/edit-chrome/`)

See [`web/src/components/edit-chrome/DRAWER-MUTEX.md`](web/src/components/edit-chrome/DRAWER-MUTEX.md) for APIs and patterns.

- [ ] Opening this surface does not leave another right-rail drawer logically open.
- [ ] Opening this surface runs **`dismissCompetingEditorChrome`** or **`closeAllRightRailDrawers`** when appropriate (match sibling flows in `edit-context.tsx`).
- [ ] Escape closes this surface or defers to the shell ladder without double-dismiss (`edit-shell.tsx`).

## Test plan

- [ ] `cd web && npx tsc --noEmit`
- [ ] Manual: <!-- screens / flows touched -->
