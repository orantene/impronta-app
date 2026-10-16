/**
 * TUL-547 / GRK-081: every demo header has logo + nav + CTA. The Gridline
 * utility bar had no nav (alex, saul, karla), its CTA vanished on a theme whose
 * accent is the bar's ink (karla), and the CTA a kit header gets filled in at
 * render read "Book" on Spanish sites (tomas).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { BuilderNode, BuilderUtilityBarNode } from "@/lib/site-admin/builder-node/types";
import { renderUtilityBarBlock, UTILITY_BAR_CSS } from "@/lib/site-admin/builder-node/utility-bar-block";
import { pruneDeadSectionLinks } from "./dead-section-links";
import { localiseSeededDesignLabel } from "./design-label-locale";
import { ensureHeaderCta } from "./header-ensure-cta";
import { withUtilityBarNav } from "./utility-bar-nav";

const bar = (props: BuilderUtilityBarNode["props"] = {}): BuilderNode =>
  ({ id: "ub", kind: "utility_bar", props: { name: "Karla", ctaLabel: "Agendar visita", ctaHref: "#services", ...props } }) as BuilderNode;
const shellOf = (node: BuilderNode): BuilderNode[] =>
  [{ id: "h", kind: "container", props: { layout: "stack", layerLabel: "Header" }, children: [node] } as BuilderNode];
const section = (anchorId: string): BuilderNode =>
  ({ id: anchorId, kind: "container", props: { anchorId }, children: [] }) as unknown as BuilderNode;
const barProps = (tree: BuilderNode[]) =>
  ((tree[0] as BuilderNode & { children: BuilderNode[] }).children[0] as BuilderUtilityBarNode).props;

test("TUL-547: a utility bar without nav gets section links in the site language", () => {
  const es = barProps(withUtilityBarNav(shellOf(bar()), "es"));
  assert.deepEqual(es.navLinks?.map((l) => l.label), ["Servicios", "Zona", "Preguntas"]);
  assert.equal(es.menuLabel, "Menú");
  const en = barProps(withUtilityBarNav(shellOf(bar()), "en"));
  assert.deepEqual(en.navLinks?.map((l) => l.href), ["#services", "#area", "#faq"]);
  assert.equal(en.navLinks?.[2]?.label, "FAQ");
});

test("TUL-547: an owner-set nav (even empty) is left alone", () => {
  const tree = shellOf(bar({ navLinks: [] }));
  assert.equal(withUtilityBarNav(tree, "es")[0], tree[0]);
});

test("TUL-547: nav links to sections the page does not render are dropped", () => {
  const shell = withUtilityBarNav(shellOf(bar()), "es");
  const pruned = pruneDeadSectionLinks(shell, [section("services"), section("faq")]);
  assert.deepEqual(barProps(pruned).navLinks?.map((l) => l.href), ["#services", "#faq"]);
});

test("TUL-547: the bar renders the nav inline and as a phone menu (status moves into it)", () => {
  const props = barProps(withUtilityBarNav(shellOf(bar()), "es"));
  const html = renderToStaticMarkup(
    renderUtilityBarBlock({ node: { id: "ub", kind: "utility_bar", props } as BuilderUtilityBarNode }) as never,
  );
  assert.match(html, /<nav class="sb-ub-nav" aria-label="Secciones"><a href="#services">Servicios<\/a>/);
  assert.match(html, /<details class="sb-ub-menu"><summary aria-label="Menú">/);
  assert.match(html, /class="sb-ub-menu-panel"[^>]*>.*<a href="#faq">Preguntas<\/a>.*sb-ub-pill/);
  assert.match(html, /<a class="sb-ub-cta" href="#services">Agendar visita<\/a>/);

  const bare = renderToStaticMarkup(renderUtilityBarBlock({ node: bar() as BuilderUtilityBarNode }) as never);
  const markup = bare.slice(bare.indexOf("</style>"));
  assert.doesNotMatch(markup, /sb-ub-nav|sb-ub-menu/, "no nav markup when there are no links");
});

test("TUL-547: phone shows a menu (with the pill inside); 760px+ shows the inline nav", () => {
  assert.match(UTILITY_BAR_CSS, /\.sb-ub-nav\{display:none;/);
  assert.match(UTILITY_BAR_CSS, /\.sb-ub:has\(\.sb-ub-menu\) > \.sb-ub-pill\{display:none\}/);
  assert.match(UTILITY_BAR_CSS, /@container sbub \(min-width:760px\)\{\.sb-ub-nav\{display:flex\}\.sb-ub-menu\{display:none\}/);
  for (const target of [".sb-ub-nav a", ".sb-ub-menu>summary"]) {
    const rule = new RegExp(`${target.replace(/[.>]/g, "\\$&")}[^{]*\\{[^}]*(?:min-height:44px|height:44px)`);
    assert.match(UTILITY_BAR_CSS, rule, `${target} keeps a 44px tap target`);
  }
});

test("TUL-547: CTA label follows the accent's lightness unless the theme sets on-accent", () => {
  assert.match(
    UTILITY_BAR_CSS,
    /@supports \(color:oklch\(from red l c h\)\)\{\.sb-ub-cta,\.sb-ub-logo\{color:var\(--token-color-on-accent,oklch\(from var\(--token-color-accent/,
  );
  assert.match(UTILITY_BAR_CSS, /\.sb-ub-cta,\.sb-ub-logo\{box-shadow:inset 0 0 0 1\.5px/);
});

test("TUL-547: a filled-in header CTA reads in the site language and booking mode", () => {
  assert.equal(localiseSeededDesignLabel("Book", "es", "instant"), "Reserva");
  assert.equal(localiseSeededDesignLabel("Book", "es", "inquiry"), "Cotizar");
  assert.equal(localiseSeededDesignLabel("Book", "en", null), "Book");

  const kit = [
    {
      id: "frame-9",
      kind: "container",
      props: { layout: "row", layerLabel: "Header" },
      children: [
        { id: "w", kind: "heading", props: { text: "Tomás", layerLabel: "Wordmark" } },
        { id: "n", kind: "nav", props: { links: [] } },
      ],
    },
  ] as unknown as BuilderNode[];
  const out = ensureHeaderCta(kit, "Reserva") as Array<BuilderNode & { children: BuilderNode[] }>;
  const cta = out[0]!.children.find((c) => c.kind === "button");
  assert.equal((cta?.props as { label?: string }).label, "Reserva");
  const ub = ensureHeaderCta([bar({ ctaLabel: "", ctaHref: "" })], "Cotizar")[0] as BuilderUtilityBarNode;
  assert.equal(ub.props.ctaLabel, "Cotizar");
  const dflt = ensureHeaderCta(kit) as Array<BuilderNode & { children: BuilderNode[] }>;
  assert.equal((dflt[0]!.children.find((c) => c.kind === "button")?.props as { label?: string }).label, "Book");
});
