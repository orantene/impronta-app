"use server";

/**
 * Edit-chrome composition actions — typed (non-FormData) wrappers over the
 * Phase 5 homepage composer server ops.
 *
 * The existing `/admin/site-settings/structure` composer uses FormData +
 * `useActionState` because it runs inside a full-page form. The in-place
 * editor operates differently: it holds composition in React state, applies
 * discrete mutations (insert / remove / move / metadata), and needs atomic
 * typed round-trips with CAS (expectedVersion → pageVersion).
 *
 * We re-use the same lib-layer op (`saveHomepageDraftComposition`) so all
 * gates — capability, tenant scope, slot allowedSectionTypes, archived
 * section rejection, CAS — run identically to the composer. No duplicated
 * business logic.
 */

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  homepageMetadataSchema,
  homepageSaveDraftSchema,
  homepageSlotsSchema,
  type HomepageMetadataValues,
  type HomepageSlotsValues,
} from "@/lib/site-admin/forms/homepage";
import {
  applyHomepageDraftBeacon,
  copyPublishedToDraft,
  ensureHomepageRow,
  publishHomepage,
  saveHomepageDraftComposition,
  type PullFromLiveMode,
} from "@/lib/site-admin/server/homepage";
import { loadDraftHomepage } from "@/lib/site-admin/server/homepage-reads";
import { recoverBuilderTreeIfEmpty } from "@/lib/site-admin/server/recover-builder-tree";
import { normalizeBuilderTreeLayout } from "@/lib/site-admin/builder-node/normalize-tree-layout";
import { commitPageRevisionThenVersion } from "@/lib/site-admin/server/page-revision-commit";
import { isSameSessionNewerWrite } from "@/lib/site-admin/server/beacon-last-write-wins";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadSectionByIdForStaff } from "@/lib/site-admin/server/sections-reads";
import { publishSection } from "@/lib/site-admin/server/sections";
import { republishSiteShellSnapshot } from "@/lib/site-admin/edit-mode/site-shell-publish";
import { revalidateTag } from "next/cache";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  loadBuilderWorkspacePlan,
} from "@/lib/site-admin/builder-capabilities";
import {
  listAgencyVisibleSections,
  getSectionType,
  type SectionTypeKey,
  SECTION_REGISTRY,
} from "@/lib/site-admin/sections/registry";
import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";
import {
  getSectionTemplateStarterDefault,
  isSectionTemplateStarterId,
  isSectionTemplateStarterStylePresetId,
  sectionTemplateStarterPlanDeniedReason,
} from "@/lib/site-admin/sections/shared/section-template-starters";
import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import { upsertSection } from "@/lib/site-admin/server/sections";
import { homepageTemplate } from "@/lib/site-admin";
import { isLocale, type Locale } from "@/lib/site-admin/locales";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { auditFailure } from "@/lib/audit/emit";
import { publishPageSnapshot } from "@/lib/site-admin/edit-mode/page-composer-action";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import type {
  BuilderStyleClassRegistry,
  BuilderStylePresetRegistry,
} from "@/lib/site-admin/builder-node/style-classes";
import {
  buildLegacySectionBuilderTree,
  type LegacySnapshotSlot,
} from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import { resolveSnapshotBuilderTree } from "@/lib/site-admin/builder-node/snapshot-tree";
import { enforceFreePlanNestedBuilderDraftGuard } from "@/lib/site-admin/server/free-plan-draft-save-guard";
import { isShellMutationAllowedForPlan } from "@/lib/site-admin/edit-mode/shell-plan-guard";
import {
  parseBuilderTreeFromSnapshot,
  parseStyleClassesFromSnapshot,
  parseStylePresetsFromSnapshot,
} from "@/lib/site-admin/edit-mode/composition-revision-snapshot";

// ── types ─────────────────────────────────────────────────────────────────

export interface CompositionSectionRef {
  sectionId: string;
  sortOrder: number;
  sectionTypeKey: string;
  name: string;
  /**
   * Per-section visibility lifted from `props.presentation.visibility` so
   * the navigator panel can render the eye state without round-tripping
   * each section. Optional — pre-existing rows that never set
   * presentation.visibility serialise as `undefined` (treated as "always").
   */
  visibility?: "always" | "desktop-only" | "mobile-only" | "hidden";
}

export interface CompositionSlotDef {
  key: string;
  label: string;
  required: boolean;
  allowedSectionTypes: readonly string[] | null;
}

export interface CompositionLibraryEntry {
  typeKey: string;
  label: string;
  description: string;
  /** Legacy `businessPurpose` value — kept for analytics + legacy callers. */
  purpose: string;
  /**
   * Phase D — picker category (one of the 8 buckets in the §8 tab strip:
   * hero / trust / showcase / story / convert / form / embed / navigation).
   */
  category: string;
  /**
   * Phase D — when true the entry appears in the curated default picker
   * view (~15 types). When false it is revealed by the "Show advanced
   * sections" toggle. Search hits both regardless.
   */
  inDefault: boolean;
  /** Phase D — optional pill ("new" | "premium") shown on the tile preview. */
  tag?: "new" | "premium";
}

export interface CompositionData {
  locale: Locale;
  /** The cms_pages.id for the page being edited. All mutations thread this
   *  back so they target the correct page regardless of page type. */
  pageId: string;
  pageVersion: number;
  /**
   * When the visitor-facing site last had this page published (`cms_pages.published_at`).
   * `null` when the row has never been published. Draft autosave does not move this —
   * it updates after a successful Publish (next composition refresh).
   */
  liveSitePublishedAt: string | null;
  metadata: {
    title: string;
    metaTitle: string | null;
    metaDescription: string | null;
    introTagline: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageUrl: string | null;
    canonicalUrl: string | null;
    noindex: boolean;
    /**
     * SEO-1 — structured-data (JSON-LD) payload carried through the SAME shared
     * metadata envelope as the OG/canonical set, so every surface describes SEO
     * identically (storefront already backs this with `cms_pages.json_ld`;
     * talent-site backs it with the SEO-1 `talent_pages.json_ld` migration).
     * Nullable: a surface with no structured data (or a not-yet-migrated read)
     * degrades to `null`, never throws.
     */
    jsonLd: unknown | null;
  };
  slots: Record<string, CompositionSectionRef[]>;
  /**
   * Phase 4 current-builder bridge. This mirrors the existing slot
   * composition as typed section nodes so the live EditShell can gain node
   * semantics without replacing the section renderer or creating a second
   * builder surface.
   */
  builderTree: BuilderNodeTree;
  slotDefs: CompositionSlotDef[];
  library: CompositionLibraryEntry[];
  /** Linked style classes from the latest draft revision snapshot. */
  styleClasses?: BuilderStyleClassRegistry;
  /**
   * STYLE-1 — site-scoped style presets + copy/paste clipboard, carried through
   * the SAME surface-agnostic envelope as `styleClasses`. Every adapter reads it
   * from its surface's `style_presets` column (or `null`/absent → undefined for a
   * not-yet-migrated row, which degrades to the localStorage seed).
   */
  stylePresets?: BuilderStylePresetRegistry;
  /** Locales available for the active tenant (read-only here — used for the
   *  Topbar locale switcher and the clone-from-locale command). */
  availableLocales: ReadonlyArray<Locale>;
  /**
   * W1-L2 — the WS1-D `edit_session_id` stamped on the page row by the LAST
   * draft write (`null` on legacy rows or after an unstamped write). Lets the
   * client tell "my own reload after my own beacon bump" (stamp === my per-tab
   * session token) apart from a genuinely foreign write — used to keep the
   * persisted undo stack across a same-session reload instead of dropping it
   * on the version mismatch the beacon itself caused. Optional: surfaces that
   * don't stamp (talent/site-shell adapters) omit it and rehydrate keeps the
   * strict version-match rule.
   */
  lastWriterEditSessionId?: string | null;
}

export type CompositionLoadResult =
  | { ok: true; data: CompositionData }
  | { ok: false; error: string; code?: string };

export type CompositionSaveResult =
  | { ok: true; pageVersion: number }
  | { ok: false; error: string; code?: string; currentVersion?: number };

export type CreateAndInsertResult =
  | {
      ok: true;
      section: {
        id: string;
        name: string;
        sectionTypeKey: string;
        version: number;
        props: Record<string, unknown>;
      };
      pageVersion: number;
    }
  | { ok: false; error: string; code?: string; currentVersion?: number };

// ── locale helper ─────────────────────────────────────────────────────────

function asLocale(raw: string): Locale | null {
  return isLocale(raw) ? raw : null;
}

function buildBuilderTreeFromCompositionSlots(
  slots: Record<string, CompositionSectionRef[]>,
): BuilderNodeTree {
  const refs = Object.entries(slots).flatMap(([slotKey, rows]) =>
    rows.map((row) => ({
      slotKey,
      sortOrder: row.sortOrder,
      sectionId: row.sectionId,
      sectionTypeKey: row.sectionTypeKey,
      name: row.name,
    })),
  );
  return buildLegacySectionBuilderTree(refs);
}

function resolveBuilderTreeForSnapshot(input: {
  slots: ReadonlyArray<LegacySnapshotSlot>;
  preferredBuilderTree?: unknown;
}): BuilderNodeTree {
  const resolved = resolveSnapshotBuilderTree({
    slots: input.slots,
    builderTree: input.preferredBuilderTree,
  });
  return resolved.tree;
}

