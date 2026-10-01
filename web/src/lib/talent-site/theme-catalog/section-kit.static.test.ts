/**
 * Static guard: every talent SECTION KIT builder emits token-only style (no
 * hex literals, no raw font stacks) and stamps slotKey + originRole on its
 * top-level section. Walks the OUTPUT of every builder (and every variant the
 * starter templates use), so a new builder or option that inlines a colour
 * fails here before it can reach a Design.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  TALENT_KIT_SECTION_ROLES,
  TALENT_KIT_SECTIONS,
  TALENT_KIT_SHELL_ROLES,
  aboutBlock,
  aftercareBlock,
  beforeAfterBlock,
  buildKitShell,
  buildKitStandardShell,
  contactBlock,
  faqBlock,
  galleryBlock,
  locationBlock,
  portfolioBlock,
  portfolioChaptersBlock,
  reviewsBlock,
  visitBlock,
  contentsBlock,
  statementFooterBlock,
  compCardBlock,
  heroCentered,
  heroCover,
  heroMasthead,
  heroSplit,
  heroSpecBlock,
  servicesBlock,
} from "./section-kit";

const HEX = /#[0-9a-f]{3,8}/i;

function ids(): () => string {
  let n = 0;
  return () => `kit-${(n += 1)}`;
}

const SECTIONS: Array<[string, BuilderNode]> = [
  ["heroSplit", heroSplit(ids())],
  ["heroSplit accent 40-60", heroSplit(ids(), { ratio: "40-60", accent: true, chips: true })],
  ["heroSplit no eyebrow/chips", heroSplit(ids(), { eyebrow: false, chips: false })],
  [
    "heroSplit inset italic next-free",
    heroSplit(ids(), {
      inset: true,
      italicAccent: true,
      nextFreeChip: true,
      chips: false,
      accent: true,
    }),
  ],
  [
    "heroSpecBlock",
    heroSpecBlock(ids(), {
      specs: [{ label: "Respuesta", value: "24 h" }],
      badges: ["12 años"],
      ctaRow: { primaryLabel: "Ver horarios", primaryHref: "#services", secondaryLabel: "Pregunta", secondaryHref: "#pick" },
    }),
  ],
  ["heroSpecBlock empty", heroSpecBlock(ids())],
  ["beforeAfterBlock", beforeAfterBlock(ids())],
  ["aftercareBlock", aftercareBlock(ids())],
  ["locationBlock", locationBlock(ids())],
  ["heroCentered", heroCentered(ids())],
  ["heroCentered accent", heroCentered(ids(), { accent: true })],
  ["heroCover", heroCover(ids())],
  ["heroCover no accent", heroCover(ids(), { accent: false })],
  [
    "heroMasthead stacked bw",
    heroMasthead(ids(), {
      lines: ["{{displayName}}"],
      splitWords: true,
      subline: "{{primaryTypeLabel}}",
      showCover: true,
      coverFilter: "bw",
    }),
  ],
  ["aboutBlock", aboutBlock(ids())],
  ["aboutBlock centered accent", aboutBlock(ids(), { align: "center", accent: true })],
  ["aboutBlock split", aboutBlock(ids(), { layout: "split", accent: true, showFacts: false })],
  ["servicesBlock", servicesBlock(ids(), { columns: 2, heading: "What I do" })],
  ["galleryBlock masonry", galleryBlock(ids())],
  ["galleryBlock grid", galleryBlock(ids(), { mode: "grid", columns: 2 })],
  ["portfolioBlock filmstrip", portfolioBlock(ids(), { layout: "filmstrip" })],
  ["portfolioBlock contact_sheet", portfolioBlock(ids(), { layout: "contact_sheet", columns: 4 })],
  [
    "portfolioBlock chapter",
    portfolioBlock(ids(), {
      layout: "chapter",
      chapterNumber: 2,
      heading: "Lookbook",
      creditLine: "Seasonal story",
      showCaptions: true,
    }),
  ],
  [
    "portfolioChaptersBlock book",
    portfolioChaptersBlock(ids(), [
      { chapterNumber: 1, heading: "Editorial", creditLine: "Studio session", showCaptions: true },
      { chapterNumber: 2, heading: "Lookbook", creditLine: "Seasonal story", showCaptions: true },
    ]),
  ],
  ["reviewsBlock row", reviewsBlock(ids(), { layout: "row" })],
  ["reviewsBlock trio", reviewsBlock(ids(), { layout: "trio", heading: "Client words" })],
  ["visitBlock facts", visitBlock(ids(), { layout: "facts" })],
  ["visitBlock split", visitBlock(ids(), { layout: "split", band: true })],
  [
    "contentsBlock index",
    contentsBlock(ids(), {
      heading: "Contents",
      showNumbers: true,
      items: [
        { label: "Editorial", anchor: "chapter-1" },
        { label: "Lookbook", anchor: "chapter-2" },
      ],
    }),
  ],
  [
    "compCardBlock strip",
    compCardBlock(ids(), {
      layout: "strip_with_details",
      showFullDetails: true,
      minMeasures: 4,
    }),
  ],
  [
    "statementFooterBlock",
    statementFooterBlock(ids(), {
      statement: "Available for editorial and campaign work.",
      creditLine: "{{displayName}}",
      contactLine: "Inquire for bookings",
      align: "center",
    }),
  ],
  ["faqBlock centered", faqBlock(ids(), { heading: "Before your appointment", center: true })],
  ["contactBlock", contactBlock(ids(), { heading: "Get in touch" })],
];

const SHELLS: Array<[string, BuilderNode[]]> = [
  ["buildKitShell", buildKitShell(ids(), { displayName: "{{displayName}}" })],
  [
    "buildKitShell rule",
    buildKitShell(ids(), { displayName: "{{displayName}}", headerAlign: "center", headerRule: true, headerPaddingY: "m" }),
  ],
  ["buildKitShell contrast", buildKitShell(ids(), { displayName: "{{displayName}}", contrastChrome: true, year: "{{year}}" })],
  ["buildKitStandardShell", buildKitStandardShell(ids(), { displayName: "{{displayName}}", year: "{{year}}" })],
];

/** Every [key, value] pair under any node's props, depth-first. */
function* propEntries(value: unknown, key = ""): Generator<[string, unknown]> {
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      yield [k, v];
      yield* propEntries(v, k);
    }
  } else {
    yield [key, value];
  }
}

