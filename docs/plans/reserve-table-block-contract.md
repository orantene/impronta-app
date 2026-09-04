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

## What it does NOT need

- No `native-data-block-needs` entry — it fetches its own data client-side through the action.
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

## ADDENDUM v2 — the registration sites. **v1 OF THIS ADDENDUM WAS WRONG. Do not use it.**

**CORRECTION NOTICE.** The first version of this addendum named **four** sites and said *"only the registry is missing"* and *"this needs no investigation."* **Both statements were false.** There are **thirteen entries across eleven files**, and v1 omitted the single most important one — `render.tsx`. Caught by the CEO against the Workspace & Dashboards Director's audit; **every line below is re-measured on `origin/main` by the author of the mistake.**

**A confidently incomplete map is more dangerous than an admitted gap**, and this one arrived *as a correction* — the form that gets verified least. See the closing note.

### The thirteen entries, measured: `menu_board` present in each, `reserve_table` at **zero** in all

| # | File | Entry | Precedent |
|---|---|---|---|
| 1 | `builder-node/types.ts` | the node-kind union | 2 refs |
| 2 | `builder-node/registry.ts` | registry entry | 2 refs |
| 3 | **`builder-node/render.tsx`** | **the `case` that maps kind → component** | **`:5409`** |
| 4 | `builder-node/create.ts` | the factory `case` | `:232` |
| 5 | `builder-node/drop-policy.ts` | drop-policy entry | `:34` |
| 6 | `builder-node/mvp-allow-list.ts` | **category** | `:108` |
| 7 | `builder-node/mvp-allow-list.ts` | **search keywords** | `:189` |
| 8 | `builder-node/mvp-allow-list.ts` | **the allow-list array** | `:267` |
| 9 | `builder-node/native-data-block-needs.ts` | data-needs declaration | 1 ref |
| 10 | `edit-chrome/inspectors/builder-node-content.tsx` | inspector panel | 3 refs |
| 11 | `edit-chrome/canvas-node-child-secondary-label.ts` | layer label | 1 ref |
| 12 | `add-gallery/registry-catalog-sections-connected.ts` | palette catalog | 1 ref |
| 13 | `add-gallery/section-templates.ts` | palette template | 1 ref |

The island itself is **already merged** at `builder-node/reserve-table-island.tsx`.

### Why #3 is the one that matters most, and why omitting it was the worst possible omission

**Without `render.tsx`, the block places in the builder and RENDERS NOTHING ON THE PUBLISHED PAGE.** A tenant drags it in, sees it in the editor, publishes, and a guest gets an empty space. **That reads as "the feature was never built" rather than "a registration is missing"** — so it gets triaged as engineering rather than as a one-line omission.

That is this repo's most-recorded failure family: *documented as wired, resolves to nothing.* **v1 of this addendum would have caused exactly the defect this contract exists to prevent.**

### Two more v1 got wrong

**`mvp-allow-list.ts` has THREE entries, not two.** The array at `:267` is the third, and **without it the block is filtered out of the insertable set** — registered, categorised, searchable, and impossible to insert.

**The palette and chrome files are not optional.** Missing #10 and #11 gives a block with no inspector and an unlabelled layer: placeable, unconfigurable, and unidentifiable in the layer tree.

### Search keywords are not cosmetic

`menu_board`'s line reads *"menu orderable items quantities checkout restaurant catering workspace menu"* — that string is **how a tenant finds the block in the picker.** A registered block nobody can search for is present and invisible.

Suggested: `reservations table booking party size restaurant book a table host`.

### A fifth registration for workspace SEGMENTS, from the same audit

The rail icon comes from **`SIDEBAR_ICON[page]`, not `PAGE_META`** — a registered segment without it **silently falls back to a circle**, failing the same way a missing route file does: looking half-built rather than mis-registered.

### The lesson, which this document is itself an instance of

A workspace segment needs **five** registrations; a builder block needs **thirteen**. **No single document held either set**, and each was discovered by shipping one and finding what was missing.

**And v1 of this addendum was a correction that was itself wrong.** Three separate paths tonight were amplified by three people without anyone looking them up, and the durable form is: **a correction carries more authority than the original claim and gets verified less** — it arrives with the implicit assurance that somebody already checked. **This addendum said "needs no investigation," which is the strongest form of that assurance and the least earned.** Never write that phrase again without having enumerated the set rather than sampled it.
