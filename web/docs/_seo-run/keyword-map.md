# Tulala Keyword Map + Phase C Page Briefs

**Date:** 2026-07-22
**Status:** PLAN ONLY. No pages are to be built from this document until Phase A/B foundations ship and this plan is approved.
**Parent doc:** `web/docs/tulala-seo-organic-marketing-audit-2026-07-22.md` (Phase C section)

---

## 0. Ground rules (binding)

1. **Every keyword maps to a real feature.** The feature column in each brief names something the product actually does today: one-click page builder, booking messenger (request to offer to booking to payment in one chat), reservations and deposits, shared cross-roster discovery network, talent + workspace hybrid account, free subdomain with custom-domain upgrade, EN/ES bilingual, multi-currency, integrations and API, public talent directory. If a page brief cannot name its feature tie-in, the page does not get built.
2. **No thin pages.** A page ships only when it has: a distinct audience, a distinct search intent, original body content (not a re-skin of a sibling page), and at least one product screenshot or live example. A category page that only swaps the noun ("models" to "dancers") with identical body copy is a thin page and is rejected.
3. **No invented data.** No fabricated search volumes, reviews, ratings, customer counts, competitor feature claims, prices not on the live pricing page, or locations where nothing exists. Search-volume estimates below are qualitative (High/Med/Low/Long-tail) and must be validated in Search Console + a keyword tool before each build wave.
4. **No em dashes in any user-facing copy** produced from these briefs. No AI-tell phrasing (seamless, revolutionize, unlock, empty three-part lists).
5. **Bilingual by design.** Every commercial page in this plan ships EN + ES together (same URL locale model as the rest of marketing, with hreflang from Phase A3). ES keywords are first-class, not translations of the EN list; see section 6.
6. **Comparison pages are category-honest.** We compare against *categories of tooling* (link-in-bio pages, generic website builders, spreadsheets and DMs, generic scheduling tools), never against named competitors with claimed feature matrices we have not verified.

---

## 1. Keyword universe by audience (summary)

| Audience | Head intent | What they type | Money page family |
|---|---|---|---|
| Independent talent (models, singers, musicians, performers, dancers, chefs, photographers, creators, service pros) | Commercial: get a professional page + get booked + get paid | "booking page for models", "how do freelance singers get paid", "portfolio website with booking" | Talent-category landing pages (§2) |
| Agencies and studios | Commercial: run roster + brand + pipeline | "talent agency software", "model agency management platform", "booking software for studios" | Business-audience pages (§3) |
| Staffing networks / hubs | Commercial: multi-roster coordination | "staffing platform for events", "talent network software" | Business-audience pages (§3) |
| Talent managers | Commercial: manage a small roster | "software to manage talent bookings", "talent manager tools" | Business-audience pages (§3) |
| Clients hiring talent | Transactional: find + book a person | "hire a singer for an event", "book a private chef" | Directory-backed hire pages (§4) |
| Everyone (early funnel) | Informational: how the industry works | "what is a booking deposit", "how does a talent agency commission work" | Resource hub + glossary (§5) |
| Switchers | Commercial-investigation: compare tools | "linktree alternative for musicians", "better than a website builder for bookings" | Comparison pages (§6 briefs in §5.3) |

Intent notation used below: **C** = commercial, **I** = informational, **CI** = commercial-investigation, **T** = transactional.

---

## 2. Pillar A: Talent-category landing pages

Pattern: `/for/{category}` (final slugs TBD with routing owner; must not collide with tenant slugs). Each page = category-specific hero, 2-3 category-specific product moments (what a booking looks like for THIS kind of work), a real template/profile screenshot, pricing pointer, FAQ block (3-5 category-specific questions, reusable in FAQPage schema per Phase B3).

Wave 1 = the four categories with the strongest product story today (profile templates and demo flows exist for model, singer/musician, chef, tattoo/artist work). Wave 2 follows only after Wave 1 pages are indexed and earning impressions.

