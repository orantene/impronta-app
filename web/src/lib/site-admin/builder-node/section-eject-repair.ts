import type { BuilderNode, BuilderNodeStyle, BuilderNodeTree } from "./types";
import {
  isBuilderNodeRole,
  resolveBuilderNodeRole,
  type BuilderNodeRole,
} from "./role-bindings";
import type { EjectRoleBaseline } from "./section-eject-baseline";
import {
  layerBuilderNodeStyles,
  resolveCuratedRoleStyle,
  type EjectRolePresentation,
} from "./section-eject";

/**
 * REPAIR — give an ALREADY-unlocked section its curated styling back, without
 * throwing away the operator's blocks.
 *
 * THE GAP THIS CLOSES
 * ───────────────────
 * `ejectSectionInTree` now bakes the curated look onto the children as it
 * ejects (`section-eject-baseline.ts`). That fix is FORWARD-ONLY. Every
 * section unlocked before it existed is still sitting there stripped: the
 * rivieramayawork hero renders as black left-aligned text on white instead of
 * the full-bleed banner with centered white serif type. The only exit was
 * Relock, which hard-clears the children — it restores the design by deleting
 * the work. This module is the other exit: same baseline, applied in place.
 *
 * THE HARD PART IS IDENTITY, NOT STYLE
 * ────────────────────────────────────
 * The baseline is keyed by ROLE (`headline`, `primaryCta`, …). Eject re-mints
 * the children with fresh roleless ids, so the role→child link the eject-time
 * path relies on is gone by the time repair runs. Restyling the wrong element
 * is worse than leaving it degraded, so identity is resolved by a ladder of
 * signals that runs strongest-first and STOPS rather than approximating:
 *
 *   1. `originRole` — the eject-time provenance stamp (see
 *      `BuilderNodeBase.originRole`). Direct provenance, not inference. When
 *      ANY child in the section carries a stamp, the whole section is resolved
 *      by stamps alone and nothing is inferred: an unstamped sibling in a
 *      stamped section is a block the operator added, and must be left alone.
 *      Two children carrying the SAME stamp (a duplicated block) are both
 *      styled — they genuinely both descend from that role; that is provenance,
 *      not a guess.
 *   2. Exact structural alignment — the section's children still match the
 *      curated derivation one-for-one, same length, same kind at every index.
 *      Nothing was added, removed or reordered, so index i IS role i.
 *   3. Unique text + kind — an unclaimed child whose kind AND text/label are
 *      identical to exactly one unclaimed curated child, and vice versa.
 *      Survives blocks being added around it.
 *   4. Unique kind — a role whose kind occurs exactly once among the remaining
 *      curated children AND exactly once among the remaining actual children.
 *      There is only one candidate, so there is nothing to get wrong.
 *
 * Anything that survives all four is AMBIGUOUS and is reported in
 * `unresolvedRoles`, never approximated. Two paragraphs and no other signal is
 * exactly the case where a guess restyles the wrong element.
 *
 * Steps 2 to 4 are best-effort archaeology for the historical population and
 * are stated as such. Step 1 is exact, and every eject from #1178 onward
 * carries it — the asymmetry is real and deliberate.
 *
 * GUARANTEES
 * ──────────
 * - The curated style goes UNDER the child's existing style, the same merge
 *   order the eject-time path uses. An operator's explicit value always wins.
 * - Children are mapped, never added, removed or reordered. No content moves.
 * - Idempotent: the second run's merge produces a byte-identical style (the
 *   first run's output already contains the baseline, and existing wins), so
 *   nothing changes and the tree is returned by identity.
 * - No baseline coverage for the section type is an explicit `no-baseline`
 *   outcome, never a silent success.
 *
 * Pure: tree in, tree out. The curated reference children and the baseline are
 * injected by the caller (`eject-lossless.ts`), so this module stays free of
 * the section registry and of server actions.
 */

export type RepairRoleMatchVia =
  | "origin-role"
  | "sequence"
  | "unique-text"
  | "unique-kind";

export interface RepairRoleMatch {
  childId: string;
  role: BuilderNodeRole;
  via: RepairRoleMatchVia;
}

export type RepairEjectedSectionOutcome =
  /** No such node, or it is not a section. */
  | "not-found"
  /** The section is still locked; there is nothing to repair (relock/unlock owns that). */
  | "not-unlocked"
  /** This section type has no curated-CSS baseline, so there is nothing to restore. */
  | "no-baseline"
  /** Unlocked, baseline present, but the section has no children to style. */
  | "no-children"
  /** Not one child could be matched to a curated role with confidence. */
  | "unresolved"
  /** Matched, but every child already carries the curated values (or overrides them). */
  | "already-styled"
  /** At least one child regained curated styling. */
  | "repaired";

