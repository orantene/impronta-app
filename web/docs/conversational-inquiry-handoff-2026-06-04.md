# Conversational Inquiry — SHIPPED Handoff (2026-06-04)

**Status: LIVE on production**, proven end-to-end on `improntamodels.com`. Full record of what was
built, how to QA it yourself, and how to find + fix errors the way I did.

---

## 1. What shipped

A guest on a public talent profile (`/t/[profileCode]`) starts a real booking conversation from a
floating **"Message {name}"** chat — no login. The message becomes a real inquiry in the existing
Messages engine; the talent/coordinator sees it with a buyer **trust chip** and can reply.

**Proven live** (`improntamodels.com/t/TAL-00036`): launcher → panel (honest "the team replies by
email" + warm opener) → message → name+email gate → **send creates a real inquiry** → auto-ack
("Got it — we've received your message") → "we emailed a copy to {email}" → thread mode.

### Merged to `main`, deployed
| PR | What |
|---|---|
| **#235** | MVP: launcher + `MiniChatPanel`, guest server actions (start/send/fetch) with a service-role + ownership gate (guest = `x-impronta-guest` cookie), email-verified claim, `GuestTrustChip` in the talent thread, anti-abuse floor (Upstash KV rate-limit + disposable-email + honeypot + velocity→captcha), 3 migrations |
| **#239** | **Hotfix** — first send failed `validation_failed`; the guest intent omitted `location`/`date` which `validateIntentForSubmit` hard-requires. Seeded `status: "not_sure"`. |
| **#242** | Four follow-ups: live smoke check, HMAC cookie, trust badges, AI capture |

### The 6 follow-ups — status
1. ✅ **`deploy:smoke` live check** — fetches a new `/api/health/guest-chat` route on the live
   deployment to report the Upstash floor (`active`/`disabled`) instead of reading local env. Non-fatal.
2. ✅ **Email confirmations ENABLED on prod** — `mailer_autoconfirm=false` + raised
   `rate_limit_email_sent` 2→30 (Resend SMTP already configured). Signup flow already handled the
   no-session case; guest provisioning is admin-created (auto-confirmed) so guest chat is unaffected.
3. ✅ **HMAC-signed guest cookie** — `impronta_guest` now signed (forgery protection). Graceful:
   legacy behavior when `GUEST_COOKIE_SECRET` unset. Secret is set in Vercel → **effective on the
   NEXT deploy** (this build ran legacy because the var was set after the build started).
4. ✅ **Trust badges** — talent chip renders real email/phone/social/payment signals (honest:
   "verified" only when a real signal exists, else present_unverified/absent).
5. ⚠️ **AI conversational capture** — SHIPPED + SAFE but **dormant until an AI provider is
   configured for the tenant.** QA: inquiry created fine, but `location/date/budget` fell back to
   `not_sure` (no AI provider for Impronta → extractor no-ops). Non-blocking by design.
6. ✅ **Test artifacts deleted** — both QA inquiries + accounts + guest sessions removed from prod.

---

## 2. How to QA it yourself — step by step

> The launcher renders only on the agency surface (a tenant talent profile), e.g.
> `improntamodels.com/t/TAL-00036`.

1. Open `https://improntamodels.com/t/TAL-00036` (or any `/t/<code>`).
2. Click the floating **"Message {name}"** pill, bottom-right. Panel opens with the opener.
3. Type a message; click the **send arrow**. (Type real keystrokes — see the form gotcha in §3.)
4. The gate appears — **"Where should {name} reach you?"** with **Your name** + **Email**. Fill both;
   **Send message** activates when both are valid.
5. Click **Send message**. Success = your bubble + **"Got it — we've received your message…"** +
   **"We emailed a copy to {email}…"**, composer switches to "Write a reply…".
6. Talent/coordinator side: in the workspace Messages, the inquiry appears with the **buyer trust
   chip** (tier / ✓email / booking count / block·report).
7. (Optional, DB) the row is in `public.inquiries` with `guest_session_id` set + a provisioned
   `client_user_id`; `interpreted_query` holds the structured intent.

**Failure signature:** "Not sent — restored to the box" + "Add the missing details and try again" =
a server validation/abuse rejection; your text is preserved in the composer (the failed-send-restore
feature). See §3.

**Negative checks:** disposable email (`@mailinator.com`) → rejected; rapid-fire messages → throttle
(once Upstash live, §4); talent can block/report from the chip.

---

## 3. How to find & fix errors — the method

Worked example = the send-fails bug (#239):
1. **Get the exact on-screen error string** ("Add the missing details and try again.").
2. **Grep for it:** `grep -rn "Add the missing details" web/src` → returned by `guest-chat-actions.ts`
   as `fail("validation_failed", …)` when `createInquiryFromIntent` returns `validation_failed`.
3. **Read the validator** `web/src/lib/inquiry/inquiry-intent.ts` → `validateIntentForSubmit`
   hard-requires `requester.name`, `email|phone`, `brief.summary|talent`, **`location.city|status`**,
   **`date.event_date|status`**. Guest intent missed `location`/`date`.
4. **Fix the root cause:** seed `location: {status:"not_sure"}` + `date: {status:"not_sure"}`.
5. **Gate:** `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint`.
6. **Hotfix:** branch off `main`, commit, push, `gh pr create`, `gh pr merge --squash` → auto-deploy →
   re-align domains (§5) → re-QA.

### Pitfalls (don't repeat them)
- **Form-fill vs React state:** programmatically setting an input value does NOT fire React
  `onChange` → the form thinks it's empty → submit fails. **Type real keystrokes** to test forms.
- **Green `tsc`/`lint` ≠ works.** The validation bug passed the gate; only live click-through caught
  it. Always QA the real flow.
- **Check deletions, not just additions.** "−18" hid "−1186" twice — that was **base drift** (main
  moved ahead; the stale fork point shows main's newer features as phantom "deletions"). Verify with
  `git diff --diff-filter=D` vs *current* `origin/main`; fix by **merging current main into the
  branch** before shipping.
- **SSO-gated previews can't be QA'd by domain alias** (returns 401, and briefly 401'd
  `improntamodels.com`). Production deploys aren't gated → QA live after merge; roll back fast.
- **Migrations aren't auto-applied** — `npm run db:push` (or `web/scripts/apply-migration.mjs
  --apply-pending`) ships with the migration; `db:check` shows drift.

---

## 4. Config switches & outstanding

| Item | State | Activate / decide |
|---|---|---|
| Upstash anti-spam floor | DB created, env set in Vercel | Live next deploy; `/api/health/guest-chat` reports `active` |
| `GUEST_COOKIE_SECRET` | Set in Vercel | Cookie signing on at next deploy; legacy until then (no breakage) |
| AI capture (#5) | Shipped, dormant | Configure an AI provider/credential for the tenant so it extracts location/date/budget |
| Email confirmations | ENABLED on prod | Already on; revert via auth config `mailer_autoconfirm=true` |
| Trust phone/social badges | Wired | Show "verified" once real phone-OTP / social-link signals exist |

**Deferred (next steps):** guest realtime via Supabase Broadcast (currently a short poll);
returning-guest reopen/prefill; phone-OTP + social-link verification flows; AI "hold the
conversation" + a "confirm these details" card.

---

## 5. Reference
- **PRs:** #235 (MVP), #239 (validation hotfix), #242 (follow-ups) — all squash-merged to `main`.
- **Migrations (applied, `db:check` clean 410/410):** `20261017090000`, `20261017091500`, `20261018000000`.
- **Vercel env added (prod+dev):** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
  `GUEST_COOKIE_SECRET`. Upstash DB `tulala-guest-chat-rl` (us-east-1, free).
- **Domains:** `improntamodels.com` = Impronta primary; `impronta.tulala.digital` 308→it. Prod
  pointer doesn't reliably reassign custom domains — re-alias all four after a deploy
  (`vercel alias set <deploy-url> <domain> --scope oran-tenes-projects`), then `npm run deploy:smoke`.
- **Strategy docs:** `web/docs/conversational-inquiry-{strategy,deep-dives,execution-plan}-2026-06-03.md`.
- **Security:** adversarial review found+fixed a HIGH cross-tenant RLS write hole (now staff-only
  writes, runtime-proven) and a cookie-rotation spam bypass (now IP+email keyed); guest ownership
  boundary verified SAFE.
