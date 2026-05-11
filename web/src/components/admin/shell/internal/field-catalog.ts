/**
 * ═══════════════════════════════════════════════════════════════════
 * FIELD TIER ARCHITECTURE — Tulala's locked schema
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tulala is opinionated: the engine ships with a comprehensive schema
 * so agencies never need to roll their own custom-field system. Every
 * profile field on the platform falls into one of three tiers:
 *
 *   1. UNIVERSAL — every talent has these, no exceptions. The
 *      registration wizard collects them; the public profile won't
 *      publish without them. Identity, contact, location, languages,
 *      a primary photo, and consent.
 *
 *   2. GLOBAL — cross-type, optional. Most talent eventually fill
 *      these but they don't gate publish. Measurements, social links,
 *      rate card, travel/visa, skills, limits, credits, reviews,
 *      emergency contact, documents, wardrobe sizes, availability.
 *
 *   3. TYPE-SPECIFIC — only relevant for one (or a few) talent types.
 *      Driven by `TAXONOMY_FIELDS[parentId]`. Models get
 *      bust/waist/hips, photographers get camera kit, chefs get
 *      cuisine + kitchen size, drivers get license class, etc.
 *      Tulala curates this list — agencies pick from it; they don't
 *      add new ones. (The platform's value: clients search across
 *      agencies on a shared schema. Custom fields per agency would
 *      destroy that.)
 *
 * The `FIELD_CATALOG` below is the source of truth that other
 * surfaces (drawer, registration, search filters, public profile,
 * completeness math) read to decide layout, gating, and search
 * behavior. When you add a field to MyTalentProfile, ALSO register
 * it here so the rest of the system knows what tier it belongs to.
 *
 * Production migration: this file becomes either a constants module
 * shipped with the app, a Supabase config table, or both. The tier
 * model and field ids stay stable.
 */
import { useEffect, useState } from "react";
import type { TaxonomyParentId, RegFieldChannel, MyTalentProfile, RegFieldKind, RegField } from "./_state";
import { TAXONOMY_FIELDS } from "./_state";

export type FieldTier = "universal" | "global" | "type-specific";

/**
 * UI section the field renders in. Drives drawer accordions + the
 * sectionAppliesToType helper. Distinct from the drawer's accordion
 * id list (which has more granular sections like "albums" vs "media");
 * the mapping is in DRAWER_SECTION_TO_CATALOG below.
 */
export type FieldCatalogSection =
  | "identity"
  | "location"
  | "languages"
  | "media"
  | "measurements"
  | "wardrobe"
  | "rates"
  | "travel"
  | "skills"
  | "limits"
  | "credits"
  | "reviews"
  | "social"
  | "documents"
  | "emergency"
  | "type-specific";

/**
 * Static catalog of every profile field, tiered. The id matches the
 * canonical path through `MyTalentProfile` (or `ProfileState` for
 * fields that only live in the editing layer). `requiredFor` lets a
 * type-specific field be required for some types and optional for
 * others (e.g. `bust` is required for fashion models but inapplicable
 * to chefs).
 */
export type FieldCatalogEntry = {
  /** Canonical dotted path or short id: "identity.legalName",
   *  "measurements.bust", or for type-specific fields a short stable
   *  key like "music.genres" / "chefs.cuisine". */
  id: string;
  /** Human label for the catalog UI; the in-context label can differ. */
  label: string;
  tier: FieldTier;
  section: FieldCatalogSection;

  // ── Rendering metadata (Phase A unification) ────────────────────────
  // These fields used to live on the parallel `RegField` shape inside
  // TAXONOMY_FIELDS. Now every renderer (registration wizard, edit
  // drawer dynamic-fields, future settings UI) reads from one source.
  /** Input kind. Defaults to "text" when omitted. */
  kind?: RegFieldKind;
  /** Placeholder for text/number/chips inputs. */
  placeholder?: string;
  /** Helper text shown below the input. */
  helper?: string;
  /** Options for select/multiselect kinds. */
  options?: ReadonlyArray<string>;
  /** Drawer subsection — partitions parent's per-type fields into
   *  focused accordions. "physical" / "wardrobe" today. */
  subsection?: "physical" | "wardrobe";
  /** Display order within a section. Lower = earlier. */
  order?: number;

  // ── Permission / mode flags (mocked for now, real later) ────────────
  /** Default optional state when not type-specific. Type-specific
   *  required-ness lives on `requiredFor`. */
  optional?: boolean;
  /** Show in the registration wizard. Default true for universal +
   *  type-specific where a TAXONOMY_FIELDS entry exists; false for
   *  global fields the talent fills later (rate card, documents). */
  showInRegistration?: boolean;
  /** Show in the profile-edit drawer. Default true. */
  showInEditDrawer?: boolean;
  /** Show on the public profile page. Default derived from
   *  `defaultVisibility` (any "public" entry → true). */
  showInPublic?: boolean;
  /** Show on the directory / roster card. Default false; opt-in. */
  showInDirectory?: boolean;
  /** Hide from talent self-edit, only admin sees + edits. */
  adminOnly?: boolean;
  /** Talent can edit. Default true; admin-only fields force false. */
  talentEditable?: boolean;
  /** Submitting changes to this field puts the profile into pending-
   *  review state for admin to approve. Default false. */
  requiresReviewOnChange?: boolean;

  // ── Privacy + visibility ────────────────────────────────────────────
  /** Whether this field is searchable on the Tulala hub. */
  searchable?: boolean;
  /** Whether the visibility chip strip renders for this field. */
  sensitive?: boolean;
  /** Visibility default — talent can override per field. */
  defaultVisibility?: ReadonlyArray<RegFieldChannel>;

  // ── Applicability ───────────────────────────────────────────────────
  /** Talent-type ids this field applies to. Empty/undefined = all types
   *  (universal + global tiers). */
  appliesTo?: ReadonlyArray<TaxonomyParentId>;
  /** Talent-type ids this field is REQUIRED for. */
  requiredFor?: ReadonlyArray<TaxonomyParentId>;
  /** Talent-type ids this field is RECOMMENDED for (nice-to-have, not
   *  required, but shown earlier than other optionals). */
  recommendedFor?: ReadonlyArray<TaxonomyParentId>;

  // ── Completeness ────────────────────────────────────────────────────
  /** When set, treats this as a count-based field for completeness math
   *  (e.g. "portfolio" needs >=3 items, "languages" needs >=1). */
  countMin?: number;

  /** Notes for designers / engineers reading the catalog. */
  note?: string;
};

