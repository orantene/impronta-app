# Mockup parity check

A headless tool that compares a talent's published Maison v2 site against the approved
mockup, section by section, so you can check your own work before you report it.

Code: `web/scripts/qa/mockup-parity/` (`section-map.mjs` is the mockup-to-product map).

## Run it before you report

```
cd web
npm run qa:mockup-parity -- --talents alba --widths 390 --states static
npm run qa:mockup-parity -- --all-maison-v2 --widths 390,1440
```

| Flag | Meaning |
|---|---|
| `--talents alba,valeria,TAL-93020,<uuid>` | Name, profile code or id. Default `alba`. |
| `--all-maison-v2` | Every talent whose `theme_design_slug` is `maison-v2` and whose site is published (demos and QA users included). `--include-drafts` adds unpublished ones, which usually cannot render. |
| `--widths 390,360,1440` | Default `390`. |
| `--locale es\|en` | Default `es`. |
| `--states static,chat,dock,booking` | Default all four. `static` is the section checks. |
| `--base-url http://localhost:3001` | Product server. Local hosts only (the tool refuses anything else). |
| `--mockup-url http://localhost:3099/` | The static mockup. |
| `--public` | Skip sign-in and render through the public host (see below). |
| `--storage-state file.json` | Use a saved Playwright session instead of logging in. |
| `--allow-server-actions` | Lets POSTs through. Only on an isolated target, never on demos: opening the chat can create a guest inquiry. |

## Which server

Use the shared server on `:3001` and the mockup on `:3099`. Never start your own dev
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
