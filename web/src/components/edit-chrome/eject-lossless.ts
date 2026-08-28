// W4-T3 — client-side wiring for the LOSSLESS eject. The per-role
// `nodePresentation` a user set in the Design panel lives in the section's
// SAVED props, so it must be fetched before `ejectSectionInTree` runs; this
// wrapper binds the tree lookup + server action to the pure resolver so
// edit-context stays a one-call site. Best-effort by contract: any miss
// resolves undefined and the caller falls through to the lossy eject.
import { loadSectionForEditAction } from "@/lib/site-admin/edit-mode/section-actions";
import {
  ejectSectionInTree,
  unejectSectionInTree,
  resolveEjectRolePresentation,
  type EjectRolePresentation,
} from "@/lib/site-admin/builder-node/section-eject";
import {
  resolveSectionEjectBaseline,
  type EjectRoleBaseline,
} from "@/lib/site-admin/builder-node/section-eject-baseline";
import {
  repairEjectedSectionInTree,
  type RepairEjectedSectionOutcome,
  type RepairSectionStylingResult,
} from "@/lib/site-admin/builder-node/section-eject-repair";
import { deriveLegacySectionChildNodes } from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import { findBuilderNodeById } from "./inspectors/builder-node-content-utils";
import type {
  BuilderNode,
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node/types";

async function loadSavedSectionProps(
  sectionId: string,
): Promise<Record<string, unknown> | null> {
  const loaded = await loadSectionForEditAction(sectionId);
  return loaded.ok ? (loaded.section.props as Record<string, unknown>) : null;
}

export async function resolveEjectRolePresentationForNode(
  tree: BuilderNodeTree,
  sectionNodeId: string,
): Promise<EjectRolePresentation | undefined> {
  return resolveEjectRolePresentation(
    findBuilderNodeById(tree, sectionNodeId),
    loadSavedSectionProps,
  );
}

/**
 * Visual-fidelity eject payload: the operator's saved per-role styling
 * (`rolePresentation`) AND the curated component's own CSS baseline
 * (`roleBaseline`, from `section-eject-baseline.ts`) which layers UNDER it, so
 * an untouched section keeps its curated typography/colour/alignment after
 * unlock. Best-effort by contract: any miss resolves to `undefined` and the
 * eject degrades to the previous behaviour rather than failing.
 */
export async function resolveEjectStylingForNode(
  tree: BuilderNodeTree,
  sectionNodeId: string,
): Promise<{
  rolePresentation: EjectRolePresentation | undefined;
  roleBaseline: EjectRoleBaseline | undefined;
}> {
  const node: BuilderNode | null = findBuilderNodeById(tree, sectionNodeId);
  if (!node || node.kind !== "section") {
    return { rolePresentation: undefined, roleBaseline: undefined };
  }
  const sectionId =
    typeof node.props.sectionId === "string" ? node.props.sectionId : null;
  const sectionTypeKey =
    typeof node.props.sectionTypeKey === "string"
      ? node.props.sectionTypeKey
      : null;
  let savedProps: Record<string, unknown> | null = null;
  if (sectionId) {
    try {
      savedProps = await loadSavedSectionProps(sectionId);
    } catch {
      savedProps = null;
    }
  }
  const rolePresentation = await resolveEjectRolePresentation(node, async () =>
    Promise.resolve(savedProps),
  );
  // Missing saved props still yields the schema-default baseline, so the
  // common untouched-section unlock stays identity-preserving.
  const roleBaseline = sectionTypeKey
    ? resolveSectionEjectBaseline(sectionTypeKey, savedProps)
    : undefined;
  return { rolePresentation, roleBaseline };
}

// The shared commit spine, structurally typed so this module needs no import
// from edit-context (which would be a cycle).
type ExecuteBuilderNodeOperation = (input: {
  operation: "patch";
  nodeId: string;
  run: (tree: BuilderNodeTree) => { ok: true; tree: BuilderNodeTree };
}) => Promise<{ ok: boolean; error?: string }>;

/** Full lossless-eject flow: resolve saved styling + the curated CSS baseline,
 * then commit the `ejectSectionInTree(tree, id, rolePresentation, roleBaseline)`
 * patch. */
export async function runEjectSection(
  tree: BuilderNodeTree,
  sectionNodeId: string,
  execute: ExecuteBuilderNodeOperation,
): Promise<{ ok: boolean; error?: string; ejected?: boolean }> {
  const { rolePresentation, roleBaseline } = await resolveEjectStylingForNode(
    tree,
    sectionNodeId,
  );
  let didEject = false;
  const result = await execute({
    operation: "patch",
    nodeId: sectionNodeId,
    run: (current) => {
      const out = ejectSectionInTree(
        current,
        sectionNodeId,
        rolePresentation,
        roleBaseline,
      );
      didEject = out.ejected;
      return { ok: true, tree: out.tree };
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, ejected: didEject };
}

/**
 * REPAIR — restore the curated styling on a section that is ALREADY unlocked,
 * keeping every block the operator added or edited.
 *
 * Same two curated layers a fresh unlock bakes in, applied to the children that
 * are already there. The extra ingredient is the curated REFERENCE list
 * (`deriveLegacySectionChildNodes` over the section's saved props): for a
 * section unlocked before the provenance stamp existed, it is the only way to
 * work out which roleless child used to be the headline. `repairEjectedSectionInTree`
 * decides how much of that is trustworthy; anything ambiguous is left alone and
 * reported back rather than approximated.
 *
 * `loadProps` is injected (defaulting to the real server action) on the same
 * contract as `resolveEjectRolePresentation`, so the whole flow is exercisable
 * without a server round-trip.
 */
export async function runRepairSectionStyling(
  tree: BuilderNodeTree,
  sectionNodeId: string,
  execute: ExecuteBuilderNodeOperation,
  loadProps: (
    sectionId: string,
  ) => Promise<Record<string, unknown> | null> = loadSavedSectionProps,
): Promise<RepairSectionStylingResult> {
  const node: BuilderNode | null = findBuilderNodeById(tree, sectionNodeId);
  const sectionTypeKey =
    node?.kind === "section" && typeof node.props.sectionTypeKey === "string"
      ? node.props.sectionTypeKey
      : null;
  let savedProps: Record<string, unknown> | null = null;
  const sectionId =
    node?.kind === "section" && typeof node.props.sectionId === "string"
      ? node.props.sectionId
      : null;
  if (sectionId) {
    try {
      savedProps = await loadProps(sectionId);
    } catch {
      savedProps = null;
    }
  }
  // Both curated layers, resolved off the ONE props read above (the baseline
  // still resolves to the schema default when the load misses, exactly as at
  // eject time).
  const rolePresentation = await resolveEjectRolePresentation(node, async () =>
    Promise.resolve(savedProps),
  );
  const roleBaseline = sectionTypeKey
    ? resolveSectionEjectBaseline(sectionTypeKey, savedProps)
    : undefined;
  // Best-effort by contract, exactly like the eject-time resolvers: no saved
  // props means no reference list, and repair falls back to provenance stamps.
  const referenceChildren =
    sectionTypeKey && savedProps
      ? deriveLegacySectionChildNodes(sectionNodeId, {
          slotKey: "",
          sortOrder: 0,
          sectionId: sectionId ?? "",
          sectionTypeKey,
          name: "",
          props: savedProps,
        })
      : [];

  let outcome: RepairEjectedSectionOutcome = "not-found";
  let repairedCount = 0;
  let unresolvedCount = 0;
  const result = await execute({
    operation: "patch",
    nodeId: sectionNodeId,
    run: (current) => {
      const out = repairEjectedSectionInTree({
        tree: current,
        sectionNodeId,
        roleBaseline,
        rolePresentation,
        referenceChildren,
      });
      outcome = out.outcome;
      repairedCount = out.repairedRoles.length;
      unresolvedCount = out.unresolvedRoles.length;
      return { ok: true, tree: out.tree };
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, outcome, repairedCount, unresolvedCount };
}

/** Reverse: clear the ejected flag so the curated design re-derives. The
 * caller is responsible for confirming — this destroys freeform children. */
export async function runUnejectSection(
  sectionNodeId: string,
  execute: ExecuteBuilderNodeOperation,
): Promise<{ ok: boolean; error?: string; ejected?: boolean }> {
  let didUneject = false;
  const result = await execute({
    operation: "patch",
    nodeId: sectionNodeId,
    run: (current) => {
      const out = unejectSectionInTree(current, sectionNodeId);
      didUneject = out.ejected;
      return { ok: true, tree: out.tree };
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, ejected: didUneject };
}
