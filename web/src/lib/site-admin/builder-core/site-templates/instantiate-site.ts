/**
 * instantiate-site.ts — turn a Look + built components + identity + images
 * into validated page trees. PURE: no IO, no model, no Supabase.
 *
 * Order per tree (docs/plans/ai-composer-brief-contract.md §3: personalise
 * first, validate against the real registry last):
 *   1. splice business components into `slot-*` containers (root splice)
 *   2. resolve `{{copy.*}}` markers → locale text + i18n overlay for the other
 *   3. resolve `{{business.*}}` identity placeholders; `[[ … ]]` optional
 *      groups drop whole when a placeholder inside is empty
 *   4. resolve `look://image/*` → owner media or stock; unresolved → node
 *      dropped + issue recorded (a box is never rendered)
 *   5. drop text nodes whose resolved text is empty (no blank lines)
 *   6. re-mint ids, `validateBuilderNodeTree`
 *
 * `ok` is false when any page has a leftover marker, a dropped image slot, or
 * validator issues. The caller decides whether that is `fallback_used` or
 * `failed`; this module only reports honestly.
 */

import { cloneBuilderTreeWithFreshIds } from "@/lib/site-admin/builder-node/page-designs/expand-repeaters";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

import {
  COPY_MARKER_RE,
  DEFAULT_PAGE_HREFS,
  IMAGE_MARKER_PREFIX,
  IMAGE_SLOT_KEYS,
  SITE_PAGE_ROLES,
  SLOT_IDS,
  imageRoleForSlot,
  slotAnchorId,
  type Bilingual,
  type ImageResolver,
  type ImageSlotKey,
  type Look,
  type SiteIdentity,
  type SiteLocale,
  type SitePageRole,
  type SlotId,
} from "./types";

export interface InstantiateSiteInput {
  look: Look;
  locale: SiteLocale;
  identity: SiteIdentity;
  images: ImageResolver;
  /** Already-built component nodes per slot. Missing slot → slot removed. */
  components: ReadonlyMap<SlotId, BuilderNode[]>;
  /** Model or operator copy, keyed like `look.copy`. Wins over the Look. */
  copyOverrides?: Readonly<Record<string, Partial<Bilingual>>>;
}

export interface InstantiateSiteResult {
  ok: boolean;
  pages: Record<SitePageRole, BuilderNode[]>;
  shell: { header: BuilderNode[]; footer: BuilderNode[] };
  themePatch: Record<string, string>;
  /** Human-readable, one per defect: `home: image slot "hero" unresolved`. */
  issues: string[];
  /** Slots that were filled, for the outcome report. */
  filledSlots: SlotId[];
}

const OTHER_LOCALE: Record<SiteLocale, SiteLocale> = { es: "en", en: "es" };

/** Props whose top-level string is user-visible copy and may carry i18n. */
const TEXT_PROPS = ["text", "label", "alt", "title", "subtitle", "emptyMessage", "headline", "subheadline", "eyebrow", "copy", "ctaLabel", "emptyStateText", "overlayTitle", "overlayBody", "overlayHours", "overlayAddress", "menuLabel", "brand", "venueName", "ctaVerb", "cardNotice"] as const;

// ── Template text ───────────────────────────────────────────────────────────

const IDENTITY_VARS = (identity: SiteIdentity): Record<string, string> => ({
  ...Object.fromEntries(
    SITE_PAGE_ROLES.map((role) => [`href.${role}`, identity.pageHrefs?.[role] ?? DEFAULT_PAGE_HREFS[role]]),
  ),
  "business.name": identity.businessName.trim(),
  "business.tagline": identity.tagline?.trim() ?? "",
  "business.city": identity.city?.trim() ?? "",
  "business.whatsapp": identity.whatsapp?.trim() ?? "",
  "business.address": identity.address?.trim() ?? "",
  "business.instagram": identity.instagram?.trim() ?? "",
  "business.facebook": identity.facebook?.trim() ?? "",
  "business.logo": identity.logoUrl?.trim() ?? "",
});

/**
 * Resolve `{{business.*}}` placeholders. `[[ … ]]` groups vanish whole when
 * any placeholder inside is empty. Unknown placeholders resolve to "" so a
 * typo never ships as literal braces.
 */
