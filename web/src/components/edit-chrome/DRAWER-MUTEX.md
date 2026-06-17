# Edit chrome — drawer and overlay mutex

Operators must never see **two utility drawers** open at once, or **palette + full-screen picker + drawer** stacked incoherently. Logic lives in [`edit-context.tsx`](./edit-context.tsx).

**2026-06-07 — Builder 2026 floating workspace:** Utility drawers (Theme, Publish, Page settings, …) and the **Inspector** are independent floating white cards. `showExclusiveRightRailDrawer` mutexes **utility drawers only** — opening Theme does **not** close the inspector (selection-driven). The storefront canvas is full-bleed; panels overlay at `Z_INDEX.panels` without shrinking body width.

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

**2026-06-17 — A11Y-1: utility drawers are now true modal dialogs.** Every
utility drawer (Publish, Theme, Revisions, Page settings, Assets, Collections,
Schedule, Comments, Media picker) passes `modal` to the shared
[`Drawer`](./kit/drawer.tsx), which then:

- renders `role="dialog"` + `aria-modal="true"`,
- installs the shared `useModalFocusTrap` (Tab cycles **within** the drawer,
  focus moves in on open and **restores to the opener** on close),
- handles **Escape** in the capture phase (calls the drawer's `onRequestClose`
  and `stopPropagation`s, so the shell's global Escape ladder never
  double-fires for an open modal drawer), and
- marks the editor chrome **behind** the drawer `inert`
  ([`kit/drawer-modal-inert.ts`](./kit/drawer-modal-inert.ts) — topbar, command
  dock/rail, in-editor canvas region, device-preview iframe host). The inert
  controller is ref-counted so stacked drawers compose. `inert` blocks user
  focus/pointer only, NOT `postMessage`, so the Theme drawer's live-preview
  bridge to the canvas iframe keeps working while the canvas is inert.

The **Inspector** (`kind="dock"`) is deliberately **NOT** modal — it is a
persistent, selection-driven panel that does not mutex with utility drawers, so
operators must be able to tab between it and the canvas. It keeps the
single-slot `restoreFocusOnClose` behaviour (default `true`, ~220ms after
slide-out) but installs no trap and no inert.

**Escape** order is still centralized in [`edit-shell.tsx`](./edit-shell.tsx)
(shortcut overlay → command palette → right-rail drawers); for a modal drawer
the trap closes it first (capture phase), and the shell branch is the safety
net for the non-modal / focus-elsewhere cases.

## Reconciliation (roadmap)

**2026-05-12 — P1-3 / `verify-p1-3`:** Mutex contract is centralized in [`edit-context.tsx`](./edit-context.tsx) (`closeAllRightRailDrawers`, `showExclusiveRightRailDrawer`, `dismissCompetingEditorChrome`, library/template flows). **PR checklist** above remains the gate for **new** surfaces; roadmap task **P1-3** is “don’t regress,” not a one-time build.

**2026-05-09 — P1-3 / `pr-p1-3`:** The same three checklist bullets are duplicated (with link) in [`.github/pull_request_template.md`](../../../.github/pull_request_template.md) under **Edit chrome — drawer / overlay mutex** for PRs that touch `web/src/components/edit-chrome/`.

## Related

- Stash / canvas polish (`wip-canvas-felt-quality-pre-mockup`): diff-review before cherry-pick; see [builder-experience-execution-plan.md](../../../docs/builder-experience-execution-plan.md).
