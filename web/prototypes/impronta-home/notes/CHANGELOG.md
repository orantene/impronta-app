# Impronta Home — Prototype Versions

A versioned home for all Impronta homepage design explorations. Never overwrite a
version — copy it forward and iterate in a new folder.

```
web/prototypes/impronta-home/
  v1-current/                    # busy premium build (full-feature, content-heavy)
  v2-simplified-premium/         # leaner editorial direction
  v3-visual-depth/               # depth + real map interaction
  v4-living/                     # iteration toward "alive"
  v4-living-structural-baseline/ # APPROVED STRUCTURE (frozen layout foundation)
  v5-editorial-placeholders/     # refined placeholders + intl positioning (frozen)
  v6-operational/                # operational/conversion pass (frozen)
  v7-client-first/               # simplified, 6 sections, client-first (frozen)
  v8-luxury-simplified/          # luxury pass, 5 sections, no map (frozen)
  v9-v5-base/                    # v5 base + calmed headline / no "curated" / logo slot (frozen)
  v10-refined/                   # 20-point UX/a11y pass on v9 (frozen)
  v11-features/                  # CURRENT canonical — feature-visibility restored on v10
  assets/{portraits,categories,lifestyle}/   # drop real licensed photos here
  notes/    # changelog + imagery-strategy.md + map-component-findings.md
  references/   # original 2026-04 black/gold mockups (git 5aa055dea)
```

Each version folder is self-contained: open `index.html` directly, or via the
"Impronta Home Prototypes" preview server. `directory.html` is copied alongside so
in-page "Explore Talent" links resolve (directory redesign is out of scope here).

---

## v1-current

Snapshot of the first premium rebuild. Strong brand energy, but **too much**:
12+ sections, top utility bar, 4-stat strip, 6-feature "why" grid, testimonials,
a hero search form, dense talent grid (8), crowded single-row nav, heavy footer.
Reads closer to a SaaS landing page than a premium agency.

Kept as a reference for the full-feature direction.

## v2-simplified-premium  ← canonical

Rebuilt for: simple, sexy, premium, editorial, fast to understand. Less content,
more confidence.

### What changed and why

**Header — logo now sits ABOVE the nav (two rows).**
- Row 1: wordmark + tagline (left) · account area (right).
- Row 2: 5-item nav (Discover · Talent · Services · Locations · About) · `Start Inquiry`.
- Account area is **icon-based**: locale, Saved (♥, badge), Inquiry (badge),
  Account (▾ menu → Client sign in / Talent login / Apply as talent).
  Secondary access moved out of the nav into the menu → nav stays luxurious.

**Hero — calmer and more emotional.**
- Removed the 3-field search block (the most "app-like" element).
- Short premium copy: *"Curated talent for events, productions, brands and
  private experiences."* (was an explanatory sentence).
- Clear CTA hierarchy that doesn't compete: **Explore Talent** (primary) ·
  Start Inquiry (line) · *Apply as talent →* (quiet tertiary link).
- Single cinematic editorial portrait instead of a 4-tile collage + floating badge.

**Sections reduced 12 → 8 and lightened:**
| Removed / merged | Reason |
|---|---|
| Top utility bar (city strip + phone) | Density; locale folded into account area |
| 4-stat strip | "Dashboard" feel; not needed to convey premium |
| 6-feature "why" grid → **3 trust pillars** | Curated profiles · Local coordination · Booking support |
| Testimonials section | Not in the focus list; added reading weight |
| Hero search form | Discovery lives in nav + categories |

- **Categories**: tall editorial tiles (image-led, 1-line descriptor, hover) —
  no count badges / directory-grid feel.
- **Featured**: 8 → **4** curated, larger image, minimal text, one action
  ("View profile") revealed on hover, clean save heart.
- **Map**: same elegant Riviera Maya SVG, but the heavy city list with big
  numbers became 4 quiet zone rows with a one-line descriptor.
- **How it works**: exact 4-step copy (Tell us the brief / We curate options /
  Confirm talent / Coordinate the booking) on hairlines, not boxed cards.
- **Talent join**: one elegant centered band — Apply as Talent + Talent Login.
- **Footer**: 4 minimal groups (Explore · Agency · Account · Contact), no
  social-icon row, fewer links.

**Visual language:** more whitespace (section padding `clamp(5rem,12vh,8.5rem)`),
hairline dividers instead of boxed cards, larger Cinzel headings, lighter Raleway
(300/400), restrained gold. Bilingual EN/ES retained (HTML-safe swap).

