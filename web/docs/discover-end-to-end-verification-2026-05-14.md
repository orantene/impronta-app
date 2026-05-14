# Discover end-to-end verification — 2026-05-14

Live-DB verification that the Discover product (D2-D5) works end to
end against real `talent_profiles`, `inquiries`, `inquiry_participants`,
and `client_shortlists` rows. Recorded so future agents can see what
was actually proven on the live dev DB versus only-built-but-untested.

## Test data shape

8 talents toggled `is_discoverable=true`:

| Talent | Roster (active) | Primary | Routes to |
|---|---|---|---|
| Adriana Vega | (none) | — | skipped: `no_roster` |
| Alba Reyes | Codex Freeflow Test (Free), Luma Studio Roster (Free) | none | first active = Luma (fallback) |
| Carmen Díaz | Impronta Models (Agency) | Impronta | Impronta (primary) |
| Chiara Moretti | (none) | — | skipped: `no_roster` |
| Emilia Roca | Codex (Free), Luma (Free) | none | first active = Luma (fallback) |
| Eric Watson | (none) | — | skipped: `no_roster` |
| Marco Sánchez | Impronta (Agency) | Impronta | Impronta (primary) |
| Sofía Herrera | Impronta (Agency) | Impronta | Impronta (primary) |

## Verified flows

### 1. Discover catalog read

`GET /api/discover/talents?limit=24` (signed in as `qa-client-1@impronta.test`):
- 8 items returned
- `agencyName: "Impronta Models"` + `isExclusive: true` for Carmen/Marco/Sofía
- `agencyName: null` for the 5 non-primary talents (correct per binding spec — only paid-plan exclusive rosters set the badge)
- `headshotUrl: null` for all (no `card`-variant photos uploaded yet)

### 2. Facet counts

`GET /api/discover/facets`:
- Categories: Fashion Model · 2, Actor · 1, Commercial Model · 1, Content Creator · 1, Influencer · 1, Runway Model · 1, Trade Show Model · 1
- Countries: empty (test talents lack `home_country_text`)

### 3. Hub list

`GET /api/discover/hubs`:
- "Impronta Models · 3 talents · agency" (Free-plan workspaces filtered out per ratified §12.7)

### 4. Per-talent availability

`GET /api/discover/talent/:id/availability?days=14`:
- 14-day array returned, statuses computed from `talent_bookings` + `talent_holds` + `talent_availability_blocks`
- All days "open" for the test set (no booking/hold/block data)

### 5. Favorites round-trip

`POST /api/discover/favorites/:talentId` → 200 `{ ok: true, favorited: true }`
`GET /api/discover/favorites` → list with the talent
`DELETE /api/discover/favorites/:talentId` → 200 `{ ok: true, favorited: false }`

### 6. Shortlist CRUD

- `POST /api/discover/shortlists { name }` → returns `{ shortlist: { id, talentIds: [] } }`
- `POST /api/discover/shortlists/:id/items { talentId }` → 200, idempotent
- Trigger `trg_touch_client_shortlist` bumps `updated_at` on item add (verified — listing sort by recent works)
- 4-talent shortlist "Spring 2026 brand campaign" rendered on `/client/shortlists` with talents grid + Compare/Send buttons

### 7. Cross-tenant fan-out submit

`POST /api/discover/inquiry` with 4 talentIds:
```json
{
  "talentIds": [
    "Carmen (Impronta primary)",
    "Marco (Impronta primary)",
    "Alba (Luma fallback)",
    "Emilia (Luma fallback)"
  ]
}
```

Result: **2 separate inquiries created**, one per primary/fallback tenant:

```
inquiry 356dc7ba-... · tenant Impronta · Carmen + Marco
inquiry 36c33bc9-... · tenant Luma     · Alba + Emilia
```

Both inquiries have `status='submitted'`, `source_channel='discover_shortlist'`,
identical `event_date` / `event_location` / `message`, and `inquiry_participants`
rows with `owning_party_type='workspace'` + correct `owning_party_id`.

### 8. Per-row `owning_party` freezing (D0)

Every talent participant on the test inquiries has `owning_party_type='workspace'`
+ `owning_party_id` matching the inquiry's `tenant_id`. The D0 trigger
`trg_inquiry_participants_default_owning_party` fires correctly on insert.

### 9. Single-talent fallback routing (D5 slice 3)

`POST /api/discover/inquiry { talentIds: [Alba (no primary)] }`:
- Returns 200 with 1 inquiry created on Luma (her first active roster)
- 0 skipped

`POST /api/discover/inquiry { talentIds: [Adriana (no roster)] }`:
- Returns 400 with `error: "no_routable_talents"`, `skipped: [{ reason: "no_roster" }]`
- UI surfaces "use View full profile to reach them directly"

## What was NOT verified live (gaps)

- **Trust badge real tier** — currently a "✓ Tulala" placeholder. The CLIENT trust ladder (Basic/Verified/Silver/Gold) lives on `client_profiles.trust_tier` and isn't surfaced as a per-talent badge (correct per spec).
- **Photos** — no test talent has a `card`-variant `media_assets` row, so all cards render initials. The `headshotUrl` field is wired correctly; just no data.
- **Talent / agency notification on inquiry** — `submitInquiry` post-submit IIFE attempts emails (`sendInquirySubmittedNotifications`) and inserts auto-ack system message; not visually verified in inboxes during this pass.
- **Client subscription paywall** — D6 not built yet; all features open to any authenticated client today.
- **Compare modal interaction** — render verified, click-through (open/close, fetch detail per talent) not visually walked.

## Inquiries created during verification

For traceability — these are real DB rows:

| Inquiry | Tenant | Talents | Source |
|---|---|---|---|
| `2656ee97-28dc-425c-94e7-963a8ceef820` | Luma | Alba | discover_single_talent (D5 slice 3 fallback test) |
| `356dc7ba-7f64-4286-80a6-4a4b4339cd01` | Impronta | Carmen + Marco | discover_shortlist (D5 slice 2 fan-out test) |
| `36c33bc9-d4c2-417b-ae6f-9019a791cb4b` | Luma | Alba + Emilia | discover_shortlist (D5 slice 2 fan-out test) |

Plus the test shortlist `a74f38de-4ad7-4e81-bf88-6728be944c81`
("Spring 2026 brand campaign", owned by `qa-client-1@impronta.test`,
4 talents).

## Conclusion

**D2 → D3 → D4 → D5 chain confirmed working against real DB.**

The cross-tenant inquiry routing — the spec's central promise — is
delivered: a client can save talents from multiple agencies into a
shortlist and send one inquiry that creates per-agency inquiry rows
with correct ownership metadata, all without the client ever seeing
the multi-tenant complexity.
