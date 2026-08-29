import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * A server component must never import a value from a `"use client"` module.
 *
 * Next does not hand the server the value; it hands back a client reference
 * proxy. A string constant imported that way stringifies to
 * `function(){throw Error("Attempted to call X from the server ...")}`, which
 * renders as real page content with no error anywhere.
 *
 * This shipped: `/support` and `/help` went to PRODUCTION, in both languages,
 * with every "Email us" link pointing at `mailto:function(){throw Error(...`.
 * tsc, lint, the full test suite and CI were all green, because none of them
 * render a page and read an href. Only opening the page in a browser found it.
 *
 * The guard is deliberately narrow. Importing a client COMPONENT into a server
 * page is normal and correct: Next renders it as a client island. The hazard is
 * only for values that are not components, because those get read rather than
 * rendered. So the rule keys on the name: PascalCase is treated as a component
 * and allowed, anything else (SCREAMING_SNAKE constants, camelCase helpers) is
 * flagged. That is a heuristic, and it is the right one here because a value
 * the server reads is exactly the thing that stringifies into the page.
 */

const MARKETING_APP_DIR = "src/app/(marketing)";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function resolveImport(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = join("src", spec.slice(2));
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, "index.ts")]) {
    try {
      statSync(candidate);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function isClientModule(file: string): boolean {
  const head = readFileSync(file, "utf8").slice(0, 200);
  return /^\s*["']use client["']/m.test(head);
}

test("marketing server pages do not import values from client modules", () => {
  const offenders: string[] = [];

  for (const file of walk(MARKETING_APP_DIR)) {
    const source = readFileSync(file, "utf8");
    // A page carrying "use client" is itself a client component; the hazard
    // only exists in the server direction.
    if (/^\s*["']use client["']/m.test(source.slice(0, 200))) continue;

    for (const m of source.matchAll(/import\s+(?!type\s)\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
      const names = m[1];
      const target = resolveImport(m[2]);
      if (!target || !isClientModule(target)) continue;

      // `import { type Foo }` is erased at compile time and is harmless.
      const valueNames = names
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n && !n.startsWith("type "))
        // PascalCase is a component: rendered, not read. Safe across the
        // boundary and the normal way to use a client island.
        .filter((n) => !/^[A-Z][a-z]/.test(n.split(" as ")[0]!.trim()));
      if (valueNames.length === 0) continue;

      offenders.push(`${file} imports {${valueNames.join(", ")}} from ${m[2]} ("use client")`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `A marketing SERVER page is importing a value out of a "use client" module.\n` +
      `Next hands the server a client reference proxy, not the value: a string\n` +
      `constant renders as function(){throw Error("Attempted to call ...")}.\n` +
      `Move the value into a plain module (see lib/platform/support-contact.ts).\n` +
      offenders.map((o) => `  ${o}`).join("\n"),
  );
});
