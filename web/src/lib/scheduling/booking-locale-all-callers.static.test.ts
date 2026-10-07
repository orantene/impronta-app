/**
 * #177 (TUL-93 follow-up): every caller of createInstantBookingAction sends the
 * page language, so the confirmation email matches the page the guest used and
 * not the talent's preferred locale. Source-level guard: a new caller that
 * forgets `locale` fails here.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src");

/** Files allowed to call without `locale`. Must stay empty unless justified. */
const ALLOW_LIST: Record<string, string> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test("#177: every createInstantBookingAction( call passes locale", () => {
  const callers = walk(root).filter((f) =>
    /createInstantBookingAction\(/.test(readFileSync(f, "utf8")),
  );
  const rel = (f: string) => relative(root, f).split("\\").join("/");
  // The definition itself is not a caller.
  const real = callers.filter((f) => !rel(f).endsWith("server-actions/instant-book-action.ts"));
  assert.ok(real.length >= 4, "expected the known booking entry points");
  const missing: string[] = [];
  for (const f of real) {
    const src = readFileSync(f, "utf8");
    const re = /createInstantBookingAction\(\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      let depth = 0;
      let i = m.index + m[0].length - 1;
      const start = i;
      for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) break;
      }
      const body = src.slice(start, i + 1);
      if (!/\blocale\b/.test(body) && !ALLOW_LIST[rel(f)]) missing.push(rel(f));
    }
  }
  assert.deepEqual(missing, [], `callers missing locale: ${missing.join(", ")}`);
});

test("#177: the catalog sheet still forwards its locale (indirect caller)", () => {
  const src = readFileSync(join(root, "components/public-booking/catalog-booking-confirm.ts"), "utf8");
  assert.match(src, /locale: input\.locale,/);
});

test("#177: the allow-list is empty", () => {
  assert.deepEqual(Object.keys(ALLOW_LIST), []);
});
