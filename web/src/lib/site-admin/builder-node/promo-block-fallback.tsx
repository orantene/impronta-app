/**
 * Promo block, the part the builder canvas keeps (TUL-1178 step 2).
 *
 * `render.tsx` is shared by the live site (server) and the builder canvas (browser). The
 * real promo renderer (`promo-block.tsx`: the promo picker, its copy, its CSS and the client
 * island) is about 46 KB of source that the canvas never needed, because the canvas gets no
 * promo data. It stayed in the admin bundle only because `render.tsx` imported it statically.
 *
 * So `render.tsx` no longer imports it. Server callers that hold promo data inject the real
 * renderer (`options.renderPromoBlock`); everyone else lands here:
 *   - the editor canvas (`editorPreview`) shows one static line that names the block and says
 *     it shows live on the site (preview only, the live site is unchanged);
 *   - any other caller renders exactly what the real block renders with no data: a hidden
 *     marker, so the page is unchanged.
 *
 * Keep this file free of RUNTIME imports from `@/lib/promos/*` and `@/components/promos/*`: that
 * is the point of the split (a static test pins it; `import type` is erased and allowed).
 */
import type { CSSProperties, ReactNode } from "react";

import type { PromoWidgetData } from "@/lib/promos/widgets/types";

import { anchorIdAttrs } from "./anchor-id";
import type { BuilderPromoNode } from "./types";

/** The arguments the real renderer (`renderPromoBlock` in `promo-block.tsx`) takes. */
export type BuilderPromoBlockArgs = {
  node: BuilderPromoNode;
  data?: PromoWidgetData;
  locale?: string;
  /** What the site knows about the visitor's sign-in; undefined = unknown. */
  signedIn?: boolean;
  styleAttr?: CSSProperties;
};

/** Injected by a server caller that holds promo data (see `BuilderNodeRenderOptions`). */
export type BuilderPromoBlockRenderer = (args: BuilderPromoBlockArgs) => ReactNode;

function editorHint(node: BuilderPromoNode, locale: string): string {
  const name = (node.props.headline ?? "").trim();
  if (locale.toLowerCase().startsWith("es")) {
    return name
      ? `Bloque de promo: ${name}. Se muestra en vivo en tu sitio.`
      : "Bloque de promo. Se muestra en vivo en tu sitio.";
  }
  return name
    ? `Promo block: ${name}. Shows live on your site.`
    : "Promo block. Shows live on your site.";
}

export function renderPromoBlockFallback(
  args: BuilderPromoBlockArgs & { editorPreview: boolean },
): ReactNode {
  const { node, styleAttr, editorPreview } = args;
  const locale = args.locale ?? "es";
  return (
    <div
      className="site-builder-node site-builder-node--promo"
      data-builder-node-kind="promo"
      data-builder-node-id={node.id}
      data-promo-state={editorPreview ? "placeholder" : "empty"}
      hidden={!editorPreview}
      style={styleAttr}
      {...anchorIdAttrs(node)}
    >
      {editorPreview ? (
        <p
          style={{
            margin: 0,
            padding: "12px 14px",
            border: "1px dashed currentColor",
            borderRadius: 12,
            fontSize: 13,
          }}
        >
          {editorHint(node, locale)}
        </p>
      ) : null}
    </div>
  );
}
