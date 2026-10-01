# Mockup parity check

A headless tool that compares a talent's published site (any design that has a parity map) against its approved
mockup, section by section, so you can check your own work before you report it.

Code: `web/scripts/qa/mockup-parity/`. The per-design map is `web/design-references/<slug>/parity-map.json` (see "Designs and parity maps").

## Run it before you report

```
cd web
npm run qa:mockup-parity -- --talents alba --widths 390 --states static
npm run qa:mockup-parity -- --all-maison-v2 --widths 390,1440
npm run qa:mockup-parity -- --design folio --talents mateo --widths 390,1440 --states static
```

| Flag | Meaning |
|---|---|
| `--design maison-v2\|folio` | Which design map and mockup to use. Default `maison-v2`. |
| `--talents alba,valeria,TAL-93020,<uuid>` | Name, profile code or id. The design's reference token (`alba`, `mateo`) resolves to its reference demo. Default: the design's reference demo. |
| `--all-<design>` (`--all-maison-v2`, `--all-folio`) | Every talent whose `theme_design_slug` is that design and whose site is published (demos and QA users included). `--include-drafts` adds unpublished ones, which usually cannot render. |
| `--widths 390,360,1440` | Default `390`. |
| `--locale es\|en` | Default `es`. |
| `--states static,chat,dock,booking` | Default all four. `static` is the section checks. |
| `--base-url http://localhost:3001` | Product server. Local hosts only (the tool refuses anything else). |
| `--mockup-url http://localhost:3098/<slug>/` | The static mockup. Default `http://localhost:3098/<slug>/` (a static server over `web/design-references`). |
| `--public` | Skip sign-in and render through the public host (see below). |
| `--storage-state file.json` | Use a saved Playwright session instead of logging in. |
| `--allow-server-actions` | Lets POSTs through. Only on an isolated target, never on demos: opening the chat can create a guest inquiry. |

## Which server

Use the shared server on `:3001` and the mockup on `:3098`. Never start your own dev
server and never run `npm run build` for this. The tool reads whatever `:3001` serves, so
your branch is only checked once the integrator has built it there. Until then, point the
tool at any server you were given with `--base-url`.

## How a site is reached

1. Preview route, signed in: `/template-preview/live?kind=live-site&talent=<id>&locale=es`.
   Needs the talent owner, or a platform admin for `is_demo` talents. Credentials come from
   `web/.env.local` at runtime and are never printed: `QA_PLATFORM_ADMIN_PASSWORD`
   (`qa-platform-admin@impronta.test`, override with `QA_PLATFORM_ADMIN_EMAIL`),
   `QA_TALENT_EMAIL`/`QA_TALENT_PASSWORD`, and optionally `QA_FRESH_*`, `QA_FREE_*`,
   `QA_JOR_CLONE_*` (`..._EMAIL` plus `..._PASSWORD` each).
2. Fallback, no sign-in: a published talent's public host `<site_slug>.tulala.digital` is
   mapped to `127.0.0.1` inside the headless browser (`--apex` changes the apex) and the
   request goes to the `:3001` port. Same renderer, no preview chrome. Rows say so in a
   warning. Nothing outside this machine is contacted.

A talent nobody can open is reported as BLOCKED, not PASS.

## Read-only guarantee

The browser drops every request that is not GET or HEAD, the click helper refuses anything
named send, pay, publish, confirm or submit, and the lookup uses the service role for SELECTs
only. A chat open that needs a server action therefore reports BLOCKED, with the reason,
instead of writing.

## Reading the report

Output goes to `web/qa-evidence/mockup-parity/<timestamp>/`:
`report.html` (self-contained, filter buttons at the top), `summary.json`, `img/`.

One row per talent, width and section (header, hero, work, menu, reviews, about, faq,
location, footer, socket, plus a `page` row and the chat, dock and booking states). Each row
shows PASS, FAIL or BLOCKED, the reasons, and the product image beside the mockup image.

Checks: section exists and is in mockup order; expected sub-elements; overlapping controls or
text; horizontal overflow; clipped text; header on one row at phone widths; one fixed bottom
bar and one chat launcher; fixed layers overlapping; English strings, voseo, unaccented city
names and "Antes / Después" labels on `es`; in-page `#anchors` with a target; and, for Alba
only, computed font and colour against the mockup. Optional sections (work, reviews, faq) may be
absent on other talents; they are required on Alba.

