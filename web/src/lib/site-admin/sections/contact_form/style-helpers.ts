/**
 * contact_form — pure CSS-declaration helpers extracted from `Component.tsx`
 * to keep the renderer under the 800-line `max-lines` cap. All functions are
 * pure (props → CSS values / declaration strings); no React, no I/O. The
 * responsive-CSS builder in the component composes `textNodeDecls` / `ctaDecls`
 * / `sectionHeadAlignDecls` per breakpoint; the inline node styles reuse the
 * size/tone/visibility mappers directly.
 */
import type { CSSProperties } from "react";

export function textAlignFor(align?: "left" | "center" | "right"): CSSProperties["textAlign"] {
  if (align === "left") return "left";
  if (align === "right") return "right";
  if (align === "center") return "center";
  return undefined;
}

export function textToneColor(
  tone?: "default" | "muted" | "strong",
): CSSProperties["color"] {
  if (tone === "muted") return "var(--token-color-muted)";
  if (tone === "strong") return "var(--foreground)";
  return undefined;
}

export function headingSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "clamp(1.45rem, 3.2vw, 2.2rem)";
  if (size === "lg") return "clamp(2.05rem, 4.6vw, 3.25rem)";
  if (size === "xl") return "clamp(2.35rem, 5.2vw, 3.7rem)";
  if (size === "display") return "clamp(3.5rem, 6vw, 6rem)";
  return undefined;
}

export function eyebrowSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.82rem";
  if (size === "lg") return "1rem";
  if (size === "xl") return "1.08rem";
  if (size === "display") return "1.08rem";
  return undefined;
}

export function paragraphSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.94rem";
  if (size === "lg") return "1.1rem";
  if (size === "xl") return "1.2rem";
  if (size === "display") return "clamp(2rem, 4vw, 4.5rem)";
  return undefined;
}

export function buttonSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties {
  if (size === "sm") return { padding: "0.5rem 0.85rem", fontSize: "0.78rem" };
  if (size === "lg") return { padding: "0.72rem 1.08rem", fontSize: "0.9rem" };
  if (size === "xl") return { padding: "0.82rem 1.2rem", fontSize: "0.94rem" };
  if (size === "display") return { padding: "0.82rem 1.2rem", fontSize: "0.94rem" };
  return {};
}

export function visibilityDisplay(
  visibility?: "visible" | "hidden",
): CSSProperties["display"] {
  if (visibility === "hidden") return "none";
  return undefined;
}

export function ctaJustifyContent(align?: "left" | "center" | "right"): CSSProperties["justifyContent"] {
  if (align === "left") return "flex-start";
  if (align === "right") return "flex-end";
  if (align === "center") return "center";
  return undefined;
}

export function toCssDecls(style: CSSProperties): string[] {
  const decls: string[] = [];
  if (style.textAlign) decls.push(`text-align:${style.textAlign}`);
  if (style.maxWidth) decls.push(`max-width:${style.maxWidth}`);
  if (style.marginTop) decls.push(`margin-top:${style.marginTop}`);
  if (style.marginBottom) decls.push(`margin-bottom:${style.marginBottom}`);
  if (style.marginInline) decls.push(`margin-inline:${style.marginInline}`);
  if (style.marginLeft) decls.push(`margin-left:${style.marginLeft}`);
  if (style.marginRight) decls.push(`margin-right:${style.marginRight}`);
  if (style.paddingTop) decls.push(`padding-top:${style.paddingTop}`);
  if (style.paddingBottom) decls.push(`padding-bottom:${style.paddingBottom}`);
  if (style.paddingInline) decls.push(`padding-inline:${style.paddingInline}`);
  if (style.paddingLeft) decls.push(`padding-left:${style.paddingLeft}`);
  if (style.paddingRight) decls.push(`padding-right:${style.paddingRight}`);
  if (style.fontSize) decls.push(`font-size:${style.fontSize}`);
  if (style.color) decls.push(`color:${style.color}`);
  if (style.display) decls.push(`display:${style.display}`);
  if (style.padding) decls.push(`padding:${style.padding}`);
  if (style.justifyContent) decls.push(`justify-content:${style.justifyContent}`);
  return decls;
}

