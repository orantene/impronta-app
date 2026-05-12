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

## Focus / keyboard (audit)

Right-rail drawers are `<aside>` panels, **not** modal dialogs: focus is **not** fully trapped (operators tab into the iframe preview). **Escape** order is centralized in [`edit-shell.tsx`](./edit-shell.tsx) (shortcut overlay → command palette → right-rail drawers).

On close, the shared [`Drawer`](./kit/drawer.tsx) primitive returns focus to the element that had focus when the drawer **opened** (`restoreFocusOnClose`, default `true`, ~220ms after slide-out). This is a single-slot restore, not a stack — still no full trap; revisit `react-focus-lock` or Radix **only** if a drawer becomes modal-scale.

## Reconciliation (roadmap)

**2026-05-12 — P1-3 / `verify-p1-3`:** Mutex contract is centralized in [`edit-context.tsx`](./edit-context.tsx) (`closeAllRightRailDrawers`, `showExclusiveRightRailDrawer`, `dismissCompetingEditorChrome`, library/template flows). **PR checklist** above remains the gate for **new** surfaces; roadmap task **P1-3** is “don’t regress,” not a one-time build.

**2026-05-09 — P1-3 / `pr-p1-3`:** The same three checklist bullets are duplicated (with link) in [`.github/pull_request_template.md`](../../../.github/pull_request_template.md) under **Edit chrome — drawer / overlay mutex** for PRs that touch `web/src/components/edit-chrome/`.

## Related

- Stash / canvas polish (`wip-canvas-felt-quality-pre-mockup`): diff-review before cherry-pick; see [builder-experience-execution-plan.md](../../../docs/builder-experience-execution-plan.md).
