/**
 * Talent theme gallery: PUBLISH-TIME VALIDATORS for Designs and Looks (pure).
 *
 * Every built-in runs through these in `test:builder`, and the sync / a future
 * authoring path refuses to write a row that fails. Both return
 * `{ ok, errors }` with one human-readable error per violation (never throw).
 *
 * DESIGN rules
 *   - both trees pass `validateBuilderNodeTree`;
 *   - no literal colours (hex, rgb()/hsl()/... functions, or a non-token value
 *     in a colour prop) and no literal font stacks: colours are `token:` refs
 *     or registry step values (`tone`, `background: "contrast"`), fonts are
 *     `token:typography.*-font-family`;
 *   - node kinds from the kit allow-list only; no raw html / code / embeds, no
 *     per-node custom CSS;
 *   - every top-level home section carries `slotKey` + a kit `originRole`
 *     (unique slots), and the home has a hero AND a contact section;
 *   - the shell holds a kit header + footer, nothing else at the top level.
 *
 * LOOK rules
 *   - keys restricted to the Look layer (`color.*`, `typography.*`,
 *     `background.mode`), registered in TOKEN_REGISTRY, agency-configurable,
 *     and each value passes its registry validator;
 *   - `color.background`, `color.ink`, `color.primary` are set explicitly;
 *   - contrast ink/background >= 4.5:1 and primary/background >= 3:1;
 *   - custom font families exist in the builder font registry or the Google
 *     catalogue.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import {
  firstFontFamily,
  resolveBuilderFont,
} from "@/lib/site-admin/builder-node/fonts-registry";
import { getGoogleFontMeta } from "@/lib/site-admin/builder-node/fonts-catalog";
import { TOKEN_REGISTRY } from "@/lib/site-admin/tokens/registry";
import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";
import {
  TALENT_KIT_SECTIONS,
  TALENT_KIT_SECTION_ROLES,
  TALENT_KIT_SHELL,
  TALENT_KIT_SHELL_ROLES,
} from "./section-kit";
import { isLookOwnedTokenKey, LOOK_REQUIRED_TOKEN_KEYS } from "./look-layer";
import type { ThemeValidationResult } from "./types";

// ── Design ───────────────────────────────────────────────────────────────────

/** Node kinds a Design may use anywhere in its trees. */
export const DESIGN_ALLOWED_NODE_KINDS: ReadonlySet<string> = new Set([
  "section",
  "container",
  "split",
  "card",
  "cta_group",
  "masonry",
  "heading",
  "paragraph",
  "button",
  "image",
  "nav",
  "social_links",
  "divider",
  "spacer",
  "icon",
  // Maison free-website Design (PR 1 allowlist; PR 2 ports the real trees).
  "tabs",
  "tab_panel",
  "accordion",
  "accordion_item",
  "reveal",
  "services_catalog",
]);

/** Kinds rejected with a specific message (raw markup / third-party / agency data). */
const RAW_CONTENT_KINDS: ReadonlySet<string> = new Set([
  "code",
  "embed",
  "rich_text",
  "section_embed",
  "social_post",
  "social_feed",
]);

/** Curated section landmarks allowed at the TOP of a shell tree. */
const SHELL_SECTION_TYPES: ReadonlySet<string> = new Set(["site_header", "site_footer"]);

export const HEX_COLOR_RE = /#[0-9a-f]{3,8}\b/i;
const COLOR_FUNCTION_RE = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
/** Prop keys whose string values are paint (deep-scanned for literals). */
const PAINT_KEY_RE = /color|background|border|shadow|fill|stroke|outline/i;
/** Keys that must hold ONLY colour refs (token / keyword), term by term. */
const COLOR_VALUE_KEY_RE = /color$|^color$|^menuBackground$|^fill$|^stroke$/i;
const COLOR_KEYWORDS: ReadonlySet<string> = new Set([
  "transparent",
  "currentcolor",
  "inherit",
]);
const FONT_TOKEN_REFS: ReadonlySet<string> = new Set([
  "token:typography.heading-font-family",
  "token:typography.body-font-family",
]);

function isColorRefTerm(term: string): boolean {
  return term.startsWith("token:color.") || COLOR_KEYWORDS.has(term.toLowerCase());
}

