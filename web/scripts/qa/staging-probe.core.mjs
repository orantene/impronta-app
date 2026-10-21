/**
 * Pure core of scripts/qa/staging-probe.mjs (QA-T Q2). READ-ONLY GETs only. `fetch` and the
 * clock are injected so every check is unit-testable; a refused host makes NO request.
 * Output never contains a header value, a gate token, or a key (pk_live_ hits print only
 * the script URL and a redacted marker).
 */
import { PRODUCTION_PROJECT_REF, QA_JOURNEYS_PROJECT_REF } from "../isolated-target-guard.mjs";

export const STAGING_SUFFIX = ".staging.tulala.digital";
export const STAGING_ROOT = "staging.tulala.digital";
export const GATE_HEADER = "x-staging-gate-token";
export const DEFAULTS = {
  hubHost: "staging.tulala.digital",
  appHost: "app.staging.tulala.digital",
  hubSubHost: "hub.staging.tulala.digital",
  wSlug: "hub",
  talentPath: "/t/TAL-93940",
  enPath: "/en/t/TAL-93940",
  postPath: "/w/hub/posts",
  indexNowKeyPath: "/indexnow-key.txt",
  payloadBudgetBytes: 150000,
  coldMs: 2500,
  ttfbMs: 1500,
  bundlePage: "/login",
  // Runaway guard only (TUL-1794): a 68-chunk page was cut at 40 and the staging ref lives in the rest.
  maxScripts: 500,
  demoLabels: ["karla-beltran-demo", "mateo-ferrer-demo", "saul-tapia-ortega-demo"],
};
const PROD_HOSTS = new Set(["tulala.digital", "www.tulala.digital", "app.tulala.digital", "impronta.tulala.digital", "hub.tulala.digital"]);

/** Returns "" when the host is an allowed staging/localhost host, else a reason. */
export function hostRefusal(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || /[\s@\\]/.test(s)) return "empty or malformed host";
  let host = s.replace(/^https?:\/\//, "");
  if (/[/?#]/.test(host)) return "host must not include a path";
  host = host.replace(/:\d+$/, "");
  if (host === "localhost" || host === "127.0.0.1") return "";
  if (PROD_HOSTS.has(host)) return "production host";
  if (host.includes(":")) return "malformed host";
  if (host === STAGING_ROOT) return "";
  if (!host.endsWith(STAGING_SUFFIX)) return "not a *.staging.tulala.digital host";
  const prefix = host.slice(0, host.length - STAGING_SUFFIX.length);
  if (!prefix || !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(prefix)) return "malformed staging host";
  if (/(^|\.)(tulala|digital|impronta)(\.|$)/.test(prefix)) return "lookalike of a production host";
  return "";
}

export function hostBase(host) {
  const h = String(host).trim().toLowerCase().replace(/^https?:\/\//, "");
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h) ? `http://${h}` : `https://${h}`;
}

// ---- HTML helpers (no dotAll flag anywhere) ----
export function titleOf(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].trim() : "";
}
function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? "";
  return out;
}
export function metaContent(html, key) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attrs(tag);
    if ((a.name ?? a.property ?? "").toLowerCase() === key.toLowerCase() || (a.property ?? "").toLowerCase() === key.toLowerCase()) {
      return a.content ?? "";
    }
  }
  return "";
}
export function linkHrefs(html, rel) {
  const out = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const a = attrs(tag);
    if ((a.rel ?? "").toLowerCase() === rel) out.push(a);
  }
  return out;
}
export function jsonLdTypes(html) {
  const types = new Set();
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const t = n["@type"];
    if (typeof t === "string") types.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
    Object.values(n).forEach(walk);
  };
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      walk(JSON.parse(m[1]));
    } catch {
      /* ignore bad JSON-LD; the type is then simply absent */
    }
  }
  return types;
}
export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};
export function scriptUrls(html, base) {
  const out = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']*\/_next\/static\/[^"']*\.js[^"']*)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&"), base).toString();
      if (!out.includes(u)) out.push(u);
    } catch {
      /* skip */
    }
  }
  return out;
}
export const SPANISH_CATEGORY_WORDS = [
  "limpieza", "electricista", "plomero", "peluquería", "peluqueria", "fotógrafo", "fotografo",
  "maquillaje", "reparación", "reparacion", "belleza", "estilista", "jardinería", "jardineria", "cerrajero", "albañil",
];
const PK_LIVE = /pk_live_[A-Za-z0-9_]+/;

