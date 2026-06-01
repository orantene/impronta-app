/**
 * Builder published-page PERFORMANCE BUDGET.
 *
 * P4 made fidelity "proven" by screenshots. Proven quality also means the page
 * a visitor downloads isn't quietly ballooning while we chase pixels: a real
 * photo, a third webfont, a runaway repeater, or an accidentally-duplicated
 * renderer stylesheet each add weight that a screenshot can't see. This script
 * renders every registered fidelity design through the REAL renderer
 * (`buildFidelityHtml` → `renderBuilderNodes`) and measures, deterministically
 * and OFFLINE, the things that drive page weight:
 *
 *   - rendered HTML byte size (the document a browser receives)
 *   - the renderer stylesheet's byte size, and that it is emitted EXACTLY ONCE
 *     per page (PERF-1: `BuilderNodeRendererStyles` de-dup must hold)
 *   - font requests + font payload (self-hosted woff2 measured on disk; Google
 *     families counted + estimated)
 *   - image payload (root-relative photos resolved against web/public + sized
 *     on disk; inline data: URIs sized in place)
 *   - DOM node count (catches repeater / structure runaways a screenshot hides)
 *   - total transfer weight (html + fonts + external images)
 *
 * It then compares each design against documented BUDGETS and exits non-zero on
 * any breach, so CI fails the PR instead of shipping a bloated page. Budgets are
 * ceilings sized to comfortably allow rich, real-photography designs (the P4
 * rebuild's whole point) while catching genuine bloat — see
 * web/docs/builder-perf-budget.md for the rationale behind every number and the
 * discipline for changing one.
 *
 * Determinism: no browser, no network. Every byte comes from the rendered HTML
 * string or a committed file on disk, so the same commit always produces the
 * same report — exactly what a CI gate needs.
 *
 * Usage:
 *   tsx scripts/fidelity/perf-budget.mts            measure + enforce (default)
 *   tsx scripts/fidelity/perf-budget.mts --json     print only the JSON report
 *   tsx scripts/fidelity/perf-budget.mts --selftest  prove the gate REJECTS bloat
 */

import { statSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fidelityDesigns } from "./designs";
import { buildFidelityHtml, renderFidelityMarkup, type FidelityDesign } from "./html";
import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = resolve(SCRIPT_DIR, "fonts");
const PUBLIC_DIR = resolve(SCRIPT_DIR, "../../public");
const OUTPUT_DIR = resolve(SCRIPT_DIR, "../../fidelity"); // gitignored capture dir
const REPORT_PATH = join(OUTPUT_DIR, "perf-budget.json");

/**
 * A typical latin-subset Google webfont woff2 is ~15–30 KB. We can't fetch it
 * offline, so each declared Google family contributes this estimate to the font
 * payload. Self-hosted (bundled) faces are measured exactly from disk instead.
 */
const GOOGLE_WOFF2_ESTIMATE_BYTES = 24_000;

const KB = 1024;
const MB = 1024 * 1024;

// ── Budgets ───────────────────────────────────────────────────────────────────
// Ceilings, not target-fits. Rationale + change-discipline: builder-perf-budget.md.

interface Budget {
  /** Machine key — also the metric key on Metrics. */
  key: keyof Metrics;
  /** Human label for the report. */
  label: string;
  /** Inclusive maximum. A metric strictly greater than this fails. */
  max: number;
  /** Render bytes / count / "exactly" for the report formatting. */
  unit: "bytes" | "count" | "exact";
}

