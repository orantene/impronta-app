# Admin → Frontend Verification Guide

**Goal**: prove that an agency admin can reproduce the Muse Bridal Collective
look by operating only the dashboard — no developer touching code.

This guide is written for a hands-on 4-browser workflow. Open 4 Chrome
windows (or profiles) so you can watch the admin action on one and the
result on another without signing in/out.

---

## Setup — 4 browser contexts

Keep these open side by side:

| Window | URL | Signed in as |
| --- | --- | --- |
| **A · Agency admin** | `http://app.lvh.me:3102/login` → `/admin/site-settings/design` | `owner@midnightmuse.demo` / `Midnight-Muse-Owner-2026!` |
| **B · Super admin** (optional — used when A can't reach a tenant) | `http://app.lvh.me:3102/login` → `/admin` | `qa-admin@impronta.test` / `Impronta-QA-Admin-2026!` |
| **C · Storefront (public)** | `http://midnight.lvh.me:3106/` | (no login) |
| **D · Talent** (optional — for viewing inquiries) | `http://app.lvh.me:3102/login` → `/talent` | `tulum-talent-sofia@impronta.test` / `Impronta-Tulum-Talent-2026!` |

Servers needed running (check `preview_list` or `npm run dev` on each):
- port **3000** — Next.js dev server
- port **3102** — `app.local` proxy
- port **3106** — `midnight.local` proxy

All three are registered in `.claude/launch.json`.

---

## Flow 1 · Apply the Editorial Bridal preset (window A)

1. In window A, go to **Site Settings → Design tokens**.
2. Top card is **Theme preset**. You'll see two swatch cards: **Classic**
   and **Editorial Bridal**.
3. Click **Apply preset** on the Editorial Bridal card. Confirm the
   success banner ("applied preset 'editorial-bridal' → draft (31 tokens)").
4. Scroll down to the **Design tokens** card. Tokens are now grouped
   under:
   - Brand colors / Editorial colors
   - Typography (heading-preset = `editorial-serif`, etc.)
   - Shape (`radius.scale-preset = pillowy`, `shadow.preset = soft`)
   - Motion (`motion.preset = refined`)
   - Density (`density.section-padding = editorial`, …)
   - Icons (`icon.family = editorial-line`)
   - Site shell (`shell.header-variant = editorial-sticky`, …)
   - **Template families** (`template.directory-card-family = editorial-bridal`, `template.profile-layout-family = editorial-bridal`)
   - Page background (`background.mode = editorial-ivory`)
5. Click **Publish design**. Wait for "Design published."
6. In window C, hard-refresh `http://midnight.lvh.me:3106/` — the storefront
   should have repainted to ivory canvas + serif headings + pillowy radii.

**What this proves**: one click in the admin flipped 31 design tokens. The
public storefront reads them on the next request. No developer touched code.

---

## Flow 2 · Compose a Muse-style homepage (window A)

1. Window A → **Site Settings → Sections** (the Section library).
2. For each of these, click **New section** and fill in content:
   - `trust_strip` (variant: `icon-row`, 4 items — "Destination-ready",
     "One curated team", "Quiet concierge", "Editorial standard")
   - `category_grid` (variant: `portrait-masonry`, items for Makeup, Hair,
     Photography, Planning, Floral — each with an image URL if you have one)
   - `destinations_mosaic` (variant: `portrait-mosaic`, 5 items — Tulum,
     Los Cabos, Riviera Maya, Mexico City, Europe — first is the oversized hero)
   - `testimonials_trio` (variant: `trio-card`, defaultAccent: `auto`,
     3 quote cards)
   - `cta_banner` (variant: `centered-overlay`, headline "Tell us about
     your celebration.", primary CTA → `/contact`)
3. Save each as a reusable section instance.
4. Go to **Site Settings → Homepage** (composer).
5. For each slot, add the matching section instance:
   - `hero` → existing hero
   - `trust_band` → the trust_strip you just made
   - `services` → category_grid
   - `featured` → (skip or use existing featured_talent later)
   - `destinations` → destinations_mosaic
   - `testimonials` → testimonials_trio
   - `final_cta` → cta_banner
6. Save draft → Publish homepage.
7. Window C → refresh `http://midnight.lvh.me:3106/` — you should now see
   the composed stack replacing the legacy browse-by-type / featured /
   best-for / location / how-it-works / cta stack.

**What this proves**: the CMS composer can now assemble a Muse-style
homepage from reusable sections. No hardcoded Midnight file.

---

## Flow 3 · Switch directory card family (window A)

1. Window A → **Site Settings → Design tokens**.
2. Under **Template families** → **Directory card family**.
3. Change from `editorial-bridal` back to `classic`. Save draft. Publish.
4. Window C → `http://midnight.lvh.me:3106/directory` — cards should
   repaint to the gold-on-black classic presentation.
5. Change back to `editorial-bridal`. Publish. Refresh window C — ivory
   cards with editorial body + champagne chips.

**What this proves**: the directory card family is a first-class theme
token. Switching takes one click.

---

## Flow 4 · Verify a talent inquiry still flows (windows A + D)

1. Window C → pick a talent, hit **Inquire**. Fill a mock inquiry.
2. Window A → **Admin → Inquiries** — the inquiry should appear tenant-scoped.
3. Window D → **Talent → My inquiries** — the talent sees the invite.

**What this proves**: shifting visual tokens doesn't break the inquiry
engine — the business backbone is orthogonal to the visual system.

---

## What to expect visually after Flow 1

| Surface | Before preset | After preset |
| --- | --- | --- |
| Home header | Dark purple, gold lettering | Ivory sticky, centered serif Muse lockup |
| Home hero | Confetti backdrop, dark canvas | Ivory canvas, soft radial, Fraunces serif |
| Search button | Pink | Espresso pill |
| Chips | Dark gold-rim pills | Ivory/champagne pillows |
| Directory cards | Dark gradient, gold on black | Ivory body, champagne chips, editorial serif name |
| Footer | Standard | Espresso column (when footer variant lands Component-level) |

---

## Gotchas (known)

- **Cache**: after a publish, Next's `unstable_cache` holds the old
  branding row for a few seconds. If window C doesn't repaint, wait 2–3s
  and hard-refresh. Publish busts the `branding` + `storefront` tags so
  staleness is bounded.
- **Preview browser cookies**: if you test in a fresh incognito window,
  make sure you're not caching a previous session — sign out first.
- **The workspace switcher popover**: if you only have one agency
  membership, the switcher shows a read-only label (not a dropdown).
  Super-admin accounts always see every tenant as a synthetic membership.
- **Fraunces serif**: loaded via `next/font/google` on the root layout.
  If you see plain Georgia instead, give the first page-load 1–2s to
  fetch the variable font file.

---

## Contact points for follow-up

- **Sprint 1 report**: `src/lib/site-admin/M7_SITE_BUILDER.md`
- **Sprint 2 report**: `src/lib/site-admin/M7_1_SPRINT_REPORT.md`
- **Original design spec**: `src/app/prototypes/muse-bridal/SYSTEMIZATION.md`
- **Token registry (add a new token here)**: `src/lib/site-admin/tokens/registry.ts`
- **Theme preset registry (add a new preset here)**: `src/lib/site-admin/presets/theme-presets.ts`
- **Section registry (add a new section here)**: `src/lib/site-admin/sections/registry.ts`
- **Storefront CSS (map token → paint)**: `src/app/token-presets.css`
