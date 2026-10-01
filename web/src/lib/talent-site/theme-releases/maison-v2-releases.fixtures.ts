/**
 * Test fixtures for the Maison v2 releases after 2.1: each `revert*` undoes
 * exactly one release's payload changes on a copy of the current payload, so
 * a test can rebuild any earlier version from code and diff it forward.
 * Pure; the revert functions compose (undo newest first).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { buildMaisonV2Payload } from "../theme-catalog/collection/designs";
import type { DesignPayload } from "../theme-catalog/types";

type Props = Record<string, unknown>;

export const clonePayload = (p: DesignPayload): DesignPayload => JSON.parse(JSON.stringify(p)) as DesignPayload;

export function walkNodes(nodes: ReadonlyArray<BuilderNode>, visit: (n: BuilderNode) => void): void {
  for (const n of nodes) {
    visit(n);
    walkNodes(((n as { children?: BuilderNode[] }).children ?? []) as BuilderNode[], visit);
  }
}

export const propsOf = (n: BuilderNode): Props => n.props as Props;

export function findByKind(nodes: ReadonlyArray<BuilderNode>, kind: string): BuilderNode | undefined {
  let hit: BuilderNode | undefined;
  walkNodes(nodes, (n) => {
    if (!hit && n.kind === kind) hit = n;
  });
  return hit;
}

export function findBySlot(nodes: ReadonlyArray<BuilderNode>, slotKey: string): BuilderNode | undefined {
  let hit: BuilderNode | undefined;
  walkNodes(nodes, (n) => {
    if (!hit && propsOf(n).slotKey === slotKey) hit = n;
  });
  return hit;
}

/** The current (newest) Maison v2 payload, as a fresh copy. */
export const currentMaisonV2 = (): DesignPayload => clonePayload(buildMaisonV2Payload());

/** v16 back to v15: the round 2 token and variant defaults. */
export function revertR16(p: DesignPayload): DesignPayload {
  const out = clonePayload(p);
  out.tokenDefaults!["type.display-tracking"] = "-0.01em";
  out.tokenDefaults!["button.padding-x"] = "22px";
  Object.assign(propsOf(findByKind(out.homeTree, "reviews")!), { showArrows: false, limit: 12 });
  return out;
}

/** v17 back to v16: the round 3 opt-in services layout and the contact eyebrow contrast fix. */
export function revertR17(p: DesignPayload): DesignPayload {
  const out = clonePayload(p);
  const catalog = findByKind(out.homeTree, "services_catalog")!;
  delete propsOf(catalog).slotKey;
  propsOf(catalog).layout = "rows";
  const contact = findBySlot(out.homeTree, "contact")!;
  const para = ((contact as { children?: BuilderNode[] }).children ?? []).find((c) => c.kind === "paragraph")!;
  (propsOf(para).style as Props).textColor = "token:color.accent";
  const ba = findBySlot(out.homeTree, "before_after")!;
  const baEyebrow = ((ba as { children?: BuilderNode[] }).children ?? []).find((c) => c.kind === "paragraph")!;
  (propsOf(baEyebrow).style as Props).textColor = "token:color.accent";
  return out;
}

/** v18 back to v17: the round 4 aftercare block and the reviews reorder. */
export function revertR18(p: DesignPayload): DesignPayload {
  const out = clonePayload(p);
  const slot = (n: BuilderNode) => propsOf(n).slotKey;
  const rest = out.homeTree.filter((n) => slot(n) !== "aftercare" && slot(n) !== "reviews");
  const reviews = out.homeTree.find((n) => slot(n) === "reviews")!;
  rest.splice(rest.findIndex((n) => slot(n) === "services") + 1, 0, reviews);
  out.homeTree = rest;
  return out;
}

/**
 * v19 back to v18: release 2.5 "look only". Token defaults (soft chrome, header
 * and section spacing), the rhythm (88px bands, raised-surface bands), the
 * header's fifth link, the ticker band, framed work cards, the hero chip link,
 * the menu swap to row cards and the About actions.
 */
