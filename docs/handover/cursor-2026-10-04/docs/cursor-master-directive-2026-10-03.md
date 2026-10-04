# Cursor: master directive (2026-10-03)

This replaces earlier "how to work" instructions. Earlier briefs remain the SCOPE references:
- `CURSOR-NEXT-2026-10-02.md` (tracks)
- `TULALA-DONE-CHECKLIST-2026-10-02.md` (100 questions = finish line)
- `TULALA-QA-STORIES-2026-10-02.md` (14 test stories)
- `BUILT-VS-LIVE-AUDIT-2026-10-03.md` (hidden features + tracking)
- `PROD-HUMAN-QA-AND-FRONT-CHAT-2026-10-03.md` (human QA + front chat engine)
- `SUPPORT-DESK-CURSOR-2026-10-02.md` (parked until Oran reviews)

---

## 0. Feedback on your current plan (Production human QA + Front Chat)
Approved overall: good order, right gate, right limits (no MCP, Desk flag off, no new themes). Apply these changes.

### 0.1 Captcha (testing only)
- OK to keep `guest_captcha_enforced=false` for the paid QA runs (S4–S7).
- Add a to-do "re-enable captcha": turn it back ON and verify it live as soon as those runs finish, and in any case before Jorgelina's handover.
- Log the on/off times in STATUS.md.

### 0.2 Don't serialize
- Start the Part B inventory + capability matrix NOW, in parallel with the gate work. It's read-only (code + live screenshots).
- Only Part B IMPLEMENTATION waits for the gate.

### 0.3 Add the main milestone: "Jorgelina handover-ready"
Done means all of this:
- **Her live site matches the Maison v2 demo 1:1:** side-by-side screenshots, desktop + 390px.
- **Every section is filled with her content:** her photo, services with her images, gallery, FAQ, app, no empty bands or orphan headings.
- **Her account passes:** the builder and Website Settings A3 checklists are green on her account.
- **Clean handover state:** captcha ON, zero QA data on her account.

Then tell Oran "ready to hand over".

### 0.4 Part A speed
- Split the A3 surfaces over 2 read-heavy agents if faster (builder + settings / dashboard + public + money).
- Only one writer per file for fixes.
- Fix the CLASS of bug, sweep all talents and themes, then re-check live.

### 0.5 Evidence rule
- A STATUS row moves to ✅ only with a production screenshot (app.tulala.digital or the live talent site) + date.
- Localhost or "tests pass" = 🟡.

### 0.6 Front chat
- The capability matrix includes the AI assistant column honestly: what it really does today (quote, book, pay link, handoff).
- The decision memo comes to Oran BEFORE any deletes or big migrations.
- Small gap fixes (the PAID flip after payment, the `?order=` cold load) go ahead immediately.
- No skin may drop a capability: the static test (every skin × every capability) ships in the FIRST skins PR, not at the end.

### 0.7 Reporting
- Send one short update when the gate is tip-proved, when Jorgelina is handover-ready, and when the front-chat memo is posted.
- Otherwise keep working and keep STATUS / PM-BOARD current.

---

## 1. The goal
Tulala is not launched yet. The goal is a **fully working talent SaaS on production**: a talent can sign up from zero, onboard, pick and switch themes (Folio, Maison v2, Gridline), build their site, list services, get booked, chat with clients (human + AI assistant), get paid, and manage everything from the dashboard. Every feature we built must be live and visible, not hidden behind flags, cohorts or allow-lists.

**Jorgelina (TAL-JORGBEAUTY, book-jorgelina.tulala.digital, login oranteneai@gmail.com) is a REAL talent.** Oran is handing her the account in the next few days for real use and feedback, before we build more themes and apps.
- You may configure her account (settings, theme, services, content).
- NO fake bookings, test payments or QA data on her account. All paid and booking QA runs on TAL-93900.

After Jorgelina, Oran registers a brand-new talent from zero on production, and it must get the full experience with no manual help.

**Then the next phase:** more themes (authored in Builder Lab → Talent Factory, released through the theme-release system) and more apps (add-on features by trade, e.g. Nail Designer).

---

## 2. Your role
You are PM + lead engineer of Tulala. You own the plan, the board, the parallel tracks, the quality bar, the merges and the live proof. Oran sets direction; you make every engineering and execution decision yourself and report after.

