# Directory talent card — visual QA (density)

Use this when reviewing `/directory` or any grid that uses `TalentCard`.

## Must pass

- **Profile photo** — single still; no carousel on the card.
- **Name** — one line with ellipsis if long; links to the talent URL slug pattern.
- **Talent type** — one primary type only (enforced in `api_directory_cards`).
- **Location** — short city/region line; truncates with ellipsis when needed.
- **Fit labels** — at most **two** visible pills; no skill stacks or generic long tags on the card.
- **Save** — one bookmark control (only decorative icon besides optional none).
- **Quick preview** — text control opening the preview dialog (no extra icon).
- **Minimal metadata** — at most one extra line: either “Featured” or height (cm), not both.

## Must fail (block release)

- More than **two** fit labels visible on a card.
- Bio, bullet lists, or “read more” on the card.
- More than **one** decorative icon on the card (save bookmark counts as the icon).
- Long tag rows or many icons (map pins, socials, etc.) on the card.

## Technical checks

- API / RPC returns at most two fit labels per row (`fit_labels_jsonb` aggregation `LIMIT 2`).
- `DirectoryCardDTO` is the only shape passed into `TalentCard`; do not extend the card with arbitrary tag arrays without product sign-off.
