import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  DrillParticipant,
  GroupsDrillGroup,
  GroupsDrillPayload,
} from "./workspace-v3-drill-types";

/**
 * Admin Workspace V3 — Requirement Groups drill body (spec §5.3.1, M5.1).
 *
 * Extends the rail panel. Per-group counters stay authoritative (engine-sourced
 * via panel `summary`); the sheet adds the per-participant breakdown staff need
 * for roster cleanup — including the transitional "Unassigned" bucket for
 * legacy NULL `requirement_group_id` rows, so cleanup is possible before M5.6
 * flips the column NOT NULL.
 *
 * This is a read-only view. M5 explicitly does not mint new mutation RPCs —
 * row-level reassign / remove / approve controls will hang off this sheet in
 * a later milestone using existing actions.
 */
export function WorkspaceV3SheetGroups({ data }: { data: GroupsDrillPayload }) {
  const { summary } = data;
  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <header className="flex items-center gap-1.5">
        {summary.allFulfilled ? (
          <>
            <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
            <span className="text-emerald-700/90 dark:text-emerald-400/90">
              All groups fulfilled
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />
            <span className="text-amber-700/90 dark:text-amber-400/90">
              {summary.groups.filter((g) => g.shortfall > 0).length} group(s) unmet
            </span>
          </>
        )}
      </header>

      {data.groups.length === 0 ? (
        <p className="text-muted-foreground/80">No requirement groups defined.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </ul>
      )}

      {data.orphans.length > 0 ? (
        <section
          aria-label="Unassigned participants"
          className="rounded-md border border-dashed border-amber-400/40 bg-amber-50/30 p-2 dark:border-amber-500/30 dark:bg-amber-500/5"
        >
          <h4 className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
            Unassigned to any group ({data.orphans.length})
          </h4>
          <p className="mt-0.5 text-[11px] text-amber-700/90 dark:text-amber-400/90">
            Reassign these before the M5.6 NOT NULL cutover.
          </p>
          <ParticipantList participants={data.orphans} />
        </section>
      ) : null}
    </div>
  );
}

function GroupCard({ group }: { group: GroupsDrillGroup }) {
  const unmet = group.shortfall > 0;
  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-md border px-2 py-1.5",
        unmet
          ? "border-amber-400/40 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5"
          : "border-border/40 bg-foreground/[0.02]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium capitalize">
          {group.roleKey.replace(/_/g, " ")}
        </span>
        <span className="whitespace-nowrap text-[11px] text-muted-foreground/90">
          Need {group.quantityRequired}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/90">
        <span>
          <b className="text-foreground/80">{group.selected}</b> selected
        </span>
        <span>
          <b className="text-foreground/80">{group.approved}</b> approved
        </span>
        {unmet ? (
          <span className="text-amber-700/90 dark:text-amber-400/90">
            −{group.shortfall} short
          </span>
        ) : null}
      </div>
      {group.notes ? (
        <p className="truncate text-[11px] text-muted-foreground/80">
          {group.notes}
        </p>
      ) : null}
      <ParticipantList participants={group.participants} />
    </li>
  );
}

function ParticipantList({ participants }: { participants: DrillParticipant[] }) {
  if (participants.length === 0) {
    return (
      <p className="text-[11px] italic text-muted-foreground/70">
        No talent assigned.
      </p>
    );
  }
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {participants.map((p) => (
        <li
          key={p.participantId}
          className="flex items-center gap-2 rounded border border-border/30 bg-background/60 px-2 py-1 text-[11px]"
        >
          <span className="font-mono text-muted-foreground/80">{p.profileCode || "—"}</span>
          <span className="min-w-0 flex-1 truncate">
            {p.displayName ?? "Unnamed"}
          </span>
          <StatusChip status={p.status} approval={p.approvalStatus} />
        </li>
      ))}
    </ul>
  );
}

function StatusChip({
  status,
  approval,
}: {
  status: DrillParticipant["status"];
  approval: DrillParticipant["approvalStatus"];
}) {
  // Approval trumps the participant-level status in the sheet — when an offer
  // is out, talent approval is the actionable signal. Fall back to the
  // participant status (invited / active) when there's no approval on file.
  if (approval === "accepted") {
    return (
      <span className="rounded-full border border-emerald-500/40 bg-emerald-50/60 px-1.5 text-[10px] uppercase tracking-wide text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
        Accepted
      </span>
    );
  }
  if (approval === "rejected") {
    return (
      <span className="rounded-full border border-rose-500/40 bg-rose-50/60 px-1.5 text-[10px] uppercase tracking-wide text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        Rejected
      </span>
    );
  }
  if (approval === "pending") {
    return (
      <span className="rounded-full border border-sky-500/40 bg-sky-50/60 px-1.5 text-[10px] uppercase tracking-wide text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
        Pending
      </span>
    );
  }
  return (
    <span className="rounded-full border border-border/40 bg-foreground/[0.02] px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {status}
    </span>
  );
}
