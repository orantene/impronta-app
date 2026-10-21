import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

/**
 * TUL-1744: an exported function in a "use server" file is a public endpoint, and its ARGUMENTS come
 * from the client. So it must not take things that decide trust: a test seam (`deps`), a database
 * client, a clock (`now`), or a function. Those belong in a plain (non-"use server") module that the
 * action calls with no arguments, or in a non-exported helper.
 *
 * Found by the consultant on #4341 (`loadVisiblePicksLink(deps?)`); the sweep that followed also
 * found `applyParsedMenu(admin, tenantId, menu)`, `processRosterImportRow(admin, tenantId, row)`,
 * `seedNewPageStarterComposition({ supabase, tenantId, ... })` and `markBookingNoShow({ now })`.
 */

const SRC = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** True when the file's directive prologue says "use server" (comments and blank lines may precede it). */
function isUseServerFile(src: string): boolean {
  const head = src.replace(/^\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n|\s)*/, "");
  return /^["']use server["']/.test(head);
}

/** Parameter lists of every exported function, balanced across nested parentheses and braces. */
function exportedSignatures(src: string): Array<{ name: string; params: string }> {
  const out: Array<{ name: string; params: string }> = [];
  const re = /export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      const ch = src[i++];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
    }
    out.push({ name: m[1], params: src.slice(re.lastIndex, i - 1) });
  }
  return out;
}

const INJECTABLE = [
  [/\bdeps\b|Deps\b|\bseams?\b/i, "a test seam / deps parameter"],
  [/SupabaseClient|createServiceRoleClient|\b(?:admin|supabase|client|db)\??\s*:/, "a database client"],
  [/\bnow\??\s*:|\bclock\??\s*:|:\s*Date\b/, "a clock"],
  [/=>\s*(?:Promise|void|boolean|string|number)\b|\bFunction\b/, "a function"],
] as const;

/** Exports that are allowed to look like this, with the reason. Keep empty unless a reason is real. */
const ALLOWED: Record<string, string> = {};

describe('exported "use server" functions take no injectable parameters (TUL-1744)', () => {
  const files = walk(SRC)
    .filter((f) => isUseServerFile(readFileSync(f, "utf8")))
    .map((f) => relative(SRC, f));

  it("finds the use-server files (the scan is not empty)", () => {
    assert.ok(files.length > 100, `only ${files.length} use-server files found; detection is broken`);
  });

  it("none exports a function that takes a seam, a client, a clock or a function", () => {
    const bad: string[] = [];
    for (const rel of files) {
      for (const sig of exportedSignatures(readFileSync(join(SRC, rel), "utf8"))) {
        const hit = INJECTABLE.find(([re]) => re.test(sig.params));
        if (hit && !ALLOWED[`${rel}:${sig.name}`]) bad.push(`${rel}: ${sig.name}(${sig.params.replace(/\s+/g, " ").slice(0, 90)}) takes ${hit[1]}`);
      }
    }
    assert.deepEqual(
      bad,
      [],
      'exported "use server" functions take their arguments from the client. Move the implementation into a plain module (import "server-only") and have the action call it with no injectable argument, or make the helper non-exported.',
    );
  });

  it("the five fixed exports are no longer actions, or no longer take the argument", () => {
    const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
    assert.ok(!isUseServerFile(read("lib/site-admin/edit-mode/new-page-starter.ts")));
    assert.ok(!/export async function applyParsedMenu/.test(read("lib/menu-import/import-actions.ts")));
    assert.ok(!/export async function processRosterImportRow/.test(read("lib/server-actions/roster-import.ts")));
    for (const plain of ["lib/menu-import/apply-parsed-menu.ts", "lib/server-actions/roster-import-row.ts"]) {
      const s = read(plain);
      assert.ok(!isUseServerFile(s), plain);
      assert.match(s, /^import "server-only";/, plain);
    }
    const booking = read("lib/talent-agenda/booking-actions.ts");
    const fn = booking.slice(booking.indexOf("export async function markBookingNoShow"), booking.indexOf("export async function completeBooking"));
    assert.ok(!/now\??:/.test(fn.split("{")[1] ?? ""));
    assert.match(fn, /const now = new Date\(\);/);
    assert.ok(!/input\.now/.test(fn));
  });
});
