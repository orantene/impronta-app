# Overview Page — 2026 Readiness Audit

**Scope:** the Workspace Overview page (`function OverviewPage()` at `web/src/app/prototypes/admin-shell/_pages.tsx:2617`). Free-plan branch (`OverviewFree`) is out of scope here — it has its own component and a different problem set.

**Date:** 2026-05-02
**Audited against:** prototype on branch `phase-1`, commit `~93b46c4` + working-tree changes.
**Audit type:** structural + 2026-pattern gap analysis. Not a per-pixel design review.

> **What this doc is for:** a dev cold-reading the Overview page should know (a) what's worth keeping, (b) what to delete or restructure, (c) what's missing that 2026 users will expect, (d) the order in which to ship the changes. Pairs with `mobile-audit.md` (mobile-only fixes) and `ROADMAP.md` WS-3 (workspace consolidation).

---

## 1. TL;DR

The Overview today renders **10 distinct sections** — activation banner, demo banner, Today's Focus, stat strip, primary 2-up row, secondary 4-cards-in-3-cols row, Analytics row (4 cards), Operations row (6 cards), 2 page-pointer buttons, locked-tier strip. That's a directory, not a dashboard.

The page wants to be **what to do next**. It's currently **everything you can navigate to**.

The fix is structural: collapse to 5 sections, kill cards that link to pages already in the sidebar, add live signal + sparklines, add a Top Performers section that switches between Talent and Pages.

**Total effort:** ~9.5 working days for the full rewrite. The first 3 days (kill duplicate cards + add live activity feed + fix the grid bug) carry ~70% of the visible quality lift.

---

## 2. Strengths to preserve

- **`TodaysFocusCard`** at `_pages.tsx:2515` — single highest-priority line + dynamic body + primary CTA. The pattern is right; expand it.
- **Personalized greeting + ISO-day subtitle.** Human touch. Keep.
- **`WorkspaceStatStrip`** at `_pages.tsx:2307` replaced an old 4-up card grid that wasted ~440px of vertical. Compact + tappable.
- **Free-plan branch** (`OverviewFree`) has its own component — right call. Different audience, different problem set.
- **Locked-tier upsells** at the bottom (line 2884+) — quietly placed, not in the main flow. Good restraint.
- **Color-system discipline.** `COLORS.coral` for "needs you", `COLORS.indigo` for analytics signals, `COLORS.success` for completion. Matches the design memo (`STYLE.md` + `feedback_admin_aesthetics`).

---

## 3. Top 5 architectural issues

### 3.1 Section sprawl — 10 sections is a directory, not a dashboard

The page renders these in order:
1. `WorkspaceActivationBanner`
2. `DemoDataBanner`
3. `TodaysFocusCard`
4. `WorkspaceStatStrip`
5. Primary 2-up row (`PrimaryCard × 2`)
6. Secondary row (`SecondaryCard × 4` in `cols="3"` grid — see issue 3.5)
7. Analytics row (`SecondaryCard × 4`)
8. Operations row (`SecondaryCard × 6`)
9. Operations + Production page-pointer buttons
10. Locked-tier upsell strip

Linear / Vercel / Stripe overviews ship 3–5 sections. The user opens this page to know **what to do next**, not browse the entire app.

**Fix:** collapse to 5 sections — `Header → Today's focus → Live activity feed → Stats with sparklines → Top performers`. Move Operations + Analytics card content OUT of Overview entirely; the sidebar nav already routes there. Rule: **if a card on Overview links to a page that has its own nav entry, delete the card.**

### 3.2 Cards duplicate the sidebar nav

The Operations row (6 cards: My queue / SLA / Automation / Saved replies / Vacation / On-call) and the Analytics row (4 cards: Revenue / Conversion / Top performers / Team workload) are entries on the dedicated Operations and Analytics pages, which are themselves sidebar entries.

The 2-button "pointers to Operations + Production pages" at line 2842 is the right pattern. The cards above it shouldn't exist if the pointers do — they contradict each other.

**Fix:** kill both rows. Keep the page-pointer pair.

### 3.3 No real-time signal

Everything is static counts. `awaiting.length`, `draftCount`, `confirmedThisWeek.length` are snapshots. A 2026 admin home surfaces **what just happened**:
- "Sara Bianchi confirmed Lina Park for May 14 · 2m"
- "Yael Cohen sent inquiry RI-208 · 12m"
- "Bvlgari payment cleared · €8,200 · yesterday"

