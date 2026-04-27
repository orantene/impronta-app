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
- [ ] **A8** Pause-mode for Reach channels · 🚧🟢 · needs product call on semantics
- [x] **A9** Notification settings deep-link from Settings · 🟢 · `067279c`
- [ ] **A10** Trust-score impact preview when toggling channels · 🔴🟡 · needs scoring algo
- [ ] **A11** Undo on save toasts · 🚧🟢 · toast-utility refactor
- [x] **A12** Microcopy passes (academic sublines) · 🟢 · `067279c`

---

## Phase B — Big surface redesigns (2.5/4 done)

- [x] **B1** Talent Inbox redesign — unified rows + filter chips · 🔴 · `0a316f1`
- [ ] **B2** Edit profile audit + redesign · 🚧🔴 · sprawling 12-drawer page; needs own session
- [x] **B3** Activity audit + redesign · 🟡 · `4475743`
- [x] **B4** Settings audit (partial — A4 demote + D6 Help card) · 🟡 · `4bc406f` `6935a90`

---

## Phase C — Onboarding + emotional polish (3/7 done)

- [x] **C1** Day-1 / new-talent hero variant · 🟡 · `1ba633d`
- [ ] **C2** Empty states with personality · 🚧🟡 · per-surface pass needed
- [ ] **C3** Celebration moments (first booking, first €1k month) · 🚧🟡 · needs `talent_celebration_events` table
- [ ] **C4** Onboarding first-session flow · 🚧🟡
- [ ] **C5** 0-pending hero state verified in preview · 🚧🟢
- [x] **C6** Travel preferences richer in Availability · 🟡 · `b965bc1`
- [x] **C7** currentLocation quick-pick chips (autocomplete preview) · 🟡 · `b965bc1`

---

## Phase D — Missing features (3/8 done as scaffolds)

- [ ] **D1** Trust verification flow (ID upload → Verified badge) · 🔴 · needs admin review queue + product spec
- [ ] **D2** Payouts setup (Stripe Connect) · 🔴 · launch-blocker; real Stripe integration
- [ ] **D3** Tax docs / 1099s · 🔴🟡 · decision: in-kind reporting?
- [x] **D4** Booking contracts section in closed-booking drawer · 🟡 · `6935a90`
- [ ] **D5** Reviews aggregation surface (dedicated page) · 🚧🟡
- [x] **D6** Help & support entry · 🟡 · `6935a90`
- [ ] **D7** Friend referrals tracking · 🔴🟡⭐ · attribution model decision needed
- [x] **D8** Agency exclusivity model + Reach manage actions · 🟡⭐ · `0498c4f` (binding spec saved to memory)

---

## Phase E — Strategic bets (0/7 built — all documented)

- [ ] **E1** AI reply assistant on Inbox · 📋⭐🔴 · spec in handoff §8.1
- [ ] **E2** Smart conflict resolution · 📋⭐🟡 · spec in handoff §8.2
- [ ] **E3** Earnings forecasting · 📋⭐🟡 · spec in handoff §8.3
- [ ] **E4** Talent-to-talent network · 📋⭐🔴 · spec in handoff §8.4
- [ ] **E5** Voice replies (mobile) · 📋⭐🔴 · spec in handoff §8.5
- [ ] **E6** Pro tier value visualization on Reach · 📋⭐🟡 · spec in handoff §8.6
- [ ] **E7** Compare hubs view · 📋🟡 · spec in handoff §8.7

---

## Phase F — Cross-cutting infrastructure (0/9 — all documented)

- [ ] **F1** Mobile responsive audit (every surface at 375px) · 📋🔴
- [ ] **F2** Real photos integration (avatars + brand logos) · 📋🟡
- [ ] **F3** Loading / skeleton states · 📋🟡
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

## Phase X — NEW · Workspace × Talent hybrid mode (0/6 done)

Captured from your direction this session. Major architectural lift; spec in `project_workspace_talent_hybrid.md` (memory).

- [ ] **X1** Surface state supports `mode: "talent" | "admin"` toggle · 📋🔴
- [ ] **X2** SidebarShell layout component (workspace-style, talent-aware) · 📋🔴
- [ ] **X3** Mode toggle UI (top-right of either layout) · 📋🟡
- [ ] **X4** Inbox scoping — talent vs admin separation · 📋🟡
- [ ] **X5** Cross-mode notifications (admin pill in talent mode) · 📋🟡
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

- ✅ **Shipped**: 23 items
- 🚧 **Deferred (ready)**: 9 items
- 🔴 **Blocked on decision**: 6 items
- 📋 **Documented (specs only)**: 22 items
- **Total**: 60 items in the plan

Engineering wiring (Phase G surface migration) ≈ 3 weeks for one engineer per the handoff doc.

---

*Last updated 2026-04-26. Update inline as items ship — move to ✅ with commit hash.*
