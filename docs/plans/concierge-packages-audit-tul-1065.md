# TUL-1065 Packages audit: decision (code read, 2026-10-14)

Verdict: KEEP Packages as their own kind, but fix naming, dedupe and display; do not merge into Services yet.

## What the code does
- Source: `talent_offerings` rows with `kind = 'package'`. `loadOfferingRows` (web/src/lib/messages-v5/items-catalog.ts) maps `package` -> category `package`, `service` -> `service`, and every other kind (`product`) -> category `menu`.
- Chip labels come from `CATEGORY_KEY` in `app/t/[profileCode]/_chat/GuestDockCatalog.tsx`: Packages / Services / Menu / ...
- A package row carries title, price, `duration_minutes`; it has NO contents (children are loaded only for the single-talent path, `loadTalentProfileOfferingRows` + `loadOfferingChildren`), NO description and NO owner on the network-wide list.

## Why the audit saw what it saw
- "Menu" with one item on staging: that is a `product` offering (QA own-workspace sale), shown under the generic `menu` category. Not a packages bug; it is a naming leak of the internal kind.
- "Programas" on the talent page: a separate surface using its own copy for the same kind.
- Two identical "Set: lifting + Lami Brows" on prod: two published rows with the same title, price and duration. No dedupe on create or on read.
- Add failure (#2): server-side in `messagingClientAddItem` (tracked in TUL-1068); needs a repro with a demo talent.

## Decision
1. Keep `package` as a kind. A package is a bundle with its own price; folding it into Services would lose "contents" and "savings".
2. One name everywhere: Packages / Paquetes. Rename the `menu` category label to something that does not read as a package tab ("Products" / "Productos"), or hide it when the business is not a restaurant.
3. Show contents (the children) and the owner on every package row.
4. Dedupe on read: collapse rows with the same owner + title + price + duration.
5. Hide the Packages tab when empty in the current scope.
6. Re-show only once Add works (TUL-1068 #2).

## Not done in code yet (held)
Owner display needs the owner chips that are held for Oran's design call.
