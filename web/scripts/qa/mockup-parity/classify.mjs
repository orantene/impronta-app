/**
 * Delta classifier. Every failing check becomes a delta
 *   { id, section, check, layer, evidence, suggestedFile, width, talent, kind, ... }
 * and the layer says WHERE the fix lives (docs/factory/fix-loop.md):
 *
 *   token           a computed style differs on a token-bound property
 *                   (font family / size / weight, colour, button fill)   -> tokens file
 *   payload         the kit variant exists, but a prop, the order, the copy or
 *                   a node differs                                        -> design payload
 *   kit             the same structural delta shows up on EVERY demo scanned
 *                   (so it is the shared section, not one site's content), or a
 *                   shell landmark / state chrome cannot be matched      -> kit code
 *   platform        overflow, overlap, clipping, fixed layers, lang, header rows:
 *                   renderer problems that cross designs                  -> renderer
 *   new-capability  the mockup's `data-w` unit has no kit slot in
 *                   TALENT_KIT_SECTIONS                                   -> new kit block
 *
 * A pixel-only failure has no structural cause to point at, so it is inferred:
 * it inherits the layer of any other delta on that section and width, else it is
 * `kit` when the height differs by more than 5 percent (the layout is different),
 * else `token` (same layout, colour or type nuance). Those are marked `inferred`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..", "..");

export const LAYERS = ["token", "payload", "kit", "platform", "new-capability"];
const LAYER_PRIORITY = ["token", "payload", "kit", "platform", "new-capability"];

/** Section key -> the mockup `data-w` unit it is, and the kit slot that unit maps to (null = none). */
export const SECTION_UNITS = {
  header: { wType: "site_header", shell: "header" },
  hero: { wType: "hero", slot: "hero" },
  work: { wType: "portfolio", slot: "gallery" },
  menu: { wType: "services_catalog", slot: "services" },
  reviews: { wType: "reviews", slot: "reviews" },
  about: { wType: "about", slot: "about" },
  faq: { wType: "faq", slot: null },
  location: { wType: "location", slot: "location" },
  footer: { wType: "footer", shell: "footer" },
  socket: { wType: "bottom_strip", shell: "socket" },
};

/** Where each layer's fix usually lives, per design. Sections override the kit file. */
export const SUGGESTED_FILES = {
  "maison-v2": {
    token: "web/src/lib/talent-site/theme-catalog/collection/maison-v2-tokens.ts",
    payload: "web/src/lib/talent-site/theme-catalog/collection/maison-v2.ts",
    footerPayload: "web/src/lib/talent-site/theme-catalog/collection/maison-v2-footer.ts",
    kit: {
      default: "web/src/lib/talent-site/theme-catalog/section-kit.ts",
      header: "web/src/lib/talent-site/theme-catalog/section-kit-shell.ts",
      footer: "web/src/lib/talent-site/theme-catalog/section-kit-shell.ts",
      socket: "web/src/lib/talent-site/theme-catalog/section-kit-shell.ts",
      hero: "web/src/lib/talent-site/theme-catalog/section-kit-hero-parts.ts",
      work: "web/src/lib/talent-site/theme-catalog/section-kit-bands.ts",
      location: "web/src/lib/talent-site/theme-catalog/section-kit-location.ts",
    },
    platform: "web/src/components/talent/site/TalentSiteFreeformRenderer.tsx",
    newCapability: "web/src/lib/talent-site/theme-catalog/section-kit.ts (add the slot to TALENT_KIT_SECTIONS)",
  },
};

