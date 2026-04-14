import type { InspectorContext, InspectorModuleDefinition } from "./types";
import {
  BookingsEmptyHelperModule,
  BookingsFiltersModule,
  BookingsQuickActionsModule,
  BookingsSelectedPeekModule,
  BookingsWorkspaceModule,
} from "@/components/admin/inspector/modules/bookings-inspector";
import {
  InquiriesDraftShortcutModule,
  InquiriesFiltersModule,
  InquiriesNextStepModule,
  InquiriesSelectedPeekModule,
  InquiryDetailDraftModule,
  InquiryDetailNextStepModule,
  InquiryDetailSummaryModule,
  InquiriesWorkspaceListLinkModule,
} from "@/components/admin/inspector/modules/inquiries-inspector";
import {
  TalentDetailActionsModule,
  TalentDetailContextModule,
  TalentDetailGapsModule,
  TalentListMediaModule,
  TalentListScopeModule,
  TalentListVisibilityModule,
  TalentListWarningsModule,
} from "@/components/admin/inspector/modules/talent-inspector";
import {
  CmsEditorSeoModule,
  CmsRevisionShortcutModule,
  CmsSlugRedirectModule,
} from "@/components/admin/inspector/modules/cms-inspector";
import {
  AiSearchHealthModule,
  AiSearchRankingModule,
  AiSearchRefineModule,
} from "@/components/admin/inspector/modules/ai-search-inspector";
import { DefaultInspectorModule } from "@/components/admin/inspector/modules/default-inspector";
import { isUuidPathSegment, pathSegments } from "./context";
import { ADMIN_APANEL_PEEK } from "@/lib/admin/admin-panel-search-params";

function bookingsList(ctx: InspectorContext) {
  return ctx.pathname === "/admin/bookings";
}

function bookingsWorkspace(ctx: InspectorContext) {
  const m = /^\/admin\/bookings\/([^/]+)$/.exec(ctx.pathname);
  if (!m) return false;
  const seg = m[1];
  return seg !== "new" && /^[0-9a-f-]{36}$/i.test(seg);
}

function inquiriesList(ctx: InspectorContext) {
  return ctx.pathname === "/admin/inquiries";
}

function inquiryDetail(ctx: InspectorContext) {
  const s = pathSegments(ctx.pathname);
  return s.length === 3 && s[0] === "admin" && s[1] === "inquiries" && isUuidPathSegment(s[2]!);
}

function talentList(ctx: InspectorContext) {
  return ctx.pathname === "/admin/talent";
}

function talentDetail(ctx: InspectorContext) {
  const s = pathSegments(ctx.pathname);
  return s.length === 3 && s[0] === "admin" && s[1] === "talent" && isUuidPathSegment(s[2]!);
}

function cmsEditor(ctx: InspectorContext) {
  const p = ctx.pathname;
  return (
    p.startsWith("/admin/site-settings/content/pages/") ||
    p.startsWith("/admin/site-settings/content/posts/")
  );
}

function aiSearchSurface(ctx: InspectorContext) {
  const p = ctx.pathname;
  return p.startsWith("/admin/ai-workspace") || p.startsWith("/admin/analytics/search");
}

function defaultSurface(ctx: InspectorContext) {
  return ctx.pathname.startsWith("/admin");
}

/**
 * Ordered registry: first match wins visibility per module; many modules may be visible on one route.
 */