/**
 * Phase A unification — type-specific fields derived from
 * `TAXONOMY_FIELDS`. Every entry there gets a corresponding catalog
 * entry with `appliesTo: [parentId]`. Consumers calling
 * `fieldsForType(parentId)` see ALL type-specific fields, including
 * those that still physically live in TAXONOMY_FIELDS for backward
 * compat with the dynamic-field renderer's storage shape.
 *
 * The id convention is `<parentId>.<shortId>` so a "height" field
 * for models doesn't collide with a "height_visible" field for
 * security. The renderer continues to use the short id as the
 * dynFields storage key (legacy `RegField.id`), which is preserved
 * via the `legacyShortId` link field.
 */
type DerivedTypeField = FieldCatalogEntry & { legacyShortId: string };
function deriveTypeFields(): DerivedTypeField[] {
  const out: DerivedTypeField[] = [];
  for (const [parentIdRaw, fields] of Object.entries(TAXONOMY_FIELDS)) {
    const parentId = parentIdRaw as TaxonomyParentId;
    for (const f of fields) {
      out.push({
        id: `${parentId}.${f.id}`,
        legacyShortId: f.id,
        label: f.label,
        tier: "type-specific",
        // Body measurements + wardrobe map to their own UI sections;
        // everything else falls into the catch-all type-specific.
        section: f.subsection === "physical" ? "measurements"
          : f.subsection === "wardrobe" ? "wardrobe"
          : "type-specific",
        kind: f.kind,
        placeholder: f.placeholder,
        helper: f.helper,
        options: f.options,
        subsection: f.subsection,
        optional: f.optional,
        sensitive: f.sensitive,
        defaultVisibility: f.defaultVisibility,
        appliesTo: [parentId],
        // Default surface flags for type-specific fields:
        // — show in registration (these power the wizard's per-type page)
        // — show in edit drawer (the dynamic-fields accordion)
        // — talent editable
        // — only public when `defaultVisibility` includes "public"
        showInRegistration: true,
        showInEditDrawer: true,
        showInPublic: f.defaultVisibility?.includes("public") ?? false,
        showInDirectory: false,
        talentEditable: true,
      });
    }
  }
  return out;
}

// Lazy memo — defers `deriveTypeFields()` (which reads TAXONOMY_FIELDS
// from _state.tsx) until first access, so this module's top-level
// initialization no longer depends on _state.tsx finishing first.
// Fixes the circular-import "Cannot access TAXONOMY_FIELDS before
// initialization" runtime error that blocked the entire app at boot.
let __derivedTypeFieldsMemo: ReadonlyArray<DerivedTypeField> | null = null;
function getDerivedTypeFields(): ReadonlyArray<DerivedTypeField> {
  if (__derivedTypeFieldsMemo) return __derivedTypeFieldsMemo;
  __derivedTypeFieldsMemo = deriveTypeFields();
  return __derivedTypeFieldsMemo;
}

