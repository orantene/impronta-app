#!/usr/bin/env node
/**
 * Replace one user@width slice of a finished sweep with a fresh re-run of that slice.
 *   node scripts/qa/dashboard-sweep/merge.mjs --into <dirA> --from <dirB> --user diego --width 1280
 * Findings, timings, steps and the screenshot folder of <user>-<width> in <dirA> are swapped for those in <dirB>.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderReport } from "./lib.mjs";

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []));
const { into, from, user, width } = a;
if (!into || !from || !user || !width) { console.error("usage: --into <dir> --from <dir> --user <u> --width <w>"); process.exit(2); }
const rd = (d, f) => JSON.parse(readFileSync(join(d, f), "utf8"));
const keep = (x) => !(x.user === user && String(x.width) === String(width));
const A = { findings: rd(into, "findings.json"), data: rd(into, "run-data.json") };
const B = { findings: rd(from, "findings.json"), data: rd(from, "run-data.json") };
const findings = [...A.findings.filter(keep), ...B.findings.filter((x) => !keep(x))];
const SEV = { critical: 0, high: 1, medium: 2, low: 3 };
findings.sort((p, q) => SEV[p.severity] - SEV[q.severity]);
const timings = [...A.data.timings.filter(keep), ...B.data.timings.filter((x) => !keep(x))];
const steps = [...A.data.steps.filter(keep), ...B.data.steps.filter((x) => !keep(x))];
const invalidated = [...(A.data.invalidated || []), ...(B.data.invalidated || [])];
const folder = `${user}-${width}`;
rmSync(join(into, folder), { recursive: true, force: true });
if (existsSync(join(from, folder))) cpSync(join(from, folder), join(into, folder), { recursive: true });
writeFileSync(join(into, "findings.json"), JSON.stringify(findings, null, 2));
writeFileSync(join(into, "run-data.json"), JSON.stringify({ timings, steps, invalidated }, null, 1));
const meta = JSON.parse(readFileSync(join(into, "meta.json"), "utf8").toString?.() || "{}");
meta.summary += ` | slice ${folder} re-run and merged from ${from.split("/").pop()}`;
writeFileSync(join(into, "meta.json"), JSON.stringify(meta));
writeFileSync(join(into, "report.html"), renderReport(findings, timings, steps, { ...meta, invalidated }));
console.log(`merged ${folder}: ${findings.length} findings total`);
