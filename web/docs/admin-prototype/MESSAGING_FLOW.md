# Messaging & Booking Flow — Canonical Spec

> **Source of truth:** [`canonical-flow.json`](./canonical-flow.json)  
> **Use:** drive prototype data, design reviews, QA scripts, and production seed data.

This document explains the flow in prose. The JSON is the machine-readable contract.

---

## The three actors

| Actor | Surface | What they see |
|---|---|---|
| **Client (brand)** | `surface=client` | One thread per inquiry — their conversation with the **coordinator**. Never sees talent group thread. |
| **Talent** | `surface=talent` | One thread per inquiry they're invited to — the **talent group thread** (with coordinator + other talent). Never sees the client thread. |
| **Agency admin / coordinator** | `surface=workspace` | TWO threads per inquiry: **Client thread** (left tab) + **Talent group** (middle tab) + **Files** (right tab). Plus optional internal-only thread between admin and coordinator. |

The coordinator is the **bridge** — every message between client and talent passes through them.

---

## The 8 stages

```
submitted ──► coordination ──► offer_pending ──► approved ──► booked ──► completed
                                                                    │
                                                                    ├──► rejected
                                                                    └──► expired
```

| Stage | Color | Meaning |
|---|---|---|
| `submitted` | coral | Client just filed, agency hasn't picked it up |
| `coordination` | coral | Coordinator assigned, working on shortlist |
| `offer_pending` | amber | Offer sent to client, awaiting approval |
| `approved` | amber | Client said yes, building call sheet |
| `booked` | green | Confirmed, call sheet published, contracts signed |
| `completed` | muted | Wrapped, selects shared, invoice paid |
| `rejected` | muted | Client declined |
| `expired` | muted | Hold/offer timed out |

---

## A complete worked example: Mango · Spring lookbook

12 events. Each event renders differently per surface.

### Step 1 — `submitted`
**Joana from Mango files an inquiry.**

| Surface | Inbox row |
|---|---|
| Client | "Mango · Inquiry sent. A coordinator will respond within 2 hours." |
| Agency admin | "Mango · Submitted · **Needs me: Coordinator**" with red badge |
| Talent | _not visible (not invited yet)_ |

### Step 2 — `coordination`
**Marta (owner) assigns Sara as coordinator.**

| Surface | Inbox row |
|---|---|
| Client | System event: "Sara Bianchi assigned as your coordinator" |
| Agency admin | "Sara is on it" (you assigned) |
| Talent | _not visible_ |

### Step 3 — `coordination`
**Sara replies to client: "Got it — pulling 3 candidates…"**

| Surface | Preview line |
|---|---|
| Client | "Sara Bianchi: Got it — pulling 3 candidates…" `[+1 unread]` |
| Agency admin | "You: Got it — pulling 3 candidates…" |

### Step 4 — `coordination`
**Sara invites Marta, Tomás, Zara to the talent group.**

| Surface | Inbox row |
|---|---|
| Client | _no change_ |
| Agency admin | "Talent group: 3 invited (Marta · Tomás · Zara) — awaiting confirmations" `[MR][TN][ZH]` |
| Talent (each) | NEW row — "Mango (via Acme Models) · Spring lookbook · Madrid · May 6 · Sara invited you to this booking. Please confirm availability." `[+1 unread]` |

### Step 5 — `coordination`
**Marta accepts: "All clear from me — happy to confirm."**

| Surface | Update |
|---|---|
| Agency admin | "Marta Reyes: All clear" — approval count shows **1/3** |
| Marta's inbox | her status flips to "accepted" |

### Step 6 — `coordination`
Tomás replies "Checking my schedule — back in 1h."

### Step 7 — `coordination`
Joana (client): "Perfect. We're flexible on talent #3. Budget cap is €2,500/day each."

### Step 8 — `offer_pending`
**Sara sends the structured offer.**

| Field | Value |
|---|---|
| Lineup | Marta (€2,400) · Tomás (€2,200) |
| Agency fee | €600 |
| Studio | €800 |
| Total | **€8,000** |
| Usage | Digital · 12 months · Spain |
| Expires | 24h |

| Surface | Action card shown |
|---|---|
| Client | **"Approve offer"** primary CTA |
| Agency admin | SLA timer: 23h 58m |
| Talent (Marta + Tomás) | "Offer sent to client — awaiting approval. You're in the lineup." |

### Step 9 — `approved`
**Joana approves.**

| Surface | What flips |
|---|---|
| Client | Stage → "Approved". Action card: **"Sign booking"** |
| Agency admin | "Mango approved offer · €8,000" — needs me: **Build call sheet** |
| Talent | Stage → "Booked (pending call sheet)" |

### Step 10 — `booked`
**Sara publishes the call sheet.**