### A1. Booking pages for models
- **Audience:** freelance/independent models; new faces without agency representation.
- **Primary keyword (C):** booking page for models
- **Secondary:** model portfolio website with booking, freelance model website, model comp card online
- **Long-tail:** how do freelance models get booked without an agency; model portfolio site that takes deposits; digicard vs comp card website
- **Intent:** C with an I-shaped long tail.
- **Unique value:** shows the model-specific flow: portfolio grid, measurements/details fields, inquiry to offer to paid booking in one chat, deposit to kill no-shows.
- **Feature tie-in:** profile templates + field engine (model category fields), booking messenger, deposits, free subdomain.
- **Priority:** Wave 1.

### A2. Booking pages for singers and musicians
- **Audience:** vocalists, session musicians, wedding/event performers, small bands.
- **Primary (C):** booking website for musicians
- **Secondary:** singer booking page, how to get booked for gigs, EPK with booking button
- **Long-tail:** website for wedding singers that takes deposits; how much deposit to charge for a gig; band booking inquiry form
- **Intent:** C + I long tail.
- **Unique value:** gig-shaped flow: date + venue + set length in the inquiry, offer with a price, deposit up front; EPK-style profile.
- **Feature tie-in:** booking messenger with structured inquiry, reservations and deposits, profile templates.
- **Priority:** Wave 1.

### A3. Booking pages for private chefs and culinary pros
- **Audience:** private chefs, caterers, pop-up cooks, mixologists.
- **Primary (C):** private chef booking website
- **Secondary:** website for personal chefs, catering inquiry page, chef services page
- **Long-tail:** how do private chefs take deposits; private chef menu and pricing page; booking page for supper clubs
- **Intent:** C.
- **Unique value:** menu-as-services catalog, per-event quoting via offers, deposits for date-holding.
- **Feature tie-in:** services catalog and pricing, offer flow, deposits, multi-currency.
- **Priority:** Wave 1.

### A4. Booking pages for photographers
- **Audience:** portrait/event/brand photographers.
- **Primary (C):** photography booking website
- **Secondary:** photographer portfolio with booking, client booking page for photographers
- **Long-tail:** photography mini session booking page; how to collect a retainer for a photoshoot; photography inquiry form that converts
- **Intent:** C.
- **Unique value:** package-based services (hourly/half-day/day), gallery-first templates, retainer/deposit language photographers already use.
- **Feature tie-in:** services catalog, page builder galleries, deposits, custom domain upgrade.
- **Priority:** Wave 1.

### A5. Booking pages for dancers and performers
- **Audience:** dancers, choreographers, circus/variety, entertainers.
- **Primary (C):** dancer booking page
- **Secondary:** performer booking website, entertainment booking page for events
- **Long-tail:** how do dancers get corporate event bookings; choreographer for hire page
- **Intent:** C.
- **Priority:** Wave 2.
- **Feature tie-in:** profile + booking messenger; shared network discovery (event planners browsing the directory).

### A6. Booking pages for makeup artists, stylists and beauty pros
- **Audience:** MUAs, hair stylists, nail artists, barbers working freelance.
- **Primary (C):** booking page for makeup artists
- **Secondary:** freelance MUA website, hair stylist booking site
- **Long-tail:** makeup artist deposit policy page; bridal makeup booking form
- **Intent:** C.
- **Priority:** Wave 2.
- **Feature tie-in:** slots/calendar reservations, deposits, services menu.

### A7. Booking pages for tattoo artists
- **Audience:** independent tattoo artists and guest artists.
- **Primary (C):** tattoo artist booking website
- **Secondary:** tattoo booking form, flash portfolio page
- **Long-tail:** tattoo deposit policy examples; how tattoo artists manage bookings without DMs
- **Intent:** C.
- **Priority:** Wave 2 (template exists; strong deposit-culture fit).

### A8. Booking pages for creators and content talent
- **Audience:** UGC creators, influencers selling shoots/collabs as services.
- **Primary (C):** UGC creator services page
- **Secondary:** content creator booking page, sell UGC packages
- **Long-tail:** UGC rate card page; how to invoice brand collabs
- **Intent:** C.
- **Priority:** Wave 2. Careful: keep to the services-and-booking story we actually have; no creator-economy hype.

