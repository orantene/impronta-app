"use client";

/**
 * AppointmentsList — the Appointments tab: today and what is coming, in the
 * Sessions table's own language (board W39): a grouped table with WHEN ·
 * WITH · SERVICE · SERVING · ROOM · STATE · NEXT, one next action per row.
 *
 * THE BUCKETS ARRIVE, THEY ARE NOT COMPUTED HERE. `loadAppointments` decides
 * "today" against the workspace's own zone and stamps it on each row. This
 * component never calls `new Date()` for layout: a row that is upcoming when
 * the server renders and today when the browser hydrates is a mismatch nothing
 * else in the build can see, and it is invisible in every server check.
 *
 * ONE ACTION, AND ONLY IF IT WORKS. `nextActionFor` derives the button from the
 * same status set `reschedule_booking_set` will actually move, so this screen
 * never offers a control the RPC would refuse. A cancelled row says it is
 * cancelled instead of growing a Move button that fails when pressed.
 *
 * THE ROW SAYS WHAT STATE IT IS IN (D-106): `bookingStateKey` maps the stored
 * status to one catalogue sentence, in operator words rather than database
 * ones. The move itself lives in the right panel (`AppointmentPanel`), which
 * is where a selected row's facts and its one form belong.
 *
 * Rows are `<tr>` (the appointments journey finds one by the customer's
 * name) and the time cell carries the day, so "Sat, Sep 12" is on the row
 * after a move and not only in a heading above it.
 */

import { useT } from "@/i18n/use-t";
import {
  bookingStateKey,
  groupAppointments,
  type AppointmentRow,
  type BookingStateKey,
} from "@/lib/scheduling/appointments-board";
import { Icon } from "../primitives";
import { CARD, StatePill, type PillTone } from "./appointments-classes-ui";
import { formatWhen } from "./appointments-format";

const K = "dashboard.adminAppointments";

const ROW_GRID = "grid grid-cols-[132px_1.2fr_1fr_1fr_1fr_150px_24px] items-center gap-[10px] px-[16px] *:min-w-0";

const STATE_TONE: Record<BookingStateKey, PillTone> = {
  draft: "slate",
  tentative: "indigo",
  confirmed: "green",
  in_progress: "green",
  completed: "indigo",
  cancelled: "critical",
  archived: "slate",
  unknown: "coral",
};

type Props = {
  rows: AppointmentRow[];
  adminBase: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** "Move it" on a row: select it and open the move form in the panel. */
  onMove: (id: string) => void;
};

export function AppointmentsList({ rows, adminBase, selectedId, onSelect, onMove }: Props) {
  const t = useT();

  if (rows.length === 0) {
    return (
      <div className={`${CARD} max-w-[560px] p-[24px] font-admin-body`}>
        <div className="text-[15px] font-semibold text-admin-ink">{t(`${K}.empty.title`)}</div>
        <p className="mt-[8px] text-[13.5px] leading-[1.5] text-admin-ink-muted">{t(`${K}.empty.body`)}</p>
      </div>
    );
  }

  return (
    <div className={`${CARD} overflow-hidden`} data-testid="appointments-table">
      <div className={`${ROW_GRID} py-[8px] font-admin-body text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted`}>
        <span>{t(`${K}.col.when`)}</span>
        <span>{t(`${K}.col.withWhom`)}</span>
        <span>{t(`${K}.col.service`)}</span>
        <span>{t(`${K}.col.servedBy`)}</span>
        <span>{t(`${K}.col.place`)}</span>
        <span>{t(`${K}.col.state`)}</span>
        <span />
      </div>
      {groupAppointments(rows).map((group) => (
        <GroupRows
          key={group.bucket}
          bucket={group.bucket}
          heading={t(`${K}.bucket.${group.bucket}`)}
          rows={group.rows}
          adminBase={adminBase}
          selectedId={selectedId}
          onSelect={onSelect}
          onMove={onMove}
        />
      ))}
    </div>
  );
}

