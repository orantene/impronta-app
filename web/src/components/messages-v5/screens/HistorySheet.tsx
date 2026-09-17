"use client";

/**
 * HistorySheet (D23): the ordered `loadConversationHistory` entries, grouped
 * by day. Staff-only read (D-MSG-4); client actions are already attributed
 * to "Client" in the sentence `history.ts` renders server-side (D-MSG-3/50),
 * this sheet just draws them. Export is a seam (D-MSG-10x): a greyed,
 * disabled button that says "coming", never a fake control.
 *
 * Reuses kit pieces rather than inventing new ones where one already fits:
 * `DaySeparator` for the day headers (same element the thread stream uses),
 * `.pn-sec` for the header row, `Btn` for Export. Only the entry row itself
 * (`hist-row` / `mx-hist-row`) is new — the kit has nothing shaped like
 * "icon, one sentence, a time" — with its two small rules in `kit/tokens.css`.
 */

import type { ReactNode } from "react";

import { DaySeparator } from "../kit/MessageBubble";
import { Btn, Icon, Pill } from "../kit/primitives";
import { RefusalLine } from "../kit/RefusalLine";
import { Sheet } from "../kit/Sheet";
import { EmptyState, Skeleton } from "../kit/Skeleton";
import type { HistorySheetProps } from "./contracts";

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(iso: string, today: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isSameDay(d, now)) return today;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" }).format(d);
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}

export function HistorySheet({ entries, open, onClose, copy, variant, error }: HistorySheetProps) {
  const c = copy.history;
  const now = new Date();

  let body: ReactNode;
  if (error) {
    body = <RefusalLine code={error} copy={copy} variant={variant} />;
  } else if (entries === null) {
    body = <Skeleton rows={5} variant={variant} copy={copy} />;
  } else if (entries.length === 0) {
    body = <EmptyState icon="clock" title={c.emptyTitle} body={c.emptyBody} variant={variant} small />;
  } else {
    type Entry = (typeof entries)[number];
    type Group = { key: string; label: string; rows: Entry[] };
    const groups: Group[] = [];
    for (const entry of entries) {
      const key = dayKey(entry.at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.rows.push(entry);
      } else {
        groups.push({ key, label: dayLabel(entry.at, c.today, now), rows: [entry] });
      }
    }
    body = (
      <div data-history-list>
        {groups.map((g) => (
          <div key={g.key} data-history-day={g.key}>
            <DaySeparator label={g.label} variant={variant} />
            {g.rows.map((entry, i) => (
              <div
                key={`${entry.at}-${i}`}
                className={variant === "mobile" ? "mx-hist-row" : "hist-row"}
                data-history-entry={entry.kind}
                data-history-actor={entry.actorLabel}
              >
                <Icon name="check" size={variant === "mobile" ? 14 : 13} />
                <span className="tx">{entry.text}</span>
                <span className="t">{timeLabel(entry.at)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <Sheet open={open} title={c.title} copy={copy} onClose={onClose} variant={variant === "mobile" ? "mobile-h92" : "desktop"} width={560} labelledBy="msgv5-history-title">
      <div data-history-sheet>
        <section className="pn-sec">
          <h4>
            {c.title}
            <Btn size="xs" variant="secondary" disabled title={c.exportComing} data-history-export>
              {c.export}
            </Btn>
            <Pill tone="off" light>
              {c.exportComing}
            </Pill>
          </h4>
        </section>
        {body}
      </div>
    </Sheet>
  );
}