### A9. Booking pages for coaches, instructors and service pros
- **Audience:** fitness trainers, language tutors, workshop leaders, other bookable pros.
- **Primary (C):** booking page for freelancers
- **Secondary:** sell services online with booking, one page website for services
- **Long-tail:** free booking page no credit card; booking page with deposit collection
- **Intent:** C. This is also the generic catch-all page that ranks for category-neutral queries.
- **Priority:** Wave 2, but the generic "booking page for freelancers" angle can be absorbed by the existing `/operators` page in Wave 1 instead of a new URL. Decide at build time; do not ship both.

---

## 3. Pillar B: Business-audience pages (agencies, studios, networks, managers)

Existing pages `/agencies`, `/organizations`, `/network` cover part of this. Phase C deepens them for search intent rather than duplicating. Rule: extend the existing page when the intent matches its audience; only create a new URL for a genuinely distinct query class.

### B1. Talent agency software (deepen `/agencies`)
- **Audience:** boutique model/talent/entertainment agencies (2-50 talent).
- **Primary (C):** talent agency software
- **Secondary:** model agency management software, talent roster management, agency booking system
- **Long-tail:** software for small modeling agencies; how to manage talent bookings and commissions; agency website with talent profiles
- **Intent:** C, high purchase intent.
- **Unique value:** the only story where the agency's public site, every talent profile, the inquiry inbox, and payouts are one system on the agency's own domain.
- **Feature tie-in:** branded storefront on custom domain, roster profiles, unified inquiry inbox, commission handling, whitelabel branding on higher tiers.
- **Action:** rewrite/extend `/agencies` with this keyword set; add an on-page FAQ. New URL not needed.

### B2. Booking software for studios and salons
- **Audience:** studios (photo, dance, recording), salons running multiple pros.
- **Primary (C):** studio booking software
- **Secondary:** salon website with booking, multi-staff booking page
- **Long-tail:** booking system for dance studios; photo studio rental inquiry page
- **Intent:** C.
- **Priority:** Wave 2, likely a new `/for/studios` page since `/agencies` speaks agency language.
- **Feature tie-in:** workspace with multiple talent/staff profiles, slots and reservations, deposits.

### B3. Staffing network / talent hub platform (deepen `/organizations` + `/network`)
- **Audience:** event staffing coordinators, city-level talent hubs, promo agencies.
- **Primary (C):** event staffing platform
- **Secondary:** talent network software, staffing agency booking system, promo staff management
- **Long-tail:** how to run a local talent network; software to coordinate freelance event staff
- **Intent:** C.
- **Feature tie-in:** hub coordination, cross-roster shared network, verified profiles, per-job coordination roles.
- **Action:** deepen `/organizations`; `/network` stays the how-it-works explainer and links here.

### B4. Tools for talent managers
- **Audience:** individual managers running 1-10 talent without a full agency.
- **Primary (C):** talent manager software
- **Secondary:** manage artist bookings, tools for music managers
- **Long-tail:** how to manage bookings for multiple artists; talent manager commission tracking
- **Intent:** C.
- **Priority:** Wave 2-3. Only build if the manager story (small workspace + a few profiles) is demonstrably distinct on the page; otherwise fold into B1 as a section.

---

## 4. Pillar C: Client-side hire pages (directory-backed)

These pages serve people **hiring** talent and must be backed by the live public directory (`/global-directory`, Discover). Rule: a hire page ships only where the directory actually has browsable talent in that category; otherwise it over-promises and bounces. At current network size this pillar is **deliberately last** (Wave 3) except the two explainer pages, which can ship earlier because they describe the real flow.

### C1. How hiring through Tulala works (explainer, ships early)
- **Audience:** clients who landed on a talent profile or the directory and want to know if it is safe/normal to book here.
- **Primary (I/CI):** how to book talent online
- **Secondary:** is it safe to pay a deposit for a booking online, booking talent without an agency
- **Long-tail:** what happens after I send a booking inquiry; how deposits protect both sides
- **Intent:** I feeding T.
- **Unique value:** step-by-step of the actual client flow: browse or land on a profile, send an inquiry, receive an offer, pay, chat in one thread. Screenshots of the real inquiry panel.
- **Feature tie-in:** unified inquiry flow, guest message panel, deposits, reviews on profiles.
- **Priority:** Wave 1 (it also strengthens conversion on every talent profile via internal links).

