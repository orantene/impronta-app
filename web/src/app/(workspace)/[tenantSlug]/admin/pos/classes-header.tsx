"use client";

/**
 * classes-header.tsx — the Front desk's 64px header as boards B01 and B05
 * draw it: the screen's title over its one-line summary on the left (the
 * day with its counts and the venue's clock, or the class and "starts in N
 * min" while a check-in is open), the location pill and the operator pill
 * on the right. The day arrows and the reload sit inside the summary line;
 * the boards draw no separate control for them.
 */

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import type { ClassesDay } from "@/lib/pos/classes/day";

import { PosIcon } from "./classes-ui";

export function ClassesHeader({
  title,
  subtitle,
  summary,
  day,
  copy,
  locationName,
  operatorName,
  onDay,
  onReload,
}: {
  title: string;
  /** Set while a check-in is open: replaces the day line. */
  subtitle: string | null;
  /** "{date} · N appointments · N classes" */
  summary: string;
  day: ClassesDay;
  copy: ClassesCopy;
  locationName: string;
  operatorName: string;
  onDay: (offset: number) => void;
  onReload: () => void;
}) {
  const b = copy.board;
  return (
    <header className="flex h-[64px] shrink-0 items-center gap-[12px] border-b border-admin-border bg-admin-card px-[22px]">
      <div className="min-w-0">
        <h1 className="m-0 truncate font-admin-body text-[19px] font-semibold leading-[1.2] tracking-[-0.01em] text-admin-ink">{title}</h1>
        <p
          className="m-0 flex items-center gap-[6px] truncate font-admin-body text-[13px] leading-[1.2] text-admin-ink-muted"
          data-pos-classes-day={day.ymd}
          data-pos-classes-zone={day.timeZone}
        >
          {subtitle ? (
            <span className="truncate">{subtitle}</span>
          ) : (
            <>
              <button
                type="button"
                aria-label={copy.day.prev}
                className="cursor-pointer rounded-[6px] px-[2px] text-admin-ink-dim hover:text-admin-ink"
                onClick={() => onDay(day.dayOffset - 1)}
              >
                ‹
              </button>
              <span className="truncate">{summary}</span>
              <button
                type="button"
                aria-label={copy.day.next}
                className="cursor-pointer rounded-[6px] px-[2px] text-admin-ink-dim hover:text-admin-ink"
                onClick={() => onDay(day.dayOffset + 1)}
              >
                ›
              </button>
              {day.dayOffset !== 0 ? (
                <button type="button" className="cursor-pointer font-semibold text-admin-brand underline underline-offset-2" onClick={() => onDay(0)}>
                  {copy.day.backToToday}
                </button>
              ) : null}
              <span className="text-admin-ink-dim">· {day.timeZone}</span>
              <button
                type="button"
                aria-label={copy.day.reload}
                title={copy.day.reload}
                className="cursor-pointer rounded-[6px] px-[2px] text-admin-ink-dim hover:text-admin-ink"
                onClick={onReload}
              >
                ↻
              </button>
            </>
          )}
        </p>
      </div>
      <div className="flex-1" />
      <span
        className="inline-flex h-[40px] shrink-0 items-center gap-[7px] rounded-[12px] border-[1.5px] border-admin-border bg-admin-card px-[12px] font-admin-body text-[14px] font-semibold leading-[1.2] text-admin-ink"
        title={b.header.location}
      >
        <PosIcon name="pin" size={16} className="text-admin-ink-muted" />
        {locationName}
      </span>
      <span
        className="inline-flex h-[40px] shrink-0 items-center gap-[8px] rounded-[12px] border-[1.5px] border-admin-border bg-admin-card pl-[6px] pr-[12px] font-admin-body text-[14px] font-semibold leading-[1.2] text-admin-ink"
        title={b.header.operator}
      >
        <span className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-admin-brand-soft text-[12px] font-semibold text-admin-brand">{initialsOf(operatorName)}</span>
        {operatorName}
      </span>
    </header>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""}`.toUpperCase() || "·";
}