async function loadDraftRevisionExtras(
  admin: SupabaseClient,
  tenantId: string,
  pageId: string,
  version?: number,
): Promise<{
  styleClasses?: BuilderStyleClassRegistry;
  stylePresets?: BuilderStylePresetRegistry;
  builderTree?: BuilderNodeTree;
}> {
  let query = admin
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (version !== undefined) {
    query = query.eq("version", version);
  }
  const { data: revisionRow } = await query.maybeSingle<{ snapshot: unknown }>();
  const snapshot = revisionRow?.snapshot;
  if (!snapshot) return {};
  return {
    styleClasses: parseStyleClassesFromSnapshot(snapshot),
    stylePresets: parseStylePresetsFromSnapshot(snapshot),
    builderTree: parseBuilderTreeFromSnapshot(snapshot),
  };
}

async function guardShellPlanMutation(input: {
  staffSupabase: SupabaseClient;
  tenantId: string;
  pageId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; code: "PLAN_RESTRICTED" }> {
  if (!input.pageId) return { ok: true };

  const { data: page, error: pageError } = await input.staffSupabase
    .from("cms_pages")
    .select("system_template_key")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.pageId)
    .maybeSingle<{ system_template_key: string | null }>();

  if (pageError) {
    return {
      ok: false,
      code: "PLAN_RESTRICTED",
      error:
        "Unable to verify shell edit permissions right now. Try again in a moment.",
    };
  }

  if (page?.system_template_key !== "site_shell") return { ok: true };

  const plan = await loadBuilderWorkspacePlan(input.staffSupabase, input.tenantId, {
    logTag: "composition-shell-plan-guard",
  });
  if (
    isShellMutationAllowedForPlan({
      systemTemplateKey: page.system_template_key,
      planTier: plan,
    })
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    code: "PLAN_RESTRICTED",
    error:
      "Site header and footer editing is locked on Free. Upgrade to Studio to unlock shell controls.",
  };
}

// ── load ───────────────────────────────────────────────────────────────────

/**
 * Load the draft composition for the requesting tenant + locale. The edit
 * chrome calls this once on engage + after every cache invalidation. Returns
 * the draft-first snapshot (draft composition if any, else live).
 *
 * NOTE: This reads via the service-role client through `loadDraftHomepage`,
 * which the preview/edit cookie flow already authenticates. We still gate
 * on staff + tenant scope here so a stray caller can't probe from anywhere.
 */
