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
import type { NavChromeStyle } from "@/lib/site-admin/nav-chrome";
import { buildDefaultShellTree } from "../default-max-site-trees";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";
import {
  EMERGENCIES_TODAY_LABEL,
  NO_EMERGENCIES_TODAY_LABEL,
} from "./seed-i18n";

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

export interface KitShellNavLink {
  label: string;
  href: string;
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
  /**
   * Shared Header navigation style. Stamped on the kit `nav` node.
   * Absent → `top_bar` (classic inline bar).
   */
  navChrome?: NavChromeStyle;
  /**
   * Primary nav links. Absent → a single Home link (byte-identical to the
   * pre-navChrome shell). Designs that use scroll-spy chrome stamp section
   * hashes that match kit `anchorId` slots (`#services`, `#gallery`, …).
   */
  navLinks?: ReadonlyArray<KitShellNavLink>;
  /** Override `site_header` primary CTA + freeform region CTA label. */
  primaryCtaLabel?: string;
  /**
   * Gridline utility bar as the shell header (`buildKitShell` only): dark ink
   * bar with name, subtitle, emergencies pill, desktop action and tap-to-call.
   * The call link is the `{{callHref}}` token, so no number means no button.
   */
  utilityBar?: {
    subtitle?: string;
    statusOnLabel?: string;
    statusOffLabel?: string;
    ctaLabel?: string;
    ctaHref?: string;
    callLabel?: string;
  };
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

  const ctaLabel = (opts.primaryCtaLabel ?? opts.utilityBar?.ctaLabel ?? "Book").trim() || "Book";
  const ctaHref = opts.utilityBar?.ctaHref ?? "#services";

  const brand: BuilderNode = opts.logoUrl
    ? ({
        id: makeId(),
        kind: "image",
        props: {
          src: opts.logoUrl,
          alt: opts.displayName,
          layerLabel: "Logo",
          priority: true,
          // Kit-shell wordmark/logo must link home (stale solace/frame demos).
          href: homeHref,
        },
      } as BuilderNode)
    : ({
        id: makeId(),
        kind: "heading",
        props: { text: opts.displayName, level: 2, layerLabel: "Wordmark", href: homeHref },
      } as BuilderNode);

  const headerJustify =
    opts.headerAlign === "center"
      ? "center"
      : opts.headerAlign === "space-between"
        ? "space-between"
        : "flex-start";

  const headerStyle: Record<string, unknown> = {
    justifyContent: headerJustify,
    // 1.5rem gutter so the brand never sits flush at the 390 edge.
    paddingX: "m",
    ...(opts.headerPaddingY ? { paddingY: opts.headerPaddingY } : {}),
    ...(opts.headerRule
      ? { borderColor: "token:color.accent", borderWidth: "0 0 1px 0", borderStyle: "solid" }
      : {}),
    ...(opts.contrastChrome ? { paddingX: "l", paddingY: "m", background: "contrast" } : {}),
  };

  const links =
    opts.navLinks && opts.navLinks.length > 0
      ? opts.navLinks.map((link) => ({
          id: makeId(),
          label: link.label,
          href: link.href,
        }))
      : [{ id: makeId(), label: "Home", href: homeHref }];