### Multi-perspective audit (v2)

**Client** — In the first screen: who Impronta is (curated Riviera Maya talent
agency), what's available (categories one scroll down), where to start
(Explore Talent / Start Inquiry), why trust it (3 pillars + "an agency, not a
directory"). Inquiry reachable from header, hero, final CTA. ✅

**Talent** — "Apply as talent" appears as a quiet hero link, the account menu,
the dedicated join band, and the footer. Talent login is in the menu + band +
footer. Present and findable, never dominating. ✅

**Agency owner** — Editorial, confident, spacious; reads as a represented agency,
not a marketplace. "Curated · Local coordination · Booking support" states the
value without a wall of copy. ✅

**UX** — Scannable: 8 sections, short copy, one idea per section, clear hierarchy,
hairlines over boxes. Header no longer crowded. ✅

**Conversion** — One primary gold action repeated (Explore Talent / Start
Inquiry); secondary actions are visually quieter so they don't fight the primary. ✅

### Open follow-ups (carried into v3)
1. Real talent photography (placeholders are intentional prototype art).
2. Wire `Start Inquiry` to a real multi-step form (currently → directory).
3. Live category/zone data from the roster API.
4. Apply the same pass to `directory.html` if this direction is approved.

---

## v3-visual-depth  ← canonical

Brief: "more emotional visual depth + stronger product interaction." v2 was the
right luxury direction but slightly too minimal/flat in places.

### What changed and why

- **Depth & contrast**: added a fixed film-grain overlay (inline SVG noise),
  warm section backgrounds (`band--warm` / `band--surface` alternate with pure
  black), gold radial lighting per section, and a richer placeholder system
  (`.ph` = duotone + figure silhouette + warm rim-light + vignette) so dark
  cards no longer read as empty boxes. Stronger hover everywhere (lift, gold
  border glow, image scale).
- **Hero**: replaced the single isolated card with a 3-card **overlapping
  collage** (staggered, shadowed, spreads on hover) + a "Curated roster 120+"
  badge; added an **"Available now in Playa · Tulum · Cancún"** indicator and a
  compact **mini-discovery** (category + location + Explore) above the CTAs.
- **Categories**: one **large featured card** (Models, spans 2 rows) + five
  smaller; gold medallion icons, one-line copy, gradient-shift + lift on hover.
- **Featured talent**: bigger image area, "Available" tag chip, clear favorite,
  and an **always-visible "View profile"** button (no longer hover-only) with
  stronger name/role hierarchy. Still a curated 4.
- **Account area**: every icon now has a hover **tooltip** (Saved / Inquiry /
  Account); Account opens a clearer labelled dropdown (Clients / Talent groups,
  incl. "Your inquiries"). All three icons stay visible on mobile.
- **How it works**: connected process line with gold numeral medallions.
- **Trust**: added the stronger lead — *"Every booking is supported by real
  coordination, local knowledge, and curated talent selection."* — and gave the
  3 pillars gradient panels + gold medallions + hover.
- **Final CTA**: stronger copy — *"Planning an event, shoot, activation, or
  private experience? Tell us the brief. We'll curate the right talent."* —
  with **Start Inquiry** now the primary action.

### Map section — product-driven, real component referenced

The "Across the Riviera Maya" block became a real interaction:
**left interactive map · right talent preview panel.** Clicking a pin (or zone)
swaps the panel to that location's curated **talent faces** + an
**"Explore talent in {city} →"** CTA. Verified: Cancún · Playa · Tulum ·
Cozumel all drive the panel.

**Existing component found (do not rebuild):**
`web/src/components/home/location-map.tsx` — exported `LocationMap`
(`@vis.gl/react-google-maps` v1.8.3), wrapped by `location-section.tsx`
→ `LocationMapLazy`. Dark/gold themed, gold pins, **click pin → reveal featured
talent for that city** (orbit of avatars) + "View Talents →". Env
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser) / `GOOGLE_PLACES_API_KEY` (server)
via `lib/env/google-maps-browser-key.ts`. Production code.
Secondary: `(workspace)/[tenantSlug]/client/discover/map/DiscoverMapShell.tsx`
(dense catalog map), and `lib/google-places.ts` (Places autocomplete, not a map).