export interface RepairEjectedSectionResult {
  tree: BuilderNodeTree;
  outcome: RepairEjectedSectionOutcome;
  /** Roles whose child actually changed in this run. */
  repairedRoles: ReadonlyArray<BuilderNodeRole>;
  /** How each styled child was identified — for reporting and for tests. */
  matches: ReadonlyArray<RepairRoleMatch>;
  /**
   * Baseline roles no child could be matched to CONFIDENTLY. These are
   * deliberately left untouched; the operator is told, not lied to.
   */
  unresolvedRoles: ReadonlyArray<BuilderNodeRole>;
}

/**
 * What the CLIENT flow (`runRepairSectionStyling`) hands back to the UI: the
 * commit's ok/error plus enough of the pure outcome to say something true about
 * a run that changed nothing. Declared here so the context type, the runner and
 * the chip button all read one shape.
 */
export interface RepairSectionStylingResult {
  ok: boolean;
  error?: string;
  outcome?: RepairEjectedSectionOutcome;
  /** Roles whose element actually regained curated styling. */
  repairedCount?: number;
  /** Baseline roles no child could be matched to with confidence. */
  unresolvedCount?: number;
}

export interface RepairEjectedSectionInput {
  tree: BuilderNodeTree;
  sectionNodeId: string;
  /** The curated component's own CSS look, per role (`section-eject-baseline.ts`). */
  roleBaseline: EjectRoleBaseline | undefined;
  /** The operator's saved per-role "Type & color overrides", if any. */
  rolePresentation?: EjectRolePresentation;
  /**
   * What `deriveLegacySectionChildNodes` produces for this section TODAY — the
   * role-id'd reference list. Used only to infer identity for children ejected
   * before the provenance stamp existed; omit it and repair falls back to
   * stamps alone.
   */
  referenceChildren?: ReadonlyArray<BuilderNode>;
}

/** The visible text a heading/paragraph/button carries, for identity matching. */
function nodeText(node: BuilderNode): string | null {
  const props = node.props as Record<string, unknown>;
  const raw = typeof props.text === "string" ? props.text : props.label;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOriginRole(node: BuilderNode): BuilderNodeRole | null {
  const base = (node as { originRole?: unknown }).originRole;
  if (isBuilderNodeRole(base)) return base;
  const fromProps = (node.props as Record<string, unknown>).originRole;
  if (isBuilderNodeRole(fromProps)) return fromProps;
  // A child that somehow kept its `legacy:…:heading:headline` id is just as
  // exact as a stamp; cost-free to honour.
  return resolveBuilderNodeRole(node.id);
}

/**
 * Resolve which child carries which curated role. Returns one match per styled
 * child (a role may legitimately match more than one child when the operator
 * duplicated a stamped block) plus the roles that stayed ambiguous.
 */
export function resolveRepairRoleMatches(
  children: ReadonlyArray<BuilderNode>,
  referenceChildren: ReadonlyArray<BuilderNode>,
  baselineRoles: ReadonlyArray<BuilderNodeRole>,
): { matches: RepairRoleMatch[]; unresolvedRoles: BuilderNodeRole[] } {
  const wanted = new Set(baselineRoles);
  const matches: RepairRoleMatch[] = [];

  // ── 1. Provenance. Exact, and it disables inference for the whole section:
  // in a stamped section an unstamped child is the operator's own block.
  const stamped = children
    .map((child) => ({ child, role: readOriginRole(child) }))
    .filter((entry): entry is { child: BuilderNode; role: BuilderNodeRole } =>
      entry.role !== null,
    );
  if (stamped.length > 0) {
    const seen = new Set<BuilderNodeRole>();
    for (const { child, role } of stamped) {
      if (!wanted.has(role)) continue;
      matches.push({ childId: child.id, role, via: "origin-role" });
      seen.add(role);
    }
    return {
      matches,
      unresolvedRoles: baselineRoles.filter((role) => !seen.has(role)),
    };
  }

  // ── Historical (no stamps anywhere). Everything below is inference, and it
  // only ever fires when the answer is forced.
  // Keep EVERY role-bound reference child, not just the ones the baseline
  // covers: dropping an uncovered role would shift the indices and make the
  // structural alignment below line up the wrong pairs.
  const reference = referenceChildren.filter(
    (node) => resolveBuilderNodeRole(node.id) !== null,
  );
  if (reference.length === 0 || children.length === 0) {
    return { matches, unresolvedRoles: [...baselineRoles] };
  }

  const claimedChildIds = new Set<string>();
  const claimedRoles = new Set<BuilderNodeRole>();
  const claim = (
    child: BuilderNode,
    role: BuilderNodeRole,
    via: RepairRoleMatchVia,
  ): void => {
    // Roles outside the baseline are still CLAIMED (so they cannot be matched
    // again) but produce no style change; only baseline roles are reported.
    if (wanted.has(role)) matches.push({ childId: child.id, role, via });
    claimedChildIds.add(child.id);
    claimedRoles.add(role);
  };
  const roleOf = (node: BuilderNode): BuilderNodeRole =>
    resolveBuilderNodeRole(node.id) as BuilderNodeRole;

  // ── 2. Exact structural alignment: same count, same kind at every index.
  const aligned =
    children.length === reference.length &&
    children.every((child, i) => child.kind === reference[i]!.kind);
  if (aligned) {
    children.forEach((child, i) => claim(child, roleOf(reference[i]!), "sequence"));
  } else {
    // ── 3. Unique text + kind, both directions.
    for (const ref of reference) {
      const role = roleOf(ref);
      if (claimedRoles.has(role)) continue;
      const refText = nodeText(ref);
      if (!refText) continue;
      const sameTextRefs = reference.filter(
        (other) =>
          !claimedRoles.has(roleOf(other)) &&
          other.kind === ref.kind &&
          nodeText(other) === refText,
      );
      if (sameTextRefs.length !== 1) continue;
      const candidates = children.filter(
        (child) =>
          !claimedChildIds.has(child.id) &&
          child.kind === ref.kind &&
          nodeText(child) === refText,
      );
      if (candidates.length === 1) claim(candidates[0]!, role, "unique-text");
    }
    // ── 4. Unique kind among what is still unclaimed on BOTH sides.
    for (const ref of reference) {
      const role = roleOf(ref);
      if (claimedRoles.has(role)) continue;
      const sameKindRefs = reference.filter(
        (other) =>
          !claimedRoles.has(roleOf(other)) && other.kind === ref.kind,
      );
      if (sameKindRefs.length !== 1) continue;
      const candidates = children.filter(
        (child) => !claimedChildIds.has(child.id) && child.kind === ref.kind,
      );
      if (candidates.length === 1) claim(candidates[0]!, role, "unique-kind");
    }
  }

  return {
    matches,
    unresolvedRoles: baselineRoles.filter((role) => !claimedRoles.has(role)),
  };
}

/** Structural equality for a merged style, so an unchanged child keeps its identity. */
function sameStyle(
  a: BuilderNodeStyle | undefined,
  b: BuilderNodeStyle | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const av = (a as Record<string, unknown>)[key];
    const bv = (b as Record<string, unknown>)[key];
    if (av === bv) continue;
    if (
      av &&
      bv &&
      typeof av === "object" &&
      typeof bv === "object" &&
      sameStyle(av as BuilderNodeStyle, bv as BuilderNodeStyle)
    ) {
      continue;
    }
    return false;
  }
  return true;
}

