# Onboarding p12 · six real-model runs on desktop (1440 px)

Isolated QA stack (Supabase branch `fxlankepwnvelxjrahwk`, Haiku 4.5 extraction / Sonnet 5 copy via the QA env keys, in-memory limiter stand-in for Upstash). Spec: `web/e2e/onboarding/real-model-desktop.spec.ts` (`ONB_REAL_MODEL=1`). Every run: typed sentence → AI card → essentials → (style) → ready → build → arrival → the composed site / Today page. 6/6 green on the final pass (`exit=0` each, one at a time).

| Run | Sentence | AI card | Category | Result |
|---|---|---|---|---|
| t1-nails | nail technician, Cancún, gel/acrylics/nail art | 3 s, all lines right | Nail Artist (was AC Technician before the scorer fix) | profile TAL-000xx, Today page, bio |
| t2-photo | wedding + event photographer, Tulum | right | Event Photographer (was Drone Photographer) | profile + Today |
| t3-yoga | yoga + breathwork, Playa | right | Yoga Instructor (was Language Teacher) | profile + Today |
| b1-taco | Taquería El Güero, Cancún, Tue–Sun 1–11, WhatsApp | right; `presence.whatsapp="true"` refused | Restaurant (was Dry cleaning service) | site, Bold look, model copy, hours + WhatsApp placed |
| b2-barber | Barbería Norte, Playa | right | Barber shop | site, Minimal look |
| b3-spa | Casa Selva Spa, Tulum, every day 9–7 | right | Spa (was House cleaner via "casa") | site, Warm look |

Screenshots: `<run>-01-entry … 08-arrival`, `09-site-full` / `09-today-full`, `10-public-profile-full`.

## Defects found by real data and fixed in this PR
- Talent type scorer: shared words ("technician", "photographer", "teacher") outvoted the trade word; synonym hits ("wedding dj") crowned DJ. Now IDF-weighted, head-noun bonus gated on a qualifier hit, specificity penalty. `type-chip.test.ts`.
- Business type: "food service" → "… service"; "Casa Selva Spa" → House cleaner. Least-ambiguous word wins, exact word beats substring, business name rides along; Restaurant gained taquería/food-service aliases.
- `presence.whatsapp` accepted "true". String facts can carry a `pattern`; the phone field only prefills phone-shaped values.
- Bio template: "a event Photographer" → "an event photographer" (article + Title Case labels).
- Copy pass: a second critic rejection (or a non-JSON retry) threw the whole draft away; now the passed lines stay and only the named keys default (casa-selva-spa shipped placeholder copy).
- Smoke test: `/get-started` is a 307 to the front door when the module is on.

## Still open (not this PR)
- No imagery on any composed site: the branch has no stock for these types and the AI image engine (#1994) is not live. Every site is `fallback_used` for that reason alone.
- No "Barber" talent term in the taxonomy (433 active terms); "Not in the list" covers it.
- Arrival "Next steps" shows the first item with a filled check although it is the current step, not a done one.
- `/talent/today` copy says "Your storefront is live" while photos are 0/3.
- Funnel events on the marketing host fail with `analytics_events.tenant_id NOT NULL` (server log warn on every step).

## Stack notes
- Dev server self-restarts at the 6 GB heap threshold and then 404s every API route until a clean restart; `scripts/onboarding-qa/dev.sh` now runs with 9 GB.
- First compile of `/talent/today` took 3 m 15 s; the spec's post-arrival hops tolerate that.