It's a React/Google component — it can't execute inside a static HTML file
(no bundler / API key / referrer-allowed origin on localhost). So the prototype
**replicates its exact UX** and ships a **drop-in hook**: `#talentMapMount`
(absolute-positioned mount), `.map.live` (hides the SVG fallback), and
`window.mountRealTalentMap(impl)` whose pin-click forwards to `selectZone(id)`
— already wired to the preview panel. Zone `faces[]` mirror
`LocationItem.featuredPreviews`. Wiring = render `<LocationMap>` into the mount
and call the hook; ~no panel changes needed.

### Verification (this pass)
Desktop 1440 visually confirmed in Chrome (hero collage, categories large+small,
featured cards, how-it-works line, map header). Map interaction + structure +
mobile composition confirmed via DOM: 3 collage cards, icon tooltips, 1 large
category, 4 featured w/ view-profile, 4 pins → preview panel swaps faces + CTA,
real-map hook present, no console errors, 8 sections, grain active. Mobile (390):
burger + drawer carries all nav/CTA/account/talent paths, all 3 account icons
stay visible, hero/mini/map/steps stack, featured stays 2-col. Tablet (820):
reasoned from breakpoints (2-col categories, stacked map, 4-col featured/steps,
burger nav) — not pixel-screenshotted (Chrome screenshot canvas is fixed-width
and Preview renders 0-width in this env).

---

## v4-living-structural-baseline  (FROZEN — approved layout foundation)

A verbatim copy of `v4-living`, kept untouched as the agreed structure/design
direction. Treat this as the layout baseline; iterate elsewhere. Do not edit.

## v5-editorial-placeholders  ← canonical

Focus of this version was **imagery believability + international positioning**,
not layout (structure inherited from the v4 baseline, unchanged).

### Imagery layer (the recurring blocker)
- Replaced the avatar-blob with a **refined art-directed editorial portrait
  SVG**: continuous head→neck→shoulder bust (no "lollipop" disc), a sculpted
  hair mass with hairline + gold highlight, chiaroscuro warm key-light, lit
  cheek vs. shadow-side face plane, film grain (`.frame::before`), vignette,
  tight editorial crop (`0 0 360 440`, slice). Seeded per name → one coherent
  "shoot" with variation (palette ×3, hair ×3, mirror, tilt). Unique gradient
  ids per instance (verified 120/120 — no SVG def collisions). Honest status:
  a premium *stylized illustration*, deliberately **not** posing as a photo
  and **not** a generic avatar — exactly the option-3 brief.
- **Swappable image layer (verified):** one `TALENT` data object
  (`name → {category,location,image,tags}`) + `CATS[].image`. Every surface is
  tagged `data-img-slot` (`heroTalentImage` · `featuredTalentImage` ·
  `categoryImage` · `mapTalentFaceImage`; `profileCardImage` reserved). Setting
  a talent's `image` makes an `<img>` replace the SVG automatically — proven in
  QA (svg → img with correct src+slot → restored). No HTML/CSS edit needed to
  go placeholder → real licensed photos. Folders: `assets/{portraits,
  categories,lifestyle}/`. Full plan: `notes/imagery-strategy.md`.

### International repositioning (Riviera Maya = featured launch market, not the ceiling)
- Title/tagline → "International Talent Network". H1 → **"Discover premium
  talent across destination cities."** Sub → "…starting in Riviera Maya, with
  reach across Mexico City, Buenos Aires and beyond." Hero chips → Riviera Maya
  · Mexico City · Buenos Aires · *More cities coming* (muted). Nav "Locations"
  → **"Markets"**. Footer → "A curated international talent network — launching
  in Riviera Maya…". Trust copy → "in every market we operate".
- **Market map** (replaces the RM-coastline graphic): abstract network field
  with graticule + connectors; 5 pins — **Riviera Maya (featured**, larger,
  pulse, "Featured market" badge, sub-cities Cancún · Playa del Carmen · Tulum
  · Cozumel**)**, Mexico City + Buenos Aires (active), Los Angeles + Madrid
  (muted "Soon", no pulse, not clickable into faces). Pin/click → right panel
  swaps to that market's badge + cities + 3 talent faces + "Explore talent in
  {market} →"; "soon" → expansion message + dimmed CTA. RM stays the featured
  default and the hero strip is "Featured · Riviera Maya launch market" — the
  balance the brief asked for.
- Map component **re-verified** at exact lines: `LocationMap`
  (location-map.tsx:382), `@vis.gl/react-google-maps` (:15),
  `featuredPreviews` (:299), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (:397). Its
  `locations: LocationItem[]` prop is **multi-market by design** — not
  RM-hardcoded. Drop-in hook unchanged (`#talentMapMount` · `.map.live` ·
  `window.mountRealTalentMap` → `selectMarket(id)`). Details:
  `notes/map-component-findings.md`.

