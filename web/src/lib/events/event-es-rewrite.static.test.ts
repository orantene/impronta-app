import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveEventPathRewrite, resolveEventPathRouting } from "./event-page-paths";

const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");

describe("Spanish event URL on a Spanish-default tenant", () => {
  it("routing asks for a rewrite onto the /events route", () => {
    const settings = { defaultLocale: "es", publicLocales: ["es", "en"] } as never;
    assert.deepEqual(resolveEventPathRouting({ hostKind: "agency", pathname: "/eventos/x-y", settings }), { kind: "rewrite", to: "/events/x-y" });
    assert.equal(resolveEventPathRewrite("agency", "/eventos/x-y"), "/events/x-y");
  });
  it("proxy actually applies that rewrite when no other rewrite fires (the 404 cause)", () => {
    const start = proxy.indexOf("shouldRewriteLocalePublicPath(originalPathname, effectiveLangSettings) ||");
    assert.ok(start > 0);
    const cond = proxy.slice(start, proxy.indexOf(") {", start));
    assert.match(cond, /eventPathRewrite/);
  });
});
