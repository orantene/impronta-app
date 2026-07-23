# PR-COPY — Em-dash + AI-pattern rewrite spec

**Scope:** every em dash (—, including `—` escapes) in the marketing copy files listed below, plus any AI-tell phrasing. Each entry is a before/after pair, meaning preserved, no em dashes, no blind find-replace. Rewrites lean on the punctuation the sentence already wants: a comma for a simple join, a colon before a list/explanation, a period to split into two sentences, or parentheses for a true aside. Short CTA/label fragments (`"X — free"`) move to the `·` separator the design system already uses elsewhere (`"Studio · $49/mo"`, `"Oran, founder · Tulala"`).

**Total found in the 20 files in scope:** 203 em dashes. Of those, 96 sit inside code comments (`/** ... */`, `//`) that never render to a user — not required by the "no em dashes in user-facing copy" rule, but cheap to fix in the same pass; listed separately per file as optional. **107 are in user-facing strings** and are the real target of this spec.

**Files with zero em dashes and zero AI-tells found (verified, no changes needed):** `src/app/(marketing)/integrations/page.tsx`, `src/app/(marketing)/legal/privacy/page.tsx`, `src/app/(marketing)/legal/terms/page.tsx`.

**File that doesn't exist:** `src/app/(marketing)/get-started/get-started-form.tsx` was named in the task but there is no such file — `/get-started` is only `page.tsx` (server component with inline sections) + `actions.ts` (server action). The client-side form component actually used is `@/components/marketing/get-started-form` (`GetStartedForm`), which is **not** in the requested file list and was not audited here; flagging in case it needs a follow-up pass.

**AI-tell phrases found:** one instance — "the operating system" in `agencies/page.tsx` (metaphor-as-noun tech cliché). Full rewrite below in that file's section. No other matches for `seamless / revolutionize / unlock / elevate / empower / game-changing / cutting-edge / robust / leverage / synergy / holistic / paradigm / frictionless / effortless / streamline / delve / boast / harness / unleash / supercharge / best-in-class / world-class / forefront / trailblazing` etc. across the 20 files.

---

## 1. `src/lib/marketing/copy.ts`

Central bilingual copy module (nav, hero, audience cards, flagship, tour, network, pricing, FAQ, stories, final CTA, footer). 57 em dashes, all in template-literal strings, none escaped.

### User-facing strings (56)

