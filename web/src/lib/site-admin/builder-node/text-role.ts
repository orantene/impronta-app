import type { BuilderNode } from "./types";

/** Unified text roles exposed in the canvas text toolbar. */
export type BuilderTextRoleId = "paragraph" | "h1" | "h2" | "h3" | "h4";

export interface BuilderTextRoleOption {
  id: BuilderTextRoleId;
  label: string;
  shortLabel: string;
}

export const BUILDER_TEXT_ROLE_OPTIONS: ReadonlyArray<BuilderTextRoleOption> = [
  { id: "paragraph", label: "Paragraph", shortLabel: "P" },
  { id: "h1", label: "Heading 1", shortLabel: "H1" },
  { id: "h2", label: "Heading 2", shortLabel: "H2" },
  { id: "h3", label: "Heading 3", shortLabel: "H3" },
  { id: "h4", label: "Heading 4", shortLabel: "H4" },
];

export const THEME_TYPOGRAPHY_SIZE_FALLBACKS: Readonly<
  Record<BuilderTextRoleId, string>
> = {
  h1: "clamp(40px, 6vw, 72px)",
  h2: "clamp(28px, 4vw, 48px)",
  h3: "clamp(22px, 3vw, 32px)",
  h4: "clamp(18px, 2.4vw, 24px)",
  paragraph: "16px",
};

const THEME_SIZE_CSS_VARS: Readonly<Record<BuilderTextRoleId, string>> = {
  h1: "--token-typography-h1-size",
  h2: "--token-typography-h2-size",
  h3: "--token-typography-h3-size",
  h4: "--token-typography-h4-size",
  paragraph: "--token-typography-body-size",
};

export function resolveBuilderTextRoleFromNode(
  node: Extract<BuilderNode, { kind: "heading" | "paragraph" }>,
): BuilderTextRoleId {
  if (node.kind === "paragraph") return "paragraph";
  if (node.props.level === 1) return "h1";
  if (node.props.level === 2) return "h2";
  if (node.props.level === 3) return "h3";
  return "h4";
}

export function builderTextRoleSupported(
  node: BuilderNode,
): node is Extract<BuilderNode, { kind: "heading" | "paragraph" }> {
  return node.kind === "heading" || node.kind === "paragraph";
}

export function readThemeTypographySize(role: BuilderTextRoleId): string {
  if (typeof document === "undefined") {
    return THEME_TYPOGRAPHY_SIZE_FALLBACKS[role];
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(THEME_SIZE_CSS_VARS[role])
    .trim();
  return raw || THEME_TYPOGRAPHY_SIZE_FALLBACKS[role];
}

function headingLevelForRole(role: BuilderTextRoleId): 1 | 2 | 3 | 4 | null {
  if (role === "h1") return 1;
  if (role === "h2") return 2;
  if (role === "h3") return 3;
  if (role === "h4") return 4;
  return null;
}

function stripFontSizeOverride(
  style: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!style) return undefined;
  const next = { ...style };
  delete next.fontSize;
  const responsive = next.responsive as
    | Partial<Record<"tablet" | "mobile", Record<string, unknown>>>
    | undefined;
  if (responsive) {
    const nextResponsive: Record<string, unknown> = { ...responsive };
    for (const bp of ["tablet", "mobile"] as const) {
      const bucket = nextResponsive[bp] as Record<string, unknown> | undefined;
      if (!bucket || !("fontSize" in bucket)) continue;
      const nextBucket = { ...bucket };
      delete nextBucket.fontSize;
      if (Object.keys(nextBucket).length === 0) delete nextResponsive[bp];
      else nextResponsive[bp] = nextBucket;
    }
    if (Object.keys(nextResponsive).length === 0) delete next.responsive;
    else next.responsive = nextResponsive;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function buildConvertedTextNode(
  node: Extract<BuilderNode, { kind: "heading" | "paragraph" }>,
  role: BuilderTextRoleId,
): Extract<BuilderNode, { kind: "heading" | "paragraph" }> {
  const text = node.props.text;
  const layerLabel = (node.props as { layerLabel?: string }).layerLabel;
  const style = stripFontSizeOverride(
    (node.props.style as Record<string, unknown> | undefined) ?? undefined,
  );
  // Preserve base-field carriers (whole-node lock, per-prop locks, visibility)
  // across the heading<->paragraph reconstruction — this rebuilds the node from
  // a literal, so without this an admin lock silently drops on a role change.
  const carriers: Record<string, unknown> = {};
  for (const key of ["locked", "lockedProps", "visibilityCondition"] as const) {
    const v =
      (node.props as Record<string, unknown>)[key] ??
      (node as unknown as Record<string, unknown>)[key];
    if (v !== undefined) carriers[key] = v;
  }
  const level = headingLevelForRole(role);
  if (level === null) {
    return {
      id: node.id,
      kind: "paragraph",
      props: {
        text,
        ...(layerLabel ? { layerLabel } : {}),
        ...(style ? { style } : {}),
        ...carriers,
      },
      ...carriers,
    } as Extract<BuilderNode, { kind: "paragraph" }>;
  }
  return {
    id: node.id,
    kind: "heading",
    props: {
      text,
      level,
      ...(layerLabel ? { layerLabel } : {}),
      ...(style ? { style } : {}),
      ...carriers,
    },
    ...carriers,
  } as Extract<BuilderNode, { kind: "heading" }>;
}

