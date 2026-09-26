# Maison — design handoff for the talent theme gallery

**Slug:** `maison` · **Status:** built and rendering; **not yet approved by the owner**
(he has been iterating on the visual all day — treat this as ready-for-review, not frozen).

Live: `cd web && TULALA_ALLOW_DEV_SURFACES=1 npm run dev -- --port 3200`
→ `http://localhost:3200/dev/jor-beauty` (`?lang=en` · `?state=empty` · `?state=edge` · `?state=request`)

Code: `web/src/app/t/[profileCode]/_maison/` · Branch `feat/maison-jorg-beauty`

---

## 1. Frames

| File | What |
|---|---|
| `frames/home-desktop-1440.jpg` | Full home page, 1440, real content (Jorg Beauty) |
| `frames/home-mobile-390.jpg` | Full home page, 390 |
| `frames/home-desktop-1440-en.jpg` | The same page in English |
| `frames/looks-hero.jpg` | The hero under all four Looks |
| `frames/looks-menu.jpg` | The service menu under all four Looks |

No lorem anywhere: 22 real services with real MXN prices, her real logo and
portrait, her approved biography.

## 2. Sections, in render order

| # | Section | Fed by | Notes |
|---|---|---|---|
| 1 | Sticky header | `display_name`, brand mark, section anchors | Wordmark falls back to type when no logo. Carries the ES/EN switch as a slot. |
| 2 | Hero | `heroTitle`/`heroLead` (editorial block), `bannerUrl` → first gallery item, `resolvedSkills` | **NEW vs the Max kit:** a dominant portrait with a smaller square inset overlapping it, not a 50/50 split. Facts under the CTAs derive from `talent_profile_taxonomy.years_experience` + the `primary_role` term. |
| 3 | Marquee | offering categories | **NEW.** A moving band of her category names. Decorative, `aria-hidden`, pauses on hover, removed under reduced-motion. |
| 4 | The artist | `short_bio` / `bio_i18n`, `profileImageUrl` | **Placed second on purpose.** On a one-person practice the person is the product. Two paragraphs with the rest behind a disclosure. |
| 5 | Services | `talent_offerings` + `_variants` + `_addons`, `category` | The flagship. Category tabs, full-width rows, one action each, selected state in blush + check. Counted meta block (22 services · 4 categories). |
| 6 | Results | `media_assets` | 8–12 shots, controlled ratios, one wide, per-shot service label, lightbox with focus trap. |
| 7 | Your visit | `talent_service_areas`, `talent_booking_hours`, `talent_languages` | **NEW:** an AREA map (neighbourhood halo, no pin) beside the facts. Optional — absent map renders facts alone. |
| 8 | Before your appointment | **no model yet — OPEN DECISION** | FAQ. One narrow centred column. Note the shape input: one answer is an ordered sequence ("How do I book?"), not a paragraph. See the open question below. |
| 9 | Reviews | `loadTalentReviews` + credibility floor | Hidden entirely until real ones exist. |
| 10 | Closing | `talent_profiles.phone`, `talent_integration_items` (instagram/tiktok, `public_profile_enabled`) | Book, or ask, or reach her directly — the three ways to make contact, together. Satisfies the gallery's "contact present" rule. |
| 11 | Footer | nav + location + languages | Deliberately small. |

Every section hides itself when its data is absent — see `?state=empty`.

## 3. Colour and type

All seven are token references. The hex below is what the template **declares**
in `_maison/maison-tokens.ts` as `MAISON_DEFAULT_TOKENS`, applied on `.mn-root`
underneath the tenant's `themeVars`.

> The same hexes also appear as CSS fallbacks in `maison-styles.tsx`, but those
> are **unreachable on any shell-rendered page** and must not be treated as the
> source of truth: `src/app/layout.tsx` sets a full default token set inline on
> `<html>` (primary `#111111`, accent `#0ea5e9`, ink `#111111`, …), and a CSS
> fallback only applies when the property is set nowhere up the tree. Until
> 2026-09-23 the template had no token map of its own, so it rendered near-black
> with a sky-blue accent. Change a colour in `maison-tokens.ts`, not in the
> stylesheet's fallback.