export function repairEjectedSectionInTree(
  input: RepairEjectedSectionInput,
): RepairEjectedSectionResult {
  const {
    tree,
    sectionNodeId,
    roleBaseline,
    rolePresentation,
    referenceChildren,
  } = input;
  const empty = {
    tree,
    repairedRoles: [] as BuilderNodeRole[],
    matches: [] as RepairRoleMatch[],
    unresolvedRoles: [] as BuilderNodeRole[],
  };

  const found = tree.find((node) => node.id === sectionNodeId);
  if (!found || found.kind !== "section") {
    return { ...empty, outcome: "not-found" };
  }
  const section = found;
  if (section.props.ejected !== true) {
    return { ...empty, outcome: "not-unlocked" };
  }
  const baselineRoles = (
    roleBaseline ? Object.keys(roleBaseline) : []
  ).filter(isBuilderNodeRole);
  if (baselineRoles.length === 0) return { ...empty, outcome: "no-baseline" };
  const children = section.children ?? [];
  if (children.length === 0) return { ...empty, outcome: "no-children" };

  const { matches, unresolvedRoles } = resolveRepairRoleMatches(
    children,
    referenceChildren ?? [],
    baselineRoles,
  );
  if (matches.length === 0) {
    return { ...empty, outcome: "unresolved", unresolvedRoles };
  }

  const roleByChildId = new Map(matches.map((m) => [m.childId, m.role]));
  const repairedRoles: BuilderNodeRole[] = [];
  let changed = false;
  const nextChildren = children.map((child) => {
    const role = roleByChildId.get(child.id);
    if (!role) return child;
    const curated = resolveCuratedRoleStyle(
      role,
      rolePresentation ?? {},
      roleBaseline,
    );
    if (!curated) return child;
    const existing = (child.props as { style?: BuilderNodeStyle }).style;
    // Curated UNDER existing — identical precedence to the eject-time bake, so
    // a value the operator set by hand is never overwritten. This is also what
    // makes a second run a no-op: `existing` already contains the baseline.
    const merged = layerBuilderNodeStyles(curated, existing) as BuilderNodeStyle;
    if (sameStyle(merged, existing)) return child;
    changed = true;
    if (!repairedRoles.includes(role)) repairedRoles.push(role);
    return {
      ...child,
      props: { ...(child.props as Record<string, unknown>), style: merged },
    } as BuilderNode;
  });

  if (!changed) {
    return { tree, outcome: "already-styled", repairedRoles, matches, unresolvedRoles };
  }
  const nextTree = tree.map((node) =>
    node.id === sectionNodeId
      ? ({ ...node, children: nextChildren } as BuilderNode)
      : node,
  );
  return {
    tree: nextTree,
    outcome: "repaired",
    repairedRoles,
    matches,
    unresolvedRoles,
  };
}
