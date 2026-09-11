"use client";

/**
 * PeopleTalentView — W27: People › Talent. The "Used in" line, the four
 * tiles (Visible · Hidden · Claimed · Also Bookable here), the type / hat /
 * location filters and the six-up cards, every card the roster's own card
 * facts (code, state, city, types, headshot) plus the hats this person wears.
 *
 * The filters are built from the listed profiles, so the chips are the
 * workspace's own types and cities and not a fixed list.
 */

import { useMemo, useState } from "react";

import { FilterChip, StatePill, UsedIn, type PillTone } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { personNameOr } from "@/lib/people/display-name";
import type { PersonRecord } from "@/lib/people/hats";
import { HatChip, StatTile } from "./people-ui";
import { filterTalent, hatsWorn, talentCities, talentStats, talentTypeChips, type TalentFilter } from "./people-views";

const K = "admin.people";
const B = "admin.people.board";

const STATE_TONE: Record<NonNullable<PersonRecord["facts"]["profileState"]>, PillTone> = {
  draft: "slate",
  invited: "indigo",
  published: "green",
  "awaiting-approval": "coral",
  claimed: "green",
};

export function PeopleTalentView({
  talent,
  selectedKey,
  onOpen,
}: {
  talent: readonly PersonRecord[];
  selectedKey: string | null;
  onOpen: (key: string) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState<TalentFilter>({ type: null, hat: "any", city: null });
  const stats = useMemo(() => talentStats(talent), [talent]);
  const types = useMemo(() => talentTypeChips(talent), [talent]);
  const cities = useMemo(() => talentCities(talent), [talent]);
  const shown = useMemo(() => filterTalent(talent, filter), [talent, filter]);

  if (talent.length === 0) return null;

  return (
    <div className="flex flex-col gap-[16px]">
      <UsedIn
        count={6}
        label={t(`${B}.usedIn`)}
        parts={[
          { where: t(`${B}.usedPos`), what: t(`${B}.used.talentPos`) },
          { where: t(`${B}.usedWeb`), what: `${t(`${B}.used.talentWeb`)} · ${t(`${B}.used.talentNote`)}` },
        ]}
      />

      <div className="grid grid-cols-4 gap-[12px]" data-testid="people-talent-stats">
        <StatTile tone="green" label={t(`${B}.stats.visible`)} value={stats.visible} testId="people-stat-visible" />
        <StatTile tone="slate" label={t(`${B}.stats.hidden`)} value={stats.hidden} testId="people-stat-hidden" />
        <StatTile tone="royal" label={t(`${B}.stats.claimed`)} value={stats.claimed} testId="people-stat-claimed" />
        <StatTile tone="brand" label={t(`${B}.stats.alsoBookable`)} value={stats.alsoBookable} testId="people-stat-bookable" />
      </div>

      <div className="flex flex-wrap items-center gap-[8px]">
        <div role="group" aria-label={t(`${B}.filters.type`)} className="inline-flex flex-wrap gap-[2px] rounded-[9px] bg-admin-surface-alt p-[3px]">
          {[null, ...types].map((type) => {
            const active = filter.type === type;
            return (
              <button
                key={type ?? "all"}
                type="button"
                aria-pressed={active}
                className={`cursor-pointer rounded-[7px] px-[10px] py-[5px] text-[12px] font-semibold ${
                  active ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-admin-ink-muted hover:text-admin-ink"
                }`}
                onClick={() => setFilter((f) => ({ ...f, type }))}
              >
                {type ?? t(`${B}.filters.allTypes`)}
              </button>
            );
          })}
        </div>
        <span className="flex-1" />
        <FilterChip
          label={t(`${B}.filters.hat`)}
          value={filter.hat}
          options={[
            { id: "any", label: t(`${B}.filters.hatAny`) },
            { id: "bookable", label: t(`${B}.filters.hatBookable`) },
            { id: "access", label: t(`${B}.filters.hatAccess`) },
            { id: "publicOnly", label: t(`${B}.filters.hatPublicOnly`) },
          ]}
          onChange={(id) => setFilter((f) => ({ ...f, hat: id as TalentFilter["hat"] }))}
        />
        <FilterChip
          label={t(`${B}.filters.location`)}
          value={filter.city ?? "any"}
          options={[{ id: "any", label: t(`${B}.filters.locationAny`) }, ...cities.map((c) => ({ id: c, label: c }))]}
          onChange={(id) => setFilter((f) => ({ ...f, city: id === "any" ? null : id }))}
        />
        <span className="text-[12px] text-admin-ink-muted" data-testid="people-talent-count">
          {shown.length === 1 ? t(`${B}.filters.countOne`) : interpolate(t(`${B}.filters.count`), { count: shown.length })}
        </span>
      </div>

      <div className="grid grid-cols-6 gap-[12px]" data-testid="people-talent-cards">
        {shown.map((p) => (
          <TalentCard key={p.key} person={p} selected={selectedKey === p.key} onOpen={() => onOpen(p.key)} />
        ))}
      </div>
    </div>
  );
}

function TalentCard({ person, selected, onOpen }: { person: PersonRecord; selected: boolean; onOpen: () => void }) {
  const t = useT();
  const name = personNameOr(person.name, t(`${K}.unnamed`));
  const { facts } = person;
  const state = facts.profileState;
  return (
    <button
      type="button"
      aria-label={name}
      aria-current={selected ? "true" : undefined}
      data-people-card={person.key}
      className={`flex cursor-pointer flex-col overflow-hidden rounded-[14px] border bg-admin-card text-left ${
        selected ? "border-admin-brand" : "border-admin-border hover:border-admin-border-strong"
      }`}
      onClick={onOpen}
    >
      <div className="relative flex h-[150px] items-center justify-center bg-admin-surface-alt">
        {person.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the roster's own headshot from the media bucket
          <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="text-[44px] font-semibold tracking-[-0.03em] text-admin-ink-dim">
            {(name.trim()[0] ?? "?").toUpperCase()}
          </span>
        )}
        <span
          aria-hidden
          title={facts.siteVisible ? undefined : t(`${B}.card.hiddenFromSite`)}
          className={`absolute right-[10px] top-[10px] inline-flex h-[26px] w-[26px] items-center justify-center rounded-full ${
            facts.siteVisible ? "bg-admin-brand text-white" : "bg-admin-card text-admin-ink-dim"
          }`}
        >
          <Icon name={facts.siteVisible ? "globe" : "lock"} size={13} stroke={1.75} />
        </span>
        {state ? (
          <span className="absolute left-[10px] top-[10px]">
            <StatePill tone={STATE_TONE[state]} state={state}>
              {t(`${B}.state.${state}`)}
            </StatePill>
          </span>
        ) : null}
        {facts.profileCode ? (
          <span className="absolute bottom-[10px] right-[10px] rounded-full bg-admin-ink px-[7px] py-[2px] text-[10px] font-semibold tracking-[0.02em] text-white">
            {facts.profileCode}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-[4px] px-[10px] pb-[10px] pt-[10px]">
        <span className="truncate text-[14px] font-semibold text-admin-ink">{name}</span>
        <span className="flex flex-col text-[10.5px] font-semibold uppercase tracking-[0.08em] text-admin-ink-muted">
          {facts.types.length === 0 ? <span className="normal-case tracking-normal text-admin-ink-dim">{t(`${B}.card.noTypes`)}</span> : null}
          {facts.types.slice(0, 2).map((type) => (
            <span key={type} className="truncate">
              {type}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-[4px] text-[12px] text-admin-ink-muted">
          <Icon name="map-pin" size={12} stroke={1.75} />
          <span className="truncate">{facts.city ?? t(`${B}.card.noCity`)}</span>
        </span>
        <span className="mt-[4px] flex flex-wrap gap-[3px]">
          {hatsWorn(person).map((h) => (
            <HatChip key={h} hat={h} label={t(`${K}.hat.${h}`)} />
          ))}
        </span>
      </div>
    </button>
  );
}
