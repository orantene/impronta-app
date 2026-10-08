/**
 * TUL-52: "Payouts not set up" on Today must lead to the payouts setup drawer
 * (the destination of Money's "Configurar"), never a button that does nothing.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const base = join(process.cwd(), "src/components/admin/shell/internal/talent");

describe("Today payouts row", () => {
  it("routes the not-set-up state to onSetUpPayouts and falls back to non-interactive", () => {
    const agenda = readFileSync(join(base, "agenda/AgendaTodayPage.tsx"), "utf8");
    assert.match(agenda, /notSetUp\s*\n?\s*\?\s*onSetUpPayouts/);
    assert.match(agenda, /<div className="flex w-full items-center gap-2\.5 px-4 py-3 text-left">\{body\}<\/div>/);
  });
  it("TodayPage wires it to the same drawer Money opens", () => {
    const today = readFileSync(join(base, "pages/TodayPage.tsx"), "utf8");
    assert.match(today, /onSetUpPayouts=\{\(\) => openDrawer\("talent-payouts"\)\}/);
    const money = readFileSync(join(process.cwd(), "src/components/talent/money/MoneyHomePage.tsx"), "utf8");
    assert.match(money, /openDrawer\("talent-payouts"\)/);
  });
});