const HARDCODED_FIELDS: ReadonlyArray<FieldCatalogEntry> = [
  // ── UNIVERSAL ─────────────────────────────────────────────────────
  // Required to publish. The registration wizard enforces these.
  { id: "identity.stageName",   label: "Stage / professional name", tier: "universal", section: "identity", searchable: true,  defaultVisibility: ["public", "agency"] },
  { id: "identity.legalName",   label: "Legal name",                tier: "universal", section: "identity", defaultVisibility: ["private"] },
  { id: "identity.pronouns",    label: "Pronouns",                  tier: "universal", section: "identity", defaultVisibility: ["public", "agency"] },
  { id: "identity.dob",         label: "Date of birth",             tier: "universal", section: "identity", defaultVisibility: ["agency"] },
  { id: "identity.nationality", label: "Nationality",               tier: "universal", section: "identity", searchable: true,  defaultVisibility: ["agency"] },
  { id: "identity.contactEmail",label: "Contact email",             tier: "universal", section: "identity", defaultVisibility: ["private"] },
  { id: "identity.contactPhone",label: "Contact phone",             tier: "universal", section: "identity", defaultVisibility: ["private"] },
  { id: "serviceArea.homeBase", label: "Home base city",            tier: "universal", section: "location", searchable: true,  defaultVisibility: ["public", "agency"] },
  { id: "languages",            label: "Languages",                 tier: "universal", section: "languages", searchable: true, defaultVisibility: ["public", "agency"], countMin: 1 },
  { id: "media.headshot",       label: "Headshot photo",            tier: "universal", section: "media",    defaultVisibility: ["public", "agency"] },
  { id: "consent.terms",        label: "Terms accepted",            tier: "universal", section: "identity", defaultVisibility: ["private"] },

  // ── GLOBAL ────────────────────────────────────────────────────────
  // Cross-type, optional. Most talent eventually fill them.
  { id: "identity.homeCountry",   label: "Country of residence",  tier: "global", section: "location",     defaultVisibility: ["agency"] },
  { id: "identity.responseTime",  label: "Reply-time commitment", tier: "global", section: "identity",     defaultVisibility: ["public", "agency"] },
  { id: "identity.tagline",       label: "One-line tagline",      tier: "global", section: "identity",     defaultVisibility: ["public", "agency"] },
  { id: "bios",                   label: "Bio (per locale)",      tier: "global", section: "identity",     defaultVisibility: ["public", "agency"], countMin: 1 },
  { id: "media.coverPhoto",       label: "Cover photo",           tier: "global", section: "media",        defaultVisibility: ["public", "agency"] },
  { id: "media.polaroids",        label: "Polaroids · naturals",  tier: "global", section: "media",        defaultVisibility: ["agency"], countMin: 4 },
  { id: "media.portfolio",        label: "Portfolio",             tier: "global", section: "media",        defaultVisibility: ["public", "agency"], countMin: 3 },
  { id: "media.showreel",         label: "Showreel video",        tier: "global", section: "media",        defaultVisibility: ["public", "agency"] },
  { id: "media.moodboard",        label: "Mood / vibe board",     tier: "global", section: "media",        defaultVisibility: ["public", "agency"] },
  { id: "rates",                  label: "Rate card",             tier: "global", section: "rates",        defaultVisibility: ["agency"], countMin: 1 },
  { id: "travel.willingTravel",   label: "Willing to travel",     tier: "global", section: "travel", searchable: true, defaultVisibility: ["public", "agency"] },
  { id: "travel.passports",       label: "Passports held",        tier: "global", section: "travel",       defaultVisibility: ["agency"], countMin: 1 },
  { id: "travel.workAuth",        label: "Work eligibility",      tier: "global", section: "travel", searchable: true, defaultVisibility: ["agency"], countMin: 1 },
  { id: "serviceArea.driversLicense", label: "Driver's license",  tier: "global", section: "travel",       defaultVisibility: ["agency"] },
  { id: "serviceArea.ownsVehicle",label: "Owns a vehicle",        tier: "global", section: "travel",       defaultVisibility: ["agency"] },
  { id: "skills",                 label: "Skills & strengths",    tier: "global", section: "skills", searchable: true, defaultVisibility: ["public", "agency"], countMin: 1 },
  { id: "limits",                 label: "Limits / wardrobe",     tier: "global", section: "limits",       defaultVisibility: ["agency"], countMin: 1 },
  { id: "credits",                label: "Credits",               tier: "global", section: "credits",      defaultVisibility: ["public", "agency"], countMin: 1 },
  { id: "reviews",                label: "Reviews",               tier: "global", section: "reviews",      defaultVisibility: ["public", "agency"], countMin: 1 },
  { id: "links",                  label: "Social links",          tier: "global", section: "social",       defaultVisibility: ["public", "agency"], countMin: 1 },
  { id: "emergencyContact",       label: "Emergency contact",     tier: "global", section: "emergency",    defaultVisibility: ["private"] },
  { id: "documents",              label: "Documents",             tier: "global", section: "documents",    defaultVisibility: ["agency"], countMin: 1 },

  // ── TYPE-SPECIFIC: MODELS ─────────────────────────────────────────
  // The classic measurements set — required for fashion + commercial,
  // optional / inapplicable for body-type-agnostic types like
  // photographers, hosts, chefs.
  { id: "measurements.heightImperial", label: "Height (ft/in)",  tier: "type-specific", section: "measurements", searchable: true, appliesTo: ["models", "performers"], requiredFor: ["models"] },
  { id: "measurements.heightMetric",   label: "Height (cm)",     tier: "type-specific", section: "measurements", searchable: true, appliesTo: ["models", "performers"], requiredFor: ["models"] },
  { id: "measurements.bust",           label: "Bust",            tier: "type-specific", section: "measurements", appliesTo: ["models"], requiredFor: ["models"] },
  { id: "measurements.waist",          label: "Waist",           tier: "type-specific", section: "measurements", appliesTo: ["models"], requiredFor: ["models"] },
  { id: "measurements.hips",           label: "Hips",            tier: "type-specific", section: "measurements", appliesTo: ["models"], requiredFor: ["models"] },
  { id: "measurements.inseam",         label: "Inseam",          tier: "type-specific", section: "measurements", appliesTo: ["models"] },
  { id: "measurements.dress",          label: "Dress size",      tier: "type-specific", section: "wardrobe",     appliesTo: ["models", "hosts", "performers", "hospitality"] },
  { id: "measurements.suit",           label: "Suit size",       tier: "type-specific", section: "wardrobe",     appliesTo: ["models", "hosts"] },
  { id: "measurements.shoeEU",         label: "Shoe size (EU)",  tier: "type-specific", section: "wardrobe",     appliesTo: ["models", "performers"] },
  { id: "measurements.shoeUS",         label: "Shoe size (US)",  tier: "type-specific", section: "wardrobe",     appliesTo: ["models", "performers"] },
  { id: "measurements.shoeUK",         label: "Shoe size (UK)",  tier: "type-specific", section: "wardrobe",     appliesTo: ["models", "performers"] },
  { id: "measurements.hairColor",      label: "Hair color",      tier: "type-specific", section: "measurements", searchable: true, appliesTo: ["models", "hosts", "performers"], requiredFor: ["models"] },
  { id: "measurements.hairLength",     label: "Hair length",     tier: "type-specific", section: "measurements", appliesTo: ["models", "hosts", "performers"] },
  { id: "measurements.eyeColor",       label: "Eye color",       tier: "type-specific", section: "measurements", searchable: true, appliesTo: ["models", "hosts", "performers"] },
  { id: "measurements.skinTone",       label: "Skin tone",       tier: "type-specific", section: "measurements", searchable: true, appliesTo: ["models", "hosts", "performers"] },
  { id: "measurements.tattoos",        label: "Tattoos",         tier: "type-specific", section: "measurements", appliesTo: ["models", "hosts", "performers"] },
  { id: "measurements.piercings",      label: "Piercings",       tier: "type-specific", section: "measurements", appliesTo: ["models"] },

  // ── TYPE-SPECIFIC: per-parent dynamic fields ──────────────────────
  // These are sourced from `TAXONOMY_FIELDS[parentId]` and rendered
  // by the dynamic-field engine. Listing the parent ids here so the
  // catalog covers them; the actual schemas live in TAXONOMY_FIELDS.
  { id: "dyn.hosts",          label: "Host-type details",     tier: "type-specific", section: "type-specific", appliesTo: ["hosts"] },
  { id: "dyn.performers",     label: "Performer details",     tier: "type-specific", section: "type-specific", appliesTo: ["performers"] },
  { id: "dyn.photo_video",    label: "Photo/video kit",       tier: "type-specific", section: "type-specific", appliesTo: ["photo_video"] },
  { id: "dyn.wellness",       label: "Wellness modalities",   tier: "type-specific", section: "type-specific", appliesTo: ["wellness"] },
  { id: "dyn.hospitality",    label: "Hospitality skills",    tier: "type-specific", section: "type-specific", appliesTo: ["hospitality"] },
  { id: "dyn.transportation", label: "Vehicle + license",     tier: "type-specific", section: "type-specific", appliesTo: ["transportation"] },
  { id: "dyn.event_staff",    label: "Event staff tier",      tier: "type-specific", section: "type-specific", appliesTo: ["event_staff"] },
  { id: "dyn.security",       label: "Security credentials",  tier: "type-specific", section: "type-specific", appliesTo: ["security"] },
  // dyn.<parentId> placeholder entries removed — DERIVED_TYPE_FIELDS
  // below now provides the actual fields-per-type, sourced from
  // TAXONOMY_FIELDS. Consumers that called `fieldsForType("models")`
  // used to get an opaque "Model details" entry; now they get every
  // real field (height, bust, waist, etc.) keyed by `models.<short>`.
];

