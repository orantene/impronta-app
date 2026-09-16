# Onboarding module · Phase 3 (reasoning) · evidence

Branch `feat/onboarding-p3-reasoning` · isolated QA stack (marketing proxy :3105, app proxy :3106, Supabase branch `fxlankepwnvelxjrahwk`) · 2026-09-16.

## What was run

| Command | Exit |
|---|---|
| `npm run gates` (`TSC PASS (exit 0)`, lint, size ratchet, i18n parity) | 0 |
| `tsx --test src/lib/tulala/*.test.ts src/lib/onboarding/*.test.ts src/lib/settings/onboarding-flags.test.ts` (354) | 0 |
| `check-server-actions.mjs` (354 files) · `check-ci-lane-parity.cjs` (52 lanes) · `check-ui-messages.mjs` | 0 |
| `playwright test e2e/onboarding --project=chromium --project=mobile-onboarding` (20: 12 shell + 8 understanding) | 0 |

## Screenshots (1440 and 390)

10 understood card (Mariana, seeded) · 11 two quick things · 12 ready to build (business, link available) · 13 ready to save (talent, short form) · 14 the fork.

## Proven by the spec

- **No model reachable** (this stack has no Upstash KV, so the understand step fails closed exactly like `/api/tulala/*`): the card says so in a warning, every essential is "Missing", and the short form (what + where → name → what people can book) fills them; Ready to save shows the four facts; no link card for talent.
- **Mariana** (fixture facts seeded with `ai_inference / needs_approval` provenance): path "The business and your own page", six "AI guess · tap to change" lines, hours and WhatsApp "Missing", logo "Later, in your site", button "Looks right · 1 question"; inline edit of Where turns the line into "You said" and writes `person.city` as `user_stated / confirmed`; the two-quick-things screen refuses a WhatsApp without a country code, accepts `+52 998 123 4567` and writes `+529981234567`; hours preset writes `["Mon-Sat 09:00-19:00"]`; Ready shows `unas-mariana.tulala.digital · Available`; changing the link to `qa-journeys` shows "taken" with three suggestions and disables Build.
- **El Paisa** (link import facts): "Here is what I found", path "A site for the business", "Looks right" with no questions, Ready with `parrilla-el-paisa.tulala.digital`.
- **Fork**: two known facts and no signal → the card accepts into "Who is this page for?"; choosing the business re-plans to "What kind of business is it?"; Back returns to the card with the business path.

## Not clicked

The real extraction call (needs Upstash KV + a model key on the isolated stack: owner's day-1 item) and the URL import fetch. Both paths are unit-tested through the fixtures (`understanding.test.ts`) and the lifted `extractAndRecord` is byte-identical to the chat intake's (`test:tulala` 333 → unchanged). The microphone (unchanged from Phase 2).

## Reviewed in the browser by me

Rosa short form on iPhone 14 (JS-driven; the pane's pointer input was unreliable at that viewport, the Playwright mobile project covers the same taps).