| Line | Locale | Field | Before | After |
|---|---|---|---|---|
| 18 | EN | `nav.platform.blurb` | One place to build a business around people — and get paid. | One place to build a business around people, and get paid. |
| 365 | ES | `nav.platform.blurb` | Un solo lugar para construir un negocio alrededor de tu gente — y cobrar. | Un solo lugar para construir un negocio alrededor de tu gente, y cobrar. |
| 38 | EN | `nav.solutions.blurb` | However you work — sell your own services, run a business, or both. | However you work: sell your own services, run a business, or both. |
| 385 | ES | `nav.solutions.blurb` | Como sea que trabajes — vende tus servicios, lleva un negocio, o las dos cosas. | Como sea que trabajes: vende tus servicios, lleva un negocio, o las dos cosas. |
| 57 | EN | `nav.discover.blurb` | Browse the whole network — then start a conversation. | Browse the whole network, then start a conversation. |
| 404 | ES | `nav.discover.blurb` | Explora toda la red — y empieza una conversación. | Explora toda la red y empieza una conversación. |
| 98 | EN | `hero.subhead` | …build your own site and business workspace in one click — and take bookings and payments right inside the chat. | …build your own site and business workspace in one click, and take bookings and payments right inside the chat. |
| 445 | ES | `hero.subhead` | …crea tu propio sitio y tu panel de negocio en un clic — y cobra reservas y pagos desde el mismo chat. | …crea tu propio sitio y tu panel de negocio en un clic, y cobra reservas y pagos desde el mismo chat. |
| 99 | EN | `hero.ctaTalent` | Sell your work — free | Sell your work · free |
| 446 | ES | `hero.ctaTalent` | Vende tu trabajo — gratis | Vende tu trabajo · gratis |
| 108 | EN | `audience.subtitle` | Sell your own services, run a full business, or curate a hub — Tulala scales with you. And you don't have to pick just one. | Sell your own services, run a full business, or curate a hub. Tulala scales with you, and you don't have to pick just one. |
| 455 | ES | `audience.subtitle` | Vende tus servicios, lleva un negocio completo o crea un hub — Tulala crece contigo. Y no tienes que elegir solo uno. | Vende tus servicios, lleva un negocio completo o crea un hub. Tulala crece contigo, y no tienes que elegir solo uno. |
| 113 | EN | `audience.talent.subtitle` | Give your skill a page, a booking flow, and room to grow — without building anything first. | Give your skill a page, a booking flow, and room to grow, without building anything first. |
| 460 | ES | `audience.talent.subtitle` | Dale a tu oficio una página, un flujo de reservas y espacio para crecer — sin construir nada primero. | Dale a tu oficio una página, un flujo de reservas y espacio para crecer, sin construir nada primero. |
| 151 | EN | `flagship.subtitle` | A builder that ships your whole business in a click — and a messenger where the conversation becomes the booking, and the payment. | A builder that ships your whole business in a click, and a messenger where the conversation becomes the booking, and the payment. |
| 498 | ES | `flagship.subtitle` | Un constructor que lanza todo tu negocio en un clic — y una mensajería donde la conversación se vuelve la reserva, y el pago. | Un constructor que lanza todo tu negocio en un clic, y una mensajería donde la conversación se vuelve la reserva, y el pago. |
| 155 | EN | `flagship.builder.body` | …and the workspace you run it from — wired together, on-brand, live in minutes. … | …and the workspace you run it from, wired together, on-brand, live in minutes. … |
| 502 | ES | `flagship.builder.body` | …y el panel desde donde lo manejas — conectados, con tu marca, en vivo en minutos. … | …y el panel desde donde lo manejas, conectados, con tu marca, en vivo en minutos. … |
| 166 | EN | `flagship.messenger.title` | Where the chat becomes the booking — and the payment. | Where the chat becomes the booking, and the payment. |
| 513 | ES | `flagship.messenger.title` | Donde el chat se vuelve la reserva — y el pago. | Donde el chat se vuelve la reserva, y el pago. |
| 167 | EN | `flagship.messenger.body` | …and turn it into a confirmed booking — without leaving the conversation. … | …and turn it into a confirmed booking, without leaving the conversation. … |
| 514 | ES | `flagship.messenger.body` | …y conviértelo en una reserva confirmada — sin salir de la conversación. … | …y conviértelo en una reserva confirmada, sin salir de la conversación. … |
| 179 | EN | `flagship.support[2].body` | Be the talent and run the business — from one login. | Be the talent and run the business, from one login. |
| 526 | ES | `flagship.support[2].body` | Sé el talento y lleva el negocio — desde un solo acceso. | Sé el talento y lleva el negocio, desde un solo acceso. |
| 192 | EN | `tour.subtitle` | …an inbox where inquiries turn into paid bookings — all wired together. | …an inbox where inquiries turn into paid bookings, all wired together. |
| 539 | ES | `tour.subtitle` | …una bandeja donde las solicitudes se vuelven reservas pagadas — todo conectado. | …una bandeja donde las solicitudes se vuelven reservas pagadas, todo conectado. |
| 204 | EN | `tour.tabs[1].body` | …and one clean booking button — on one shareable link. … | …and one clean booking button, on one shareable link. … |
| 551 | ES | `tour.tabs[1].body` | …y un solo botón de reserva — en un enlace para compartir. … | …y un solo botón de reserva, en un enlace para compartir. … |
| 231 | EN | `network.bullets[1].body` | Every workspace keeps its site, roster, and bookings — and still gets found through shared discovery. | Every workspace keeps its site, roster, and bookings, and still gets found through shared discovery. |
| 578 | ES | `network.bullets[1].body` | Cada workspace mantiene su sitio, su catálogo y sus reservas — y aun así lo encuentran en el descubrimiento compartido. | Cada workspace mantiene su sitio, su catálogo y sus reservas, y aun así lo encuentran en el descubrimiento compartido. |
| 249 | EN | `pricing.subtitle` | Every plan takes you from inquiry to booked and paid — for free. … | Every plan takes you from inquiry to booked and paid, for free. … |
| 596 | ES | `pricing.subtitle` | Todos los planes te llevan de la solicitud a reservado y pagado — gratis. … | Todos los planes te llevan de la solicitud a reservado y pagado, gratis. … |
| 251 | EN | `pricing.footnote` | …No setup fees, and your data is always yours — export anytime. | …No setup fees, and your data is always yours: export anytime. |
| 598 | ES | `pricing.footnote` | …Sin costos de instalación, y tus datos siempre son tuyos — expórtalos cuando quieras. | …Sin costos de instalación, y tus datos siempre son tuyos: expórtalos cuando quieras. |
| 258 | EN | `faq.subtitle` | What people ask before signing up. Straight answers — no fluff. | What people ask before signing up. Straight answers, no fluff. |
| 264 | EN | `faq.items[0].a` | Anyone who sells their work or runs a business around people — singers, chefs, stylists… | Anyone who sells their work or runs a business around people: singers, chefs, stylists… |
| 611 | ES | `faq.items[0].a` | Para quien vende su trabajo o lleva un negocio alrededor de personas — cantantes, chefs… | Para quien vende su trabajo o lleva un negocio alrededor de personas: cantantes, chefs… |
| 268 | EN | `faq.items[1].a` | Yes — a genuinely useful free plan, not a trial in disguise. … | Yes, a genuinely useful free plan, not a trial in disguise. … |
| 615 | ES | `faq.items[1].a` | Sí — un plan gratis de verdad útil, no una prueba disfrazada. … | Sí, un plan gratis de verdad útil, no una prueba disfrazada. … |
| 272 | EN | `faq.items[2].a` | …Your site looks like a real business — because it is one. | …Your site looks like a real business, because it is one. |
| 619 | ES | `faq.items[2].a` | …Tu sitio se ve como un negocio de verdad — porque lo es. | …Tu sitio se ve como un negocio de verdad, porque lo es. |
| 276 | EN | `faq.items[3].a` | Those are just for presentation — you'd still juggle bookings in WhatsApp, payments somewhere else, and your schedule in your head. Tulala is the whole thing: a site, a booking flow, payments, and a shared discovery network — built around how service businesses actually work. | Those are just for presentation. You'd still juggle bookings in WhatsApp, payments somewhere else, and your schedule in your head. Tulala is the whole thing: a site, a booking flow, payments, and a shared discovery network, built around how service businesses actually work. |
| 623 | ES | `faq.items[3].a` | Esos son solo para presentar — seguirías cuadrando reservas por WhatsApp, los pagos por otro lado y la agenda en tu cabeza. Tulala es todo junto: un sitio, un flujo de reservas, pagos y una red de descubrimiento — hecho para cómo funcionan de verdad los negocios de servicios. | Esos son solo para presentar. Seguirías cuadrando reservas por WhatsApp, los pagos por otro lado y la agenda en tu cabeza. Tulala es todo junto: un sitio, un flujo de reservas, pagos y una red de descubrimiento, hecho para cómo funcionan de verdad los negocios de servicios. |
| 280 | EN | `faq.items[4].a` | …Run Tulala as a private branded site, appear in the network, or both — you control what's discoverable. | …Run Tulala as a private branded site, appear in the network, or both. You control what's discoverable. |
| 627 | ES | `faq.items[4].a` | …aparece en la red, o las dos cosas — tú decides qué se puede descubrir. | …aparece en la red, o las dos cosas. Tú decides qué se puede descubrir. |
| 288 | EN | `faq.items[6].a` | Yes — paid plans support multiple users with roles and permissions: owners, admins… | Yes, paid plans support multiple users with roles and permissions: owners, admins… |
| 635 | ES | `faq.items[6].a` | Sí — los planes de pago permiten varios usuarios con roles y permisos: dueños… | Sí, los planes de pago permiten varios usuarios con roles y permisos: dueños… |
| 301 | EN | `stories.subtitle` | From a solo singer to a city-wide services hub — see how people use Tulala… | From a solo singer to a city-wide services hub, see how people use Tulala… |
| 648 | ES | `stories.subtitle` | De una cantante independiente a un hub de servicios para toda una ciudad — mira cómo la gente usa Tulala… | De una cantante independiente a un hub de servicios para toda una ciudad, mira cómo la gente usa Tulala… |
| 319 | EN | `finalCta.ctaTalent` | Sell your work — free | Sell your work · free |
| 666 | ES | `finalCta.ctaTalent` | Vende tu trabajo — gratis | Vende tu trabajo · gratis |
| 331 | EN | `footer.description` | The talent business platform — sell your services, run your business, get paid. | The talent business platform: sell your services, run your business, get paid. |
| 678 | ES | `footer.description` | La plataforma del negocio del talento — vende tus servicios, lleva tu negocio, cobra. | La plataforma del negocio del talento: vende tus servicios, lleva tu negocio, cobra. |

