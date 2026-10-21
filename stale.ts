import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { clientChosenTenant, exportedActions, isUseServerFile, SCOPE_RESOLVER, walkSource } from "/private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/449eb3f3-de72-4e70-8135-38419f309f02/scratchpad/wt-1763/web/src/lib/quality/use-server-scan";
const SRC = "/private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/449eb3f3-de72-4e70-8135-38419f309f02/scratchpad/wt-1763/web/src";
const found = new Set<string>();
for (const f of walkSource(SRC)) { const src = readFileSync(f, "utf8"); if (!isUseServerFile(src)) continue;
  for (const a of exportedActions(src)) if (clientChosenTenant(a.params, src) && !SCOPE_RESOLVER.test(a.body)) found.add(`${relative(SRC, f)}:${a.name}`); }
const p = SRC + "/lib/quality/use-server-tenant-param.baseline.json";
const j = JSON.parse(readFileSync(p, "utf8"));
const stale = j.entries.filter((k: string) => !found.has(k));
const fresh = [...found].filter((k) => !j.entries.includes(k));
console.log("stale", stale.length, stale.join("\n"));
console.log("fresh", fresh);
j.entries = j.entries.filter((k: string) => found.has(k));
writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
console.log("now", j.entries.length);