  const header: BuilderNode = opts.utilityBar
    ? ({
        id: makeId(),
        kind: "container",
        props: { layout: "stack", align: "stretch", gap: "s", layerLabel: "Header", style: { gap: "0px" } },
        children: [
          {
            id: makeId(),
            kind: "utility_bar",
            props: {
              name: opts.displayName,
              subtitle: opts.utilityBar.subtitle ?? "",
              homeHref,
              ...(opts.logoUrl ? { logoUrl: opts.logoUrl } : {}),
              showStatus: true,
              // TUL-516 C2: always seed the pill labels so seed-i18n writes es+en
              // overlays (omitting them left the block's English fallback on ES).
              statusOnLabel: opts.utilityBar.statusOnLabel ?? EMERGENCIES_TODAY_LABEL.en,
              statusOffLabel: opts.utilityBar.statusOffLabel ?? NO_EMERGENCIES_TODAY_LABEL.en,
              showCall: true,
              callHref: "{{callHref}}",
              ...(opts.utilityBar.callLabel ? { callLabel: opts.utilityBar.callLabel } : {}),
              ctaLabel: (opts.utilityBar.ctaLabel ?? opts.primaryCtaLabel ?? "").trim() || ctaLabel,
              ctaHref: (opts.utilityBar.ctaHref ?? "").trim() || ctaHref,
            },
          },
        ],
      } as BuilderNode)
    : ({
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
        props: {
          ariaLabel: "Primary",
          links,
          ...(opts.navChrome && opts.navChrome !== "top_bar"
            ? { navChrome: opts.navChrome }
            : {}),
        },
      },
      // Every theme header needs a primary CTA (GRK-081); kit shells without
      // utility_bar previously shipped heading+nav only.
      {
        id: makeId(),
        kind: "button",
        props: {
          label: ctaLabel,
          href: ctaHref,
          tone: "primary",
          layerLabel: "Header CTA",
        },
      } as BuilderNode,
    ],
  } as BuilderNode);

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
/** Insert `{ type: "account" }` after the `language` item of the standard header regions (idempotent). */
export function withAccountItem(header: BuilderNode | undefined): BuilderNode | undefined {
  if (!header) return header;
  const props = (header.props ?? {}) as Record<string, unknown>;
  const sectionProps = (props.sectionProps ?? {}) as Record<string, unknown>;
  const regions = sectionProps.regions as Record<string, unknown> | undefined;
  if (!regions || typeof regions !== "object") return header;
  const out: Record<string, unknown> = {};
  const hasAccount = Object.values(regions).some(
    (items) => Array.isArray(items) && items.some((i) => (i as { type?: string } | null)?.type === "account"),
  );
  if (hasAccount) return header;
  let done = false;
  for (const [zone, items] of Object.entries(regions)) {
    if (!Array.isArray(items)) {
      out[zone] = items;
      continue;
    }
    const at = items.findIndex((i) => (i as { type?: string } | null)?.type === "language");
    if (!done && at >= 0) {
      out[zone] = [...items.slice(0, at + 1), { type: "account", responsive: { mobile: "show" } }, ...items.slice(at + 1)];
      done = true;
    } else out[zone] = items;
  }
  return { ...header, props: { ...props, sectionProps: { ...sectionProps, regions: out } } } as unknown as BuilderNode;
}

export function buildKitStandardShell(
  makeId: KitIdFactory,
  opts: Pick<
    KitShellOptions,
    "displayName" | "logoUrl" | "homeHref" | "year" | "navChrome" | "navLinks" | "primaryCtaLabel"
  > & {
    /** Add the client `account` header item right after `language` (renders only when the flag is on). */
    accountItem?: boolean;
  },
): BuilderNode[] {
  const [rawHeader, footer, ...rest] = buildDefaultShellTree(
    { displayName: opts.displayName, logoUrl: opts.logoUrl, homeHref: opts.homeHref },
    makeId,
  );
  // Per-design nav style + links ride on the standard `site_header` config
  // (`navChrome` / `navItems` share the builder `nav` enum), so a Design keeps
  // its own navigation while wearing the platform header (logo, ES/EN, CTA,
  // mobile menu).
  const header = ((): BuilderNode | undefined => {
    const base = opts.accountItem ? withAccountItem(rawHeader) : rawHeader;
    return restyleHeader(base);
  })();
  function restyleHeader(rawHeader: BuilderNode | undefined): BuilderNode | undefined {
    if (!rawHeader) return rawHeader;
    const hasLinks = !!opts.navLinks && opts.navLinks.length > 0;
    const hasChrome = !!opts.navChrome && opts.navChrome !== "top_bar";
    const hasCta = !!opts.primaryCtaLabel?.trim();
    if (!hasLinks && !hasChrome && !hasCta) return rawHeader;
    const props = (rawHeader.props ?? {}) as Record<string, unknown>;
    const sectionProps = (props.sectionProps ?? {}) as Record<string, unknown>;
    const ctaLabel = opts.primaryCtaLabel?.trim();
    const primaryCta = sectionProps.primaryCta;
    const nextPrimaryCta =
      hasCta && primaryCta && typeof primaryCta === "object"
        ? { ...(primaryCta as Record<string, unknown>), label: ctaLabel }
        : hasCta
          ? { label: ctaLabel, href: "/contact" }
          : primaryCta;
    const regions = sectionProps.regions;
    let nextRegions = regions;
    if (hasCta && regions && typeof regions === "object") {
      const out: Record<string, unknown> = {};
      for (const [slot, items] of Object.entries(regions as Record<string, unknown>)) {
        out[slot] = Array.isArray(items)
          ? items.map((it) => {
              if (!it || typeof it !== "object") return it;
              const row = it as Record<string, unknown>;
              return row.type === "cta" ? { ...row, label: ctaLabel } : it;
            })
          : items;
      }
      nextRegions = out;
    }
    return {
      ...rawHeader,
      props: {
        ...props,
        sectionProps: {
          ...sectionProps,
          ...(hasLinks
            ? { navItems: opts.navLinks!.map((l) => ({ label: l.label, href: l.href })) }
            : {}),
          ...(hasChrome ? { navChrome: opts.navChrome } : {}),
          ...(hasCta ? { primaryCta: nextPrimaryCta, ...(nextRegions ? { regions: nextRegions } : {}) } : {}),
        },
      },
    } as BuilderNode;
  }
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