### Code comments (optional, non-user-facing)
Line 2 (`* Marketing copy — EN + ES…`) and line 5 (`* …using "tú" — written to sell…`). Cosmetic only; fix in the same pass if convenient, e.g. `Marketing copy: EN + ES, in one typed module.` and `…using "tú", written to sell…`.

---

## 2. `src/components/marketing/case-studies-data.ts`

Illustrative case-study cards (12 studies × EN/ES). 48 em dashes, entirely in `cardSummary`, `challenge`, `approach[]`, and `quote` strings — every one user-facing.

| Line | Locale | Study.field | Before | After |
|---|---|---|---|---|
| 38 | EN | singer.cardSummary | Daniela turned a free profile into a personal site with her music built in — and venues book her without a single DM. | Daniela turned a free profile into a personal site with her music built in, and venues book her without a single DM. |
| 382 | ES | singer.cardSummary | Daniela convirtió un perfil gratis en su sitio personal con su música integrada — y los venues la contratan sin un solo DM. | Daniela convirtió un perfil gratis en su sitio personal con su música integrada, y los venues la contratan sin un solo DM. |
| 40 | EN | singer.challenge | …without three back-and-forth messages — and half never replied. | …without three back-and-forth messages, and half never replied. |
| 384 | ES | singer.challenge | …sin tres mensajes de ida y vuelta — y la mitad nunca respondía. | …sin tres mensajes de ida y vuelta, y la mitad nunca respondía. |
| 44 | EN | singer.approach[2] | Takes requests through the booking messenger — quote, deposit, and contract in one thread | Takes requests through the booking messenger: quote, deposit, and contract in one thread |
| 388 | ES | singer.approach[2] | Recibe solicitudes por el mensajero de reservas — cotización, depósito y contrato en un mismo hilo | Recibe solicitudes por el mensajero de reservas: cotización, depósito y contrato en un mismo hilo |
| 65 | EN | massage.cardSummary | A solo therapist replaced phone-tag with an online reservation page — clients book and pay a deposit while she's mid-session. | A solo therapist replaced phone-tag with an online reservation page: clients book and pay a deposit while she's mid-session. |
| 405 | ES | massage.cardSummary | Una terapeuta independiente cambió el teléfono que nunca para por una página de reservas — sus clientes reservan y dejan depósito mientras ella está en sesión. | Una terapeuta independiente cambió el teléfono que nunca para por una página de reservas: sus clientes reservan y dejan depósito mientras ella está en sesión. |
| 92 | EN | wedding.cardSummary | Mateo books destination weddings end to end — gallery, quote, deposit, and contract — all inside the booking messenger. | Mateo books destination weddings end to end: gallery, quote, deposit, and contract, all inside the booking messenger. |
| 428 | ES | wedding.cardSummary | Mateo cierra bodas de destino de principio a fin — galería, cotización, depósito y contrato — todo dentro del mensajero de reservas. | Mateo cierra bodas de destino de principio a fin: galería, cotización, depósito y contrato, todo dentro del mensajero de reservas. |
| 98 | EN | wedding.approach[2] | Collects the deposit and e-signature in the same thread — no separate invoice tool | Collects the deposit and e-signature in the same thread, no separate invoice tool needed |
| 434 | ES | wedding.approach[2] | Cobra el depósito y la firma electrónica en el mismo hilo — sin herramienta de facturas aparte | Cobra el depósito y la firma electrónica en el mismo hilo, sin herramienta de facturas aparte |
| 119 | EN | tattoo.cardSummary | Iván swapped a chaotic DM waitlist for a reservation flow with deposits — only serious clients get a slot. | Iván swapped a chaotic DM waitlist for a reservation flow with deposits, so only serious clients get a slot. |
| 451 | ES | tattoo.cardSummary | Iván cambió una lista de espera caótica en DMs por un flujo de reservas con depósito — solo los clientes en serio consiguen lugar. | Iván cambió una lista de espera caótica en DMs por un flujo de reservas con depósito, así solo los clientes en serio consiguen lugar. |
| 126 | EN | tattoo.approach[3] | Flash drops post as bookable inventory — first deposit wins | Flash drops post as bookable inventory: first deposit wins |
| 458 | ES | tattoo.approach[3] | Los drops de flash salen como inventario reservable — el primer depósito gana | Los drops de flash salen como inventario reservable: el primer depósito gana |
| 146 | EN | band.cardSummary | A band runs gigs like a business — shared calendar, one booking site, and automatic per-member payout splits. | A band runs gigs like a business: shared calendar, one booking site, and automatic per-member payout splits. |
| 474 | ES | band.cardSummary | Una banda opera sus shows como negocio — calendario compartido, un solo sitio de reservas y reparto automático de pagos por integrante. | Una banda opera sus shows como negocio: calendario compartido, un solo sitio de reservas y reparto automático de pagos por integrante. |
| 173 | EN | salon.cardSummary | A salon put its whole team online — clients pick a stylist, see the price, and book a chair with a deposit. | A salon put its whole team online: clients pick a stylist, see the price, and book a chair with a deposit. |
| 497 | ES | salon.cardSummary | Un salón puso a todo su equipo en línea — el cliente elige estilista, ve el precio y aparta su silla con depósito. | Un salón puso a todo su equipo en línea: el cliente elige estilista, ve el precio y aparta su silla con depósito. |
| 177 | EN | salon.approach[0] | Built a branded salon site with the page builder — services, team, and prices | Built a branded salon site with the page builder: services, team, and prices |
| 501 | ES | salon.approach[0] | Crearon un sitio de salón con su marca usando el editor — servicios, equipo y precios | Crearon un sitio de salón con su marca usando el editor: servicios, equipo y precios |
| 200 | EN | models.cardSummary | Impronta runs a custom-domain roster site and a full inquiry-to-booking pipeline — every request traced to the talent who earned it. | Impronta runs a custom-domain roster site and a full inquiry-to-booking pipeline, with every request traced to the talent who earned it. |
| 520 | ES | models.cardSummary | Impronta lleva un sitio de roster con dominio propio y un pipeline completo de consulta a reserva — cada solicitud rastreada al talento que la ganó. | Impronta lleva un sitio de roster con dominio propio y un pipeline completo de consulta a reserva, con cada solicitud rastreada al talento que la ganó. |
| 205 | EN | models.approach[1] | Each model has a proper profile — specs, portfolio, availability | Each model has a proper profile: specs, portfolio, availability |
| 525 | ES | models.approach[1] | Cada modelo tiene un perfil en forma — medidas, portafolio, disponibilidad | Cada modelo tiene un perfil en forma: medidas, portafolio, disponibilidad |
| 214 | EN | models.quote | We look like the agency we always were — and nothing slips through the cracks. | We look like the agency we always were, and nothing slips through the cracks. |
| 534 | ES | models.quote | Nos vemos como la agencia que siempre fuimos — y nada se escapa. | Nos vemos como la agencia que siempre fuimos, y nada se escapa. |
| 254 | EN | cityhub.cardSummary | A hub aggregates vetted cleaners, hosts, drivers, and handypeople — workers apply, clients browse and book in one place. | A hub aggregates vetted cleaners, hosts, drivers, and handypeople: workers apply, clients browse and book in one place. |
| 566 | ES | cityhub.cardSummary | Un hub reúne a personal de limpieza, anfitriones, choferes y gente de mantenimiento ya verificada — los trabajadores aplican, los clientes buscan y reservan en un solo lugar. | Un hub reúne a personal de limpieza, anfitriones, choferes y gente de mantenimiento ya verificada: los trabajadores aplican, los clientes buscan y reservan en un solo lugar. |
| 256 | EN | cityhub.challenge | Great local workers — housekeepers, hosts, drivers — had no shared, trustworthy place to be found. Villa managers re-hired blind every season. | Great local workers (housekeepers, hosts, drivers) had no shared, trustworthy place to be found. Villa managers re-hired blind every season. |
| 568 | ES | cityhub.challenge | Grandes trabajadores locales — amas de llaves, anfitriones, choferes — no tenían un lugar común y confiable donde ser encontrados. Los administradores de villas recontrataban a ciegas cada temporada. | Grandes trabajadores locales (amas de llaves, anfitriones, choferes) no tenían un lugar común y confiable donde ser encontrados. Los administradores de villas recontrataban a ciegas cada temporada. |
| 281 | EN | chefs.cardSummary | A culinary hub lists private chefs by cuisine and party size — guests browse menus and book a dinner in minutes. | A culinary hub lists private chefs by cuisine and party size, so guests browse menus and book a dinner in minutes. |
| 589 | ES | chefs.cardSummary | Un hub culinario lista chefs privados por cocina y tamaño de grupo — los invitados ven menús y reservan una cena en minutos. | Un hub culinario lista chefs privados por cocina y tamaño de grupo, así los invitados ven menús y reservan una cena en minutos. |
| 295 | EN | chefs.quote | Guests pick a chef and a menu like ordering a table — except it comes to the villa. | Guests pick a chef and a menu like ordering a table, except it comes to the villa. |
| 603 | ES | chefs.quote | Los invitados eligen chef y menú como quien pide mesa — solo que llega a la villa. | Los invitados eligen chef y menú como quien pide mesa, solo que llega a la villa. |
| 308 | EN | villa.cardSummary | A hospitality co-op gives villa managers one place to staff every stay — concierge, cleaning, chefs, and drivers on demand. | A hospitality co-op gives villa managers one place to staff every stay: concierge, cleaning, chefs, and drivers on demand. |
| 612 | ES | villa.cardSummary | Una cooperativa de hospitalidad le da a los administradores de villas un solo lugar para armar el personal de cada estancia — concierge, limpieza, chefs y choferes a demanda. | Una cooperativa de hospitalidad le da a los administradores de villas un solo lugar para armar el personal de cada estancia: concierge, limpieza, chefs y choferes a demanda. |
| 310 | EN | villa.challenge | …One bad link in the chain ruined a guest's stay — and the review. | …One bad link in the chain ruined a guest's stay, and the review along with it. |
| 614 | ES | villa.challenge | …Un solo eslabón flojo arruinaba la estancia de un huésped — y la reseña. | …Un solo eslabón flojo arruinaba la estancia de un huésped, y la reseña junto con ella. |
| 335 | EN | hybrid.cardSummary | Sofía kept her personal talent page and added a workspace for her growing team — one account, two sides of the business. | Sofía kept her personal talent page and added a workspace for her growing team: one account, two sides of the business. |
| 635 | ES | hybrid.cardSummary | Sofía conservó su página personal de talento y le sumó un workspace para su equipo en crecimiento — una cuenta, dos lados del negocio. | Sofía conservó su página personal de talento y le sumó un workspace para su equipo en crecimiento: una cuenta, dos lados del negocio. |
| 337 | EN | hybrid.challenge | …take bigger jobs — without losing her personal brand or starting over. | …take bigger jobs, without losing her personal brand or starting over. |
| 637 | ES | hybrid.challenge | …tomar trabajos más grandes — sin perder su marca personal ni empezar de cero. | …tomar trabajos más grandes, sin perder su marca personal ni empezar de cero. |

