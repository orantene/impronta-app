import type {
  BuilderNode,
  BuilderNodeFieldBindings,
  BuilderNodeKind,
} from "./types";

export type BuilderDataSourceKey =
  | "workspace_profile"
  | "featured_talent_profiles"
  | "tenant_directory_search"
  | "talent_locations"
  | "inquiry_path"
  | "cms_page"
  | "asset"
  | "custom_field";

export type BuilderDataBindingMode = "manual" | "bound" | "hybrid";

export interface BuilderDataBinding {
  sourceKey: string;
  mode?: BuilderDataBindingMode;
  filterQuery?: string;
  maxItems?: number;
  repeat?: boolean;
}

export type BuilderFieldBindingProp = "text" | "label" | "href" | "src" | "alt";

export interface BuilderDataSourceFieldDefinition {
  key: string;
  label: string;
  kind: "text" | "image" | "href";
}

export interface BuilderDataSourceDefinition {
  key: BuilderDataSourceKey;
  label: string;
  description: string;
  examples: ReadonlyArray<string>;
  fields?: ReadonlyArray<BuilderDataSourceFieldDefinition>;
  recommendedMaxItems?: number;
  supportsManualSelection: boolean;
  supportsFiltering: boolean;
  requiredPlan: "free" | "studio" | "agency" | "network";
}

export type BuilderDataSourceRecord = Readonly<Record<string, unknown>>;

export interface BuilderRepeatItem {
  key: string;
  sourceKey: string;
  index: number;
  fields: Readonly<Record<string, string>>;
  raw: BuilderDataSourceRecord;
}

export type BuilderDataBindingFindingSeverity = "info" | "warning" | "error";

export interface BuilderDataBindingFinding {
  id: string;
  severity: BuilderDataBindingFindingSeverity;
  message: string;
  fix?: Partial<BuilderDataBinding>;
}

export interface BuilderDataBindingTreeFinding extends BuilderDataBindingFinding {
  nodeId: string;
  nodeKind: BuilderNodeKind;
}

const PLAN_RANK: Record<string, number> = {
  free: 0,
  studio: 1,
  agency: 2,
  network: 3,
  legacy: 3,
};

const FEATURED_TALENT_FIELDS: ReadonlyArray<BuilderDataSourceFieldDefinition> = [
  { key: "displayName", label: "Display name", kind: "text" },
  { key: "primaryTalentTypeLabel", label: "Primary type", kind: "text" },
  { key: "secondaryTalentTypeLabel", label: "Secondary type", kind: "text" },
  { key: "locationLabel", label: "Location", kind: "text" },
  { key: "thumbnailUrl", label: "Image", kind: "image" },
  { key: "href", label: "Profile link", kind: "href" },
];

const DIRECTORY_FIELDS: ReadonlyArray<BuilderDataSourceFieldDefinition> = [
  { key: "name", label: "Name", kind: "text" },
  { key: "slug", label: "Slug", kind: "text" },
  { key: "href", label: "Directory link", kind: "href" },
];

const LOCATION_FIELDS: ReadonlyArray<BuilderDataSourceFieldDefinition> = [
  { key: "displayName", label: "Location", kind: "text" },
  { key: "talentCount", label: "Talent count", kind: "text" },
  { key: "citySlug", label: "Location slug", kind: "text" },
  { key: "href", label: "Location link", kind: "href" },
];

const GENERIC_FIELDS: ReadonlyArray<BuilderDataSourceFieldDefinition> = [
  { key: "title", label: "Title", kind: "text" },
  { key: "description", label: "Description", kind: "text" },
  { key: "imageUrl", label: "Image", kind: "image" },
  { key: "href", label: "Link", kind: "href" },
];

