"use client";

/**
 * AppointmentsPage — the destination the registry calls `appts`.
 *
 * WHAT WAS HERE BEFORE. `SessionsPage`, alone: series, their occurrences and
 * the materialiser's refusals. That is a real surface and it stays, as one of
 * three views. What it never had was the thing the destination is NAMED for —
 * the appointments themselves — or the waitlist a full class needs, or any
 * sight of the booking-hours proposals that were being written on every
 * publish and read by nobody.
 *
 * THREE VIEWS, ONE ROUTE. The registry's sub-views for `appts` are states of
 * this page under a `view` query, exactly as Events' Tickets tab is: they are
 * not routes, and inventing three directories under `/admin/sessions` to hold
 * three tabs would put three page.tsx files in the tree that each render the
 * same component. The rail links carry `?view=`; this reads it.
 *
 * WHY THE PROPOSALS BANNER SITS ABOVE THE TABS. Somebody whose public booking
 * page says "no hours available" comes here to find out why. The answer must
 * be the first thing on the screen, not inside whichever tab they happen to
 * open. Same placement rule the refusals panel already follows on the Schedule
 * view, for the same reason.
 *
 * NOTHING HERE LOOKS AT A CLOCK. The buckets on each appointment row are
 * decided on the server and travel with the row, so what renders is decided
 * from data present at first paint.
 *
 * Rendered inside the shell's own <main>, so this returns a fragment. Token
 * classes only; inline styles are frozen under components/admin/shell.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useAdminShell } from "../state";
import { useT } from "@/i18n/use-t";
import { PageHeader } from "./pages-shared";
import { SessionsPage } from "./SessionsPage";
import { AppointmentsList } from "./AppointmentsList";
import { AppointmentsWaitlist } from "./AppointmentsWaitlist";
import { BookingHoursProposalsBanner } from "./BookingHoursProposalsBanner";
import {
  loadAppointments,
  loadBookingHoursProposals,
  loadSessionWaitlists,
  type BookingHoursProposalRow,
  type WaitlistView,
} from "@/lib/scheduling/appointments-actions";
import type { AppointmentRow } from "@/lib/scheduling/appointments-board";

const K = "dashboard.adminAppointments";

/** The three views, and the `view` query value that selects each. */
export const APPOINTMENT_VIEWS = ["list", "sessions", "waitlist"] as const;
export type AppointmentView = (typeof APPOINTMENT_VIEWS)[number];

function viewFromQuery(raw: string | null): AppointmentView {
  return (APPOINTMENT_VIEWS as readonly string[]).includes(raw ?? "")
    ? (raw as AppointmentView)
    : "list";
}

export function AppointmentsPage() {
  const { bridgeTenantIdentity, adminBasePath } = useAdminShell();
  const searchParams = useSearchParams();
  const t = useT();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;

  const [view, setView] = useState<AppointmentView>(() =>
    viewFromQuery(searchParams.get("view")),
  );
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  const [waitlists, setWaitlists] = useState<WaitlistView[] | null>(null);
  const [proposals, setProposals] = useState<BookingHoursProposalRow[]>([]);
  const [defaultTimezone, setDefaultTimezone] = useState("UTC");
  const [timeZone, setTimeZone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);

  // A rail link changes the query without remounting the page module, so the
  // tab follows the URL rather than only seeding from it.
  const queryView = viewFromQuery(searchParams.get("view"));
  useEffect(() => {
    setView(queryView);
  }, [queryView]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setError(null);
    // A REJECTED action must not leave the page loading for ever. Without this
    // catch the promise rejects, the state stays null, and the screen shows
    // "Loading the appointments..." permanently with nothing in the console,
    // which is indistinguishable from a slow server.
    try {
      const [board, queue, pending] = await Promise.all([
        loadAppointments(tenantId),
        loadSessionWaitlists(tenantId),
        loadBookingHoursProposals(tenantId),
      ]);

      if (board.ok) {
        setRows(board.rows);
        setTimeZone(board.timeZone);
      } else {
        setRows([]);
        setError(board.error);
      }

      if (queue.ok) setWaitlists(queue.sessions);
      else {
        setWaitlists([]);
        setError((prev) => prev ?? queue.error);
      }

      // A proposal read that refuses hides the banner rather than blanking the
      // page: the appointments are still worth showing, and the refusal is
      // surfaced above them like any other.
      if (pending.ok) {
        setProposals(pending.proposals);
        setDefaultTimezone(pending.defaultTimezone);
      } else {
        setProposals([]);
        setError((prev) => prev ?? pending.error);
      }
    } catch (err) {
      setRows([]);
      setWaitlists([]);
      setProposals([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!tenantId) {
    return (
      <>
        <PageHeader title={t(`${K}.title`)} />
        <div className="p-6 text-sm text-admin-ink-muted">{t(`${K}.noTenant`)}</div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t(`${K}.title`)} subtitle={t(`${K}.subtitle`)} />

      {error ? (
        <div className="mb-[16px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[16px] text-[13.5px] text-admin-ink">
          {error}
        </div>
      ) : null}

      <BookingHoursProposalsBanner
        proposals={proposals}
        defaultTimezone={defaultTimezone}
        onAccepted={() => void refresh()}
      />

      <div className="mb-[16px] flex flex-wrap gap-[8px]" role="tablist">
        {APPOINTMENT_VIEWS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            data-testid={`appointments-tab-${id}`}
            className={
              view === id
                ? "rounded-admin border border-admin-border-strong px-3 py-2 text-admin-ink"
                : "rounded-admin border border-admin-line px-3 py-2 text-admin-ink-muted"
            }
            onClick={() => setView(id)}
          >
            {t(`${K}.tabs.${id}`)}
          </button>
        ))}
      </div>

      {view === "sessions" ? (
        // The Schedule surface, whole and unchanged, as one view of this
        // destination. Its own header is suppressed: this page already named
        // itself, and two headings stacked reads as a broken layout.
        <SessionsPage embedded />
      ) : view === "waitlist" ? (
        waitlists === null ? (
          <div className="p-6 text-sm text-admin-ink-muted">{t(`${K}.waitlist.loading`)}</div>
        ) : (
          <AppointmentsWaitlist
            tenantId={tenantId}
            sessions={waitlists}
            timeZone={timeZone}
            onChanged={() => void refresh()}
          />
        )
      ) : rows === null ? (
        <div className="p-6 text-sm text-admin-ink-muted">{t(`${K}.loading`)}</div>
      ) : (
        <AppointmentsList
          tenantId={tenantId}
          rows={rows}
          adminBase={adminBasePath}
          onChanged={() => void refresh()}
        />
      )}
    </>
  );
}
