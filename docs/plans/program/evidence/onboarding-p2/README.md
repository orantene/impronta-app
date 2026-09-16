# Onboarding module · Phase 2 (shell) · evidence

Branch `feat/onboarding-p2-shell` · isolated QA stack (`web/scripts/onboarding-qa/dev.sh`, Supabase branch `fxlankepwnvelxjrahwk`, marketing host proxy :3105) · 2026-09-16.

## What was run

| Command | Exit |
|---|---|
| `npm run gates` (typecheck via queue: `TSC PASS (exit 0)`, lint, size ratchet, i18n parity) | 0 |
| `npm run test:onboarding` (9 tests) | 0 |
| `tsx --test src/lib/tulala/*.test.ts src/lib/saas/tenant-isolation.security.test.ts src/lib/marketing/*.test.ts` (363) | 0 |
| `node scripts/check-ci-lane-parity.cjs` (52 lanes gated) · `check-server-actions.mjs` (350 files) · `check-ui-messages.mjs` | 0 |
| `playwright test e2e/onboarding/shell-open-and-resume.spec.ts --project=chromium --project=mobile-onboarding` (12) | 0 |

## Screenshots (Playwright, 1440 desktop overlay and 390 iPhone 14)

01 entry · 02 confirm words · 03 too little · 04 reading · 05 resume after reload · 06 Spanish entry.

## Proven by the spec

- The module opens from "Sell your work · free" (talent event), "Start a business" (intercepted link) and the header "Get started" with no navigation to `/get-started`; the account pill reads "Not signed in" for a guest.
- Examples rotate under the box; a 4-word "hola" reaches "Tell us a little more" and the words are kept; Enter sends; the confirm screen shows the sentence; "Looks right · Send" creates the brief (guest cookie owner), persists `module_state`, and shows the reading screen with step label "2 · Check".
- Close shows "Saved on this phone"; reload + any CTA offers "Welcome back" with the sentence; Continue lands on the reading screen; Start fresh archives the brief and opens a clean entry.
- A pasted `parrillaelpaisa.com` is accepted as a site import ("Reading your site…").
- `/es` shows the Spanish module.
- The app host (:3106) never mounts the overlay.

## Not clicked

The microphone (Web Speech / MediaRecorder → `/api/tulala/transcribe`): browser permission prompts are not automatable here; the hook is lifted verbatim from `components/tulala/agent-composer.tsx`. Google popup: Phase 4.

## Flag

`onboarding_module_enabled` (settings, default off). With it off nothing in this PR changes the funnel: `MarketingModalHost` opens the talent modal as before and `/get-started` links navigate.
