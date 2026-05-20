# Directory + Page Builder — Evolution Plan (2026-05-20)

**Author:** product/UX-strategy pass.
**Subordinate to:** `directory-section-execution-plan-2026-05-19.md` (the binding ship plan — A1/CDP-0, A2 trust, A3 plan-tier still bind here).
**Posture:** v1 shipped the engine; this plan defines the **next chapter** — taking the directory from "works" to "magnetic."

---

## 1. Where we are (honest snapshot)

✅ **Architecture is sound** — portable section, multi-instance, Phase 3 builder-resolved, A2 closed at data layer, schema constraints multi-tenant safe, drawer↔live-catalog round-trip proven, sidebar end-to-end wired (`field_definitions` → `directory_sidebar_layout` → cached model → reactive render → drawer writes invalidate cache).

⚠️ **Visible experience is mid** — 21-pill horizontal scroll is overwhelming, the reactive island fights the SSR seed (visible empty state on cold loads), the tenant theme makes the section feel like generic chrome, the drawer is a tabbed form (functional, not delightful), the AI hero band is isolated from the rest of the UI, no in-canvas live editing.

🔍 **Underutilized leverage** — the field-engine (`field-engine/resolve-talent-fields.ts`, `talent-field-values-catalog.ts`), the workspace_profile_field_settings.enabled_override system, talent tenant_override / has_value Phase-4 fields, weighted groups, brought-in-by attribution. **Today the directory card shows ~5 properties of a talent. The engine knows ~50.**

---

## 2. North Star (what we're building toward)

> A multi-tenant SaaS where **any agency** spins up a premium, brand-aligned, AI-augmented talent directory in 30 seconds and a visitor leaves saying "this is the best talent agency site I've ever seen."

Three personas, each with a single sentence the platform must deliver against:

| Persona | What "magnetic" means to them |
|---|---|
| **Agency operator** (Marta) | "I configured my catalog once; the page-builder shows me exactly how it'll look as I tweak it; I shipped a custom-feeling directory page in minutes, not hours." |
| **Visitor** (an event producer landing on impronta.tulala.digital/directory) | "This feels like a curated editorial — not a database. I found the right talent in two clicks. The shortlist is mine." |
| **Talent** (Carmen, Adriana, Marco) | "My page shows the version of me my agency curates — rich, real, alive. I don't see boilerplate fields. The agency owns my representation." |

Everything below cascades from those three sentences.

---

## 3. Strategic principles (PO/UX values — every decision honors these)

1. **Restraint over expressiveness.** Premium feels like *less*. Default chrome is minimal; agencies opt into density. The 21-pill bar is the anti-pattern.
2. **Closed-loop transparency.** A toggle in the drawer mirrors instantly in the canvas. No "save → publish → tab back → refresh" cycle. WYSIWYG or it doesn't count.
3. **One source of soul.** The field-engine is the truth. Cards, sidebars, search, AI overlays all read from the same resolver. Never hard-code what the engine can answer.
4. **Defaults that feel intentional.** A new tenant gets a directory that looks like someone designed it for them — not blank, not generic. Smart seed > flexibility-on-day-one.
5. **Multi-tenant pride.** Two agencies on the same engine produce **distinctively different** storefronts. The engine carries the platform identity; the tenant carries the brand voice.

---

## 4. The four pillars of the evolution

### Pillar A — Editor: from form-drawer to canvas-as-builder

**Status today:** 7-tab form drawer that mutates section payload + live catalog. Functional but uninspiring.

**Evolution:**

