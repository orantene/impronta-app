/**
 * Talent Max Site — default SHELL + starter HOME-PAGE builder trees (PURE data).
 *
 * The "site shell" (header logo + nav + footer) lives on `talent_sites.shell_tree`
 * and is rendered around every page of the site. The starter home page lives on
 * a `talent_pages` row (is_home=true). Both are freeform builder-node trees
 * rendered through the SAME shared builder-node renderer the agency storefront
 * and talent extra pages use — so this module only needs to emit valid
 * `BuilderNode`s.
 *
 * Pure (no server imports, deterministic when given an id factory) so it is
 * unit-testable and importable by the provisioning helper + a seed script.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/** Injectable id factory — defaults to crypto.randomUUID (matches `starter.ts`). */
export type NodeIdFactory = () => string;

const defaultIdFactory: NodeIdFactory = () => crypto.randomUUID();

export interface DefaultShellInput {
  /** Talent display name — the header wordmark + footer copyright. */
  displayName: string;
  /** Optional logo image URL; when absent the header shows the wordmark only. */
  logoUrl?: string | null;
  /** Home path the brand links to (default "/"). */
  homeHref?: string;
}

/**
 * A simple, valid talent site SHELL: a header (logo slot + nav) and a footer.
 * Returns a builder-node tree suitable for `talent_sites.shell_tree`.
 */
export function buildDefaultShellTree(
  input: DefaultShellInput,
  makeId: NodeIdFactory = defaultIdFactory,
): BuilderNode[] {
  const homeHref = input.homeHref ?? "/";
  const header: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      gap: "m",
      layerLabel: "Header",
    },
    children: [
      // SINGLE brand slot — the header logo (image when a `logoUrl` is set,
      // otherwise the display-name wordmark). This is the ONE place the brand
      // renders. The `nav` node below deliberately carries NO `brand`/`brandHref`
      // so the brand is not painted twice (the nav renderer would otherwise
      // render `brand` as a second bolded link beside this logo).
      input.logoUrl
        ? ({
            id: makeId(),
            kind: "image",
            props: {
              src: input.logoUrl,
              alt: input.displayName,
              layerLabel: "Logo",
              priority: true,
            },
          } satisfies BuilderNode)
        : ({
            id: makeId(),
            kind: "heading",
            props: {
              text: input.displayName,
              level: 2,
              layerLabel: "Wordmark",
            },
          } satisfies BuilderNode),
      {
        id: makeId(),
        kind: "nav",
        props: {
          // No `brand`/`brandHref` — the header logo above is the sole brand.
          ariaLabel: "Primary",
          links: [{ id: makeId(), label: "Home", href: homeHref }],
        },
      },
    ],
  };

  const footer: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      gap: "s",
      layerLabel: "Footer",
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: `© ${new Date().getFullYear()} ${input.displayName}`,
          layerLabel: "Copyright",
          style: { tone: "muted", align: "center" },
        },
      },
    ],
  };

  return [header, footer];
}

export interface StarterHomePageInput {
  displayName: string;
  /** Optional one-line tagline (discipline / location) under the name. */
  tagline?: string | null;
}

/**
 * A minimal, valid starter HOME page: a hero heading + tagline paragraph.
 * Returns a builder-node tree suitable for `talent_pages.blocks`.
 */
export function buildStarterHomePageTree(
  input: StarterHomePageInput,
  makeId: NodeIdFactory = defaultIdFactory,
): BuilderNode[] {
  const hero: BuilderNode = {
    id: makeId(),
    kind: "section",
    props: { sectionTypeKey: "freeform", label: "Hero" },
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: { text: input.displayName, level: 1, layerLabel: "Title" },
      },
      ...(input.tagline
        ? [
            {
              id: makeId(),
              kind: "paragraph",
              props: {
                text: input.tagline,
                layerLabel: "Tagline",
                style: { tone: "muted" },
              },
            } satisfies BuilderNode,
          ]
        : []),
    ],
  };

  return [hero];
}
