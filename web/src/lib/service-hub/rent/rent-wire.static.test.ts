import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ({ f, text: readFileSync(join(dir, f), "utf8") }));
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("rent billing wiring (TUL-1376)", () => {
  test("rent never talks to Stripe directly and never computes or sets a fee", () => {
    for (const { f, text } of sources) {
      const c = code(text);
      assert.doesNotMatch(c, /from "stripe"|getStripe|application_fee|service_fee|commission|feeBps|fee_bps/i, `${f} must not touch Stripe or fees`);
    }
  });

  test("the only way to a payment link is issueRentInvoice, behind the test-mode gate", () => {
    const issue = code(sources.find((s) => s.f === "rent-issue.ts")!.text);
    assert.match(issue, /\(deps\.gate \?\? rentBillingGate\)\(\)/);
    assert.ok(issue.indexOf("rentBillingGate") < issue.indexOf("deps.loadPlan"), "the gate runs before any read");
    const store = code(sources.find((s) => s.f === "rent-store.server.ts")!.text);
    const callers = sources.filter((s) => /\bmintLink\b|createPaymentLink/.test(code(s.text))).map((s) => s.f).sort();
    assert.deepEqual(callers, ["rent-issue.ts", "rent-store.server.ts"]);
    assert.match(store, /createPaymentLink\(admin/);
  });

  test("only the member can make a plan active; the owner cannot activate a proposal", () => {
    const actions = code(sources.find((s) => s.f === "rent-actions.ts")!.text);
    assert.match(actions, /input\.status === "active" && from === "paused" && row\.accepted_at != null/);
    const activeWriters = actions.match(/status: "active"/g) ?? [];
    assert.equal(activeWriters.length, 1, "exactly one place writes status active: the member's accept");
    assert.match(actions, /requireTalentSelf\(\)/);
  });

  test("the safety view selects no client contact column", () => {
    const loader = code(sources.find((s) => s.f === "rent-safety-view.server.ts")!.text);
    assert.doesNotMatch(loader, /email|phone|contact|whatsapp/i);
  });
});
