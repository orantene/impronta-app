import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ACCOUNT_TABS, parseAccountTab } from "@/lib/client-account/area-pure";

const src = readFileSync(join(process.cwd(), "src/components/client-account/ClientAccountArea.tsx"), "utf8");

// TUL-729 (QA Batch 11): the client account had no Ayuda / Help entry at all.
test("TUL-729: the client account has a Help tab that renders without any data load", () => {
  assert.ok(ACCOUNT_TABS.includes("help"));
  assert.equal(parseAccountTab("help"), "help");
  assert.equal(parseAccountTab("nonsense"), "visits");
  assert.match(src, /tab === "help"/);
  assert.match(src, /data-testid="client-help"/);
});

test("TUL-729: every Help string exists in en and es, with accents and no em dashes", () => {
  const keys = [
    "tabHelp", "helpTitle", "helpPayQ", "helpPayA", "helpChangeQ", "helpChangeA",
    "helpReceiptQ", "helpReceiptA", "helpAskQ", "helpAskA", "helpOpenMessages",
  ];
  for (const l of ["en", "es"]) {
    const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8"));
    for (const k of keys) {
      const v = m.public.clientAccountArea[k];
      assert.ok(typeof v === "string" && v.length > 0, `${l}.${k}`);
      assert.doesNotMatch(v, /—|–/, `${l}.${k}`);
    }
  }
  const es = JSON.parse(readFileSync(join(process.cwd(), "messages/es.json"), "utf8"));
  assert.equal(es.public.clientAccountArea.tabHelp, "Ayuda");
  assert.match(es.public.clientAccountArea.helpTitle, /¿En qué podemos ayudarte\?/);
});