export function resolveIdentityTemplate(text: string, identity: SiteIdentity): string {
  const vars = IDENTITY_VARS(identity);
  const fill = (s: string, onEmpty: () => string | null): string | null => {
    let empty = false;
    const out = s.replace(/\{\{([a-z.]+)\}\}/g, (_m, key: string) => {
      const v = vars[key] ?? "";
      if (!v) empty = true;
      return v;
    });
    return empty ? onEmpty() : out;
  };
  const withGroups = text.replace(/\[\[([\s\S]*?)\]\]/g, (_m, inner: string) => fill(inner, () => "") ?? "");
  return (fill(withGroups, () => null) ?? withGroups.replace(/\{\{[a-z.]+\}\}/g, ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function lookupCopy(
  key: string,
  look: Look,
  overrides: InstantiateSiteInput["copyOverrides"],
): Bilingual | null {
  const base = look.copy[key];
  const over = overrides?.[key];
  if (!base && !over?.es && !over?.en) return null;
  return {
    es: over?.es ?? base?.es ?? over?.en ?? base?.en ?? "",
    en: over?.en ?? base?.en ?? over?.es ?? base?.es ?? "",
  };
}

// ── Walk ────────────────────────────────────────────────────────────────────

/** The union is exact per kind; the walker edits props generically. */
type LooseNode = Omit<BuilderNode, "props" | "children"> & {
  kind: BuilderNode["kind"];
  props: Record<string, unknown>;
  children?: BuilderNode[];
};
const loose = (n: BuilderNode): LooseNode => n as unknown as LooseNode;
const tight = (n: LooseNode): BuilderNode => n as unknown as BuilderNode;

interface WalkCtx {
  input: InstantiateSiteInput;
  page: string;
  issues: string[];
  filled: Set<SlotId>;
}

function layerLabelOf(node: BuilderNode): string | undefined {
  const v = (node.props as { layerLabel?: unknown } | undefined)?.layerLabel;
  return typeof v === "string" ? v : undefined;
}

function isSlotNode(node: BuilderNode): SlotId | null {
  const anchor = (node.props as { anchorId?: unknown } | undefined)?.anchorId ?? node.anchorId;
  if (typeof anchor !== "string") return null;
  const hit = SLOT_IDS.find((s) => slotAnchorId(s) === anchor);
  return hit ?? null;
}

/** Resolve one string that might be a copy marker; returns both locales or null to drop. */
function resolveText(raw: string, ctx: WalkCtx): { primary: string; other: string; wasMarker: boolean } | null {
  const { look, locale, identity, copyOverrides } = ctx.input;
  const m = COPY_MARKER_RE.exec(raw.trim());
  if (m) {
    const pair = lookupCopy(m[1], look, copyOverrides);
    if (!pair) {
      ctx.issues.push(`${ctx.page}: copy key "${m[1]}" has no text`);
      return null;
    }
    let primary = resolveIdentityTemplate(pair[locale], identity);
    let other = resolveIdentityTemplate(pair[OTHER_LOCALE[locale]], identity);
    if (!primary) {
      // A slot whose optional fact is missing ships its `.fallback` line (a
      // neutral sentence, never a fact) instead of an empty node.
      const fb = lookupCopy(`${m[1]}.fallback`, look, copyOverrides);
      if (fb) {
        primary = resolveIdentityTemplate(fb[locale], identity);
        other = resolveIdentityTemplate(fb[OTHER_LOCALE[locale]], identity);
      }
    }
    return primary ? { primary, other, wasMarker: true } : null;
  }
  if (raw.includes("{{")) {
    const primary = resolveIdentityTemplate(raw, identity);
    return primary ? { primary, other: primary, wasMarker: false } : null;
  }
  return { primary: raw, other: raw, wasMarker: false };
}

/** Resolve copy markers nested inside arrays/objects (nav links, form fields…). */
function resolveNested(value: unknown, ctx: WalkCtx): unknown {
  if (typeof value === "string") {
    const r = resolveText(value, ctx);
    return r ? r.primary : "";
  }
  if (Array.isArray(value)) return value.map((v) => resolveNested(v, ctx));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = resolveNested(v, ctx);
    return out;
  }
  return value;
}

function resolveImage(input: BuilderNode, ctx: WalkCtx): BuilderNode | null {
  const node = loose(input);
  const props = { ...node.props };
  const src = typeof props.src === "string" ? props.src : "";
  if (src.includes("{{")) {
    // Identity image (the owner's logo). Absent → no node; the Brand name
    // sibling stays and carries the header instead.
    const resolved = resolveIdentityTemplate(src, ctx.input.identity);
    if (!resolved) return null;
    const alt = typeof props.alt === "string" ? resolveIdentityTemplate(props.alt, ctx.input.identity) : "";
    return tight({ ...node, props: { ...props, src: resolved, alt } });
  }
  if (!src.startsWith(IMAGE_MARKER_PREFIX)) return input;
  const key = src.slice(IMAGE_MARKER_PREFIX.length) as ImageSlotKey;
  if (!(IMAGE_SLOT_KEYS as readonly string[]).includes(key)) {
    ctx.issues.push(`${ctx.page}: unknown image slot "${key}"`);
    return null;
  }
  const resolved = ctx.input.images(key, imageRoleForSlot(key));
  if (!resolved) {
    ctx.issues.push(`${ctx.page}: image slot "${key}" unresolved`);
    return null;
  }
  const locale = ctx.input.locale;
  props.src = resolved.src;
  props.alt = resolved.alt[locale];
  props.i18n = { ...(props.i18n as Record<string, Record<string, string>> | undefined), [OTHER_LOCALE[locale]]: { alt: resolved.alt[OTHER_LOCALE[locale]] } };
  return tight({ ...node, props });
}

const TEXT_ONLY_KINDS: ReadonlySet<string> = new Set(["heading", "paragraph", "divider", "spacer"]);

function walkNodes(nodes: ReadonlyArray<BuilderNode>, ctx: WalkCtx): BuilderNode[] {
  const out: BuilderNode[] = [];
  let droppedSocial = false;
  for (const original of nodes) {
    const node = loose(original);
    const slot = isSlotNode(original);
    if (slot) {
      const filler = ctx.input.components.get(slot);
      if (filler && filler.length > 0) {
        ctx.filled.add(slot);
        out.push(...walkNodes(filler, ctx));
      }
      continue; // an unfilled slot leaves no empty band behind
    }

    if (node.kind === "image") {
      const resolved = resolveImage(original, ctx);
      if (resolved) out.push(resolved);
      continue;
    }

    if (node.kind === "social_links") {
      // Links whose href is an identity placeholder survive only when the
      // fact exists; a row with no real link is dropped, never rendered empty.
      const props = { ...node.props };
      const links = (Array.isArray(props.links) ? props.links : []) as Array<Record<string, unknown>>;
      const kept = links
        .map((l) => ({ ...l, href: typeof l.href === "string" ? resolveIdentityTemplate(l.href, ctx.input.identity) : "" }))
        .filter((l) => typeof l.href === "string" && l.href.length > 0);
      if (kept.length === 0) {
        droppedSocial = true;
        continue;
      }
      out.push(tight({ ...node, props: { ...props, links: kept } }));
      continue;
    }

    const props: Record<string, unknown> = { ...node.props };
    let drop = false;
    const overlay: Record<string, string> = {};
    for (const key of TEXT_PROPS) {
      const raw = props[key];
      if (typeof raw !== "string" || raw.length === 0) continue;
      const r = resolveText(raw, ctx);
      if (!r) {
        if (key === "text" || key === "label") drop = true;
        else delete props[key];
        continue;
      }
      props[key] = r.primary;
      if (r.wasMarker && r.other && r.other !== r.primary) overlay[key] = r.other;
    }
    if (drop) continue;
    for (const [k, v] of Object.entries(props)) {
      if ((TEXT_PROPS as readonly string[]).includes(k) || k === "style" || k === "i18n") continue;
      if (typeof v === "string") {
        if (v.includes("{{")) props[k] = resolveNested(v, ctx);
      } else if (v && typeof v === "object") {
        props[k] = resolveNested(v, ctx);
      }
    }
    if (Object.keys(overlay).length > 0) {
      const existing = (props.i18n as Record<string, Record<string, string>> | undefined) ?? {};
      props.i18n = { ...existing, [OTHER_LOCALE[ctx.input.locale]]: { ...(existing[OTHER_LOCALE[ctx.input.locale]] ?? {}), ...overlay } };
    }
    let children = node.children ? walkNodes(node.children, ctx) : undefined;
    // Brand rule: when the logo image survived, the wordmark sibling goes.
    if (children && children.some((c) => layerLabelOf(c) === "Brand logo")) {
      children = children.filter((c) => layerLabelOf(c) !== "Brand name");
    }
    // A layout node whose every child fell away is a blank band; drop it.
    if (children && children.length === 0 && node.children && node.children.length > 0 && (node.kind === "container" || node.kind === "card" || node.kind === "cta_group" || node.kind === "split" || node.kind === "masonry")) {
      continue;
    }
    out.push(tight({ ...node, props, ...(children ? { children } : {}) }));
  }
  // "Follow us" over nothing: when the social row fell away and only text is
  // left beside it, the text goes too.
  if (droppedSocial && out.length > 0 && out.every((n) => TEXT_ONLY_KINDS.has(n.kind))) return [];
  return out;
}

function finish(nodes: BuilderNode[], page: string, issues: string[]): BuilderNode[] {
  const leftovers = JSON.stringify(nodes).match(/\{\{copy\.[A-Za-z0-9.-]+\}\}|look:\/\/image\//g);
  if (leftovers) issues.push(`${page}: ${leftovers.length} unresolved marker(s)`);
  const result = validateBuilderNodeTree(cloneBuilderTreeWithFreshIds(nodes));
  if (!result.ok) {
    for (const issue of result.issues) issues.push(`${page}: ${issue.path} ${issue.message}`);
  }
  return result.tree;
}

// ── Public ──────────────────────────────────────────────────────────────────

export function instantiateSite(input: InstantiateSiteInput): InstantiateSiteResult {
  const issues: string[] = [];
  const filled = new Set<SlotId>();
  const run = (nodes: ReadonlyArray<BuilderNode>, page: string): BuilderNode[] => {
    const ctx: WalkCtx = { input, page, issues, filled };
    return finish(walkNodes(nodes, ctx), page, issues);
  };

  const pages = {} as Record<SitePageRole, BuilderNode[]>;
  for (const role of SITE_PAGE_ROLES) pages[role] = run(input.look.pages[role], role);
  const shell = {
    header: run(input.look.shell.header, "shell.header"),
    footer: run(input.look.shell.footer, "shell.footer"),
  };
  for (const role of SITE_PAGE_ROLES) {
    if (pages[role].length === 0) issues.push(`${role}: page is empty`);
  }
  return {
    ok: issues.length === 0,
    pages,
    shell,
    themePatch: { ...input.look.themePatch },
    issues,
    filledSlots: [...filled],
  };
}