**Only these go to Oran**, batched in ONE list at most once a day, while you keep working:
- money / fee rules
- legal
- deleting real customer data
- spending money
- turning on `SUPPORT_DESK_ENABLED` or MCP / external agent booking
- physical actions only he can do (captchas, his logins, dashboard clicks on accounts you can't access)

---

## 3. Continuous execution mode (permanent; overrides any habit of stopping)
You run continuously until the whole product is wrapped up. There is no "done for now" and no "waiting".

### The loop, forever
**a) FIND.** Run production checks:
- A3 human checklists, QA stories, the DONE checklist and FEATURES.md
- live persona walks (paid TAL-93900, Free Valeria, fresh sign-up, visitor/client, platform admin)
- Sentry, console and network errors, theme vs demo diffs

Every issue becomes a board item with a screenshot, in this format:
`[surface] [persona] [viewport] [lang]: did → saw → expected`

**b) FIX.** Take the highest-value item and fix the ROOT CAUSE for every talent and theme:
- Classify it: code / theme / talent data / demo.
- Run the gates, open the PR, merge through the merge lane.

**c) PROVE.** Verify LIVE on production with screenshots and update STATUS.md and FEATURES.md.

**d) LEARN.** After each bug, ask: where else can this same mistake exist? Sweep for it, then add a test or guard so it can't come back. Keep a running `docs/plans/LESSONS.md` (bug pattern → where else it was found → guard added).

**e) REPEAT.**
- Self-wake every 15 minutes (or at the end of every task).
- Each wake: check CI and PRs, merge the next green PR in the lane, re-read the board, pull REPLIES.md, update STATUS.md, take the next item.

### Never idle
If the board is empty, GENERATE work:
- a fresh persona walk
- compare every theme against its demo
- edge data (empty / long / 40-character names / ES)
- 390px passes
- performance and accessibility
- copy and design polish to the slick-minimal standard
- dead-code cleanup
- missing tests

### Blocked
- If a step is blocked, take the next item.
- Never stop on "waiting for CI", "waiting for Oran" or "waiting for merge".

### Stop conditions
None, except:
- a red main: fix it first
- a production incident: fix it, then tell Oran

