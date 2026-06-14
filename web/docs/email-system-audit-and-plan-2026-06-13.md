# Email System — Audit Matrix + Phased Plan (2026-06-13)

> Blunt, evidence-based audit of the entire Tulala/Impronta email pipeline. Built from
> (a) the **live production `notification_dispatch_log`** (queried directly), (b) a 10-agent
> parallel code audit of `web/src/lib/email/*`, `web/src/lib/notifications/*`, `web/emails/*`,
> the Resend webhook, the crons, the ad-hoc senders, and the platform-admin shell, and
> (c) git history of the from-resolution path. Where the code and the live ledger disagree,
> the **ledger wins** and is called out.

---

## 0. Executive summary (the blunt version)

The email system is **mostly built and mostly works, but it has one live, silent, intermittent
data-loss bug at its core, plus a layer of invisibility that hid it.** Specifically:

1. **CRITICAL / LIVE — tenant-scoped emails intermittently fail** because the platform-default
   `from` address falls back to the **unverified** `impronta.agency` domain, which Resend
   rejects. Sends only *succeed by accident* (when a DB lookup throws and a `catch` substitutes
   the verified `tulala.digital`). **The failure rate will increase as the DB stabilizes.**
   Confirmed in prod: 8 failed/mislabeled rows, all `This API key is not authorized to send
   emails from impronta.agency`.

2. **HIGH — the failures were invisible.** The dispatcher records send failures to the DB ledger
   and `console` only — **never to Sentry** — so nothing paged anyone. *Email health must be
   audited via `notification_dispatch_log`, not Sentry.*

3. **HIGH — open/click tracking is completely dark** (0 opens, 0 clicks across all 133 sent
   emails). This is a **Resend dashboard setting**, not a code bug — Open/Click tracking is off
   for `tulala.digital`, so Resend never emits the events the (correct) webhook handler is
   waiting for. `delivered` is also sparse — the webhook endpoint is likely not subscribed to
   `email.delivered`.

4. **MEDIUM — known-missing emails**: trial-start, trial-end (`trial_will_end` only logs),
   invoice (`Invoice.tsx` is an orphan), and booking-deposit confirmation do not exist.

5. **MEDIUM — bypass + polish debt**: several real-money/guest emails (payout reversal, guest
   claim-link) bypass the dispatcher (no suppression check, no log, no unsubscribe); templates
   are English-only despite a bilingual app; ~9 templates hardcode the literal "Tulala".

6. **The admin console is ~nonexistent**: the only email-management UI today is a single
   from-address text field on `/platform/admin/integrations`. Everything else (log viewer,
   retry, suppression management, domain health, test-send, metrics, toggles, editable
   templates) is greenfield — but the building blocks (the ledger table, the credential-vault
   pattern, the builder-overlay pattern, the platform-admin shell) all exist to build on.

**Overall grade: the rail is real and the architecture is sound, but it is shipping silent
failures and flying blind on deliverability.** Fixing #1 + #2 + #3 is small and high-leverage;
the rest is finish-and-polish + the console.

---

## 1. The critical bug — full root cause (with evidence)

### Two divergent hardcoded `from` fallbacks
| Path | File | Fallback | Domain |
|---|---|---|---|
| Direct `sendEmail` (no tenantId) | [index.ts:20](../src/lib/email/index.ts) `getFrom()` | `Tulala <noreply@tulala.digital>` | **VERIFIED** ✅ |
| Platform/tenant resolver | [resend-client.ts:15](../src/lib/email/resend-client.ts) `EMAIL_FROM` | `Impronta Agency <noreply@impronta.agency>` | **UNVERIFIED** ❌ |

`EMAIL_FROM` is **unset in prod** and there are **zero `email_domain` rows** in
`tenant_integrations`, so `resolvePlatformEmailFrom()` falls all the way through to the
hardcoded `impronta.agency` literal. Resend rejects it.

### The actual mechanism (worse than "some events fail")
The engine's email channel always passes `tenantId`. `resolveFrom()` then:
- `!tenantId` → `getFrom()` = **tulala.digital** → sends (platform alerts, `workspace.created`, digest).
- `tenantId` set → `resolveTenantEmailFrom()`:
  - lookup returns cleanly with `white_label_email=false` (the **normal** case) → `resolvePlatformEmailFrom()` → **impronta.agency** → **FAILS**.
  - lookup **throws** → bubbles to `resolveFrom`'s `catch` ([index.ts:40](../src/lib/email/index.ts)) → `getFrom()` = **tulala.digital** → **sends**.

