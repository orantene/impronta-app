import type { BuilderNode } from "@/lib/site-admin/builder-node";

/**
 * Split the shell tree into HEADER and FOOTER node sets. The default shell
 * (`buildDefaultShellTree`) emits exactly two roots — a header container then a
 * footer container, distinguished by `props.layerLabel`. We honor that label
 * when present; otherwise the FIRST root is the header and the LAST is the
 * footer (any middle roots ride with the header). A single-root shell renders
 * entirely as the header (no footer), which is harmless. Pure + degrade-safe.
 */
export function splitShell(shellTree: BuilderNode[]): [BuilderNode[], BuilderNode[]] {
  if (shellTree.length === 0) return [[], []];

  const labelOf = (n: BuilderNode): string =>
    String((n.props as { layerLabel?: unknown })?.layerLabel ?? "").toLowerCase();

  const footerByLabel = shellTree.filter((n) => labelOf(n).includes("footer"));
  if (footerByLabel.length > 0) {
    const footerSet = new Set(footerByLabel);
    const header = shellTree.filter((n) => !footerSet.has(n));
    return [header, footerByLabel];
  }

  if (shellTree.length === 1) return [shellTree, []];
  const header = shellTree.slice(0, shellTree.length - 1);
  const footer = shellTree.slice(shellTree.length - 1);
  return [header, footer];
}
