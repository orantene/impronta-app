# Projects: the client record, agreements, milestones, and deliverables

Source: `docs/plans/program/pos/`  -  screen-index.md, actions.md, modes.md, decisions.md, audit-2026-09-09-disposition.md, coverage-final.md. Data verified against `supabase/migrations/*.sql` in this worktree on 2026-09-09.

## 1. The journey

Agency staff are trying to turn an inquiry into a commissioned job with an accepted price, track the work against agreed milestones and deliverables, know at a glance what is due and from whom, and collect a balance quickly without leaving the counter. The assigned professional is trying to see their own assignment, what they are permitted to know about the client, and their own fee  -  separate from the workspace's full financial view. The client is trying to accept an offer or an amendment, and to approve or request revisions on a deliverable, without a phone call.

D-POS-10 settled the naming: the mode id is `projects` (not `client` or `work`), and its POS landing action is "Collect a balance" (the old "Due" label). **Clients** is the person or business record (contact, purchases, bookings, projects, balances). **Projects** is the commissioned job itself (inquiry, offer, agreement versions, assignments, milestones, deliverables, money, closure). These are two different records reached from two different places, not the same list under two names.

## 2. Screens in this slice

1. **O01** Office · due  -  what balances are outstanding, across projects. Next action: open one to collect.
2. **O02** Payment links  -  send a link the client can pay without a card reader present. Next action: send.
3. **O03** Inquiry → offer → project  -  the conversion path from a raw inquiry to a committed project. Next action: send the offer.
4. **O04** Talent assignment (mobile)  -  the assigned professional's own view of the job. Next action: accept or decline.
5. **O05** Customer project (mobile)  -  the client's own view: accept an offer, approve a deliverable. Next action: accept / approve / request revisions.
6. **O06** Amendment · prior version kept  -  a change to an accepted offer, with the prior version retained rather than overwritten. Next action: send the amendment.
7. **W41** Clients › client record  -  one client, their contacts, purchases, bookings, projects, and balances. Next action: Collect, or open a project.
8. **W42** Projects › project record  -  the commissioned job's own page; header, summary, next-action panel, tabs. Next action: whatever the next-action panel decides (never Collect while a milestone needs approval).
9. **W43** Clients vs Projects · explainer  -  documentation only, kept because the distinction was previously confused (audit F33 area).
10. **W44** Client › Collect · unpaid records & allocation  -  pick which unpaid records a payment applies to. Next action: allocate and collect.
11. **W45** Projects · list  -  every project, filterable.
12. **W46** Project › Scope & agreement · versions  -  the accepted terms and their version history. Next action: propose an amendment (O06).
13. **W47** Project › Milestones & deliverables  -  what is owed and what has been delivered. Next action: approve or request revisions.
14. **W48** Project › Team · replace with impact  -  swap an assigned professional and see what that changes. Next action: confirm the replacement.
15. **W49** Project › Money  -  the project's financial picture: quote, earned, payable, due.
16. **W50** Project › Close · outstanding & options  -  closing a project with money or deliverables still open.
17. **W51** Project › Who sees what  -  visibility rules for this project's records.
18. **W52** My work · professional view  -  the signed-in professional's own cross-project work list. Next action: open an assignment.
19. **W19** Projects › templates & collection (settings)  -  reusable agreement templates.

Related mobile flow (coverage-final.md §2/§1): **MW09→MW10→MW11→MW12** (project list → detail → approval → result), **MW27** (project assignment accept/decline).

## 3. Data per screen