| Move | What | Effort | Impact |
|---|---|---|---|
| **A1. Live preview pane next to the drawer** | Drawer collapses to a left rail; right 70% of viewport renders the actual storefront with the section live, debouncing 150ms on every change. The operator sees their changes appear. | M | 🔥 transformational |
| **A2. In-canvas overlay editing** | Click the section's heading → inline edit (no drawer). Click a card → "show/hide this field" inline pop. Drawer becomes the *secondary* surface for advanced. | L | 🔥 |
| **A3. AI-suggested presets at insert time** | When the operator drops a Directory section, AI reads their roster (taxonomy distribution, average completeness, location spread) and proposes a preset: "You have 65% models, 25% hosts — Atelier with `talent_type` pill bar, model categories featured." One-click apply. | M | high |
| **A4. Drawer micro-copy + groupings** | Today: "topBarMode", "filter_option_search_visible" — engineering vocabulary leaked to the operator. Rename to "Pill bar above results", "Show filter search". Group: *What you call them* → *Who appears* → *Layout* → *Card* → *Filters & search* → *AI* → *Empty state*. | S | high |
| **A5. Visual feedback on every save** | Today: silent mutation. Future: green pulse on the saved field, "Saved to live storefront" toast, audit log: "You changed the top-bar facet from talent_type to industries — 2 visitors saw this change in the last 5 min." | S | medium |
| **A6. Undo + version timeline** | Every drawer change writes an audit row. "Revert to 4 minutes ago." Critical for agency confidence. | M | medium |
| **A7. "Show this to a visitor" preview link** | Operator can generate a one-time, scoped, unlisted preview URL with their unsaved-yet config. Share with their client for sign-off without publishing. | M | medium |

### Pillar B — Storefront: from "renders" to "feels premium"

**Status today:** Atelier shell + AI hero band + 21-pill talent-type bar + (gated) sidebar + reactive grid using legacy talent-card. Visible empty state intermittent. Tenant theme dominates.

**Evolution:**

| Move | What | Effort | Impact |
|---|---|---|---|
| **B1. Adaptive pill bar (3–6 surfaces + "More")** | Replace the 21-pill horizontal scroll with the top 4–6 most-populated facets for this tenant + a "More disciplines" disclosure. Pills rendered with subtle counts ("Models 12 · Hosts 8 · Performers 4"). | S | 🔥 |
| **B2. Editorial empty/skeleton states** | Cold-load shows 6 portrait-shaped skeleton cards (cool-not-warm shimmer), NOT the "No talent matches" error message during loading. Empty state itself becomes a chosen-by-design editorial moment ("Our roster is full and discreetly off-market this week — let's hear what you're planning"). | S | high (visible defect today) |
| **B3. Card rendered by OUR DirectoryCard (kill legacy talent-card on reactive path)** | The reactive island currently mounts the legacy talent-card.tsx. Switch to our new `DirectoryCard` (already prop-driven, premium portrait, §10 badges, cool tokens) for the reactive grid. Closes the "card is busy + carries old gold" problem at root. | M | 🔥 |
| **B4. Sidebar — collapsible groups + "default 5, more on disclosure"** | The agency catalog has 20 facets. Default reveal: 5 highest-signal (location, talent_type, languages, availability, height/age if relevant). "More filters (15)" disclosure. Each filter remembers last-used state per visitor (cookie). | M | high |
| **B5. Smart filter chips above grid** | When ANY filter is active, render a tidy chip row: "Models × Tulum × Available in May × clear all". This is the *visible memory* of what's narrowing the grid. Today active filters are invisible unless you re-look at the sidebar. | S | high |
| **B6. Hero band integration with results** | When the AI hero band interprets a query → don't navigate, just APPLY the filters live. The grid + sidebar reflect the AI's interpretation. "Show me Riviera Maya hosts available June" → grid filters in place, sidebar checks "Tulum", chip row shows "Riviera Maya · Hosts · June 1-30". | M | 🔥 |
| **B7. Card hover-reveal of richer fields** | The card shows the editorial layer at rest (portrait, name, type, location). On hover/focus: a soft top-layer reveal shows 2-3 high-signal attributes the agency curated (height for models, languages for hosts, signature work for performers). Drawer toggle: which attributes hover-reveals. | M | high |
| **B8. Tenant-aware accent layer** | Honor the tenant brand WITHOUT breaking cool-not-warm. Solution: section reserves a "tenant accent" CSS variable that the tenant can theme (Impronta's warm amber, another tenant's cool teal). It's used ONLY for: focus rings, active-pill underline, "select for inquiry" CTA. The bulk of the page stays editorial neutral. | M | high |
| **B9. Save / shortlist persistent across pages** | Save a talent on `/directory` → that save persists when navigating to `/p/our-fashion-models`. The visitor's shortlist is global per-session, surfaced as a floating "Shortlist (3)" pill bottom-right. Click → opens a side-drawer with their saved talents + "Start an inquiry with these." | M | 🔥 |
| **B10. Shareable filtered URL → curated view** | Operator can build a sophisticated filter set in the editor (or visitor on storefront), copy URL, share. The receiver lands on the exact filtered state. Branded share preview meta tags (OG image generated from the filter — "Available Models · Tulum · May 2026 · Impronta"). | M | medium |

