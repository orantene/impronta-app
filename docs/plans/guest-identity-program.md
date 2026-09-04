# Guest identity — why "retire `ensureGuestClientByEmail`" is a program, not a cleanup

**Author:** Orders & Checkout. **Status:** proposal, not scheduled.
**Written because** this kept appearing on a task list as 0.4b, a tidy-up
sized in call sites. It is not that, and every number I reported for it before
this document was wrong.

## What it is called vs what it is

The item reads *"retire `ensureGuestClientByEmail`, ~N call sites"*. That framing
survives only until you ask what the function is FOR. It is not a helper anyone
forgot to delete: it exists to mint a `public.profiles` row, because the schema
requires one before a guest can do almost anything.

## The measurement, and my four wrong answers

I reported 9 files, then ~15, then 20, then 8 call sites. The first three
counted comment MENTIONS as call sites, because I grepped the identifier
instead of the invocation.

```
git grep -c "ensureGuestClientByEmail"        -> mentions, wrong
git grep -n "await ensureGuestClientByEmail(" -> 8 invocations, 7 files
```

**8 call sites across 7 files.** Six are public entry points: contact form,
directory enquiry, CMS form submit, talent guest chat (x2), instant-book guest,
review-by-token, client inquiry intent.

That is the small number. The large one is the schema.

## The real blocker: 9 tables, 5 of them NOT NULL

From `information_schema` on production, not from a migration grep:

| Table | `client_user_id` |
|---|---|
| `agency_bookings` | nullable |
| `inquiries` | nullable |
| `review_requests` | nullable |
| `saved_talent` | nullable |
| **`client_favorites`** | **NOT NULL** |
| **`client_reviews`** | **NOT NULL** |
| **`client_shortlists`** | **NOT NULL** |
| **`client_subscriptions`** | **NOT NULL** |
| **`talent_reviews`** | **NOT NULL** |

All nine carry a foreign key. **The five NOT NULL columns are the program.**
A guest cannot leave a review, favourite a talent, or hold a shortlist without
a profile row, so removing provisioning does not tidy anything — it breaks
those surfaces outright, and they belong to Reviews and Directory, not Orders.

I previously told the Director "three tables, one NOT NULL". That was from
grepping migration files, which returned the same `init.sql` lines repeatedly.
The table above is the live schema and supersedes it.

## What the work actually is

Expand-then-contract, across areas that do not share an owner:

1. **Expand** — add `customer_id` beside `client_user_id` on all nine, nullable.
2. **Backfill** — map existing profile rows to `customers` by email. The
   collision risk is already recorded: six production `client_profiles` share
   one phone number, which is why `customers` treats EMAIL as identity and
   phone as a lookup key only when there is no email.
3. **Dual-write** at the 8 entry points.
4. **Migrate readers** — every surface reading `client_user_id` must accept a
   customer. This is the bulk of it and it is not enumerated here, because
   enumerating it is step 0 of the program rather than a line in a proposal.
5. **Relax the five NOT NULLs**, which requires each owning area to agree that
   a customer without an account is a valid actor on their surface.
6. **Contract** — stop writing `client_user_id`, then drop provisioning.

## What is already done, and why the harm is contained

The damage this item was created for has been fixed. The menu path stopped
provisioning in 0.6b-1: it was minting `menu-qa-<timestamp>@example.com`
accounts into production `auth.users` on every QA run, seven of thirty-one
identities at the time. `createPurchase` uses `customers`, where a customer is
an email and an account is something they GAIN by signing up.

The remaining 8 sites mint a profile because the schema demands one. That is a
different problem from the one that was reported.

## Recommendation

**Do not schedule this as an Orders slice.** Either:

- **Accept it.** Guest profiles are how this platform models an actor. It is
  not costing anything today beyond rows, and the QA-account leak is closed.
- **Or fund it as a named program** with Reviews, Directory and the inquiry
  spine at the table, sized from step 4, not from the call-site count.

What should stop happening is this appearing on a manager's list as a cleanup.
It has been parked three times, and each park was reasoned from the wrong
number — including twice by me.
