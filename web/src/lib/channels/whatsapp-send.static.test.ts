import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const LIB = join(process.cwd(), "src/lib");
const ALLOWED = new Set([
  "src/lib/messaging/channels/whatsapp.ts",
  "src/lib/server-actions/messaging-engine.ts",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

test("nothing under lib/ sends on the WhatsApp adapter except the Messages composer", () => {
  const violations: string[] = [];
  for (const file of walk(LIB)) {
    const rel = file.slice(join(process.cwd(), "").length).replace(/^\//, "");
    const src = readFileSync(file, "utf8");
    const mentions =
      /whatsappAdapter\.send\s*\(/.test(src) ||
      (/messagingChannel\(\s*["']whatsapp["']\s*\)/.test(src) && /\.send\s*\(/.test(src));
    if (!mentions) continue;
    if (ALLOWED.has(rel) || rel.endsWith("src/lib/messaging/channels/whatsapp.ts")) continue;
    if (rel === "src/lib/server-actions/messaging-engine.ts") continue;
    violations.push(rel);
  }
  assert.deepEqual(violations, []);
});
