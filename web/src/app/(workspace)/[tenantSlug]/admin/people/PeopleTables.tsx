"use client";

/**
 * PeopleTables — the three table views: Everyone (the record set as one
 * list), Bookable (W30, what the picker reads) and Access (W29, who signs
 * in). Every column is a reader's fact; a column the engine does not store
 * (PIN, drawer, locations, busy/free, POS permissions, pay) draws a dash
 * whose title says what is not tracked, never an invented value.
 */

import { StatePill, UsedIn } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { personNameOr } from "@/lib/people/display-name";
import type { PersonRecord } from "@/lib/people/hats";
import { Callout, FactsCard, HatChip, MutedChip, PersonCell, RowMenuButton, TD, TD_MUTED, Table } from "./people-ui";
import { describeOpenDays, hatsWorn } from "./people-views";

const K = "admin.people";
const B = "admin.people.board";

type TableProps = {
  people: readonly PersonRecord[];
  selectedKey: string | null;
  onOpen: (key: string) => void;
};

/** The dash the boards draw where a fact is not tracked, with the reason as its title. */
function NotTracked({ why }: { why: string }) {
  const t = useT();
  return (
    <span title={interpolate(t(`${B}.cell.notTrackedWhy`), { what: why })} className="text-admin-ink-dim">
      {t(`${B}.cell.notTracked`)}
    </span>
  );
}

function OtherHats({ person, except }: { person: PersonRecord; except: readonly string[] }) {
  const t = useT();
  const hats = hatsWorn(person).filter((h) => !except.includes(h));
  if (hats.length === 0) return <MutedChip>{t(`${B}.cell.accessOnly`)}</MutedChip>;
  return (
    <span className="flex flex-wrap gap-[4px]">
      {hats.map((h) => (
        <HatChip key={h} hat={h} label={t(`${K}.hat.${h}`)} />
      ))}
    </span>
  );
}

function StatusCell({ person }: { person: PersonRecord }) {
  const t = useT();
  const status = person.facts.membershipStatus;
  if (status === "active") return <StatePill tone="green">{t(`${B}.cell.active`)}</StatePill>;
  if (status === "invited" || status === "pending_acceptance") return <StatePill tone="coral">{t(`${B}.cell.invited`)}</StatePill>;
  if (status === "suspended") return <StatePill tone="critical">{t(`${B}.cell.suspended`)}</StatePill>;
  if (status === "removed") return <StatePill tone="slate">{t(`${B}.cell.removed`)}</StatePill>;
  return <StatePill tone="slate">{t(`${K}.off`)}</StatePill>;
}

export function EveryoneTable({ people, selectedKey, onOpen }: TableProps) {
  const t = useT();
  if (people.length === 0) return null;
  return (
    <Table head={[t(`${B}.col.person`), t(`${B}.col.hats`), t(`${B}.col.role`), t(`${B}.col.contact`), ""]} testId="people-everyone-table">
      {people.map((p) => {
        const name = personNameOr(p.name, t(`${K}.unnamed`));
        const hats = hatsWorn(p);
        return (
          <tr key={p.key} data-people-row={p.key}>
            <PersonCell name={name} selected={selectedKey === p.key} onOpen={() => onOpen(p.key)} />
            <td className={TD}>
              <span className="flex flex-wrap gap-[4px]">
                {hats.length === 0 ? <MutedChip>{t(`${K}.model.why.none`)}</MutedChip> : null}
                {hats.map((h) => (
                  <HatChip key={h} hat={h} label={t(`${K}.hat.${h}`)} />
                ))}
              </span>
            </td>
            <td className={p.role ? TD : TD_MUTED}>{t(`${K}.role.${p.role ?? "none"}`)}</td>
            <td className={p.email ? TD : TD_MUTED}>{p.email ?? t(`${B}.cell.noContact`)}</td>
            <td className={`${TD} w-[40px] text-right`}>
              <RowMenuButton label={interpolate(t(`${B}.actions.rowMenu`), { name })} onClick={() => onOpen(p.key)} />
            </td>
          </tr>
        );
      })}
    </Table>
  );
}

