/**
 * looks-evidence.mts — screenshot Looks × business types through the real
 * preview route, at 1440 and 390, for docs/plans/templates/evidence/.
 *
 *   npx tsx scripts/looks-evidence.mts --base http://localhost:3061 \
 *     --out ../docs/plans/templates/evidence --pairs warm:nail-salon,dark:restaurant
 *
 * Signs in with the passwordless dev fixture (`/api/dev/signin`, dev only),
 * then for each pair captures home (header + hero, viewport-height) and one
 * inner page (catalogue) at both widths. Writes an index.md next to the PNGs.
 * Read-only against the app: the preview route never writes to a tenant.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium } from "playwright";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const base = arg("base", "http://localhost:3061").replace(/\/$/, "");
const out = resolve(arg("out", "../docs/plans/templates/evidence"));
const pairs = arg("pairs", "warm:nail-salon,dark:restaurant")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => {
    const [look, type, locale = "es"] = p.split(":");
    return { look, type, locale };
  });
const email = arg("email", "qa-admin@impronta.test");
/** Alternate mode: `--urls "label=/path,label2=/path2"` screenshots real tenant pages instead of Look previews. */
const urls = arg("urls", "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => {
    const i = p.indexOf("=");
    return { label: p.slice(0, i), path: p.slice(i + 1) };
  });
const widths = [1440, 390] as const;
const pages = ["home", "catalogue"] as const;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${base}/api/dev/signin?email=${encodeURIComponent(email)}&next=/`, { waitUntil: "commit", timeout: 120_000 });
await page.waitForLoadState("domcontentloaded", { timeout: 120_000 });

if (urls.length > 0) {
  const dir = join(out, arg("dir", "composed"));
  mkdirSync(dir, { recursive: true });
  const lines = ["# Composed site evidence", "", `Base: ${base} · ${new Date().toISOString()}`, ""];
  for (const { label, path } of urls) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
      await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(800);
      const file = `${label}-${width}.png`;
      await page.screenshot({ path: join(dir, file), fullPage: label !== "home" });
      lines.push(`- ${label} @${width}: ${file} (${path})`);
      console.log(`${label}@${width} → ${file}`);
    }
  }
  writeFileSync(join(dir, "index.md"), lines.join("\n") + "\n");
  await browser.close();
  process.exit(0);
}

const rows: string[] = ["# Looks evidence", "", `Base: ${base} · ${new Date().toISOString()}`, "", "| Look | Type | Page | Width | File | Issues |", "|---|---|---|---|---|---|"];
for (const { look, type, locale } of pairs) {
  for (const role of pages) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
      const url = `${base}/template-preview/${look}?kind=look&type=${encodeURIComponent(type)}&page=${role}&locale=${locale}`;
      await page.goto(url, { waitUntil: "networkidle" });
      const status = await page.locator('[data-testid="look-preview"]').count();
      const issues = status ? (await page.locator('[data-testid="look-preview-context"]').innerText()).match(/\d+ issue\(s\):.*$/)?.[0] ?? "" : "PREVIEW DID NOT RENDER";
      const dir = join(out, `${look}--${type}`);
      mkdirSync(dir, { recursive: true });
      const file = `${role}-${width}.png`;
      await page.screenshot({ path: join(dir, file), fullPage: role !== "home" });
      rows.push(`| ${look} | ${type} | ${role} | ${width} | ${look}--${type}/${file} | ${issues} |`);
      console.log(`${look}/${type}/${role}@${width} → ${file}${issues ? `  (${issues})` : ""}`);
    }
  }
}
writeFileSync(join(out, "index.md"), rows.join("\n") + "\n");
await browser.close();
console.log(`wrote ${out}/index.md`);
