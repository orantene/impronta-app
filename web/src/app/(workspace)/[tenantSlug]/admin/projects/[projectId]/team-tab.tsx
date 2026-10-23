/**
 * W48 — Team, the server half: `Assignments` with `Assign from People ›
 * Bookable` (a link to the conversation's lineup, where an assignment is
 * made), one row per assigned professional (name · role · fee line · state
 * · `Replace…`), the margin sentence, and the `Who sees what` door (W51).
 * The replace sheet itself is `TeamReplace`, a client component.
 */

import Link from "next/link";
import { interpolate } from "@/i18n/interpolate";
import { projectEventBoard, type SeatState } from "@/lib/projects/project-event-board";
import type { ConfirmationsRead } from "@/lib/projects/assignment-confirmation";
import { candidateTag } from "@/lib/coordinator/replacement-availability";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ProjectRecord } from "@/lib/projects/project-record";
import type { ReplacementCandidatesLoad } from "@/lib/projects/projects-reader";
import { schedulingEngineSentences } from "@/lib/scheduling/engine-refusals";
import { BTN_ROW, BTN_SECONDARY, Card, Pill, SectionTitle, dayLabel } from "../_shared";
import { TeamRows } from "./team-replace";
import { StaffingPicker } from "./staffing-picker";
import type { ProjectHold } from "@/lib/projects/project-holds.server";

type Tr = (key: string) => string;

