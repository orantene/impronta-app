// Pure extractors for the light design compiler. No network, no TS imports.

/** Decode the few entities that appear in data-w values. */
function decode(s) {
  return s.replace(/&middot;/g, "·").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

/** Every data-w unit in document order. Dynamic labels (template literals) are flagged, not guessed. */
export function extractUnits(html) {
  const out = [];
  const re = /data-w\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const raw = decode(m[1]);
    const dynamic = raw.includes("${");
    const [type, ...rest] = raw.split(/\s·\s/);
    out.push({ raw, type: (type || "").trim(), variant: rest.join(" · ").trim(), dynamic, index: out.length });
  }
  return out;
}

/** Balanced-brace slice starting at the "{" at `start`. Ignores braces inside quotes. */
function balanced(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

/** T.palettes = { key: { n, bg, surface, ink, mute, line, accent, on, tint, ... } }. */
export function extractPalettes(html) {
  const at = html.search(/\bpalettes\s*:\s*\{/);
  if (at < 0) return {};
  const body = balanced(html, html.indexOf("{", at));
  if (!body) return {};
  const palettes = {};
  const inner = body.slice(1, -1);
  const entry = /([A-Za-z0-9_]+)\s*:\s*\{/g;
  let m;
  while ((m = entry.exec(inner))) {
    const open = m.index + m[0].length - 1;
    const obj = balanced(inner, open);
    if (!obj) break;
    const fields = {};
    for (const f of obj.matchAll(/([A-Za-z0-9_]+)\s*:\s*(['"])([^'"]*)\2/g)) fields[f[1]] = f[3];
    palettes[m[1]] = fields;
    entry.lastIndex = open + obj.length;
  }
  return palettes;
}

/** Google Fonts link families (name + weight spec). */
export function extractFontFamilies(html) {
  const out = [];
  for (const link of html.matchAll(/fonts\.googleapis\.com\/css2\?([^"'>\s]+)/g)) {
    for (const f of link[1].matchAll(/family=([^&]+)/g)) {
      const [name, spec] = f[1].split(":");
      const family = decodeURIComponent(name.replace(/\+/g, " "));
      if (!out.some((o) => o.family === family)) out.push({ family, spec: spec || "" });
    }
  }
  return out;
}

/** --k-* CSS custom properties from the first declaration of each. */
export function extractKVars(html) {
  const vars = {};
  for (const m of html.matchAll(/(--k-[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    if (!(m[1] in vars)) vars[m[1]] = m[2].trim();
  }
  return vars;
}

const firstFamily = (stack) => (stack || "").split(",")[0].replace(/['"]/g, "").trim();

/** Roles: display (--k-fd), body (--k-fb), label (a loaded family used in an uppercase/tracked rule). */
export function extractFontRoles(html, families, kvars) {
  const display = firstFamily(kvars["--k-fd"]) || null;
  const body = firstFamily(kvars["--k-fb"]) || null;
  let label = null;
  for (const { family } of families) {
    if (family === display || family === body) continue;
    const esc = family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = new RegExp(`\\{[^{}]*font-family\\s*:[^;{}]*${esc}[^{}]*\\}`, "g");
    for (const r of html.matchAll(rule)) {
      if (/text-transform\s*:\s*uppercase|letter-spacing/.test(r[0])) {
        label = family;
        break;
      }
    }
    if (label) break;
  }
  return { display, body, label, stacks: { display: kvars["--k-fd"] || null, body: kvars["--k-fb"] || null } };
}

export function extractTokens(html) {
  const palettes = extractPalettes(html);
  const families = extractFontFamilies(html);
  const kvars = extractKVars(html);
  return { palettes, families, kvars, roles: extractFontRoles(html, families, kvars) };
}