| Surface | What surfaces |
|---|---|
| Client | "Call sheet published. We're set for May 6." Info panel shows date · call time · location |
| Agency admin | "Call sheet sent to talent + client." |
| Talent | Pinned info panel populated — Schedule · Location · Transport · Rate (€2,400 to you) |

### Step 11 — `booked` (shoot day)
**Marta checks in on set at 07:28.**

| Surface | What surfaces |
|---|---|
| Agency admin | "Marta checked in · 07:28" |
| Marta | "You checked in · 07:28" |
| Client | Optional system event "Talent on set" |

### Step 12 — `completed`
**Sara wraps.**

| Surface | What surfaces |
|---|---|
| Client | "Wrap. Selects landing by May 13." Action: **"Pay invoice (€8,000)"** |
| Agency admin | "Invoice issued · awaiting payment" |
| Talent | "Booking wrapped. Selects shared. Payout date: May 22." |

---

## Permissions matrix

| Action | Owner | Coordinator | Talent | Client | Talent-as-coordinator (hub) |
|---|---|---|---|---|---|
| Create inquiry | — | — | — | ✓ | — |
| Assign coordinator | ✓ | self only | — | — | — |
| Edit brief | ✓ | ✓ | — | ✓ | ✓ |
| Invite talent | ✓ | ✓ | — | — | ✓ (own circle) |
| Remove talent | ✓ | ✓ | — | — | — |
| Message in client thread | ✓ | ✓ | — | ✓ | ✓ if setting on |
| Message in talent group | ✓ | ✓ | ✓ | — | ✓ |
| Send offer | ✓ | ✓ | — | — | ✓ if setting on |
| Approve offer | — | — | — | ✓ | — |
| Build call sheet | ✓ | ✓ | — | — | ✓ |
| Check in on set | ✓ | ✓ | self only | — | self only |
| Mark completed | ✓ | ✓ | — | — | ✓ |
| Pay invoice | — | — | — | ✓ | — |
| Receive payout | — | — | ✓ | — | ✓ |

---

## Agency settings that change the model

Three toggles on the agency (visible in **Settings → Feature controls → Agency operations**):

1. **`auto_assign_owner_as_coordinator`** (default ON)  
   On → owner becomes primary coordinator on every new inquiry.  
   Off → coordinator role auto-falls to the lead talent (= they can chat client + add crew).

2. **`allow_talent_direct_chat`** (default OFF agencies / ON hubs)  
   When a talent is the coordinator, can they DM the client directly?  
   Off → read-only on client thread. On → full bidirectional chat.

3. **`talent_can_add_crew`** (default OFF)  
   Talent-coordinator may pull from their Circle into the booking without admin approval.

Hub freelancers (chef, host, designer on a hub) **default to all three on** — they're their own coordinator.

---

## Inbox row anatomy (every surface, same component)

```
┌─────────────────────────────────────────────────────┐
│  [Avatar 40px ⓒ trust badge]   Client Name    3h    │
│                                Brief · 3 talent ·…  │
│                                [Stage] You: msg…  3 │
│                                [participants stack] │
└─────────────────────────────────────────────────────┘
```

- **Avatar 40px** with overlay trust badge (basic / verified / silver / gold)
- **Client name + age** on row 1
- **Brief subtitle** truncated to 48 chars
- **Stage pill (sentence case, 999px radius) + last-message preview + unread circle** on row 3
- **Participants stack** (5 max + "+N")

Same component for all 3 surfaces — the `pov` prop chooses what fills `title` / `subtitle` / `participants_stack`.

---

## Thread view per pov

| | Tabs | Details rail |
|---|---|---|
| **Admin** | Client thread · Talent group · Files | Brief · Coordinator · Talent lineup w/ status · Offer summary · Activity log |
| **Talent** | (single thread — talent group only) | Schedule · Location + map · Transport · Coordinator card · Crew · Rate · AI summary |
| **Client** | (single thread — client thread only) | Coordinator card · Brief (editable) · Talent lineup (read-only) · Schedule · Offer summary · Invoice status |

---

## Open product questions

1. When `auto_assign_owner_as_coordinator` is OFF and no talent is assigned yet, who triages? (Round-robin? Queue? Owner fallback?)
2. Hub freelancer chef — can they invite arbitrary crew, or only from their Circle?
3. What does the client see when a talent declines an invite? Real-time lineup change, or wait for coordinator?
4. Can client DM a specific talent directly (e.g., asking about a previous shoot)? Never / setting-gated / post-booking only?

---

## How this maps to the prototype today

- Workspace data: `RICH_INQUIRIES` in `_state.tsx` — closely matches this spec  
- Talent/client data: `MOCK_CONVERSATIONS` in `_talent.tsx` — partially matches; needs alignment to use the same canonical IDs as `RICH_INQUIRIES` so a single fixture can power both

**Next refactor step:** wire both surfaces to a single fixture loader that hydrates from this JSON.
