import Link from "next/link";
import { CalendarRange, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingPanelData } from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Booking rail panel (§5.2.5, roadmap M4.5).
 *
 * Read-only for M4.5 per the execution-mode brief: "must reflect booking
 * state exactly as engine defines it — include override visibility if
 * present (read-only for now)." Convert / override-convert action wiring
 * remains in the existing V2 convert panel until a dedicated M4.x follow-up
 * moves the flow here.
 *
 * `state` values come from the caller, which derives them from
 * `agency_bookings` presence + `engine_inquiry_group_shortfall`
 * readiness — no re-derivation happens here.
 */
export function WorkspaceV3PanelBooking({ data }: { data: BookingPanelData }) {
  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <StateBadge state={data.state} />
      {data.firstBooking ? (
        <div className="flex flex-col gap-1 rounded-md border border-border/40 bg-foreground/[0.02] px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <CalendarRange className="size-3.5 text-muted-foreground/80" aria-hidden />
            <Link
              href={`/admin/bookings/${data.firstBooking.id}`}
              scroll={false}
              className="min-w-0 flex-1 truncate font-medium hover:underline"
            >
              {data.firstBooking.title ?? "Booking"}
            </Link>
            <span className="rounded-full border border-border/40 px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
              {data.firstBooking.status}
            </span>
          </div>
          {data.firstBooking.startsAt ? (
            <p className="text-[11px] text-muted-foreground/80">
              {formatDateRange(data.firstBooking.startsAt, data.firstBooking.endsAt)}
            </p>
          ) : null}
          {data.bookingCount > 1 ? (
            <p className="text-[11px] text-muted-foreground/70">
              +{data.bookingCount - 1} more linked booking
              {data.bookingCount - 1 === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      ) : null}
      {data.override.active ? (
        <div
          className="flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-50/40 px-2 py-1.5 text-[11px] dark:border-amber-500/30 dark:bg-amber-500/5"
          title={data.override.reason ?? undefined}
        >
          <ShieldAlert
            className="mt-0.5 size-3.5 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              Converted with override
            </p>
            {data.override.reason ? (
              <p className="mt-0.5 break-words text-amber-700/90 dark:text-amber-400/90">
                {data.override.reason}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
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
