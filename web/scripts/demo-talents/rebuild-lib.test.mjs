import assert from "node:assert/strict";
import test from "node:test";

import { anyFailed, buildRebuildBody, checkBaseUrl, formatRows, parseArgs, parseEnv } from "./rebuild-lib.mjs";

test("default is a dry run on localhost:3005", () => {
  const r = parseArgs([]);
  assert.ok(r.ok);
  assert.equal(r.opts.write, false);
  assert.equal(r.opts.publish, true);
  assert.deepEqual(buildRebuildBody(r.opts), { dryRun: true, publish: true });
});

test("flags parse", () => {
  const r = parseArgs(["--design", "folio", "--only", "TAL-93020,TAL-93011", "--write", "--no-publish", "--base-url=http://127.0.0.1:3000"]);
  assert.ok(r.ok);
  assert.deepEqual(buildRebuildBody(r.opts), { dryRun: false, publish: false, design: "folio", only: ["TAL-93020", "TAL-93011"] });
  assert.equal(r.opts.baseUrl, "http://127.0.0.1:3000");
});

test("bad input is rejected", () => {
  assert.equal(parseArgs(["--design", "nope"]).ok, false);
  assert.equal(parseArgs(["--only", "abc"]).ok, false);
  assert.equal(parseArgs(["--restore", "x"]).ok, false);
  assert.equal(parseArgs(["--wat"]).ok, false);
});

test("base url guard", () => {
  assert.ok(checkBaseUrl("http://localhost:3005", false).ok);
  assert.ok(checkBaseUrl("http://127.0.0.1:3005", false).ok);
  assert.equal(checkBaseUrl("https://app.tulala.digital", false).ok, false);
  assert.equal(checkBaseUrl("http://localhost.evil.com", false).ok, false);
  assert.ok(checkBaseUrl("https://app.tulala.digital", true).ok);
  assert.equal(checkBaseUrl("ftp://localhost", true).ok, false);
  assert.equal(checkBaseUrl("nonsense", true).ok, false);
});

test("env parse", () => {
  const e = parseEnv('# c\nA=1\nexport CRON_SECRET="s e#c"\nB=x # note\n');
  assert.equal(e.A, "1");
  assert.equal(e.CRON_SECRET, "s e#c");
  assert.equal(e.B, "x");
});

test("table and failure exit", () => {
  const rows = [
    { profileCode: "TAL-93020", design: "maison-v2", version: 3, status: "wrote", changed: ["content"], runId: "r1" },
    { profileCode: "TAL-93011", design: "folio", version: null, status: "refused", changed: [], error: "not a demo" },
  ];
  assert.match(formatRows(rows), /TAL-93011\s+folio\s+-\s+refused\s+-\s+not a demo/);
  assert.equal(anyFailed(rows), true);
  assert.equal(anyFailed([rows[0]]), false);
});
