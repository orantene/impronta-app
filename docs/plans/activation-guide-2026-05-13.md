# Activation Guide — Tier 2 marathon (2026-05-13)

Every code-side piece of the 8-item marathon push is shipped. This guide
walks the **external activation steps** you need to do once to make the
shipped code actually work in production.

If you complete all 5 sections below, the platform goes from "code-
complete" to "fully self-serve agency onboarding in production" —
team invites email, claim invites email, paid subscriptions cycle
correctly, booking deposits update bookings, alternate domains attach
to Vercel automatically.

Estimated total time: **30–60 minutes** + DNS propagation wait.

---

## 1. Stripe webhook (5 minutes once you have the secret)

What it activates: F.4 / F.5 / F.6 — paid plans, booking deposits,
self-serve cancel/downgrade all close the loop end-to-end.

**Steps:**

1. Open Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
2. URL: `https://app.tulala.digital/api/webhooks/stripe`
3. Events to send (check these boxes):
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `account.updated` *(Connect — under "Listen to events on Connected accounts")*
   - `capability.updated` *(Connect)*
   - `payout.paid` *(Connect)*
   - `payout.failed` *(Connect)*
4. Click **Add endpoint**.
5. On the new endpoint's detail page, click **Reveal** under "Signing secret" and copy the `whsec_...` value.
6. Vercel → Project `tulala` → Settings → Environment Variables → **Add new**:
   - Name: `STRIPE_WEBHOOK_SECRET`
   - Value: paste the `whsec_...`
   - Environment: Production *(+ Preview if you want preview-deploy webhooks to work)*
7. Redeploy production: `vercel promote <latest-preview-url> --yes` (or push a new commit and re-alias).

**Verify:** Stripe Dashboard → Webhooks → click the endpoint → **Send test event** → pick `customer.subscription.updated`. Should return 200 (or 400 if the test customer doesn't exist; either way means signature verification works).

---

## 2. Resend (email delivery) — 10 minutes + DNS propagation

What it activates: F.1 team invites, F.2 talent claim invites, F.6
cancel confirmations all send real emails instead of returning the
URL for manual sharing.

**Steps:**

1. Sign up / log in to [resend.com](https://resend.com).
2. Domains → **Add Domain** → enter `tulala.digital` (or whichever sender domain you want).
3. Add the SPF + DKIM TXT records they show at your DNS registrar (Cloudflare, Namecheap, etc).
4. Wait ~10 minutes for DNS propagation; Resend shows the domain status flip to "Verified".
5. API Keys → **Create API Key** → name it "production", grant "Sending access" to your verified domain → copy the `re_...` key.
6. Vercel → Project `tulala` → Settings → Environment Variables → **Add new**:
   - Name: `RESEND_API_KEY`, Value: `re_...`
   - *(optional)* Name: `EMAIL_FROM`, Value: `Tulala <noreply@tulala.digital>` *(defaults to "Impronta <noreply@impronta.com>" if unset — change to your sender)*
   - Environment: Production
7. Redeploy.

**Verify:** Send a team invite from the app — recipient should get the branded "Join {AgencyName} on Tulala" email within a minute. If not, check Vercel function logs for `[team-management.inviteTeamMember] email send failed`.

---

## 3. Vercel alias automation — 5 minutes (optional but recommended)

What it activates: F.3 alternate domain attach calls Vercel's API
automatically when an admin adds a custom domain. Without it, the
admin still gets DNS instructions but the Vercel alias has to be
added manually via `vercel alias set`.

**Steps:**

1. Vercel → Account Settings → Tokens → **Create** → name it "platform-domain-mgr", scope "Full Access" or just the `tulala` project.
2. Note your team ID from `vercel teams list` or the URL (`/team/<id>/...`).
3. Vercel → Project `tulala` → Settings → Environment Variables:
   - `VERCEL_API_TOKEN` = the token from step 1
   - `VERCEL_TEAM_ID` = your team ID
   - `VERCEL_PROJECT_ID` = `tulala` project id (visible in project settings)
4. Redeploy.

**Verify:** Add an alternate domain from admin settings → check Vercel project domain list — the new domain should appear within seconds. If `vercelAttached: false` in the addAlternateDomain response, env vars aren't picked up (check redeploy completed).

---

## 4. Stripe Connect onboarding — already wired

What it does: Talent payouts via Stripe Connect Express. Handler in
the webhook already processes `account.updated` and `capability.updated`
events from step 1.

**No additional setup** beyond step 1 (Stripe webhook) — talents who go
through the Connect onboarding flow already get their `agencies` row
updated as the webhook fires.

---

## 5. P7A acceptance + viewport matrix QA (your hands, not config)

What it activates: Phase 7A "shipped" status on the page builder.

This is the part I can't do for you — it's QA cognition, not env config.
The checklist is in `web/docs/builder-execution-plan-2026.md` §First 7A
proof must use Blank Section. Walk through the live builder at
`improntamodels.com?edit=1` and tick the 10 Reality Test boxes.

**I CAN drive Chrome for some of this** if you want — `mcp__Claude_in_Chrome__*`
tools can navigate, click, and screenshot the live tenant. Just say
the word and I'll walk through the viewport matrix (390 / 834 / 1440)
capturing pass/fail per cell.

---

## Activation checklist (TL;DR)

| ☐ | Step | What gets activated |
|---|---|---|
| ☐ | Register Stripe webhook + add `STRIPE_WEBHOOK_SECRET` | F.4 / F.5 / F.6 |
| ☐ | Verify Resend sender domain + add `RESEND_API_KEY` (+ optional `EMAIL_FROM`) | F.1 / F.2 / F.6 emails |
| ☐ | Add `VERCEL_API_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` | F.3 auto-alias |
| ☐ | Redeploy production | All of the above pick up the env vars |
| ☐ | Walk P7A Reality Test on `improntamodels.com?edit=1` | Builder pilot acceptance |
| ☐ | Viewport matrix on 390 / 834 / 1440 *(I can drive Chrome for this)* | Phase 0 QA gate |

After these steps the platform is in **full v1 production state** —
end-to-end self-serve onboarding, paid plans, real email, paid domains,
documented page builder.
