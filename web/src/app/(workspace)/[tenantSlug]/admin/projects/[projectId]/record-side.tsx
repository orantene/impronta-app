/**
 * The project record's right column (W42): CLIENT, TEAM and DATES, each an
 * eyebrow over a 14px card. Server-rendered from the record and the
 * customer row; nothing here is judged, only printed.
 */

import Link from "next/link";
import { interpolate } from "@/i18n/interpolate";
import type { ProjectClientContact } from "@/lib/projects/projects-reader";
import { openMilestonesByDue, type ProjectRecord } from "@/lib/projects/project-record";
import { Card, Eyebrow, KeyValue, Pill, dayLabel } from "../_shared";

type Tr = (key: string) => string;

export function RecordSide({
  project,
  contact,
  locale,
  tenantSlug,
  tr,
}: {
  project: ProjectRecord;
  contact: ProjectClientContact | null;
  locale: string;
  tenantSlug: string;
  tr: Tr;
}) {
  const noDate = tr("dashboard.projects.noDate");
  const tz = project.timeZone;
  return (
    <>
      <Eyebrow wide>{tr("dashboard.projects.sideClient")}</Eyebrow>
      <Card>
        <div className="flex flex-col gap-2 px-3.5 py-3 text-[13px] text-admin-ink">
          {project.clientName ? (
            <div>
              <b>{project.clientName}</b>
              {" · "}
              {contact ? tr("dashboard.projects.sideClientPerson") : tr("dashboard.projects.sideClientNamed")}
            </div>
          ) : (
            <div className="text-admin-ink-muted">{tr("dashboard.projects.noClient")}</div>
          )}
          {contact?.email ? <div>{contact.email}</div> : null}
          {contact?.phone ? <div>{contact.phone}</div> : null}
          {contact ? (
            <div>{tr("dashboard.projects.sideClientPays")}</div>
          ) : project.clientName ? (
            <div className="text-admin-ink-muted">{tr("dashboard.projects.sideClientNoCustomer")}</div>
          ) : null}
          {project.customerId ? (
            <Link href={`/${tenantSlug}/admin/clients/${project.customerId}`} className="text-[12px] text-admin-ink-muted underline underline-offset-4">
              {tr("dashboard.projects.openClient")}
            </Link>
          ) : null}
        </div>
      </Card>

      <Eyebrow wide>{tr("dashboard.projects.sideTeam")}</Eyebrow>
      <Card>
        <div className="flex flex-col px-3.5 py-3 text-[13px]">
          {project.assignments.length === 0 ? (
            <span className="text-admin-ink-muted">{tr("dashboard.projects.team.none")}</span>
          ) : (
            project.assignments.map((a) => (
              <KeyValue
                key={a.id}
                label={`${a.name || tr("dashboard.projects.team.unnamed")}${a.roleLabel ? ` · ${a.roleLabel}` : ""}`}
                value={<Pill tone="slate">{tr("dashboard.projects.team.assigned")}</Pill>}
              />
            ))
          )}
        </div>
      </Card>

      <Eyebrow wide>{tr("dashboard.projects.sideDates")}</Eyebrow>
      <Card>
        <div className="px-3.5 py-3 text-[13px]">
          <KeyValue
            label={tr("dashboard.projects.dateStarts")}
            value={dayLabel(project.startsAt, tz, locale, noDate, { weekday: true, time: true })}
            dim={!project.startsAt}
          />
          <KeyValue
            label={tr("dashboard.projects.dateEnds")}
            value={dayLabel(project.endsAt, tz, locale, noDate, { weekday: true, time: true })}
            dim={!project.endsAt}
          />
          {openMilestonesByDue(project)
            .filter((m) => m.dueAt)
            .map((m) => (
              <KeyValue
                key={m.id}
                label={interpolate(tr("dashboard.projects.dateMilestoneDue"), { title: m.title })}
                value={dayLabel(m.dueAt, tz, locale, noDate, { weekday: true })}
              />
            ))}
          <p className="m-0 mt-1.5 text-[11.5px] text-admin-ink-muted">
            {interpolate(tr("dashboard.projects.timezoneNote"), { zone: tz })}
          </p>
        </div>
      </Card>
    </>
  );
}
