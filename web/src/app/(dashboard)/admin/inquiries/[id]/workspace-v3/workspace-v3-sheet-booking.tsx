import Link from "next/link";
import { CalendarRange, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingDrillPayload } from "./workspace-v3-drill-types";
import type { BookingPanelData } from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Booking drill body (spec §5.3.4, M5.4).
 *
 * Extends the rail panel with the booked-talent roster and full override
 * visibility. The state badge, first-booking summary and override pill
 * remain the engine-canonical read (from `summary`); the sheet adds the
 * per-talent breakdown that the panel can't fit.
 */
export function WorkspaceV3SheetBooking({
  data,
}: {
  data: BookingDrillPayload;
}) {
  const { summary } = data;
  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <header className="flex flex-col gap-1">
        <StateBadge state={summary.state} />
        {summary.firstBooking ? (
          <div className="flex flex-col gap-1 rounded-md border border-border/40 bg-foreground/[0.02] px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <CalendarRange
                className="size-3.5 text-muted-foreground/80"
                aria-hidden
              />
              <Link
                href={`/admin/bookings/${summary.firstBooking.id}`}
                scroll={false}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {summary.firstBooking.title ?? "Booking"}
              </Link>
              <span className="rounded-full border border-border/40 px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                {summary.firstBooking.status}
              </span>
            </div>
            {summary.firstBooking.startsAt ? (
              <p className="text-[11px] text-muted-foreground/80">
                {formatDateRange(
                  summary.firstBooking.startsAt,
                  summary.firstBooking.endsAt,
                )}
              </p>
            ) : null}
            {summary.bookingCount > 1 ? (
              <p className="text-[11px] text-muted-foreground/70">
                +{summary.bookingCount - 1} more linked booking
                {summary.bookingCount - 1 === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        ) : null}
        {summary.override.active ? (
          <div
            className="flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-50/40 px-2 py-1.5 text-[11px] dark:border-amber-500/30 dark:bg-amber-500/5"
          >
            <ShieldAlert
              className="mt-0.5 size-3.5 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Converted with override
              </p>
              {summary.override.reason ? (
                <p className="mt-0.5 break-words text-amber-700/90 dark:text-amber-400/90">
                  {summary.override.reason}
                </p>
              ) : (
                <p className="mt-0.5 italic text-amber-700/80 dark:text-amber-400/80">
                  No reason recorded.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <section aria-label="Booked talent">
        <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Talent on bookings ({data.talent.length})
        </h4>
        {data.talent.length === 0 ? (
          <p className="mt-1 text-muted-foreground/80">
            No talent on linked bookings yet.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5">
            {data.talent.map((t, idx) => (
              <li
                key={`${t.bookingId}-${idx}`}
                className="flex items-center gap-2 rounded border border-border/30 bg-background/60 px-2 py-1 text-[11px]"
              >
                <span className="font-mono text-muted-foreground/80">
                  {t.profileCode ?? "—"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {t.displayName ?? "Unnamed"}
                </span>
                <Link
                  href={`/admin/bookings/${t.bookingId}`}
                  scroll={false}
                  className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70 hover:text-foreground hover:underline"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StateBadge({ state }: { state: BookingPanelData["state"] }) {
  const { label, tone } = describeState(state);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px]",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function describeState(state: BookingPanelData["state"]): {
  label: string;
  tone: string;
} {
  switch (state) {
    case "booked":
      return {
        label: "Booked",
        tone: "border-emerald-500/40 bg-emerald-50/60 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
      };
    case "ready_to_convert":
      return {
        label: "Ready to convert",
        tone: "border-[var(--impronta-gold,#c9a24b)]/40 bg-[var(--impronta-gold,#c9a24b)]/10 text-foreground",
      };
    case "not_ready":
      return {
        label: "Not ready — requirement groups unmet",
        tone: "border-amber-400/40 bg-amber-50/60 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-300",
      };
    case "none":
    default:
      return {
        label: "No booking yet",
        tone: "border-border/40 bg-foreground/[0.02] text-muted-foreground",
      };
  }
}

function formatDateRange(startIso: string, endIso: string | null): string {
  const start = safeDate(startIso);
  if (!start) return "";
  const end = endIso ? safeDate(endIso) : null;
  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return end ? `${fmt(start)} → ${fmt(end)}` : fmt(start);
}

function safeDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
