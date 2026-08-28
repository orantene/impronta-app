/**
 * shell-variant-trees.ts — the `BuilderNode[]` payload of each shipped shell
 * variant, plus the small typed node builders they are written with.
 *
 * Split from `shell-variant-seeds.ts` (2026-08-16) at the 800-line `max-lines`
 * cap. The seam is real, not arbitrary: this file is the DESIGN — six layouts
 * and the vocabulary they are drawn in — while `shell-variant-seeds.ts` is the
 * CATALOGUE ENTRY for each (slug, title, card copy, thumbnail, kind). Changing
 * a layout touches only this file; changing how a variant is listed in the
 * gallery touches only that one.
 *
 * Everything below is type-checked against `BuilderNode`. That matters more
 * here than anywhere else in the lane, because the alternative — the same six
 * trees hand-written as SQL JSONB — accepts `borderBottom`, `flexDirection` and
 * a `"0px"` margin without complaint, and none of the three exists in
 * `BuilderNodeStyle`. They would ship, and silently do nothing.
 *
 * DESIGN RULES THESE SIX FOLLOW
 * --------------------------------------------------------------------------
 *   - Tenant-brand aware: every colour is a theme token. Never a literal brand
 *     colour, so a variant looks like the tenant that applied it, not like the
 *     agency it was designed against.
 *   - Every `var()` carries a LITERAL fallback. A token that resolves to an
 *     empty string collapses the whole declaration silently — the documented
 *     `var(--x, var(--x))` cycle failure — so the chain always bottoms out in a
 *     real value.
 *   - Cool light neutrals by default. No gold, rust or amber anywhere.
 *   - Every link is its own node. A footer column is a stack of individually
 *     selectable link nodes rather than one opaque `nav`, because the operator
 *     is meant to be able to click a single link on canvas and edit it.
 *
 * All four rules are enforced by `shell-variant-seeds.test.ts`.
 */

import type {
  BuilderContainerNode,
  BuilderNode,
  BuilderNodeStyle,
  BuilderSocialPlatform,
} from "@/lib/site-admin/builder-node/types";

// ── token helpers ────────────────────────────────────────────────────────────
//
// Named rather than inlined so the fallback literal for a given token is
// written ONCE. Two call sites with different fallbacks is how a palette drifts.

const INK = "var(--token-color-ink, #1c1917)";
const MUTED = "var(--token-color-muted, #78716c)";
const LINE = "var(--token-color-line, #e7e5e4)";
const SURFACE = "var(--token-color-surface-raised, #ffffff)";
const HEADING_FONT =
  "var(--token-typography-heading-font-family, ui-serif, Georgia, serif)";

/**
 * A one-sided hairline.
 *
 * `BuilderNodeStyle` has `borderColor` / `borderWidth` / `borderStyle`, which
 * are all-sides. A shell landmark wants a rule on exactly one edge, so this
 * uses an inset box-shadow — a free-string style value, one declaration, no
 * layout cost, and it composes with the surface colour underneath.
 */
const hairline = (edge: "top" | "bottom"): string =>
  `inset 0 ${edge === "top" ? "1px" : "-1px"} 0 ${LINE}`;

/** Standard side padding so every variant lines up with the page's content. */
const GUTTER: BuilderNodeStyle = {
  paddingLeft: "clamp(20px, 5vw, 56px)",
  paddingRight: "clamp(20px, 5vw, 56px)",
};

// ── node builders ────────────────────────────────────────────────────────────

let seedCounter = 0;

/**
 * Reset the id counter.
 *
 * Called by `buildShellVariantTree` before each build so a tree's ids are a
 * function of THAT template alone, not of how many templates were built before
 * it. Exported as a function rather than as the mutable `seedCounter` binding:
 * an importable counter is a footgun, and the generator's byte-stability
 * depends on exactly one caller owning the reset.
 */
export function resetShellVariantIds(): void {
  seedCounter = 0;
}

/** Deterministic, readable node id. */
function sid(prefix: string): string {
  seedCounter += 1;
  return `${prefix}-${seedCounter}`;
}