export function revertR19(p: DesignPayload): DesignPayload {
  const out = clonePayload(p);
  const t = out.tokenDefaults!;
  delete t["shape.chrome"];
  Object.assign(t, {
    "layout.section-pad-top": "84px",
    "layout.section-pad-top-phone": "40px",
    "layout.section-pad-bottom": "10px",
    "layout.section-pad-bottom-phone": "8px",
    "layout.header-pad-y": "14px",
    "layout.header-pad-y-phone": "10px",
  });
  const oldPad = (style: Props) => {
    Object.assign(style, { paddingTop: "84px", paddingBottom: "10px" });
    const mobile = ((style.responsive ?? {}) as { mobile?: Props }).mobile;
    if (mobile) Object.assign(mobile, { paddingTop: "40px", paddingBottom: "8px" });
    delete style.backgroundColor;
  };
  const header = out.shellTree.find((n) => propsOf(n).slotKey === "header")!;
  const sp = propsOf(header).sectionProps as Props;
  sp.navItems = [
    { label: "Work", href: "#gallery" },
    { label: "Menu and prices", href: "#services" },
    { label: "Reviews", href: "#reviews" },
    { label: "Your visit", href: "#visit" },
  ];
  walkNodes(out.homeTree, (n) => {
    const props = propsOf(n);
    const slot = props.slotKey;
    if (n.kind === "next_free_chip") delete props.href;
    if (n.kind === "portfolio") {
      delete props.cardStyle;
      oldPad(props.style as Props);
    }
    if (n.kind === "marquee") props.style = { marginTopFree: "22px", marginBottomFree: "4px" };
    if (n.kind === "services_catalog") {
      delete props.rowStyle;
      props.slotKey = "services_two_col";
      props.layout = "cards";
    }
    if (n.kind === "paragraph" && props.text === "{{heroEyebrow}}") props.text = "{{primaryTypeLabel}}";
    if (n.kind === "paragraph" && props.text === "{{proofLine}}") props.text = "{{locationLine}}";
    if (slot === "services" || slot === "about" || slot === "reviews" || slot === "before_after" || slot === "aftercare" || slot === "visit") {
      oldPad(props.style as Props);
    }
    if (slot === "contact") {
      oldPad(props.style as Props);
      (props.style as Props).maxWidthFree = "856px";
    }
    if (slot === "about") {
      const copy = ((n as { children?: BuilderNode[] }).children ?? []).find((c) => propsOf(c).layerLabel === "About copy");
      if (copy) {
        const holder = copy as { children: BuilderNode[] };
        holder.children = holder.children.filter((c) => propsOf(c).slotKey !== "about_actions");
      }
    }
  });
  return out;
}

/** v20 back to v19: the 2.6 "chrome" header switcher and the optional Location block (the help bubble default is code, gated on the pinned version). */
export function revertR20(p: DesignPayload): DesignPayload {
  const out = clonePayload(p);
  walkNodes(out.shellTree, (n) => {
    const sp = (propsOf(n).sectionProps ?? undefined) as { regions?: { center?: Array<{ type: string }> } } | undefined;
    if (propsOf(n).sectionTypeKey === "site_header" && sp?.regions?.center) {
      sp.regions.center = sp.regions.center.filter((i) => i.type !== "section_switcher");
    }
  });
  out.homeTree = out.homeTree.filter((n) => propsOf(n).slotKey !== "location");
  return out;
}

/**
 * v21 back to v20 (release 2.7, "hero + footer"): the live hero lines, the menu intro
 * line and the rich footer swap back to the 2.5 shapes (heading = her name in italics,
 * no `liveText`, no subtitle, the dark `footer` band with its fine print).
 */
export function revertR21(p: DesignPayload): DesignPayload {
  const out = clonePayload(p);
  delete out.tokenDefaults!["footer.tone"];
  walkNodes(out.homeTree, (n) => {
    const props = propsOf(n);
    if (n.kind === "heading" && props.liveText === "hero_headline") props.text = "{i}{{displayName}}{/i}";
    if (n.kind === "heading" || n.kind === "paragraph") delete props.liveText;
    if (n.kind === "services_catalog") delete props.subtitle;
  });
  let seq = 0;
  const id = () => `rev21-${(seq += 1)}`;
  out.shellTree = out.shellTree.map((node) => {
    const props = propsOf(node);
    if (props.slotKey !== "footer_rich") return node;
    const style = { ...(props.style as Props) };
    Object.assign(style, {
      backgroundColor: "token:color.ink",
      textColor: "token:color.background",
      paddingY: "xl",
      paddingTop: "70px",
      paddingBottom: "120px",
      responsive: { mobile: { paddingX: "s", paddingLeft: "18px", paddingRight: "18px", paddingTop: "40px", paddingBottom: "130px" } },
    });
    const fine: Props = {
      layout: "row",
      gap: "s",
      align: "center",
      layerLabel: "Footer fine print",
      responsive: { mobile: { layout: "row" } },
      style: { width: "100%", maxWidth: "full", justifyContent: "space-between", flexWrap: "wrap", marginTopFree: "28px", gap: "10px" },
    };
    return {
      ...node,
      props: { ...props, slotKey: "footer", anchorId: "site-footer", style },
      children: [
        { id: id(), kind: "heading", props: { text: "See you soon.", level: 2, layerLabel: "Footer line", style: { lineHeight: "1" } } },
        { id: id(), kind: "button", props: { label: "See services", href: "#services", tone: "primary", layerLabel: "Footer CTA", style: { marginTopFree: "18px" } } },
        {
          id: id(),
          kind: "container",
          props: fine,
          children: [
            {
              id: id(),
              kind: "social_links",
              props: {
                links: [],
                display: "text",
                ariaLabel: "Social links",
                dataBinding: { sourceKey: "workspace_social_links" },
                layerLabel: "Footer links",
              },
            },
            { id: id(), kind: "paragraph", props: { text: "Hecho con Tulala", layerLabel: "Footer credit", style: { lineHeight: "1.5" } } },
          ],
        },
      ],
    } as unknown as BuilderNode;
  });
  return out;
}

/** Maison v2 as it was at `version` (15 = release 2.1 ... 20 = release 2.6, 21 = release 2.7), rebuilt from code. */
export function maisonV2At(version: number): DesignPayload {
  let out = currentMaisonV2();
  if (version < 21) out = revertR21(out);
  if (version < 20) out = revertR20(out);
  if (version < 19) out = revertR19(out);
  if (version < 18) out = revertR18(out);
  if (version < 17) out = revertR17(out);
  if (version < 16) out = revertR16(out);
  return out;
}
