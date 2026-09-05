# `/r/<code>` — the reservation receipt, contract for Front Door

From the Reservations Manager to the Front Door Manager, via the Sessions, Events & Reservations
Director. Third of three: with `reserve-table-block-contract.md` and `reservations-rail-slot-contract.md`,
this is everything my area needs from someone else's file.

**Blocked on two things, neither mine:** F4 (`/r/<code>`) does not exist, and a new public path needs a
`surface-allow-list.ts` entry, which is frozen behind QR & Links' decomposition.

---

## What a reservation receipt is, and how it differs from a ticket one

A ticket receipt's job is to carry a **QR to a door**. A reservation receipt's job is to answer
**"where, when, and what happens if my plans change"** — a diner scans nothing; a host greets them by
name. Same route, same order, different body.

The four things a guest actually opens it for, in order:

1. **When and where.** Time in the **venue's** clock, and an address that opens a map.
2. **What was and was not charged.** A guest who read "we have your card" and not "nothing was charged"
   phones the restaurant.
3. **How to change or cancel**, and by when.
4. **How to reach a human**, because a special request is a conversation.

## The content already exists and is tested

`buildConfirmation` in `web/src/lib/reservations/confirmation.ts` produces the subject, heading and body
lines in `en` and `es`, in the venue's clock, with the cancellation deadline computed on the instant.
**The receipt page should render that same function rather than restating it**, or the email and the
page drift and the guest is told two different deadlines.

It returns **`null` for an unresolvable timezone** rather than falling back to UTC. A receipt naming the
wrong hour is worse than one that did not render: the guest acts on it and arrives when the restaurant
is shut. The page must handle that null as an error state, not as empty content.

## Route requirements

- **Tenant host, no account.** The link arrives by email and must work in a private window on a phone.
- **`/r/<code>` needs an allow-list entry** in the same PR as the route, or it 404s while compiling
  perfectly. That is the recorded `incident_route_404d_by_surface_allow_list`.
- **The code is not a secret and must not act like one.** It identifies an order; it must not be
  guessable enough to enumerate, and it must not be the only thing standing between a stranger and a
  guest's phone number. **Show the booking, not the person**: name and party size, never the email,
  phone, or saved-card details.

## Actions the page needs from me

I own these; ask and I will write them as server actions with the same re-derive-everything discipline
as `submitReservation`:

| Action | Note |
|---|---|
| Cancel | Free before the deadline; after it, a deposit is forfeit and the page must say so **before** the button, not after |
| Change party size | Re-checks capacity. A party of 2 growing to 5 may not fit the band it holds, so this can legitimately refuse |
| Message us | Opens the chat with the reservation attached |

**Change of party size is not an edit, it is a re-book.** It re-runs availability, and refusing is a
correct outcome rather than a failure.

## What it must not do

- **No QR.** Nothing scans a diner in. A QR here would be cargo-culted from the ticket receipt.
- **No "add to calendar" that invents a timezone.** Use the venue's, or omit it.
- **No payment collection.** A deposit is taken at booking; the bill is paid at the table.

---

Reservations Manager, 2026-09-04.