So a tenant-scoped send **succeeds only when the entitlement/integration DB read fails.**

### Evidence it is live + intermittent (not a clean version cutover)
Live `notification_dispatch_log`, `inquiry.submitted`, tenant `40081ec3` (no entitlement row):
```
2026-06-07 02:32  sent      (3 recipients)   ← AFTER the failures
2026-06-06 23:22  failed/suppressed (3)      ← whole fan-out failed
2026-06-06 22:34  sent      (3 recipients)
```
And the smoking gun — `workspace.over_seat_limit`, same tenant, **one second apart**:
```
2026-06-08 09:00:41  failed   (impronta.agency error)
2026-06-08 09:00:42  sent
```
Same tenant, same event, seconds apart, opposite outcomes ⇒ **per-recipient runtime
non-determinism**, exactly matching the "succeeds only when the DB read throws" mechanism.
The `#230` commit (Jun 3, "Platform integration defaults") introduced the
`resolvePlatformEmailFrom` DB-read path; failures begin **Jun 4**.

### The fix (deterministic + correct)
1. **Code**: unify both fallbacks on a single shared constant pointing at the **verified**
   domain (`Tulala <noreply@tulala.digital>`). Removes the only place an unverified domain
   enters the `from` line; both the clean path and the `catch` path then yield a verified
   sender. *(Pending the brand decision — see §6.)*
2. **DB**: seed a platform `email_domain` integration row (`from_address` = chosen verified
   sender) so `resolvePlatformEmailFrom()` returns a **managed** value and the admin
   from-address field has something to show/edit.
3. **Optional env**: set `EMAIL_FROM` in Vercel as belt-and-suspenders (overrides both `??`).
4. **Backfill**: after the fix, retry the 8 failed rows and reconcile the 2 zombie `queued`
   rows + the mislabeled `suppressed`-with-error rows.
5. **Observability**: add `Sentry.captureException` in the dispatcher catch so the next
   regression pages instead of hiding.

---

## 2. The audit matrix

**Legend** — Status: ✅ working (live-proven) · 🟢 working (wired, not yet live-proven) ·
🐛 bug-affected (from-domain) · ⚠️ fragile/untested · 🚫 missing · 🔇 bypasses dispatcher.
Send path: **engine** (catalog→dispatcher, logged+tracked) · **ad-hoc** (Resend, hand-built
HTML, no log) · **supabase** (Supabase-native auth mail, no log/tracking).

### 2.1 Registration / auth / onboarding
| Email | Path | Template | Status | Notes / gap |
|---|---|---|---|---|
| Signup confirmation | supabase | `auth/SignupConfirm.tsx`→`confirm.html` | ⚠️ | No log/tracking; **hosted SMTP unverified** — deliverability unproven |
| Password reset | supabase | `auth/PasswordReset.tsx`→`recovery.html` | ⚠️ | same |
| Magic link | supabase | `auth/MagicLink.tsx`→`magic_link.html` | ⚠️ | same |
| Email change | supabase | `auth/EmailChange.tsx`→`email_change.html` | ⚠️ | same |
| Guest claim-link | ad-hoc 🔇 | inline HTML (guest-claim-link.ts) | 🐛🔇 | **passes tenantId → impronta.agency fail**; no log/unsub; uses `token_hash` |
| Guest auto-ack ("email a copy") | ad-hoc 🔇 | inline HTML (guest-auto-ack.ts) | 🔇 | no tenantId → tulala (works); no log/unsub; uses `action_link` (PKCE-mismatch risk vs claim-link) |
| Workspace welcome (`workspace.signup_completed`) | engine | `workspace/Welcome.tsx` | ✅ | live-sent |
| Talent onboarding (`account.talent_onboarded`) | engine | `talent/Welcome.tsx` | 🟢 | tenantId=null (Tulala brand) |
| Talent profile approved | engine | `talent/ProfileApproved.tsx` | 🟢 | not live-proven |
| Roster claim invite | engine | `talent/ClaimInvite.tsx` | 🟢 | "Reminder ·" prefix on resend |
| Team-member invite | engine | `workspace/TeamInvite.tsx` | 🟢 | |
| Roster join requested | engine | `workspace/RosterJoinRequest.tsx` | ✅ | live-sent |
| Roster join approved | engine | `talent/JoinApproved.tsx` | ✅ | live-sent |
| Roster join rejected | engine | `talent/JoinDeclined.tsx` | 🟢 | not live-proven |
| CMS form submission | engine | `workspace/FormSubmission.tsx` | 🟢 | |
| Client welcome | — | `client/Welcome.tsx` | 🚫 | **orphan template** — no catalog entry |

