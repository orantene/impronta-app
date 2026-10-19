import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { jsonLdToString } from "./talent-json-ld";
import { faqJsonLdToString } from "./faq-json-ld";
import { breadcrumbJsonLdToString } from "./breadcrumb-json-ld";
import { articleJsonLdToString } from "./article-json-ld";
import { jsonLdScriptString } from "./json-ld-script";

const EVIL = { "@type": "Person", name: "</script><script>alert(1)</script>" };

/** Services Phase 0 item 3: nothing a user typed may close the ld+json script tag. */
test("every shared JSON-LD stringifier escapes `<` so a name cannot close the script tag", () => {
  for (const out of [
    jsonLdToString(EVIL as never),
    faqJsonLdToString(EVIL as never),
    breadcrumbJsonLdToString(EVIL as never),
    articleJsonLdToString(EVIL as never),
    jsonLdScriptString(EVIL),
  ]) {
    assert.ok(!out.includes("</script"), out);
    assert.ok(!out.includes("<"), out);
    assert.deepEqual(JSON.parse(out), EVIL, "escaping must round-trip");
  }
});

test("maxSiteJsonLdString (talent sites) uses the escaping helper", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/server/site-metadata.ts"), "utf8");
  const fn = src.slice(src.indexOf("export function maxSiteJsonLdString"));
  assert.match(fn.slice(0, 300), /jsonLdScriptString\(seo\.jsonLd\)/);
});

function walk(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) acc.push(p);
  }
  return acc;
}

test("no JSON-LD emitter stringifies without escaping `<`", () => {
  const root = join(process.cwd(), "src");
  const offenders: string[] = [];
  for (const f of walk(root)) {
    if (f.endsWith("seo/json-ld-script.ts")) continue;
    const src = readFileSync(f, "utf8");
    if (!/ld\+json|JsonLd\w*ToString|jsonLdDocumentToScript|maxSiteJsonLdString|jsonLdScript/.test(src)) continue;
    src.split("\n").forEach((line, i) => {
      if (!/JSON\.stringify\(/.test(line)) return;
      // the editor text (pretty printed, never inside a script tag) is exempt
      if (/JSON\.stringify\([^)]*,\s*null,\s*2\)/.test(line)) return;
      if (/\.replace\(\/<\/g/.test(line)) return;
      // only lines that feed a script payload matter
      const ctx = src.split("\n").slice(Math.max(0, i - 6), i + 1).join("\n");
      if (!/JsonLd|jsonLd|json-ld|ld\+json/.test(ctx)) return;
      offenders.push(`${f.replace(root, "src")}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});
