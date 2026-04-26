# Admin shell — QA plan

The structure for the page-by-page design QA. Companion to the live
tracker at [`./qa-tracker.md`](./qa-tracker.md).

## The 9-question checklist

Apply to every page. Each question gets one of three answers:
**PASS** / **MINOR** (one-line fix) / **MAJOR** (separate ticket).

1. **First impression** — what does someone NEW see in the first
   3 seconds? Does it match the page's purpose?
2. **Visual hierarchy** — what's most prominent? Is it the right
   thing? Anything competing for attention?
3. **Copy pass** — every label, eyebrow, button, microcopy line.
   Sentence case where it should be? Plain English? Verb-first CTAs?
   Any jargon?
4. **Empty / zero-state** — what does the page look like with no
   data? Helpful or sad?
5. **Edge cases** — long client names, large numbers (9999+),
   missing fields, very-stale dates.
6. **Interactions** — hover states consistent, focus rings visible,
   click targets ≥44px on mobile, no dead CTAs.
7. **Mobile** — at 375px and 720px: anything overflow, anything
   cramped, bottom-nav blocking content.
8. **A11y** — contrast on chips/badges, keyboard tab order,
   screen-reader landmarks, aria-labels on icon-only buttons.
9. **Cross-surface consistency** — does this page look/feel like a
   sibling? Same primitives, same spacing rhythm?

## Session structure (30 min per page)

```
0–2 min   Open the page on desktop. First impression.
2–10 min  Walk the 9 checklist items in order.
10–18 min Propose fixes (live in chat).
18–25 min Execute the fixes that are safe (color, copy, spacing, a11y).
25–30 min Verify on localhost. Commit. Move to next page.
```

For pages with deeper issues (a redesign, not a polish), scope a
separate ticket and move on — don't get stuck.

## Two parallel tracks

The audit runs on **two layers**:

**Layer 1 — Templates / components.** The reusable building blocks
that appear across many pages: `<StatusCard>`, `<PrimaryCard>`,
`<DrawerShell>`, `<PageHeader>`, the topbars, the search/sort/filter
pattern, the chip primitives, etc. Fixing one of these fixes every
page that uses it. This is where leverage is highest.

**Layer 2 — Pages.** The per-page audit catches:
- Page-specific copy
- Information architecture
- Hero metric content
- Empty / edge state messaging
- Anything specific to that route

Run **Layer 1 first** so component fixes cascade. Then Layer 2 per
page just catches the integration + per-page issues.

## Wave order

See [`./qa-tracker.md`](./qa-tracker.md) for the live status of each.

| Wave | What | ~Sessions | ~Time |
|---|---|---|---|
| **0** | Template / component QA — primitives + recurring patterns | 4 | 2.5h |
| **A** | Workspace · Overview / Inbox / Workflow / Talent | 4 | 2h |
| **B** | Workspace · Clients / Calendar / Public site | 3 | 1.5h |
| **C** | Workspace · Billing / Settings | 2 | 1h |
| **D** | Talent · Today / Profile / Inbox / Calendar / Activity / Settings | 3 | 1.5h |
| **E** | Client · Today / Discover / Shortlists / Inquiries / Bookings / Settings | 3 | 1.5h |
| **F** | Platform · Today / Tenants / Users / Network / Billing / Operations / Settings | 2 | 1h |
| **G** | Drawers (~150) batched per surface, heavy ones first | 4 | 2h |
| **H** | Cross-cutting: contrast / Today consistency / Settings consistency / final copy | 1 | 1h |

**Total: ~22 sessions, ~12 hours.** Split into working sessions
of 1–2 hours.

## Input formats

Either pattern works:

**You drive (most flexible):**
- Paste a screenshot + comment
- I slot the finding into the right page's tracker row, propose a fix

**I drive (more thorough):**
- You message: `QA session · A1`
- I open the URL, walk the 9-question checklist top-to-bottom
- React with yes/no/defer per item
- I ship the yes-items in a single commit, update the tracker

**Optional power-up: Claude Chrome extension**
- I see your active tab in real time
- I screenshot, walk the checklist, take notes, and ship fixes — all
  while you just narrate
- 5-min setup; lets you skip the screenshot-and-paste step

## Output per session

Three artifacts:
1. **Updated tracker row** — the page's checklist filled in with
   PASS / MINOR / MAJOR + notes
2. **Commit** — MINORs shipped together as one git commit referenced
   in the tracker row
3. **Tickets for MAJORs** — added to
   [`./production-handoff.md`](./production-handoff.md) or written as
   their own redesign brief if scoped large enough

## Stop criteria

We stop a session early if any of these hit:
- The page reveals a structural redesign that needs design + product
  alignment before code (we ticket it, move on)
- Three consecutive MINORs land but verification fails (something
  larger is wrong; pause and diagnose)
- We've spent more than 45 min on one page (move on; flag the
  remaining items as a follow-up)

## How "complete" looks

A page is ✅ complete when:
- All 9 checklist items have an answer (PASS / MINOR-shipped / MAJOR-ticketed)
- The tracker row links to the commit hash
- Any MAJORs have either a `production-handoff.md` ticket number or
  a redesign brief filename

When every page is ✅, the prototype is design-locked v1. Production
wiring (per `production-handoff.md`) becomes the next phase.
