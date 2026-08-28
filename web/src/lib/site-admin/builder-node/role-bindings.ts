export type BuilderNodeRole =
  | "headline"
  | "subheadline"
  | "copy"
  | "primaryCta"
  | "secondaryCta"
  | "footerCta";

const ROLE_SUFFIXES: ReadonlyArray<readonly [suffix: string, role: BuilderNodeRole]> = [
  [":heading:headline", "headline"],
  [":paragraph:subheadline", "subheadline"],
  [":paragraph:copy", "copy"],
  [":button:primaryCta", "primaryCta"],
  [":button:secondaryCta", "secondaryCta"],
  [":button:footerCta", "footerCta"],
];

/** Every role the curated-section binding knows about, in a stable order. */
export const BUILDER_NODE_ROLES: ReadonlyArray<BuilderNodeRole> = Object.freeze(
  ROLE_SUFFIXES.map(([, role]) => role),
);

/**
 * Type guard for a role that was PERSISTED as a plain string rather than
 * derived from a node id — `node.originRole`, the eject-time provenance stamp
 * (see `section-eject.ts`). Ids go roleless at eject; the stamp is what
 * survives.
 */
export function isBuilderNodeRole(value: unknown): value is BuilderNodeRole {
  return (
    typeof value === "string" &&
    (BUILDER_NODE_ROLES as ReadonlyArray<string>).includes(value)
  );
}

export interface BuilderNodeRoleBindingResult {
  nodeIdsByRole: Readonly<Partial<Record<BuilderNodeRole, string>>>;
  unknownNodeIds: ReadonlyArray<string>;
}

export function resolveBuilderNodeRole(
  nodeId: string,
): BuilderNodeRole | null {
  for (const [suffix, role] of ROLE_SUFFIXES) {
    if (nodeId.endsWith(suffix)) return role;
  }
  return null;
}

export function buildBuilderNodeRoleBindings(
  nodeIds: ReadonlyArray<string>,
): BuilderNodeRoleBindingResult {
  const nodeIdsByRole: Partial<Record<BuilderNodeRole, string>> = {};
  const unknownNodeIds: string[] = [];
  for (const nodeId of nodeIds) {
    const role = resolveBuilderNodeRole(nodeId);
    if (!role) {
      unknownNodeIds.push(nodeId);
      continue;
    }
    if (!nodeIdsByRole[role]) {
      nodeIdsByRole[role] = nodeId;
    }
  }
  return { nodeIdsByRole, unknownNodeIds };
}

