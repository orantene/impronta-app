# Oran checklist — Stripe receipt / support email

**Goal:** Set the platform support / customer email to `hello@tulala.digital` on **all four** Stripe surfaces (US live, MX live, US test, MX test).  
**Blocked on Oran:** Dashboard clicks (no reliable API for the platform account’s own public support email in this environment).  
**Do not paste API keys into chat.**

Account IDs (from work order):

| Surface | Account id | Mode |
|---|---|---|
| US live | `acct_1TdcQX5C0mUEeRd1` | Live |
| MX live | `acct_1Q8V1402cKHAMrWo` | Live |
| US sandbox | same US account, Test mode toggle | Test |
| MX sandbox | same MX account, Test mode toggle | Test |

Repeat the path below for each of the four.

---

## Exact click path (Stripe Dashboard)

1. Open [https://dashboard.stripe.com](https://dashboard.stripe.com) and sign in as the owner for that country account (`orantenemx@gmail.com` / the US login you use for `acct_1TdcQX5C0mUEeRd1`).
2. Top-left account switcher → select the correct account (US or MX).
3. Top-right **Test mode** toggle → **off** for live, **on** for sandbox. Confirm the orange “Test mode” banner matches the target.
4. Left nav → **Settings** (gear).
5. Under **Business settings** → **Customer emails** (sometimes labelled **Emails** or **Customer emails and receipts** depending on Dashboard version).
   - If you do not see it: **Settings** → **Brand settings** / **Public details**, or search Dashboard for “Customer emails”.
6. Set **Support email** / **Reply-to** / **Customer-facing email** to:  
   `hello@tulala.digital`
7. Ensure **Receipt emails** (and any “successful payments” customer email) use that address as the contact / reply path where the UI offers a single support field.
8. **Save**.
9. Optional proof: trigger a test PaymentIntent / Checkout in that mode and confirm the receipt footer / reply-to shows `hello@tulala.digital`.

### Also check (same account + mode)

- **Settings → Business → Public details** (or **Account details**): business support email / phone if shown, set to `hello@tulala.digital`.
- **Settings → Connect → Branding** (if present): support URL/email for Express dashboards — use `hello@tulala.digital` / `https://tulala.digital/support` only if a field exists; do not invent fields.

---

## Tick when done

- [ ] US live (`acct_1TdcQX5C0mUEeRd1`, Test off)
- [ ] US test (same account, Test on)
- [ ] MX live (`acct_1Q8V1402cKHAMrWo`, Test off)
- [ ] MX test (same account, Test on)

When all four are ticked, mark the Blocked-on-Oran **C · Stripe Dashboard support email** row done on the [PM board](./plans/PM-BOARD.md).

## Out of scope here

- Resend inbound / MX DNS (separate Oran blocker; do not start from this checklist).
- App copy already points at `SUPPORT_EMAIL` = `hello@tulala.digital` (Track C-code PR).
