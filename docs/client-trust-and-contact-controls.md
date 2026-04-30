# Client Trust Levels & Talent Contact Controls — Architecture Direction

**Status:** Architecture direction (not yet locked at the implementation level). Author: founder (product direction); architecture written 2026-04-25.

This document is **directional** — it picks an architectural lane and reserves the right shapes so future implementation isn't blocked. It is not a fully locked spec; specific column names and migration shapes can shift during build. What's locked is the *direction*: that the platform supports tiered client trust levels, that talents can configure who is allowed to contact them, and that the inquiry pipeline carries trust signals so inboxes can filter, prioritize, and gate.

This doc is part of the locked-product-logic set referenced from `OPERATING.md` §12. It complements:
- [`docs/talent-relationship-model.md`](talent-relationship-model.md) (talent / agency / hub / inquiry-ownership rules)
- [`docs/transaction-architecture.md`](transaction-architecture.md) (v1 payment model)
- [`docs/talent-monetization.md`](talent-monetization.md) (third commercial lane)

The founder's framing: *"not all clients should have the same level of access to talent."* This is a **trust + spam-reduction + lead-quality system**, not a "pay to DM" mechanic. That distinction is the architectural test for every decision below.

---

## 1. The four-tier client trust ladder

| Tier | Working name | Signal | Default product implications |
|---|---|---|---|
| **Basic** | `basic` | Free signup, no verification | Lowest trust signal. Some talents may opt-out of receiving Basic contact. |
| **Verified** | `verified` | Card/account verified (possibly via a small verification fee, e.g. $5) | Stronger trust. Default-allow for most talents. |
| **Silver** | `silver` | Verified **and** funded balance above threshold | Stronger seriousness/readiness signal. Surfaces in talent inbox with a Silver badge. |
| **Gold** | `gold` | Highest trust signal: verified + significantly funded + (optionally) usage history | Highest priority. Many talents keep Gold always-allowed even when other tiers are restricted. |

Names are working values — they may rename publicly later. The internal keys (`basic`, `verified`, `silver`, `gold`) are stable contracts going forward.

### Underlying signals (not the level itself)

The trust level is **derived** from underlying signals, not assigned arbitrarily:

| Signal | Source | Drives |
|---|---|---|
| `verified_at` | Card or identity verification flow | `basic` → `verified` |
| `funded_balance_cents` | Prepaid balance the client has loaded | `verified` → `silver` (above threshold), `silver` → `gold` (above higher threshold) |
| `usage_history_score` *(future)* | Successful bookings, response rates, no-shows | Soft modifier on the level |
| `manual_override` | Super_admin sets level explicitly (known partners, beta testers, escalations) | Beats all auto-evaluation |
| Suspended / banned signals | Behavior issues | Forces level back to `basic` or below; future negative-state |

The thresholds for `silver` / `gold` are platform configuration — set by super_admin, not hardcoded. See `platform.client_trust.configure_thresholds` capability.

### Level evaluation

A trust level is a **derived field** that gets recomputed when underlying signals change:
- After successful verification → re-evaluate
- After funding deposit → re-evaluate
- After refund / withdrawal → re-evaluate
- After admin override → snap to overridden value
- Periodic recheck (cron) for time-bound signals

The evaluator runs in code (not a SQL function) so the rules can evolve without migrations. Result is written to `client_trust_state.trust_level` plus a snapshot timestamp so the inquiry pipeline can carry the level at send time.

---

## 2. Talent contact preferences

Talents configure **who is allowed to contact them**, per trust tier. The default for every talent (when claimed) is **all-allowed**.

### The shape

Each talent has a per-tier setting:

```
talent_contact_preferences:
  allow_basic    BOOLEAN  (default TRUE)
  allow_verified BOOLEAN  (default TRUE)
  allow_silver   BOOLEAN  (default TRUE)
  allow_gold     BOOLEAN  (default TRUE)
```

A talent who wants to filter spam might set `allow_basic = false`, keeping `verified+` open. A high-demand talent might restrict to `gold` only. The product surfaces these as four toggles in talent settings, with framing copy that clarifies the trade-off (lower trust = more potential leads but more spam; higher trust = fewer leads but better quality).

### Future extensions (deferred but reserved in shape)

Two extensions the architecture leaves room for:

