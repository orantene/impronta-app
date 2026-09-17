import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The proxy matcher in `proxy.ts` skips paths that end in an image
 * extension, so a route handler living at `.../qr.png/route.ts` under a
 * host-gated API prefix (`/api/tickets`) runs WITHOUT the host headers
 * and refuses every request. That shipped once (broken QR in every ticket
 * e-mail). A route segment under those prefixes must not end in one.
 */
const APP = new URL("../../app/api/", import.meta.url).pathname;
const GATED = ["tickets"];
const STATIC_EXT = /\.(svg|png|jpg|jpeg|gif|webp)$/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

test("no host-gated API route segment ends in an image extension", () => {
  const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /svg\|png\|jpg\|jpeg\|gif\|webp/, "the proxy still skips image extensions (else this guard is moot)");
  for (const g of GATED) {
    for (const route of walk(join(APP, g))) {
      const segment = route.split("/").at(-2) ?? "";
      assert.ok(!STATIC_EXT.test(segment), `${route} is skipped by the proxy matcher; drop the extension from the segment`);
    }
  }
});
