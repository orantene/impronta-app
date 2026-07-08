# Impronta Home — Elevation Handoff (2026-07-08)

The home page body is **production data**: the freeform builder tree stored in
`cms_pages.published_homepage_snapshot.builderTree` for the Impronta home page
(`id = 90552cf6-2230-4a40-8320-c2e303e3ee56`). localhost dev = **prod Supabase**,
so any tree edit is an outward-facing production change. The marathon's auto-mode
guardrail (and CLAUDE.md) correctly **blocks** autonomous writes to this row. So
these changes are staged here for a supervised, one-approval run.

The tree is a genuinely competent editorial-noir composition (seeded by
`createImprontaNoirHomePreset`, 210 nodes: hero carousel + marquee + featured
board + divisions + campaigns + house + stats + testimonials + CTA). It is NOT
broken. The items below are targeted elevations, ordered by impact ÷ risk.

A full backup of the current published snapshot is at
`…/scratchpad/impronta-home-backup.json`. The seed script also backs up to
`/tmp/impronta-pub-backup.json` on every run.

---

## 1. Cinematic hero (HIGHEST impact, one property, verified) ✅ ready

The hero carousel is `heightMode:"fixed"`, `minHeightPx:600` — a stubby 600px band.
The hero CSS already supports full-bleed cinematic; `--bn-hero-min-h` is only
pinned when `heightMode==="fixed"` (`render.tsx:3673-3676`). Flipping
`heightMode` to `"large"` makes the CSS fall back to `78svh`
(`render.tsx:637`) — a true cinematic fold. Nothing else changes.

**The change:** on the one hero node (`kind:"carousel"`, `props.variant:"hero"`),
set `props.heightMode = "large"`. Leave `minHeightPx` (inert when not fixed).

**Apply (supervised, non-auto session — two committed commands):**
```
cd web
npx tsx --env-file=.env.local scripts/marathon-prep-home-tree.mts   # reads live tree, applies hero->large, writes /tmp/impronta-tree.json (safe, no DB write)
npx tsx --env-file=.env.local scripts/seed-impronta-homepage.mts     # publishes it (prod write — you approve). Backs up to /tmp/impronta-pub-backup.json first
```
The prep script self-verifies (exactly one hero change) and aborts otherwise.
Verify after: `curl -s -H "Host: impronta.lvh.me" http://localhost:3200/ | grep -o
'data-bn-height-mode="[a-z]*"'` should show `large`, and the page must still render
200 with every section present.

**Rollback:** the seed backs the previous snapshot up to `/tmp/impronta-pub-backup.json`
(and prep to `/tmp/impronta-home-tree-prebackup.json`); write its `.builderTree` back to
the `published_homepage_snapshot` row to restore.

---

## 2. Stats band — NO CHANGE NEEDED (verified 2026-07-08)

The audit flagged the stats as "fragmented single-char heading nodes with wrap
risk." Direct inspection of the live tree disproves both halves: the split into
`120` / `+` (and `EN` / `/` / `ES`) is a DELIBERATE two-tone design (figures in
ink, separators in italic gold accent), and each stat cell already carries
`flexWrap: "nowrap"` + `alignItems: "baseline"` + forced `layout: "row"` on
mobile/tablet, so the fragments cannot wrap apart. Do not "fix" this — merging
the nodes would destroy the intentional styling.

## 3. Featured board → curated `featured_talent` section_embed (medium/high)

The "board, edited" is live-data-bound via a container repeat-binding
(`sourceKey: featured_talent_profiles`), so it shows real roster cards but MISSES
the trust badges + unified inquiry-modal hooks the curated `featured_talent`
section renders. Replacing the repeat-binding block with a `featured_talent`
`section_embed` (which already exists as a first-class builder-node kind) upgrades
the board to the platform's real cards + inquiry funnel. Bigger change; QA the
inquiry hook in a real browser (client-hydrated).

## 4. Real campaign photography (asset swap)

The campaigns/lookbook rail uses `/talent-templates/demo/impronta-2026/*.jpg`
demo statics. Replacing those asset files (same paths) with real editorial
photography is a code/asset change that lifts the live home with no tree edit —
but needs real licensed imagery (do not fabricate).

---

## What was already good on main (do NOT "fix")
- Hero is a tuned Ken-Burns carousel (per-slide captions, vignette, grain) — only
  its height mode is stubby.
- The "double" discipline grid is an intentional seamless **marquee**, not a bug.
- Divisions deep-link to `/directory?tax=<uuid>` (real taxonomy links).
- `/contact` route exists (hero secondary CTA is valid).

## Mechanism reference
- Home render: `web/src/app/page.tsx` (agency branch) → `AgencyHomeStorefront`
  → `HomepageCmsSections` freeform branch. No `home` page-role pointer today.
- Seed/publish: `web/scripts/seed-impronta-homepage.mts` (reads
  `/tmp/impronta-tree.json`, backs up, writes the snapshot).
- Factory: `web/src/lib/site-admin/builder-node/composition-preset-factories-noir-*.ts`.
- Hero CSS + prop mapping: `web/src/lib/site-admin/builder-node/render.tsx` (~L636 CSS, ~L3673 prop→var).
