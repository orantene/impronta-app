/**
 * Read-only completeness audit of the Demo Foundation talents in production.
 * Checks every demo against the workbook and against what the talent's own
 * dashboard counts (the drawer's N/16), then writes audit-live.json and
 * audit-live.md next to the workbook files. Never writes to the database: the
 * client is a read-only proxy that throws on any write.
 *
 * Run (from web/):
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=.env.local scripts/demo-talents/audit-completeness.mts
 * Options: --dir <foundation dir>, --out <dir> (default: the foundation dir), --only TAL-93103,...
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_FOUNDATION_DIR, loadFoundation, selectDemos } from "./foundation-load";
import { UNIVERSAL_FIELD_KEYS } from "./foundation-plan";
import { loadFieldDefs, loadLocationIndex, readOnly, resolveTermIds, assertOutsideRepo } from "./foundation-seed-core";
import { AUDIT_FIELD_KEYS, auditDemo, isPhotoGap, loadAuditData, summarize, type DemoAudit } from "./completeness-core";

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
  if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
    throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
  }
  const dir = opt("--dir") ?? process.env.DEMO_FOUNDATION_DIR ?? DEFAULT_FOUNDATION_DIR;
  const outDir = opt("--out") ?? dir;
  assertOutsideRepo(path.join(outDir, "audit-live.json"));
  const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const demos = selectDemos(loadFoundation({ dir }), only);

  const admin = readOnly(
    createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }),
  );
  const terms = await resolveTermIds(admin, demos.map((d) => d.talentTypeSlug));
  const fieldDefs = await loadFieldDefs(admin, [
    ...UNIVERSAL_FIELD_KEYS,
    ...AUDIT_FIELD_KEYS,
    ...demos.flatMap((d) => Object.keys(d.typeFields)),
  ]);
  const locations = await loadLocationIndex(admin);
  const data = await loadAuditData({ admin, demos, termIds: terms.ids, fieldDefs, locations });

  const statusFile = path.join(dir, "status.json");
  const inStatus = new Set(fs.existsSync(statusFile) ? Object.keys(JSON.parse(fs.readFileSync(statusFile, "utf8"))) : []);
  const rows: (DemoAudit & { in_status_json: boolean })[] = demos.map((d) => ({
    ...auditDemo(d, data, { termIds: terms.ids, locations, fieldDefs }),
    in_status_json: inStatus.has(d.demoId),
  }));
  const summary = summarize(rows);

  const generated = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, "audit-live.json"), JSON.stringify({ generated, target: targetRef, summary, demos: rows }, null, 1));
  fs.writeFileSync(path.join(outDir, "audit-live.md"), markdown(generated, summary, rows, terms.missing));
  console.log(markdown(generated, summary, rows, terms.missing));
}

function markdown(generated: string, s: ReturnType<typeof summarize>, rows: DemoAudit[], missingTerms: string[]): string {
  const line = (k: string, v: number) => `| ${k} | ${v} |`;
  const photo = Object.entries(s.gapCounts).filter(([k]) => isPhotoGap(k));
  const other = Object.entries(s.gapCounts).filter(([k]) => !isPhotoGap(k));
  const out: string[] = [
    `# Demo completeness audit (${generated})`,
    "",
    `Demos in the workbook: ${s.total}. Seeded in the database: ${s.seeded}. Demos with at least one non-photo gap: ${s.nonPhotoGapDemos}.`,
    "The drawer counts 16 sections; 4 stay empty on purpose (Tarifas, Creditos, Archivos, Clientes anteriores), so the ceiling is 12/16.",
    missingTerms.length ? `Unresolved taxonomy slugs: ${missingTerms.join(", ")}` : "",
    "",
    "## Dashboard score histogram (seeded demos)",
    "| Score | Demos |",
    "|---|---|",
    ...Object.entries(s.histogram).map(([k, v]) => line(k, v)),
    "",
    "## Gap counts, non-photo (fixable by class)",
    "| Gap | Demos |",
    "|---|---|",
    ...(other.length ? other.map(([k, v]) => line(k, v)) : ["| none | 0 |"]),
    "",
    "## Gap counts, photos lane",
    "| Gap | Demos |",
    "|---|---|",
    ...(photo.length ? photo.map(([k, v]) => line(k, v)) : ["| none | 0 |"]),
    "",
    "## Worst 10 (most non-photo gaps first)",
    "| Code | Name | Score | Gaps | Non-photo |",
    "|---|---|---|---|---|",
    ...s.worst.map((w) => `| ${w.code} | ${w.name} | ${w.score}/16 | ${w.gaps} | ${w.nonPhoto} |`),
    "",
  ];
  const unseeded = rows.filter((r) => !r.seeded).map((r) => r.code);
  if (unseeded.length) out.push(`Not seeded yet (${unseeded.length}): ${unseeded.join(", ")}`, "");
  return out.join("\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
