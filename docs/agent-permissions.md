# Agent permissions (Phase 8.7)

## Write-action safety ladder

| Level | Meaning |
|-------|---------|
| 0 | Read only |
| 1 | Suggest only (no persistence) |
| 2 | Draft only (user applies) |
| 3 | Confirmed write (human confirm + audit) |
| 4 | Restricted admin (flags, theme, redirects) — `super_admin` or gated |
| 5 | Disabled unless explicitly enabled |

## Defaults

- **Customer AI:** levels 0–2 only.  
- **Staff:** same + suggested actions; 3+ behind confirmation.  
- **Super admin:** broader read; 4 tightly scoped.

## Human override

Manual data always wins over AI output — see frozen plan hard rule.

## Example mapping

Search Assistant → 0–1; Inquiry Assistant → 2; redirect tool → 3; flag/theme mutation → 4.
