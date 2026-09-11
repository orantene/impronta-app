# Appointments & Classes page — exact wiring for Package 2 (for fid-polish2)

Written by `wire-scheduling` on 2026-09-11. The Appointments & Classes
workspace page (`AppointmentsPage.tsx`, `SessionsTable.tsx`,
`SeriesTable.tsx`, `SessionPanel.tsx` under
`web/src/components/admin/shell/internal/page-modules/`) is owned by
`fid-polish2` this pass, so nothing below was applied. It is the exact
change, file by file, so whoever holds those files applies it without a
second reading of the contract (`docs/plans/program/engine/scheduling.md`).

Every action is imported from `@/lib/server-actions/scheduling-engine`
(never re-exported through POS actions). Every refusal maps through
`schedulingEngineSentence(reason, schedulingEngineSentences(t))` from
`@/lib/scheduling/engine-refusals` (or `t(engineRefusalKey(reason))` from
`page-modules/catalog/catalog-model` in a client component with `useT`):
`dashboard.scheduling.engine.refusal.<reason>` exists in en / es / fr for
every code the actions return, including `not_allowed`, `not_reschedulable`
and `slot_taken` added this pass.

## 1. `AppointmentsPage.tsx` header: `Generate sessions` and `New series`

Today (line ~242):

```tsx
<ActionButton reason={t(`${B}.generateOff`)}>{t(`${B}.generate`)}</ActionButton>
<ActionButton reason={t(`${B}.newSeriesOff`)} tone="primary">…{t(`${B}.newSeries`)}</ActionButton>
```

Replace with two live controls and one new client module
`SeriesEditor.tsx` (a sheet or inline card, the W10 board):

- `Generate sessions` opens a small form: one `<select>` over the series
  rows the page already holds (`SeriesRow[]`, option label `row.title`),
  one `<input type="date">` `untilDate` (default: today + 28 days on the
  venue clock, `utcToZonedYmd`). Submit:

  ```ts
  const res = await generateSessionsForSeriesAction({ seriesId, untilDate });
  if (!res.ok) setOutcome({ kind: "refused", text: sentence(res.reason) });
  else setOutcome({ kind: "done", text: interpolate(t(`${B}.generated`), { created: res.created, reused: res.reused }) });
  await reload(); // the page's existing schedule reload
  ```

  Add `${B}.generated` = "{created} sessions created, {reused} already
  existed." (en / es / fr). Delete `${B}.generateOff` once nothing reads it.
  With no series, keep the button disabled with `${B}.generateNoSeries`
  ("Create a series first.").

- `New series` opens `SeriesEditor` with a blank draft; the series table's
  row `Edit` (SeriesTable.tsx) opens it with the row. Fields, in the board's
  order: title, weekdays (seven toggles, ISO 1..7), local time (`HH:MM`),
  duration (minutes), seats, starts on / ends on (dates), room (a
  `<select>` over the workspace's venues: the page already loads rooms for
  the Room filter, reuse that list; the value is `venueId`), instructor (a
  `<select>` over staff members: `effectiveTeamMembers` from the shell
  state, value `userId`), item (`offeringId`, optional; the catalog list
  from `loadWorkspaceMenuForEditor`), active switch. Submit:

  ```ts
  const res = await upsertSessionSeriesAction({
    seriesId, title, localTime, timeZone: venueTimeZone, weekdays, durationMinutes,
    seats, startsOn, endsOn: endsOn || null, venueId, offeringId: offeringId || null,
    instructorUserId, isActive,
  });
  ```

  `no_instructor`, `overlapping_room`, `past`, `invalid`, `conflict` come
  back as sentences under the form; on `ok` close, reload, and select the
  series. `timeZone` is the venue's (`pickTimezone`), never the browser's.
  Delete `${B}.newSeriesOff` and `SeriesTable`'s `editOff` once wired.

## 2. `SessionPanel.tsx`: the four actions and the scope

Today the scope segments `future` / `series` carry `reason={t(`${K}.scopeOff`)}`
and three buttons carry `substituteOff` / `moveOff` / `cancelOff`.

- Scope: remove the `reason` on `future` and `series`; the `Scope` state
  (`"this" | "future" | "series"`) is exactly the engine's `scope`.

- `Substitute instructor`: opens a `<select>` over staff members (same list
  as the series editor) and a Confirm:

  ```ts
  const res = await sessionSetInstructorAction({ sessionId: row.id, userId, scope });
  // ok: interpolate(t(`${K}.substituted`), { updated: res.updated })
  ```

  Show the current instructor from `sessions.instructor_user_id` once the
  page's reader (`loadSchedule` → `SessionRow`) carries it; until then the
  select has no preselected value and says so with `${K}.instructorUnknown`.

- `Move participant`: on each participant row (the `AdmissionRosterEntry`
  list from `loadSessionParticipants`) add `Move…`; it opens a `<select>` of
  the other sessions of the same series (`rows.filter(r => r.seriesId === row.seriesId && r.id !== row.id && r.state !== "cancelled")`,
  label `whenLine(r, locale)`), then:

  ```ts
  const res = await sessionMoveParticipantAction({
    admissionId: entry.admissionId, toSessionId, operationKey: `move-${crypto.randomUUID()}`,
  });
  ```

  `sold_out` is the sentence when the target has no place. Reload the
  participants and the table on `ok`.

- `Cancel session`: a confirm card with a reason input (max 200) and the
  scope segment's value, then:

  ```ts
  const res = await sessionCancelAction({ sessionId: row.id, scope, reason, operationKey: `cancel-${crypto.randomUUID()}` });
  if (res.ok && res.refundIntents > 0) banner(t("dashboard.scheduling.engine.refusal.paid_seats_need_refund"));
  ```

  The command succeeds even when refunds are queued; the banner is the
  `paid_seats_need_refund` sentence, drawn as a note, not a refusal.
  `already_cancelled` and `sold_out` are refusals as usual.

- Customer link (A07 / R04): beside each participant with a booking (the
  appointments list's `AppointmentPanel`, not the class roster), add
  `Copy customer link ▾` with two entries, cancel and reschedule:

  ```ts
  const res = await signBookingManageTokenAction({ bookingId, action });
  if (res.ok) copy(`${window.location.origin}/manage/${res.token}`);
  ```

  The page that link opens is `web/src/app/(public)/manage/[token]/page.tsx`
  (this pass): storefront-themed, three languages, cancel or reschedule
  through `cancelBookingByManageToken` / `rescheduleBookingByManageToken`.

## 3. Messages to add (en / es / fr) and to delete

Add under `dashboard.adminAppointments.board`: `generated`,
`generateNoSeries`, `seriesEditor.*` (title, weekdays, time, duration,
seats, startsOn, endsOn, room, instructor, item, active, save, cancel),
`panel.substituted`, `panel.instructorUnknown`, `panel.moveTo`,
`panel.moveConfirm`, `panel.cancelReason`, `panel.cancelConfirm`,
`panel.copyLink`, `panel.copyLinkCancel`, `panel.copyLinkReschedule`.

Delete once unused: `board.generateOff`, `board.newSeriesOff`,
`board.series.editOff`, `panel.scopeOff`, `panel.substituteOff`,
`panel.moveOff`, `panel.cancelOff`. `message-key-usage.static.test`
fails on a new dead key, so delete in the same commit.

## 4. Decisions to record when applied

D-POS-18 and D-POS-35 close for these five controls. Record in
`docs/plans/program/pos/decisions.md` that the instructor on a session is
`sessions.instructor_user_id` (D-POS-70) and that a cancel with paid seats
queues refunds and never refunds inline.
