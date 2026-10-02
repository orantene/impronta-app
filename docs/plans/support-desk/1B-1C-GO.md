# Desk 1b / 1c — GO (live product)

**Oran (2026-10-02):** Skip mockup path. Ship real Desk. No further design asks.

## Sources of truth
- [`SPEC.md`](./SPEC.md) — includes implementation directive
- [`00-audit.md`](./00-audit.md) — memo + 1b/1c checklist
- Engine/HQ on `main`: `web/src/lib/support/*`, `web/src/app/(workspace)/platform/admin/support/*`
- 1a (#2473): flag, host 404, host-scoped cookies, stub at `/platform/admin/support/desk`

## Do
1. Build real three-pane Desk (SPEC §6) behind `SUPPORT_DESK_ENABLED`
2. Replace 1a stub (delete mockup-wait copy)
3. Reuse HQ actions/loaders/engine only
4. HQ link “Open Support Desk ↗”
5. Keyboard shortcuts; journey 7 presence **server-auth**
6. Journeys 2, 7, 23–28

## Do not
- Wait on #2477 mockups or `:3099`
- Ask Oran design questions
- Invent a second ticket system
