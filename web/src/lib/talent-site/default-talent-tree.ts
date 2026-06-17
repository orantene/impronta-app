/**
 * The PLATFORM-DEFAULT talent profile, as a freeform builder-node tree.
 *
 * This is the *fallback* constant used to seed the reserved Lab template
 * (`__platform_default_talent_profile__`) AND the built-in default returned when
 * that template row is absent. Once seeded + published, the lead edits the
 * default in the Builder Lab (no deploy) and the seed is no longer consulted.
 *
 * Per-talent content uses `{{token}}` placeholders (see TALENT_PROFILE_TOKENS)
 * which `hydrateTalentTree()` replaces with THIS talent's real profile data at
 * resolve time — the same build-time-substitution model the slot templates use
 * (`buildSlots(ctx)`), just expressed as builder nodes so it is Lab-authorable.
 *
 * Pure data + pure functions (no server imports) so it is unit-testable and the
 * seed script can import it directly.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/** Reserved `builder_templates.slug` for the platform-default talent profile. */
export const DEFAULT_TALENT_PROFILE_TEMPLATE_SLUG =
  "__platform_default_talent_profile__";

/**
 * Per-talent values substituted into the default tree's `{{token}}` slots.
 * Mirrors the public-safe `TalentPortfolioStarterProfile` projection.
 */
export interface TalentProfileTokens {
  displayName: string;
  /** Discipline / primary type label, e.g. "Model". */
  primaryTypeLabel: string;
  /**
   * Up to three NON-primary discipline labels, e.g. "Photographer", "Stylist".
   * Empty strings when fewer — the empty-card prune drops their chips.
   */
  secondaryType1: string;
  secondaryType2: string;
  secondaryType3: string;
  /**
   * All disciplines (primary first) joined " · ", e.g. "Model · Photographer".
   * "" when none. A single-line alternative to the chip row for Lab authors.
   */
  disciplinesLine: string;
  /** Short location/discipline tagline shown under the name. */
  tagline: string;
  bio: string;
  /**
   * The talent's FULL published bio (unsliced), for the About paragraph. Falls
   * back to the tagline / a welcome line when no bio exists.
   */
  richBio: string;
  /** City line, e.g. "Based in Cancún" (already prefixed). */
  locationLine: string;
  /**
   * Spoken-languages line, e.g. "Languages: Spanish · English" (already
   * prefixed). "" when none — the empty-paragraph carries no visible box.
   */
  languagesLine: string;
  /** Hero / about headshot URL (absolute). Empty when none. */
  headshotUrl: string;
  /** `/t/<code>` profile path. */
  profilePath: string;
  /** `/t/<code>?inquire=1` inquiry CTA href. */
  inquireHref: string;
  /** First three service / focus labels (already de-duped + capped). */
  service1: string;
  service2: string;
  service3: string;
  /** Up to six gallery image URLs (absolute); empty strings when fewer. */
  gallery: string[];
  /**
   * The talent's published Max site URL. Non-empty ONLY when the talent is on
   * the Max plan AND has a published site. Empty string "" when absent — the
   * Max badge / CTA nodes are pruned by `pruneEmptyMaxBadge` when this is "".
   */
  maxSiteUrl: string;
}

const FIELD_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/**
 * Resolve `{{token}}` placeholders in a single string against a flat token map.
 * An unknown token resolves to "" (never leaks a raw `{{x}}` to the page).
 */
function resolveTokens(value: string, tokens: Record<string, string>): string {
  return value.replace(FIELD_TOKEN_RE, (_m, key: string) => tokens[key] ?? "");
}

/**
 * Deep-clone a props value, substituting `{{token}}` in EVERY string it contains
 * — recursing into nested objects and arrays. Prop-agnostic: a Lab-authored tree
 * can place `{{token}}` in any prop (title, brand, nav-link labels, pricing
 * fields, form fields…), not just the built-in text-bearing ones, and they all
 * hydrate. Unknown tokens resolve to "" so nothing leaks a raw `{{x}}`. Pure —
 * returns new values, never mutates the input.
 */
function resolvePropValue(
  value: unknown,
  tokens: Record<string, string>,
): unknown {
  if (typeof value === "string") {
    return value.includes("{{") ? resolveTokens(value, tokens) : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolvePropValue(entry, tokens));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolvePropValue(v, tokens);
    }
    return out;
  }
  return value;
}

/**
 * Walk a builder-node tree and substitute `{{token}}` placeholders in EVERY
 * string-valued prop (deep — including nested objects and arrays) against the
 * talent's data. Returns a NEW tree (structural clone) — the source constant is
 * never mutated. Image/button nodes whose resolved `src`/`href` is empty keep a
 * safe fallback so the page never renders a broken `<img src="">` / dead link.
 */
