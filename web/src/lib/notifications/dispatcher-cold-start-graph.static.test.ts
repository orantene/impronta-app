/**
 * TUL-573: cold starts of 4 to 7 s on rarely hit dashboard routes are CPU spent
 * evaluating the route's server module graph. The dispatcher used to statically
 * import the notification catalog (about 60 React Email templates) and the email
 * channel (Resend and the renderer), so any route that only imported the
 * dispatcher paid for all of it on boot. Static test: walks static imports only
 * (dynamic import() is the sanctioned way to defer), no build needed.
 * Scope: the notification dispatcher only. The Stripe / billing lazy-loads from #3590 are
 * money files and stay with Oran (TUL-573 Blocked part).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const SRC = path.resolve(__dirname, "../..");
const HEAVY = ["@react-email/components", "@react-email/render", "resend", "pdf-lib", "@pdf-lib/fontkit", "stripe"];
const EMAIL_HEAVY = HEAVY.slice(0, 3);
const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveSpec(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const e of EXTS) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

/** package -> first static import chain that reaches it. */
function heavyChains(entry: string): Map<string, string[]> {
  const seen = new Set<string>();
  const found = new Map<string, string[]>();
  const re = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?from\s*)?["']([^"']+)["']/g;
  const walk = (f: string, chain: string[]) => {
    if (seen.has(f)) return;
    seen.add(f);
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(re)) {
      const spec = m[1];
      const pkg = HEAVY.find((h) => spec === h || spec.startsWith(h + "/"));
      if (pkg && !found.has(pkg)) found.set(pkg, [...chain, f].map((p) => path.relative(SRC, p)));
      const r = resolveSpec(spec, f);
      if (r && !r.endsWith(".json")) walk(r, [...chain, f]);
    }
  };
  walk(entry, []);
  return found;
}

test("dispatcher defers the catalog and email channel (no static React Email / Resend)", () => {
  const found = heavyChains(path.join(SRC, "lib/notifications/dispatcher.ts"));
  const leaked = EMAIL_HEAVY.filter((p) => found.has(p)).map((p) => `${p} via ${found.get(p)!.join(" > ")}`);
  assert.deepEqual(leaked, []);
});