No code comments contain em dashes in this file.

---

## 3. `src/app/(marketing)/get-started/page.tsx`

8 em dashes total, **all inside code comments** (`// L50 Phase 3…`, `// 1. Hero — pitch…`, section-divider comments). No user-facing string in this file contains an em dash — the hero copy, audience cards, plan ladder, contrast table, and final CTA are all clean already. No rewrites required.

Optional comment cleanups (non-user-facing): lines 44, 157, 230, 255, 430, 606, 1001, 1377 — e.g. `// 1. Hero — pitch + sticky form` → `// 1. Hero: pitch + sticky form`.

---

## 4. `src/app/(marketing)/get-started/actions.ts`

14 em dashes: 3 in code comments, 4 in real user-facing copy (error message + email subject/body), and 4 used as an empty-value placeholder glyph in the internal founder-notification email (not customer-facing, but still an em dash to remove per the no-em-dash rule).

### User-facing strings

| Line | Context | Before | After |
|---|---|---|---|
| 240 | Subdomain-taken form error | `"That one's reserved — try another."` | `"That one's already taken. Try another."` |
| 395 | Lead-confirmation email subject | `` `You're on the list — ${PLATFORM_BRAND.name}` `` | `` `You're on the list at ${PLATFORM_BRAND.name}` `` |
| 490 | Lead-confirmation email body (no self-serve branch) | "We're reviewing signups in the order they arrive and sending setup links within a day — usually within an hour during working hours." | "We're reviewing signups in the order they arrive and sending setup links within a day, usually within an hour during working hours." |
| 496 | Email signature | `` `— The ${PLATFORM_BRAND.name} team` `` (after an `<hr>`, so the dash is pure decoration) | `` `The ${PLATFORM_BRAND.name} team` `` (drop the dash; the `<hr>` above already separates it) |

