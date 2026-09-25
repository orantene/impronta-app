# Finish proofs — audit + execution plan (25 Sep 2026)

Cited against live refs at plan write:

| Ref | Sha | Note |
|---|---|---|
| `origin/main` | `b2e348168` | Merge #2249 (pending close-out report) |
| `origin/production` | `4841fef06` | **POINTER_PENDING** — CI structural/admin/fidelity still `in_progress` on tip; promote must fast-forward only after green. Do not hand-push. |

Evidence folders on `main`: `web/e2e/qa-program/evidence/2026-09-24-finish/`, `…/2026-09-25-leftover/`, `…/2026-09-25-pending/`.

Standing constraints unchanged: worktree off `origin/main`; no force-push / hand-move of `production`; merge only green+CLEAN; QA host `staging-qa-journeys` / Supabase `fxlankepwnvelxjrahwk`; no production keys for journeys Playwright; no MiniChatPanel / Jorgelina / Impronta / El Paisa restyle; no D-MSG-423 unless a new product defect is opened deliberately.

---

## 1. Audit verdict

Most of the finish-proofs lane is **closed with evidence**. What remains is a small set of **env / product / hygiene** items — not a long unproven matrix.

| Lane | Verdict |
|---|---|
| Guest ask on vanity (Task 1) | Proven |
| Live money cards 1–4 (wire deposit, cash confirm ×2, eccf diagnosis) | Proven |
| Hostile quick + $99,999 + 30 lines | Proven |
| Vocab restaurant / salon, reload-resume, tampered link | Proven |
| Talent seven (money split, Approve/Decline, refusals, publish, request-only) | Proven (late pass) |
| Capacity event door + appointment double-book (sequential) | Proven |
| Stripe 4242 + refund | **Blocked** (host livemode) |
| Concurrent race | **Product** (D-MSG-312 / follow-ups) |
| Ask-in-place `#talent-ask` | **Partial / product** |
| Report hygiene on `main` | **Gap** (duplicate close-out section) |

---

## 2. Gaps found in the work so far

### 2.1 Report / process hygiene (fix this lane)

1. **Duplicate section on `main`.** `FINISH-REPORT-2026-09-24.md` contains **two** copies of “Finish proofs pending close-out (25 Sep, late)” (lines ~339 and ~382 on tip). One must be deleted; keep a single Still-open list.
2. **Shared checkout drift.** Local `fix/agenda-smoke-auth-reuse` (and some agent checkouts) still end at the leftover section and lack `2026-09-25-pending/` on disk. Anyone auditing from a non-tip branch will re-open closed items. Prefer `git show origin/main:…` or a worktree on tip.
3. **Stale “Still not proven” blocks earlier in the same file** (Round 5 / leftover) still list talent + capacity as open. Readers skimming mid-file get a false red. Add a one-line banner at the top of the report: “Canonical open list = § Still open at end of pending close-out” — or strike through superseded lists.
4. **Label drift in proofs.** Specs/docs say “Accept”; UI is **Approve** (`data-talent-approve`). Agents wasted a pass searching for Accept. Pin the label in harness comments / talent POV checks.

### 2.2 Env / harness gaps (block Stripe + some specs)

1. **No QA service-role key on disk** in `.env.capacity-isolated.local`. MCP SQL closed many proofs; Playwright specs that seed/assert via SRK still skip (`permissions-money`, parts of capacity). Decision: either document “MCP-allowed substitute” per proof, or put a **gitignored** QA SRK in the capacity-isolated file (never commit; never source production `.env.local` into journeys runs).
2. **Stripe path split is confusing and partly stale:**
   - D-MSG-313: journeys mints `provider=mock` without host `STRIPE_SECRET_KEY`.
   - D-MSG-418: claimed test keys on Preview for `program/journeys-2026-09` — later runs still saw mock mint / or R2 `cs_live_`.
   - Reality after leftover pass: **`qa-stripe-r2` mints `cs_live_`** (D-MSG-330). Local `sk_test_` does not change the host.
   - Spec only covers **full** refund; “partial refund” was asked in briefs but never in `stripe-pay-refund.spec.ts`.
3. **R2 catalog empty** hung a “fresh offer” Stripe path (“No items yet”). Existing accepted-offer inquiry worked around it — fragile for a clean re-run.

### 2.3 Proof quality / partials (not failures, but weak)