function container(
  children: BuilderNode[],
  props: BuilderContainerNode["props"],
): BuilderNode {
  return { id: sid("c"), kind: "container", props, children };
}

function heading(
  text: string,
  level: 1 | 2 | 3 | 4,
  style: BuilderNodeStyle,
  layerLabel: string,
): BuilderNode {
  return { id: sid("h"), kind: "heading", props: { text, level, layerLabel, style } };
}

function paragraph(
  text: string,
  style: BuilderNodeStyle,
  layerLabel: string,
): BuilderNode {
  return { id: sid("p"), kind: "paragraph", props: { text, layerLabel, style } };
}

/** A horizontal `nav` bar. Used for header navigation, which IS a row. */
function navBar(
  links: ReadonlyArray<{ label: string; href: string }>,
  options: { ariaLabel: string; layerLabel: string; style: BuilderNodeStyle },
): BuilderNode {
  const navId = sid("nav");
  return {
    id: navId,
    kind: "nav",
    props: {
      ariaLabel: options.ariaLabel,
      style: options.style,
      links: links.map((link, index) => ({
        id: `${navId}-l${index}`,
        label: link.label,
        href: link.href,
      })),
    },
  };
}

/**
 * A link rendered as plain text rather than a chip.
 *
 * `button` is the only node kind that carries an `href`, and its two tones are
 * both chip-like. Stripping the chip via `style` (transparent ground, no
 * border, no padding) gives a real text link that is STILL a first-class,
 * individually selectable node — which is the point: a footer column built from
 * these can be edited link by link on canvas, where a single `nav` node is one
 * opaque blob in the layers panel.
 */
function textLink(
  label: string,
  href: string,
  extra: BuilderNodeStyle = {},
): BuilderNode {
  return {
    id: sid("link"),
    kind: "button",
    props: {
      label,
      href,
      tone: "secondary",
      layerLabel: "Link",
      style: {
        backgroundColor: "transparent",
        borderWidth: "0px",
        borderRadius: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
        paddingLeft: "0px",
        paddingRight: "0px",
        textColor: MUTED,
        fontSize: "0.84rem",
        align: "left",
        ...extra,
      },
    },
  };
}

function socialRow(
  platforms: ReadonlyArray<BuilderSocialPlatform>,
  options: { ariaLabel: string; style?: BuilderNodeStyle },
): BuilderNode {
  const rowId = sid("social");
  // Placeholder destinations. The operator replaces them, and the node can also
  // be bound to `workspace_social_links` so it follows tenant identity instead.
  const HREF: Partial<Record<BuilderSocialPlatform, string>> = {
    instagram: "https://instagram.com/",
    tiktok: "https://tiktok.com/",
    facebook: "https://facebook.com/",
    youtube: "https://youtube.com/",
    linkedin: "https://linkedin.com/",
    x: "https://x.com/",
    email: "mailto:hello@example.com",
  };
  return {
    id: rowId,
    kind: "social_links",
    props: {
      ariaLabel: options.ariaLabel,
      size: "sm",
      shape: "bare",
      layerLabel: "Social Links",
      ...(options.style ? { style: options.style } : {}),
      links: platforms.map((platform, index) => ({
        id: `${rowId}-s${index}`,
        platform,
        href: HREF[platform] ?? "https://example.com/",
      })),
    },
  };
}

function ctaButton(label: string, href: string): BuilderNode {
  return {
    id: sid("btn"),
    kind: "button",
    props: { label, href, tone: "primary", layerLabel: "Call to action" },
  };
}

function rule(): BuilderNode {
  // `tone: "muted"` lets the renderer draw the hairline from the theme, so the
  // rule follows the tenant's palette with no colour authored here at all.
  return { id: sid("rule"), kind: "divider", props: { tone: "muted" } };
}

// ── the six trees ────────────────────────────────────────────────────────────

