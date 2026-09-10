"use client";

/**
 * PeopleClient — W26, W27, W29, W30, W32, W33/W35.
 *
 * One list of humans, four views of the same list, and one detail panel. The
 * tabs are FILTERS over a single record set, not four pages: that is what
 * stops the same person being entered, or maintained, twice.
 *
 * Nothing derives from data that is absent at first paint. The whole record
 * set arrives from the server as a prop, the active tab starts on a constant,
 * and the locale hook starts on "en" for everyone, so the first render and
 * the second agree.
 */

import { useMemo, useState } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { cn } from "@/lib/utils";
import { pickAProfessional, type PersonRecord } from "@/lib/people/hats";
import { PersonHatsPanel } from "./PersonHatsPanel";
import {
  PEOPLE_CHIP,
  PEOPLE_CHIP_OFF,
  PEOPLE_CHIP_ON,
  PEOPLE_MUTED,
  PEOPLE_NOTE,
  PEOPLE_PAGE,
  PEOPLE_REFUSAL,
  PEOPLE_ROW,
  PEOPLE_ROW_ACTIVE,
  PEOPLE_SECONDARY_ACTION,
  PEOPLE_SECTION_TITLE,
  PEOPLE_SURFACE,
  PEOPLE_TAB,
  PEOPLE_TAB_ACTIVE,
  PEOPLE_TABLE,
  PEOPLE_TABLE_CELL,
  PEOPLE_TABLE_HEAD,
  PEOPLE_TAB_IDLE,
} from "./people-classes";

const TABS = ["everyone", "talent", "bookable", "access"] as const;
type Tab = (typeof TABS)[number];

/**
 * W33 + W35 — where every section of the existing drawer belongs. This is the
 * mapping the design calls for, rendered rather than filed away, so an
 * operator can answer "which hat owns Booking hours?" without asking.
 */
const SECTION_MAP: ReadonlyArray<{ section: string; hat: "publicProfile" | "bookable" | "access" }> = [
  { section: "bookingTerms", hat: "bookable" },
  { section: "bookingHours", hat: "bookable" },
  { section: "availability", hat: "bookable" },
  { section: "logistics", hat: "bookable" },
  { section: "services", hat: "bookable" },
  { section: "locationAndServiceArea", hat: "publicProfile" },
  { section: "limits", hat: "publicProfile" },
  { section: "trustBadges", hat: "publicProfile" },
  { section: "files", hat: "publicProfile" },
  { section: "media", hat: "publicProfile" },
  { section: "emergencyContact", hat: "publicProfile" },
  { section: "roleAndPermissions", hat: "access" },
  { section: "signIn", hat: "access" },
];