export const BUDGETS: readonly Budget[] = [
  // PERF-1 regression lock: the global renderer sheet must appear once per page.
  { key: "rendererCssBlocks", label: "Renderer CSS blocks (PERF-1: exactly 1)", max: 1, unit: "exact" },
  // The renderer sheet is global — every published page pays its weight, so its
  // growth must be a conscious choice, never silent. ~57 KB today; ~20% headroom.
  { key: "rendererCssBytes", label: "Renderer CSS size", max: 70 * KB, unit: "bytes" },
  // The HTML document itself. Rich pages reference images externally, so the
  // document stays small; a balloon here means inlined data or runaway markup.
  { key: "htmlBytes", label: "Rendered HTML size", max: 220 * KB, unit: "bytes" },
  // Structure runaway guard (a repeater bound to a 5,000-row source, etc.).
  { key: "domNodeCount", label: "DOM node count", max: 2_500, unit: "count" },
  // Each webfont blocks text paint; 2–4 faces is tasteful, 6 is a hard ceiling.
  { key: "fontFileCount", label: "Font files requested", max: 6, unit: "count" },
  // 6 bundled faces ≈ 360 KB; allow headroom for the Google estimate.
  { key: "fontBytes", label: "Font payload", max: 420 * KB, unit: "bytes" },
  // Real editorial photography is heavy by design: a hero + ~6 gallery crops at
  // ~300 KB source each ≈ 2 MB. 3 MB ceiling honors real photos, catches bloat.
  { key: "imageWeightBytes", label: "Image payload (external + inline)", max: 3 * MB, unit: "bytes" },
  // Any single asset over ~900 KB is unoptimized — real web JPEGs are ~200–450 KB.
  { key: "maxSingleImageBytes", label: "Largest single image", max: 900 * KB, unit: "bytes" },
  // The headline page weight a visitor pays (uncompressed source bytes).
  { key: "transferTotalBytes", label: "Total transfer weight", max: 3.8 * MB, unit: "bytes" },
];

// ── Metrics ───────────────────────────────────────────────────────────────────

export interface Metrics {
  htmlBytes: number;
  rendererCssBytes: number;
  rendererCssBlocks: number;
  domNodeCount: number;
  fontFileCount: number;
  fontStylesheetRequests: number;
  fontBundledBytes: number;
  fontGoogleFamilies: number;
  fontBytes: number;
  imageImgTags: number;
  imageExternalCount: number;
  imageExternalBytes: number;
  imageInlineCount: number;
  imageInlineBytes: number;
  imageRemoteCount: number;
  imageWeightBytes: number;
  maxSingleImageBytes: number;
  transferTotalBytes: number;
}

export interface DesignReport {
  id: string;
  title: string;
  metrics: Metrics;
  notes: string[];
}

/** A resolver maps a referenced asset path → on-disk byte size (or null if absent). */
export interface AssetSizers {
  /** root-relative image path ("/marketing/x.jpg") → bytes, or null if missing. */
  imageBytes: (rootRelativePath: string) => number | null;
  /** bundled woff2 filename ("geist.woff2") → bytes, or null if missing. */
  fontBytes: (woff2File: string) => number | null;
}

const RENDERER_STYLE_RE =
  /<style\b[^>]*\bdata-builder-node-renderer-styles\b[^>]*>([\s\S]*?)<\/style>/g;