The data is already in `RICH_INQUIRIES.messages` + `pendingTalent` + the bell hub. Just needs an aggregator + a timeline component.

**Fix:** add a **Live activity feed** as the second-priority section (right under `TodaysFocusCard`). 5 most-recent events, scannable, click-to-open. Auto-refresh on the same hooks the bell uses.

### 3.4 No sparklines / temporal context anywhere

`Views 7d: 142` is a stat with no shape. Was it 142 yesterday? 80? You can't tell.

A 2026 stat card has a 3-week sparkline in the cell — 24×40 SVG, no axes, just the line + a 1px end-cap dot.

**Fix:** add `<Sparkline>` primitive. Render inside each `WorkspaceStatStrip` cell. Data: `MOCK_STOREFRONT_STATS` already has 7-day series; add similar for inquiries / bookings / active counts. Trivial wire-up.

### 3.5 Layout bug — secondary row wraps awkwardly

`<Grid cols="3">` with **4** cards inside (Drafts / Sent-waiting / Recent activity / Approval queue) at line 2710. Wraps to 3+1 — one card alone on row 2.

**Fix:** either change to `cols="4"` or split into `cols="2"` × 2 rows. Mathematically inconsistent with itself today.

---

## 4. Specific gaps (medium impact)

| # | Gap | Suggested fix |
|---|---|---|
| 4.1 | **No "what changed since you were here"** | Small "Since Friday" stripe under Today's Focus: "+5 inquiries · 2 confirmed · 1 expired". Use `localStorage` to track last-visit timestamp; diff `RICH_INQUIRIES` against it. |
| 4.2 | **No SLA breach surfacing** | Inquiries past SLA threshold (>24h with no coordinator reply) should be a coral-tone callout at the top, NOT one of 6 Operations cards. Promote the most urgent failure to hero. |
| 4.3 | **No quick-filter on the page** | Sticky "All / My queue / Casa Pero / Mango" filter chip row that scopes the entire Overview's data. Linear-style. Cheap with the existing `coordinator.id` filter. |
| 4.4 | **PageHeader is generic** | `Good morning, Marta` + date is fine. Add a one-line synthesis: "12 active inquiries · 3 confirmed bookings this week · €4,200 in flight". Replaces the plain date subtitle. |
| 4.5 | **No inline activity feed** | Right under Today's Focus: a `<TimelineFeed events={recentEvents.slice(0, 5)} />`. Each row: avatar + actor + verb + object + relative-time. Linear / GitHub pattern. |
| 4.6 | **No pinned / starred items** | Power-users want to pin a specific inquiry. Add `pinned: Set<inquiryId>` to ProtoState; surface a "Pinned" rail above the timeline. |
| 4.7 | **No empty state for new workspaces** | When `inquiries.length === 0`, the page just shows zeros. Should show `<EmptyState>` with `WorkspaceActivationBanner` promoted to hero. |
| 4.8 | **`oldestWaitDays` calc bug** | Line 2662 reads `i.ageDays` but `RichInquiry` doesn't have that field — it has `lastActivityHrs`. Probably renders `NaN d` in the focus-card hint when `awaiting.length > 0`. **Real bug, fix in passing.** |
| 4.9 | **No public-side metrics surfaced** | Tulala is multi-sided. Show storefront-side stats (storefront views, inbound DM rate, top talent by views) alongside internal pipeline. Today it's 100% internal. |
| 4.10 | **No undo / recently-archived inline** | "You archived 2 inquiries in the last hour — undo?" is a 2026 expectation. Cheap with toast queue + a 1-hour rolling buffer. |
| 4.11 | **Keyboard shortcuts not surfaced** | `useKeyboardLayer` registers `g+i`, `g+n`, etc. but Overview never tells the user. Add a tiny "Press `?` for shortcuts" hint in the page footer. |

---

## 5. Polish nits (low impact)