/**
 * The unified, public field catalog. Hardcoded universal + global +
 * a curated slice of measurement entries, concatenated with derived
 * type-specific entries from TAXONOMY_FIELDS. From the consumer's
 * point of view this is ONE source. The two storage forms are an
 * implementation detail — the catalog itself is the contract.
 */
// Lazy-built catalog — proxied so `FIELD_CATALOG.filter(...)`, `.find()`,
// `.map()`, indexing, length, iteration all transparently trigger the
// build on first access. Same shape consumers expect; the laziness is
// invisible at the call site.
let __fieldCatalogMemo: ReadonlyArray<FieldCatalogEntry> | null = null;
function buildFieldCatalog(): ReadonlyArray<FieldCatalogEntry> {
  if (__fieldCatalogMemo) return __fieldCatalogMemo;
  __fieldCatalogMemo = [...HARDCODED_FIELDS, ...getDerivedTypeFields()];
  return __fieldCatalogMemo;
}
export const FIELD_CATALOG: ReadonlyArray<FieldCatalogEntry> = new Proxy(
  [] as unknown as ReadonlyArray<FieldCatalogEntry>,
  {
    get(_t, prop, recv) {
      const arr = buildFieldCatalog();
      const v = (arr as unknown as Record<string | symbol, unknown>)[prop as string | symbol];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(arr) : v;
    },
    has(_t, prop) { return prop in buildFieldCatalog(); },
    ownKeys() { return Reflect.ownKeys(buildFieldCatalog() as object); },
    getOwnPropertyDescriptor(_t, prop) {
      return Reflect.getOwnPropertyDescriptor(buildFieldCatalog() as object, prop);
    },
  },
);

// =====================================================================
// Lookup helpers
// =====================================================================

/** All fields in a tier — useful for tier-bucketed UIs. */
export function fieldsByTier(tier: FieldTier): ReadonlyArray<FieldCatalogEntry> {
  return FIELD_CATALOG.filter(f => f.tier === tier);
}

/** All fields applicable to a given talent type (or types — pass an
 *  array for multi-role profiles). Universal + global + whichever
 *  type-specific entries opt-in via `appliesTo`. The union is taken
 *  so a model+singer profile sees both model fields and music fields. */
export function fieldsForType(
  parentId: TaxonomyParentId | ReadonlyArray<TaxonomyParentId>,
): ReadonlyArray<FieldCatalogEntry> {
  const parentIds: ReadonlyArray<TaxonomyParentId> = Array.isArray(parentId) ? parentId : [parentId];
  return FIELD_CATALOG.filter(f =>
    f.tier !== "type-specific"
    || !f.appliesTo
    || f.appliesTo.some(p => parentIds.includes(p))
  );
}

/** Whether a given field is required for a given talent type or set
 *  of types. Universal fields are always required. Type-specific
 *  fields are required when listed in `requiredFor` for ANY of the
 *  selected roles (logical OR). A field required for models only is
 *  still required for a "model + singer" profile. */