/** Header 1 — Minimal, centre logo. Wordmark centred, nav on the line below. */
export function headerMinimalCentre(): BuilderNode[] {
  return [
    container(
      [
        heading(
          "Studio Name",
          2,
          {
            align: "center",
            textColor: INK,
            fontFamily: HEADING_FONT,
            fontSize: "clamp(1.15rem, 2.2vw, 1.55rem)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            lineHeight: "1",
          },
          "Wordmark",
        ),
        navBar(
          [
            { label: "Roster", href: "/directory" },
            { label: "Studio", href: "/about" },
            { label: "Journal", href: "/posts" },
          ],
          {
            ariaLabel: "Primary",
            layerLabel: "Primary Nav",
            style: {
              justifyContent: "center",
              gap: "28px",
              fontSize: "0.78rem",
              letterSpacing: "0.13em",
              textTransform: "uppercase",
              textColor: MUTED,
            },
          },
        ),
      ],
      {
        layerLabel: "Header — Minimal Centre",
        layout: "stack",
        align: "center",
        gap: "s",
        style: {
          ...GUTTER,
          paddingTop: "26px",
          paddingBottom: "20px",
          backgroundColor: SURFACE,
          boxShadow: hairline("bottom"),
        },
      },
    ),
  ];
}

/** Header 2 — Split. Nav left, wordmark centred, one action right. */
export function headerSplitActions(): BuilderNode[] {
  return [
    container(
      [
        navBar(
          [
            { label: "Roster", href: "/directory" },
            { label: "Studio", href: "/about" },
            { label: "Journal", href: "/posts" },
          ],
          {
            ariaLabel: "Primary",
            layerLabel: "Primary Nav",
            style: {
              justifyContent: "flex-start",
              gap: "22px",
              fontSize: "0.8rem",
              letterSpacing: "0.08em",
              textColor: MUTED,
            },
          },
        ),
        heading(
          "Studio Name",
          2,
          {
            align: "center",
            textColor: INK,
            fontFamily: HEADING_FONT,
            fontSize: "clamp(1.05rem, 1.9vw, 1.35rem)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            lineHeight: "1",
          },
          "Wordmark",
        ),
        container([ctaButton("Start an inquiry", "/directory")], {
          layerLabel: "Actions",
          layout: "row",
          align: "center",
          gap: "s",
          style: { justifyContent: "flex-end" },
        }),
      ],
      {
        layerLabel: "Header — Split",
        layout: "grid",
        columns: 3,
        align: "center",
        gap: "m",
        responsive: { mobile: { layout: "stack", columns: 1 } },
        style: {
          ...GUTTER,
          paddingTop: "18px",
          paddingBottom: "18px",
          backgroundColor: SURFACE,
          boxShadow: hairline("bottom"),
          alignItems: "center",
        },
      },
    ),
  ];
}

