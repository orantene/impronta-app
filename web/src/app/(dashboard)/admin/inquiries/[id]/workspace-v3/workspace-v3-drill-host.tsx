import { WorkspaceV3DrillSheet } from "./workspace-v3-drill-sheet";
import { WorkspaceV3SheetGroups } from "./workspace-v3-sheet-groups";
import { WorkspaceV3SheetOffers } from "./workspace-v3-sheet-offers";
import { WorkspaceV3SheetCoordinators } from "./workspace-v3-sheet-coordinators";
import { WorkspaceV3SheetBooking } from "./workspace-v3-sheet-booking";
import { WorkspaceV3SheetTimeline } from "./workspace-v3-sheet-timeline";
import type { DrillPayload } from "./workspace-v3-drill-types";

/**
 * Admin Workspace V3 — drill-down host (spec §5.3).
 *
 * Single entry point rendered by the workspace shell whenever
 * `?drill=<key>` resolves to a known DrillPayload. Server component:
 *   • No state — the URL is the source of truth.
 *   • Pure switch over the discriminated union from `drill-types`.
 *   • Wraps each body in the shared `WorkspaceV3DrillSheet` slide-over
 *     (which owns all open/close behavior and URL mutation).
 *
 * When drill is null, the shell simply doesn't render this host — zero
 * DOM cost and zero queries were issued up in page.tsx.
 */
export function WorkspaceV3DrillHost({ drill }: { drill: DrillPayload | null }) {
  if (!drill) return null;

  switch (drill.kind) {
    case "groups":
      return (
        <WorkspaceV3DrillSheet
          title="Requirement Groups"
          subtitle="Per-role need vs. selected / approved · per-participant breakdown"
          widthClassName="max-w-[640px]"
        >
          <WorkspaceV3SheetGroups data={drill} />
        </WorkspaceV3DrillSheet>
      );
    case "offers":
      return (
        <WorkspaceV3DrillSheet
          title="Offers & Approvals"
          subtitle="All offer versions · current-offer approvals"
          widthClassName="max-w-[640px]"
        >
          <WorkspaceV3SheetOffers data={drill} />
        </WorkspaceV3DrillSheet>
      );
    case "coordinators":
      return (
        <WorkspaceV3DrillSheet
          title="Coordinators"
          subtitle="Primary · secondaries · former"
          widthClassName="max-w-[520px]"
        >
          <WorkspaceV3SheetCoordinators data={drill} />
        </WorkspaceV3DrillSheet>
      );
    case "booking":
      return (
        <WorkspaceV3DrillSheet
          title="Booking"
          subtitle="Conversion state · talent · override"
          widthClassName="max-w-[600px]"
        >
          <WorkspaceV3SheetBooking data={drill} />
        </WorkspaceV3DrillSheet>
      );
    case "timeline":
      return (
        <WorkspaceV3DrillSheet
          title="Activity timeline"
          subtitle="Audit stream — inquiry_events"
          widthClassName="max-w-[640px]"
        >
          <WorkspaceV3SheetTimeline data={drill} />
        </WorkspaceV3DrillSheet>
      );
    default: {
      const _exhaustive: never = drill;
      return _exhaustive;
    }
  }
}