export function isRequiredForType(
  fieldId: string,
  parentId: TaxonomyParentId | ReadonlyArray<TaxonomyParentId>,
): boolean {
  const f = FIELD_CATALOG.find(x => x.id === fieldId);
  if (!f) return false;
  if (f.tier === "universal") return true;
  if (!f.requiredFor) return false;
  const parentIds: ReadonlyArray<TaxonomyParentId> = Array.isArray(parentId) ? parentId : [parentId];
  return f.requiredFor.some(p => parentIds.includes(p));
}

/** All catalog fields where `searchable: true`. Drives auto-generated
 *  filter UI on the workspace roster + public hub. */
export function searchableFields(): ReadonlyArray<FieldCatalogEntry> {
  return FIELD_CATALOG.filter(f => f.searchable);
}

/**
 * One-stop shop for the registration wizard + drawer dynamic-fields
 * accordion. Returns the type-specific catalog entries grouped by
 * parent, in the legacy `RegField` shape so existing renderers don't
 * need refactoring. Equivalent to `TAXONOMY_FIELDS[parentId]` for a
 * single type — but accepts multi-role for multi-type profiles.
 *
 * Single source of truth: every field comes from the catalog. The
 * legacy short id (height, bust, vibe, etc.) is preserved so dynFields
 * storage keys don't break.
 */
export function getDynamicFieldsForType(
  parentId: TaxonomyParentId | ReadonlyArray<TaxonomyParentId>,
): Array<{ parent: TaxonomyParentId; fields: ReadonlyArray<RegField> }> {
  const parentIds = Array.isArray(parentId) ? parentId : [parentId];
  return parentIds.map(p => {
    const entries = getDerivedTypeFields().filter(d => d.appliesTo?.includes(p));
    const fields: RegField[] = entries.map(d => ({
      id: d.legacyShortId,
      label: d.label,
      kind: d.kind ?? "text",
      optional: d.optional,
      placeholder: d.placeholder,
      helper: d.helper,
      options: d.options ? [...d.options] : undefined,
      sensitive: d.sensitive,
      defaultVisibility: d.defaultVisibility,
      subsection: d.subsection,
    }));
    return { parent: p, fields };
  });
}

/**
 * Mode-aware field filter for a given consumer surface. Pass
 * `mode: "registration"` for the wizard, `"editDrawer"` for the
 * profile shell, `"public"` for the public profile renderer,
 * `"directory"` for the roster card. Catalog flags decide visibility.
 *
 * Future: wired against `workspace_profile_field_settings` so an
 * agency can override (e.g. hide a field from registration even
 * though the catalog default is to show it).
 */
export type FieldConsumerMode = "registration" | "editDrawer" | "public" | "directory";
export function fieldsForMode(
  mode: FieldConsumerMode,
  parentId?: TaxonomyParentId | ReadonlyArray<TaxonomyParentId>,
): ReadonlyArray<FieldCatalogEntry> {
  const candidates = parentId ? fieldsForType(parentId) : FIELD_CATALOG;
  return candidates.filter(f => {
    switch (mode) {
      case "registration": return f.showInRegistration !== false && f.tier !== "global";
      case "editDrawer":   return f.showInEditDrawer !== false;
      case "public":       return f.showInPublic === true
                              || (f.showInPublic === undefined && f.defaultVisibility?.includes("public"));
      case "directory":    return f.showInDirectory === true;
    }
  });
}

// =====================================================================
// Drawer-section bridge
// =====================================================================
//
// The catalog uses a clean section taxonomy (15 sections). The drawer's
// accordion uses a slightly more granular id list because it splits
// some of the catalog's sections into multiple UX-level surfaces (e.g.
// "media" → "media" + "albums" + "polaroids"). This map projects
// drawer ids back to one or more catalog sections so drawer code can
// ask "does this section have any applicable fields for the current
// talent type?" via `sectionAppliesToType()`.
//
// IDs that aren't in this map (e.g. "admin", "verifications") are
// always shown — they're not catalog-driven.

/** Drawer accordion ids, in the order the drawer renders them. */
export type DrawerSectionId =
  | "identity"
  | "services"
  | "location"
  | "media"
  | "albums"
  | "polaroids"
  | "about"
  | "physical"        // body measurements (height/bust/waist/hips/hair/eyes/skin/tattoos)
  | "wardrobe"        // shoe / dress / suit sizes
  | "details"
  | "rates"
  | "availability"
  | "languages"
  | "identity_meta"   // identity sub-section (nationality, response time)
  | "refinement"      // skills + contexts
  | "credits"
  | "limits"
  | "files"           // documents
  | "social_proof"
  | "verifications"
  | "admin";

const DRAWER_SECTION_TO_CATALOG: Partial<Record<DrawerSectionId, ReadonlyArray<FieldCatalogSection>>> = {
  identity:      ["identity"],
  location:      ["location", "travel"],
  media:         ["media", "measurements", "wardrobe"],   // physical traits live alongside media in the drawer
  albums:        ["media"],
  polaroids:     ["media"],
  about:         ["identity"],
  physical:      ["measurements"],
  wardrobe:      ["wardrobe"],
  details:       ["type-specific"],
  rates:         ["rates"],
  languages:     ["languages"],
  refinement:    ["skills"],
  credits:       ["credits", "reviews"],
  limits:        ["limits"],
  files:         ["documents"],
  social_proof:  ["social"],
  // services/availability/identity_meta/verifications/admin: not catalog-gated.
};

/** Should a drawer accordion section render for this talent type?
 *  True when the section is not catalog-mapped (always-on chrome) OR
 *  when the catalog has at least one applicable field for the type
 *  (or any of multi-role types). */
