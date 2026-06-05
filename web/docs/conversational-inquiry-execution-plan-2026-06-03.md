# Conversational Inquiry — Multi-Agent Execution Plan (MVP)

**Date:** 2026-06-03
**Companion to:** `conversational-inquiry-strategy-2026-06-03.md` + `conversational-inquiry-deep-dives-2026-06-03.md`
**Status:** PLAN ONLY — no code until explicitly greenlit. This describes *how* I'd build the
talent-profile MVP (Part A of the deep-dives) as a coordinated, mostly-automated multi-agent run.

> Scope of this run = the **talent-profile conversational-starter MVP** + the **anti-abuse floor**
> (the two existential-risk pieces). It deliberately stops at a green PR + live QA on a seeded
> host; the production merge is your call.

---

## 1. Operating model — how "one non-stop process" actually works

The engine is a **Workflow** (deterministic orchestration script) that fans agents out across
**isolated git worktrees**, lets each lane **self-gate** (`tsc --noEmit` + `lint` before it
reports success), then funnels everything through **integration → adversarial verification →
live QA**. I (the main loop) manage the seams between waves and own the few human-judgment calls.

Five mechanics make it safe and fast:

1. **Contracts-first.** A single Opus agent writes the shared interface contract (action
   signatures, message/guest-session shapes, component props) *before* any lane starts. Every
   downstream lane codes against that contract, which is what lets them run in parallel without
   stepping on each other.
2. **Worktree isolation.** Each parallel lane gets its own `git worktree` (the Workflow
   `isolation:'worktree'` option), so concurrent file edits never collide. Worktrees auto-clean
   if untouched.
3. **Self-gating lanes.** Every implementation agent runs `npx tsc --noEmit` (with
   `NODE_OPTIONS=--max-old-space-size=8192` — local tsc OOMs otherwise) + `npm run lint` *inside
   its worktree* and only reports success if green. A red gate is returned as a failure for that
   lane, not silently merged.
4. **Structured hand-offs.** Lanes return typed JSON (schema-validated) — branch name, files
   touched, migration filename, gate status, follow-ups — so integration is mechanical, not
   guesswork.
5. **Adversarial verification before trust.** Security/abuse-sensitive work is re-checked by
   independent Opus skeptics prompted to *break* it (guest-ownership bypass, claim hijack, spam
   floor evasion). Majority-refute kills a change before it reaches QA.

