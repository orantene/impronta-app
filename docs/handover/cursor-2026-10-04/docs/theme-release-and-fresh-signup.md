# Theme release LIVE chain + fresh signup E2E

Updated: 2026-10-04 ~04:00Z · Agent `bc-a86585b3`  
Live tip at tip-prove: **`07200ab28b`** (`dpl_4xFdg7WV…`) includes [#2516](https://github.com/orantene/impronta-app/pull/2516) (`eb633d254`)  
Shots: [media/theme-release-signup/](../media/theme-release-signup/)  
Prior learn-only audit: [theme-release-chain-audit.md](./theme-release-chain-audit.md)  
**SUPPORT_DESK not touched.**

---

## Verdict

| Lane | LIVE status |
|---|---|
| Talent Factory author/release | **BLOCKED** — `QA_PLATFORM_ADMIN_PASSWORD` missing; Factory as talent → 404 |
| ThemeUpdateNotice → preview → apply (keeps content) | **PASS** on TAL-93900 Maison v2 **21 → 23** |
| Demos on released version | **PASS** — Alba host + TAL-93020/02/03 pins at maison-v2 **v23** |
| Fresh signup from zero (tip-prove) | **PASS** — `qa-fresh-20261004-e@impronta.test` → **TAL-93937** on LIVE `07200ab`; signup_intent + talent role + no role loop; Free Presence OK. SQL used only for email confirm (`@impronta.test`). |

---

## 1. Theme release consumer chain (TAL-93900)

Pin was reset to v21 + update row reopened for the open Maison v2 opt-in release (`6031aba7…`, 22→23), then walked LIVE.

| Step | Result | Evidence |
|---|---|---|
| Presence notice | **PASS** — “Maison v2 tiene una actualización” | `02-presence-notice.png` |
| What’s new sheet | **PASS** — “Versión 21 → 23”, Aplicar | `03-update-sheet.png`, `04-preview.png` |
| Preview keeps content | **PASS** — draft preview still Jorg Beauty / “Una mirada más suave…” | `04b-draft-preview-content.png` |
| Apply | **PASS** — toast “Actualización aplicada a tu borrador”; DB pin **v23**, update `applied` @ 01:06Z | `05-after-apply.png` + SQL |
| Content kept | **PASS** — same hero/services in preview + after-apply Presence | preview + after-apply shots |

Factory author of a *new* release: **not attempted** (admin password blocked). Consumer path uses the already-open opt-in release (same as prior audit).

---

## 2. Demos

| Check | Result |
|---|---|
| DB: TAL-93020 Alba / TAL-93003 Camila / TAL-93002 Renata | maison-v2 **v23** |
| `https://alba-nail-artist.tulala.digital/` | **PASS** content | `06d-demo-alba-host.png` |
| `https://app.tulala.digital/t/TAL-93020` | **PASS** | `06e-demo-profile.png` |
| template-preview `?demo=alba` | thin/empty shell this pass | `06c-demo-template-preview.png` |

---

## 3. Factory / admin

| Check | Result | Evidence |
|---|---|---|
| `/platform/admin/builder-lab` as TAL-93900 | 404 “Page not found” | `07b-factory-as-talent.png` |
| `QA_PLATFORM_ADMIN_PASSWORD` in Cloud env | **missing** | — |
| Author → Publicar → Open to talents | **BLOCKED** | needs refreshed admin password |

---

## 4. Fresh signup E2E

### 4a. Pre-fix (historical)

Account: `qa-fresh-20261004-b@impronta.test` → **TAL-93936** (after SQL role assist).

| Step | Result | Evidence |
|---|---|---|
| Register + OTP UI | **PASS** | `s10`…`s11` |
| DB after register | **`app_role=client`**, **no `signup_intent`** | SQL |
| Login → role → “I’m Talent” | **LOOP** | `signup-continue.json` |

Root causes fixed in [#2516](https://github.com/orantene/impronta-app/pull/2516): `isTalentSignupNext` covers `/talent/*`; `chooseTalentRole` calls `complete_talent_onboarding`; OTP/OAuth promote + role-page auto-skip.

### 4b. Tip-prove on LIVE `07200ab` (clean — no SQL role assist) — **PASS**

Account: `qa-fresh-20261004-e@impronta.test` → **TAL-93937** · user `0fcb11dd-…`  
Deploy: `dpl_4xFdg7WVyShqZcrDZk6GYPCRQ7xJ` · SHA `07200ab28b` (includes #2516 `eb633d254`)  
Evidence JSON: `signup-tip-prove.json`

| Step | Result | Evidence |
|---|---|---|
| `/es/register?as=talent` on tip HTML | **PASS** → OTP UI; `next=/talent/profile/fields` | `s60`, `s61` |
| DB right after register | **`signup_intent=talent`**, **`app_role=talent`**, `account_status=onboarding` | SQL |
| SQL email confirm only | **PASS** (reserved `@impronta.test`; no inbox) | SQL |
| Login `?next=/talent/profile/fields` | Lands role with talent next | `s62`, `s63` |
| Role auto-complete (`chooseTalentRole`) | **PASS** — first hop one-shot RSC error; retry completed onboarding → `/talent` | `s64` |
| `/talent/profile/fields` | **PASS** — editor loads; **no role loop** | `s65-es-talent-profile-fields.png` |
| `/talent/site` Free Presence | **PASS** — “Desbloquea tu sitio gratis”, checklist, plan **GRATIS** | `s65-es-talent-site.png`, `s66` |
| `/talent` Today | Unrostered “Profile created” wall (independent talent, not on agency roster) | `s65-es-talent.png` |
| Cambiar diseño gallery | Absent at **0%** unlock (expected until Presence progress) | `s66` |

Final DB: `app_role=talent`, `account_status=active`, `onboarding_completed_at` set. **No SQL role/onboarding writes.**

Note: discarded `qa-fresh-20261004-d` — registered while HTML still served stale `dpl_9usxei` (`3a74`, before #2516); no `signup_intent`. Tip-prove required tip HTML.

---

## 5. PR owned

| PR | Branch | Result |
|---|---|---|
| [#2516](https://github.com/orantene/impronta-app/pull/2516) | `cursor/fix-talent-signup-intent-3cd1` | Squash-merged `eb633d254` → main; LIVE via `07200ab` |

Gates on branch before merge: typecheck PASS · lint PASS · auth-routing 38/38.

---

## 6. Screenshot index

All under `media/theme-release-signup/`:

- Theme chain: `01`…`05`, `04b`
- Demos / gallery: `06*`
- Admin blocked: `07b`
- Pre-fix signup: `s10`…`s11`, `s20`…`s22`, `s40`…`s42`
- Tip-prove: `s60`…`s66`, `signup-tip-prove.json`

---

## 7. STATUS / ownership

| Item | State |
|---|---|
| #2516 tip-prove | **DONE PASS** on LIVE `07200ab` |
| Theme consumer + demos | **PASS** (earlier this run) |
| Factory author/release | **BLOCKED** — needs `QA_PLATFORM_ADMIN_PASSWORD` |
| Independent-talent Today wall | **KNOWN product** — not a signup-intent regression |
| Remaining when unblocked | Factory author → release → notice on pin-below talent → demos |

Owner remains on this surface until Factory path is unblocked or ownership is reassigned.
