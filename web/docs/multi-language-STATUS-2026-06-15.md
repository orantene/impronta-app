# Multi-Language Platform — Status Ledger & Finish Plan
_2026-06-15, live. Integration branch: `feat/multi-language-platform` (HEAD `ab51d45ab`, gate-green: 0 tsc / 0 lint, translation tests pass)._

## ✅ DONE — committed on `feat/multi-language-platform`
| Commit | Workstream |
|---|---|
| `4471d5e4d` | **Phase 0** — `resolve-localized.ts` (universal N-language resolver), `builder-i18n.ts` (per-element overlay primitives), registry-aware `TenantLocaleSettings` (primary + ordered secondary + `fallbackChain`), `Locale=string` + BCP-47 schema |
| `bb81e596f` | **WS3** — fields / sections / groups → `_i18n` JSONB (migration `…211100`) |
| `791e4a36b` | **WS4** — taxonomy / locations / bios / services → `_i18n` JSONB (migration `…211200`) |
| `d073118c3` | **WS1** — platform language **registry admin UI** (`/platform/admin/languages`, add-a-language) |
| `633aa1a88` | **WS2** — registry-sourced agency picker + **talent preference** + primary/secondary (migration `…211000`) |
| `ab51d45ab` | **Integration gate-fix** — reconciled `_i18n` readers + chain args + WS1/WS2 lint → green |

## 🟡 SECURED but NOT merged (in worktrees; killed mid-flight, ungated)
- **WS5** `ml/ws5 @ 659c583bd` — page-builder per-element translation. 11 files, ~80%: built `locale-field-tabs.tsx` (per-field EN/ES tabs + dots), `active-content-locale-bridge.ts` (in-session header toggle), `i18n-overlay.ts`, canvas/inspector/topbar wiring. **Killed mid-edit** wiring `commitBuilderNodeText` → does not yet compile. → finish → gate → merge.
- **WS6** `ml/ws6 @ 04a29fcc0` — dashboard toggle + single-language + `["en","es"]` sweep. 20 files. → gate → close gaps → merge.

## ⬜ NOT STARTED
- **WS7** — dynamic message catalogs (`messages.ts`), 155 `locale==="es"` ternary sweep (~70 files), mount the dormant Translation Center.
- **#11 column-sweep** — repoint dropped-column loose `.select()` strings (`bio_en/es`, `label_es`, `name_es`, …) that pass tsc but 400 at runtime. ~8+ files.

## 🚀 CUTOVER (final — needs go/no-go)
1. Apply migrations `…211000 / …211100 / …211200` to Supabase — **breaking** for the shared DB (drops `_es` columns the ~20 other live sessions still read).
2. Regenerate `database.types.ts` authoritatively.
3. Add a real **third language "fr"** → prove end-to-end (registry → agency picker → field/taxonomy slots → builder FR tab → public FR switcher).
4. `deploy:smoke`.

## ⚠️ Execution reality
Background agents are being killed ~every 15–90 min (global suspends — transcripts freeze at the same second). Long autonomous runs are unreliable here. **Mitigation:** secure WIP to commits often; resume from secured commits; prefer shorter coordinator-driven steps + bounded agent bursts.

## Finish order
1. **WS6** finish + gate → merge into `feat`.
2. **WS5** finish + gate (resume from `659c583bd`) → merge.
3. **#11** column-sweep → merge.
4. **WS7** message infra + Translation Center (ternary sweep may be partial — fallback-to-default is safe) → merge.
5. **Cutover** (your go): migrations + types + "fr" proof + smoke.

## Decision needed
Cutover approach: (a) **hold** — keep branch gate-green & ready, apply when you make ML the main line; (b) **Supabase branch** — prove "fr" on an isolated DB without touching shared; (c) **shared DB now** (breaks other sessions). _Recommend (b) for the proof, (a) until you're ready._
