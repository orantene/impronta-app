# Edit chrome — drawer and overlay mutex

Operators must never see **two right-rail drawers** open at once, or **palette + full-screen picker + drawer** stacked incoherently. Logic lives in [`edit-context.tsx`](./edit-context.tsx).

## APIs (client)

| Function | What it closes | What it opens |
|----------|----------------|---------------|
| **`closeAllRightRailDrawers`** | Publish, Page settings, Revisions, Theme, Assets, Schedule, Comments; clears comments section focus | Nothing |
| **`dismissCentredModals`** | Command palette (⌘K), shortcut overlay (`?`) | Nothing |
| **`dismissCompetingEditorChrome`** | Centred modals + starter template gallery + composition library target + section picker popover | Nothing |
| **`showExclusiveRightRailDrawer(kind)`** | Runs **`dismissCompetingEditorChrome`** first, then sets **exactly one** of the right-rail `*Open` flags to `true` | One drawer |
| **`openLibrary` / `openPickerPopover` / `openStarterTemplateGallery`** | **`dismissCompetingEditorChrome`** + **`closeAllRightRailDrawers`** then opens the target overlay | Library modal, popover, or template gallery |

## Rules for new surfaces

1. **New right-rail drawer:** add its flag to **`closeAllRightRailDrawers`**, add a branch to **`showExclusiveRightRailDrawer`** if it should participate in the mutex, and open it only via **`showExclusiveRightRailDrawer`** (or extend that helper — never set two drawer flags true).
2. **New centred modal** (palette-scale): clear it from **`dismissCentredModals`** / **`dismissCompetingEditorChrome`** when opening drawers or full-screen flows.
3. **Escape order:** [`edit-shell.tsx`](./edit-shell.tsx) global handler — shortcut overlay → palette → drawers (see inline comments).

## PR checklist

- [ ] Opening this surface does not leave another right-rail drawer logically open.
- [ ] Opening this surface runs **`dismissCompetingEditorChrome`** or **`closeAllRightRailDrawers`** when appropriate (match sibling flows).
- [ ] Escape closes this surface or defers to the shell ladder without double-dismiss.

## Related

- Stash / canvas polish (`wip-canvas-felt-quality-pre-mockup`): diff-review before cherry-pick; see [builder-experience-execution-plan.md](../../../docs/builder-experience-execution-plan.md).
