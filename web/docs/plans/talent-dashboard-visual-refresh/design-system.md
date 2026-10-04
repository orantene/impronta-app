# Talent dashboard design system

Mounted only when the shell surface is `talent`, on `[data-talent-visual="1"]`. Source: `web/src/components/admin/shell/internal/talent/visual/tokens.ts`.

## Color

| Token | Hex | Use |
|---|---|---|
| `--tc-canvas` | `#F7F8FA` | Page ground |
| `--tc-surface` | `#FFFFFF` | Cards |
| `--tc-ink` / `--tc-primary` | `#26313B` | Type only |
| `--tc-muted` | `#66717D` | Secondary type. 4.97:1 on white |
| `--tc-border` | `#E6E9ED` | Hairlines |
| `--tc-action` | `#3B8277` | The only solid fill. White label is 4.52:1, so 13px white text passes WCAG AA. Not darkened. |
| `--tc-action-hover` | `#326F66` | Hover and pressed fill. 5.83:1 |
| `--tc-action-ink` | `#245850` | Teal used as text on the soft tint |
| `--tc-soft` | `#E8F3F1` | Selection and info wash |
| `--tc-ok` / `--tc-ok-soft` | `#1F5C42` / `#E7F4EC` | Success |
| `--tc-warn` / `--tc-warn-soft` | `#8A5A12` / `#F8F1E3` | Warning |
| `--tc-risk` / `--tc-risk-soft` | `#7A1F26` / `#F8E8E6` | Error |
| `--tc-info` / `--tc-info-soft` | `#245850` / `#E8F3F1` | Info |
| `--tulala-primary-fill` | action | `PrimaryButton` inside the talent shell |
| `--tulala-primary-fill-deep` | action hover | `PrimaryButton` hover |

`--tc-accent` is the action teal. Indigo is not a talent accent.

## Rules

- **Action.** One solid teal button for the next step on a screen (New booking, Request payment, Add a client, Send, Approve). Hover darkens to `--tc-action-hover`. Disabled is 40% opacity. Loading keeps the label and blocks clicks (`disabled` or `aria-busy`).
- **Nav.** The current sidebar row and the phone tab are a soft tint, not a filled pill. The phone tab icon sits on `--tc-soft`.
- **Selection.** Tabs, fee choices, calendar days, and filters use `--tc-soft`, a 1px action border, and semibold ink. They never use the solid action fill.
- **Status.** Soft fill plus the words (Confirmed, On hold, Overdue, Paid). Color is not the only cue.
- **Focus.** `outline: 2px solid var(--tc-action)` with a 2px offset, on `:focus-visible` only.
- **Motion.** `prefers-reduced-motion: reduce` collapses animation and transition to 0.01ms inside the talent shell.

Agency admin keeps slate `#4D4855` (`COLORS.fill`) because `PrimaryButton` only reads `--tulala-primary-fill` when a parent sets it. Public sites and the page builder do not get `data-talent-visual`.