export async function loadHomepageCompositionAction(input: {
  locale: string;
  /**
   * When non-null the editor is on a non-homepage page identified by this
   * slug. The loader fetches that page's composition instead of the homepage.
   * Null / undefined → homepage (existing behaviour).
   */
  pageSlug?: string | null;
}): Promise<CompositionLoadResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing the homepage.",
    };
  }
  const locale = asLocale(input.locale);
  if (!locale) {
    return { ok: false, error: `Unsupported locale "${input.locale}".` };
  }

  const library: CompositionLibraryEntry[] = listAgencyVisibleSections().map(
    (s) => ({
      typeKey: s.meta.key,
      label: s.meta.label,
      description: s.meta.description,
      purpose: s.meta.businessPurpose,
      category: s.meta.category,
      inDefault: s.meta.inDefault,
      tag: s.meta.tag,
    }),
  );
  const localeSettings = await loadTenantLocaleSettings(scope.tenantId);

  // ── non-homepage page ──────────────────────────────────────────────────
  if (input.pageSlug) {
    const admin = createServiceRoleClient();
    if (!admin) {
      return { ok: false, error: "Server configuration error.", code: "SERVER_ERROR" };
    }

    const { data: pageRow, error: pageErr } = await admin
      .from("cms_pages")
      .select(
        "id, title, meta_title, meta_description, og_title, og_description, og_image_url, canonical_url, noindex, json_ld, version, published_at, edit_session_id",
      )
      .eq("tenant_id", scope.tenantId)
      .eq("locale", locale)
      .eq("slug", input.pageSlug)
      .neq("status", "archived")
      .maybeSingle<{
        id: string;
        title: string;
        meta_title: string | null;
        meta_description: string | null;
        og_title: string | null;
        og_description: string | null;
        og_image_url: string | null;
        canonical_url: string | null;
        noindex: boolean;
        // SEO-1 — cms_pages already carries json_ld; surface it through the
        // shared metadata envelope so storefront/cms_page read it identically.
        json_ld: unknown | null;
        version: number;
        published_at: string | null;
        // W1-L2 — last draft writer's edit-session stamp (see CompositionData).
        edit_session_id: string | null;
      }>();
    if (pageErr || !pageRow) {
      return {
        ok: false,
        error: `Page "${input.pageSlug}" not found for this locale.`,
        code: "NOT_FOUND",
      };
    }

    // Draft-first: prefer is_draft=TRUE, fall through to live when empty.
    type SectionJoinRow = {
      slot_key: string;
      section_id: string;
      sort_order: number;
      cms_sections: {
        section_type_key: string;
        name: string;
        props_jsonb: Record<string, unknown> | null;
      } | null;
    };

    const selectCols = `slot_key, section_id, sort_order, cms_sections:section_id(section_type_key, name, props_jsonb)`;

    const { data: draftRows } = await admin
      .from("cms_page_sections")
      .select(selectCols)
      .eq("tenant_id", scope.tenantId)
      .eq("page_id", pageRow.id)
      .eq("is_draft", true)
      .order("slot_key")
      .order("sort_order");

    let sectionRows = (draftRows ?? []) as unknown as SectionJoinRow[];
    if (sectionRows.length === 0) {
      const { data: liveRows } = await admin
        .from("cms_page_sections")
        .select(selectCols)
        .eq("tenant_id", scope.tenantId)
        .eq("page_id", pageRow.id)
        .eq("is_draft", false)
        .order("slot_key")
        .order("sort_order");
      sectionRows = (liveRows ?? []) as unknown as SectionJoinRow[];
    }

    const slots: Record<string, CompositionSectionRef[]> = {};
    const legacyBuilderSlots: LegacySnapshotSlot[] = [];
    for (const row of sectionRows) {
      const sec = row.cms_sections;
      if (!sec) continue;
      const bucket = (slots[row.slot_key] ??= []);
      const presentation = sec.props_jsonb?.presentation as
        | { visibility?: string }
        | undefined;
      const rawVisibility = presentation?.visibility;
      const visibility =
        rawVisibility === "always" ||
        rawVisibility === "desktop-only" ||
        rawVisibility === "mobile-only" ||
        rawVisibility === "hidden"
          ? rawVisibility
          : undefined;
      bucket.push({
        sectionId: row.section_id,
        sortOrder: row.sort_order,
        sectionTypeKey: sec.section_type_key,
        name: sec.name,
        visibility,
      });
      legacyBuilderSlots.push({
        slotKey: row.slot_key,
        sortOrder: row.sort_order,
        sectionId: row.section_id,
        sectionTypeKey: sec.section_type_key,
        name: sec.name,
        props: sec.props_jsonb ?? {},
      });
    }
    for (const k of Object.keys(slots)) {
      slots[k]!.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // Synthesise slot defs from the keys present; fall back to a single
    // generic "body" slot when the page has no sections yet.
    const slotKeys = Object.keys(slots);
    const slotDefs: CompositionSlotDef[] =
      slotKeys.length > 0
        ? slotKeys.map((k) => ({
            key: k,
            label: k.charAt(0).toUpperCase() + k.slice(1),
            required: false,
            allowedSectionTypes: null,
          }))
        : [{ key: "body", label: "Body", required: false, allowedSectionTypes: null }];

    const { data: revisionRow } = await admin
      .from("cms_page_revisions")
      .select("snapshot")
      .eq("tenant_id", scope.tenantId)
      .eq("page_id", pageRow.id)
      .eq("version", pageRow.version)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ snapshot: unknown }>();
    const revisionExtras = revisionRow?.snapshot
      ? {
          styleClasses: parseStyleClassesFromSnapshot(revisionRow.snapshot),
          stylePresets: parseStylePresetsFromSnapshot(revisionRow.snapshot),
          builderTree: parseBuilderTreeFromSnapshot(revisionRow.snapshot),
        }
      : await loadDraftRevisionExtras(admin, scope.tenantId, pageRow.id, pageRow.version);
    // #310 self-heal guard (WAVE 1.3). The version-matched revision is trusted
    // BLINDLY here, exactly as the homepage load did before the June incident:
    // if the pointer drifts onto an empty (or missing) revision, the editor
    // paints an empty canvas and the next autosave writes that emptiness
    // forward under a valid CAS. `recoverBuilderTreeIfEmpty` falls back to the
    // most recent revision that actually has content. Its node count is
    // RECURSIVE, so a lone empty root container still counts as empty and
    // recovery still fires; a root container WITH children does not.
    const preferredBuilderTree = (await recoverBuilderTreeIfEmpty(
      admin,
      {
        tenantId: scope.tenantId,
        pageId: pageRow.id,
        pageVersion: pageRow.version,
        hasSlots: legacyBuilderSlots.length > 0,
      },
      revisionExtras.builderTree,
    )) as BuilderNodeTree | undefined;

    const publishedAt =
      typeof pageRow.published_at === "string" && pageRow.published_at.trim() !== ""
        ? pageRow.published_at
        : null;

    return {
      ok: true,
      data: {
        locale,
        pageId: pageRow.id,
        pageVersion: pageRow.version,
        liveSitePublishedAt: publishedAt,
        metadata: {
          title: pageRow.title,
          metaTitle: pageRow.meta_title,
          metaDescription: pageRow.meta_description,
          introTagline: null, // homepage-specific field; not applicable here
          ogTitle: pageRow.og_title,
          ogDescription: pageRow.og_description,
          ogImageUrl: pageRow.og_image_url,
          canonicalUrl: pageRow.canonical_url,
          noindex: pageRow.noindex,
          jsonLd: pageRow.json_ld ?? null,
        },
        slots,
        builderTree: resolveBuilderTreeForSnapshot({
          slots: legacyBuilderSlots,
          preferredBuilderTree,
        }),
        styleClasses: revisionExtras.styleClasses,
        stylePresets: revisionExtras.stylePresets,
        slotDefs,
        library,
        availableLocales: localeSettings.supportedLocales,
        lastWriterEditSessionId: pageRow.edit_session_id,
      },
    };
  }

  // ── homepage (existing path) ───────────────────────────────────────────

  // Seed the row on first open so the editor can always save.
  const seed = await ensureHomepageRow(auth.supabase, {
    tenantId: scope.tenantId,
    locale,
    actorProfileId: auth.user.id,
  });
  if (!seed.ok) {
    return { ok: false, error: seed.message ?? CLIENT_ERROR.generic, code: seed.code };
  }

  const page = await loadDraftHomepage(scope.tenantId, locale);
  if (!page) {
    return {
      ok: false,
      error: "Draft homepage not available for this locale.",
      code: "NOT_FOUND",
    };
  }

  // `loadDraftHomepage` returns a `PublicHomepage` whose `snapshot` carries
  // the draft-first composition when draft rows exist; `null` when neither
  // draft nor published rows exist. A brand-new tenant with no content hits
  // the null branch — render an empty-but-editable slate so the operator
  // can start from scratch rather than being locked out.
  const comp = page.snapshot;

  const slots: Record<string, CompositionSectionRef[]> = {};
  if (comp) {
    for (const row of comp.slots) {
      const bucket = (slots[row.slotKey] ??= []);
      const presentation = (row.props as Record<string, unknown>)?.presentation as
        | { visibility?: string }
        | undefined;
      const rawVisibility = presentation?.visibility;
      const visibility =
        rawVisibility === "always" ||
        rawVisibility === "desktop-only" ||
        rawVisibility === "mobile-only" ||
        rawVisibility === "hidden"
          ? rawVisibility
          : undefined;
      bucket.push({
        sectionId: row.sectionId,
        sortOrder: row.sortOrder,
        sectionTypeKey: row.sectionTypeKey,
        name: row.name,
        visibility,
      });
    }
    for (const k of Object.keys(slots)) {
      slots[k]!.sort((a, b) => a.sortOrder - b.sortOrder);
    }
  }

  const slotDefs: CompositionSlotDef[] = homepageTemplate.meta.slots.map((s) => ({
    key: s.key,
    label: s.label,
    required: s.required,
    allowedSectionTypes: s.allowedSectionTypes ?? null,
  }));

  // Tenant's configured supported locales — used to render the locale
  // switcher in the topbar and the clone-from-locale command. Cached read
  // (60s TTL); the identity save invalidates this when an agency edits the
  // list, so the switcher reflects the active config without a hard reload.

  const homepagePublishedAt =
    typeof page.publishedAt === "string" && page.publishedAt.trim() !== ""
      ? page.publishedAt
      : null;

  // Freeform full-page designs (one-click starter designs) persist a builderTree
  // in the draft revision with NO curated slots. loadDraftHomepage's snapshot
  // doesn't carry that tree, so without this the edit-shell loads an EMPTY tree
  // for a freeform page — the design renders on the canvas but no block is
  // selectable/editable. When the snapshot has no tree, pull it from the latest
  // draft revision directly (mirrors the non-homepage pageSlug path above).
  // For a slot-less (freeform full-page) homepage, loadDraftHomepage's snapshot
  // builderTree can carry DIFFERENT node ids than the canvas actually renders —
  // which silently breaks click-to-select, because the edit-shell's tree ids
  // must match the rendered ids (treeContainsBuilderNodeId + the selection
  // overlay both key off them). Load the tree straight from the latest draft
  // revision (the canonical stored tree the canvas renders from) so the ids
  // line up. Curated slot pages keep their existing snapshot tree.
  const isFreeformPage = Object.keys(slots).length === 0;
  let draftRevisionBuilderTree: BuilderNodeTree | undefined;
  let draftRevisionStyleClasses: BuilderStyleClassRegistry | undefined;
  let draftRevisionStylePresets: BuilderStylePresetRegistry | undefined;
  // W1-L2 — last draft writer's edit-session stamp (see CompositionData).
  let lastWriterEditSessionId: string | null = null;
  const adminClient = createServiceRoleClient();
  if (adminClient) {
    const revisionExtras = await loadDraftRevisionExtras(
      adminClient,
      scope.tenantId,
      page.pageId,
    );
    draftRevisionStyleClasses = revisionExtras.styleClasses;
    draftRevisionStylePresets = revisionExtras.stylePresets;
    if (isFreeformPage) {
      // WAVE1-1.7 — the raw newest-revision tree must clear the SAME emptiness
      // bar the publish path uses. `parseBuilderTreeFromSnapshot` only filters
      // `length > 0`, so a drifted revision holding exactly ONE node (a lone
      // empty root container — the canonical "emptied" shape) came back as a
      // real tree here, rendered an empty canvas, and then autosaved that
      // emptiness forward over the good draft. `recoverBuilderTreeIfEmpty`
      // counts nodes RECURSIVELY and treats <= 1 as empty, falling back to the
      // most recent revision that actually has content. Freeform pages have no
      // slots by definition, hence `hasSlots: false`.
      const recoveredFreeformTree = await recoverBuilderTreeIfEmpty(
        adminClient,
        {
          tenantId: scope.tenantId,
          pageId: page.pageId,
          pageVersion: page.version,
          hasSlots: false,
        },
        revisionExtras.builderTree,
      );
      draftRevisionBuilderTree =
        Array.isArray(recoveredFreeformTree) && recoveredFreeformTree.length > 0
          ? (recoveredFreeformTree as BuilderNodeTree)
          : undefined;
    }
    const { data: stampRow } = await adminClient
      .from("cms_pages")
      .select("edit_session_id")
      .eq("tenant_id", scope.tenantId)
      .eq("id", page.pageId)
      .maybeSingle<{ edit_session_id: string | null }>();
    lastWriterEditSessionId = stampRow?.edit_session_id ?? null;
  }

  const legacyBuilderSlots: LegacySnapshotSlot[] = comp
    ? comp.slots.map((row) => ({
        slotKey: row.slotKey,
        sortOrder: row.sortOrder,
        sectionId: row.sectionId,
        sectionTypeKey: row.sectionTypeKey,
        name: row.name,
        props: row.props ?? {},
      }))
    : [];
  const preferredHomepageBuilderTree =
    (isFreeformPage ? draftRevisionBuilderTree : undefined) ??
    (comp?.builderTree && comp.builderTree.length > 0
      ? comp.builderTree
      : undefined);

  return {
    ok: true,
    data: {
      locale,
      pageId: page.pageId,
      pageVersion: page.version,
      liveSitePublishedAt: homepagePublishedAt,
      metadata: {
        title: page.title,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
        introTagline: comp?.fields.introTagline ?? null,
        ogTitle: page.ogTitle,
        ogDescription: page.ogDescription,
        ogImageUrl: page.ogImageUrl,
        canonicalUrl: page.canonicalUrl,
        noindex: page.noindex,
        jsonLd: page.jsonLd ?? null,
      },
      slots,
      builderTree: preferredHomepageBuilderTree
        ? resolveBuilderTreeForSnapshot({
            slots: legacyBuilderSlots,
            preferredBuilderTree: preferredHomepageBuilderTree,
          })
        : buildBuilderTreeFromCompositionSlots(slots),
      styleClasses: draftRevisionStyleClasses,
      stylePresets: draftRevisionStylePresets,
      slotDefs,
      library,
      availableLocales: localeSettings.supportedLocales,
      lastWriterEditSessionId,
    },
  };
}

// ── save composition ──────────────────────────────────────────────────────

export interface CompositionSaveInput {
  locale: string;
  /**
   * When non-null this is a non-homepage page and the save should target
   * it by ID instead of looking up the homepage via system_template_key.
   */
  pageId?: string | null;
  expectedVersion: number;
  metadata: {
    title: string;
    metaTitle?: string | null;
    metaDescription?: string | null;
    introTagline?: string | null;
    ogTitle?: string | null;
    ogDescription?: string | null;
    ogImageUrl?: string | null;
    canonicalUrl?: string | null;
    noindex?: boolean;
    /**
     * SEO-1 — structured-data (JSON-LD) payload. Optional on the SAVE envelope
     * (a save that doesn't touch SEO omits it; the persisted value is preserved
     * by the adapter). Same shared field the load-side `CompositionData.metadata`
     * exposes — never a per-surface struct.
     */
    jsonLd?: unknown | null;
  };
  slots: Record<string, Array<{ sectionId: string; sortOrder: number }>>;
  /**
   * Optional Phase 4 BuilderNode payload. Homepage save persists this in
   * draft revisions so nested/container node structure survives reload and
   * publish.
   */
  builderTree?: BuilderNodeTree;
  /** Page-scoped linked style classes to persist in the draft revision snapshot. */
  styleClasses?: BuilderStyleClassRegistry;
  /**
   * STYLE-1 — site-scoped style presets + clipboard to persist alongside
   * `styleClasses`. Optional: a save that doesn't touch presets omits it and the
   * adapter preserves the stored value.
   */
  stylePresets?: BuilderStylePresetRegistry;
  /**
   * First-run starter for a newly created standard page — exempt from the
   * Free-plan nested-builder draft guard (same intent as homepage curated seeds).
   */
  seedNewPageStarter?: boolean;
  /**
   * WS1-D — the writer's per-tab edit-session token + monotonic draft sequence,
   * stamped onto the `cms_pages` row so the pagehide beacon can be granted a
   * last-write-wins lane within this operator's own session. Optional.
   */
  editSession?: { id: string; seq: number };
}

