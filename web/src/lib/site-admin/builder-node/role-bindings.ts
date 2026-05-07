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

