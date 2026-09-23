# Talent free website: design brief for the mockup agent (2026-09-23)

Paste this to the design agent. Engineering plan: [`talent-website-execution-plan-2026-09-23.md`](talent-website-execution-plan-2026-09-23.md).

## Context

Engineering is building the talent free-website flow. Several decisions changed since the current mockups. Please update them so they can serve as the visual acceptance reference for QA: agents compare implementation screenshots against your frames.

## Decisions that change the mockups (the gaps to fix)

1. **Framing is "Unlock your free website"**, not "Upgrade to a custom page". Paid is introduced later, inside the builder.
2. **Theme choice is an extensible gallery**, not three fixed starters.
   - Step "Design": grid with category chips, a "New" badge, and live preview cards rendered with the talent's own photo, name and services.
   - Step "Look": color swatches and font pairings that restyle the same preview instantly, plus "Let Tulala pick".
   - Design for 5 cards today and 40+ later: scroll, filtering, and an empty filter state.
3. **One paid tier named Web Office** ($15/mo, 14-day free trial). "Pro", "Portfolio" and "Max" disappear from every screen. The compare view has two columns: Free and Web Office.
4. **The prospective URL** (`sofia-mendez.tulala.digital`) is shown under the header badge in every stage.
5. **The editor is the real page builder** with lock chips, not a simplified editor.
6. **Lapsed Web Office sites stay live.** Design the paused states.

## What is free and what is Web Office

| Free website | Web Office ($15/mo, 14-day trial) |
|---|---|
| Site at `name.tulala.digital`, built from the profile | Everything in Free |
| Pick and switch design (switching replaces edits, with a confirm) | Add pages |
| Colors and fonts anytime | Add sections and blocks |
| Edit text, swap images, logo | Custom domain (`yourname.com`) |
| Show, hide and reorder sections | SEO controls, analytics |
| Small "Made with Tulala" footer badge | Remove the badge, custom CSS and motion |
| | Video and social embeds, press band, media kit, priority discovery |
| | Branded invoices, lowest booking fee, design help from the Tulala team |

## Screens and states to deliver

Desktop 1440 and mobile 390. Check English and Spanish copy length. No em dashes in copy.

- **Header badge**
  - locked: "Unlock your free website: 4 of 8" with progress
  - unlocked: accent color, gentle pulse
  - live: shows the URL
  - Web Office: shows trial days left
  - mobile: placement inside the account menu
- **Locked popover**
  - 8-item checklist with done and missing states; each item links to the right profile section. The items are name, photos (3+), location, category, bio, phone, and at least one published service.
  - "Write my bio with AI" entry
  - Guided setup link
  - One line on why: "Your website builds itself from your profile."
- **Create dialog**
  - Address step: checking, available, taken and invalid states
  - Design gallery step
  - Look step, with "Let Tulala pick"
  - Creating progress
  - Success: URL, View, Edit, Copy
  - Error with retry
- **Builder for Free**
  - Lock chips on Add section, Add page, SEO tab, Custom domain, Custom CSS and motion
  - Right rail: "Look" panel, "Design" panel (confirm "replaces your edits"), Web Office card
- **Web Office upgrade dialog**
  - Benefits list from the table above
  - $15/mo, "Start 14-day free trial"
- **Compare drawer**: two columns, Free and Web Office.
- **Public site footer**: "Made with Tulala" badge (Free).
- **Lapse states**
  - Manager rows: "Hidden until Web Office"
  - Domain: "Paused"
  - Badge: "Restore Web Office"
  - Notification copy
- **Account menu, "Where I appear"**
  - Avatar with headshot
  - My website
  - My Tulala profile
  - One row per agency and hub, with a visibility dot (Live / Agency is not showing you / Pending), plus View and Manage

## Output

- PNG frames named `<screen>--<state>--<viewport>.png` in `web/docs/talent-website-mockups/`, or a shared link.
- A short list of any copy changes.
- Reuse the dashboard design tokens (`COLORS`, `FONTS` in `web/src/components/admin/shell/internal/state`) so the frames match the implementation.

## Theme handoff: from an approved mockup to a live theme in the gallery

Every Web Office design you mock up and the founder approves becomes a **gallery theme**: one **Design** (the layout) plus one or more **Looks** (color and font variants). Engineering builds it from your handoff, publishes it to the gallery, and sends back a screenshot of the live version for you to compare against your frames.

### What to hand over for each approved design

1. **Frames**: the full home page top to bottom, desktop 1440 and mobile 390, filled with realistic talent content (not lorem).
2. **Section list, in order.** For each section give its purpose and the profile data it shows. Use these names where they fit: hero, about, services, gallery, reviews, press, contact/inquiry, header, footer. If a section is new (for example "sample menus" for a chef), mark it **NEW** and say which profile field feeds it.
3. **Tokens for the main Look:**
   - Colors as hex for each role: background, surface, ink (main text), muted text, primary, accent, line/border.
   - Heading and body fonts (Google Fonts family names and weights).
   - Corner radius (sharp, soft or rounded) and density (compact, comfortable or airy).
4. **Alternative Looks** (optional, 2 to 4): the same design in other palettes or font pairings. Each becomes a swatch in the Look step.
5. **Header and footer** variants, and the image treatment (crop ratios, full-bleed or framed).
6. **Who it is for**: the talent categories it targets, for example `private-chefs`, `models`, `photographers`. The gallery shows these themes first to matching talents.
7. **Name**: a design name and a one-line description for the gallery card.

### How it gets to the engineering session

- Put frames in `web/docs/talent-website-mockups/<design-slug>/` with the handoff notes in `HANDOFF.md` next to them, or share a link.
- The founder then tells the engineering session "design `<slug>` approved". If you are a Claude session running on the same machine, you can also message the engineering session directly.

### Rules that keep a theme working with the free page builder

- Build pages from sections. Talents can edit text and images, hide or reorder sections, and change colors and fonts. On the free website they cannot add new sections, so every design must look complete with only its own sections.
- Every color and font must come from the Look tokens: no one-off colors inside a section. That is what lets one design take any Look.
- Every section must still look right when its data is short or missing (one service instead of six, no reviews yet, three photos instead of twelve).

## Next vertical: private chef

After the first Web Office design is live, the next focus is **private chefs**: the `private-chefs` category, covering villa, yacht and family chefs. Mock up a chef-first design using the chef profile data that already exists: cuisine, group size, dietary options, event types and travel area. Sections to consider:
- signature dishes or sample menus
- experiences as services (dinner party, weekly meal prep, yacht charter)
- dietary chips
- an area served map or list
- an inquiry with date and guest count
