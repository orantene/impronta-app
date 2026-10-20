# Stage 2: cron endpoints and how to trigger them on staging (TUL-1519 / TUL-1427)

The Stage 2 seed does not seed cron results. The crons below are run by the tester, then the effect is read back. Only env var NAMES appear here; never paste a value into a card, a chat or a log.

## Common to all five
- **Method and auth:** `GET`, header `Authorization: Bearer <value of CRON_SECRET>`. The env var name is `CRON_SECRET` (set in the staging deployment's environment; read it from the secret store, never echo it). No secret set means the route answers 503 `not_configured`; a wrong or missing bearer answers 401.
- **Host:** the paths live under `/api/cron`, which is a shared, host-agnostic API prefix (`web/src/lib/saas/surface-allow-list.ts`), so any registered staging host works. Use the staging app host the Conductor gives you (`<staging-app-host>` below). Do not use the qa-1..qa-6 hosts: they use the production database.
- **Schedules are from `web/vercel.json`.** Vercel only fires scheduled crons for the project's production deployment. A staging or preview deployment may never run them by itself, so a tester triggers them by hand with the request below and treats the schedule as the cadence the job is designed for.
- **Template** (value comes from the environment, never typed or printed):
  `curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://<staging-app-host>/api/cron/<name>"` then read the JSON summary. Run each twice: every job below is idempotent, and the second run must change nothing.

## 1. materialise-sessions
| | |
|---|---|
| Path | `/api/cron/materialise-sessions` |
| Schedule | `20 4 * * *` (daily 04:20 UTC) |
| What | Turns every active `session_series` into `sessions` rows for the next 90 days, each with a `session_tier` pool. Insert is `ON CONFLICT (series_id, starts_at) DO NOTHING`; a session that exists without any pool gets one (repair path). A series with no confirmed `timezone` is refused and reported. |
| Seeded series to watch | `series:dj` (12 Fridays, `s2-cantina-viernes-dj`), `series:ny` (6 Saturdays, America/New_York, crosses 2026-11-01), `series:clase` (8 Wednesdays, T5 yoga class). All three carry a timezone and an `ends_on`. |
| Read back | Run it twice. Session counts per series must stay 12 / 6 / 8 (the seed already inserted every night with its own pools, so the cron must create nothing and report them as existing). A mismatch means the cron's occurrence instants differ from the seeded ones: that is the finding. The New York series must keep wall time 21:00 across the DST change. |

## 2. ticket-refund-intents
| | |
|---|---|
| Path | `/api/cron/ticket-refund-intents` |
| Schedule | `*/15 * * * *` |
| What | Executes pending `ticket_refund_intents` (a paid ticket whose seat was lost, a cancelled event, a guest refund request): claims a row (`claimed_at`), refunds the order line, records the buyer message. Batch of 20, up to 12 retries when the refund is not settled yet. |
| Seeded data | None. Intents appear when a tester buys tickets live in Stripe TEST (events `s2-cantina-viernes-dj`, `s2-cantina-tertulia`, `s2-cantina-noche-larga`, `s2-cantina-cena-chef`, `s2-cantina-sabados-ny`) and then cancels the event or requests a refund. |
| Read back | Summary keys `claimed, refunded, effects_incomplete, refused_retry, partial_failure, other, skipped`. A second run must claim nothing for rows already executed. `partial_failure` is a defect to log (money moved, a leg failed). |

## 3. promo-hold-sweep
| | |
|---|---|
| Path | `/api/cron/promo-hold-sweep` |
| Schedule | `*/10 * * * *` |
| What | Releases expired promo redemption holds, then clears the stale `show_on_site` flag on promos that ended or were archived. |
| Seeded data | The promos arrive in push 3 (codes incl. the max-1 and max-3 race codes). Until then only `FONDA10` (T2) exists. |
| Read back | JSON `{ ok, released, showOnSiteCleared, showOnSiteFailed }`. Take a hold, let it expire, run: `released` counts it; seat counts already ignore expired holds, so a late run never blocks a buyer. |

## 4. booking-reminders
| | |
|---|---|
| Path | `/api/cron/booking-reminders` |
| Schedule | `0 * * * *` (hourly) |
| What | For each workspace whose local time is 08:00 (venue timezone, then workspace, then UTC), dispatches `booking.day_of_reminder` for live bookings that are tomorrow in that zone (agency bookings with a source inquiry, and talent-site guest appointments at the talent's own 08:00). Also runs the review-request reminders and automatic review requests. Dedupe is a stable event id plus a unique index, so repeat runs send nothing new. |
| Seeded data | None. Create a booking for tomorrow (T3 talent "Sesión de fotos", or a T1 table reservation) with an `@example.test` contact. |
| Read back | Only workspaces at 08:00 local are swept, so the run that matters is the one at 08:00 in the booking's zone (Cancun, UTC-5 all year; America/New_York for venue C). Check the email sink and the notification dispatch log; a second run in the same hour must add no rows. |

## 5. expire-orders
| | |
|---|---|
| Path | `/api/cron/expire-orders` |
| Schedule | `*/15 * * * *` |
| What | Cancels draft and pending_payment orders whose hold or idle fuse lapsed; recovers card collections whose response was lost (asks the provider first); reaps collection reservations, payment links, waitlist offers, party waitlist entries and admission holds. |
| Seeded data | None. Start a checkout and abandon it (QR menu on `s2-cantina-t1`, or a DJ ticket) so a hold exists. |
| Read back | The JSON counts (orders expired, `reservationsReleased`, `paymentLinksExpired`, `waitlistOffersReleased`, `partyWaitlistExpired`, `admissionHoldsReleased`). Capacity is returned by capacity's own reaper; this job moves the ORDER so it does not sit in pending_payment. |

## Cleanup note
`--cleanup` of the seed refuses once orders, tickets, redemptions or committed seats exist on a fixture tenant, so run the crons and the QA purchases first, record the evidence, then cancel and refund in the app before teardown.