### Pillar C — Engine: the field-engine becomes the source of soul

**Status today:** card shows ~5 properties; directory engine reads from `talent_discover_index` matview + `field_definitions`. Field-engine resolver (`resolve-talent-fields.ts`), workspace_profile_field_settings, tenant_override, weighted groups, brought-in-by attribution — **none of these reach the directory card.** Massive untapped depth.

**Evolution:**

| Move | What | Effort | Impact |
|---|---|---|---|
| **C1. Connect the resolver to the card** | Card data source: extend `DirectoryCardDTO` (or a sibling rich-DTO) to carry the resolver's output. Per-tenant `enabled_override` decides which fields surface. Per-talent `tenant_override` / `has_value` controls visibility. Brought-in-by attribution annotates origin. | L | 🔥 transformational |
| **C2. Weighted groups → "Best at" hint on the card** | The field-engine knows weighted groups (e.g. a Model has "Editorial fit" 0.9, "Commercial fit" 0.4 → "Editorial-leaning"). Surface this as a single, restrained label under the talent type ("Carmen Díaz · Fashion Model · Editorial-leaning"). | M | high (depth without clutter) |
| **C3. Attribution: "Represented by Impronta — also bookable through Agency X"** | When `brought-in-by` differs from current tenant, surface a discreet line on the profile expansion ("Carmen is represented by Impronta; you're seeing her via Agency X's curated discover view"). Trust + transparency. | M | medium |
| **C4. Smart card density** | Cards adapt their density to the **resolved field richness** of each talent. A talent with 18 populated fields gets the "rich card" (hover-reveals 3 attributes). A talent with 6 populated fields gets the "minimal card" (focus on portrait + name + type). No "broken-looking sparse cards." | M | high |
| **C5. Search ranks by signal completeness** | Talent with more resolved (non-default) field values ranks higher. The agency operator is incentivized to complete the catalog → the catalog rewards them with better Discover placement. SaaS flywheel. | M | high |
| **C6. AI hero band uses the resolver, not just taxonomy** | Today the AI search hits an LLM with the raw query and produces taxonomy term IDs. Future: it uses the field-engine's understanding of the talent ("hosts" intent + "Riviera Maya" location + "June 1-30 availability" → matches against the resolver's field universe, including weighted groups). Richer matches, more "wow" responses. | L | high |
| **C7. Trust badge (TN-1/TN-2 close)** | Add `trust_tier` to the matview projection (the deferred A2 item). Lane 5 already built the badge component; data is the only missing piece. | S | medium |

### Pillar D — Multi-tenant SaaS flywheel: agency onboarding in 30 seconds

**Status today:** new agency hard-coded `plan_tier='free'`, no seeded directory page, no smart starter content. Pre-launch posture.

**Evolution:**

