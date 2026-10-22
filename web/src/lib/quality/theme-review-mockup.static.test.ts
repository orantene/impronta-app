/**
 * TUL-328 / Theme Review mockup bar (TUL-208 G8).
 *
 * Collection designs that ship in the default gallery must keep a pinned Theme
 * Review pack under design-references/. Unfinished designs (solace/mono/frame)
 * carry a developer DRAFT pack for PM review and stay out of
 * FINISHED_GALLERY_SLUGS until the PM approves it and the design gap closes.
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

const DRAFT_PACK_FILES = ["index.html", "kit.js", "README.md", "parity-map.json", "content.json"] as const;

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

test("unfinished collection designs stay hidden with a DRAFT Theme Review pack", () => {
  const finished = finishedGallerySlugs();
  for (const slug of UNFINISHED_COLLECTION) {
    assert.ok(!finished.includes(slug), `${slug}: must not be in FINISHED_GALLERY_SLUGS until PM approval + gaps close`);
    const dir = join(REFS, slug);
    for (const file of DRAFT_PACK_FILES) {
      assert.ok(existsSync(join(dir, file)), `${slug}: draft pack missing ${file}`);
    }
    assert.match(
      readFileSync(join(dir, "README.md"), "utf8"),
      /DRAFT/,
      `${slug}: README.md must mark the pack as DRAFT until the PM approves it`,
    );
    assert.ok(readmeLists(slug), `${slug}: missing row in design-references/README.md`);
  }
});

test("shared review kit.js is identical across every collection pack", () => {
  const slugs = [...FINISHED_COLLECTION, ...UNFINISHED_COLLECTION];
  const kits = slugs.map((slug) => readFileSync(join(REFS, slug, "kit.js")));
  for (let i = 1; i < kits.length; i++) {
    assert.equal(
      kits[i]!.compare(kits[0]!),
      0,
      `${slugs[i]} kit.js must match ${slugs[0]} (shared review kit)`,
    );
  }
});

test("draft packs carry a parity map whose mockup units exist in index.html, and a matching content.json", () => {
  for (const slug of UNFINISHED_COLLECTION) {
    const dir = join(REFS, slug);
    const map = JSON.parse(readFileSync(join(dir, "parity-map.json"), "utf8")) as {
      design: string;
      order: string[];
      sections: Array<{ key: string; unit: string; mockup: string[] }>;
    };
    const content = JSON.parse(readFileSync(join(dir, "content.json"), "utf8")) as {
      design: string;
      profileCode: string;
      services: unknown[];
    };
    const html = readFileSync(join(dir, "index.html"), "utf8");
    assert.equal(map.design, slug);
    assert.equal(content.design, slug);
    assert.match(content.profileCode, /^TAL-\d+$/);
    assert.ok(content.services.length >= 3, `${slug}: content.json lists the demo's services`);
    assert.deepEqual([...map.order].sort(), map.sections.map((s) => s.key).sort(), `${slug}: order matches sections`);
    for (const sec of map.sections) {
      const sel = sec.mockup.find((m) => m.startsWith("[data-w"));
      assert.ok(sel, `${slug}/${sec.key}: a data-w mockup selector`);
      const m = sel!.match(/data-w(\^?)="([^"]+)"/);
      assert.ok(m, `${slug}/${sec.key}: parseable selector ${sel}`);
      assert.ok(html.includes(`data-w="${m![1] ? m![2] : m![2]}`), `${slug}/${sec.key}: data-w "${m![2]}" not in index.html`);
    }
  }
});
