#!/usr/bin/env node
// Light design compiler: mockup HTML -> tokens.json, composition.json, tickets.md.
// Pure node, no network, never generates components or kit code.
//   npm run design:compile -- <mockup.html> [--slug <name>] [--out <dir>] [--gate <gate.md>]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractTokens, extractUnits } from "./extract.mjs";
import { kvarsToTokenDefaults, loadRegistry, mapUnit, normaliseUnit, paletteToLookTokens } from "./map.mjs";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const FAMILIES = [
  [/category explorer|credits|rotating word|w-10|w-11/i, "category explorer / credits image list / rotating word"],
  [/picker|route|estimator|swatch/i, "interactive picker / route / estimator / swatches"],
  [/featured offer|product|vehicle|trip/i, "featured offer / product / vehicle / trip card"],
  [/timetable|progress|dashboard|inspector/i, "timetable / progress / dashboard hero"],
  [/map|drawing|svg/i, "hero: illustrated map / SVG drawing"],
  [/checklist|what to bring|document|side rail/i, "checklist / what-to-bring / document list / side rail"],
  [/journal|lesson|worked example/i, "journal / lesson notes / worked-example sequence"],
  [/video|reel/i, "hero: video / reel player"],
  [/audio|player|pet profile/i, "other (media/audio player, pet profile preview)"],
];

export function familyOf(text) {
  for (const [re, name] of FAMILIES) if (re.test(text)) return name;
  return "other";
}

/** Parse the gate report: theme rows with example misses, and the family counts. */
export function parseGate(md) {
  const misses = [];
  const families = {};
  for (const line of md.split("\n")) {
    const row = line.match(/^\|\s*([^|]+?)\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*(.*?)\s*\|$/);
    if (row && row[2]) misses.push({ theme: row[1], text: row[2].toLowerCase() });
    const fam = line.match(/^- (.+?): (\d+) themes/);
    if (fam) families[fam[1].toLowerCase()] = Number(fam[2]);
  }
  return { misses, families };
}

export function themesNeeding(unitRaw, gate) {
  const key = unitRaw.toLowerCase().replace(/\s+/g, " ");
  const frag = key.split(" · ").slice(-1)[0].slice(0, 20);
  return gate.misses.filter((m) => m.text.includes(key.slice(0, 24)) || (frag.length > 6 && m.text.includes(frag))).map((m) => m.theme);
}

export function buildTokens(html, reg) {
  const t = extractTokens(html);
  const warnings = [];
  const fonts = {
    display: t.roles.stacks.display || t.roles.display,
    body: t.roles.stacks.body || t.roles.body,
  };
  const palettes = {};
  for (const [key, p] of Object.entries(t.palettes)) {
    palettes[key] = { name: p.n || key, tokens: paletteToLookTokens(p, fonts), unmappedFields: Object.keys(p).filter((k) => !["n", "bg", "surface", "ink", "mute", "line", "accent", "on"].includes(k)) };
  }
  if (!Object.keys(palettes).length) warnings.push("no T.palettes object found in the mockup; palettes not extractable");
  if (!t.families.length) warnings.push("no Google Fonts link found");
  const { defaults, unmapped } = kvarsToTokenDefaults(t.kvars, reg);
  if (!Object.keys(t.kvars).length) warnings.push("no --k-* shape variables found");
  return {
    fonts: { families: t.families, roles: t.roles },
    tokenDefaults: defaults,
    unmappedKVars: unmapped,
    palettes,
    warnings,
  };
}

