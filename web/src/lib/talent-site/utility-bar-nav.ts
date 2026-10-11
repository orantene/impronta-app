/**
 * TUL-547 / GRK-081: the Gridline `utility_bar` header shipped with a brand and
 * a CTA but no navigation. A bar without `navLinks` gets the page's section
 * links at render time (services, area, FAQ); `pruneDeadSectionLinks` then drops
 * any whose section the page does not render. An owner-set `navLinks` (even
 * empty) is left alone. Pure.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { labelTarget } from "./design-label-locale";

type AnyNode = BuilderNode & { children?: BuilderNode[] };

const COPY = {
  es: {
    links: [
      { label: "Servicios", href: "#services" },
      { label: "Zona", href: "#area" },
      { label: "Preguntas", href: "#faq" },
    ],
    navLabel: "Secciones",
    menuLabel: "Menú",
  },
  en: {
    links: [
      { label: "Services", href: "#services" },
      { label: "Area", href: "#area" },
      { label: "FAQ", href: "#faq" },
    ],
    navLabel: "Sections",
    menuLabel: "Menu",
  },
} as const;

export function withUtilityBarNav(tree: readonly BuilderNode[], locale: string | null | undefined): BuilderNode[] {
  const copy = labelTarget(locale) === "es" ? COPY.es : COPY.en;
  const visit = (node: BuilderNode): BuilderNode => {
    let next = node;
    if (node.kind === "utility_bar" && node.props.navLinks === undefined) {
      next = {
        ...node,
        props: {
          ...node.props,
          navLinks: copy.links.map((l) => ({ ...l })),
          navLabel: node.props.navLabel ?? copy.navLabel,
          menuLabel: node.props.menuLabel ?? copy.menuLabel,
        },
      };
    }
    const kids = (next as AnyNode).children;
    if (Array.isArray(kids) && kids.length > 0) {
      const mapped = kids.map(visit);
      if (mapped.some((k, i) => k !== kids[i])) next = { ...next, children: mapped } as BuilderNode;
    }
    return next;
  };
  return tree.map(visit);
}