export function textNodeDecls(
  node:
    | {
        align?: "left" | "center" | "right";
        maxWidthPx?: number;
        marginTopPx?: number;
        marginBottomPx?: number;
        marginInlinePx?: number;
        marginLeftPx?: number;
        marginRightPx?: number;
        paddingTopPx?: number;
        paddingBottomPx?: number;
        paddingInlinePx?: number;
        paddingLeftPx?: number;
        paddingRightPx?: number;
        size?: "sm" | "md" | "lg" | "xl" | "display";
        tone?: "default" | "muted" | "strong";
        visibility?: "visible" | "hidden";
      }
    | undefined,
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl" | "display") => CSSProperties["fontSize"],
): string[] {
  if (!node) return [];
  const hasMarginSides =
    typeof node.marginLeftPx === "number" ||
    typeof node.marginRightPx === "number";
  const hasPaddingSides =
    typeof node.paddingLeftPx === "number" ||
    typeof node.paddingRightPx === "number";
  return toCssDecls({
    textAlign: textAlignFor(node.align),
    maxWidth: node.maxWidthPx ? `${node.maxWidthPx}px` : undefined,
    marginTop: typeof node.marginTopPx === "number" ? `${node.marginTopPx}px` : undefined,
    marginBottom:
      typeof node.marginBottomPx === "number"
        ? `${node.marginBottomPx}px`
        : undefined,
    marginInline:
      !hasMarginSides && typeof node.marginInlinePx === "number"
        ? `${node.marginInlinePx}px`
        : undefined,
    marginLeft:
      typeof node.marginLeftPx === "number"
        ? `${node.marginLeftPx}px`
        : undefined,
    marginRight:
      typeof node.marginRightPx === "number"
        ? `${node.marginRightPx}px`
        : undefined,
    paddingTop:
      typeof node.paddingTopPx === "number"
        ? `${node.paddingTopPx}px`
        : undefined,
    paddingBottom:
      typeof node.paddingBottomPx === "number"
        ? `${node.paddingBottomPx}px`
        : undefined,
    paddingInline:
      !hasPaddingSides && typeof node.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft:
      typeof node.paddingLeftPx === "number"
        ? `${node.paddingLeftPx}px`
        : undefined,
    paddingRight:
      typeof node.paddingRightPx === "number"
        ? `${node.paddingRightPx}px`
        : undefined,
    fontSize: sizeMapper(node.size),
    color: textToneColor(node.tone),
    display:
      node.visibility === "visible"
        ? "revert"
        : visibilityDisplay(node.visibility),
  });
}

export function ctaDecls(
  node:
    | {
        size?: "sm" | "md" | "lg" | "xl" | "display";
        marginTopPx?: number;
        marginBottomPx?: number;
        marginInlinePx?: number;
        marginLeftPx?: number;
        marginRightPx?: number;
        paddingTopPx?: number;
        paddingBottomPx?: number;
        paddingInlinePx?: number;
        paddingLeftPx?: number;
        paddingRightPx?: number;
        visibility?: "visible" | "hidden";
      }
    | undefined,
): string[] {
  if (!node) return [];
  const hasMarginSides =
    typeof node.marginLeftPx === "number" ||
    typeof node.marginRightPx === "number";
  const hasPaddingSides =
    typeof node.paddingLeftPx === "number" ||
    typeof node.paddingRightPx === "number";
  return toCssDecls({
    ...buttonSize(node.size),
    marginTop: typeof node.marginTopPx === "number" ? `${node.marginTopPx}px` : undefined,
    marginBottom:
      typeof node.marginBottomPx === "number"
        ? `${node.marginBottomPx}px`
        : undefined,
    marginInline:
      !hasMarginSides && typeof node.marginInlinePx === "number"
        ? `${node.marginInlinePx}px`
        : undefined,
    marginLeft:
      typeof node.marginLeftPx === "number"
        ? `${node.marginLeftPx}px`
        : undefined,
    marginRight:
      typeof node.marginRightPx === "number"
        ? `${node.marginRightPx}px`
        : undefined,
    paddingTop:
      typeof node.paddingTopPx === "number"
        ? `${node.paddingTopPx}px`
        : undefined,
    paddingBottom:
      typeof node.paddingBottomPx === "number"
        ? `${node.paddingBottomPx}px`
        : undefined,
    paddingInline:
      !hasPaddingSides && typeof node.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft:
      typeof node.paddingLeftPx === "number"
        ? `${node.paddingLeftPx}px`
        : undefined,
    paddingRight:
      typeof node.paddingRightPx === "number"
        ? `${node.paddingRightPx}px`
        : undefined,
    display:
      node.visibility === "visible"
        ? "inline-flex"
        : visibilityDisplay(node.visibility),
  });
}

export function sectionHeadAlignDecls(align?: "left" | "center" | "right"): string[] {
  if (align === "left") {
    return ["text-align:left", "align-items:flex-start", "margin-inline:0"];
  }
  if (align === "right") {
    return ["text-align:right", "align-items:flex-end", "margin-inline:0"];
  }
  if (align === "center") {
    return ["text-align:center", "align-items:center", "margin-inline:auto"];
  }
  return [];
}