| Extension | Shape |
|---|---|
| Per-tier action gating (separate "send message" from "send booking request") | Add tier-specific action booleans: `allow_basic_message`, `allow_basic_booking`, etc. |
| Priority queues (allow Basic contact but route to a low-priority queue) | Add `tier_priority` settings: `basic` → `'queue'`, `verified` → `'normal'`, `gold` → `'top'` |
| Custom-rule overrides | A JSONB `custom_rules` field on the preferences row |

For Phase 1 architecture, the four boolean toggles are enough.

---

## 3. Where trust lives in the data model

### `client_trust_state` table (new, deferred)

One row per client user. Centralizes the underlying signals and the derived level.

```
client_trust_state:
  user_id              UUID PK FK profiles
  trust_level          TEXT NOT NULL DEFAULT 'basic'
                          CHECK (trust_level IN ('basic','verified','silver','gold'))
  verified_at          TIMESTAMPTZ
  verification_method  TEXT      -- 'card', 'id', 'manual', etc.
  funded_balance_cents BIGINT NOT NULL DEFAULT 0
  manual_override      TEXT      -- when set, beats auto-evaluation; reason captured
  manual_override_by   UUID FK profiles  -- super_admin who applied the override
  manual_override_at   TIMESTAMPTZ
  last_evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  created_at, updated_at
```

The `trust_level` column is the canonical derived value. Code reads from this column; an evaluator function recomputes and writes when signals change.

### `talent_contact_preferences` table (new, deferred)

One row per talent profile. Auto-created at claim with all-allowed defaults.

```
talent_contact_preferences:
  talent_profile_id  UUID PK FK talent_profiles
  allow_basic        BOOLEAN NOT NULL DEFAULT TRUE
  allow_verified     BOOLEAN NOT NULL DEFAULT TRUE
  allow_silver       BOOLEAN NOT NULL DEFAULT TRUE
  allow_gold         BOOLEAN NOT NULL DEFAULT TRUE
  -- Reserved future extensions (commented for now):
  --   allow_*_message BOOLEAN
  --   allow_*_booking BOOLEAN
  --   tier_priority   JSONB
  --   custom_rules    JSONB
  updated_by         UUID FK profiles
  updated_at         TIMESTAMPTZ
```

### `inquiries` extension — trust signal carried on the inquiry

When an inquiry is created, the client's trust level at send time is **snapshotted** onto the inquiry row:

```
inquiries:
  + client_trust_level_at_send TEXT
       CHECK (client_trust_level_at_send IN ('basic','verified','silver','gold'))
```

This denormalization is intentional:
- Inboxes can filter / sort / prioritize **without re-resolving** trust per row
- Audit trail preserves the level at the moment of action (level may change later)
- Cross-tenant queries don't need to join `client_trust_state` (which has its own RLS)

### Why three places, not one

- `client_trust_state` is the **canonical present-state** of a client's trust
- `talent_contact_preferences` is the **policy applied** at send-time
- `inquiries.client_trust_level_at_send` is the **historical fact** carried on every inquiry

Each answers a different question. None is redundant.

---

## 4. Sending an inquiry — the gating contract

When a client clicks "Send inquiry" to a talent, the system runs this evaluation:

1. **Resolve client trust level.** Read `client_trust_state.trust_level` for the sender. If no row exists (newly-signed-up Basic client), default to `'basic'`.
2. **Resolve talent contact preferences.** Read `talent_contact_preferences` for the target talent. If no row exists (legacy talent), default to all-allowed.
3. **Check the gate.** If `talent_contact_preferences.allow_<trust_level> = TRUE`, allow. Else deny with a structured reason.
4. **If allowed, create the inquiry** with `client_trust_level_at_send` set to the resolved level.
5. **If denied, surface a structured response:**
   - "This talent doesn't accept inquiries from {tier} clients."
   - Suggest the path to higher trust: "Verify your account to send inquiries to more talents." / "Add funds to reach Silver tier."
   - Don't reveal the talent's specific preferences (privacy) — just the trust requirement that wasn't met.

### Capability for sending

A new capability gates this: `inquiry.send_to_talent`. Gating is `relationship` because both the client's state and the talent's state factor in. The relationship-state evaluator does steps 1–3 above.

### Where this gate runs