1. **Group silence** — stream `$` check false on one multi-participant thread; no dedicated Group tab. Treat as soft-proven or add an explicit group fixture + assertion.
2. **Permissions money** — nomoney staff Refund door count 0 (screenshot); full Playwright seed path still skipped without disk QA SRK.
3. **Table overbook via Messages Items** — Tables chip absent when pool full (good signal); storefront reserve path still wants SRK for the full spec. Table-as-line writer seam (D-MSG-157) is separate product work.
4. **Ask in place** — guest dock on `/t/QA-JNY-T1` without navigation; `#talent-ask` count was 0. Per talent-integration-log, missing anchors fall back to a bridge bar — need to prove that fallback (or publish a tree that includes `#talent-ask`).
5. **Concurrent TOCTOU** — sequential double-book loser is proven; concurrent both-win is D-MSG-312 / D-MSG-340 territory. Finish lane correctly stopped; do not re-claim “race proven” until a concurrent harness exists and passes.

### 2.4 Out of scope (do not reopen unless asked)

`proxy.ts`, CI 50% profile, `services_catalog` on Jorgelina, attachments / notes / talent-started threads, free-plan booking eligibility, #2202 / #2127, frozen `$700` without ≈ US$, MiniChatPanel restyle, Impronta content edits.

---

## 3. Suggestions to improve (before more proofs)

| # | Suggestion | Why |
|---|---|---|
| A | Single canonical “open list” at bottom of FINISH-REPORT; deprecate mid-file lists | Stops false reopen |
| B | Deduplicate pending close-out section on tip | Hygiene / CLEAN docs PR |
| C | Write `docs/.../STRIPE-UNBLOCK.md` (or one section) with exact Vercel project, env var names, host, and “do not 4242 live” | Next agent will not rediscover D-MSG-330 |
| D | Extend `stripe-pay-refund.spec.ts` with a **partial** refund case *after* full path is green | Matches original brief |
| E | Seed R2 menu / one published offering so mint does not depend on a lucky inquiry | Stable Stripe re-run |
| F | Add `data-talent-approve` (already present) to harness docs; ban “Accept” in new checks | Saves agent time |
| G | Optional: gitignored QA SRK in capacity-isolated env so isolation/capacity specs stop skipping | Closes “partial” permissions / table paths |
| H | Ask-in-place: either assert bridge fallback bar, or publish fixture site with `#talent-ask` | Closes soft gap without product change |
| I | Race: only after product owner prioritizes D-MSG-312 concurrent harness | Avoids pretend-proof |

---

## 4. Full execution plan — remaining work

Ordered by dependency. Each step has exit criteria. Do not start Stripe card fill until Step 2 exit is green.

### Phase 0 — Pointer + report hygiene (no product risk)

| Step | Action | Owner | Exit |
|---|---|---|---|
| 0.1 | Watch CI on `b2e348168` (structural + admin boot + fidelity). On green, confirm `promote-production.yml` advances `origin/production` to tip. **Never** `git push origin origin/main:production` unless workflow is down and CI already green on that SHA. | Agent watch | `git merge-base --is-ancestor origin/main origin/production` = 0; smoke optional after alias |
| 0.2 | Worktree off tip; dedupe FINISH-REPORT pending section; add top “canonical open list” pointer; PR docs-only CLEAN; merge. | Agent | One close-out section; open list matches §4 Phase 1–3 |
| 0.3 | Confirm evidence `2026-09-25-pending/` is on `main` (already is); if a worktree lacks it, sync from tip — do not re-run proven talent/capacity proofs. | Agent | Folder present in audit worktree |

### Phase 1 — Stripe unblock + prove (blocked on human/env)

