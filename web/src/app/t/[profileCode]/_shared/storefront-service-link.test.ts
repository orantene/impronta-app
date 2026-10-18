import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { servicePageHrefs } from "@/lib/talent-site/service-page";

const read = (p: string) => readFileSync(join(process.cwd(), "src/app/t/[profileCode]", p), "utf8");

test("TUL-795: a hub service links to its page on the talent's own site address", () => {
  const hrefs = servicePageHrefs(
    [{ id: "3fa91c2b-0000-4000-8000-000000000000", title: "Corte", kind: "service", visibility: "public" }],
    "https://jor.tulala.digital",
  );
  assert.deepEqual(hrefs, { "3fa91c2b-0000-4000-8000-000000000000": "https://jor.tulala.digital/servicio-corte-3fa91c2b" });
});

test("TUL-795: only an absolute site address produces links (the /t/site fallback does not host them)", () => {
  const src = read("_shared/TalentStorefront.tsx");
  assert.match(src, /\/\^https\?:\\\/\\\/\/i\.test\(siteUrl\)/);
});

test("TUL-795: every storefront layout hands the site address to the storefront", () => {
  for (const f of ["_light/LightProfileLayout.tsx", "_noir/NoirProfileLayout.tsx", "_lumen/LumenProfileLayout.tsx", "_atelier/AtelierProfileLayout.tsx"]) {
    assert.match(read(f), /<TalentStorefront[\s\S]{0,200}siteUrl=\{maxSiteUrl\}/, f);
  }
});

test("TUL-795: service rows, package cards and the featured rail carry the detail link", () => {
  const src = read("_shared/StorefrontBody.tsx");
  assert.equal((src.match(/<DetailLink href=\{href\}/g) ?? []).length, 3);
  assert.match(src, /es: "Ver detalle"/);
});