export function hydrateTalentTree(
  tree: ReadonlyArray<BuilderNode>,
  talent: TalentProfileTokens,
): BuilderNode[] {
  const flat: Record<string, string> = {
    displayName: talent.displayName,
    primaryTypeLabel: talent.primaryTypeLabel,
    secondaryType1: talent.secondaryType1,
    secondaryType2: talent.secondaryType2,
    secondaryType3: talent.secondaryType3,
    disciplinesLine: talent.disciplinesLine,
    tagline: talent.tagline,
    bio: talent.bio,
    richBio: talent.richBio,
    locationLine: talent.locationLine,
    languagesLine: talent.languagesLine,
    headshotUrl: talent.headshotUrl,
    profilePath: talent.profilePath,
    inquireHref: talent.inquireHref,
    service1: talent.service1,
    service2: talent.service2,
    service3: talent.service3,
    gallery0: talent.gallery[0] ?? "",
    gallery1: talent.gallery[1] ?? "",
    gallery2: talent.gallery[2] ?? "",
    gallery3: talent.gallery[3] ?? "",
    gallery4: talent.gallery[4] ?? "",
    gallery5: talent.gallery[5] ?? "",
    maxSiteUrl: talent.maxSiteUrl,
  };

  const visit = (node: BuilderNode): BuilderNode => {
    // Deep-rewrite every string-valued prop (recurses nested objects/arrays).
    const props = resolvePropValue(
      node.props as Record<string, unknown>,
      flat,
    ) as Record<string, unknown>;
    const children =
      "children" in node && Array.isArray(node.children)
        ? node.children.map(visit)
        : undefined;
    return {
      ...node,
      props,
      ...(children ? { children } : {}),
    } as BuilderNode;
  };

  return pruneEmptyMaxBadge(pruneEmptyServiceCards(tree.map(visit)));
}

/**
 * FIX 1 — drop any "outline card" whose only meaningful content (its descendant
 * heading text) resolved to an empty string after token substitution. The
 * built-in Services grid is a fixed 3-column grid of `{{service1..3}}` cards;
 * most talents have 0-1 service labels, so service2/service3 hydrate to "" and
 * would otherwise render visible empty bordered boxes. Pruning post-substitution
 * keeps the static tree simple and also covers a Lab-authored default tree.
 *
 * A `card` is dropped only when EVERY descendant heading/paragraph resolves to
 * empty AND it has no other renderable content (image/button/nested card), so a
 * card with real copy is never removed. The surrounding grid lays out cleanly
 * with the remaining 1-2 cards.
 */
function pruneEmptyServiceCards(tree: BuilderNode[]): BuilderNode[] {
  const cardIsEmpty = (node: BuilderNode): boolean => {
    let sawTextNode = false;
    let allTextEmpty = true;
    const scan = (n: BuilderNode): void => {
      if (n.kind === "heading" || n.kind === "paragraph") {
        sawTextNode = true;
        const text = (n.props as { text?: unknown }).text;
        if (typeof text === "string" && text.trim() !== "") allTextEmpty = false;
      }
      // Any non-text renderable content keeps the card.
      if (n.kind === "image" || n.kind === "button") allTextEmpty = false;
      if ("children" in n && Array.isArray(n.children)) n.children.forEach(scan);
    };
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(scan);
    }
    return sawTextNode && allTextEmpty;
  };

  const prune = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes
      .filter((n) => !(n.kind === "card" && cardIsEmpty(n)))
      .map((n) =>
        "children" in n && Array.isArray(n.children)
          ? ({ ...n, children: prune(n.children) } as BuilderNode)
          : n,
      );

  return prune(tree);
}

/**
 * Drop the Max badge container (id `default-talent-max-badge`) when the
 * `{{maxSiteUrl}}` token resolved to an empty string. This keeps the hero
 * clean for non-Max talents and talents who haven't published their site yet —
 * the same empty-prune gate the discipline chips rely on, applied to a single
 * named container rather than a generic card shape.
 */
function pruneEmptyMaxBadge(tree: BuilderNode[]): BuilderNode[] {
  const MAX_BADGE_ID = "default-talent-max-badge";

  const prune = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes
      .filter((n) => {
        if (n.id !== MAX_BADGE_ID) return true;
        // Drop the container when the link button inside has an empty href.
        const hasLink = (node: BuilderNode): boolean => {
          if (node.kind === "button") {
            const href = (node.props as { href?: unknown }).href;
            return typeof href === "string" && href.trim() !== "";
          }
          if ("children" in node && Array.isArray(node.children)) {
            return node.children.some(hasLink);
          }
          return false;
        };
        return hasLink(n);
      })
      .map((n) =>
        "children" in n && Array.isArray(n.children)
          ? ({ ...n, children: prune(n.children) } as BuilderNode)
          : n,
      );

  return prune(tree);
}

