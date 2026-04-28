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

import {
  homepageMetadataSchema,
  homepageSaveDraftSchema,
  homepageSlotsSchema,
  type HomepageMetadataValues,
  type HomepageSlotsValues,
} from "@/lib/site-admin/forms/homepage";
import {
  ensureHomepageRow,
  publishHomepage,
  saveHomepageDraftComposition,
} from "@/lib/site-admin/server/homepage";
import { loadDraftHomepage } from "@/lib/site-admin/server/homepage-reads";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadSectionByIdForStaff } from "@/lib/site-admin/server/sections-reads";
import { publishSection } from "@/lib/site-admin/server/sections";
import { republishSiteShellSnapshot } from "@/lib/site-admin/edit-mode/site-shell-publish";
import { revalidateTag } from "next/cache";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  listAgencyVisibleSections,
  getSectionType,
  type SectionTypeKey,
  SECTION_REGISTRY,
} from "@/lib/site-admin/sections/registry";
import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";
import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import { upsertSection } from "@/lib/site-admin/server/sections";
import { homepageTemplate } from "@/lib/site-admin";
import { isLocale, type Locale } from "@/lib/site-admin/locales";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { publishPageSnapshot } from "@/lib/site-admin/edit-mode/page-composer-action";

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
  metadata: {
    title: string;
    metaDescription: string | null;
    introTagline: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageUrl: string | null;
    canonicalUrl: string | null;
    noindex: boolean;
  };
  slots: Record<string, CompositionSectionRef[]>;
  slotDefs: CompositionSlotDef[];
  library: CompositionLibraryEntry[];
  /** Locales available for the active tenant (read-only here — used for the
   *  Topbar locale switcher and the clone-from-locale command). */
  availableLocales: ReadonlyArray<Locale>;
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
      };
      pageVersion: number;
    }
  | { ok: false; error: string; code?: string; currentVersion?: number };

// ── locale helper ─────────────────────────────────────────────────────────

function asLocale(raw: string): Locale | null {
  return isLocale(raw) ? raw : null;
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
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
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
      .select("id, title, meta_description, og_title, og_description, og_image_url, canonical_url, noindex, version")
      .eq("tenant_id", scope.tenantId)
      .eq("locale", locale)
      .eq("slug", input.pageSlug)
      .neq("status", "archived")
      .maybeSingle<{
        id: string;
        title: string;
        meta_description: string | null;
        og_title: string | null;
        og_description: string | null;
        og_image_url: string | null;
        canonical_url: string | null;
        noindex: boolean;
        version: number;
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

    let { data: draftRows } = await admin
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

    return {
      ok: true,
      data: {
        locale,
        pageId: pageRow.id,
        pageVersion: pageRow.version,
        metadata: {
          title: pageRow.title,
          metaDescription: pageRow.meta_description,
          introTagline: null, // homepage-specific field; not applicable here
          ogTitle: pageRow.og_title,
          ogDescription: pageRow.og_description,
          ogImageUrl: pageRow.og_image_url,
          canonicalUrl: pageRow.canonical_url,
          noindex: pageRow.noindex,
        },
        slots,
        slotDefs,
        library,
        availableLocales: localeSettings.supportedLocales,
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

  return {
    ok: true,
    data: {
      locale,
      pageId: page.pageId,
      pageVersion: page.version,
      metadata: {
        title: page.title,
        metaDescription: page.metaDescription,
        introTagline: comp?.fields.introTagline ?? null,
        ogTitle: page.ogTitle,
        ogDescription: page.ogDescription,
        ogImageUrl: page.ogImageUrl,
        canonicalUrl: page.canonicalUrl,
        noindex: page.noindex,
      },
      slots,
      slotDefs,
      library,
      availableLocales: localeSettings.supportedLocales,
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
    metaDescription?: string | null;
    introTagline?: string | null;
    ogTitle?: string | null;
    ogDescription?: string | null;
    ogImageUrl?: string | null;
    canonicalUrl?: string | null;
    noindex?: boolean;
  };
  slots: Record<string, Array<{ sectionId: string; sortOrder: number }>>;
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
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
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

  // ── non-homepage page save ─────────────────────────────────────────────
  if (input.pageId) {
    try {
      const admin = createServiceRoleClient();
      if (!admin) return { ok: false, error: "Server configuration error." };

      // CAS: load the current version.
      const { data: pageRow, error: loadErr } = await admin
        .from("cms_pages")
        .select("id, version")
        .eq("id", input.pageId)
        .eq("tenant_id", scope.tenantId)
        .maybeSingle<{ id: string; version: number }>();
      if (loadErr || !pageRow) {
        return { ok: false, error: "Page not found.", code: "NOT_FOUND" };
      }
      if (pageRow.version !== input.expectedVersion) {
        return {
          ok: false,
          error: "Someone else edited this page. Changes reloaded — try again.",
          code: "VERSION_CONFLICT",
          currentVersion: pageRow.version,
        };
      }

      const nextVersion = pageRow.version + 1;

      // Update page metadata fields (introTagline is homepage-only; skip).
      const { error: updErr } = await admin
        .from("cms_pages")
        .update({
          title: input.metadata.title,
          meta_description: input.metadata.metaDescription ?? null,
          og_title: input.metadata.ogTitle ?? null,
          og_description: input.metadata.ogDescription ?? null,
          og_image_url: input.metadata.ogImageUrl ?? null,
          canonical_url: input.metadata.canonicalUrl ?? null,
          noindex: input.metadata.noindex ?? false,
          version: nextVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.pageId)
        .eq("tenant_id", scope.tenantId)
        .eq("version", input.expectedVersion); // second CAS guard
      if (updErr) {
        return { ok: false, error: CLIENT_ERROR.update };
      }

      // Replace draft slot rows atomically: delete then insert.
      await admin
        .from("cms_page_sections")
        .delete()
        .eq("tenant_id", scope.tenantId)
        .eq("page_id", input.pageId)
        .eq("is_draft", true);

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
  });
  if (!envelope.success) {
    return { ok: false, error: "Composition envelope failed validation." };
  }

  try {
    const result = await saveHomepageDraftComposition(auth.supabase, {
      tenantId: scope.tenantId,
      values: envelope.data,
      actorProfileId: auth.user.id,
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
  targetSlotKey: string;
  insertAfterSortOrder: number | null; // null → prepend (sort 0)
  sectionTypeKey: string;
}): Promise<CreateAndInsertResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
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

  // --- step 1: create the draft section (unique-name retry once) ---------
  const defaults = getLibraryDefault(typeKey);
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
  sourceSectionId: string;
}): Promise<CreateAndInsertResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
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
}): Promise<SaveDraftResult> {
  const save = await saveHomepageCompositionAction({
    locale: input.locale,
    pageId: input.pageId,
    expectedVersion: input.expectedVersion,
    metadata: input.metadata,
    slots: input.slots,
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
}): Promise<PublishResult> {
  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  }
  const scope = await requireTenantScope().catch(() => null);
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
