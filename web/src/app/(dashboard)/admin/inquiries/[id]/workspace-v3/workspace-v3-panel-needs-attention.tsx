import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertRow, NeedsAttentionPanelData } from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Needs Attention rail panel (§5.2.6, roadmap M4.6).
 *
 * Renders derived alerts from `lib/inquiry/inquiry-alerts.ts`. The helper is
 * the single source of truth for which signals map to which alert key; this
 * panel only chooses severity icons + copy. Per spec §5.2.6, an empty alert
 * list renders the copy "Nothing needs your attention."
 */
export function WorkspaceV3PanelNeedsAttention({
  data,
}: {
  data: NeedsAttentionPanelData;
}) {
  if (data.alerts.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground/80">
        Nothing needs your attention.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5 text-[12px]">
      {data.alerts.map((a) => (
        <AlertItem key={a.key} alert={a} />
      ))}
    </ul>
  );
}

function AlertItem({ alert }: { alert: AlertRow }) {
  const warn = alert.severity === "warning";
  // Phase 16 monochrome scrub: warnings used to be amber-on-amber. The new
  // language is structural — warnings get a left border + heavier fill on
  // the same foreground/muted token scale used by AdminSurfaceCard.
  return (
    <li
      className={cn(
        "flex items-start gap-1.5 rounded-md border px-2 py-1.5",
        warn
          ? "border-foreground/35 border-l-[3px] border-l-foreground bg-foreground/[0.05]"
          : "border-border/40 bg-foreground/[0.02]",
      )}
    >
      {warn ? (
        <AlertTriangle
          className="mt-0.5 size-3.5 shrink-0 text-foreground"
          aria-hidden
        />
      ) : (
        <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/80" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-medium",
            warn ? "text-foreground" : "text-foreground/90",
          )}
        >
          {alert.label}
        </p>
        {alert.detail ? (
          <p
            className={cn(
              "mt-0.5 text-[11px] break-words",
              warn ? "text-foreground/75" : "text-muted-foreground/80",
            )}
          >
            {alert.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}