/**
 * FIX 3 — defensively strip every `section_embed` node from a tree. The
 * platform-default talent tree is intentionally embed-free: a talent-subject
 * curated embed is not supported by the section-embed preview-subject machinery
 * (no section returns the `"talent"` kind), so it would mis-scope to the
 * MANAGING AGENCY tenant's data instead of rendering a placeholder. A Lab-author
 * could place one in the reserved template, so we strip them before render.
 * Pure — returns a new tree.
 */
export function stripSectionEmbeds(
  tree: ReadonlyArray<BuilderNode>,
): BuilderNode[] {
  return tree
    .filter((n) => n.kind !== "section_embed")
    .map((n) =>
      "children" in n && Array.isArray(n.children)
        ? ({ ...n, children: stripSectionEmbeds(n.children) } as BuilderNode)
        : n,
    );
}

/** True when a tree (any depth) contains at least one `section_embed` node. */
export function treeHasSectionEmbed(
  tree: ReadonlyArray<BuilderNode>,
): boolean {
  return tree.some(
    (n) =>
      n.kind === "section_embed" ||
      ("children" in n &&
        Array.isArray(n.children) &&
        treeHasSectionEmbed(n.children)),
  );
}

/**
 * FIX B — pick the "Services & focus" labels for the default talent profile.
 *
 * Source order (NEVER `serviceAreaLabels`, which are geographic WORK MARKETS /
 * cities, not services — those are surfaced separately as "Based in {city}"):
 *   1. the talent's actual services-menu names (already filtered to active,
 *      non-`agency_only` and ordered by the menu's sortOrder upstream);
 *   2. fallback — the talent's discipline (`primaryTypeLabel`, e.g. "Editorial
 *      Model"), which is a real focus.
 * Returns at most 3 non-empty, de-duped labels. An all-empty result lets the
 * caller leave service tokens "" so the empty-card prune drops the section.
 *
 * Pure — safe to unit-test and import from the server-only template module.
 */
export function selectServiceFocusLabels(
  serviceNames: ReadonlyArray<string>,
  primaryTypeLabel: string | null | undefined,
): string[] {
  const clean = (labels: ReadonlyArray<string>): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of labels) {
      const label = raw?.trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push(label);
    }
    return out;
  };

  const fromMenu = clean(serviceNames);
  if (fromMenu.length > 0) return fromMenu.slice(0, 3);

  const discipline = primaryTypeLabel?.trim();
  return discipline ? [discipline] : [];
}

function id(suffix: string): string {
  return `default-talent-${suffix}`;
}

/**
 * One pill chip for the hero discipline row. A `card` (outline, pill radius)
 * whose only content is a label paragraph carrying the `{{token}}`. When the
 * token resolves to "" the empty-card prune drops the whole chip — so this is
 * the same empty-prune mechanism the service cards rely on, no new machinery.
 */
function disciplineChip(suffix: string, token: string): BuilderNode {
  return {
    id: id(`discipline-${suffix}`),
    kind: "card",
    props: {
      variant: "outline",
      style: { radius: "pill", paddingX: "m", paddingY: "s" },
    },
    children: [
      {
        id: id(`discipline-${suffix}-label`),
        kind: "paragraph",
        props: {
          text: token,
          style: { size: "sm", tone: "muted" },
        },
      },
    ],
  } as BuilderNode;
}

/**
 * The built-in default freeform tree. Sections: HERO, ABOUT, SERVICES/FOCUS,
 * GALLERY, CONTACT. Premium dark-on-light editorial composition built from real
 * `BuilderNodeKind`s. Per-talent content is `{{token}}`-driven.
 *
 * Image nodes are conditionally included by the BUILDER (the seed/default uses
 * tokens); a talent with no headshot/gallery resolves those tokens to "" and the
 * renderer skips empty `src` images, so the page degrades gracefully.
 */