export const BUILDER_DATA_SOURCE_REGISTRY: ReadonlyArray<BuilderDataSourceDefinition> = [
  {
    key: "workspace_profile",
    label: "Workspace profile",
    description: "Tenant name, brand, location, and public contact metadata.",
    examples: ["Agency name", "Primary market", "Brand intro"],
    fields: GENERIC_FIELDS,
    supportsManualSelection: false,
    supportsFiltering: false,
    requiredPlan: "free",
  },
  {
    key: "featured_talent_profiles",
    label: "Roster talent",
    description: "Published talent profiles owned by the workspace.",
    examples: ["Featured talent", "Latest public profiles", "Selected models"],
    fields: FEATURED_TALENT_FIELDS,
    recommendedMaxItems: 5,
    supportsManualSelection: true,
    supportsFiltering: true,
    requiredPlan: "free",
  },
  {
    key: "tenant_directory_search",
    label: "Directory taxonomy",
    description: "Public categories, skills, disciplines, and browsable groups.",
    examples: ["Talent types", "Service categories", "Skill clusters"],
    fields: DIRECTORY_FIELDS,
    recommendedMaxItems: 8,
    supportsManualSelection: true,
    supportsFiltering: true,
    requiredPlan: "free",
  },
  {
    key: "talent_locations",
    label: "Locations",
    description: "Markets and places inferred from published talent coverage.",
    examples: ["Cancun", "Ibiza", "Tulum"],
    fields: LOCATION_FIELDS,
    recommendedMaxItems: 6,
    supportsManualSelection: true,
    supportsFiltering: true,
    requiredPlan: "studio",
  },
  {
    key: "inquiry_path",
    label: "Inquiry path",
    description: "Contact, booking, and request-a-brief entry points.",
    examples: ["Book talent", "Start inquiry", "Request availability"],
    fields: GENERIC_FIELDS,
    supportsManualSelection: false,
    supportsFiltering: false,
    requiredPlan: "free",
  },
  {
    key: "cms_page",
    label: "CMS page",
    description: "Published CMS pages and editorial entries.",
    examples: ["Journal index", "Featured story", "Press page"],
    fields: GENERIC_FIELDS,
    recommendedMaxItems: 4,
    supportsManualSelection: true,
    supportsFiltering: true,
    requiredPlan: "studio",
  },
  {
    key: "asset",
    label: "Asset library",
    description: "Workspace images, videos, documents, and reusable media.",
    examples: ["Hero image", "Gallery set", "PDF deck"],
    fields: GENERIC_FIELDS,
    recommendedMaxItems: 12,
    supportsManualSelection: true,
    supportsFiltering: true,
    requiredPlan: "studio",
  },
  {
    key: "custom_field",
    label: "Custom fields",
    description: "Structured workspace fields configured for reusable content.",
    examples: ["Trust metrics", "Service stats", "Pricing notes"],
    fields: GENERIC_FIELDS,
    recommendedMaxItems: 10,
    supportsManualSelection: true,
    supportsFiltering: true,
    requiredPlan: "agency",
  },
] as const;

/**
 * WS4 §D — preview-subject scope for a `workspace_profile`-bound node.
 *
 * The `workspace_profile` source resolves tenant name/brand/contact metadata
 * from the active tenant. When the editor renders against a `workspace` preview
 * subject, a `workspace_profile` binding must resolve from `previewSubject.id`
 * instead of the active tenant. Mirrors `resolveSectionEmbedSubjectScope` for
 * `section_embed` nodes; `previewSubject == null` (the published default)
 * returns the active tenant unchanged.
 */
export function resolveWorkspaceProfileSubjectTenantId(input: {
  sourceKey: string;
  tenantId: string;
  previewSubject?: { kind: "talent" | "workspace"; id: string } | null;
}): string {
  const { sourceKey, tenantId, previewSubject } = input;
  if (!previewSubject) return tenantId;
  if (normalizeDataSourceKey(sourceKey) !== "workspace_profile") return tenantId;
  return previewSubject.kind === "workspace" ? previewSubject.id : tenantId;
}

const DATA_BINDING_NODE_KINDS = new Set<BuilderNodeKind>(["section", "container"]);
const FIELD_BINDING_PROPS_BY_KIND: Partial<
  Record<BuilderNodeKind, ReadonlyArray<BuilderFieldBindingProp>>
> = {
  heading: ["text"],
  paragraph: ["text"],
  rich_text: ["text"],
  button: ["label", "href"],
  image: ["src", "alt"],
};

