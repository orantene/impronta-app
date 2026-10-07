import { resolveClientAccountMount } from "@/lib/client-account/gate";
import type { BuilderNode } from "@/lib/site-admin/builder-node";
import { withAccountItem } from "@/lib/talent-site/theme-catalog/section-kit-shell";

/**
 * Split the shell tree into HEADER and FOOTER node sets. The default shell
 * (`buildDefaultShellTree`) emits exactly two roots — a header container then a
 * footer container, distinguished by `props.layerLabel`. We honor that label
 * when present; otherwise the FIRST root is the header and the LAST is the
 * footer (any middle roots ride with the header). A single-root shell renders
 * entirely as the header (no footer), which is harmless. Pure + degrade-safe.
 */
function splitShellRaw(shellTree: BuilderNode[]): [BuilderNode[], BuilderNode[]] {
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

/**
 * `splitShellRaw`, then the client `account` item is added to the header AT RENDER
 * TIME when CLIENT_ACCOUNT_HOSTS names talent sites (TUL-61). It is never baked
 * into design payloads: authored-overlay hashes and published snapshots stay put,
 * and with the flag off this is the identical split.
 */
export function splitShell(shellTree: BuilderNode[]): [BuilderNode[], BuilderNode[]] {
  const [header, footer] = splitShellRaw(shellTree);
  if (!resolveClientAccountMount("talent").headerItem) return [header, footer];
  return [header.map((n) => withAccountItem(n) ?? n), footer];
}