export function BookableTable({ people, selectedKey, onOpen }: TableProps) {
  const t = useT();
  const dayLabels = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => t(`dashboard.adminWorkspace.appointments.day.${d}`));
  return (
    <div className="flex flex-col gap-[16px]">
      <UsedIn
        count={4}
        label={t(`${B}.usedIn`)}
        parts={[
          { where: t(`${B}.usedPos`), what: t(`${B}.used.bookablePos`) },
          { where: t(`${B}.usedWeb`), what: t(`${B}.used.bookableWeb`) },
        ]}
      />
      {people.length > 0 ? (
        <Table
          head={[
            t(`${B}.col.person`),
            t(`${B}.col.otherHats`),
            t(`${B}.col.servicesHere`),
            t(`${B}.col.locationsHours`),
            t(`${B}.col.busyFree`),
            t(`${B}.col.posPermissions`),
            t(`${B}.col.pay`),
            "",
          ]}
          testId="people-bookable-table"
        >
          {people.map((p) => {
            const name = personNameOr(p.name, t(`${K}.unnamed`));
            const offerings = p.facts.offerings;
            const shown = offerings.slice(0, 3).map((o) => o.title).join(", ");
            const more = offerings.length - 3;
            const hours = p.facts.hours;
            return (
              <tr key={p.key} data-people-row={p.key}>
                <PersonCell name={name} selected={selectedKey === p.key} onOpen={() => onOpen(p.key)} />
                <td className={TD}>
                  <OtherHats person={p} except={["bookable"]} />
                </td>
                <td className={offerings.length > 0 ? TD : TD_MUTED}>
                  {offerings.length === 0
                    ? t(`${B}.cell.noServices`)
                    : more > 0
                      ? `${shown} ${interpolate(t(`${B}.cell.servicesMore`), { count: more })}`
                      : shown}
                </td>
                <td className={hours ? TD : TD_MUTED}>
                  {hours
                    ? interpolate(t(`${B}.cell.hoursSummary`), { days: describeOpenDays(hours.openDays, dayLabels), timezone: hours.timezone })
                    : t(`${B}.cell.hoursNone`)}
                </td>
                <td className={TD}>
                  <NotTracked why={t(`${B}.cell.busyFreeWhy`)} />
                </td>
                <td className={TD}>
                  {p.access.on ? (
                    <span title={interpolate(t(`${B}.cell.notTrackedWhy`), { what: t(`${B}.cell.posPermissionsWhy`) })}>
                      {t(`${B}.cell.posByRole`)} · {t(`${K}.role.${p.role ?? "none"}`)}
                    </span>
                  ) : (
                    <NotTracked why={t(`${B}.cell.posPermissionsWhy`)} />
                  )}
                </td>
                <td className={TD}>
                  <NotTracked why={t(`${B}.cell.payWhy`)} />
                </td>
                <td className={`${TD} w-[40px] text-right`}>
                  <RowMenuButton label={interpolate(t(`${B}.actions.rowMenu`), { name })} onClick={() => onOpen(p.key)} />
                </td>
              </tr>
            );
          })}
        </Table>
      ) : null}
      <div className="grid grid-cols-2 gap-[16px]">
        <FactsCard
          rows={[
            { label: t(`${B}.bookableFacts.contractor`), value: t(`${B}.bookableFacts.contractorValue`) },
            { label: t(`${B}.bookableFacts.crossBusiness`), value: t(`${B}.bookableFacts.crossBusinessValue`) },
            { label: t(`${B}.bookableFacts.removing`), value: t(`${B}.bookableFacts.removingValue`) },
          ]}
        />
        <FactsCard
          rows={[
            { label: t(`${B}.bookableFacts.hiddenProfile`), value: t(`${B}.bookableFacts.hiddenProfileValue`) },
            { label: t(`${B}.bookableFacts.customerWord`), value: t(`${B}.bookableFacts.customerWordValue`) },
            { label: t(`${B}.bookableFacts.sort`), value: t(`${B}.bookableFacts.sortValue`) },
          ]}
        />
      </div>
    </div>
  );
}

export function AccessTable({ people, selectedKey, onOpen }: TableProps) {
  const t = useT();
  return (
    <div className="flex flex-col gap-[16px]">
      {people.length > 0 ? (
        <Table
          head={[
            t(`${B}.col.person`),
            t(`${B}.col.role`),
            t(`${B}.col.locations`),
            t(`${B}.col.otherHats`),
            t(`${B}.col.pin`),
            t(`${B}.col.drawer`),
            t(`${B}.col.status`),
            "",
          ]}
          testId="people-access-table"
        >
          {people.map((p) => {
            const name = personNameOr(p.name, t(`${K}.unnamed`));
            return (
              <tr key={p.key} data-people-row={p.key}>
                <PersonCell name={name} selected={selectedKey === p.key} onOpen={() => onOpen(p.key)} />
                <td className={TD}>{t(`${K}.role.${p.role ?? "none"}`)}</td>
                <td className={TD} title={interpolate(t(`${B}.cell.notTrackedWhy`), { what: t(`${B}.cell.locationsWhy`) })}>
                  {t(`${B}.cell.allLocations`)}
                </td>
                <td className={TD}>
                  <OtherHats person={p} except={["access"]} />
                </td>
                <td className={TD}>
                  <NotTracked why={t(`${B}.cell.pinWhy`)} />
                </td>
                <td className={TD}>
                  <NotTracked why={t(`${B}.cell.drawerWhy`)} />
                </td>
                <td className={TD}>
                  <StatusCell person={p} />
                </td>
                <td className={`${TD} w-[40px] text-right`}>
                  <RowMenuButton label={interpolate(t(`${B}.actions.rowMenu`), { name })} onClick={() => onOpen(p.key)} />
                </td>
              </tr>
            );
          })}
        </Table>
      ) : null}
      <UsedIn count={5} label={t(`${B}.usedIn`)} parts={[{ where: t(`${B}.usedPos`), what: `${t(`${B}.used.accessPos`)} · ${t(`${B}.used.accessNote`)}` }]} />
      <Callout tone="indigo" testId="people-access-note">
        {t(`${B}.accessNote`)}
      </Callout>
    </div>
  );
}