export const BUILDER_FIELD_BINDING_OPTIONS: ReadonlyArray<BuilderDataSourceFieldDefinition> =
  Array.from(
    new Map(
      BUILDER_DATA_SOURCE_REGISTRY.flatMap((source) => source.fields ?? []).map(
        (field) => [field.key, field],
      ),
    ).values(),
  );

export function builderNodeSupportsDataBinding(kind: BuilderNodeKind): boolean {
  return DATA_BINDING_NODE_KINDS.has(kind);
}

export function builderNodeSupportsFieldBindings(kind: BuilderNodeKind): boolean {
  return Boolean(FIELD_BINDING_PROPS_BY_KIND[kind]?.length);
}

export function getBuilderNodeFieldBindingProps(
  kind: BuilderNodeKind,
): ReadonlyArray<BuilderFieldBindingProp> {
  return FIELD_BINDING_PROPS_BY_KIND[kind] ?? [];
}

export function getBuilderDataSourceDefinition(
  sourceKey: string | null | undefined,
): BuilderDataSourceDefinition | null {
  if (!sourceKey) return null;
  if (isCollectionDataSourceKey(sourceKey)) {
    return collectionDataSourceDefinition(sourceKey);
  }
  const normalizedSourceKey = normalizeDataSourceKey(sourceKey);
  return BUILDER_DATA_SOURCE_REGISTRY.find((source) => source.key === normalizedSourceKey) ?? null;
}

// ── operator-defined collections as a bindable source (Wave 5A, #36) ─────────
// A user collection is addressed by the opaque sourceKey `collection:<id>`. The
// renderer already resolves `dataSources.collections[sourceKey]` FIRST in
// `collectionRecordsForSource`, so a collection source flows through the repeat
// path with no renderer change — this layer just makes the binding model +
// inspector + findings RECOGNIZE the `collection:` form (so it is not flagged
// "unknown source") and lets the inspector surface friendly labels + fields for
// the workspace's actual collections via {@link BuilderCollectionDataSource}.

export const BUILDER_COLLECTION_SOURCE_PREFIX = "collection:";

/** A workspace collection projected into the data-source picker. */
export interface BuilderCollectionDataSource {
  /** The opaque sourceKey, e.g. "collection:9f3…". */
  sourceKey: string;
  /** Collection display name, e.g. "Team". */
  label: string;
  /** The collection's field schema, surfaced as bindable fields. */
  fields: ReadonlyArray<BuilderDataSourceFieldDefinition>;
  /** Number of content rows (for the inspector summary). */
  itemCount?: number;
}

export function isCollectionDataSourceKey(
  sourceKey: string | null | undefined,
): boolean {
  return (
    typeof sourceKey === "string" &&
    sourceKey.startsWith(BUILDER_COLLECTION_SOURCE_PREFIX) &&
    sourceKey.length > BUILDER_COLLECTION_SOURCE_PREFIX.length
  );
}

/**
 * Synthetic data-source definition for a `collection:<id>` sourceKey. When the
 * matching {@link BuilderCollectionDataSource} is supplied (the inspector has
 * the workspace's collections loaded) its name + fields are used; otherwise a
 * generic, still-valid definition is returned so a saved binding to a
 * not-yet-loaded collection never reads as an error.
 */
export function collectionDataSourceDefinition(
  sourceKey: string,
  collection?: BuilderCollectionDataSource | null,
): BuilderDataSourceDefinition {
  return {
    key: sourceKey as BuilderDataSourceKey,
    label: collection?.label ?? "Collection",
    description: collection
      ? `Your "${collection.label}" collection (${collection.itemCount ?? 0} item${
          (collection.itemCount ?? 0) === 1 ? "" : "s"
        }).`
      : "An operator-defined content collection.",
    examples: [],
    fields: collection?.fields?.length ? collection.fields : GENERIC_FIELDS,
    recommendedMaxItems: undefined,
    supportsManualSelection: false,
    supportsFiltering: true,
    requiredPlan: "free",
  };
}

/** Field-binding options for a specific collection source (its own fields). */
export function getCollectionFieldBindingOptions(
  collection: BuilderCollectionDataSource | null | undefined,
): ReadonlyArray<BuilderDataSourceFieldDefinition> {
  return collection?.fields?.length ? collection.fields : GENERIC_FIELDS;
}

