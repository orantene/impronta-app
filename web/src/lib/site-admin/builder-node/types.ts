export type BuilderNodeKind =
  | "section"
  | "container"
  | "split"
  | "accordion"
  | "accordion_item"
  | "tabs"
  | "tab_panel"
  | "carousel"
  | "masonry"
  | "heading"
  | "paragraph"
  | "button"
  | "image"
  | "divider"
  | "spacer"
  | "card"
  | "cta_group";

export interface BuilderNodeBase {
  id: string;
  kind: BuilderNodeKind;
}

export interface BuilderNodeStyleValue {
  align?: "left" | "center" | "right";
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "default" | "muted" | "strong";
  maxWidth?: "narrow" | "reading" | "wide" | "full";
  marginTop?: "none" | "s" | "m" | "l";
  marginBottom?: "none" | "s" | "m" | "l";
  paddingX?: "none" | "s" | "m" | "l";
  paddingY?: "none" | "s" | "m" | "l";
  background?: "none" | "surface" | "contrast";
  radius?: "none" | "sm" | "md" | "lg" | "pill";
  objectFit?: "cover" | "contain";
  aspectRatio?: "auto" | "1:1" | "4:3" | "3:4" | "16:9" | "21:9";
  // Visibility — hide this node at the active viewport. On a breakpoint it hides
  // only there (desktop stays shown); on desktop it hides everywhere.
  visibility?: "visible" | "hidden";
  // Free-value escapes — override the token presets above with raw CSS so any
  // design can be matched. Stored as CSS strings (lengths keep their unit) and
  // layered after the tokens in the renderer, so a free value always wins.
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: number;
  lineHeight?: string;
  letterSpacing?: string;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: "solid" | "dashed" | "dotted";
  // Free border-radius escape — raw CSS border-radius. Layers after the radius
  // token so an exact value wins, and the shorthand supports per-corner control
  // ("12px 12px 0 0", "50%", etc.).
  borderRadius?: string;
  // Free dimension escapes — exact width / height / min-height as CSS length
  // strings. Coexist with the maxWidth token (max-width clamps the free width).
  width?: string;
  height?: string;
  minHeight?: string;
  // Free per-side padding escapes (CSS length strings). Layer after the
  // paddingX/paddingY token block so an exact side wins over the preset.
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  // Free per-side margin escapes (CSS length strings). The marginTop/marginBottom
  // tokens above are preset enums, so the exact values use collision-safe *Free
  // keys and layer after every margin token in the renderer (free always wins).
  marginTopFree?: string;
  marginRightFree?: string;
  marginBottomFree?: string;
  marginLeftFree?: string;
  // Surface & depth escapes. backgroundImage takes a CSS url()/gradient and is
  // rendered cover/center/no-repeat. opacity is 0–1.
  boxShadow?: string;
  backgroundImage?: string;
  opacity?: number;
  // Free gap escape (layout nodes) — overrides the gap token on container /
  // split / card / cta_group / carousel / masonry by reassigning the --bn-gap
  // CSS variable, so every consumer (incl. child tracks) picks it up.
  gap?: string;
}

export interface BuilderNodeStyle extends BuilderNodeStyleValue {
  responsive?: {
    tablet?: BuilderNodeStyleValue;
    mobile?: BuilderNodeStyleValue;
  };
}

export interface BuilderSectionNode extends BuilderNodeBase {
  kind: "section";
  props: {
    sectionId?: string | null;
    sectionTypeKey: string;
    label?: string | null;
    slotKey?: string | null;
    sortOrder?: number;
    dataBinding?: {
      sourceKey: string;
      mode?: "manual" | "bound" | "hybrid";
      filterQuery?: string;
      maxItems?: number;
    };
  };
  children?: BuilderNode[];
}