/**
 * Save a composition mutation atomically.
 *
 * Homepage path (default): wraps `saveHomepageDraftComposition` so all
 * gates — capability, CAS, slot type rules, archived-section rejection — run
 * identically to the admin composer.
 *
 * Non-homepage path (when `input.pageId` is provided): performs a lighter
 * save directly against that page's row — CAS on version, update metadata
 * fields, rewrite `cms_page_sections WHERE is_draft=TRUE`. No slot-type
 * restrictions apply on non-homepage pages.
 */
export async function saveHomepageCompositionAction(
  input: CompositionSaveInput,
): Promise<CompositionSaveResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing the homepage.",
    };
  }
  const locale = asLocale(input.locale);
  if (!locale) {
    return { ok: false, error: `Unsupported locale "${input.locale}".` };
  }

  // Draft-save normalization gate — content-preserving (clamps absurd style
  // escapes, folds the deterministic mobile fixes, flattens over-deep wrapper
  // chains; NEVER drops a node). Strict `validateBuilderNodeTree` stays at
  // publish/AI/clipboard, exactly where it is.
  const normalizedBuilderTree = input.builderTree
    ? normalizeBuilderTreeLayout(input.builderTree)
    : input.builderTree;

  // ── non-homepage page save ─────────────────────────────────────────────
  if (input.pageId) {
    try {
      const shellGuard = await guardShellPlanMutation({
        staffSupabase: auth.supabase,
        tenantId: scope.tenantId,
        pageId: input.pageId,
      });
      if (!shellGuard.ok) return shellGuard;

      const admin = createServiceRoleClient();
      if (!admin) return { ok: false, error: "Server configuration error." };

      // CAS: load the current version.
      const { data: pageRow, error: loadErr } = await admin
        .from("cms_pages")
        .select(
          "id, locale, slug, template_key, system_template_key, is_system_owned, template_schema_version, title, status, body, hero, meta_title, meta_description, og_title, og_description, og_image_url, og_image_media_asset_id, noindex, include_in_sitemap, canonical_url, version, edit_session_id, draft_seq",
        )
        .eq("id", input.pageId)
        .eq("tenant_id", scope.tenantId)
        .maybeSingle<{
          id: string;
          locale: string;
          slug: string | null;
          template_key: string;
          system_template_key: string | null;
          is_system_owned: boolean;
          template_schema_version: number;
          title: string;
          status: string;
          body: string | null;
          hero: Record<string, unknown> | null;
          meta_title: string | null;
          meta_description: string | null;
          og_title: string | null;
          og_description: string | null;
          og_image_url: string | null;
          og_image_media_asset_id: string | null;
          noindex: boolean;
          include_in_sitemap: boolean;
          canonical_url: string | null;
          version: number;
          edit_session_id: string | null;
          draft_seq: number | null;
        }>();
      if (loadErr || !pageRow) {
        return { ok: false, error: "Page not found.", code: "NOT_FOUND" };
      }
      if (pageRow.version !== input.expectedVersion) {
        // W1-L2 — SESSION ADOPTION. After the editor's own full-page reload
        // its pagehide beacon may have bumped `version`, so this save's stale
        // `expectedVersion` is the SAME session continuing, not a foreign
        // conflict. Adopt IFF the stored stamp matches this session with an
        // older seq AND the incoming payload carries real content (never adopt
        // an empty tree — draft-integrity guard; without a cheap stored-content
        // read on this lighter path we simply require incoming content).
        const incomingHasContent =
          (Array.isArray(input.builderTree) && input.builderTree.length > 0) ||
          Object.values(input.slots).some(
            (entries) => Array.isArray(entries) && entries.length > 0,
          );
        const adopted =
          input.editSession &&
          incomingHasContent &&
          isSameSessionNewerWrite(
            {
              editSessionId: pageRow.edit_session_id,
              draftSeq: pageRow.draft_seq,
            },
            {
              editSessionId: input.editSession.id,
              draftSeq: input.editSession.seq,
            },
          );
        if (!adopted) {
          return {
            ok: false,
            error: "Someone else edited this page. Changes reloaded — try again.",
            code: "VERSION_CONFLICT",
            currentVersion: pageRow.version,
          };
        }
      }

      const allSectionIds = Array.from(
        new Set(
          Object.values(input.slots)
            .flatMap((entries) => entries ?? [])
            .map((entry) => entry.sectionId),
        ),
      );
      const factsById = new Map<
        string,
        {
          section_type_key: string;
          name: string;
          props_jsonb: Record<string, unknown> | null;
        }
      >();
      if (allSectionIds.length > 0) {
        const { data: sectionRows } = await admin
          .from("cms_sections")
          .select("id, section_type_key, name, props_jsonb")
          .eq("tenant_id", scope.tenantId)
          .in("id", allSectionIds);
        for (const row of sectionRows ?? []) {
          factsById.set(row.id as string, {
            section_type_key: row.section_type_key as string,
            name: row.name as string,
            props_jsonb: (row.props_jsonb as Record<string, unknown> | null) ?? {},
          });
        }
      }

      const compositionSnapshot: LegacySnapshotSlot[] = [];
      for (const [slotKey, entries] of Object.entries(input.slots)) {
        for (const entry of entries ?? []) {
          const facts = factsById.get(entry.sectionId);
          if (!facts) continue;
          compositionSnapshot.push({
            slotKey,
            sortOrder: entry.sortOrder,
            sectionId: entry.sectionId,
            sectionTypeKey: facts.section_type_key,
            name: facts.name,
            props: facts.props_jsonb ?? {},
          });
        }
      }
      compositionSnapshot.sort((a, b) => {
        if (a.slotKey < b.slotKey) return -1;
        if (a.slotKey > b.slotKey) return 1;
        return a.sortOrder - b.sortOrder;
      });

      if (!input.seedNewPageStarter) {
        const draftGuard = await enforceFreePlanNestedBuilderDraftGuard({
          supabase: admin,
          tenantId: scope.tenantId,
          pageId: input.pageId,
          pageVersion: pageRow.version,
          logTag: "page-draft-save-builder-plan",
          baselineLegacyTree: resolveBuilderTreeForSnapshot({
            slots: compositionSnapshot,
            preferredBuilderTree: undefined,
          }),
          nextTree: resolveBuilderTreeForSnapshot({
            slots: compositionSnapshot,
            preferredBuilderTree: normalizedBuilderTree,
          }),
        });
        if (!draftGuard.ok) {
          return {
            ok: false,
            error: draftGuard.message,
            code: "VALIDATION_FAILED",
          };
        }
      }

      const nextVersion = pageRow.version + 1;
      const draftBuilderTree = resolveBuilderTreeForSnapshot({
        slots: compositionSnapshot,
        preferredBuilderTree: normalizedBuilderTree,
      });

      // WAVE1-1.5 — revision FIRST, then the CAS version bump. The old order
      // bumped cms_pages, rewrote slots, then inserted the revision. A killed
      // request after the bump left version N+1 with no matching tree.
      const commit = await commitPageRevisionThenVersion(admin, {
        tenantId: scope.tenantId,
        pageId: input.pageId,
        beforeVersion: pageRow.version,
        update: {
          title: input.metadata.title,
          meta_title: input.metadata.metaTitle ?? null,
          meta_description: input.metadata.metaDescription ?? null,
          og_title: input.metadata.ogTitle ?? null,
          og_description: input.metadata.ogDescription ?? null,
          og_image_url: input.metadata.ogImageUrl ?? null,
          canonical_url: input.metadata.canonicalUrl ?? null,
          noindex: input.metadata.noindex ?? false,
          version: nextVersion,
          updated_at: new Date().toISOString(),
          // WS1-D — stamp the writer's edit-session token + draft seq so the
          // pagehide beacon can later last-write-wins against the stored draft.
          // W1-L2 — an UNSTAMPED save clears the stamps (a stale stamp must
          // never grant a later same-session LWW past a foreign write).
          ...(input.editSession
            ? {
                edit_session_id: input.editSession.id,
                draft_seq: input.editSession.seq,
              }
            : { edit_session_id: null, draft_seq: null }),
        },
        revision: {
          kind: "draft",
          version: nextVersion,
          templateSchemaVersion: pageRow.template_schema_version,
          snapshot: {
            locale: pageRow.locale,
            slug: pageRow.slug,
            template_key: pageRow.template_key,
            system_template_key: pageRow.system_template_key,
            is_system_owned: pageRow.is_system_owned,
            template_schema_version: pageRow.template_schema_version,
            title: input.metadata.title,
            status: pageRow.status,
            body: pageRow.body ?? "",
            hero: pageRow.hero ?? {},
            meta_title: input.metadata.metaTitle ?? pageRow.meta_title,
            meta_description: input.metadata.metaDescription ?? null,
            og_title: input.metadata.ogTitle ?? null,
            og_description: input.metadata.ogDescription ?? null,
            og_image_url: input.metadata.ogImageUrl ?? null,
            og_image_media_asset_id: pageRow.og_image_media_asset_id,
            noindex: input.metadata.noindex ?? false,
            include_in_sitemap: pageRow.include_in_sitemap,
            canonical_url: input.metadata.canonicalUrl ?? null,
            version: nextVersion,
            composition: compositionSnapshot,
            builderTree: draftBuilderTree,
            ...(input.styleClasses && Object.keys(input.styleClasses).length > 0
              ? { styleClasses: input.styleClasses }
              : {}),
            ...(input.stylePresets &&
            (input.stylePresets.presets.length > 0 || input.stylePresets.clipboard)
              ? { stylePresets: input.stylePresets }
              : {}),
          },
        },
        actorProfileId: auth.user.id,
        logScope: "edit-mode/composition/save-page",
      });
      if (!commit.ok) {
        if (commit.reason === "cas_conflict") {
          return {
            ok: false,
            error: "Someone else edited this page. Changes reloaded — try again.",
            code: "VERSION_CONFLICT",
            currentVersion: pageRow.version + 1,
          };
        }
        if (commit.reason === "revision_insert") {
          logServerError(
            "edit-mode/composition/save-page-revision",
            new Error(commit.message ?? "revision insert failed"),
          );
        }
        return { ok: false, error: CLIENT_ERROR.update };
      }

      // Junction writes AFTER the revision+version commit. A slot failure
      // leaves version N+1 WITH a revision — the editor rehydrates from it.
      const { error: delErr } = await admin
        .from("cms_page_sections")
        .delete()
        .eq("tenant_id", scope.tenantId)
        .eq("page_id", input.pageId)
        .eq("is_draft", true);
      if (delErr) {
        logServerError("edit-mode/composition/save-page-slot-delete", delErr);
        return { ok: false, error: CLIENT_ERROR.update };
      }

      const newRows: Array<{
        tenant_id: string;
        page_id: string;
        section_id: string;
        slot_key: string;
        sort_order: number;
        is_draft: boolean;
      }> = [];
      for (const [slotKey, entries] of Object.entries(input.slots)) {
        for (const e of entries ?? []) {
          newRows.push({
            tenant_id: scope.tenantId,
            page_id: input.pageId,
            section_id: e.sectionId,
            slot_key: slotKey,
            sort_order: e.sortOrder,
            is_draft: true,
          });
        }
      }
      if (newRows.length > 0) {
        const { error: insErr } = await admin
          .from("cms_page_sections")
          .insert(newRows);
        if (insErr) {
          return { ok: false, error: CLIENT_ERROR.update };
        }
      }

      return { ok: true, pageVersion: nextVersion };
    } catch (err) {
      logServerError("edit-mode/composition/save-page", err);
      return { ok: false, error: CLIENT_ERROR.update };
    }
  }

  // ── homepage path (existing) ───────────────────────────────────────────

  // Schema treats absent fields as "leave unset" (writes NULL). The typed
  // envelope from edit-chrome carries `null` for cleared fields; the schema
  // expects `undefined`. Coerce here so a freshly-cleared OG/canonical field
  // round-trips correctly.
  const metadataInput = {
    title: input.metadata.title,
    metaTitle: input.metadata.metaTitle ?? undefined,
    metaDescription: input.metadata.metaDescription ?? undefined,
    introTagline: input.metadata.introTagline ?? undefined,
    ogTitle: input.metadata.ogTitle ?? undefined,
    ogDescription: input.metadata.ogDescription ?? undefined,
    ogImageUrl: input.metadata.ogImageUrl ?? undefined,
    canonicalUrl: input.metadata.canonicalUrl ?? undefined,
    noindex: input.metadata.noindex,
  };
  const metadataParsed = homepageMetadataSchema.safeParse(metadataInput);
  if (!metadataParsed.success) {
    return {
      ok: false,
      error:
        metadataParsed.error.issues[0]?.message ??
        "Page metadata is missing or invalid.",
    };
  }
  const slotsParsed = homepageSlotsSchema.safeParse(input.slots);
  if (!slotsParsed.success) {
    return {
      ok: false,
      error: slotsParsed.error.issues[0]?.message ?? "Invalid slot layout.",
    };
  }

  const envelope = homepageSaveDraftSchema.safeParse({
    tenantId: scope.tenantId,
    locale,
    expectedVersion: input.expectedVersion,
    metadata: metadataParsed.data satisfies HomepageMetadataValues,
    slots: slotsParsed.data satisfies HomepageSlotsValues,
    builderTree: normalizedBuilderTree,
  });
  if (!envelope.success) {
    return { ok: false, error: "Composition envelope failed validation." };
  }

  try {
    const result = await saveHomepageDraftComposition(auth.supabase, {
      tenantId: scope.tenantId,
      values: envelope.data,
      styleClasses: input.styleClasses,
      stylePresets: input.stylePresets,
      actorProfileId: auth.user.id,
      editSession: input.editSession,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error:
            "Someone else edited the homepage. Changes reloaded — try again.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? CLIENT_ERROR.update,
        code: result.code,
      };
    }
    return { ok: true, pageVersion: result.data.version };
  } catch (err) {
    logServerError("edit-mode/composition/save", err);
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ── create + insert ───────────────────────────────────────────────────────

function shortToken(): string {
  return randomBytes(3).toString("hex");
}

function isUniqueNameViolation(code?: string, message?: string): boolean {
  if (code === "UNIQUE_VIOLATION" || code === "NAME_TAKEN") return true;
  return Boolean(message && /already exists|duplicate key|unique/i.test(message));
}

/**
 * Create a new draft section of the given type, then immediately insert a
 * reference to it into the target slot at the requested sortOrder, shifting
 * any later entries in that slot back by one. One atomic admin operation
 * from the operator's perspective.
 *
 * CAS on `expectedVersion`; on conflict the caller is expected to reload
 * the composition and retry.
 */
export async function createAndInsertSectionAction(input: {
  locale: string;
  /** Non-null when editing a non-homepage page. Threaded to save so the
   *  section is inserted into the correct page's composition. */
  pageId?: string | null;
  expectedVersion: number;
  metadata: CompositionSaveInput["metadata"];
  slots: Record<string, Array<{ sectionId: string; sortOrder: number }>>;
  builderTree?: BuilderNodeTree;
  targetSlotKey: string;
  insertAfterSortOrder: number | null; // null → prepend (sort 0)
  sectionTypeKey: string;
  sectionTemplateStarterId?: string | null;
  sectionTemplateStarterStylePresetId?: string | null;
  /** WS1-D / W1-L2 — per-tab edit-session token + monotonic draft seq, threaded
   *  to the save so the write is stamped (keeps the beacon LWW lane + session
   *  adoption alive for the editor's insert path). */
  editSession?: { id: string; seq: number };
}): Promise<CreateAndInsertResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing the homepage.",
    };
  }
  const locale = asLocale(input.locale);
  if (!locale) {
    return { ok: false, error: `Unsupported locale "${input.locale}".` };
  }

  const shellGuard = await guardShellPlanMutation({
    staffSupabase: auth.supabase,
    tenantId: scope.tenantId,
    pageId: input.pageId,
  });
  if (!shellGuard.ok) return shellGuard;

  if (!(input.sectionTypeKey in SECTION_REGISTRY)) {
    return {
      ok: false,
      error: `Unknown section type "${input.sectionTypeKey}".`,
      code: "UNKNOWN_SECTION_TYPE",
    };
  }
  const typeKey = input.sectionTypeKey as SectionTypeKey;
  const entry = getSectionType(typeKey);
  if (!entry) {
    return {
      ok: false,
      error: "Section type is not registered on this platform build.",
      code: "UNKNOWN_SECTION_TYPE",
    };
  }

  // Slot-type validation only applies to homepage (which has a template
  // with allowedSectionTypes per slot). Non-homepage pages have no
  // template restrictions — any section type is valid in any slot.
  if (!input.pageId) {
    const slotDef = homepageTemplate.meta.slots.find(
      (s) => s.key === input.targetSlotKey,
    );
    if (!slotDef) {
      return {
        ok: false,
        error: `Unknown homepage slot "${input.targetSlotKey}".`,
        code: "UNKNOWN_SLOT",
      };
    }
    if (slotDef.allowedSectionTypes && !slotDef.allowedSectionTypes.includes(typeKey)) {
      return {
        ok: false,
        error: `The ${slotDef.label} slot only accepts ${slotDef.allowedSectionTypes.join(", ")}.`,
        code: "SLOT_TYPE_MISMATCH",
      };
    }
  }

  if (
    input.sectionTemplateStarterId &&
    !isSectionTemplateStarterId(input.sectionTemplateStarterId)
  ) {
    return {
      ok: false,
      error: "Unknown section template starter.",
      code: "UNKNOWN_SECTION_TYPE",
    };
  }

  if (input.sectionTemplateStarterId) {
    const plan = await loadBuilderWorkspacePlan(auth.supabase, scope.tenantId, {
      logTag: "composition-section-template-plan-guard",
    });
    const deniedReason = sectionTemplateStarterPlanDeniedReason(
      input.sectionTemplateStarterId,
      plan,
    );
    if (deniedReason) {
      return {
        ok: false,
        error: deniedReason,
        code: "PLAN_RESTRICTED",
      };
    }
  }

  // --- step 1: create the draft section (unique-name retry once) ---------
  const starterDefaults = getSectionTemplateStarterDefault(
    input.sectionTemplateStarterId,
    input.sectionTemplateStarterStylePresetId,
  );
  if (
    input.sectionTemplateStarterStylePresetId &&
    !isSectionTemplateStarterStylePresetId(
      input.sectionTemplateStarterId,
      input.sectionTemplateStarterStylePresetId,
    )
  ) {
    return {
      ok: false,
      error: "Unknown section template style preset.",
      code: "UNKNOWN_SECTION_TYPE",
    };
  }
  if (starterDefaults && starterDefaults.sectionTypeKey !== typeKey) {
    return {
      ok: false,
      error: "Section template does not match the requested section type.",
      code: "VALIDATION_FAILED",
    };
  }
  const defaults = starterDefaults ?? getLibraryDefault(typeKey);
  const baseValues = {
    tenantId: scope.tenantId,
    sectionTypeKey: typeKey,
    schemaVersion: entry.currentVersion,
    props: defaults.props,
    expectedVersion: 0 as const,
  };

  let created:
    | { id: string; name: string; version: number }
    | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const name =
      attempt === 0 ? defaults.name : `${defaults.name} ${shortToken()}`;
    const parsed = sectionUpsertSchema.safeParse({ ...baseValues, name });
    if (!parsed.success) {
      logServerError(
        "composition-actions/safeParse",
        new Error(
          parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        ),
      );
      return {
        ok: false,
        error: "Section defaults failed validation.",
        code: "VALIDATION_FAILED",
      };
    }
    try {
      const res = await upsertSection(auth.supabase, {
        tenantId: scope.tenantId,
        values: parsed.data,
        actorProfileId: auth.user.id,
      });
      if (res.ok) {
        created = { id: res.data.id, name, version: res.data.version };
        break;
      }
      if (isUniqueNameViolation(res.code, res.message) && attempt === 0) {
        continue;
      }
      return {
        ok: false,
        error: res.message ?? CLIENT_ERROR.update,
        code: res.code,
      };
    } catch (err) {
      logServerError("composition-actions/create-section", err);
      return { ok: false, error: CLIENT_ERROR.update };
    }
  }
  if (!created) {
    return {
      ok: false,
      error: "Couldn't create the new section.",
      code: "CREATE_FAILED",
    };
  }

  // --- step 2: splice into slot + save composition with CAS --------------
  // Client hands us the current slots snapshot as it sees it. We mutate it
  // locally, then send through the standard save op (which re-validates
  // everything against live DB state — CAS guards against divergence).
  const slotsCopy: Record<string, Array<{ sectionId: string; sortOrder: number }>> =
    Object.fromEntries(
      Object.entries(input.slots).map(([k, v]) => [k, v.map((e) => ({ ...e }))]),
    );
  const targetList = (slotsCopy[input.targetSlotKey] ??= []);

  const insertAt =
    input.insertAfterSortOrder === null
      ? 0
      : (input.insertAfterSortOrder ?? -1) + 1;

  for (const e of targetList) {
    if (e.sortOrder >= insertAt) e.sortOrder += 1;
  }
  targetList.push({ sectionId: created.id, sortOrder: insertAt });
  targetList.sort((a, b) => a.sortOrder - b.sortOrder);

  const saveRes = await saveHomepageCompositionAction({
    locale,
    pageId: input.pageId,
    expectedVersion: input.expectedVersion,
    metadata: input.metadata,
    slots: slotsCopy,
    builderTree: input.builderTree,
    editSession: input.editSession,
  });
  if (!saveRes.ok) {
    return {
      ok: false,
      error: saveRes.error,
      code: saveRes.code,
      currentVersion: saveRes.currentVersion,
    };
  }

  return {
    ok: true,
    section: {
      id: created.id,
      name: created.name,
      sectionTypeKey: typeKey,
      version: created.version,
      props: defaults.props,
    },
    pageVersion: saveRes.pageVersion,
  };
}

