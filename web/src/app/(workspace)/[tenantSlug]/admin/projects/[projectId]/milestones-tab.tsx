/**
 * W47 — Milestones & deliverables, the server half: the section title with
 * `Add milestone` and `Upload` (both disabled: a deliverable is written on
 * the booking it belongs to and no file store hangs off one, D-POS-37), the
 * rows through `MilestoneDecisions`, and the passthrough sentence.
 *
 * ONE LIST. `booking_deliverables` is both the milestone (its `due_at`) and
 * the deliverable (its `title`, `status`, `revision`); the board draws them
 * as two cards over one table, this screen draws the one table.
 */

import { interpolate } from "@/i18n/interpolate";
import { openMilestonesByDue, type ProjectRecord } from "@/lib/projects/project-record";
import { BTN_ROW, BTN_SECONDARY, Card, Notice, SectionTitle, dayLabel } from "../_shared";
import { MILESTONE_STATUS_KEY, milestoneTone } from "./milestone-keys";
import { MilestoneDecisions } from "./milestone-decisions";

type Tr = (key: string) => string;

export function MilestonesTab({ project, locale, tr }: { project: ProjectRecord; locale: string; tr: Tr }) {
  const noDate = tr("dashboard.projects.milestones.noDue");
  const ordered = [
    ...openMilestonesByDue(project),
    ...project.milestones.filter((m) => m.status === "approved" || m.status === "cancelled"),
  ];
  return (
    <>
      <SectionTitle
        aside={
          <span className="flex items-center gap-1.5">
            <button type="button" disabled title={tr("dashboard.projects.milestones.addUnavailable")} className={`${BTN_SECONDARY} ${BTN_ROW}`}>
              {tr("dashboard.projects.milestones.add")}
            </button>
            <button type="button" disabled title={tr("dashboard.projects.filesUnavailable")} className={`${BTN_SECONDARY} ${BTN_ROW}`}>
              {tr("dashboard.projects.filesUpload")}
            </button>
          </span>
        }
      >
        {tr("dashboard.projects.milestones.sumTitle")}
      </SectionTitle>
      <Card>
        {ordered.length === 0 ? (
          <div className="px-4 py-3">
            <p className="m-0 text-[13px] text-admin-ink">{tr("dashboard.projects.milestones.none")}</p>
            <p className="m-0 mt-1 text-[13px] text-admin-ink-muted">{tr("dashboard.projects.milestones.noneHint")}</p>
          </div>
        ) : (
          <MilestoneDecisions
            milestones={ordered.map((m) => ({
              id: m.id,
              title: m.title,
              kind: m.kind,
              status: m.status,
              revision: m.revision,
              revisionLimit: m.revisionLimit,
              whenLabel: m.dueAt
                ? interpolate(tr("dashboard.projects.milestones.onDelivery"), { date: dayLabel(m.dueAt, project.timeZone, locale, noDate) })
                : tr("dashboard.projects.milestones.noDue"),
              statusLabel: tr(MILESTONE_STATUS_KEY[m.status]),
              statusTone: milestoneTone(m.status),
              revisionsLabel: interpolate(tr("dashboard.projects.milestones.revisionsUsed"), { used: m.revision, limit: m.revisionLimit }),
            }))}
            copy={{
              caption: tr("dashboard.projects.milestones.tableCaption"),
              approve: tr("dashboard.projects.milestones.approveClient"),
              requestRevision: tr("dashboard.projects.milestones.requestChanges"),
              edit: tr("dashboard.projects.milestones.edit"),
              editUnavailable: tr("dashboard.projects.milestones.addUnavailable"),
              passthrough: tr("dashboard.projects.milestones.passthrough"),
              amountUnknown: tr("dashboard.projects.milestoneAmountUnknown"),
              limitReached: tr("dashboard.projects.milestones.refusalLimitReached"),
              notSubmitted: tr("dashboard.projects.milestones.refusalNotSubmitted"),
              notFound: tr("dashboard.projects.milestones.refusalNotFound"),
              unavailable: tr("dashboard.projects.milestones.refusalUnavailable"),
              notAllowed: tr("dashboard.projects.milestones.refusalNotAllowed"),
              invalid: tr("dashboard.projects.milestones.refusalInvalid"),
            }}
          />
        )}
      </Card>
      <Notice>{tr("dashboard.projects.milestones.passthroughNote")}</Notice>
    </>
  );
}
