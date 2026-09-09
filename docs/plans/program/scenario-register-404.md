# Scenario register — 404 rows (Seven Blueprint Parity)

Case QA stays **frozen** until the final campaign. This register folds the
Master + blueprint scenario IDs into the program under the resolved prefixes.

**Case IDs:** `CS-01`–`CS-48` (alias of existing evidence dirs `C01`–`C48`).  
**Catalog QA:** `C-01`–`C-32` (not the case family).

| Family | Range | Count |
|---|---|---|
| Events | X01–X84 | 84 |
| Spaces | S01–S64 | 64 |
| POS | P01–P64 | 64 |
| Appointments | A01–A64 | 64 |
| Catalog | C-01–C-32 | 32 |
| Website | W01–W32 | 32 |
| CRM | R01–R32 | 32 |
| Master / Nav | N01–N32 | 32 |
| **Total** | | **404** |

## Case alias table

| Master case | Evidence dir | Title |
|---|---|---|
| CS-01 | C01 | Nail salon |
| CS-02 | C02 | Spa |
| CS-03 | C03 | Independent massage therapist |
| CS-04 | C04 | Tattoo studio |
| CS-05 | C05 | Hair salon |
| CS-06 | C06 | Restaurant |
| CS-07 | C07 | Bar |
| CS-08 | C08 | Modelling or talent agency |
| CS-09 | C09 | Yoga or fitness studio |
| CS-10 | C10 | Photography studio |
| CS-11 | C11 | Beach club |
| CS-12 | C12 | Event venue |
| CS-13–CS-48 | C13–C48 | See `scenario-matrix.md` |

Existing evidence paths keep `Cxx-CUS|OP|TAL|DIFF|REC` names. New writes may
cite `CS-xx` and the alias above.

## Work packages

N-T01–N-T08, AC01–AC12, C-T01–C-T08, W-T01–W-T08, R-T01–R-T08 bind to matrix rows
in `ledger.md` when a campaign run starts.

## High-risk combinations (final campaign)

- A13 with A19
- Last place with final promo redemption
- Late payment with expired hold
- Partial group admission with transfer
- Refund with consumed benefit
- Recurrence edit with conflicting room
- QR order during table move
- Amended order during printer failure

## Zero-tolerance invariants

No oversell, no duplicated money/benefit/commitment, no cross-tenant
read/mutation, no lost saved work, no confirmed booking whose components were
never allocated, no case marked done until customer + operator + talent (when
applicable) + persistence + recovery all pass.
