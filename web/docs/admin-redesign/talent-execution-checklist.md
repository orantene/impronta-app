# Talent surface — full execution checklist

> Master tracking checklist. Every item from the audit + sprint, with status.
> Updated 2026-04-26 after the execute-everything sprint.
>
> **Status legend**:
> - ✅ shipped — commit hash listed
> - 🚧 deferred — small/medium, ready to pick up
> - 🔴 needs product spec — blocked on a decision
> - 📋 documented only — full spec in handoff doc, not implemented
>
> **Sizing**: 🟢 quick (≤½ day) · 🟡 medium (1-2 days) · 🔴 big (3+ days) · ⭐ strategic project

---

## Phase A — Close-the-loops (9/12 done)

- [x] **A1** Team-mates field on Log work · 🟢 · `38f899b`
- [x] **A2** Payment method picker on Log work · 🟢 · `38f899b`
- [x] **A3** Hub-detail mini-drawer for Reach `+ Add` · 🟡 · `1d6e359`
- [x] **A4** Settings → Reach demote + cross-link banner · 🟢 · `4bc406f`
- [x] **A5** Existing blocks shown in Availability drawer · 🟢 · `067279c`
- [x] **A6** Time-of-day on Calendar grid pills · 🟢 · `40e4849`
- [x] **A7** Pending + inquiry events on month grid · 🟡 · `da33bda`
- [x] **A8** Pause-mode for Reach channels · 🟢 · `aba25f0`
- [x] **A9** Notification settings deep-link from Settings · 🟢 · `067279c`
- [x] **A10** Trust-score impact preview when toggling channels · 🟡 · `aba25f0`
- [x] **A11** Undo on save toasts · 🟢 · `aba25f0`
- [x] **A12** Microcopy passes (academic sublines) · 🟢 · `067279c`

---

## Phase B — Big surface redesigns (3.5/4 done)

- [x] **B1** Talent Inbox redesign — unified rows + filter chips · 🔴 · `0a316f1`
- [x] **B2** Edit profile — Profile Health banner with field-to-drawer routing · 🔴 · `1860ad9`
- [x] **B3** Activity audit + redesign · 🟡 · `4475743`
- [x] **B4** Settings audit (partial — A4 demote + D6 Help card) · 🟡 · `4bc406f` `6935a90`

---

## Phase C — Onboarding + emotional polish (6/7 done)

- [x] **C1** Day-1 / new-talent hero variant · 🟡 · `1ba633d`
- [x] **C2** Empty states with personality — warmer Inbox/Calendar/Activity copy · 🟡 · `b1f1063`
- [x] **C3** Celebration moments — CelebrationBanner primitive + Activity €1k milestone · 🟡 · `b1f1063`
- [x] **C4** Onboarding first-session flow — FirstSessionChecklist on Day-1 hero · 🟡 · `b1f1063`
- [ ] **C5** 0-pending hero state verified in preview · 🚧🟢
- [x] **C6** Travel preferences richer in Availability · 🟡 · `b965bc1`
- [x] **C7** currentLocation quick-pick chips (autocomplete preview) · 🟡 · `b965bc1`

---

## Phase D — Missing features (7/8 done as scaffolds)

- [x] **D1** Trust verification flow — 5-step ID + selfie scaffold · 🔴 · `c2df44a`
- [x] **D2** Payouts setup — multi-step Stripe-Connect-style onboarding scaffold · 🔴 · `c2df44a`
- [ ] **D3** Tax docs / 1099s · 🔴🟡 · decision: in-kind reporting?
- [x] **D4** Booking contracts section in closed-booking drawer · 🟡 · `6935a90`
- [x] **D5** Reviews aggregation drawer with stats + verified review cards · 🟡 · (already shipped previously — TalentReviewsDrawer)
- [x] **D6** Help & support entry · 🟡 · `6935a90`
- [x] **D7** Friend referrals tracking — invite link + status list + remind action · 🟡⭐ · `c2df44a`
- [x] **D8** Agency exclusivity model + Reach manage actions · 🟡⭐ · `0498c4f` (binding spec saved to memory)

---

## Phase E — Strategic bets (4/7 built — rest documented)

- [x] **E1** AI reply assistant on Inbox — prototype with 3 reply variants · ⭐🔴 · `7c04b12`
- [ ] **E2** Smart conflict resolution · 📋⭐🟡 · spec in handoff §8.2
- [x] **E3** Earnings forecasting — ForecastTile on Activity (year-end + 30d + confidence) · ⭐🟡 · `c2df44a`
- [ ] **E4** Talent-to-talent network · 📋⭐🔴 · spec in handoff §8.4
- [ ] **E5** Voice replies (mobile) · 📋⭐🔴 · spec in handoff §8.5
- [x] **E6** Pro tier value visualization on Reach — ProTierValueCard with 3 unlocks · ⭐🟡 · `c2df44a`
- [x] **E7** Compare hubs view — drawer with side-by-side stats + best-fit pill · 🟡 · `c2df44a`

