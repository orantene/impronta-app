import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import type {
  InquiryWorkspaceMessage,
  PrimaryAction,
  WorkspaceStatus,
} from "@/lib/inquiry/inquiry-workspace-types";
import { WorkspaceV3Header } from "./workspace-v3-header";
import { WorkspaceV3StatusStrip } from "./workspace-v3-status-strip";
import { WorkspaceV3ThreadSwitcher } from "./workspace-v3-thread-switcher";
import { WorkspaceV3Rail } from "./workspace-v3-rail";
import type {
  BookingPanelData,
  CoordinatorsPanelData,
  NeedsAttentionPanelData,
  OffersApprovalsPanelData,
  RecentActivityPanelData,
  RequirementGroupsPanelData,
  SummaryPanelData,
} from "./workspace-v3-panel-types";

type ThreadMessage = {
  id: string;
  body: string;
  created_at: string;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_avatar_url: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Admin Workspace V3 — full shell (M3 aggregate of M3.1–M3.5).
 *
 * Server component that composes the header, status strip, thread switcher
 * (client), and rail (client). Rendered only when `ff_admin_workspace_v3`
 * resolves to `true` for the current viewer — the old workspace remains the
 * default until M8 cutover (spec §5, roadmap M3).
 *
 * M3 scope explicitly does NOT include:
 *   • Rail panel content (M4.1–M4.7)
 *   • Drill-down sheets (M5.*)
 *   • Mobile bottom-sheet polish beyond a naive responsive fallback
 *
 * Data contract: everything comes in already-resolved from page.tsx — that
 * single file remains the data-loader, matching the existing V2 pattern so
 * V3 does not duplicate query logic.
 */
export function AdminInquiryWorkspaceV3({
  inquiryId,
  viewerUserId,
  title,
  rawStatus,
  workspaceStatus,
  nextActionBy,
  isLocked,
  primaryAction,
  chips,
  messagesPrivate,
  messagesGroup,
  messagesPrivateHasOlder,
  messagesGroupHasOlder,
  unreadPrivate,
  unreadGroup,
  allowCompose,
  initialThread,
  sendMessageAction,
  loadOlderAction,
  summary,
  requirementGroups,
  offersApprovals,
  coordinators,
  booking,
  needsAttention,
  recentActivity,
}: {
  inquiryId: string;
  viewerUserId: string;
  title: string;
  rawStatus: string;
  workspaceStatus: WorkspaceStatus;
  nextActionBy: string | null;
  isLocked: boolean;
  primaryAction: PrimaryAction;
  chips: {
    primaryCoordinatorName: string | null;
    unreadCount: number;
    participantCount: number;
    bookingLinked: boolean;
  };
  messagesPrivate: InquiryWorkspaceMessage[];
  messagesGroup: InquiryWorkspaceMessage[];
  messagesPrivateHasOlder: boolean;
  messagesGroupHasOlder: boolean;
  unreadPrivate: boolean;
  unreadGroup: boolean;
  allowCompose: boolean;
  initialThread: "client" | "group";
  sendMessageAction: (formData: FormData) => Promise<ActionResult>;
  loadOlderAction?: (formData: FormData) => Promise<ActionResult<{ messages: ThreadMessage[] }>>;
  summary: SummaryPanelData;
  requirementGroups: RequirementGroupsPanelData;
  offersApprovals: OffersApprovalsPanelData;
  coordinators: CoordinatorsPanelData;
  booking: BookingPanelData;
  needsAttention: NeedsAttentionPanelData;
  recentActivity: RecentActivityPanelData;
}) {
  return (
    <div
      data-testid="admin-inquiry-workspace-v3"
      className="flex min-h-[calc(100vh-4rem)] flex-col"
    >
      <WorkspaceV3Header
        inquiryId={inquiryId}
        title={title}
        rawStatus={rawStatus}
        primaryAction={primaryAction}
        chips={chips}
      />
      <WorkspaceV3StatusStrip
        status={workspaceStatus}
        nextActionBy={nextActionBy}
        isLocked={isLocked}
      />

      {/*
        Split layout (M3.2): two-column grid on ≥1024px, stacked on mobile.
        On mobile the rail docks at the bottom (scrollable) — intentionally
        not a fullscreen sheet (roadmap M3.2: "docked, not fullscreen").
      */}
      <div
        className={
          "grid min-h-0 flex-1 gap-4 p-4 " +
          "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]"
        }
      >
        <section aria-label="Messaging" className="flex min-h-[60vh] flex-col lg:min-h-0">
          <WorkspaceV3ThreadSwitcher
            inquiryId={inquiryId}
            messagesPrivate={messagesPrivate}
            messagesGroup={messagesGroup}
            sendAction={sendMessageAction}
            allowCompose={allowCompose}
            unreadPrivate={unreadPrivate}
            unreadGroup={unreadGroup}
            initialThread={initialThread}
            messagesPrivateHasOlder={messagesPrivateHasOlder}
            messagesGroupHasOlder={messagesGroupHasOlder}
            loadOlderAction={loadOlderAction}
          />
        </section>
        <div className="min-h-0 overflow-y-auto lg:max-h-[calc(100vh-8rem)]">
          <WorkspaceV3Rail
            userId={viewerUserId}
            inquiryId={inquiryId}
            summary={summary}
            requirementGroups={requirementGroups}
            offersApprovals={offersApprovals}
            coordinators={coordinators}
            booking={booking}
            needsAttention={needsAttention}
            recentActivity={recentActivity}
          />
        </div>
      </div>
    </div>
  );
}
