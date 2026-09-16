/**
 * acceptance-run.mts — compose every acceptance case on the QA tenant with
 * two Looks each, screenshot header+hero and one inner page at 1440 and 390,
 * and roll up cost per site from cms_ai_usage_log (Templates & Imagery §5).
 *
 *   npx tsx scripts/acceptance-run.mts --base http://localhost:3061 \
 *     --tenant tpl-qa-studio --out ../docs/plans/templates/evidence/acceptance \
 *     [--only C01,C06,F3] [--looks warm,dark]
 *
 * Uses /api/dev/compose-site (dev only, signed in as the QA fixture, staff of
 * the QA tenant). Writes JPEGs (quality 55) to keep the evidence folder small,
 * plus acceptance.json and index.md. Never touches a real tenant.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium, type Page } from "playwright";

import { DEFAULT_LOOK_BY_FAMILY } from "../src/lib/site-admin/builder-core/site-templates/look-defaults";
import { BUSINESS_TYPES } from "../src/lib/words/business-types";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const base = arg("base", "http://localhost:3061").replace(/\/$/, "");
const tenant = arg("tenant", "tpl-qa-studio");
const out = resolve(arg("out", "../docs/plans/templates/evidence/acceptance"));
const only = arg("only", "").split(",").map((s) => s.trim()).filter(Boolean);
const forcedLooks = arg("looks", "").split(",").map((s) => s.trim()).filter(Boolean);
const email = arg("email", "qa-admin@impronta.test");

type Case = { id: string; type: string; name: string; city?: string; services?: string[]; staff?: number; hours?: string[]; whatsapp?: string; years?: number; industry?: string; note?: string };
const cases = (JSON.parse(readFileSync(resolve("scripts/acceptance-cases.json"), "utf8")) as { cases: Case[] }).cases.filter((c) => only.length === 0 || only.includes(c.id));

const ALT_LOOK: Record<string, string> = { warm: "minimal", editorial: "bold", coastal: "classic", bold: "studio", night: "dark", classic: "playful", playful: "coastal", studio: "editorial", minimal: "warm", dark: "night" };
const FAMILY = new Map(BUSINESS_TYPES.map((t) => [t.id, t.family] as const));

function factsFor(c: Case) {
  const facts: Array<{ factKey: string; value: unknown }> = [
    { factKey: "business.name", value: c.name },
    { factKey: "work.industry", value: c.industry ?? c.type },
  ];
  if (c.city) facts.push({ factKey: "person.city", value: c.city });
  if (c.services) facts.push({ factKey: "work.services", value: c.services });
  if (c.staff) facts.push({ factKey: "business.has_staff", value: true }, { factKey: "business.staff_count", value: c.staff });
  if (c.hours) facts.push({ factKey: "business.hours", value: c.hours });
  if (c.whatsapp) facts.push({ factKey: "presence.whatsapp", value: c.whatsapp });
  if (c.years) facts.push({ factKey: "work.years_experience", value: c.years });
  return facts;
}

const HREF: Record<string, string> = { dining: "/menu", fitness: "/clases", education: "/clases", events: "/espacios", hospitality: "/espacios", tours: "/tours" };

async function shot(page: Page, url: string, file: string, width: number, fullPage: boolean) {
  await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: file, type: "jpeg", quality: 55, fullPage });
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/api/dev/signin?email=${encodeURIComponent(email)}&next=/`, { waitUntil: "commit", timeout: 120_000 });
await page.waitForLoadState("domcontentloaded", { timeout: 120_000 });

type Row = { id: string; type: string; family: string; look: string; outcome: string; copySource: string; picks: { owner: number; stock: number; none: number }; durationMs: number; costUsd: number; calls: number; failed: number; notes: string[]; siteComposeId: string; shots: string[] };
// Resume: a run that died keeps its finished rows (the harness is ~50 min for 102 sites).
const previous = existsSync(join(out, "acceptance.json")) ? (JSON.parse(readFileSync(join(out, "acceptance.json"), "utf8")) as Row[]) : [];
const rows: Row[] = previous.filter((r) => r.outcome !== "failed" && !r.outcome.startsWith("http") && r.shots.length === 4);
const done = new Set(rows.map((r) => `${r.id}|${r.look}`));

for (const c of cases) {
  const family = FAMILY.get(c.type) ?? "custom";
  const looks = forcedLooks.length > 0 ? forcedLooks : [DEFAULT_LOOK_BY_FAMILY[family as keyof typeof DEFAULT_LOOK_BY_FAMILY], ALT_LOOK[DEFAULT_LOOK_BY_FAMILY[family as keyof typeof DEFAULT_LOOK_BY_FAMILY]]];
  for (const look of looks) {
    if (done.has(`${c.id}|${look}`)) continue;
    const started = Date.now();
    const res = await page.evaluate(
      async ({ body }) => {
        const r = await fetch("/api/dev/compose-site", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: r.status, json: await r.json().catch(() => null) };
      },
      { body: { tenantSlug: tenant, lookId: look, publish: true, overwrite: true, resetFacts: true, facts: factsFor(c) } },
    );
    const j = (res.json ?? {}) as { outcome?: string; copySource?: string; imagePicks?: Row["picks"]; durationMs?: number; costUsd?: number; notes?: string[]; siteComposeId?: string; family?: string };
    const dir = join(out, `${c.id}--${c.type}--${look}`);
    mkdirSync(dir, { recursive: true });
    const shots: string[] = [];
    if (res.status === 200 && j.outcome && j.outcome !== "failed") {
      const inner = HREF[family] ?? "/servicios";
      for (const [label, path, full] of [["home", `/${tenant}`, false], ["inner", `/${tenant}${inner}`, true]] as const) {
        for (const w of [1440, 390] as const) {
          const file = join(dir, `${label}-${w}.jpg`);
          await shot(page, `${base}${path}`, file, w, full);
          shots.push(`${c.id}--${c.type}--${look}/${label}-${w}.jpg`);
        }
      }
    }
    rows.push({ id: c.id, type: c.type, family: j.family ?? family, look, outcome: res.status === 200 ? (j.outcome ?? "failed") : `http ${res.status}`, copySource: j.copySource ?? "-", picks: j.imagePicks ?? { owner: 0, stock: 0, none: 0 }, durationMs: j.durationMs ?? Date.now() - started, costUsd: j.costUsd ?? 0, calls: 0, failed: 0, notes: j.notes ?? [], siteComposeId: j.siteComposeId ?? "", shots });
    console.log(`${c.id} ${c.type} ${look}: ${rows[rows.length - 1].outcome} ${j.copySource ?? ""} ${j.durationMs ?? "?"}ms $${(j.costUsd ?? 0).toFixed(4)}`);
    writeFileSync(join(out, "acceptance.json"), JSON.stringify(rows, null, 2));
  }
}

// Cost roll-up after the run, so timed-out copy calls that landed late are counted.
const ids = rows.map((r) => r.siteComposeId).filter(Boolean);
const costs = (await page.evaluate(async (list) => (await fetch(`/api/dev/compose-site?ids=${list.join(",")}`)).json(), ids)) as Record<string, { calls: number; failed: number; costUsd: number }>;
for (const r of rows) {
  const c = costs[r.siteComposeId];
  if (c) {
    r.costUsd = c.costUsd;
    r.calls = c.calls;
    r.failed = c.failed;
  }
}
writeFileSync(join(out, "acceptance.json"), JSON.stringify(rows, null, 2));

const total = rows.reduce((n, r) => n + r.costUsd, 0);
const byOutcome = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.outcome]: (m[r.outcome] ?? 0) + 1 }), {});
const md = [
  "# Acceptance run",
  "",
  `Base ${base} · tenant ${tenant} · ${new Date().toISOString()} · ${rows.length} sites`,
  "",
  `Outcomes: ${Object.entries(byOutcome).map(([k, v]) => `${k} ${v}`).join(" · ")} · model copy ${rows.filter((r) => r.copySource === "model").length}/${rows.length} · total cost $${total.toFixed(4)} · mean $${(total / Math.max(1, rows.length)).toFixed(4)} · mean ${Math.round(rows.reduce((n, r) => n + r.durationMs, 0) / Math.max(1, rows.length))} ms · max ${Math.max(...rows.map((r) => r.durationMs))} ms`,
  "",
  "| Case | Type | Look | Outcome | Copy | Images (owner/stock/none) | ms | Calls (failed) | Cost $ | Notes |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${r.type} | ${r.look} | ${r.outcome} | ${r.copySource} | ${r.picks.owner}/${r.picks.stock}/${r.picks.none} | ${r.durationMs} | ${r.calls} (${r.failed}) | ${r.costUsd.toFixed(4)} | ${r.notes.filter((n) => !/^locale /.test(n)).join("; ")} |`),
  "",
  "Screenshots: `<case>--<type>--<look>/home-{1440,390}.jpg` (header + hero, viewport) and `inner-{1440,390}.jpg` (catalogue page, full).",
];
writeFileSync(join(out, "index.md"), md.join("\n") + "\n");
await browser.close();
console.log(`\n${rows.length} sites · $${total.toFixed(4)} total · ${out}/index.md`);
