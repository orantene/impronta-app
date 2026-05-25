import type { Locale } from "@/lib/site-admin/locales";

export type TalentSiteStatus = "draft" | "published" | "unpublished" | "archived";

export type TalentSiteRevisionKind = "draft" | "published" | "unpublished";

export type TalentSiteSnapshotSection = {
  slotKey: string;
  sortOrder: number;
  sectionId: string;
  sectionTypeKey: string;
  schemaVersion: number;
  name: string;
  props: Record<string, unknown>;
};

export type TalentSiteSnapshot = {
  version: 1;
  siteKind: "talent_personal";
  publishedAt: string | null;
  pageVersion: number;
  locale: Locale;
  fields: {
    title: string;
    metaDescription: string | null;
    introTagline: string | null;
  };
  templateSchemaVersion: number;
  slots: TalentSiteSnapshotSection[];
};

export type TalentSiteRow = {
  id: string;
  talent_profile_id: string;
  site_kind: "talent_personal";
  status: TalentSiteStatus;
  draft_snapshot: TalentSiteSnapshot | Record<string, unknown>;
  published_snapshot: TalentSiteSnapshot | null;
  version: number;
  draft_updated_at: string;
  published_at: string | null;
  unpublished_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TalentSiteRevisionRow = {
  id: string;
  talent_site_id: string;
  talent_profile_id: string;
  kind: TalentSiteRevisionKind;
  version: number;
  snapshot: TalentSiteSnapshot;
  created_by: string | null;
  created_at: string;
};

export type TalentSiteDashboardState = {
  planKey: string;
  tier: "free" | "pro" | "max";
  displayName: string;
  canBuildPersonalSite: boolean;
  canEditPersonalSite: boolean;
  canPublishPersonalSite: boolean;
  profileCode: string | null;
  publicSiteUrl: string | null;
  publicProfileUrl: string | null;
  site: {
    id: string;
    status: TalentSiteStatus;
    version: number;
    draftUpdatedAt: string;
    publishedAt: string | null;
    unpublishedAt: string | null;
    hasPublishedSnapshot: boolean;
    draftSnapshot: TalentSiteSnapshot | null;
  } | null;
};

export type TalentSiteActionResult<T = void> =
  | { ok: true; data?: T }
  | {
      ok: false;
      code:
        | "not_authenticated"
        | "workspace_not_found"
        | "talent_profile_not_found"
        | "plan_required"
        | "not_owner"
        | "stale_version"
        | "invalid_snapshot"
        | "site_not_found"
        | "server_error";
      error: string;
    };

export type TalentPublicSiteRpcRow = {
  profile_code: string;
  talent_profile_id: string;
  published_snapshot: TalentSiteSnapshot;
  published_at: string;
};
