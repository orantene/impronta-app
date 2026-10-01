/**
 * Gridline (TH16): the utility-bar trade site, composed from shared widgets
 * only. Reference mockup: `web/design-references/gridline/`.
 *
 * Section order (the mockup's, one parity unit each):
 *   header     utility bar: name, trade line, emergencies pill, action, call
 *   emergency  alert band (renders only while the talent's flag is on)
 *   hero       spec block: kicker, headline, typed spec cells, CTA pair, who card
 *   tasks      task picker (W-11): what is happening, recommends one service
 *   services   comparison matrix (W-01 `matrix` layout, stacked cards on phone)
 *   proof      spec table + work-order job cards (one container)
 *   area       approximate service area card (W-13 `visit` area layout)
 *   faq        accordion bound to `talent_faq_items`
 *   footer     the shell footer; the global Tulala socket draws under it
 *
 * Design-owned editable defaults only. Nothing here names a trade, a city, a
 * price, a warranty or a response time: spec cells, spec rows and tasks ship
 * unfilled and stay hidden until the talent types or picks them. Colours are
 * token refs (the Look owns them), no hex, no font stacks.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignPayload } from "../types";
import {
  areaBlock,
  buildKitShell,
  emergencyBlock,
  faqBlock,
  heroSpecBlock,
  proofBlock,
  taskPickerBlock,
} from "../section-kit";
import { seqIds, servicesSection } from "./design-parts";
import { GRIDLINE_STYLE_TOKEN_DEFAULTS } from "./gridline-defaults";

type Props = Record<string, unknown>;

function withProps(node: BuilderNode, patch: Props): BuilderNode {
  return { ...node, props: { ...((node.props ?? {}) as Props), ...patch } } as BuilderNode;
}

/** Patch the first descendant of `kind` (the kit blocks wrap one widget in a slot container). */
function patchChild(node: BuilderNode, kind: string, patch: Props): BuilderNode {
  const kids = "children" in node && Array.isArray(node.children) ? node.children : [];
  return {
    ...node,
    children: kids.map((k) => (k.kind === kind ? withProps(k, patch) : k)),
  } as BuilderNode;
}

/** FAQ is the contact role under the `faq` key the parity map addresses. */
function faqSection(makeId: () => string): BuilderNode {
  const band = faqBlock(makeId, { heading: "Questions", ask: true });
  return withProps(band, { slotKey: "faq", anchorId: "faq" });
}

export function buildGridlinePayload(): DesignPayload {
  const id = seqIds("gridline");

  const services = servicesSection(id, {
    label: "Services",
    eyebrow: "",
    title: "Services and prices",
    layout: "matrix",
    categoryNav: "none",
    stylePreset: "clean",
    photoRadius: "soft",
    density: "comfortable",
    rowCtaVariant: "solid",
    showPhoto: false,
    showDescription: false,
    showDelivery: false,
    showCategory: false,
  });

  return {
    tokenDefaults: { ...GRIDLINE_STYLE_TOKEN_DEFAULTS },
    shellTree: buildKitShell(id, {
      displayName: "{{displayName}}",
      year: "{{year}}",
      contrastChrome: true,
      utilityBar: {
        subtitle: "{{primaryTypeLabel}}",
        ctaLabel: "Book a visit",
        ctaHref: "#services",
      },
    }),
    homeTree: [
      emergencyBlock(id),
      heroSpecBlock(id, {
        // Spec cells are typed by the talent; an empty grid renders nothing.
        specs: [],
        ctaRow: {
          primaryLabel: "See services",
          primaryHref: "#services",
          secondaryLabel: "Ask a question",
        },
      }),
      patchChild(taskPickerBlock(id, { title: "What do you need?" }), "task_picker", {}),
      // The matrix rows are the talent's own services; the CTA follows each service's booking mode.
      patchChild(services, "services_catalog", { showModeChip: true }),
      patchChild(
        proofBlock(id, {
          // Labels only: a row with no value is dropped, so no promise is made by default.
          rows: [
            { label: "Response", value: "" },
            { label: "Warranty", value: "" },
            { label: "Price", value: "" },
            { label: "Payment", value: "" },
            { label: "Review", value: "" },
          ],
          jobsHeading: "Recent jobs",
        }),
        "spec_table",
        { title: "How it works" },
      ),
      areaBlock(id, { heading: "Where I work" }),
      faqSection(id),
    ],
  };
}
