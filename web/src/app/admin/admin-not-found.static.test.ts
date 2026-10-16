import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const dir = "src/app/(workspace)/[tenantSlug]/admin";

test("TUL-635: admin segment has its own not-found rendered inside the shell", () => {
  assert.ok(existsSync(`${dir}/not-found.tsx`));
  assert.match(readFileSync(`${dir}/not-found.tsx`, "utf8"), /AdminNotFoundCard/);
  const src = readFileSync(`${dir}/admin-not-found-card.tsx`, "utf8");
  assert.match(src, /from "next\/link"/);
  assert.match(src, /dashboard\.adminNotFound\.back/);
  assert.doesNotMatch(src, /style=\{\{/);
  for (const l of ["en", "es"]) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8"));
    const k = m.dashboard.adminNotFound;
    assert.ok(k.title && k.body && k.back);
    assert.ok(!/—/.test(JSON.stringify(k)));
  }
});

test("TUL-635: a missing client record renders the card inline, never notFound() (shell crash, React #310)", () => {
  const src = readFileSync(`${dir}/clients/[customerId]/page.tsx`, "utf8");
  assert.match(src, /reason === "not_found"\) return <AdminNotFoundCard \/>/);
  assert.doesNotMatch(src, /reason === "not_found"\) notFound\(\)/);
});

test("TUL-635: unmatched admin URLs hit an admin catch-all that renders the card", () => {
  const src = readFileSync(`${dir}/[...missing]/page.tsx`, "utf8");
  assert.match(src, /<AdminNotFoundCard \/>/);
  assert.doesNotMatch(src, /notFound\(\)/);
});