// ── duplicate ─────────────────────────────────────────────────────────────

/**
 * Duplicate an existing section into the same slot, right after the source.
 *
 * Flow mirrors {@link createAndInsertSectionAction} except the new draft
 * inherits the source section's type + props + schema version + a derived
 * name ("<original> copy"). The slots payload is spliced the same way — the
 * server re-validates every gate (capability, slot allow-list, tenant scope)
 * via the standard `saveHomepageCompositionAction` path, so duplication is
 * safe even if the operator is on a stale snapshot.
 */
export async function duplicateSectionAction(input: {
  locale: string;
  /** Non-null when editing a non-homepage page. */
  pageId?: string | null;
  expectedVersion: number;
  metadata: CompositionSaveInput["metadata"];
  slots: Record<string, Array<{ sectionId: string; sortOrder: number }>>;
  builderTree?: BuilderNodeTree;
  sourceSectionId: string;
  /** WS1-D / W1-L2 — per-tab edit-session token + monotonic draft seq, threaded
   *  to the save so the write is stamped. */
  editSession?: { id: string; seq: number };
}): Promise<CreateAndInsertResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing the homepage.",
    };
  }
  const locale = asLocale(input.locale);
  if (!locale) {
    return { ok: false, error: `Unsupported locale "${input.locale}".` };
  }

  const shellGuard = await guardShellPlanMutation({
    staffSupabase: auth.supabase,
    tenantId: scope.tenantId,
    pageId: input.pageId,
  });
  if (!shellGuard.ok) return shellGuard;

  // Find where the source lives in the current snapshot so we know which
  // slot to splice the duplicate into and at what position.
  let sourceSlot: string | null = null;
  let sourceSortOrder: number | null = null;
  for (const [slotKey, entries] of Object.entries(input.slots)) {
    const hit = entries.find((e) => e.sectionId === input.sourceSectionId);
    if (hit) {
      sourceSlot = slotKey;
      sourceSortOrder = hit.sortOrder;
      break;
    }
  }
  if (sourceSlot === null || sourceSortOrder === null) {
    return {
      ok: false,
      error: "Couldn't find that section in the current page.",
      code: "NOT_FOUND",
    };
  }

  const source = await loadSectionByIdForStaff(
    auth.supabase,
    scope.tenantId,
    input.sourceSectionId,
  );
  if (!source) {
    return { ok: false, error: "Section not found.", code: "NOT_FOUND" };
  }

  const typeKey = source.section_type_key as SectionTypeKey;
  const entry = getSectionType(typeKey);
  if (!entry) {
    return {
      ok: false,
      error: "Section type missing from registry — refresh and try again.",
      code: "UNKNOWN_SECTION_TYPE",
    };
  }

  const baseValues = {
    tenantId: scope.tenantId,
    sectionTypeKey: typeKey,
    schemaVersion: source.schema_version,
    props: (source.props_jsonb ?? {}) as Record<string, unknown>,
    expectedVersion: 0 as const,
  };
  const originalName = (source.name ?? "").trim() || "Section";

  let created: { id: string; name: string; version: number } | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const suffix =
      attempt === 0 ? " copy" : ` copy ${shortToken()}`;
    const name = `${originalName}${suffix}`;
    const parsed = sectionUpsertSchema.safeParse({ ...baseValues, name });
    if (!parsed.success) {
      logServerError(
        "composition-actions/duplicate/safeParse",
        new Error(
          parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        ),
      );
      return {
        ok: false,
        error: "Couldn't validate the duplicated section.",
        code: "VALIDATION_FAILED",
      };
    }
    try {
      const res = await upsertSection(auth.supabase, {
        tenantId: scope.tenantId,
        values: parsed.data,
        actorProfileId: auth.user.id,
      });
      if (res.ok) {
        created = { id: res.data.id, name, version: res.data.version };
        break;
      }
      if (isUniqueNameViolation(res.code, res.message) && attempt < 2) {
        continue;
      }
      return {
        ok: false,
        error: res.message ?? CLIENT_ERROR.update,
        code: res.code,
      };
    } catch (err) {
      logServerError("composition-actions/duplicate-section", err);
      return { ok: false, error: CLIENT_ERROR.update };
    }
  }
  if (!created) {
    return {
      ok: false,
      error: "Couldn't duplicate the section.",
      code: "CREATE_FAILED",
    };
  }

  // Splice the new section in immediately after the source, renumbering
  // any later siblings. The target slot by construction is where the
  // source lives, so allowedSectionTypes is already satisfied.
  const slotsCopy: Record<
    string,
    Array<{ sectionId: string; sortOrder: number }>
  > = Object.fromEntries(
    Object.entries(input.slots).map(([k, v]) => [
      k,
      v.map((e) => ({ ...e })),
    ]),
  );
  const targetList = (slotsCopy[sourceSlot] ??= []);
  const insertAt = sourceSortOrder + 1;
  for (const e of targetList) {
    if (e.sortOrder >= insertAt) e.sortOrder += 1;
  }
  targetList.push({ sectionId: created.id, sortOrder: insertAt });
  targetList.sort((a, b) => a.sortOrder - b.sortOrder);

  const saveRes = await saveHomepageCompositionAction({
    locale,
    pageId: input.pageId,
    expectedVersion: input.expectedVersion,
    metadata: input.metadata,
    slots: slotsCopy,
    builderTree: input.builderTree,
    editSession: input.editSession,
  });
  if (!saveRes.ok) {
    return {
      ok: false,
      error: saveRes.error,
      code: saveRes.code,
      currentVersion: saveRes.currentVersion,
    };
  }

  return {
    ok: true,
    section: {
      id: created.id,
      name: created.name,
      sectionTypeKey: typeKey,
      version: created.version,
      props: (source.props_jsonb ?? {}) as Record<string, unknown>,
    },
    pageVersion: saveRes.pageVersion,
  };
}

