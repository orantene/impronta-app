# Business onboarding template (NW5, TUL-1204)

A reusable checklist any new workspace instantiates for its trade.

- Data and resolver: `src/lib/onboarding/business-onboarding-template.ts` (pure, no DB).
- Copy: `messages/{en,es}.json` under `businessOnboarding.<stepId>.{title,description}`.
- Steps: basics, services, hours, location, photos, team, payments, preview, publish. Each has an `order`, a `trades` applicability (`"all"` or TRADE_PROFILES keys) and one `readinessKey`.
- Readiness keys reuse the first-day keys (`photo, services, location, availability, preview, website`, from `talent-agenda/first-day.ts`) plus `essentials` (use `essentialsReady`), `team` and `payments`, which the caller computes from existing checks.

```ts
const facts = factsFromFirstDay(firstDayInput, { essentials: essentialsReady(e), team: n > 1, payments: ok });
const steps = resolveBusinessOnboarding(tradeKeyOrTypeSlug, facts); // ordered, with `done`
```

Unknown trades fall back to the beauty profile. To add a trade, add it to `TRADE_PROFILES`; to add a step, add a row plus en and es copy (the test fails otherwise).

Wired (TUL-1204): `business-onboarding-plan.ts` instantiates the template for one business (`instantiateBusinessOnboarding`: name and locale substituted into the `{business}` copy, a team-capable workspace always gets every section, facts read from the arrival by `factsFromArrival`). The onboarding arrival step renders it for business arrivals (`data-testid="onb-business-setup"`). The workspace dashboard checklist card is still unwired.