| Move | What | Effort | Impact |
|---|---|---|---|
| **D1. Onboarding wizard for new agencies** | Sign up → wizard asks: "What kind of talent do you represent?" (multi-select from a curated list: Models, Hosts, Performers, Creators, Service providers…) + "Where are you based?" + "Plan tier (Free / Studio / Agency)." Then generates the storefront with sane defaults. | L | 🔥 |
| **D2. Apply Lane 3's signup wire (paired with a paid path)** | Once a paid signup or upgrade flow exists, fire `ensureDirectoryPage()` for Studio+ tenants. Already drafted; just needs the trigger to exist. | S (when paid flow lands) | high |
| **D3. Tier-flip enforcement (Track C unblock)** | Wire the A3 plan-tier capability gates: Free → no directory page (5 inline on landing), Studio → 1 directory page, Agency → unlimited. Picker filter + `cmsAdditionalPageDeniedReason` extension. | M | high (Track C item) |
| **D4. Pre-built starter sets per vertical** | Beyond a single Fashion preset: "Modeling Agency starter pack" / "Live Production Roster" / "Event Hospitality" / "Creator Network". Each = a curated page (or set of pages) with Directory + Featured Talent + relevant facets pre-configured. One-click apply. | M | high |
| **D5. Agency-to-agency learn loop** | "Top-performing directories this month: 3 agencies whose visitors converted to inquiries at >18%. Their configurations: pill bar set to X, sidebar limited to Y, card density Z." Aggregated, anonymized. Helps newer agencies copy what works. | L | medium |
| **D6. Roster-quality dashboard** | The agency admin sees: "Your roster catalog is 73% complete. Talents missing key fields: Sofía Herrera (no `event_types`), Marco (no `next_available_date`). Fixing these moves your average Discover-rank from 6.2 to 4.1." Quantified, actionable. | M | high (drives engine adoption) |

---

## 5. Top 10 concrete moves — specced, ordered by impact

Ranked by **(visitor-felt magnetism × operator-felt confidence) / effort**.

### #1 — B3: kill legacy `talent-card.tsx` on the reactive grid; use our DirectoryCard

**Why this is #1:** the single biggest visible flaw — the page LOOKS legacy because the cards are legacy. Our new card is built, cool-not-warm, prop-driven, §10-ready. Switching the reactive island to render it is the single highest-impact visible change in this entire plan.

**Spec:**
- `DirectoryReactiveResults.tsx` → swap `DirectoryInfiniteGrid` rendering child to `DirectoryCard` (need a small adapter: legacy InfiniteGrid passes items in DTO shape; map each to `DirectoryCardData`)
- Adapter lives in `directory/` (not legacy) — keeps the legacy DTO untouched but renders premium cards
- Hover reveal (B7) hooks in on the same path
- §10 badges on every card (already wired, just needs DTO mapping)

**Done when:** Chrome shows portrait 4:5 editorial cards in the reactive grid with the badges, NOT the legacy zinc-gradient card. Single visual leap.

### #2 — B6: AI hero band → live filter, not navigation

**Why:** the AI search is currently a black-hole — type a query, page navigates somewhere, filters reset. Should feel like a magic wand that refines the page in place. This makes the AI feel real.

**Spec:**
- `HeroSearch` interpret response → URL params via `commitDirectoryListingUrl` (already on the same path) but DON'T full-page navigate; the reactive island already reads `useSearchParams()`. So the change is: replace `router.push(/directory?...)` with `router.replace(currentPath?...)` so the grid updates in place.
- Visible affordance: typed query stays in the input + a tidy chip row above the grid shows "AI applied: hosts in Riviera Maya next month — [clear AI]"

### #3 — A1: live preview pane in the editor

**Why:** the drawer is the operator's primary interface. Without a live preview, every edit is hope-and-check. With a preview, every edit is felt. This shifts the experience from "config form" to "design tool."

**Spec:**
- Editor shell becomes split-pane: left rail = tabs as today (50% width when expanded), right = iframe pointed at `/preview/<page-id>?asTenant=<id>&unsavedJsonHash=<hash>`
- Tab is collapsible to icons (60px sliver) → preview goes 90% width
- Debounce edits 150ms → write to a draft snapshot → preview re-renders
- "Publish" button promotes the draft to live

### #4 — C1: connect the field-engine resolver to the card

**Why:** the card today shows 5 things; the engine knows 50. Closing this gap is what makes the directory FEEL like Tulala's product rather than any other talent site.