| Step | Action | Owner | Exit |
|---|---|---|---|
| 1.1 | **`qa-stripe-r2` is aliased to production** and inherits production `STRIPE_SECRET_KEY` (env comment: livemode / D-MSG-330). **Do not** replace production live keys with `sk_test_`. Prefer: (a) a Vercel custom environment scoped to that host with `sk_test_`/`pk_test_`, or (b) a Preview deploy with journeys-branch test keys (already present for `program/journeys-2026-09`) temporarily aliased to R2 for the proof only. Explicit human approval required before any env write. | Human | Host mint returns `cs_test_` (not `cs_live_`) |
| 1.2 | Optional but recommended: ensure R2 tenant has at least one Menu/Services row so a fresh-offer mint does not hang on “No items yet”. | Agent via QA MCP / fixture | Catalog non-empty on R2 Messages Items |
| 1.3 | Re-run `web/e2e/qa-program/admin/stripe-pay-refund.spec.ts` with `QA_ALLOW_AGENT_PROD_HOST=1`, production URL/SRK/anon only for `signInAgentOwnedHost` cookies (not for journeys content). | Agent | 4242 → Paid surfaces → **full** refund → unpaid/refunded header; screenshots under a new evidence day folder |
| 1.4 | (After 1.3) Add partial-refund case to the same spec (or sibling); run once. | Agent | Partial refund asserted in UI + DB |
| 1.5 | Append FINISH-REPORT: Stripe proven; remove from Still open. | Agent | Report updated; docs PR |

**Stop condition:** If mint is still `cs_live_`, abort before 4242 (D-MSG-330). Log host env, do not invent workarounds through live Checkout.

### Phase 2 — Soft proof closures (optional, same constraints)

| Step | Action | Exit |
|---|---|---|
| 2.1 Ask-in-place | **Done (hygiene):** Message CTA opens guest dock on `/t/QA-JNY-T1` same URL; `#talent-ask` still 0 on fixture. Evidence `2026-09-25-hygiene/`. Optional later: publish tree with `#talent-ask` if product wants that anchor. | Proven via Message CTA |
| 2.2 Group silence | Open a true multi-talent / group fixture; assert no client-total / dollar amounts in talent stream where policy requires silence. | Screenshot; mark proven or partial with reason |
| 2.3 Permissions money | Prefer re-run `isolation/permissions-money.spec.ts` with disk QA SRK **or** accept leftover screenshot as proof and note “Playwright skip closed by MCP+UI”. | Spec green or report promotes partial → proven |
| 2.4 Table overbook | Re-run `capacity/table-overbook.spec.ts` with QA SRK **or** document Items-chip-absent + MCP pool-full as sufficient for finish CLEAN. | Spec green or accepted substitute |

### Phase 3 — Product backlog (not finish-proofs CLEAN)

Only if prioritized outside this lane:

| Item | Defect / note | Work |
|---|---|---|
| Concurrent confirm race | D-MSG-312 / D-MSG-340 follow-through | Concurrent harness + lock/recheck-inside-RPC if still red |
| Table pick → hold writer | D-MSG-157 | Wire `reserve.ts` from table choice card |
| Journeys real Stripe vs mock | D-MSG-313 vs D-MSG-418 drift | Reconcile decisions: either journeys stays mock-by-design, or Preview test keys must mint `provider=stripe` and decision log updated |
| Deposit sheet vs zero deposit config | Noted in finish 1–12 | Product: hide Deposit / Other-as-deposit when `deposit_amount_cents` / pct are 0 |

### Phase 4 — Definition of done for this finish lane

CLEAN when **all** are true:

1. Pointer: `origin/production` contains tip that includes #2249 (or later docs hygiene), advanced by promote workflow only.
2. FINISH-REPORT has **one** open list; Stripe either **proven** (Phase 1) or **explicitly deferred** with D-MSG-330 + named unblock owner.
3. No open “must prove” items from the original 1–12 except deferred Stripe / Phase 3 product.
4. No production content edits; no hand pointer push; no 4242 against live.

---

## 5. What is left to do — short checklist

**Do now (agent, no env change)**  
- [ ] 0.1 Watch CI → confirm promote on `b2e348168`  
- [ ] 0.2 Deduplicate FINISH-REPORT; canonical open list; docs PR  

**Blocked on you (env)**  
- [ ] 1.1 Put `sk_test_` / `pk_test_` on `qa-stripe-r2` Vercel env  

**Then agent**  
- [ ] 1.2–1.5 Stripe full (+ optional partial) + report  
- [ ] 2.1–2.4 Soft closures if you want them in CLEAN  

**Backlog only**  
- [ ] Phase 3 product items (race, table hold, journeys Stripe decision, deposit UX)

---

## 6. Explicit non-goals for the next pass

- Re-proving talent Approve, hub money, refusals, publish, event door, appointment sequential double-book.
- Editing Jorgelina / Impronta / El Paisa / MiniChatPanel.
- Hand-moving `production`.
- Opening D-MSG-423 unless a new defect is found during Phase 1–2.

# stripe test-key preview branch (D-MSG-330 unblock)
