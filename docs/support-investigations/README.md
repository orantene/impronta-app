# Support investigations

Markdown bundles for AI-assisted root-cause work. One file per ticket.

## File name

```
INV-<ticket_number>.md
```

Example: ticket `1842` downloads as `INV-1842.md` from HQ Diagnostics → **Copy investigation bundle**, or from:

```
GET /api/platform/support/tickets/<id>/investigation-bundle?format=md
```

Auth: platform-admin session, or `Authorization: Bearer SUPPORT_INVESTIGATION_TOKEN`.

JSON is available with `?format=json`.

## Shape

Frontmatter:

- `ticket` — `INV-<ticket_number>`
- `tenant` — workspace slug, or `none`
- `severity` — ticket priority (urgent/high/normal)
- `category`
- `status`
- `replay` — session refs (filled when replay exists)
- `sentry` — last Sentry event link when collected

Sections:

1. `## Report` — thread transcript with roles labeled. Emails and phones are replaced by stable short hashes.
2. `## Diagnostics` — client snapshot (console, network failures with query strings stripped, routes, plan, flags).
3. `## Audit trail` — recent workspace audit events.
4. `## Environment` — surface and handler.
5. `## Findings` — paste root cause here.
6. `## Long-term fix` — paste the lasting fix here.

## Paste back

In HQ Diagnostics, paste the edited Markdown into **Paste investigation findings**. The parser writes `## Findings` → `support_tickets.root_cause` and `## Long-term fix` → `support_tickets.long_term_fix`.
