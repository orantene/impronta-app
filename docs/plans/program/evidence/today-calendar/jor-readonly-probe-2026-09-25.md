# Jor read-only probe — 2026-09-25

**Mode:** read-only. No INSERT/UPDATE/DELETE against `f048e578-…`.

| Check | Result |
|---|---|
| Profile id | `f048e578-cbae-45db-9a3b-34239abea136` |
| `talent_bookings` count (SQL SELECT) | `0` at probe time |
| Flag | Production `TALENT_AGENDA_V2=all` (includes Jor) |
| Agent UI session | **Not performed** — no owner credentials; owner must click Today/Calendar |

Owner action: sign in as Jor, open `/talent/today` and `/talent/calendar`, confirm Agenda V2 chrome. Agents do not write to her rows.