- **O03 / W45 / W46 (inquiry → offer → project)**: reads/writes `inquiries` (not itself part of this slice's new work but the origin record), `inquiry_offers` (`version`, `status` draft→sent→accepted/rejected/superseded/invalidated, `total_client_price`, `coordinator_fee`, `currency_code` NUMERIC major units  -  confirmed unique index `inquiry_offers_one_live_commercial` means only one `sent`/`accepted` offer can be live per inquiry at a time, which is what makes "prior version kept" in O06 true: a new version supersedes rather than overwrites), `inquiry_offer_line_items` (per-line `talent_profile_id`, `pricing_unit`, `units`, `unit_price`, `total_price`, `talent_cost`), and `inquiry_approvals` (`status` pending/accepted/rejected). On acceptance the project itself is represented by `agency_bookings` (`inquiry_id`, `talent_profile_id`, `status`, `starts_at`, `ends_at`) plus `booking_talent` (per-assigned-professional cost/charge rows  -  this is what makes multi-professional projects like case C08's 3-model shoot representable as one booking with several `booking_talent` rows).
- **O06 amendment**: a new `inquiry_offers` row (`version` incremented) superseding the prior one via the same status machine; the prior row's `status` becomes `superseded`, never deleted  -  this is the literal mechanism behind "prior version kept."
- **W41 client record**: `customers` (tenant-scoped, `email`/`phone_e164` identity, no forced `auth.users` account) is the base identity; `agency_client_relationships` still exists as the older relationship table and has not been removed (per the `customers` migration's own comment: "Expand, then contract... this release adds the table and backfills it; a later one moves the readers and only then removes the old one")  -  **unverified** which of `customers` or `agency_client_relationships` W41 actually reads from today; would verify by reading the W41 page's data-fetching code once it exists, since coverage-final.md marks W41 "Completed" but this program has not audited its query.
- **W44 collect / allocation**: reads unpaid `orders` (`status IN ('pending_payment','quoted')`) and any outstanding `inquiry_offers`-derived balance for the client, and on payment allocates across them  -  actions.md's "Charge $X" row is the shared command; the allocation choice itself (which records a payment applies to when several are open) has no dedicated table found  -  **unverified** where an allocation across multiple orders/offers is recorded; would verify by reading the W44 collect action once implemented.
- **W47 milestones & deliverables**: `booking_deliverables` (confirmed table: `booking_id`, `title`, `kind IN ('service','passthrough_budget')`, `status` draft/submitted/approved/revision_requested/cancelled, `revision`, `revision_limit`, `due_at`) is exactly the milestone/deliverable/revision-round record this screen needs, including the passthrough-budget-vs-service-fee distinction case C27 (ad budget ≠ service) and case C42/C45 (one revision tracked, a second chargeable) both depend on.
- **W48 team replace**: updates `booking_talent` (swap `talent_profile_id`, keep `talent_name_snapshot`/`profile_code_snapshot` of the outgoing person for history)  -  the "with impact" framing (what does the swap change) is a display computation over the existing cost/charge columns, not a new table.
- **W49 money**: reads `inquiry_offers.total_client_price`/`coordinator_fee`, `booking_talent.talent_cost_total`/`client_charge_total`/`gross_profit`, and any `orders`/`order_lines` attached via O01/O02/W44 collections. Quote/earned/payable/due are four different reads over these same rows; audit finding F26 ("quote, earned, payable and due are still conflated in places," Design pending) says this reconciliation is not yet solid in the design itself, independent of the data existing.
- **W50 close**: reads `booking_deliverables.status` (anything not `approved`/`cancelled`) and any unpaid `orders`/offer balance, to build the "outstanding" list before allowing close.
- **W51 who sees what**: reads `agency_memberships`/`staff_permissions` (Access hat, see people.md) plus the assignment-scoped grant MW33 describes ("professional access is a scoped grant... assignment access ≠ workspace access," coverage-final.md §2)  -  **unverified** whether a per-project visibility table exists distinct from the general Access model; would verify by reading whatever RLS policy governs `booking_talent`/`booking_deliverables` reads for an assigned (not staff) professional.
- **O04/W52 professional view**: `agency_bookings`/`booking_talent` filtered to the signed-in professional's `talent_profile_id`, same base as appointments.md's A08.
- **O05 customer project**: `inquiry_offers`/`inquiry_approvals` filtered to the client's own inquiry, for accept/reject and deliverable approve/request-revisions (`booking_deliverables.status` transitions).
- **O02 payment links**: **Not in the database yet.** Decisions.md's blockers list names "no schema for... payment links" explicitly, and no `payment_links` or equivalent table was found in `supabase/migrations/`. Would need: a link id, the amount/order or offer it resolves to, an expiry, and a paid/unpaid state.

## 4. Refusals and empty states

- O03/W46: an offer cannot go live while another is already `sent`/`accepted` for the same inquiry  -  enforced by `inquiry_offers_one_live_commercial`, so the UI must refuse to send a second live offer rather than let the database reject it silently at charge time.
- W42: "Collect is not offered while a milestone needs approval"  -  the project record's next-action panel decides the single primary button, and audit disposition explicitly states this ordering.
- W47/O05: a revision request past `revision_limit` is refused, not silently accepted as another free round (case C42/C45's "one revision tracked, second chargeable").
- W48: a replacement that is refused entirely for a required skill/logistics reason must say so, per people-model.md's rule that "a service tagged with a hard no cannot be assigned."
- W50: closing with outstanding deliverables or money shows the outstanding list and the available options, never a bare "Close" with no preview (same pattern as A10's cancel-effects preview in appointments.md).
- O04: assignment access is explicitly scoped  -  a professional sees only what MW33 grants, never the workspace's full client or financial view (coverage-final.md §2, "professional access is a scoped grant").
- General: audit finding F19 ("several financial fixtures cannot be the same transaction," Design pending, "W25 ledger and POS receipts") and F26 (quote/earned/payable/due conflation) are both still open corrections against this slice's money screens  -  they are named here so the numbers on W49 are not read as settled.

## 5. Definition of done

The one journey that must pass end to end on the QA host: an inquiry is converted to an accepted offer with two assigned professionals (O03, two `booking_talent` rows), a milestone is marked delivered and approved by the client (O05 approving a `booking_deliverables` row), the office view (O01) shows the correct due balance, and an operator collects it (W44 or O01→shared payment state) landing on a paid record visible on W49. Payment links (O02) and the allocation-across-multiple-balances mechanism in W44 are unverified/not-in-the-database items above and are excluded from this pass's done bar.
