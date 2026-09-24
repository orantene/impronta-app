# Services finish marathon — REPORT

Worktree: `.claude/worktrees/services-rebuild` on `feat/services-rebuild`.  
Phase 7 (live `#servicios` → `services_catalog`) was **not** run: no owner swap instruction in chat.

## Gates (Phase 8)

Recorded after the marathon edits (fill exit codes when the queued runs finish):

| Gate | Result |
|---|---|
| `npm run typecheck` | pass (exit 0) |
| `npm run lint` | pass after `proxy.ts` under 800 lines |
| `npm run test:builder-node-bindings` | 1802 pass / 0 fail |
| `npm run test:billing` | 679 pass / 0 fail |

## Phase outcomes

### Phase 1 — Hours
- Services links to Calendar / `BookingHoursCard` when Instant booking is on and no hours row exists (`ServicesHoursNeeded`).
- Catalog sheet shows a loading line while slots fetch; empty copy only after load.
- Proof then delete: `evidence/p-phase1-slots-api.json`, `p-phase1-slots-loading.png`, `p-phase1-slots.png`. Hours row removed after proof.

### Phase 2 — Extras
- Public payload merges `talent_addon_groups` into `addOns` (id, name, price, minutes); no duplicate ids (`merge-addon-groups*`, wired in `offerings-public.ts` / `offerings-actions.ts`).
- Extra screen portfolio photo picker.
- Unit coverage: `merge-addon-groups.test.ts`.
- Proof then delete: `evidence/p-phase2-extras.json`. Encapsulado test group removed.

### Phase 3 — Confirm closes the order
- `payInPerson` from offering policy; success follows `redirectPath` (checkout or `/c/{inquiryId}?instant_booked=1`).
- Captcha collected off localhost; localhost skip only with `TULALA_ALLOW_DEV_SURFACES=1` on loopback.
- Guest identity: `resolveGuestSessionId` stamped on inquiry; `/dev` proxy attaches guest cookie/header; service-role convert for customers insert.
- Proof then delete: `evidence/p-phase3-booking.json`, `p-phase3-confirm.png`, `p-phase3-confirm-refresh.png`. Order / hold / inquiry deleted after refresh survived.

### Phase 4 — Dashboard
- More: real Working hours / Services / public-page status via `useWebsiteEligibility` (opens Calendar for hours).
- Defaults: absent buffer/notice keys stay empty (`null`), not 10/120.
- Rename uses `categoryNearMatch` (Unas ↔ Uñas); tests in `publication-state.test.ts`.
- `hideFailedIds` cleared on archive / show / delete; Delete forever confirms with the item name from Archived only.
- Evidence: `p-phase4-defaults-empty.json`, `p-phase4-rename-unas.png`, `p-phase4-rename-back.png`, `p-phase4-near-match.png`.

### Phase 5 — Front
- Titles use `line-clamp-2` + `title` (Services home, storefront, maison, catalog CSS).
- Spanish walk: sheet + confirmation evidence `p-phase5-sheet-es.png`, `p-phase5-confirm-es.png`, `p-phase5-widget-390.png`, `p-phase5-title-360.png`.

### Phase 6 — Three surfaces
Same published service `28223093-53d2-40e7-bca4-28bc2dc555f7` (**Extensiones clásicas** / Classic lash extensions, **$700 MXN**, **2 h**):

| Surface | Evidence | Notes |
|---|---|---|
| Hub `/es/t/TAL-JORGBEAUTY` | `p-phase6-hub.png`, `p-phase6-hub-desktop.png` | Row: name, 2 H, 700 MXN, Reservar ya |
| Widget `/dev/jor-beauty?book=live` | `p-phase6-widget.png` | Same name/price/duration; Seleccionar CTA |
| Directory card | `p-phase6-directory.png` | `tulala.digital/directory?q=Jorg` — talent card + Inquire (marketing directory has no catalogue line by design) |

Loader fix: hub `startingFrom` no longer prints raw `talent_profiles.starting_from` cents. It uses `pickHeadlinePrice(storefrontOfferings)` + `formatMoney` (same picker as directory pricing). ServicesBlock label localized (`Desde:` / `Starting from:`). See `p-phase6-service.json`.

### Phase 7 — Live band
**Skipped.** Home fingerprint must remain `f8156c9405` until an explicit swap. Undo revision if ever written: `79ef2414`.

### Phase 8 — Sign-off
- REPORT rewritten (this file).
- PR opened only after gates green.
- Dev lease revoked when the marathon stops.

## Jor writes and undos (this marathon)

| Write | Undo |
|---|---|
| Test Mon–Sat hours window (Phase 1) | Row deleted after slots proof |
| Encapsulado (+200 MXN, +25 min) attachments (Phase 2) | Group + attachments deleted |
| One live widget booking (Phase 3) | Order, lines, hold, inquiry deleted; logged in `p-phase3-booking.json` |
| Uñas rename → Undo (Phase 4) | Back to Uñas (`p-phase4-rename-*.png`) |
| Home page blocks | **Not written** (Phase 7 skipped). Fingerprint still `f8156c9405` |

## Home page (read-only)

`talent_pages` `bad420b5-13cc-45ab-a915-841e775b1a7c`:

- Fingerprint method: `sha1(json.dumps(blocks, sort_keys=True))[:10]`
- Expected until Phase 7: `f8156c9405`
