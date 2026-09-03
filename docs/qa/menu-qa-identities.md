# Menu QA — where QA writes, and why the debris accrued

Requested by the Platform Features Director after the Orders & Checkout Manager measured
7 `menu-qa-<timestamp>@example.com` rows in a 31-row production `auth.users` table.

## Three findings that change the fix

**1. The menu order path sends no email at all.** `menu-order-engine.ts` calls neither
`dispatchEventNotifications` nor `sendEmail`, and `inquiry-engine-submit.ts` has no dispatch either
— its auto-ack posts an in-thread message, not mail. **Menu QA has produced zero outbound sends and
zero bounces.** The hard-bounce incident that made this worrying (QA to invented Gmail addresses)
cannot repeat on this path, because nothing is sent.

**2. "An already-suppressed domain" is not a thing that exists.** `email_suppressions` is
`user_id UUID NOT NULL REFERENCES auth.users(id)` with grain `(user_id, email_address)`, written
*reactively* by the Resend bounce webhook. You cannot pre-suppress a domain, and a manual row still
needs an auth user to hang off — the very row we are trying not to create. `isEmailSuppressed`
degrades open by design.

**3. The accrual driver is the timestamp, not the domain.** `ensureGuestClientByEmail` **matches**
on an existing email and reuses that account; it only mints when the address is new. Every QA run
used `menu-qa-<epoch-ms>@example.com`, so every run was guaranteed to be a new identity. Change the
domain and the rate is unchanged; change the local part and it goes to zero.

## The convention

**Use a fixed set of addresses. Never a timestamp.**

```
menu-qa-1@example.com
menu-qa-2@example.com
menu-qa-3@example.com
```

Three covers every case worth testing (single line, multi-line, sold-out refusal). The first run
mints three auth users once; every run after that reuses them. `@example.com` stays: it is RFC 2606
reserved, has no MX, and nothing is sent to it anyway — and keeping the existing domain means the
7 rows already in production remain greppable as one family rather than becoming two.

**Run menu QA on a dedicated tenant, not Impronta.** The debris is not only auth rows: six are
referenced by `agency_client_relationships`, which is why 6 of Impronta's 8 "clients" are QA. A
separate tenant keeps the real client list honest and lets the 0.4 backfill filter QA identities by
tenant rather than by guessing at an email pattern.

**Do not delete the existing rows.** Six are referenced and carry real history; the Orders manager's
backfill deliberately carries them into `customers` as-is.

## What this does not fix

The path itself. `client_profiles` has no email or name column, so `auth.users` is the only place a
guest's email can live, and nine call sites provision one. That is Orders 0.4b, sequenced after the
purchase pipeline for reasons this repo has recorded twice. This convention only stops the interval
from getting worse.
