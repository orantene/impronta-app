# Launch execution — ordered ship plan

From [LAUNCH-VIEW.md](./LAUNCH-VIEW.md). LAUNCH-VIEW = in/out snapshot. **This file = what we ship next and how we prove it.**

Updated: 2026-10-03 ~22:35Z · Plan: Launch-view → execution  
Tips: live + `origin/production` `10698158` (#2503) · main ahead `c3214cac3` (#2504/#2505) · **P1.1 ✅**

**Batched-ask defaults (unless Oran overrides):** welcome email OFF · consent tooling OFF · Maison stay cohort · reap stay ON · registrar parked · card redesign deferred.

Related: [FEATURES.md](./FEATURES.md) · [oran-batched-asks.md](../oran-batched-asks.md) · [TALENT-SITE-GAPS.md](./TALENT-SITE-GAPS.md)

---

## P0 — Honesty + tip (blocking trust)

| # | Work | Status | Owner | Done when |
|---|---|---|---|---|
| P0.1 | Desk auth soft 404 — non–platform-admin `notFound()` in `load-desk-page.ts`; honest admin-only UX; prove portal as platform admin | 🔄 [#2505](https://github.com/orantene/impronta-app/pull/2505) undrafted · Structural [37156061190](https://github.com/orantene/impronta-app/actions/runs/37156061190) still in_progress (~25m+) · tip `03bce10b0` · prove script ready (`oranteneai@gmail.com` = talent → expect honest forbidden) | [Fix Desk 404 live](bc-955dc65f-d2da-5860-8a12-2a701a42aa2e) · [desk-404-fix](../../../internal/support-desk-desk-404-fix.md) | Talent session: honest forbidden (not soft 404); admin portal when admin; shots `05-desk-fixed-*.png` |
| P0.2 | Retract false Desk LIVE in LAUNCH-VIEW / FEATURES / STATUS | ✅ Done board `#87` ❌ (`489ffd50d`); docs still need sync | store | No doc claims Desk LIVE without auth’d portal shot |
| P0.3 | Cookie light bar tip — #2502 `03bce10b0` → Structural → promote → smoke | ✅ tip LIVE; light card proved on `/register` | [Merge cookie consent 2502](bc-cb65fdc2-0ffc-59f1-b4db-b90794a93598) · [merge report](../../../internal/cookie-consent-2502-merge.md) | Tip ≥ `03bce10b0`; dark strip gone on `/register` |
| P0.4 | Kill flag dev-defaults — merge #2504 (rebase if conflicting) | ✅ squash `74a25e5a0` · Structural [37155969216](https://github.com/orantene/impronta-app/actions/runs/37155969216) | [Merge kill-dev-defaults 2504](bc-838bd2ce-2b5a-54ae-9879-0c0818ba3032) · [merge report](../../../internal/kill-flag-dev-defaults-2504-merge.md) | Merged; FEATURES notes no NODE_ENV ON |

---

## P1 — Presence `/talent/site` holes

Surface: `https://app.tulala.digital/talent/site` (paid + Free).

| # | Gap | Status | Action | Done when |
|---|---|---|---|---|
| P1.1 | Unlabeled icons + settings not in drawer | ✅ **PASS** tip `10698158` · EN labels Change design / Colors / History (+ settings sheet) · ES i18n equivalents OK | [Drawer settings and icons](bc-0d6d9d80-bc41-53dc-b93e-7c1f44f8e8c6) · sweep [05-edit-chrome](../../../media/oran-live-sweep/05-edit-chrome.png) | Live HTML tip ≥ `10698158`; labeled EN or ES; settings sheet; shots `media/talent-drawer-icons/live-*.png` + `media/oran-live-sweep/05-edit-chrome.png` |
| P1.2 | Gallery preview hang (Cargando vista previa) | ✅ **PASS / closed** tip `1d56220d1` | No fix PR — hang cleared vs 21:12Z (`7d30bb9d1`). Re-verify 21:46Z Jor: `loading:0`, 5 cards, Explorar→Maison detail + **Usar este diseño**. Sibling: Jor+Valeria `loading:0`. Shots [media/gallery-preview-hang/](../../../media/gallery-preview-hang/) + [talent-site-gaps/jor-paid-05-gallery.png](../../../media/talent-site-gaps/jor-paid-05-gallery.png). Re-open only if hang returns | Previews load (not infinite spinner) |
| P1.3 | Website settings → live site (Story 2) | ✅ | LIVE walk Free Valeria + paid clone + Oran live Jor; no broken-binding PR | Checklist below · shots [`media/website-settings-story2/`](../../../media/website-settings-story2/) · [`checklist-best.json`](../../../media/website-settings-story2/checklist-best.json) |
| P1.4 | TALENT-SITE-GAPS.md | ✅ | [TALENT-SITE-GAPS.md](./TALENT-SITE-GAPS.md) · [Talent site gap ship plan](bc-b6c43f6b-eb58-5227-a3b5-f1c4f730e6bc) | Linked from LAUNCH-VIEW + this file · shots `media/talent-site-gaps/` |

### P1.3 Website settings → live checklist

Personas: **Free** = Valeria `TAL-93901` (`valeria-unas`) · **Paid** = Oran live Jor `TAL-JORGBEAUTY` (`book-jorgelina`; Cloud login) + clone `TAL-93900` corroboration. Shots: [`media/website-settings-story2/`](../../../media/website-settings-story2/). All toggles restored after prove. Password not stored.

| Setting | Free | Paid | Notes |
|---|---|---|---|
| Website chat | ✅ | ✅ | Save → public `.tl-fab` 0; restore → 1 (Valeria, clone, Oran) |
| Accept new inquiries | ✅ | ✅ | UI Save OK; public Ask/Consultar soft (CTAs may remain) |
| Accept new bookings (pause) | ⚠ | ✅ | Oran summary **New bookings paused** after Save. Public `book_now` CTAs remain (product copy: pause keeps site/links). Not a clear binding break |
| Taking emergencies today | ✅ | ✅ | Immediate write; public `data-emergencies-today` on; restored off |
| Booking mode (inquiry) | ✅ | ✅ | Free/clone toggled inquiry → restored Instant. Oran: group open only (live posture left) |
| Address / logo / pages | ✅ | ✅ | Panel opens |
| Languages | ✅ | ✅ | Panel opens |
| Contact / call number | ✅ | ✅ | Panel opens |
| Availability & timing | — | ✅ | Panel open (Oran) |
| Payments | — | ✅ | Panel open (Oran) |
| Client self-service | — | ✅ | Panel open (Oran) |
| Policies and privacy | — | ✅ | Panel open (Oran) |

**Fix PRs:** none — no clearly broken bindings.

---

## P2 — Prove recommended launch scope

LIVE prove tip `03bce10b0` (#2502) · shots [`media/launch-prove-p2/`](../../../media/launch-prove-p2/) · summary [`RESULT.md`](../../../media/launch-prove-p2/RESULT.md)  
Paid Oran account: `oranteneai@gmail.com` → `book-jorgelina.tulala.digital` (Cloud only; no password in store). Money S4–S7 owned by [bc-ebe827ce](bc-ebe827ce).

| # | Prove | Personas | Status | Done when |
|---|---|---|---|---|
| P2.1 | Fresh signup → published `*.tulala.digital` | fresh Free `qa-fresh-20261003-p2@…` | ❌ FAIL — register+code OK; stuck `/onboarding/role` loop; no public URL | New inbox + public URL |
| P2.2 | Messages Accept/Decline + fee/net split | paid Oran LIVE | ✅ PASS — Approve/Decline + quote/pay on inbox thread; fee/net on clone Money; reconfirmed tip `03bce10b0` | Story 7 PASS |
| P2.3 | Bilingual ES+EN talent | paid Oran LIVE | ✅ PASS — Presence EN tabs; public EN\|ES switcher + EN nav on `book-jorgelina` | Presence + public both locales |
| P2.4 | Money Connect + KYC | paid Cloud | ⏸ owned by [bc-ebe827ce](bc-ebe827ce) (prior captcha STOP; acct charges/payouts enabled per handoff) | S5/S7 on money owner |
| P2.5 | Re-sweep LAUNCH-VIEW prove table | Jor · Valeria · Oran · visitor · platform-admin | ✅ PASS tip `03bce10b0` — light cookie on marketing+talent public; gallery previews; admin Desk LIVE; fresh signup still ❌ | New tip SHA + counts |

---

## P3 — Owed visitor path

| # | Work | Status | Done when |
|---|---|---|---|
| P3.1 | Front-door chat paid flip + `?order=` cold load | ⏳ debt | Live prove visitor booking chat |

---

## Parked (do not start)

Client welcome email · consent tooling footer · Maison=`all` · registrar buy · WhatsApp global · site-shell edit · ~32 themes/224 demos · AI booker · premium app gate · onboarding auto-publish defaults · card redesign Phase 2

Hide dead buttons; do not advertise.

---

## Operating rules

1. Merged ≠ tip ≠ visible — LIVE prove on `tulala.digital` / `app.tulala.digital`.
2. One PR per gap after P0 tip lane clears; merge when Structural green.
3. Update FEATURES + LAUNCH-VIEW after each tip advance; Done board never ✅ without auth’d evidence.
4. After each production tip: `cd web && npm run deploy:smoke`. Smoke now verifies production gating flags via `GET /api/health/flags` against `web/scripts/prod-flag-expectations.mjs` (keep in sync with FEATURES.md env matrix). Missing flag or wrong value → exit 1. Does not flip flags.
5. **Done board Live proof:** every STATUS.md ✅ needs a production screenshot from `app.tulala.digital` as TAL-93900 (linked in Evidence). Not localhost. Tip SHA alone ≠ ✅ — demote to 🟡 or mark **Live proof owed** until the shot exists.
