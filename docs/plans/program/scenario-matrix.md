# Case-to-scenario matrix

Honest checkpoint: **0 passed**. Skipped Playwright is not a pass.

**Parity aliases:** Master cases are `CS-01`–`CS-48` (same businesses as `C01`–`C48`
evidence dirs). Catalog QA is `C-01`–`C-32`. Full 404 scenario register:
[`scenario-register-404.md`](scenario-register-404.md).

| Case | Scenario | Title | Status | Evidence |
|---|---|---|---|---|
| C01 | C01-CUS | Nail salon | awaiting external verification — deposit requested, not collected (card payment; Stripe test keys and a Mercado Pago sandbox are not yet supplied on the isolated preview, so the checkout helper degrades to a mock; see D-100) | `qa-evidence/C01-CUS/deposit.md` |
| C01 | C01-OP | Nail salon | not started | `qa-evidence/C01-OP/` |
| C01 | C01-TAL | Nail salon | not started | `qa-evidence/C01-TAL/` |
| C01 | C01-DIFF | Nail salon | not started | `qa-evidence/C01-DIFF/` |
| C01 | C01-REC | Nail salon | not started | `qa-evidence/C01-REC/` |
| C02 | C02-CUS | Spa | implementing — last-resource + couples set (not C02 complete) | `qa-evidence/C02-CUS/` |
| C02 | C02-OP | Spa | not started | `qa-evidence/C02-OP/` |
| C02 | C02-TAL | Spa | not started | `qa-evidence/C02-TAL/` |
| C02 | C02-DIFF | Spa | implementing — couples then competitor cannot take | `qa-evidence/C02-DIFF/competitor-after-couples.md` |
| C02 | C02-REC | Spa | not started | `qa-evidence/C02-REC/` |
| C03 | C03-CUS | Independent massage therapist | not started | `qa-evidence/C03-CUS/` |
| C03 | C03-OP | Independent massage therapist | not started | `qa-evidence/C03-OP/` |
| C03 | C03-TAL | Independent massage therapist | not started | `qa-evidence/C03-TAL/` |
| C03 | C03-DIFF | Independent massage therapist | not started | `qa-evidence/C03-DIFF/` |
| C03 | C03-REC | Independent massage therapist | not started | `qa-evidence/C03-REC/` |
| C04 | C04-CUS | Tattoo studio | not started | `qa-evidence/C04-CUS/` |
| C04 | C04-OP | Tattoo studio | not started | `qa-evidence/C04-OP/` |
| C04 | C04-TAL | Tattoo studio | not started | `qa-evidence/C04-TAL/` |
| C04 | C04-DIFF | Tattoo studio | not started | `qa-evidence/C04-DIFF/` |
| C04 | C04-REC | Tattoo studio | not started | `qa-evidence/C04-REC/` |
| C05 | C05-CUS | Hair salon | not started | `qa-evidence/C05-CUS/` |
| C05 | C05-OP | Hair salon | not started | `qa-evidence/C05-OP/` |
| C05 | C05-TAL | Hair salon | not started | `qa-evidence/C05-TAL/` |
| C05 | C05-DIFF | Hair salon | not started | `qa-evidence/C05-DIFF/` |
| C05 | C05-REC | Hair salon | not started | `qa-evidence/C05-REC/` |
| C06 | C06-CUS | Restaurant | implementing — one guest reserved then ordered | `qa-evidence/C06-CUS/reserve-then-order.md` |
| C06 | C06-OP | Restaurant | implementing — walk-in cash only | `qa-evidence/C06-OP/walk-in-cash.md` |
| C06 | C06-TAL | Restaurant | not started | `qa-evidence/C06-TAL/` |
| C06 | C06-DIFF | Restaurant | not started | `qa-evidence/C06-DIFF/` |
| C06 | C06-REC | Restaurant | not started | `qa-evidence/C06-REC/` |
| C07 | C07-CUS | Bar | implementing — guest check | `qa-evidence/C07-CUS/guest-check.md` |
| C07 | C07-OP | Bar | implementing — collect at close | `qa-evidence/C07-OP/collect-at-close.md` |
| C07 | C07-TAL | Bar | not started | `qa-evidence/C07-TAL/` |
| C07 | C07-DIFF | Bar | not started | `qa-evidence/C07-DIFF/` |
| C07 | C07-REC | Bar | not started | `qa-evidence/C07-REC/` |
| C08 | C08-CUS | Modelling or talent agency | implementing — directory inquiry submitted | `qa-evidence/C08-CUS/directory-inquiry.md` |
| C08 | C08-OP | Modelling or talent agency | implementing — assign + draft + sent offer | `qa-evidence/C08-OP/assign-and-draft-offer.md`, `qa-evidence/C08-OP/send-offer.md` |
| C08 | C08-TAL | Modelling or talent agency | implementing — talent approved sent offer; client pending | `qa-evidence/C08-TAL/accept-offer.md` |
| C08 | C08-DIFF | Modelling or talent agency | not started | `qa-evidence/C08-DIFF/` |
| C08 | C08-REC | Modelling or talent agency | not started | `qa-evidence/C08-REC/` |
| C09 | C09-CUS | Yoga or fitness studio | implementing — storefront session_picker class register | `qa-evidence/C09-CUS/class-register.md` |
| C09 | C09-OP | Yoga or fitness studio | implementing — POS walk-in complimentary class | `qa-evidence/C09-OP/walk-in-class.md` |
| C09 | C09-TAL | Yoga or fitness studio | not started | `qa-evidence/C09-TAL/` |
| C09 | C09-DIFF | Yoga or fitness studio | implementing — last-seat sold-out walk-in | `qa-evidence/C09-DIFF/same-pool-sold-out.md` |
| C09 | C09-REC | Yoga or fitness studio | not started | `qa-evidence/C09-REC/` |
| C10 | C10-CUS | Photography studio | not started | `qa-evidence/C10-CUS/` |
| C10 | C10-OP | Photography studio | not started | `qa-evidence/C10-OP/` |
| C10 | C10-TAL | Photography studio | not started | `qa-evidence/C10-TAL/` |
| C10 | C10-DIFF | Photography studio | not started | `qa-evidence/C10-DIFF/` |
| C10 | C10-REC | Photography studio | not started | `qa-evidence/C10-REC/` |
| C11 | C11-CUS | Beach club | not started | `qa-evidence/C11-CUS/` |
| C11 | C11-OP | Beach club | not started | `qa-evidence/C11-OP/` |
| C11 | C11-TAL | Beach club | not started | `qa-evidence/C11-TAL/` |
| C11 | C11-DIFF | Beach club | not started | `qa-evidence/C11-DIFF/` |
| C11 | C11-REC | Beach club | not started | `qa-evidence/C11-REC/` |
| C12 | C12-CUS | Event venue | implementing — $0 ticket + admission | `qa-evidence/C12-CUS/ticket.md` |
| C12 | C12-OP | Event venue | implementing — walk-up Admit | `qa-evidence/C12-OP/door.md` |
| C12 | C12-TAL | Event venue | not started | `qa-evidence/C12-TAL/` |
| C12 | C12-DIFF | Event venue | implementing — pay-at-door cash settle | `qa-evidence/C12-DIFF/pay-at-door.md` |
| C12 | C12-REC | Event venue | not started | `qa-evidence/C12-REC/` |
| C13 | C13-CUS | Coworking space with cafe, rooms and workshops | not started | `qa-evidence/C13-CUS/` |
| C13 | C13-OP | Coworking space with cafe, rooms and workshops | not started | `qa-evidence/C13-OP/` |
| C13 | C13-TAL | Coworking space with cafe, rooms and workshops | not started | `qa-evidence/C13-TAL/` |
| C13 | C13-DIFF | Coworking space with cafe, rooms and workshops | not started | `qa-evidence/C13-DIFF/` |
| C13 | C13-REC | Coworking space with cafe, rooms and workshops | not started | `qa-evidence/C13-REC/` |
| C14 | C14-CUS | Beauty academy | not started | `qa-evidence/C14-CUS/` |
| C14 | C14-OP | Beauty academy | not started | `qa-evidence/C14-OP/` |
| C14 | C14-TAL | Beauty academy | not started | `qa-evidence/C14-TAL/` |
| C14 | C14-DIFF | Beauty academy | not started | `qa-evidence/C14-DIFF/` |
| C14 | C14-REC | Beauty academy | not started | `qa-evidence/C14-REC/` |
| C15 | C15-CUS | Cooking school | not started | `qa-evidence/C15-CUS/` |
| C15 | C15-OP | Cooking school | not started | `qa-evidence/C15-OP/` |
| C15 | C15-TAL | Cooking school | not started | `qa-evidence/C15-TAL/` |
| C15 | C15-DIFF | Cooking school | not started | `qa-evidence/C15-DIFF/` |
| C15 | C15-REC | Cooking school | not started | `qa-evidence/C15-REC/` |
| C16 | C16-CUS | Diving school | not started | `qa-evidence/C16-CUS/` |
| C16 | C16-OP | Diving school | not started | `qa-evidence/C16-OP/` |
| C16 | C16-TAL | Diving school | not started | `qa-evidence/C16-TAL/` |
| C16 | C16-DIFF | Diving school | not started | `qa-evidence/C16-DIFF/` |
| C16 | C16-REC | Diving school | not started | `qa-evidence/C16-REC/` |
| C17 | C17-CUS | Padel club | not started | `qa-evidence/C17-CUS/` |
| C17 | C17-OP | Padel club | not started | `qa-evidence/C17-OP/` |
| C17 | C17-TAL | Padel club | not started | `qa-evidence/C17-TAL/` |
| C17 | C17-DIFF | Padel club | not started | `qa-evidence/C17-DIFF/` |
| C17 | C17-REC | Padel club | not started | `qa-evidence/C17-REC/` |
| C18 | C18-CUS | Podcast studio | not started | `qa-evidence/C18-CUS/` |
| C18 | C18-OP | Podcast studio | not started | `qa-evidence/C18-OP/` |
| C18 | C18-TAL | Podcast studio | not started | `qa-evidence/C18-TAL/` |
| C18 | C18-DIFF | Podcast studio | not started | `qa-evidence/C18-DIFF/` |
| C18 | C18-REC | Podcast studio | not started | `qa-evidence/C18-REC/` |
| C19 | C19-CUS | Pet grooming salon | not started | `qa-evidence/C19-CUS/` |
| C19 | C19-OP | Pet grooming salon | not started | `qa-evidence/C19-OP/` |
| C19 | C19-TAL | Pet grooming salon | not started | `qa-evidence/C19-TAL/` |
| C19 | C19-DIFF | Pet grooming salon | not started | `qa-evidence/C19-DIFF/` |
| C19 | C19-REC | Pet grooming salon | not started | `qa-evidence/C19-REC/` |
| C20 | C20-CUS | Art gallery | not started | `qa-evidence/C20-CUS/` |
| C20 | C20-OP | Art gallery | not started | `qa-evidence/C20-OP/` |
| C20 | C20-TAL | Art gallery | not started | `qa-evidence/C20-TAL/` |
| C20 | C20-DIFF | Art gallery | not started | `qa-evidence/C20-DIFF/` |
| C20 | C20-REC | Art gallery | not started | `qa-evidence/C20-REC/` |
| C21 | C21-CUS | Wellness retreat organiser | not started | `qa-evidence/C21-CUS/` |
| C21 | C21-OP | Wellness retreat organiser | not started | `qa-evidence/C21-OP/` |
| C21 | C21-TAL | Wellness retreat organiser | not started | `qa-evidence/C21-TAL/` |
| C21 | C21-DIFF | Wellness retreat organiser | not started | `qa-evidence/C21-DIFF/` |
| C21 | C21-REC | Wellness retreat organiser | not started | `qa-evidence/C21-REC/` |
| C22 | C22-CUS | Corporate training provider | not started | `qa-evidence/C22-CUS/` |
| C22 | C22-OP | Corporate training provider | not started | `qa-evidence/C22-OP/` |
| C22 | C22-TAL | Corporate training provider | not started | `qa-evidence/C22-TAL/` |
| C22 | C22-DIFF | Corporate training provider | not started | `qa-evidence/C22-DIFF/` |
| C22 | C22-REC | Corporate training provider | not started | `qa-evidence/C22-REC/` |
| C23 | C23-CUS | Floral design studio | not started | `qa-evidence/C23-CUS/` |
| C23 | C23-OP | Floral design studio | not started | `qa-evidence/C23-OP/` |
| C23 | C23-TAL | Floral design studio | not started | `qa-evidence/C23-TAL/` |
| C23 | C23-DIFF | Floral design studio | not started | `qa-evidence/C23-DIFF/` |
| C23 | C23-REC | Floral design studio | not started | `qa-evidence/C23-REC/` |
| C24 | C24-CUS | Escape room | not started | `qa-evidence/C24-CUS/` |
| C24 | C24-OP | Escape room | not started | `qa-evidence/C24-OP/` |
| C24 | C24-TAL | Escape room | not started | `qa-evidence/C24-TAL/` |
| C24 | C24-DIFF | Escape room | not started | `qa-evidence/C24-DIFF/` |
| C24 | C24-REC | Escape room | not started | `qa-evidence/C24-REC/` |
| C25 | C25-CUS | Sushi restaurant with takeaway | not started | `qa-evidence/C25-CUS/` |
| C25 | C25-OP | Sushi restaurant with takeaway | not started | `qa-evidence/C25-OP/` |
| C25 | C25-TAL | Sushi restaurant with takeaway | not started | `qa-evidence/C25-TAL/` |
| C25 | C25-DIFF | Sushi restaurant with takeaway | not started | `qa-evidence/C25-DIFF/` |
| C25 | C25-REC | Sushi restaurant with takeaway | not started | `qa-evidence/C25-REC/` |
| C26 | C26-CUS | Jesus: frozen pizza from home | not started | `qa-evidence/C26-CUS/` |
| C26 | C26-OP | Jesus: frozen pizza from home | implementing — pickup handoff | `qa-evidence/C26-OP/pickup-handoff.md` |
| C26 | C26-TAL | Jesus: frozen pizza from home | not started | `qa-evidence/C26-TAL/` |
| C26 | C26-DIFF | Jesus: frozen pizza from home | not started | `qa-evidence/C26-DIFF/` |
| C26 | C26-REC | Jesus: frozen pizza from home | not started | `qa-evidence/C26-REC/` |
| C27 | C27-CUS | Laura: social media agency | not started | `qa-evidence/C27-CUS/` |
| C27 | C27-OP | Laura: social media agency | not started | `qa-evidence/C27-OP/` |
| C27 | C27-TAL | Laura: social media agency | not started | `qa-evidence/C27-TAL/` |
| C27 | C27-DIFF | Laura: social media agency | not started | `qa-evidence/C27-DIFF/` |
| C27 | C27-REC | Laura: social media agency | not started | `qa-evidence/C27-REC/` |
| C28 | C28-CUS | Eyelash business with five workers | not started | `qa-evidence/C28-CUS/` |
| C28 | C28-OP | Eyelash business with five workers | not started | `qa-evidence/C28-OP/` |
| C28 | C28-TAL | Eyelash business with five workers | not started | `qa-evidence/C28-TAL/` |
| C28 | C28-DIFF | Eyelash business with five workers | not started | `qa-evidence/C28-DIFF/` |
| C28 | C28-REC | Eyelash business with five workers | not started | `qa-evidence/C28-REC/` |
| C29 | C29-CUS | Alejandra: immigration solutions | not started | `qa-evidence/C29-CUS/` |
| C29 | C29-OP | Alejandra: immigration solutions | not started | `qa-evidence/C29-OP/` |
| C29 | C29-TAL | Alejandra: immigration solutions | not started | `qa-evidence/C29-TAL/` |
| C29 | C29-DIFF | Alejandra: immigration solutions | not started | `qa-evidence/C29-DIFF/` |
| C29 | C29-REC | Alejandra: immigration solutions | not started | `qa-evidence/C29-REC/` |
| C30 | C30-CUS | Tania: massage therapist | not started | `qa-evidence/C30-CUS/` |
| C30 | C30-OP | Tania: massage therapist | not started | `qa-evidence/C30-OP/` |
| C30 | C30-TAL | Tania: massage therapist | not started | `qa-evidence/C30-TAL/` |
| C30 | C30-DIFF | Tania: massage therapist | not started | `qa-evidence/C30-DIFF/` |
| C30 | C30-REC | Tania: massage therapist | not started | `qa-evidence/C30-REC/` |
| C31 | C31-CUS | Chris: private chef | not started | `qa-evidence/C31-CUS/` |
| C31 | C31-OP | Chris: private chef | not started | `qa-evidence/C31-OP/` |
| C31 | C31-TAL | Chris: private chef | not started | `qa-evidence/C31-TAL/` |
| C31 | C31-DIFF | Chris: private chef | not started | `qa-evidence/C31-DIFF/` |
| C31 | C31-REC | Chris: private chef | not started | `qa-evidence/C31-REC/` |
| C32 | C32-CUS | Independent house cleaner | not started | `qa-evidence/C32-CUS/` |
| C32 | C32-OP | Independent house cleaner | not started | `qa-evidence/C32-OP/` |
| C32 | C32-TAL | Independent house cleaner | not started | `qa-evidence/C32-TAL/` |
| C32 | C32-DIFF | Independent house cleaner | not started | `qa-evidence/C32-DIFF/` |
| C32 | C32-REC | Independent house cleaner | not started | `qa-evidence/C32-REC/` |
| C33 | C33-CUS | Fabian: handyman | not started | `qa-evidence/C33-CUS/` |
| C33 | C33-OP | Fabian: handyman | not started | `qa-evidence/C33-OP/` |
| C33 | C33-TAL | Fabian: handyman | not started | `qa-evidence/C33-TAL/` |
| C33 | C33-DIFF | Fabian: handyman | not started | `qa-evidence/C33-DIFF/` |
| C33 | C33-REC | Fabian: handyman | not started | `qa-evidence/C33-REC/` |
| C34 | C34-CUS | Evy Solutions: provisional profile | not started | `qa-evidence/C34-CUS/` |
| C34 | C34-OP | Evy Solutions: provisional profile | not started | `qa-evidence/C34-OP/` |
| C34 | C34-TAL | Evy Solutions: provisional profile | not started | `qa-evidence/C34-TAL/` |
| C34 | C34-DIFF | Evy Solutions: provisional profile | not started | `qa-evidence/C34-DIFF/` |
| C34 | C34-REC | Evy Solutions: provisional profile | not started | `qa-evidence/C34-REC/` |
| C35 | C35-CUS | Idan: private tours | not started | `qa-evidence/C35-CUS/` |
| C35 | C35-OP | Idan: private tours | not started | `qa-evidence/C35-OP/` |
| C35 | C35-TAL | Idan: private tours | not started | `qa-evidence/C35-TAL/` |
| C35 | C35-DIFF | Idan: private tours | not started | `qa-evidence/C35-DIFF/` |
| C35 | C35-REC | Idan: private tours | not started | `qa-evidence/C35-REC/` |
| C36 | C36-CUS | Zvika: custom jewelry | not started | `qa-evidence/C36-CUS/` |
| C36 | C36-OP | Zvika: custom jewelry | not started | `qa-evidence/C36-OP/` |
| C36 | C36-TAL | Zvika: custom jewelry | not started | `qa-evidence/C36-TAL/` |
| C36 | C36-DIFF | Zvika: custom jewelry | not started | `qa-evidence/C36-DIFF/` |
| C36 | C36-REC | Zvika: custom jewelry | not started | `qa-evidence/C36-REC/` |
| C37 | C37-CUS | Independent portrait photographer | not started | `qa-evidence/C37-CUS/` |
| C37 | C37-OP | Independent portrait photographer | not started | `qa-evidence/C37-OP/` |
| C37 | C37-TAL | Independent portrait photographer | not started | `qa-evidence/C37-TAL/` |
| C37 | C37-DIFF | Independent portrait photographer | not started | `qa-evidence/C37-DIFF/` |
| C37 | C37-REC | Independent portrait photographer | not started | `qa-evidence/C37-REC/` |
| C38 | C38-CUS | Independent DJ | not started | `qa-evidence/C38-CUS/` |
| C38 | C38-OP | Independent DJ | not started | `qa-evidence/C38-OP/` |
| C38 | C38-TAL | Independent DJ | not started | `qa-evidence/C38-TAL/` |
| C38 | C38-DIFF | Independent DJ | not started | `qa-evidence/C38-DIFF/` |
| C38 | C38-REC | Independent DJ | not started | `qa-evidence/C38-REC/` |
| C39 | C39-CUS | Private language tutor | not started | `qa-evidence/C39-CUS/` |
| C39 | C39-OP | Private language tutor | not started | `qa-evidence/C39-OP/` |
| C39 | C39-TAL | Private language tutor | not started | `qa-evidence/C39-TAL/` |
| C39 | C39-DIFF | Private language tutor | not started | `qa-evidence/C39-DIFF/` |
| C39 | C39-REC | Private language tutor | not started | `qa-evidence/C39-REC/` |
| C40 | C40-CUS | Independent personal trainer | not started | `qa-evidence/C40-CUS/` |
| C40 | C40-OP | Independent personal trainer | not started | `qa-evidence/C40-OP/` |
| C40 | C40-TAL | Independent personal trainer | not started | `qa-evidence/C40-TAL/` |
| C40 | C40-DIFF | Independent personal trainer | not started | `qa-evidence/C40-DIFF/` |
| C40 | C40-REC | Independent personal trainer | not started | `qa-evidence/C40-REC/` |
| C41 | C41-CUS | Freelance makeup artist | not started | `qa-evidence/C41-CUS/` |
| C41 | C41-OP | Freelance makeup artist | not started | `qa-evidence/C41-OP/` |
| C41 | C41-TAL | Freelance makeup artist | not started | `qa-evidence/C41-TAL/` |
| C41 | C41-DIFF | Freelance makeup artist | not started | `qa-evidence/C41-DIFF/` |
| C41 | C41-REC | Freelance makeup artist | not started | `qa-evidence/C41-REC/` |
| C42 | C42-CUS | Freelance translator | not started | `qa-evidence/C42-CUS/` |
| C42 | C42-OP | Freelance translator | not started | `qa-evidence/C42-OP/` |
| C42 | C42-TAL | Freelance translator | not started | `qa-evidence/C42-TAL/` |
| C42 | C42-DIFF | Freelance translator | not started | `qa-evidence/C42-DIFF/` |
| C42 | C42-REC | Freelance translator | not started | `qa-evidence/C42-REC/` |
| C43 | C43-CUS | Independent dog walker | not started | `qa-evidence/C43-CUS/` |
| C43 | C43-OP | Independent dog walker | not started | `qa-evidence/C43-OP/` |
| C43 | C43-TAL | Independent dog walker | not started | `qa-evidence/C43-TAL/` |
| C43 | C43-DIFF | Independent dog walker | not started | `qa-evidence/C43-DIFF/` |
| C43 | C43-REC | Independent dog walker | not started | `qa-evidence/C43-REC/` |
| C44 | C44-CUS | Independent yoga instructor | not started | `qa-evidence/C44-CUS/` |
| C44 | C44-OP | Independent yoga instructor | not started | `qa-evidence/C44-OP/` |
| C44 | C44-TAL | Independent yoga instructor | not started | `qa-evidence/C44-TAL/` |
| C44 | C44-DIFF | Independent yoga instructor | not started | `qa-evidence/C44-DIFF/` |
| C44 | C44-REC | Independent yoga instructor | not started | `qa-evidence/C44-REC/` |
| C45 | C45-CUS | Voice-over artist | not started | `qa-evidence/C45-CUS/` |
| C45 | C45-OP | Voice-over artist | not started | `qa-evidence/C45-OP/` |
| C45 | C45-TAL | Voice-over artist | not started | `qa-evidence/C45-TAL/` |
| C45 | C45-DIFF | Voice-over artist | not started | `qa-evidence/C45-DIFF/` |
| C45 | C45-REC | Voice-over artist | not started | `qa-evidence/C45-REC/` |
| C46 | C46-CUS | Mobile car-detailing professional | not started | `qa-evidence/C46-CUS/` |
| C46 | C46-OP | Mobile car-detailing professional | not started | `qa-evidence/C46-OP/` |
| C46 | C46-TAL | Mobile car-detailing professional | not started | `qa-evidence/C46-TAL/` |
| C46 | C46-DIFF | Mobile car-detailing professional | not started | `qa-evidence/C46-DIFF/` |
| C46 | C46-REC | Mobile car-detailing professional | not started | `qa-evidence/C46-REC/` |
| C47 | C47-CUS | Independent musician | not started | `qa-evidence/C47-CUS/` |
| C47 | C47-OP | Independent musician | not started | `qa-evidence/C47-OP/` |
| C47 | C47-TAL | Independent musician | not started | `qa-evidence/C47-TAL/` |
| C47 | C47-DIFF | Independent musician | not started | `qa-evidence/C47-DIFF/` |
| C47 | C47-REC | Independent musician | not started | `qa-evidence/C47-REC/` |
| C48 | C48-CUS | Independent event host or MC | not started | `qa-evidence/C48-CUS/` |
| C48 | C48-OP | Independent event host or MC | not started | `qa-evidence/C48-OP/` |
| C48 | C48-TAL | Independent event host or MC | not started | `qa-evidence/C48-TAL/` |
| C48 | C48-DIFF | Independent event host or MC | not started | `qa-evidence/C48-DIFF/` |
| C48 | C48-REC | Independent event host or MC | not started | `qa-evidence/C48-REC/` |