### 2.2 Commerce / money / plan
| Email | Path | Template | Status | Notes / gap |
|---|---|---|---|---|
| Payment received (client receipt) | engine | `client/PaymentReceipt.tsx` | ✅ | live-sent (1/33 `delivered` recorded) |
| Payment received (workspace alert) | engine | `workspace/PaymentReceived.tsx` | ✅ | email+in_app |
| Payment failed (dunning) | engine | `billing/PaymentFailed.tsx` | ⚠️ | wired, **dedupe untested** |
| Payout settled | engine | `talent/PayoutSettled.tsx` | ⚠️ | depends on `markPayoutSent` being reached — main pay path may skip it |
| Plan upgraded | engine | `billing/PlanUpgraded.tsx` | 🟢 | required (no opt-out); not live-proven |
| Plan downgraded | engine | `billing/SubscriptionCanceled.tsx` | 🟢 | required; reuses Canceled component |
| Subscription cancelled | engine | `billing/SubscriptionCanceled.tsx` | 🟢 | required; email-only |
| Payout reversal / refund / dispute | ad-hoc 🔇 | inline HTML (payout-reversal-notify.ts) | 🔇⚠️ | **real money, no suppression check, no log** — should migrate to catalog |
| Trial start | — | — | 🚫 | does not exist |
| Trial ending (`trial_will_end`) | — | — | 🚫 | **only logs, never emails** (webhook-handler.ts:392) |
| Invoice / renewal receipt | — | `billing/Invoice.tsx` | 🚫 | **orphan template** — no event; (Stripe sends its own hosted receipt) |
| Booking-deposit confirmation | — | — | 🚫 | deposit UX is **in-app chat card only** |

### 2.3 Inquiry / offer / booking operations
| Email | Path | Template | Status | Notes / gap |
|---|---|---|---|---|
| Inquiry submitted → client | engine | `client/InquiryReceived.tsx` | 🐛 | **bug-affected** (live failures) |
| Inquiry submitted → coordinator | engine | `workspace/CoordinatorAssigned.tsx` | 🐛 | **bug-affected** |
| Inquiry submitted → talent | engine | `talent/InquiryInvited.tsx` | 🐛 | **bug-affected** |
| Coordinator assigned | engine | `workspace/CoordinatorAssigned.tsx` | 🟢 | |
| Offer sent | engine | `client/OfferReady.tsx` | ✅ | live-sent |
| Offer accepted (`approval.all_complete`) | engine | `workspace/OfferAccepted.tsx` | ✅ | live-sent |
| Offer declined (`offer.client_rejected`) | engine | `workspace/OfferDeclined.tsx` | ✅ | live-sent |
| Talent declined | engine | `workspace/TalentDeclined.tsx` | 🟢 | |
| Assignment timed out | engine | `workspace/AssignmentTimedOut.tsx` | 🟢 | |
| Roster talent invited | engine | `talent/InquiryInvited.tsx` | ✅ | live-sent |
| Inquiry cancelled (participants) | engine | `notifications/InquiryCancelled.tsx` | 🟢 | one entry, CTA branches on role |
| New message (`message.new`, **digest**) | engine | `notifications/Digest.tsx` | ⚠️ | **only digest entry**; live **15/24 bounced**; **2 zombie `queued` rows since Jun 1** |
| Booking confirmed → client | engine | `client/BookingConfirmed.tsx` | ✅ | live-sent |
| Booking confirmed → talent | engine | `talent/BookingConfirmed.tsx` | 🟢 | |
| Booking cancelled (client/talent/coordinator) | engine | `workspace/BookingCanceled.tsx` | 🟢 | one component, 3 entries |
| Booking day-of reminder (2 entries) | engine | `notifications/DayOfReminder.tsx` | ⚠️ | cron-driven, untested |
| New inquiry alert | — | `workspace/NewInquiryAlert.tsx` | 🚫 | **orphan** (superseded by CoordinatorAssigned) |

