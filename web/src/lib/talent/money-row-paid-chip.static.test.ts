import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const rd = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("429: a fully paid Money row says so", () => {
  it("the row's sub-line names paid-in-full when it is not part paid", () => {
    const page = rd("../../components/talent/money/MoneyHomePage.tsx");
    assert.match(page, /isPartPaidRow\(p\) \? ` · \$\{t\("Part paid"\)\}` : ` · \$\{t\("Paid in full"\)\}`/);
  });
  it("es reads 'Pagado'", () => {
    const es = rd("../../components/admin/shell/internal/dashboard-i18n-money-home.ts");
    assert.match(es, /"Paid in full": "Pagado"/);
  });
});