- **Client-side UI:** Disable / hide the "Send inquiry" CTA when the client knows their level won't pass. Show "Verify to unlock contact" copy. Don't let the client compose a message and then hit a wall.
- **Server-side enforcement:** The capability check is the source of truth. Even if the client bypasses UI gating, the server denies. UI gating is a UX optimization, not a security control.

### Surface-aware gating (interaction with multi-tenant talent)

The gate runs at **inquiry creation**, which happens on a specific surface (workspace owning the URL the client visited). The talent's contact preferences apply uniformly across surfaces — same talent → same prefs. But the evaluation point depends on the surface:

- **Inquiry on talent's own personal page (`tulala.digital/t/<slug>`):** standard gate. Talent's prefs apply directly.
- **Inquiry on an agency's site rostering the talent:** standard gate **plus** any agency-side client policy (deferred — see §6 for the workspace-level extension).
- **Inquiry on a hub:** standard gate. Hub may have its own client-policy layer in the future.

In v1, only the talent-side gate runs. Workspace-side client policies are a deferred extension (§6).

---

## 5. Inbox filtering, badges, and prioritization

### Display badges

Every surface that lists inquiries must support showing the client trust badge:

- **Workspace admin inquiry list** — badge column or pill on each row
- **Talent surface inquiry inbox** (`/talent/inquiries`) — same
- **Inquiry detail page** — badge in the header alongside client name
- **Client-side**: clients see their own badge in their account drawer / profile

Badges are color-coded and named per the working levels (Basic / Verified / Silver / Gold). The presentation layer reads `inquiries.client_trust_level_at_send` (denormalized for fast renders).

### Filtering

Inbox views (workspace admin and talent self) get filter chips:
- "Verified+" (hides Basic)
- "Silver+" (hides Basic and Verified)
- "Gold only"
- "All" (no filter)

Implemented as `WHERE client_trust_level_at_send IN (...)` — direct, indexable.

### Prioritization (deferred)

Future extension: talents can configure **priority queues** by tier. Higher-tier inquiries surface to the top automatically; lower-tier inquiries fall to a "low-priority" tab. This is a presentation-layer concern that reads the same denormalized field. Reserved in `talent_contact_preferences.tier_priority` (commented in the schema above).

---

## 6. Multi-surface considerations

### A talent at multiple workspaces

Same talent, multiple agency rosters + their own personal page + multiple hubs. The talent has **one** set of contact preferences. Those preferences apply to inquiries arriving from **any** surface where they're rostered.

This means: even though Acme Agency's coordinator is the inquiry owner (per source-ownership rules), the **talent's** preferences are the inquiry-creation gate. Acme cannot override the talent's "block Basic" setting just because Acme wants more leads.

### Workspace-side client policies (deferred extension)

A future extension may give workspace owners their own client policy:
- Acme Agency could set: "all clients on this workspace's URL must be at least Verified"
- This would be an additional gate, ANDed with the talent's preferences
- Lives on `agencies` (or a new `agency_client_policy` table) — workspace-level setting
- The capability `agency.client_policy.set` (deferred — not added to registry now since we have no callers)

For Phase 1: only talent-side gating. Workspace-side policy is on the deferred list.

### Exclusivity interaction

Per `talent-relationship-model.md` §4 and `talent-monetization.md` §7a: page ownership = talent, distribution control = relationship-dependent under exclusivity.

Contact preferences fall under **distribution control** in the exclusive case. An exclusive agency may want to override a talent's preferences (e.g., agency wants leads even from Basic clients, but the talent has Basic blocked).

The architecture leaves room for this:
- `agency_talent_roster` (under exclusive) gains a deferred field: `client_policy_override` JSONB or per-tier booleans
- When evaluated: if exclusive AND override is set, the agency's policy beats the talent's preferences
- When the relationship ends, the override clears; talent regains direct control

