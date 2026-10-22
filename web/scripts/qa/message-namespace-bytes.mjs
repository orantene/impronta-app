#!/usr/bin/env node
// TUL-1773: bytes of the inline browser-translator payload on a public route, before and after
// the public/admin split. Reads the subtree lists straight out of src/i18n/client-subtrees.ts
// and the catalogs in messages/, so it needs no build. Usage: node scripts/qa/message-namespace-bytes.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(import.meta.dirname, "..", "..");
const src = readFileSync(join(WEB, "src/i18n/client-subtrees.ts"), "utf8");

function list(name) {
  const m = src.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  if (!m) throw new Error(`${name} not found in client-subtrees.ts`);
  return [...m[1].matchAll(/^\s*"([A-Za-z0-9_.]+)",/gm)].map((x) => x[1]);
}
const pub = list("PUBLIC_CLIENT_MESSAGE_SUBTREES");
const admin = list("ADMIN_CLIENT_MESSAGE_SUBTREES");

const bytes = (v) => Buffer.byteLength(JSON.stringify(v));
function pick(cat, paths) {
  const out = {};
  for (const p of paths) {
    const [ns, sub] = p.split(".");
    if (cat[ns]?.[sub] !== undefined) (out[ns] ??= {})[sub] = cat[ns][sub];
  }
  return out;
}

console.log("locale  before(all)  after(public)  admin-only moved  saved");
for (const code of ["en", "es", "fr"]) {
  const cat = JSON.parse(readFileSync(join(WEB, "messages", `${code}.json`), "utf8"));
  const before = bytes(pick(cat, [...pub, ...admin]));
  const after = bytes(pick(cat, pub));
  console.log(`${code}      ${before}      ${after}        ${bytes(pick(cat, admin))}            ${(((before - after) / before) * 100).toFixed(1)}%`);
}
console.log("\nper-subtree (en):");
const en = JSON.parse(readFileSync(join(WEB, "messages", "en.json"), "utf8"));
for (const [label, paths] of [["PUBLIC", pub], ["ADMIN (moved)", admin]]) {
  console.log(label);
  for (const p of paths) {
    const [ns, sub] = p.split(".");
    console.log(`  ${p.padEnd(34)} ${bytes(en[ns]?.[sub])}`);
  }
}
