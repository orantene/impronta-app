import type {
  BookingPanelData,
  CoordinatorsPanelData,
  OffersApprovalsPanelData,
  RecentActivityEvent,
  RequirementGroupRowData,
  RequirementGroupsPanelData,
} from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — drill-down payload discriminated union (spec §5.3).
 *
 * Each drill key corresponds to one rail panel's "expand" action. Content
 * is resolved server-side in page.tsx when `?drill=<key>` is set, and
 * passed to the client `WorkspaceV3DrillHost` which decides which sheet
 * body to render.
 *
 * The union is open-ended by design: adding a new drill type is a matter
 * of adding a new shape here, loading it in page.tsx, and adding a case
 * in `WorkspaceV3DrillHost`. Panel components reference this type via the
 * `useOpenDrill()` hook from `workspace-v3-drill-sheet.tsx`.
 */

export type DrillParticipant = {
  participantId: string;
  talentProfileId: string;
  displayName: string | null;
  profileCode: string;
  status: "invited" | "active" | "declined" | "removed";
  sortOrder: number;
  approvalStatus: "pending" | "accepted" | "rejected" | null;
};

export type GroupsDrillGroup = RequirementGroupRowData & {
  participants: DrillParticipant[];
};

export type GroupsDrillPayload = {
  kind: "groups";
  groups: GroupsDrillGroup[];
  /** Pass-through of the panel data so the drill header can mirror counts. */
  summary: RequirementGroupsPanelData;
  /** Talent assigned to no requirement group — visible for cleanup until M5.6. */
  orphans: DrillParticipant[];
};

export type DrillOfferRow = {
  id: string;
  version: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  totalClientPrice: number;
  coordinatorFee: number;
  currencyCode: string;
  isCurrent: boolean;
};

export type DrillApprovalRow = {
  id: string;
  participantId: string;
  displayName: string | null;
  profileCode: string;
  status: "pending" | "accepted" | "rejected";
};

export type OffersDrillPayload = {
  kind: "offers";
  summary: OffersApprovalsPanelData;
  offers: DrillOfferRow[];
  currentOfferApprovals: DrillApprovalRow[];
};

export type CoordinatorsDrillPayload = {
  kind: "coordinators";
  summary: CoordinatorsPanelData;
};

export type BookingDrillPayload = {
  kind: "booking";
  summary: BookingPanelData;
  talent: {
    bookingId: string;
    displayName: string | null;
    profileCode: string | null;
  }[];
};

export type TimelineDrillPayload = {
  kind: "timeline";
  events: RecentActivityEvent[];
  totalCount: number;
};

export type DrillPayload =
  | GroupsDrillPayload
  | OffersDrillPayload
  | CoordinatorsDrillPayload
  | BookingDrillPayload
  | TimelineDrillPayload;

/** URL-safe drill keys; any other `?drill=` value is treated as "closed". */
export const DRILL_KEYS = ["groups", "offers", "coordinators", "booking", "timeline"] as const;
export type DrillKey = (typeof DRILL_KEYS)[number];

export function parseDrillKey(raw: string | null | undefined): DrillKey | null {
  if (!raw) return null;
  return (DRILL_KEYS as readonly string[]).includes(raw) ? (raw as DrillKey) : null;
}