export interface BuilderContainerNode extends BuilderNodeBase {
  kind: "container";
  props: {
    layout: "stack" | "row" | "grid";
    gap?: "s" | "m" | "l";
    columns?: 1 | 2 | 3 | 4;
    align?: "start" | "center" | "end" | "stretch";
    responsive?: {
      tablet?: {
        layout?: "stack" | "row" | "grid";
        gap?: "s" | "m" | "l";
        columns?: 1 | 2 | 3 | 4;
        align?: "start" | "center" | "end" | "stretch";
      };
      mobile?: {
        layout?: "stack" | "row" | "grid";
        gap?: "s" | "m" | "l";
        columns?: 1 | 2 | 3 | 4;
        align?: "start" | "center" | "end" | "stretch";
      };
    };
    dataBinding?: {
      sourceKey: string;
      mode?: "manual" | "bound" | "hybrid";
      filterQuery?: string;
      maxItems?: number;
    };
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderSplitNode extends BuilderNodeBase {
  kind: "split";
  props: {
    ratio?: "50-50" | "40-60" | "60-40" | "30-70" | "70-30";
    gap?: "s" | "m" | "l";
    collapseOnMobile?: boolean;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderAccordionNode extends BuilderNodeBase {
  kind: "accordion";
  props: {
    allowMultiple?: boolean;
    defaultOpenItemIds?: string[];
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderAccordionItemNode extends BuilderNodeBase {
  kind: "accordion_item";
  props: {
    title: string;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderTabsNode extends BuilderNodeBase {
  kind: "tabs";
  props: {
    defaultTabId?: string;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderTabPanelNode extends BuilderNodeBase {
  kind: "tab_panel";
  props: {
    title: string;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderCarouselNode extends BuilderNodeBase {
  kind: "carousel";
  props: {
    slidesPerView?: 1 | 2 | 3 | 4;
    autoplayMs?: number;
    loop?: boolean;
    showArrows?: boolean;
    showDots?: boolean;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderMasonryNode extends BuilderNodeBase {
  kind: "masonry";
  props: {
    columns?: 2 | 3 | 4 | 5;
    gap?: "s" | "m" | "l";
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderHeadingNode extends BuilderNodeBase {
  kind: "heading";
  props: {
    text: string;
    level: 1 | 2 | 3 | 4;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderParagraphNode extends BuilderNodeBase {
  kind: "paragraph";
  props: {
    text: string;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderButtonNode extends BuilderNodeBase {
  kind: "button";
  props: {
    label: string;
    href: string;
    tone?: "primary" | "secondary";
    stateStyles?: {
      hover?: { tone?: "primary" | "secondary" };
      focus?: { tone?: "primary" | "secondary" };
      active?: { tone?: "primary" | "secondary" };
      disabled?: { tone?: "primary" | "secondary" };
    };
    style?: BuilderNodeStyle;
  };
}

export interface BuilderImageNode extends BuilderNodeBase {
  kind: "image";
  props: {
    src: string;
    alt?: string;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderSpacerNode extends BuilderNodeBase {
  kind: "spacer";
  props: {
    size: "s" | "m" | "l";
    style?: BuilderNodeStyle;
  };
}

export interface BuilderDividerNode extends BuilderNodeBase {
  kind: "divider";
  props: {
    tone?: "default" | "muted";
    style?: BuilderNodeStyle;
  };
}

/** Bounded editorial surface (stacked children, variant presets). */
export interface BuilderCardNode extends BuilderNodeBase {
  kind: "card";
  props: {
    variant?: "elevated" | "outline" | "ghost";
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

/** Primary actions row: heading, copy, and button children with row/stack layout. */
export interface BuilderCtaGroupNode extends BuilderNodeBase {
  kind: "cta_group";
  props: {
    layout?: "row" | "stack";
    gap?: "s" | "m" | "l";
    align?: "start" | "center" | "end" | "stretch";
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export type BuilderNode =
  | BuilderSectionNode
  | BuilderContainerNode
  | BuilderSplitNode
  | BuilderAccordionNode
  | BuilderAccordionItemNode
  | BuilderTabsNode
  | BuilderTabPanelNode
  | BuilderCarouselNode
  | BuilderMasonryNode
  | BuilderHeadingNode
  | BuilderParagraphNode
  | BuilderButtonNode
  | BuilderImageNode
  | BuilderDividerNode
  | BuilderSpacerNode
  | BuilderCardNode
  | BuilderCtaGroupNode;

export type BuilderNodeTree = BuilderNode[];
