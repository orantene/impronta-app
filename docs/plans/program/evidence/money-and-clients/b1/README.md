# Stage B1 evidence — Solo talent work on hub as seller

**PR intent:** Private Calendar bookings / hold converts / quotes land on the
platform hub (`resolveTalentOwnWorkTenant` → `getPlatformHubTenant`). No
agency roster required. Agency work stays on the agency tenant.

**Base:** `origin/main` @ `605e0567c`

## Files

| Path | Change |
|---|---|
| `web/src/lib/talent-agenda/own-work-tenant.ts` | Hub tenant resolver + `talentIsSeller` assert |
| `web/src/lib/talent-agenda/create-slot.ts` | Drop `getActiveTalentAgencyContext` / `no_agency`; hub writes |
| `web/src/lib/talent-agenda/convert-hold.ts` | Convert to hub, not `hold.tenant_id` |
| `web/src/lib/talent-agenda/create-quote.ts` | Event/project quotes on hub |
| `web/src/lib/talent-agenda/g0-honesty.static.test.ts` | Assert hub path, no agency gate |
| `web/src/lib/talent-agenda/g2-quotes.static.test.ts` | Same for quotes |

## Not in this PR (explicit)

- Full `createInquiryFromIntent` → `convertToBooking` for New booking (talent
  cannot submit/convert today — Phase 2 seller actions).
- Order + lines from `talent_offerings` (B3).
- `customer_id` / `ensureCustomer` (B2).
- Automatic backfill of agency-tenant talent-own rows.

## Verify

```bash
cd web && npm run typecheck && npm run lint
# static contracts:
node --test src/lib/talent-agenda/g0-honesty.static.test.ts \
  src/lib/talent-agenda/g2-quotes.static.test.ts
```

Host proof (after merge + promote, solo talent, empty roster): New booking +
Event quote → rows `tenant_id` = hub; Calendar shows them.