This is consistent with the page-ownership-vs-distribution-control rule from `talent-monetization.md` §7a. The capability `agency.roster.set_personal_page_distribution` already added in that doc covers this case (it's a broad distribution-control capability — contact preferences are one specific lever).

---

## 7. Capability keys

Reserved as locked product contracts. Most have no callers in v1 — the prototype's trust badges + contact-controls placeholder UI can reference them as it gets built.

| Key | Category | Gating | Granted to |
|---|---|---|---|
| `client.account.verify` | client | relationship | The client themselves (must be the auth user) |
| `client.account.fund` | client | relationship | Same |
| `talent.contact_prefs.set` | talent | relationship | Talent who owns the profile |
| `talent.inquiries.filter_by_trust` | talent | relationship | Same |
| `inquiry.send_to_talent` | inquiry | relationship | A client whose trust level passes the talent's preferences |
| `agency.client_trust.view` | client | role | coordinator+ on a workspace receiving the inquiry |
| `platform.client_trust.configure_thresholds` | platform | platform_role | super_admin |
| `platform.client_trust.override` | platform | platform_role | super_admin (manual trust adjustments) |

8 new capability keys. Registry: 76 → 84.

The relationship gate for `inquiry.send_to_talent` is the §4 evaluator — both client's trust state AND talent's preferences factor in. The other relationship-gated capabilities follow the standard pattern (caller is the subject of the action).

---

## 8. Reserved schema concepts (deferred migrations)

These migrations are **not** written yet. They're reserved here so future implementation matches.

### New tables

- `client_trust_state` (one row per client user; full DDL in §3)
- `talent_contact_preferences` (one row per claimed talent; full DDL in §3)

### Modified tables

- `inquiries`: add `client_trust_level_at_send TEXT` (snapshot at send-time for fast filtering)
- `agency_talent_roster`: add `client_policy_override JSONB` (deferred; only meaningful under exclusive relationships)
- `agencies`: reserved future column `client_policy JSONB` for workspace-level client policies (further deferred)

### Auto-provisioning

- When a `profiles` row with `app_role='client'` is created → insert `client_trust_state(user_id, trust_level='basic')`
- When a `talent_profiles` row is claimed (`user_id` set) → insert `talent_contact_preferences` with all-allowed defaults

### Triggers

- `client_trust_state_recompute_on_signal_change` — when `verified_at`, `funded_balance_cents`, or override fields change, re-derive `trust_level`
- `inquiries_snapshot_trust_level` — at insert, populate `client_trust_level_at_send` from `client_trust_state`

### Indexes

- `inquiries (tenant_id, client_trust_level_at_send, created_at DESC)` — partial covering index for inbox filter performance
- `client_trust_state (trust_level)` — for "all Verified+ clients" admin queries

### RLS

- `client_trust_state`:
  - `client_select_self` — clients see their own state
  - `staff_select_for_client_in_tenant` — workspace staff can read trust state of clients who have inquiries in their workspace
  - `platform_admin_all`
- `talent_contact_preferences`:
  - `talent_select_self` — talent reads own
  - `talent_update_self` — talent updates own
  - `staff_read_for_rostered_talent` — workspaces rostering a talent can read (informational)
  - `agency_override_under_exclusive` — exclusive agency can write override fields on the relationship row (deferred)

These migrations land **when client trust UI surfaces actually start needing them** — likely as part of Track B.5 (the dashboard restructure includes inquiry inbox + talent settings). Capability keys exist now so prototype copy can reference real names.

---

## 9. UX implications (for the prototype + Track B.5)

### Talent surface (`/talent/*`)

- **Contact preferences page** (`/talent/contact-preferences` or under `/talent/account`) — four toggles per tier with framing copy:
  - "Allow Basic clients" — *"More leads, but more spam. Most platforms allow this by default."*
  - "Allow Verified clients" — *"Verified clients have completed account verification."*
  - "Allow Silver clients" — *"Silver clients have funded their account, signaling readiness to book."*
  - "Allow Gold clients" — *"Gold clients are the highest trust signal. Recommended always-on."*
- **Inbox** — filter chips (All / Verified+ / Silver+ / Gold only) plus per-row trust badges.
- **Settings consequence preview** — UI shows estimated impact: "Blocking Basic clients reduces incoming inquiries by approximately 60% based on platform averages."

### Client surface (`/client/*`)

- **Account drawer** — current trust level shown as a badge with "Upgrade trust" link.
- **Verification flow** — guided steps: "Verify your card", "Fund your account to reach Silver", etc.
- **Why-blocked screens** — when a client tries to send to a talent who restricts their tier, show a clear path: "This talent accepts Verified+ clients. Verify your account to continue."

### Workspace admin (`/(workspace)/[slug]/admin/*`)

- **Inquiry list** — trust badge column, filter chips. Coordinators can prioritize their day by trust tier.
- **Inquiry detail** — badge in header, link to client's account if super_admin (else just the badge).
- **(Deferred) Workspace client policy** — UI for agency-level minimum trust. Not Phase 1.

### Platform admin (`/admin/*`)

- **Trust thresholds editor** — super_admin sets `silver` and `gold` funding thresholds.
- **Trust overrides view** — list of clients with manual overrides + reason. Audit trail.
- **Cross-tenant trust analytics** — distribution of trust levels, conversion to Verified, average time-to-Silver, etc. (deferred).

---

## 10. Out of scope for v1

Same simplification logic as the other architecture-awareness docs.

- **Auto-evaluation cron / signals beyond verification + funded balance.** v1 trust is computed from those two signals only. Usage history scoring, response-rate signals, no-show penalties — all deferred.
- **Workspace-level client policies.** Only talent-side gating in v1.
- **Per-action gating (separate message vs booking request).** All-or-nothing per tier in v1.
- **Priority queues / per-tier auto-routing.** Filter chips only; smart prioritization later.
- **Custom rules / per-talent client allow-lists.** No bypass for "I always accept this specific Basic client" in v1.
- **Trust-level-based pricing on transactions.** A future product question (e.g., do Gold clients pay lower fees?) — not modeled here.
- **Negative trust / banned tier.** Architecture supports it (set trust_level to a `'banned'` value), but the UX flow for issuing/appealing bans is deferred.
- **Trust transferability across multi-tenant client_accounts.** A client_account (the org/household level) might have multiple users; how trust aggregates is deferred. v1 treats trust as per-user.

---

## 11. Reference scenarios

### Scenario 1 — Basic client tries to inquire on a Verified+ talent

A new signup, no verification, no funded balance. They browse a talent's personal page (`tulala.digital/t/sofia-mendez`), click "Send inquiry."

The gate evaluation:
- Client trust = `basic`
- Sofia's preferences: `allow_basic = false`, `allow_verified+ = true`
- Gate fails → server returns 403 with structured reason
- UI shows: *"Sofia accepts inquiries from Verified clients and above. Verify your account to send."* + "Verify now" CTA

The client can either verify (graduating to `verified`, then retry) or browse other talents who accept Basic. No bypass. No frustration about silently-ignored messages.

### Scenario 2 — Verified client inquires successfully

Same client, after completing card verification (`client.account.verify`). Trust level recomputed to `verified`. Visits the same talent page, sends inquiry.

- Gate passes (`allow_verified = true`)
- Inquiry created with `client_trust_level_at_send = 'verified'`
- Sofia's inbox shows the inquiry with a Verified badge
- Sofia can choose to filter her inbox to "Silver+" later if she wants — past Verified inquiries stay (already created), but new Verified inquiries would be blocked

### Scenario 3 — Funded client reaches Silver and sees more talents accept them

Same client adds $500 to their balance (`client.account.fund`). Auto-evaluator promotes them to `silver` (assumes `silver` threshold = $200). They're now visible to talents whose preferences are `allow_silver = true` even when Basic and Verified are blocked.

The client's account drawer shows a "Silver" badge. Their browsing experience surfaces "More talents accept your messages now" copy.

### Scenario 4 — Talent restricts to Gold, agency disagrees (exclusive)

Eva is rostered exclusively at Acme Agency. Eva sets her contact preferences: `allow_gold = true`, all others off.

Acme Agency wants leads even from Verified clients. Per the deferred §6 extension: under an active exclusive relationship, Acme can set `agency_talent_roster.client_policy_override = { allow_verified: true, allow_silver: true, allow_gold: true }`.

Result: when an inquiry on `acme.tulala.digital` is sent toward Eva by a Verified client, the agency's override applies → inquiry succeeds. When the same client tries the same on `tulala.digital/t/eva` (Eva's personal page), only Eva's preferences apply → inquiry blocked.