// ── save draft (named checkpoint) ─────────────────────────────────────────

export type SaveDraftResult =
  | { ok: true; pageVersion: number; savedAt: string }
  | { ok: false; error: string; code?: string; currentVersion?: number };

/**
 * Save the current draft composition as an explicit "Save draft" checkpoint.
 *
 * Phase 2 lightweight implementation: this is functionally a forced save
 * round-trip through the standard `saveHomepageDraftComposition` op — which
 * already inserts a `cms_page_revisions` row with `kind='draft'` on every
 * write. So pressing Save draft writes a fresh revision row + bumps the
 * page version + returns the server timestamp the UI uses for its
 * "Draft saved 12:34" confirmation chip.
 *
 * The deeper variant (named drafts with `name`/`note` columns and a
 * `tag enum (auto|draft|named|published)` discriminator) lands in Phase 4
 * alongside the full Revisions drawer. Until then, every press of Save
 * draft creates a `kind='draft'` row that the future named-draft UI can
 * filter / promote.
 */
export async function saveDraftHomepageAction(input: {
  locale: string;
  /** Non-null when editing a non-homepage page. */
  pageId?: string | null;
  expectedVersion: number;
  metadata: CompositionSaveInput["metadata"];
  slots: Record<string, Array<{ sectionId: string; sortOrder: number }>>;
  builderTree?: BuilderNodeTree;
  styleClasses?: BuilderStyleClassRegistry;
  /** WS1-D — per-tab edit-session token + monotonic draft seq (beacon LWW). */
  editSession?: { id: string; seq: number };
}): Promise<SaveDraftResult> {
  const save = await saveHomepageCompositionAction({
    locale: input.locale,
    pageId: input.pageId,
    expectedVersion: input.expectedVersion,
    metadata: input.metadata,
    slots: input.slots,
    builderTree: input.builderTree,
    styleClasses: input.styleClasses,
    editSession: input.editSession,
  });
  if (!save.ok) {
    return {
      ok: false,
      error: save.error,
      code: save.code,
      currentVersion: save.currentVersion,
    };
  }
  return {
    ok: true,
    pageVersion: save.pageVersion,
    savedAt: new Date().toISOString(),
  };
}

