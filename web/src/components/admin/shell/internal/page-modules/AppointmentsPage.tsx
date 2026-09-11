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

import { useCallback, useEffect, useRef, useState } from "react";
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
  // Upcoming sessions the desk could not answer for. Carried so the waitlist
  // view can say a sentence about a list that is short, rather than letting a
  // failed seat read look like a workspace with nothing full in it.
  const [unreadableSessions, setUnreadableSessions] = useState(0);
  // How far ahead the desk looked, and whether there was more. Carried so a
  // capped list can say so instead of reading as "nothing is full".
  const [checkedAhead, setCheckedAhead] = useState(0);
  const [truncated, setTruncated] = useState(false);
  // Set when the operator arrives from a full class on the Sessions view.
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<BookingHoursProposalRow[]>([]);
  const [defaultTimezone, setDefaultTimezone] = useState("UTC");
  const [timeZone, setTimeZone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);
  // THE LAST REFRESH ASKED FOR IS THE ONLY ONE ALLOWED TO PAINT. Every write on
  // the waitlist card calls `refresh`, and a read here is not quick: the desk
  // asks the engine for the seats of every upcoming class. So "offer the
  // place" started a read, "they took it" started a second, and the FIRST
  // came back last and painted the row back to "Offered" over a seat the
  // database had already committed. Seen in a browser: the notice said "Beto
  // has the place" under a row that still offered it. A stale answer is
  // dropped by comparing its ticket to the latest one issued.
  const refreshTicket = useRef(0);

  // A rail link changes the query without remounting the page module, so the
  // tab follows the URL rather than only seeding from it.
  const queryView = viewFromQuery(searchParams.get("view"));
  useEffect(() => {
    setView(queryView);
  }, [queryView]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const ticket = refreshTicket.current + 1;
    refreshTicket.current = ticket;
    setError(null);
    // A REJECTED action must not leave the page loading for ever. Without this
    // catch the promise rejects, the state stays null, and the screen shows
    // "Loading the appointments..." permanently with nothing in the console,
    // which is indistinguishable from a slow server.
    try {
      const [board, queue, pending] = await Promise.all([
        loadAppointments(tenantId),
        loadSessionWaitlists(tenantId, focusSessionId),
        loadBookingHoursProposals(tenantId),
      ]);
      if (refreshTicket.current !== ticket) return;

      if (board.ok) {
        setRows(board.rows);
        setTimeZone(board.timeZone);
      } else {
        setRows([]);
        setError(board.error);
      }

      if (queue.ok) {
        setWaitlists(queue.sessions);
        setUnreadableSessions(queue.unreadableSessions);
        setCheckedAhead(queue.checkedAhead);
        setTruncated(queue.truncated);
      } else {
        setWaitlists([]);
        setUnreadableSessions(0);
        setTruncated(false);
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
      if (refreshTicket.current !== ticket) return;
      setRows([]);
      setWaitlists([]);
      setUnreadableSessions(0);
      setTruncated(false);
      setProposals([]);
      setError(err instanceof Error ? err.message : String(err));
    }
    // `focusSessionId` is a dependency because the desk must be re-read with
    // the class the operator just opened, or the door leads to a card that is
    // not there.
  }, [focusSessionId, tenantId]);

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
        //
        // It hands back a session id when an operator wants to queue somebody
        // for a class that is full. That is where they NOTICE it is full, so
        // that is where the door belongs; this switches the view and the
        // waitlist opens on that card.
        <SessionsPage
          embedded
          onOpenWaitlist={(sessionId) => {
            setFocusSessionId(sessionId);
            setView("waitlist");
          }}
        />
      ) : view === "waitlist" ? (
        waitlists === null ? (
          <div className="p-6 text-sm text-admin-ink-muted">{t(`${K}.waitlist.loading`)}</div>
        ) : (
          <AppointmentsWaitlist
            tenantId={tenantId}
            sessions={waitlists}
            unreadableSessions={unreadableSessions}
            checkedAhead={checkedAhead}
            truncated={truncated}
            timeZone={timeZone}
            focusSessionId={focusSessionId}
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