### Internal-email placeholder glyphs (founder digest, not customer-facing)

| Line | Field | Before | After |
|---|---|---|---|
| 535 | Subdomain row fallback | `` : "—")` `` | `` : "N/A")` `` |
| 536 | Tier interest fallback | `params.tierInterest ?? "—"` | `params.tierInterest ?? "N/A"` |
| 537 | UTM source fallback | `input.utm_source ?? "—"` (rendered via `params.utmSource ?? "—"`) | `params.utmSource ?? "N/A"` |
| 538 | Referrer fallback | `params.referrer ?? "—"` | `params.referrer ?? "N/A"` |

### Code comments (optional, non-user-facing)
Lines 87, 90, 95 (JSDoc for `isRequestedLinkTaken` verdict states — e.g. `` * - `taken`    — a real conflict… `` → `` * - `taken`: a real conflict… ``), line 152 (`// Suggestions exclude … slugs — we don't want…` → `…slugs, we don't want…`), line 334 (`// Reserve the subdomain … — Best-effort:` → `…race. Best-effort:`), line 554 (`* Lightweight availability check — called on…` → `* Lightweight availability check, called on…`).

---

## 5. `src/app/(marketing)/integrations/page.tsx`

**No em dashes found** (0 literal, 0 escaped) and no AI-tell phrases. All lists in this file already use commas or colons correctly (e.g. "roster, profiles, posts, contact", "Full platform sites: ..."). No changes needed.