function scanPaint(value: unknown, path: string, key: string, errors: string[]): void {
  if (typeof value === "string") {
    if (key === "fontFamily") {
      if (!FONT_TOKEN_REFS.has(value)) {
        errors.push(`${path}: fontFamily must be a token:typography.*-font-family ref, got "${value}".`);
      }
      return;
    }
    if (HEX_COLOR_RE.test(value) || COLOR_FUNCTION_RE.test(value)) {
      errors.push(`${path}: literal colour "${value}" (use a token: ref).`);
      return;
    }
    if (COLOR_VALUE_KEY_RE.test(key)) {
      const terms = value.trim().split(/\s+/).filter(Boolean);
      if (!terms.every(isColorRefTerm)) {
        errors.push(`${path}: colour "${value}" must be token:color.* refs.`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, i) => scanPaint(entry, `${path}.${i}`, key, errors));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      scanStyleLike(k, v, `${path}.${k}`, errors);
    }
  }
}

/** Route one prop entry: style objects are scanned whole, paint keys deep. */
function scanStyleLike(key: string, value: unknown, path: string, errors: string[]): void {
  if (key === "customCss") {
    errors.push(`${path}: per-node custom CSS is not allowed in a Design.`);
    return;
  }
  if (key === "style" || key === "fontFamily" || PAINT_KEY_RE.test(key)) {
    scanPaint(value, path, key, errors);
    return;
  }
  if (value && typeof value === "object") {
    // Nested config (responsive buckets, sectionProps, ...) can hide paint.
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
    for (const [k, v] of entries) scanStyleLike(k, v, `${path}.${k}`, errors);
  }
}

function walkNodes(
  nodes: ReadonlyArray<BuilderNode>,
  path: string,
  visit: (node: BuilderNode, path: string, depth: number) => void,
  depth = 0,
): void {
  nodes.forEach((node, i) => {
    const here = `${path}[${i}]`;
    visit(node, here, depth);
    if ("children" in node && Array.isArray(node.children)) {
      walkNodes(node.children, `${here}.children`, visit, depth + 1);
    }
  });
}

function readProvenance(node: BuilderNode): { slotKey?: string; originRole?: string } {
  const props = (node.props ?? {}) as Record<string, unknown>;
  return {
    slotKey: typeof props.slotKey === "string" ? props.slotKey : undefined,
    originRole: typeof props.originRole === "string" ? props.originRole : undefined,
  };
}

const KIT_SLOT_BY_ROLE: ReadonlyMap<string, string> = new Map(
  [...Object.values(TALENT_KIT_SECTIONS), ...Object.values(TALENT_KIT_SHELL)].map(
    (s) => [s.originRole, s.slotKey] as const,
  ),
);

function checkTreeContent(tree: ReadonlyArray<BuilderNode>, label: string, errors: string[]): void {
  walkNodes(tree, label, (node, path, depth) => {
    const kind = String(node.kind);
    if (RAW_CONTENT_KINDS.has(kind)) {
      errors.push(`${path}: "${kind}" nodes (raw html / code / embeds) are not allowed in a Design.`);
    } else if (!DESIGN_ALLOWED_NODE_KINDS.has(kind)) {
      errors.push(`${path}: node kind "${kind}" is not in the talent section kit.`);
    }
    if (kind === "section") {
      const typeKey = (node.props as { sectionTypeKey?: unknown }).sectionTypeKey;
      const ok = label === "shellTree" && depth === 0 && SHELL_SECTION_TYPES.has(String(typeKey));
      if (!ok) {
        errors.push(`${path}: curated section "${String(typeKey)}" is only allowed as a shell landmark.`);
      }
    }
    const props = (node.props ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(props)) {
      scanStyleLike(key, value, `${path}.props.${key}`, errors);
    }
  });
}

function checkTopLevel(
  tree: ReadonlyArray<BuilderNode>,
  label: string,
  allowedRoles: ReadonlySet<string>,
  errors: string[],
): Set<string> {
  const roles = new Set<string>();
  const slots = new Set<string>();
  tree.forEach((node, i) => {
    const { slotKey, originRole } = readProvenance(node);
    const path = `${label}[${i}]`;
    if (!slotKey || !originRole) {
      errors.push(`${path}: top-level section needs props.slotKey and props.originRole.`);
      return;
    }
    if (!allowedRoles.has(originRole)) {
      errors.push(`${path}: originRole "${originRole}" is not a kit section.`);
      return;
    }
    if (KIT_SLOT_BY_ROLE.get(originRole) !== slotKey) {
      errors.push(`${path}: slotKey "${slotKey}" does not match kit role "${originRole}".`);
    }
    if (slots.has(slotKey)) errors.push(`${path}: duplicate slotKey "${slotKey}".`);
    slots.add(slotKey);
    roles.add(originRole);
  });
  return roles;
}

function asTree(value: unknown): BuilderNode[] | null {
  return Array.isArray(value) ? (value as BuilderNode[]) : null;
}

