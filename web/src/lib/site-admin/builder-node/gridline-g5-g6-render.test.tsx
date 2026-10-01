/**
 * Gridline G5 + G6: the utility bar and the alert band. Render on/off states,
 * no call button without a `tel:` href, token-only CSS, reduced motion, and the
 * 4-layer wiring (schema, renderer, inspector, add gallery) plus ES strings.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { ALERT_BAND_CSS } from "./alert-band-block";
import { createBuilderNode } from "./create";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import type { BuilderAlertBandNode, BuilderNode, BuilderUtilityBarNode } from "./types";
import { UTILITY_BAR_CSS, safeCallHref } from "./utility-bar-block";
import { buildKitShell } from "@/lib/talent-site/theme-catalog/section-kit-shell";
import { emergencyBlock } from "@/lib/talent-site/theme-catalog/section-kit-emergency";

const HERE = dirname(fileURLToPath(import.meta.url));
const libAt = (f: string) => readFileSync(resolve(HERE, "../..", f), "utf8");
const srcAt = (f: string) => readFileSync(resolve(HERE, "../../..", f), "utf8");

function render(nodes: BuilderNode[], dataSources: BuilderNodeRenderDataSources = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function bar(patch: Partial<BuilderUtilityBarNode["props"]> = {}): BuilderNode {
  const n = createBuilderNode("utility_bar") as BuilderUtilityBarNode;
  return {
    ...n,
    props: {
      ...n.props,
      name: "Alex Treviño",
      subtitle: "Electricista · Monterrey",
      statusOnLabel: "Emergencias hoy",
      statusOffLabel: "Sin emergencias hoy",
      ctaLabel: "Pedir visita",
      ...patch,
    },
  } as BuilderNode;
}

function band(patch: Partial<BuilderAlertBandNode["props"]> = {}): BuilderNode {
  const n = createBuilderNode("alert_band") as BuilderAlertBandNode;
  return {
    ...n,
    props: {
      ...n.props,
      title: "Emergencia mismo día",
      safetyLabel: "Mientras tanto:",
      safetyNote: "Si hay chispas, corta la luz en el interruptor principal.",
      ...patch,
    },
  } as BuilderNode;
}

test("G5/G6 CSS is token-only (no hex) and the pulse respects reduced motion", () => {
  for (const css of [UTILITY_BAR_CSS, ALERT_BAND_CSS]) assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(UTILITY_BAR_CSS, /prefers-reduced-motion:reduce\)\{\.sb-ub-pill i\{animation:none/);
  assert.match(UTILITY_BAR_CSS, /min-height:44px/);
  assert.match(UTILITY_BAR_CSS, /\.sb-ub-tel\{[^}]*width:44px;height:44px/);
});

test("utility bar: status ON shows the on label and data-on=true", () => {
  const html = render([bar()], { emergenciesToday: true });
  assert.match(html, /data-builder-node-kind="utility_bar"/);
  assert.match(html, /data-parity-key="header"/);
  assert.match(html, /data-on="true"[^>]*>.*Emergencias hoy/);
  assert.match(html, /Electricista · Monterrey/);
  assert.match(html, /Pedir visita/);
});

test("utility bar: status OFF (and absent flag) shows the off label", () => {
  for (const ds of [{ emergenciesToday: false }, {}]) {
    const html = render([bar()], ds);
    assert.match(html, /data-on="false"/);
    assert.match(html, /Sin emergencias hoy/);
    assert.doesNotMatch(html, />Emergencias hoy</);
  }
});

test("utility bar: no call button without a valid callHref", () => {
  assert.doesNotMatch(render([bar()]), /sb-ub-tel/);
  assert.doesNotMatch(render([bar({ callHref: "{{callHref}}" })]), /sb-ub-tel/);
  assert.doesNotMatch(render([bar()], { callHref: "" }), /sb-ub-tel/);
  assert.doesNotMatch(render([bar()], { callHref: "javascript:alert(1)" }), /sb-ub-tel/);
  assert.doesNotMatch(render([bar()], { callHref: "tel:123" }), /sb-ub-tel/);
});

test("utility bar: call button from the page callHref, with a label", () => {
  const html = render([bar({ callLabel: "Llamar" })], { callHref: "tel:+528112345678" });
  assert.match(html, /<a class="sb-ub-tel" href="tel:\+528112345678" aria-label="Llamar"/);
  assert.equal(safeCallHref("tel:+528112345678"), "tel:+528112345678");
});

test("utility bar: showCall false hides the button even with a callHref", () => {
  const html = render([bar({ showCall: false })], { callHref: "tel:+528112345678" });
  assert.doesNotMatch(html, /sb-ub-tel/);
});

test("utility bar: showStatus false removes the pill", () => {
  assert.doesNotMatch(render([bar({ showStatus: false })], { emergenciesToday: true }), /sb-ub-pill/);
});

test("alert band: absent while the flag is off or missing, present while on", () => {
  assert.doesNotMatch(render([band()]), /alert_band/);
  assert.doesNotMatch(render([band()], { emergenciesToday: false }), /alert_band/);
  const html = render([band()], { emergenciesToday: true });
  assert.match(html, /data-builder-node-kind="alert_band"/);
  assert.match(html, /sb-ab-tape/);
  assert.match(html, /Emergencia mismo día/);
  assert.match(html, /Mientras tanto:/);
  assert.match(html, /corta la luz/);
});

test("alert band: safety note and action are optional, tape uses tokens", () => {
  const html = render([band({ safetyNote: "", ctaLabel: "", ctaHref: "" })], { emergenciesToday: true });
  assert.doesNotMatch(html, /sb-ab-safe/);
  assert.doesNotMatch(html, /sb-ab-cta/);
  assert.match(ALERT_BAND_CSS, /repeating-linear-gradient\(-45deg,var\(--token-color-accent/);
});

test("kit shell: utilityBar option stamps a utility_bar header with the callHref token", () => {
  let n = 0;
  const [header] = buildKitShell(() => `id${++n}`, {
    displayName: "{{displayName}}",
    utilityBar: { subtitle: "Electricista", ctaLabel: "Pedir visita" },
  });
  assert.equal((header.props as { slotKey?: string }).slotKey, "header");
  const child = (header as { children?: BuilderNode[] }).children?.[0] as BuilderUtilityBarNode;
  assert.equal(child.kind, "utility_bar");
  assert.equal(child.props.callHref, "{{callHref}}");
  assert.equal(child.props.name, "{{displayName}}");
});

test("emergency kit block carries the emergency slot", () => {
  let n = 0;
  const block = emergencyBlock(() => `id${++n}`, { title: "Emergencia mismo día" });
  assert.equal((block.props as { slotKey?: string }).slotKey, "emergency");
  assert.equal((block as { children?: BuilderNode[] }).children?.[0]?.kind, "alert_band");
});

test("G5/G6: schema, renderer, inspector and add gallery are all wired", () => {
  const registry = libAt("site-admin/builder-node/registry.ts");
  for (const k of ["utility_bar", "alert_band"]) {
    assert.ok(libAt("site-admin/builder-node/types.ts").includes(`kind: "${k}"`), `${k} type`);
    assert.ok(registry.includes(`  "${k}",`), `${k} kind list`);
    assert.ok(libAt("talent-site/theme-catalog/validate.ts").includes(`"${k}"`), `${k} design validator`);
    assert.ok(libAt("site-admin/builder-node/drop-policy.ts").includes(`"${k}"`), `${k} drop policy`);
    assert.ok(libAt("site-admin/builder-node/create.ts").includes(`case "${k}"`), `${k} create`);
    assert.ok(libAt("site-admin/builder-node/render.tsx").includes(`case "${k}"`), `${k} renderer`);
    assert.ok(libAt("site-admin/builder-node/mvp-allow-list.ts").includes(`${k}: "structure"`), `${k} category`);
    assert.match(
      srcAt("components/edit-chrome/inspectors/builder-node-content.tsx"),
      new RegExp(`node\\.kind === "${k}"\\) \\{\\s*return <`),
      `${k} inspector`,
    );
  }
  assert.ok(registry.includes("propsSchema: utilityBarPropsSchema"));
  assert.ok(registry.includes("propsSchema: alertBandPropsSchema"));
  const gallery = libAt("site-admin/add-gallery/registry-catalog-sections-connected.ts");
  assert.ok(gallery.includes('nativeKind: "utility_bar"'));
  assert.ok(gallery.includes('nativeKind: "alert_band"'));
  const allow = libAt("site-admin/builder-node/mvp-allow-list.ts");
  assert.ok(/MVP_ELEMENT_LIBRARY_KINDS[^]*?"utility_bar"[^]*?"alert_band"/.test(allow), "element library kinds");
});

test("G5/G6: every new inspector and gallery string has a Spanish row", () => {
  const es = srcAt("components/edit-chrome/editor-i18n-es-inspectors-3.ts");
  for (const s of [
    '"Utility bar"',
    '"Alert band"',
    '"Emergencies pill"',
    '"Call button"',
    '"Safety note"',
    '"Action label"',
    '"Utility bar · status and call"',
    '"Alert band · same-day emergency"',
  ]) {
    assert.ok(es.includes(s), `ES row for ${s}`);
  }
});
