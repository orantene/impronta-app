# TUL-633: new sites outside Mexico have nothing to book (decision memo)

Status: needs Oran's decision. Written 2026-10-13. Numbers are from read-only production SQL, counts only.

## The problem

Onboarding only has real prices for Mexico (MXN). Everywhere else a suggested service gets "price on quote", and since TUL-567 a service with no price is saved as a draft, never published. So a new talent outside Mexico finishes onboarding with hours set and an empty site. The finish screen still says "2 services".

Talents created in the last 30 days (17, excluding test and demo accounts), grouped by the currency of their offerings:

| Group | Talents | With hours | Priced + with length + published | Bookable (also has hours) | Only drafts |
|---|---|---|---|---|---|
| MXN | 5 | 5 | 5 | 5 | 0 |
| USD (all non-Mexico) | 6 | 4 | 3 | 2 | 2 |
| No offerings saved at all | 6 | 1 | 0 | 0 | 0 |

So Mexico is 5 of 5 bookable; everyone else is 2 of 6, and the 2 who got suggested services are stuck as drafts. Half of all new talents saved no services at all (a separate cause, mostly abandoned or skipped onboarding). Country on the profile is mostly empty ("unknown" for 9 of 17), so currency is the reliable split. Sample is small; the direction is clear.

Second issue: AI-read service names that are not in the pack had no length (`duration_minutes` null). A request-mode row with no length offers no slots (TAL-93948). Fixed already, see "Done now".

## Options

**A. Placeholder prices per country, in local currency, that the talent must confirm.**
Add USD (and later EUR, GBP, CAD) price columns to the packs, publish at once.
- For: a site is bookable the minute onboarding ends. Matches what Mexico gets.
- Against: we invent prices for a trade in a market we do not know. A wrong price that clients can book is a real harm (underpriced work, awkward cancellations). Conflicts with the TUL-567 rule that onboarding never publishes a price the talent did not give. Needs a currency table and ongoing upkeep.

**B. A mandatory price step before finish.**
The services screen cannot continue until each service has a price or the talent explicitly picks "price on quote".
- For: the price is always the talent's own. No invented numbers. Keeps the TUL-567 rule. Works in every country with no per-country data. Fixes MX typos too.
- Against: one more required field in the signup funnel, some drop-off risk. A talent who picks "quote" is back to a draft, so B still needs C or a clear nudge for that case.

**C. Publish unpriced services as "request a quote" that still takes a booking request.**
Row is published with price shown as "on request", booking mode request, default length.
- For: zero friction, site is never empty, clients can still ask.
- Against: reverses TUL-567 on purpose (that rule was added because a one-click publish put unpriced services live). The public price control was made to refuse "quote" at publish for this reason. Request mode offers no calendar slots, so the site is not "bookable" in the way the first-booking goal (TUL-77) means.

## Recommendation

B, with the existing "price on quote" choice kept as an explicit opt-out, plus a nudge when everything is still a draft.

Reasons: it needs no per-country price data, never publishes a number the talent did not choose, and keeps TUL-567 intact. The 2 USD talents stuck as drafts would have priced a service in about 10 seconds if asked at that moment. For talents who still choose quote, show a clear "Add a price to publish your services" cue with a link (finish screen and Today), so a draft-only site is never a silent dead end. Keep MX pack prices as editable defaults, as today. Do A later only for countries where we have real price evidence.

## Decision for Oran

When a talent outside Mexico finishes onboarding without entering a price, which should we do: (B) require a price or an explicit "on quote" choice before finish, (A) fill in our own placeholder prices in their currency, or (C) publish the service as "request a quote"? My pick is B.

## Done now (safe whatever you decide)

- Every service row onboarding writes gets a length (60 min, the same default the manual "add a service" row uses) when none is known. This only affects rows with no length; priced rows and real lengths are untouched, and unpriced rows stay drafts. Commit "TUL-633: onboarding service rows always get a length". Test in `web/src/lib/onboarding/service-price-gate.test.ts`.

## Not done, and why

- The "Add a price to publish your services" cue on the finish screen needs a new field on the arrival payload (`arrival.ts`, `build.server.ts`), which PR #3533 (W3a) is editing. Do it after that merges. The finish fact line counts draft services as "N services" (arrival fact `services`), which also overstates what is live.
- Today has no source for "draft services" (the shell bridge carries no offerings), so a Today cue needs new plumbing from the talent layout. Services page already shows a "needs a price" chip per row (TUL-567).

Suggested copy for the cue (neutral Mexican Spanish, no em dashes):
- EN: "Add a price to publish your services. Until then, they stay hidden from your site."
- ES: "Agrega un precio para publicar tus servicios. Mientras tanto, no aparecen en tu sitio."
