import "server-only";

import {
  loadWorkspaceRosterForCurrentTenant,
  loadInquiriesForMessages,
  loadWorkspaceClients,
  loadCalendarEvents,
  loadWorkspaceBookings,
  loadWorkspacePitches,
  loadWorkspaceTeamMembers,
  loadWorkspaceMediaBridge,
  loadWebsiteData,
  loadWebsiteHealth,
  loadRecentActivity,
  type BridgeData,
} from "@/components/admin/shell/internal/data-bridge";
import type { BridgeSliceName } from "@/components/admin/shell/internal/bridge-slices";
import { loadPayoutsSurface } from "./payouts/payouts-surface-actions";

/**
 * One slice's worth of bridge fields. `media` is four fields on the bridge
 * and `website` carries its health report, so a payload is a partial bridge
 * rather than one value per name; the shell merges it over what it has.
 */
export type BridgeSlicePayload = Partial<
  Pick<
    BridgeData,
    | "roster"
    | "inquiries"
    | "clients"
    | "calendarEvents"
    | "bookings"
    | "pitches"
    | "teamMembers"
    | "mediaPhotos"
    | "mediaFolders"
    | "mediaBridgeErrored"
    | "mediaTotalCount"
    | "website"
    | "recentActivity"
    | "payoutsSurface"
  >
>;

export type BridgeSliceInput = {
  tenantId: string;
  tenantSlug: string;
  /** Gates the Forms finding inside the website health report. */
  canManageBilling: boolean;
};

/**
 * Loads the named slices in ONE parallel wave and returns them as a partial
 * bridge. Every loader degrades to an empty/null value on failure (that is
 * the contract they already keep for the layout), so this never throws for a
 * data reason. Unknown names are ignored: the caller validates.
 */
export async function loadBridgeSlices(
  input: BridgeSliceInput,
  names: readonly BridgeSliceName[],
): Promise<BridgeSlicePayload> {
  const wanted = new Set(names);
  const out: BridgeSlicePayload = {};
  const { tenantId, tenantSlug, canManageBilling } = input;

  await Promise.all([
    wanted.has("roster")
      ? loadWorkspaceRosterForCurrentTenant(tenantId).then((v) => {
          out.roster = v;
        })
      : null,
    wanted.has("inquiries")
      ? loadInquiriesForMessages(tenantId).then((v) => {
          out.inquiries = v;
        })
      : null,
    wanted.has("clients")
      ? loadWorkspaceClients(tenantId).then((v) => {
          out.clients = v;
        })
      : null,
    wanted.has("calendarEvents")
      ? loadCalendarEvents(tenantId).then((v) => {
          out.calendarEvents = v;
        })
      : null,
    wanted.has("bookings")
      ? loadWorkspaceBookings(tenantId).then((v) => {
          out.bookings = v;
        })
      : null,
    wanted.has("pitches")
      ? loadWorkspacePitches(tenantId).then((v) => {
          out.pitches = v;
        })
      : null,
    wanted.has("teamMembers")
      ? loadWorkspaceTeamMembers(tenantId).then((v) => {
          out.teamMembers = v;
        })
      : null,
    wanted.has("media")
      ? loadWorkspaceMediaBridge(tenantId).then((v) => {
          out.mediaPhotos = v.photos;
          out.mediaFolders = v.folders;
          out.mediaBridgeErrored = v.errored;
          out.mediaTotalCount = v.totalCount;
        })
      : null,
    wanted.has("website")
      ? loadWebsiteData(tenantId).then(async (website) => {
          const health = await loadWebsiteHealth({ tenantId, website, canManageBilling });
          out.website = { ...website, health };
        })
      : null,
    wanted.has("recentActivity")
      ? loadRecentActivity(tenantId).then((v) => {
          out.recentActivity = v;
        })
      : null,
    wanted.has("payoutsSurface")
      ? loadPayoutsSurface(tenantSlug).then((v) => {
          out.payoutsSurface = v;
        })
      : null,
  ]);

  return out;
}
