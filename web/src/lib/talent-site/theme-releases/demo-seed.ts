/**
 * THEME RELEASES: demo content seeding (layer: demo content, through the pipeline).
 *
 * F77 made the Before / After block ship with EMPTY photo slots so a real
 * talent never gets random gallery pairs. Demo profiles are OUR content and
 * must keep showing the block, so the release pipeline fills the two empty
 * slots of a `before_after` block from the demo's own gallery (`{{gallery2}}`
 * / `{{gallery3}}`) when it builds a DEMO site's design. Real sites are never
 * seeded. Pure: returns a new payload, never mutates the catalog row.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";

const DEMO_PAIR = ["{{gallery2}}", "{{gallery3}}"] as const;

function seed(nodes: ReadonlyArray<BuilderNode>, inside: boolean, counter: { n: number }): BuilderNode[] {
  return nodes.map((node) => {
    const props = (node as { props?: Record<string, unknown> }).props ?? {};
    const here = inside || (node.kind === "container" && props.slotKey === "before_after");
    let next: BuilderNode = node;
    if (here && node.kind === "image" && (props.src === "" || props.src === undefined) && counter.n < DEMO_PAIR.length) {
      next = { ...node, props: { ...props, src: DEMO_PAIR[counter.n]! } } as BuilderNode;
      counter.n += 1;
    }
    const kids = (node as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) {
      const restart = !inside && here;
      const c = restart ? { n: 0 } : counter;
      next = { ...next, children: seed(kids, here, c) } as BuilderNode;
    }
    return next;
  });
}

export function seedDemoBeforeAfter(design: DesignPayload): DesignPayload {
  return { ...design, homeTree: seed(design.homeTree, false, { n: 0 }) };
}
