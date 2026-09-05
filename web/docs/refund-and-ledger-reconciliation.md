# Refunds and the ledger: what reconciles against what

Owed by the finance audit of 2026-09-01. This is the note to read before anyone tries to tie our books to Stripe, and before anyone reads a negative number here as a bug.

**Nothing in this document has been exercised against real money.** Zero live charges have ever settled on this platform. Every statement below is derived from the code and from Stripe's documented behaviour, and the first real transaction is what turns it from a design into a fact.

---

## The three ties

There are exactly three reconciliations, and they answer different questions. Confusing them is how a healthy system looks broken.

| # | Tie | Question it answers | Where it is checked |
|---|---|---|---|
| 1 | **Lane sum** | Did we split one payment correctly? | `commission.ts` — `talent_net + workspace_fee + platform_fee === gross_charged` |
| 2 | **Group balance** | Is each ledger entry double-entry correct? | `ledger_assert_group_balanced()` — a deferred constraint trigger, per `group_id` per currency |
| 3 | **Provider total** | Do our records and Stripe's agree on the total? | `alert-money-failures` signal 7 — Stripe balance vs `sum(provider_balance_transactions.net_cents)` |

Only the third is a reconciliation in the auditor's sense. The first two are internal consistency: they can both pass while our records and Stripe's have drifted apart.

---

## What a refund actually does to the books

`projectRefund` emits one balanced group of two legs:

```
DEBIT   refunds_contra    amount     "Refund issued"
CREDIT  stripe_balance   -amount     "Refund left the balance"
```

That is the whole refund. Note what is **not** there.

### The processing fee is not returned, and must not be re-credited

Stripe keeps its fee on a refund. The fee was already booked when the charge settled, as its own group:

```
DEBIT   processing_fees   fee        (our cost)
CREDIT  stripe_balance   -fee        (taken out of the balance)
```

A refund does not reverse it, so there is no second fee leg and there should never be one.

**The consequence, which will look wrong to somebody:** after a full refund, that booking has left `stripe_balance` **negative by the fee**. On a $29 charge fully refunded, we are down about $1.14 and the books say so.

That is correct. It is the real economic outcome, not drift. Anyone reconciling a fully-refunded booking to zero is reconciling to the wrong number.

### The processing fee is deliberately a separate group

Because Stripe settles the fee as its own balance transaction. Folding it into the payment group would make our group shape disagree with the provider's record, and every reconciliation after that would have to un-fold it.

---

## "Refunded" in our books is not proof the customer was paid

This is the most important line in the document.

A refund is **not final when we create it**. Stripe can return it up to **30 days later** — a closed account, an expired or stolen card, an issuer decline — at which point the money comes back to the *platform* balance and the customer has still not been paid.

- `charge.refunded` fires **once, at creation**, and never again.
- `refund.failed` and `refund.updated` carry the failure. Routing for them is merged (#1522).
- **They are not yet subscribed on the live endpoint**, so today that routing is inert.

So until those two events are subscribed on `we_1U1rrP5C0mUEeRd1FXf7WWRL`, a row reading `refunded` means *a refund was accepted*, not *a refund arrived*. Do not treat it as settlement, and do not close a customer complaint on it.

When a refund does fail, the handler deliberately **does not auto-revert** the refunded state. Un-reversing would move real money on a rare event no human has reviewed, and an automatic retry would likely fail against the same dead card. It raises one loud alert carrying every id needed to act. A person decides how the customer actually gets paid.

---

## The ledger is a projection, not a hot-path write

The books are **derived** from the provider-truth tables (`provider_balance_transactions`, `provider_invoices`, `provider_payouts`) plus the commission snapshots. Three properties follow, and they change how you fix things:

- **Re-buildable.** If a projection rule is wrong, the fix is to correct the rule and re-run — never to hand-patch rows in a financial table.
- **Self-healing.** What is missing is *computed* from deterministic group ids, so a gap closes on the next run rather than needing to be found.
- **Append-only.** `ledger_entries_forbid_mutation()` blocks UPDATE and DELETE. There is no row surgery available even if you want it.

A corollary worth stating: a wrong ledger is a wrong *rule*, and the correction is a code change plus a re-run, which is auditable. That is the point of the indirection.

---

## How to actually reconcile

### Every group balances, and the group exists

Both halves. The second query alone passes **vacuously on an empty table** — it would report a perfect ledger that was never written.

```sql
-- 1. The group exists for the payment you are checking
select count(*) from ledger_entries where provider_object_id = :charge_or_refund_id;
-- expect >= 2; a balanced group needs both sides

-- 2. Every group balances, per currency
select group_id, currency, sum(amount_cents)
from ledger_entries group by 1, 2 having sum(amount_cents) <> 0;
-- expect zero rows
```

### Our total against Stripe's

```sql
select currency, sum(net_cents) from provider_balance_transactions group by 1;
```

against `GET /v1/balance` (`available` **+** `pending`, summed per currency — a pending charge already has a balance transaction, so counting only `available` invents a permanent phantom gap).

**The honest caveat:** this holds only if ingestion covered the account's entire history. If ingestion began after the first charge, our sum is legitimately short by everything before it. That is why the alert reports the **earliest ingested transaction date** alongside any delta — it is the one fact that separates "we missed transactions" from "we started counting late".

---

## Currency rules that bind reconciliation

**Never sum across currencies.** Every total must be per currency. Adding 100,000 ARS to 50 USD produces a number that is plausibly shaped, confidently labelled, and undetectably wrong. The orders totals strip did exactly this until #1779.

**ARS cannot be valued in USD at all.** ECB via Frankfurter does not quote it (`fx-preview.ts`, `ECB_UNCOVERED_CURRENCIES`), so there is no rate available to us. Stripe *can* charge ARS — its documented minimum is `ARS 0.50` — so these orders are real. We simply cannot convert them for reporting, which makes per-currency totals the only correct behaviour rather than a preference.

**ARS and USD share the `$` symbol.** In `es-AR`, pesos render as `$ 1.234,56` and dollars as `US$ 1.234,56`. Any money string shown to a person must carry the currency code unless the locale is fixed and known. Emails (`formatMoneyCents`) and order cards (`formatMoney`) already do this correctly.

---

## Known gaps, stated rather than discovered later

1. **`refund.failed` is not subscribed.** Until it is, a failed refund is silent and our books overstate what the customer received. Highest-value item on the owner's Stripe checklist.
2. **No nightly reconciliation job.** Signal 7 runs inside `alert-money-failures` every two hours, which is a monitor, not a reconciliation with a recorded result. There is no stored daily statement to look back at.
3. **No financial audit log.** Money-moving actions are not attributable to an actor with a reason. This blocks the support-refund capability, which cannot ship without it.
4. **Tax is a liability leg that never fires.** `tax_payable` exists and `projectSubscriptionInvoice` emits it only when tax is non-zero, which is never — Stripe Tax is `pending` on a missing head office. This is deliberate: collected tax must be a liability from the first cent rather than being booked as revenue and corrected later.
5. **The chart of accounts has no bank reconciliation.** `bank` exists as an account, but nothing projects a payout landing in it, because no payout has ever settled.

---

## The one-line summary

Our books can be internally perfect and still disagree with Stripe. Only the provider-total tie catches that, it is the newest and least exercised of the three, and until a real charge settles none of this has been tested against money.