---

## 6. `src/components/marketing/feature-grid-section.tsx`

9 em dashes: 7 in user-facing `Feature.body` strings, 1 in a code comment, plus one ES line that's already dash-free.

| Line | Locale | Feature | Before | After |
|---|---|---|---|---|
| 16 | EN | Branded roster site | A real website — not a generic template — managed in a modern CMS. | A real website, not a generic template, managed in a modern CMS. |
| 17 | ES | Sitio con tu marca | Un sitio web de verdad —no una plantilla genérica— que administras desde un CMS moderno. | Un sitio web de verdad, no una plantilla genérica, que administras desde un CMS moderno. |
| 24 | EN | People profiles, done right | …editorial presentation — the profile your roster deserves. | …editorial presentation: the profile your roster deserves. |
| 48 | EN | Multi-user with roles | Coordinators, admins, assistants, owners — scope access with permissions. … | Coordinators, admins, assistants, owners: scope access with permissions. … |
| 56 | EN | Analytics + insights | …what converts — and where to spend the next hour. | …what converts, and where to spend the next hour. |
| 57 | ES | Analíticas e insights | …qué convierte —y dónde te conviene invertir la próxima hora. | …qué convierte y dónde te conviene invertir la próxima hora. |

(ES lines 18 and 25 for the same two cards already use a colon with no dash — no change needed there.)

Code comment, optional: line 157 `/* Inline icons — monoline, 1.5 stroke… */` → `/* Inline icons: monoline, 1.5 stroke… */`.

---

## 7. `src/components/marketing/how-it-works-section.tsx`

9 em dashes, all in user-facing `Step.body` / `ctaGetStarted` strings (no code comments contain a dash in this file).

| Line | Locale | Field | Before | After |
|---|---|---|---|---|
| 21 | EN | steps[0].body | Sign up, add the people you represent — one, ten, or forty — and upload their work. … | Sign up, add the people you represent (one, ten, or forty), and upload their work. … |
| 44 | ES | steps[0].body | Regístrate, agrega a las personas que representas —una, diez o cuarenta— y sube su trabajo. … | Regístrate, agrega a las personas que representas (una, diez o cuarenta) y sube su trabajo. … |
| 35 | EN | steps[2].body | Structured inquiries land in your inbox — not another chat thread. … | Structured inquiries land in your inbox, not another chat thread. … |
| 58 | ES | steps[2].body | Las solicitudes ordenadas llegan a tu bandeja —no a otro hilo de chat más—. … | Las solicitudes ordenadas llegan a tu bandeja, no a otro hilo de chat más. … |
| 76 | EN | `ctaGetStarted` | Or skip ahead — start free | Or skip ahead: start free |
| 85 | ES | `ctaGetStarted` | O ve directo al grano — empieza gratis | O ve directo al grano: empieza gratis |

---

## 8. `src/components/marketing/simple-page-hero.tsx`

**No em dashes.** This is a pure presentational shell (`eyebrow`/`title`/`subtitle`/CTA props passed in by callers) with no copy of its own. No changes needed.

---

## 9. `src/components/marketing/hero-section.tsx`

4 em dashes, **all in code comments** (`/** Full-bleed hero slider — rotates… */`, `// Horizontal swipe only — don't hijack…`, `{/* Floating booking card — synced… */}`, `/** One booking per slide — the card mirrors… */`). The rendered hero copy (`copy.eyebrow/titleLine1/titleLine2/subhead`, booking-card mock data) is clean. No user-facing rewrites required.

Optional comment cleanups: lines 11, 42, 163, 201 — e.g. `// Horizontal swipe only — don't hijack vertical page scroll.` → `// Horizontal swipe only; don't hijack vertical page scroll.`

---

## 10. `src/components/marketing/footer.tsx`

1 em dash, in a code comment only: line 13, `/** Hrefs by column — labels come from the copy module (per locale), in order. */` → `/** Hrefs by column. Labels come from the copy module (per locale), in order. */`. The rendered footer copy comes from `copy.ts` (`footer.description`, already covered in §1) and the legal line built from `PLATFORM_BRAND.legalName`/`positioning`, neither of which contains a dash. No user-facing changes needed in this file itself.

---

## 11. `src/lib/marketing/photography.ts`

14 em dashes, **all in JSDoc/inline comments** describing photo slots (e.g. `/** Homepage hero — many kinds of talent… */`). None of the `alt` or `intent` string values (the only parts that could theoretically reach a user, via screen readers) contain a dash. No user-facing rewrites required.

Optional comment cleanups (14 lines: 4, 17, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106, 114, 122) — e.g. `/** Homepage hero — many kinds of talent and service work can become income. */` → `/** Homepage hero: many kinds of talent and service work can become income. */`.

---

## 12. `src/app/(marketing)/operators/page.tsx`

6 em dashes, all escaped (`—`), all in user-facing copy (pain points, before/after shift rows, hero subtitle).

