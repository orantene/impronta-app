# Cursor handover — 2026-10-04

**Written:** 2026-10-04 ~18:55Z · **Coordinator:** Project root (bc-6b0148bc)  
**Audience:** next agent / Claude Opus continuing from this folder only  
**Store mirror:** this directory (copied from `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/`)

---

## Snapshot (quick)

| Item | Value |
|---|---|
| `origin/main` | `e62cd0d0c81838796a9cd9827e0c6baf3f0c62cf` |
| `origin/production` | `7c3f2792a312a9c3462b43255ac837f3c2f7e6e4` |
| Vercel production READY (latest listed) | `dpl_B34kgH7U1xnciATiGcwdc97M1Aka` @ SHA `948a78a55867cbc08f5664340859f8826b6169c6` (#2532) — **lagging** git `production` tip |
| Scoreboard | ✅ 11 / 🟡 58 / ❌ 15 / ⏸ 2 / ❓ 14 (`plans/done-status/STATUS.md`) |
| Jorgelina | READY call stands (`docs/jorgelina-handover-ready.md`) — captcha re-ON 2026-10-04 18:51Z |
| Support Desk login | Broken until [#2538](https://github.com/orantene/impronta-app/pull/2538) ships — use `/desk` |

---

## A. DONE + LIVE (verified on production)

Evidence under `media/` and linked store docs unless noted. “Live” means production tip / aliased custom domains at time of proof.

| Item | PR | Merge SHA | Live evidence |
|---|---|---|---|
| Nail Studio header (title first, logo) | [#2532](https://github.com/orantene/impronta-app/pull/2532) | `948a78a55` | On Vercel production READY `dpl_B34kgH7U…` |
| Sticky chrome + Gridline/Folio width | [#2530](https://github.com/orantene/impronta-app/pull/2530) | `15e65e2d5` | Prior LIVE tip; ancestor of current prod |
| Demo talent hosts `-demo` suffix | [#2526](https://github.com/orantene/impronta-app/pull/2526) | `b54d2b803` | 31/31 `{siteSlug}-demo` HTTP 200 |
| Save look image → front-door chat | [#2531](https://github.com/orantene/impronta-app/pull/2531) | `f70305561` | Ancestor of LIVE |
| Language bar yields to dock | [#2527](https://github.com/orantene/impronta-app/pull/2527) | `7da888feb` | Ancestor of LIVE |
| Maison services width / Save look | [#2528](https://github.com/orantene/impronta-app/pull/2528) | `3e075bea2` | Maison tip-prove media |
| Talent capture thread identity | [#2525](https://github.com/orantene/impronta-app/pull/2525) | `2982c647d` | Soft Gel Guardar smoke PASS |
| Guest captcha admin switch prove | [#2524](https://github.com/orantene/impronta-app/pull/2524) | `a384e274b` | OFF→ON prove; **re-ON 2026-10-04 18:51Z** (was found OFF) |
| Free drains #55/#57/#59 | — (already on tip) | tip `15e65e2d5` | `docs/free-drains-55-57-59-2026-10-04.md` · `media/free-drains/` |
| Builder Lab #64/#65 + demos v24 | — Factory publish | demos release v24 | `docs/builder-lab-factory-64-65-2026-10-04.md` |
| Support Desk host + flag ON | [#2483](https://github.com/orantene/impronta-app/pull/2483) + env | — | `SUPPORT_DESK_ENABLED=1` Vercel prod+preview; `https://support.tulala.digital/desk` → 307 login |
| `maison-v2-demo` vanity LIVE | mapping (pre-#2534) | — | HTTP **200** Alba (2026-10-04 probe) |
| Avatar menu TAL subtitle | [#2506](https://github.com/orantene/impronta-app/pull/2506) | `56f0c147d` | TAL-93900 shots in store media |
| Soft Gel inquiry Checkout PAID | qa-stripe path | — | `cs_test_…` · `/pay/98fy…` · dock Paid |

---

## B. DONE, NOT VERIFIED LIVE (main / code / prior tip — tip-chase or screenshots owed)

| Item | PR / SHA | How to prove |
|---|---|---|
| Support Desk Phase 0.5 mockups on main | [#2536](https://github.com/orantene/impronta-app/pull/2536) `7c3f2792a` | On `production` git tip; confirm Vercel prod deploy advances past `948a78a55`, then `npm run mockup:support-desk` optional |
| Maison footer placeholders allow-list | [#2535](https://github.com/orantene/impronta-app/pull/2535) `e8ec0063e` | Tip-chase → Live; Factory Publish Maison draft with footer tokens |
| Design vanity `-demo` hosts migration | [#2534](https://github.com/orantene/impronta-app/pull/2534) `e62cd0d0c` | Tip-chase; re-probe maison-v2/folio/gridline `-demo` after promote |
| Tip chase #94 | main ahead of Vercel READY | Green Structural on main tip → `promote-production` → confirm `dpl_*` SHA == `origin/production` |
| #45 fee-line $100 / $101.50 | code exists | NEW paid booking TAL-93900 (4242/0077) + screenshots seller+client |
| S5/S7 refunds | engine on tip | Same new booking; full/partial/unknown-fee shots |
| Messages inbox UX | [#2537](https://github.com/orantene/impronta-app/pull/2537) | Fix Structural (3 messaging tests) → merge → Live Chrome Jor |

---

## C. IN PROGRESS

### C1. Support Desk auth — [#2538](https://github.com/orantene/impronta-app/pull/2538) (DRAFT)

- **Branch:** `cursor/support-desk-auth-58f5` @ `e473ad36f`
- **State:** Code complete locally (typecheck/lint/unit PASS). CI Structural + Supabase chain were still running at handover.
- **Done:** `next=/desk` for super_admin; `/admin`→308`/desk` on Desk hosts; OAuth stays on Desk origin; parent-domain cookie expire on Google/email/OTP.
- **Next 3 steps:**
  1. Wait Structural green on #2538; undraft (re-queues Structural — wait again); squash-merge.
  2. Tip-chase until Live; Cloud Chrome: signed-out → Google platform-admin → `/desk`; `/admin`→`/desk`.
  3. Confirm `app.tulala.digital/admin` still agency/talent admin.
- **Files:** `web/src/lib/auth-flow.ts`, `web/src/lib/support/desk-host.ts`, `web/src/lib/support/desk/desk-url.ts`, `web/src/lib/support/desk/desk-auth-cookies.ts`, `web/src/lib/supabase/cookie-domain.ts`, `web/src/proxy.ts`, `web/src/app/auth/{callback,google,actions,otp-actions}.*`
- **Gotchas:** Desk cookies are **host-only**; clearing `.tulala.digital` shadows is required. Do not flip `SUPPORT_DESK_ENABLED`. Undraft re-queues Structural.
- **Docs:** `docs/support-desk-auth-fix-2026-10-04.md`, `media/support-desk-auth/`

### C2. Messages inbox — [#2537](https://github.com/orantene/impronta-app/pull/2537) (DRAFT, RED)

- **Branch:** `cursor/messages-inbox-audit-1958` @ `02f434166`
- **State:** Feature code landed; Structural **FAILED** — `tests — messaging` 3 fails / 886 pass (run `37223738358`). Fix agent `bc-f152731d` was spawned.
- **Next 3 steps:**
  1. `gh run view 37223738358 --log-failed` → identify 3 failing tests; fix-forward.
  2. Rebase onto latest main (`e62cd0d0`); push; green CI.
  3. Undraft → wait Structural → squash-merge → Live Chrome prove.
- **Assignee after handover:** Claude Opus

### C3. Tip chase / promote

- Git `production` = `7c3f2792a` but Vercel READY still shows `948a78a55`. Confirm promote workflow for tip including #2534/#2535 after Structural on main.

### C4. TAL-93900 money / #45 / S5

- Agent `bc-cbf5dc17` died on Auto usage limit. Resume on **new VM** (secrets). Fresh booking 4242/0077 only.

### C5. Numeric TAL codes — [#2533](https://github.com/orantene/impronta-app/pull/2533) (DRAFT)

- Pre-existing open draft; not owned this session. Continue or close deliberately.

---

## D. NOT STARTED / BACKLOG (recommended order)

1. **P0** Merge #2538 auth → tip-chase → Live Desk login prove  
2. **P0** Fix #2537 Structural → merge → inbox Live prove  
3. **P0** Tip-chase main (`e62cd0d0`) → production Vercel SHA match → `deploy:smoke`  
4. **P0** #45 fee-line + S5/S7 refunds on TAL-93900 (new VM secrets)  
5. **P1** Light Support Desk chrome (live is dark HQ reuse; mockups `:3099` light) — only if Oran asks  
6. **P1** Fresh signup full story (S1 #2–4 still ❌)  
7. **P1** Stripe support email dashboard (#83) — Oran clicks  
8. **P2** Parked board rows 8/9  
9. **P2** Remaining 🟡 Live-proof-owed STATUS rows (see `plans/done-status/STATUS.md`)

---

## E. BLOCKED

| Item | Blocker | Who | Exact action |
|---|---|---|---|
| Fleet of Auto agents | Cursor Auto usage / Spend Limit | Oran | Raise Spend Limit or switch models; resets ~2026-11-03 |
| Cloud secrets on old VMs | Trailing newlines / secrets only on NEW VMs | Oran / next agent | Re-save `QA_PLATFORM_ADMIN_PASSWORD` without `\n`; spawn **new** cloud VM for money prove |
| Desk login UX for Oran | #2538 not Live | Next agent | Merge #2538 + tip-chase |
| #45 / refunds | Money agent dead + need new booking | Next agent | New VM + TAL-93900 4242/0077 |
| #2537 merge | Structural red | Next agent | Fix 3 messaging tests |

---

## F. KNOWN BUGS / RISKS

1. **Support `/admin` 404** — Repro: open `https://support.tulala.digital/admin` → branded 404. Root: surface allow-list excludes `/admin`; platform-admin default landing. Fix in #2538. Evidence: `media/support-desk-auth/admin-404.png`.
2. **Google “Opening Google…” friction** — Repro: Desk login Google; chooser to `*.supabase.co` while button spins. Root: parent-domain cookie/PKCE shadow + `next=/desk` drop. Fix in #2538. Evidence: `media/support-desk-auth/google-chooser.png`.
3. **`guest_captcha_enforced` was FALSE** at handover (found 2026-10-04 18:51Z). **Corrected to TRUE** same minute. Risk: someone turned it off for money QA and left it off. Verify after tip-chase.
4. **Vercel production SHA lag** — git `production` ≠ latest READY deploy SHA. Risk: false “LIVE” claims. Always check Vercel READY meta SHA.
5. **Undraft re-queues Structural** — merging draft PRs too early blocks mergeability.
6. **Messages inbox Structural** — 3 failing messaging tests on #2537; do not merge red.
7. **QA data on live DB** — Free Diego / TAL-93900 / Soft Gel fixtures intentional; do **not** leave QA money on TAL-JORGBEAUTY (Jorgelina real).

---

## G. DECISIONS MADE / NEEDED

### Made (not obvious from code alone)

- Prefer `/desk` over `/admin` on support host until auth fix Live.  
- Did **not** flip `SUPPORT_DESK_ENABLED` (already `1`).  
- Captcha must stay **ON** for Jorgelina READY; restored ON at handover.  
- Money prove uses TAL-93900 + fresh 4242/0077 — not Linh / old PIs.  
- Design vanity `-demo` aliases via `talent_site_subdomain_lookup`, **not** `agency_domains` seed.  
- Auto usage limit: spawn with `composer-2.5-fast` when Auto dead.  
- Coordinator implemented #2538 after auth agents died with no PR.

### Needed from Oran

- Spend Limit / Auto usage.  
- Re-save `QA_PLATFORM_ADMIN_PASSWORD` without trailing newline.  
- Confirm Desk UX (dark HQ vs light mockups) after login works.  
- Stripe support email (#83) dashboard clicks.  
- Parked 8/9 disposition.

---

## H. LESSONS / guards

- **Host-only Desk cookies** vs parent-domain app sessions → always expire `.tulala.digital` auth shadows on Desk login paths.  
- **`next=` allow-list** must include `/desk` for `super_admin` or post-auth bounces to `/admin` → 404.  
- **OAuth callback must not force `getAppUrl()`** when already on Desk host.  
- **Undraft ⇒ Structural re-run** — never merge on draft-era green alone.  
- **Cloud secrets** require **new** VM after add/rotate.  
- **`deploy:smoke` CRON_SECRET** local miss is not a ship blocker when tip already greened.  
- **Never seed talent `-demo` into `agency_domains`** — breaks lookup.  
- Captcha OFF for QA must be **restored ON** before leaving.

---

## Branches this coordinator created

| Branch | Outcome |
|---|---|
| `cursor/support-desk-auth-58f5` | Open draft PR [#2538](https://github.com/orantene/impronta-app/pull/2538) |
| (children) `cursor/messages-inbox-audit-1958` | Open draft [#2537](https://github.com/orantene/impronta-app/pull/2537) — RED CI |
| (children) `cursor/maison-footer-placeholders-46e5` | Merged #2535 |
| (children) `cursor/demo-hosts-seed-verify-7eb0` | Merged #2534 |
| (children) `cursor/support-desk-test-ready-a5ba` | Merged #2536 |
| `status/done-board` | Never merge; handover docs pushed here |

Abandoned: none unique. Stash of desk files dropped (already on main).

---

## Outside git (critical)

### Vercel env (names only; no values)

- `SUPPORT_DESK_ENABLED` — production + preview — set `1` (authorized 2026-10-03); **not changed** this handover.  
- Stripe / CRON / impersonation QA keys present (see Vercel project). No env vars added/removed by this coordinator in this session.

### Supabase (project `pluhdapdnuiulvxmyspd` / Tulala Digital)

**Migrations applied (recent, already remote):**  
`20261231320000` support_desk_host · `20261231330000` presence · `20261231340000` reserve_desk_slug · `20261231342000` guest_captcha_enforced · `20261231343000` talent_demo_host_suffix · `20261231345000` design_demo_host_aliases (#2534)

**Manual SQL this handover:**  
- `UPDATE platform_settings SET guest_captcha_enforced=true` (was `false`) — 2026-10-04 18:51Z.

### Stripe test

- Soft Gel PAID path documented historically (`cs_test_…`, `/pay/98fy…`). No new Stripe objects created in this coordinator turn. Money agent unfinished.

### DNS / hosts

- `support.tulala.digital` seeded `agency_domains` kind=app.  
- Design vanity aliases via migration `20261231345000` (maison-v2 / folio / gridline → featured demos).  
- QA host pool `qa-1`…`qa-6` reserved.

### Cursor Cloud secrets (names)

- `QA_JOR_CLONE_PASSWORD`, `QA_PLATFORM_ADMIN_PASSWORD`, `QA_FREE_*`, `VERCEL_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET`, Stripe test keys — use **new** VMs after rotation.

### Feature flags (production)

| Flag | State | Notes |
|---|---|---|
| `SUPPORT_DESK_ENABLED` (Vercel) | **ON (`1`)** | Do not flip |
| `guest_captcha_enforced` (DB) | **ON (`true`)** | Was OFF; restored 2026-10-04 18:51Z |
| `TALENT_AGENDA_V2` / Messages v5 | default OFF | STATUS notes |

---

## Test data

| Entity | Id / account | Cleanup |
|---|---|---|
| Jor clone | TAL-93900 · `demo-jor-clone@impronta.test` | Keep for QA |
| Free Diego | TAL-QAFIXFREE · `qa-fixture-free-talent.tulala.digital` | Keep |
| Free Valeria | TAL-93901 · `valeria-unas.tulala.digital` | Keep |
| Fresh signup tip-prove | TAL-93937 · `qa-fresh-20261004-e@impronta.test` | Optional cleanup |
| Soft Gel draft/edit markers | offering edits Soft Gel QA17 | Optional restore title |
| Soft Gel paid inquiry | booking/pay ids in softgel docs | Test mode OK |
| **Jorgelina real** | TAL-JORGBEAUTY · `oranteneai@gmail.com` · `book-jorgelina.tulala.digital` | **No QA money** — READY for real use |

---

## Safety

- No mid-merge. Main not reddened by this coordinator.  
- Stash dropped (duplicate desk files).  
- No secrets in this folder.  
- Captcha ON verified after UPDATE.

---

## Continue checklist for next agent

1. Merge #2538 when green → tip-chase → Desk login Chrome prove.  
2. Fix #2537 messaging tests → merge.  
3. Confirm Vercel READY SHA == `origin/production` after promote; run `cd web && npm run deploy:smoke`.  
4. Money #45 + S5 on new VM.  
5. Keep `guest_captcha_enforced=true`.  
6. Update `plans/done-status/STATUS.md` on `status/done-board` only.
