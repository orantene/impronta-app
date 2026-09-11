/**
 * W47 — Milestones & deliverables, the server half: the section title with
 * `Add milestone` (the engine's `createDeliverable`), the rows through
 * `MilestoneDecisions` (amount and file per row, Package 2, closing
 * D-POS-37), and the passthrough sentence.
 *
 * ONE LIST. `booking_deliverables` is both the milestone (its `due_at`) and
 * the deliverable (its `title`, `status`, `revision`); the board draws them
 * as two cards over one table, this screen draws the one table.
 */

import { interpolate } from "@/i18n/interpolate";
import { openMilestonesByDue, type ProjectRecord } from "@/lib/projects/project-record";
import { schedulingEngineSentences } from "@/lib/scheduling/engine-refusals";
import { Card, Notice, SectionTitle, dayLabel } from "../_shared";
import { MILESTONE_STATUS_KEY, milestoneTone } from "./milestone-keys";
import { MilestoneDecisions } from "./milestone-decisions";
import { AddMilestone } from "./milestone-add";

type Tr = (key: string) => string;

export function MilestonesTab({ project, locale, tr }: { project: ProjectRecord; locale: string; tr: Tr }) {
  const noDate = tr("dashboard.projects.milestones.noDue");
  const ordered = [
    ...openMilestonesByDue(project),
    ...project.milestones.filter((m) => m.status === "approved" || m.status === "cancelled"),
  ];
  const refusals = {
    limitReached: tr("dashboard.projects.milestones.refusalLimitReached"),
    notSubmitted: tr("dashboard.projects.milestones.refusalNotSubmitted"),
    notFound: tr("dashboard.projects.milestones.refusalNotFound"),
    unavailable: tr("dashboard.projects.milestones.refusalUnavailable"),
    notAllowed: tr("dashboard.projects.milestones.refusalNotAllowed"),
    invalid: tr("dashboard.projects.milestones.refusalInvalid"),
  };
  return (
    <>
      <SectionTitle
        aside={
          <AddMilestone
            bookingId={project.id}
            copy={{
              ...refusals,
              add: tr("dashboard.projects.milestones.add"),
              title: tr("dashboard.projects.milestones.addTitle"),
              due: tr("dashboard.projects.milestones.addDue"),
              save: tr("dashboard.projects.milestones.addSave"),
              cancel: tr("dashboard.projects.close.back"),
            }}
          />
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
            currency={project.currency}
            inquiryId={project.inquiryId}
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
              amountCents: m.amountCents,
              filePath: m.filePath,
            }))}
            copy={{
              ...refusals,
              caption: tr("dashboard.projects.milestones.tableCaption"),
              approve: tr("dashboard.projects.milestones.approveClient"),
              requestRevision: tr("dashboard.projects.milestones.requestChanges"),
              passthrough: tr("dashboard.projects.milestones.passthrough"),
              moneyFile: {
                edit: tr("dashboard.projects.milestones.edit"),
                save: tr("dashboard.projects.milestones.addSave"),
                upload: tr("dashboard.projects.filesUpload"),
                replace: tr("dashboard.projects.milestones.replaceFile"),
                uploadNoInquiry: tr("dashboard.projects.milestones.uploadNoInquiry"),
                uploadFailed: tr("dashboard.projects.milestones.uploadFailed"),
                uploading: tr("dashboard.projects.milestones.uploading"),
                amountUnknown: tr("dashboard.projects.milestoneAmountUnknown"),
                engine: schedulingEngineSentences(tr),
              },
            }}
          />
        )}
      </Card>
      <Notice>{tr("dashboard.projects.milestones.passthroughNote")}</Notice>
    </>
  );
}