This is consistent with the talent-monetization §7a rule: page ownership = talent (Eva's personal page enforces Eva's prefs), distribution control = relationship-dependent (Acme's surface enforces Acme's policy under exclusivity).

### Scenario 5 — Super_admin overrides for a known partner

A vetted brand contact (e.g., a luxury brand procurement person) signs up. Super_admin manually sets their trust level to `gold` (`platform.client_trust.override`) without requiring verification or funded balance — the off-platform relationship is the trust signal.

Audit log: `platform_audit_log` entry with `action='client_trust.override'`, `target=<client_user_id>`, `reason='Brand partner: Acme Cosmetics, verified by Sales 2026-04-25'`.

Override beats auto-evaluation. If the client later funds their account, the override stays unless cleared.

---

## 12. Open questions

Smaller decisions still pending; not blockers for any current work.

1. **Funding thresholds for Silver and Gold.** Pricing decision. Examples: Silver = $200 funded; Gold = $1000 funded. Real numbers TBD.
2. **Verification mechanism.** Card-only? ID? Both as separate signals? Default direction: card verification + small fee ($5 mentioned by founder) → Verified. Identity verification stays optional / future.
3. **Whether funded-balance refunds drop trust level.** If a client funds to $200 (Silver), inquires, then withdraws back to $0, do they fall back to Verified? Default direction: yes, with a one-time grace period for in-flight inquiries.
4. **Trust-level visibility to other clients.** Does Client A see Client B's trust badge anywhere? Default direction: no — trust is between client ↔ talent/workspace, not socialized publicly between clients.
5. **Default talent preferences on auto-claim of legacy profiles.** Should we backfill `talent_contact_preferences` rows for already-claimed talent at all-allowed? Default direction: yes, on first migration; talents can tighten if they want.

