# Talent dashboard visual audit

Scope is the platform talent shell at `/talent/*`. Public `/t/` sites, `/talent/page-builder` (it renders outside the shell), and agency admin are unchanged. The “not linked to an agency” empty state was not edited.

## Pages

| Page | What was dark | After |
|---|---|---|
| Today | Agenda “next” actions used `--tc-primary` (`#1A1A1A`) as a fill. Legacy Today split-button used slate `#4D4855`. | Solid actions are teal. Type stays ink. |
| Attention | Same agenda tokens. | Same. |
| Calendar | Day selection, list filters, and the add button were black fills. The undo bar was a black strip. | Selected days and filters are a soft tint plus a border. Add and save are teal. Undo is a soft bar with a teal text action. |
| Messages | Approve uses the shared messages kit (green `#2b8a63`). Send and some filters used slate. Info toggle was a slate fill. | Kit greens remap to teal only under `[data-talent-visual]`. Send is teal. Filters and the info toggle are soft. |
| Clients | Filter tabs and “Add a client” / “Book appointment” were `bg-admin-ink`. | Tabs are soft. Those two actions are teal. |
| Money | “Request payment”, fee options, method/currency pills, and the earnings source filter were ink or slate fills. | Request payment is teal. Fee options, methods, currency, and the earnings filter are soft selections. |
| Services | Filter chips were `bg-admin-ink`. Add, save, publish, and continue were forest `bg-admin-brand` / `bg-emerald-900`. Booking-mode choices were solid forest pills. | Filters and mode choices are a soft tint plus an action border. Those actions are teal. The public-card preview button stays forest so it still matches the public site. |
| Profile | “Finish” was an ink button. Tier chips used ink or forest. | Finish is teal. Tier chip is a soft label. |
| Reviews | Filter tabs were ink pills. | Soft selected chips. |
| Settings | Shared `PrimaryButton` / form chrome. | Primary fill follows the talent shell. |
| Sidebar | Active row was a white card. Unread badge was forest. Max plan chip was an ink pill. | Active row is the soft tint with an action border. Badge is teal. Plan chip is a soft label. |

## Shared pieces

- Agenda tokens in `agenda/primitives/tokens.ts` set `--tc-primary` to the same hex as headings and filled buttons, and `--tc-accent` to indigo `#3B4CCA`.
- `FeePayerCard` painted the selected payer as `bg-admin-ink text-white`, same as “Let clients cover it”.
- `PrimaryButton` already reads `--tulala-primary-fill` and falls back to slate. The talent grid overrode that with forest `#0F4F3E`. Agency admin does not set the override.
- Messages v5 tokens live in a shared stylesheet. Agency messages keep `#2b8a63`. Talent remaps the variables on `[data-talent-visual="1"] .msgv5`.
- Booking and payment chips already had text labels. Requested, checking, and due chips used an indigo wash, so they read as a second brand.

## Large dark surfaces

| Surface | Stays dark? | Why |
|---|---|---|
| Modal and drawer scrims (`bg-black/20`, `bg-black/40`) | Yes | They are dimmers, not buttons. |
| Dev control bar (`?dev=1`) | Yes | Engineer chrome, not the product. |
| Destructive confirm (release hold, critical confirm) | Yes, red | Destruction is not the teal action. |
| Website studio / theme gallery `bg-admin-ink` | Yes | Page builder and theme gallery are out of this pass. `--color-admin-ink` is not remapped, so those fills stay `#0B0B0D`. |
| Agency admin slate and forest | Yes | No change to `COLORS` or `buttons.tsx`. |

## Product bugs

No separate product bug turned up in the control pass. The unrostered-agency wall is owned by another change and was left alone.