function normalizeDataSourceKey(sourceKey: string): string {
  switch (sourceKey) {
    case "roster_talent":
      return "featured_talent_profiles";
    case "taxonomy_category":
      return "tenant_directory_search";
    case "location":
      return "talent_locations";
    default:
      return sourceKey;
  }
}

export function getDefaultBuilderDataBinding(
  sourceKey: BuilderDataSourceKey,
): BuilderDataBinding {
  const source = getBuilderDataSourceDefinition(sourceKey);
  return {
    sourceKey,
    mode: source?.supportsManualSelection ? "bound" : undefined,
    maxItems: source?.recommendedMaxItems,
  };
}

export function builderDataSourceAllowedForPlan(
  sourceKey: string,
  workspacePlan: string | null | undefined,
): boolean {
  const source = getBuilderDataSourceDefinition(sourceKey);
  if (!source) return false;
  const currentRank = PLAN_RANK[workspacePlan ?? "free"] ?? PLAN_RANK.free;
  const requiredRank = PLAN_RANK[source.requiredPlan] ?? PLAN_RANK.network;
  return currentRank >= requiredRank;
}

export function normalizeBuilderDataBinding(
  value: unknown,
): BuilderDataBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const sourceKey = typeof record.sourceKey === "string" ? record.sourceKey.trim() : "";
  if (!sourceKey) return null;
  const normalizedSourceKey = normalizeDataSourceKey(sourceKey);
  const mode = normalizeBindingMode(record.mode);
  const filterQuery =
    typeof record.filterQuery === "string" && record.filterQuery.trim()
      ? record.filterQuery.trim()
      : undefined;
  const maxItems =
    typeof record.maxItems === "number" &&
    Number.isInteger(record.maxItems) &&
    record.maxItems > 0
      ? Math.min(record.maxItems, 100)
      : undefined;
  const binding: BuilderDataBinding = { sourceKey: normalizedSourceKey };
  if (mode) binding.mode = mode;
  if (filterQuery) binding.filterQuery = filterQuery;
  if (maxItems) binding.maxItems = maxItems;
  if (record.repeat === true) binding.repeat = true;
  return binding;
}

export function isBuilderDataBindingRepeater(
  binding: BuilderDataBinding | null | undefined,
): boolean {
  return binding?.repeat === true;
}