### C2. Hire {category} pages (directory-gated, Wave 3)
- **Pattern:** "hire a model for a photoshoot", "book a singer for a wedding", "hire a private chef for a dinner party", "book a photographer for an event".
- **Intent:** T, the highest-value client queries.
- **Gate:** ship per-category only when the public directory shows a real, non-embarrassing set of bookable profiles in that category. Each page = live directory module filtered to the category + honest copy about how booking works. No fake "1000+ professionals" claims, no location claims.
- **Location variants** ("hire a model in Mexico City") are explicitly **out of scope** until real geographic density exists; revisit per market with data.

---

## 5. Pillar D: Educational hub, glossary, comparisons (informational + investigation)

Home: `/resources` (or `/learn`; slug TBD). These earn topical authority and AI-answer citations. Every article answers a question talent actually has, in plain language, EN + ES, and links to exactly one relevant product surface.

### 5.1 Educational articles (Wave 1 picks first, then rolling)

| # | Working title | Primary keyword | Intent | Feature tie-in | Wave |
|---|---|---|---|---|---|
| D1 | How talent bookings actually work (inquiry to offer to payment) | how does talent booking work | I | booking messenger flow | 1 |
| D2 | Booking deposits: what to charge and why they kill no-shows | booking deposit for freelancers | I | deposits/reservations | 1 |
| D3 | How to price your services as independent talent | how to price freelance services | I | services catalog + rate cards | 1 |
| D4 | Do you still need an agency? Independent vs represented vs hybrid | do models need an agency (per-category variants later) | I/CI | talent + workspace hybrid, exclusivity model | 2 |
| D5 | How agency commissions work (lanes, splits, who pays what) | talent agency commission explained | I | commission model (describe honestly, no invented %s beyond published pricing) | 2 |
| D6 | Taking bookings from DMs: why chat-only booking loses money | taking bookings through instagram dms | I/CI | chat-to-booking, offers, payment in thread | 1 |
| D7 | Contracts, offers and getting paid: the paper trail of a gig | freelance booking agreement basics | I | offer records, paid-booking thread (NOT legal advice; say so) | 2 |
| D8 | Custom domain vs free subdomain for your talent page | custom domain for portfolio site | I/CI | free subdomain + custom-domain upgrade | 2 |
| D9 | Selling services in two languages: running a bilingual booking page | bilingual website for services | I | EN/ES product, multi-currency | 2 (strong ES twin) |
| D10 | No-show policy templates and how to enforce them with deposits | no show policy for appointments | I | deposits | 2 |

### 5.2 Glossary of talent-commerce terms
- **URL pattern:** `/resources/glossary` single page first (30-50 terms, anchor links); split into per-term pages ONLY if the single page demonstrably ranks and specific terms earn impressions. Per-term micro-pages from day one = thin-page risk, rejected.
- **Terms (starter set):** booking inquiry, offer, deposit, retainer, no-show, comp card, EPK, rate card, day rate, half-day rate, usage rights, buyout, exclusivity, mother agency, roster, callback, casting, tear sheet, portfolio, hold (date hold), cancellation window, payout, commission, split, coordinator, staffing, gig, booking confirmation.
- **Intent:** I, long-tail "what is a {term}" queries; strong AI-answer material.
- **Feature tie-in:** each definition may link to at most one product surface where the concept lives (e.g. "deposit" links to D2 and the pricing page). No hard selling inside definitions.

### 5.3 Comparison pages (honest, category-level)

