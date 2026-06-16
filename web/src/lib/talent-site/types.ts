import type { Locale } from "@/lib/site-admin/locales";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { TalentSiteTemplateKey } from "./templates/types";

export type TalentSiteStatus = "draft" | "published" | "unpublished" | "archived";

export type TalentSiteRevisionKind = "draft" | "published" | "unpublished";

// `"freeform"` (ADDITIVE) — a node-tree composition rendered through the shared
// builder-node renderer (the SAME engine the agency storefront + talent extra
// pages use), carried on `TalentSiteSnapshot.builderTree`. Every existing
// snapshot is `"template"` or `"custom"` and slot-based; the freeform value is
// only ever produced by the platform-default freeform path, so slot snapshots
// are byte-behavior-identical.
export type TalentSiteCompositionMode = "template" | "custom" | "freeform";

export type TalentSiteSnapshotSection = {
  slotKey: string;
  sortOrder: number;
  sectionId: string;
  sectionTypeKey: string;
  schemaVersion: number;
  name: string;
  props: Record<string, unknown>;
  hidden?: boolean;
};

export type TalentSiteSnapshot = {
  version: 1;
  siteKind: "talent_personal";
  templateKey: TalentSiteTemplateKey | string;
  compositionMode: TalentSiteCompositionMode;
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
  /**
   * ADDITIVE (platform-default freeform path). A builder-node tree rendered
   * through the shared freeform renderer when `compositionMode === "freeform"`.
   * Present ONLY on freeform snapshots; every slot-based snapshot omits it (the
   * field is optional, so the existing shape + every persisted row is unchanged
   * and the slot render path never reads it). The slot renderer ignores this
   * field entirely.
   */
  builderTree?: BuilderNode[];
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
  plan_locked?: boolean | null;
  pending_template_reset?: boolean | null;
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
  /** @deprecated Use canEditPersonalSite */
  canBuildPersonalSite: boolean;
  canEditPersonalSite: boolean;
  canPublishPersonalSite: boolean;
  canUseTemplateGallery: boolean;
  canUseCustomBuilder: boolean;
  profileCode: string | null;
  publicSiteUrl: string | null;
  publicProfileUrl: string | null;
  isPubliclyHidden: boolean;
  templateKey: string | null;
  compositionMode: TalentSiteCompositionMode | null;
  availableTemplates: { key: string; label: string; blurb: string; thumbnailUrl: string }[];
  site: {
    id: string;
    status: TalentSiteStatus;
    version: number;
    draftUpdatedAt: string;
    publishedAt: string | null;
    unpublishedAt: string | null;
    hasPublishedSnapshot: boolean;
    planLocked: boolean;
    pendingTemplateReset: boolean;
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
        | "feature_disabled"
        | "not_owner"
        | "stale_version"
        | "invalid_snapshot"
        | "snapshot_too_large"
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
