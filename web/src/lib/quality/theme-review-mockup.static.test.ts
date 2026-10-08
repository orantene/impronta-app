/**
 * TUL-328 / Theme Review mockup bar (TUL-208 G8).
 *
 * Collection designs that ship in the default gallery must keep a pinned Theme
 * Review pack under design-references/. Unfinished designs (solace/mono/frame)
 * stay out of FINISHED_GALLERY_SLUGS until Oran pins a real mockup (do not invent).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB = join(HERE, "../../..");
const REFS = join(WEB, "design-references");
const GALLERY_META = join(WEB, "src/lib/talent-site/theme-catalog/gallery-meta.ts");

/** Collection designs that require a Theme Review pack (legacy `maison` seed excluded). */
const FINISHED_COLLECTION = ["maison-v2", "folio", "gridline"] as const;
const UNFINISHED_COLLECTION = ["solace", "mono", "frame"] as const;

const PACK_FILES = [
  "index.html",
  "kit.js",
  "README.md",
  "parity-map.json",
  "content.json",
] as const;

function finishedGallerySlugs(): string[] {
  const src = readFileSync(GALLERY_META, "utf8");
  const m = src.match(/FINISHED_GALLERY_SLUGS[^=]*=\s*\[([^\]]+)\]/);
  assert.ok(m, "FINISHED_GALLERY_SLUGS array not found in gallery-meta.ts");
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
}

function readmeLists(slug: string): boolean {
  const readme = readFileSync(join(REFS, "README.md"), "utf8");
  return readme.includes(`\`${slug}/\``) || readme.includes(`| \`${slug}\``) || new RegExp(`\\|\\s*${slug}\\s*\\|`).test(readme);
}

test("finished collection designs keep a Theme Review mockup pack", () => {
  for (const slug of FINISHED_COLLECTION) {
    const dir = join(REFS, slug);
    assert.ok(existsSync(dir), `${slug}: design-references/${slug}/ missing`);
    for (const file of PACK_FILES) {
      assert.ok(existsSync(join(dir, file)), `${slug}: missing ${file}`);
    }
    assert.ok(readmeLists(slug), `${slug}: missing row in design-references/README.md`);
  }
});

test("unfinished collection designs stay hidden and have no invented Theme Review pack", () => {
  const finished = finishedGallerySlugs();
  for (const slug of UNFINISHED_COLLECTION) {
    assert.ok(!finished.includes(slug), `${slug}: must not be in FINISHED_GALLERY_SLUGS until mockup + gaps close`);
    assert.ok(
      !existsSync(join(REFS, slug)),
      `${slug}: design-references/${slug}/ must not be invented; Oran supplies the Theme Review artifact`,
    );
  }
});

test("shared review kit.js is identical across finished collection packs", () => {
  const hashes = FINISHED_COLLECTION.map((slug) => readFileSync(join(REFS, slug, "kit.js")));
  for (let i = 1; i < hashes.length; i++) {
    assert.equal(
      hashes[i]!.compare(hashes[0]!),
      0,
      `${FINISHED_COLLECTION[i]} kit.js must match ${FINISHED_COLLECTION[0]} (shared review kit)`,
    );
  }
});
