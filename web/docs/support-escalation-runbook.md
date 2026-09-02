# Support escalation runbook

Operating procedure for the Support & Customer Experience department.

**The governing rule.** Support owns the customer relationship, the communication, the
follow-up and the confirmed resolution. The responsible department owns the fix or the
specialised decision. **Handing a case to another department transfers the work, never the
ownership.** A case is not closed when it is handed over; it is closed when the customer has
a final answer.

Nothing in the product enforces this today — there is no routing, and every escalation
notifies the same platform-admin audience. That is exactly why it is written down: with a
team of one the policy *is* the mechanism, and it has to survive the second hire.

---

## Priority and first-response targets

These are the published commitments. They are not yet enforced by code — there is no SLA
column and no breach signal — so treat them as a promise you keep by hand until they are.

| Priority | Means | First response | Resolution aim |
|---|---|---|---|
| **Urgent** | Money is wrong, data is exposed, or a workspace cannot operate | 2 working hours | Same day, or a named owner and a next update time |
| **High** | A core workflow is blocked for one customer, no workaround | 1 working day | 3 working days |
| **Normal** | Something is confusing, broken with a workaround, or a question | 2 working days | 5 working days |
| **Low** | Feature request, cosmetic, "how do I" with docs available | 3 working days | No commitment |

If a target will be missed, **say so before it is missed.** A delay message costs nothing and
is the single cheapest thing that protects the relationship.

---

## The ten escalation types

Each entry states: who owns the underlying fix, what Support must collect *before* handing
over, and what actually closes it.

### 1. Refund or billing dispute
- **Owns the fix:** Finance / Payments
- **Collect:** booking id, charge id, amount, currency, what the customer expected and why, whether the service was delivered
- **Priority:** Urgent if money already left the customer, otherwise High
- **Support does:** confirm the facts, set expectations on timing, never promise an outcome or an amount
- **Closes when:** the money has moved (or has been refused with a stated reason) **and** the customer has confirmed they understand the outcome

### 2. Chargeback
- **Owns the fix:** Finance / Payments
- **Collect:** the dispute deadline, the evidence pack (booking, messages, delivery proof), the customer's account of events
- **Priority:** Urgent — deadlines are external and unforgiving
- **Support does:** communicate with the customer if contact is appropriate; never argue the dispute in a support thread
- **Closes when:** the Stripe case is closed and the internal record reflects the outcome

### 3. Product defect
- **Owns the fix:** Product / Engineering
- **Collect:** the diagnostics bundle attached to the ticket, exact reproduction steps, how many customers are affected, whether a workaround exists
- **Priority:** by blast radius, not by how loudly it was reported
- **Support does:** confirm reproduction before escalating; hold the customer update until the fix ships
- **Closes when:** the fix is live **and** linked back to the ticket, **and** the customer has been told

### 4. Account access
- **Owns the fix:** Platform Admin
- **Collect:** verified identity, the workspace, the role expected, what the customer sees now
- **Priority:** High, Urgent if a whole workspace is locked out
- **Support does:** **verify identity before acting.** Never restore access on the strength of an email address alone
- **Closes when:** the customer confirms they are in

### 5. Payouts
- **Owns the fix:** Payments
- **Collect:** talent id, payout id, Connect account status, the amount and the expected date
- **Priority:** High. People plan around money arriving
- **Support does:** give a date or an honest reason there is not one yet
- **Closes when:** the payout lands, or the customer has a specific date

### 6. Abuse, harassment or safety
- **Owns the fix:** Trust & Safety
- **Collect:** the report, the participants, the evidence, whether anyone is at immediate risk
- **Priority:** Urgent, always
- **Support does:** acknowledge fast, do not adjudicate, do not share one party's account with the other
- **Closes when:** a decision is made and both parties have been informed appropriately

### 7. Privacy, data access or deletion
- **Owns the fix:** Platform Admin + Legal
- **Collect:** proof of identity, the exact scope requested, the deadline if a regulation applies
- **Priority:** High, and the clock is legal rather than internal
- **Support does:** never action a deletion request without verified identity
- **Closes when:** the action is complete **and** confirmed to the requester in writing

### 8. Outage or degradation
- **Owns the fix:** Platform
- **Collect:** affected surfaces, affected tenants, when it started, customer-visible symptom
- **Priority:** Urgent
- **Support does:** one clear message during, one after. Do not speculate on cause while it is live
- **Closes when:** service is restored **and** a follow-up has gone to everyone who reported it

### 9. Feature request
- **Owns the fix:** Product
- **Collect:** the underlying need (not the proposed solution), frequency, who else has asked, requester contact
- **Priority:** Low, unless it is a blocker wearing a feature request's clothes
- **Support does:** log it in the Ideas tab; **tell the requester either way**, including when the answer is no
- **Closes when:** accepted or declined, and the requester knows which

### 10. Messaging or expectation mismatch
- **Owns the fix:** Marketing
- **Collect:** what the customer expected, where they got that impression, what they found
- **Priority:** Normal, High if it is causing refund requests
- **Support does:** treat repeats as a positioning bug, not a customer error
- **Closes when:** the copy is corrected

---

## Handing over without dropping the case

1. **Post an internal note** on the ticket naming the department and what you handed them.
   Internal notes are platform-only at the database level; the customer never sees them.
2. **Tell the customer** it has moved, who has it, and when they will next hear from you.
   Silence after an escalation is what people actually complain about.
3. **Keep the ticket open.** `waiting_on` stays with support, because the follow-up is yours.
4. **Set a next-update time** and honour it even when there is no news. "Still with Payments,
   I will chase tomorrow" is a real update.
5. **Close only after the customer confirms.** A resolved ticket the customer reopens was
   never resolved — that is what the reopen-rate tile is for.

---

## Things Support must never do

- Promise a refund, credit or specific amount before Finance has decided.
- Restore account access, or action a deletion, without verifying identity.
- Share one customer's information with another, including in an example.
- Adjudicate a safety report.
- Invent a date. "I do not have a date yet, I will tell you on Thursday" is always better.
- Close a case because it went quiet, when the customer is still waiting on us.

---

## When the one person is unavailable

Today a single platform admin receives every escalation, and there is no backstop. Until a
second responder exists:

- Anything **Urgent** that cannot be answered within the target goes to the owner directly,
  by phone if necessary.
- Set an away message on the support panel rather than letting tickets sit silently.
- On return, work oldest-first by **backlog age**, not newest-first. The oldest case is the
  one closest to being abandoned.

---

*Owner: Support & Customer Experience. Review when a second support person joins, or when
routing lands in the product — whichever comes first.*