### 2.4 Platform / internal alerts
| Email | Path | Template | Status | Notes / gap |
|---|---|---|---|---|
| New workspace (`platform.new_workspace`/`workspace.created`) | engine | `platform/NewWorkspaceAlert.tsx` | ✅ | tenantId=null → verified; live-sent |
| Workspace signup failed | engine/ad-hoc | `platform/SignupFailedAlert.tsx` | ⚠️ | producer wiring contested between auditors; also an ad-hoc path w/ hardcoded `impronta.group` support addr |
| Workspace over quota | engine | `platform/UsageQuotaAlert.tsx` | 🚫 | **fully orphaned** — no producer emits it |
| Over seat limit (`workspace.over_seat_limit`) | engine | `workspace/SeatLimitReached.tsx` | 🐛 | wired via usage-audit cron; **bug-affected** (live failures) |
| Notification self-test | engine | reuses `NewWorkspaceAlert` | 🟢 | the hook for the console's **test-send** feature |
| Founder usage digest / network alert | ad-hoc 🔇 | inline (usage-audit cron, etc.) | 🔇 | internal ops — correctly ad-hoc |
| Lead confirmation (get-started) | ad-hoc 🔇 | inline | 🔇 | no tenantId → verified; works |

### 2.5 Systemic findings (cut across all of the above)
| # | Severity | Finding | Fix surface |
|---|---|---|---|
| S1 | HIGH | Open/click tracking dark (0/133) | **Resend dashboard** — enable Open+Click tracking on tulala.digital |
| S2 | MEDIUM | `delivered_at` sparse | **Resend dashboard** — subscribe webhook endpoint to `email.delivered` (+ opened/clicked) |
| S3 | HIGH | Send failures never reach Sentry (DB+console only) | code — `captureException` in dispatcher catch |
| S4 | MEDIUM | Retry cron **cannot recover** from-domain failures (re-fails on same `from`, ages out 24h); no `attempts` column; no reaper for zombie `queued` | code + the §1 fix |
| S5 | MEDIUM | `suppressed` rows carry a stale send-error `error_message` (retry flips status without clearing it) | code — clear `error_message` on suppress |
| S6 | MEDIUM | i18n: all email copy English-only despite bilingual EN/ES app | code — thread `locale` (already on recipient) into render |
| S7 | LOW-MED | White-label brand leak — ~9 templates hardcode literal "Tulala" instead of `brand.accountName` | code |
| S8 | MEDIUM | Ad-hoc/guest sends bypass suppression + log + unsubscribe (guest = highest bounce risk, currently invisible) | code — migrate to dispatcher / add suppression pre-check |
| S9 | LOW | `locale` column is always `'en'` (hardcoded at hydration) | code (ties to S6) |

---

## 3. Phased plan

### P0 — Stop the bleeding (small, high-leverage) — *ship first*
- **P0.1** Unify the `from` fallback on the verified domain (single shared constant); fix
  `resend-client.ts:15`. *(brand per §6)*
- **P0.2** Seed the platform `email_domain` integration row (managed default).
- **P0.3** Add `Sentry.captureException` to the dispatcher failure path (S3).
- **P0.4** Backfill: retry the 8 failed rows; reap/cancel the 2 zombie `queued` rows; clear
  stale `error_message` on the mislabeled `suppressed` rows (S5).
- **P0.5** *(your action — Resend dashboard)* enable Open+Click tracking and subscribe the
  webhook endpoint to `email.delivered`/`opened`/`clicked` (S1, S2).
- **Proof**: live test-sends of `inquiry.submitted` (all 3 variants) + `workspace.over_seat_limit`
  → confirm `sent` + verified `from` + a `delivered`/`opened` webhook lands in the ledger.

### P1 — Make every email actually work + harden
- **P1.1** Retry cron: add `attempts` column + max-attempts + a reaper for stale `queued`
  digest rows; make retry skip permanently-dead rows (S4).
- **P1.2** Migrate the real-money/guest ad-hoc sends (payout reversal/refund/dispute, guest
  claim-link) to the catalog/dispatcher so they get suppression checks + a log trail; add a
  shared `isEmailSuppressed` pre-check to any send that stays ad-hoc (S8).
