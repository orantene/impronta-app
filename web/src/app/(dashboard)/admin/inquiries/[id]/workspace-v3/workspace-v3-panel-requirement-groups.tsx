import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  RequirementGroupRowData,
  RequirementGroupsPanelData,
} from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Requirement Groups rail panel (§5.2.2, roadmap M4.2).
 *
 * Pure renderer. All counters are passed in pre-computed from the canonical
 * engine helpers (`getRequirementGroups` + `engine_inquiry_group_shortfall`);
 * the panel never re-derives readiness.
 *
 * Row click → drill-down (M5.2 Roster editor) — not wired in M4 scope.
 * A row is visually marked as unmet when `shortfall > 0`.
 */
export function WorkspaceV3PanelRequirementGroups({
  data,
}: {
  data: RequirementGroupsPanelData;
}) {
  if (data.groups.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground/80">
        No requirement groups yet. Add one from the roster editor.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px]">
        {data.allFulfilled ? (
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
              {countUnmet(data.groups)} group{countUnmet(data.groups) === 1 ? "" : "s"} unmet
            </span>
          </>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {data.groups.map((g) => (
          <GroupRow key={g.id} row={g} />
        ))}
      </ul>
    </div>
  );
}

function GroupRow({ row }: { row: RequirementGroupRowData }) {
  const unmet = row.shortfall > 0;
  return (
    <li
      className={cn(
        "flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-[12px]",
        unmet
          ? "border-amber-400/40 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5"
          : "border-border/40 bg-foreground/[0.02]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium capitalize">
          {row.roleKey.replace(/_/g, " ")}
        </span>
        <span className="whitespace-nowrap text-[11px] text-muted-foreground/90">
          Need {row.quantityRequired}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/90">
        <span>
          <b className="text-foreground/80">{row.selected}</b> selected
        </span>
        <span>
          <b className="text-foreground/80">{row.approved}</b> approved
        </span>
        {unmet ? (
          <span className="text-amber-700/90 dark:text-amber-400/90">
            −{row.shortfall} short
          </span>
        ) : null}
      </div>
      {row.notes ? (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
          {row.notes}
        </p>
      ) : null}
    </li>
  );
}

function countUnmet(groups: RequirementGroupRowData[]): number {
  let n = 0;
  for (const g of groups) if (g.shortfall > 0) n += 1;
  return n;
}
