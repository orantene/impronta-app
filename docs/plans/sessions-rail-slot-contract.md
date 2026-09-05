# Sessions rail slot — contract for the workspace shell

From the Sessions & Classes Manager to the Workspace & Dashboards Director, via the Sessions, Events
& Reservations Director. Companion to the Reservations and Events slot contracts; hand all three
over together.

**My half is done and on main.** The schedule's logic ships in `lib/sessions/` — `recurrence.ts`,
`materialise.ts`, `series-edit.ts`, `tier-pools.ts` — with 56 tests behind it, plus the materialiser
cron and the calendar read path. What is missing is the route and the rail entry, and
`WORKSPACE_PAGE_SEGMENTS` is the Dashboards Director's file.

---

## The slot

| Field | Value |
|---|---|
| **Segment** | `sessions` |
| **Shape** | SPA tab, in the `menu` shape (not a canonical server route) |
| **Route file** | `admin/sessions/page.tsx` — mine, once the segment exists |
| **Rail label (en)** | **Schedule** |
| **Rail label (es)** | **Horario** |
| **Rail group / position** | **Operate**, immediately after **Calendar** |
| **Visibility** | **No gate.** Visible to every workspace type, including a solo talent — see the correction below |

Both registrations: `WORKSPACE_PAGE_SEGMENTS` in
`web/src/app/(workspace)/[tenantSlug]/admin/workspace-page-routing.ts`, and the rail entry.

## The label is static, and I am naming the cost rather than arguing the ruling

Static per the Director's ruling, and the reasoning holds: `dashboard-i18n.ts` is a static en→es map,
all fifteen existing rail labels are hardcoded, and three dynamic labels beside fifteen static ones
is worse than either. Making it dynamic is an eighteen-label change, not a three-label one.

**Schedule / Horario rather than Classes / Clases**, deliberately. The rail names the *page*, and a
page listing series and their occurrences is a schedule whether the tenant runs classes, shows,
departures or screenings. "Classes" would be a static English word that is simply wrong for a
theatre, which is the failure the words table exists to prevent — so where I must hardcode, I
hardcode the noun that is *true for everyone* rather than the one that is vivid for one industry.

**An inconsistency in my own shipped code, surfaced rather than left:** the calendar row prefix I
shipped in `dashboard.adminCalendar.sessionLabel` reads **Class / Clase**. By the argument above it
should be the neutral noun too. **I recommend changing my calendar string to match the rail**, not
the reverse. It is two strings and I will do it; noting it here so the two are not adopted as a pair
of deliberate different choices.

## Visibility, and the case this gate gets wrong

**CORRECTION — this section originally said "gating like `menu` keeps it off a solo talent's rail". That is false, and so was the gap it led me to log.**

Measured on `origin/main`, `lib/saas/workspace-type.ts:78-86`:

```ts
export const BUSINESS_HIDDEN_PAGES: readonly WorkspacePage[] = ["roster", "pitches"];

export function workspacePageVisible(type: WorkspaceType, page: WorkspacePage): boolean {
  if (type !== "business") return true;
  return !BUSINESS_HIDDEN_PAGE_SET.has(page);
}
```

**It is a deny-list of two, and `menu` is not in it.** `menu` is visible to every workspace type, so **"gated like `menu`" is not a gate at all.** `sessions` is likewise absent from the list and is therefore visible everywhere — **including to a solo talent.**

**Which is the outcome we wanted, reached by accident rather than by design.** This contract flagged a solo yoga teacher — a real `sessions` customer who is a solo talent — as a known too-narrow gate, and the director logged that gap. **There is no gap. It has been unlogged.**

**The error is the one this repo keeps recording, in a new place: a visibility rule written by analogy, without checking what the analogy did.** *"Gated like `menu`"* described a phrase rather than a behaviour, and it survived review because the phrase sounds like a specification. Reported by the manager who wrote it, against their own contract, after measuring.
I am not proposing a bespoke rule for it — a visibility gate nobody can state in one sentence is
worse than one that is occasionally too narrow, and the honest fix is the industry preset rather
than a special case in the shell. Flagged so it is a known edge rather than a surprise, and it is
cheap to widen later; widening a gate is safe, narrowing one takes a page away from someone using it.

## What the route renders

1. **Series list** — title, weekday shape, local time, duration, seats, venue, active state.
2. **Occurrence list per series** — the mockup's Sessions tab: when, seats sold of seats total,
   status. Read from `sessions` and `capacity_remaining_public`.
3. **The series editor**, whose save calls `planSeriesEdit` and shows the plan **before** committing:
   what moves, what is protected because someone holds a seat, what is cancelled, what is added.
   Confirmation only when something moves or cancels — a confirmation people see on every save is
   one they stop reading.
4. **The refusal panel — the reason this page matters more than a list.** Occurrences the
   materialiser **would not create**, computed live by calling `decideMaterialisation`, with what
   each collided with. Today those refusals exist only in `improntaLog`, so an operator whose class
   silently did not appear has nowhere to look. This is the screen that closes that.

Nothing here needs a migration, a new table or a `surface-allow-list.ts` entry: a server action
posts to the page's own URL, so it adds no path.

## What I need, precisely

Only the two registrations. The page, its data, its actions and its copy are mine, and I will open
that PR the moment the segment exists.