export function PeopleClient({
  people,
  loadFailed,
}: {
  people: readonly PersonRecord[];
  loadFailed: boolean;
}) {
  const t = useT();
  const { adminBasePath } = useAdminShell();
  const [tab, setTab] = useState<Tab>("everyone");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const visible = useMemo(() => filterFor(people, tab), [people, tab]);
  const selected = people.find((p) => p.key === selectedKey) ?? null;

  return (
    <div className={PEOPLE_PAGE}>
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">{t("admin.people.title")}</h1>
        <p className={PEOPLE_MUTED}>{t("admin.people.subtitle")}</p>
      </header>

      {/* A failed read is NOT an empty workspace, and must never look like one. */}
      {loadFailed ? <p className={PEOPLE_REFUSAL}>{t("admin.people.loadFailed")}</p> : null}

      <nav className="flex flex-wrap gap-2" aria-label={t("admin.people.title")}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            className={cn(PEOPLE_TAB, tab === id ? PEOPLE_TAB_ACTIVE : PEOPLE_TAB_IDLE)}
            onClick={() => setTab(id)}
          >
            {t(`admin.people.tabs.${id}`)}
          </button>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <p className={PEOPLE_MUTED}>
            {visible.length === 1
              ? t("admin.people.countOne")
              : interpolate(t("admin.people.count"), { count: visible.length })}
          </p>

          {visible.length === 0 && !loadFailed ? (
            <p className={PEOPLE_NOTE}>{t(`admin.people.empty.${tab}`)}</p>
          ) : null}

          {visible.map((person) => (
            <button
              key={person.key}
              type="button"
              className={cn(PEOPLE_ROW, selectedKey === person.key && PEOPLE_ROW_ACTIVE)}
              onClick={() => setSelectedKey(person.key)}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {person.name || t("admin.people.unnamed")}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {t(`admin.people.role.${person.role ?? "none"}`)}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                <HatChip on={person.publicProfile.on} label={t("admin.people.hat.publicProfile")} />
                <HatChip on={person.bookable.on} label={t("admin.people.hat.bookable")} />
                <HatChip on={person.access.on} label={t("admin.people.hat.access")} />
              </span>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {selected ? (
            <PersonHatsPanel key={selected.key} person={selected} />
          ) : (
            <p className={cn(PEOPLE_SURFACE, "p-4 text-sm text-muted-foreground")}>
              {t("admin.people.detail.pickAPerson")}
            </p>
          )}

          <AddPerson adminBasePath={adminBasePath} />
          <HatExplainer />
        </div>
      </div>
    </div>
  );
}

function filterFor(people: readonly PersonRecord[], tab: Tab): readonly PersonRecord[] {
  switch (tab) {
    case "talent":
      return people.filter((p) => p.publicProfile.on);
    // The Bookable list is the picker's list, by construction: it is the same
    // function the POS and the booking page filter with.
    case "bookable":
      return pickAProfessional(people);
    case "access":
      return people.filter((p) => p.access.on);
    default:
      return people;
  }
}

function HatChip({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(PEOPLE_CHIP, on ? PEOPLE_CHIP_ON : PEOPLE_CHIP_OFF)}
      title={label}
    >
      {label}
    </span>
  );
}

/**
 * W32 — add a person, pick hats.
 *
 * Honest about what exists: creating a public profile is the roster form that
 * already owns seat limits, profile codes and exclusivity, so this screen
 * hands the operator to that door rather than opening a second writer for the
 * same rows. The Access hat has no such form, and is granted from the person's
 * own panel once they are here.
 */
function AddPerson({ adminBasePath }: { adminBasePath: string }) {
  const t = useT();
  return (
    <section className={cn(PEOPLE_SURFACE, "flex flex-col gap-3 p-4")}>
      <h2 className={PEOPLE_SECTION_TITLE}>{t("admin.people.add.title")}</h2>
      <p className={PEOPLE_MUTED}>{t("admin.people.add.intro")}</p>
      <ul className="flex flex-col gap-1 text-sm text-foreground">
        <li>
          <strong>{t("admin.people.hat.publicProfile")}</strong>
          {`: ${t("admin.people.add.publicWhat")}`}
        </li>
        <li>
          <strong>{t("admin.people.hat.bookable")}</strong>
          {`: ${t("admin.people.add.bookableWhat")}`}
        </li>
        <li>
          <strong>{t("admin.people.hat.access")}</strong>
          {`: ${t("admin.people.add.accessWhat")}`}
        </li>
      </ul>
      <a className={PEOPLE_SECONDARY_ACTION} href={`${adminBasePath}/roster/new`}>
        {t("admin.people.add.doorRosterLabel")}
      </a>
      <p className={PEOPLE_MUTED}>{t("admin.people.add.doorRosterNote")}</p>
      <p className={PEOPLE_MUTED}>{t("admin.people.add.doorInviteNote")}</p>
    </section>
  );
}

/** W33 + W35 — the section-to-hat map, as a table rather than a document. */
function HatExplainer() {
  const t = useT();
  return (
    <section className={cn(PEOPLE_SURFACE, "flex flex-col gap-3 p-4")}>
      <h2 className={PEOPLE_SECTION_TITLE}>{t("admin.people.explainer.title")}</h2>
      <p className={PEOPLE_MUTED}>{t("admin.people.explainer.intro")}</p>
      <div className="overflow-x-auto">
        <table className={PEOPLE_TABLE}>
          <thead>
            <tr>
              <th className={PEOPLE_TABLE_HEAD}>{t("admin.people.explainer.sectionColumn")}</th>
              <th className={PEOPLE_TABLE_HEAD}>{t("admin.people.explainer.hatColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {SECTION_MAP.map((row) => (
              <tr key={row.section}>
                <td className={PEOPLE_TABLE_CELL}>
                  {t(`admin.people.explainer.sections.${row.section}`)}
                </td>
                <td className={PEOPLE_TABLE_CELL}>{t(`admin.people.hat.${row.hat}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={PEOPLE_NOTE}>{t("admin.people.explainer.resourcesNote")}</p>
    </section>
  );
}