// ── WS1-D — pagehide draft beacon (last-write-wins) ─────────────────────────

/** Does a beacon payload (tree + slots) carry real content? */
function beaconPayloadHasContent(input: {
  builderTree?: BuilderNodeTree;
  slots: Record<string, Array<{ sectionId: string; sortOrder: number }>>;
}): boolean {
  if (Array.isArray(input.builderTree) && input.builderTree.length > 0) {
    return true;
  }
  return Object.values(input.slots).some(
    (entries) => Array.isArray(entries) && entries.length > 0,
  );
}

/**
 * WS1-D — apply a keepalive pagehide draft beacon under LAST-WRITE-WINS.
 *
 * The normal beacon (`saveDraftHomepageAction`) guards with a version CAS and
 * silently drops the operator's last edit when a concurrent save bumped the
 * version first. This path instead compares the beacon's per-tab edit-session
 * token + monotonic `draftSeq` against the stamp on the stored draft: same
 * session + strictly-newer seq → apply (bypassing the version CAS); a different
 * session, a stale seq, or an EMPTY tree over good content → refuse.
 *
 * HOMEPAGE only (pageId null) gets the LWW lane — that is the documented gap.
 * Non-homepage pages fall back to the existing CAS beacon (still stamping the
 * session columns), since their save path is the lighter page-row writer.
 */
