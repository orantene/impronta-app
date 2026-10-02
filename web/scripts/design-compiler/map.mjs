// Maps mockup units and tokens onto the Tulala kit. Registry is read from TS source by regex (pure node).
import fs from "node:fs";
import path from "node:path";

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

/** Read kit slots, builder node kinds, token keys and a variant-evidence corpus from the repo. */
export function loadRegistry(webRoot) {
  const lib = path.join(webRoot, "src/lib");
  const kitSrc = read(path.join(lib, "talent-site/theme-catalog/section-kit.ts"));
  const block = kitSrc.match(/TALENT_KIT_SECTIONS\s*=\s*\{([\s\S]*?)\}\s*as const/);
  const slots = block ? [...block[1].matchAll(/^\s*([a-z_]+)\s*:\s*\{/gm)].map((m) => m[1]) : [];
  const regSrc = read(path.join(lib, "site-admin/builder-node/registry.ts"));
  const nodeKinds = [...new Set([...regSrc.matchAll(/^\s{6}kind:\s*"([a-z_0-9]+)"/gm)].map((m) => m[1]))];
  const tokenKeys = new Set();
  for (const f of walk(path.join(lib, "site-admin/tokens"))) {
    for (const m of read(f).matchAll(/"([a-z]+(?:\.[a-z-]+)+)"/g)) tokenKeys.add(m[1]);
  }
  const corpus = [
    ...walk(path.join(lib, "talent-site/theme-catalog")),
    ...walk(path.join(lib, "site-admin/builder-node")),
    ...walk(path.join(lib, "site-admin/sections")),
  ]
    .map(read)
    .join("\n")
    .toLowerCase();
  return { slots, nodeKinds, tokenKeys, corpus };
}

/** Type words (normalised) -> kit slot / node kind / shell. First match wins. */
const TYPE_RULES = [
  [/^(site[_ ]?header|header)\b/, { shell: "header" }],
  [/^(footer|bottom[_ ]strip)\b/, { slot: "statement_footer" }],
  [/^(selection[_ ]dock|chat[_ ]dock|booking[_ ]sheet|booking conditions|policy[_ ]page)\b/, { chrome: "platform shell" }],
  [/^location[_ ]map\b/, { node: "location_map" }],
  [/^location\b/, { slot: "location" }],
  [/^hero\b/, { slot: "hero" }],
  [/^about\b/, { slot: "about" }],
  [/^(services?[_ ]catalog|services?)\b/, { slot: "services" }],
  [/^(portfolio|gallery)\b/, { slot: "gallery" }],
  [/^contents\b/, { slot: "contents" }],
  [/^visit\b/, { slot: "visit" }],
  [/^reviews?\b/, { slot: "reviews" }],
  [/^comp[_ ]card\b/, { slot: "comp_card" }],
  [/^contact\b/, { slot: "contact" }],
  [/^(statement[_ ]footer|statement)\b/, { slot: "statement_footer" }],
  [/^before[_ -]?after\b/, { slot: "before_after" }],
  [/^aftercare\b/, { slot: "aftercare" }],
  [/^proof\b/, { slot: "proof" }],
  [/^area\b/, { slot: "area" }],
  [/^emergency\b/, { slot: "emergency" }],
  [/^(tasks?|category explorer)\b/, { slot: "tasks" }],
  [/^faq\b/, { node: "accordion" }],
  [/^stats\b/, { node: "stats" }],
  [/^marquee\b/, { node: "marquee" }],
  [/^alert[_ ]band\b/, { node: "alert_band" }],
  [/^(utility[_ ]bar)\b/, { node: "utility_bar" }],
  [/^spec[_ ]table\b/, { node: "spec_table" }],
];

/** Strip gate-style decorations: "W-11 ", "Section preset · ". */
export function normaliseUnit(u) {
  let type = u.type.toLowerCase().replace(/^w-\d+\s+/, "").trim();
  let variant = u.variant;
  if (type === "section preset") {
    const [t, ...v] = variant.split(/\s·\s/);
    type = t.toLowerCase().replace(/^w-\d+\s+/, "").trim();
    variant = v.join(" · ");
  }
  if (/^header shell\b/.test(type)) type = "header";
  return { type, variant };
}

function variantEvidence(variant, corpus) {
  const pieces = variant
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/\s\+\s|,|\/|\s&\s/)
    .map((p) => p.trim().replace(/[^a-z0-9 -]/g, "").trim())
    .filter(Boolean);
  if (!pieces.length) return { pieces, found: 0 };
  const found = pieces.filter((p) => {
    const hy = p.replace(/\s+/g, "-");
    const un = p.replace(/[\s-]+/g, "_");
    return corpus.includes(hy) || corpus.includes(un) || corpus.includes(p.replace(/[\s-]+/g, ""));
  }).length;
  return { pieces, found };
}