export function normalizeBuilderFieldBindings(
  value: unknown,
  allowedProps?: ReadonlyArray<BuilderFieldBindingProp>,
): BuilderNodeFieldBindings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allowed = new Set<BuilderFieldBindingProp>(
    allowedProps ?? ["text", "label", "href", "src", "alt"],
  );
  const out: BuilderNodeFieldBindings = {};
  for (const prop of allowed) {
    const raw = (value as Record<string, unknown>)[prop];
    if (typeof raw === "string" && raw.trim()) {
      out[prop] = raw.trim().slice(0, 160);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function getBuilderNodeDataBinding(node: BuilderNode): BuilderDataBinding | null {
  if (!builderNodeSupportsDataBinding(node.kind)) return null;
  return normalizeBuilderDataBinding(
    (node.props as Record<string, unknown>).dataBinding,
  );
}

const FIELD_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function hasBuilderFieldTokens(value: string): boolean {
  return /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/.test(value);
}

export function normalizeBuilderFieldBindingTemplate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return hasBuilderFieldTokens(trimmed) ? trimmed : `{{${trimmed}}}`;
}

export function resolveBuilderFieldTokens(
  template: string,
  item: BuilderRepeatItem | null | undefined,
): string {
  if (!item) return template;
  return template.replace(FIELD_TOKEN_RE, (_match, key: string) => {
    return item.fields[key] ?? "";
  });
}

export function resolveBuilderFieldBindingValue(
  fallbackValue: string,
  bindingTemplate: string | null | undefined,
  item: BuilderRepeatItem | null | undefined,
): { value: string; bound: boolean } {
  if (!item) return { value: fallbackValue, bound: false };
  if (bindingTemplate?.trim()) {
    return {
      value: resolveBuilderFieldTokens(
        normalizeBuilderFieldBindingTemplate(bindingTemplate),
        item,
      ),
      bound: true,
    };
  }
  if (hasBuilderFieldTokens(fallbackValue)) {
    return {
      value: resolveBuilderFieldTokens(fallbackValue, item),
      bound: true,
    };
  }
  return { value: fallbackValue, bound: false };
}

export function resolveBuilderDataBindingCollection(
  binding: BuilderDataBinding | null | undefined,
  records: ReadonlyArray<BuilderDataSourceRecord> | null | undefined,
): BuilderRepeatItem[] {
  const normalized = normalizeBuilderDataBinding(binding);
  if (!normalized || !records?.length) return [];
  const fieldsByRecord = records.map((record) => ({
    record,
    fields: stringifyRecordFields(record),
  }));
  const filterQuery = normalized.filterQuery?.trim().toLowerCase();
  const filtered = filterQuery
    ? fieldsByRecord.filter(({ fields }) => recordMatchesFilter(fields, filterQuery))
    : fieldsByRecord;
  const limit = Math.min(normalized.maxItems ?? filtered.length, 100);
  return filtered.slice(0, limit).map(({ record, fields }, index) => ({
    key: stableRepeatItemKey(fields, index),
    sourceKey: normalized.sourceKey,
    index,
    fields,
    raw: record,
  }));
}

export function isSafeBuilderBoundImageSrc(value: string): boolean {
  const src = value.trim();
  if (!src || src.startsWith("//")) return false;
  if (/^https?:\/\//i.test(src)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return false;
  return src.startsWith("/") || src.startsWith("./") || src.startsWith("../");
}

function stringifyRecordFields(
  record: BuilderDataSourceRecord,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const stringValue = stringifyFieldValue(value);
    if (stringValue) fields[key] = stringValue;
  }
  return fields;
}

function stringifyFieldValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(stringifyFieldValue).filter(Boolean).join(", ");
  }
  return "";
}

function recordMatchesFilter(
  fields: Readonly<Record<string, string>>,
  filterQuery: string,
): boolean {
  return Object.entries(fields).some(([key, value]) => {
    const normalizedValue = value.toLowerCase();
    const normalizedKey = key.toLowerCase();
    return (
      normalizedValue.includes(filterQuery) ||
      `${normalizedKey}=${normalizedValue}`.includes(filterQuery) ||
      `${normalizedKey}:${normalizedValue}`.includes(filterQuery)
    );
  });
}