| Role | Token | Hex |
|---|---|---|
| Background | `color.background` | `#FFFFFF` |
| Surface / tinted band | `color.surface-raised` | `#FFF5F8` |
| Text | `color.ink` | `#241F26` |
| Muted text | `color.muted` | `#665F6B` |
| Primary | `color.primary` | `#A82458` |
| Accent | `color.accent` | `#F4D7E2` |
| Border | `color.line` | `#EDE8EB` |

Heading: **Fraunces** (`typography.heading-font-family`) · Body: **Inter** (`typography.body-font-family`).

Derived shades (`--mn-rose-hover`, `--mn-blush-deep`, `--mn-tint-deep`,
`--mn-line-strong`) are `color-mix()` off those tokens, never second literals.

Two colours are deliberately **not** themeable, because a Look must not repaint
a brand: `--mn-brand-heart` (the pink heart inside her real logo) and
`--mn-brand-whatsapp`. **These must never appear in a Look's token map** — an
audit that flags them as "hex literals to fix" would be wrong.

Contrast, measured: ink/white 16.17, ink/tint 15.14, muted/white 6.15,
muted/tint 5.76, primary/white 6.87, white-on-primary 6.87. All pass AA.

## 4. Alternate palettes — the acceptance test

**Updated 2026-09-26 (Maison website pack):** the approved Product Spec §11.3 and
`maison-seed-data.json` supersede the four Looks below. **Ship these five**
(scoped to the Maison Design; not the old global Looks):

| Key | Name EN / ES | page | section | rule | text | accent | on_accent | text/page | button |
|---|---|---|---|---|---|---|---|---|---|
| **pink** (default) | Pink & Lipstick / Rosa y labial | `#FFFFFF` | `#FFF5F8` | `#EDE8EB` | `#241F26` | `#A82458` | `#FFFFFF` | 16.2 | 6.9 |
| **pearl** | Pearl & Ink / Perla y tinta | `#FFFFFF` | `#F6F4F0` | `#E6E2DC` | `#1F1E1C` | `#1F1E1C` | `#FFFFFF` | 16.7 | 16.7 |
| **lilac** | Lilac & Plum / Lila y ciruela | `#FFFFFF` | `#F6F0F8` | `#E8DFEC` | `#261E2B` | `#6A2C70` | `#FFFFFF` | 16.1 | 9.5 |
| **sand** | Sand & Espresso / Arena y espresso | `#FFFFFF` | `#F7F1E8` | `#E9DFD0` | `#2A211B` | `#4B3222` | `#FFFFFF` | 15.8 | 11.8 |
| **peach** | Peach & Terracotta / Durazno y terracota | `#FFFFFF` | `#FFF3EC` | `#F1E0D5` | `#2B201C` | `#A4482A` | `#FFFFFF` | 15.8 | 5.9 |

Pink is read from the live reference site (book-jorgelina). Heading font for all
five: **Fraunces**; body: **Inter**. Source of truth: seed JSON — do not retype
from screenshots.

<details><summary>Historical four Looks (superseded — do not ship)</summary>

Same layout, same markup, tokens only. `frames/looks-hero.jpg`, `frames/looks-menu.jpg`.

