"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { Button } from "@/components/ui/button";
import { formatAdminTimestamp } from "@/lib/admin/format-admin-timestamp";
import { ADMIN_OUTLINE_CONTROL_CLASS } from "@/lib/dashboard-shell-classes";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const INQUIRY_STATUS_LABEL: Record<string, string> = {
  new: "New",
  reviewing: "Reviewing",
  waiting_for_client: "Waiting",
  talent_suggested: "Suggested",
  in_progress: "In progress",
  qualified: "Qualified",
  converted: "Converted",
  closed: "Closed",
  closed_lost: "Lost",
  archived: "Archived",
};

function relOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

type RosterPeekMap = Record<string, { count: number; labelLine: string }>;

type FetchedRow = {
  id: string;
  status: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  created_at: string;
  roster_peek_line?: string;
  roster_count?: number;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: FetchedRow[] };

function buildInquiriesHref(userId: string) {
  return `/admin/inquiries?client_user_id=${encodeURIComponent(userId)}`;
}

export function AdminClientInquiriesPanelTrigger({
  userId,
  displayName,
  trigger = "icon",
  iconButtonClassName,
  textButtonClassName,
  textLabel = "Inquiries",
  textVariant = "outline",
  buttonTitle,
}: {
  userId: string;
  displayName?: string | null;
  trigger?: "icon" | "text";
  /** Passed through when `trigger="icon"` (table actions). */
  iconButtonClassName?: string;
  /** Overrides default outline styling when `trigger="text"`. */
  textButtonClassName?: string;
  /** Label for the text trigger button. */
  textLabel?: string;
  textVariant?: "outline" | "ghost";
  /** Native tooltip on the trigger (both icon and text). */
  buttonTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });

  const title = displayName?.trim() || "Client";
  const description =
    "Requests linked to this client login. Open one for the full workspace, or jump to the filtered Inquiries list.";

  const fetchRows = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) {
      setLoad({ status: "error", message: "Supabase is not configured." });
      return;
    }
    setLoad({ status: "loading" });
    const { data, error } = await supabase
      .from("inquiries")
      .select(
        `
        id,
        status,
        contact_name,
        company,
        event_date,
        event_location,
        created_at
      `,
      )
      .eq("client_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setLoad({ status: "error", message: error.message });
      return;
    }
    const baseRows = (data ?? []) as FetchedRow[];
    const ids = baseRows.map((r) => r.id);
    try {
      const res = await fetch(`/api/admin/inquiries/roster-peek?ids=${encodeURIComponent(ids.join(","))}`);
      const json = (await res.json()) as { map?: RosterPeekMap };
      const peek = json.map ?? {};
      for (const row of baseRows) {
        row.roster_peek_line = peek[row.id]?.labelLine ?? "No talent on shortlist";
        row.roster_count = peek[row.id]?.count ?? 0;
      }
    } catch {
      // best-effort, panel remains functional without peek
    }
    setLoad({ status: "ready", rows: baseRows });
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    void fetchRows();
  }, [open, fetchRows]);

  useEffect(() => {
    if (!open) setLoad({ status: "idle" });
  }, [open]);

  const defaultTriggerTitle =
    buttonTitle ??
    "See this client’s requests in a scrollable list. Opens the full Inquiries page from the panel.";

  const triggerNode =
    trigger === "icon" ? (
      <Button
        type="button"
        size="icon"
        variant="outline"
        className={cn("h-9 w-9 rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS, iconButtonClassName)}
        title={defaultTriggerTitle}
        aria-label="Browse this client’s requests"
        onClick={() => setOpen(true)}
      >
        <Inbox className="size-4" aria-hidden />
      </Button>
    ) : (
      <Button
        type="button"
        size="sm"
        variant={textVariant}
        title={defaultTriggerTitle}
        aria-label={`${textLabel}: browse this client’s requests`}
        className={cn(
          "h-8 rounded-lg px-2.5 text-xs",
          textVariant === "outline" && !textButtonClassName && ADMIN_OUTLINE_CONTROL_CLASS,
          textButtonClassName,
        )}
        onClick={() => setOpen(true)}
      >
        {textLabel}
      </Button>
    );

  return (
    <>
      {triggerNode}
      <DashboardEditPanel
        open={open}
        onOpenChange={setOpen}
        title={`Requests · ${title}`}
        description={description}
        className="lg:max-w-lg"
      >
        {open && (load.status === "idle" || load.status === "loading") ? (
          <p className="text-sm text-muted-foreground">Loading requests…</p>
        ) : null}
        {load.status === "error" ? (
          <p className="text-sm text-destructive">{load.message}</p>
        ) : null}
        {load.status === "ready" && load.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests linked to this client yet.</p>
        ) : null}
        {load.status === "ready" && load.rows.length > 0 ? (
          <ul className="space-y-2">
            {load.rows.map((r) => {
              const statusLabel = INQUIRY_STATUS_LABEL[r.status] ?? r.status.replace(/_/g, " ");
              return (
                <li key={r.id}>
                  <Link
                    href={`/admin/inquiries/${r.id}`}
                    scroll={false}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block rounded-2xl border border-border/50 bg-card/40 px-3.5 py-3 shadow-sm transition-colors",
                      "hover:border-[var(--impronta-gold)]/35 hover:bg-[var(--impronta-gold)]/[0.04]",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminCommercialStatusBadge kind="inquiry" status={r.status}>
                        {statusLabel}
                      </AdminCommercialStatusBadge>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatAdminTimestamp(r.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 font-medium text-foreground">{r.contact_name}</p>
                    {r.company?.trim() ? (
                      <p className="text-xs text-muted-foreground">{r.company}</p>
                    ) : null}
                    {(r.event_date || r.event_location?.trim()) ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[r.event_date, r.event_location?.trim()].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {r.roster_peek_line ?? "No talent on shortlist"}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="mt-6 border-t border-border/45 pt-4">
          <Button asChild variant="outline" className={cn("w-full rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}>
            <Link href={buildInquiriesHref(userId)} scroll={false} onClick={() => setOpen(false)}>
              Open Inquiries (filtered list)
            </Link>
          </Button>
        </div>
      </DashboardEditPanel>
    </>
  );
}