- **P1.3** Build the **known-missing** emails per §6 decision: trial-end (+maybe trial-start),
  booking-deposit confirmation, invoice (if wanted), payout-reversal catalog entries.
- **P1.4** Wire or delete the orphans: `UsageQuotaAlert` (wire to usage-audit or delete),
  `client/Welcome`, `workspace/NewInquiryAlert`, `billing/Invoice`.
- **P1.5** Verify the untested-but-wired set with live test-sends (billing/plan, dunning,
  payout settled, booking cancelled, day-of reminder, claim/team invites, profile approved).
- **P1.6** Confirm Supabase-native auth-mail deliverability in prod (or route via Resend — §6).

### P2 — Polish
- **P2.1** i18n: render templates in the recipient's locale (S6/S9).
- **P2.2** Kill the white-label brand leak — use `brand.accountName` (S7).
- **P2.3** Template QA pass (consistency, CTAs, dark-mode, spam-score, preview text).

### P3 — Platform-Admin email console (`/platform/admin/email`)
Two tiers. **P3a is clearly worth it; P3b is the bigger lift — recommend deferring until P3a
is proven (see §6).**

**P3a — Observability + control (build now)**
- **Send-log viewer** over `notification_dispatch_log` (filters: status, event_kind, tenant,
  recipient, date) + per-row delivery/open/click/bounce/complaint state + `error_message`.
  *Reuse the `loadPlatformAuditLog` service-role-read pattern.*
- **Failure observability + manual retry** of failed/suppressed rows (today retry is cron-only).
- **Suppression management** — view/add/remove `email_suppressions`.
- **Sending-domain health** — platform default + per-tenant verification status + DNS records.
  *Extend the existing `tenant_integrations` credential-vault card.*
- **Test-send / preview** — trigger `platform.notification_selftest` (and any event) to a
  chosen recipient; preview a template.
- **Delivery metrics** — sent/delivered/bounce/open/click rates by category/tenant.

**P3b — Runtime control of the flow (scope, then decide)**
- **Event toggles** — enable/disable which events email, per-platform/tenant.
  *Reuse the `builder_catalog_overlay` "DB overlay on code defaults" pattern.*
- **DB-editable templates** — subject/body editable without a deploy. **Recommendation: NOT a
  full DB template engine.** Do an **override store on top of the code defaults** (a
  `notification_template_overrides` row keyed by `templateId`+locale holding editable
  subject + a constrained block/markdown body; the code React template stays the default and
  the fallback). Full freeform HTML editing is a security/deliverability footgun and a big
  build for marginal value over overrides.

---

## 4. What needs *your* hand (no code can do these)
1. **Resend dashboard** — enable Open + Click tracking on `tulala.digital`; ensure the webhook
   endpoint is subscribed to `email.delivered`, `email.opened`, `email.clicked` (S1, S2).
2. **Brand/domain decision** (§6 Q1) — drives the P0 fix.
3. *(if Impronta brand chosen)* verify `impronta.agency` DNS in Resend before P0 can ship.
4. *(if unified auth-mail chosen)* provision a Resend SMTP credential + configure it in the
   **hosted** Supabase dashboard (config.toml does not propagate to hosted).

## 5. QA method (per the deploy contract)
- Branch off `main`; one migration per change; `npm run db:push` before merge; big-heap
  `tsc` + `lint` gate; `deploy:smoke` after deploy.
- **Prove sends live** — test recipient + Resend dashboard + `notification_dispatch_log` +
  `/api/webhooks/resend` events. Never declare "working" on a clean compile.
- Local authed admin QA on `app.lvh.me:3000` + dev sign-in fixture.

## 6. Open decisions (blocking large work)
1. **Sending brand/domain** — `tulala.digital` (verified now → ship today) **[recommended]**
   vs keep Impronta brand and verify `impronta.agency` first (blocks P0 until DNS verified).
2. **Console scope** — P3a observability tier now, P3b (toggles + editable templates) later
   **[recommended]** vs build the full console in one pass.
3. **Auth emails** — keep Supabase-native **[recommended for now]** vs route through Resend
   (unified tracking/branding via a Supabase send-email auth hook / Edge Function — substantial).
4. **Missing emails** — which of {trial-end, trial-start, invoice, booking-deposit} to build in
   P1 (trial-end + booking-deposit are the highest-value; invoice may be redundant with Stripe's
   hosted receipt).
