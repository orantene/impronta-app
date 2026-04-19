import { Star, UserMinus } from "lucide-react";
import type { CoordinatorsDrillPayload } from "./workspace-v3-drill-types";
import type { CoordinatorRow } from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Coordinators drill body (spec §5.3.3, M5.3).
 *
 * Extends the rail panel with assignment timestamps so staff can see who
 * joined when. Primary / secondaries / former are rendered as three distinct
 * sections, matching the panel's visual contract and spec §6 ("removed
 * coordinators remain in history"). Action controls (assign / promote /
 * remove) are not wired in M5 — they will hang off this sheet in a later
 * milestone using the existing M2.1 RPCs.
 */
export function WorkspaceV3SheetCoordinators({
  data,
}: {
  data: CoordinatorsDrillPayload;
}) {
  const { summary } = data;
  const hasAny =
    summary.primary != null ||
    summary.secondaries.length > 0 ||
    summary.former.length > 0;
  if (!hasAny) {
    return (
      <p className="text-[12px] text-muted-foreground/80">
        No coordinators assigned yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <section aria-label="Primary coordinator">
        <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Primary
        </h4>
        {summary.primary ? (
          <div className="mt-1">
            <Row row={summary.primary} kind="primary" />
          </div>
        ) : (
          <p className="mt-1 text-muted-foreground/80">
            No primary coordinator assigned.
          </p>
        )}
      </section>

      <section aria-label="Secondary coordinators">
        <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Secondary ({summary.secondaries.length})
        </h4>
        {summary.secondaries.length === 0 ? (
          <p className="mt-1 text-muted-foreground/80">
            No secondary coordinators.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {summary.secondaries.map((c) => (
              <Row key={c.userId} row={c} kind="secondary" />
            ))}
          </ul>
        )}
      </section>

      {summary.former.length > 0 ? (
        <section aria-label="Former coordinators">
          <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Former ({summary.former.length})
          </h4>
          <ul className="mt-1 flex flex-col gap-1">
            {summary.former.map((c) => (
              <Row key={`${c.userId}-former`} row={c} kind="former" />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Row({
  row,
  kind,
}: {
  row: CoordinatorRow;
  kind: "primary" | "secondary" | "former";
}) {
  const name = row.displayName ?? "Unnamed coordinator";
  const when = formatAssigned(row.assignedAt);
  if (kind === "former") {
    return (
      <li className="flex items-center gap-2 rounded-md border border-border/30 bg-foreground/[0.02] px-2 py-1.5 text-muted-foreground/80">
        <UserMinus className="size-3.5" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide">
          {when}
        </span>
      </li>
    );
  }
  if (kind === "primary") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[var(--impronta-gold,#c9a24b)]/40 bg-[var(--impronta-gold,#c9a24b)]/10 px-2 py-1.5">
        <Star
          className="size-3.5 text-[var(--impronta-gold,#c9a24b)]"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/90">
          {when}
        </span>
      </div>
    );
  }
  return (
    <li className="flex items-center gap-2 rounded-md border border-border/40 bg-foreground/[0.02] px-2 py-1.5">
      <span className="size-1.5 rounded-full bg-foreground/40" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/80">
        {when}
      </span>
    </li>
  );
}

function formatAssigned(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
