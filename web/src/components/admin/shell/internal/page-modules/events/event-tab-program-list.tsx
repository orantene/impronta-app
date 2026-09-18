"use client";

/**
 * event-tab-program-list — the run-of-show list of the Programa tab
 * (proposal §4, §6, §9): groups by night (one per session, no header for a
 * single-night event) or by place, rows with the time badge (`+1` past
 * midnight), the kind chip, the performer, the place, the staff-only eye
 * and the status dot; a row menu with Edit / Duplicate / Hide-Show / Delete
 * and up / down where a move can change anything (time wins over manual
 * order, so only same-instant neighbours are offered).
 *
 * Draws only. Every write is a callback the tab wires to a staff action.
 */

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";

import {
  groupItemsByNight,
  groupItemsBySpace,
  type PlacedScheduleItem,
  type ScheduleSessionRef,
  type ScheduleSpaceRef,
} from "@/lib/events/schedule/grouping";
import type { ScheduleItem } from "@/lib/events/schedule/model";
import { labelLocale, moveTargets, overlapNotes, type OverlapNote } from "@/lib/events/schedule/program-tab-model";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";

import { CARD, Chip } from "../catalog/catalog-ui";
import { RowMenu } from "./events-ui";

export type ProgramListActions = {
  onEdit: (item: ScheduleItem) => void;
  onDuplicate: (item: ScheduleItem) => void;
  onToggleVisibility: (item: ScheduleItem) => void;
  onDelete: (item: ScheduleItem) => void;
  onMove: (item: ScheduleItem, withId: string) => void;
};

