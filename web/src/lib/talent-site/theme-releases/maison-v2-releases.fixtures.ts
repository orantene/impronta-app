/**
 * Test fixtures for the Maison v2 releases after 2.1: each `revert*` undoes
 * exactly one release's payload changes on a copy of the current payload, so
 * a test can rebuild any earlier version from code and diff it forward.
 * Pure; the revert functions compose (undo newest first).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { buildMaisonV2Payload } from "../theme-catalog/collection/designs";
import type { DesignPayload } from "../theme-catalog/types";

type Props = Record<string, unknown>;

export const clonePayload = (p: DesignPayload): DesignPayload => JSON.parse(JSON.stringify(p)) as DesignPayload;

export function walkNodes(nodes: ReadonlyArray<BuilderNode>, visit: (n: BuilderNode) => void): void {
  for (const n of nodes) {
    visit(n);
    walkNodes(((n as { children?: BuilderNode[] }).children ?? []) as BuilderNode[], visit);
  }
}

export const propsOf = (n: BuilderNode): Props => n.props as Props;

export function findByKind(nodes: ReadonlyArray<BuilderNode>, kind: string): BuilderNode | undefined {
  let hit: BuilderNode | undefined;
  walkNodes(nodes, (n) => {
    if (!hit && n.kind === kind) hit = n;
  });
  return hit;
}

export function findBySlot(nodes: ReadonlyArray<BuilderNode>, slotKey: string): BuilderNode | undefined {
  let hit: BuilderNode | undefined;
  walkNodes(nodes, (n) => {
    if (!hit && propsOf(n).slotKey === slotKey) hit = n;
  });
  return hit;
}

/** The current (newest) Maison v2 payload, as a fresh copy. */
export const currentMaisonV2 = (): DesignPayload => clonePayload(buildMaisonV2Payload());

/** v16 back to v15: the round 2 token and variant defaults. */
export function revertR16(p: DesignPayload): DesignPayload {
  const out = clonePayload(p);
  out.tokenDefaults!["type.display-tracking"] = "-0.01em";
  out.tokenDefaults!["button.padding-x"] = "22px";
  Object.assign(propsOf(findByKind(out.homeTree, "reviews")!), { showArrows: false, limit: 12 });
  return out;
}

/** v17 back to v16: the round 3 opt-in services layout and the contact eyebrow contrast fix. */
export function revertR17(p: DesignPayload): DesignPayload {
  const out = clonePayload(p);
  const catalog = findByKind(out.homeTree, "services_catalog")!;
  delete propsOf(catalog).slotKey;
  propsOf(catalog).layout = "rows";
  const contact = findBySlot(out.homeTree, "contact")!;
  const para = ((contact as { children?: BuilderNode[] }).children ?? []).find((c) => c.kind === "paragraph")!;
  (propsOf(para).style as Props).textColor = "token:color.accent";
  const ba = findBySlot(out.homeTree, "before_after")!;
  const baEyebrow = ((ba as { children?: BuilderNode[] }).children ?? []).find((c) => c.kind === "paragraph")!;
  (propsOf(baEyebrow).style as Props).textColor = "token:color.accent";
  return out;
}

/** v18 back to v17: the round 4 aftercare block and the reviews reorder. */
export function revertR18(p: DesignPayload): DesignPayload {
  const out = clonePayload(p);
  const slot = (n: BuilderNode) => propsOf(n).slotKey;
  const rest = out.homeTree.filter((n) => slot(n) !== "aftercare" && slot(n) !== "reviews");
  const reviews = out.homeTree.find((n) => slot(n) === "reviews")!;
  rest.splice(rest.findIndex((n) => slot(n) === "services") + 1, 0, reviews);
  out.homeTree = rest;
  return out;
}

/** Maison v2 as it was at `version` (15 = release 2.1 ... 18 = release 2.4), rebuilt from code. */
export function maisonV2At(version: number): DesignPayload {
  let out = currentMaisonV2();
  if (version < 18) out = revertR18(out);
  if (version < 17) out = revertR17(out);
  if (version < 16) out = revertR16(out);
  return out;
}