---

## 13. Locked vs deferred

### Locked now (architectural direction)

- Four-tier trust ladder: Basic / Verified / Silver / Gold
- Talent contact preferences as per-tier booleans
- Snapshotting trust on inquiries at send-time (`client_trust_level_at_send`)
- Sender-gating capability `inquiry.send_to_talent` evaluated as relationship-state (client × talent)
- Three-table model: `client_trust_state`, `talent_contact_preferences`, denormalized inquiry column
- Trust as derived from underlying signals (verified_at, funded_balance_cents, manual_override) — code-driven evaluator
- Multi-surface rule: same talent → same prefs across all surfaces (without exclusivity overrides)
- Exclusivity interaction: agency can override under active exclusive relationship via `agency.roster.set_personal_page_distribution` (already reserved in talent-monetization.md §7a)
- 8 capability keys (§7)

### Deferred (planned, not built yet)

- All migrations: `client_trust_state`, `talent_contact_preferences`, `inquiries.client_trust_level_at_send`, agency-side overrides
- Auto-provisioning triggers (client signup → trust state row; talent claim → preferences row)
- Trust evaluator function
- Verification flow (card / ID / fee processing)
- Funding flow (deposits / withdrawals / balance management)
- Inquiry-creation server action gate
- Trust badge UI components
- Inbox filter chips + per-row badges
- Talent contact-preferences settings page
- Client account-trust drawer
- Platform admin threshold editor + override UI
- Workspace-level client policies (deferred extension)
- Per-action gating (message vs booking) — deferred extension
- Priority queues — deferred extension

These migrations land when the prototype's trust + contact-controls surfaces are wired into real flow — likely as part of Track B.5. Capability keys exist now so the prototype's placeholders can reference real names.

---

## 14. Page-builder integration

The trust-badge and contact-controls UI surfaces consume the existing UI conventions per [`page-builder-invariants.md`](page-builder-invariants.md):

- **Trust badges on inquiry rows / detail headers / client account drawer** are presentation components; they consume color tokens from the registry (`registry.ts`). Tier-color choices (Basic gray / Verified blue / Silver / Gold) are tokens, not inline styles.
- **Talent contact-preferences settings page** composes inspector kit primitives — the four per-tier toggles are `VisualChipGroup`-style controls; the explainer copy uses `InspectorGroup` / kit label primitives.
- **`talent_contact_preferences`** carries a `version` column when added; saves follow the CAS protocol.
- **`client_trust_state`** is system-derived; CAS not strictly needed, but cache-tag invalidation matters — when the trust evaluator promotes a client (e.g., funded → silver), every cached view of that client (badges in inboxes, account drawers) needs `updateTag('storefront' / 'client-trust' tags)`. Add the `client-trust` surface entry to `cache-tags.ts`.
- **`inquiries.client_trust_level_at_send`** is denormalized for inbox filtering. UI components reading it don't need new cache tags — the inquiry's existing tag covers it.

## 15. Reference

This doc is the canonical source for this direction. Code, schema, or copy that conflicts must be raised as a Decision-Log amendment before being changed.

The founder's full statement that established this direction is in the session transcript dated 2026-04-25.