### Verification
No console errors. 24 portraits render with new geometry + unique grad ids.
EN/ES, account dropdown/tooltips/labels, drawer (carries all nav/CTA/account/
talent paths), header condense — all intact. Market map: default Riviera Maya
(Featured, 4 sub-cities, 3 faces) → Buenos Aires (faces + CTA) → "More cities
coming" (soon panel, dimmed CTA) all verified. Desktop composition verified via
DOM (2-col hero, 3-col categories, 4-col featured, 2-col map, nav visible).
Image-swap path proven. Visual: hero + zoomed portrait inspected in Chrome —
reads as intentional editorial illustration, past the avatar-blob bar; not
claimed as photographic.

### Open (unchanged)
Real licensed photography is still the only path to true photo realism — the
system is now built so that's a per-talent data swap, not a redesign. Wire the
real `LocationMap` when this graduates to a Next page.

---

## v6-operational  ← canonical

A clarity/conversion/trust pass on the v5 design — "make it feel like a working
agency product." v5 frozen as the prior reference. Layout language unchanged
(black/gold editorial); structure & copy made operational.

- **"Curated" removed everywhere** (verified 0 occurrences). "A curated few" →
  **Featured talent**; hero/footer/badge/pillar copy reworded.
- **Hero**: headline → *"Premium talent for events, shoots & brand
  experiences."*; sub names Playa del Carmen · Tulum · Cancún · Riviera Maya +
  intl reach. CTA hierarchy fixed → **Start an Inquiry** (primary gold) ·
  Explore Talent (secondary). Discovery is now **3 fields** (Category ·
  Location · Event type) + hint "Browse by category, city, or event type."
- **Header user area**: explicit **labelled** actions — Saved · Inquiry ·
  **Access ▾** dropdown (Client login · Your inquiries · Talent login · Apply
  as talent · Agency admin). Mobile gets a visible gold "Inquiry" button +
  burger; drawer carries every client/talent/admin path.
- **Categories**: real booking microcopy per discipline + "View All Talent
  Categories" CTA. New **"What you can book"** section (8 concrete bookable
  types).
- **Featured cards**: name · role · location · **languages** · **availability**
  badge · **View Profile** + **Request** — reads like a working platform.
- **"An agency, not a directory"** moved **above the map** (trust earlier),
  benefit-driven pillars (Human Coordination · Verified Profiles · Booking
  Support).
- **Map** → *"Find talent near your event location"*; right panel now shows
  **location-cluster counts** (e.g. Riviera Maya 48 Models · 22 Hosts · 16
  Performers · 12 Creators) + faces + **"Explore {Market} Talent →"**. Verified
  Riviera Maya → Mexico City swap; soon-markets dimmed. Real `LocationMap`
  drop-in hook unchanged.
- **Process** sharpened (Tell Us What You Need → Receive Matched Options →
  Approve Your Selection → Coordinate & Confirm). New **social-proof band**
  (Local Riviera Maya network · Bilingual support · Fast shortlisting ·
  Agency-managed coordination).
- **Join** → "Join Impronta as Talent" + Apply / Talent Login. **Final** →
  "Ready to book talent for your next event or production?" (Start an Inquiry /
  Explore Talent).
- **Contrast/readability**: lighter secondary text (`--muted` #a6a39b → #c2bfb6,
  `--faint` lightened), larger body + buttons (`.btn-lg`), more section
  breathing room, gold hover brightened.
- Kept v5's editorial portrait system + swappable image layer
  (`TALENT[].image`/`CATS[].image` → `<img>`, `data-img-slot`s); assets/ &
  imagery-strategy unchanged.

**Verification:** no console errors; 0 "curated"; 24 portraits; all 15
requested items confirmed in DOM (headline, CTA order, 3-field discovery,
Access dropdown, microcopy+CTA, rich cards w/ langs+availability, counts-panel
map + "Explore {market} Talent", agency-above-map, social-proof, sharpened
copy, lighter contrast, "What you can book"); EN/ES + market map + drawer +
image-swap intact. Desktop composition verified via DOM (2-col hero, 3-col
categories, 4-col featured/book, 2-col map). Mobile verified at
composition/CSS level (standard ≤900px breakpoint; drawer carries all
nav/CTA/account/admin paths; dedicated mobile Inquiry button) — a true 390px
pixel screenshot isn't capturable in this env (Chrome screenshot canvas is
fixed-width; Preview renders at its own width), flagged honestly rather than
claimed.