export function sectionAppliesToType(
  sectionId: DrawerSectionId,
  parentId: TaxonomyParentId | ReadonlyArray<TaxonomyParentId> | null
): boolean {
  const mapped = DRAWER_SECTION_TO_CATALOG[sectionId];
  if (!mapped) return true; // always-on chrome
  if (!parentId || (Array.isArray(parentId) && parentId.length === 0)) return true; // no type picked yet
  const applicable = fieldsForType(parentId);
  return applicable.some(f => mapped.includes(f.section));
}

// =====================================================================
// Completeness math
// =====================================================================
//
// Replaces the hand-tuned `completeness` int that was hardcoded on
// MY_TALENT_PROFILE. Counts applicable fields, counts filled fields,
// returns a percentage 0–100. Each field's "filled" check is path-
// based against a source-of-truth profile object.

/** Resolve a dotted path like "measurements.bust" against a profile. */
function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Is a resolved value considered "filled" for completeness purposes?
 *  Strings need to be non-empty + not the placeholder "—"; arrays need
 *  to satisfy `countMin` (default 1); objects need to be non-null;
 *  booleans count as filled (the answer itself is the value). */
function isFilled(value: unknown, countMin?: number): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 && t !== "—" && t !== "-";
  }
  if (Array.isArray(value)) {
    return value.length >= (countMin ?? 1);
  }
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return true;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return false;
}

/** Result of a completeness pass — percent + the actual list of fields
 *  that aren't filled, so the dashboard can deep-link to each. */
export type ProfileCompleteness = {
  /** 0–100, integer. */
  percent: number;
  /** Total catalog fields applicable to this talent's primaryType. */
  applicable: number;
  /** Number of applicable fields actually filled. */
  filled: number;
  /** Field ids that are still missing — useful for jump-to-section UIs. */
  missing: ReadonlyArray<{ id: string; label: string; section: FieldCatalogSection }>;
};

/**
 * Compute completeness for a talent. Path-resolves each catalog entry
 * against the merged profile + ProfileState shape. Falls back gracefully
 * when a path doesn't resolve (treats as missing). Type-specific fields
 * for non-applicable types are excluded from the denominator.
 */
export function computeProfileCompleteness(
  profile: MyTalentProfile,
  primaryType: TaxonomyParentId | ReadonlyArray<TaxonomyParentId> | null
): ProfileCompleteness {
  // Filter to fields that actually apply to this talent. When types
  // are unknown, default to a generic "models" denominator so the
  // demo's hardcoded talent (Marta) gets a realistic number. Accepts
  // multi-role: a model+singer's denominator includes both type's
  // applicable fields.
  const effectiveTypes: ReadonlyArray<TaxonomyParentId> =
    !primaryType
      ? (["models"] as TaxonomyParentId[])
      : Array.isArray(primaryType)
        ? (primaryType.length > 0 ? primaryType : (["models"] as TaxonomyParentId[]))
        : [primaryType as TaxonomyParentId];
  const applicable = fieldsForType(effectiveTypes).filter(f => {
    // Skip purely UI-only entries — these don't have a backing path.
    if (f.id.startsWith("dyn.")) return false;
    if (f.id === "consent.terms") return false; // implicit
    if (f.id === "media.headshot") return false; // composed elsewhere
    return true;
  });

  const missing: Array<{ id: string; label: string; section: FieldCatalogSection }> = [];
  let filled = 0;
  for (const f of applicable) {
    // Special-case media.* paths — the talent's albumsPro / polaroids /
    // showreel / portfolioVideos shape doesn't follow `media.*` exactly.
    let value: unknown;
    if (f.id === "media.coverPhoto")  value = profile.coverPhoto;
    else if (f.id === "media.portfolio")  value = profile.portfolioVideos;     // proxy: presence of any media work
    else if (f.id === "media.showreel")   value = profile.showreelUrl ?? profile.showreelThumb;
    else if (f.id === "media.moodboard")  value = undefined; // not yet on type
    else if (f.id === "media.polaroids")  value = profile.profilePhoto;        // proxy: profile photo present
    else if (f.id === "identity.contactEmail" || f.id === "identity.contactPhone") {
      // Not on MyTalentProfile yet — count as filled for the demo.
      value = "—";
      // Force unfilled by leaving as placeholder; isFilled() returns false.
    }
    // tagline + bios live on ProfileState, not MyTalentProfile —
    // skip in MyTalentProfile-only completeness math; treated as
    // "filled" here so the percent isn't penalized for shape gaps.
    else if (f.id === "identity.tagline" || f.id === "bios") {
      filled++;
      continue;
    }
    else value = resolvePath(profile, f.id);

    if (isFilled(value, f.countMin)) {
      filled++;
    } else {
      missing.push({ id: f.id, label: f.label, section: f.section });
    }
  }
  const percent = applicable.length === 0 ? 0 : Math.round((filled / applicable.length) * 100);
  return { percent, applicable: applicable.length, filled, missing };
}

// =====================================================================
// Phase E — Workspace Field Settings
// =====================================================================
//
// Per-tenant overrides on top of the platform field catalog. Mirrors
// the production table `workspace_profile_field_settings` (see
// supabase/migrations/20260901120200_workspace_profile_field_settings.sql).
// Today the prototype keeps overrides in a module-level Map +
// localStorage, indexed by tenant id; production reads/writes Supabase.
//
// Override semantics:
//   - sparse: only fields the workspace touched have a row
//   - per-field: every catalog mode flag has an *_override
//   - NULL/undefined override = "use catalog default"
//   - universal-tier fields ignore enabledOverride (you can't disable
//     legalName, pronouns, etc.) — the merge layer enforces this
//
// Surfaces that read fields call `applyWorkspaceFieldOverrides()`
// (or use the `tenantId` arg on `fieldsForType` / `fieldsForMode`)
// to get a merged view. The settings UI writes here; the talent
// drawer + wizard read merged catalog through the same helpers.

