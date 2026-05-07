# Builder Ownership + Snapshot QA Checklist

Date: 2026-05-06

This checklist is the operational truth for Phase 3 route ownership and
snapshot behavior.

## Route ownership truth

Public URL classification:

- `builder_page`: tenant homepage and CMS page routes.
- `site_shell`: reserved shell slug (`__site_shell__`).
- `directory`: directory renderer routes.
- `profile`: `/t/*` profile routes.
- `platform_route`: auth/admin/api/static/system routes.

Edit chrome mount contract:

- Mount only on `builder_page`.
- Never mount on `directory`, `profile`, `platform_route`.
- `site_shell` is classified explicitly and remains non-mounted from public
  storefront paths in this phase.

## Snapshot truth

Public render contract:

- Homepage render path is snapshot-first.
- Standard CMS page render path is snapshot-first.
- Site shell render path is snapshot-first when enabled.
- Builder-owned snapshot renderers expose `data-builder-node-id` on the same
  `data-cms-section` wrappers the current EditShell already selects.
- Edit-shell slot mutations (insert/remove/move/duplicate + undo/redo) must
  reconcile section nodes against the existing `builderTree` so non-section
  root nodes are not dropped as BuilderNode adoption expands.
- Edit-shell slot mutations must also preserve existing section child nodes
  when slots are reconciled from section refs (no child-node identity loss on
  reorder or cross-slot moves).
- Legacy fallback remains transitional only for published rows with missing
  snapshot payload.

## Required verification commands

Before QA sign-off:

```bash
npm --prefix web run backfill:page-snapshots -- --all-active --apply
npm --prefix web run verify:published-page-snapshots -- --all-active
npm --prefix web run verify:published-page-snapshots -- --all-active --require-builder-tree
```

Expected:

- Backfill run reports zero failures.
- Verification run exits `0` with `totalMissing = 0`,
  `totalMissingBuilderTree = 0`, and `totalInvalidBuilderTree = 0`.
- `verify:published-page-snapshots` validates `builderTree` with the same
  shared BuilderNode validator used by runtime code (with a narrow
  compatibility carve-out scoped to known legacy seeded page ids only).

## Browser checks

Use a real tenant host + `?edit=1`:

1. Homepage path mounts edit chrome.
2. `/directory` does not mount edit chrome.
3. `/t/<profile>` does not mount edit chrome.
4. `/p/<slug>` mounts edit chrome.
5. Publish a page and confirm public SSR reflects snapshot content.
6. Move/duplicate a section in edit mode and confirm selection remains locked
   to the moved section without losing navigator node identity.
7. On a hero section, click headline/subheadline/CTA text and confirm
   `selectedBuilderNodeId` updates while the section-level inspector remains
   stable.
8. Switch device preview to tablet/mobile and confirm child-node selection
   remains synced (same `selectedBuilderNodeId`) between parent chrome and
   iframe canvas.
9. Select a hero child node, perform a section reorder/move, and confirm the
   same child-node rows remain visible in Navigator and still map to inspector
   focus targets.
10. Repeat child-node focus checks for `cta_banner` and `featured_talent`
    (headline/copy/CTA) to confirm non-hero section parity.
11. With a child node selected (headline/copy/CTA), open Style tab and confirm
    selected-node controls render with the correct node label.
12. Change selected-node `align`, `max width`, and `size` on each of
    `hero`, `cta_banner`, and `featured_talent`; verify canvas updates without
    section reload and persists after save/refresh.
13. For heading/copy nodes, toggle selected-node `tone` and confirm public
    preview reflects the same tone override after publish.
14. Repeat child-node selection + inspector focus checks on
    `testimonials_trio` (headline) and `gallery_strip` (headline/caption)
    to confirm expanded non-hero parity.
15. In Style tab selected-node controls, switch viewport target to Tablet and
    Mobile, set different `align`/`size` values, and confirm canvas preview
    updates at matching breakpoints without breaking desktop values.
16. Publish and verify tablet/mobile responsive node overrides render on
    public SSR for `hero`, `cta_banner`, `featured_talent`,
    `testimonials_trio`, and `gallery_strip`.
17. On a selected child node (headline/copy/CTA), set Visibility to `hidden`
    on Desktop and `visible` on Mobile, then confirm desktop preview hides the
    node and mobile preview restores it from the same published snapshot.
18. Insert or duplicate a section with known child roles (`hero`,
    `cta_banner`, `featured_talent`, `testimonials_trio`, `gallery_strip`) and
    confirm child-node rows appear in Navigator immediately without requiring a
    second edit/save cycle.
19. In selected-node controls, set Desktop/Tablet/Mobile `margin-top` and
    `margin-bottom` values on headline/copy/CTA nodes and confirm preview + published
    SSR apply those spacing overrides per breakpoint from the same snapshot.
20. On an empty homepage in edit mode, apply a starter and confirm the canvas +
    Navigator section counts update in place without requiring a manual full-page reload.
21. On a Free workspace with a visible `featured_talent` section and zero
    published roster profiles, run Publish preflight and confirm it returns a
    blocking error (not just warning) until at least one public profile exists.
22. In selected-node controls, set Desktop/Tablet/Mobile `padding-top`,
    `padding-bottom`, and `padding-inline` on text/copy nodes and confirm
    preview + published SSR apply those overrides per breakpoint from the same
    snapshot.
23. In selected-node controls, set Desktop/Tablet/Mobile `margin-inline` on
    text/copy nodes and confirm preview + published SSR apply those overrides
    per breakpoint from the same snapshot.
24. Provision a brand-new Free workspace from self-serve signup and confirm
    first homepage seed includes publish-ready featured roster cards (up to
    five) without manual roster setup when the roster starts fully empty.
25. In selected-node controls, switch Margin/Padding horizontal mode from
    `Linked` to `Custom`, set different left/right values, and confirm
    preview + published SSR apply `margin-left`/`margin-right` and
    `padding-left`/`padding-right` (instead of inline shorthands) per
    breakpoint from the same snapshot.
26. In Publish preflight, add section links with invalid protocols
    (`javascript:` / `data:`) and confirm they appear as blocking link
    integrity errors.
27. For a multi-locale tenant, leave one supported locale homepage
    unpublished and confirm preflight reports locale completeness warning
    (and blocks on Free due policy escalation).

## Regression policy

- Any published builder-owned page without a snapshot is a blocker.
- Any newly published builder-owned page without `builderTree` is a blocker.
- Snapshot regressions must be fixed with backfill + verification before
  releasing the phase.
- CI must include `npm run test:builder-node-bindings` to catch child-role
  derivation vs renderer binding drift before merge.
