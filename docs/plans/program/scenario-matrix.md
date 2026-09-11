# Case-to-scenario matrix

Honest checkpoint from the 2026-09-11 Playwright run against
`https://staging-qa-journeys.tulala.digital` (workspace B:
`https://staging-qa-journeys-b.tulala.digital`). Host commit
`dd74cf00f` (`sentry-release=dd74cf00f3ed6a9f64d895e687267e6a9339fdf3`).
Isolated database: Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`).
Production was not written.

**Parity aliases:** Master cases are `CS-01`–`CS-48` (same businesses as `C01`–`C48`
evidence dirs). Catalog QA is `C-01`–`C-32`. Full 404 scenario register:
[`scenario-register-404.md`](scenario-register-404.md).

Smoke-only specs (C03–C05, C10–C11, C13–C25, C27–C48) prove the storefront
body and the operator Sales heading. That is not a journey pass.

| Case | Scenario | Title | Status | Evidence |
|---|---|---|---|---|
| C01 | C01-CUS | Nail salon | failed-fixture — /book picker `.limit(24)` by sort_order; Gel manicure is sort_order 10 and sits behind 42 sort_order=0 leftovers (Prove class / POS class / Blowout / Door night). Smoke passed. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C01-nail-salon.a1.log` |
| C01 | C01-OP | Nail salon | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C01-nail-salon.a1.log` |
| C01 | C01-TAL | Nail salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C01-nail-salon.a1.log` |
| C01 | C01-DIFF | Nail salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C01-nail-salon.a1.log` |
| C01 | C01-REC | Nail salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C01-nail-salon.a1.log` |
| C02 | C02-CUS | Spa | failed-fixture — Massage sort_order 20 and Couples massage 30 are off the /book page (same 24-cap). Smoke passed. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C02-spa.a1.log` |
| C02 | C02-OP | Spa | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C02-spa.a1.log` |
| C02 | C02-TAL | Spa | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C02-spa.a1.log` |
| C02 | C02-DIFF | Spa | failed-fixture — Couples massage not in the /book select (sort_order 30). 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C02-spa.a1.log` |
| C02 | C02-REC | Spa | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C02-spa.a1.log` |
| C03 | C03-CUS | Independent massage therapist | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C03-independent-massage-therapist.a1.log` |
| C03 | C03-OP | Independent massage therapist | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C03-independent-massage-therapist.a1.log` |
| C03 | C03-TAL | Independent massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C03-independent-massage-therapist.a1.log` |
| C03 | C03-DIFF | Independent massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C03-independent-massage-therapist.a1.log` |
| C03 | C03-REC | Independent massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C03-independent-massage-therapist.a1.log` |
| C04 | C04-CUS | Tattoo studio | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C04-tattoo-studio.a1.log` |
| C04 | C04-OP | Tattoo studio | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C04-tattoo-studio.a1.log` |
| C04 | C04-TAL | Tattoo studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C04-tattoo-studio.a1.log` |
| C04 | C04-DIFF | Tattoo studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C04-tattoo-studio.a1.log` |
| C04 | C04-REC | Tattoo studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C04-tattoo-studio.a1.log` |
| C05 | C05-CUS | Hair salon | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C05-hair-salon.a1.log` |
| C05 | C05-OP | Hair salon | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C05-hair-salon.a1.log` |
| C05 | C05-TAL | Hair salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C05-hair-salon.a1.log` |
| C05 | C05-DIFF | Hair salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C05-hair-salon.a1.log` |
| C05 | C05-REC | Hair salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C05-hair-salon.a1.log` |
| C06 | C06-CUS | Restaurant | passed — public menu, reservation, and reserve-then-order after Sales copy (`Unpaid · Awaiting payment`) and release no-op. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C06-restaurant.r1.log` |
| C06 | C06-OP | Restaurant | passed — walk-in cash. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C06-restaurant.r1.log` |
| C06 | C06-TAL | Restaurant | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C06-restaurant.r1.log` |
| C06 | C06-DIFF | Restaurant | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C06-restaurant.r1.log` |
| C06 | C06-REC | Restaurant | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C06-restaurant.r1.log` |
| C07 | C07-CUS | Bar | failed-fixture — owner JWT cannot SELECT/UPDATE `visits` (no service-role key in this runner); `releaseTable1Floor` / `latestOpenTable1Visit` throw 42501. Smoke passed. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C07-bar.a1.log` |
| C07 | C07-OP | Bar | failed-fixture — same visits RLS as C07-CUS. Smoke passed. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C07-bar.a1.log` |
| C07 | C07-TAL | Bar | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C07-bar.a1.log` |
| C07 | C07-DIFF | Bar | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C07-bar.a1.log` |
| C07 | C07-REC | Bar | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C07-bar.a1.log` |
| C08 | C08-CUS | Modelling or talent agency | mixed — directory inquiry **passed** after clearing leftover `impronta_guest`; claimed-client accept **failed-app D-113** (`No client account here`). Smoke passed. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C08-modelling-or-talent-agency.r2.log` |
| C08 | C08-OP | Modelling or talent agency | failed-spec — assign hung on guest send (`Sending…` 40s); send reached Messages but h1 is hidden after fidelity. Smoke passed. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C08-modelling-or-talent-agency.r2.log` |
| C08 | C08-TAL | Modelling or talent agency | failed-spec — `Approve offer` not on the talent inbox (cascade / leftover offer chrome). 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C08-modelling-or-talent-agency.r2.log` |
| C08 | C08-DIFF | Modelling or talent agency | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C08-modelling-or-talent-agency.r2.log` |
| C08 | C08-REC | Modelling or talent agency | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C08-modelling-or-talent-agency.r2.log` |
| C09 | C09-CUS | Yoga or fitness studio | failed-fixture — storefront session_picker has no radio (Morning class / Last place offerings are missing from the tenant). Smoke passed. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C09-yoga-or-fitness-studio.a1.log` |
| C09 | C09-OP | Yoga or fitness studio | failed-fixture — Complimentary class tile is present; Morning class offering does not exist. Smoke passed. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C09-yoga-or-fitness-studio.a1.log` |
| C09 | C09-TAL | Yoga or fitness studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C09-yoga-or-fitness-studio.a1.log` |
| C09 | C09-DIFF | Yoga or fitness studio | failed-fixture — Last place session `33330013-…0003` is not on the picker; Last place offering is absent. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C09-yoga-or-fitness-studio.a1.log` |
| C09 | C09-REC | Yoga or fitness studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C09-yoga-or-fitness-studio.a1.log` |
| C10 | C10-CUS | Photography studio | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C10-photography-studio.a1.log` |
| C10 | C10-OP | Photography studio | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C10-photography-studio.a1.log` |
| C10 | C10-TAL | Photography studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C10-photography-studio.a1.log` |
| C10 | C10-DIFF | Photography studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C10-photography-studio.a1.log` |
| C10 | C10-REC | Photography studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C10-photography-studio.a1.log` |
| C11 | C11-CUS | Beach club | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C11-beach-club.a1.log` |
| C11 | C11-OP | Beach club | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C11-beach-club.a1.log` |
| C11 | C11-TAL | Beach club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C11-beach-club.a1.log` |
| C11 | C11-DIFF | Beach club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C11-beach-club.a1.log` |
| C11 | C11-REC | Beach club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C11-beach-club.a1.log` |
| C12 | C12-CUS | Event venue | passed — $0 QA Night ticket. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C12-event-venue.a1.log` |
| C12 | C12-OP | Event venue | passed — walk-up Admit. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C12-event-venue.a1.log` |
| C12 | C12-TAL | Event venue | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C12-event-venue.a1.log` |
| C12 | C12-DIFF | Event venue | failed-app D-112 — after At the door, `[data-ticket-picker=held]` never appeared (rerun once). 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C12-event-venue.a1.log` |
| C12 | C12-REC | Event venue | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C12-event-venue.a1.log` |
| C13 | C13-CUS | Coworking space with cafe, rooms and workshops | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C13-coworking-space-with-cafe-rooms-and-workshops.a1.log` |
| C13 | C13-OP | Coworking space with cafe, rooms and workshops | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C13-coworking-space-with-cafe-rooms-and-workshops.a1.log` |
| C13 | C13-TAL | Coworking space with cafe, rooms and workshops | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C13-coworking-space-with-cafe-rooms-and-workshops.a1.log` |
| C13 | C13-DIFF | Coworking space with cafe, rooms and workshops | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C13-coworking-space-with-cafe-rooms-and-workshops.a1.log` |
| C13 | C13-REC | Coworking space with cafe, rooms and workshops | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C13-coworking-space-with-cafe-rooms-and-workshops.a1.log` |
| C14 | C14-CUS | Beauty academy | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C14-beauty-academy.a1.log` |
| C14 | C14-OP | Beauty academy | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C14-beauty-academy.a1.log` |
| C14 | C14-TAL | Beauty academy | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C14-beauty-academy.a1.log` |
| C14 | C14-DIFF | Beauty academy | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C14-beauty-academy.a1.log` |
| C14 | C14-REC | Beauty academy | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C14-beauty-academy.a1.log` |
| C15 | C15-CUS | Cooking school | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C15-cooking-school.a1.log` |
| C15 | C15-OP | Cooking school | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C15-cooking-school.a1.log` |
| C15 | C15-TAL | Cooking school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C15-cooking-school.a1.log` |
| C15 | C15-DIFF | Cooking school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C15-cooking-school.a1.log` |
| C15 | C15-REC | Cooking school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C15-cooking-school.a1.log` |
| C16 | C16-CUS | Diving school | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C16-diving-school.a1.log` |
| C16 | C16-OP | Diving school | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C16-diving-school.a1.log` |
| C16 | C16-TAL | Diving school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C16-diving-school.a1.log` |
| C16 | C16-DIFF | Diving school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C16-diving-school.a1.log` |
| C16 | C16-REC | Diving school | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C16-diving-school.a1.log` |
| C17 | C17-CUS | Padel club | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C17-padel-club.a1.log` |
| C17 | C17-OP | Padel club | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C17-padel-club.a1.log` |
| C17 | C17-TAL | Padel club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C17-padel-club.a1.log` |
| C17 | C17-DIFF | Padel club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C17-padel-club.a1.log` |
| C17 | C17-REC | Padel club | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C17-padel-club.a1.log` |
| C18 | C18-CUS | Podcast studio | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C18-podcast-studio.a1.log` |
| C18 | C18-OP | Podcast studio | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C18-podcast-studio.a1.log` |
| C18 | C18-TAL | Podcast studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C18-podcast-studio.a1.log` |
| C18 | C18-DIFF | Podcast studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C18-podcast-studio.a1.log` |
| C18 | C18-REC | Podcast studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C18-podcast-studio.a1.log` |
| C19 | C19-CUS | Pet grooming salon | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C19-pet-grooming-salon.a1.log` |
| C19 | C19-OP | Pet grooming salon | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C19-pet-grooming-salon.a1.log` |
| C19 | C19-TAL | Pet grooming salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C19-pet-grooming-salon.a1.log` |
| C19 | C19-DIFF | Pet grooming salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C19-pet-grooming-salon.a1.log` |
| C19 | C19-REC | Pet grooming salon | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C19-pet-grooming-salon.a1.log` |
| C20 | C20-CUS | Art gallery | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C20-art-gallery.a1.log` |
| C20 | C20-OP | Art gallery | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C20-art-gallery.a1.log` |
| C20 | C20-TAL | Art gallery | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C20-art-gallery.a1.log` |
| C20 | C20-DIFF | Art gallery | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C20-art-gallery.a1.log` |
| C20 | C20-REC | Art gallery | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C20-art-gallery.a1.log` |
| C21 | C21-CUS | Wellness retreat organiser | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C21-wellness-retreat-organiser.a1.log` |
| C21 | C21-OP | Wellness retreat organiser | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C21-wellness-retreat-organiser.a1.log` |
| C21 | C21-TAL | Wellness retreat organiser | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C21-wellness-retreat-organiser.a1.log` |
| C21 | C21-DIFF | Wellness retreat organiser | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C21-wellness-retreat-organiser.a1.log` |
| C21 | C21-REC | Wellness retreat organiser | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C21-wellness-retreat-organiser.a1.log` |
| C22 | C22-CUS | Corporate training provider | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C22-corporate-training-provider.a1.log` |
| C22 | C22-OP | Corporate training provider | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C22-corporate-training-provider.a1.log` |
| C22 | C22-TAL | Corporate training provider | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C22-corporate-training-provider.a1.log` |
| C22 | C22-DIFF | Corporate training provider | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C22-corporate-training-provider.a1.log` |
| C22 | C22-REC | Corporate training provider | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C22-corporate-training-provider.a1.log` |
| C23 | C23-CUS | Floral design studio | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C23-floral-design-studio.a1.log` |
| C23 | C23-OP | Floral design studio | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C23-floral-design-studio.a1.log` |
| C23 | C23-TAL | Floral design studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C23-floral-design-studio.a1.log` |
| C23 | C23-DIFF | Floral design studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C23-floral-design-studio.a1.log` |
| C23 | C23-REC | Floral design studio | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C23-floral-design-studio.a1.log` |
| C24 | C24-CUS | Escape room | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C24-escape-room.a1.log` |
| C24 | C24-OP | Escape room | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C24-escape-room.a1.log` |
| C24 | C24-TAL | Escape room | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C24-escape-room.a1.log` |
| C24 | C24-DIFF | Escape room | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C24-escape-room.a1.log` |
| C24 | C24-REC | Escape room | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C24-escape-room.a1.log` |
| C25 | C25-CUS | Sushi restaurant with takeaway | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C25-sushi-restaurant-with-takeaway.a1.log` |
| C25 | C25-OP | Sushi restaurant with takeaway | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C25-sushi-restaurant-with-takeaway.a1.log` |
| C25 | C25-TAL | Sushi restaurant with takeaway | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C25-sushi-restaurant-with-takeaway.a1.log` |
| C25 | C25-DIFF | Sushi restaurant with takeaway | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C25-sushi-restaurant-with-takeaway.a1.log` |
| C25 | C25-REC | Sushi restaurant with takeaway | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C25-sushi-restaurant-with-takeaway.a1.log` |
| C26 | C26-CUS | Jesus: frozen pizza from home | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C26-jesus-frozen-pizza-from-home.a1.log` |
| C26 | C26-OP | Jesus: frozen pizza from home | passed — pickup cash handoff. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C26-jesus-frozen-pizza-from-home.a1.log` |
| C26 | C26-TAL | Jesus: frozen pizza from home | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C26-jesus-frozen-pizza-from-home.a1.log` |
| C26 | C26-DIFF | Jesus: frozen pizza from home | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C26-jesus-frozen-pizza-from-home.a1.log` |
| C26 | C26-REC | Jesus: frozen pizza from home | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C26-jesus-frozen-pizza-from-home.a1.log` |
| C27 | C27-CUS | Laura: social media agency | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C27-laura-social-media-agency.a1.log` |
| C27 | C27-OP | Laura: social media agency | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C27-laura-social-media-agency.a1.log` |
| C27 | C27-TAL | Laura: social media agency | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C27-laura-social-media-agency.a1.log` |
| C27 | C27-DIFF | Laura: social media agency | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C27-laura-social-media-agency.a1.log` |
| C27 | C27-REC | Laura: social media agency | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C27-laura-social-media-agency.a1.log` |
| C28 | C28-CUS | Eyelash business with five workers | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C28-eyelash-business-with-five-workers.a1.log` |
| C28 | C28-OP | Eyelash business with five workers | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C28-eyelash-business-with-five-workers.a1.log` |
| C28 | C28-TAL | Eyelash business with five workers | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C28-eyelash-business-with-five-workers.a1.log` |
| C28 | C28-DIFF | Eyelash business with five workers | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C28-eyelash-business-with-five-workers.a1.log` |
| C28 | C28-REC | Eyelash business with five workers | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C28-eyelash-business-with-five-workers.a1.log` |
| C29 | C29-CUS | Alejandra: immigration solutions | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C29-alejandra-immigration-solutions.a1.log` |
| C29 | C29-OP | Alejandra: immigration solutions | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C29-alejandra-immigration-solutions.a1.log` |
| C29 | C29-TAL | Alejandra: immigration solutions | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C29-alejandra-immigration-solutions.a1.log` |
| C29 | C29-DIFF | Alejandra: immigration solutions | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C29-alejandra-immigration-solutions.a1.log` |
| C29 | C29-REC | Alejandra: immigration solutions | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C29-alejandra-immigration-solutions.a1.log` |
| C30 | C30-CUS | Tania: massage therapist | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C30-tania-massage-therapist.a1.log` |
| C30 | C30-OP | Tania: massage therapist | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C30-tania-massage-therapist.a1.log` |
| C30 | C30-TAL | Tania: massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C30-tania-massage-therapist.a1.log` |
| C30 | C30-DIFF | Tania: massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C30-tania-massage-therapist.a1.log` |
| C30 | C30-REC | Tania: massage therapist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C30-tania-massage-therapist.a1.log` |
| C31 | C31-CUS | Chris: private chef | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C31-chris-private-chef.a1.log` |
| C31 | C31-OP | Chris: private chef | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C31-chris-private-chef.a1.log` |
| C31 | C31-TAL | Chris: private chef | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C31-chris-private-chef.a1.log` |
| C31 | C31-DIFF | Chris: private chef | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C31-chris-private-chef.a1.log` |
| C31 | C31-REC | Chris: private chef | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C31-chris-private-chef.a1.log` |
| C32 | C32-CUS | Independent house cleaner | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C32-independent-house-cleaner.a1.log` |
| C32 | C32-OP | Independent house cleaner | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C32-independent-house-cleaner.a1.log` |
| C32 | C32-TAL | Independent house cleaner | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C32-independent-house-cleaner.a1.log` |
| C32 | C32-DIFF | Independent house cleaner | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C32-independent-house-cleaner.a1.log` |
| C32 | C32-REC | Independent house cleaner | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C32-independent-house-cleaner.a1.log` |
| C33 | C33-CUS | Fabian: handyman | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C33-fabian-handyman.a1.log` |
| C33 | C33-OP | Fabian: handyman | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C33-fabian-handyman.a1.log` |
| C33 | C33-TAL | Fabian: handyman | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C33-fabian-handyman.a1.log` |
| C33 | C33-DIFF | Fabian: handyman | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C33-fabian-handyman.a1.log` |
| C33 | C33-REC | Fabian: handyman | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C33-fabian-handyman.a1.log` |
| C34 | C34-CUS | Evy Solutions: provisional profile | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C34-evy-solutions-provisional-profile.a1.log` |
| C34 | C34-OP | Evy Solutions: provisional profile | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C34-evy-solutions-provisional-profile.a1.log` |
| C34 | C34-TAL | Evy Solutions: provisional profile | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C34-evy-solutions-provisional-profile.a1.log` |
| C34 | C34-DIFF | Evy Solutions: provisional profile | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C34-evy-solutions-provisional-profile.a1.log` |
| C34 | C34-REC | Evy Solutions: provisional profile | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C34-evy-solutions-provisional-profile.a1.log` |
| C35 | C35-CUS | Idan: private tours | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C35-idan-private-tours.a1.log` |
| C35 | C35-OP | Idan: private tours | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C35-idan-private-tours.a1.log` |
| C35 | C35-TAL | Idan: private tours | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C35-idan-private-tours.a1.log` |
| C35 | C35-DIFF | Idan: private tours | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C35-idan-private-tours.a1.log` |
| C35 | C35-REC | Idan: private tours | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C35-idan-private-tours.a1.log` |
| C36 | C36-CUS | Zvika: custom jewelry | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C36-zvika-custom-jewelry.a1.log` |
| C36 | C36-OP | Zvika: custom jewelry | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C36-zvika-custom-jewelry.a1.log` |
| C36 | C36-TAL | Zvika: custom jewelry | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C36-zvika-custom-jewelry.a1.log` |
| C36 | C36-DIFF | Zvika: custom jewelry | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C36-zvika-custom-jewelry.a1.log` |
| C36 | C36-REC | Zvika: custom jewelry | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C36-zvika-custom-jewelry.a1.log` |
| C37 | C37-CUS | Independent portrait photographer | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C37-independent-portrait-photographer.a1.log` |
| C37 | C37-OP | Independent portrait photographer | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C37-independent-portrait-photographer.a1.log` |
| C37 | C37-TAL | Independent portrait photographer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C37-independent-portrait-photographer.a1.log` |
| C37 | C37-DIFF | Independent portrait photographer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C37-independent-portrait-photographer.a1.log` |
| C37 | C37-REC | Independent portrait photographer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C37-independent-portrait-photographer.a1.log` |
| C38 | C38-CUS | Independent DJ | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C38-independent-dj.a1.log` |
| C38 | C38-OP | Independent DJ | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C38-independent-dj.a1.log` |
| C38 | C38-TAL | Independent DJ | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C38-independent-dj.a1.log` |
| C38 | C38-DIFF | Independent DJ | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C38-independent-dj.a1.log` |
| C38 | C38-REC | Independent DJ | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C38-independent-dj.a1.log` |
| C39 | C39-CUS | Private language tutor | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C39-private-language-tutor.a1.log` |
| C39 | C39-OP | Private language tutor | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C39-private-language-tutor.a1.log` |
| C39 | C39-TAL | Private language tutor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C39-private-language-tutor.a1.log` |
| C39 | C39-DIFF | Private language tutor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C39-private-language-tutor.a1.log` |
| C39 | C39-REC | Private language tutor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C39-private-language-tutor.a1.log` |
| C40 | C40-CUS | Independent personal trainer | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C40-independent-personal-trainer.a1.log` |
| C40 | C40-OP | Independent personal trainer | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C40-independent-personal-trainer.a1.log` |
| C40 | C40-TAL | Independent personal trainer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C40-independent-personal-trainer.a1.log` |
| C40 | C40-DIFF | Independent personal trainer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C40-independent-personal-trainer.a1.log` |
| C40 | C40-REC | Independent personal trainer | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C40-independent-personal-trainer.a1.log` |
| C41 | C41-CUS | Freelance makeup artist | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C41-freelance-makeup-artist.a1.log` |
| C41 | C41-OP | Freelance makeup artist | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C41-freelance-makeup-artist.a1.log` |
| C41 | C41-TAL | Freelance makeup artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C41-freelance-makeup-artist.a1.log` |
| C41 | C41-DIFF | Freelance makeup artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C41-freelance-makeup-artist.a1.log` |
| C41 | C41-REC | Freelance makeup artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C41-freelance-makeup-artist.a1.log` |
| C42 | C42-CUS | Freelance translator | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C42-freelance-translator.a1.log` |
| C42 | C42-OP | Freelance translator | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C42-freelance-translator.a1.log` |
| C42 | C42-TAL | Freelance translator | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C42-freelance-translator.a1.log` |
| C42 | C42-DIFF | Freelance translator | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C42-freelance-translator.a1.log` |
| C42 | C42-REC | Freelance translator | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C42-freelance-translator.a1.log` |
| C43 | C43-CUS | Independent dog walker | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C43-independent-dog-walker.a1.log` |
| C43 | C43-OP | Independent dog walker | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C43-independent-dog-walker.a1.log` |
| C43 | C43-TAL | Independent dog walker | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C43-independent-dog-walker.a1.log` |
| C43 | C43-DIFF | Independent dog walker | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C43-independent-dog-walker.a1.log` |
| C43 | C43-REC | Independent dog walker | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C43-independent-dog-walker.a1.log` |
| C44 | C44-CUS | Independent yoga instructor | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C44-independent-yoga-instructor.a1.log` |
| C44 | C44-OP | Independent yoga instructor | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C44-independent-yoga-instructor.a1.log` |
| C44 | C44-TAL | Independent yoga instructor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C44-independent-yoga-instructor.a1.log` |
| C44 | C44-DIFF | Independent yoga instructor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C44-independent-yoga-instructor.a1.log` |
| C44 | C44-REC | Independent yoga instructor | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C44-independent-yoga-instructor.a1.log` |
| C45 | C45-CUS | Voice-over artist | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C45-voice-over-artist.a1.log` |
| C45 | C45-OP | Voice-over artist | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C45-voice-over-artist.a1.log` |
| C45 | C45-TAL | Voice-over artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C45-voice-over-artist.a1.log` |
| C45 | C45-DIFF | Voice-over artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C45-voice-over-artist.a1.log` |
| C45 | C45-REC | Voice-over artist | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C45-voice-over-artist.a1.log` |
| C46 | C46-CUS | Mobile car-detailing professional | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C46-mobile-car-detailing-professional.a1.log` |
| C46 | C46-OP | Mobile car-detailing professional | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C46-mobile-car-detailing-professional.a1.log` |
| C46 | C46-TAL | Mobile car-detailing professional | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C46-mobile-car-detailing-professional.a1.log` |
| C46 | C46-DIFF | Mobile car-detailing professional | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C46-mobile-car-detailing-professional.a1.log` |
| C46 | C46-REC | Mobile car-detailing professional | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C46-mobile-car-detailing-professional.a1.log` |
| C47 | C47-CUS | Independent musician | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C47-independent-musician.a1.log` |
| C47 | C47-OP | Independent musician | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C47-independent-musician.a1.log` |
| C47 | C47-TAL | Independent musician | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C47-independent-musician.a1.log` |
| C47 | C47-DIFF | Independent musician | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C47-independent-musician.a1.log` |
| C47 | C47-REC | Independent musician | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C47-independent-musician.a1.log` |
| C48 | C48-CUS | Independent event host or MC | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C48-independent-event-host-or-mc.a1.log` |
| C48 | C48-OP | Independent event host or MC | passed (smoke, not a journey pass) — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C48-independent-event-host-or-mc.a1.log` |
| C48 | C48-TAL | Independent event host or MC | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C48-independent-event-host-or-mc.a1.log` |
| C48 | C48-DIFF | Independent event host or MC | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C48-independent-event-host-or-mc.a1.log` |
| C48 | C48-REC | Independent event host or MC | no automated case in this suite | `docs/plans/program/evidence/cases-run/2026-09-11/logs/C48-independent-event-host-or-mc.a1.log` |

