# Case-to-scenario matrix

Honest checkpoint from the **final case run of 2026-09-17** (the whole
suite, 112 specs, one Playwright process, `--workers=1`) against
`https://staging-qa-journeys.tulala.digital` (workspace B:
`https://staging-qa-journeys-b.tulala.digital`), host commit `140f003be`
(= `origin/main` at the time of the run, PR #2041). Isolated database:
Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`). Production was not
written. Every failure was triaged, stale selectors were rewritten to the
current screens without weakening an assertion, and the failed specs were
rerun (`r2`, then `r3`…`r5` where another stale selector, a fixture
collision or a harness answer sat behind the first). Run README with the counts by class, the spec edits and the defects
filed: `docs/plans/program/evidence/cases-run/2026-09-17/README.md`.

Status vocabulary (CASES-RUN-PROMPT.md): passed · failed-app (defect filed,
D-id in the row) · failed-fixture · failed-spec · blocked-external. A row
that names a run suffix in parentheses says which run produced that verdict.

**Parity aliases:** Master cases are `CS-01`–`CS-48` (same businesses as `C01`–`C48`
evidence dirs). Catalog QA is `C-01`–`C-32`. Full 404 scenario register:
[`scenario-register-404.md`](scenario-register-404.md).

Smoke-only specs (C03–C05, C10–C11, C13–C25, C27–C48) prove the storefront
body and the operator Sales heading. That is not a journey pass.

| Case | Scenario | Title | Status | Evidence |
|---|---|---|---|---|
| C01 | C01-CUS | Nail salon | passed — smoke passed (r2); deposit passed (r2). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C01-nail-salon.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C01-nail-salon.chromium.r2.log` |
| C01 | C01-OP | Nail salon | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C01-nail-salon.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C01-nail-salon.chromium.r2.log` |
| C01 | C01-TAL | Nail salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C01-nail-salon.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C01-nail-salon.chromium.r2.log` |
| C01 | C01-DIFF | Nail salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C01-nail-salon.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C01-nail-salon.chromium.r2.log` |
| C01 | C01-REC | Nail salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C01-nail-salon.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C01-nail-salon.chromium.r2.log` |
| C02 | C02-CUS | Spa | passed — smoke passed (r3); last-resource passed (r3); couples set passed (r3). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C02-spa.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C02-spa.chromium.r3.log` |
| C02 | C02-OP | Spa | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C02-spa.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C02-spa.chromium.r3.log` |
| C02 | C02-TAL | Spa | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C02-spa.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C02-spa.chromium.r3.log` |
| C02 | C02-DIFF | Spa | passed — journey passed (r3). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C02-spa.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C02-spa.chromium.r3.log` |
| C02 | C02-REC | Spa | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C02-spa.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C02-spa.chromium.r3.log` |
| C03 | C03-CUS | Independent massage therapist | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C03-independent-massage-therapist.chromium.final.log` |
| C03 | C03-OP | Independent massage therapist | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C03-independent-massage-therapist.chromium.final.log` |
| C03 | C03-TAL | Independent massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C03-independent-massage-therapist.chromium.final.log` |
| C03 | C03-DIFF | Independent massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C03-independent-massage-therapist.chromium.final.log` |
| C03 | C03-REC | Independent massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C03-independent-massage-therapist.chromium.final.log` |
| C04 | C04-CUS | Tattoo studio | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C04-tattoo-studio.chromium.final.log` |
| C04 | C04-OP | Tattoo studio | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C04-tattoo-studio.chromium.final.log` |
| C04 | C04-TAL | Tattoo studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C04-tattoo-studio.chromium.final.log` |
| C04 | C04-DIFF | Tattoo studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C04-tattoo-studio.chromium.final.log` |
| C04 | C04-REC | Tattoo studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C04-tattoo-studio.chromium.final.log` |
| C05 | C05-CUS | Hair salon | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C05-hair-salon.chromium.final.log` |
| C05 | C05-OP | Hair salon | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C05-hair-salon.chromium.final.log` |
| C05 | C05-TAL | Hair salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C05-hair-salon.chromium.final.log` |
| C05 | C05-DIFF | Hair salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C05-hair-salon.chromium.final.log` |
| C05 | C05-REC | Hair salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C05-hair-salon.chromium.final.log` |
| C06 | C06-CUS | Restaurant | smoke passed (r2); public menu **failed-app** (r2): D-169, no `House pizza` on `/`; reservation **failed-app** (r2): D-169, no `Reserve a table` on `/`; reserve-then-order **failed-app** (r2): D-169. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C06-restaurant.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C06-restaurant.chromium.r2.log` |
| C06 | C06-OP | Restaurant | passed — smoke passed (r2); walk-in cash passed (r2). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C06-restaurant.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C06-restaurant.chromium.r2.log` |
| C06 | C06-TAL | Restaurant | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C06-restaurant.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C06-restaurant.chromium.r2.log` |
| C06 | C06-DIFF | Restaurant | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C06-restaurant.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C06-restaurant.chromium.r2.log` |
| C06 | C06-REC | Restaurant | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C06-restaurant.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C06-restaurant.chromium.r2.log` |
| C07 | C07-CUS | Bar | passed — smoke passed (r3); tab passed (r3). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C07-bar.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C07-bar.chromium.r3.log` |
| C07 | C07-OP | Bar | passed — smoke passed (r3); tab passed (r3). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C07-bar.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C07-bar.chromium.r3.log` |
| C07 | C07-TAL | Bar | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C07-bar.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C07-bar.chromium.r3.log` |
| C07 | C07-DIFF | Bar | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C07-bar.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C07-bar.chromium.r3.log` |
| C07 | C07-REC | Bar | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C07-bar.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C07-bar.chromium.r3.log` |
| C08 | C08-CUS | Modelling or talent agency | smoke passed (r5); inquiry passed (r5); accept **failed-app** (r5): D-174: the claimed client's seat keeps `user_id` NULL and Approve & lock answers `no_client_participant` (r5; r3/r4 were the harness 401, D-173). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C08-modelling-or-talent-agency.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C08-modelling-or-talent-agency.chromium.r5.log` |
| C08 | C08-OP | Modelling or talent agency | passed — smoke passed (r5); assign passed (r5); send passed (r5). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C08-modelling-or-talent-agency.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C08-modelling-or-talent-agency.chromium.r5.log` |
| C08 | C08-TAL | Modelling or talent agency | passed — accept passed (r5). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C08-modelling-or-talent-agency.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C08-modelling-or-talent-agency.chromium.r5.log` |
| C08 | C08-DIFF | Modelling or talent agency | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C08-modelling-or-talent-agency.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C08-modelling-or-talent-agency.chromium.r5.log` |
| C08 | C08-REC | Modelling or talent agency | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C08-modelling-or-talent-agency.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C08-modelling-or-talent-agency.chromium.r5.log` |
| C09 | C09-CUS | Yoga or fitness studio | smoke passed (r3); class register **failed-app** (r3): D-169, no `session_picker` on `/`. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C09-yoga-or-fitness-studio.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C09-yoga-or-fitness-studio.chromium.r3.log` |
| C09 | C09-OP | Yoga or fitness studio | passed — smoke passed (r3); walk-in class passed (r3). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C09-yoga-or-fitness-studio.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C09-yoga-or-fitness-studio.chromium.r3.log` |
| C09 | C09-TAL | Yoga or fitness studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C09-yoga-or-fitness-studio.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C09-yoga-or-fitness-studio.chromium.r3.log` |
| C09 | C09-DIFF | Yoga or fitness studio | door **failed-app** (r3): D-169, the storefront half cannot run. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C09-yoga-or-fitness-studio.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C09-yoga-or-fitness-studio.chromium.r3.log` |
| C09 | C09-REC | Yoga or fitness studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C09-yoga-or-fitness-studio.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C09-yoga-or-fitness-studio.chromium.r3.log` |
| C10 | C10-CUS | Photography studio | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C10-photography-studio.chromium.final.log` |
| C10 | C10-OP | Photography studio | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C10-photography-studio.chromium.final.log` |
| C10 | C10-TAL | Photography studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C10-photography-studio.chromium.final.log` |
| C10 | C10-DIFF | Photography studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C10-photography-studio.chromium.final.log` |
| C10 | C10-REC | Photography studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C10-photography-studio.chromium.final.log` |
| C11 | C11-CUS | Beach club | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C11-beach-club.chromium.final.log` |
| C11 | C11-OP | Beach club | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C11-beach-club.chromium.final.log` |
| C11 | C11-TAL | Beach club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C11-beach-club.chromium.final.log` |
| C11 | C11-DIFF | Beach club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C11-beach-club.chromium.final.log` |
| C11 | C11-REC | Beach club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C11-beach-club.chromium.final.log` |
| C12 | C12-CUS | Event venue | passed — smoke passed (r5); ticket passed (r5). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C12-event-venue.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C12-event-venue.chromium.r5.log` |
| C12 | C12-OP | Event venue | passed — smoke passed (r5); door passed (r5). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C12-event-venue.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C12-event-venue.chromium.r5.log` |
| C12 | C12-TAL | Event venue | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C12-event-venue.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C12-event-venue.chromium.r5.log` |
| C12 | C12-DIFF | Event venue | passed — door passed (r5). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C12-event-venue.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C12-event-venue.chromium.r5.log` |
| C12 | C12-REC | Event venue | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C12-event-venue.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/C12-event-venue.chromium.r5.log` |
| C13 | C13-CUS | Coworking space with cafe, rooms and workshops | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C13-coworking-space-with-cafe-rooms-and-workshops.chromium.final.log` |
| C13 | C13-OP | Coworking space with cafe, rooms and workshops | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C13-coworking-space-with-cafe-rooms-and-workshops.chromium.final.log` |
| C13 | C13-TAL | Coworking space with cafe, rooms and workshops | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C13-coworking-space-with-cafe-rooms-and-workshops.chromium.final.log` |
| C13 | C13-DIFF | Coworking space with cafe, rooms and workshops | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C13-coworking-space-with-cafe-rooms-and-workshops.chromium.final.log` |
| C13 | C13-REC | Coworking space with cafe, rooms and workshops | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C13-coworking-space-with-cafe-rooms-and-workshops.chromium.final.log` |
| C14 | C14-CUS | Beauty academy | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C14-beauty-academy.chromium.final.log` |
| C14 | C14-OP | Beauty academy | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C14-beauty-academy.chromium.final.log` |
| C14 | C14-TAL | Beauty academy | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C14-beauty-academy.chromium.final.log` |
| C14 | C14-DIFF | Beauty academy | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C14-beauty-academy.chromium.final.log` |
| C14 | C14-REC | Beauty academy | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C14-beauty-academy.chromium.final.log` |
| C15 | C15-CUS | Cooking school | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C15-cooking-school.chromium.final.log` |
| C15 | C15-OP | Cooking school | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C15-cooking-school.chromium.final.log` |
| C15 | C15-TAL | Cooking school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C15-cooking-school.chromium.final.log` |
| C15 | C15-DIFF | Cooking school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C15-cooking-school.chromium.final.log` |
| C15 | C15-REC | Cooking school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C15-cooking-school.chromium.final.log` |
| C16 | C16-CUS | Diving school | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C16-diving-school.chromium.final.log` |
| C16 | C16-OP | Diving school | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C16-diving-school.chromium.final.log` |
| C16 | C16-TAL | Diving school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C16-diving-school.chromium.final.log` |
| C16 | C16-DIFF | Diving school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C16-diving-school.chromium.final.log` |
| C16 | C16-REC | Diving school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C16-diving-school.chromium.final.log` |
| C17 | C17-CUS | Padel club | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C17-padel-club.chromium.final.log` |
| C17 | C17-OP | Padel club | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C17-padel-club.chromium.final.log` |
| C17 | C17-TAL | Padel club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C17-padel-club.chromium.final.log` |
| C17 | C17-DIFF | Padel club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C17-padel-club.chromium.final.log` |
| C17 | C17-REC | Padel club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C17-padel-club.chromium.final.log` |
| C18 | C18-CUS | Podcast studio | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C18-podcast-studio.chromium.final.log` |
| C18 | C18-OP | Podcast studio | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C18-podcast-studio.chromium.final.log` |
| C18 | C18-TAL | Podcast studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C18-podcast-studio.chromium.final.log` |
| C18 | C18-DIFF | Podcast studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C18-podcast-studio.chromium.final.log` |
| C18 | C18-REC | Podcast studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C18-podcast-studio.chromium.final.log` |
| C19 | C19-CUS | Pet grooming salon | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C19-pet-grooming-salon.chromium.final.log` |
| C19 | C19-OP | Pet grooming salon | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C19-pet-grooming-salon.chromium.final.log` |
| C19 | C19-TAL | Pet grooming salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C19-pet-grooming-salon.chromium.final.log` |
| C19 | C19-DIFF | Pet grooming salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C19-pet-grooming-salon.chromium.final.log` |
| C19 | C19-REC | Pet grooming salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C19-pet-grooming-salon.chromium.final.log` |
| C20 | C20-CUS | Art gallery | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C20-art-gallery.chromium.final.log` |
| C20 | C20-OP | Art gallery | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C20-art-gallery.chromium.final.log` |
| C20 | C20-TAL | Art gallery | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C20-art-gallery.chromium.final.log` |
| C20 | C20-DIFF | Art gallery | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C20-art-gallery.chromium.final.log` |
| C20 | C20-REC | Art gallery | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C20-art-gallery.chromium.final.log` |
| C21 | C21-CUS | Wellness retreat organiser | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C21-wellness-retreat-organiser.chromium.final.log` |
| C21 | C21-OP | Wellness retreat organiser | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C21-wellness-retreat-organiser.chromium.final.log` |
| C21 | C21-TAL | Wellness retreat organiser | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C21-wellness-retreat-organiser.chromium.final.log` |
| C21 | C21-DIFF | Wellness retreat organiser | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C21-wellness-retreat-organiser.chromium.final.log` |
| C21 | C21-REC | Wellness retreat organiser | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C21-wellness-retreat-organiser.chromium.final.log` |
| C22 | C22-CUS | Corporate training provider | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C22-corporate-training-provider.chromium.final.log` |
| C22 | C22-OP | Corporate training provider | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C22-corporate-training-provider.chromium.final.log` |
| C22 | C22-TAL | Corporate training provider | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C22-corporate-training-provider.chromium.final.log` |
| C22 | C22-DIFF | Corporate training provider | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C22-corporate-training-provider.chromium.final.log` |
| C22 | C22-REC | Corporate training provider | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C22-corporate-training-provider.chromium.final.log` |
| C23 | C23-CUS | Floral design studio | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C23-floral-design-studio.chromium.final.log` |
| C23 | C23-OP | Floral design studio | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C23-floral-design-studio.chromium.final.log` |
| C23 | C23-TAL | Floral design studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C23-floral-design-studio.chromium.final.log` |
| C23 | C23-DIFF | Floral design studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C23-floral-design-studio.chromium.final.log` |
| C23 | C23-REC | Floral design studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C23-floral-design-studio.chromium.final.log` |
| C24 | C24-CUS | Escape room | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C24-escape-room.chromium.final.log` |
| C24 | C24-OP | Escape room | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C24-escape-room.chromium.final.log` |
| C24 | C24-TAL | Escape room | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C24-escape-room.chromium.final.log` |
| C24 | C24-DIFF | Escape room | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C24-escape-room.chromium.final.log` |
| C24 | C24-REC | Escape room | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C24-escape-room.chromium.final.log` |
| C25 | C25-CUS | Sushi restaurant with takeaway | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C25-sushi-restaurant-with-takeaway.chromium.final.log` |
| C25 | C25-OP | Sushi restaurant with takeaway | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C25-sushi-restaurant-with-takeaway.chromium.final.log` |
| C25 | C25-TAL | Sushi restaurant with takeaway | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C25-sushi-restaurant-with-takeaway.chromium.final.log` |
| C25 | C25-DIFF | Sushi restaurant with takeaway | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C25-sushi-restaurant-with-takeaway.chromium.final.log` |
| C25 | C25-REC | Sushi restaurant with takeaway | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C25-sushi-restaurant-with-takeaway.chromium.final.log` |
| C26 | C26-CUS | Jesus: frozen pizza from home | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C26-jesus-frozen-pizza-from-home.chromium.final.log` |
| C26 | C26-OP | Jesus: frozen pizza from home | passed — smoke passed (final); pickup passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C26-jesus-frozen-pizza-from-home.chromium.final.log` |
| C26 | C26-TAL | Jesus: frozen pizza from home | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C26-jesus-frozen-pizza-from-home.chromium.final.log` |
| C26 | C26-DIFF | Jesus: frozen pizza from home | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C26-jesus-frozen-pizza-from-home.chromium.final.log` |
| C26 | C26-REC | Jesus: frozen pizza from home | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C26-jesus-frozen-pizza-from-home.chromium.final.log` |
| C27 | C27-CUS | Laura: social media agency | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C27-laura-social-media-agency.chromium.final.log` |
| C27 | C27-OP | Laura: social media agency | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C27-laura-social-media-agency.chromium.final.log` |
| C27 | C27-TAL | Laura: social media agency | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C27-laura-social-media-agency.chromium.final.log` |
| C27 | C27-DIFF | Laura: social media agency | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C27-laura-social-media-agency.chromium.final.log` |
| C27 | C27-REC | Laura: social media agency | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C27-laura-social-media-agency.chromium.final.log` |
| C28 | C28-CUS | Eyelash business with five workers | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C28-eyelash-business-with-five-workers.chromium.final.log` |
| C28 | C28-OP | Eyelash business with five workers | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C28-eyelash-business-with-five-workers.chromium.final.log` |
| C28 | C28-TAL | Eyelash business with five workers | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C28-eyelash-business-with-five-workers.chromium.final.log` |
| C28 | C28-DIFF | Eyelash business with five workers | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C28-eyelash-business-with-five-workers.chromium.final.log` |
| C28 | C28-REC | Eyelash business with five workers | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C28-eyelash-business-with-five-workers.chromium.final.log` |
| C29 | C29-CUS | Alejandra: immigration solutions | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C29-alejandra-immigration-solutions.chromium.final.log` |
| C29 | C29-OP | Alejandra: immigration solutions | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C29-alejandra-immigration-solutions.chromium.final.log` |
| C29 | C29-TAL | Alejandra: immigration solutions | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C29-alejandra-immigration-solutions.chromium.final.log` |
| C29 | C29-DIFF | Alejandra: immigration solutions | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C29-alejandra-immigration-solutions.chromium.final.log` |
| C29 | C29-REC | Alejandra: immigration solutions | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C29-alejandra-immigration-solutions.chromium.final.log` |
| C30 | C30-CUS | Tania: massage therapist | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C30-tania-massage-therapist.chromium.final.log` |
| C30 | C30-OP | Tania: massage therapist | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C30-tania-massage-therapist.chromium.final.log` |
| C30 | C30-TAL | Tania: massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C30-tania-massage-therapist.chromium.final.log` |
| C30 | C30-DIFF | Tania: massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C30-tania-massage-therapist.chromium.final.log` |
| C30 | C30-REC | Tania: massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C30-tania-massage-therapist.chromium.final.log` |
| C31 | C31-CUS | Chris: private chef | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C31-chris-private-chef.chromium.final.log` |
| C31 | C31-OP | Chris: private chef | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C31-chris-private-chef.chromium.final.log` |
| C31 | C31-TAL | Chris: private chef | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C31-chris-private-chef.chromium.final.log` |
| C31 | C31-DIFF | Chris: private chef | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C31-chris-private-chef.chromium.final.log` |
| C31 | C31-REC | Chris: private chef | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C31-chris-private-chef.chromium.final.log` |
| C32 | C32-CUS | Independent house cleaner | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C32-independent-house-cleaner.chromium.final.log` |
| C32 | C32-OP | Independent house cleaner | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C32-independent-house-cleaner.chromium.final.log` |
| C32 | C32-TAL | Independent house cleaner | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C32-independent-house-cleaner.chromium.final.log` |
| C32 | C32-DIFF | Independent house cleaner | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C32-independent-house-cleaner.chromium.final.log` |
| C32 | C32-REC | Independent house cleaner | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C32-independent-house-cleaner.chromium.final.log` |
| C33 | C33-CUS | Fabian: handyman | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C33-fabian-handyman.chromium.final.log` |
| C33 | C33-OP | Fabian: handyman | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C33-fabian-handyman.chromium.final.log` |
| C33 | C33-TAL | Fabian: handyman | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C33-fabian-handyman.chromium.final.log` |
| C33 | C33-DIFF | Fabian: handyman | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C33-fabian-handyman.chromium.final.log` |
| C33 | C33-REC | Fabian: handyman | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C33-fabian-handyman.chromium.final.log` |
| C34 | C34-CUS | Evy Solutions: provisional profile | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C34-evy-solutions-provisional-profile.chromium.final.log` |
| C34 | C34-OP | Evy Solutions: provisional profile | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C34-evy-solutions-provisional-profile.chromium.final.log` |
| C34 | C34-TAL | Evy Solutions: provisional profile | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C34-evy-solutions-provisional-profile.chromium.final.log` |
| C34 | C34-DIFF | Evy Solutions: provisional profile | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C34-evy-solutions-provisional-profile.chromium.final.log` |
| C34 | C34-REC | Evy Solutions: provisional profile | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C34-evy-solutions-provisional-profile.chromium.final.log` |
| C35 | C35-CUS | Idan: private tours | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C35-idan-private-tours.chromium.final.log` |
| C35 | C35-OP | Idan: private tours | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C35-idan-private-tours.chromium.final.log` |
| C35 | C35-TAL | Idan: private tours | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C35-idan-private-tours.chromium.final.log` |
| C35 | C35-DIFF | Idan: private tours | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C35-idan-private-tours.chromium.final.log` |
| C35 | C35-REC | Idan: private tours | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C35-idan-private-tours.chromium.final.log` |
| C36 | C36-CUS | Zvika: custom jewelry | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C36-zvika-custom-jewelry.chromium.final.log` |
| C36 | C36-OP | Zvika: custom jewelry | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C36-zvika-custom-jewelry.chromium.final.log` |
| C36 | C36-TAL | Zvika: custom jewelry | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C36-zvika-custom-jewelry.chromium.final.log` |
| C36 | C36-DIFF | Zvika: custom jewelry | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C36-zvika-custom-jewelry.chromium.final.log` |
| C36 | C36-REC | Zvika: custom jewelry | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C36-zvika-custom-jewelry.chromium.final.log` |
| C37 | C37-CUS | Independent portrait photographer | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C37-independent-portrait-photographer.chromium.final.log` |
| C37 | C37-OP | Independent portrait photographer | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C37-independent-portrait-photographer.chromium.final.log` |
| C37 | C37-TAL | Independent portrait photographer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C37-independent-portrait-photographer.chromium.final.log` |
| C37 | C37-DIFF | Independent portrait photographer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C37-independent-portrait-photographer.chromium.final.log` |
| C37 | C37-REC | Independent portrait photographer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C37-independent-portrait-photographer.chromium.final.log` |
| C38 | C38-CUS | Independent DJ | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C38-independent-dj.chromium.final.log` |
| C38 | C38-OP | Independent DJ | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C38-independent-dj.chromium.final.log` |
| C38 | C38-TAL | Independent DJ | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C38-independent-dj.chromium.final.log` |
| C38 | C38-DIFF | Independent DJ | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C38-independent-dj.chromium.final.log` |
| C38 | C38-REC | Independent DJ | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C38-independent-dj.chromium.final.log` |
| C39 | C39-CUS | Private language tutor | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C39-private-language-tutor.chromium.final.log` |
| C39 | C39-OP | Private language tutor | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C39-private-language-tutor.chromium.final.log` |
| C39 | C39-TAL | Private language tutor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C39-private-language-tutor.chromium.final.log` |
| C39 | C39-DIFF | Private language tutor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C39-private-language-tutor.chromium.final.log` |
| C39 | C39-REC | Private language tutor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C39-private-language-tutor.chromium.final.log` |
| C40 | C40-CUS | Independent personal trainer | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C40-independent-personal-trainer.chromium.final.log` |
| C40 | C40-OP | Independent personal trainer | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C40-independent-personal-trainer.chromium.final.log` |
| C40 | C40-TAL | Independent personal trainer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C40-independent-personal-trainer.chromium.final.log` |
| C40 | C40-DIFF | Independent personal trainer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C40-independent-personal-trainer.chromium.final.log` |
| C40 | C40-REC | Independent personal trainer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C40-independent-personal-trainer.chromium.final.log` |
| C41 | C41-CUS | Freelance makeup artist | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C41-freelance-makeup-artist.chromium.final.log` |
| C41 | C41-OP | Freelance makeup artist | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C41-freelance-makeup-artist.chromium.final.log` |
| C41 | C41-TAL | Freelance makeup artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C41-freelance-makeup-artist.chromium.final.log` |
| C41 | C41-DIFF | Freelance makeup artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C41-freelance-makeup-artist.chromium.final.log` |
| C41 | C41-REC | Freelance makeup artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C41-freelance-makeup-artist.chromium.final.log` |
| C42 | C42-CUS | Freelance translator | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C42-freelance-translator.chromium.final.log` |
| C42 | C42-OP | Freelance translator | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C42-freelance-translator.chromium.final.log` |
| C42 | C42-TAL | Freelance translator | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C42-freelance-translator.chromium.final.log` |
| C42 | C42-DIFF | Freelance translator | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C42-freelance-translator.chromium.final.log` |
| C42 | C42-REC | Freelance translator | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C42-freelance-translator.chromium.final.log` |
| C43 | C43-CUS | Independent dog walker | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C43-independent-dog-walker.chromium.final.log` |
| C43 | C43-OP | Independent dog walker | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C43-independent-dog-walker.chromium.final.log` |
| C43 | C43-TAL | Independent dog walker | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C43-independent-dog-walker.chromium.final.log` |
| C43 | C43-DIFF | Independent dog walker | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C43-independent-dog-walker.chromium.final.log` |
| C43 | C43-REC | Independent dog walker | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C43-independent-dog-walker.chromium.final.log` |
| C44 | C44-CUS | Independent yoga instructor | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C44-independent-yoga-instructor.chromium.final.log` |
| C44 | C44-OP | Independent yoga instructor | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C44-independent-yoga-instructor.chromium.final.log` |
| C44 | C44-TAL | Independent yoga instructor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C44-independent-yoga-instructor.chromium.final.log` |
| C44 | C44-DIFF | Independent yoga instructor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C44-independent-yoga-instructor.chromium.final.log` |
| C44 | C44-REC | Independent yoga instructor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C44-independent-yoga-instructor.chromium.final.log` |
| C45 | C45-CUS | Voice-over artist | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C45-voice-over-artist.chromium.final.log` |
| C45 | C45-OP | Voice-over artist | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C45-voice-over-artist.chromium.final.log` |
| C45 | C45-TAL | Voice-over artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C45-voice-over-artist.chromium.final.log` |
| C45 | C45-DIFF | Voice-over artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C45-voice-over-artist.chromium.final.log` |
| C45 | C45-REC | Voice-over artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C45-voice-over-artist.chromium.final.log` |
| C46 | C46-CUS | Mobile car-detailing professional | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C46-mobile-car-detailing-professional.chromium.final.log` |
| C46 | C46-OP | Mobile car-detailing professional | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C46-mobile-car-detailing-professional.chromium.final.log` |
| C46 | C46-TAL | Mobile car-detailing professional | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C46-mobile-car-detailing-professional.chromium.final.log` |
| C46 | C46-DIFF | Mobile car-detailing professional | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C46-mobile-car-detailing-professional.chromium.final.log` |
| C46 | C46-REC | Mobile car-detailing professional | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C46-mobile-car-detailing-professional.chromium.final.log` |
| C47 | C47-CUS | Independent musician | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C47-independent-musician.chromium.final.log` |
| C47 | C47-OP | Independent musician | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C47-independent-musician.chromium.final.log` |
| C47 | C47-TAL | Independent musician | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C47-independent-musician.chromium.final.log` |
| C47 | C47-DIFF | Independent musician | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C47-independent-musician.chromium.final.log` |
| C47 | C47-REC | Independent musician | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C47-independent-musician.chromium.final.log` |
| C48 | C48-CUS | Independent event host or MC | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C48-independent-event-host-or-mc.chromium.final.log` |
| C48 | C48-OP | Independent event host or MC | passed (smoke, not a journey pass) — 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C48-independent-event-host-or-mc.chromium.final.log` |
| C48 | C48-TAL | Independent event host or MC | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C48-independent-event-host-or-mc.chromium.final.log` |
| C48 | C48-DIFF | Independent event host or MC | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C48-independent-event-host-or-mc.chromium.final.log` |
| C48 | C48-REC | Independent event host or MC | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-17/logs/C48-independent-event-host-or-mc.chromium.final.log` |

Records (CS role grid): **240**. Passed with a journey: **13**. Passed smoke only: **83**. Failed or mixed: **4**. No automated case in this suite: **140**. Blocked-external: **0**.

## Wiring

One row per engine control. Status is the 2026-09-17 final run (host `140f003be`), with the reruns after the spec fixes of the same day. Evidence: `docs/plans/program/evidence/cases-run/2026-09-17/` (README, per-run logs, traces of every failure); the earlier verification runs stay under `docs/plans/program/evidence/wiring-verify/`. Of 40 controls: failed-app 3 · passed 37.

| Control | Scenario | Title | Status | Evidence |
|---|---|---|---|---|
| 1.1 | WIRE-1.1 | Custom amount under the limit | passed — WIRE-1-custom-amount passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-custom-amount.chromium.final.log` |
| 1.2 | WIRE-1.2 | Custom amount over the limit + manager PIN | passed — WIRE-1-manager-pin passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-manager-pin.chromium.final.log` |
| 1.3 | WIRE-1.3 | Staff PIN + custom-amount limit | passed — WIRE-1-staff-pin-limit passed (r2) — failed-spec in `final` (Save disabled while the field equals the stored $50.00); the step now moves the limit first; r2 passed. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-staff-pin-limit.chromium.final.log` |
| 1.4 | WIRE-1.4 | Lock / unlock / switch operator | passed — WIRE-1-lock passed (r2) — failed-spec in `final` (a descending sort put an unlocked row's NULL first); reads the newest lock; r2 passed. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-lock.chromium.final.log` |
| 1.5 | WIRE-1.5 | Link a booking to a sale | passed — WIRE-1-link-booking passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-link-booking.chromium.final.log` |
| 1.6 | WIRE-1.6 | Tip | passed — WIRE-1-tip passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-tip.chromium.final.log` |
| 1.7 | WIRE-1.7 | Payment link | passed — WIRE-1-payment-link passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-payment-link.chromium.final.log` |
| 1.8 | WIRE-1.8 | Table move with expected version | passed — WIRE-1-table-move passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-table-move.chromium.final.log` |
| 1.9 | WIRE-1.9 | Split / merge / change server | passed — WIRE-1-split-merge-server passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-split-merge-server.chromium.final.log` |
| 1.10 | WIRE-1.10 | Class waitlist offer → accept / decline | passed — WIRE-1-class-waitlist passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-class-waitlist.chromium.final.log` |
| 1.11 | WIRE-1.11 | Cash movements + close / hand-over | passed — WIRE-1-cash-movements passed (r2) — `final` failed once (the third movement's row did not appear within 20 s although the DB had it; a refresh race); r2 passed unchanged. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-1-cash-movements.chromium.final.log` |
| 2.1 | WIRE-2.1 | New series + Generate sessions | passed — WIRE-2-series passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-series.chromium.final.log` |
| 2.2 | WIRE-2.2 | Substitute instructor (scope) | passed — WIRE-2-substitute passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-substitute.chromium.final.log` |
| 2.3 | WIRE-2.3 | Move participant | passed — WIRE-2-move-participant passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-move-participant.chromium.final.log` |
| 2.4 | WIRE-2.4 | Cancel session with scope + paid seats | WIRE-2-cancel-session **failed-app** (r2): D-168: `ticket_refund_intents_reason_check` no longer allows `session_cancelled`; r2 same. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-cancel-session.chromium.final.log` |
| 2.5 | WIRE-2.5 | Cancel appointment (staff) | passed — WIRE-2-cancel-appointment passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-cancel-appointment.chromium.final.log` |
| 2.6 | WIRE-2.6 | Customer self-manage /manage/<token> | passed — WIRE-2-customer-manage passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-customer-manage.chromium.final.log` |
| 2.7 | WIRE-2.7 | Replace talent on a project | passed — WIRE-2-replace-talent passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-replace-talent.chromium.final.log` |
| 2.8 | WIRE-2.8 | Amendment send / discard | passed — WIRE-2-amendment passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-amendment.chromium.final.log` |
| 2.9 | WIRE-2.9 | Milestone amount + file | passed — WIRE-2-milestone passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-milestone.chromium.final.log` |
| 2.10 | WIRE-2.10 | Archive / reopen project | passed — WIRE-2-archive-project passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-archive-project.chromium.final.log` |
| 2.11 | WIRE-2.11 | Package components + price phases | passed — WIRE-2-package-phases passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-package-phases.chromium.final.log` |
| 2.12 | WIRE-2.12 | Booking policy overrides | passed — WIRE-2-booking-policy passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-booking-policy.chromium.final.log` |
| 2.13 | WIRE-2.13 | Approval request + role limit | WIRE-2-approvals **failed-app** (r2): D-170: a code on a counter sale is refused `discountNeedsCustomer` because the named buyer is attached only at collection; r2 same. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-2-approvals.chromium.final.log` |
| 3.1 | WIRE-3.1 | Locations & zones, till chip, per-location modes | passed — WIRE-3-locations passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-locations.chromium.final.log` |
| 3.2 | WIRE-3.2 | Party waitlist join → notify → seat → leave | passed — WIRE-3-party-waitlist passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-party-waitlist.chromium.final.log` |
| 3.3 | WIRE-3.3 | Layout editor + activate | passed — WIRE-3-layouts passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-layouts.chromium.final.log` |
| 3.4 | WIRE-3.4 | Service periods | passed — WIRE-3-service-periods passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-service-periods.chromium.final.log` |
| 3.5 | WIRE-3.5 | Prep stations + fire by course | passed — WIRE-3-prep-stations passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-prep-stations.chromium.final.log` |
| 3.6 | WIRE-3.6 | Guest QR browse / add / submit / share / bill | passed — WIRE-3-guest-qr passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-guest-qr.chromium.final.log` |
| 3.7 | WIRE-3.7 | Seat map + hold timer | passed — WIRE-3-seat-hold passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-seat-hold.chromium.final.log` |
| 3.8 | WIRE-3.8 | Exchange / comp / multi-day / delivery | WIRE-3-exchange-comp **failed-app** (r4): E11 exchange = D-168 (`admission_exchange` refused by the CHECK), r2–r4 same; E12 comp passed r4 after the seeded nights moved off the fixture night's day (r2/r3 landed on QA Night) and the date button was scoped to the event's Dates group. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-exchange-comp.chromium.final.log` |
| 3.9 | WIRE-3.9 | Ticket page transfer / resend / lookup | passed — WIRE-3-ticket-page passed (final); WIRE-3-ticket-page-cash passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-ticket-page.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-ticket-page-cash.chromium.final.log` |
| 3.10 | WIRE-3.10 | Devices + heartbeat; offline outbox replay | passed — WIRE-3-devices passed (final); WIRE-3-devices-outbox passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-devices.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-3-devices-outbox.chromium.final.log` |
| 4.1 | WIRE-4.1 | Rail row + unread badge in every mode | passed — WIRE-4-rail-unread passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-4-rail-unread.chromium.final.log` |
| 4.2 | WIRE-4.2 | MSG-P1…P8, P11, P12 prototypes | passed — MSG-P1-pizza-counter passed (final); MSG-P2-salon-appointments passed (final); MSG-P5-resource passed (final); MSG-P6-class passed (final); MSG-P7-event passed (final); MSG-P8-agency-projects passed (final); MSG-P11-recovery passed (final); MSG-P12-concurrent passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/MSG-P1-pizza-counter.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/MSG-P2-salon-appointments.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/MSG-P5-resource.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/MSG-P6-class.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/MSG-P7-event.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/MSG-P8-agency-projects.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/MSG-P11-recovery.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/MSG-P12-concurrent.chromium.final.log` |
| 4.3 | WIRE-4.3 | From Messages origin | passed — WIRE-4-from-messages passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-4-from-messages.chromium.final.log` |
| 4.4 | WIRE-4.4 | Workspace Messages chips | passed — WIRE-4-workspace-chips passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-4-workspace-chips.chromium.final.log` |
| 4.5 | WIRE-4.5 | Reminders cron + delivery retry cron | passed — WIRE-4-crons passed (final). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-4-crons.chromium.final.log` |
| 4.6 | WIRE-4.6 | Customer thread /c/t/<token> | passed — WIRE-4-customer-thread passed (r2) — failed-spec in `final` (a plain `text` message is drawn as a card and the comparison set skipped it); r2 passed. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-4-customer-thread.chromium.final.log` |

## Program specs (not the CS-01–48 role grid)

| Spec | Status | Evidence |
|---|---|---|
| PERM-cross-workspace | passed — 5 test(s), run r2; failed-spec in `final` (a second `goto` raced the counter's own `?mode=` rewrite → net::ERR_ABORTED); r2 passed 5/5. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/PERM-cross-workspace.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/PERM-cross-workspace.chromium.r2.log` |
| SELL-catalog-events-spaces-discounts | passed — 1 test(s), run r3; failed-spec in `final`/r2 (lists render a hidden phone row first; `.first()` landed on it); visible-row filter; r3 passed. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/SELL-catalog-events-spaces-discounts.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/SELL-catalog-events-spaces-discounts.chromium.r3.log` |
| MONEY-manager-reads-the-money | passed — 1 test(s), run r2; failed-spec in `final` (`[data-pos-hold]` gone before the tap while the router settled after a discard, D-155 timing); helper waits for the empty surface; r2 passed. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/MONEY-manager-reads-the-money.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/MONEY-manager-reads-the-money.chromium.r2.log` |
| POS-counter-cash-sale | **failed-app** — run r3, 0 passed / 1 failed / 3 did not run: D-171: after the top-bar switch, Open drawer throws the page back to `/admin` and writes no shift (r2, r3); the three refusal tests did not run (serial). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/POS-counter-cash-sale.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/POS-counter-cash-sale.chromium.r3.log` |
| POS-floor-mode | passed — 1 test(s), run final. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/POS-floor-mode.chromium.final.log` |
| POS-platform-switch | passed — 1 test(s), run r3; failed-spec in `final` (`Workspace` half is `Back office`) and r2 (settings nav tapped before hydration after the reload); r3 passed. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/POS-platform-switch.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/POS-platform-switch.chromium.r3.log` |
| POS-projects-collect-a-balance | passed — 1 test(s), run r2; failed-spec in `final` (switch group is `Back office or point of sale`); r2 passed. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/POS-projects-collect-a-balance.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/POS-projects-collect-a-balance.chromium.r2.log` |
| pos-scanner | passed — 1 test(s), run final. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/pos-scanner.chromium.final.log` |
| pos-customer-display | passed — 1 test(s), run final. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/pos-customer-display.chromium.final.log` |
| VENUE-join-and-refusal | passed — 1 test(s), run final. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/VENUE-join-and-refusal.chromium.final.log` |
| VENUE-table-service | **failed-app** — run r3, 0 passed / 1 failed: D-172: seating the waiting party opens a nameless walk-in; earlier failed-spec steps fixed (`Back office` switch, `button[data-floor-waiting]` row). 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/VENUE-table-service.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/VENUE-table-service.chromium.r3.log` |
| VENUE-refusals-in-words | passed — 2 test(s), run r2; failed-spec in `final` (tile tapped before React owned it on the second locale pass); `counterAddItem`; r2 passed 2/2. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/VENUE-refusals-in-words.chromium.final.log` · `docs/plans/program/evidence/cases-run/2026-09-17/logs/VENUE-refusals-in-words.chromium.r2.log` |
| WIRE-0-enable-modes | passed — 1 test(s), run final. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-0-enable-modes.chromium.final.log` |
| WIRE-5-shell-no-ghost-page | passed — 1 test(s), run final. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/WIRE-5-shell-no-ghost-page.chromium.final.log` |
| channels-whatsapp | passed — 1 test(s), run final. 2026-09-17, host 140f003be | `docs/plans/program/evidence/cases-run/2026-09-17/logs/channels-whatsapp.chromium.final.log` |

Program specs: failed-app 2 · passed 13.
