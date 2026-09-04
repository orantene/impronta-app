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

## ADDENDUM — the exact registration sites, measured on `origin/main @ 16c07993c`

**Added by the Sessions, Events & Reservations director so this needs no investigation.** The island is **already merged** at `web/src/lib/site-admin/builder-node/reserve-table-island.tsx`. Only the registry is missing.

Measured: `reserve_table` appears **0 times** in every file the `menu_board` precedent touches.

| File | What to add | Copy the precedent at |
|---|---|---|
| `builder-node/create.ts` | `case "reserve_table":` factory | `:232` (`case "menu_board":`) |
| `builder-node/drop-policy.ts` | the allow-list entry | `:34` |
| `builder-node/mvp-allow-list.ts` | the **category** mapping | `:108` — `menu_board: "actions"` |
| `builder-node/mvp-allow-list.ts` | the **search keywords** | `:189` |

**Four entries, three files, one precedent.** Everything else — props, defaults, `ctaVerb` sourced from the terminology setting, `partyMin`/`partyMax` as display bounds the server re-derives — is in the body above.

### The search keywords are not cosmetic

`menu_board`'s line reads *"menu orderable items quantities checkout restaurant catering workspace menu"*. That string is **how a tenant finds the block in the picker**. A registered block nobody can search for is present and invisible — the same failure class as a segment with no icon.

Suggested: `reservations table booking party size restaurant book a table host`.

### A fifth registration nobody's contract captured

Found by Workspace & Dashboards while shipping the rail segments: **the rail icon comes from `SIDEBAR_ICON[page]`, not `PAGE_META`.** A registered segment without it **silently falls back to a circle**.

**It fails the same way a missing route file does — looking half-built rather than mis-registered.** That distinction is what makes a missing registration expensive: nobody files a bug against *"mis-registered"*, they file one against *"the feature is broken"*, and it gets triaged as engineering rather than as a one-line omission.

### The general lesson, which cost a night to learn

A workspace segment needs **five** registrations; a builder block needs **four**. **No single document held either set until tonight**, and each was discovered by shipping one and finding what was missing.

**The cost of a new surface here is not the surface — it is the registration set, and the set was only discoverable by shipping one.** Both sets are now written down: segments in the three `*-rail-slot-contract.md` files, blocks here.
