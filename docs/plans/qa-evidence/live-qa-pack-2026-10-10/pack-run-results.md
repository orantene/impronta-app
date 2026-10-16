---
cursor:
  subagentId: "bc-d8d81011-3a04-58c6-9f0b-d2b1fb30bc9f"
---

# Live QA pack tally — PM 1:05 capacity (#3255) + #3237 assist

**Worker:** [bc-d8d81011](https://cursor.com/agents/bc-d8d81011-3a04-58c6-9f0b-d2b1fb30bc9f)  
**Run:** 2026-10-10 07:09–08:30 UTC · tip `ad8357e0c` (#3237 TUL-518)  
**Stack:** isolated fxlank · `:3008` + `:3105`/`:3106` · `SKIP_MIGRATION_DRIFT_CHECK=1`  
**Fixtures:** `media/live-qa/pack-fixtures.json`  
**Evidence:** `media/live-qa/pack-pm105/` · `web/docs/plans/qa-evidence/live-qa-pack-2026-10-10/` · per-card dirs under `media/live-qa/`  
**Duration:** pack ~13.4m + claim sweeps

## Totals

| Result | Count |
|---|---|
| **PASS** | **7** pack + Done stamps this sweep (538/312/279/330/427 + soft 146) |
| **FAIL** | **18** pack + **TUL-527** stamped + TUL-64 |
| **SKIP** | **12** pack + **TUL-391** pack (unit PASS) + **TUL-484** fixture |
| HOLD (prod SHA) | #3237 / TUL-280 / TUL-518 await prod FF |
| FAIL known | TUL-407 demos:rebuild (continue) |

## Standing notes

| Card | Note |
|---|---|
| **TUL-407** | **FAIL** — needs PM `demos:rebuild` (continue) |
| **TUL-79 / TUL-397** | Isolated free myself = Web Office paywall · **PM Done** live eyes on Jorgelina 3:19a · prod FF includes #3256/#3257 |
| **TUL-518** | W5-10 isolated PASS · **#3237 not on prod** yet (`ad8357e0c` ahead of `327b4c922`) · TUL-280 HOLD |
| **TUL-280** | PM 03:13: do not Done until #3237 on prod · Status Live QA |

## PASS (isolated)

| Card | Evidence shot |
|---|---|
| TUL-146 | `TUL-146/es-1280-*` + soft Notion Evidence (Ready to merge kept) |
| TUL-279 | `TUL-279/` → **Done** |
| TUL-312 | `TUL-312/` → **Done** |
| TUL-330 | Factory SyncSummary → **Done** |
| TUL-379 | `TUL-379-inbox.png` |
| TUL-427 | `TUL-427/` → **Done** |
| TUL-519 | `TUL-519-bubble.png` |
| TUL-538 | `TUL-538/` → **Done** |
| T1/DS-62 | `T1-cta-rosa-myself-*.png` |
| TUL-391 | unit `catalog-slice-tul-391` **6/6** (pack SKIP) · leave Live QA money Oran |

## FAIL (isolated)

| Card | Symptom | Shot |
|---|---|---|
| TUL-62 | Seleccionar timeout on /account | `TUL-62-fail-*` |
| **TUL-64** | Active client bounced to `/start` (¿Cómo trabajas?) | `TUL-64-fail-test-failed-1.png` |
| TUL-116 / 401 | Guest chat dock / Enviar mensaje missing | `TUL-116-fail-*` `TUL-401-fail-*` |
| TUL-182 | Bare `$` on /talent/services | `TUL-182-*` |
| TUL-378 | No Talent\|Admin switch on /talent | `TUL-378-*` |
| TUL-398 | Agregar timeout | `TUL-398-fail-*` |
| TUL-81 | Draft-saved toast not visible | `TUL-81-fail-*` |
| FIRST-RUN | Greeting contains handle | `FIRST-RUN-*` |
| TUL-39 | Nail Designer not listed | `TUL-39-*` |
| TUL-77 | No slots / service picker | `TUL-77-*` |
| TUL-93 | No notification_dispatch rows | (API) |
| TUL-358 | Zona horaria missing | `TUL-358-*` |
| TUL-449 | Site home not 200 | `TUL-449-*` |
| TUL-458 | Hub second message not sent | `TUL-458-fail-*` |
| TUL-503 | Zone label missing · reconfirm: clientPortal empty (0 visits) | `media/live-qa/TUL-503/` |
| TUL-505 | `/directory` → 404 | `TUL-505-*` |
| **TUL-527** | `maison-change-design` unreachable on pack fixtures | `media/live-qa/TUL-527/` |

## SKIP

255 (IMPERSONATION_*), 381 (offerDraft pack locator), 67 (no visit), 473 (paidBooking), 117 (journeys), 120 (QA_PACK_AI_SUPPORT), 421 (THEME_ROUNDTRIP), 325/420 (gallery/theme entry), 441 (STARTER_FAIL), 391 pack (no notification_catalog table)

## TUL-518 (#3237 W5-10) assist

| Check | Result |
|---|---|
| Tip on stack | `ad8357e0c` built + serving |
| Static: ClientThread → GuestOfferSignIn + i18n | **16/16 PASS** |
| Live `/c/t` browser | **PASS** · `media/live-qa/tul-518-w5-10/` · TUL-280 HOLD until prod |
| WP1 TUL-64 bounce | **FAIL** reconfirmed — client → `/start` |

W5-10 checklist line live-proven isolated. TUL-64 line stays open. Do not Done TUL-280 until #3237 on prod.

## Timer sweep 08:13–08:30 UTC

| Card | Result | Notes |
|---|---|---|
| **TUL-146** | soft PASS | ES chrome engShellNav:false profile/services/settings · embeds · Status Ready to merge kept |
| **TUL-279 / 330 / 427** | already **Done** | prior this timer · embeds on card |
| **TUL-391** | catalog unit PASS | 6/6 · pack SKIP · leave Live QA (money Oran) |
| **TUL-472** | **PASS (b)(c) → Done** | Oferta BORRADOR+Enviar · no Error al guardar · (a) on TUL-484 |
| **TUL-484** | IMPROVED (coord) | Selección lists INVITADO (not Abriendo) · Oferta BORRADOR+Enviar · leave talent-only invite eyes |
| **TUL-370** | blocked | superAdmin fixture has no platform membership → `/start` bounce |

## Notion stamps (this worker)

Done: **301**, **538**, **312**, **279**, **330**, **427**, **472** (+ PM Done **79/397**).  
**PM 03:13 fix:** TUL-370 Done→**Live QA** (isolated panel only; await prod `327b4c922` eyes — not ours). TUL-473 Building→**Dev QA** (freeze Building≥30). **TUL-16** stays Live QA (pack ≠ Done).  
FAIL Live QA: **527**, **64**, **503**. Soft: **146** (Ready to merge), **391** (catalog), **484** (IMPROVED coord).  
TUL-280 / TUL-518 HOLD for prod (#3237 still behind `327b4c922`).

## Still claiming (until 09:00 Cancún / 14:00 UTC)

Leave PM/theme/money: 333, 350, 364/365/368/370, 514, 16, 443.  
Fixture-blocked: 420/441/472/473/484/527 · free Web Office · myself site host missing from `agency_domains`.

## Blockers for fuller pack

- `IMPERSONATION_COOKIE_SECRET` + QA client id  
- `GUEST_COOKIE_SECRET` (TUL-518 /c/t mint on this worker)  
- Fixture gaps: offerDraft, paidBooking, invite-accept, platform-admin membership  
- myself site host not in agency_domains  
- fxlank migration drift (skipped at build)

## Timer sweep 08:41–08:45 UTC

| Card | Result | Notes |
|---|---|---|
| **TUL-370** | isolated panel PASS · **Live QA** (not Done) | await prod `327b4c922` eyes · pack/fixture ≠ Done |
| **TUL-473** | FAIL · **Dev QA** (not Building) | freeze Building≥30 · Something broke kept |
| **TUL-407** | still FAIL | needs PM `demos:rebuild` · Status Live QA (not Building) |
| TUL-79/397 HOLD text | outdated | prod already has #3256/#3257 · PM Done 3:19a |
| #3237 / TUL-280 | HOLD | still not on `327b4c922` |

## Timer sweep 09:01–09:03 UTC

| Card | Result | Notes |
|---|---|---|
| **TUL-370** | **Live QA** reconfirm | SQL Status=Live QA · body heading fixed |
| **TUL-473** | **Dev QA** reconfirm | SQL Status=Dev QA · not Building |
| **TUL-445** | FAIL isolated headers · leave **Live QA** | `private, no-store` + `impronta_guest` · `media/live-qa/TUL-445/` · prod eyes not stolen |
| **TUL-518** | soft assist · leave **Live QA** | W5-10 isolated PASS · #3237 ahead of prod `327b4c922` · no Done |
| **TUL-16** | **Live QA** | pack ≠ Done |

## Timer sweep 09:05–09:12 UTC

| Card | Result | Notes |
|---|---|---|
| **TUL-441** | PASS banner · leave **Live QA** | stamped `starter_prepare=failed` → Tu sitio no se pudo preparar + Reintentar · retry fill open · `media/live-qa/TUL-441/` embeds |

## Timer sweep 09:30–09:33 UTC

| Card | Result | Notes |
|---|---|---|
| **TUL-441** | **PASS → Done (Verified on Live)** | retry click cleared banner · `starter_prepare` cleared · `site_compose=fallback_used` · embeds |
| **TUL-379** | PASS isolated reconfirm · leave **Live QA** | no ES eng leaks · await prod eyes after #3278 (PM) |
| **TUL-407** | still FAIL | needs PM `demos:rebuild` · Status Live QA |
| **TUL-370 / 473** | still **Live QA** / **Dev QA** | PM 03:13 hold |
| TUL-79/397 HOLD | outdated | PM Done 3:19a · prod has #3256/#3257 |

## Timer sweep 10:00–10:08 UTC

| Card | Result | Notes |
|---|---|---|
| **TUL-559** | **Done (Verified on Live)** | left Building · `/admin/website` → Cambiar el diseño → design picker · ES 1280/390 + EN |
| **TUL-527** | PARTIAL · leave **Live QA** | picker reachable; theme card click has no Aplicar — pile-up blocked |
| **TUL-420** | PARTIAL · leave **Live QA** | same apply CTA gap |
| **TUL-518** | soft · leave **Live QA** | #3237 ON PROD (TUL-280) · prod eyes not stolen |
| **TUL-407** | FAIL kept | demos:rebuild |

## Timer sweep 10:30–10:42 UTC

| Card | Result | Notes |
|---|---|---|
| **TUL-527** | IMPROVED · leave **Live QA** | apply = **Reemplazar el borrador** · 2 swaps ok · live pile-up needs publish |
| **TUL-518 Apple popover** | FAIL **Still** | talent-site: Google o Apple · `/login` OK Google o correo · Issues stamped |
| **TUL-370 / 473** | Live QA / Dev QA | PM 03:13 hold |
| **TUL-407** | FAIL kept | demos:rebuild |
| TUL-79/397 HOLD | outdated | PM Done |

## Timer sweep 11:00–11:15 UTC

| Card | Result | Notes |
|---|---|---|
| **TUL-370** | **Live QA** reconfirm | Notion fetch `Status":"Live QA"` · pack/fixture ≠ Done · prod eyes not stolen |
| **TUL-473** | **Dev QA** reconfirm | Notion fetch `Status":"Dev QA"` · freeze Building≥30 |
| **GRK-013** | **Still** stamped | `/es/pricing` · Every operator gone · `eng: ["FEATURE"]` · embeds `media/live-qa/GRK-013/es-pricing-*` |
| **GRK-015** | **Still** stamped | citas FAQ · `hasEndpoint: true` · embeds `es-citas-faq-*` · Open→Still |
| **TUL-16** | **Live QA** | pack ≠ Done |
| **TUL-527** | IMPROVED leave **Live QA** | draft apply only (no Cambiar y publicar ahora) · pack both.userId=guest · live pile-up inconclusive |
| **GRK-102** | **Fixed** | EN CTA → `/start?lang=en` · no resume · `media/live-qa/GRK-102-103/` |
| **GRK-103** | **Fixed** | `/es/start` book path → `/es/directory` (ES kept) |