| Line | Locale | Field | Before | After |
|---|---|---|---|---|
| 36 | EN | painPoints[0].body | Every inquiry, every booking, every response — it's all you. … | Every inquiry, every booking, every response: it's all you. … |
| 56 | ES | painPoints[0].body | Cada consulta, cada reserva, cada respuesta — todo recae en ti. … | Cada consulta, cada reserva, cada respuesta: todo recae en ti. … |
| 88 | EN | shifts[1].after | Inquiries land structured — brief, dates, budget. | Inquiries land structured: brief, dates, budget. |
| 114 | ES | shifts[1].after | Las consultas llegan estructuradas — brief, fechas, presupuesto. | Las consultas llegan estructuradas: brief, fechas, presupuesto. |
| 145 | EN | `heroSubtitle` | …and exposure on a shared discovery network — free to start. | …and exposure on a shared discovery network, free to start. |
| 161 | ES | `heroSubtitle` | …presencia en una red de descubrimiento compartida — gratis para empezar. | …presencia en una red de descubrimiento compartida, gratis para empezar. |

---

## 13. `src/app/(marketing)/agencies/page.tsx`

5 em dashes, all escaped, all user-facing. **This page is EN-only** — it doesn't call `getRequestLocale`/`pickLocale` like its sibling audience pages, so there's no ES text to fix here (flagging separately: this page has no Spanish variant, which is itself a gap worth a follow-up ticket, out of scope for this rewrite).

Also contains the one confirmed **AI-tell phrase** in the audited files: "the operating system" as a tech-cliché metaphor for the product (line 87).

| Line | Field | Before | After |
|---|---|---|---|
| 35 | `PILLARS[0].title` | Your identity, yours — not a template's. | Your identity is yours, not a template's. |
| 36 | `PILLARS[0].body` | A real editorial website on your own domain, managed in a modern CMS. Navigation, pages, posts, design tokens — you own the whole surface. | A real editorial website on your own domain, managed in a modern CMS. Navigation, pages, posts, design tokens: you own the whole surface. |
| 50 | `PILLARS[1].body` | Structured taxonomy, media pipeline, specs, availability, and portfolio — presented editorially. … | Structured taxonomy, media pipeline, specs, availability, and portfolio, presented editorially. … |
| 68 | `PILLARS[2].bullets[0]` | Multi-party sign-off — client, talent, ops | Multi-party sign-off: client, talent, ops |
| 87 | Hero `subtitle` (AI-tell + em dash) | Representation businesses run on people, not software — until the software gets in the way. `${PLATFORM_BRAND.name}` is the operating system: a branded site, structured profiles, a real inquiry pipeline, and permissions to scale past a single phone. | Representation businesses run on people, not software, until the software gets in the way. `${PLATFORM_BRAND.name}` gives you the real infrastructure: a branded site, structured profiles, a real inquiry pipeline, and permissions to scale past a single phone. |

**AI-tell rationale (line 87):** "is the operating system" is the tech-industry cliché of describing a product as an abstract OS metaphor rather than saying what it concretely does. The rewrite ("gives you the real infrastructure") keeps the same claim (Tulala replaces ad hoc tools with real structure) but grounds it in the four concrete things listed right after the colon, instead of leaning on a borrowed-authority metaphor.

---

## 14. `src/app/(marketing)/organizations/page.tsx`

6 em dashes, all escaped, all user-facing (use-case body copy, scale-features bullet, hero subtitle).

| Line | Locale | Field | Before | After |
|---|---|---|---|---|
| 45 | EN | useCases.staffing.body | Whether you place performers, crew, coordinators, or domain specialists — organize people by skill, location, and availability, and surface the right match fast. | Whether you place performers, crew, coordinators, or domain specialists, organize people by skill, location, and availability, and surface the right match fast. |
| 87 | ES | useCases.staffing.body | Ya coloques performers, crew, coordinadores o especialistas — organiza a tu gente por habilidad, ubicación y disponibilidad, y encuentra al indicado en segundos. | Ya coloques performers, crew, coordinadores o especialistas, organiza a tu gente por habilidad, ubicación y disponibilidad, y encuentra al indicado en segundos. |
| 120 | EN | scaleFeatures[0] | SSO (Google Workspace, Okta) — on request | SSO (Google Workspace, Okta), on request |
| 128 | ES | scaleFeatures[0] | SSO (Google Workspace, Okta) — bajo solicitud | SSO (Google Workspace, Okta), bajo solicitud |
| 148 | EN | `heroSubtitle` | …makes that product browsable, filterable, and bookable — with the role-scoped access a real team needs. … | …makes that product browsable, filterable, and bookable, with the role-scoped access a real team needs. … |
| 166 | ES | `heroSubtitle` | …vuelve ese producto navegable, filtrable y reservable — con los accesos por rol que un equipo de verdad necesita. … | …vuelve ese producto navegable, filtrable y reservable, con los accesos por rol que un equipo de verdad necesita. … |

---

## 15. `src/app/(marketing)/how-it-works/page.tsx`

12 em dashes, all escaped, all user-facing (surface bodies, highlight bullets, hero subtitle).

