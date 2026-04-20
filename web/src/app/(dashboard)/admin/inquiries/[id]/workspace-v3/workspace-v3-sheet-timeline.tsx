import type { TimelineDrillPayload } from "./workspace-v3-drill-types";
import type { RecentActivityEvent } from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Timeline drill body (spec §5.3.5, M5.5).
 *
 * Full-ish inquiry_events audit view. Events are loaded via
 * `loadRecentActivityPanelData(..., 100)` — same canonical source as the
 * rail panel, just a taller cap. The `totalCount` header reflects the true
 * row count on `inquiry_events` for this inquiry so staff can tell whether
 * the 100-row cap is hiding history.
 *
 * This is strictly a projection of the audit stream — no synthesized events,
 * no cross-source aggregation, no re-ordering.
 */
export function WorkspaceV3SheetTimeline({
  data,
}: {
  data: TimelineDrillPayload;
}) {
  const shown = data.events.length;
  const more = Math.max(0, data.totalCount - shown);
  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <header className="flex items-baseline justify-between">
        <span className="text-muted-foreground/80">
          Showing <b className="text-foreground/80">{shown}</b> of{" "}
          <b className="text-foreground/80">{data.totalCount}</b> event
          {data.totalCount === 1 ? "" : "s"}
        </span>
        {more > 0 ? (
          <span className="text-[11px] text-muted-foreground/70">
            Older history in audit log
          </span>
        ) : null}
      </header>
      {shown === 0 ? (
        <p className="text-muted-foreground/80">No activity recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.events.map((e) => (
            <EventItem key={e.id} event={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EventItem({ event }: { event: RecentActivityEvent }) {
  const payloadPreview = summarizePayload(event.payload);
  return (
    <li className="flex flex-col gap-0.5 rounded-md border border-border/40 bg-foreground/[0.02] px-2 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium text-foreground/90">
          {formatEventType(event.type)}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {formatAbsolute(event.createdAt)}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground/80">
        {event.actorName ? <span>by {event.actorName}</span> : null}
        {payloadPreview ? (
          <span className="truncate font-mono text-muted-foreground/70">
            {payloadPreview}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function summarizePayload(payload: Record<string, unknown>): string | null {
  if (!payload || typeof payload !== "object") return null;
  const keys = Object.keys(payload);
  if (keys.length === 0) return null;
  // Show up to 3 short scalar pairs so the row stays single-line-ish.
  const parts: string[] = [];
  for (const k of keys.slice(0, 3)) {
    const v = payload[k];
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      const s = String(v);
      parts.push(`${k}=${s.length > 24 ? `${s.slice(0, 24)}…` : s}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatEventType(t: string): string {
  return t
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
