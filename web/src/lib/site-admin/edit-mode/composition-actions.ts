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
import { loadSectionByIdForStaff } from "@/lib/site-admin/server/sections-reads";
import { publishSection } from "@/lib/site-admin/server/sections";
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
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ── types ─────────────────────────────────────────────────────────────────

export interface CompositionSectionRef {
  sectionId: string;
  sortOrder: number;
  sectionTypeKey: string;
  name: string;
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
  purpose: string;
}

export interface CompositionData {
  locale: Locale;
  pageVersion: number;
  metadata: {
    title: string;
    metaDescription: string | null;
    introTagline: string | null;
  };
  slots: Record<string, CompositionSectionRef[]>;
  slotDefs: CompositionSlotDef[];
  library: CompositionLibraryEntry[];
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
      bucket.push({
        sectionId: row.sectionId,
        sortOrder: row.sortOrder,
        sectionTypeKey: row.sectionTypeKey,
        name: row.name,
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

  const library: CompositionLibraryEntry[] = listAgencyVisibleSections().map(
    (s) => ({
      typeKey: s.meta.key,
      label: s.meta.label,
      description: s.meta.description,
      purpose: s.meta.businessPurpose,
    }),
  );

  return {
    ok: true,
    data: {
      locale,
      pageVersion: page.version,
      metadata: {
        title: page.title,
        metaDescription: page.metaDescription,
        introTagline: comp?.fields.introTagline ?? null,
      },
      slots,
      slotDefs,
      library,
    },
  };
}

// ── save composition ──────────────────────────────────────────────────────

export interface CompositionSaveInput {
  locale: string;
  expectedVersion: number;
  metadata: {
    title: string;
    metaDescription?: string | null;
    introTagline?: string | null;
  };
  slots: Record<string, Array<{ sectionId: string; sortOrder: number }>>;
}

/**
 * Save a composition mutation atomically. Wraps `saveHomepageDraftComposition`
 * with a typed envelope so the in-place editor can ship discrete changes
 * without a full form round-trip.
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

  const metadataParsed = homepageMetadataSchema.safeParse(input.metadata);
  if (!metadataParsed.success) {
    return { ok: false, error: "Page metadata is missing or invalid." };
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
  expectedVersion: number;
  metadata: {
    title: string;
    metaDescription?: string | null;
    introTagline?: string | null;
  };
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
  expectedVersion: number;
  metadata: {
    title: string;
    metaDescription?: string | null;
    introTagline?: string | null;
  };
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