export async function applyHomepageDraftBeaconAction(input: {
  locale: string;
  pageId?: string | null;
  expectedVersion: number;
  metadata: CompositionSaveInput["metadata"];
  slots: Record<string, Array<{ sectionId: string; sortOrder: number }>>;
  builderTree?: BuilderNodeTree;
  styleClasses?: BuilderStyleClassRegistry;
  stylePresets?: BuilderStylePresetRegistry;
  editSession: { id: string; seq: number };
}): Promise<SaveDraftResult> {
  // Non-homepage pages: keep the existing CAS beacon (session columns stamped).
  if (input.pageId) {
    return saveDraftHomepageAction(input);
  }

  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing the homepage.",
      code: "TENANT_SCOPE",
    };
  }
  const locale = asLocale(input.locale);
  if (!locale) {
    return { ok: false, error: `Unsupported locale "${input.locale}".` };
  }

  const metadataInput = {
    title: input.metadata.title,
    metaTitle: input.metadata.metaTitle ?? undefined,
    metaDescription: input.metadata.metaDescription ?? undefined,
    introTagline: input.metadata.introTagline ?? undefined,
    ogTitle: input.metadata.ogTitle ?? undefined,
    ogDescription: input.metadata.ogDescription ?? undefined,
    ogImageUrl: input.metadata.ogImageUrl ?? undefined,
    canonicalUrl: input.metadata.canonicalUrl ?? undefined,
    noindex: input.metadata.noindex,
  };
  const metadataParsed = homepageMetadataSchema.safeParse(metadataInput);
  if (!metadataParsed.success) {
    return {
      ok: false,
      error:
        metadataParsed.error.issues[0]?.message ??
        "Page metadata is missing or invalid.",
    };
  }
  const slotsParsed = homepageSlotsSchema.safeParse(input.slots);
  if (!slotsParsed.success) {
    return {
      ok: false,
      error: slotsParsed.error.issues[0]?.message ?? "Invalid slot layout.",
    };
  }
  // Draft-save normalization gate — same content-preserving canonicalizer the
  // normal save runs; the beacon lane must not be a bypass around it.
  const normalizedBuilderTree = input.builderTree
    ? normalizeBuilderTreeLayout(input.builderTree)
    : input.builderTree;
  const envelope = homepageSaveDraftSchema.safeParse({
    tenantId: scope.tenantId,
    locale,
    // expectedVersion is unused by the LWW lane (it ignores the version CAS),
    // but the schema requires a non-negative int — pass the beacon's value.
    expectedVersion: input.expectedVersion,
    metadata: metadataParsed.data satisfies HomepageMetadataValues,
    slots: slotsParsed.data satisfies HomepageSlotsValues,
    builderTree: normalizedBuilderTree,
  });
  if (!envelope.success) {
    return { ok: false, error: "Composition envelope failed validation." };
  }

  try {
    const result = await applyHomepageDraftBeacon(auth.supabase, {
      tenantId: scope.tenantId,
      values: envelope.data,
      styleClasses: input.styleClasses,
      stylePresets: input.stylePresets,
      actorProfileId: auth.user.id,
      editSession: input.editSession,
      incomingHasContent: beaconPayloadHasContent({
        builderTree: input.builderTree,
        slots: input.slots,
      }),
    });
    if (!result.ok) {
      return { ok: false, error: result.error, code: result.code };
    }
    if (!result.applied) {
      // Refused under LWW (stale / mismatched session / empty-over-good). This
      // is a benign no-op: the operator's in-session draft already persisted on
      // the previous keystroke's debounce. Report a non-conflict ok so the route
      // returns 200 (the beacon is best-effort; nothing to retry).
      return {
        ok: true,
        pageVersion: input.expectedVersion,
        savedAt: new Date().toISOString(),
      };
    }
    return {
      ok: true,
      pageVersion: result.pageVersion,
      savedAt: new Date().toISOString(),
    };
  } catch (err) {
    logServerError("edit-mode/composition/beacon-lww", err);
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ── publish ───────────────────────────────────────────────────────────────

export type PublishResult =
  | {
      ok: true;
      pageVersion: number;
      publishedAt: string;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      currentVersion?: number;
    };

/**
 * Edit-chrome publish action. Thin typed wrapper over the lib-layer
 * `publishHomepage` op — runs identical capability / CAS / required-slot /
 * draft-ref / media-live gates. Returns a tagged union the canvas drawer
 * can render directly (no FormData round-trip).
 */
export async function publishHomepageFromEditModeAction(input: {
  locale: string;
  /** When non-null the editor is on a non-homepage page and this publish
   *  should target that page rather than the homepage. */
  pageId?: string | null;
  expectedVersion: number;
  /**
   * Marathon W1-T2 — the operator's page-scoped linked-style-class registry
   * (id → class), read from localStorage on the client. Plain JSON so it
   * crosses the server-action boundary. `publishHomepage` bakes it into the
   * published snapshot so linked blocks reach the live site. Omitted → the
   * publish strips classRefs to a clean tree (pre-W1 fallback).
   */
  styleClasses?: BuilderStyleClassRegistry;
  /** STYLE-1 — site-scoped style presets + clipboard baked into the published
   *  snapshot alongside styleClasses. */
  stylePresets?: BuilderStylePresetRegistry;
  /** W1-L2 — per-tab edit-session token + monotonic draft seq. Lets the
   *  publish be adopted at the current version when the operator's own
   *  pagehide beacon bumped it (see publishHomepage). */
  editSession?: { id: string; seq: number };
}): Promise<PublishResult> {
  const auth = await requireSession();
  if (!auth.ok) {
    return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  }
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Tenant scope required",
      code: "TENANT_SCOPE",
    };
  }
  if (!isLocale(input.locale)) {
    return { ok: false, error: "Invalid locale", code: "VALIDATION_FAILED" };
  }

  // ── non-homepage publish ───────────────────────────────────────────────
  // Delegates to the page-composer publishPageSnapshot op, which bakes the
  // current draft slots into `published_page_snapshot` and busts the cache.
  if (input.pageId) {
    const res = await publishPageSnapshot({
      pageId: input.pageId,
      expectedVersion: input.expectedVersion,
    });
    if (!res.ok) {
      return { ok: false, error: res.error, code: "PUBLISH_FAILED" };
    }
    return {
      ok: true,
      pageVersion: res.pageVersion,
      publishedAt: res.publishedAt,
    };
  }

  try {
    // Workflow step — auto-publish referenced draft sections.
    //
    // The lib-layer `publishHomepage` op requires every referenced section to
    // already be `status='published'`. For the admin composer that's fine —
    // the composer has a separate "publish section" affordance. In-place edit
    // mode has no such affordance: the operator edits a section inline and
    // expects Publish on the page to mean "ship my edits live." Treating
    // section draft vs. published as an operator concern leaks CMS mechanics
    // through the UI and strands the user on "publish the section first" with
    // nowhere to click.
    //
    // So the page-level publish now resolves that dependency itself: query
    // the page's is_draft=TRUE composition rows, join to cms_sections to
    // find which are still status='draft', and call publishSection on each.
    // Each call is a CAS write on cms_sections.version; if one fails mid-
    // loop, earlier sections stay published (acceptable — they were already
    // the operator's intent). The homepage publish gate re-runs on the
    // updated rows and either proceeds or surfaces the first blocker.
    const { data: pageRow } = await auth.supabase
      .from("cms_pages")
      .select("id")
      .eq("tenant_id", scope.tenantId)
      .eq("locale", input.locale)
      .eq("is_system_owned", true)
      .eq("system_template_key", "homepage")
      .maybeSingle<{ id: string }>();
    if (pageRow) {
      const { data: draftRefs } = await auth.supabase
        .from("cms_page_sections")
        .select("section_id")
        .eq("tenant_id", scope.tenantId)
        .eq("page_id", pageRow.id)
        .eq("is_draft", true);
      const sectionIds = (draftRefs ?? []).map((r) => r.section_id as string);
      if (sectionIds.length > 0) {
        const { data: sectionRows } = await auth.supabase
          .from("cms_sections")
          .select("id, name, status, version")
          .eq("tenant_id", scope.tenantId)
          .in("id", sectionIds);
        const draftSections = (sectionRows ?? []).filter(
          (s) => (s as { status: string }).status === "draft",
        ) as Array<{ id: string; name: string; status: string; version: number }>;
        for (const section of draftSections) {
          const pub = await publishSection(auth.supabase, {
            tenantId: scope.tenantId,
            values: {
              id: section.id,
              tenantId: scope.tenantId,
              expectedVersion: section.version,
            },
            actorProfileId: auth.user.id,
          });
          if (!pub.ok) {
            return {
              ok: false,
              error: `Couldn't auto-publish section "${section.name}": ${pub.message ?? "unknown error"}`,
              code: pub.code,
            };
          }
        }
      }
    }

    const result = await publishHomepage(auth.supabase, {
      tenantId: scope.tenantId,
      values: {
        tenantId: scope.tenantId,
        locale: input.locale,
        expectedVersion: input.expectedVersion,
      },
      actorProfileId: auth.user.id,
      // W1-T2 — bake the operator's linked style classes into the snapshot.
      styleClasses: input.styleClasses,
      // STYLE-1 — bake presets alongside classes so they survive publish.
      stylePresets: input.stylePresets,
      // W1-L2 — same-session adoption when the operator's own beacon bump made
      // the expectedVersion stale (see publishHomepage).
      editSession: input.editSession,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Someone else edited the homepage — reload and try again.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      // Activity Log: only the "not ready" class of refusal, which is literally
      // "I clicked Publish and my site did not go live" (empty required slot,
      // referenced section still draft, schema failure, deleted OG image).
      // VERSION_CONFLICT is excluded by the early return above on purpose: it
      // fires during normal two-tab editing and would swamp the log.
      if (result.code === "PUBLISH_NOT_READY") {
        auditFailure(
          scope.tenantId,
          "pages",
          "pages.publish.not_ready",
          "Homepage publish was blocked because something is not ready",
          { reason: (result.message ?? CLIENT_ERROR.update).slice(0, 200) },
        );
      }
      return {
        ok: false,
        error: result.message ?? CLIENT_ERROR.update,
        code: result.code,
      };
    }

    // ── Phase B.2.B — site shell republish step ──────────────────────────
    // Single Publish click promotes BOTH the homepage AND the shell snapshot
    // when the tenant has a shell row. Operator never has to know the shell
    // is a separate row. If no shell row exists, this is a no-op.
    //
    // Auto-publish any draft shell sections first (mirrors the homepage
    // auto-publish loop above) so a tenant that's edited the header inline
    // doesn't get stranded on "publish your draft section first" errors.
    const { data: shellRow } = await auth.supabase
      .from("cms_pages")
      .select("id")
      .eq("tenant_id", scope.tenantId)
      .eq("locale", input.locale)
      .eq("system_template_key", "site_shell")
      .neq("status", "archived")
      .maybeSingle<{ id: string }>();
    if (shellRow) {
      const { data: shellDraftRefs } = await auth.supabase
        .from("cms_page_sections")
        .select("section_id")
        .eq("tenant_id", scope.tenantId)
        .eq("page_id", shellRow.id)
        .eq("is_draft", true);
      const shellSectionIds = (shellDraftRefs ?? []).map(
        (r) => r.section_id as string,
      );
      if (shellSectionIds.length > 0) {
        const { data: shellSectionRows } = await auth.supabase
          .from("cms_sections")
          .select("id, name, status, version")
          .eq("tenant_id", scope.tenantId)
          .in("id", shellSectionIds);
        const draftShellSections = (shellSectionRows ?? []).filter(
          (s) => (s as { status: string }).status === "draft",
        ) as Array<{
          id: string;
          name: string;
          status: string;
          version: number;
        }>;
        for (const section of draftShellSections) {
          const pub = await publishSection(auth.supabase, {
            tenantId: scope.tenantId,
            values: {
              id: section.id,
              tenantId: scope.tenantId,
              expectedVersion: section.version,
            },
            actorProfileId: auth.user.id,
          });
          if (!pub.ok) {
            return {
              ok: false,
              error: `Couldn't auto-publish shell section "${section.name}": ${pub.message ?? "unknown error"}`,
              code: pub.code,
            };
          }
        }
      }
      const shellRes = await republishSiteShellSnapshot(auth.supabase, {
        tenantId: scope.tenantId,
        locale: input.locale,
        actorProfileId: auth.user.id,
      });
      if (!shellRes.ok) {
        // Homepage already published; shell-republish failure is degraded
        // success. Surface as a soft warning to the caller — but the
        // homepage edit went live. Operator can retry shell publish later.
        return {
          ok: false,
          error: `Homepage published, but the site shell republish failed: ${shellRes.error}`,
          code: "PARTIAL_PUBLISH",
        };
      }
      // Bust the public reader's cache tag so the new shell snapshot
      // shows up immediately on the storefront.
      try {
        revalidateTag(tagFor(scope.tenantId, "pages-all"), "default");
        // Shell snapshot is embedded on every tenant route — bust storefront reads.
        revalidateTag(tagFor(scope.tenantId, "storefront"), "default");
      } catch {
        // tag system not initialised in test contexts; safe to ignore.
      }
    }

    return {
      ok: true,
      pageVersion: result.data.version,
      publishedAt: result.data.publishedAt,
    };
  } catch (error) {
    logServerError("edit-mode/publish-homepage", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ── copy from live ──────────────────────────────────────────────────────────

export type CopyPublishedResult =
  | { ok: true; pageVersion: number }
  | { ok: false; error: string; code?: string };

/**
 * Edit-chrome "Copy from live" action. Thin typed wrapper over the lib-layer
 * `copyPublishedToDraft` op — overwrites the homepage editor DRAFT with the
 * currently-PUBLISHED snapshot so a diverged draft can reset to the live site.
 *
 * DRAFT-ONLY: gates on the DRAFT capability (`agency.site_admin.homepage.compose`,
 * enforced inside the lib op), never publishes, never touches published_at /
 * published_homepage_snapshot, never busts the public cache. Mirrors
 * `publishHomepageFromEditModeAction`'s requireSession + requireEditSurfaceTenantScope +
 * locale gating, but routes through the draft-reset op instead of publish.
 */
export async function copyPublishedHomepageAction(input: {
  locale: string;
  /**
   * Pull-from-live merge mode. Omitted → `"replace"` (back-compat: the
   * publish-drawer "Copy from live" caller passes no mode and still overwrites
   * the draft). `"above"` / `"below"` splice the live sections onto the draft.
   */
  mode?: PullFromLiveMode;
}): Promise<CopyPublishedResult> {
  const auth = await requireSession();
  if (!auth.ok) {
    return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  }
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Tenant scope required",
      code: "TENANT_SCOPE",
    };
  }
  if (!isLocale(input.locale)) {
    return { ok: false, error: "Invalid locale", code: "VALIDATION_FAILED" };
  }
  const mode: PullFromLiveMode = input.mode ?? "replace";
  if (mode !== "replace" && mode !== "above" && mode !== "below") {
    return { ok: false, error: "Invalid mode", code: "VALIDATION_FAILED" };
  }

  try {
    const result = await copyPublishedToDraft(auth.supabase, {
      tenantId: scope.tenantId,
      locale: input.locale,
      actorProfileId: auth.user.id,
      mode,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.message ?? CLIENT_ERROR.update,
        code: result.code,
      };
    }
    return { ok: true, pageVersion: result.data.version };
  } catch (error) {
    logServerError("edit-mode/copy-published-homepage", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
}