Records: **240**. Passed: **0**. Failed: **0**. Blocked on isolated fixture: **240**.

## Wiring

One row per engine control. Status is the 2026-09-12 Cloud Agent run: specs exist; the browser suite did not execute (isolated env + bypass secret missing). Evidence: `docs/plans/program/evidence/wiring-verify/2026-09-12/`.

| Control | Scenario | Title | Status | Evidence |
|---|---|---|---|---|
| 1.1 | WIRE-1.1 | Custom amount under limit | could not run | `e2e/cases/WIRE-1-custom-amount.spec.ts` |
| 1.2 | WIRE-1.2 | Custom amount over limit + PIN | could not run | `e2e/cases/WIRE-1-manager-pin.spec.ts` |
| 1.3 | WIRE-1.3 | Staff PIN + custom-amount limit | could not run | `e2e/cases/WIRE-1-staff-pin-limit.spec.ts` |
| 1.4 | WIRE-1.4 | Lock / unlock / switch operator | could not run | `e2e/cases/WIRE-1-lock.spec.ts` |
| 1.5 | WIRE-1.5 | Link booking | could not run | `e2e/cases/WIRE-1-link-booking.spec.ts` |
| 1.6 | WIRE-1.6 | Tip | could not run | `e2e/cases/WIRE-1-tip.spec.ts` |
| 1.7 | WIRE-1.7 | Payment link | could not run | `e2e/cases/WIRE-1-payment-link.spec.ts` |
| 1.8 | WIRE-1.8 | Table move | could not run | `e2e/cases/WIRE-1-table-move.spec.ts` |
| 1.9 | WIRE-1.9 | Split / merge / change server | could not run | `e2e/cases/WIRE-1-split-merge-server.spec.ts` |
| 1.10 | WIRE-1.10 | Class waitlist offer | could not run | `e2e/cases/WIRE-1-class-waitlist.spec.ts` |
| 1.11 | WIRE-1.11 | Cash movements + close | could not run | `e2e/cases/WIRE-1-cash-movements.spec.ts` |
| 2.1 | WIRE-2.1 | New series + Generate sessions | could not run | `e2e/cases/WIRE-2-series.spec.ts` |
| 2.2 | WIRE-2.2 | Substitute instructor | could not run | `e2e/cases/WIRE-2-substitute.spec.ts` |
| 2.3 | WIRE-2.3 | Move participant | could not run | `e2e/cases/WIRE-2-move-participant.spec.ts` |
| 2.4 | WIRE-2.4 | Cancel session | could not run | `e2e/cases/WIRE-2-cancel-session.spec.ts` |
| 2.5 | WIRE-2.5 | Cancel appointment | could not run | `e2e/cases/WIRE-2-cancel-appointment.spec.ts` |
| 2.6 | WIRE-2.6 | Customer self-manage | could not run | `e2e/cases/WIRE-2-customer-manage.spec.ts` |
| 2.7 | WIRE-2.7 | Replace talent | could not run | `e2e/cases/WIRE-2-replace-talent.spec.ts` |
| 2.8 | WIRE-2.8 | Amendment send / discard | could not run | `e2e/cases/WIRE-2-amendment.spec.ts` |
| 2.9 | WIRE-2.9 | Milestone amount + file | could not run | `e2e/cases/WIRE-2-milestone.spec.ts` |
| 2.10 | WIRE-2.10 | Archive / reopen project | could not run | `e2e/cases/WIRE-2-archive-project.spec.ts` |
| 2.11 | WIRE-2.11 | Package + price phases | could not run | `e2e/cases/WIRE-2-package-phases.spec.ts` |
| 2.12 | WIRE-2.12 | Booking policy overrides | could not run | `e2e/cases/WIRE-2-booking-policy.spec.ts` |
| 2.13 | WIRE-2.13 | Approval + role limit | could not run | `e2e/cases/WIRE-2-approvals.spec.ts` |
| 3.1 | WIRE-3.1 | Locations & zones | could not run | `e2e/cases/WIRE-3-locations.spec.ts` |
| 3.2 | WIRE-3.2 | Party waitlist | could not run | `e2e/cases/WIRE-3-party-waitlist.spec.ts` |
| 3.3 | WIRE-3.3 | Layout editor | could not run | `e2e/cases/WIRE-3-layouts.spec.ts` |
| 3.4 | WIRE-3.4 | Service periods | could not run | `e2e/cases/WIRE-3-service-periods.spec.ts` |
| 3.5 | WIRE-3.5 | Prep stations + fire | could not run | `e2e/cases/WIRE-3-prep-stations.spec.ts` |
| 3.6 | WIRE-3.6 | Guest QR | could not run | `e2e/cases/WIRE-3-guest-qr.spec.ts` |
| 3.7 | WIRE-3.7 | Seat hold | could not run | `e2e/cases/WIRE-3-seat-hold.spec.ts` |
| 3.8 | WIRE-3.8 | Exchange / comp / delivery | could not run | `e2e/cases/WIRE-3-exchange-comp.spec.ts` |
| 3.9 | WIRE-3.9 | Ticket page | could not run | `e2e/cases/WIRE-3-ticket-page.spec.ts` |
| 3.10 | WIRE-3.10 | Devices + outbox | could not run | `e2e/cases/WIRE-3-devices.spec.ts` |
| 4.1 | WIRE-4.1 | Rail unread | could not run | `e2e/cases/WIRE-4-rail-unread.spec.ts` |
| 4.2 | WIRE-4.2 | MSG-P prototypes | could not run | `e2e/cases/MSG-P1-pizza-counter.spec.ts` |
| 4.3 | WIRE-4.3 | From Messages origin | could not run | `e2e/cases/WIRE-4-from-messages.spec.ts` |
| 4.4 | WIRE-4.4 | Workspace chips | could not run | `e2e/cases/WIRE-4-workspace-chips.spec.ts` |
| 4.5 | WIRE-4.5 | Reminders / delivery cron | could not run | `e2e/cases/WIRE-4-crons.spec.ts` |
| 4.6 | WIRE-4.6 | Customer thread | could not run | `e2e/cases/WIRE-4-customer-thread.spec.ts` |