function stableRepeatItemKey(
  fields: Readonly<Record<string, string>>,
  index: number,
): string {
  const seed =
    fields.id ??
    fields.profileCode ??
    fields.slug ??
    fields.citySlug ??
    fields.href ??
    `item-${index + 1}`;
  const normalized = seed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${normalized || "item"}-${index + 1}`;
}

export function getBuilderDataBindingFindings(
  node: BuilderNode,
  options?: { workspacePlan?: string | null },
): ReadonlyArray<BuilderDataBindingFinding> {
  if (!builderNodeSupportsDataBinding(node.kind)) return [];
  const binding = getBuilderNodeDataBinding(node);
  if (!binding) {
    return [
      {
        id: "missing-binding",
        severity: "info",
        message: "This node can be connected to workspace data when the design should stay in sync.",
        fix: getDefaultBuilderDataBinding("featured_talent_profiles"),
      },
    ];
  }
  const source = getBuilderDataSourceDefinition(binding.sourceKey);
  if (!source) {
    return [
      {
        id: "unknown-source",
        severity: "error",
        message: `Unknown data source "${binding.sourceKey}". Choose a supported source before publishing.`,
        fix: { sourceKey: "workspace_profile" },
      },
    ];
  }
  const findings: BuilderDataBindingFinding[] = [];
  if (
    options?.workspacePlan &&
    !builderDataSourceAllowedForPlan(binding.sourceKey, options.workspacePlan)
  ) {
    findings.push({
      id: "source-plan-restricted",
      severity: "error",
      message: `${source.label} requires ${source.requiredPlan}. Upgrade plan or pick a supported data source.`,
      fix: { sourceKey: "workspace_profile", mode: undefined },
    });
  }
  if (source.supportsManualSelection && !binding.mode) {
    findings.push({
      id: "missing-mode",
      severity: "warning",
      message:
        "Choose whether this list is bound to live data, manually curated, or hybrid.",
      fix: { mode: "bound" },
    });
  }
  if (!source.supportsManualSelection && binding.mode === "manual") {
    findings.push({
      id: "unsupported-manual-mode",
      severity: "warning",
      message: `${source.label} does not support manual curation. Use bound mode instead.`,
      fix: { mode: "bound" },
    });
  }
  if (!source.supportsManualSelection && binding.mode === "hybrid") {
    findings.push({
      id: "unsupported-hybrid-mode",
      severity: "warning",
      message: `${source.label} does not support hybrid mode. Use bound mode instead.`,
      fix: { mode: "bound" },
    });
  }
  if (binding.mode === "hybrid" && !source.supportsFiltering) {
    findings.push({
      id: "hybrid-needs-filterable-source",
      severity: "warning",
      message: `Hybrid mode works best on filterable sources. Choose a filterable source or switch mode.`,
      fix: { mode: "bound" },
    });
  }
  if (binding.mode === "hybrid" && !binding.filterQuery?.trim()) {
    findings.push({
      id: "hybrid-missing-filter-intent",
      severity: "warning",
      message: "Hybrid mode should include a filter note to document what part stays data-driven.",
    });
  }
  if (source.recommendedMaxItems && !binding.maxItems) {
    findings.push({
      id: "missing-limit",
      severity: "warning",
      message: `Set a visible item limit. ${source.label} works best around ${source.recommendedMaxItems} items.`,
      fix: { maxItems: source.recommendedMaxItems },
    });
  }
  if (
    source.key === "featured_talent_profiles" &&
    binding.maxItems &&
    binding.maxItems > 5
  ) {
    const freePlanLimit = (options?.workspacePlan ?? "free") === "free";
    findings.push({
      id: "free-roster-limit",
      severity: freePlanLimit ? "error" : "warning",
      message: freePlanLimit
        ? "Free workspaces can publish up to five roster profiles on the public page. Lower this block limit before publish."
        : "Free workspaces can publish up to five roster profiles on the public page.",
      fix: { maxItems: 5 },
    });
  }
  if (!source.supportsFiltering && binding.filterQuery) {
    findings.push({
      id: "unsupported-filter",
      severity: "warning",
      message: `${source.label} does not support filters. Clear the filter query to avoid a confusing setup.`,
      fix: { filterQuery: undefined },
    });
  }
  return findings;
}

function normalizeBindingMode(raw: unknown): BuilderDataBindingMode | undefined {
  if (raw === "manual" || raw === "bound" || raw === "hybrid") return raw;
  // Backward compatibility: old snapshots used "auto".
  if (raw === "auto") return "bound";
  return undefined;
}

/**
 * Collect every distinct `collection:<id>` sourceKey referenced by a
 * repeater binding anywhere in a tree. The render data-source loader uses this
 * to fetch only the collections a page actually binds (Wave 5A, #36).
 */
export function collectBuilderCollectionSourceKeys(
  tree: ReadonlyArray<BuilderNode>,
): string[] {
  const keys = new Set<string>();
  const visit = (node: BuilderNode) => {
    const binding = getBuilderNodeDataBinding(node);
    if (binding && isCollectionDataSourceKey(binding.sourceKey)) {
      keys.add(binding.sourceKey);
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of tree) visit(node);
  return [...keys];
}

export function collectBuilderDataBindingTreeFindings(
  tree: ReadonlyArray<BuilderNode>,
  options?: { workspacePlan?: string | null },
): ReadonlyArray<BuilderDataBindingTreeFinding> {
  const findings: BuilderDataBindingTreeFinding[] = [];
  const visit = (node: BuilderNode) => {
    for (const finding of getBuilderDataBindingFindings(node, options)) {
      findings.push({
        ...finding,
        nodeId: node.id,
        nodeKind: node.kind,
      });
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  for (const node of tree) {
    visit(node);
  }
  return findings;
}
