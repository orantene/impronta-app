/**
 * Pure walk over a builder tree for native data-block fetch needs.
 *
 * Kept free of server / Next imports so unit tests under
 * `test:builder-node-bindings` (no `server-only` mock) can import it.
 */
import type { BuilderNode } from "./types";

/**
 * BUILDER 2027 · P2B — one native `directory` node's server-resolvable scope.
 *
 * The renderer never queries; this is what the SERVER caller needs in order to
 * resolve that node's cards through the tenant's visible-roster gate. It is a
 * PER NODE record (keyed by `nodeId`) because two directory nodes on one page
 * can be scoped differently — an "Our Chefs" band above an "Everyone" band. A
 * single shared card array would paint one of them with the other's people,
 * which is the exact class of bug `dataSources.directoryProfiles` alone cannot
 * express.
 */
export type NativeDirectoryNeed = {
  nodeId: string;
  scope: "all" | "by_talent_type" | "by_tag" | "manual";
  talentTypeKeys: string[];
  tagKeys: string[];
  manualProfileCodes: string[];
  pinnedProfileCodes: string[];
  excludedProfileCodes: string[];
  defaultSort: "recommended" | "newest" | "az" | "availability" | "curated";
  pageSize: number;
  /** `topBarMode: "none"` renders no chips, so the shortcut read is skipped. */
  needsShortcuts: boolean;
};

export type NativeDataBlockNeeds = {
  needsTalentCount: boolean;
  menuBoard: boolean;
  disciplines: {
    maxItems: number;
    parentCategoryMode: boolean;
    selectedTermIds?: string[];
  } | null;
  /** Every native `directory` node in the tree, in document order. */
  directories: NativeDirectoryNeed[];
  /** The two session-dependent header widgets, when present in the tree. */
  headerWidgets: { account: boolean; inquiry: boolean };
};

/**
 * Stable signature of a directory node's SCOPE (not its presentation). Two
 * nodes with the same signature can share one resolved card array; two with
 * different signatures must not.
 */
export function nativeDirectoryScopeSignature(
  need: Pick<
    NativeDirectoryNeed,
    | "scope"
    | "talentTypeKeys"
    | "tagKeys"
    | "manualProfileCodes"
    | "excludedProfileCodes"
    | "defaultSort"
  >,
): string {
  const list = (values: ReadonlyArray<string>) =>
    [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort().join(",");
  return [
    need.scope,
    list(need.talentTypeKeys),
    list(need.tagKeys),
    list(need.manualProfileCodes),
    list(need.excludedProfileCodes),
    need.defaultSort,
  ].join("|");
}

export function collectNativeDataBlockNeeds(
  nodes: ReadonlyArray<BuilderNode>,
): NativeDataBlockNeeds {
  let needsTalentCount = false;
  let menuBoard = false;
  let disciplines: {
    maxItems: number;
    parentCategoryMode: boolean;
    selectedTermIds?: string[];
  } | null = null;
  const directories: NativeDirectoryNeed[] = [];
  const headerWidgets = { account: false, inquiry: false };

  const visit = (node: BuilderNode) => {
    if (
      node.kind === "hero_search" &&
      node.props.statSource === "tenant_talent_count"
    ) {
      needsTalentCount = true;
    }
    if (node.kind === "menu_board") {
      menuBoard = true;
    }
    if (node.kind === "header_account") headerWidgets.account = true;
    if (node.kind === "header_inquiry") headerWidgets.inquiry = true;
    if (node.kind === "directory") {
      const p = node.props;
      const strings = (values: string[] | undefined) =>
        (values ?? []).map((v) => v?.trim()).filter((v): v is string => Boolean(v));
      directories.push({
        nodeId: node.id,
        scope: p.scope ?? "all",
        talentTypeKeys: strings(p.talentTypeKeys),
        tagKeys: strings(p.tagKeys),
        manualProfileCodes: strings(p.manualProfileCodes),
        pinnedProfileCodes: strings(p.pinnedProfileCodes),
        excludedProfileCodes: strings(p.excludedProfileCodes),
        defaultSort: p.defaultSort ?? "recommended",
        // Mirrors the renderer's own clamp (`p.pageSize ?? 24`) and the
        // section schema's 6..60 range, so the fetch can never be asked for a
        // page the grid would not render.
        pageSize: Math.max(6, Math.min(60, Math.trunc(p.pageSize ?? 24))),
        needsShortcuts: (p.topBarMode ?? "talent_type") !== "none",
      });
    }
    if (node.kind === "talent_type_grid" && node.props.mode === "dynamic") {
      const maxItems = node.props.maxItems ?? 7;
      const selected = node.props.selectedTermIds ?? [];
      if (!disciplines) {
        disciplines = {
          maxItems,
          parentCategoryMode: node.props.parentCategoryMode === true,
          ...(selected.length > 0 ? { selectedTermIds: [...selected] } : {}),
        };
      } else {
        disciplines.maxItems = Math.max(disciplines.maxItems, maxItems);
        disciplines.parentCategoryMode =
          disciplines.parentCategoryMode || node.props.parentCategoryMode === true;
        if (selected.length === 0) {
          delete disciplines.selectedTermIds;
        } else if (disciplines.selectedTermIds) {
          disciplines.selectedTermIds = [
            ...new Set([...disciplines.selectedTermIds, ...selected]),
          ];
        }
      }
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return { needsTalentCount, menuBoard, disciplines, directories, headerWidgets };
}