export function buildComposition(units, reg) {
  const mapped = units.map((u) => ({ ...u, ...mapUnit(u, reg) }));
  const sections = mapped.filter((m) => m.confidence !== "skipped").map((m, order) => ({
    order,
    unit: m.raw,
    confidence: m.confidence,
    kitSlot: m.target?.slot ?? null,
    nodeKind: m.target?.node ?? null,
    shell: m.target?.shell ?? m.target?.chrome ?? null,
    variant: m.target?.variant ?? normaliseUnit(m).variant ?? null,
    note: m.note ?? m.reason ?? "",
  }));
  const counted = sections.filter((s) => !s.shell);
  const n = (c) => counted.filter((s) => s.confidence === c).length;
  const pct = (x) => (counted.length ? Math.round((x / counted.length) * 1000) / 10 : 0);
  return {
    sections,
    homeSlotOrder: sections.filter((s) => s.kitSlot).map((s) => s.kitSlot),
    stats: {
      units: sections.length,
      skippedDynamic: mapped.length - sections.length,
      homeUnits: counted.length,
      exact: n("exact"),
      near: n("near"),
      none: n("none"),
      exactPct: pct(n("exact")),
      exactOrNearPct: pct(n("exact") + n("near")),
    },
  };
}

export function buildTickets(slug, composition, gate) {
  const misses = composition.sections.filter((s) => s.confidence === "none");
  const lines = [`# New-capability tickets: ${slug}`, "", `Unmapped units: ${misses.length} of ${composition.stats.homeUnits} home units.`, ""];
  if (!misses.length) lines.push("None. Every home unit maps to a kit slot or node kind.", "");
  for (const s of misses) {
    const others = gate ? themesNeeding(s.unit, gate).filter((t) => t.toLowerCase() !== slug.toLowerCase().replace(/-/g, " ")) : [];
    const fam = familyOf(s.unit);
    const famCount = gate?.families[fam.toLowerCase()];
    lines.push(
      `## ${s.unit}`,
      "",
      `- Capability family: ${fam}${famCount ? ` (${famCount} themes need this family per the gate)` : ""}`,
      `- Other themes that list this unit: ${others.length ? others.join(", ") : "none found in the gate file"}`,
      "- Build as a kit capability, never inside this design. Never duplicate an existing component; if one nearly exists, add a variant.",
      "- 4-layer checklist:",
      "  - [ ] Schema: block type and props",
      "  - [ ] Renderer: renders from the schema",
      "  - [ ] Inspector: editor controls plus preflight (allowed kinds, known placeholders, unique keys, ES for every literal)",
      "  - [ ] Add-gallery: block shows in the add-section gallery",
      "",
    );
  }
  return lines.join("\n");
}

export function compile(html, { slug, reg, gate }) {
  const tokens = buildTokens(html, reg);
  const composition = buildComposition(extractUnits(html), reg);
  return { tokens, composition, tickets: buildTickets(slug, composition, gate) };
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
    else a._.push(argv[i]);
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args._[0];
  if (!input) {
    console.error("usage: npm run design:compile -- <mockup.html> [--slug <name>] [--out <dir>] [--gate <gate.md>]");
    process.exit(2);
  }
  const file = path.resolve(input);
  const slug = args.slug || path.basename(path.dirname(file));
  const out = path.resolve(args.out || path.join(WEB_ROOT, "design-references", slug, "compiled"));
  const gatePath = args.gate || path.join(os.homedir(), ".claude/plans/design-compiler-gate.md");
  const gate = fs.existsSync(gatePath) ? parseGate(fs.readFileSync(gatePath, "utf8")) : null;
  const reg = loadRegistry(WEB_ROOT);
  const { tokens, composition, tickets } = compile(fs.readFileSync(file, "utf8"), { slug, reg, gate });
  fs.mkdirSync(out, { recursive: true });
  const w = (n, v) => fs.writeFileSync(path.join(out, n), typeof v === "string" ? v : JSON.stringify(v, null, 2) + "\n");
  w("tokens.json", tokens);
  w("composition.json", composition);
  w("tickets.md", tickets.endsWith("\n") ? tickets : tickets + "\n");
  const s = composition.stats;
  console.log(`${slug}: ${s.homeUnits} home units, exact ${s.exact} (${s.exactPct}%), near ${s.near}, none ${s.none}; exact+near ${s.exactOrNearPct}%`);
  for (const wn of tokens.warnings) console.log(`  warning: ${wn}`);
  console.log(`  wrote ${out}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