/**
 * One bucket: its heading and its rows, in one `<div>` so the bucket a row
 * sits under is a fact about the DOM (the journey asserts a timed booking is
 * not under "No date agreed yet" by looking inside that group).
 */
function GroupRows({
  bucket,
  heading,
  rows,
  adminBase,
  selectedId,
  onSelect,
  onMove,
}: {
  bucket: string;
  heading: string;
  rows: AppointmentRow[];
  adminBase: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string) => void;
}) {
  const t = useT();
  return (
    <div data-appointment-bucket={bucket}>
      <div className="border-t border-admin-border-soft bg-admin-surface px-[16px] py-[7px] font-admin-body text-admin-11 font-bold uppercase tracking-[0.06em] text-admin-ink-muted">
        {heading}
      </div>
      <table className="w-full border-collapse font-admin-body text-admin-12h">
        <tbody>
      {rows.map((row) => {
        const state = bookingStateKey(row.status);
        const selected = row.id === selectedId;
        return (
          <tr
            key={row.id}
            data-appointment-row={row.id}
            aria-selected={selected}
            className={`cursor-pointer border-t border-admin-border-soft ${selected ? "bg-admin-brand-soft" : "hover:bg-admin-surface"}`}
            onClick={() => onSelect(row.id)}
          >
            <td className="p-0">
              <div className={`${ROW_GRID} py-[9px]`}>
                <span className="text-admin-ink">
                  {row.startsAt ? (
                    <span className="font-mono text-admin-ink-muted">{formatWhen(row.startsAt, row.timeZone)}</span>
                  ) : (
                    <span className="text-admin-ink-muted">{t(`${K}.noTime`)}</span>
                  )}
                </span>
                <span className="truncate font-semibold text-admin-ink" title={row.customerName ?? t(`${K}.unknownCustomer`)}>
                  {row.customerName ?? <span className="font-normal text-admin-ink-muted">{t(`${K}.unknownCustomer`)}</span>}
                </span>
                <span className="truncate text-admin-ink-muted" title={row.title}>{row.title}</span>
                <span className="truncate text-admin-ink-muted" title={row.servedBy.join(", ")}>
                  {row.servedBy.length > 0 ? row.servedBy.join(", ") : t(`${K}.unassigned`)}
                </span>
                <span className="truncate text-admin-ink-muted" title={row.places.join(", ")}>
                  {row.places.length > 0 ? row.places.join(", ") : t(`${K}.noPlace`)}
                </span>
                <span className="flex items-center gap-[8px]">
                  <StatePill tone={STATE_TONE[state]} testId="appointment-state" state={state}>
                    {t(`${K}.state.${bookingStateKey(row.status)}`)}
                  </StatePill>
                  {row.nextAction.kind === "reschedule" ? (
                    <button
                      type="button"
                      className="cursor-pointer whitespace-nowrap rounded-[7px] border border-admin-border bg-admin-card px-[8px] py-[2px] text-admin-11 font-semibold text-admin-ink hover:border-admin-border-strong"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMove(row.id);
                      }}
                    >
                      {t(`${K}.action.reschedule`)}
                    </button>
                  ) : row.nextAction.kind === "open" ? (
                    <a
                      className="whitespace-nowrap text-admin-11 font-semibold text-admin-ink underline underline-offset-2"
                      href={`${adminBase}/bookings/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t(`${K}.action.open`)}
                    </a>
                  ) : null}
                </span>
                <button
                  type="button"
                  aria-label={t(`${K}.board.rowMenu`)}
                  className="inline-flex h-[20px] w-[20px] cursor-pointer items-center justify-center rounded-[6px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(row.id);
                  }}
                >
                  <Icon name="ellipsis" size={13} stroke={1.75} />
                </button>
              </div>
            </td>
          </tr>
        );
      })}
        </tbody>
      </table>
    </div>
  );
}
