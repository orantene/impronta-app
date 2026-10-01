#!/usr/bin/env node
/**
 * Gap report: turn the raw analyses `run.mjs` writes (analysis.json) into layered deltas.
 *
 *   node scripts/qa/mockup-parity/gap.mjs --from <run out dir> [--report docs/factory/folio-gap-report.md]
 *
 * Each delta is { section, width, demo, check, layer, evidence, suggestedFile }. Layers:
 *   token         a computed style differs on a property bound to a token (font, size, colour, background)
 *   payload       the kit variant exists but the node, its content, its order or its media count differs
 *   kit           same structural delta on EVERY demo run (needs 2+ demos), or a spacing/height delta
 *                 with matching content
 *   platform      overflow, overlap or clipping the renderer causes, or page-level shell problems
 *   new capability the mockup unit has no slot in TALENT_KIT_SECTIONS
 * Read-only: no browser, no network.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDesignMap } from "./section-map.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..", "..");

const args = process.argv.slice(2);
const arg = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const from = arg("--from");
if (!from) { console.error("usage: gap.mjs --from <run out dir> [--report file.md]"); process.exit(2); }
const A = JSON.parse(readFileSync(join(resolve(from), "analysis.json"), "utf8"));
const MAP = loadDesignMap(A.design);

// Kit slot keys, read from the source so the classifier never drifts from the platform.
const kitSrc = readFileSync(join(WEB, "src/lib/talent-site/theme-catalog/section-kit.ts"), "utf8");
const kitBlock = kitSrc.slice(kitSrc.indexOf("export const TALENT_KIT_SECTIONS"), kitSrc.indexOf("} as const;", kitSrc.indexOf("export const TALENT_KIT_SECTIONS")));
const KIT_KEYS = new Set([...kitBlock.matchAll(/slotKey: "([a-z_]+)"/g)].map((m) => m[1]).concat(["header", "footer", "socket"]));

const FILES = {
  token: "src/lib/talent-site/theme-catalog/collection/folio-defaults.ts (tokenDefaults) / folio-looks.ts (palettes)",
  payload: "src/lib/talent-site/theme-catalog/collection/designs.ts (buildFolioPayload)",
  kit: "src/lib/talent-site/theme-catalog/section-kit*.ts or src/lib/site-admin/builder-node/<kind>-block.tsx",
  platform: "src/lib/site-admin/builder-node/render.tsx or src/components/site-shell/PublishedShell.tsx",
  "new capability": "src/lib/talent-site/theme-catalog/section-kit.ts (TALENT_KIT_SECTIONS)",
};

const deltas = [];
const add = (d) => deltas.push({ suggestedFile: FILES[d.layer], ...d });

const rgb = (s) => (s || "").match(/[\d.]+/g)?.slice(0, 3).map(Number);
const cdiff = (a, b) => { const x = rgb(a), y = rgb(b); return x && y ? Math.max(...x.map((v, i) => Math.abs(v - y[i]))) : 0; };
const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9áéíóúñ ]/gi, "").replace(/\s+/g, " ").trim();
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : 0);

const demos = [...new Set(A.product.map((p) => p.code))];
const keyedAny = A.product.some((p) => p.keyed);

for (const w of A.widths) {
  const mock = A.mockup[w];
  if (!mock) { add({ section: "page", width: w, demo: "-", check: "mockup capture", layer: "platform", evidence: "the mockup did not load at this width" }); continue; }
  for (const p of A.product.filter((x) => x.width === w)) {
    const demo = `${p.code} ${p.name}`;
    // Only the reference demo carries the mockup's content AND look: tokens and text are judged on it alone.
    // Other demos of the design only contribute structure, layout and geometry (kit vs payload evidence).
    const isRef = p.code === A.referenceDemo.profileCode;
    // ---- page level
    if (p.page.docOverflow) add({ section: "page", width: w, demo, check: "horizontal page scroll", layer: "platform", evidence: p.page.docOverflowDetail });
    if (w <= 480 && (p.page.headerRows || 0) > 1) add({ section: "header", width: w, demo, check: "header wraps to rows", layer: "platform", evidence: `${p.page.headerRows} rows at ${w}px (mockup: ${mock.page.headerRows || 1})` });
    if (p.page.fixedOverlaps?.length) add({ section: "page", width: w, demo, check: "fixed layers overlap", layer: "platform", evidence: p.page.fixedOverlaps.join(" | ") });
    if (p.page.fixedBottomBars?.length > 1) add({ section: "page", width: w, demo, check: "several fixed bottom bars", layer: "platform", evidence: p.page.fixedBottomBars.join(" | ") });

    let prevMockY = -1;
    for (const sec of MAP.sections) {
      const m = mock.sections[sec.key];
      const q = p.sections[sec.key];
      const base = { section: sec.key, width: w, demo };
      if (sec.productOnly) {
        if (isRef && q?.present) add({ ...base, check: "section not in the mockup", layer: "payload", evidence: `${sec.label}: ${q.metrics.h}px tall, not part of TH02` });
        continue;
      }
      if (!m?.present) continue; // the mockup self-check reports bad mockup rules
      if (!q?.present) {
        if (!isRef) continue;
        const hasSlot = sec.parityKey && KIT_KEYS.has(sec.parityKey);
        add({ ...base, check: "section missing", layer: hasSlot ? "payload" : "new capability", evidence: hasSlot ? `kit slot "${sec.parityKey}" exists, the design payload does not render it` : `mockup unit "${sec.unit || sec.key}" has no kit slot` });
        continue;
      }
      // ---- order
      if (m.rect.y < prevMockY) { /* mockup order is defined by the map; nothing to do */ }
      prevMockY = m.rect.y;
      if (q.order && !q.order.ok) add({ ...base, check: "section order", layer: "payload", evidence: q.order.detail });
      // ---- structure (rules shared by both sides)
      for (const c of q.structure.filter((c) => !c.ok)) {
        const onMock = m.structure.find((x) => x.name === c.name);
        if (onMock && !onMock.ok) continue; // a bad rule, not a product gap
        add({ ...base, check: c.name, layer: "payload", evidence: c.detail });
      }
      // ---- layout the renderer owns
      for (const c of q.layout.filter((c) => !c.ok)) {
        const onMock = m.layout.find((x) => x.name === c.name);
        if (onMock && !onMock.ok) continue;
        add({ ...base, check: c.name, layer: "platform", evidence: c.detail });
      }
      for (const c of isRef ? q.i18n.filter((c) => !c.ok) : []) add({ ...base, check: c.name, layer: "payload", evidence: c.detail });
      // ---- counts: media and actions
      const mm = m.metrics, pm = q.metrics;
      if (mm && pm) {
        if (Math.abs(pm.imgs - mm.imgs) >= 1 && (pm.imgs < mm.imgs || pm.imgs > mm.imgs + 1) && isRef) add({ ...base, check: "photo count", layer: "payload", evidence: `${pm.imgs} photos vs mockup ${mm.imgs}` });
        if (isRef && mm.buttons + mm.links > 0 && Math.abs(pm.buttons + pm.links - (mm.buttons + mm.links)) >= 3) add({ ...base, check: "action count", layer: "payload", evidence: `${pm.buttons + pm.links} links/buttons vs mockup ${mm.buttons + mm.links}` });
        // headings: text and style
        const n = isRef ? Math.min(pm.headings.length, mm.headings.length, 3) : 0;
        if (isRef && pm.headings.length !== mm.headings.length) add({ ...base, check: "heading count", layer: "payload", evidence: `${pm.headings.length} headings vs mockup ${mm.headings.length}` });
        for (let i = 0; i < n; i++) {
          const a = pm.headings[i], b = mm.headings[i];
          if (norm(a.text) !== norm(b.text)) add({ ...base, check: `heading ${i + 1} text`, layer: "payload", evidence: `"${a.text}" vs mockup "${b.text}"` });
          if (a.ff !== b.ff) add({ ...base, check: `heading ${i + 1} font family`, layer: "token", evidence: `${a.ff} vs mockup ${b.ff}` });
          if (Math.abs(a.fs - b.fs) > Math.max(2, b.fs * 0.1)) add({ ...base, check: `heading ${i + 1} font size`, layer: "token", evidence: `${a.fs}px vs mockup ${b.fs}px` });
          if (Math.abs(a.fw - b.fw) > 100) add({ ...base, check: `heading ${i + 1} weight`, layer: "token", evidence: `${a.fw} vs mockup ${b.fw}` });
          if (cdiff(a.color, b.color) > 16) add({ ...base, check: `heading ${i + 1} colour`, layer: "token", evidence: `${a.color} vs mockup ${b.color}` });
          if (a.tt !== b.tt) add({ ...base, check: `heading ${i + 1} text-transform`, layer: "kit", evidence: `${a.tt} vs mockup ${b.tt}` });
        }
        if (isRef && pm.para && mm.para) {
          if (pm.para.ff !== mm.para.ff) add({ ...base, check: "body font family", layer: "token", evidence: `${pm.para.ff} vs mockup ${mm.para.ff}` });
          if (Math.abs(pm.para.fs - mm.para.fs) > Math.max(2, mm.para.fs * 0.1)) add({ ...base, check: "body font size", layer: "token", evidence: `${pm.para.fs}px vs mockup ${mm.para.fs}px` });
        }
        if (isRef && cdiff(pm.bg, mm.bg) > 16) add({ ...base, check: "section background", layer: "token", evidence: `${pm.bg} vs mockup ${mm.bg}` });
        // geometry with matching content is the kit's spacing; with different content it is payload
        const dh = pct(pm.h, mm.h);
        if (isRef && Math.abs(dh) > 25 && Math.abs(pm.h - mm.h) > 60) {
          const sameContent = pm.imgs === mm.imgs && pm.headings.length === mm.headings.length;
          add({ ...base, check: "section height", layer: sameContent ? "kit" : "payload", evidence: `${pm.h}px vs mockup ${mm.h}px (${dh > 0 ? "+" : ""}${dh}%)` });
        }
        if (pm.img0 && mm.img0) {
          const ra = pm.img0.w / Math.max(1, pm.img0.h), rb = mm.img0.w / Math.max(1, mm.img0.h);
          if (Math.abs(ra - rb) / rb > 0.2) add({ ...base, check: "first photo aspect", layer: "kit", evidence: `${ra.toFixed(2)} vs mockup ${rb.toFixed(2)}` });
        }
      }
    }
  }
}

