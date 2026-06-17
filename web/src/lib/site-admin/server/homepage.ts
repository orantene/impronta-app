/**
 * Phase 5 / M5 — homepage composer server operations.
 *
 * Consumed by the `/admin/site-settings/structure` Server Actions. All writes
 * go through this module so CAS / audit / revision / cache-bust / publish
 * discipline stays uniform with M3 (pages) and M4 (sections).
 *
 * Four lifecycles:
 *   - ENSURE        — `ensureHomepageRow` (idempotent; platform-seed or just-
 *                     load; never mutates template_key / system_template_key
 *                     on an existing row)
 *   - SAVE DRAFT    — `saveHomepageDraftComposition`
 *                     (CAS; page-field upsert + draft-slot replace in one
 *                     transaction; revision kind='draft')
 *   - PUBLISH       — `publishHomepage`
 *                     (CAS; publish-ready gates; draft → live slot copy;
 *                     snapshot write; cache bust; revision kind='published')
 *   - ROLLBACK      — `restoreHomepageRevision`
 *                     (loads snapshot, writes new draft composition, kind=
 *                     'rollback'; NO publish — same as M3/M4 rollback)
 *
 * Capability gates:
 *   - ensure / save draft / restore → agency.site_admin.homepage.compose
 *   - publish                       → agency.site_admin.homepage.publish
 *
 * Publish discipline (carry-forward rule from M4 approval):
 *   Draft section edits MUST NOT change the live homepage. Published homepage
 *   remains stable until either
 *     (a) the operator runs `publishHomepage`, or
 *     (b) a referenced section is re-published *and* the homepage publish is
 *         re-run.
 *   Implementation:
 *     - Public reads prefer `cms_pages.published_homepage_snapshot`, which
 *       carries a frozen copy of each referenced section's props + schema_
 *       version taken at publish time. A subsequent section edit (even if it
 *       re-publishes the section) does NOT touch this snapshot — the storefront
 *       keeps serving the snapshot until the operator re-publishes the
 *       homepage.
 *     - The `is_draft=FALSE` rows in `cms_page_sections` stay in sync with the
 *       snapshot for audit / fallback only.
 *
 * System-ownership discipline:
 *   - The homepage row is seeded via `ensureHomepageRow` with
 *     is_system_owned=TRUE and system_template_key='homepage'.
 *   - The DB trigger `cms_pages_system_ownership_guard` blocks DELETE on this
 *     row and blocks mutating slug/locale/template_key/is_system_owned/
 *     system_template_key. We never attempt those mutations; if the trigger
 *     raises we surface SYSTEM_PAGE_IMMUTABLE.
 *
 * Slot discipline:
 *   - Allowed slot keys come from `homepageTemplate.meta.slots`. The save path
 *     rejects unknown slot keys (Zod) + rejects wrong section type for a slot
 *     (server op, because Zod only sees ids).
 *   - Required slots must be non-empty at publish time. Draft saves may leave
 *     them empty.
 */

import { improntaLog } from "@/lib/server/structured-log";
import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";

import {
  scheduleAuditEvent,
  fail,
  ok,
  requirePhase5Capability,
  tagFor,
  versionConflict,
  type Phase5Result,
} from "@/lib/site-admin";
import { homepageTemplate } from "@/lib/site-admin/templates/registry";
import type { Locale } from "@/lib/site-admin/locales";
import type {
  HomepagePublishValues,
  HomepageRestoreRevisionValues,
  HomepageSaveDraftValues,
} from "@/lib/site-admin/forms/homepage";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import type { LegacySnapshotSlot } from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import {
  resolveSnapshotBuilderTree,
  resolveSnapshotBuilderTreeForPublish,
  summarizeBuilderTreeIssues,
} from "@/lib/site-admin/builder-node/snapshot-tree";
import {
  resolveBuilderTreeClassRefs,
  type BuilderStyleClassRegistry,
  type BuilderStylePresetRegistry,
} from "@/lib/site-admin/builder-node/style-classes";

import { enforceFreePlanNestedBuilderDraftGuard } from "./free-plan-draft-save-guard";
import type { PageRow } from "./pages";
import { recoverBuilderTreeIfEmpty } from "./recover-builder-tree";
import { decideBeaconLastWriteWins } from "./beacon-last-write-wins";

// ---- row shapes -----------------------------------------------------------

export interface HomepagePageSectionRow {
  id: string;
  tenant_id: string;
  page_id: string;
  section_id: string;
  slot_key: string;
  sort_order: number;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
}

/** Compact section facts the composer needs at save/publish time. */
interface SectionFacts {
  id: string;
  tenant_id: string;
  section_type_key: string;
  name: string;
  status: "draft" | "published" | "archived";
  schema_version: number;
  props_jsonb: Record<string, unknown>;
  version: number;
}

/** Snapshot of one section baked into `published_homepage_snapshot`. */
export interface HomepageSnapshotSection {
  slotKey: string;
  sortOrder: number;
  sectionId: string;
  sectionTypeKey: string;
  schemaVersion: number;
  name: string;
  props: Record<string, unknown>;
}

export interface HomepageSnapshot {
  version: 1;
  publishedAt: string;
  pageVersion: number;
  locale: Locale;
  fields: {
    title: string;
    metaDescription: string | null;
    introTagline: string | null;
  };
  templateSchemaVersion: number;
  slots: HomepageSnapshotSection[];
  /**
   * Phase 4 foundation: optional typed node tree for componentized rendering.
   * Legacy section-slot snapshots omit this field.
   */
  builderTree?: BuilderNodeTree | null;
}

const PAGE_COLUMNS = `
  id,
  tenant_id,
  locale,
  slug,
  template_key,
  system_template_key,
  is_system_owned,
  template_schema_version,
  title,
  status,
  body,
  hero,
  meta_title,
  meta_description,
  og_title,
  og_description,
  og_image_url,
  og_image_media_asset_id,
  noindex,
  include_in_sitemap,
  canonical_url,
  published_at,
  published_homepage_snapshot,
  version,
  created_by,
  updated_by,
  created_at,
  updated_at
`;

const PAGE_SECTION_COLUMNS = `
  id,
  tenant_id,
  page_id,
  section_id,
  slot_key,
  sort_order,
  is_draft,
  created_at,
  updated_at
`;

const SECTION_FACTS_COLUMNS = `
  id,
  tenant_id,
  section_type_key,
  name,
  status,
  schema_version,
  props_jsonb,
  version
`;

const REVISION_COLUMNS = `
  id,
  tenant_id,
  page_id,
  kind,
  version,
  template_schema_version,
  snapshot,
  created_by,
  created_at
`;