export function TeamTab({
  project,
  candidates,
  confirmations,
  holds,
  canStaff,
  locale,
  visibilityHref,
  conversationHref,
  tr,
}: {
  project: ProjectRecord;
  candidates: ReplacementCandidatesLoad;
  confirmations: ConfirmationsRead;
  holds: ProjectHold[] | "unreadable";
  canStaff: boolean;
  locale: string;
  visibilityHref: string;
  conversationHref: string | null;
  tr: Tr;
}) {
  const noDate = tr("dashboard.projects.noDate");
  const when = dayLabel(project.startsAt, project.timeZone, locale, noDate);
  const view = projectEventBoard({ assignments: project.assignments, startsAt: project.startsAt, confirmations });
  const { board } = view;
  const seatLabel: Record<SeatState, string> = {
    confirmed: tr("dashboard.projects.team.stateConfirmed"),
    declined: tr("dashboard.projects.team.stateDeclined"),
    awaiting: tr("dashboard.projects.team.stateAwaiting"),
  };
  return (
    <>
      {board.roles.length > 0 ? (
        <section data-event-board aria-label={tr("dashboard.projects.team.boardTitle")} className="flex flex-col gap-2">
          <SectionTitle
            aside={
              <Pill tone={board.complete ? "green" : "slate"}>
                {interpolate(tr("dashboard.projects.team.boardSummary"), { confirmed: board.totals.confirmed, needed: board.totals.needed })}
              </Pill>
            }
          >
            {tr("dashboard.projects.team.boardTitle")}
          </SectionTitle>
          <Card>
            <ul className="m-0 list-none p-0">
              {board.roles.map((r) => (
                <li key={r.id} data-board-role={r.id} className="flex items-center justify-between gap-3 border-t px-4 py-2.5 first:border-t-0">
                  <b className="text-[13px] text-admin-ink">{r.role || tr("dashboard.projects.team.colRole")}</b>
                  <span className="flex items-center gap-2 text-[12.5px] text-admin-ink-muted">
                    {interpolate(tr("dashboard.projects.team.boardRole"), { confirmed: r.confirmed, needed: r.needed })}
                    <Pill tone={r.state === "filled" ? "green" : r.state === "partial" ? "indigo" : "coral"}>
                      {r.state === "filled" ? tr("dashboard.projects.team.boardFilled") : interpolate(tr("dashboard.projects.team.boardOpen"), { open: r.open })}
                    </Pill>
                  </span>
                </li>
              ))}
            </ul>
            {!view.stateAvailable ? (
              <p className="m-0 border-t px-4 py-2.5 text-[12.5px] text-admin-ink-muted" data-board-no-state>
                {tr("dashboard.projects.team.boardNoState")}
              </p>
            ) : null}
          </Card>
          <SectionTitle>{tr("dashboard.projects.team.callSheet")}</SectionTitle>
          <Card>
            {board.callSheet.length === 0 ? (
              <p className="m-0 px-4 py-3 text-[13px] text-admin-ink-muted" data-call-sheet-empty>
                {tr("dashboard.projects.team.callSheetEmpty")}
              </p>
            ) : (
              <ul className="m-0 list-none p-0" data-call-sheet>
                {board.callSheet.map((c) => (
                  <li key={`${c.roleId}:${c.talentProfileId}`} className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-[13px] first:border-t-0">
                    <b className="text-admin-ink">{c.name || tr("dashboard.projects.team.unnamed")}</b>
                    <span className="text-admin-ink-muted">
                      {c.role || tr("dashboard.projects.team.colRole")} · {dayLabel(c.callTime, project.timeZone, locale, noDate, { weekday: true, time: true })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      ) : null}
      <SectionTitle
        aside={
          conversationHref ? (
            <Link href={conversationHref} className={`${BTN_SECONDARY} ${BTN_ROW}`}>
              {tr("dashboard.projects.team.assign")}
            </Link>
          ) : (
            <button type="button" disabled title={tr("dashboard.projects.scope.noInquiry")} className={`${BTN_SECONDARY} ${BTN_ROW}`}>
              {tr("dashboard.projects.team.assign")}
            </button>
          )
        }
      >
        {tr("dashboard.projects.team.assignments")}
      </SectionTitle>
      <Card>
        {project.assignments.length === 0 ? (
          <div className="px-4 py-3">
            <p className="m-0 text-[13px] text-admin-ink">{tr("dashboard.projects.team.none")}</p>
            <p className="m-0 mt-1 text-[13px] text-admin-ink-muted">{tr("dashboard.projects.team.noneHint")}</p>
          </div>
        ) : (
          <TeamRows
            bookingId={project.id}
            candidates={
              candidates.ok
                ? candidates.candidates.map((c) => {
                    // Rating and availability for the job's time, after the name (free and unrated adds nothing).
                    const tag = candidateTag(c, locale);
                    return { talentProfileId: c.talentProfileId, name: tag ? `${c.name} · ${tag}` : c.name };
                  })
                : []
            }
            rows={project.assignments.map((a) => ({
              id: a.id,
              talentProfileId: a.talentProfileId,
              name: a.name || tr("dashboard.projects.team.unnamed"),
              roleLine: `${a.roleLabel ?? tr("dashboard.projects.team.colRole")} · ${when} · ${a.units} ${a.pricingUnit}`,
              feeLine: interpolate(tr("dashboard.projects.team.feeLine"), {
                fee: formatOrderMoney(a.talentCostCents, a.currency),
                charge: formatOrderMoney(a.clientChargeCents, a.currency),
              }),
              stateLabel: seatLabel[view.stateByAssignment[a.id] ?? "awaiting"],
            }))}
            copy={{
              replace: tr("dashboard.projects.team.replace"),
              replaceNoProfile: tr("dashboard.projects.team.replaceNoProfile"),
              sheetTitle: tr("dashboard.projects.team.replaceTitle"),
              sheetSubtitle: tr("dashboard.projects.team.replaceSubtitle"),
              closeLabel: tr("dashboard.projects.close.closeSheet"),
              replacement: tr("dashboard.projects.team.replacement"),
              replacementPick: tr("dashboard.projects.team.replacementPick"),
              replacementNone: candidates.ok ? tr("dashboard.projects.team.replacementNone") : tr("dashboard.projects.team.replacementUnavailable"),
              replacementHint: tr("dashboard.projects.team.replacementHint"),
              impact: tr("dashboard.projects.team.impact"),
              schedule: tr("dashboard.projects.team.impactSchedule"),
              scheduleValue: when,
              fee: tr("dashboard.projects.team.impactFee"),
              clientMoney: tr("dashboard.projects.team.impactClientMoney"),
              clientMoneyValue: tr("dashboard.projects.team.impactClientMoneyValue"),
              outgoing: tr("dashboard.projects.team.impactOutgoing"),
              outgoingValue: tr("dashboard.projects.team.impactOutgoingValue"),
              client: tr("dashboard.projects.team.impactClient"),
              clientValue: tr("dashboard.projects.team.impactClientValue"),
              note: tr("dashboard.projects.team.replaceNote"),
              cancel: tr("dashboard.projects.close.cancelSheet"),
              confirm: tr("dashboard.projects.team.replaceConfirm"),
              engine: schedulingEngineSentences(tr),
            }}
          />
        )}
      </Card>
      <SectionTitle>{tr("dashboard.projects.team.staffTitle")}</SectionTitle>
      {project.inquiryId && candidates.ok && holds !== "unreadable" ? (
        <StaffingPicker
          bookingId={project.id}
          candidates={candidates.candidates.map((c) => ({ talentProfileId: c.talentProfileId, name: c.name, availability: c.availability, rating: c.rating }))}
          assignedIds={project.assignments.map((a) => a.talentProfileId).filter((x): x is string => !!x)}
          holds={holds.map((h) => ({ id: h.id, talentProfileId: h.talentProfileId }))}
          canWrite={canStaff}
          copy={{
            title: tr("dashboard.projects.team.staffTitle"),
            hint: tr("dashboard.projects.team.staffHint"),
            showBusy: tr("dashboard.projects.team.staffShowBusy"),
            minRating: tr("dashboard.projects.team.staffMinRating"),
            anyRating: tr("dashboard.projects.team.staffAnyRating"),
            free: tr("dashboard.projects.team.staffFree"),
            busy: tr("dashboard.projects.team.staffBusy"),
            unknown: tr("dashboard.projects.team.staffUnknown"),
            onJob: tr("dashboard.projects.team.staffOnJob"),
            held: tr("dashboard.projects.team.staffHeld"),
            hold: tr("dashboard.projects.team.staffHold"),
            release: tr("dashboard.projects.team.staffRelease"),
            none: tr("dashboard.projects.team.replacementNone"),
            noInquiry: tr("dashboard.projects.scope.noInquiry"),
            outcomes: {
              already_assigned: tr("dashboard.projects.team.staffOutAssigned"),
              already_held: tr("dashboard.projects.team.staffOutHeld"),
              duplicate: tr("dashboard.projects.team.staffOutHeld"),
              not_on_roster: tr("dashboard.projects.team.staffOutRoster"),
              slot_taken: tr("dashboard.projects.team.staffOutTaken"),
              failed: tr("dashboard.projects.team.staffOutFailed"),
            },
            refusals: {
              not_allowed: tr("dashboard.projects.team.staffNotAllowed"),
              no_window: tr("dashboard.projects.team.staffNoWindow"),
              window_past: tr("dashboard.projects.team.staffNoWindow"),
              unavailable: tr("dashboard.projects.team.staffUnavailable"),
              not_found: tr("dashboard.projects.team.staffUnavailable"),
              invalid: tr("dashboard.projects.team.staffUnavailable"),
              no_inquiry: tr("dashboard.projects.scope.noInquiry"),
              none_picked: tr("dashboard.projects.team.staffUnavailable"),
              too_many: tr("dashboard.projects.team.staffUnavailable"),
            },
          }}
        />
      ) : (
        <Card>
          <p className="m-0 px-4 py-3 text-[13px] text-admin-ink-muted" data-staffing-unavailable>
            {project.inquiryId ? tr("dashboard.projects.team.staffUnavailable") : tr("dashboard.projects.scope.noInquiry")}
          </p>
        </Card>
      )}
      <p className="m-0 text-[13px]">
        <Link href={visibilityHref} className="text-admin-ink underline underline-offset-4">
          {tr("dashboard.projects.visibility.title")}
        </Link>
      </p>
    </>
  );
}
