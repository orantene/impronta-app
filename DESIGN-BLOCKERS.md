# DESIGN-BLOCKERS — Impronta rebuild, core pages (W4a)

Per the design-blocker protocol: components a page wanted that do not exist in
freeform today (or exist in a form that would make the page look cheap). The
pages ship complete without them; each entry is an upgrade the owner can
green-light. Owner inputs (not components) are listed at the end.

## 1. Select / dropdown field on the native `form` node

- **Wanted by:** `/p/contact` ("What are you booking?" as a curated dropdown:
  Campaign / Event / Shoot / Private dinner / Other).
- **Missing today:** `BuilderFormField` in `types.ts` declares
  `"select" | "radio" | "checkbox"` field types, but the registry's
  `formFieldSchema` (registry.ts:912) only accepts
  `text | email | tel | textarea | submit` — a select field is silently
  stripped at validation, so it cannot ship.
- **Shipped instead:** a required free-text field with a strong placeholder
  ("e.g. two bilingual hosts for a product launch in Tulum"). Honest, works,
  slightly less guided.
- **Proposed freeform design:** extend `formFieldSchema` with
  `type: "select"` + `options: string[]` (the types and renderer contracts
  already anticipate it), render as a styled native `<select>` with the noir
  hairline treatment (transparent bg, `--token-color-line` border, gold focus
  ring). Radio/checkbox can follow the same pass.

## 2. Two-field inline "brief bar" (sentence + submit) hero component

- **Wanted by:** `/p/home` hero and `/p/for-clients` hero — a single-line
  "Say the brief in a sentence → Send" input, the strongest conversion pattern
  for a casting funnel (one field, zero friction).
- **Missing today:** the native `form` node renders stacked labeled fields; a
  single-row input+button composition with hero-scale styling is not
  expressible without per-field layout control, and the GET-form directory
  search variant only covers search, not lead capture.
- **Shipped instead:** hero CTAs route to `/contact`, where the full form
  lives. No compromise visible on the hero itself.
- **Proposed freeform design:** a `form` prop `layout: "inline"` that renders
  fields in one row (input grows, submit sits flush right, collapses to stack
  on mobile), plus per-field `placeholder`-only labels. Would also upgrade the
  flagship home's search row.

## 3. Marquee ticker styling is CSS-injection, not first-class

- **Wanted by:** `/p/home` discipline marquee.
- **Missing today:** the `marquee` section's noir look (italic serif items,
  gold diamond separators, hairline borders) is only achievable via
  `presentation.customCss` string surgery — copied from the flagship home.
  It works, but it is fragile styling that no inspector can edit.
- **Shipped instead:** the same `customCss` block the flagship uses (proven in
  production), so the look is correct today.
- **Proposed freeform design:** add a `theme: "noir"` variant (or tokenized
  item/separator color + font props) to the marquee schema so the treatment
  survives schema migrations and is editable.

## 4. No freeform "logo cloud" worth shipping for a dark editorial page

- **Wanted by:** `/p/for-clients` — a "brands that booked us" strip is the
  strongest proof block for a client funnel.
- **Missing today:** the `logo_cloud` section embed and the `agency-logo`
  template both assume uploaded logo assets on a light surface; there are no
  client-logo assets in the tenant library, and grey logo boxes on noir would
  look exactly like the 2018 site this rebuild replaces.
- **Shipped instead:** an editorial quote trio (role + market attribution) and
  the stats band carry the proof load. Quotes are marked OWNER-CONFIRM.
- **Proposed freeform design:** once the owner supplies real client logos, a
  monochrome (white/40% opacity, hover to full) logo rail on the noir ground —
  either as curated `image` rows or a `logo_cloud` "noir" variant.

## Owner inputs needed (not component blockers)

- **Contact email:** no verified public inbox exists anywhere in the repo.
  `CONTACT_EMAIL` in `web/scripts/impronta-rebuild/shared.ts` is a placeholder
  (`hello@improntamodels.com`) used by the contact page's `mailto:` button —
  **must be confirmed or corrected before seeding**. No phone number was
  invented; a tel:/WhatsApp channel can be added the moment the owner supplies
  one.
- **Form routing:** the contact form posts to the internal endpoint and needs
  its `sectionId` set to a real `cms_sections` row id at seed time (W5).
- **Quotes and stats:** testimonial quotes and the 27+/5/<24h/100% stat set are
  drafted copy marked OWNER-CONFIRM in the source; swap in real client quotes
  and confirmed figures before launch.
- **JSON-LD `url`:** home's Organization schema uses
  `https://impronta.tulala.digital`; update when a custom domain goes live.