export function validateDesign(payload: unknown): ThemeValidationResult {
  const errors: string[] = [];
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const shellTree = asTree(record?.shellTree);
  const homeTree = asTree(record?.homeTree);
  if (!shellTree || !homeTree) {
    return { ok: false, errors: ["Design payload needs shellTree and homeTree arrays."] };
  }

  for (const [label, tree] of [
    ["shellTree", shellTree],
    ["homeTree", homeTree],
  ] as const) {
    const check = validateBuilderNodeTree(tree);
    if (!check.ok) {
      for (const issue of check.issues) errors.push(`${label}.${issue.path}: ${issue.message}`);
    }
    checkTreeContent(tree, label, errors);
  }

  const homeRoles = checkTopLevel(homeTree, "homeTree", TALENT_KIT_SECTION_ROLES, errors);
  if (!homeRoles.has(TALENT_KIT_SECTIONS.hero.originRole)) {
    errors.push("homeTree: a Design needs a hero section.");
  }
  if (!homeRoles.has(TALENT_KIT_SECTIONS.contact.originRole)) {
    errors.push("homeTree: a Design needs a contact section.");
  }

  const shellRoles = checkTopLevel(shellTree, "shellTree", TALENT_KIT_SHELL_ROLES, errors);
  for (const landmark of Object.values(TALENT_KIT_SHELL)) {
    if (!shellRoles.has(landmark.originRole)) {
      errors.push(`shellTree: a Design needs a ${landmark.slotKey} landmark.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── Look ─────────────────────────────────────────────────────────────────────

export const LOOK_MIN_INK_CONTRAST = 4.5;
export const LOOK_MIN_PRIMARY_CONTRAST = 3;

const FONT_FAMILY_KEYS = [
  "typography.heading-font-family",
  "typography.body-font-family",
] as const;

/** True when a stored font-family value names a font we can actually serve. */
export function isKnownFontFamily(value: string): boolean {
  if (resolveBuilderFont(value)) return true;
  const family = firstFontFamily(value);
  return family ? getGoogleFontMeta(family) !== null : false;
}

export function validateLook(payload: unknown): ThemeValidationResult {
  const errors: string[] = [];
  const raw =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).tokens
      : undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["Look payload needs a tokens object."] };
  }
  const tokens = raw as Record<string, unknown>;

  for (const [key, value] of Object.entries(tokens)) {
    const spec = TOKEN_REGISTRY[key];
    if (!spec) {
      errors.push(`${key}: unknown token key.`);
      continue;
    }
    if (!isLookOwnedTokenKey(key)) {
      errors.push(`${key}: not a Look token (colours, typography, background.mode only).`);
      continue;
    }
    if (!spec.agencyConfigurable) {
      errors.push(`${key}: derived token, cannot be set by a Look.`);
      continue;
    }
    if (typeof value !== "string") {
      errors.push(`${key}: value must be a string.`);
      continue;
    }
    const parsed = spec.validator.safeParse(value);
    if (!parsed.success) {
      errors.push(`${key}: ${parsed.error.issues[0]?.message ?? "invalid value"}.`);
    }
  }

  for (const key of LOOK_REQUIRED_TOKEN_KEYS) {
    const value = tokens[key];
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${key}: a Look must set it explicitly.`);
    }
  }

  const background = typeof tokens["color.background"] === "string" ? tokens["color.background"] : "";
  const ink = typeof tokens["color.ink"] === "string" ? tokens["color.ink"] : "";
  const primary = typeof tokens["color.primary"] === "string" ? tokens["color.primary"] : "";
  if (background && ink) {
    const ratio = contrastRatio(ink, background);
    if (ratio === null) errors.push("color.ink / color.background: contrast not computable.");
    else if (ratio < LOOK_MIN_INK_CONTRAST) {
      errors.push(`color.ink on color.background is ${ratio.toFixed(2)}:1 (needs ${LOOK_MIN_INK_CONTRAST}:1).`);
    }
  }
  if (background && primary) {
    const ratio = contrastRatio(primary, background);
    if (ratio === null) errors.push("color.primary / color.background: contrast not computable.");
    else if (ratio < LOOK_MIN_PRIMARY_CONTRAST) {
      errors.push(`color.primary on color.background is ${ratio.toFixed(2)}:1 (needs ${LOOK_MIN_PRIMARY_CONTRAST}:1).`);
    }
  }

  for (const key of FONT_FAMILY_KEYS) {
    const value = tokens[key];
    if (typeof value === "string" && value.trim() !== "" && !isKnownFontFamily(value)) {
      errors.push(`${key}: font "${value}" is not in the font registry or the Google catalogue.`);
    }
  }

  return { ok: errors.length === 0, errors };
}