const OPEN_TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*?)?\/?>/g;
const IMG_SRC_RE = /<img\b[^>]*?\bsrc="([^"]*)"/g;
const GOOGLE_FONT_LINK_RE =
  /<link\b[^>]*\bhref="([^"]*fonts\.googleapis\.com\/css2[^"]*)"/g;
const FONT_FACE_SRC_RE = /@font-face\s*\{[^}]*?url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/g;
const BG_IMAGE_URL_RE = /background-image\s*:[^;"']*url\(\s*(?:&quot;|["'])?([^"')]+?)(?:&quot;|["'])?\s*\)/g;

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function htmlUnescape(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/** Strip a query string / hash fragment from an asset path. */
function cleanPath(path: string): string {
  return path.replace(/[?#].*$/, "");
}

function classifyImageRef(ref: string): "data" | "external" | "remote" | "unresolved" {
  if (ref.startsWith("data:")) return "data";
  if (ref.startsWith("/") && !ref.startsWith("//")) return "external";
  if (/^https?:\/\//i.test(ref)) return "remote";
  return "unresolved";
}

/**
 * Measure a single design. `markup` is the published renderer output (DOM +
 * renderer sheet, no harness shell); `html` is the full document the harness
 * serves. Font/image byte sizes come from the injected sizers so this stays a
 * pure function — the CLI wires disk access, the self-test wires fakes.
 */
export function measureDesign(
  html: string,
  markup: string,
  sizers: AssetSizers,
): { metrics: Metrics; notes: string[] } {
  const notes: string[] = [];

  // ── HTML + renderer stylesheet (PERF-1) ────────────────────────────────────
  const rendererBlocks = [...html.matchAll(RENDERER_STYLE_RE)];
  const rendererCssBytes = rendererBlocks.length > 0 ? byteLength(rendererBlocks[0][1]) : 0;
  if (rendererBlocks.length === 0) {
    notes.push("No renderer stylesheet found — BuilderNodeRendererStyles did not emit.");
  } else if (rendererBlocks.length > 1) {
    notes.push(
      `Renderer stylesheet emitted ${rendererBlocks.length}× — PERF-1 de-dup regressed.`,
    );
  }

  // ── DOM node count (published markup only) ──────────────────────────────────
  const domNodeCount = (markup.match(OPEN_TAG_RE) ?? []).length;

  // ── Fonts ───────────────────────────────────────────────────────────────────
  const googleFamilies = new Set<string>();
  let fontStylesheetRequests = 0;
  for (const [, href] of html.matchAll(GOOGLE_FONT_LINK_RE)) {
    fontStylesheetRequests += 1;
    for (const [, params] of htmlUnescape(href).matchAll(/family=([^&]+)/g)) {
      const family = decodeURIComponent(params.split(":")[0]).replaceAll("+", " ").trim();
      if (family) googleFamilies.add(family);
    }
  }
  let fontBundledBytes = 0;
  let bundledCount = 0;
  for (const [, url] of html.matchAll(FONT_FACE_SRC_RE)) {
    const file = url.split("/").pop() ?? url;
    const bytes = sizers.fontBytes(file);
    if (bytes === null) {
      notes.push(`Bundled font asset not found on disk: ${file}`);
      continue;
    }
    fontBundledBytes += bytes;
    bundledCount += 1;
  }
  const fontGoogleFamilies = googleFamilies.size;
  const fontFileCount = bundledCount + fontGoogleFamilies;
  const fontBytes = fontBundledBytes + fontGoogleFamilies * GOOGLE_WOFF2_ESTIMATE_BYTES;
  if (fontGoogleFamilies > 0) {
    notes.push(
      `${fontGoogleFamilies} Google font family(ies) [${[...googleFamilies].join(", ")}] ` +
        `estimated at ${GOOGLE_WOFF2_ESTIMATE_BYTES / KB} KB each (not measurable offline).`,
    );
  }

  // ── Images ──────────────────────────────────────────────────────────────────
  const imageRefs: string[] = [];
  for (const [, src] of html.matchAll(IMG_SRC_RE)) imageRefs.push(htmlUnescape(src));
  for (const [, url] of html.matchAll(BG_IMAGE_URL_RE)) {
    const ref = htmlUnescape(url);
    if (ref.startsWith("data:") || ref.startsWith("/") || /^https?:/i.test(ref)) {
      imageRefs.push(ref);
    }
  }
  const imageImgTags = [...html.matchAll(IMG_SRC_RE)].length;
  let imageExternalCount = 0;
  let imageExternalBytes = 0;
  let imageInlineCount = 0;
  let imageInlineBytes = 0;
  let imageRemoteCount = 0;
  let maxSingleImageBytes = 0;
  for (const ref of imageRefs) {
    switch (classifyImageRef(ref)) {
      case "data": {
        const bytes = byteLength(ref);
        imageInlineCount += 1;
        imageInlineBytes += bytes;
        maxSingleImageBytes = Math.max(maxSingleImageBytes, bytes);
        break;
      }
      case "external": {
        const bytes = sizers.imageBytes(cleanPath(ref));
        if (bytes === null) {
          notes.push(`Image not found under web/public: ${cleanPath(ref)}`);
          break;
        }
        imageExternalCount += 1;
        imageExternalBytes += bytes;
        maxSingleImageBytes = Math.max(maxSingleImageBytes, bytes);
        break;
      }
      case "remote": {
        imageRemoteCount += 1;
        notes.push(`Remote image not counted toward payload (off-origin): ${ref}`);
        break;
      }
      case "unresolved":
        notes.push(`Unresolved image reference: ${ref}`);
        break;
    }
  }
  const imageWeightBytes = imageExternalBytes + imageInlineBytes;

  // ── Total transfer (inline images already counted inside htmlBytes) ─────────
  const htmlBytes = byteLength(html);
  const transferTotalBytes = htmlBytes + fontBytes + imageExternalBytes;

  return {
    metrics: {
      htmlBytes,
      rendererCssBytes,
      rendererCssBlocks: rendererBlocks.length,
      domNodeCount,
      fontFileCount,
      fontStylesheetRequests,
      fontBundledBytes,
      fontGoogleFamilies,
      fontBytes,
      imageImgTags,
      imageExternalCount,
      imageExternalBytes,
      imageInlineCount,
      imageInlineBytes,
      imageRemoteCount,
      imageWeightBytes,
      maxSingleImageBytes,
      transferTotalBytes,
    },
    notes,
  };
}

export interface Violation {
  designId: string;
  key: keyof Metrics;
  label: string;
  actual: number;
  max: number;
  unit: Budget["unit"];
}

export function evaluateBudgets(designId: string, metrics: Metrics): Violation[] {
  const violations: Violation[] = [];
  for (const budget of BUDGETS) {
    const actual = metrics[budget.key];
    // "exact" budgets (PERF-1: renderer sheet count) fail on ANY deviation —
    // a MISSING sheet (0) is as wrong as a duplicated one (2). Size/count
    // budgets are one-sided ceilings.
    const fails = budget.unit === "exact" ? actual !== budget.max : actual > budget.max;
    if (fails) {
      violations.push({
        designId,
        key: budget.key,
        label: budget.label,
        actual,
        max: budget.max,
        unit: budget.unit,
      });
    }
  }
  return violations;
}

// ── CLI / formatting ──────────────────────────────────────────────────────────

function fmt(value: number, unit: Budget["unit"]): string {
  if (unit === "bytes") {
    if (value >= MB) return `${(value / MB).toFixed(2)} MB`;
    if (value >= KB) return `${(value / KB).toFixed(1)} KB`;
    return `${value} B`;
  }
  return String(value);
}

const diskSizers: AssetSizers = {
  imageBytes: (rootRelativePath) => safeSize(join(PUBLIC_DIR, rootRelativePath)),
  fontBytes: (woff2File) => safeSize(join(FONTS_DIR, woff2File)),
};

function safeSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

function measureRegisteredDesign(design: FidelityDesign): DesignReport {
  const html = buildFidelityHtml(design);
  const markup = renderFidelityMarkup(design.tree);
  const { metrics, notes } = measureDesign(html, markup, diskSizers);
  return { id: design.id, title: design.title, metrics, notes };
}

function printReport(reports: DesignReport[], violations: Violation[]): void {
  for (const report of reports) {
    const designViolations = new Set(
      violations.filter((v) => v.designId === report.id).map((v) => v.key),
    );
    console.log(`\n● ${report.id} — ${report.title}`);
    for (const budget of BUDGETS) {
      const actual = report.metrics[budget.key];
      const ok = !designViolations.has(budget.key);
      const limit = budget.unit === "exact" ? `= ${budget.max}` : `≤ ${fmt(budget.max, budget.unit)}`;
      console.log(
        `   ${ok ? "✓" : "✗"} ${budget.label.padEnd(38)} ${fmt(actual, budget.unit).padStart(10)}  (${limit})`,
      );
    }
    for (const note of report.notes) console.log(`     · ${note}`);
  }
}

function runEnforce(jsonOnly: boolean): void {
  const reports = fidelityDesigns.map(measureRegisteredDesign);
  const violations = reports.flatMap((r) => evaluateBudgets(r.id, r.metrics));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    REPORT_PATH,
    `${JSON.stringify(
      {
        generatedFor: fidelityDesigns.map((d) => d.id),
        budgets: BUDGETS,
        reports,
        violations,
        passed: violations.length === 0,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (jsonOnly) {
    console.log(JSON.stringify({ reports, violations, passed: violations.length === 0 }, null, 2));
  } else {
    printReport(reports, violations);
    console.log(`\nReport written to ${REPORT_PATH}`);
    if (violations.length === 0) {
      console.log(`\n✓ Perf budget OK — ${reports.length} design(s) within every budget.`);
    } else {
      console.error(`\n✗ Perf budget FAILED — ${violations.length} breach(es):`);
      for (const v of violations) {
        console.error(
          `   ${v.designId}: ${v.label} = ${fmt(v.actual, v.unit)} exceeds ${fmt(v.max, v.unit)}`,
        );
      }
    }
  }
  process.exitCode = violations.length === 0 ? 0 : 1;
}

/**
 * Prove the gate actually REJECTS bloat — otherwise a budget that never fails is
 * worthless. Three checks, all offline:
 *   1. a synthetic 5,000-node design run through the real measure→evaluate
 *      pipeline must produce violations (end-to-end enforcement),
 *   2. a metrics object that exceeds EVERY budget must flag every budget key,
 *   3. a metrics object at the limit must flag nothing (no false positives).
 */
function runSelfTest(): void {
  const failures: string[] = [];

  // 1. End-to-end: a deliberately over-budget design.
  const huge: FidelityDesign = {
    id: "synthetic-over-budget",
    title: "Synthetic over-budget design",
    tree: [
      {
        id: "bloat-root",
        kind: "container",
        props: { layout: "stack" },
        children: Array.from({ length: 5_000 }, (_, i) => ({
          id: `bloat-${i}`,
          kind: "paragraph" as const,
          props: { text: `Synthetic bloat paragraph number ${i} repeated to inflate the page.` },
        })),
      } as BuilderNode,
    ],
  };
  const html = buildFidelityHtml(huge);
  const markup = renderFidelityMarkup(huge.tree);
  const { metrics } = measureDesign(html, markup, diskSizers);
  const e2eViolations = evaluateBudgets(huge.id, metrics);
  const breachedKeys = new Set(e2eViolations.map((v) => v.key));
  if (!breachedKeys.has("domNodeCount")) failures.push("synthetic design did not breach domNodeCount");
  if (!breachedKeys.has("htmlBytes")) failures.push("synthetic design did not breach htmlBytes");
  console.log(
    `[1/3] synthetic design → ${e2eViolations.length} violation(s): ` +
      `${[...breachedKeys].join(", ") || "NONE"} (domNodes=${metrics.domNodeCount}, html=${fmt(metrics.htmlBytes, "bytes")})`,
  );

  // 2. Over-every-budget metrics object must flag every budget key.
  const over = Object.fromEntries(
    BUDGETS.map((b) => [b.key, b.max + (b.unit === "exact" ? 1 : Math.max(1, Math.ceil(b.max * 0.5)))]),
  ) as unknown as Metrics;
  const overViolations = evaluateBudgets("synthetic-over", { ...zeroMetrics(), ...over });
  for (const budget of BUDGETS) {
    if (!overViolations.some((v) => v.key === budget.key)) {
      failures.push(`budget "${budget.key}" did not fire when exceeded`);
    }
  }
  console.log(`[2/3] over-every-budget metrics → ${overViolations.length}/${BUDGETS.length} budgets fired`);

  // 3. At-the-limit metrics object must flag nothing.
  const atLimit = Object.fromEntries(BUDGETS.map((b) => [b.key, b.max])) as unknown as Metrics;
  const atLimitViolations = evaluateBudgets("synthetic-limit", { ...zeroMetrics(), ...atLimit });
  if (atLimitViolations.length > 0) {
    failures.push(`at-the-limit metrics produced ${atLimitViolations.length} false positive(s)`);
  }
  console.log(`[3/3] at-the-limit metrics → ${atLimitViolations.length} false positive(s)`);

  if (failures.length > 0) {
    console.error(`\n✗ Self-test FAILED — the perf gate would not reliably catch bloat:`);
    for (const f of failures) console.error(`   · ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✓ Self-test passed — the perf budget correctly rejects over-budget pages.`);
  process.exitCode = 0;
}

function zeroMetrics(): Metrics {
  return {
    htmlBytes: 0,
    rendererCssBytes: 0,
    rendererCssBlocks: 1,
    domNodeCount: 0,
    fontFileCount: 0,
    fontStylesheetRequests: 0,
    fontBundledBytes: 0,
    fontGoogleFamilies: 0,
    fontBytes: 0,
    imageImgTags: 0,
    imageExternalCount: 0,
    imageExternalBytes: 0,
    imageInlineCount: 0,
    imageInlineBytes: 0,
    imageRemoteCount: 0,
    imageWeightBytes: 0,
    maxSingleImageBytes: 0,
    transferTotalBytes: 0,
  };
}

const args = new Set(process.argv.slice(2));
if (args.has("--selftest")) {
  runSelfTest();
} else {
  runEnforce(args.has("--json"));
}