export const ADMIN_INSPECTOR_MODULES: InspectorModuleDefinition[] = [
  {
    key: "bookings.filters",
    title: "Filters & scope",
    job: "context",
    visible: bookingsList,
    Component: BookingsFiltersModule,
  },
  {
    key: "bookings.selected",
    title: "Selected booking",
    job: "context",
    visible: (c) => bookingsList(c) && Boolean(c.aid && c.apanel === ADMIN_APANEL_PEEK),
    Component: BookingsSelectedPeekModule,
  },
  {
    key: "bookings.empty",
    title: "Queue tips",
    job: "suggestions",
    visible: bookingsList,
    Component: BookingsEmptyHelperModule,
  },
  {
    key: "bookings.actions",
    title: "Shortcuts",
    job: "actions",
    visible: bookingsList,
    Component: BookingsQuickActionsModule,
  },
  {
    key: "bookings.workspace",
    title: "Workspace",
    job: "context",
    visible: bookingsWorkspace,
    Component: BookingsWorkspaceModule,
  },

  {
    key: "inquiries.filters",
    title: "Filters & scope",
    job: "context",
    visible: inquiriesList,
    Component: InquiriesFiltersModule,
  },
  {
    key: "inquiries.selected",
    title: "Selected inquiry",
    job: "context",
    visible: (c) => inquiriesList(c) && Boolean(c.aid && c.apanel === ADMIN_APANEL_PEEK),
    Component: InquiriesSelectedPeekModule,
  },
  {
    key: "inquiries.next",
    title: "Next step",
    job: "suggestions",
    visible: inquiriesList,
    Component: InquiriesNextStepModule,
  },
  {
    key: "inquiries.draft.shortcut",
    title: "Drafting support",
    job: "actions",
    visible: inquiriesList,
    Component: InquiriesDraftShortcutModule,
  },
  {
    key: "inquiries.detail.summary",
    title: "Inquiry summary",
    job: "context",
    visible: inquiryDetail,
    Component: InquiryDetailSummaryModule,
  },
  {
    key: "inquiries.detail.next",
    title: "Next step",
    job: "suggestions",
    visible: inquiryDetail,
    Component: InquiryDetailNextStepModule,
  },
  {
    key: "inquiries.detail.draft",
    title: "AI brief helper",
    job: "actions",
    requiresAiPipeline: true,
    visible: inquiryDetail,
    Component: InquiryDetailDraftModule,
  },
  {
    key: "inquiries.detail.back",
    title: "Navigation",
    job: "actions",
    visible: inquiryDetail,
    Component: InquiriesWorkspaceListLinkModule,
  },

  {
    key: "talent.list.completeness",
    title: "Profile completeness",
    job: "context",
    visible: talentList,
    Component: TalentListScopeModule,
  },
  {
    key: "talent.list.visibility",
    title: "Visibility & publishing",
    job: "context",
    visible: talentList,
    Component: TalentListVisibilityModule,
  },
  {
    key: "talent.list.media",
    title: "Media approvals",
    job: "context",
    visible: talentList,
    Component: TalentListMediaModule,
  },
  {
    key: "talent.list.gaps",
    title: "Missing content",
    job: "suggestions",
    visible: talentList,
    Component: TalentListWarningsModule,
  },
  {
    key: "talent.detail.context",
    title: "Profile snapshot",
    job: "context",
    visible: talentDetail,
    Component: TalentDetailContextModule,
  },
  {
    key: "talent.detail.gaps",
    title: "Gaps & warnings",
    job: "suggestions",
    visible: talentDetail,
    Component: TalentDetailGapsModule,
  },
  {
    key: "talent.detail.actions",
    title: "Shortcuts",
    job: "actions",
    visible: talentDetail,
    Component: TalentDetailActionsModule,
  },

  {
    key: "cms.seo",
    title: "SEO checks",
    job: "context",
    visible: cmsEditor,
    Component: CmsEditorSeoModule,
  },
  {
    key: "cms.redirects",
    title: "Slug & redirects",
    job: "suggestions",
    visible: cmsEditor,
    Component: CmsSlugRedirectModule,
  },
  {
    key: "cms.revisions",
    title: "Revisions",
    job: "actions",
    visible: cmsEditor,
    Component: CmsRevisionShortcutModule,
  },

  {
    key: "ai.ranking",
    title: "Ranking explanation",
    job: "context",
    requiresAiPipeline: true,
    visible: aiSearchSurface,
    Component: AiSearchRankingModule,
  },
  {
    key: "ai.refine",
    title: "Refine suggestions",
    job: "suggestions",
    visible: aiSearchSurface,
    Component: AiSearchRefineModule,
  },
  {
    key: "ai.health",
    title: "Search health & debug",
    job: "actions",
    visible: aiSearchSurface,
    Component: AiSearchHealthModule,
  },

  {
    key: "default.help",
    title: "Inspector",
    job: "context",
    visible: (c) => defaultSurface(c) && !bookingsList(c) && !bookingsWorkspace(c) && !inquiriesList(c) && !inquiryDetail(c) && !talentList(c) && !talentDetail(c) && !cmsEditor(c) && !aiSearchSurface(c),
    Component: DefaultInspectorModule,
  },
];

export function inspectorModulesForContext(ctx: InspectorContext): InspectorModuleDefinition[] {
  return ADMIN_INSPECTOR_MODULES.filter((m) => m.visible(ctx));
}
