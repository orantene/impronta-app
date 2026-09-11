/**
 * W48 — Team, the server half: `Assignments` with `Assign from People ›
 * Bookable` (a link to the conversation's lineup, where an assignment is
 * made), one row per assigned professional (name · role · fee line · state
 * · `Replace…`), the margin sentence, and the `Who sees what` door (W51).
 * The replace sheet itself is `TeamReplace`, a client component.
 */

import Link from "next/link";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ProjectRecord } from "@/lib/projects/project-record";
import { BTN_ROW, BTN_SECONDARY, Card, Notice, SectionTitle, dayLabel } from "../_shared";
import { TeamRows } from "./team-replace";

type Tr = (key: string) => string;

export function TeamTab({
  project,
  locale,
  visibilityHref,
  conversationHref,
  tr,
}: {
  project: ProjectRecord;
  locale: string;
  visibilityHref: string;
  conversationHref: string | null;
  tr: Tr;
}) {
  const noDate = tr("dashboard.projects.noDate");
  const when = dayLabel(project.startsAt, project.timeZone, locale, noDate);
  return (
    <>
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
            rows={project.assignments.map((a) => ({
              id: a.id,
              name: a.name || tr("dashboard.projects.team.unnamed"),
              roleLine: `${a.roleLabel ?? tr("dashboard.projects.team.colRole")} · ${when} · ${a.units} ${a.pricingUnit}`,
              feeLine: interpolate(tr("dashboard.projects.team.feeLine"), {
                fee: formatOrderMoney(a.talentCostCents, a.currency),
                charge: formatOrderMoney(a.clientChargeCents, a.currency),
              }),
              stateLabel: tr("dashboard.projects.team.assigned"),
            }))}
            copy={{
              replace: tr("dashboard.projects.team.replace"),
              sheetTitle: tr("dashboard.projects.team.replaceTitle"),
              sheetSubtitle: tr("dashboard.projects.team.replaceSubtitle"),
              closeLabel: tr("dashboard.projects.close.closeSheet"),
              replacement: tr("dashboard.projects.team.replacement"),
              replacementUnavailable: tr("dashboard.projects.team.replacementUnavailable"),
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
              cancel: tr("dashboard.projects.close.back"),
              confirm: tr("dashboard.projects.team.replaceConfirm"),
            }}
          />
        )}
      </Card>
      <Notice>{tr("dashboard.projects.team.marginNote")}</Notice>
      <p className="m-0 text-[13px]">
        <Link href={visibilityHref} className="text-admin-ink underline underline-offset-4">
          {tr("dashboard.projects.visibility.title")}
        </Link>
      </p>
    </>
  );
}
