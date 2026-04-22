# Polish queue — held pending Round 1 signal

The items below are **real improvements** that have not shipped yet. They
are held deliberately: we do not want to expand scope before Round 1
shows us what actually hurts. QA signal decides priority.

Each item lists what it is, why it was deferred, and what evidence from
QA would promote it up the queue.

---

## Ready to ship if QA confirms need

### 1. Content-level field diff in publish pre-flight
- **What:** beyond "added / removed / reordered," show "Hero headline
  changed from X → Y" at field level inside each section.
- **Status:** structural diff already in (commit `44b1dd4`); field-level
  needs per-section Zod-aware diffing.
- **Promote if:** testers say "I can see what moved but not what I
  actually changed" in Task 6.
- **Demote if:** testers treat preview iframe as sufficient confirmation.
- **Size:** ~1–1.5 days.

### 2. Real PNG variant thumbnails
- **What:** author 6 high-quality PNG screenshots per high-traffic
  variant (hero full-bleed / hero split / hero slider / cta centered /
  cta split / cta band) to replace schematic SVGs in section library +
  VariantPicker.
- **Status:** the pipeline already reads
  `/section-thumbnails/<type>--<variant>.png` and falls back to
  schematics (commits `88949e0`, `4d9c365`).
- **Promote if:** testers describe the library as "wireframe-y",
  "abstract," or say they had to click through to know.
- **Demote if:** testers describe schematics as "clear enough."
- **Size:** 0.5 day engineering; design authoring is bigger.

### 3. Shortcut parity across editor surfaces
- **What:** Cmd+S save-now on section editor, Cmd+P open publish
  preflight, Cmd+K command palette. Undo/redo already done for composer.
- **Status:** not started.
- **Promote if:** testers describe the editor as "too many clicks" or
  ask for shortcuts.
- **Demote if:** autosave + explicit-save buttons feel sufficient.
- **Size:** 1 day.

### 4. Admin shell consolidation (`/admin/site/*` + sidebar grouping)
- **What:** rename `/admin/site-settings/*` → `/admin/site/*`, collapse
  the 13-item sidebar into grouped sections (Brand / Compose / Manage /
  Analyze), add breadcrumbs.
- **Status:** held by explicit product direction — cosmetic, high-churn
  risk during QA feedback cycles.
- **Promote if:** every tester hesitates in the sidebar on Task 1 or
  complains about navigation.
- **Demote if:** Task 1 is consistently under 90 seconds.
- **Size:** 1 day routing + redirects; ~1 day sidebar + breadcrumbs;
  real test burden across linked routes.

---

## Ready to ship on evidence

### 5. Inline text editing on canvas (click-to-edit)
- **What:** click a headline in the preview iframe → inline edit in
  place → postMessage back to admin → debounced autosave.
- **Status:** architecture exists for it (postMessage preview channel,
  autosave, draft preview) but the click-to-edit layer is not wired.
- **Promote if:** testers ask for it by name in open exploration, or
  repeatedly switch tabs between composer and preview while editing.
- **Demote if:** composer + preview split feels natural.
- **Size:** 3–5 days.

### 6. Presence indicators + multi-user lock
- **What:** show who else is editing a section; soft-lock on focus
  conflict; merge-or-overwrite on CAS miss.
- **Status:** CAS is in place server-side; presence UI is missing.
- **Promote if:** any agency on QA has multiple admins working same
  session and they collide.
- **Demote if:** agencies are single-admin (most likely in Round 1).
- **Size:** 2–3 days.

### 7. Empty/loading state sweep across admin
- **What:** audit every admin surface for "empty" and "loading" states
  and make sure each has product copy + a clear next action, not bare
  table rows or skeleton-only states.
- **Status:** the high-traffic surfaces (composer, section list, library)
  have been done; sparsely-used pages (SEO stub, Content hub, Audit)
  have not.
- **Promote if:** testers drift into a sparse page during open
  exploration and comment on it.
- **Demote if:** they never wander off the main builder surface.
- **Size:** 0.5 day per surface.

---

## Queued but deprioritized

### 8. Mobile preview viewport fidelity
- **What:** inject a synthetic viewport meta into the preview iframe so
  layouts with custom viewport tags render correctly at 390px / 768px.
- **Status:** happy path (sites with `width=device-width`) already works.
- **Promote if:** a tenant has a non-standard viewport meta AND testers
  notice mismatch.
- **Demote if:** common case keeps working. (Current expectation.)
- **Size:** 0.5 day.

### 9. AI-assisted composition suggestions
- **What:** "Generate a hero for a destination wedding agency in Tulum"
  → structured output → Zod-validated → inserted as a draft section.
- **Status:** not started. Architecture (schemas, Zod, registry) makes
  it tractable.
- **Promote if:** testers explicitly ask for AI help with content.
- **Demote if:** starter + library defaults feel sufficient.
- **Size:** 2–3 days infra; ongoing prompt tuning.

### 10. Cross-page reusable sections UI surface
- **What:** the section instance model already supports many-to-many
  references; surface a "Used on: Homepage + 2 pages" panel on section
  editor + a "Reusable" badge in library gallery.
- **Status:** data model ready; UI surface missing.
- **Promote if:** testers try to reuse a section and fail to discover it.
- **Demote if:** agencies create fresh sections per page without pain.
- **Size:** 1 day.

---

## Explicitly not pursuing in Round 1 backlog

These are real product work that should not bleed into the Round 1 polish
window. They are noted here so nobody queues them while QA is running.

- Multi-page builder (non-homepage page compositions at parity).
- Approval workflow (Draft → Submitted → Approved → Published).
- Marketplace / third-party template packs.
- End-client editing (profile-scoped editor for talents).
- Per-plan limits + tier flags in the library gallery.
- Revision retention policies / background pruning jobs.

---

## Policy during Round 1

Between tester sessions: only fix findings that would otherwise dominate
the next session's signal. No new features. Comparable sessions > faster
iteration.

After Round 1: re-read this file with QA findings in hand. Items without
evidence stay queued. Items with two or more testers hitting them get
promoted to the next polish sprint.