**Spec:**
- Card-data source extended to call `resolve-talent-fields.ts` per visible talent
- Output a `richFields: { weighted: [...], curated: [...], attribution: {...} }` blob on the DTO
- DirectoryCard reads `richFields.curated.slice(0, 3)` for the hover-reveal layer
- Workspace_profile_field_settings.enabled_override is the gate — agency decides which fields the card may even reach for
- Talent's `tenant_override` / `has_value` filters out anything they personally suppressed
- Brought-in-by attribution surfaces as the small "Represented by · Impronta" line under the agency badge on the expanded profile (not the card — keeps the card restrained)

### #5 — B1: adaptive pill bar (3–6 + "More")

**Why:** the 21-pill scroll is the loudest design failure on the current page. Restraint > expressiveness.

**Spec:**
- `field-driven-filters.ts` already returns `topBarFacet.options` with counts. Sort by count desc, take top 5, render. If `options.length > 5`, append a `<MorePillsDisclosure>` that opens a sheet/popover with the rest, searchable.
- Maintain "ALL" pill + selected pill state
- Count badge per pill, small, muted

### #6 — B9: persistent shortlist + inquiry-from-shortlist

**Why:** the directory exists to convert browsing into bookings. Today a visitor can save talents but the saved set is invisible until they navigate to a saved-talents page. A floating shortlist pill + "Start inquiry with these 3" is the conversion lever.

**Spec:**
- `usePublicDiscoveryState` already tracks `savedIds`. Add a floating `<ShortlistFab>` rendered by the section when `savedIds.length > 0` (or always, with 0-state copy).
- FAB shows count badge; click opens right-side drawer with mini-cards + "Start inquiry" CTA pre-filling all talents into the inquiry composer

### #7 — A4: drawer micro-copy + smart groupings

**Why:** small but disproportionately raises operator confidence. "topBarMode" → "Pill bar above results" — that ONE rename makes a non-engineer feel they're in control.

**Spec:**
- Rename every drawer label from machine-spec to product-spec
- Group tabs more decisively (the 7-tab layout works; just rename: Source → "Who's in this directory" · Template → "Layout" · Card → "How talent appears" · Filters → "How visitors narrow" · AI → "AI search behavior" · Empty/SEO → "Edge cases" · Presets → "Starter kits")
- Inline help text under tricky labels: a one-line "why this matters"

### #8 — B2: editorial skeleton/empty states (kill the current visible defect)

**Why:** the empty state showing during cold-load is the most embarrassing current visible bug. Replace with editorial skeletons; make the genuine empty an intentional moment.

**Spec:**
- During fetch: render 6 portrait-shaped skeletons with cool shimmer (no error language).
- After fetch with results: cards.
- After fetch with no results: editorial copy ("Our roster is fully booked this week — would you like us to suggest similar talent?"). NOT "No talent matches these filters yet."

### #9 — D1: agency onboarding wizard

**Why:** the SaaS growth case. A new agency signing up today gets an empty homepage and no idea what to do. With a wizard: 30 seconds to a live storefront they're proud of.

**Spec:**
- Triggered post-signup (replaces the current default landing)
- Three steps: (1) what kind of talent (multi-select), (2) primary market(s), (3) plan tier confirmation
- Server-side: seed the directory page, the homepage, set field_definition visibilities sensible for the chosen verticals, apply matching CMS pages
- End state: their `/directory` works out of the box with their roster (or a "Add your first talent" empty state if roster is 0)

### #10 — D6: roster-quality dashboard

**Why:** the engine rewards completeness; agencies need to see the reward to do the work. A "your roster is 73% complete; here's how to get to 95%" dashboard is the loop.

**Spec:**
- Per-tenant page at `/admin/.../roster-quality`
- Metrics: completeness %, missing-fields list, predicted Discover-rank impact
- "Fix this" buttons jump to the talent's profile editor at the specific field
- Quantified deltas: "Adding `next_available_date` to 3 talents moves their average Discover-rank from 6.2 to 4.1"

---

## 6. The 4-week sprint plan (sequenced, attackable)

