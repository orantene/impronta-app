/**
 * Promo widget block (TUL-1051 part B). One `promo` kind, seven looks.
 *
 * The server half: it picks which live promo(s) the block shows (`pickWidgetPromos`),
 * localises them, and hands the client island ONLY what it draws. The code of a
 * code promo is included only when that promo is the one shown. With no live
 * promo the block renders a hidden marker (so the page is unchanged) and, in the
 * editor preview, a one-line hint. Data comes from `options.dataSources.promoWidgets`,
 * loaded by `lib/promos/widgets/load.server.ts`: this file never reads a database.
 */
import type { CSSProperties, ReactNode } from "react";

import { PromoWidgetIsland } from "@/components/promos/widgets/promo-widget";
import { PROMO_WIDGET_CSS } from "@/components/promos/widgets/promo-widget-css";
import { pickWidgetPromos, widgetView } from "@/lib/promos/widgets/model";
import { widgetCopy } from "@/lib/promos/widgets/copy";
import type { PromoWidgetData } from "@/lib/promos/widgets/types";

import { anchorIdAttrs } from "./anchor-id";
import { safeChipHref } from "./next-free-chip-href";
import type { BuilderPromoNode } from "./types";

const DEFAULT_HREF = "#services";

export function renderPromoBlock(args: {
  node: BuilderPromoNode;
  data?: PromoWidgetData;
  locale?: string;
  /** What the site knows about the visitor's sign-in; undefined = unknown. */
  signedIn?: boolean;
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, data, styleAttr } = args;
  const p = node.props;
  const locale = args.locale ?? "es";
  const variant = p.variant ?? "banner";
  const preview = data?.preview === true;
  const picks = data ? pickWidgetPromos(data.items, { promoId: p.promoId, variant, maxCards: p.maxCards }, data.nowMs) : [];
  const first = picks[0];

  const wrap = (children: ReactNode, empty: boolean): ReactNode => (
    <div
      className="site-builder-node site-builder-node--promo"
      data-builder-node-kind="promo"
      data-builder-node-id={node.id}
      data-promo-state={empty ? "empty" : "live"}
      hidden={empty && !preview}
      style={styleAttr}
      {...anchorIdAttrs(node)}
    >
      {children}
    </div>
  );

  if (!first) {
    return wrap(
      preview ? <p style={{ margin: 0, padding: "12px 14px", border: "1px dashed currentColor", borderRadius: 12, fontSize: 13 }}>{widgetCopy(locale).noPromoHint}</p> : null,
      true,
    );
  }

  // One promo can carry the talent's own words; a card grid keeps each promo's own.
  const own = variant === "cards" && picks.length > 1 ? {} : { headline: p.headline, body: p.body };
  const views = picks.map((x) => widgetView(x, own, locale));
  return wrap(
    <>
      <style>{PROMO_WIDGET_CSS}</style>
      <PromoWidgetIsland
        nodeId={node.id}
        variant={variant}
        views={views}
        locale={locale}
        tone={p.tone ?? "accent"}
        ctaLabel={(p.ctaLabel ?? "").trim()}
        ctaHref={safeChipHref(p.ctaHref) ?? DEFAULT_HREF}
        audience={p.audience ?? "everyone"}
        startsAt={p.startsAt ?? ""}
        endsAt={p.endsAt ?? ""}
        tz={first.tz}
        pagesMode={p.pagesMode ?? "all"}
        pages={p.pages ?? ""}
        signedIn={args.signedIn ?? null}
        dismissible={p.dismissible !== false}
        popupStyle={p.popupStyle ?? "modal"}
        delaySec={p.delaySec ?? 8}
        scrollPct={p.scrollPct ?? 0}
        exitIntent={p.exitIntent === true}
        frequency={p.frequency ?? "session"}
        position={p.position ?? "bottom_right"}
        preview={preview}
      />
    </>,
    false,
  );
}