export function buildDefaultTalentProfileTree(): BuilderNode[] {
  return [
    // ── HERO ──────────────────────────────────────────────────────────────
    {
      id: id("hero"),
      kind: "split",
      props: {
        ratio: "50-50",
        gap: "l",
        collapseOnMobile: true,
        layerLabel: "Hero",
        style: {
          maxWidth: "wide",
          paddingY: "l",
          paddingX: "m",
          alignItems: "center",
          minHeight: "70vh",
        },
      },
      children: [
        {
          id: id("hero-copy"),
          kind: "container",
          props: {
            layout: "stack",
            gap: "m",
            align: "start",
            style: { paddingY: "m" },
          },
          children: [
            {
              id: id("hero-eyebrow"),
              kind: "paragraph",
              props: {
                text: "{{primaryTypeLabel}}",
                style: {
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  size: "sm",
                  tone: "muted",
                },
              },
            },
            {
              id: id("hero-name"),
              kind: "heading",
              props: {
                text: "{{displayName}}",
                level: 1,
                style: { size: "xl", textWrap: "balance" },
              },
            },
            {
              id: id("hero-tagline"),
              kind: "paragraph",
              props: {
                text: "{{tagline}}",
                style: { size: "lg", tone: "muted", maxWidth: "reading" },
              },
            },
            // ── DISCIPLINE CHIPS ───────────────────────────────────────────────
            // A wrapping row of pill chips: primary discipline + up to three
            // secondary talent types. Each chip is a `card` whose only content is
            // its label paragraph, so the existing empty-card prune drops chips
            // whose label resolved to "" (most talents have 0-1 secondary types).
            // When NO discipline exists at all, every chip prunes and the row is
            // an empty (invisible) row container.
            {
              id: id("hero-disciplines"),
              kind: "container",
              props: {
                layout: "row",
                gap: "s",
                align: "start",
                style: { flexWrap: "wrap", marginTop: "s" },
              },
              children: [
                disciplineChip("primary", "{{primaryTypeLabel}}"),
                disciplineChip("secondary-1", "{{secondaryType1}}"),
                disciplineChip("secondary-2", "{{secondaryType2}}"),
                disciplineChip("secondary-3", "{{secondaryType3}}"),
              ],
            },
            // ── MAX BADGE + "Visit my site" CTA ───────────────────────────────
            // Container id `default-talent-max-badge` is the prune anchor: when
            // `{{maxSiteUrl}}` resolves to "" the whole container is dropped by
            // `pruneEmptyMaxBadge` — so non-Max / unpublished talents see nothing.
            {
              id: id("max-badge"),
              kind: "container",
              props: {
                layout: "row",
                gap: "s",
                align: "center",
                style: { flexWrap: "wrap", marginTop: "s" },
              },
              children: [
                // MAX VIP gold pill — premium membership chip
                {
                  id: id("max-badge-pill"),
                  kind: "card",
                  props: {
                    variant: "outline",
                    style: {
                      radius: "pill",
                      paddingX: "m",
                      paddingY: "s",
                      backgroundColor:
                        "linear-gradient(135deg, #C9A24B 0%, #E8C766 50%, #C9A24B 100%)",
                      borderColor: "#A07830",
                      boxShadow: "0 1px 4px rgba(168,120,48,0.25)",
                    },
                  },
                  children: [
                    {
                      id: id("max-badge-pill-label"),
                      kind: "paragraph",
                      props: {
                        text: "♔ MAX",
                        style: {
                          size: "sm",
                          textTransform: "uppercase",
                          letterSpacing: "0.14em",
                          fontWeight: 700,
                          textColor: "#3D2800",
                        },
                      },
                    },
                  ],
                },
                // Visit my site CTA — dark premium button, gold border and text
                {
                  id: id("max-badge-site-link"),
                  kind: "button",
                  props: {
                    label: "Visit my site →",
                    href: "{{maxSiteUrl}}",
                    tone: "secondary",
                    style: {
                      backgroundColor: "#1A0F00",
                      borderColor: "#C9A24B",
                      textColor: "#E8C766",
                      fontWeight: 600,
                    },
                  },
                },
              ],
            },
            {
              id: id("hero-cta"),
              kind: "button",
              props: {
                label: "Send an inquiry",
                href: "{{inquireHref}}",
                tone: "primary",
                style: { marginTop: "s" },
              },
            },
          ],
        },
        {
          id: id("hero-image"),
          kind: "image",
          props: {
            src: "{{headshotUrl}}",
            alt: "{{displayName}}",
            // The hero headshot is the LCP image — load it eagerly so it does
            // not stream in late (read blank on fast-scroll QA). Gallery images
            // below the fold stay lazy.
            priority: true,
            style: {
              radius: "lg",
              aspectRatio: "4:3",
              objectFit: "cover",
              width: "100%",
            },
          },
        },
      ],
    },
    // ── ABOUT ─────────────────────────────────────────────────────────────
    {
      id: id("about"),
      kind: "container",
      props: {
        layout: "stack",
        gap: "m",
        align: "start",
        layerLabel: "About",
        style: {
          maxWidth: "reading",
          paddingY: "l",
          paddingX: "m",
          marginTop: "m",
        },
      },
      children: [
        {
          id: id("about-eyebrow"),
          kind: "paragraph",
          props: {
            text: "About",
            style: {
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              size: "sm",
              tone: "muted",
            },
          },
        },
        {
          id: id("about-body"),
          kind: "paragraph",
          props: {
            // Full published bio (token falls back to the short bio / tagline /
            // welcome line in talentProfileTokens), rendered as a real paragraph.
            text: "{{richBio}}",
            style: { size: "lg", maxWidth: "reading" },
          },
        },
        {
          id: id("about-location"),
          kind: "paragraph",
          props: {
            text: "{{locationLine}}",
            style: { tone: "muted", size: "md" },
          },
        },
        {
          // Optional languages line — "" when the talent has no languages, so the
          // empty paragraph carries no visible box.
          id: id("about-languages"),
          kind: "paragraph",
          props: {
            text: "{{languagesLine}}",
            style: { tone: "muted", size: "md" },
          },
        },
      ],
    },
    // ── SERVICES / FOCUS ────────────────────────────────────────────────────
    {
      id: id("services"),
      kind: "container",
      props: {
        layout: "stack",
        gap: "m",
        align: "start",
        layerLabel: "Services",
        style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
      },
      children: [
        {
          id: id("services-heading"),
          kind: "heading",
          props: { text: "Services & focus", level: 2, style: { size: "lg" } },
        },
        {
          id: id("services-grid"),
          kind: "container",
          props: {
            layout: "grid",
            columns: 3,
            gap: "m",
            responsive: { mobile: { layout: "stack" } },
          },
          children: [
            {
              id: id("service-1"),
              kind: "card",
              props: { variant: "outline" },
              children: [
                {
                  id: id("service-1-label"),
                  kind: "heading",
                  props: { text: "{{service1}}", level: 3, style: { size: "md" } },
                },
              ],
            },
            {
              id: id("service-2"),
              kind: "card",
              props: { variant: "outline" },
              children: [
                {
                  id: id("service-2-label"),
                  kind: "heading",
                  props: { text: "{{service2}}", level: 3, style: { size: "md" } },
                },
              ],
            },
            {
              id: id("service-3"),
              kind: "card",
              props: { variant: "outline" },
              children: [
                {
                  id: id("service-3-label"),
                  kind: "heading",
                  props: { text: "{{service3}}", level: 3, style: { size: "md" } },
                },
              ],
            },
          ],
        },
      ],
    },
    // ── GALLERY ───────────────────────────────────────────────────────────
    {
      id: id("gallery"),
      kind: "container",
      props: {
        layout: "stack",
        gap: "m",
        align: "start",
        layerLabel: "Gallery",
        style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
      },
      children: [
        {
          id: id("gallery-heading"),
          kind: "heading",
          props: { text: "Selected work", level: 2, style: { size: "lg" } },
        },
        {
          id: id("gallery-grid"),
          kind: "masonry",
          props: { columns: 3, gap: "m" },
          children: [0, 1, 2, 3, 4, 5].map((i) => ({
            id: id(`gallery-${i}`),
            kind: "image" as const,
            props: {
              src: `{{gallery${i}}}`,
              alt: "{{displayName}}",
              style: { radius: "md", objectFit: "cover" as const, width: "100%" },
            },
          })),
        },
      ],
    },
    // ── CONTACT ─────────────────────────────────────────────────────────────
    {
      id: id("contact"),
      kind: "container",
      props: {
        layout: "stack",
        gap: "m",
        align: "center",
        layerLabel: "Contact",
        style: {
          maxWidth: "reading",
          paddingY: "l",
          paddingX: "m",
          marginTop: "m",
          marginBottom: "l",
        },
      },
      children: [
        {
          id: id("contact-heading"),
          kind: "heading",
          props: {
            text: "Let's work together",
            level: 2,
            style: { size: "lg", align: "center" },
          },
        },
        {
          id: id("contact-copy"),
          kind: "paragraph",
          props: {
            text: "Send an inquiry to start the conversation.",
            style: { tone: "muted", align: "center" },
          },
        },
        {
          id: id("contact-cta"),
          kind: "button",
          props: {
            label: "Send an inquiry",
            href: "{{inquireHref}}",
            tone: "primary",
            style: { marginTop: "s" },
          },
        },
      ],
    },
  ];
}