**Honest seam:** fully autonomous code-gen + parallel worktrees + integration is powerful but has
real failure modes (merge conflicts, migration-timestamp collisions, subtly-wrong code, and live
money/RLS behavior an agent can't fully self-verify). The plan handles these with explicit
integration + verify + live-QA waves and **named human checkpoints** (§7) rather than pretending
they don't exist.

---

## 2. Model & effort policy (the rubric behind every assignment)

| Tier | Model | When | Effort |
|---|---|---|---|
| **Architecture / security / money-adjacent / UX-critical / integration / verification** | **Opus 4.8** (`claude-opus-4-8`) | Wrong = expensive or unsafe; needs cross-file judgment | high → max reasoning |
| **Well-scoped implementation against a clear contract** | **Sonnet 4.6** (`claude-sonnet-4-6`) | Bounded job, contract given, low ambiguity | medium reasoning |
| **Mechanical / trivial glue / lists / copy** | **Haiku 4.5** (`claude-haiku-4-5`) | Near-deterministic, cheap | low reasoning |

Principle: **spend Opus where being wrong costs the most** (guest-ownership/RLS, the secure
claim, the mini-chat UX, integration, the adversarial pass). **Use Sonnet for the bulk of the
implementation** once contracts are fixed. **Haiku only for truly mechanical work.**

---

## 3. Work breakdown (every job: model · effort · deps · worktree · gate)

### Wave 0 — Contracts (sequential, blocks everything)
| ID | Job | Files | Model | Effort | Deps | WT |
|---|---|---|---|---|---|---|
| **C0** | Shared contract: action signatures (`sendGuestMessageAction`, `getGuestThreadMessages`, `startGuestChatInquiry`), guest-message/session shapes, mini-chat props, trust-chip props, migration column names | new `web/docs/_contracts/guest-chat.md` + shared TS types | Opus 4.8 | high | — | none (design) |

### Wave 1 — Five parallel lanes (worktree-isolated; jobs pipeline *within* a lane)
**Lane A — Backend (WT-A)**
| ID | Job | Files | Model | Effort | Deps |
|---|---|---|---|---|---|
| M1 | Migration: `guest_session_id` on `inquiry_messages` (+ index) | 1 migration | Opus 4.8 | high | C0 |
| B1 | Engine guest-sender branch in `sendMessage` + guest path in `validateActorPermission` | `inquiry-engine-messages.ts`, `inquiry-permissions.ts` | Opus 4.8 | high | M1 |
| B2 | `sendGuestMessageAction` + `getGuestThreadMessages` (service-role, ownership-checked) | new actions file | Sonnet 4.6 | medium | B1 |
| B3 | `startGuestChatInquiry` (wraps `createInquiryFromIntent` + `ensureGuestClientByEmail`) | new action | Sonnet 4.6 | medium | C0 |
| B4 | Extend `merge_guest_session_to_client` for inquiries + email-verified claim wiring | migration + merge action | Opus 4.8 | high (security) | M1 |

**Lane B — Anti-abuse infra (WT-B)**
| ID | Job | Files | Model | Effort | Deps |
|---|---|---|---|---|---|
| S1 | KV-backed shared rate limiter (Vercel KV/Upstash), swap-in for guest create+send | new lib + callers | Sonnet 4.6 | medium | C0 + KV decision (§7) |
| S2 | Disposable-email denylist + wire to the email gate | new lib | Haiku 4.5 | low | C0 |
| S3 | Velocity gate → Turnstile challenge (infra exists for CMS forms) | actions + panel hook | Sonnet 4.6 | medium | S1 |

**Lane C — Recipient safety (WT-C)**
| ID | Job | Files | Model | Effort | Deps |
|---|---|---|---|---|---|
| S4 | `user_blocks` + `inquiry_reports` migration + send/create enforcement hooks | migration + hooks | Opus 4.8 (migration) / Sonnet (hooks) | medium | C0 |

**Lane D — Mini-chat UI (WT-D)**
| ID | Job | Files | Model | Effort | Deps |
|---|---|---|---|---|---|
| F1 | `TalentProfileChatLauncher` (floating, brand-skinned from `agency_branding.theme_json`) | new component + page wire on `/t/[profileCode]` | Sonnet 4.6 | medium | C0 |
| F2 | `MiniChatPanel` (opener · message list · composer · inline email gate · poll · instant ack) | new component | **Opus 4.8** | high (UX-critical) | C0 (codes to B2/B3 contract) |

**Lane E — Trust chip + honest presence (WT-E)**
| ID | Job | Files | Model | Effort | Deps |
|---|---|---|---|---|---|
| F3 | Trust chip v1 in talent thread (reuse `TrustBadge`/`TrustSummary`) | thread component | Sonnet 4.6 | low-med | C0 |
| P1 | "Typically replies in ~X" — median first-response from `inquiry_messages` timestamps | new lib + display | Sonnet 4.6 | medium | C0 |
| P2 | Honest dynamic auto-ack copy + email-a-copy magic link | ack path + email template | Sonnet 4.6 | low | P1 |

### Wave 2 — Integration (barrier; main-loop-supervised)
| ID | Job | Model | Effort | Deps |
|---|---|---|---|---|
| **I1** | Merge all lane branches in dependency order; resolve conflicts; **assign 3 distinct migration timestamps** (M1, B4, S4) via `date -u +%Y%m%d%H%M%S`, park-restore on collision; `npm run db:push`; full `tsc`+`lint`+`test` gate | Opus 4.8 | high | all Wave-1 |

### Wave 3 — Adversarial verification (parallel, read-only)
| ID | Job | Model | Effort | Deps |
|---|---|---|---|---|
| **V1** | 3 perspective-diverse Opus skeptics: (a) guest-ownership bypass / cross-session read, (b) claim hijack / shared-device merge, (c) money-adjacent + RLS leak. Majority-refute → block | Opus 4.8 ×3 | high | I1 |
| **V2** | Spam-floor break attempt: rate-limit evasion, disposable bypass, velocity, block circumvention | Opus 4.8 / Sonnet | high | I1 |

### Wave 4 — Live QA (sequential; fix-loop if red)
| ID | Job | Model | Effort | Deps |
|---|---|---|---|---|
| **Q1** | Seeded-host QA: drive a real guest inquiry+message → confirm it lands in the talent shell with a trust chip → reply flows back to the popup → claim-on-signup merges → spam throttle fires. Fix-loop spawns targeted Sonnet agents on any red | Opus 4.8 | high | I1 + V passed |

---

## 4. Dependency DAG (what runs concurrently)

```
Wave 0:  [C0 Contracts]                                  (Opus, sequential)
              │
              ▼
Wave 1:  ┌────────────┬────────────┬──────────┬───────────┬──────────────┐
         │  Lane A     │  Lane B    │ Lane C   │  Lane D   │  Lane E      │   (5 worktrees,
         │ M1→B1→B2    │ S1→S2→S3   │   S4     │  F1, F2   │ F3, P1→P2    │    parallel,
         │ B3, B4      │            │          │           │              │    self-gating)
         └────────────┴────────────┴──────────┴───────────┴──────────────┘
              │
              ▼
Wave 2:  [I1 Integration + migrations db:push + full gate]   (Opus, barrier)
              │
              ▼
Wave 3:  [V1 ×3 security skeptics] ‖ [V2 spam-break]         (Opus, parallel verify)
              │   (majority-refute → loop back to a targeted fix)
              ▼
Wave 4:  [Q1 live seeded-host QA] → fix-loop → green PR      (Opus + Sonnet fixers)
```

Concurrency stays within the ~16-agent workflow cap (5 lanes, ≤3 active sub-agents each).

---

## 5. The orchestration script (shape, illustrative — not the final code)

```js
export const meta = {
  name: 'guest-chat-mvp',
  description: 'Build the talent-profile conversational-inquiry MVP across isolated lanes',
  phases: [
    { title: 'Contracts' }, { title: 'Build' }, { title: 'Integrate' },
    { title: 'Verify' }, { title: 'QA' },
  ],
}

phase('Contracts')
const contract = await agent(C0_PROMPT, { model: 'opus', schema: CONTRACT_SCHEMA })

phase('Build')                                   // 5 lanes in parallel, each its own worktree
const lanes = await parallel([
  () => laneA(contract),   // M1→B1(opus)→B2(sonnet)→B3(sonnet)→B4(opus), worktree
  () => laneB(contract),   // S1(sonnet)→S2(haiku)→S3(sonnet), worktree
  () => laneC(contract),   // S4(opus migration + sonnet hooks), worktree
  () => laneD(contract),   // F1(sonnet), F2(opus), worktree
  () => laneE(contract),   // F3(sonnet), P1(sonnet)→P2(sonnet), worktree
])                          // each lane self-gates tsc+lint; returns {branch, migration?, gate}

phase('Integrate')                               // main-loop-supervised; migrations coordinated
const integ = await agent(integratePrompt(lanes.filter(Boolean)),
  { model: 'opus', isolation: 'worktree', schema: INTEG_SCHEMA })

phase('Verify')                                  // adversarial, read-only, majority-refute
const verdicts = await parallel([
  () => agent(securityRefute('ownership'),  { model: 'opus', schema: VERDICT }),
  () => agent(securityRefute('claim'),      { model: 'opus', schema: VERDICT }),
  () => agent(securityRefute('rls-money'),  { model: 'opus', schema: VERDICT }),
  () => agent(spamBreak,                     { model: 'opus', schema: VERDICT }),
])
// if majority-refute on any → spawn a targeted fix agent, re-verify (loop)

phase('QA')
const qa = await agent(liveQaPrompt(integ), { model: 'opus', schema: QA_SCHEMA })
return { integ, verdicts, qa }                   // I review, then open the PR
```

I run this, watch `/workflows`, review the structured returns between phases, and handle the
human seams. Resume-on-edit means if I tweak a lane prompt, only that lane + downstream re-run.

---

## 6. Migration & integration protocol (CLAUDE.md compliance)

- **3 migrations in this run** (M1 guest-message column, B4 claim-RPC extension, S4 block/report).
  Per the one-migration-per-agent rule, each lane *authors* its migration but the **integration
  step owns final timestamp assignment** (`date -u +%Y%m%d%H%M%S`, distinct per file;
  park-restore to `.tmp-migrations-park/` on collision, documented in the commit).
- **`npm run db:push` is part of integration, not optional** — three prior incidents shipped code
  referencing unapplied migrations. The PR is not "green" until migrations are applied to remote
  Supabase and `npm run db:check` is clean.
- **Branch hygiene:** lanes branch off the latest `origin/main`; integration is FF-only onto one
  feature branch; **never force-push `main`**; never `git switch` in the shared checkout (lanes
  use worktrees).
- **Final gate before PR:** `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit &&
  npm run lint && npm test` (relevant suites) — a 0-error *OOM-crashed* tsc run does not count.

---

## 7. Checkpoints that need you (the honest human seams)

The run is mostly autonomous but stops for these — none should block kicking it off except #1:

1. **KV provider** (before Lane B): Vercel KV vs Upstash Redis — an account/config choice. Pick
   one and I wire it; until then Lane B's S1 waits while the other four lanes proceed.
2. **Stored-value / $5-fee direction** (does *not* block MVP): the MVP uses no new stored value.
   The trust-evolution (refundable hold vs fee-as-credit) + the legal review of the existing
   balance feature is a separate decision from this build.
3. **Seeded QA host** (before Wave 4): raw `*.vercel.app` won't render (middleware 404s hosts not
   in `agency_domains`). I need either a `vercel alias` to a seeded host or a promote — may need
   your Vercel access.