// kit = the same structural delta on every demo run (promote payload -> kit when 2+ demos agree)
if (demos.length >= 2) {
  const sig = (d) => `${d.section}|${d.width}|${d.check}`;
  const byDemo = new Map();
  for (const d of deltas) { if (d.layer !== "payload") continue; (byDemo.get(sig(d)) ?? byDemo.set(sig(d), new Set()).get(sig(d))).add(d.demo); }
  for (const d of deltas) if (d.layer === "payload" && byDemo.get(sig(d))?.size === demos.length && !/not in the mockup|text|missing/.test(d.check)) { d.layer = "kit"; d.suggestedFile = FILES.kit; d.evidence += ` (same on all ${demos.length} demos)`; }
}

const LAYERS = ["token", "payload", "kit", "platform", "new capability"];
const counts = Object.fromEntries(LAYERS.map((l) => [l, deltas.filter((d) => d.layer === l).length]));
const outDir = resolve(from);
writeFileSync(join(outDir, "deltas.json"), JSON.stringify({ design: A.design, referenceDemo: A.referenceDemo, widths: A.widths, keyed: keyedAny, counts, deltas }, null, 2));

// ---------------------------------------------------------------- markdown
const reportPath = arg("--report");
if (reportPath) {
  const L = [];
  const bySection = (list) => {
    const m = new Map();
    for (const d of list) (m.get(d.section) ?? m.set(d.section, []).get(d.section)).push(d);
    return m;
  };
  L.push(`# ${A.design} gap report: ${A.referenceDemo.name} (${A.referenceDemo.profileCode}) vs the pinned mockup`);
  L.push("");
  L.push(`- Run: widths ${A.widths.join(", ")}, demos ${demos.join(", ")}, locale es. Source: ${from.includes("scratchpad") ? "tool run output" : from}.`);
  L.push(`- Matching: ${keyedAny ? "by data-parity-key" : "**by the map's fallback selectors**. The product build under test predates the data-parity-key contract, so no section could be matched by key. Re-run after the integrator builds a branch that carries it; the tool then switches to keys on its own and this report should be regenerated."}`);
  L.push(`- Classifier: gap.mjs (rules below). \`deltas.json\` beside the run holds every delta with evidence and a suggested file.`);
  L.push("");
  L.push("## Deltas by layer");
  L.push("");
  L.push("| Layer | Count | What it means |");
  L.push("|---|---|---|");
  const meaning = { token: "a computed style differs on a token-bound property: change the design's tokens or palette", payload: "the kit slot exists; the design's tree, content or media differs: edit the design payload", kit: "same delta on every demo, or spacing with matching content: edit the kit section or block renderer", platform: "overflow, overlap or shell behaviour: edit the renderer", "new capability": "the mockup unit has no kit slot: needs a new slot or variant" };
  for (const l of LAYERS) L.push(`| ${l} | ${counts[l]} | ${meaning[l]} |`);
  L.push("");
  for (const w of A.widths) {
    L.push(`## ${w}px`);
    L.push("");
    for (const l of LAYERS) {
      const list = deltas.filter((d) => d.width === w && d.layer === l);
      if (!list.length) continue;
      L.push(`### ${l} (${list.length})`);
      L.push("");
      L.push("| Section | Check | Demo | Evidence |");
      L.push("|---|---|---|---|");
      for (const d of list) L.push(`| ${d.section} | ${d.check} | ${d.demo.split(" ")[0]} | ${String(d.evidence).replace(/\|/g, "/")} |`);
      L.push("");
    }
  }
  L.push("## Section geometry (reference demo)");
  L.push("");
  L.push("| Section | " + A.widths.map((w) => `${w}px product / mockup (px tall)`).join(" | ") + " |");
  L.push("|---|" + A.widths.map(() => "---").join("|") + "|");
  const ref = A.referenceDemo.profileCode;
  for (const sec of MAP.sections) {
    const cells = A.widths.map((w) => {
      const pm = A.product.find((x) => x.code === ref && x.width === w)?.sections[sec.key]?.metrics;
      const mm = A.mockup[w]?.sections[sec.key]?.metrics;
      return `${pm ? pm.h : "absent"} / ${mm ? mm.h : sec.productOnly ? "n/a" : "absent"}`;
    });
    L.push(`| ${sec.label} | ${cells.join(" | ")} |`);
  }
  L.push("");
  L.push("## Rules");
  L.push("");
  L.push("- token: heading or body font family, size (more than 10 percent or 2px), weight (100), colour (16 per channel) or section background differs.");
  L.push("- payload: section absent although its kit slot exists, section order, heading text or count, photo count, action count, structure rules failing on the product only, i18n leaks, sections the mockup lacks.");
  L.push("- kit: spacing or height with matching content, text-transform, first photo aspect; or a payload delta that every demo shows.");
  L.push("- platform: horizontal scroll, overlapping or clipped layout, header rows, stacked fixed bars.");
  L.push("- new capability: mockup unit with no `TALENT_KIT_SECTIONS` slot.");
  mkdirSync(dirname(resolve(reportPath)), { recursive: true });
  writeFileSync(resolve(reportPath), L.join("\n") + "\n");
}
console.log(`deltas: ${deltas.length} (${LAYERS.map((l) => `${l} ${counts[l]}`).join(", ")}) -> ${join(outDir, "deltas.json")}`);
