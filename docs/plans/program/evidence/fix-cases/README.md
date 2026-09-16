# Fix-cases (cloud reconstruction, 2026-09-12)

The Mac `work/fix-cases` tree was never pushed. This branch reconstructs the
remaining open items from the 2026-09-12 handover against `main` `0556c355b`.

Messaging already owns D-112..D-114. Engine follow-ups (#1977) own D-119..D-124.
The case-run findings use D-125..D-128.

| Item | Status | Notes |
|---|---|---|
| D-112 hold TTL vs session end | already on main | `createPurchase` door hold already lasts until session end |
| C09 chooser pick | already on main | not re-opened |
| D-125 later-claimed guest | closed here | `claim-by-email.ts`; cookie-less email claim; memo bust cookie; fixture sign-in creates the Auth user |
| D-126 talent pin hydration | closed here | consume pending conversation in an effect |
| D-127 $0 Front-desk seat | closed here | auto-collect so mint runs |
| D-128 named-ticket desk name | closed here | `displayName` satisfies `attendee_names` |
| C02 last-resource slot | spec isolation | last-resource now picks `.last()` like DIFF so sibling holds do not hide Therapist A's time |
| D-114 `engine_send_offer` without an account | not in this PR | isolated-only migration `20260912064509` was never pushed; must be renamed after `20261231233000` before production. Cloud agent cannot apply it. |

Not proven on the isolated QA host from this environment (no bypass secret,
no isolated DB). Re-prove on `staging-qa-journeys.tulala.digital` after merge:
C02 last-resource, C08 accept after guest claim, Front-desk $0 seat + named
paid seat.

42501 INSERT orders/links and owner-JWT visit UPDATEs stay not-a-defect as
filed in the handover.
