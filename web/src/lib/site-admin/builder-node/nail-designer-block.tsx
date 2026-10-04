/**
 * Nail Designer block (app_nail_designer). Server wrapper: resolves the
 * author's optional text overrides for the content locale and mounts the
 * client island. Zero config: the whole design is always offered.
 */
import type { CSSProperties, ReactNode } from "react";

import { anchorIdAttrs } from "./anchor-id";
import { NailStudioFrame } from "./nail-designer-frame";
import type { BuilderAppNailDesignerNode } from "./types";

export function renderNailDesignerBlock(args: {
  node: BuilderAppNailDesignerNode;
  locale: string;
  /** Resolve a translatable prop through the node's per-locale overlay. */
  text: (prop: string, value: string | undefined) => string;
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, styleAttr } = args;
  const title = args.text("title", node.props.title).trim();
  const intro = args.text("intro", node.props.intro).trim();
  return (
    <section
      className="sb-nd"
      data-builder-kind="app_nail_designer"
      data-builder-node-kind="app_nail_designer"
      data-builder-node-id={node.id}
      style={styleAttr}
      {...anchorIdAttrs(node)}
    >
      {title || intro ? (
        <header className="sb-nd-head">
          {title ? <h2 className="sb-nd-title">{title}</h2> : null}
          {intro ? <p className="sb-nd-intro">{intro}</p> : null}
        </header>
      ) : null}
      <NailStudioFrame locale={args.locale} />
    </section>
  );
}