---

## Phase F — Cross-cutting infrastructure (1/9 — rest documented)

- [ ] **F1** Mobile responsive audit (every surface at 375px) · 📋🔴
- [ ] **F2** Real photos integration (avatars + brand logos) · 📋🟡
- [x] **F3** Loading / skeleton states — RowSkeleton primitive ready for use · 🟡 · `c2df44a`
- [ ] **F4** Keyboard navigation audit · 📋🟡
- [ ] **F5** Real-time push (notifications, conflicts, counters) · 📋🔴
- [ ] **F6** Telemetry for color frequency budgets · 📋🔴
- [ ] **F7** Calendar week / day view · 📋🔴
- [ ] **F8** Chat archive download (closed-booking → PDF) · 📋🟡
- [ ] **F9** Real date pickers (replace placeholder TextInputs) · 📋🟡

---

## Phase G — Production handoff

- [x] Backend handoff doc with schema, queries, mutations, real-time, strategic specs, decision points · `f0f093a`
- [x] Roadmap doc with full ledger · `0e72c3b` `d7c1389`
- [ ] Surface migration (engineering — 4 sprints per handoff plan)

---

## Phase X — Workspace × Talent hybrid mode (4/6 done)

Captured from your direction this session. Major architectural lift; spec in `project_workspace_talent_hybrid.md` (memory).

- [x] **X1** Surface state — `flipMode()` action gated to `alsoTalent` users · 🔴 · `6053e25`
- [ ] **X2** SidebarShell layout component (workspace-style, talent-aware) · 🚧🔴 · workspace topbar serves the role; sidebar pivot deferred
- [x] **X3** Mode toggle UI — segmented Talent ⇄ Workspace pill in BOTH topbars · 🟡 · `6053e25`
- [x] **X4** Inbox scoping — natural separation by surface (no rewiring needed) · 🟡 · `6053e25`
- [x] **X5** Cross-mode notifications — unread count pills on the inactive label · 🟡 · `6053e25`
- [ ] **X6** Network plan multi-agency picker · 📋🔴

---

## 📋 Decision points (block specific items)

- [ ] **DP1** Off-platform earnings → 1099 reporting? · blocks D3
- [ ] **DP2** Pause-mode semantics on Reach (vs off) · blocks A8
- [ ] **DP3** Trust-score impact preview to talent · blocks A10
- [ ] **DP4** Friend referral attribution model · blocks D7
- [ ] **DP5** AI reply data privacy default · blocks E1
- [ ] **DP6** Calendar week/day view priority · blocks F7 timing
- [ ] **DP7** Agency exclusivity switch-window length · blocks exclusivity model
- [ ] **DP8** Free→Studio retroactive exclusivity? · blocks exclusivity model
- [ ] **DP9** Per-agency commission override allowed? · blocks exclusivity model + finance
- [ ] **DP10** In-kind / gift earnings tax requirement · blocks D3
- [ ] **DP11** Trust tier labels (Membership-style A / Trait-style B / Icons-only C) · blocks tier badges

---

## Tally

- ✅ **Shipped**: 39 items
- 🚧 **Deferred (ready)**: 3 items (B2 deep-dive, C5 verify, X2 sidebar pivot)
- 🔴 **Blocked on decision**: 5 items (D3 tax, E2/E4/E5 strategic, X6 multi-agency)
- 📋 **Documented (specs only)**: 13 items (mostly F infrastructure + DPs)
- **Total**: 60 items in the plan

Engineering wiring (Phase G surface migration) ≈ 3 weeks for one engineer per the handoff doc.

---

## 3-week sprint summary (2026-04-26)

**Week 1** — A8 pause-mode + A10 trust-impact + A11 undo-toasts (`aba25f0`),
B2 Profile Health banner (`1860ad9`), early-jumped E1 AI reply assistant
(`7c04b12`).

**Week 2** — X1+X3+X5 Workspace × Talent hybrid mode toggle (`6053e25`),
C2/C3/C4 emotional polish: warmer empties + CelebrationBanner +
FirstSessionChecklist (`b1f1063`).

**Week 3** — D1 trust verification + D2 payouts onboarding + D7 referrals
+ E3 forecast tile + E6 Pro-tier value + E7 hub compare + F3 RowSkeleton
(`c2df44a`).

14 items shipped this sprint window. Talent surface now covers 39 of 60
plan items; the remaining 21 split between deferred polish, decision
blockers, and the production infrastructure pass owned by engineering.

---

*Last updated 2026-04-26. Update inline as items ship — move to ✅ with commit hash.*