`summary.json` has `mockupSelfCheck`: the same rules run on the mockup itself. A failure
there means the rule is wrong, not the product. Exit code is 1 on any FAIL or BLOCKED.

Alba (TAL-93020) is the exact-content reference. For the other talents only structure and
layout are meaningful.

## Designs and parity maps

Everything specific to a design lives in `web/design-references/<slug>/parity-map.json`.
The tool code is design-agnostic. Today: `maison-v2` (reference demo Alba, TAL-93020) and
`folio` (reference demo Mateo Ferrer, TAL-93011; no mockup states are defined, so only
`static` runs and the other states are reported as skipped).

Top level keys:

| Key | Meaning |
|---|---|
| `slug`, `label` | Design slug (also the `talent_sites.theme_design_slug` that `--all-<slug>` filters on) and a display name. |
| `reference` | `{ code, token }`: profile code of the reference demo and the short name that resolves to it. Style checks (font family, size, weight, colour) and required-optional sections apply to this talent only. |
| `defaultTalents` | Talents checked when `--talents` is omitted. |
| `mockup` | How to drive the mockup page: `path` (under the static server), `rootSel` (the site frame), `readySel`, `deviceSel` (with `{w}` for the width), `startSel` (the first journey step), `startFirst` (click the step before the device, for a step that resets the device), `scrollerSel`. Maison uses `#devseg` and `#steps`. Folio uses the review kit's `#rv-dev` and `#rv-steps`; its step 0 resets the device to 390, hence `startFirst`. |
| `stateEvals` | Optional. JS strings run inside the mockup to put it in the `chat`, `dock` and `booking` states. |
| `states` | Optional. Product states the design supports (default all three). `[]` means static only. |
| `order` | Section keys in required document order. |
| `productExtras` | Selectors that exist in the product but not in the mockup. Reported as a warning on the page row. |
| `sections` | See below. |

Each entry in `sections`, in mockup page order:

| Key | Meaning |
|---|---|
| `key`, `label` | Id and row label. |
| `mockup` | Selectors tried in order on the mockup (a class, an `#id`, or the element carrying the unit's `data-w`). Required. |
| `product` | Resolvers tried in order on the product: a CSS selector (anchor id, `data-slot-key`, a widget class) or `fn:<name>`, a structural resolver in `analyze.mjs` (`header`, `footer`, `faq`, `socket`). An empty list means the product has no such section. |
| `missing` | Optional string. The row FAILs with "not in the product: <string>" when no resolver matches. Use it for a section the product lacks. |
| `optional` | Absent is a warning, not a FAIL, on talents other than the reference. |
| `expects` | Sub-elements, checked on both sides (the mockup self-check proves a rule is sound): `sel` (`sel`, `min`, optional `alt`), `text` (`re` is a key of `LOCALE_TEXT` or a raw pattern), `countText`, `eyebrow`, `ctaPair`. `minWidth` limits a rule to wide viewports. |
| `style` | Reference demo only. List of `{ name, sel }` (`":self"` is the section element) or `{ name, pick: "eyebrow" \| "solidButton" }`. Font family, size, weight and colour are compared with the mockup's. |
| `layerHint` | Shown as a "likely layer" note on a failing row (token, payload, kit, platform, new capability). |

### How to add a design

1. Put the pinned mockup in `web/design-references/<slug>/` (its README lists the units as
   `data-w="<type> · <variant>"` plus selectors) and make sure the static server serves it
   at `http://localhost:3098/<slug>/`.
2. Create `parity-map.json` with one section per unit, in page order. The mockup selector
   is the unit's wrapper (the element with `data-w`, or its class or `#id`). Find the
   product resolver by loading the reference demo and reading the DOM (anchors such as
   `#hero`, `#gallery`, `#services`, widget classes, `data-slot-key`). If the product has no
   equivalent, leave `product` empty and set `missing` and `layerHint: "new capability"`.
3. Add `expects` for what makes the unit recognisable (heading, photos, rows, prices,
   actions) and `style` for the reference demo's headline, body and button.
4. Read the mockup's device and step controls (a review kit has a device switch and a
   journey list), fill `mockup`, and run the tool. `summary.json` `mockupSelfCheck` must be
   empty. Any entry means a rule or selector is wrong, not the product.
5. Run `--design <slug> --talents <reference> --widths 390,1440 --states static` and read
   the report.