| # | Page | Primary keyword | Intent | The honest angle | Wave |
|---|---|---|---|---|---|
| E1 | Tulala vs link-in-bio pages | linktree alternative for booking (and per-category: "for musicians") | CI | A link list sends people away; a storefront takes the inquiry, the offer and the payment in one place. Acknowledge link-in-bio is fine if you only need links. | 1 |
| E2 | Tulala vs DIY website builders | website builder for freelancers with booking | CI | A generic site builder gives you pages; it does not give you an inquiry inbox, offers, deposits or a network. Acknowledge builders win on total design freedom. | 2 |
| E3 | Tulala vs spreadsheets + DMs | how to organize freelance bookings | CI | The zero-software baseline most talent actually uses. Show the same gig handled both ways. | 1 |
| E4 | Tulala vs generic scheduling tools | scheduling app vs booking platform | CI | Scheduling tools book time slots; talent work is quoted per job (offer, price, deposit). Acknowledge slot tools win for pure appointment businesses. | 3 |

Named-competitor pages (e.g. "Tulala vs {Brand}") are **out of scope** for this plan; revisit only with verified, current feature data and legal review.

---

## 6. Spanish keyword strategy (first-class, not translated)

ES pages target how Spanish speakers actually search, LATAM-first. Each EN brief above gets an ES twin at build time with its own keyword research; the seeds below anchor the map.

| EN page | ES seed keywords |
|---|---|
| A1 models | página de reservas para modelos; portafolio de modelo con contacto; cómo conseguir castings sin agencia |
| A2 musicians | página para contrataciones de músicos; cómo cobrar anticipo por un evento; contratar cantante página web |
| A3 chefs | página web para chef privado; cotización de banquetes en línea |
| B1 agencies | software para agencias de talento; plataforma para agencia de modelos; administración de talentos |
| B3 hubs | plataforma de staff para eventos; red de talento local |
| C1 explainer | cómo contratar talento en línea; es seguro pagar anticipo por internet |
| D2 deposits | qué es un anticipo de reserva; cómo cobrar apartado |
| D6 DMs | cobrar por WhatsApp o Instagram; convertir mensajes en reservas |
| Glossary | qué es un book de modelo; qué es un rate card; qué es una comisión de agencia |

Notes:
- LATAM vocabulary first ("anticipo"/"apartado" over Spain's "señal"; "contratar" over "reservar" for people).
- D9 (bilingual page article) flips: its ES version is the stronger commercial page ("página de servicios en inglés y español para clientes internacionales").
- Riviera Maya style regional hubs may later justify ES-first local content, but per rule 3 no location pages until density exists.

---

## 7. Build sequencing and acceptance

**Wave 1 (after Phase A+B verified):** A1-A4, B1 deepen, C1, D1-D2-D3-D6, E1, E3, glossary v1. Roughly 12 pages, each individually approved against the ground rules.
**Wave 2:** A5-A9 (minus any merged into `/operators`), B2, B3 deepen, D4-D5-D7-D8-D9-D10, E2.
**Wave 3 (data-gated):** C2 hire pages per category with real directory density, B4, E4, glossary term splits if earned, location variants if earned.

Per-page acceptance (all required):
1. Unique H1 + title + meta description carrying the primary keyword naturally; canonical + hreflang wired (Phase A machinery).
2. At least one real product screenshot or live-profile embed; zero placeholder imagery.
3. 3-5 page-specific FAQ entries emitted as FAQPage schema (Phase B3 pattern).
4. Internal links: up from the page to its pillar hub, across to 2-3 sibling pages, down from `/how-it-works`, `/pricing` or the homepage where contextually honest.
5. EN and ES shipped together; both read by a human before merge.
6. No em dashes; AI-tell pass done; every claim checked against the live product.
7. Registered in the sitemap with locale alternates.

Measurement (Phase E hooks): each page tracked in Search Console by URL; review impressions/clicks at 4 and 12 weeks; a page earning nothing at 12 weeks gets rewritten or merged, not left to rot.

---

## 8. Explicit non-goals

- No programmatic/location page generation.
- No named-competitor comparison pages.
- No client-side "hire" pages ahead of directory density.
- No keyword-stuffed variants of the same page (one page per intent, per language).
- No publishing volume targets; quality gate beats cadence.
