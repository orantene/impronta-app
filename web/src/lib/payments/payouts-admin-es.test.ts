import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

const DIR = join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/payouts");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");

function dig(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, k) => (cur as Record<string, unknown> | undefined)?.[k], o);
}

test("TUL-1800: every admin.payouts key used by the payouts surface exists in en and es, and es differs", () => {
  const files = ["payouts-actions-client.tsx", "payouts-section-client.tsx", "base-fee-client.tsx"];
  const keys = new Set<string>();
  for (const f of files) {
    for (const m of read(f).matchAll(/"(admin\.payouts\.[A-Za-z.]+)"/g)) keys.add(m[1]);
  }
  assert.ok(keys.size >= 30, `expected many keys, found ${keys.size}`);
  for (const k of keys) {
    const e = dig(en, k);
    const s = dig(es, k);
    assert.equal(typeof e, "string", `en missing ${k}`);
    assert.equal(typeof s, "string", `es missing ${k}`);
    assert.doesNotMatch(String(s), /—/, `em dash in es ${k}`);
  }
});

test("TUL-1800: the payouts surface no longer hard-codes its English labels", () => {
  const all = ["payouts-actions-client.tsx", "payouts-section-client.tsx", "base-fee-client.tsx"].map(read).join("\n");
  for (const literal of [
    "Onboarding incomplete",
    "Not connected",
    "Card charges enabled",
    "Last synced:",
    "How payouts work",
    "Done for now",
    "Select your country",
    "Booking reservation fee",
    "Save fee",
  ]) {
    assert.ok(!all.includes(literal), `still hard-coded: ${literal}`);
  }
  // The actions component must be told the viewer's language.
  assert.match(read("payouts-section-client.tsx"), /locale=\{locale\}/);
});
