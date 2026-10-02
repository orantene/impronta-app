/**
 * Gridline G9a: the task picker. Render, recommend by task (all four booking
 * modes), the default card, no-JS visibility and token-only CSS.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { blankOffering, type TalentOffering } from "@/lib/talent/offerings-types";

import { createBuilderNode } from "./create";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import { TASK_PICKER_CSS } from "./task-picker-block";
import { buildTaskPickerModel, taskPickerMode } from "./task-picker-recommend";
import type { BuilderNode, BuilderTaskPickerNode } from "./types";

function offering(id: string, patch: Partial<TalentOffering>): TalentOffering {
  return {
    ...blankOffering("tp-1", "MXN", 0),
    id,
    title: id,
    status: "published",
    visibility: "public",
    moderationState: "approved",
    amountCents: 50000,
    durationMinutes: 60,
    ...patch,
  };
}

const OFFERINGS: TalentOffering[] = [
  offering("rev", { title: "Revision", bookingMode: "instant", durationMinutes: 45, category: "Diagnostico" }),
  offering("lamp", { title: "Lamparas", bookingMode: "request" }),
  offering("tablero", { title: "Tablero", bookingMode: "request", priceType: "custom", priceDisplay: "quote", amountCents: null }),
  offering("emerg", { title: "Emergencia", bookingMode: "inquiry" }),
  offering("draft", { title: "Borrador", status: "draft" }),
];

function pickerNode(over: Partial<BuilderTaskPickerNode["props"]> = {}): BuilderNode {
  const n = createBuilderNode("task_picker") as BuilderTaskPickerNode;
  return {
    ...n,
    props: {
      ...n.props,
      tasks: [
        { id: "t1", label: "Power is out", labelEs: "Se fue la luz", icon: "sparkle", offeringId: "rev", hint: "Check first.", hintEs: "Primero se revisa." },
        { id: "t2", label: "Install lamps", labelEs: "Instalar lamparas", icon: "check", offeringId: "lamp", hint: "", hintEs: "" },
        { id: "t3", label: "Old panel", labelEs: "Tablero viejo", icon: "star", offeringId: "tablero" },
        { id: "t4", label: "Sparks", labelEs: "Chispas", icon: "heart", offeringId: "emerg" },
        { id: "t5", label: "Ghost", offeringId: "draft" },
        { id: "t6", label: "No target" },
      ],
      defaultOfferingId: "rev",
      ...over,
    },
  } as BuilderNode;
}

function render(node: BuilderNode, locale = "es", confirmsByHand = false): string {
  const dataSources: BuilderNodeRenderDataSources = {
    talentOfferings: OFFERINGS,
    talentOfferingsConfirmsByHand: confirmsByHand,
  };
  return renderToStaticMarkup(
    renderBuilderNodes([node], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
      visitorLocale: locale,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

test("renders every usable task as a real pressed-state button, drops the rest (works without JS)", () => {
  const html = render(pickerNode());
  assert.match(html, /data-builder-node-kind="task_picker"/);
  assert.equal((html.match(/class="sb-tp-task"/g) ?? []).length, 4);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 4);
  assert.match(html, /Se fue la luz/);
  assert.doesNotMatch(html, /Ghost/);
  assert.doesNotMatch(html, /No target/);
  assert.match(html, /data-bn-icon="sparkle"/);
});

test("English locale reads the English text", () => {
  const html = render(pickerNode(), "en");
  assert.match(html, /Power is out/);
  assert.doesNotMatch(html, /Se fue la luz/);
});

test("default card recommends the inspection service with price, duration, mode and one CTA", () => {
  const html = render(pickerNode());
  assert.match(html, /data-rec="default"/);
  assert.match(html, /<h3>Revision<\/h3>/);
  assert.match(html, /Empieza aquí/);
  assert.match(html, /45 min/);
  assert.match(html, /data-mode="instant"/);
  assert.match(html, /data-tp-action="primary"/);
  assert.doesNotMatch(html, /data-tp-action="details"/);
});

test("no default offering and no usable task hides the block, nothing invented", () => {
  const html = render(pickerNode({ defaultOfferingId: "", tasks: [{ id: "x", label: "Nothing" }] }));
  assert.match(html, /data-tp-empty="1"/);
  assert.doesNotMatch(html, /sb-tp-task/);
  const noDefault = render(pickerNode({ defaultOfferingId: "" }));
  assert.doesNotMatch(noDefault, /data-rec=/);
});

test("recommend by task: card model reads live offering data, all four modes", () => {
  const props = (pickerNode() as BuilderTaskPickerNode).props;
  const m = buildTaskPickerModel({ props, offerings: OFFERINGS, locale: "es", confirmsByHand: false });
  assert.deepEqual(m.tasks.map((t) => t.id), ["t1", "t2", "t3", "t4"]);
  assert.equal(m.tasks[0]!.hint, "Primero se revisa.");
  assert.equal(m.cards["rev"]!.mode, "instant");
  assert.equal(m.cards["lamp"]!.mode, "request");
  assert.equal(m.cards["tablero"]!.mode, "quote");
  assert.equal(m.cards["emerg"]!.mode, "inquiry");
  assert.equal(m.cards["rev"]!.category, "Diagnostico");
  assert.equal(m.cards["rev"]!.duration, "45 min");
  assert.match(m.cards["tablero"]!.priceLabel, /Cotización/);
  assert.equal(m.cards["tablero"]!.modeLabel, "Cotización primero");
  assert.equal(m.fallback?.offeringId, "rev");
  assert.ok(!("draft" in m.cards));
});

test("a plan that confirms by hand turns an instant service into a request", () => {
  assert.equal(taskPickerMode(OFFERINGS[0]!, false, "instant"), "instant");
  assert.equal(taskPickerMode(OFFERINGS[0]!, true, "instant"), "request");
});

test("the card is server-rendered for the default only; task cards come from the island state", () => {
  // Static markup is the first paint: one card (the default), never two.
  const html = render(pickerNode());
  assert.equal((html.match(/data-rec=/g) ?? []).length, 1);
});

test("CSS is token-only, container tiers match the mockup, hover lift respects reduced motion", () => {
  assert.doesNotMatch(TASK_PICKER_CSS, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(TASK_PICKER_CSS, /@container sbtp \(max-width:370px\)\{\.sb-tp-tasks\{grid-template-columns:1fr\}/);
  assert.match(TASK_PICKER_CSS, /@container sbtp \(min-width:700px\)[^]*repeat\(3,1fr\)/);
  assert.match(TASK_PICKER_CSS, /grid-template-columns:1fr 1fr/);
  const motion = "@media (prefers-reduced-motion:no-preference){";
  const start = TASK_PICKER_CSS.indexOf(motion);
  assert.ok(start >= 0, "motion query exists");
  const block = TASK_PICKER_CSS.slice(start, TASK_PICKER_CSS.indexOf("\n", start));
  assert.match(block, /\.sb-tp-task:hover\{transform:translateY\(-1px\)\}/);
  // The lift lives ONLY inside the motion query.
  const outside = TASK_PICKER_CSS.replace(block, "");
  assert.doesNotMatch(outside, /translateY/);
});
