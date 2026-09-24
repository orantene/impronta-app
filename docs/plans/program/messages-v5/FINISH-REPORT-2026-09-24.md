# Finish report — talent and workspace dashboards

Date: 2026-09-24. Measurements re-read at write time.

## 1. Part 1 PRs

| PR | End state |
|---|---|
| #2197 | Already merged (`20f77f42a`). |
| #2215 | Already merged (`b498ce1af`). |
| #2217 | Merged `be9372e14`. Required checks green. Talent-website j1/j2/j3 failed (builder specs, not currency). Pointer: `origin/production` later included `be9372e14`. Smoke HTTP path green; local smoke also failed migration-drift because the worktree had no `.env.local`. `/get-started` 307 accepted. |
| #2214 | Merged `5ee061c44`. Rebased after #2217. `profile-view.tsx` 2651 / 2671. Three revert-proof cases in `services-menu-for-host.test.ts`: USD kept, MXN kept, blank/unknown stripped. Pointer after this merge had not yet advanced at last fetch (`origin/production` was `2834bc547`). |
| #2202 | Left open. Shared checkout is a live Jor Beauty session on `feat/maison-jorg-beauty`. |
| #2127 | Rebased onto `5ee061c44`. Extracted `AdminChromeAlerts` and stale copy into the rail extract. Line counts at extract: `admin-shell-client.tsx` 2185 / 2185, `dashboard-i18n.ts` 3609 / 3609. Local commit `e37cf50bd`, not merged (waiting on the #2214 pointer). |
| #1994 | Closed. One rebase onto current main conflicted across builder image/stock files the queue already landed. |
| #2218 | Merged during this window (`4a320e4e3` / `28b4e61f2`). Dock brand and trade voice. Not in the original queue; recorded because it owns the dock identity files. |

## 2. Free-plan services

Worktree `fix/free-plan-services-public` is prepared off an earlier main. It was not merged. This change does not affect Jorgelina (`talent_plan_key` is `talent_portfolio`).

## 3. Jorgelina

Read on production DB and `https://book-jorgelina.tulala.digital/`:

- `talent_plan_key`: `talent_portfolio` (cause 2 out).
- Offerings: 22 published, MXN (cause 1 out).
- After #2217 on production: the Servicios region lists the 22 titles with peso prices (`$700`, `$800`, …). Heading copy: “Todos los precios en pesos mexicanos (MXN). Se paga en el estudio.”
- `html lang="en"` still. Preferred locale `es` is unread until the locale PR ships.
- No `≈ US$` line on the vanity host. #2217 wires `usdRates` on `/t/` profile-view, TalentStorefront, and Maison when that layout is fed `usdRates`. The vanity-site render path does not call `loadUsdRates`. Named `D-MSG-421` below.
- Cause 3 was a stale empty-list read. Rows render. Remaining gaps are locale, US$ on the vanity host, and dock locale.

Guest inquiry: not sent. Owner must approve a message from her public site.

## 4. Talent dashboard (5.1–5.5)

### 5.1

1. Agency sale vs hub sale money split: not proven. QA fixture login was not run in this session.
2. Group thread silence: not proven. Same reason.
3. `TalentDecisionBar`: not proven.
4. Ask in place: not proven.
5. Request-only confirmation copy: not proven.

### 5.2

Refusals: not proven as live clicks. Buttons were not hidden in code review of the talent inbox; sentences were not captured.

### 5.3

QA publish path: not proven. #2198 / #2205 were not re-opened. No writes to Jorgelina’s site.

### 5.4

Vercel Preview for `program/journeys-2026-09` has env keys `TALENT_FREE_WEBSITE_ENABLED`, `TALENT_SITE_SUBDOMAINS_ENABLED`, and `TALENT_THEME_GALLERY_ENABLED`. Values were not decrypted. Presence of the keys is the confirmation that the preview scope exists. Production values were not used as a gate.

### 5.5

- Attachments: leave as a later Messages job. Estimate 3–5 days if the existing guest upload path is reused; do not invent a second writer.
- Internal notes: talent-only, not client-visible. Estimate 2 days. Recommendation: wait until the inbox decision bar is proven.
- Start conversation (staff-initiated): estimate 2 days. Recommendation: keep guest-originated ask as the only mint until the owner answers the inquiry question.

## 5. Workspace dashboard

### 6.1 Stripe

D-MSG-418 on this repo: production stays livemode; `pk_test_` is on Preview branch `program/journeys-2026-09` only. Homepage JS on `app.tulala.digital` does not inline the publishable key (PayNowSheet is not on that route). Stop: no card number on production. Unblock is the journeys preview (`staging-qa-journeys.tulala.digital`) with `pk_test_`.

Pay / refund / partial: not run.

### 6.2

Capacity, race, permissions, isolation, tokens, reload, restaurant vs services vocabulary, hostile data: not proven. No fixture `/get-started` business was created on production.

## 6. New D-MSG-42x

- **D-MSG-420** · `web/src/i18n/request-locale.ts` on `fix/talent-site-preferred-locale` (not yet on `origin/main`). Vanity host without a locale prefix uses `talent_profiles.preferred_locale`. One close control: launcher pill hidden while the panel is open.
- **D-MSG-421** · Talent vanity site does not load USD rates. After #2217, `book-jorgelina.tulala.digital` shows MXN amounts and no `≈ US$` line. The missing call is on the talent-site render path, not `profile-view.tsx`. File to start from after this branch is on main: `web/src/app/t/[profileCode]/_shared/TalentStorefront.tsx` (has the load) vs `web/src/app/%5Ftalent-site/` (does not).

## 7. Owner decisions

1. Guest inquiry on Jorgelina’s public site: send a real ask so we can prove `/talent/inbox` and the platform-origin client link, or skip. Recommendation: send one short Spanish ask once the owner says yes.
2. Attachments / notes / staff-start conversation: see 5.5. Recommendation: do not build them in this lane.
3. Production Stripe: keep livemode. Use the journeys preview for 4242.

## 8. Not proven

- Guest inquiry landing in her inbox (waiting on the owner).
- `≈ US$` on the vanity host (D-MSG-421).
- `html lang` Spanish on her site (locale PR not merged).
- Talent proofs 5.1–5.3 as screenshots.
- Production pay / refund / partial (livemode stop).
- Workspace 6.2 fixture walk.
- Free-plan PR merge.
- #2127 merge and #2202.
- Dock design PR B (no dark green / black). Identity PR A for brand/trade is #2218 on main; locale + one close is local on `fix/talent-site-preferred-locale`.
