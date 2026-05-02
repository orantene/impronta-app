# Design → Dev handoff template

> Copy this template for each feature spec the design team hands to engineering.
> Cross-references [`ROADMAP.md`](./ROADMAP.md) audit findings (§3), tasks (§4),
> memory files ([Appendix B](./ROADMAP.md#11-appendix-b--memory-index)), and
> acceptance-criteria patterns ([Appendix C](./ROADMAP.md#12-appendix-c--acceptance-criteria-patterns)).

Save filled-in copies in `web/src/app/prototypes/admin-shell/handoffs/<YYYY-MM-DD>-<feature-slug>.md`.

---

## [Feature title]

**Designer:** _name_
**Engineer(s):** _names_
**PM / reviewer:** _name_
**Date:** _YYYY-MM-DD_
**Target ship:** _week / sprint_
**Feature flag:** `?flag=` _flag-name-or-N/A_

---

### 1. Context

**Audit finding(s):** _e.g. ROADMAP §3.1.1, 3.1.2_
**Workstream / task(s):** _e.g. WS-1.A, WS-1.B.1_
**Memory references:**
- _e.g. `project_inquiry_flow_spec.md` — pipeline stages_
- _e.g. `feedback_admin_aesthetics.md` — color memo_

**Why this matters now (1–2 sentences):**
_…_

**User story:**
> As a _[role]_, I want to _[action]_ so that _[outcome]_.

---

### 2. Scope

**In scope:**
- _bullet_
- _bullet_

**Explicitly OUT of scope:**
- _bullet_
- _bullet_

**Surfaces affected:** _Workspace / Talent / Client / Platform · which pages / drawers_

**Files to change:** _list with line refs where useful_
- `web/src/app/prototypes/admin-shell/_pages.tsx` (line refs)
- `_drawers.tsx` (drawer dispatch case)
- `_help.tsx` (registry update if drawer changes shape)

---

### 3. Design

**Figma:** _link to file + frame_
**Primary breakpoint covered:** _e.g. desktop ≥1280px_
**Other breakpoints specified:**
- Phone (<768px): _Figma frame link or "see canonical responsive recipe in WS-2"_
- Tablet (768–1023px): _link_
- Wide (≥1280px): _link_

**Component re-use (from `_primitives.tsx`):**
- `<Card variant="primary">`
- `<EmptyState>`
- `<DrawerShell>`
- _etc._

**New primitives proposed:**
- _none_ / _e.g. `<DateDivider>` — single-purpose, no params_

---

### 4. Acceptance criteria

> Use the 10 patterns in [ROADMAP §12](./ROADMAP.md#12-appendix-c--acceptance-criteria-patterns).
> Each criterion is verifiable in <5 minutes by an engineer or QA.

**Visible:**
- [ ] _…_

**Conditional:**
- [ ] _…_

**Interactive / keyboard:**
- [ ] _…_

**State transitions:**
- [ ] _…_

**Edge cases:**
- [ ] _empty data_
- [ ] _error state_
- [ ] _loading state_
- [ ] _offline_

**Performance:**
- [ ] _…_ (see WS-13 budgets if applicable)

**Accessibility:**
- [ ] Keyboard reachable in tab order
- [ ] `aria-*` attributes specified
- [ ] Screen-reader spot-check: _what should be announced_
- [ ] Reduced-motion behavior: _…_
- [ ] Color contrast: _AA / AAA_

**Cross-surface consistency:**
- [ ] _e.g. the unread badge value matches across topbar + bottom-nav + notifications drawer_

---

### 5. Telemetry

Events to fire (added to `track()` registry per WS-0.5):

| Event | Trigger | Props |
|---|---|---|
| `your_event_name` | _when…_ | `{ surface, viewport, ... }` |

---

### 6. Plan / role / context gating

**Plan tier behavior:**
- Free: _…_
- Studio / Pro: _…_
- Agency / Portfolio: _…_

**Role behavior (workspace):**
- Owner / Admin: _…_
- Coordinator: _…_
- Editor: _…_

**Context behavior (if WS-27 hybrid mode applies):**
- Agency context: _…_
- Talent context: _…_
- Hub context: _…_

---

### 7. Decisions made

> Add corresponding entries to `DECISIONS.md` for any non-obvious choice.

| # | Decision | Tradeoff accepted |
|---|---|---|
| 1 | _…_ | _…_ |

---

### 8. Open questions

| Q | Owner | Needed by |
|---|---|---|
| _…_ | _name_ | _date_ |

---

### 9. Test plan (informs WS-24)

- [ ] Unit tests cover _logic X_
- [ ] E2E test covers _flow Y_
- [ ] Visual regression: _Storybook story added_
- [ ] Manual QA at 375pt + 768pt + 1440pt
- [ ] Manual QA: VoiceOver + NVDA spot-check
- [ ] Manual QA: keyboard-only nav

---

### 10. Rollout

**Behind feature flag?** _yes / no — flag name_
**Dogfood plan:** _internal users for X days_
**Beta cohort:** _% / specific tenants / N/A_
**Telemetry watch list (first 24h after flag-on):**
- _…_
**Rollback plan:** _flag-flip / revert PR / migration_

---

### 11. Definition of done

- [ ] All acceptance criteria pass
- [ ] `npx tsc --noEmit` returns 0 errors
- [ ] Lint passes
- [ ] Storybook story added or updated
- [ ] Decision-log entries written
- [ ] Designer review signed off
- [ ] Content review signed off (any user-facing copy)
- [ ] Telemetry events confirmed firing
- [ ] PR linked to this handoff doc
- [ ] Handoff doc moved to `handoffs/` and committed

---

> **Next handoff?** Copy this template again. Don't skip sections — leave them as `N/A` when truly not applicable so the next reviewer doesn't wonder if they were missed.
