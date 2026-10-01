/**
 * Maison v2 RICH FOOTER (release 2.7, FT-1..FT-3): the proposal's light footer,
 * built from real profile data.
 *
 *   Nos vemos pronto.                      DÓNDE                CONTACTO
 *   {trade} en {city}.                     {zone}               Instagram · @handle
 *   [ Reservar cita ]                      {days}, con cita     Escribir por este sitio
 *                                          Ver ubicación
 *
 * The intro, zone, hours and Instagram are LIVE lines (`liveText`): the platform
 * fills them from her profile at render time and a line with no data, or a
 * column with none, disappears (see `live-text.ts`). Everything else is an
 * ordinary editable node. Light by default; the `footer.tone` theme token makes
 * it the dark band. The Tulala credit and the policy links are NOT here: the
 * global footer socket draws them under every design's footer, so there is no
 * duplicate "Hecho con Tulala".
 *
 * The band sits under its own key (`footer_rich`), so sites on the 2.5 dark
 * footer take the swap as ONE opt-in layout choice; new sites get this one.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { KitIdFactory } from "../section-kit";

type Props = Record<string, unknown>;

const propsOf = (n: BuilderNode): Props => (n.props ?? {}) as Props;

function col(makeId: KitIdFactory, slotKey: string, anchorId: string, kids: BuilderNode[]): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: { slotKey, anchorId, layout: "stack", gap: "s", style: { gap: "0px", minWidth: "0px" } },
    children: kids,
  } as unknown as BuilderNode;
}

const heading3 = (makeId: KitIdFactory, text: string, label: string): BuilderNode =>
  ({ id: makeId(), kind: "heading", props: { text, level: 3, layerLabel: label } }) as unknown as BuilderNode;

const live = (makeId: KitIdFactory, liveText: string, token: string, label: string): BuilderNode =>
  ({ id: makeId(), kind: "paragraph", props: { text: `{{${token}}}`, liveText, layerLabel: label } }) as unknown as BuilderNode;

const link = (makeId: KitIdFactory, text: string, href: string, label: string): BuilderNode =>
  ({ id: makeId(), kind: "button", props: { label: text, href, tone: "secondary", layerLabel: label } }) as unknown as BuilderNode;

/** Swap the shell's footer container for the rich footer; every other shell node passes through. */
export function maisonV2RichFooter(makeId: KitIdFactory, node: BuilderNode): BuilderNode {
  const props = propsOf(node);
  if (props.slotKey !== "footer" || node.kind !== "container") return node;

  const lead = col(makeId, "footer_lead", "s-foot-lead", [
    { id: makeId(), kind: "heading", props: { text: "See you {i}soon.{/i}", level: 2, layerLabel: "Footer line" } } as unknown as BuilderNode,
    live(makeId, "footer_intro", "footerIntro", "Footer intro"),
    { id: makeId(), kind: "button", props: { label: "Book an appointment", href: "#services", tone: "primary", layerLabel: "Footer CTA" } } as unknown as BuilderNode,
  ]);

  const where = col(makeId, "footer_where", "s-foot-where", [
    heading3(makeId, "Where", "Footer where heading"),
    live(makeId, "footer_where", "footerWhere", "Footer zone"),
    live(makeId, "footer_hours", "footerHours", "Footer hours"),
    link(makeId, "See location", "#visit", "Footer location link"),
  ]);
  const contact = col(makeId, "footer_contact", "s-foot-contact", [
    heading3(makeId, "Contact", "Footer contact heading"),
    live(makeId, "footer_contact", "footerContact", "Footer Instagram"),
    link(makeId, "Write from this site", "#talent-ask", "Footer chat link"),
  ]);

  const cols: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: {
      slotKey: "footer_cols",
      anchorId: "s-foot-cols",
      layout: "grid",
      columns: 2,
      responsive: { tablet: { layout: "grid", columns: 2 }, mobile: { layout: "grid", columns: 2 } },
      style: {
        gridTemplateColumns: "repeat(2,minmax(0,1fr))",
        gap: "32px",
        responsive: { mobile: { gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "20px" } },
      },
    },
    children: [where, contact],
  } as unknown as BuilderNode;

  const top: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: {
      slotKey: "footer_top",
      anchorId: "s-foot-top",
      layout: "grid",
      responsive: { tablet: { layout: "stack" }, mobile: { layout: "stack" } },
      style: {
        gridTemplateColumns: "minmax(0,1fr) minmax(0,560px)",
        gap: "64px",
        alignItems: "flex-end",
        width: "100%",
        maxWidth: "full",
        responsive: { tablet: { gap: "32px" }, mobile: { gap: "24px" } },
      },
    },
    children: [lead, cols],
  } as unknown as BuilderNode;

  return {
    ...node,
    props: {
      ...props,
      slotKey: "footer_rich",
      anchorId: "s-foot",
      align: "start",
      style: {
        ...((props.style as object) ?? {}),
        maxWidth: "full",
        paddingX: "l",
        paddingTop: "64px",
        paddingBottom: "32px",
        // The children carry their own rhythm.
        gap: "0px",
        responsive: { mobile: { paddingX: "s", paddingLeft: "18px", paddingRight: "18px", paddingTop: "40px", paddingBottom: "28px" } },
      },
    },
    children: [top],
  } as unknown as BuilderNode;
}
