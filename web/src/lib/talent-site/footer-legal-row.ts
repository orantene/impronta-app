import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { defaultFooterLegalLinks } from "@/lib/policies/footer-links";

/**
 * The small-print row seeded into a new talent site's default footer shell:
 * Booking policy, Privacy, Privacy choices, Terms (platform). Every link
 * resolves on the talent host. Existing sites keep whatever footer they have.
 */
export function buildFooterLegalRow(makeId: () => string): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      gap: "m",
      layerLabel: "Legal Links",
      style: { justifyContent: "center", flexWrap: "wrap" },
    },
    children: defaultFooterLegalLinks().map((l) => ({
      id: makeId(),
      kind: "button",
      props: {
        label: l.label,
        href: l.href,
        tone: "secondary",
        layerLabel: "Link",
        style: {
          background: "none",
          borderWidth: "0px",
          borderRadius: "0px",
          paddingTop: "0px",
          paddingBottom: "0px",
          paddingLeft: "0px",
          paddingRight: "0px",
          fontSize: "0.78rem",
          tone: "muted",
        },
      },
    })),
  } as unknown as BuilderNode;
}