| Line | Locale | Field | Before | After |
|---|---|---|---|---|
| 39 | EN | surfaces.site.body | A modern editorial website — nav, pages, posts, design system — that renders your roster front-and-centre. … | A modern editorial website (nav, pages, posts, design system) that renders your roster front-and-centre. … |
| 80 | ES | surfaces.site.body | Un sitio editorial moderno — navegación, páginas, posts, sistema de diseño — que pone tu roster al frente. … | Un sitio editorial moderno (navegación, páginas, posts, sistema de diseño) que pone tu roster al frente. … |
| 42 | EN | surfaces.site.highlights[1] | Editorial layouts — not drag-and-drop kitsch | Editorial layouts, not drag-and-drop kitsch |
| 83 | ES | surfaces.site.highlights[1] | Diseños editoriales — sin el kitsch de arrastrar y soltar | Diseños editoriales, sin el kitsch de arrastrar y soltar |
| 65 | EN | surfaces.pipeline.body | Inquiries arrive structured — not buried in a chat thread. … | Inquiries arrive structured, not buried in a chat thread. … |
| 106 | ES | surfaces.pipeline.body | Las consultas llegan estructuradas — no enterradas en un chat. … | Las consultas llegan estructuradas, no enterradas en un chat. … |
| 68 | EN | surfaces.pipeline.highlights[1] | Versioned offers — nothing lost to memory | Versioned offers, nothing lost to memory |
| 109 | ES | surfaces.pipeline.highlights[1] | Ofertas versionadas — nada se pierde de memoria | Ofertas versionadas, nada se pierde de memoria |
| 125 | EN | hero `subtitle` | Most of what holds representation businesses back isn't effort — it's tooling. … | Most of what holds representation businesses back isn't effort. It's tooling. … |
| 132 | ES | hero `subtitle` | Lo que más frena a los negocios de representación no es el esfuerzo — son las herramientas. … | Lo que más frena a los negocios de representación no es el esfuerzo. Son las herramientas. … |

---

## 16. `src/app/(marketing)/network/page.tsx`

4 em dashes, all escaped, all user-facing.

| Line | Locale | Field | Before | After |
|---|---|---|---|---|
| 40 | EN | facts[1].detail | Clients search by category, location, availability, skill — across every opted-in roster on the platform. | Clients search by category, location, availability, skill, across every opted-in roster on the platform. |
| 66 | ES | facts[1].detail | Los clientes buscan por categoría, ubicación, disponibilidad y habilidad — en cada roster que decidió aparecer en la plataforma. | Los clientes buscan por categoría, ubicación, disponibilidad y habilidad, en cada roster que decidió aparecer en la plataforma. |
| 92 | EN | `heroSubtitle` | …where clients actually browse — so your people get seen even when you're not pitching. | …where clients actually browse, so your people get seen even when you're not pitching. |
| 105 | ES | `heroSubtitle` | …donde los clientes de verdad buscan — así tu gente se ve incluso cuando no estás presentándola. | …donde los clientes de verdad buscan, así tu gente se ve incluso cuando no estás presentándola. |

---

## 17. `src/app/(marketing)/pricing/page.tsx`

4 em dashes (2 literal, 2 escaped), all in the `fineB` footnote fragment that's concatenated with `fineA`/`fineC` into one sentence.

| Line | Locale | Field | Before | After |
|---|---|---|---|---|
| 56 | EN | `fineB` | No hostage data — | No hostage data: |
| 72 | ES | `fineB` | Sin secuestrar tus datos — | Sin secuestrar tus datos: |

(Rendered sentence goes from "…No setup fees. No hostage data — full export on every paid plan." to "…No setup fees. No hostage data: full export on every paid plan." Same for ES.)

Also 2 escaped em dashes appear in the file's own comment block (lines documenting the currency-picker placement, e.g. `// Same component the marketing footer uses (no fork) — keeps a single`) — optional, non-user-facing.

---

## 18. `src/app/(marketing)/faq/page.tsx`

2 em dashes, escaped, both in the hero `subtitle`.

| Line | Locale | Field | Before | After |
|---|---|---|---|---|
| 22 | EN | `subtitle` | …If you have a question that isn't here, email hello@domain — we reply same-day. | …If you have a question that isn't here, email hello@domain. We reply same-day. |
| 30 | ES | `subtitle` | …Si tu duda no está aquí, escríbenos a hello@domain — te respondemos el mismo día. | …Si tu duda no está aquí, escríbenos a hello@domain. Te respondemos el mismo día. |

---

## 19. `src/app/(marketing)/legal/privacy/page.tsx`

**No em dashes, no AI-tells.** No changes needed.

## 20. `src/app/(marketing)/legal/terms/page.tsx`

**No em dashes, no AI-tells.** No changes needed.

---

## Verification after implementation

```bash
cd web
# Zero em dashes (literal or escaped) left in the 20 files:
grep -rn '—\|\\u2014' \
  src/lib/marketing/copy.ts \
  src/components/marketing/case-studies-data.ts \
  "src/app/(marketing)/get-started/page.tsx" \
  "src/app/(marketing)/get-started/actions.ts" \
  "src/app/(marketing)/integrations/page.tsx" \
  src/components/marketing/feature-grid-section.tsx \
  src/components/marketing/how-it-works-section.tsx \
  src/components/marketing/simple-page-hero.tsx \
  src/components/marketing/hero-section.tsx \
  src/components/marketing/footer.tsx \
  src/lib/marketing/photography.ts \
  "src/app/(marketing)/operators/page.tsx" \
  "src/app/(marketing)/agencies/page.tsx" \
  "src/app/(marketing)/organizations/page.tsx" \
  "src/app/(marketing)/how-it-works/page.tsx" \
  "src/app/(marketing)/network/page.tsx" \
  "src/app/(marketing)/pricing/page.tsx" \
  "src/app/(marketing)/faq/page.tsx" \
  "src/app/(marketing)/legal/privacy/page.tsx" \
  "src/app/(marketing)/legal/terms/page.tsx"
# Expect zero matches once user-facing rewrites land (comment cleanups are optional
# and can trail behind without failing this check's intent).

npx tsc --noEmit && npm run lint
```

Human read-through after the mechanical grep: confirm every rewritten sentence still reads as natural spoken English/Spanish (not a comma-spliced run-on), and that ES rewrites keep natural "tú" register, not a literal translation of the EN fix.
