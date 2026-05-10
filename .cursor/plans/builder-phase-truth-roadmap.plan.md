---
name: Builder roadmap unified 2026
overview: "Large execution backlog (~270 items). Canonical: web/docs/builder-execution-plan-2026.md. Many todos are parallel tracks or future phases — use filters; do not treat as strict sequential homework."
todos:
  - id: exec-p0-impronta-baseline
    content: Stabilize local Impronta QA baseline (prefer draft-only reset; no destructive publish purge unless explicitly requested).
    status: completed
  - id: exec-p0-edit-loop
    content: Verify add → edit → reorder → publish → reopen on a clean baseline (same path real users use).
    status: pending
  - id: exec-p0-registered-host
    content: Run Phase 0 human registered-host matrix (390 / ~820 / 1440) per phase-0-qa-registered-host.md.
    status: pending
  - id: exec-bugs-canvas-iframe
    content: Close or mitigate BUG-002 / BUG-003 (insert/canvas + mobile iframe) if they still block trustworthy 7A demos.
    status: pending
  - id: exec-p7a-0-schema
    content: P7A-0 — Builder-node schema + persistence contracts so library inserts round-trip draft + publish.
    status: completed
  - id: exec-p7a-1-library-ui
    content: P7A-1 — Element registry / library UI foundation (blank or custom section → pick from allow-list).
    status: pending
  - id: exec-p7a-2-selection
    content: P7A-2 — Slot targeting + honest selection (inspector matches persisted tree).
    status: pending
  - id: exec-p7a-3-reorder
    content: P7A-3 — Reorder/move parity for library-backed nodes (navigator + canvas).
    status: pending
  - id: exec-p7a-4-roundtrip
    content: P7A-4 — Draft → publish → hard refresh → reopen; tree matches persisted snapshot (persistence truth).
    status: pending
  - id: exec-p7b-after-7a
    content: Defer P7B Hero governed composition until 7A allow-list + persistence truth are demonstrably shipped.
    status: completed
  - id: pr-p0-1
    content: P0-1 — Run real-host QA matrix (390/820/1440); log bugs with severity.
    status: pending
  - id: pr-p0-2
    content: P0-2 — CMS insert → canvas parity + selection-layer scroll (regression watch).
    status: pending
  - id: pr-p0-3
    content: P0-3 — Document deferred bugs with owner + severity.
    status: pending
  - id: pr-p1-1
    content: P1-1 — Legacy /admin/site-settings/* redirects → workspace Website (no bookmark 404).
    status: pending
  - id: pr-p1-2
    content: P1-2 — Audit orphan server actions; wire or remove per convergence.
    status: pending
  - id: pr-p1-3
    content: P1-3 — Drawer mutex checklist + new drawers follow DRAWER-MUTEX.
    status: pending
  - id: pr-p2-1
    content: P2-1 — Publish drawer copy hierarchy (blocking vs advisory preflight).
    status: pending
  - id: pr-p2-2
    content: P2-2 — Draft vs published indicator pass (top bar + context).
    status: pending
  - id: pr-p2-3
    content: P2-3 — Publish failure aria-live / SR parity.
    status: pending
  - id: pr-p3-1
    content: P3-1 — Canvas drag parity with navigator (moveSectionTo shared semantics).
    status: pending
  - id: pr-p3-2
    content: P3-2 — Drop zones / handles visual polish (premium feel).
    status: pending
  - id: pr-p4-1
    content: P4-1 — Inline editor toolbar + marker cleanup.
    status: pending
  - id: pr-p4-2
    content: P4-2 — Link/CTA inline safety + policy alignment.
    status: pending
  - id: pr-p5-1
    content: P5-1 — Library Advanced gate + category copy (no flat wall).
    status: pending
  - id: pr-p5-2
    content: P5-2 — Starter default content quality for top templates.
    status: pending
  - id: pr-p6-1
    content: P6-1 — Shell selection + inspect MVP (header/footer).
    status: pending
  - id: pr-p6-2
    content: P6-2 — Shell publish + tagFor/revalidate audit (no stale shell).
    status: pending
  - id: pr-p7a-5
    content: P7A-5 — Rollout guard / tenant kill switch for library path.
    status: completed
  - id: pr-p7a-6
    content: P7A-6 — QA regression hooks (smoke/e2e/critical path checklist).
    status: pending
  - id: pr-p7a-7
    content: P7A-7 — Doc + changelog alignment after each milestone.
    status: completed
  - id: pr-p7b-1
    content: P7B-1 — Hero variant + governed slot schema (after 7A primitives real).
    status: pending
  - id: pr-p7b-2
    content: P7B-2 — Hero inspector layout/slot controls vs props-only.
    status: pending
  - id: pr-p8-1
    content: P8-1 — Per-breakpoint visibility MVP.
    status: pending
  - id: pr-p8-2
    content: P8-2 — Builder chrome 390px usability pass.
    status: pending
  - id: pr-p9-1
    content: P9-1 — router.refresh batch/debounce audit.
    status: pending
  - id: pr-p9-2
    content: P9-2 — Drawer focus trap + restore audit.
    status: pending
  - id: el-blank-section-types
    content: "7A allow-list — Blank Section: types + builder-node contract"
    status: pending
  - id: el-blank-section-registry
    content: "7A allow-list — Blank Section: registry/catalog entry + labels"
    status: pending
  - id: el-blank-section-insert
    content: "7A allow-list — Blank Section: insert flow + persisted default node"
    status: pending
  - id: el-blank-section-inspector
    content: "7A allow-list — Blank Section: inspector fields bound to persisted props"
    status: pending
  - id: el-blank-section-persist
    content: "7A allow-list — Blank Section: draft + publish round-trip for this type"
    status: pending
  - id: el-blank-section-canvas
    content: "7A allow-list — Blank Section: canvas selection + hit targets"
    status: pending
  - id: el-blank-section-navigator
    content: "7A allow-list — Blank Section: navigator tree node + ordering"
    status: pending
  - id: el-blank-section-dup-del
    content: "7A allow-list — Blank Section: duplicate + delete semantics"
    status: pending
  - id: el-blank-section-a11y
    content: "7A allow-list — Blank Section: basic aria labelling on chrome"
    status: pending
  - id: el-container-types
    content: "7A allow-list — Container: types + builder-node contract"
    status: pending
  - id: el-container-registry
    content: "7A allow-list — Container: registry/catalog entry + labels"
    status: pending
  - id: el-container-insert
    content: "7A allow-list — Container: insert flow + persisted default node"
    status: pending
  - id: el-container-inspector
    content: "7A allow-list — Container: inspector fields bound to persisted props"
    status: pending
  - id: el-container-persist
    content: "7A allow-list — Container: draft + publish round-trip for this type"
    status: pending
  - id: el-container-canvas
    content: "7A allow-list — Container: canvas selection + hit targets"
    status: pending
  - id: el-container-navigator
    content: "7A allow-list — Container: navigator tree node + ordering"
    status: pending
  - id: el-container-dup-del
    content: "7A allow-list — Container: duplicate + delete semantics"
    status: pending
  - id: el-container-a11y
    content: "7A allow-list — Container: basic aria labelling on chrome"
    status: pending
  - id: el-columns-types
    content: "7A allow-list — Columns: types + builder-node contract"
    status: pending
  - id: el-columns-registry
    content: "7A allow-list — Columns: registry/catalog entry + labels"
    status: pending
  - id: el-columns-insert
    content: "7A allow-list — Columns: insert flow + persisted default node"
    status: pending
  - id: el-columns-inspector
    content: "7A allow-list — Columns: inspector fields bound to persisted props"
    status: pending
  - id: el-columns-persist
    content: "7A allow-list — Columns: draft + publish round-trip for this type"
    status: pending
  - id: el-columns-canvas
    content: "7A allow-list — Columns: canvas selection + hit targets"
    status: pending
  - id: el-columns-navigator
    content: "7A allow-list — Columns: navigator tree node + ordering"
    status: pending
  - id: el-columns-dup-del
    content: "7A allow-list — Columns: duplicate + delete semantics"
    status: pending
  - id: el-columns-a11y
    content: "7A allow-list — Columns: basic aria labelling on chrome"
    status: pending
  - id: el-heading-types
    content: "7A allow-list — Heading: types + builder-node contract"
    status: pending
  - id: el-heading-registry
    content: "7A allow-list — Heading: registry/catalog entry + labels"
    status: pending
  - id: el-heading-insert
    content: "7A allow-list — Heading: insert flow + persisted default node"
    status: pending
  - id: el-heading-inspector
    content: "7A allow-list — Heading: inspector fields bound to persisted props"
    status: pending
  - id: el-heading-persist
    content: "7A allow-list — Heading: draft + publish round-trip for this type"
    status: pending
  - id: el-heading-canvas
    content: "7A allow-list — Heading: canvas selection + hit targets"
    status: pending
  - id: el-heading-navigator
    content: "7A allow-list — Heading: navigator tree node + ordering"
    status: pending
  - id: el-heading-dup-del
    content: "7A allow-list — Heading: duplicate + delete semantics"
    status: pending
  - id: el-heading-a11y
    content: "7A allow-list — Heading: basic aria labelling on chrome"
    status: pending
  - id: el-paragraph-types
    content: "7A allow-list — Paragraph: types + builder-node contract"
    status: pending
  - id: el-paragraph-registry
    content: "7A allow-list — Paragraph: registry/catalog entry + labels"
    status: pending
  - id: el-paragraph-insert
    content: "7A allow-list — Paragraph: insert flow + persisted default node"
    status: pending
  - id: el-paragraph-inspector
    content: "7A allow-list — Paragraph: inspector fields bound to persisted props"
    status: pending
  - id: el-paragraph-persist
    content: "7A allow-list — Paragraph: draft + publish round-trip for this type"
    status: pending
  - id: el-paragraph-canvas
    content: "7A allow-list — Paragraph: canvas selection + hit targets"
    status: pending
  - id: el-paragraph-navigator
    content: "7A allow-list — Paragraph: navigator tree node + ordering"
    status: pending
  - id: el-paragraph-dup-del
    content: "7A allow-list — Paragraph: duplicate + delete semantics"
    status: pending
  - id: el-paragraph-a11y
    content: "7A allow-list — Paragraph: basic aria labelling on chrome"
    status: pending
  - id: el-button-types
    content: "7A allow-list — Button: types + builder-node contract"
    status: pending
  - id: el-button-registry
    content: "7A allow-list — Button: registry/catalog entry + labels"
    status: pending
  - id: el-button-insert
    content: "7A allow-list — Button: insert flow + persisted default node"
    status: pending
  - id: el-button-inspector
    content: "7A allow-list — Button: inspector fields bound to persisted props"
    status: pending
  - id: el-button-persist
    content: "7A allow-list — Button: draft + publish round-trip for this type"
    status: pending
  - id: el-button-canvas
    content: "7A allow-list — Button: canvas selection + hit targets"
    status: pending
  - id: el-button-navigator
    content: "7A allow-list — Button: navigator tree node + ordering"
    status: pending
  - id: el-button-dup-del
    content: "7A allow-list — Button: duplicate + delete semantics"
    status: pending
  - id: el-button-a11y
    content: "7A allow-list — Button: basic aria labelling on chrome"
    status: pending
  - id: el-image-types
    content: "7A allow-list — Image: types + builder-node contract"
    status: pending
  - id: el-image-registry
    content: "7A allow-list — Image: registry/catalog entry + labels"
    status: pending
  - id: el-image-insert
    content: "7A allow-list — Image: insert flow + persisted default node"
    status: pending
  - id: el-image-inspector
    content: "7A allow-list — Image: inspector fields bound to persisted props"
    status: pending
  - id: el-image-persist
    content: "7A allow-list — Image: draft + publish round-trip for this type"
    status: pending
  - id: el-image-canvas
    content: "7A allow-list — Image: canvas selection + hit targets"
    status: pending
  - id: el-image-navigator
    content: "7A allow-list — Image: navigator tree node + ordering"
    status: pending
  - id: el-image-dup-del
    content: "7A allow-list — Image: duplicate + delete semantics"
    status: pending
  - id: el-image-a11y
    content: "7A allow-list — Image: basic aria labelling on chrome"
    status: pending
  - id: el-divider-types
    content: "7A allow-list — Divider: types + builder-node contract"
    status: completed
  - id: el-divider-registry
    content: "7A allow-list — Divider: registry/catalog entry + labels"
    status: completed
  - id: el-divider-insert
    content: "7A allow-list — Divider: insert flow + persisted default node"
    status: completed
  - id: el-divider-inspector
    content: "7A allow-list — Divider: inspector fields bound to persisted props"
    status: completed
  - id: el-divider-persist
    content: "7A allow-list — Divider: draft + publish round-trip for this type"
    status: completed
  - id: el-divider-canvas
    content: "7A allow-list — Divider: canvas selection + hit targets"
    status: completed
  - id: el-divider-navigator
    content: "7A allow-list — Divider: navigator tree node + ordering"
    status: completed
  - id: el-divider-dup-del
    content: "7A allow-list — Divider: duplicate + delete semantics"
    status: completed
  - id: el-divider-a11y
    content: "7A allow-list — Divider: basic aria labelling on chrome"
    status: completed
  - id: el-spacer-types
    content: "7A allow-list — Spacer: types + builder-node contract"
    status: pending
  - id: el-spacer-registry
    content: "7A allow-list — Spacer: registry/catalog entry + labels"
    status: pending
  - id: el-spacer-insert
    content: "7A allow-list — Spacer: insert flow + persisted default node"
    status: pending
  - id: el-spacer-inspector
    content: "7A allow-list — Spacer: inspector fields bound to persisted props"
    status: pending
  - id: el-spacer-persist
    content: "7A allow-list — Spacer: draft + publish round-trip for this type"
    status: pending
  - id: el-spacer-canvas
    content: "7A allow-list — Spacer: canvas selection + hit targets"
    status: pending
  - id: el-spacer-navigator
    content: "7A allow-list — Spacer: navigator tree node + ordering"
    status: pending
  - id: el-spacer-dup-del
    content: "7A allow-list — Spacer: duplicate + delete semantics"
    status: pending
  - id: el-spacer-a11y
    content: "7A allow-list — Spacer: basic aria labelling on chrome"
    status: pending
  - id: el-card-types
    content: "7A allow-list — Card: types + builder-node contract"
    status: pending
  - id: el-card-registry
    content: "7A allow-list — Card: registry/catalog entry + labels"
    status: pending
  - id: el-card-insert
    content: "7A allow-list — Card: insert flow + persisted default node"
    status: pending
  - id: el-card-inspector
    content: "7A allow-list — Card: inspector fields bound to persisted props"
    status: pending
  - id: el-card-persist
    content: "7A allow-list — Card: draft + publish round-trip for this type"
    status: pending
  - id: el-card-canvas
    content: "7A allow-list — Card: canvas selection + hit targets"
    status: pending
  - id: el-card-navigator
    content: "7A allow-list — Card: navigator tree node + ordering"
    status: pending
  - id: el-card-dup-del
    content: "7A allow-list — Card: duplicate + delete semantics"
    status: pending
  - id: el-card-a11y
    content: "7A allow-list — Card: basic aria labelling on chrome"
    status: pending
  - id: el-cta-group-types
    content: "7A allow-list — CTA Group: types + builder-node contract"
    status: pending
  - id: el-cta-group-registry
    content: "7A allow-list — CTA Group: registry/catalog entry + labels"
    status: pending
  - id: el-cta-group-insert
    content: "7A allow-list — CTA Group: insert flow + persisted default node"
    status: pending
  - id: el-cta-group-inspector
    content: "7A allow-list — CTA Group: inspector fields bound to persisted props"
    status: pending
  - id: el-cta-group-persist
    content: "7A allow-list — CTA Group: draft + publish round-trip for this type"
    status: pending
  - id: el-cta-group-canvas
    content: "7A allow-list — CTA Group: canvas selection + hit targets"
    status: pending
  - id: el-cta-group-navigator
    content: "7A allow-list — CTA Group: navigator tree node + ordering"
    status: pending
  - id: el-cta-group-dup-del
    content: "7A allow-list — CTA Group: duplicate + delete semantics"
    status: pending
  - id: el-cta-group-a11y
    content: "7A allow-list — CTA Group: basic aria labelling on chrome"
    status: pending
  - id: p7a-0-design-review
    content: "P7A-0 — Design review: schema boundaries vs legacy-section-tree honesty."
    status: completed
  - id: p7a-0-actions
    content: P7A-0 — Server actions / mutations for insert-patch-remove library nodes.
    status: completed
  - id: p7a-0-migrate
    content: P7A-0 — Migrations if new tables/columns required (coordinate with tenant isolation).
    status: completed
  - id: p7a-0-tenant-test
    content: P7A-0 — tenant-isolation tests for new mutations.
    status: cancelled
  - id: p7a-1-search-cats
    content: "P7A-1 — Library UI: search + categories for element picker."
    status: pending
  - id: p7a-1-empty-states
    content: P7A-1 — Empty/error states when library loading fails.
    status: pending
  - id: p7a-2-multi-select
    content: "P7A-2 — Deep selection: nested library nodes without synthetic layers."
    status: pending
  - id: p7a-3-undo
    content: P7A-3 — Undo/redo coherence after reorder for library nodes (if applicable).
    status: pending
  - id: p7a-4-cache
    content: P7A-4 — RSC/cache invalidation after publish matches navigator/canvas.
    status: pending
  - id: gate-qa-typecheck
    content: Gate — npm run typecheck green on builder paths.
    status: completed
  - id: gate-qa-tenant
    content: Gate — npm run test:tenant-isolation when tenant/server touched.
    status: pending
  - id: gate-qa-registered-host
    content: Gate — builder smoke on registered host (no console explosions).
    status: pending
  - id: gate-qa-phase0-waive
    content: Gate — Phase 0 real-host QA done OR explicit waive note with risk.
    status: pending
  - id: gate-qa-7a-demo
    content: Gate — First 7A demo target passes end-to-end before claiming library shipped.
    status: pending
  - id: gate-pilot-publish-safe
    content: Pilot gate — publish flow feels safe (Phase 2 minimum).
    status: pending
  - id: gate-pilot-shell
    content: Pilot gate — shell editable OR limitation clearly communicated.
    status: pending
  - id: gate-pilot-mqa
    content: Pilot gate — mobile/tablet/desktop QA once.
    status: pending
  - id: gate-pilot-library
    content: Pilot gate — section library usable for real pages.
    status: pending
  - id: gate-premium-shell
    content: Premium gate — header/footer editable + publish-safe.
    status: pending
  - id: gate-premium-trust
    content: Premium gate — publish trust + recovery complete.
    status: pending
  - id: gate-premium-rsp
    content: Premium gate — responsive authoring strong (Phase 8 direction).
    status: pending
  - id: gate-premium-7a7b
    content: Premium gate — 7A library + 7B governed sections on honest path.
    status: pending
  - id: acc-ph0
    content: §3 Phase 0 acceptance — QA notes + deferred bugs documented.
    status: pending
  - id: acc-ph1
    content: §3 Phase 1 acceptance — single canonical builder path; no dead controls.
    status: pending
  - id: acc-ph2
    content: §3 Phase 2 acceptance — user understands selection/save/publish.
    status: pending
  - id: acc-ph3
    content: §3 Phase 3 acceptance — canvas + navigator order aligned.
    status: pending
  - id: acc-ph4
    content: §3 Phase 4 acceptance — inline edit without schema thinking.
    status: pending
  - id: acc-ph5
    content: §3 Phase 5 acceptance — polished homepage in ~15 min from library.
    status: pending
  - id: acc-ph6
    content: §3 Phase 6 acceptance — whole branded surface editable; shell not stale.
    status: pending
  - id: acc-ph7a
    content: §3 Phase 7A acceptance — allow-list + persistence truth + First 7A demo.
    status: pending
  - id: acc-ph7b
    content: §3 Phase 7B acceptance — Hero on 7A model (not parallel fake stack).
    status: pending
  - id: acc-ph8
    content: §3 Phase 8 acceptance — intentional responsive authoring.
    status: pending
  - id: acc-ph9
    content: §3 Phase 9 acceptance — perf + keyboard/SR viable on major flows.
    status: pending
  - id: strat-simple-advanced-copy
    content: UX copy — Simple vs Advanced surfaces when editing template vs composing elements.
    status: pending
  - id: strat-no-fake-layers
    content: Review — no new UI that implies layers without persisted child nodes.
    status: pending
  - id: strat-changelog
    content: Process — append changelog row after substantive roadmap or code milestone.
    status: completed
  - id: ci-scope-touch
    content: AGENTS — scoped lint/typecheck on touched paths when repo ESLint baseline noisy.
    status: pending
  - id: defer-video-forms
    content: Explicit defer — Video/Forms/slider items/repeaters/custom code out of 7A MVP.
    status: completed
  - id: shell-no-fake-model
    content: Phase 6 — shell/header/footer parity without parallel fake component model.
    status: pending
  - id: pv1-revision-diff
    content: Post-v1 — visual revision diff (beyond restore UX).
    status: pending
  - id: pv1-comments
    content: Post-v1 — comments/presence depth.
    status: pending
  - id: pv1-share-analytics
    content: Post-v1 — share analytics.
    status: pending
  - id: pv1-prototype-import
    content: Post-v1 — prototype import.
    status: pending
  - id: pv1-ai-layout
    content: Post-v1 — arbitrary AI layout generation (policy-gated).
    status: pending
  - id: pv1-theme-polish
    content: Post-v1 — HSL/eyedropper theme polish non-blocking.
    status: pending
  - id: pv1-design-ref-import
    content: Post-v1 — design-reference import.
    status: pending
  - id: qa-bug-001
    content: Human QA — resolve or explicitly defer BUG-001 (builder-human-qa-run).
    status: pending
  - id: qa-bug-002
    content: Human QA — resolve or explicitly defer BUG-002 (builder-human-qa-run).
    status: pending
  - id: qa-bug-003
    content: Human QA — resolve or explicitly defer BUG-003 (builder-human-qa-run).
    status: pending
  - id: qa-bug-004
    content: Human QA — resolve or explicitly defer BUG-004 (builder-human-qa-run).
    status: pending
  - id: qa-bug-005
    content: Human QA — resolve or explicitly defer BUG-005 (builder-human-qa-run).
    status: pending
  - id: qa-bug-006
    content: Human QA — resolve or explicitly defer BUG-006 (builder-human-qa-run).
    status: pending
  - id: qa-bug-007
    content: Human QA — resolve or explicitly defer BUG-007 (builder-human-qa-run).
    status: pending
  - id: qa-bug-008
    content: Human QA — resolve or explicitly defer BUG-008 (builder-human-qa-run).
    status: pending
  - id: 7c-cta-banner-inventory
    content: "Phase 7C — CTA banner: inventory"
    status: pending
  - id: 7c-cta-banner-governance-model
    content: "Phase 7C — CTA banner: governance model"
    status: pending
  - id: 7c-cta-banner-schema
    content: "Phase 7C — CTA banner: schema"
    status: pending
  - id: 7c-cta-banner-vertical-pilot
    content: "Phase 7C — CTA banner: vertical pilot"
    status: pending
  - id: 7c-cta-banner-inspector-honesty
    content: "Phase 7C — CTA banner: inspector honesty"
    status: pending
  - id: 7c-cta-banner-canvas-nav-parity
    content: "Phase 7C — CTA banner: canvas nav parity"
    status: pending
  - id: 7c-cta-banner-publish-loop
    content: "Phase 7C — CTA banner: publish loop"
    status: pending
  - id: 7c-cta-banner-sign-off
    content: "Phase 7C — CTA banner: sign off"
    status: pending
  - id: 7c-gallery-inventory
    content: "Phase 7C — Gallery: inventory"
    status: pending
  - id: 7c-gallery-governance-model
    content: "Phase 7C — Gallery: governance model"
    status: pending
  - id: 7c-gallery-schema
    content: "Phase 7C — Gallery: schema"
    status: pending
  - id: 7c-gallery-vertical-pilot
    content: "Phase 7C — Gallery: vertical pilot"
    status: pending
  - id: 7c-gallery-inspector-honesty
    content: "Phase 7C — Gallery: inspector honesty"
    status: pending
  - id: 7c-gallery-canvas-nav-parity
    content: "Phase 7C — Gallery: canvas nav parity"
    status: pending
  - id: 7c-gallery-publish-loop
    content: "Phase 7C — Gallery: publish loop"
    status: pending
  - id: 7c-gallery-sign-off
    content: "Phase 7C — Gallery: sign off"
    status: pending
  - id: 7c-slider-inventory
    content: "Phase 7C — Slider: inventory"
    status: pending
  - id: 7c-slider-governance-model
    content: "Phase 7C — Slider: governance model"
    status: pending
  - id: 7c-slider-schema
    content: "Phase 7C — Slider: schema"
    status: pending
  - id: 7c-slider-vertical-pilot
    content: "Phase 7C — Slider: vertical pilot"
    status: pending
  - id: 7c-slider-inspector-honesty
    content: "Phase 7C — Slider: inspector honesty"
    status: pending
  - id: 7c-slider-canvas-nav-parity
    content: "Phase 7C — Slider: canvas nav parity"
    status: pending
  - id: 7c-slider-publish-loop
    content: "Phase 7C — Slider: publish loop"
    status: pending
  - id: 7c-slider-sign-off
    content: "Phase 7C — Slider: sign off"
    status: pending
  - id: 7c-testimonials-inventory
    content: "Phase 7C — Testimonials: inventory"
    status: pending
  - id: 7c-testimonials-governance-model
    content: "Phase 7C — Testimonials: governance model"
    status: pending
  - id: 7c-testimonials-schema
    content: "Phase 7C — Testimonials: schema"
    status: pending
  - id: 7c-testimonials-vertical-pilot
    content: "Phase 7C — Testimonials: vertical pilot"
    status: pending
  - id: 7c-testimonials-inspector-honesty
    content: "Phase 7C — Testimonials: inspector honesty"
    status: pending
  - id: 7c-testimonials-canvas-nav-parity
    content: "Phase 7C — Testimonials: canvas nav parity"
    status: pending
  - id: 7c-testimonials-publish-loop
    content: "Phase 7C — Testimonials: publish loop"
    status: pending
  - id: 7c-testimonials-sign-off
    content: "Phase 7C — Testimonials: sign off"
    status: pending
  - id: 7c-talent-grid-inventory
    content: "Phase 7C — Talent grid: inventory"
    status: pending
  - id: 7c-talent-grid-governance-model
    content: "Phase 7C — Talent grid: governance model"
    status: pending
  - id: 7c-talent-grid-schema
    content: "Phase 7C — Talent grid: schema"
    status: pending
  - id: 7c-talent-grid-vertical-pilot
    content: "Phase 7C — Talent grid: vertical pilot"
    status: pending
  - id: 7c-talent-grid-inspector-honesty
    content: "Phase 7C — Talent grid: inspector honesty"
    status: pending
  - id: 7c-talent-grid-canvas-nav-parity
    content: "Phase 7C — Talent grid: canvas nav parity"
    status: pending
  - id: 7c-talent-grid-publish-loop
    content: "Phase 7C — Talent grid: publish loop"
    status: pending
  - id: 7c-talent-grid-sign-off
    content: "Phase 7C — Talent grid: sign off"
    status: pending
  - id: 7c-contact-inventory
    content: "Phase 7C — Contact: inventory"
    status: pending
  - id: 7c-contact-governance-model
    content: "Phase 7C — Contact: governance model"
    status: pending
  - id: 7c-contact-schema
    content: "Phase 7C — Contact: schema"
    status: pending
  - id: 7c-contact-vertical-pilot
    content: "Phase 7C — Contact: vertical pilot"
    status: pending
  - id: 7c-contact-inspector-honesty
    content: "Phase 7C — Contact: inspector honesty"
    status: pending
  - id: 7c-contact-canvas-nav-parity
    content: "Phase 7C — Contact: canvas nav parity"
    status: pending
  - id: 7c-contact-publish-loop
    content: "Phase 7C — Contact: publish loop"
    status: pending
  - id: 7c-contact-sign-off
    content: "Phase 7C — Contact: sign off"
    status: pending
  - id: p7b-var-centered
    content: "P7B — Hero variant concern: centered"
    status: pending
  - id: p7b-var-split
    content: "P7B — Hero variant concern: split"
    status: pending
  - id: p7b-var-image-left
    content: "P7B — Hero variant concern: image left"
    status: pending
  - id: p7b-var-image-right
    content: "P7B — Hero variant concern: image right"
    status: pending
  - id: p7b-var-overlay-depth
    content: "P7B — Hero variant concern: overlay depth"
    status: pending
  - id: p7b-var-responsive-hide-show
    content: "P7B — Hero variant concern: responsive hide show"
    status: pending
  - id: p7b-var-cta-group-bindings
    content: "P7B — Hero variant concern: cta group bindings"
    status: pending
  - id: p7b-var-media-slot
    content: "P7B — Hero variant concern: media slot"
    status: pending
  - id: verify-p0-1
    content: Verify/reconcile roadmap — PP0-1 status vs implementation (close or update doc).
    status: pending
  - id: verify-p0-2
    content: Verify/reconcile roadmap — PP0-2 status vs implementation (close or update doc).
    status: pending
  - id: verify-p0-3
    content: Verify/reconcile roadmap — PP0-3 status vs implementation (close or update doc).
    status: pending
  - id: verify-p1-1
    content: Verify/reconcile roadmap — PP1-1 status vs implementation (close or update doc).
    status: pending
  - id: verify-p1-2
    content: Verify/reconcile roadmap — PP1-2 status vs implementation (close or update doc).
    status: pending
  - id: verify-p1-3
    content: Verify/reconcile roadmap — PP1-3 status vs implementation (close or update doc).
    status: pending
  - id: verify-p2-1
    content: Verify/reconcile roadmap — PP2-1 status vs implementation (close or update doc).
    status: pending
  - id: verify-p2-2
    content: Verify/reconcile roadmap — PP2-2 status vs implementation (close or update doc).
    status: pending
  - id: verify-p2-3
    content: Verify/reconcile roadmap — PP2-3 status vs implementation (close or update doc).
    status: pending
  - id: verify-p3-1
    content: Verify/reconcile roadmap — PP3-1 status vs implementation (close or update doc).
    status: pending
  - id: verify-p3-2
    content: Verify/reconcile roadmap — PP3-2 status vs implementation (close or update doc).
    status: pending
  - id: verify-p4-1
    content: Verify/reconcile roadmap — PP4-1 status vs implementation (close or update doc).
    status: pending
  - id: verify-p4-2
    content: Verify/reconcile roadmap — PP4-2 status vs implementation (close or update doc).
    status: pending
  - id: verify-p5-1
    content: Verify/reconcile roadmap — PP5-1 status vs implementation (close or update doc).
    status: pending
  - id: verify-p5-2
    content: Verify/reconcile roadmap — PP5-2 status vs implementation (close or update doc).
    status: pending
  - id: verify-p6-1
    content: Verify/reconcile roadmap — PP6-1 status vs implementation (close or update doc).
    status: pending
  - id: verify-p6-2
    content: Verify/reconcile roadmap — PP6-2 status vs implementation (close or update doc).
    status: pending
  - id: verify-p8-1
    content: Verify/reconcile roadmap — PP8-1 status vs implementation (close or update doc).
    status: pending
  - id: verify-p8-2
    content: Verify/reconcile roadmap — PP8-2 status vs implementation (close or update doc).
    status: pending
  - id: verify-p9-1
    content: Verify/reconcile roadmap — PP9-1 status vs implementation (close or update doc).
    status: pending
  - id: verify-p9-2
    content: Verify/reconcile roadmap — PP9-2 status vs implementation (close or update doc).
    status: pending
  - id: p6-spot-homepage
    content: "P6 — publish/cache spot check: homepage"
    status: pending
  - id: p6-spot-cms-page
    content: "P6 — publish/cache spot check: cms-page"
    status: pending
  - id: p6-spot-storefront-shell
    content: "P6 — publish/cache spot check: storefront-shell"
    status: pending
  - id: p6-spot-tenant-nav
    content: "P6 — publish/cache spot check: tenant-nav"
    status: pending
isProject: false
---

# Builder roadmap — unified execution plan (2026)

**Canonical roadmap:** [`web/docs/builder-execution-plan-2026.md`](../web/docs/builder-execution-plan-2026.md) — **edit that file** for repo truth. This `.plan.md` is the Cursor Plans **mirror** (same content, links adjusted for `.cursor/plans/`).

**Canonical working roadmap for Tulala / Impronta.** Use this for daily prioritization. Detailed evidence and discovery lives in [builder-deep-audit-2026-05-09.md](../web/docs/builder-deep-audit-2026-05-09.md). Strategic alignment: [builder-convergence-plan.md](../web/docs/builder-convergence-plan.md). Surface scorecard: [builder-experience-execution-plan.md](../web/docs/builder-experience-execution-plan.md).

**Advanced Mode is gated on 7A. Phase 5 templates do not equal Advanced Mode.**

## Strategic framing and execution truth

### Strategic stance

- **Phase 7 is not “done” because `BuilderNode` (or builder infrastructure) exists.** **Advanced Mode begins only when Phase 7A (Element Library MVP)** ships. The “advanced builder” story is **gated on 7A**, not on Phase 5 template polish alone.
- **Simple Mode** — templates, inserter, and Phase 5 flows: polished pages without governed **element** primitives.
- **Advanced Mode** — begins at **7A**: blank/minimal section → insert **elements** from a governed library → reorder → edit → publish → hard refresh → **persists**, with an **honest** builder tree (no synthetic “layers”).

### Guardrails

| Trap | Rule |
|------|------|
| Docs vs reality | Updating the roadmap **≠** shipping; verify against code and QA. |
| Templates vs element library | **Section templates ≠ element library.** Do not treat template volume as “library MVP.” |
| Milestones before 7A | Do **not** make **template count expansion** the main milestone **ahead of 7A** unless product escalates. |
| Fake layers | Do not present **field-backed** props as **reorderable child nodes**; stay aligned with section 7 (honest UI) and [`legacy-section-tree.ts`](../web/src/lib/site-admin/builder-node/legacy-section-tree.ts). |
| Phase numbers vs build order | **Phase 6 (shell)** and **Phase 7A** are **different tracks** — dependency wins, not numeric order. |

### First 7A demo target (acceptance)

On a **registered tenant host** (see [AGENTS.md](../../AGENTS.md), [OPERATING.md](../../OPERATING.md), [web/AGENTS.md](../web/AGENTS.md), and [Phase 0 registered-host QA](../web/docs/phase-0-qa-registered-host.md)):

The **first true product proof** for 7A must follow **First 7A proof must use Blank Section** below — **not** Hero, **not** a starter template, and **not** a locked section preset. Quick exploratory demos may use a minimal scaffold only when labeled **non-shipping**.

Every element inserted through the Element Library must pass the **7A Reality Test** (below).

If any step fails, **7A is not done**.

### Governed composition: 7A–7D (product framing)

Communicate nested composition as **sub-phases**, not one blob named “Phase 7”:

| Subphase | Name | Goal (one line) |
|----------|------|-----------------|
| **7A** | Element Library MVP | Real persisted nodes from a library; insert/reorder; honest inspector — **mandatory** before “Advanced Mode” claims. |
| **7B** | Hero pilot | First vertical composition pilot (variants, slots, media). Current roadmap “Phase 7 Hero” tasks belong **here**; **does not replace 7A**. |
| **7C** | Repeat pattern | CTA, gallery, slider, testimonials, talent grid, contact — same governance pattern as Hero. |
| **7D** | Governance scale | Depth limits, allowed parents, validation, perf budgets as composition spreads. |

Phases **8–10** in §3 stay as written (responsive authoring, perf/a11y, post-v1).

### PR task IDs

Full task rows (files, risk, test) live in **§4** — **Phase 7A — Element Library MVP** (P7A-0 … P7A-7) and **Phase 7B — Governed Hero** (P7B-1, P7B-2). Use **P7B-*** for Hero-only work so it is never mistaken for the element-library MVP.

### What 7A is not

Claiming **7A** requires real library-backed **persisted** elements — not any of the following:

- More **ready-made section templates** (that is Phase 5 / library density, not 7A).
- **Synthetic child rows** derived from legacy flat props.
- A **visual list of fields** pretending to be layers.
- A **Hero-only variant picker** (that is **7B**, on top of 7A).
- A **template gallery** relabeled as “element library.”

### 7A MVP element allow-list

Lock first-ship scope to:

**In MVP:** Blank Section, Container, Columns, Heading, Paragraph, Button, Image, Divider, Spacer, Card, CTA Group.

**Not in MVP:** Video, Forms, Slider items, dynamic repeater cards, arbitrary custom code — pull forward only by explicit product call.

### Persistence truth (7A)

7A nodes must persist through the **same builder tree / snapshot path** used for **draft and publish** (the path real sections use today). If an element exists only in **client-only state**, **localStorage**, **inspector draft props without persisted nodes**, or a **synthetic legacy projection**, **7A is not shipped**.

### Migration rule (legacy sections)

**Do not break** current shipped sections. **Legacy sections stay supported.** 7A lands on **blank/custom** composition surfaces first. **7A must not rewrite** existing Hero, CTA, Gallery, Talent Grid, Contact, or similar legacy sections — those migrate **later** through **7B / 7C**. **Do not rewrite all legacy sections inside the first 7A PRs.**

### Simple vs Advanced Mode UX rule

- **Simple Mode** is the **default** for non-technical users (templates, starters, Phase 5 library).
- **Advanced Mode** is **opt-in inside the builder**, beginning with **Blank Section / Custom Section** flows that expose **real element composition**.
- The UI must **say plainly** when the user is editing a **ready-made section** versus **composing real persisted elements**, so we never imply Webflow-level freedom without the data model.

### No destructive QA reset (Impronta)

Impronta is both the **QA tenant** and a **real brand surface**. QA cleanup must **prefer draft-only reset** (discard draft `cms_page_sections`, use runbooks). **Do not** clear **published** homepage snapshots or **purge** production sections unless the user **explicitly** asks for blank-canvas destructive testing.

### Roadmap revision checklist

Ongoing hygiene:

- [ ] Append a **changelog** row after substantive roadmap edits.
- [ ] If code ships with roadmap edits, run **`npm run typecheck`** (and scoped lint / `npm run ci` per AGENTS.md).

---

## Phase 7A guardrails (execution)

These guardrails prevent **7A** from becoming another **fake layer** system or an internal registry dressed as a library.

### 7A Reality Test

For **every** element inserted through the **Element Library**, verify **before** claiming 7A shipped:

| Check | Requirement |
|-------|-------------|
| Persisted identity | It has a **real persisted** builder/node ID on the **server-backed** tree (not props-only illusion). |
| Navigator | It appears in the **navigator** as a **real** node — not a synthetic row from legacy flat props. |
| Selection | It can be **selected independently** from sibling nodes. |
| Edit | It can be **edited independently** (inspector drives **persisted** fields / children). |
| Reorder | It can be **reordered** wherever governance allows (navigator **and** canvas stay aligned). |
| Draft | Changes **survive draft save** / autosave path used by real sections. |
| Publish | Changes **survive publish** (snapshot matches intent). |
| Reopen | After **hard refresh** or **reopen**, the tree **matches** what was edited — **no client-only recovery**. |
| Not legacy-derived | It is **not** represented **only** as derived children from **legacy section props** without persisted nodes. |
| Not client-only | It is **not** **local-only** / transient UI state without persisted backing. |

If **any** check fails for **any** allow-list element, **7A is not shipped**.

### First 7A proof must use Blank Section

**Blank Section is the first product proof.** The **first Advanced Mode proof** must **not** use Hero, a **starter template**, or a **locked section preset**.

Minimum sequence on a **registered host**:

1. Insert **Blank Section** / **custom blank** composition surface (not a marketing starter).
2. **Add** at least **Heading**, **Paragraph**, **Button**, **Image**, and **Divider** or **Spacer** — each as **persisted** nodes from the library.
3. **Reorder** nodes within governance rules.
4. **Edit** each independently; confirm inspector honesty.
5. **Publish** → **hard refresh** → **reopen** → confirm **identical** persisted tree.

**Why:** Starting from Hero or templates lets the team slide back into **template wiring** instead of **real architecture**.

### 7A Gate 0 — before P7A-1 (no Add Element UI yet)

**Do not build the Add Element / library picker UI until P7A-0’s persistence contract is verified.** Otherwise UI work discovers persistence failures late.

Before **P7A-1**, confirm in code/review:

- **Persisted node shape** for library inserts (IDs, types, parent pointers).
- **Allowed parent/child rules** (see governance table below).
- **Draft save path** for mutations.
- **Publish snapshot path** (what SSR/routes read).
- **Reopen/read path** after refresh (RSC + client reconcile).
- **Tenant scoping** (RLS / agency isolation).
- **Undo/redo expectation** (explicit MVP behavior — even if “limited”).
- **Kill switch / tenant feature flag** path (safe disable without destroying legacy pages).
- **Non-interference** with existing legacy sections (no mandatory migration inside 7A).

### P7A-0 deliverable format

**P7A-0 must produce a concrete technical deliverable** — not architecture vibes. Before **P7A-1**, the output should be **written down and/or coded** to the point another engineer can implement UI against it without guessing.

**1. BuilderNode persistence contract**

- **Node shape** — fields for type, payload, metadata.
- **IDs** — stable identity for persisted nodes (draft + publish).
- **Parent/child relationship** — how nesting is stored and validated.
- **Ordering** — sibling order key / array semantics.
- **Allowed node types** — enum or equivalent aligned with allow-list.
- **Style/content payload location** — where typography/spacing/content live vs structural props.

**2. Allowed parent/child matrix** — explicit for **Blank Section**, **Container**, **Columns**, **Column**, **Card**, **CTA Group** (and how it ties to the **Parent / child governance** table below — **frozen** as schema rules / validation, not prose-only).

**3. Draft mutation path** — how **insert / update / move / delete** persist **before** publish (server actions, RPC shape, optimistic behavior if any).

**4. Publish snapshot path** — how the **custom tree** becomes **public output** (what tables/snapshots SSR reads).

**5. Reopen/read path** — how **SSR / RSC / client** load the **same tree** after **hard refresh** (no orphan client-only state).

**6. Renderer path** — where each **MVP element** renders from; how **unknown / invalid** nodes **fail safely** (no white-screen / silent drop).

**7. Inspector routing** — how selecting **Heading** vs **Button** vs **Image** routes to the **correct** inspector surface.

**8. Navigator routing** — how **real** nodes appear in the tree; how **synthetic legacy** rows stay **visually distinct** (honesty).

**9. Feature flag / kill switch** — how **7A is disabled per tenant** without damaging **existing** pages.

**10. Test proof**

- **`npm run typecheck`**
- **`npm run test:tenant-isolation`** when server/tenant paths touched
- **One manual** draft → publish → reopen proof for a **seed node** (or smallest persisted insert) **if possible** before UI ramp.

**Acceptance for P7A-0**

We know **exactly**:

- **Where** custom element nodes **persist**.
- **How** they **render**.
- **How** they **publish**.
- **How** they **reopen** after refresh.
- **How** they are **scoped** by tenant.
- **How** to **disable** the feature safely.

→ **Only then is P7A-1 safe to start.**

**P7A-0 close-out:** End with one explicit line — **`Proceed to P7A-1`** **or** **`Blocked because ___`** (specific blocker, owner, next step).

### 7A Inspector MVP (lock scope)

Do **not** ship animation suites, forms, video, arbitrary **custom CSS**, or arbitrary code in **7A**. Lock inspectors to:

| Element | Controls (MVP) |
|---------|------------------|
| **Heading** | Text, level, alignment, color, size, spacing |
| **Paragraph** | Text, alignment, color, size, spacing |
| **Button** | Label, URL, style, size, alignment, open in new tab |
| **Image** | Source, alt text, width, radius, alignment |
| **Container** | Width, padding, gap, alignment |
| **Columns** | Column count, gap, ratio, mobile stack |

*(Divider, Spacer, Card, CTA Group: minimal geometric/spacing + content fields only — no new subsystem per component beyond this discipline.)*

### Parent / child governance (7A)

Allowed structure **for 7A** (evolves in **7B/7C** with review):

| Parent | Allowed children |
|--------|------------------|
| **Blank Section** | Container, Heading, Paragraph, Button, Image, Divider, Spacer, Columns, Card |
| **Container** | Heading, Paragraph, Button, Image, Divider, Spacer, Columns, Card, CTA Group |
| **Columns** | Column only |
| **Column** | Heading, Paragraph, Button, Image, Divider, Spacer, Card, CTA Group |
| **Card** | Heading, Paragraph, Button, Image |
| **CTA Group** | Button only |

Invalid drops should **fail closed** (no silent coercion).

### No legacy migration inside 7A

**7A does not migrate or rewrite** existing Hero, CTA, Gallery, Talent Grid, Contact, or similar sections. It lands on **Blank Section / Custom Section** first. **Existing sections migrate later** through **7B** and **7C** with explicit plans.

### Feature flag / kill switch (required)

**7A ships behind a tenant feature flag** until **publish / hard refresh / reopen** QA is stable on real tenants. If rendering or persistence is wrong, operators need a **safe disable** path that **does not** corrupt existing published pages.

### Element Library UX standard

The **Add Element** experience must feel like a **premium builder**, not a **developer registry**:

- **Categories:** Layout, Text, Media, Actions, Structure (or equivalent plain-language buckets).
- **Names:** user-facing (**Heading**, **Text**, **Button**, **Image**, **Divider**, **Spacer**, **Columns**…) — **no raw internal node type strings** in the default UI.
- **Short descriptions** under each choice where helpful.
- **Small preview or icon** per item.
- **Disabled** choices only with a **clear** reason (governance, plan, or parent mismatch).
- **Premium density** — calm spacing, readable hierarchy; not a flat dump of types.

### Simple Mode must stay clean

**Advanced Mode is opt-in.** **Simple Mode** remains the default path: **premium ready-made sections** and **starters** (Phase 5). Users reach element composition through **Blank Section / Custom Section** (or explicit Advanced entry) — **never** by forcing non-technical users through raw element assembly.

### 7A Demo Evidence

The **first 7A proof** must include **screenshots or a short screen recording** — text-only claims are **not** enough for product-ready acceptance.

Capture **all** of the following:

1. **Blank Section** inserted (composition surface visible).
2. **Heading**, **Paragraph**, **Button**, **Image**, and **Divider** or **Spacer** inserted as **real persisted** elements (not props theatre).
3. **Navigator** showing those nodes as **real** tree entries.
4. **Inspector** editing **one** selected element **independently** of siblings.
5. A **reorder** action (navigator and/or canvas, per governance).
6. **Publish**.
7. **Hard refresh** / **reopen** session.
8. The **same custom section** still **renders correctly** and matches persisted structure.

Without **visual proof**, **7A is not accepted** as product-ready (“works in code” is insufficient).

### 7A Design Guardrails

Element Library MVP must be **flexible but not visually unsafe**. Defaults must be **premium**, not raw HTML chaos:

- **Heading** — sensible default **size** and **line-height**.
- **Paragraph** — readable **max width** (or governed measure).
- **Button** — uses **brand tokens** (not ad-hoc hex soup).
- **Image** — safe default **radius** / crop framing.
- **Container** — **governed spacing** (padding/gap presets tied to design system).
- **Columns** — sensible **gap**, **ratio**, and **mobile stack** defaults.
- **Divider / Spacer** — **controlled presets** only — not arbitrary pixel sliders that invite ugly layouts.

Default-inserted elements should look **polished**, not “developer playground.” The goal is **not only** “can insert elements” — it is **insert elements and still ship a premium page** inside governed defaults.

---

## Planning freeze

After this roadmap update, **no new broad builder planning documents** should be created until **P7A-0** and **P7A-1** have **shipped**, or **implementation exposes a real blocker** that requires a scoped doc.

**Allowed next work:**

- Impronta **QA baseline** cleanup (non-destructive where possible).
- **Core loop** verification (add → edit → reorder → publish → reopen).
- **P7A-0** persistence contract + **Gate 0**.
- **P7A-1** Add Element UI.
- **Critical bug fixes** discovered during those tasks.

**Not allowed:**

- More **abstract roadmap reshuffling** without shipped code.
- **Template expansion** as the **main** milestone (that is **not** Element Library MVP).
- New **“future builder”** essays **without** matching implementation progress.
- **Hero-only composition** pretending to be **Element Library MVP** — Hero is **P7B**, **after** **7A** primitives exist.

**Why:** Otherwise agents (and humans) can keep producing excellent documents while the **element library still does not exist.**

---

## Current execution priority (final order)

1. Stabilize **Impronta QA baseline** (non-destructive where possible).
2. Verify **add → edit → reorder → publish → reopen** on a clean state.
3. **Execute P7A-0** — persistence contract + **Gate 0** verified (**no P7A-1 until then**).
4. **Execute P7A-1** — Add Element UI + library UX standard.
5. Produce **first Blank Section demo evidence** (**7A Demo Evidence** above — screenshots or recording).
6. Convert **Hero under P7B only after** 7A primitives pass **7A Reality Test** + evidence.
7. Resume **Phase 6 shell** / header-footer parity **without** a parallel fake component model.

**Product direction:** **Simple Mode** = premium ready-made sections and starters. **Advanced Mode** = **Blank Section** + **Element Library** + **real persisted elements**.

**No more broad planning** unless implementation exposes a **blocker** — see **Planning freeze** above.

---

## 1. Product goal

We are building a **premium 2026 visual page/site builder** where a **non-technical** agency owner, operator, coordinator, or talent business can **create and publish premium branded pages without a developer**.

The builder must feel:

- **Visual** — editing happens on the live canvas, not abstract forms.
- **Fast** — responsive chrome, smooth drag, reliable typing.
- **Premium** — spacing, typography, motion, and panels at product-grade polish.
- **Responsive** — trustworthy preview and eventual **responsive authoring** (not preview-only).
- **Safe to publish** — clear draft vs live, preflight, recovery, no scary ambiguity.
- **Easy for non-technical users** — plain language, obvious selection, honest affordances.
- **Powerful enough** for future **governed nested composition** (Section → Layout → Slot → Element).
- **Honest** about **field editing** vs **real child-element editing** vs **true nested composition** — see section 7.

---

## 2. Current reality (short)

- The editor is **past prototype**: EditShell, navigator, inspector, drawers, publish, revisions, section insert, and **builder-node** architecture are **largely implemented**.
- **Some** child selections map to **real persisted nodes**; **many legacy sections** still expose **synthetic children** derived from flat props ([legacy-section-tree.ts](../web/src/lib/site-admin/builder-node/legacy-section-tree.ts)); see audit §12.
- **Editable header/footer shell** (Phase B / convergence capability **#1**) remains the **largest product gap** vs “full site builder.”
- **Real-browser QA on registered tenant hosts** was **not completed** in the automated audit session (`agency_domains`; see [AGENTS.md](../../AGENTS.md), [OPERATING.md](../../OPERATING.md)). Treat this as **Phase 0 gate**.
- **`npm run lint` repo-wide** is **baseline debt**, not builder readiness; use **scoped lint** on touched paths until baseline improves.
- **Parallel truth:** Phases advance **in parallel**; status is **per-phase**, not one linear step.
- **Stabilization bridge:** Phase **0–3** issues (insert/canvas, iframe preview, publish trust) can **block demos** even while 7A is scheduled — track them explicitly.

---

## 3. Locked execution phases

### Phase 0 — Real tenant browser QA

**Before large feature work:** exercise the builder on a **registered tenant host** (not raw `*.vercel.app` unless aliased into `agency_domains`).

**Test:** ~390px mobile, ~820px tablet, ~1440px desktop; real `?edit=1`; publish; preview; navigator; inspector; section library; drawers; header/footer **visibility**; console + network.

**Deliverable:** QA notes; bugs found / fixed / deferred; optional screenshots.

**P0-2 fix (landed in code):** CMS `/p/…` pages used **published** snapshots for SSR while edit mode updates **draft** `cms_page_sections`, so the navigator matched client state but the **canvas did not** until publish. **Implemented:** [`loadPageForRender`](../web/src/lib/site-admin/server/page-reads.ts) mirrors homepage [`loadHomepageForRender`](../web/src/lib/site-admin/server/homepage-reads.ts) — draft-first composition when preview or in-place edit is active. [`insertSection` / `duplicateSection`](../web/src/components/edit-chrome/edit-context.tsx) select the new section and **`await router.refresh()`** so DOM and [`selection-layer`](../web/src/components/edit-chrome/selection-layer.tsx) scroll behave consistently.

**Still required (human QA):** Phase 0 checklist on a **registered tenant host** to confirm behavior at 390 / ~820 / 1440 and log any follow-ups.

---

### Phase 1 — Hygiene and convergence

**Goal:** One canonical builder path; no broken legacy surfaces.

**Scope:** Legacy route redirects ([legacy-site-settings-redirect](../web/src/lib/site-admin/legacy-site-settings-redirect.ts)); duplicate mounts / orphan actions per convergence checklist; dead UI removed or hidden; [DRAWER-MUTEX.md](../web/src/components/edit-chrome/DRAWER-MUTEX.md); no stacked right-rail drawers; `?panel=` / deep links ([edit-shell.tsx](../web/src/components/edit-chrome/edit-shell.tsx)); bookmarks don’t 404.

**Acceptance:** Single obvious path into the editor; every visible control works or is hidden; no dangling server actions users can hit; no confusing legacy routes.

---

### Phase 2 — Premium trust and UX copy

**Goal:** Safe, understandable builder — **before** deep architecture churn.

**Scope:** Draft vs published clarity; publish drawer + **blocking vs advisory** preflight ([publish-drawer.tsx](../web/src/components/edit-chrome/publish-drawer.tsx), [PublishPreflight.tsx](../web/src/components/edit-chrome/PublishPreflight.tsx)); revisions / restore copy ([revisions-drawer.tsx](../web/src/components/edit-chrome/revisions-drawer.tsx)); inspector plain-language labels ([inspector-dock.tsx](../web/src/components/edit-chrome/inspector-dock.tsx)); navigator selected-state clarity ([navigator-panel.tsx](../web/src/components/edit-chrome/navigator-panel.tsx)); empty/error states; **`aria-live`** / toasts for publish failures ([edit-shell.tsx](../web/src/components/edit-chrome/edit-shell.tsx)); drawer **focus trap + focus restore**.

**Acceptance:** A non-technical user understands **what is selected, what changed, what is saved, what is unpublished, and what publish will do.**

---

### Phase 3 — Canvas feel

**Goal:** Canvas is the **primary** editing surface.

**Scope:** Canvas section reorder ([selection-layer.tsx](../web/src/components/edit-chrome/selection-layer.tsx)); drop zones and handles; **same move semantics** as navigator (`moveSectionTo` / [edit-context.tsx](../web/src/components/edit-chrome/edit-context.tsx)); add between sections ([composition-inserter](../web/src/components/edit-chrome/composition-inserter.tsx)); duplicate/delete; selection polish; scroll stability; undo/redo after reorder; low-end device spot-check.

**Acceptance:** Rearrange visually; **navigator and canvas order stay aligned**; drag/drop feels predictable and premium.

---

### Phase 4 — Inline WYSIWYG

**Goal:** Editing feels like editing the **live page**.

**Scope:** [inline-editor.tsx](../web/src/components/edit-chrome/inline-editor.tsx); floating toolbar; hide raw markers while typing; headings, paragraphs, links, CTAs; placeholders; reliable autosave; AI rewrite **only** inside disciplined field flows ([ai-generate-action](../web/src/lib/site-admin/edit-mode/ai-generate-action.ts) policy).

**Acceptance:** Operators edit visible copy without thinking in schemas.

---

### Phase 5 — Section library premiumization

**Goal:** Inserter feels like a **design library**, not a registry dump.

**Scope:** [composition-library.tsx](../web/src/components/edit-chrome/composition-library.tsx); categories; search; thumbnails; ~15–20 core defaults + **Advanced** gate; strong defaults; shared **SectionHead**, CTA, spacing/card/grid primitives ([section template starters](../web/src/lib/site-admin/sections/shared/)).

**Acceptance:** New user can assemble a **polished homepage in under ~15 minutes**; library is understandable to **business** users.

---

### Phase 6 — Editable site shell

**Goal:** **Full site builder**, not page-body-only.

**Scope:** Phase B per [builder-convergence-plan.md](../web/docs/builder-convergence-plan.md) and [phase-b-site-shell.md](../web/docs/phase-b-site-shell.md): selectable header/footer; inspector parity; logo, nav, CTA, mobile menu; footer columns, legal, social, contact; shell publish; **cache invalidation** across tenant routes; tenant **feature flag** if needed.

**Acceptance:** Operators edit the **whole branded experience**; shell publishes safely; **no stale shell** on tenant routes.

---

### Phase 7 — Advanced Mode foundation

Phase 7 is split into **7A–7D**. **Do not claim Phase 7 is shipped** until each subphase passes its own acceptance gate. **Having builder infrastructure or `BuilderNode` types is not Phase 7 complete.**

**Model:** **Section → Layout → Slot → Element.** No Webflow-freeform until governance proves out.

#### Phase 7A — Element Library MVP

**Goal:** Governed insert, reorder, edit, publish, and reopen for **real persisted** elements from the **allow-list** (Strategic framing), starting from **blank/custom** composition — **before** Hero-specific vertical work.

**Acceptance:** **First 7A demo target** passes on a registered host; **persistence truth** holds; UI never fakes layers for props-only data.

#### Phase 7B — Governed Hero pilot

**Goal:** Hero as the first **vertical** composition pilot — **only after 7A primitives are real.** Variants (centered, split, image left/right), background image/gradient/color, overlay, eyebrow, headline, subheadline, CTA group, media, badge, optional form; **safe** reorder; responsive order; hide/show per device.

**Acceptance:** Hero **consumes the same element/slot/persistence model as 7A** — not a parallel “Hero-only” fake stack; UI stays honest (see **§7 Important product principle** below).

#### Phase 7C — Repeat pattern

**Goal:** CTA banner, gallery, slider, testimonials, talent grid, contact — **same governance pattern** as Hero, reusing 7A primitives.

#### Phase 7D — Governance scale

**Goal:** Depth limits, allowed parents, validation, perf budgets as composition spreads.

---

### Phase 8 — Responsive authoring

**Goal:** Beyond viewport preview — **intentional** mobile/tablet/desktop.

**Scope:** Per-device spacing, alignment, visibility, stack order, image focal/crop, CTA visibility, columns, slider behavior where applicable; builder chrome usable at **390 / ~820 / 1440**.

**Acceptance:** Mobile is **designed**, not inherited broken; chrome stays usable at all three widths.

---

### Phase 9 — Performance and accessibility

**Goal:** Fast and inclusive.

**Scope:** Selection-layer profiling ([selection-layer.tsx](../web/src/components/edit-chrome/selection-layer.tsx)); MutationObserver / scroll listener cost; `router.refresh()` batching; lazy rare drawers ([edit-shell.tsx](../web/src/components/edit-chrome/edit-shell.tsx)); LCP in edit mode; focus traps/restore; reduced motion ([motion-panel](../web/src/components/edit-chrome/inspectors/motion-panel.tsx)); SR announcements.

**Acceptance:** Large pages usable; drag/typing don’t lag; keyboard + SR viable on major flows.

---

### Phase 10 — Post-v1 extras

**Do not block premium core** unless product escalates:

- Full revision visual diff; deep comments/presence; share analytics; prototype import; arbitrary AI layout generation; HSL/eyedropper theme polish; design-reference import.

---

## 4. PR-sized task tables

Use task IDs in commits/PR titles when helpful (e.g. `feat(edit-chrome): P3-2 drop zone polish`).

### Phase 0 — QA

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P0-1 | Run real-host QA matrix (390/820/1440) and log bugs | — | Low | QA doc / ticket list | Manual |
| P0-2 | Repro + fix: new section in nav but not on canvas (CMS page) | [edit-context.tsx](../web/src/components/edit-chrome/edit-context.tsx), insert action, RSC cache, [selection-layer.tsx](../web/src/components/edit-chrome/selection-layer.tsx) scroll | Med | Insert → section visible without hard refresh | Manual + typecheck |
| P0-3 | Document deferred bugs with severity | `docs/` or Linear | Low | Each item has owner | Review |

### Phase 1 — Hygiene

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P1-1 | Verify legacy `/admin/site-settings/*` → workspace Website | [legacy-site-settings-redirect.ts](../web/src/lib/site-admin/legacy-site-settings-redirect.ts) | Low | No 404 on bookmarks | Manual |
| P1-2 | Audit orphan actions; wire or remove per convergence | `web/src/lib/site-admin/edit-mode/` | Med | No dead publish/AI entry points | Lint scope + tenant tests if actions |
| P1-3 | Drawer mutex regression checklist | [DRAWER-MUTEX.md](../web/src/components/edit-chrome/DRAWER-MUTEX.md), PR template | Low | New drawers follow mutex | Code review |

### Phase 2 — Trust / copy

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P2-1 | Publish drawer: blocking vs advisory copy hierarchy | [publish-drawer.tsx](../web/src/components/edit-chrome/publish-drawer.tsx), [PublishPreflight.tsx](../web/src/components/edit-chrome/PublishPreflight.tsx) | Low | Non-technical copy | Manual |
| P2-2 | Draft vs published indicator pass | [topbar.tsx](../web/src/components/edit-chrome/topbar.tsx), [edit-context.tsx](../web/src/components/edit-chrome/edit-context.tsx) | Low | Clear state | Manual |
| P2-3 | Publish failure `aria-live` parity | [edit-shell.tsx](../web/src/components/edit-chrome/edit-shell.tsx) | Low | SR hears failures | VoiceOver spot |

### Phase 3 — Canvas

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P3-1 | Canvas drag parity with navigator | [selection-layer.tsx](../web/src/components/edit-chrome/selection-layer.tsx), [edit-context.tsx](../web/src/components/edit-chrome/edit-context.tsx) | Med | Same order both surfaces | Manual |
| P3-2 | Drop zone / handle visual polish | [selection-layer.tsx](../web/src/components/edit-chrome/selection-layer.tsx), kit | Low | Premium feel | Manual |

### Phase 4 — WYSIWYG

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P4-1 | Toolbar + marker cleanup | [inline-editor.tsx](../web/src/components/edit-chrome/inline-editor.tsx) | Med | No raw markers | Manual |
| P4-2 | Link/CTA inline safety | inline editor + actions | Med | Safe edits | Manual |

### Phase 5 — Library

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P5-1 | Advanced gate + category copy pass | [composition-library.tsx](../web/src/components/edit-chrome/composition-library.tsx) | Low | No flat 40-type wall | Manual |
| P5-2 | Default content quality for top starters | template starters | Med | Polished insert | Manual |

### Phase 6 — Shell

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P6-1 | Shell selection + inspect MVP | Public shell components, edit chrome | **High** | Header/footer selectable | Manual + tenant tests |
| P6-2 | Shell publish + `tagFor` / revalidate audit | [phase-b-site-shell.md](../web/docs/phase-b-site-shell.md), site-admin | **High** | No stale shell | Smoke + isolation |

### Phase 7A — Element Library MVP

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P7A-0 | Builder-node schema + persistence contracts + **P7A-0 deliverable format** (concrete spec, not notes) | builder-node, edit-mode actions, migrations as needed | **High** | Deliverable + acceptance met; **Proceed / Blocked** close-out | Tenant isolation + typecheck |
| P7A-1 | Element registry / library UI foundation (blank section → pick element) — **after Gate 0** | composition UI, library chrome | **High** | Insert creates **persisted** nodes; **no P7A-1 until P7A-0 contract verified** | Manual |
| P7A-2 | Slot targeting + honest selection for library nodes | inspector, selection-layer, navigator | **High** | Inspector matches **actual** tree | Manual |
| P7A-3 | Reorder / move parity (navigator + canvas) | edit-context, selection-layer | **High** | Same order both surfaces | Manual |
| P7A-4 | Draft → publish → hard refresh → reopen | composition actions, page reads | **High** | Tree matches persisted snapshot | Manual |
| P7A-5 | Tenant **feature flag / kill switch** (required for 7A rollout) | feature flags, shell | Med | **7A stays off until stable**; disable path does not break legacy pages | Manual + tests |
| P7A-6 | QA / regression hooks (smoke, critical paths) | e2e, builder tests | Med | Regressions caught in CI or checklist | CI / manual |
| P7A-7 | Doc + changelog alignment | `web/docs/` | Low | Roadmap reflects shipped truth | Review |

### Phase 7B — Governed Hero pilot

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P7B-1 | Hero variant + governed slot schema | hero section, [legacy-section-tree.ts](../web/src/lib/site-admin/builder-node/legacy-section-tree.ts), builder-node | **High** | Honest UI; builds on **7A** primitives | Manual |
| P7B-2 | Inspector: Hero layout/slot controls vs props-only | [inspector-dock](../web/src/components/edit-chrome/inspector-dock.tsx), builders | **High** | Matches **§7** honesty table | Manual |

### Phase 8 — Responsive authoring

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P8-1 | Per-breakpoint visibility MVP | builder node style, inspectors | Med | Mobile hides work | Manual |
| P8-2 | Builder chrome 390px pass | edit-shell, drawers | Med | Usable | Manual |

### Phase 9 — Perf / a11y

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P9-1 | `router.refresh` batch / debounce audit | [edit-context.tsx](../web/src/components/edit-chrome/edit-context.tsx) | Med | Less thrash | Profile |
| P9-2 | Drawer focus trap audit | drawers, [kit](../web/src/components/edit-chrome/kit/) | Med | Focus restored | Keyboard |

### Phase 10 — Post-v1

Track in [builder-excellence-execution-plan.md](../web/docs/builder-excellence-execution-plan.md); pull forward only by product call.

---

## 5. Readiness gates

### Internal QA ready

- `npm run typecheck` passes.
- `npm run test:tenant-isolation` passes when tenant/server paths touched.
- Main builder routes work on a **registered** host.
- No major console errors in smoke.
- **Phase 0 real-host QA** completed (or explicitly waived with risk note).
- **7A demo gate:** Before claiming “element library shipped,” the **First 7A demo target** (Strategic framing above) passes end-to-end.

### Pilot agency ready

- Publish flow feels **safe** (Phase 2 minimum).
- Header/footer either **editable** (Phase 6 progress) or **clearly communicated** limitation.
- Mobile / tablet / desktop QA done once.
- Section library **usable** for real pages.
- Support knows **known limitations** (honesty principle).

### Premium self-serve ready

- Header/footer **editable** and publish-safe.
- Publish trust + recovery complete.
- Responsive authoring **strong** (Phase 8).
- **7A + 7B:** Element Library MVP (7A) complete and Hero pilot (7B) on **honest** governed composition — not props-only “layers.”
- Onboarding/empty states clear.
- No major broken controls.
- Performance acceptable on **large** pages.

---

## 6. Do not do yet (unless escalated)

- Unlimited arbitrary nesting.
- Full multiplayer presence.
- Full visual revision diff (beyond restore UX).
- Prototype import.
- AI-generated **arbitrary** layouts (bypassing section system).
- Full Webflow-style freeform canvas.
- Advanced theme eyedropper / HSL polish as a **blocker**.

**Governed flexibility first; chaos later.**

---

## 7. Important product principle (honest UI)

| Under the hood | Present it as |
|----------------|---------------|
| Field inside fixed section schema | **Field editing** — forms, labels, no fake “layers.” |
| Real reorderable/patchable child in builder tree | **Child-element editing** — list, reorder, nest within rules. |
| Governed Section → Layout → Slot → Element | **Layout composition** — variants, slots, clear limits. |

Do **not** imply Webflow/Figma-level freedom until the **data model and mutations** support it.

---

## Implementation status (rolled summary)

| Phase | Status | Notes |
|-------|--------|--------|
| **0** | Partial | P0-2 CMS draft canvas landed; **automation** (`test:e2e:registered-host`, curl to https://tulala.digital) proves `agency_domains` path. **Human matrix** (390 / ~820 / 1440, insert, publish, console) still required per [phase-0-qa-registered-host.md](../web/docs/phase-0-qa-registered-host.md). **Local human QA** ([builder-human-qa-run-2026-05-09.md](../web/docs/builder-human-qa-run-2026-05-09.md)): first pass failed internal/pilot/premium gates; Pass 1–2 retests improved insert→canvas, mobile frame, page-scoped heading probe; **clean baseline page**, reliable local load (**BUG-001**), and trustworthy publish loop (**BUG-005**) still open. |
| **1** | Partial | Legacy redirects + `?panel=` (incl. library); converge orphan admin links incrementally. |
| **2** | Partial | Publish drawer + save pill (**Draft up to date** / unsaved / saving tooltips) + tenant-branded top bar (**Tulala Builder** + site name); Publish / **More** menus (`role="menu"` + trigger ids); inspector tab hints; drawers + modals; navigator empty states. |
| **3** | Partial | `moveSectionTo` shared with canvas + navigator; scroll-into-view after drop; navigator rail `aria-labelledby`; drop polish ongoing. |
| **4–5** | Partial / open | Library: empty-search recovery + “no section types” banner when kits/starters still match; category UX + advanced copy ([composition-library.tsx](../web/src/components/edit-chrome/composition-library.tsx)); inline WYSIWYG: floating toolbar, canvas overlay, link popover. |
| **6** | Partial | Header/footer sections + shell republish on publish; **`storefront` cache bust** with shell ([composition-actions.ts](../web/src/lib/site-admin/edit-mode/composition-actions.ts)); full parity per [phase-b-site-shell.md](../web/docs/phase-b-site-shell.md). |
| **7** | Partial | Roadmap: §3 **7A before 7B**; §4 **P7A-0…7** + **P7B-1/2**. **7A not shipped** until allow-list + persistence truth hold. Hero honest-UI work continues; **governed Hero composition = P7B** after 7A primitives are real. |
| **8** | Partial | Viewport switcher `title` clarifies layout simulation vs per-section responsive fields; device preview + mobile chrome hint; per-breakpoint authoring ongoing. |
| **9** | Partial | Coalesced `router.refresh` via `queueRouterRefresh` ([edit-context.tsx](../web/src/components/edit-chrome/edit-context.tsx)); labelled drawers/overlays + assertive errors on key flows; `Drawer` focus restore + hidden closed state (`aria-hidden`, no pointer hit-target) per [DRAWER-MUTEX.md](../web/src/components/edit-chrome/DRAWER-MUTEX.md). |

---

## 8. First PR recommendation (prioritized)

**Product direction:** **Advanced Mode is 7A-first.** Primary engineering track is **Element Library MVP** (P7A-*), not Hero-only composition. Hero belongs to **P7B** and assumes **7A primitives are real.**

**Status:** The **P0-2 CMS insert → canvas** fix is **implemented**. **Phase 2 publish trust copy** (save pill + publish drawer lines) is **landed**; remaining Phase 2 risk is **automatic publish blocking** when canvas and persisted state disagree — needs a defined technical signal ([human QA BUG-005](../web/docs/builder-human-qa-run-2026-05-09.md)).

**Next suggested merges:**

1. **P0 / prerequisite QA:** Stabilize **Impronta** baseline (prefer **draft-only** reset; see **No destructive QA reset** in Strategic framing). Verify **add → edit → reorder → publish → reopen** on a **clean** state.

2. **P7A-0 + Gate 0 (blocking):** Define and **verify** persistence contracts — **before** Add Element UI **(no P7A-1 until Gate 0 passes)**. Includes tenant flag / kill switch shape.

3. **P7A-1:** Element registry / Add Element UI — **only after** Gate 0 (see **Phase 7A guardrails**).

4. **P7A-2 / P7A-3:** **Slot targeting**, honest selection, **navigator + canvas reorder parity** for library-backed nodes.

**Still blocking trustworthy QA if unfixed:** Insert/canvas mismatch + mobile iframe blank canvas ([BUG-002 / BUG-003](../web/docs/builder-human-qa-run-2026-05-09.md)) — address **alongside or before** broad 7A demos.

**Parallel (non-code):** Phase **0** registered-host matrix ([phase-0-qa-registered-host.md](../web/docs/phase-0-qa-registered-host.md)) remains **required** before declaring pilot-ready.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-09 | **Planning freeze** + **7A Demo Evidence** (screens/recording required) + **7A Design Guardrails** (premium defaults); **final execution order** tightened; no broad planning until **P7A-0 + P7A-1** ship or blocker. |
| 2026-05-09 | **Phase 7A guardrails:** **7A Reality Test** table; **Blank Section first proof**; **Gate 0 before P7A-1**; **Inspector MVP** matrix; **parent/child governance** table; **no legacy migration in 7A**; **feature flag required**; **Element Library UX standard**; **Simple Mode stays default**. Current execution priority → **P7A-0 then P7A-1**; stop broad planning. |
| 2026-05-09 | **7A-first roadmap:** §3 Phase 7 rewritten (**Advanced Mode foundation**, **7A Element Library MVP before 7B Hero**); §4 **P7A-0…P7A-7** + **P7B-1/P7B-2**; §8 First PR → **P7A** track; added **allow-list**, **persistence truth**, **migration rule**, **Simple vs Advanced UX**, **no destructive QA reset**, **Current execution priority**; heart line (**Advanced Mode gated on 7A**); refs → **AGENTS.md** / **OPERATING.md** / Phase 0 QA docs (not CLAUDE-only). |
| 2026-05-09 | **Unified roadmap + Cursor Plans:** Strategic framing (7A–7D, P7A/P7B, guardrails) merged into this file; title updated. Full mirror for Cursor: [.cursor/plans/builder-phase-truth-roadmap.plan.md](./builder-phase-truth-roadmap.plan.md) (YAML frontmatter; links adjusted). **Edit roadmap content here**; refresh the `.plan.md` copy after substantive edits. |
| 2026-05-09 | Initial canonical roadmap; supersedes ad-hoc mixing of audit/backlog/phases for day-to-day execution. |
| 2026-05-09 | P0-2: CMS draft canvas — `loadPageForRender` + select inserted section + `await router.refresh()` ([page-reads](../web/src/lib/site-admin/server/page-reads.ts), [edit-context](../web/src/components/edit-chrome/edit-context.tsx)). |
| 2026-05-09 | P6-2 / P9-1: Shell publish revalidates `storefront`; edit context coalesces `router.refresh` (`queueRouterRefresh`). P8-2: narrow-screen builder hint. § Implementation status table added. |
| 2026-05-09 | P2/P5: Revisions drawer `aria-labelledby` + load error `aria-live`; composition library helper copy under search. `phase-b-site-shell.md` cache note updated. |
| 2026-05-09 | P2/P9 a11y: Page settings, Theme, Assets, Comments, Schedule drawers + section picker (`aria-labelledby` / `titleId`); error banners `aria-live`; mobile library sheet `role="dialog"`. |
| 2026-05-09 | P2/P9 a11y: Media picker modal (`aria-modal`, labelled heading, alert errors); inline section popover labelled title + insert errors `aria-live`. |
| 2026-05-09 | P2/P9 a11y: Starter template gallery + workspace template apply/archive dialogs use `aria-labelledby`; command palette uses sr-only title + `aria-labelledby`. |
| 2026-05-09 | P2/P9 / P4: Color picker dialog `aria-modal` + labelled title; eyedropper error `aria-live`; kit/starter review overlays as dialogs; rich-text link popover dialog labeling. |
| 2026-05-09 | P4: Rich-text floating toolbar `role="toolbar"` + `aria-label`; canvas inline-edit overlay `role="region"` + `aria-label`. |
| 2026-05-09 | P0: `test:e2e:registered-host` (default `tulala.digital`) + curl log in phase-0 doc. P5: library full-empty + partial-empty search copy. P8: viewport group `title` (preview vs responsive fields). |
| 2026-05-09 | P2: Publish drawer copy — autosave vs publish vs public; `role="status"` + `aria-live` on publish-blocked list. |
| 2026-05-09 | P2: Top bar `SaveStatus` — polite live region on save states; steady label **Draft up to date** + clearer tooltips (draft vs published). |
| 2026-05-09 | P2: Inspector tab hover hints (`DrawerTab` `title` prop + `INSPECTOR_TAB_HINT` map). |
| 2026-05-09 | P9-2: `Drawer` restores focus to pre-open `activeElement` on close (`restoreFocusOnClose`, optional opt-out). |
| 2026-05-09 | P9 / a11y: closed `Drawer` panels use `aria-hidden` + `pointer-events: none` while off-screen. |
| 2026-05-09 | P3/P9: Structure navigator `<aside>` named via `aria-labelledby` (`structure-navigator-label`). |
| 2026-05-09 | P2/P9: Publish split control `role="group"` `aria-label="Publish"`; primary Publish button `title` (preflight + go live). |
| 2026-05-09 | P2/P9: Publish chevron dropdown — `role="menu"`, `aria-expanded` / `aria-controls`, separator roles; menu item Space key fixed. |
| 2026-05-09 | P2/P9: More menu (`⋯`) — `TbIconBtn` optional menu attrs; `aria-labelledby` + separator on dropdown. |
| 2026-05-09 | P2: Publish + More top-bar menus — **Escape** closes menu (capture); More menu exits Share sub-step first. |
| 2026-05-09 | P2/P9: Page picker menu — `id` + `aria-labelledby` (trigger ↔ menu); Escape-to-close (already wired). Agent QA: typecheck + tenant + builder-capabilities + publish-preflight + Playwright smokes pass. |
| 2026-05-09 | Agent: full `npm run ci` **fails at repo-wide ESLint** (~759 findings — baseline debt across prototypes/admin/etc.). Same session: scoped `eslint topbar.tsx` + CI subsets **pass**. |
| 2026-05-09 | **Human QA (local `/impronta?edit=1`):** Full narrative + BUG-001–008 + Pass 1–2 retests in [builder-human-qa-run-2026-05-09.md](../web/docs/builder-human-qa-run-2026-05-09.md). Gates remain **fail** until clean Scenario 2 + publish/reopen on a reset baseline; Implementation status § Phase 0 updated. |
| 2026-05-09 | **Local QA baseline:** Runbook [impronta-local-qa-homepage-baseline.md](../web/docs/impronta-local-qa-homepage-baseline.md) — SQL inspect + discard homepage **draft** `cms_page_sections` so builder falls back to published composition. |
| 2026-05-09 | **P2 trust:** Edit topbar shows **Tulala Builder** + tenant public name (`agency_business_identity.public_name`) so product vs storefront context is obvious (human QA BUG-006). `OPERATING.md` § deploy ladder notes `NODE_OPTIONS` heap workaround for local Next OOM (BUG-001). |
| 2026-05-09 | **P5 starter review:** Human labels — **Editing approach** (+ plain-language blurb per `editModel`), **Section type** / **Content source**, **What you can change**, **Fine-tune in inspector**; capability badge **Data** → **Live data** ([composition-library.tsx](../web/src/components/edit-chrome/composition-library.tsx); human QA BUG-008). |
| 2026-05-09 | **P5 library density:** Kit/starter facet filters (Kind, Source, Plan…) **collapsed by default** behind **More filters for kits & starters**; badge shows active filter count when collapsed; opening library resets facets + disclosure (**BUG-007**). Fixed missing reset of **Control** (`starterCapabilityFilter`) when library reopens. |
| 2026-05-09 | **P2 publish trust (BUG-005):** Top bar steady save pill **All changes saved** → **Draft up to date** + clearer `title` / `aria-label`. Publish drawer “What publishing does” adds a line that **saving ≠ live**, suggests canvas scroll + Preview + preflight before publish ([topbar.tsx](../web/src/components/edit-chrome/topbar.tsx), [publish-drawer.tsx](../web/src/components/edit-chrome/publish-drawer.tsx)). |
| 2026-05-09 | **P8:** Viewport switcher group `title` — preview width is layout simulation; breakpoint editing stays in the inspector ([topbar.tsx](../web/src/components/edit-chrome/topbar.tsx)). First PR § updated — next focus insert/canvas + mobile iframe reliability vs duplicate publish-copy PR. |
| 2026-05-09 | **P3 / BUG-003:** Device preview `<iframe>` key now includes **`pageVersion`** so tablet/mobile preview remounts after draft mutations (`router.refresh()` does not refresh nested iframe documents). Wired from `EditShellInner` → `DeviceFrameSurface` ([edit-shell.tsx](../web/src/components/edit-chrome/edit-shell.tsx)). |
| 2026-05-09 | **P3 / BUG-002 (mitigation):** Selection-layer auto-scroll retries **`[data-cms-section]`** longer (30×100ms) and re-runs when **`pageVersion`** changes so post-insert scroll/selection rings catch slow RSC/streaming after `router.refresh()` ([selection-layer.tsx](../web/src/components/edit-chrome/selection-layer.tsx)). |
