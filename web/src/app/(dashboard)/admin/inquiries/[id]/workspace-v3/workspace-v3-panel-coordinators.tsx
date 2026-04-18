import { Star, UserMinus } from "lucide-react";
import type { CoordinatorsPanelData, CoordinatorRow } from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Coordinators rail panel (§5.2.4, roadmap M4.4).
 *
 * Read-only display of the coordinator roster for this inquiry. Sourced from
 * `getInquiryCoordinators` (M1.1). Inline assign / promote / remove actions
 * are deferred per the M4 execution-mode brief: "panels remain pure
 * renderers" — the M2.1 action wiring will land in a follow-up milestone.
 *
 * "Former" coordinators (status='former_coordinator') are rendered distinctly
 * to match spec §6 ("removed coordinators remain in history, cannot send
 * messages"). This is the only place in the workspace where former members
 * are surfaced alongside active ones; keeping them visually separate avoids
 * role confusion with agency membership (execution-mode brief).
 */
export function WorkspaceV3PanelCoordinators({
  data,
}: {
  data: CoordinatorsPanelData;
}) {
  const hasAny =
    data.primary != null || data.secondaries.length > 0 || data.former.length > 0;
  if (!hasAny) {
    return (
      <p className="text-[12px] text-muted-foreground/80">
        No coordinators assigned yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-[12px]">
      {data.primary ? (
        <Row row={data.primary} kind="primary" />
      ) : (
        <p className="text-muted-foreground/80">No primary coordinator.</p>
      )}
      {data.secondaries.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {data.secondaries.map((c) => (
            <Row key={c.userId} row={c} kind="secondary" />
          ))}
        </ul>
      ) : null}
      {data.former.length > 0 ? (
        <div className="border-t border-border/30 pt-1.5">
          <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Former
          </h4>
          <ul className="mt-1 flex flex-col gap-1">
            {data.former.map((c) => (
              <Row key={`${c.userId}-former`} row={c} kind="former" />
            ))}
          </ul>
        </div>
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
  if (kind === "former") {
    return (
      <li className="flex items-center gap-2 text-muted-foreground/80">
        <UserMinus className="size-3.5" aria-hidden />
        <span className="truncate">{name}</span>
        <span className="text-[10px] uppercase tracking-wide">Former</span>
      </li>
    );
  }
  if (kind === "primary") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[var(--impronta-gold,#c9a24b)]/40 bg-[var(--impronta-gold,#c9a24b)]/10 px-2 py-1.5">
        <Star className="size-3.5 text-[var(--impronta-gold,#c9a24b)]" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/90">
          Lead
        </span>
      </div>
    );
  }
  // secondary
  return (
    <li className="flex items-center gap-2 rounded-md border border-border/40 bg-foreground/[0.02] px-2 py-1.5">
      <span className="size-1.5 rounded-full bg-foreground/40" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
        Secondary
      </span>
    </li>
  );
}