export type WorkspaceFieldOverride = {
  /** When FALSE, the field is hidden from every surface for this
   *  workspace. Universal-tier fields ignore this (you can't turn off
   *  legalName, pronouns, etc.). */
  enabled?: boolean;
  /** TRUE forces required; FALSE forces optional. NULL = catalog. */
  required?: boolean;
  showInRegistration?: boolean;
  showInEditDrawer?: boolean;
  showInPublic?: boolean;
  showInDirectory?: boolean;
  adminOnly?: boolean;
  talentEditable?: boolean;
  requiresReviewOnChange?: boolean;
  customLabel?: string;
  customHelper?: string;
  /** Per-tenant display order within a section. */
  displayOrder?: number;
  /** Override the catalog's default visibility array. */
  defaultVisibility?: ReadonlyArray<RegFieldChannel>;
};

/** Single override scope: one tenant's field-id → override map. */
type TenantOverrides = Record<string, WorkspaceFieldOverride>;

const WORKSPACE_FIELD_OVERRIDES_LS_KEY = "tulala.proto.workspaceFieldOverrides";

function safeLoadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}
function safeSaveJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or privacy mode */
  }
}

const __workspaceOverrides: Record<string, TenantOverrides> =
  safeLoadJSON<Record<string, TenantOverrides>>(WORKSPACE_FIELD_OVERRIDES_LS_KEY, {});
const __workspaceOverrideSubscribers = new Set<() => void>();

/** Convention: a single demo tenant id used by the prototype. Production
 *  pulls from auth context. */
export const PROTO_TENANT_ID = "tenant.acme-models";

export function setWorkspaceFieldOverride(
  tenantId: string,
  fieldKey: string,
  patch: WorkspaceFieldOverride,
) {
  const current = __workspaceOverrides[tenantId] ?? {};
  const merged: WorkspaceFieldOverride = { ...(current[fieldKey] ?? {}), ...patch };
  // Strip undefined keys so the row stays clean on JSON-roundtrip.
  for (const k of Object.keys(merged) as Array<keyof WorkspaceFieldOverride>) {
    if (merged[k] === undefined) delete merged[k];
  }
  // If the override is empty after merge, drop the row — caller probably
  // reset every field to "use catalog default". Keeps storage tidy.
  if (Object.keys(merged).length === 0) {
    const next = { ...current };
    delete next[fieldKey];
    __workspaceOverrides[tenantId] = next;
  } else {
    __workspaceOverrides[tenantId] = { ...current, [fieldKey]: merged };
  }
  safeSaveJSON(WORKSPACE_FIELD_OVERRIDES_LS_KEY, __workspaceOverrides);
  __workspaceOverrideSubscribers.forEach(fn => fn());
}

export function clearWorkspaceFieldOverride(tenantId: string, fieldKey: string) {
  const current = __workspaceOverrides[tenantId];
  if (!current || !current[fieldKey]) return;
  const next = { ...current };
  delete next[fieldKey];
  __workspaceOverrides[tenantId] = next;
  safeSaveJSON(WORKSPACE_FIELD_OVERRIDES_LS_KEY, __workspaceOverrides);
  __workspaceOverrideSubscribers.forEach(fn => fn());
}

export function getWorkspaceFieldOverrides(tenantId: string): TenantOverrides {
  return __workspaceOverrides[tenantId] ?? {};
}

export function subscribeWorkspaceFieldOverride(fn: () => void): () => void {
  __workspaceOverrideSubscribers.add(fn);
  return () => { __workspaceOverrideSubscribers.delete(fn); };
}

/** React hook — components reading the merged catalog call this to
 *  re-render whenever any override changes. */
export function useWorkspaceFieldOverrideSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = subscribeWorkspaceFieldOverride(() => force(n => n + 1));
    return unsub;
  }, []);
}

/** Resolved field — catalog default merged with any workspace override.
 *  Mirrors `ResolvedFieldDefinition` in the DB service so consumers
 *  can swap implementations without changing call sites. */
export type ResolvedFieldDefinition = FieldCatalogEntry & {
  enabled: boolean;
  /** TRUE when an override is active (any field). Lets the UI badge
   *  the row to show "this is customized for your workspace". */
  hasOverride: boolean;
};

/** Merge a catalog entry with the workspace override for a tenant.
 *  Universal-tier ignores enabledOverride. */
export function applyWorkspaceFieldOverride(
  entry: FieldCatalogEntry,
  tenantId: string | null | undefined,
): ResolvedFieldDefinition {
  if (!tenantId) {
    return {
      ...entry,
      enabled: true,
      hasOverride: false,
    };
  }
  const tenantOverrides = __workspaceOverrides[tenantId];
  const override = tenantOverrides?.[entry.id];
  if (!override) {
    return { ...entry, enabled: true, hasOverride: false };
  }
  // Universal-tier fields cannot be disabled.
  const enabled = entry.tier === "universal" ? true
    : (override.enabled ?? true);
  // required override flips the optional flag.
  const optional = override.required === true ? false
    : override.required === false ? true
    : entry.optional;
  return {
    ...entry,
    label: override.customLabel ?? entry.label,
    helper: override.customHelper ?? entry.helper,
    optional,
    showInRegistration: override.showInRegistration ?? entry.showInRegistration,
    showInEditDrawer: override.showInEditDrawer ?? entry.showInEditDrawer,
    showInPublic: override.showInPublic ?? entry.showInPublic,
    showInDirectory: override.showInDirectory ?? entry.showInDirectory,
    adminOnly: override.adminOnly ?? entry.adminOnly,
    talentEditable: override.talentEditable ?? entry.talentEditable,
    requiresReviewOnChange: override.requiresReviewOnChange ?? entry.requiresReviewOnChange,
    defaultVisibility: override.defaultVisibility ?? entry.defaultVisibility,
    order: override.displayOrder ?? entry.order,
    enabled,
    hasOverride: true,
  };
}