- **`greeting()` uses local time** — doesn't account for the workspace's timezone. Marta in Madrid + a coordinator in NYC see different greetings on the same workspace. Should default to workspace tz, not browser tz.
- **`pluralize()` chains in PrimaryCard descriptions** at line 2685 — two pluralizations + a contraction (`hasn't / haven't`) reads choppy. Could be: "**3** waiting on a client · **2** drafts unsent."
- **`PrimaryCard` "Workflow" description** is 2 sentences. Should be one. Compare with "What needs you today" — also 2 sentences. Compress both.
- **Operations + Production pointer-buttons** at line 2842 use `display: flex` + manual `gap: 14` instead of the established `<Card variant>` primitive. Drift.
- **Hardcoded `marginTop: 22`, `marginTop: 20`, `marginTop: 28`** between sections — three values for the same job. Pick one (suggest 24px) and use a `<SectionGap />` primitive.
- **Section heading inconsistency:** `Operations` heading at line 2788 uses `FONTS.display, fontSize: 18, fontWeight: 500`. `Analytics` heading at line 2745 uses `FONTS.body, fontSize: 13, fontWeight: 600`. Two heading styles within the same page.
- **`MOCK_STOREFRONT_STATS.views7d`** at line 2675 — no `meta` showing the trend. The strip has the data but renders only the absolute number.
- **`TodaysFocusCard` "All caught up" copy** is fine but stops there. Could suggest a weekly review action: "All caught up. Nothing's been booked from Mango in 14 days — want to nudge them?"
- **No skeleton state** — when data loads slowly, all cards pop in at once. Add `<Skeleton>` placeholders for the live activity feed + sparklines. The `<Skeleton>` primitive already exists in `_primitives.tsx:5690+`.

---

## 6. Proposed 2026 redesign