export function ProgramList({
  items,
  sessions,
  spaces,
  zone,
  locale,
  groupBy,
  busyId,
  actions,
}: {
  items: ScheduleItem[];
  sessions: ScheduleSessionRef[];
  spaces: ScheduleSpaceRef[];
  zone: string | null;
  locale: string;
  groupBy: "day" | "stage";
  busyId: string | null;
  actions: ProgramListActions;
}) {
  const t = useT();
  const ll = labelLocale(locale);
  const notes = overlapNotes(items, spaces);
  const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
  const groups =
    groupBy === "stage"
      ? groupItemsBySpace(items, spaces, zone, { locale: ll }).map((g) => ({ key: g.key, label: g.label, items: g.items }))
      : groupItemsByNight(items, sessions, zone, { locale: ll }).map((g) => ({ key: g.key, label: g.label, items: g.items }));
  const showHeaders = groups.length > 1;

  return (
    <div className="flex flex-col gap-[12px]" data-testid="events-program-list" data-group-by={groupBy}>
      {groups.map((g) => (
        <section key={g.key} className={CARD} data-testid={`events-program-group-${g.key}`}>
          {showHeaders ? <h3 className="m-0 px-[16px] pt-[12px] pb-[6px] font-admin-body text-[12px] font-semibold uppercase tracking-[0.05em] text-admin-ink-muted">{g.label}</h3> : null}
          <ul className="m-0 list-none p-0">
            {g.items.map((placed) => {
              const targets = moveTargets(
                g.items.map((p) => p.item),
                placed.item.id,
              );
              return (
                <ProgramRow
                  key={placed.item.id}
                  placed={placed}
                  spaceName={placed.item.spaceId ? (spaceName.get(placed.item.spaceId) ?? null) : null}
                  notes={notes.get(placed.item.id) ?? []}
                  busy={busyId === placed.item.id}
                  targets={targets}
                  actions={actions}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

const STATUS_DOT: Record<ScheduleItem["status"], string> = {
  draft: "bg-admin-border-strong",
  published: "bg-admin-success",
};

function ProgramRow({
  placed,
  spaceName,
  notes,
  busy,
  targets,
  actions,
}: {
  placed: PlacedScheduleItem;
  spaceName: string | null;
  notes: OverlapNote[];
  busy: boolean;
  targets: { up: string | null; down: string | null };
  actions: ProgramListActions;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const { item } = placed;
  const performer = item.performerTba ? t("dashboard.events.program.row.performerTba") : (item.performerName ?? null);
  const staffOnly = item.visibility === "staff";

  const menuItem = (label: string, icon: ReactNode, onClick: () => void, testId: string, danger = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={busy}
      onClick={() => {
        setMenuOpen(false);
        onClick();
      }}
      data-testid={testId}
      className={`inline-flex h-[30px] cursor-pointer items-center gap-[6px] rounded-[8px] border border-transparent bg-admin-surface-alt px-[10px] font-admin-body text-[12px] font-semibold hover:bg-admin-border-soft disabled:cursor-not-allowed disabled:opacity-50 ${danger ? "text-admin-red" : "text-admin-ink"}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <li className="border-t border-admin-border-soft first:border-t-0" data-testid={`events-program-item-${item.id}`} data-status={item.status} data-visibility={item.visibility}>
      <div className="flex items-start gap-[12px] px-[16px] py-[10px] max-[720px]:gap-[10px]">
        {/* The hour badge: 64px, the LUMINA column (proposal §9). */}
        <div className="flex w-[64px] shrink-0 flex-col items-start pt-[2px]" data-testid="events-program-time">
          <span className="font-mono text-[12.5px] font-semibold tabular-nums leading-[1.2] text-admin-ink">
            {placed.timeLabel ?? t("dashboard.events.program.row.timeTba")}
            {placed.dayOffset !== 0 && placed.timeLabel ? <sup className="ml-[2px] text-[9px] font-semibold text-admin-ink-muted">{placed.dayOffset > 0 ? `+${placed.dayOffset}` : String(placed.dayOffset)}</sup> : null}
          </span>
          {placed.endTimeLabel ? <span className="font-mono text-[11px] tabular-nums leading-[1.2] text-admin-ink-muted">{placed.endTimeLabel}</span> : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
          <div className="flex min-w-0 flex-wrap items-center gap-[6px]">
            <span aria-label={item.status === "published" ? t("dashboard.events.program.row.published") : t("dashboard.events.program.row.draft")} title={item.status === "published" ? t("dashboard.events.program.row.published") : t("dashboard.events.program.row.draft")} className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${STATUS_DOT[item.status]}`} data-testid="events-program-status-dot" />
            <span className="min-w-0 truncate font-admin-body text-[13.5px] font-semibold text-admin-ink">{item.title}</span>
            <Chip>{t(`dashboard.events.program.kind.${item.kind}`)}</Chip>
            {spaceName ? <Chip tone="brand">{spaceName}</Chip> : null}
            {staffOnly ? (
              <span className="inline-flex items-center gap-[3px] font-admin-body text-[11px] font-semibold text-admin-ink-muted" title={t("dashboard.events.program.row.staffOnly")} data-testid="events-program-staff-eye">
                <EyeOff aria-hidden size={12} strokeWidth={1.75} />
                {t("dashboard.events.program.row.staffOnly")}
              </span>
            ) : null}
          </div>
          {performer ? (
            <div className="flex min-w-0 items-center gap-[6px] font-admin-body text-[12.5px] text-admin-ink-muted" data-testid="events-program-performer-line">
              {item.performerTalentProfileId ? (
                <span aria-hidden className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-admin-border-soft text-[10px] font-semibold text-admin-ink-muted">
                  {(item.performerName ?? "?").trim().charAt(0).toUpperCase()}
                </span>
              ) : null}
              <span className="truncate">{performer}</span>
            </div>
          ) : null}
          {notes.length > 0 ? (
            <p className="m-0 font-admin-body text-[11.5px] leading-[1.35] text-admin-amber-deep" data-testid="events-program-overlap">
              {notes.map((n) => (n.spaceName ? interpolate(t("dashboard.events.program.row.overlapIn"), { title: n.withTitle, place: n.spaceName }) : interpolate(t("dashboard.events.program.row.overlap"), { title: n.withTitle }))).join(" · ")}
            </p>
          ) : null}
          {menuOpen ? (
            <div role="menu" className="mt-[4px] flex flex-wrap gap-[6px]" data-testid={`events-program-menu-${item.id}`}>
              {menuItem(t("dashboard.events.program.row.edit"), <Pencil aria-hidden size={12} strokeWidth={1.75} />, () => actions.onEdit(item), `events-program-edit-${item.id}`)}
              {menuItem(t("dashboard.events.program.row.duplicate"), <Copy aria-hidden size={12} strokeWidth={1.75} />, () => actions.onDuplicate(item), `events-program-duplicate-${item.id}`)}
              {menuItem(
                staffOnly ? t("dashboard.events.program.row.show") : t("dashboard.events.program.row.hide"),
                staffOnly ? <Eye aria-hidden size={12} strokeWidth={1.75} /> : <EyeOff aria-hidden size={12} strokeWidth={1.75} />,
                () => actions.onToggleVisibility(item),
                `events-program-visibility-${item.id}`,
              )}
              {menuItem(t("dashboard.events.program.row.delete"), <Trash2 aria-hidden size={12} strokeWidth={1.75} />, () => actions.onDelete(item), `events-program-delete-${item.id}`, true)}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-[2px] pt-[2px]">
          <button type="button" aria-label={t("dashboard.events.program.row.moveUp")} title={targets.up ? undefined : t("dashboard.events.program.row.moveReason")} disabled={busy || !targets.up} onClick={() => targets.up && actions.onMove(item, targets.up)} className="inline-flex h-[24px] w-[24px] cursor-pointer items-center justify-center rounded-[6px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink disabled:cursor-not-allowed disabled:opacity-35" data-testid={`events-program-up-${item.id}`}>
            <ArrowUp aria-hidden size={13} strokeWidth={1.75} />
          </button>
          <button type="button" aria-label={t("dashboard.events.program.row.moveDown")} title={targets.down ? undefined : t("dashboard.events.program.row.moveReason")} disabled={busy || !targets.down} onClick={() => targets.down && actions.onMove(item, targets.down)} className="inline-flex h-[24px] w-[24px] cursor-pointer items-center justify-center rounded-[6px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink disabled:cursor-not-allowed disabled:opacity-35" data-testid={`events-program-down-${item.id}`}>
            <ArrowDown aria-hidden size={13} strokeWidth={1.75} />
          </button>
          <span className="ml-[4px] inline-flex h-[24px] items-center">
            <RowMenu label={t("dashboard.events.program.row.menu")} onClick={() => setMenuOpen((v) => !v)} testId={`events-program-menu-button-${item.id}`} />
          </span>
        </div>
      </div>
    </li>
  );
}