/** Map one unit. confidence: exact | near | none | skipped. */
export function mapUnit(unit, reg) {
  if (unit.dynamic) return { confidence: "skipped", reason: "dynamic data-w (template literal); not a static unit" };
  const { type, variant } = normaliseUnit(unit);
  for (const [re, target] of TYPE_RULES) {
    if (!re.test(type)) continue;
    if (target.slot && !reg.slots.includes(target.slot)) continue;
    if (target.node && !reg.nodeKinds.includes(target.node)) continue;
    if (target.shell || target.chrome) {
      return { confidence: "exact", target: { ...target }, note: "shell/platform chrome, not a home section" };
    }
    const ev = variantEvidence(variant, reg.corpus);
    const exact = !variant || (ev.pieces.length > 0 && ev.found === ev.pieces.length);
    return {
      confidence: exact ? "exact" : "near",
      target: { ...target, variant: variant || null },
      note: exact
        ? "type and variant found in kit source"
        : `type matches; variant not found in kit source (${ev.found}/${ev.pieces.length} pieces)`,
    };
  }
  return { confidence: "none", reason: "no kit slot or node kind matches this unit type" };
}

/** Palette -> editor draft look tokens (same keys the built-in Looks write). */
export function paletteToLookTokens(p, fonts = {}) {
  const t = {};
  const put = (k, v) => v && (t[k] = v);
  put("color.background", p.bg);
  put("color.surface-raised", p.surface);
  put("color.line", p.line);
  put("color.ink", p.ink);
  put("color.muted", p.mute);
  put("color.primary", p.accent);
  put("color.accent", p.accent);
  put("color.primary-on", p.on);
  put("typography.heading-font-family", fonts.display);
  put("typography.body-font-family", fonts.body);
  return t;
}

const radiusPreset = (n) => (n === 0 ? "none" : n <= 6 ? "sharp" : n <= 14 ? "soft" : "round");
const px = (v) => (/^-?[\d.]+px$/.test(v || "") ? parseFloat(v) : null);

/** Design tokenDefaults (shape + type) from --k-* vars; unmapped keys are reported, not dropped. */
export function kvarsToTokenDefaults(kvars, reg) {
  const defaults = {};
  const unmapped = {};
  const set = (k, v) => (reg.tokenKeys.has(k) ? (defaults[k] = v) : (unmapped[k] = v));
  if (kvars["--k-btnrad"]) set("button.radius", kvars["--k-btnrad"]);
  if (kvars["--k-rad"]) {
    set("shape.card-radius", kvars["--k-rad"]);
    const n = px(kvars["--k-rad"]);
    if (n !== null) set("radius.scale-preset", radiusPreset(n));
  }
  if (kvars["--k-fdw"]) set("type.display-weight", kvars["--k-fdw"]);
  if (kvars["--k-fdls"]) set("type.display-tracking", kvars["--k-fdls"]);
  const known = new Set(["--k-btnrad", "--k-rad", "--k-fdw", "--k-fdls", "--k-fd", "--k-fb"]);
  for (const [k, v] of Object.entries(kvars)) if (!known.has(k)) unmapped[k] = v;
  return { defaults, unmapped };
}