## Program specs (not the CS-01–48 role grid)

| Spec | Status | Evidence |
|---|---|---|
| PERM-cross-workspace | passed — 5/5, 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/PERM-cross-workspace.a1.log` |
| SELL-catalog-events-spaces-discounts | passed — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/SELL-catalog-events-spaces-discounts.a1.log` |
| MONEY-manager-reads-the-money | passed — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/MONEY-manager-reads-the-money.a1.log` |
| POS-counter-cash-sale | passed — 4/4, 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/POS-counter-cash-sale.a1.log` |
| POS-floor-mode | passed — after Settings identity check (no h1). 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/POS-floor-mode.r1.log` |
| POS-platform-switch | passed — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/POS-platform-switch.a1.log` |
| POS-projects-collect-a-balance | failed-fixture — owner JWT cannot INSERT `orders` for the cancelled-order seed (42501; no service-role key). 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/POS-projects-collect-a-balance.a2.log` |
| pos-scanner | failed-fixture — owner JWT cannot INSERT `links` (42501). 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/pos-scanner.a2.log` |
| pos-customer-display | passed — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/pos-customer-display.a1.log` |
| VENUE-join-and-refusal | passed — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/VENUE-join-and-refusal.a1.log` |
| VENUE-table-service | failed-fixture — Add to waiting list refused “The room is full for that turn.” (7 parties already waiting; leftover reservations the runner cannot release). Overlay stays up, so Waiting is unreachable. 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/VENUE-table-service.r1.log` |
| VENUE-refusals-in-words | passed — 2026-09-11, host dd74cf00f | `docs/plans/program/evidence/cases-run/2026-09-11/logs/VENUE-refusals-in-words.a1.log` |

Records (CS role grid): **240**. Passed (including smoke): **88**. Failed or mixed: **12**. No automated case in this suite: **140**. Blocked-external: **0**.