**Week 1 — visible quality cliff (visitor-felt, ship-now)**
- Day 1–2: #1 B3 swap to DirectoryCard on reactive grid (the #1 highest-impact)
- Day 3: #5 B1 adaptive pill bar (3–6 + More)
- Day 4: #8 B2 editorial skeleton + intentional empty state
- Day 5: #2 B6 AI hero → live filter in place

→ End of week 1: the page LOOKS like the premium Atelier I promised at session start. This is the "actually shipped premium" moment.

**Week 2 — operator confidence (admin-felt)**
- Day 6–7: #7 A4 micro-copy + grouping rename
- Day 8–10: #3 A1 live preview pane

→ End of week 2: an agency operator opens the drawer and feels like they're using a design tool, not a CMS form.

**Week 3 — engine depth (tulala identity)**
- Day 11–13: #4 C1 field-engine resolver → card hover reveal
- Day 14: C7 trust badge (matview column add) → TN-1/TN-2 close visibly
- Day 15: #6 B9 persistent shortlist + inquiry-from-shortlist

→ End of week 3: the directory feels Tulala-deep, not generic agency site.

**Week 4 — SaaS flywheel**
- Day 16–17: D2 signup wire activation (paired with paid path) + D3 Track-C plan-tier enforcement
- Day 18–20: D1 onboarding wizard
- Day 21–22: D6 roster-quality dashboard

→ End of week 4: a new agency can sign up Monday and have a premium directory by Friday they're proud of.

---

## 7. What I'd attack first, if you give me one thing today

**B3 — swap the reactive grid from `talent-card.tsx` to `DirectoryCard`.**

It's the smallest unit of work that produces the biggest visible leap. Every screenshot we've discussed shows the legacy zinc-gradient card; one swap and Impronta's directory looks like the premium editorial we set out to build. Everything else compounds on top of that change.

If you greenlight it, the precise plan: write a one-file adapter in `directory/DirectoryCardAdapter.tsx` that maps `DirectoryCardDTO` → `DirectoryCardData`; modify `DirectoryReactiveResults` to render `<DirectoryCardAdapter card={c} />` instead of letting `DirectoryInfiniteGrid` render legacy `TalentCard`; verify in Chrome MCP that the visible rendering is the cool portrait card with §10 badges; commit; done. ~90 minutes of focused work for a transformational visible result.

---

## 8. Honest gates to honor along the way

The user's binding values that every move must respect:

- **QA-proven results** — every change verified in Chrome MCP, not curl markers
- **Visible UX is the truth** — no "structurally shipped, visually broken" again
- **Cool-not-warm tokens** — Tailwind primitives over themed tokens (Lane G1+G5 lesson)
- **Don't strip features** — every interactive affordance must survive (save, add-to-inquiry, share)
- **Multi-tenant safety** — Lane G3+G7 patterns; never mutate canonical rows; clone-to-tenant-local override
- **No silent binding-spec divergence** — anything that crosses §10 or Discover-spec territory files an amendment first
- **Branch governance on `phase-1`** — scoped local commits, no force-push, no rebase of others' work

---

## 9. Why this is genuinely ambitious (the "out of limits" part)

A normal "fix the directory" plan would stop at Pillar B (storefront polish). This plan crosses into:

- **Pillar A's canvas-as-builder** — that's a Webflow/Framer-class feature, and we have the data model + section registry to actually build it. Most CMSs never get there.
- **Pillar C's field-engine ⇄ card** — surfacing weighted groups, attribution, brought-in-by relationships on PUBLIC cards is genuinely novel. Other talent sites show profile pages; nobody surfaces the **relationship topology** of representation. This is Tulala's moat.
- **Pillar D's onboarding wizard + roster-quality dashboard** — most multi-tenant SaaS skips these because they're "non-essential." But they are the difference between a tool agencies tolerate and a tool agencies recommend.

The reason to do all four pillars: each compounds the others. A premium card (B3) + a live preview (A1) + engine depth (C1) + a 30-second onboarding (D1) — that's a product agencies leave their existing tools for.

---

*v1 shipped the directory. This plan ships the experience.*
