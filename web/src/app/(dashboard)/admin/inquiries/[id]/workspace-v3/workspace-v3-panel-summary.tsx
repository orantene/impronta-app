import { CalendarRange, MapPin, Tag, Users } from "lucide-react";
import type { SummaryPanelData } from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Summary rail panel (§5.2.1, roadmap M4.1).
 *
 * Pure server component. Renders a deterministic ordered list of
 * already-resolved inquiry fields. Does NOT compute status state — the
 * caller passes `statusSentence` from `getWorkspaceStateSentence` so no
 * duplicate derivation exists (spec §5.5 principle 5).
 *
 * Fields intentionally omitted until schema exists:
 *   • budget band — no column on `inquiries` today (see panel-types note).
 */
export function WorkspaceV3PanelSummary({ data }: { data: SummaryPanelData }) {
  const clientLabel = formatClientLabel(data.clientName, data.company);
  const dateLabel = formatEventDate(data.eventDate);
  const lastActivity = formatRelative(data.lastActivityAt);

  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <Row icon={<Users className="size-3.5" aria-hidden />} label="Client">
        {clientLabel ?? <Muted>No client details</Muted>}
      </Row>
      <Row icon={<Tag className="size-3.5" aria-hidden />} label="Event type">
        {data.eventType ?? <Muted>Not specified</Muted>}
      </Row>
      <Row icon={<CalendarRange className="size-3.5" aria-hidden />} label="Event date">
        {dateLabel ?? <Muted>Not specified</Muted>}
      </Row>
      <Row icon={<MapPin className="size-3.5" aria-hidden />} label="Location">
        {data.eventLocation ?? <Muted>Not specified</Muted>}
      </Row>
      {data.quantity != null ? (
        <Row icon={<Users className="size-3.5" aria-hidden />} label="Quantity">
          {data.quantity === 1 ? "1 person" : `${data.quantity} people`}
        </Row>
      ) : null}
      <div className="mt-1 rounded-md border border-border/40 bg-foreground/[0.03] px-2 py-1.5 text-[11px] text-foreground/80">
        {data.statusSentence}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
        Last activity {lastActivity}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground/80">{icon}</span>
      <span className="min-w-[88px] shrink-0 text-muted-foreground/80">{label}</span>
      <span className="min-w-0 flex-1 break-words text-foreground/90">{children}</span>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground/70">{children}</span>;
}

function formatClientLabel(name: string | null, company: string | null): string | null {
  const parts = [name, company].filter((v): v is string => Boolean(v && v.trim().length));
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} · ${parts[1]}`;
}

function formatEventDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
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
