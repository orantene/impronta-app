# Blocker protocol and session roster

Effective 2026-09-06, by the CEO under the owner's order of 2026-09-05 18:33 local. This file is the record; the CEO keeps it current by PR.

## The rule

The owner does no QA, answers no blockers, and is not a channel. Nobody tells the owner that something is not done because of X. A session that believes it is blocked does, in this order, before saying the word:

1. **Try the writers, not the screens.** If the block is "needs a signed-in admin", ask whether the same result can be produced through the code's own writer functions from a script, the way Events created the real El Paisa event and flipped `runs_events` tonight. Never SQL, never a re-implemented insert.
2. **Ask the session that owns the piece, directly.** Use the roster below and the cross-session message tool. One message per recipient per decision; no acknowledgements. Ten sends between the owner's keystrokes in your chat mutes you, so spend them on decisions.
3. **Ask the CEO for a decision.** Most "the owner has not answered" items are decisions the CEO can make under the standing order (currency, closed days from a public listing, a docs branch, a pricing row). Send the CEO the block, the three things you tried, and the decision you want, in one message.
4. **Only the CEO puts an item on the owner's list.** If, after 1 to 3, a thing genuinely needs the owner's identity, account, card, or a keystroke in a muted session, the CEO adds it to `docs/plans/owner-hands.md` with the evidence and tells the owner. A session never asks the owner directly.

What stays the owner's without exception: typing credentials or card details, creating accounts on third-party services, signing in to Meta, TikTok, Stripe, Vercel or Sentry, DNS records, GitHub repository secrets, and one keystroke in a session the harness has muted.

What this rule is not. A session answers a direct question from the owner truthfully, including when the truthful answer names a blocker; it never shades or withholds. What stops is volunteering blockers to the owner and framing anything as an action for him: those go to the owning session and to the CEO. When this file merges it supersedes the board's hands lane; the board points at it.

Two proofs the CEO will ask for before accepting "blocked": the exact writer or screen that refuses and its error, and the message you sent to the owning session with its time.

## Roster (session ids for direct messages)

| Session | Id | Owns |
|---|---|---|
| CEO - tulala.digital | local_a357f226-19eb-4f58-bd52-077416624e0b | Decisions, the owner's list, the release order, live QA of signed-out surfaces |
| Senior Platform Features Director | local_8e50d713-0f98-4cf2-b0eb-165cc4e0ef7c | The single merge actor; CI chain, lanes, guards |
| Project Manager - Board | local_97b072ec-c2b7-43a4-a4e7-5e141d4edd3f | The board (pending work tracker); QA queue rows |
| Senior IT Integration and Security Director | local_6a251b26-5a96-4f36-bee0-20971a7c6f79 | Third-party apps and OAuth, platform security, grants, RLS, Sentry |
| Creative Director | local_63529e82-3604-40e0-b557-372534ddc332 | Brand standard, design rulings, El Paisa review |
| Creative Developer Manager | local_67894d86-726b-4512-84bb-9f3269409f75 | Storefront designs, El Paisa build pack, page-design fixes |
| Page Builder Director | local_0c0dcd9e-bd58-4555-a071-3411c3be03e1 | Builder, registry, tokens, composer contract, resolver |
| Front Door Manager | local_4db3d2fd-a3b3-4e93-9614-6d62fc9ce9cb | Signup, intake, provisioning, the inquiry spine and guest panel, menu import wiring |
| Menu Workspace Manager | local_52a030bd-b65b-4021-8605-a1553a66593a | Menu panel, tokens, no-cards switch |
| Sessions, Events & Reservations Director | local_628ebc16-404a-4ecd-b451-111975a9ad64 | Sequencing of the three engine areas; write-proof audit |
| Events & Ticketing Manager | local_9f4350ea-f5b6-4eb0-8850-dd9dd250a53a | Events, tiers, guest ticket purchase, event pages |
| Sessions & Classes Manager | local_f10b7273-0b0a-4dcd-816e-fdd04fd4989f | Scheduler, cohorts, seats, session picker |
| Reservations Manager | local_5af11d69-94d7-490c-9a32-b03dc3e083a3 | Venues, windows, table bookings, receipts |
| Capacity Engine Manager | local_70dffa5e-5794-43ab-bd09-f55f711474af | Pools, holds, TTLs, the upsert-conflict guard, generated types |
| Orders & Checkout Manager | local_99c5d068-23c4-4f8e-b2df-23fd9db2cd62 | Orders, checkout, holds' order side, currency totals |
| Finance, Payments & Accounting Director | local_56531718-5a70-472f-9955-7c83a3fc1c97 | Stripe webhooks, ledger, payouts, refunds executor |
| Tulala Product, Pricing & Commerce Director | local_38a0927b-6d72-4747-876f-cd30ca46fe9f | Plans, entitlements, pricing page, paywalls |
| Digital Marketing Director | local_fdcdced8-f130-4451-a7e3-4373bd89227f | Marketing site copy, share cards, launch checklist |
| Email Marketing Manager | local_0d012cff-fdb4-425f-a77a-ce3bd00acb6b | Customer email copy, envelopes, dispatch log, guest acknowledgements |
| Support & Customer Experience Director | local_b9d10ca9-71c2-4bd7-99b0-d4cc465d9b4c | Support panel and assistant, suppressions, guest replies |
| Directory & Profile Engine Director | local_b1bc0178-b0b7-4ce0-b659-a40ddf5673f4 | Profiles, roster import, taxonomy, directory pages |
| Workspace & Dashboards Director | local_7b4d2a3e-001a-42a6-ac2c-512684fcf179 | Admin shell, print canvas, dashboards |
| QR and Links Engine Manager | local_eee689a6-f286-4761-87f4-6d117b29108c | Links, QR, print export, the machine's gate queues |

Sessions not in the list tonight (Appointments Manager, Spaces & Seating Manager, the Talent Profile assistant) are addressed through the Directory or the engine Director until the owner reopens them.

## Focus rule (owner's directive, 2026-09-06 14:3xZ)

A small set of sessions is active at any time and everyone else is quiet. The CEO names the set. A quiet session finishes its open PRs, reports once in one line, and sends nothing else until called.

Message rules for every session:

- Message only the CEO, and only on a completion or a ruling you need.
- The merge loop messages a session only to say "merged" or "red, your SHA".
- The Board sends no messages to sessions; it reads GitHub and what the CEO sends it.
- No status broadcasts, no peer chatter, no thinking out loud into another chat.

Two meanings of "blocked", which route differently:

- Undecided: nobody has ruled. Route to the CEO.
- Cannot: this session physically cannot do the step. Route to the session that can.

A PR that is red only because main was red needs a rebase, never a re-run; a re-run replays the frozen merge ref.
