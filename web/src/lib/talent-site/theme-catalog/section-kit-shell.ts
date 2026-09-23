/**
 * Talent website SECTION KIT, shell half: the header + footer landmarks a
 * Design's `shellTree` is built from. Same two contracts as `section-kit.ts`:
 * every top-level landmark carries `slotKey` + a namespaced `originRole`, and
 * no builder inlines a colour or font (a "dark" chrome is the registry step
 * `background: "contrast"`, which paints the Look's ink with a paired
 * foreground).
 *
 * Design payloads pass `displayName: "{{displayName}}"` and `year: "{{year}}"`
 * so the stored tree stays talent-agnostic; the apply core resolves both.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { buildDefaultShellTree } from "../default-max-site-trees";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";

type KitIdFactory = MaxSiteTemplateIdFactory;

const defaultIdFactory: KitIdFactory = () => crypto.randomUUID();

const HEADER = { slotKey: "header", originRole: "talent.shell.header" } as const;
const FOOTER = { slotKey: "footer", originRole: "talent.shell.footer" } as const;

function stampShell(
  node: BuilderNode,
  mark: { slotKey: string; originRole: string },
): BuilderNode {
  const props = node.props as Record<string, unknown>;
  // A curated `section` landmark owns `props.slotKey` through its own schema;
  // only stamp it when absent so the site_header section keeps "header".
  return {
    ...node,
    props: {
      ...props,
      slotKey: typeof props.slotKey === "string" ? props.slotKey : mark.slotKey,
      originRole: mark.originRole,
    },
  } as unknown as BuilderNode;
}

function copyrightLine(displayName: string, year: string | number | undefined): string {
  return `© ${year ?? new Date().getFullYear()} ${displayName}`;
}

export interface KitShellOptions {
  displayName: string;
  logoUrl?: string | null;
  homeHref?: string;
  /** Copyright year; a Design payload passes "{{year}}". Defaults to now. */
  year?: string | number;
  headerAlign?: "start" | "center" | "space-between";
  /** Hairline under the header, in the Look's accent colour. */
  headerRule?: boolean;
  /** Header vertical rhythm. */
  headerPaddingY?: "s" | "m";
  /** Dark chrome: header + footer paint the Look's ink (`background: "contrast"`). */
  contrastChrome?: boolean;
}

/**
 * The simple kit shell: a header container (logo OR wordmark + nav) and a
 * footer container. Keeps the single-brand invariant (logo image OR wordmark,
 * never a nav `brand` on top).
 */
export function buildKitShell(
  makeId: KitIdFactory,
  opts: KitShellOptions,
): BuilderNode[] {
  const homeHref = opts.homeHref ?? "/";

  const brand: BuilderNode = opts.logoUrl
    ? ({
        id: makeId(),
        kind: "image",
        props: { src: opts.logoUrl, alt: opts.displayName, layerLabel: "Logo", priority: true },
      } as BuilderNode)
    : ({
        id: makeId(),
        kind: "heading",
        props: { text: opts.displayName, level: 2, layerLabel: "Wordmark" },
      } as BuilderNode);

  const headerJustify =
    opts.headerAlign === "center"
      ? "center"
      : opts.headerAlign === "space-between"
        ? "space-between"
        : "flex-start";

  const headerStyle: Record<string, unknown> = {
    justifyContent: headerJustify,
    ...(opts.headerPaddingY ? { paddingY: opts.headerPaddingY } : {}),
    ...(opts.headerRule
      ? { borderColor: "token:color.accent", borderWidth: "0 0 1px 0", borderStyle: "solid" }
      : {}),
    ...(opts.contrastChrome ? { paddingX: "l", paddingY: "m", background: "contrast" } : {}),
  };

  const header: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      gap: "m",
      layerLabel: "Header",
      style: headerStyle,
    },
    children: [
      brand,
      {
        id: makeId(),
        kind: "nav",
        props: { ariaLabel: "Primary", links: [{ id: makeId(), label: "Home", href: homeHref }] },
      },
    ],
  } as BuilderNode;

  const footer: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      gap: "s",
      layerLabel: "Footer",
      ...(opts.contrastChrome ? { style: { paddingY: "l", background: "contrast" } } : {}),
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: copyrightLine(opts.displayName, opts.year),
          layerLabel: "Copyright",
          style: { tone: "muted", align: "center" },
        },
      },
    ],
  } as BuilderNode;

  return [stampShell(header, HEADER), stampShell(footer, FOOTER)];
}

/**
 * The STANDARD kit shell: the platform default (`buildDefaultShellTree`, the
 * rich `site_header` landmark + footer) with kit provenance stamped on. The
 * footer copyright honours `year` so a Design payload can defer it.
 */
export function buildKitStandardShell(
  makeId: KitIdFactory,
  opts: Pick<KitShellOptions, "displayName" | "logoUrl" | "homeHref" | "year">,
): BuilderNode[] {
  const [header, footer, ...rest] = buildDefaultShellTree(
    { displayName: opts.displayName, logoUrl: opts.logoUrl, homeHref: opts.homeHref },
    makeId,
  );
  const withYear = (node: BuilderNode): BuilderNode => {
    if (opts.year === undefined || !("children" in node) || !Array.isArray(node.children)) {
      return node;
    }
    return {
      ...node,
      children: node.children.map((child) =>
        (child.props as { layerLabel?: string }).layerLabel === "Copyright"
          ? ({
              ...child,
              props: { ...child.props, text: copyrightLine(opts.displayName, opts.year) },
            } as BuilderNode)
          : child,
      ),
    } as BuilderNode;
  };
  return [
    ...(header ? [stampShell(header, HEADER)] : []),
    ...(footer ? [stampShell(withYear(footer), FOOTER)] : []),
    ...rest,
  ];
}

export { defaultIdFactory as defaultShellIdFactory };