### Finish line
- every DONE-checklist question ✅ live (except Oran's ⏸ items)
- Jorgelina handed over with no open issues
- a fresh sign-up proven end to end
- every feature in FEATURES.md live and verified
- `deploy:smoke` + flag health green

Then post "PRODUCT WRAPPED" with all evidence links, and propose the next phase (more themes + apps, Support Desk, deferred payments).

---

## 4. Current to-do order
1. Land and tip-prove: Maison v2 hydration fix for all talents, #2510 Edit site, #2509 captcha (testing).
2. **[parallel, start now]** Front-chat `docs/plans/front-chat/00-inventory.md` + capability matrix (read-only).
3. **Jorgelina handover-ready** (milestone 0.3).
4. Part A production human QA (A3 checklists) with evidence → `docs/human-qa/A3-checklist-results.md` + `media/human-qa/`.
5. Paid QA S4–S7 on TAL-93900 → then **re-enable captcha + verify live**.
6. Built-vs-Live audit finished: every finished feature ON, FEATURES.md + LAUNCH-VIEW.md for Oran.
7. Front-chat decision memo to Oran (base engine, gaps, ChatSkin contract, PR list).
8. Front chat: fill gaps (PAID flip, `?order=` cold load first) → skins (Maison v2, Folio, Gridline, default) with the skin × capability test → AI assistant inside the engine → live proof per theme, with and without AI.
9. Theme release chain proven live: author/release in Talent Factory → TAL-93900 sees ThemeUpdateNotice → preview → upgrade keeps content → demos get it.
10. Fresh sign-up from zero, end to end on production.
11. Continuous loop (section 3) until the finish line.

---

## 5. Knowledge you must keep in mind

### Theme system (already built, learn it before adding)
- **Builder Lab → Talent Factory** (`web/src/components/builder-lab/talent-factory/*`): where talent themes are authored. It is separate from agency starters; never mix the two.
- **Theme catalog + sync** (`web/src/lib/talent-site/theme-catalog/*`).
- **Releases** (`web/src/lib/talent-site/theme-releases/*`):
  - `release-manager.server.ts`: publishes a new theme version
  - `merge-site.server.ts`: merges it into a talent's site, keeping content and overrides
  - `lazy-fan-out.server.ts`: rolls it out to talents on demand
  - `offer-actionable.server.ts`: decides when a talent is offered the update
- **ThemeUpdateNotice:** the "new version available" notice on Presence and in the builder.
- **Theme apply** (`web/src/lib/talent-site/server/theme-apply-core.ts`):
  - Hydration fills the design ONCE from the profile.
  - A failed profile load must be a hard error, never a silent `fallbackHydrationTokens` + `pruneEmptyHydratedNodes` (this caused Jor's missing photo, FAQ, app and empty bands).
  - Photo, services, gallery, FAQ and apps should be live bindings, with a "Refresh from my profile" action.
- **Designs are editable defaults:** every font, size, colour and shape is overridable in the builder.
- **Planned next (not built):** Talent Theme Studio (edit a theme visually vs its mockup, then release).

### Apps
- Add-on features a talent switches on, grouped by trade.
- Found in the Apps tab (suggested + all) and through a gallery badge.
- Nail Designer is the first app, ported 1:1 from Oran's design, never redrawn.
- Apps ↔ templates link both ways; no dead ends. Premium apps come later.

### Front chat
- ONE engine with every capability; themes only provide a ChatSkin.
- Settings (booking mode, AI on/off, payments, languages) drive behavior; themes only style.

### Flags
- `TALENT_STUDIO_V2=1` is now in prod.
- No flag may default ON in development and OFF in prod: remove NODE_ENV defaults and add the static guard.
- Add `/api/health/flags` (admin-only) + a `deploy:smoke` check of expected prod values.

---

## 6. Rules (unchanged)
### Git and gates
- Worktrees off the latest `origin/main`; one PR per change; merge lane ONE at a time (wait for main green + production pointer).
- Never push main or production, never force-push, never admin-merge past red.
- Gates: `npm run gates` (or typecheck with `NODE_OPTIONS=--max-old-space-size=11264` + lint) + the touched lanes. Check real exit codes. File-size budgets: extract, never raise.

### Database
- **Migrations:** additive only, versioned after the newest file, applied before merge, objects verified with a select.
- **localhost and production share ONE database.** Test accounts only: TAL-93900, Valeria TAL-93901, `qa-*@impronta.test`, new `@impronta.test` guests. Clean up test data.

### Secrets and payments
- Secrets never in chat, logs or commits. Stripe TEST keys only (`sk_test_`).
- Cloud secrets: STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_JOR_CLONE_PASSWORD.
- The service-role key stays Mac-only.
- **TAL-93900 Stripe test account is KYC-complete** (`acct_1UMWx66rgXLXa1cy`, charges + payouts enabled).

### Copy and design
- EN + ES (Mexican, tú), no em dashes, design tokens only.
- Mobile 390px first.
- Slick-minimal: icons + flow, ⓘ tooltips, one primary action, no heavy black blocks.

### Processes
- Kill only processes you started (by PID). Never start the MCP / AI booking server. Don't drive Oran's Mac browser unless he asks.

### Accounts
QA accounts are in `/Users/oranpersonal/Desktop/impronta-app/web/.env.local` (`QA_*`):

| Account | Login |
|---|---|
| Main paid QA talent (TAL-93900) | `demo-jor-clone@impronta.test` |
| Free plan (Valeria) | `qa-talent-free@impronta.test` |
| Agenda talent | `qa-agenda-jor@impronta.test` |
| Fresh sign-up | `qa-fresh-20260930@impronta.test` |
| Platform admin | `qa-platform-admin@impronta.test` |
| Jorgelina (real talent) | `oranteneai@gmail.com`: configure only, no QA data |

Demo talents share `DEMO_PASSWORD`, which is not stored locally; prefer one-time login links.

---

## 7. Reporting
### Status file
- Branch `status/done-board` (never merged, no PR), file `docs/plans/done-status/STATUS.md`, updated on every 15-minute wake.
- Oran and Claude reply in `REPLIES.md` on the same branch; read it every wake and act on it.

### Updates to Oran
- **Short:** what shipped live (with links), what's next, the scoreboard (✅/🟡/❌/⏸), the ONE batched ask list.
- **Only at milestones** (gate proved, Jorgelina ready, memo posted) or once a day.
- **Honest:** red is red, a guess is labelled a guess, a skipped check is said out loud.