/**
 * @param {{ opts: object, fetchImpl: Function, now?: () => number, gateToken?: string, out: (l: string) => void }} deps
 * @returns {Promise<{ code: number, rows: Array<{card:string,name:string,status:"PASS"|"FAIL"|"SKIP",detail:string}> }>}
 */
export async function runProbe({ opts, fetchImpl, now = () => Date.now(), gateToken, out }) {
  const o = { ...DEFAULTS, ...opts };
  for (const h of [o.hubHost, o.appHost, o.hubSubHost]) {
    const why = hostRefusal(h);
    if (why) {
      out(`[staging-probe] refusing host "${String(h).slice(0, 80)}": ${why}. No request made.`);
      return { code: 2, rows: [] };
    }
  }
  const baseHeaders = gateToken ? { [GATE_HEADER]: gateToken } : {};
  const cache = new Map();
  // redirect:"manual": the gate token must never follow a redirect to another origin. A 3xx is a
  // result (status + Location host only). Only a redirect to the SAME host (an allowed staging host)
  // is re-requested explicitly, up to 3 hops, re-sending the token only to that same host.
  const get = async (url, extra = {}) => {
    const t0 = now();
    let cur = url;
    let res;
    let ttfb = 0;
    for (let hop = 0; hop < 4; hop += 1) {
      res = await fetchImpl(cur, { method: "GET", redirect: "manual", headers: { ...baseHeaders, ...extra } });
      if (hop === 0) ttfb = now() - t0;
      if (res.status < 300 || res.status >= 400) break;
      const loc = res.headers && typeof res.headers.get === "function" ? res.headers.get("location") : null;
      let next = null;
      try {
        next = loc ? new URL(loc, cur) : null;
      } catch {
        next = null;
      }
      if (!next || next.hostname !== new URL(cur).hostname || hostRefusal(next.host)) {
        return { status: res.status, text: "", ttfb, total: now() - t0, locationHost: next ? next.hostname : "" };
      }
      cur = next.toString();
    }
    const text = res.status >= 200 && res.status < 300 ? await res.text() : "";
    return { status: res.status, text, ttfb, total: now() - t0 };
  };
  const page = async (url) => {
    if (!cache.has(url)) cache.set(url, get(url).catch((e) => ({ status: 0, text: "", ttfb: 0, total: 0, error: e instanceof Error ? e.message : "error" })));
    return cache.get(url);
  };
  const hub = hostBase(o.hubHost);
  const app = hostBase(o.appHost);
  const rows = [];
  const add = (card, name, ok, detail) => rows.push({ card, name, status: ok === null ? "SKIP" : ok ? "PASS" : "FAIL", detail });
  const guarded = (card, name, fn) =>
    fn().catch((e) => add(card, name, false, `request failed: ${e instanceof Error ? e.message : "error"}`));

  await guarded("TUL-589", "llms.txt", async () => {
    const r = await page(`${hub}/llms.txt`);
    add("TUL-589", "llms.txt served", r.status === 200 && r.text.trim().length > 0, `status ${r.status}, ${r.text.length} bytes`);
  });
  await guarded("TUL-589", "IndexNow key file", async () => {
    const r = await page(`${hub}${o.indexNowKeyPath}`);
    add("TUL-589", "IndexNow key file", r.status === 200 && /^[A-Za-z0-9-]{8,128}$/.test(r.text.trim()), `status ${r.status} at ${o.indexNowKeyPath}`);
  });
  await guarded("TUL-591", "/w SEO tags", async () => {
    const r = await page(`${app}/w/${o.wSlug}`);
    const miss = [];
    if (r.status !== 200) miss.push(`status ${r.status}`);
    else {
      if (!titleOf(r.text)) miss.push("title");
      if (!linkHrefs(r.text, "canonical").length) miss.push("canonical");
      for (const k of ["og:title", "og:description"]) if (!metaContent(r.text, k)) miss.push(k);
    }
    add("TUL-591", `/w/${o.wSlug} title, canonical, og tags`, miss.length === 0, miss.length ? `missing: ${miss.join(", ")}` : "all present");
  });
  await guarded("TUL-591", "sitemap lists /w", async () => {
    const r = await page(`${app}/sitemap.xml`);
    add("TUL-591", "sitemap lists /w page", r.status === 200 && r.text.includes(`/w/${o.wSlug}`), `status ${r.status}`);
  });
  await guarded("TUL-1010", "Posts JSON-LD + hreflang", async () => {
    const r = await page(`${app}${o.postPath}`);
    const types = jsonLdTypes(r.text);
    const hl = linkHrefs(r.text, "alternate").filter((a) => a.hreflang);
    const miss = [];
    if (r.status !== 200) miss.push(`status ${r.status}`);
    if (!types.has("BlogPosting")) miss.push("BlogPosting");
    if (!types.has("FAQPage")) miss.push("FAQPage");
    if (!hl.length) miss.push("hreflang");
    add("TUL-1010", "Posts BlogPosting/FAQPage JSON-LD + hreflang", miss.length === 0, miss.length ? `missing: ${miss.join(", ")}` : "present");
  });
  await guarded("TUL-1273", "services JSON-LD", async () => {
    const r = await page(`${hub}${o.talentPath}`);
    const types = jsonLdTypes(r.text);
    const ok = r.status === 200 && (types.has("Service") || types.has("OfferCatalog"));
    add("TUL-1273", "services JSON-LD on a talent page", ok, `status ${r.status}, types: ${[...types].join(",") || "none"}`);
  });
  for (const label of o.demoLabels) {
    await guarded("TUL-890", label, async () => {
      const host = `${label}${STAGING_SUFFIX}`;
      if (hostRefusal(host)) return add("TUL-890", `${label} host`, false, "refused");
      const r = await page(`https://${host}/`);
      add("TUL-890", `${label} host returns 200`, r.status === 200, `status ${r.status}`);
    });
  }
  await guarded("TUL-858", "EN meta", async () => {
    const r = await page(`${hub}${o.enPath}`);
    const meta = [titleOf(r.text), metaContent(r.text, "description"), metaContent(r.text, "og:title"), metaContent(r.text, "og:description")].join(" ").toLowerCase();
    const hits = SPANISH_CATEGORY_WORDS.filter((w) => meta.includes(w));
    add("TUL-858", "EN meta has no Spanish category words", r.status === 200 && hits.length === 0, r.status !== 200 ? `status ${r.status}` : hits.length ? `found: ${hits.join(", ")}` : "clean");
  });
  await guarded("TUL-1156", "translation payload", async () => {
    const r = await page(`${hub}${o.talentPath}`);
    let bytes = 0;
    const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(r.text))) if (/translations?"?\s*:/i.test(m[1])) bytes += Buffer.byteLength(m[1]);
    add("TUL-1156", "translation payload within budget", r.status === 200 && bytes <= o.payloadBudgetBytes, `status ${r.status}, ${bytes} bytes (budget ${o.payloadBudgetBytes})`);
  });
  await guarded("TUL-1181", "cold render median", async () => {
    const times = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await get(`${hub}${o.talentPath}?_cb=${now()}-${i}`, { "cache-control": "no-cache", pragma: "no-cache" });
      if (r.status !== 200) return add("TUL-1181", "cold-render median of 3", false, `status ${r.status} on request ${i + 1}`);
      times.push(r.total);
    }
    const med = median(times);
    add("TUL-1181", "cold-render median of 3", med <= o.coldMs, `median ${med} ms (limit ${o.coldMs})`);
  });
  await guarded("TUL-554", "speed + SEO sanity", async () => {
    const r = await page(`${hub}/`);
    const miss = [];
    if (r.status !== 200) miss.push(`status ${r.status}`);
    else {
      if (!titleOf(r.text)) miss.push("title");
      if (!metaContent(r.text, "description")) miss.push("description");
      if (!linkHrefs(r.text, "canonical").length) miss.push("canonical");
    }
    if (r.ttfb > o.ttfbMs) miss.push(`TTFB ${r.ttfb} ms > ${o.ttfbMs}`);
    add("TUL-554", "TTFB + title/description/canonical", miss.length === 0, miss.length ? miss.join("; ") : `TTFB ${r.ttfb} ms`);
  });

  // ---- cut checks: served bundle + served release ----
  const shell = await page(`${app}${o.bundlePage}`).catch(() => ({ status: 0, text: "" }));
  await guarded("CUT", "bundle scan", async () => {
    const allUrls = scriptUrls(shell.text, app);
    const urls = allUrls.slice(0, o.maxScripts);
    if (!urls.length) {
      add("CUT", "bundle names fxlank, never prod ref", false, `no /_next/static scripts found (page status ${shell.status})`);
      add("CUT", "bundle has no pk_live_ key", false, "no scripts to scan");
      return;
    }
    let stagingSeen = false;
    const prodHits = [];
    const liveHits = [];
    let unreadable = 0;
    for (const u of urls) {
      const r = await get(u);
      if (r.status !== 200) {
        unreadable += 1;
        continue;
      }
      if (r.text.includes(QA_JOURNEYS_PROJECT_REF)) stagingSeen = true;
      if (r.text.includes(PRODUCTION_PROJECT_REF)) prodHits.push(new URL(u).pathname);
      if (PK_LIVE.test(r.text)) liveHits.push(new URL(u).pathname);
    }
    const scope = `${urls.length - unreadable} of ${allUrls.length} scripts scanned${unreadable ? ` (${unreadable} unreadable)` : ""}`;
    add("CUT", "bundle names fxlank, never prod ref", stagingSeen && prodHits.length === 0,
      `${scope}; staging ref ${stagingSeen ? "present" : "ABSENT"}; prod ref ${prodHits.length ? `FOUND in ${prodHits.join(", ")}` : "absent"}`);
    add("CUT", "bundle has no pk_live_ key", liveHits.length === 0, liveHits.length ? `pk_live_**** found in ${liveHits.join(", ")}` : `${scope}, clean`);
  });
  const served = /sentry-release=([0-9a-f]{40})/.exec(shell.text ?? "")?.[1];
  if (!o.expectSha) add("CUT", "served sentry-release equals --expect-sha", null, "no --expect-sha given");
  else add("CUT", "served sentry-release equals --expect-sha", Boolean(served) && served === String(o.expectSha).toLowerCase(),
    served ? `served ${served.slice(0, 10)}, expected ${String(o.expectSha).slice(0, 10)}` : "no sentry-release in the served HTML");

  const w = Math.max(...rows.map((r) => r.card.length + r.name.length + 3));
  out("card | check | result | detail");
  for (const r of rows) out(`${r.card.padEnd(8)} | ${r.name.padEnd(w - 10)} | ${r.status} | ${r.detail}`);
  const fails = rows.filter((r) => r.status === "FAIL").length;
  out(`[staging-probe] ${rows.length - fails} ok/skip, ${fails} FAIL`);
  return { code: fails ? 1 : 0, rows };
}
