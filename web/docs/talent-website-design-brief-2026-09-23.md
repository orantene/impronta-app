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
