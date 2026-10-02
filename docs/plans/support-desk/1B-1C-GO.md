# Desk 1b / 1c — GO (live product)

**Oran (2026-10-02):** Skip mockup path. Ship real Desk. No further design asks.

Product PR: [#2483](https://github.com/orantene/impronta-app/pull/2483) · Audit: [`00-audit.md`](./00-audit.md) (D4 / D8 / D11 **required**)

## Sources of truth
- [`SPEC.md`](./SPEC.md) — implementation directive
- [`00-audit.md`](./00-audit.md) — required vs optional
- Code verify: Context `internal/codex-p1-desk-verify-2483.md` (all three P1s landed — **do not reopen**)

## Required (not optional) — landed on #2483 / #2473

1. Real three-pane Desk behind `SUPPORT_DESK_ENABLED`; delete mockup-wait stub.
2. Reuse HQ actions/loaders/engine only.
3. HQ link “Open Support Desk ↗”.
4. Keyboard shortcuts (ignore inside inputs).
5. **D8 Journey 7:** private `support.presence.{ticketId}` + RLS — **required**; landed #2483.
6. **D11 Journey 27:** `clientSendKey` through reply/append + lookup — **required**; landed #2483.
7. **D4 cookies:** host-scoped Domain on Desk hosts (never `.tulala.digital`) — **required**; landed #2473 / held #2483.
8. Journeys 2, 7, 23–28 evidence.

## Do not
- Wait on #2477 mockups or `:3099`
- Treat D4 / D8 / D11 as optional
- Reopen product work from docs after verify
- Ask Oran design questions / invent a second ticket system
