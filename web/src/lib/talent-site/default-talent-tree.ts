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
  /** Short location/discipline tagline shown under the name. */
  tagline: string;
  bio: string;
  /** City line, e.g. "Based in Cancún" (already prefixed). */
  locationLine: string;
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
 * Walk a builder-node tree and substitute `{{token}}` placeholders in every
 * text-bearing prop (`text`/`label`/`href`/`src`/`alt`) against the talent's
 * data. Returns a NEW tree (structural clone) — the source constant is never
 * mutated. Image/button nodes whose resolved `src`/`href` is empty keep a safe
 * fallback so the page never renders a broken `<img src="">` / dead link.
 */
export function hydrateTalentTree(
  tree: ReadonlyArray<BuilderNode>,
  talent: TalentProfileTokens,
): BuilderNode[] {
  const flat: Record<string, string> = {
    displayName: talent.displayName,
    primaryTypeLabel: talent.primaryTypeLabel,
    tagline: talent.tagline,
    bio: talent.bio,
    locationLine: talent.locationLine,
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
  };

  const visit = (node: BuilderNode): BuilderNode => {
    // Clone props shallowly + rewrite the known text-bearing string props.
    const props = { ...(node.props as Record<string, unknown>) };
    for (const key of ["text", "label", "href", "src", "alt"] as const) {
      const raw = props[key];
      if (typeof raw === "string" && raw.includes("{{")) {
        props[key] = resolveTokens(raw, flat);
      }
    }
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

  return tree.map(visit);
}

function id(suffix: string): string {
  return `default-talent-${suffix}`;
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
            text: "{{bio}}",
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
