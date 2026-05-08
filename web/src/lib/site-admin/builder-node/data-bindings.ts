import type { BuilderNode, BuilderNodeKind } from "./types";

export type BuilderDataSourceKey =
  | "workspace_profile"
  | "featured_talent_profiles"
  | "tenant_directory_search"
  | "talent_locations"
  | "inquiry_path"
  | "cms_page"
  | "asset"
  | "custom_field";

export type BuilderDataBindingMode = "auto" | "manual";

export interface BuilderDataBinding {
  sourceKey: string;
  mode?: BuilderDataBindingMode;
  filterQuery?: string;
  maxItems?: number;
}

export interface BuilderDataSourceDefinition {
  key: BuilderDataSourceKey;
  label: string;
  description: string;
  examples: ReadonlyArray<string>;
  recommendedMaxItems?: number;
  supportsManualSelection: boolean;
  supportsFiltering: boolean;
  requiredPlan: "free" | "studio" | "agency" | "network";
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

export const BUILDER_DATA_SOURCE_REGISTRY: ReadonlyArray<BuilderDataSourceDefinition> = [
  {
    key: "workspace_profile",
    label: "Workspace profile",
    description: "Tenant name, brand, location, and public contact metadata.",
    examples: ["Agency name", "Primary market", "Brand intro"],
    supportsManualSelection: false,
    supportsFiltering: false,
    requiredPlan: "free",
  },
  {
    key: "featured_talent_profiles",
    label: "Roster talent",
    description: "Published talent profiles owned by the workspace.",
    examples: ["Featured talent", "Latest public profiles", "Selected models"],
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
    supportsManualSelection: false,
    supportsFiltering: false,
    requiredPlan: "free",
  },
  {
    key: "cms_page",
    label: "CMS page",
    description: "Published CMS pages and editorial entries.",
    examples: ["Journal index", "Featured story", "Press page"],
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
    recommendedMaxItems: 10,
    supportsManualSelection: true,
    supportsFiltering: true,
    requiredPlan: "agency",
  },
] as const;

const DATA_BINDING_NODE_KINDS = new Set<BuilderNodeKind>(["section", "container"]);

export function builderNodeSupportsDataBinding(kind: BuilderNodeKind): boolean {
  return DATA_BINDING_NODE_KINDS.has(kind);
}

export function getBuilderDataSourceDefinition(
  sourceKey: string | null | undefined,
): BuilderDataSourceDefinition | null {
  if (!sourceKey) return null;
  const normalizedSourceKey = normalizeDataSourceKey(sourceKey);
  return BUILDER_DATA_SOURCE_REGISTRY.find((source) => source.key === normalizedSourceKey) ?? null;
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
    mode: source?.supportsManualSelection ? "auto" : undefined,
    maxItems: source?.recommendedMaxItems,
  };
}

export function normalizeBuilderDataBinding(
  value: unknown,
): BuilderDataBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const sourceKey = typeof record.sourceKey === "string" ? record.sourceKey.trim() : "";
  if (!sourceKey) return null;
  const normalizedSourceKey = normalizeDataSourceKey(sourceKey);
  const mode =
    record.mode === "manual" || record.mode === "auto" ? record.mode : undefined;
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
  return binding;
}

export function getBuilderNodeDataBinding(node: BuilderNode): BuilderDataBinding | null {
  if (!builderNodeSupportsDataBinding(node.kind)) return null;
  return normalizeBuilderDataBinding(
    (node.props as Record<string, unknown>).dataBinding,
  );
}

export function getBuilderDataBindingFindings(
  node: BuilderNode,
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
  if (source.supportsManualSelection && !binding.mode) {
    findings.push({
      id: "missing-mode",
      severity: "warning",
      message: "Choose whether this list is automatic or manually selected.",
      fix: { mode: "auto" },
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
    findings.push({
      id: "free-roster-limit",
      severity: "warning",
      message: "Free workspaces can publish up to five roster profiles on the public page.",
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

export function collectBuilderDataBindingTreeFindings(
  tree: ReadonlyArray<BuilderNode>,
): ReadonlyArray<BuilderDataBindingTreeFinding> {
  const findings: BuilderDataBindingTreeFinding[] = [];
  const visit = (node: BuilderNode) => {
    for (const finding of getBuilderDataBindingFindings(node)) {
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
