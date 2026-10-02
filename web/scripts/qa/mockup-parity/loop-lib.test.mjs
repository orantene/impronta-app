import test from "node:test";
import assert from "node:assert/strict";
import { buildRunArgs, parseLoopArgs, productUrl } from "./loop-lib.mjs";

test("defaults and a full arg set", () => {
  const r = parseLoopArgs(["--section", "hero"]);
  assert.equal(r.ok, true);
  assert.deepEqual([r.opts.design, r.opts.demo, r.opts.width, r.opts.source, r.opts.baseUrl], ["folio", "mateo", "390", "code", "http://localhost:3005"]);
  const f = parseLoopArgs(["--design", "folio", "--demo", "mateo", "--section", "menu", "--width", "1440", "--source", "draft", "--base-url", "http://localhost:3001"]);
  assert.equal(f.opts.source, "draft");
  assert.equal(f.opts.width, "1440");
});
test("rejects missing section, bad width, bad source, unknown flag", () => {
  assert.equal(parseLoopArgs([]).ok, false);
  assert.equal(parseLoopArgs(["--section", "a", "--width", "800"]).ok, false);
  assert.equal(parseLoopArgs(["--section", "a", "--source", "staging"]).ok, false);
  assert.equal(parseLoopArgs(["--section", "a", "--nope"]).ok, false);
});
test("run args are one section, one width, static, cached auth", () => {
  const { opts } = parseLoopArgs(["--section", "hero", "--width", "360"]);
  const a = buildRunArgs("run.mjs", opts, "c.json");
  assert.equal(a[a.indexOf("--sections") + 1], "hero");
  assert.equal(a[a.indexOf("--widths") + 1], "360");
  assert.equal(a[a.indexOf("--states") + 1], "static");
  assert.equal(a[a.indexOf("--auth-cache") + 1], "c.json");
});
test("product URL per source", () => {
  const base = { baseUrl: "http://localhost:3005", design: "folio", locale: "es" };
  const t = { id: "abc", demoKey: "mateo-ferrer" };
  assert.equal(productUrl({ ...base, source: "live" }, t), "http://localhost:3005/template-preview/live?kind=live-site&talent=abc&locale=es");
  assert.equal(productUrl({ ...base, source: "draft" }, t), "http://localhost:3005/template-preview/folio?kind=talent-theme&demo=folio:mateo-ferrer&source=draft&locale=es");
  assert.match(productUrl({ ...base, source: "code" }, t), /source=code/);
});