---

## v7-client-first  ← canonical

Simplification pass — v6 was complete but too dense. Cut to **6 body sections**,
client-first, calmer. v6 frozen as the prior reference.

**Removed/merged:** "What you can book", standalone Process section, the
Social-proof band, and the big standalone "Join Impronta as Talent" section →
all gone. Trust merged into one **"An agency, not a directory"** (3 pillars +
a compact `Send brief → Review options → Confirm booking` row). The two bottom
CTAs merged into one **split end section** (Booking talent / Are you talent).
Hero **thumbnail strip removed** (calmer composition: 1 featured + 2 subtle).
**Header de-cluttered** — Saved/Inquiry icons dropped; right side is now
Talent Area · Access▾ (Client Login / Talent Login / Apply as Talent / Agency
Admin) · Start Inquiry; nav trimmed to Discover · Talent · Services · About.

**Final section order:** Hero → Talent by Discipline (6 + View All Categories)
→ Featured Talent (4, availability + View Profile/Request + View Full Roster)
→ An Agency Not a Directory (3 pillars + flow) → Talent Across Key Destination
Markets (map + simple market card + Explore {Market} Talent) → Split CTA →
Footer (Explore/Agency/Access + Legal).

**Verified:** no console errors; 0 "curated"; exactly 6 `<section>`s; minimal
header (no Saved/Inquiry icons, Access dropdown 4 items); hero has no thumbnail
strip; 3-field discovery; CTAs Start an Inquiry (primary) + Explore Talent;
map RM→counts→"Explore Riviera Maya Talent"; split CTA both sides; portrait +
swappable image layer + LocationMap hook intact; EN/ES works; no horizontal
overflow; drawer carries all paths. Desktop verified visually + via DOM.
Mobile verified at composition/CSS level (standard breakpoints, drawer carries
nav/CTA/access) — true 390px pixel screenshot not capturable in this env
(Chrome screenshot canvas fixed-width; Preview renders at its own width).

---

## v8-luxury-simplified  ← canonical

Premium simplification pass on the v6-operational visual direction (the user
cited it as the stronger one). Not a redesign — fewer sections, more breathing
room. **5 body sections** (no map).

**Removed:** the whole Map/markets section; hero search form + thumbnail strip
+ chip-pill badges (→ one subtle market text line); "What you can book",
standalone Process, and Social-proof sections; header Saved/Inquiry icons +
crowded lang controls; per-card availability badges, languages, save heart,
Request button; big section buttons (→ subtle arrow links). 0 "curated".

**Simplified:** header = logo · Talent · Services · About · Access▾ · Start
Inquiry. Hero = headline + 2 CTAs + Apply link + one editorial composition.
Talent by Discipline = 4 cards + "Also available: Event Talent · Production
Support · Brand Ambassadors". Featured = 3 large cards (Name · Role · Location
· View Profile only). "An agency, not a directory" = new copy + 3 cards
(Human Coordination · Agency-Approved Profiles · Clear Booking Flow) + inline
`Send Brief → Review Options → Confirm Booking`. End = one split CTA (Booking
Talent / Are You Talent). Footer trimmed (Explore · Agency · Access + Legal).

**Improved:** much more spacing (`band` padding up to 11rem), gold reserved to
primary CTA + subtle accents, fewer bordered cards / larger editorial cards,
calmer hierarchy. Fixed a flat-frame z-index bug so card text stays legible
over the darkened portrait (h3/p z-index 3 > overlay 2 > grain 1 > portrait 0).
Kept portrait + swappable image layer (`TALENT[].image`/`CATS[].image`,
`data-img-slot`); EN/ES intact.

**Verified:** no console errors; exactly 5 `<section>`s; 0 "curated"; 0 map
refs; minimal header (no Saved/Inquiry; Access dropdown); hero has no
form/strip/pills; 4 cat cards + also-row; 3 featured (no save/badge/request);
3 agency pillars + flow line; split CTA both sides; no horizontal overflow;
drawer carries all paths; EN/ES works. Desktop verified visually + via DOM.
Mobile verified at composition/CSS + drawer level (standard breakpoints) —
true 390px pixel screenshot not capturable in this env.

---

## v9-v5-base  (frozen)