| Look | bg | ink | muted | primary | accent | surface | line | heading |
|---|---|---|---|---|---|---|---|---|
| **blush-rose** (default) | `#FFFFFF` | `#241F26` | `#665F6B` | `#A82458` | `#F4D7E2` | `#FFF5F8` | `#EDE8EB` | Fraunces |
| **noir-champagne** | `#FFFFFF` | `#17151A` | `#6E6873` | `#1F1B22` | `#E7DAC4` | `#F7F4EF` | `#E8E3DB` | Playfair Display |
| **sage-linen** | `#FFFFFF` | `#1F2621` | `#606B63` | `#2F6B4F` | `#CFE0D4` | `#F2F7F3` | `#E4EBE6` | Fraunces |
| **cacao-cream** | `#FFFDFB` | `#2A201A` | `#7A6A5F` | `#8A4A2B` | `#EFD9C4` | `#FBF2E9` | `#EDE2D6` | Cinzel |

</details>

## 4b. Address form — current, not target

Every frame and every string here uses the **path** form,
`tulala.digital/t/<code>`.

**Updated 2026-09-23:** Phase 2 subdomain routing is now merged and switched on
in production, and `*.tulala.digital` is attached to the Vercel project with a
valid certificate. So `<name>.tulala.digital` is reachable rather than
hypothetical — but **no talent site is published on one yet**, so the frames
stay on the path form: a frame showing a subdomain would be showing an address
that resolves to nothing. When a talent publishes, the subdomain becomes the
honest address and these strings should follow it. Treat the path form as
current-state, not as the target.

## 5. Target categories

Primary: **beauty services** — lash artists, nail artists, brow artists,
estheticians, waxing. The taxonomy already carries "Lash Artist", "Lashista",
"Nail Artist", "Beauty Services".

Also fits any solo practitioner who sells a **menu with options** rather than a
day rate: barbers and hair stylists, massage and physio, tattoo and piercing,
private chefs (per-menu with dietary add-ons maps cleanly onto variants +
add-ons), pet grooming, driving and music instructors.

Poor fit: roster talent priced per day or per project, where Classic or Noir
already does the job.

## 6. Gallery card

**Maison** — *For an independent professional who sells a menu, not a day rate.*

---

## What this design needs that the platform does not have yet

1. **Per-profile FAQ — an open decision, not a proposal.** Section 8 has no
   model behind it. Two different answers with two different migrations:
   a new **profile field**, or free text the builder holds on the **site**.
   The talent-website session is raising it with the plan and I am
   deliberately not proposing a shape.

   What the design contributes to that decision, as input only: one answer
   ("How do I book?") renders as an ordered list of four titled steps rather
   than a paragraph. If FAQ lands as site free text, that is just rich text
   and the template renders whatever is authored. If it lands as a profile
   field, the field has to carry that structure or the answer flattens.
   `MaisonContent.faq` is the template's presentation contract, not a schema
   proposal — the template will read whatever shape is chosen.
2. **Media tags.** The gallery shows a service label per shot; today that map
   is passed in by hand. Smallest fix: `media_assets.tags text[]`.
3. **Location privacy.** "Area public, exact address on confirmation" is the
   normal shape for a home studio and is modelled nowhere. The page promises it
   in copy; nothing enforces or delivers it.
4. **Offering categories as records.** `talent_offerings.category` is free
   text, so a category carries no order, no note and no specialty flag. Maison
   needs all three.
5. **Reusable add-on groups.** Her three nail designs are duplicated across
   four services. Edit one price, edit it four times.
6. **Featured ordering.** `is_featured` exists, `featured_position` does not.

## What the talent still owes before publish

Appointment durations (currently marked fixtures, shown with "duración
estimada"), WhatsApp number, email, Instagram and TikTok handles (contact links
are **inert** until confirmed), approval of the English copy, payment methods,
deposit policy, cancellation policy. None of these are invented anywhere on the
page; each is hidden or visibly marked.

## Booking honesty

`surfaceBooking` comes from `resolveTalentBooking`. Below `"instant"` — a free
tier (`appointments-plan-policy` caps at `request`) or a non-agency host, which
is exactly Jorgelina's situation — the CTA, the dispatched intent and the
sheet's final button all step down together, and the services lead gains
"Las citas quedan sujetas a confirmación." The page never promises a
confirmation the engine cannot deliver. See `?state=request`.
