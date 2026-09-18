/**
 * pageless-home.ts — the ONE page a tenant with no published pages renders.
 *
 * A Look places a type's business components on its inner pages
 * (`catalogue`, `transaction`, `people`, `map`, `gallery` slots live on the
 * catalogue / transaction / about / contact / gallery pages, see
 * `looks/shared.ts`); the home carries only `home.offer`, `home.proof` and
 * `whatsapp`. Nothing serves those inner pages for a page-less tenant, so a
 * page-less restaurant used to render without its menu board or reserve band
 * and a page-less studio without its class picker (D-169).
 *
 * `foldComponentsForPagelessHome` collapses the inner-page slots onto the
 * home's slots: catalogue + transaction (+ people) follow the offer band, the
 * map follows the WhatsApp band. The gallery stays off (the home already
 * carries the Look's gallery teaser). Pure; `pageless-fallback.server.ts`
 * reads the tenant and calls `composePagelessHome`.
 */

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import { buildComponentsForType } from "./business-components";
import { instantiateSite, type InstantiateSiteInput } from "./instantiate-site";
import type { ComponentContext, SlotId } from "./types";

/** Inner-page slot → the home slot its nodes append to, in order. */
const FOLD: ReadonlyArray<readonly [from: SlotId, to: SlotId]> = [
  ["catalogue", "home.offer"],
  ["transaction", "home.offer"],
  ["people", "home.offer"],
  ["map", "whatsapp"],
];

export function foldComponentsForPagelessHome(components: Map<SlotId, BuilderNode[]>): Map<SlotId, BuilderNode[]> {
  const out = new Map<SlotId, BuilderNode[]>();
  for (const [slot, nodes] of components) out.set(slot, [...nodes]);
  for (const [from, to] of FOLD) {
    const nodes = out.get(from);
    if (!nodes || nodes.length === 0) continue;
    out.set(to, [...(out.get(to) ?? []), ...nodes]);
    out.delete(from);
  }
  out.delete("gallery");
  return out;
}

export type PagelessHomeInput = Omit<InstantiateSiteInput, "components"> & { typeId: string; ctx: ComponentContext };

/** Header + home (with the type's components folded in) + footer, or null when
 *  the validator refuses the tree (image gaps are tolerated). */
export function composePagelessHome(input: PagelessHomeInput): { tree: BuilderNodeTree | null; issues: string[] } {
  const { typeId, ctx, ...rest } = input;
  const site = instantiateSite({ ...rest, components: foldComponentsForPagelessHome(buildComponentsForType(typeId, ctx)) });
  // A validator issue means this tree must not reach a visitor; image gaps are tolerated.
  if (site.issues.some((i) => !/image slot .* unresolved/.test(i))) return { tree: null, issues: site.issues };
  return { tree: [...site.shell.header, ...site.pages.home, ...site.shell.footer], issues: site.issues };
}
