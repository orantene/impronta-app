## Tickets engine: the ticket e-mail with QR, door copy in the operator's language, comps counted, D-147 floor

### The ticket e-mail (there was none)
- On main no purchased-ticket e-mail existed: the paid path minted admissions and sent nothing; `event-holds.ts:216` ("attached", nothing attached) and `ticket-self.ts:108` (code only) were English stubs. Now `lib/email/ticket-issued.ts` (es/en, tenant-branded from, event, night in the venue's zone, per-admission QR, code, "Ver mi entrada" → `/ticket/<token>`, receipt link) sent by `lib/events/ticket-delivery.ts`.
- Send exactly once: `admissions.delivery` is the claim (conditional UPDATE … WHERE delivery IS NULL); a failed send releases it; `force` for resend. Recipient chain holder → customer → payer; locale chain buyer's page → customer → tenant → en.
- Hooked through `mintAndDeliverForPaidOrder` at the Stripe webhook, POS counter and door settle; the $0 web order and a comp with an e-mail deliver too; `ticketResend` and the Delivery sheet reuse it (stubs removed).
- The QR is a hosted PNG (`/api/tickets/<signed-token>/qr.png`, host-scoped, version-checked so a transferred ticket's old image 404s, rate-limited), not a data URI (Gmail strips those). `/ticket/<code>` now shows the QR too.

### Door
- `/admin/events/door` was hardcoded English ("In", "Point the scanner here"). It now reads the POS door's keys, so a Spanish door says **Admitido**. The POS door's "No ticket email is sent yet" copy is corrected (en/es/fr).

### Day tab
- "Asignación de cortesías" printed a hardcoded "Ninguna". `loadSessionComps` counts valid comp admissions for the night ("3 · Ana, Luis, +1"), refreshed after each comp.

### D-147 (UI half)
- One unreadable pool blanked Vendidas AND Restantes for the whole night. `nightFigures` now returns `unknownPools` and sums the rest; the tiles show "≥ n" / "≤ n" with a note; the pool id is in the log. The RPC half stays with the program session.

### Not in this PR
- D-146 (`admission_comp` violates `order_lines_payee_xor`): migration owned by the program session.

### Tests
`ticket-issued` (5), `ticket-delivery` (5, scripted PostgREST fake), `ticket-delivery-hooks.static` (4), `events-model` (9), venue tests (resend/deliver), allow-list (48), unchecked-read guard, `verify:ui-messages`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