let kitSlotsCache = null;
/** Slot keys of TALENT_KIT_SECTIONS, read from source so the classifier never drifts from the kit. */
export function kitSlots() {
  if (kitSlotsCache) return kitSlotsCache;
  try {
    const src = readFileSync(join(WEB, "src/lib/talent-site/theme-catalog/section-kit.ts"), "utf8");
    const block = src.split("export const TALENT_KIT_SECTIONS = {")[1]?.split("} as const")[0] || "";
    kitSlotsCache = new Set([...block.matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map((m) => m[1]));
  } catch {
    kitSlotsCache = new Set();
  }
  return kitSlotsCache;
}

const normalizeCheck = (s) => String(s).replace(/\d+(\.\d+)?/g, "N").replace(/\s+/g, " ").trim().slice(0, 80);

/** Findings of one row: structured ones when the scan recorded them, else derived from its reason strings. */
export function findingsOf(row) {
  if (row.findings && row.findings.length) return row.findings;
  return (row.reasons || []).map((text) => ({ kind: row.section.startsWith("state:") ? "state" : "other", check: normalizeCheck(text.split(":")[0]), evidence: text }));
}

function layerFor(row, f, ctx) {
  const unit = SECTION_UNITS[row.section];
  const text = `${f.check} ${f.evidence}`;
  if (unit?.missing) return ["new-capability", "the design map marks this section as missing from the kit"];
  switch (f.kind) {
    case "missing": {
      if (unit?.slot && kitSlots().has(unit.slot)) return ["payload", `kit slot "${unit.slot}" exists, the node is absent or hidden on this site`];
      if (unit?.shell) return ["kit", `shell landmark "${unit.shell}" is not found by structure`];
      return ["new-capability", `mockup unit data-w "${unit?.wType ?? row.section}" has no slot in TALENT_KIT_SECTIONS`];
    }
    case "style":
      return ["token", "computed style differs on a token-bound property"];
    case "order":
    case "i18n":
    case "anchor":
      return ["payload", f.kind === "i18n" ? "copy / label differs" : "order or target differs"];
    case "layout":
    case "page":
      return ["platform", "overflow, overlap, clipping or fixed-layer problem"];
    case "state":
      return /overflow|overlap|clipp|fixed|bars?\b|did not render|crashed/i.test(text)
        ? ["platform", "interaction chrome layout problem"]
        : /English|accent|voseo/i.test(text)
          ? ["payload", "copy / label differs"]
          : ["kit", "interaction chrome is missing a control or behaviour"];
    case "structure": {
      // the same structural delta on every demo scanned is the shared section, not one site's content
      const k = `${row.section}|${f.check}|${row.width}`;
      const hits = ctx.structureHits.get(k);
      if (hits && ctx.demoCount >= 2 && hits.size === ctx.demoCount) return ["kit", `fails on all ${ctx.demoCount} demos scanned`];
      return ["payload", "kit variant exists; a prop, node or its content differs"];
    }
    case "pixel":
      return null; // resolved in the second pass
    default:
      return ["payload", "unclassified check, assumed content"];
  }
}

function suggestedFile(design, layer, row) {
  const map = SUGGESTED_FILES[design] || SUGGESTED_FILES["maison-v2"];
  switch (layer) {
    case "token": return map.token;
    case "payload": return row.section === "footer" ? map.footerPayload : map.payload;
    case "kit": return map.kit[row.section] || map.kit.default;
    case "platform": return map.platform;
    default: return map.newCapability;
  }
}

/**
 * @param {Array} rows  scan rows (talent, code, width, section, label, status, reasons, findings?, pixel?)
 * @param {{design?: string}} opts
 * @returns {Array} deltas
 */
export function classify(rows, { design = "maison-v2" } = {}) {
  const failing = rows.filter((r) => r.status === "FAIL");
  const demos = new Set(rows.filter((r) => r.section !== "page").map((r) => r.code));
  const structureHits = new Map();
  for (const r of failing) for (const f of findingsOf(r)) {
    if (f.kind !== "structure") continue;
    const k = `${r.section}|${f.check}|${r.width}`;
    if (!structureHits.has(k)) structureHits.set(k, new Set());
    structureHits.get(k).add(r.code);
  }
  const ctx = { structureHits, demoCount: demos.size };

  const deltas = [];
  for (const r of failing) {
    const own = [];
    r.findings = findingsOf(r); // materialise, so each finding keeps its delta
    for (const f of r.findings) {
      const lr = layerFor(r, f, ctx);
      const d = {
        section: r.section,
        check: f.check,
        layer: lr ? lr[0] : null,
        why: lr ? lr[1] : null,
        evidence: f.evidence,
        suggestedFile: null,
        width: r.width,
        talent: r.code,
        kind: f.kind,
        ...(f.pixel ? { pixel: f.pixel } : {}),
      };
      own.push(d);
      f.delta = d;
    }
    // pixel-only failures: inherit, else infer
    for (const d of own) {
      if (d.layer) continue;
      const others = own.filter((o) => o.layer && o.kind !== "pixel");
      if (others.length) {
        d.layer = others.sort((a, b) => LAYER_PRIORITY.indexOf(a.layer) - LAYER_PRIORITY.indexOf(b.layer))[0].layer;
        d.why = "inherits the layer of the other deltas on this section";
      } else {
        const big = Math.abs(d.pixel?.heightDeltaRatio ?? 0) > 0.05;
        d.layer = big ? "kit" : "token";
        d.why = big ? "height differs by more than 5%: the section layout differs" : "same layout; colour or type nuance";
        d.inferred = true;
      }
    }
    for (const d of own) {
      d.suggestedFile = suggestedFile(design, d.layer, r);
      d.id = createHash("sha1").update([d.talent, d.width, d.section, d.layer, d.check].join("|")).digest("hex").slice(0, 10);
      deltas.push(d);
    }
  }
  return deltas;
}

/** Group deltas for the report: layer -> section -> deltas. */
export function groupByLayer(deltas) {
  const out = new Map(LAYERS.map((l) => [l, []]));
  for (const d of deltas) out.get(d.layer).push(d);
  return out;
}

/** Compact text table for the terminal (the fix loop prints this). */
export function compactTable(deltas, { max = 60 } = {}) {
  if (!deltas.length) return "no deltas";
  const lines = [];
  for (const [layer, list] of groupByLayer(deltas)) {
    if (!list.length) continue;
    lines.push(`[${layer}] ${list.length}`);
    for (const d of list.slice(0, max)) {
      const tag = d.accepted ? ` (known ${d.accepted})` : "";
      lines.push(`  ${d.section}@${d.width} ${d.check}${tag}: ${String(d.evidence).slice(0, 110)}`);
      lines.push(`      -> ${d.suggestedFile}`);
    }
  }
  return lines.join("\n");
}
