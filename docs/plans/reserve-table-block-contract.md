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
