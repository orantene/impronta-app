# Impronta: LUMINA launch party — landing page, ticket sales and site fixes (prompt for a new agent)

Paste everything below the line into a new Claude Code chat opened in `/Users/oranpersonal/Desktop/impronta-app`. Name the chat "Impronta LUMINA event & site fixes".

---

You own ONE tenant end to end: **Impronta Models** (`improntamodels.com`, tenant slug `impronta`, the owner's own live agency; workspace at `improntamodels.com/admin`). Three deliverables, in this order, all today:

1. **The LUMINA event sells tickets on the internet**: a premium event landing page built in the Website builder, the four ticket types purchasable, the ticket delivered by e-mail with a QR, the door able to scan it.
2. **Fix what is broken on the live site** (below, "Site fixes").
3. **A written flow** the owner can read in 2 minutes: how a guest goes from Instagram → landing page → ticket → door, with screenshots.

Read first (10 minutes, in this order): `CLAUDE.md`; `docs/plans/program/FEATURES-FOR-DESIGN.md` and `docs/plans/program/WIDGETS-PROGRAM.md` (what is built and the block architecture; if they are not on main yet they are at `/private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/e30ce090-ce88-474f-861f-a6f78cb4f718/scratchpad/`); `web/src/app/(public)/events/[slug]/page.tsx` (the public event page: the `ticket_picker` island is the ticket section) and `web/src/app/(public)/_events/ticket-picker-actions.ts` (checkout: Stripe when `STRIPE_SECRET_KEY` is set, a mock success URL when it is not); `web/src/lib/site-admin/builder-node/registry.ts` (block kinds: `hero`, `section`, `image`, `gallery`, `stats`, `ticket_picker`, `qr_code`, `location_map`, `form`, `social_links`, `marquee`, `before_after`, `sticky_scroll`, `reveal`) and `render.tsx`; `web/src/lib/site-admin/builder-core/site-templates/looks/` (the Look tokens; Impronta's look is dark + gold, see the live site).

## The event (already created in the workspace; do not create a second one)
`improntamodels.com/admin/events?event=48d68b7b-659e-4cec-9871-219c02ba6a9e` — "Fiesta de lanzamiento LUMINA", sábado 3 de octubre, America/Cancun, sales open. Ticket types exist: Entrada general $1000 (3000 places, incluye copa de vino), Entrada después de las 23 h $500 (200, incluye 1 trago), Mesa para 10 $15000 (20, hasta 10 personas con $10000 en consumo), Cortesía $0 (3, hidden, by link only). Prices are MXN.

Programme (Spanish, keep the words):
18:00 arranca · 18–20 h Juegos de kermés · 20 h Show de magia + malabares · 21 h Desfile de moda · 22:30 Show premium "Mi corazón se apaga" · 23 h Apertura LUMINA · 1:30 am Show de fuego 🔥 · 3 am Show de telas + aros.
Nos acompañan: 7 DJs estratégicamente seleccionados · Parrilla gourmet · Pizza gourmet · Puesto de helados · Mini feria artesanal · Puesto de hidratación.
Entrada: 1000 MXN incluye copa de vino · después de las 23 h 500 MXN incluye 1 trago · Mesa 15000 MXN hasta 10 personas con 10000 MXN en consumo.

## Deliverable 1 — the landing page

**Step A, mockup first (30 min, before any code).** Design the page as a single dark, editorial, "sexy" event page: full-bleed hero with the LUMINA name, date, city, one CTA ("Comprar entradas"); a timeline of the night (the programme above as a vertical timeline with hour badges); a "Lo que te espera" grid (DJs, parrilla, pizza, helados, feria, hidratación) with imagery; a "Desfile & shows" gallery band; the ticket section (three visible tiers + a note that the courtesy tier is by invitation); "Mesa VIP" card with the 10-person / consumo rule; venue + map + hours; FAQ (dress code, edad, reembolsos, qué incluye cada entrada); footer with Impronta's contact. Mobile first at 390 px (sticky bottom "Comprar entradas"), then 1440. Produce the mockup as one HTML file or PNG set in `docs/plans/impronta-lumina/mockup/` and show it to the owner in the chat (screenshots) before Step B. Generate imagery with an AI image tool available to you (or the repo's image engine at `web/src/lib/site-admin/builder-core/site-templates/image-resolver.ts` / platform stock if present): night-club light beams, gold on black, fashion runway silhouettes, fire show, aerial silk performer, DJ booth, gourmet grill; never real people's faces from the internet, never another brand's photos. Every image gets a real `alt`.

**Step B, build it in the builder (not as a hand-written page).** Sign in as the owner on `improntamodels.com/admin` (the owner will sign in in your browser; never type credentials yourself). Website → new page `lumina` (URL `/lumina`) using the blocks above; put the `ticket_picker` block on it with `eventId = 48d68b7b-659e-4cec-9871-219c02ba6a9e`; upload the generated images through the builder's media picker (Media destination) so they are tenant assets, not external URLs; make `/events/fiesta-de-lanzamiento-lumina` (the engine page) link to `/lumina` or vice versa so there is ONE canonical page (prefer `/lumina` as the marketing page with the picker embedded). Publish. Add the page to the site header nav ("LUMINA") and a hero banner on the home page linking to it. Also produce a `/q/<code>` short link + QR (QR & Links) for Instagram: `improntamodels.com/q/lumina`.

If a block you need does not exist or renders badly, fix the block (that is product work, not a workaround): registry entry, render case, island, Look-token styles, mobile layout. Open a PR per fix; the program session ("Tulala workspace admin dashboard Development") merges through CI (PR → four green checks → normal merge; never `--admin`, never touch `production`).

## Deliverable 2 — the purchase actually works
- Walk the real flow on production as a GUEST on your phone-sized browser: `/lumina` → pick "Entrada general" ×1 → checkout. Production has Stripe keys; DO NOT complete a real card payment yourself. Stop at Stripe's hosted page and screenshot it. The owner will do one real $500 purchase and refund it (tell them exactly when).
- Prove issuance without money using the **Cortesía** tier: from Event Day (`Abrir día del evento`) issue one comp ticket to the owner's e-mail, open `/ticket/<code>`, resend, transfer, and scan it at the door (`Live check-in`). If comp fails with a database refusal, D-146 (comp line `order_lines_payee_xor`) is in flight on branch `work/small-9`; wait for that merge rather than patching around it.
- Check the seat/capacity numbers on the Tickets tab move (Vendidas / Restantes) after the comp; "Sold" showing "—" is D-147 (also in flight).
- Ticket e-mail: confirm the template renders the event name, date, tier, QR and the `/ticket/<code>` link in Spanish; fix copy if not.
- Record every step with a screenshot in `docs/plans/impronta-lumina/flow/README.md`: Instagram bio → `/q/lumina` → `/lumina` → tier → checkout → e-mail → `/ticket/<code>` → door scan → "Admitido". That README is Deliverable 3.

## Site fixes (live site, seen today)
- `improntamodels.com` home, "Studio & workshops" section: the orderable catalog block renders UNSTYLED (raw list, "-0+$450", "Only 12 left" glued to the price, form fields inline with "Order now"). Find the block (`menu_board` / orderable section → `menu-board-island.tsx`, the CSS it expects, whether the published page injects the block styles at all; compare with the same block in the builder preview). Fix the block for every tenant, not just this page. Then restyle the section in the Look (gold on black like the rest of the home).
- The home hero/roster CTAs and the "Your lineup · 3" widget are fine; do not touch them.
- Go through every published Impronta page at 390 and 1440 and list anything else broken or unstyled in the README before fixing (fix only blocks and copy; no redesign of the pages the owner did not ask for).

## Rules (non-negotiable)
- Never run `git switch` in `/Users/oranpersonal/Desktop/impronta-app`; work in a worktree: `git fetch origin && git worktree add /private/tmp/impronta-lumina -b work/impronta-lumina origin/main && web/scripts/setup-worktree.sh /private/tmp/impronta-lumina`.
- One heavy process at a time on this Mac (crashes under load): dev server OR `tsc` OR Playwright; never `next build` locally. Gate: `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint`, real exit codes.
- Production database: never `npm run db:push`; migrations (if any, unlikely) are named after `20261231241000` and applied by the program session.
- Live tenant writes are only the ones the owner asked for here: the page, media, QR link, the comp ticket to the owner's e-mail. No test orders, no fake customers on Impronta.
- Never print or commit secrets. Never type credentials or card numbers.
- Report to the program session (ccd send_message to `local_e30ce090-ce88-474f-861f-a6f78cb4f718`, or in this chat for the owner) with: mockup link, page URL, PRs opened, the flow README path, what is blocked and on what.