A 4-section page, top to bottom (Top Performers got moved to the Website page — see §7):

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER                                                           │
│ Good morning, Marta · Tue May 14                                 │
│ 12 active · 3 confirmed this wk · €4,200 in flight     [+ New]   │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ FOCUS — single non-dismissible section                           │
│  ⚡ 3 inquiries are waiting for a client decision.               │
│  Oldest wait: 2d — follow up before it goes cold.                │
│  [Open today's pulse]                                            │
│                                                                  │
│  Since Friday: +5 inquiries · 2 confirmed · 1 expired            │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ LIVE — what's happening right now                                │
│  • Sara Bianchi confirmed Lina Park for May 14 · 2m              │
│  • Yael Cohen sent inquiry RI-208 · Mango · 12m                  │
│  • Marta Reyes accepted Spring Lookbook offer · 1h               │
│  • Diego submitted profile for review · 5h                       │
│  • Bvlgari payment cleared · €8,200 · yesterday                  │
│  ──────────────────────────────────────                          │
│  See full activity →                                             │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ STATS — with sparklines                                          │
│  Needs you  Active   Confirmed  Storefront views                 │
│      5        12         3            142                        │
│   ╭─╮  ╭╮  ╭───╮  ╭╮  ╭─╮ ╭╮  ╭──────╮ ╭╮                      │
│   ╯ ╰──╯╰──╯   ╰──╯╰──╯ ╰─╯╰──╯      ╰─╯╰──                    │
│   ▼ -2 wk-over-wk    ▲ +18%        ↗ trend up                    │
└──────────────────────────────────────────────────────────────────┘
                                          [Press ? for shortcuts]
   (Top performers moved to Website page → WebsitePerformance section)
```

**Removed from current Overview:**
- Activation banner — promote to a **dismissible bottom-of-page card** for the first 30 days, then auto-hide
- Demo banner — stays (it's a meta-tool for evaluators, not part of normal UX)
- Primary 2-up row — folded into Today's Focus (the `What needs you today` card already duplicates focus-card content)
- Secondary 4-card row — content folds into Live activity feed (Drafts / Sent-waiting are filter views you can reach from Active in the Stats row)
- Analytics row — sidebar has Operations page
- Operations row — sidebar has Operations page
- Locked-tier upsell strip — move to Settings → Plan, where the user goes when they think about plan

**Page becomes ~30% shorter, ~70% denser with signal, and reads like a 2026 product instead of a v1 directory.**

---

## 7. ~~Top Performers section~~ — moved to Website page (2026-05-02)

**Originally proposed here as Overview section #5.** Re-scoped: the Website page's existing `WebsitePerformance` already has a "Top performing pages" table (`_pages.tsx:8311+`). The Talent ↔ Pages switcher belongs *there*, extending the existing component, not on Overview. See `_pages.tsx::WebsitePerformance` for the live implementation.

**Net effect on this audit:** the proposed 5-section Overview becomes a 4-section Overview (Header → Focus → Live activity feed → Stats with sparklines). The "Top performers" SecondaryCard in the current Analytics row should still be deleted per issue 3.2 — its content lives on the Website page now, properly inline.

---

## 8. Effort estimate

Phased implementation; each phase is independently shippable.

| Phase | Items | Effort | Visible impact |
|---|---|---|---|
| **A** | Kill duplicate Operations + Analytics rows · fix the 3-cols-4-cards layout bug (3.1, 3.2, 3.5) | 1 day | High — page shrinks ~30% immediately |
| **B** | Live activity feed (3.3, 4.5) | 2 days | High — page reads as alive instead of static |
| **C** | Sparklines on stat strip (3.4) | 1 day | Medium — temporal context everywhere |
| **D** | Header synthesis subtitle (4.4) · since-you-were-here delta (4.1) · SLA breach promotion (4.2) | 1 day | Medium |
| **E** | Top Performers section with Talent ↔ Pages switcher (this is its own deliverable — section 7) | 1.5 days | High — replaces the killed Analytics row with something genuinely useful |
| **F** | Quick-filter chips (4.3) · pinned items (4.6) · empty state (4.7) | 1.5 days | Medium |
| **G** | `oldestWaitDays` bug fix (4.8) · undo inline (4.10) · keyboard hints (4.11) · all polish nits (§5) | 1.5 days | Low — but compounds |

**Total: 9.5 working days for the full rewrite.**

The first 3 days (Phase A + B) carry ~70% of the visible quality lift. If the budget is tight, ship A + B + E and stop — the page will already feel like a 2026 product.

---

## 9. Out of scope (deferred)

- **`OverviewFree`** redesign (the free-plan branch). Different audience, different problem set. Worth a sibling audit.
- **Mobile-specific layout work.** Tracked separately in `mobile-audit.md`. The 5-section structure proposed here scales reasonably to mobile (each section stacks), but stat-strip + Top Performers will need bottom-sheet variants at <768pt.
- **Real-time WebSocket wiring.** The Live activity feed proposes a 5-event tail; the prototype can mock it from `RICH_INQUIRIES.messages` sorted by timestamp. Production wires WebSocket later (per ROADMAP WS-1.D).
- **Dark mode.** Out of scope for this audit — the entire prototype lacks dark-mode tokens. Track separately.
- **Locked-tier upsell relocation.** Suggested to move to Settings → Plan; that's a Settings-page change, not an Overview change.

---

## 10. Where the work is in source

| Concern | File | Lines |
|---|---|---|
| Page entry | `_pages.tsx` | 2617–2954 (`OverviewPage`) |
| TodaysFocusCard | `_pages.tsx` | 2515–2614 |
| WorkspaceStatStrip | `_pages.tsx` | 2307–~2380 |
| PrimaryCard / SecondaryCard | `_primitives.tsx` | (search for `function PrimaryCard`) |
| Activation banner | `_pages.tsx` | (search for `WorkspaceActivationBanner`) |
| Mock page stats (to add) | `_state.tsx` | next to `MOCK_STOREFRONT_STATS` |
| Sparkline primitive (to add) | `_primitives.tsx` | next to `Skeleton` (~5690) |
| Timeline feed (to add) | new file `_timeline-feed.tsx` | — |
| Top Performers (to add) | new file `_top-performers.tsx` | — |

---

## 11. Acceptance criteria for "done"

A dev opening this audit and shipping all 7 phases should produce a page where:

- [ ] Section count is 5 (Header + Focus + Live + Stats + Top Performers), not 10
- [ ] No card on Overview links to a destination that's also a top-level sidebar entry
- [ ] At least 5 live events surface inline, sorted by timestamp, auto-refreshing
- [ ] Every numeric stat has a 3-week sparkline + WoW delta
- [ ] The header reads "Good morning, X · {weekday/date} · {synthesis line}"
- [ ] An inquiry past SLA threshold surfaces as a coral callout, not buried in an Operations card
- [ ] Top Performers tab switcher works (Talent ↔ Pages) and the time-range chip filters both
- [ ] Empty workspace renders an `<EmptyState>` with the activation flow promoted, not 5 sections of zeros
- [ ] `oldestWaitDays` calc uses `lastActivityHrs` (not the missing `ageDays` field)
- [ ] The page is shorter — pixel target: ≤2× the viewport at 1280×800. Currently ≥3×.
- [ ] `npx tsc --noEmit` exits 0 throughout
- [ ] Mobile renders without horizontal scroll at 375pt (defer pixel-perfect mobile to mobile-audit follow-up)
