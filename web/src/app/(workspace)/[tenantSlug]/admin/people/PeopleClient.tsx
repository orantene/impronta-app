"use client";

/**
 * PeopleClient — boards W26, W27, W29, W30, W32, W33, W35.
 *
 * One list of humans, four views of the same list, one person sheet. The
 * tabs are FILTERS over a single record set, not four pages: that is what
 * stops the same person being entered, or maintained, twice. The two other
 * screens the header opens (Add a person, How it fits together) are states
 * of this same route under the `view` query the rail's children carry.
 *
 * Nothing derives from data that is absent at first paint. The whole record
 * set arrives from the server as a prop, the view starts on what the URL
 * named, and the locale hook starts on "en" for everyone, so the first
 * render and the second agree.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { ActionButton } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { WorkspaceType } from "@/lib/saas/workspace-type";
import type { PersonRecord } from "@/lib/people/hats";
import { PersonHatsPanel } from "./PersonHatsPanel";
import { PeopleAddPerson } from "./PeopleAddPerson";
import { PeopleModel } from "./PeopleModel";
import { AccessTable, BookableTable, EveryoneTable } from "./PeopleTables";
import { PeopleTalentView } from "./PeopleTalentView";
import { TabStrip } from "./people-ui";
import { PEOPLE_REFUSAL } from "./people-classes";
import {
  countPeople,
  hatsWorn,
  isPeopleTab,
  parsePeopleView,
  peopleFor,
  type PeopleTab,
  type PeopleView,
} from "./people-views";

const K = "admin.people";
const B = "admin.people.board";

export function PeopleClient({
  people,
  loadFailed,
  workspaceAllowsDirectBooking,
  initialView,
  workspaceType,
}: {
  people: readonly PersonRecord[];
  loadFailed: boolean;
  /** See `PeopleSurface.workspaceAllowsDirectBooking`. */
  workspaceAllowsDirectBooking: boolean;
  initialView: PeopleView;
  workspaceType: WorkspaceType;
}) {
  const t = useT();
  const { adminBasePath, openDrawer } = useAdminShell();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setViewState] = useState<PeopleView>(initialView);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // The rail's children are soft navigations to `?view=`; follow them.
  const urlView = parsePeopleView(searchParams.get("view"));
  useEffect(() => {
    setViewState(urlView);
  }, [urlView]);

  const setView = useCallback(
    (next: PeopleView) => {
      setViewState(next);
      router.replace(next === "everyone" ? pathname : `${pathname}?view=${next}`, { scroll: false });
    },
    [pathname, router],
  );

  const counts = useMemo(() => countPeople(people), [people]);
  const tab: PeopleTab | null = isPeopleTab(view) ? view : null;
  const listed = useMemo(() => (tab ? peopleFor(people, tab) : []), [people, tab]);
  const selected = people.find((p) => p.key === selectedKey) ?? null;
  const you = people.find((p) => p.facts.isYou) ?? null;

  const tabs = [
    { id: "everyone" as const, label: t(`${K}.tabs.everyone`) },
    { id: "talent" as const, label: t(`${K}.tabs.talent`), count: counts.talent },
    { id: "bookable" as const, label: t(`${K}.tabs.bookable`), count: counts.bookable },
    { id: "access" as const, label: t(`${K}.tabs.access`), count: counts.access },
    // The roster's own queue, a real route that 404s a business workspace.
    ...(workspaceType === "talent"
      ? [{ id: "applications" as const, label: t(`${K}.tabs.applications`), href: `${adminBasePath}/roster/applications` }]
      : []),
  ];

  const open = (key: string) => setSelectedKey(key);
  const rosterHref = `${adminBasePath}/roster`;

  return (
    <div data-tulala-people-board className="flex w-full flex-col gap-[16px] font-admin-body">
      {/* Title, subtitle and the header actions the board names for this view */}
      <div className="flex items-start justify-between gap-[12px]">
        <div>
          <h1 className="m-0 text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">{t(`${B}.title.${view}`)}</h1>
          <p className="m-0 mt-[4px] text-admin-13 text-admin-ink-muted">{t(`${B}.subtitle.${view}`)}</p>
        </div>
        <HeaderActions view={view} setView={setView} rosterHref={rosterHref} />
      </div>

      {/* A failed read is NOT an empty workspace, and must never look like one. */}
      {loadFailed ? (
        <p role="alert" className={PEOPLE_REFUSAL}>
          {t(`${K}.loadFailed`)}
        </p>
      ) : null}

      {tab ? (
        <>
          <TabStrip
            tabs={tabs}
            active={tab}
            onSelect={(id) => {
              const next = parsePeopleView(id);
              if (isPeopleTab(next)) setView(next);
            }}
            label={t(`${K}.title`)}
          />

          {you && tab !== "access" ? (
            <div data-testid="people-you-too" className="flex items-center gap-[10px] rounded-[10px] bg-admin-surface-alt px-[14px] py-[10px] text-[12.5px] text-admin-ink-muted">
              <Icon name="user" size={14} stroke={1.75} />
              <span className="flex-1">
                {interpolate(t(`${B}.youToo`), { hats: hatsWorn(you).map((h) => t(`${K}.hat.${h}`)).join(" + ") })}
              </span>
              <button type="button" className="cursor-pointer font-semibold text-admin-ink hover:underline" onClick={() => open(you.key)}>
                {t(`${B}.actions.editMyProfile`)}
              </button>
            </div>
          ) : null}

          {listed.length === 0 && !loadFailed ? (
            <p data-testid="people-empty" className="rounded-[12px] border border-admin-border-soft bg-admin-card px-[16px] py-[12px] text-admin-13 text-admin-ink">
              {t(`${B}.empty.${tab}`)}
            </p>
          ) : null}

          {tab === "everyone" ? <EveryoneTable people={listed} selectedKey={selectedKey} onOpen={open} /> : null}
          {tab === "talent" ? <PeopleTalentView talent={listed} selectedKey={selectedKey} onOpen={open} /> : null}
          {tab === "bookable" ? <BookableTable people={listed} selectedKey={selectedKey} onOpen={open} /> : null}
          {tab === "access" ? <AccessTable people={listed} selectedKey={selectedKey} onOpen={open} /> : null}
        </>
      ) : view === "add" ? (
        <PeopleAddPerson
          people={people}
          onCancel={() => setView("everyone")}
          onOpenExisting={(key) => {
            setView("everyone");
            open(key);
          }}
          onCreateProfile={(name, email) =>
            openDrawer("talent-profile-shell", { mode: "create", seed: { stageName: name, contact: email || undefined, method: "agency" } })
          }
        />
      ) : (
        <PeopleModel people={people} />
      )}

      {selected ? (
        <PersonHatsPanel
          key={selected.key}
          person={selected}
          workspaceAllowsDirectBooking={workspaceAllowsDirectBooking}
          onClose={() => setSelectedKey(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * The header's buttons, per board: W27 Arrange order · ··· · Invite · Add
 * person; W29 Roles & limits · Invite · Add person; W30 From Talent · From
 * Access · Invite a contractor. "Invite" and "Add person" both open the Add
 * screen (W32), which is where an invitation is sent from; "Arrange order"
 * is the roster grid's own mode, so it is that door.
 */
function HeaderActions({ view, setView, rosterHref }: { view: PeopleView; setView: (v: PeopleView) => void; rosterHref: string }) {
  const t = useT();
  const { adminBasePath } = useAdminShell();
  // W32 and W26 draw no header actions; Cancel and the rail lead back.
  if (view === "add" || view === "model") return null;
  return (
    <div className="flex shrink-0 items-center gap-[8px]">
      {view === "talent" ? (
        <>
          <a href={rosterHref} className="inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[9px] border border-admin-border bg-admin-card px-[14px] text-admin-13 font-semibold text-admin-ink hover:border-admin-border-strong">
            {t(`${B}.actions.arrangeOrder`)}
          </a>
          <ActionButton onClick={() => setView("model")} className="px-[10px]">
            <span className="sr-only">{t(`${B}.actions.howItFits`)}</span>
            <Icon name="ellipsis" size={14} stroke={1.75} />
          </ActionButton>
        </>
      ) : null}
      {view === "access" ? (
        <a href={`${adminBasePath}/settings`} className="inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[9px] border border-admin-border bg-admin-card px-[14px] text-admin-13 font-semibold text-admin-ink hover:border-admin-border-strong">
          {t(`${B}.actions.rolesLimits`)}
        </a>
      ) : null}
      {view === "bookable" ? (
        <>
          <ActionButton onClick={() => setView("talent")}>{t(`${B}.actions.fromTalent`)}</ActionButton>
          <ActionButton onClick={() => setView("access")}>{t(`${B}.actions.fromAccess`)}</ActionButton>
          <ActionButton tone="primary" reason={t(`${B}.actionsOff.inviteContractor`)} testId="people-invite-contractor">
            <Icon name="plus" size={14} stroke={1.75} />
            {t(`${B}.actions.inviteContractor`)}
          </ActionButton>
        </>
      ) : (
        <>
          {view === "everyone" ? <ActionButton onClick={() => setView("model")}>{t(`${B}.actions.howItFits`)}</ActionButton> : null}
          <ActionButton onClick={() => setView("add")} testId="people-invite">
            {t(`${B}.actions.invite`)}
          </ActionButton>
          <ActionButton tone="primary" onClick={() => setView("add")} testId="people-add-person">
            <Icon name="plus" size={14} stroke={1.75} />
            {t(`${B}.actions.addPerson`)}
          </ActionButton>
        </>
      )}
    </div>
  );
}