/** Header 3 — Editorial. Oversized wordmark plus a tagline, nav beneath a rule. */
export function headerEditorialTagline(): BuilderNode[] {
  return [
    container(
      [
        container(
          [
            heading(
              "Studio Name",
              2,
              {
                align: "left",
                textColor: INK,
                fontFamily: HEADING_FONT,
                fontSize: "clamp(1.6rem, 4vw, 2.6rem)",
                lineHeight: "1",
                letterSpacing: "-0.01em",
              },
              "Wordmark",
            ),
            paragraph(
              "Casting and talent management",
              {
                align: "left",
                textColor: MUTED,
                fontSize: "0.72rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              },
              "Tagline",
            ),
          ],
          { layerLabel: "Brand Block", layout: "stack", align: "start", gap: "s" },
        ),
        rule(),
        navBar(
          [
            { label: "Roster", href: "/directory" },
            { label: "Studio", href: "/about" },
            { label: "Journal", href: "/posts" },
          ],
          {
            ariaLabel: "Primary",
            layerLabel: "Primary Nav",
            style: {
              justifyContent: "flex-start",
              gap: "30px",
              fontSize: "0.78rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              textColor: INK,
            },
          },
        ),
      ],
      {
        layerLabel: "Header — Editorial",
        layout: "stack",
        align: "stretch",
        gap: "m",
        style: {
          ...GUTTER,
          paddingTop: "30px",
          paddingBottom: "16px",
          backgroundColor: SURFACE,
          boxShadow: hairline("bottom"),
        },
      },
    ),
  ];
}

/** A stacked link column: an uppercase heading over individual link nodes. */
function linkColumn(
  title: string,
  links: ReadonlyArray<{ label: string; href: string }>,
  linkStyle: BuilderNodeStyle = {},
): BuilderNode {
  return container(
    [
      paragraph(
        title,
        {
          align: "left",
          textColor: INK,
          fontSize: "0.7rem",
          letterSpacing: "0.19em",
          textTransform: "uppercase",
        },
        "Column Heading",
      ),
      ...links.map((link) => textLink(link.label, link.href, linkStyle)),
    ],
    { layerLabel: `${title} Column`, layout: "stack", align: "start", gap: "s" },
  );
}

/** Footer 1 — Slim. One line: copyright, inline links, social. */
export function footerSlimLine(): BuilderNode[] {
  return [
    container(
      [
        paragraph(
          "© Studio Name",
          {
            align: "left",
            textColor: MUTED,
            fontSize: "0.78rem",
            letterSpacing: "0.04em",
          },
          "Copyright",
        ),
        container(
          [
            textLink("Privacy", "/privacy", { fontSize: "0.78rem" }),
            textLink("Terms", "/terms", { fontSize: "0.78rem" }),
          ],
          {
            layerLabel: "Footer Links",
            layout: "row",
            align: "center",
            gap: "m",
            style: { justifyContent: "center" },
          },
        ),
        socialRow(["instagram", "tiktok", "email"], {
          ariaLabel: "Social links",
          style: { justifyContent: "flex-end" },
        }),
      ],
      {
        layerLabel: "Footer — Slim Line",
        layout: "grid",
        columns: 3,
        align: "center",
        gap: "m",
        responsive: { mobile: { layout: "stack", columns: 1 } },
        style: {
          ...GUTTER,
          paddingTop: "20px",
          paddingBottom: "20px",
          backgroundColor: SURFACE,
          boxShadow: hairline("top"),
          alignItems: "center",
        },
      },
    ),
  ];
}

/** Footer 2 — Columns plus newsletter. The footer doing real navigation work. */
export function footerColumnsNewsletter(): BuilderNode[] {
  return [
    container(
      [
        container(
          [
            linkColumn("Studio", [
              { label: "About", href: "/about" },
              { label: "Journal", href: "/posts" },
              { label: "Careers", href: "/careers" },
            ]),
            linkColumn("Roster", [
              { label: "All talent", href: "/directory" },
              { label: "Models", href: "/directory?type=model" },
              { label: "Creatives", href: "/directory?type=creative" },
            ]),
            linkColumn("Work with us", [
              { label: "Start an inquiry", href: "/directory" },
              { label: "Join the roster", href: "/register" },
            ]),
            container(
              [
                paragraph(
                  "Newsletter",
                  {
                    align: "left",
                    textColor: INK,
                    fontSize: "0.7rem",
                    letterSpacing: "0.19em",
                    textTransform: "uppercase",
                  },
                  "Column Heading",
                ),
                paragraph(
                  "Casting calls and new faces, once a month.",
                  {
                    align: "left",
                    textColor: MUTED,
                    fontSize: "0.84rem",
                    lineHeight: "1.5",
                  },
                  "Newsletter Copy",
                ),
                // Points at the live roster surface, not `/contact`: on an
                // agency host `/contact` is a CMS clean-URL that 404s until
                // the operator creates such a page, and no default template
                // may ship a link the platform cannot honour.
                ctaButton("Subscribe", "/directory"),
              ],
              {
                layerLabel: "Newsletter Column",
                layout: "stack",
                align: "start",
                gap: "s",
              },
            ),
          ],
          {
            layerLabel: "Footer Columns",
            layout: "grid",
            columns: 4,
            gap: "l",
            align: "start",
            responsive: {
              tablet: { layout: "grid", columns: 2 },
              mobile: { layout: "stack", columns: 1 },
            },
          },
        ),
        rule(),
        container(
          [
            paragraph(
              "© Studio Name. All rights reserved.",
              { align: "left", textColor: MUTED, fontSize: "0.74rem" },
              "Copyright",
            ),
            socialRow(["instagram", "tiktok", "linkedin"], {
              ariaLabel: "Social links",
              style: { justifyContent: "flex-end" },
            }),
          ],
          {
            layerLabel: "Legal Row",
            layout: "row",
            align: "center",
            gap: "m",
            responsive: { mobile: { layout: "stack" } },
            style: { justifyContent: "space-between", alignItems: "center" },
          },
        ),
      ],
      {
        layerLabel: "Footer — Columns and Newsletter",
        layout: "stack",
        align: "stretch",
        gap: "l",
        style: {
          ...GUTTER,
          paddingTop: "52px",
          paddingBottom: "28px",
          backgroundColor: SURFACE,
          boxShadow: hairline("top"),
        },
      },
    ),
  ];
}

/** Footer 3 — Editorial. Oversized wordmark left, columns tucked right. */
export function footerEditorialWordmark(): BuilderNode[] {
  return [
    container(
      [
        container(
          [
            container(
              [
                heading(
                  "Studio Name",
                  2,
                  {
                    align: "left",
                    textColor: INK,
                    fontFamily: HEADING_FONT,
                    fontSize: "clamp(2.4rem, 7vw, 4.5rem)",
                    lineHeight: "0.92",
                    letterSpacing: "-0.02em",
                  },
                  "Wordmark",
                ),
                paragraph(
                  "Representation, casting and production support.",
                  {
                    align: "left",
                    textColor: MUTED,
                    fontSize: "0.88rem",
                    lineHeight: "1.55",
                    maxWidthFree: "34ch",
                  },
                  "Tagline",
                ),
                socialRow(["instagram", "tiktok", "email"], {
                  ariaLabel: "Social links",
                  style: { justifyContent: "flex-start" },
                }),
              ],
              {
                layerLabel: "Brand Block",
                layout: "stack",
                align: "start",
                gap: "m",
              },
            ),
            container(
              [
                linkColumn(
                  "Studio",
                  [
                    { label: "About", href: "/about" },
                    { label: "Journal", href: "/posts" },
                  ],
                  { fontSize: "0.82rem" },
                ),
                linkColumn(
                  "Roster",
                  [
                    { label: "All talent", href: "/directory" },
                  ],
                  { fontSize: "0.82rem" },
                ),
              ],
              {
                layerLabel: "Link Columns",
                layout: "grid",
                columns: 2,
                gap: "l",
                align: "start",
                responsive: { mobile: { layout: "stack", columns: 1 } },
              },
            ),
          ],
          {
            layerLabel: "Footer Body",
            layout: "grid",
            columns: 2,
            gap: "l",
            align: "start",
            responsive: { mobile: { layout: "stack", columns: 1 } },
            style: { gridTemplateColumns: "1.6fr 1fr" },
          },
        ),
        rule(),
        container(
          [
            paragraph(
              "© Studio Name",
              { align: "left", textColor: MUTED, fontSize: "0.72rem" },
              "Copyright",
            ),
            container(
              [
                textLink("Privacy", "/privacy", { fontSize: "0.72rem" }),
                textLink("Terms", "/terms", { fontSize: "0.72rem" }),
              ],
              {
                layerLabel: "Legal Links",
                layout: "row",
                align: "center",
                gap: "m",
                style: { justifyContent: "flex-end" },
              },
            ),
          ],
          {
            layerLabel: "Legal Row",
            layout: "row",
            align: "center",
            gap: "m",
            responsive: { mobile: { layout: "stack" } },
            style: { justifyContent: "space-between", alignItems: "center" },
          },
        ),
      ],
      {
        layerLabel: "Footer — Editorial Wordmark",
        layout: "stack",
        align: "stretch",
        gap: "l",
        style: {
          ...GUTTER,
          paddingTop: "64px",
          paddingBottom: "28px",
          backgroundColor: SURFACE,
          boxShadow: hairline("top"),
        },
      },
    ),
  ];
}