/** Resolve the entire catalog through workspace overrides. Filters out
 *  fields disabled by the workspace (except universal). */
export function resolvedCatalogFor(
  tenantId: string | null | undefined,
): ReadonlyArray<ResolvedFieldDefinition> {
  return FIELD_CATALOG
    .map(f => applyWorkspaceFieldOverride(f, tenantId))
    .filter(f => f.enabled);
}

/** Mode-aware resolved catalog. Identical in spirit to `fieldsForMode`
 *  but applies workspace overrides first. Use this for surfaces that
 *  must respect tenant settings (registration wizard, edit drawer,
 *  public profile). */
export function resolvedFieldsForMode(
  mode: FieldConsumerMode,
  tenantId: string | null | undefined,
  parentId?: TaxonomyParentId | ReadonlyArray<TaxonomyParentId>,
): ReadonlyArray<ResolvedFieldDefinition> {
  const base = parentId
    ? fieldsForType(parentId)
    : FIELD_CATALOG;
  return base
    .map(f => applyWorkspaceFieldOverride(f, tenantId))
    .filter(f => {
      if (!f.enabled) return false;
      switch (mode) {
        case "registration": return f.showInRegistration !== false && f.tier !== "global";
        case "editDrawer":   return f.showInEditDrawer !== false;
        case "public":       return f.showInPublic === true
                                || (f.showInPublic === undefined && f.defaultVisibility?.includes("public"));
        case "directory":    return f.showInDirectory === true;
      }
    });
}

/** Count active overrides for a tenant — drives the "X overrides
 *  active" summary in the settings UI. */
export function countWorkspaceOverrides(tenantId: string): number {
  return Object.keys(__workspaceOverrides[tenantId] ?? {}).length;
}

// =====================================================================
// Phase A3 — Unified field validation
// =====================================================================
//
// Single source for "does this value pass the catalog's requirements?"
// Used by:
//   - Talent Registration wizard (canStep5 per-step gates)
//   - NewTalentDrawer (admin add — disabled-button reason)
//   - TalentProfileShellDrawer (publish-gate `missing[]`)
//   - public profile renderer (in production, refuse to publish a
//     row that fails universal validation)
//
// Returns a typed result rather than a boolean so callers can show
// the same copy in different chrome (toast, button tooltip, inline
// error). Workspace overrides apply via `applyWorkspaceFieldOverride`
// so a tenant who forced a field required gets the same message as
// the catalog default.

export type FieldValidationResult =
  | { ok: true }
  | { ok: false; code: "required" | "below_count_min"; message: string };

export function validateField(
  field: FieldCatalogEntry,
  value: unknown,
  parentTypes: TaxonomyParentId | ReadonlyArray<TaxonomyParentId> | null,
  tenantId: string | null = PROTO_TENANT_ID,
): FieldValidationResult {
  const resolved = applyWorkspaceFieldOverride(field, tenantId);
  if (!resolved.enabled) return { ok: true };
  // required-ness: workspace override > catalog requiredFor > field.optional
  const types = parentTypes
    ? (Array.isArray(parentTypes) ? parentTypes : [parentTypes])
    : [];
  const required = (() => {
    if (resolved.optional === false) return true;
    if (resolved.optional === true) return false;
    if (resolved.tier === "universal") return true;
    if (resolved.requiredFor && types.length > 0) {
      return resolved.requiredFor.some(p => types.includes(p));
    }
    return false;
  })();
  if (!required) return { ok: true };
  // Count-based: e.g. portfolio needs >=3 items, languages needs >=1.
  if (resolved.countMin) {
    const arr = Array.isArray(value) ? value : (value == null ? [] : [value]);
    if (arr.length < resolved.countMin) {
      return {
        ok: false,
        code: "below_count_min",
        message: `${resolved.label} needs at least ${resolved.countMin} ${resolved.countMin === 1 ? "entry" : "entries"}.`,
      };
    }
    return { ok: true };
  }
  // Empty check (string trim, array length).
  if (value === null || value === undefined) {
    return { ok: false, code: "required", message: `${resolved.label} is required.` };
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return { ok: false, code: "required", message: `${resolved.label} is required.` };
  }
  if (Array.isArray(value) && value.length === 0) {
    return { ok: false, code: "required", message: `${resolved.label} is required.` };
  }
  return { ok: true };
}

/** Validate every applicable required field. Returns the first
 *  failure for each field id; empty map = profile is publishable. */
export function validateProfile(
  values: Record<string, unknown>,
  parentTypes: TaxonomyParentId | ReadonlyArray<TaxonomyParentId>,
  tenantId: string | null = PROTO_TENANT_ID,
): Record<string, FieldValidationResult & { ok: false }> {
  const failures: Record<string, FieldValidationResult & { ok: false }> = {};
  const applicable = fieldsForType(parentTypes);
  for (const f of applicable) {
    if (f.id.startsWith("dyn.")) continue; // skip placeholder
    const r = validateField(f, values[f.id], parentTypes, tenantId);
    if (!r.ok) failures[f.id] = r;
  }
  return failures;
}
