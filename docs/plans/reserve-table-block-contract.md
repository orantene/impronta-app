# `reserve_table` — block contract for the builder registry

From the Reservations Manager to the Page Builder Director, via the Sessions, Events & Reservations
Director, to be batched with Sessions' and Events' blocks as one registry PR.

**My half is done and on main.** The island renders and the server action answers; what is missing is
the registry entry that lets a tenant drag it onto a page. Per the standing rule I do not edit
`builder-node/` registration myself.

---

## What it is

The public block a guest books a table from. Party, date, service window, time, name, email. **No floor
plan and no table picking** — a guest books "a table for four at eight", and which table that becomes is
the host's job at the door.

## Entry point

```
web/src/lib/site-admin/builder-node/reserve-table-island.tsx
  export function ReserveTableIsland(props: Props)
```

Client component. It dynamically imports its own server action
(`@/app/(public)/_reserve/reserve-actions`), so **the registry needs to pass props only** — no data
loader, no server fetch, no `native-data-block-needs` entry. That is deliberate: a static import of a
`"use server"` file pulls it into the client bundle, and the public menu board solves it the same way.

## Props

| Prop | Type | Default | Editor should show |
|---|---|---|---|
| `tenantId` | `string` | — | not shown; supplied by the renderer |
| `venueName` | `string` | — | text, prefilled from the venue |
| `ctaVerb` | `string` | `"Reserve"` | **not a free text field** — a choice from the workspace terminology setting (Reserve / Book / Order / Ask), so a barbershop that picked Agenda cannot end up with a button saying Reserve |
| `partyMin` | `number` | `1` | number; **prefill from `venue_service_rules`, do not duplicate it** |
| `partyMax` | `number` | `8` | number; same |
| `cardNotice` | `string \| null` | `null` | text; shown only when the venue asks for a card |
| `notesEnabled` | `boolean` | `true` | toggle; mirrors the venue setting |
| `onAskFirst` | `() => void` | — | not shown; wired by the renderer to the chat launcher |

**`partyMin` / `partyMax` are display bounds only.** The server re-derives them from
`venue_service_rules` and refuses anything outside, so a block edited to `partyMax: 500` offers times and
then refuses the booking with a reason. They are there so the stepper does not offer obvious nonsense,
not as a gate.

## What the editor should show when it cannot work

The block is useless without a venue, a service window and at least one band group. **Rendering an empty
grid is the failure mode to avoid** — it looks broken rather than unconfigured. Preferred: the editor
preview says which of the three is missing and links to Settings → Reservations.

## THE ENTRY THAT MAKES OR BREAKS IT: the kind-to-component case in `render.tsx`

**Added after the first version of this contract omitted it.** Without this entry the block
places in the builder, shows in the editor, saves, publishes — **and renders nothing on the published
page.** A guest gets an empty space. No error, no failed test, no anomalous row. It is the exact defect
this contract exists to prevent, and the first draft would have caused it.

`render.tsx` has a `case "<kind>":` mapping a node kind to what actually renders. `reserve_table` needs
one, and it is simpler than `menu_board`'s: **it takes nothing from `options.dataSources`**, because the
island fetches its own availability through a dynamically imported server action.

**But it must still render the island, not a placeholder, and here is the trap:** the published page is
server-rendered first. The island's initial state is `{ status: "loading" }`, which renders *"Checking
the book…"* — a visible state. **If the case renders nothing until the client resolves, a guest on a slow
connection sees a blank space**, which is the same failure as omitting the case entirely, arriving one
step later. `menu_board`'s own comment says it: *an absent or empty source must still produce a visible
empty state rather than a blank page.*

## What it does NOT need

- **No `native-data-block-needs` entry — verified, not assumed.** That file is an opt-in visitor
  (`if (node.kind === ...)`), so a kind that is absent simply gets no server data, which is exactly
  right here. Absence is safe **because** the island fetches its own.

- **This contract is not a count of sites.** An earlier hand-off listed four registration entries and
  was corrected to thirteen. Neither number is the thing to copy: `menu_board` appears in fifteen-plus
  files on main, and several are menu-specific — page designs, homepage data sources, link targets —
  where `reserve_table` has no business. **The list to work from is "where does a block of this shape
  need to appear", not "where does `menu_board` appear"**, and the difference is the same
  over-generalisation that turned one real security fix into a rule that would have broken a working
  view.
- No new path in `surface-allow-list.ts`. **A server action posts to the page's own URL**, so this block
  adds no surface. Worth stating loudly, because three managers queued for that file this week and this
  one did not need to.
- No i18n catalog keys yet. Refusal copy is in the island; when the words table lands it reads from
  there. Flagging rather than hiding it: the strings are English-only today.

## Proof it renders

A hand-composed page is not enough on its own. The QA row at `docs/plans/phase-boundary-qa.md` names the
page and requires the island **rendered end to end on a real tenant**, because "complete and callable but
never rendered" is the recorded *documented as wired, resolves to nothing* shape.

---

Reservations Manager, 2026-09-04.

---

## ADDENDUM v3 — **PR #1689 IS AUTHORITATIVE OVER THIS ADDENDUM.** Read that one.

**Both earlier versions of this addendum were wrong, in opposite directions, and the pair is the lesson.**

| | Method | Result |
|---|---|---|
| **v1** | sampled ONE precedent site and generalised | **four** sites — omitted `render.tsx`, the entry without which the block **publishes and renders nothing** |
| **v2** | grepped every file containing `menu_board` | **thirteen** — included sites where a reservation block has no business |
| **v3** | ask, per site, *what does a block of this shape need* | **see #1689**, written by the area that owns the block |

**Neither counting method was the method.** Sampling gave too few; grepping gave too many. **The list to work from is "where does a block of this shape need to appear", not "where does `menu_board` appear"** — `menu_board` is in fifteen-plus files on main, several of them menu-specific: page designs, homepage data sources, link targets. **A thirteen-site list applied mechanically puts a reservation block in the restaurant page-design template.**

**One entry from v2 is confirmed WRONG and removed:** `native-data-block-needs.ts` is *"a pure walk over a builder tree for native data-block fetch needs"* — an **opt-in visitor**. A kind absent from it simply gets no server data, and `reserve_table` resolves its own availability through a server action. **No entry needed.** Verified in the file's own header.

**The entry v1 omitted stands and is the one that matters most:** `render.tsx:5409`, the kind → component `case`. Without it the block places, shows in the editor, saves, publishes — **and renders nothing on the published page.** No error, no failed test, no anomalous row. And one step past it: **the case must render the ISLAND, not a placeholder**, because the island's initial state renders a visible "Checking the book…" while a case that renders nothing until the client resolves gives a guest on a slow connection a blank space — the same failure arriving one step later.

### Why this correction belongs on the owning manager's file, not this one

The omission was **in the original contract too** (#1648): it enumerated props, defaults, the entry point, the editor state, and what the block does *not* need — **and never mentioned `render.tsx`.** So v1 of this addendum was partly reading that hand-off back. **A contract that enumerates what a thing does not need, and omits the one entry that makes it visible, is worse than no contract, because it reads as complete.**

### The transferable rule, which this document has now demonstrated three times

**A correction carries more authority than the original claim and gets verified less** — it arrives with the implicit assurance that somebody already checked. v1 said *"this needs no investigation"*: the strongest form of that assurance and the least earned. v2 then over-corrected by substituting a `grep` for a judgement.

**A count is not an enumeration, and a grep is not a specification.** When correcting a list, state the method you used to build it, so the next reader can judge whether it over- or under-reaches.