function* walk(nodes: ReadonlyArray<BuilderNode>): Generator<BuilderNode> {
  for (const n of nodes) {
    yield n;
    if ("children" in n && Array.isArray(n.children)) yield* walk(n.children);
  }
}

function assertTokenOnly(label: string, nodes: ReadonlyArray<BuilderNode>): void {
  for (const node of walk(nodes)) {
    for (const [key, value] of propEntries(node.props)) {
      if (typeof value !== "string") continue;
      assert.doesNotMatch(value, HEX, `${label}: ${node.id}.${key} carries a hex literal "${value}"`);
      if (key === "fontFamily") {
        assert.match(
          value,
          /^token:typography\.(heading|body)-font-family$/,
          `${label}: ${node.id} has a raw font-family "${value}"`,
        );
      }
    }
    const style = (node.props as { style?: Record<string, unknown> }).style ?? {};
    for (const [key, value] of Object.entries(style)) {
      if (/color$/i.test(key) && typeof value === "string") {
        assert.ok(value.startsWith("token:color."), `${label}: ${node.id}.style.${key} = "${value}" is not a token ref`);
      }
    }
  }
}

for (const [label, section] of SECTIONS) {
  test(`kit section ${label}: token-only style + provenance`, () => {
    assertTokenOnly(label, [section]);
    const props = section.props as { slotKey?: string; originRole?: string };
    assert.ok(props.slotKey, `${label} needs props.slotKey`);
    assert.ok(props.originRole && TALENT_KIT_SECTION_ROLES.has(props.originRole), `${label} originRole`);
    assert.equal(
      (props as { anchorId?: string }).anchorId,
      props.slotKey,
      `${label} should stamp anchorId from slot for header nav hashes`,
    );
  });
}

for (const [label, shell] of SHELLS) {
  test(`kit shell ${label}: token-only style + header/footer provenance`, () => {
    assertTokenOnly(label, shell);
    const roles = shell.map((n) => (n.props as { originRole?: string }).originRole);
    assert.deepEqual(roles, ["talent.shell.header", "talent.shell.footer"]);
    for (const role of roles) assert.ok(TALENT_KIT_SHELL_ROLES.has(role!));
  });
}

test("the kit source files carry no hex literal at all", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of [
    "section-kit.ts",
    "section-kit-shell.ts",
    "section-kit-bands.ts",
    "../max-site-templates/registry.ts",
  ]) {
    const src = readFileSync(join(here, file), "utf8");
    assert.doesNotMatch(src, /["'`][^"'`]*#[0-9a-f]{3,8}\b/i, `${file} contains a quoted hex literal`);
  }
});

test("aftercareBlock: every visible text has an ES overlay and no dash in the copy", () => {
  const section = aftercareBlock(ids());
  const texts: Array<{ text: string; es?: string }> = [];
  for (const node of walk([section])) {
    const p = node.props as { text?: string; i18n?: { es?: { text?: string } } };
    if (typeof p.text === "string") texts.push({ text: p.text, es: p.i18n?.es?.text });
  }
  assert.ok(texts.length >= 8, "eyebrow, heading and three tips (title + text)");
  for (const t of texts) {
    assert.ok(t.es && t.es.length > 0, `"${t.text}" needs an ES overlay`);
    assert.doesNotMatch(`${t.text} ${t.es}`, /[\u2013\u2014]/, "no en or em dash in user-facing copy");
  }
  assert.equal(TALENT_KIT_SECTIONS.aftercare.originRole, "talent.aftercare");
});

test("locationBlock: the shared visit widget in its location layout, no data baked in", () => {
  const section = locationBlock(ids());
  const visit = [...walk([section])].find((n) => n.kind === "visit")!;
  const props = visit.props as { layout?: string; title?: string; mapSide?: string; showMapButton?: boolean };
  assert.equal(props.layout, "location");
  assert.equal(props.title, "", "the heading is derived from the studio kind, not authored");
  assert.equal(props.showMapButton, true);
  assert.equal(TALENT_KIT_SECTIONS.location.originRole, "talent.location");
  const json = JSON.stringify(section);
  assert.doesNotMatch(json, /Mérida|Calle|exactAddress|exact_address/);
  assert.doesNotMatch(json, /[–—]/);
});