User chose the **v5 editorial direction** as the base. Applied only: headline
calmed (clamp 1.45→2.5rem, no forced 94vh), every "curated"/"curate" replaced
(EN+ES), hero Explore/Start-Inquiry buttons removed, and a swappable logo slot
wired into header+footer (`../assets/logo/impronta-logo.png` with text
fallback). Everything else = v5 untouched.

## v10-refined  (frozen)

All **20 audit findings** implemented on a v9-v5-base copy (v9 frozen).

1 Hero badge removed (overlap fixed) · 2 dead `#` links: no top-jump +
`title="Prototype link"`/`aria-disabled` · 3 hero balanced (primary CTA +
trust line fill the left col; stage shortened; vertically centered) · 4 tap
targets ≥44px (nav 48px, menu/loc/footer padded) · 5 header decluttered
(SAVED/INQUIRY icons gone; logo·nav·EN-ES·**Access**·Start an Inquiry) ·
6 non-functional buttons removed · 7 reveal lighter/faster (0.8→0.45s, 22→12px,
earlier trigger) · 8 one strong hero primary "Start an Inquiry" · 9 CTA verbs
standardized (Browse→Explore, "View full roster"→"Explore Talent", "Start
Inquiry"→"Start an Inquiry") · 10 featured = single clickable card (Save +
Request + Available badge removed; "View profile →" affordance) · 11 trust
line above the fold ("120+ represented · agency-managed…") · 12 consistent
talent path (hero link + Access menu + #join) · 13 hero sub trimmed to ~2
lines · 14 tiny faces strip removed · 15 map block lightened (min-height
↓, calmer) · 16 section rhythm tightened (`band` padding ↓) · 17 contrast
raised (`--muted` #a6a39b→#bdbab1, `--faint` →#928e83; bigger labels) ·
18 skip-link + `#main` + `nav aria-label` + `:focus-visible` ring ·
19 favicon (inline SVG) + title aligned to "International Talent Agency" ·
20 editorial portrait treatment (brightness/contrast/grain).

**Verified:** no console errors; 16 portraits render; featured cards are
single links (0 nested actions); 8 dead links neutralized; EN/ES, drawer,
Access dropdown, map, swappable image + logo slots intact; 0 "curated"; no
horizontal overflow; desktop confirmed visually (balanced hero, no overlap,
single-action cards, readable contrast). Fixed one regression during the pass
(orphaned `#strip` JS threw after the strip markup was removed — removed the
dead JS; init now runs clean). Mobile verified at composition/CSS + drawer
level; true 390px pixel screenshot not capturable in this env.

> **Correction carried into v11:** item 10 (collapsing featured cards to a
> single link by deleting Save + Request) was the wrong call. For a talent
> agency, client shortlisting and starting an inquiry from a card are **core
> product features**, not clutter. v11 restores them as low-noise affordances.
> Durable rule saved: simplify by redesign/hierarchy, never by deleting
> functional affordances (`memory/feedback_dont_strip_features.md`).

## v11-features  ← canonical

All **15 feature-visibility audit findings** implemented on a v10-refined copy
(v10 frozen). This pass reverses the v10 over-simplification: the homepage must
*demonstrate a working platform*, so functional affordances are visible again —
just calmed via hierarchy rather than removed.

1 **Save/shortlist restored** on featured cards (corner heart, `aria-pressed`,
"Save {name}", toggles state) · 2 **Request restored** on featured cards
(→ "Added ✓", `.rq.added` styling) · 3 **Saved + Inquiry header entry points
restored** with live count badges (`#savedCnt` / `#inqCnt`, hidden at 0, show
as a grid badge when >0) · 4 cards rebuilt as a **non-nested-interactive
`<article>`** (whole-card click via JS `closest('button,a')` guard — valid a11y,
no `<a>`-in-`<a>`) · 5 **availability · languages meta line** per card
(`.mt` → "Available · EN · ES") with availability in bright gold · 6 TALENT
data extended (`av` + `langs` per talent) · 7 `bumpCount()` helper drives both
header badges from card actions · 8 featured section **un-gated from reveal**
(was `rv` — content now visible immediately, no scroll dependency) · 9 Save +
Request **lowered in visual weight** (small, secondary, hover-revealed scrim)
so they read as calm not busy · 10 **Join value copy** sharpened ("Build your
agency-managed profile — availability, portfolio and rates in one place — and
be considered for selected opportunities") · 11 **Search/discovery feedback**:
`#discForm` + `#dCat`/`#dMkt` selects + live `#discNote` (`aria-live`) →
"Showing: {category} · {market}", submit routes to
`directory.html?type=&market=` · 12 card click target widened to whole frame ·
13 keyboard path on cards (`tabindex="0"` + label) · 14 count badges use
accessible live semantics · 15 all v10 a11y/contrast/portrait gains preserved.

### Header redesign + card button fix (2026-05-17)
Editorial header per user direction: **nav row on top, centered logo below,
no border lines** (header `border-bottom:0`; the whole `.h-nav` second-row +
its `border-top` removed). Top-right collapsed to a tight icon cluster —
**EN·ES switcher (kept)** + icon-only **Saved** + **Inquiry** (count badges now
absolute on the glyph) + **one menu icon** (`#burger`, hamburger) that opens the
existing slide-in drawer (full nav + Client/Talent login + Apply + Start an
Inquiry + Explore — nothing lost, just consolidated). Gold "Start an Inquiry"
button removed from the bar (still in hero/drawer/footer). Old `Access ▾`
dropdown (`acct-wrap`/`acctBtn`/`acctMenu`) + its JS deleted (no orphaned
listener — init verified intact: 6 cat + 4 featured cards render). Desktop
tooltips re-enabled (labels gone). Mobile: nav→drawer, lang+icons stay, no
horizontal overflow. Featured-card **Request** button was a UA-default white
`<button>` (no `background` set) — fixed to a calm dark secondary
(`rgba(255,255,255,.02)` + `--line-2`, gold-soft hover) pairing with View
Profile. Verified Chrome (desktop) + Preview DOM @375px; no console errors.
(Chrome screenshot canvas is fixed-width — mobile checked via responsive DOM,
flagged not pixel-captured.)

### Logo lockup fix (2026-05-17)
The faked "IMPRONTA" with a single gold **T** + wrong "International Talent
Network" tagline didn't read as the brand. Replaced with a proper gold-gradient
type lockup: full **IMPRONTA** wordmark in the metallic gold gradient
(`background-clip:text`, #f7e29a→#e0b54c→#bd882d), correct tagline
**"Agencia de Modelos & Imagen"** (header + footer, no longer locale-swapped —
it's brand identity). Tried a hand-coded SVG figure emblem but it read as a
generic shell, not the real flowing-hair/butterfly mark — pulled it (a wrong
icon is worse than none; user offered "fake it with text"). The real icon can
only come from the actual asset: re-wired the `<img class="logo"
src="../assets/logo/impronta-logo.png">` slot (header `onload`→hide text
lockup / `onerror`→keep it; footer `.f-bx` reveal) so dropping the real PNG at
`web/prototypes/impronta-home/assets/logo/impronta-logo.png` auto-replaces the
text lockup with the full logo — no code change. **Limitation flagged:** a
chat-pasted image can't be written to disk by the agent; the file must be
placed in the repo (or a path provided). Verified: gold gradient applies,
no lone-T, correct tagline H+F, img-swap wiring works, no console errors.

### Search hero + header restructure + full taxonomy (2026-05-17)
**Header:** crisp text wordmark logo (no PNG dep) centered; 3-zone `.h-top`
grid — top-left contact cluster (WhatsApp · Instagram · TikTok · phone, the
phone text hides <680px) · centered brand · right account icons; nav centered
tight **under** the logo; no border lines.
**Hero:** added a NEW search-first section (`.hero-find`) ABOVE the original —
eyebrow + "Find the right talent for your brief" + subcopy + big dark search
with a cycling **typewriter ghost** (6 example briefs, blinking gold caret,
pauses on focus/typing, empty-submit → `directory.html?q=<example>`) +
Start-an-Inquiry/Apply + city chips + trust line. The **original hero is
restored** below it (`.hero-classic`, `#discover`) with its headline +
LOOKING FOR/MARKET select form + portrait stage **intact**, but its top city
chips, bottom two CTA buttons and duplicate trust line removed (they live in
the new block now — per user correction "put it above, take those from it",
not replace). CSS scoped: `.hero-find` overrides big/centered; classic keeps
the original `.hero-grid` 2-col / left h1 / sub. JS: stage-portrait render +
`#discForm` feedback IIFE both restored alongside the typewriter IIFE (all
guarded — no orphaned-listener crash; init verified clean).
**Carousel taxonomy:** replaced the hand-picked 12 with the **canonical 19
parent_categories** mirrored from `web/src/lib/taxonomy/parent-labels.ts`
(Models · Hosts & Promo · Performers · Music & DJs · Chefs & Culinary ·
Wellness & Beauty · Photo, Video & Creative · Influencers & Creators · Event
Staff · Hospitality & Property · Travel & Concierge · Transportation · Home &
Technical Services · Security & Protection · Sports & Fitness · Kids & Family
Services · Speakers, Coaches & Experts · Production & Behind-the-Scenes ·
Animals & Specialty Acts). Each given a hand-vetted dark/cinematic Unsplash
cover (11 reused from prior rounds, 8 newly sourced + reviewed). **Models pod
restored to the big featured size** — spans all 3 rail rows (`grid-row:1/span
3`, column 1); the other 18 flow 3-per-column. Verified: 19 cards, 0 broken
images, both heroes correct + ordered, typewriter animating, disc form +
stage live, no console errors, no overflow, mobile = single-row swipe + nav
in drawer.

### Talent-by-discipline carousel (2026-05-17)
Expanded the roster section to **12 disciplines** (added Actors & Voice,
Musicians & Bands, Dancers & Choreography, Stylists & Glam, Athletes & Fitness,
Specialty Acts — each with a hand-vetted dark/cinematic Unsplash cover; dropped
the `lg` hero card for uniform cards). Replaced the static grid with a
**3-row horizontal scroll-snap rail** (`grid-auto-flow:column` +
`grid-template-rows:repeat(3,1fr)`, fixed `grid-auto-columns` clamp — **not
`1fr`**, which silently breaks the horizontal scroll region). Desktop: ‹ ›
arrows page the rail (`scrollBy` + `scroll-behavior:smooth`), edge-aware
**dim** state updated from the click handlers (not the scroll event — headless
Chromium doesn't emit scroll on programmatic scroll, and smooth `scrollBy`
no-ops there; logic verified deterministically with instant scroll: 0→431→clamp,
prev/next dim toggling correct). Mobile (≤900px): collapses to a **single-row
80vw native swipe**, arrows hidden, `scroll-snap-type:x mandatory` — same
"slide" concept, most touch-friendly. Guarded IIFE (returns if wrap missing →
no orphaned-listener crash). Verified: 12 cards, 0 broken images, no console
errors, no body overflow, desktop 3-row + arrow slide and mobile swipe both
confirmed. Smooth-glide animation itself only renders in a real browser
(automation limitation, flagged not pixel-verified).

### Category imagery (2026-05-17)
The 6 "Talent, by discipline" cards were still SVG mannequin placeholders
(the recurring "looks unfinished" blocker). Wired real editorial/lifestyle
photography into `CATS[].image` (Unsplash CDN, free, hot-linked, `IMGQ`
shared params; Models large card 1200×1600, rest 1000×1300) — Models = dark
studio editorial portrait · Hosts & Promoters = confetti/activation · Performers
= stage performer in smoke · Creators = neon-lit campaign portrait · Event
Talent = upscale amber lounge · Production Support = film crew on set. The
existing `.frame .pt` grade (`grayscale .35 / brightness .55` + scrim) unifies
them into the black-gold wall; headings stay legible. No markup/CSS change —
same swap path as `TALENT[].image`; replace with licensed Impronta photography
later. Verified in Chrome + Preview DOM (6 `<img>`, 0 SVG fallback, all
`complete`, no console errors). Featured-talent cards intentionally left as
placeholders (named-person likeness caveat — see imagery-strategy.md).

**Verified (Preview DOM eval, no console errors):** featured cards are
`<article class="ft">` with restored `.sv` Save (`aria-pressed`, "Save
Sofía R."), `.vp` View profile, `.rq` Request, `.mt` "Available · EN · ES";
clicking Save → `aria-pressed=true` + `#savedCnt` "1" display:grid; Request →
"Added ✓" + `#inqCnt` "1"; `#discNote` → "Showing: Models · Riviera Maya";
`nestedInteractiveInvalid:false`; featured no longer reveal-gated; 16 portraits;
0 "curated"; no horizontal overflow; EN/ES toggle works; swappable image + logo
+ LocationMap hook intact. Desktop confirmed in Chrome: header (SAVED ·
INQUIRY · ACCESS · START AN INQUIRY), balanced hero + trust line, featured
cards with corner Save + name + role·location + AVAILABLE·langs + VIEW PROFILE
+ REQUEST reading clean (not cluttered), lighter map section. Mobile verified
at composition/CSS + drawer level; true 390px pixel screenshot not capturable
in this env (flagged honestly, not claimed).