// ---- helpers --------------------------------------------------------------

function mapTriggerError(error: PostgrestError): Phase5Result<never> {
  const msg = error.message ?? "";
  if (msg.includes("SYSTEM_PAGE_IMMUTABLE")) {
    return fail("SYSTEM_PAGE_IMMUTABLE", msg);
  }
  if (msg.includes("RESERVED_SLUG")) {
    return fail("RESERVED_SLUG", msg);
  }
  if (msg.includes("MEDIA_REF_BROKEN")) {
    return fail("MEDIA_REF_BROKEN", msg);
  }
  return fail("FORBIDDEN", msg);
}

function bustHomepageTags(tenantId: string, pageId: string, locale: Locale): void {
  // T2-6 — Next.js 16 made revalidateTag's second arg required (cache
  // profile). "default" matches the rest of the codebase (composition-
  // actions, page-composer-action, site-shell-backfill-action all use
  // it); switching to "max" would change semantics and split the
  // convention.
  revalidateTag(tagFor(tenantId, "homepage", { locale }), "default");
  revalidateTag(tagFor(tenantId, "pages", { id: pageId }), "default");
  revalidateTag(tagFor(tenantId, "pages-all"), "default");
}

async function insertHomepageRevision(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    pageId: string;
    kind: "draft" | "published" | "rollback";
    version: number;
    templateSchemaVersion: number;
    snapshot: Record<string, unknown>;
    actorProfileId: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("cms_page_revisions").insert({
    tenant_id: params.tenantId,
    page_id: params.pageId,
    kind: params.kind,
    version: params.version,
    template_schema_version: params.templateSchemaVersion,
    snapshot: params.snapshot,
    created_by: params.actorProfileId,
  });
  if (error) {
    void improntaLog("site_admin_homepage.warn", {
      message: "[site-admin/homepage] revision insert failed",
      tenantId: params.tenantId,
      pageId: params.pageId,
      kind: params.kind,
      version: params.version,
      error: error.message,
    });
  }
}

/**
 * Build the JSONB stored in `cms_page_revisions.snapshot` for homepage
 * revisions. Carries page-field state + the draft-or-live composition (with
 * referenced section props frozen at call time) so a rollback can fully
 * rehydrate the draft composer.
 */
function buildRevisionSnapshot(args: {
  page: PageRow;
  composition: HomepageSnapshotSection[];
  builderTree?: BuilderNodeTree | null;
  styleClasses?: BuilderStyleClassRegistry | null;
  /** STYLE-1 — site-scoped style presets + clipboard, stored alongside classes. */
  stylePresets?: BuilderStylePresetRegistry | null;
  kind: "draft" | "published" | "rollback";
}): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    kind: args.kind,
    page: {
      locale: args.page.locale,
      slug: args.page.slug,
      template_key: args.page.template_key,
      system_template_key: args.page.system_template_key,
      is_system_owned: args.page.is_system_owned,
      template_schema_version: args.page.template_schema_version,
      title: args.page.title,
      status: args.page.status,
      meta_title: args.page.meta_title,
      meta_description: args.page.meta_description,
      body: args.page.body,
      hero: args.page.hero,
      og_title: args.page.og_title,
      og_description: args.page.og_description,
      og_image_media_asset_id: args.page.og_image_media_asset_id,
      noindex: args.page.noindex,
      include_in_sitemap: args.page.include_in_sitemap,
      canonical_url: args.page.canonical_url,
      version: args.page.version,
      published_at: args.page.published_at,
    },
    composition: args.composition,
  };
  if (args.builderTree && args.builderTree.length > 0) {
    snapshot.builderTree = args.builderTree;
  }
  if (args.styleClasses && Object.keys(args.styleClasses).length > 0) {
    snapshot.styleClasses = args.styleClasses;
  }
  if (
    args.stylePresets &&
    (args.stylePresets.presets.length > 0 || args.stylePresets.clipboard)
  ) {
    snapshot.stylePresets = args.stylePresets;
  }
  return snapshot;
}

