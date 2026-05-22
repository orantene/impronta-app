import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { test } from "node:test";

import { getSectionMeta, listSectionMetaKeys } from "./section-meta-registry";

const SECTION_DIR = new URL("./", import.meta.url);

function listFilesystemSectionKeys(): string[] {
  return readdirSync(SECTION_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(new URL(`${name}/meta.ts`, SECTION_DIR)))
    .sort();
}

test("lightweight section metadata registry covers every section meta file", () => {
  assert.deepEqual(listSectionMetaKeys(), listFilesystemSectionKeys());
});

test("lightweight section metadata registry exposes real labels without editors", () => {
  assert.equal(getSectionMeta("hero")?.label, "Hero");
  assert.equal(getSectionMeta("cta_banner")?.label, "CTA banner");
  assert.equal(getSectionMeta("gallery_strip")?.label, "Gallery strip");
  assert.equal(getSectionMeta("unknown"), null);
});

/** Builder convergence §3 — default operators see the curated starter set before "Advanced". */
test("default-tier section count stays at the curated picker budget", () => {
  let defaultTier = 0;
  for (const key of listSectionMetaKeys()) {
    if (getSectionMeta(key)?.inDefault) defaultTier += 1;
  }
  assert.equal(defaultTier, 16);
});
