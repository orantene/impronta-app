# A5 — Clients page loads (via PR #2270)

## Vehicle

Open draft PR [#2270](https://github.com/orantene/impronta-app/pull/2270) —
`cursor/fix-jor-day-qa-1dc2`. Column fix + agency join landed there; this
follow-up on the same branch:

- Key by `row.id` (`booking:` / `agency:` / `inquiry:`), not `name.toLowerCase()`
- Owed amounts: major `total_client_revenue` / `client_charge_total` → cents

No separate `feat/mc-a5-*` PR (avoid duplicating #2270).

## Proof

Static: `web/src/lib/talent/clients-actions.static.test.ts`
Host: talent Clients on QA Agenda Jor after promote.
