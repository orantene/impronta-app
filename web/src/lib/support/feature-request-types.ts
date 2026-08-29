/**
 * Client-safe shapes for feature requests. Kept out of feature-requests.ts
 * because that module is `server-only` (service-role loaders) and the HQ
 * Ideas view is a client component.
 */

export const FEATURE_REQUEST_STATUSES = [
  "new",
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "declined",
] as const;
export type FeatureRequestStatus = (typeof FEATURE_REQUEST_STATUSES)[number];

export type FeatureRequestRow = {
  id: string;
  requestNumber: number;
  tenantId: string | null;
  surface: "workspace" | "talent" | "client";
  requesterUserId: string;
  title: string;
  body: string;
  area: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: FeatureRequestStatus;
  priority: string;
  voteCount: number;
  ownerNote: string | null;
  shippedRef: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HqFeatureRequestRow = {
  request: FeatureRequestRow;
  tenantName: string | null;
  tenantSlug: string | null;
  requesterName: string | null;
};
