import { cn } from "@/lib/utils";
import type { WorkspaceStatus } from "@/lib/inquiry/inquiry-workspace-types";
import {
  getWorkspaceStateSentence,
  resolveWaitingOnChip,
  waitingOnLabel,
} from "./workspace-v3-state";

/**
 * Admin Workspace V3 — status / "waiting on" strip (§5.4).
 *
 * Pure server component. Locked inquiries render muted, with no recommended
 * action. Open inquiries render the state sentence + waiting-on chip.
 * The recommended-action button (per §5.4 bullet 3) intentionally lives in
 * the header (`PrimaryActionButton`), not here, so we do not duplicate the
 * same affordance twice on one screen.
 */
export function WorkspaceV3StatusStrip({
  status,
  nextActionBy,
  isLocked,
}: {
  status: WorkspaceStatus;
  nextActionBy: string | null;
  isLocked: boolean;
}) {
  const sentence = getWorkspaceStateSentence(status);
  const waitingOn = resolveWaitingOnChip(nextActionBy);
  const waitingLabel = isLocked ? "Waiting on: —" : waitingOnLabel(waitingOn);

  return (
    <div
      data-testid="workspace-v3-status-strip"
      className={cn(
        "flex flex-wrap items-center gap-3 border-b border-border/20 px-4 py-2 text-[11px]",
        isLocked ? "bg-muted/30 text-muted-foreground" : "bg-background/70 text-foreground/80",
      )}
    >
      <span className={cn("truncate", isLocked && "opacity-80")}>{sentence}</span>
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5",
          isLocked ? "border-border/30 text-muted-foreground" : "border-border/50",
        )}
      >
        {waitingLabel}
      </span>
    </div>
  );
}
