/**
 * Nail Designer block (app_nail_designer). Server wrapper: resolves the
 * author's copy for the content locale, works out which options are offered,
 * and mounts the client island. Hidden when nothing at all is offered, so a
 * misconfigured block never shows an empty tool to a visitor (preflight warns
 * the author before publish).
 */
import type { CSSProperties, ReactNode } from "react";

import { anchorIdAttrs } from "./anchor-id";
import { NAIL_DESIGNER_CSS } from "./nail-designer-css";
import { NailDesignerIsland } from "./nail-designer-island";
import { nailOfferedCount, resolveNailOffered } from "./nail-designer-model";
import type { BuilderAppNailDesignerNode } from "./types";

const DEFAULT_CTA = { en: "Send my design", es: "Enviar mi diseño" };

export function renderNailDesignerBlock(args: {
  node: BuilderAppNailDesignerNode;
  locale: string;
  /** Resolve a translatable prop through the node's per-locale overlay. */
  text: (prop: string, value: string | undefined) => string;
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, styleAttr } = args;
  const offered = resolveNailOffered(node.props);
  const empty = nailOfferedCount(offered) === 0;
  const es = args.locale.toLowerCase().startsWith("es");
  const title = args.text("title", node.props.title).trim();
  const intro = args.text("intro", node.props.intro).trim();
  const ctaLabel = args.text("ctaLabel", node.props.ctaLabel).trim() || (es ? DEFAULT_CTA.es : DEFAULT_CTA.en);
  return (
    <section
      className="sb-nd"
      data-builder-kind="app_nail_designer"
      data-builder-node-kind="app_nail_designer"
      data-builder-node-id={node.id}
      data-nd-empty={empty ? "1" : "0"}
      style={styleAttr}
      hidden={empty || undefined}
      aria-hidden={empty || undefined}
      {...anchorIdAttrs(node)}
    >
      {empty ? null : (
        <>
          <style>{NAIL_DESIGNER_CSS}</style>
          {title || intro ? (
            <header className="sb-nd-head">
              {title ? <h2 className="sb-nd-title">{title}</h2> : null}
              {intro ? <p className="sb-nd-intro">{intro}</p> : null}
            </header>
          ) : null}
          <NailDesignerIsland
            offered={offered}
            locale={args.locale}
            title={title}
            ctaLabel={ctaLabel}
            sendWithBooking={node.props.sendWithBooking !== false}
          />
        </>
      )}
    </section>
  );
}
