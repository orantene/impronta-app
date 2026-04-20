import type {
  RecentActivityEvent,
  RecentActivityPanelData,
} from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Recent Activity rail panel (§5.2.7, roadmap M4.7).
 *
 * Last N `inquiry_events` rows for this inquiry, newest first. The source
 * is strictly the audit stream (execution-mode brief: "must use
 * inquiry_events only. no synthetic activity feed").
 *
 * Drill-down to the full timeline is an M5.5 concern; this panel exposes
 * a "View full timeline →" affordance that is inert in M4 but preserves
 * the spec's visual contract so M5.5 can wire it without layout churn.
 */
export function WorkspaceV3PanelRecentActivity({
  data,
}: {
  data: RecentActivityPanelData;
}) {
  if (data.events.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground/80">
        No activity recorded yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 text-[12px]">
      <ul className="flex flex-col gap-1">
        {data.events.map((e) => (
          <EventItem key={e.id} event={e} />
        ))}
      </ul>
      {data.hasMore ? (
        <span
          className="text-[11px] text-muted-foreground/70"
          aria-label="Full timeline drill-down lands in M5.5"
        >
          View full timeline →
        </span>
      ) : null}
    </div>
  );
}

function EventItem({ event }: { event: RecentActivityEvent }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-md border border-border/40 bg-foreground/[0.02] px-2 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium text-foreground/90">
          {formatEventType(event.type)}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {formatRelative(event.createdAt)}
        </span>
      </div>
      {event.actorName ? (
        <p className="text-[11px] text-muted-foreground/80">by {event.actorName}</p>
      ) : null}
    </li>
  );
}

function formatEventType(t: string): string {
  // Prefer the engine's own namespaced strings ("offer.sent", "booking.created");
  // fall back to a humanized form for future additions.
  return t
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
