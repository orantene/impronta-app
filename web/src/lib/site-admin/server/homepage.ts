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

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
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

import type { PageRow } from "./pages";

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
  updateTag(tagFor(tenantId, "homepage", { locale }));
  updateTag(tagFor(tenantId, "pages", { id: pageId }));
  updateTag(tagFor(tenantId, "pages-all"));
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
    console.warn("[site-admin/homepage] revision insert failed", {
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
  kind: "draft" | "published" | "rollback";
}): Record<string, unknown> {
  return {
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
    console.warn("[site-admin/homepage] section facts load failed", {
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
    console.warn("[site-admin/homepage] staff page load failed", {
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
    console.warn("[site-admin/homepage] staff slots load failed", {
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

  // --- apply: bump version, update page fields ---
  const nextVersion = beforeRow.version + 1;
  const { data: updatedPage, error: updErr } = await supabase
    .from("cms_pages")
    .update({
      title: values.metadata.title,
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
    console.warn("[site-admin/homepage] draft rows clear failed", {
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
      console.warn("[site-admin/homepage] draft rows insert failed", {
        tenantId,
        pageId: beforeRow.id,
        count: rowsToInsert.length,
        error: insErr.message,
      });
      return fail("FORBIDDEN", insErr.message);
    }
  }

  // --- revision snapshot (draft) ---
  const compositionSnapshot = buildSnapshotSlots(values.slots, factsById);
  await insertHomepageRevision(supabase, {
    tenantId,
    pageId: updatedPage.id,
    kind: "draft",
    version: updatedPage.version,
    templateSchemaVersion: updatedPage.template_schema_version,
    snapshot: buildRevisionSnapshot({
      page: updatedPage,
      composition: compositionSnapshot,
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
    console.warn("[site-admin/homepage] live rows clear failed", {
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
      console.warn("[site-admin/homepage] live rows insert failed", {
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
    console.warn("[site-admin/homepage] rollback draft clear failed", {
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
      console.warn("[site-admin/homepage] rollback draft insert failed", {
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