4. **Production merge** (after green PR + live QA): merging to `main` = a production deploy. I'll
   stop at a green, QA-proven PR and hand you the merge call (outward-facing action = your go).

---

## 8. Timeline & cost (and how it adapts)

- **Wall-clock:** roughly **half a day of automated execution**, dominated by Wave 1 (slowest lane
  = Lane A's Opus-heavy backend pipeline) and the Wave 2/4 integration+QA variability. Ranges:
  Contracts ~10 min · Build ~30–60 min (parallel) · Integrate ~20–40 min · Verify ~15 min
  (parallel) · QA ~20–40 min + fix-loop.
- **Cost:** order-of-magnitude a few-to-several million output tokens depending on how deep the
  adversarial/QA fix-loops go; Opus concentrated on the ~7 high-stakes jobs, Sonnet/Haiku on the
  bulk keeps it efficient.
- **Adapts to timeline:** if you want it faster, I drop V to a single-vote verify and trim Lane E
  (presence) to P2-only. If you want it bulletproof, I widen V to 5 skeptics + add a completeness
  critic pass. If a lane's decision is pending (KV), the DAG routes around it and that lane lands
  in a follow-up integration.

---

## 9. Risk register

| Risk | Mitigation |
|---|---|
| Migration timestamp collision (3 migrations) | Integration owns timestamp assignment + park-restore; documented in commit |
| Merge conflicts across lanes | Contracts-first + worktree isolation minimizes; Opus integration resolves |
| Subtly-wrong code passes tsc | Adversarial Wave 3 + live Wave 4 QA, not gates alone |
| Guest-ownership / RLS / claim-hijack hole | Dedicated Opus skeptics (V1); app-layer ownership check is the security boundary |
| Spam floor bypassed | V2 break-attempt; KV limits + disposable + velocity + block |
| "Feels alive" promise broken (presence dishonesty) | P1/P2 honest-SLA rules reviewed; poll is good enough for a just-started thread |
| Supabase Free-tier quota 402 / SASL push error | Known: check quota first; fallback `apply-migration.mjs --apply-pending` (Mgmt API) |
| tsc heap OOM (local) | `NODE_OPTIONS=--max-old-space-size=8192`; a crashed 0-error run is not clean |
| `gh` PAT can't dispatch workflows | Known limitation; any goldens reseed handed to you |

---

## 10. Rollback

Branch-per-wave + one integration branch means any wave is revertible without touching `main`.
Production stays on `main`; if a post-merge issue appears, `npm run deploy:promote -- <prev-url>`
rolls back and re-aliases both domains. Nothing in this run force-pushes or auto-merges to `main`.

---

## 11. What I will NOT do without your word

- No production merge / deploy (stops at green PR + live-QA evidence).
- No new stored-value/balance code (legal-sensitive) in this MVP.
- No `main` force-push, no `git switch` in the shared checkout, no skipping `db:push`.
- No widening to other surfaces (agency/directory/embeds) until this floor is proven.

**Greenlight needed to start:** confirm the run + answer checkpoint #1 (KV provider). Everything
else proceeds automatically from there, and I report back at each wave.