async function loadSectionFactsBulk(
  supabase: SupabaseClient,
  tenantId: string,
  sectionIds: readonly string[],
): Promise<Map<string, SectionFacts>> {
  if (sectionIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("cms_sections")
    .select(SECTION_FACTS_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("id", Array.from(new Set(sectionIds)));
  if (error) {
    void improntaLog("site_admin_homepage.warn", {
      message: "[site-admin/homepage] section facts load failed",
      tenantId,
      count: sectionIds.length,
      error: error.message,
    });
    return new Map();
  }
  const rows = (data ?? []) as SectionFacts[];
  return new Map(rows.map((r) => [r.id, r] as const));
}

/**
 * Project a (slot, entries) pair into snapshot entries using freshly-loaded
 * section facts. Assumes the caller has already validated every entry's
 * section id resolves in `factsById`. Returns entries sorted by (slotKey,
 * sortOrder) so the storefront can render them in order.
 */
function buildSnapshotSlots(
  // `Partial<Record<...>>` matches the Zod slots shape — absent slot keys
  // are allowed (== empty list per the form's "absent slot === empty" rule).
  slots: Partial<
    Record<string, Array<{ sectionId: string; sortOrder: number }>>
  >,
  factsById: Map<string, SectionFacts>,
): HomepageSnapshotSection[] {
  const out: HomepageSnapshotSection[] = [];
  for (const [slotKey, entries] of Object.entries(slots)) {
    if (!entries) continue;
    for (const entry of entries) {
      const facts = factsById.get(entry.sectionId);
      if (!facts) continue;
      out.push({
        slotKey,
        sortOrder: entry.sortOrder,
        sectionId: facts.id,
        sectionTypeKey: facts.section_type_key,
        schemaVersion: facts.schema_version,
        name: facts.name,
        props: facts.props_jsonb,
      });
    }
  }
  out.sort((a, b) => {
    if (a.slotKey < b.slotKey) return -1;
    if (a.slotKey > b.slotKey) return 1;
    return a.sortOrder - b.sortOrder;
  });
  return out;
}

function toLegacySnapshotSlots(
  composition: ReadonlyArray<HomepageSnapshotSection>,
): LegacySnapshotSlot[] {
  return composition.map((entry) => ({
    slotKey: entry.slotKey,
    sortOrder: entry.sortOrder,
    sectionId: entry.sectionId,
    sectionTypeKey: entry.sectionTypeKey,
    name: entry.name,
    props: entry.props,
  }));
}

function resolveBuilderTreeForComposition(input: {
  composition: ReadonlyArray<HomepageSnapshotSection>;
  preferredBuilderTree?: unknown;
}): BuilderNodeTree {
  const resolved = resolveSnapshotBuilderTree({
    slots: toLegacySnapshotSlots(input.composition),
    builderTree: input.preferredBuilderTree,
  });
  return resolved.tree;
}

// ---- ensureHomepageRow ---------------------------------------------------

/**
 * Return (creating on first call) the `cms_pages` row that represents the
 * homepage for `(tenantId, locale)`. Idempotent — repeat calls return the same
 * row. Emits a single 'agency.site_admin.homepage.compose' audit event on the
 * create path.
 *
 * Writes:
 *   - is_system_owned = TRUE
 *   - system_template_key = 'homepage'
 *   - template_key = 'homepage'
 *   - slug = ''                 (homepage lives at the locale root)
 *   - status = 'draft'
 *   - version = 1
 *   - template_schema_version = homepageTemplate.currentVersion
 *   - title = '{tenant} homepage' (placeholder; editable)
 *
 * The unique partial index
 *   cms_pages_system_lookup_idx (tenant_id, locale, system_template_key)
 * guarantees there's only one homepage per (tenant, locale).
 */
export async function ensureHomepageRow(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    locale: Locale;
    actorProfileId?: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<PageRow>> {
  const { tenantId, locale } = params;
  const actorProfileId = params.actorProfileId ?? null;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.homepage.compose", tenantId);

  // Try to load first — idempotent.
  const { data: existing, error: loadErr } = await supabase
    .from("cms_pages")
    .select(PAGE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle<PageRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (existing) return ok(existing);

  // Create.
  const { data: created, error: insErr } = await supabase
    .from("cms_pages")
    .insert({
      tenant_id: tenantId,
      locale,
      slug: "",
      template_key: "homepage",
      system_template_key: "homepage",
      is_system_owned: true,
      template_schema_version: homepageTemplate.currentVersion,
      title: "Homepage",
      status: "draft",
      body: "",
      hero: {},
      meta_title: null,
      meta_description: null,
      og_title: null,
      og_description: null,
      og_image_media_asset_id: null,
      noindex: false,
      include_in_sitemap: true,
      canonical_url: null,
      version: 1,
      created_by: actorProfileId,
      updated_by: actorProfileId,
    })
    .select(PAGE_COLUMNS)
    .single<PageRow>();
  if (insErr || !created) {
    if (insErr) return mapTriggerError(insErr);
    return fail("FORBIDDEN", "Homepage insert failed");
  }

  await insertHomepageRevision(supabase, {
    tenantId,
    pageId: created.id,
    kind: "draft",
    version: created.version,
    templateSchemaVersion: created.template_schema_version,
    snapshot: buildRevisionSnapshot({
      page: created,
      composition: [],
      kind: "draft",
    }),
    actorProfileId,
  });

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.homepage.compose",
    entityType: "cms_pages",
    entityId: created.id,
    diffSummary: `homepage seeded (${locale})`,
    beforeSnapshot: null,
    afterSnapshot: created,
    correlationId,
  });

  return ok(created);
}

// ---- loadHomepageForStaff -------------------------------------------------

export interface HomepageEditorState {
  page: PageRow;
  /**
   * Draft composition (is_draft = TRUE rows). When the operator has never
   * saved a draft, this is empty and the composer falls back to showing the
   * live composition as the starting point.
   */
  draftSlots: HomepagePageSectionRow[];
  /** Live composition (is_draft = FALSE rows). */
  liveSlots: HomepagePageSectionRow[];
}

/**
 * Uncached admin read — loads the homepage row + draft + live slot rows for
 * the composer. Callers must already have verified `homepage.compose` is
 * granted; this function does not re-check (mirrors pages-reads).
 */
export async function loadHomepageForStaff(
  supabase: SupabaseClient,
  tenantId: string,
  locale: Locale,
): Promise<HomepageEditorState | null> {
  const { data: page, error: pageErr } = await supabase
    .from("cms_pages")
    .select(PAGE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle<PageRow>();
  if (pageErr) {
    void improntaLog("site_admin_homepage.warn", {
      message: "[site-admin/homepage] staff page load failed",
      tenantId,
      locale,
      error: pageErr.message,
    });
    return null;
  }
  if (!page) return null;

  const { data: slotRows, error: slotErr } = await supabase
    .from("cms_page_sections")
    .select(PAGE_SECTION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("page_id", page.id)
    .order("slot_key", { ascending: true })
    .order("sort_order", { ascending: true });
  if (slotErr) {
    void improntaLog("site_admin_homepage.warn", {
      message: "[site-admin/homepage] staff slots load failed",
      tenantId,
      pageId: page.id,
      error: slotErr.message,
    });
    return { page, draftSlots: [], liveSlots: [] };
  }
  const rows = (slotRows ?? []) as HomepagePageSectionRow[];
  return {
    page,
    draftSlots: rows.filter((r) => r.is_draft === true),
    liveSlots: rows.filter((r) => r.is_draft === false),
  };
}

// ---- saveHomepageDraftComposition ----------------------------------------

/**
 * Save the draft composition + draft page fields in one pass. CAS on the
 * cms_pages.version. Does NOT bust public cache — only `publishHomepage` does.
 *
 * Gates:
 *   1. capability: homepage.compose
 *   2. tenantId matches values.tenantId
 *   3. CAS on cms_pages.version
 *   4. every referenced section exists on this tenant
 *   5. referenced sections are not status='archived' (archived = author
 *      decided to hide; composer refuses until un-archived)
 *   6. allowedSectionTypes per slot is honoured (template meta)
 *
 * Side effects (only on success):
 *   - DELETE all cms_page_sections rows for this page WHERE is_draft=TRUE
 *   - INSERT fresh is_draft=TRUE rows from `values.slots`
 *   - UPDATE cms_pages page-field columns + bump version
 *   - INSERT cms_page_revisions row kind='draft'
 *   - emit agency.site_admin.homepage.compose audit event
 */
export async function saveHomepageDraftComposition(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: HomepageSaveDraftValues;
    /** Page-scoped linked style classes (editor localStorage mirror). */
    styleClasses?: BuilderStyleClassRegistry;
    /** STYLE-1 — site-scoped style presets + clipboard, persisted in the draft
     *  revision snapshot alongside styleClasses. */
    stylePresets?: BuilderStylePresetRegistry;
    actorProfileId: string | null;
    correlationId?: string;
    /**
     * Opt-in: this save is seeding a **curated first-party page design** (one of
     * the productised starter layouts), not the operator hand-building advanced
     * nested composition. Skips the Free-plan nested-builder draft guard for the
     * seed only — the on-ramp is free (same as the curated section recipes), while
     * subsequent inserts/expansion of the tree stay gated normally. Reachable ONLY
     * from `applyPageDesignToHomepage`, which validates the design against the
     * fixed `getPageDesign` registry, so no user-supplied tree can use this.
     */
    seedCuratedDesign?: boolean;
    /**
     * WS1-D — the writer's per-tab edit-session token + monotonic draft sequence.
     * Stamped onto the `cms_pages` row so the pagehide beacon can be granted a
     * last-write-wins lane WITHIN this operator's own session. Optional: legacy
     * callers (composer, older shells) omit it and the columns stay NULL.
     */
    editSession?: { id: string; seq: number };
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const seedCuratedDesign = params.seedCuratedDesign ?? false;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.homepage.compose", tenantId);

  if (values.tenantId !== tenantId) {
    return fail("FORBIDDEN", "tenantId mismatch");
  }

  // --- gate 3: load homepage row + CAS ---
  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_pages")
    .select(PAGE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("locale", values.locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle<PageRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) {
    return fail(
      "NOT_FOUND",
      `Homepage row not found for locale ${values.locale}. Call ensureHomepageRow first.`,
    );
  }

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // --- gates 4+5+6: resolve sections + enforce tenant + slot rules ---
  const allSectionIds: string[] = [];
  for (const entries of Object.values(values.slots)) {
    if (!entries) continue;
    for (const e of entries) allSectionIds.push(e.sectionId);
  }
  const factsById = await loadSectionFactsBulk(
    supabase,
    tenantId,
    allSectionIds,
  );
  for (const id of allSectionIds) {
    const facts = factsById.get(id);
    if (!facts) {
      return fail(
        "VALIDATION_FAILED",
        `Referenced section ${id} not found on this tenant.`,
      );
    }
    if (facts.status === "archived") {
      return fail(
        "VALIDATION_FAILED",
        `Section "${facts.name}" is archived and cannot be placed on the homepage. Un-archive or pick another section.`,
      );
    }
  }

  const slotMetaByKey = new Map(
    homepageTemplate.meta.slots.map((s) => [s.key, s] as const),
  );
  for (const [slotKey, entries] of Object.entries(values.slots)) {
    if (!entries) continue;
    const slotMeta = slotMetaByKey.get(slotKey);
    if (!slotMeta) {
      return fail(
        "VALIDATION_FAILED",
        `Unknown slot "${slotKey}". Slot keys must match the homepage template.`,
      );
    }
    if (slotMeta.allowedSectionTypes) {
      const allowed = new Set(slotMeta.allowedSectionTypes);
      for (const e of entries) {
        const facts = factsById.get(e.sectionId);
        if (!facts) continue; // already reported above
        if (!allowed.has(facts.section_type_key)) {
          return fail(
            "VALIDATION_FAILED",
            `Slot "${slotKey}" only accepts section types: ${Array.from(allowed).join(", ")}. "${facts.name}" is ${facts.section_type_key}.`,
          );
        }
      }
    }
  }

  const compositionSnapshot = buildSnapshotSlots(values.slots, factsById);

  // Curated first-party design seeds (the productised starter layouts) are the
  // free on-ramp — exempt from the Free-plan nested-builder draft guard, exactly
  // as the curated section recipes are. Everything else still runs the guard so
  // hand-building/expanding advanced nested composition stays a paid capability.
  if (!seedCuratedDesign) {
    const draftGuard = await enforceFreePlanNestedBuilderDraftGuard({
      supabase,
      tenantId,
      pageId: beforeRow.id,
      pageVersion: beforeRow.version,
      logTag: "homepage-draft-save-builder-plan",
      baselineLegacyTree: resolveBuilderTreeForComposition({
        composition: compositionSnapshot,
        preferredBuilderTree: undefined,
      }),
      nextTree: resolveBuilderTreeForComposition({
        composition: compositionSnapshot,
        preferredBuilderTree: values.builderTree,
      }),
    });
    if (!draftGuard.ok) {
      return fail("VALIDATION_FAILED", draftGuard.message);
    }
  }

  // --- apply: bump version, update page fields ---
  const nextVersion = beforeRow.version + 1;
  const { data: updatedPage, error: updErr } = await supabase
    .from("cms_pages")
    .update({
      title: values.metadata.title,
      meta_title: values.metadata.metaTitle ?? null,
      meta_description: values.metadata.metaDescription ?? null,
      // introTagline lives in `hero.introTagline` on the homepage row so the
      // existing hero JSON column stays the single source for hero-area text.
      // We preserve the rest of hero to avoid trampling anything the operator
      // set up via other routes.
      hero: {
        ...(beforeRow.hero ?? {}),
        introTagline: values.metadata.introTagline ?? null,
      },
      // SEO/OG projection from values.metadata. Mirrors the cms_pages columns
      // one-to-one; empty strings have already been normalised to undefined
      // by the form schema, which we coerce to NULL here.
      og_title: values.metadata.ogTitle ?? null,
      og_description: values.metadata.ogDescription ?? null,
      og_image_url: values.metadata.ogImageUrl ?? null,
      canonical_url: values.metadata.canonicalUrl ?? null,
      noindex: values.metadata.noindex ?? false,
      version: nextVersion,
      updated_by: actorProfileId,
      // WS1-D — stamp the writer's edit-session token + draft seq so the pagehide
      // beacon can later compare against the stored draft for last-write-wins.
      ...(params.editSession
        ? {
            edit_session_id: params.editSession.id,
            draft_seq: params.editSession.seq,
          }
        : {}),
    })
    .eq("id", beforeRow.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(PAGE_COLUMNS)
    .maybeSingle<PageRow>();
  if (updErr) return mapTriggerError(updErr);
  if (!updatedPage) return versionConflict(beforeRow.version + 1);

  // --- replace is_draft=TRUE rows atomically ---
  // (a) delete existing draft-only rows
  const { error: delErr } = await supabase
    .from("cms_page_sections")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("page_id", beforeRow.id)
    .eq("is_draft", true);
  if (delErr) {
    void improntaLog("site_admin_homepage.warn", {
      message: "[site-admin/homepage] draft rows clear failed",
      tenantId,
      pageId: beforeRow.id,
      error: delErr.message,
    });
    return fail("FORBIDDEN", delErr.message);
  }

  // (b) insert fresh draft rows
  const rowsToInsert: Array<
    Pick<
      HomepagePageSectionRow,
      | "tenant_id"
      | "page_id"
      | "section_id"
      | "slot_key"
      | "sort_order"
      | "is_draft"
    >
  > = [];
  for (const [slotKey, entries] of Object.entries(values.slots)) {
    if (!entries) continue;
    for (const entry of entries) {
      rowsToInsert.push({
        tenant_id: tenantId,
        page_id: beforeRow.id,
        section_id: entry.sectionId,
        slot_key: slotKey,
        sort_order: entry.sortOrder,
        is_draft: true,
      });
    }
  }
  if (rowsToInsert.length > 0) {
    const { error: insErr } = await supabase
      .from("cms_page_sections")
      .insert(rowsToInsert);
    if (insErr) {
      void improntaLog("site_admin_homepage.warn", {
        message: "[site-admin/homepage] draft rows insert failed",
        tenantId,
        pageId: beforeRow.id,
        count: rowsToInsert.length,
        error: insErr.message,
      });
      return fail("FORBIDDEN", insErr.message);
    }
  }

  // --- revision snapshot (draft) ---
  const draftBuilderTree = resolveBuilderTreeForComposition({
    composition: compositionSnapshot,
    preferredBuilderTree: values.builderTree,
  });
  await insertHomepageRevision(supabase, {
    tenantId,
    pageId: updatedPage.id,
    kind: "draft",
    version: updatedPage.version,
    templateSchemaVersion: updatedPage.template_schema_version,
    snapshot: buildRevisionSnapshot({
      page: updatedPage,
      composition: compositionSnapshot,
      builderTree: draftBuilderTree,
      styleClasses: params.styleClasses,
      stylePresets: params.stylePresets,
      kind: "draft",
    }),
    actorProfileId,
  });

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.homepage.compose",
    entityType: "cms_pages",
    entityId: updatedPage.id,
    diffSummary: `homepage draft saved (${values.locale}): ${compositionSnapshot.length} slot entr${compositionSnapshot.length === 1 ? "y" : "ies"}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: updatedPage,
    correlationId,
  });

  return ok({ id: updatedPage.id, version: updatedPage.version });
}

// ---- applyHomepageDraftBeacon (WS1-D last-write-wins) ----------------------

export type BeaconLwwResult =
  | { ok: true; pageVersion: number; applied: true }
  | { ok: true; applied: false; reason: string }
  | { ok: false; error: string; code?: string };

/**
 * WS1-D — apply a pagehide draft beacon under LAST-WRITE-WINS instead of the
 * brittle version CAS.
 *
 * The keepalive `pagehide` beacon carries the operator's per-tab
 * `editSessionId` + a monotonic `draftSeq`. We compare them against the
 * `edit_session_id` / `draft_seq` last stamped on the `cms_pages` row:
 *   - SAME session + STRICTLY-NEWER seq → the beacon is the operator's own
 *     latest edit; apply it (bypassing the version CAS that would otherwise 409
 *     when a normal in-flight save bumped the version first).
 *   - different/NULL session, stale seq, or an EMPTY tree over good content →
 *     refuse (the empty-over-good guard mirrors `recoverBuilderTreeIfEmpty`:
 *     an empty beacon must never clobber a non-empty stored draft).
 *
 * The actual write reuses `saveHomepageDraftComposition` (same gates / revision
 * / audit) with the CURRENT version as `expectedVersion`, so it stays atomic.
 * Because the LWW decision has already granted this operator's latest edit, a
 * concurrent version bump between our read and the CAS write is retried a few
 * times rather than dropped — the beacon's whole purpose is to not lose the
 * last edit.
 */
export async function applyHomepageDraftBeacon(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: HomepageSaveDraftValues;
    styleClasses?: BuilderStyleClassRegistry;
    /** STYLE-1 — preserve presets across a pagehide beacon save. */
    stylePresets?: BuilderStylePresetRegistry;
    actorProfileId: string | null;
    editSession: { id: string; seq: number };
    /** Whether the incoming beacon tree has real content (non-empty). */
    incomingHasContent: boolean;
    correlationId?: string;
  },
): Promise<BeaconLwwResult> {
  const { tenantId, values, editSession } = params;

  await requirePhase5Capability("agency.site_admin.homepage.compose", tenantId);

  if (values.tenantId !== tenantId) {
    return { ok: false, error: "tenantId mismatch", code: "FORBIDDEN" };
  }

  // Load the homepage row + the WS1-D stamps + a content signal for the stored
  // draft (does it currently hold real builder/composition content?).
  const { data: row, error: loadErr } = await supabase
    .from("cms_pages")
    .select("id, version, edit_session_id, draft_seq")
    .eq("tenant_id", tenantId)
    .eq("locale", values.locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle<{
      id: string;
      version: number;
      edit_session_id: string | null;
      draft_seq: number | null;
    }>();
  if (loadErr) return { ok: false, error: loadErr.message, code: "FORBIDDEN" };
  if (!row) return { ok: false, error: "Homepage row not found.", code: "NOT_FOUND" };

  const storedHasContent = await homepageDraftHasContent(supabase, {
    tenantId,
    pageId: row.id,
    pageVersion: row.version,
  });

  const decision = decideBeaconLastWriteWins(
    {
      editSessionId: row.edit_session_id,
      draftSeq: row.draft_seq,
      storedHasContent,
    },
    {
      editSessionId: editSession.id,
      draftSeq: editSession.seq,
      incomingHasContent: params.incomingHasContent,
    },
  );

  if (!decision.apply) {
    // Refused: not this operator's latest edit (or empty-over-good). Drop it
    // quietly — the operator's in-session draft already persisted on the
    // previous keystroke's debounce.
    return { ok: true, applied: false, reason: decision.reason };
  }

  // Granted. Apply via the standard draft-save path under the CURRENT version,
  // retrying a couple times if a concurrent save bumps the version in the gap.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: liveRow } = await supabase
      .from("cms_pages")
      .select("version")
      .eq("id", row.id)
      .eq("tenant_id", tenantId)
      .maybeSingle<{ version: number }>();
    if (!liveRow) return { ok: false, error: "Homepage row not found.", code: "NOT_FOUND" };

    const res = await saveHomepageDraftComposition(supabase, {
      tenantId,
      values: { ...values, expectedVersion: liveRow.version },
      styleClasses: params.styleClasses,
      stylePresets: params.stylePresets,
      actorProfileId: params.actorProfileId,
      correlationId: params.correlationId,
      editSession,
    });
    if (res.ok) {
      return { ok: true, pageVersion: res.data.version, applied: true };
    }
    if (res.code !== "VERSION_CONFLICT") {
      return { ok: false, error: res.message ?? "Beacon save failed", code: res.code };
    }
    // VERSION_CONFLICT — a normal save landed in the gap. LWW already granted
    // this beacon, so re-read the version and try again.
  }
  return { ok: false, error: "Beacon save lost a version race", code: "VERSION_CONFLICT" };
}

/**
 * WS1-D helper — does the homepage's current DRAFT hold real content (any
 * builder nodes OR any draft composition slot rows)? Used to refuse an empty
 * beacon over a good stored draft (empty-load-incident guard). Defensive: on a
 * query error we treat the stored draft as "has content" so we NEVER let an
 * empty beacon through on an ambiguous read.
 */
async function homepageDraftHasContent(
  supabase: SupabaseClient,
  params: { tenantId: string; pageId: string; pageVersion: number },
): Promise<boolean> {
  // (1) draft composition slot rows
  const { count, error: countErr } = await supabase
    .from("cms_page_sections")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", params.tenantId)
    .eq("page_id", params.pageId)
    .eq("is_draft", true);
  if (countErr) return true; // ambiguous → protect content
  if ((count ?? 0) > 0) return true;

  // (2) builder tree from the version-matched draft revision, with the
  // empty-load self-heal so a transiently-empty pointer doesn't read as empty.
  const { data: rev } = await supabase
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("tenant_id", params.tenantId)
    .eq("page_id", params.pageId)
    .eq("version", params.pageVersion)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ snapshot: { builderTree?: unknown } | null }>();
  const versionMatchedTree =
    rev?.snapshot && typeof rev.snapshot === "object"
      ? rev.snapshot.builderTree
      : undefined;
  const recovered = await recoverBuilderTreeIfEmpty(
    supabase,
    {
      tenantId: params.tenantId,
      pageId: params.pageId,
      pageVersion: params.pageVersion,
      hasSlots: false,
    },
    versionMatchedTree,
  );
  return Array.isArray(recovered) && recovered.length > 0;
}

// ---- publishHomepage -----------------------------------------------------

/**
 * Promote the draft composition to live. Gates:
 *   1. capability: homepage.publish
 *   2. tenantId matches values.tenantId
 *   3. CAS on cms_pages.version
 *   4. homepage template current-version schema parse of page fields
 *      (title + metaDescription + introTagline)
 *   5. every required slot has at least one entry in the draft composition
 *   6. every referenced section exists on this tenant and is status='published'
 *   7. og-image media asset (if set) is live (not soft-deleted)
 *
 * On success:
 *   - status='published', published_at=now(), version bumped
 *   - build `published_homepage_snapshot` JSONB from draft rows' referenced
 *     sections' current PUBLISHED state and write it onto cms_pages
 *   - DELETE all is_draft=FALSE cms_page_sections rows, re-INSERT them from
 *     the draft rows (keeps the junction in sync with the snapshot)
 *   - revision kind='published'
 *   - cache bust: homepage:{locale}, pages:{id}, pages-all
 */
export async function publishHomepage(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: HomepagePublishValues;
    actorProfileId: string | null;
    correlationId?: string;
    /**
     * Phase 12 cron-sweep escape hatch. When `true`, skips the
     * `requirePhase5Capability` check that would otherwise block a
     * service-role caller without a user-context membership row.
     *
     * Only the `/api/cron/publish-scheduled` route should ever set this —
     * it gates on a `CRON_SECRET` token, runs the same validation gates
     * (CAS, schema, required slots, OG image), and writes the audit row
     * with `actor_profile_id` set to the operator who originally
     * scheduled the publish (so the audit trail still attributes a
     * human, not a service identity).
     */
    bypassCapabilityCheck?: boolean;
    /**
     * Marathon W1-T2 — the operator's PAGE-SCOPED linked-style-class registry
     * (id → class). Linked blocks store only a `classRef`; the renderer resolves
     * it against this registry. The published page is served from the snapshot
     * with NO client registry available, so we BAKE the classes into the tree
     * here (flatten every `classRef` into the node's resolved style, strip the
     * dangling ref) before writing the snapshot. Omitted / empty → classRefs are
     * stripped to a clean tree (linked blocks fall back to their own style, the
     * pre-W1 behavior). The registry lives in localStorage, so it can only reach
     * the server through this client-supplied param.
     */
    styleClasses?: BuilderStyleClassRegistry;
    /** STYLE-1 — site-scoped presets + clipboard baked into the published
     *  snapshot alongside styleClasses (same client-supplied envelope). */
    stylePresets?: BuilderStylePresetRegistry;
  },
): Promise<
  Phase5Result<{ id: string; version: number; publishedAt: string }>
> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  if (!params.bypassCapabilityCheck) {
    await requirePhase5Capability(
      "agency.site_admin.homepage.publish",
      tenantId,
    );
  }

  if (values.tenantId !== tenantId) {
    return fail("FORBIDDEN", "tenantId mismatch");
  }

  // --- gate 3: CAS ---
  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_pages")
    .select(PAGE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("locale", values.locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle<PageRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Homepage row not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // --- gate 4: template schema parse ---
  const schema = homepageTemplate.schemasByVersion[homepageTemplate.currentVersion];
  if (!schema) {
    return fail(
      "VALIDATION_FAILED",
      "Homepage template missing current-version schema",
    );
  }
  const heroLike = (beforeRow.hero ?? {}) as { introTagline?: unknown };
  const parsedPageFields = schema.safeParse({
    title: beforeRow.title,
    metaDescription: beforeRow.meta_description ?? undefined,
    introTagline:
      typeof heroLike.introTagline === "string"
        ? heroLike.introTagline
        : undefined,
  });
  if (!parsedPageFields.success) {
    return fail(
      "PUBLISH_NOT_READY",
      `Homepage fields failed schema check: ${parsedPageFields.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  // --- load draft slot rows ---
  const { data: draftRowsRaw, error: draftErr } = await supabase
    .from("cms_page_sections")
    .select(PAGE_SECTION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("page_id", beforeRow.id)
    .eq("is_draft", true)
    .order("slot_key", { ascending: true })
    .order("sort_order", { ascending: true });
  if (draftErr) return fail("FORBIDDEN", draftErr.message);
  const draftRows = (draftRowsRaw ?? []) as HomepagePageSectionRow[];

  // --- gate 5: required slots ---
  const bySlot = new Map<string, HomepagePageSectionRow[]>();
  for (const r of draftRows) {
    const arr = bySlot.get(r.slot_key) ?? [];
    arr.push(r);
    bySlot.set(r.slot_key, arr);
  }
  for (const slot of homepageTemplate.meta.slots) {
    if (!slot.required) continue;
    const entries = bySlot.get(slot.key);
    if (!entries || entries.length === 0) {
      return fail(
        "PUBLISH_NOT_READY",
        `Required slot "${slot.label}" is empty. Add at least one section before publishing.`,
      );
    }
  }

  // --- gate 6: referenced sections must be published ---
  const sectionIds = draftRows.map((r) => r.section_id);
  const factsById = await loadSectionFactsBulk(supabase, tenantId, sectionIds);
  for (const r of draftRows) {
    const facts = factsById.get(r.section_id);
    if (!facts) {
      return fail(
        "PUBLISH_NOT_READY",
        `Referenced section ${r.section_id} not found. Remove it from the composition or restore the section.`,
      );
    }
    if (facts.status !== "published") {
      return fail(
        "PUBLISH_NOT_READY",
        `Section "${facts.name}" is ${facts.status}. Publish the section first, then re-publish the homepage.`,
      );
    }
  }

  // --- gate 7: og image live ---
  if (beforeRow.og_image_media_asset_id) {
    const { data: mediaRow, error: mediaErr } = await supabase
      .from("media_assets")
      .select("id, deleted_at, tenant_id")
      .eq("id", beforeRow.og_image_media_asset_id)
      .eq("tenant_id", tenantId)
      .maybeSingle<{
        id: string;
        deleted_at: string | null;
        tenant_id: string;
      }>();
    if (mediaErr) return fail("FORBIDDEN", mediaErr.message);
    if (!mediaRow || mediaRow.deleted_at) {
      return fail(
        "PUBLISH_NOT_READY",
        "OG image media asset is missing or soft-deleted",
      );
    }
  }

  // --- build published snapshot from frozen section props ---
  const slotsForSnapshot: Record<
    string,
    Array<{ sectionId: string; sortOrder: number }>
  > = {};
  for (const r of draftRows) {
    const arr = slotsForSnapshot[r.slot_key] ?? [];
    arr.push({ sectionId: r.section_id, sortOrder: r.sort_order });
    slotsForSnapshot[r.slot_key] = arr;
  }
  const compositionSnapshot = buildSnapshotSlots(slotsForSnapshot, factsById);
  const { data: revisionRow } = await supabase
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("tenant_id", tenantId)
    .eq("page_id", beforeRow.id)
    .eq("version", beforeRow.version)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ snapshot: { builderTree?: unknown } | null }>();
  const versionMatchedBuilderTree =
    revisionRow?.snapshot &&
    typeof revisionRow.snapshot === "object" &&
    "builderTree" in revisionRow.snapshot
      ? revisionRow.snapshot.builderTree
      : undefined;
  // Self-heal guard (homepage draft empty-load incident, 2026-06-11): never
  // freeze an empty homepage at publish if the version pointer drifted onto an
  // empty revision while a recent non-empty draft still exists. See
  // recover-builder-tree.ts.
  const preferredBuilderTree = await recoverBuilderTreeIfEmpty(
    supabase,
    {
      tenantId,
      pageId: beforeRow.id,
      pageVersion: beforeRow.version,
      hasSlots: compositionSnapshot.length > 0,
    },
    versionMatchedBuilderTree,
  );
  const publishedBuilderTreeResolved = resolveSnapshotBuilderTreeForPublish({
    slots: toLegacySnapshotSlots(compositionSnapshot),
    builderTree: preferredBuilderTree,
  });
  if (!publishedBuilderTreeResolved.ok) {
    return fail(
      "PUBLISH_NOT_READY",
      `Draft builder structure is invalid. Save homepage draft again before publishing. ${summarizeBuilderTreeIssues(publishedBuilderTreeResolved.issues)}`,
    );
  }
  // Marathon W1-T2 — bake linked style classes into the published tree. The
  // public page renders from this snapshot with NO client registry, so a bare
  // `{ classRef }` would resolve to nothing there. resolveBuilderTreeClassRefs
  // flattens each linked node's class style into its resolved style and strips
  // the now-dangling classRef. With no registry it still strips classRefs to a
  // clean tree (linked blocks fall back to their own style — never blank).
  const publishedBuilderTree = resolveBuilderTreeClassRefs(
    publishedBuilderTreeResolved.tree,
    params.styleClasses,
  );

  const nowIso = new Date().toISOString();
  const nextVersion = beforeRow.version + 1;

  const heroLikeCurrent = (beforeRow.hero ?? {}) as {
    introTagline?: unknown;
  };
  const snapshot: HomepageSnapshot = {
    version: 1,
    publishedAt: nowIso,
    pageVersion: nextVersion,
    locale: values.locale,
    fields: {
      title: beforeRow.title,
      metaDescription: beforeRow.meta_description ?? null,
      introTagline:
        typeof heroLikeCurrent.introTagline === "string"
          ? heroLikeCurrent.introTagline
          : null,
    },
    templateSchemaVersion: homepageTemplate.currentVersion,
    slots: compositionSnapshot,
    builderTree: publishedBuilderTree,
  };

  // --- apply publish ---
  const { data: afterRow, error: updErr } = await supabase
    .from("cms_pages")
    .update({
      status: "published",
      published_at: nowIso,
      published_homepage_snapshot: snapshot as unknown as Record<
        string,
        unknown
      >,
      template_schema_version: homepageTemplate.currentVersion,
      version: nextVersion,
      updated_by: actorProfileId,
    })
    .eq("id", beforeRow.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(PAGE_COLUMNS)
    .maybeSingle<PageRow>();
  if (updErr) return mapTriggerError(updErr);
  if (!afterRow) return versionConflict(beforeRow.version + 1);

  // --- sync is_draft=FALSE rows to mirror draft composition ---
  const { error: delLiveErr } = await supabase
    .from("cms_page_sections")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("page_id", beforeRow.id)
    .eq("is_draft", false);
  if (delLiveErr) {
    void improntaLog("site_admin_homepage.warn", {
      message: "[site-admin/homepage] live rows clear failed",
      tenantId,
      pageId: beforeRow.id,
      error: delLiveErr.message,
    });
    // We don't roll back — the snapshot is authoritative for public reads,
    // and the junction will be resynced on next publish. Surface via audit.
  }
  if (draftRows.length > 0) {
    const liveRows = draftRows.map((r) => ({
      tenant_id: tenantId,
      page_id: beforeRow.id,
      section_id: r.section_id,
      slot_key: r.slot_key,
      sort_order: r.sort_order,
      is_draft: false,
    }));
    const { error: insLiveErr } = await supabase
      .from("cms_page_sections")
      .insert(liveRows);
    if (insLiveErr) {
      void improntaLog("site_admin_homepage.warn", {
        message: "[site-admin/homepage] live rows insert failed",
        tenantId,
        pageId: beforeRow.id,
        count: liveRows.length,
        error: insLiveErr.message,
      });
    }
  }

  await insertHomepageRevision(supabase, {
    tenantId,
    pageId: afterRow.id,
    kind: "published",
    version: afterRow.version,
    templateSchemaVersion: afterRow.template_schema_version,
    snapshot: buildRevisionSnapshot({
      page: afterRow,
      composition: compositionSnapshot,
      builderTree: publishedBuilderTree,
      // STYLE-1 — carry presets through the published revision so a reload after
      // publish still surfaces the author's site-scoped presets.
      stylePresets: params.stylePresets,
      kind: "published",
    }),
    actorProfileId,
  });

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.homepage.publish",
    entityType: "cms_pages",
    entityId: afterRow.id,
    diffSummary: `homepage published (${values.locale}): v${nextVersion} — ${compositionSnapshot.length} slot entr${compositionSnapshot.length === 1 ? "y" : "ies"}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: afterRow,
    correlationId,
  });

  bustHomepageTags(tenantId, afterRow.id, values.locale);

  return ok({
    id: afterRow.id,
    version: afterRow.version,
    publishedAt: nowIso,
  });
}

// ---- restoreHomepageRevision ---------------------------------------------

interface StoredRevisionSnapshot {
  page?: {
    title?: string;
    meta_description?: string | null;
    hero?: Record<string, unknown> | null;
  };
  composition?: HomepageSnapshotSection[];
  builderTree?: unknown;
}

/**
 * Roll the draft composition back to a saved revision. Writes fresh
 * is_draft=TRUE rows + updates the draft page fields; does NOT publish. The
 * operator reviews the restored draft and re-publishes when ready (same
 * rhythm as M3 pages).
 *
 * Gates:
 *   1. capability: homepage.compose
 *   2. CAS on cms_pages.version
 *   3. revision row belongs to the same (tenant, page)
 *   4. referenced sections still exist + not archived (archived sections are
 *      rolled back by dropping that entry; operator is told in the audit
 *      summary)
 */
export async function restoreHomepageRevision(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: HomepageRestoreRevisionValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.homepage.compose", tenantId);

  if (values.tenantId !== tenantId) {
    return fail("FORBIDDEN", "tenantId mismatch");
  }

  // Load current homepage row + CAS check.
  const { data: beforeRow, error: pageErr } = await supabase
    .from("cms_pages")
    .select(PAGE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("locale", values.locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle<PageRow>();
  if (pageErr) return fail("FORBIDDEN", pageErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Homepage row not found");
  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // Load the revision.
  const { data: rev, error: revErr } = await supabase
    .from("cms_page_revisions")
    .select(REVISION_COLUMNS)
    .eq("id", values.revisionId)
    .eq("tenant_id", tenantId)
    .eq("page_id", beforeRow.id)
    .maybeSingle<{
      id: string;
      tenant_id: string;
      page_id: string;
      kind: string;
      version: number;
      template_schema_version: number;
      snapshot: StoredRevisionSnapshot;
      created_by: string | null;
      created_at: string;
    }>();
  if (revErr) return fail("FORBIDDEN", revErr.message);
  if (!rev) return fail("NOT_FOUND", "Revision not found for this homepage");

  const snap = rev.snapshot ?? {};
  const title = snap.page?.title ?? beforeRow.title;
  const metaDescription =
    snap.page?.meta_description ?? beforeRow.meta_description ?? null;
  const hero = (snap.page?.hero ?? beforeRow.hero ?? {}) as Record<
    string,
    unknown
  >;
  const composition = snap.composition ?? [];

  // Filter out sections that no longer exist or are archived.
  const keptComposition: HomepageSnapshotSection[] = [];
  const dropped: string[] = [];
  if (composition.length > 0) {
    const facts = await loadSectionFactsBulk(
      supabase,
      tenantId,
      composition.map((c) => c.sectionId),
    );
    for (const entry of composition) {
      const f = facts.get(entry.sectionId);
      if (!f) {
        dropped.push(`${entry.sectionId} (missing)`);
        continue;
      }
      if (f.status === "archived") {
        dropped.push(`${f.name} (archived)`);
        continue;
      }
      keptComposition.push(entry);
    }
  }
  const rollbackBuilderTree = resolveBuilderTreeForComposition({
    composition: keptComposition,
    preferredBuilderTree: snap.builderTree,
  });

  // Apply page-field rollback + CAS-bump version.
  const nextVersion = beforeRow.version + 1;
  const { data: updatedPage, error: updErr } = await supabase
    .from("cms_pages")
    .update({
      title,
      meta_description: metaDescription,
      hero,
      version: nextVersion,
      updated_by: actorProfileId,
    })
    .eq("id", beforeRow.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(PAGE_COLUMNS)
    .maybeSingle<PageRow>();
  if (updErr) return mapTriggerError(updErr);
  if (!updatedPage) return versionConflict(beforeRow.version + 1);

  // Replace draft rows with rolled-back composition.
  const { error: delErr } = await supabase
    .from("cms_page_sections")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("page_id", beforeRow.id)
    .eq("is_draft", true);
  if (delErr) {
    void improntaLog("site_admin_homepage.warn", {
      message: "[site-admin/homepage] rollback draft clear failed",
      tenantId,
      pageId: beforeRow.id,
      error: delErr.message,
    });
  }
  if (keptComposition.length > 0) {
    const rows = keptComposition.map((entry) => ({
      tenant_id: tenantId,
      page_id: beforeRow.id,
      section_id: entry.sectionId,
      slot_key: entry.slotKey,
      sort_order: entry.sortOrder,
      is_draft: true,
    }));
    const { error: insErr } = await supabase
      .from("cms_page_sections")
      .insert(rows);
    if (insErr) {
      void improntaLog("site_admin_homepage.warn", {
        message: "[site-admin/homepage] rollback draft insert failed",
        tenantId,
        pageId: beforeRow.id,
        count: rows.length,
        error: insErr.message,
      });
    }
  }

  await insertHomepageRevision(supabase, {
    tenantId,
    pageId: updatedPage.id,
    kind: "rollback",
    version: updatedPage.version,
    templateSchemaVersion: updatedPage.template_schema_version,
    snapshot: buildRevisionSnapshot({
      page: updatedPage,
      composition: keptComposition,
      builderTree: rollbackBuilderTree,
      kind: "rollback",
    }),
    actorProfileId,
  });

  const diffSuffix =
    dropped.length > 0 ? ` (${dropped.length} dropped: ${dropped.join(", ")})` : "";
  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.homepage.compose",
    entityType: "cms_pages",
    entityId: updatedPage.id,
    diffSummary: `homepage rolled back to revision ${rev.id.slice(0, 8)}${diffSuffix}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: updatedPage,
    correlationId,
  });

  // No cache bust — rollback lands as draft.
  return ok({ id: updatedPage.id, version: updatedPage.version });
}
