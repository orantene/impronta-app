# M3 — Today money tiles from Money read model

## Scope (Stage C)

- Today compact Money tiles: **Collected in September**, **Due by today**, **Next payout · estimated**
- Figures come only from M1 September fixture + `summarizeMoneyLedger` / `buildMoneySpineView` (same as Money spine)
- **Due by today** opens Money Outstanding with filter `"today"` (`mc_out_today`) — same $2,620 as Part1 p13–p15
- Replace talent Today use of earnings / `snapshot-aggregations` / `todayTotals` for these three figures
- Visual-spec: store `docs/money-and-clients/visual-spec/INDEX.md` owning-PR **M3**; frames via `mc_out_today` / `mc_defs`

## Files

| Path | Role |
|---|---|
| `web/src/lib/money/today-money-tiles.ts` | Tile model + sessionStorage landing pin |
| `web/src/lib/money/today-money-tiles.test.ts` | Amounts ≡ LEDGER-CONTRACT; due-by-today landing |
| `web/src/components/admin/shell/internal/talent/agenda/present.ts` | `moneyFromLedger` |
| `web/src/components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx` | Renders ledger tiles |
| `web/src/components/admin/shell/internal/talent/pages/TodayPage.tsx` | `onOpenMoney` → Money page |
| `web/src/components/admin/shell/internal/talent/agenda/primitives/MoneyBlock.tsx` | Clickable rows |
| `web/src/components/talent/money/MoneySpine.tsx` | `consumeMoneyLanding` on mount |
| `web/src/lib/money/money-spine.static.test.ts` | M3 wiring guard |
| `web/package.json` | `test:money` includes today-money-tiles test |

## Fixture ↔ tiles

| Tile | Contract key | Value |
|---|---|---:|
| Collected in September | `collected_gross` | 18450 |
| Due by today | `due_by_today` | 2620 |
| Next payout · estimated | `next_payout_estimated` | 5784 |

## Gates

| Gate | Result |
|---|---|
| Unit: `today-money-tiles.test.ts` + spine static M3 | run in PR |
| `npm run typecheck` | run in PR |
| `npm run lint` | run in PR |
| `npm run test:money` | run in PR |

## PR

- Draft: https://github.com/orantene/impronta-app/pull/2300
- Branch: `cursor/mc-m3-today-tiles-bcab`
- Base: `origin/main` @ `47aebf8ae` (M2 #2299)

## Not in M3

- Live DB loader (still fixture)
- M4 payout detail / account states
- Request / record CTAs on Outstanding rows (R1 / R5)
- Live 1:1 browser proof on talent host
