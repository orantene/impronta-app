/**
 * TUL-1584: external image URLs from Notion are https-only and never point at a private,
 * link-local, loopback or metadata host; the cron fetches them through safeFetch.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { checkChangelogImageUrl } from "./image-url";

test("https public hosts pass", () => {
  assert.deepEqual(checkChangelogImageUrl("https://images.example.com/a.png"), { ok: true, url: "https://images.example.com/a.png" });
  assert.equal(checkChangelogImageUrl("https://prod-files-secure.s3.us-west-2.amazonaws.com/x.png?X-Amz=1").ok, true);
});

test("other schemes are refused", () => {
  for (const u of ["http://images.example.com/a.png", "ftp://x.test/a.png", "file:///etc/passwd", "data:image/png;base64,AAAA", "javascript:alert(1)"]) {
    const r = checkChangelogImageUrl(u);
    assert.equal(r.ok, false, u);
  }
});

test("private, link-local, loopback and metadata hosts are refused", () => {
  for (const u of [
    "https://169.254.169.254/latest/meta-data",
    "https://127.0.0.1/a.png",
    "https://10.0.0.5/a.png",
    "https://192.168.1.1/a.png",
    "https://[::1]/a.png",
    "https://localhost/a.png",
    "https://db.internal/a.png",
    "https://printer.local/a.png",
  ]) {
    const r = checkChangelogImageUrl(u);
    assert.equal(r.ok, false, u);
    if (!r.ok) assert.equal(r.reason, "blocked_host", u);
  }
});

test("credentials in the URL and garbage are refused", () => {
  assert.equal(checkChangelogImageUrl("https://user:pw@images.example.com/a.png").ok, false);
  assert.equal(checkChangelogImageUrl("not a url").ok, false);
  assert.equal(checkChangelogImageUrl("").ok, false);
});

test("sync checks the URL first and fetches production images through safeFetch", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/changelog/sync.ts"), "utf8");
  assert.match(src, /checkChangelogImageUrl\(src\)/);
  assert.match(src, /from "@\/lib\/security\/safe-fetch"/);
  assert.match(src, /safeFetch\(/);
  assert.match(src, /function fetchImageBytes[\s\S]*safeFetch\(url,/);
  const copy = src.slice(src.indexOf("async function copyImage"));
  assert.ok(copy.indexOf("checkChangelogImageUrl(") < copy.indexOf("fetchImageBytes("), "checked before any request");
});
