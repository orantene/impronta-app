#!/usr/bin/env node
/**
 * One fast, targeted parity pass for the fix loop (docs/factory/fix-loop.md).
 *
 *   npm run qa:parity-loop -- --design maison-v2 --demo alba --section menu --width 390
 *     [--base-url http://localhost:3001] [--source code|live] [--mockup-url ...]
 *
 * It runs run.mjs on ONE demo, ONE section and ONE width, static state only, and prints
 * the compact delta list plus what changed since the last pass. Source defaults to `code`
 * (the in-code payload through /template-preview/<design>?...&source=code), so a TS edit
 * is an HMR refresh and a compare. Use --source live to compare the published page instead.
 * Exit code 0 means no open delta (outside the baseline) for that slice.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const o = { design: "maison-v2", demo: "alba", section: null, width: "390", source: "code", pass: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const v = () => argv[++i];
  if (a === "--design") o.design = v();
  else if (a === "--demo") o.demo = v();
  else if (a === "--section" || a === "--sections") o.section = v();
  else if (a === "--width" || a === "--widths") o.width = v();
  else if (a === "--source") o.source = v();
  else if (["--base-url", "--mockup-url", "--locale", "--storage-state"].includes(a)) o.pass.push(a, v());
  else if (a === "--help" || a === "-h") {
    console.log("npm run qa:parity-loop -- --design maison-v2 --demo alba --section menu --width 390 [--source code|live] [--base-url URL]");
    process.exit(0);
  } else { console.error(`unknown flag ${a}`); process.exit(2); }
}
if (!o.section) { console.error("--section is required (header, hero, work, menu, reviews, about, faq, location, footer, socket)"); process.exit(2); }

const args = [join(HERE, "run.mjs"), "--design", o.design, "--talents", o.demo, "--widths", o.width, "--sections", o.section, "--states", "static", "--source", o.source, "--compact", ...o.pass];
const r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status ?? 2);
