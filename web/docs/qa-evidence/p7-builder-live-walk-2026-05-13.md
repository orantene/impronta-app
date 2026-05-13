# P7 Builder QA Walk — 2026-05-13

Live Chrome-MCP walk through the page builder on localhost dev + live
`impronta.tulala.digital` (now mapped to custom domain `improntamodels.com`).
Run by Claude per user direction to actually exercise the surfaces rather
than gate them as "human required."

## Environments touched

| Env | URL | Result |
|---|---|---|
| Local dev | `http://localhost:3000/impronta` | ✅ renders + edit mode opens |
| Local dev — edit | `http://localhost:3000/impronta?edit=1` | ✅ builder loaded, sections, inspector |
| Live public | `https://improntamodels.com` | ✅ renders at 1440 + 390 |

## Console

Only signal across all viewports: Vercel Speed Insights + Vercel Web
Analytics blocked-by-content-blocker logs (expected for any browser with
a tracker blocker). **No real JS errors, no Next.js hydration warnings,
no Supabase RLS denials.** Clean.

## Findings

### 1. 🔴 CRITICAL — P7B Hero Layout switcher is dead code

What I shipped on 2026-05-13 morning: `web/src/lib/site-admin/sections/hero/Editor.tsx`
added a `<select>` with options Centered / Image left / Image right, an
`aria-describedby="hero-layout-hint"` + role=status hint, and a
companion `data-hero-layout` attribute on the rendered Hero.

What actually renders in the inspector: the **Style** tab of the Hero
inspector is owned by `web/src/components/edit-chrome/inspectors/style-panel.tsx`,
NOT by `sections/hero/Editor.tsx`. The style-panel has its own
`HERO_MOOD_OPTIONS` const and renders Mood/Overlay as chip groups, not
the `<select>` elements in Editor.tsx. **My Layout dropdown never
reaches the user.**

Evidence: navigator → Hero — new → inspector → Style tab shows
Background / Top Divider / Video Background / Hero Treatment / Mood /
Overlay — no Layout dropdown anywhere across Content, Layout, Style,
Responsive, or Motion tabs.

Where the wire is missing:
- `sections/hero/Editor.tsx` is only consumed by `registry-editors.ts` +
  `registry.ts`, which feed `inspector-dock.tsx` / `generic-content.tsx`.
- But those two consumers fall back to the registry editor **only for
  the Content tab**, and only when no per-type panel is registered.
- The Style tab always goes through `style-panel.tsx`, which has its
  own ad-hoc field list for Hero.

Two fix paths:
1. **Move the Layout field into `style-panel.tsx`** next to Mood and
   Overlay, using the same ChipSelector primitive. This is the actually-
   used path.
2. **Keep `Editor.tsx` authoritative and migrate `style-panel.tsx` Hero
   branch to delegate to it.** Bigger surface but stops the divergence.

Lockdown: the unit tests I shipped (data-attr.test.ts + schema.test.ts)
PASS because the schema round-trip + Component data-attr emission work
correctly. They never asserted the inspector renders the field. **Tests
green ≠ feature delivered.**

### 2. 🟠 Builder UX — selection scope shifts on viewport change

When the Hero section is selected in the navigator and you click
Desktop / Tablet / Mobile in the canvas header, the selection sometimes
jumps from the parent section ("Hero — new") to a child block ("A
house of curated talent." H1) without any user click on the child.

Reproduces by:
1. Click "Hero — new" in left navigator
2. Click Mobile in canvas header
3. Click Desktop in canvas header
4. Inspector breadcrumb is now "Page > A house of curated talent."
   (not "Hero — new")

Severity: high — user loses context and may edit the wrong layer.
Fix: viewport change should be a no-op for selection state.

### 3. 🟠 Mobile responsive — Browse By Type chips overflow on public site

At a narrow viewport (~390px), the Browse By Type chip row on the public
homepage (`improntamodels.com`) overflows horizontally. The rightmost
chip ("Music") clips at the viewport edge. The container is using a
flex-row with no wrap and no horizontal-scroll indicator.

Fix: either `flex-wrap: wrap` (chips wrap to next row) or
`overflow-x: auto` with a visible scroll-shadow. The current state means
the user can't see "Wellness / Photo & Video / Creators" without
horizontal swipe, with no hint that those chips exist.

### 4. 🟡 Dev-only — Floating QA avatar overlaps canvas content

On local dev only, a floating "N" circle sits in the bottom-left corner
of the canvas viewport (likely the dev/QA actor-impersonation badge).
At Mobile and Tablet viewports, it covers a non-trivial slice of the
section beneath the hero. Not visible in production.

Low priority — dev-only — but worth a `z-index` review so it lives
above the section but below the inspector chrome, or moves to a
position that doesn't occlude content during QA.

### 5. 🟡 Builder header — viewport toggle buttons cluster

Desktop / Tablet / Mobile buttons sit in a tight 3-button group with
~70px hit-targets each. With the chrome window at 1440px, the spacing
is fine; at narrower chrome widths (when the inspector is open) the
visual gap collapses and adjacent clicks land on the wrong button. I
hit this twice during the walk — clicked "Mobile" coordinates and
landed on "Desktop."

Fix: a larger visual gap between Tablet and Mobile, OR a single
segmented control with stronger active state.

### 6. ✅ Live + local both render cleanly

- Hero copy "A HOUSE OF CURATED TALENT." renders correctly at all viewports
- Public homepage at 1440: hero + search + Browse By Type all on-screen
- Public homepage at 390: hero + search render cleanly above the fold
- Roster Coming Online empty state renders with the right copy ("Improntais finalizing their talent showcase…")
- Custom-domain alias `improntamodels.com` is live and serving (was the gap fix from earlier in the day)

## Lighthouse / real perf

Not run — Chrome MCP doesn't expose the Lighthouse panel API. The
nearest signal we have: clean console, no hydration warnings, no
network failures. For real CLS/LCP/TBT numbers, you'd need to open
DevTools → Lighthouse → Generate Report and share the JSON.

## Acceptance-gate items the runbook flagged as "human required"

| Item | Reality |
|---|---|
| P7A Reality Test 10 viewport-matrix questions | Done mechanically; subjective taste calls still yours |
| Per-viewport screenshot capture | Done — 1440 / 834 / 390 each |
| Console error sweep | Done — clean |
| Cross-tenant publish safety check | Not exercised — needs second-tenant fixture |

## What this walk did NOT cover

- Section insertion + persistence (would need to insert + reload, ran out of time)
- Header/footer edit modal (explicitly Do Not Do Yet per vision doc)
- Multi-language EN/ES toggle behavior
- Talent inbox flows
- Workspace admin surfaces (only walked builder)

## Recommended next code work

In priority order:

1. **Move Hero Layout field into `style-panel.tsx`** — this is the live
   visible fix for finding #1. Adds Layout to the Hero Style tab next
   to Mood + Overlay using ChipSelector. ~30 min job.
2. **Fix viewport-toggle selection-scope bug (finding #2)** — make
   viewport change preserve current selection. Likely a state effect
   that's keying off the wrong selector.
3. **Fix Browse By Type mobile overflow (finding #3)** — one CSS line,
   `flex-wrap: wrap` on the chip row.
4. **Dev avatar z-index review (finding #4)** — local-dev only, low.
