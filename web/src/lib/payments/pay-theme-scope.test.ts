import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePayThemeVars } from "./pay-theme-scope";

type Rows = {
  agency: Record<string, unknown>;
  lineTalentIds: Array<string | null>;
  pages: Array<{ slug: string; theme: unknown }>;
};

function fake(rows: Rows) {
  return {
    from: (t: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "is", "limit", "neq"]) b[m] = () => b;
      b.eq = () => {
        if (t === "order_lines") return Promise.resolve({ data: rows.lineTalentIds.map((x) => ({ talent_profile_id: x })) });
        return b;
      };
      b.order = () => (t === "talent_pages" ? Promise.resolve({ data: rows.pages, error: null }) : b);
      b.maybeSingle = () => Promise.resolve({ data: t === "agencies" ? rows.agency : null, error: null });
      return b;
    },
  } as never;
}

const HUB = { kind: "hub", plan_tier: "network" };
const design = (tokens: Record<string, string>) => ({ __design: { tokens } });

test("hub order with one talent wears that talent's published tokens, not the hub's", async () => {
  const a = fake({
    agency: HUB,
    lineTalentIds: ["tp1"],
    pages: [{ slug: "home", theme: design({ "color.ink": "#112233" }) }],
  });
  const vars = await resolvePayThemeVars(a, "hub", "o1");
  assert.ok(vars);
  assert.equal(vars["--token-color-ink"], "#112233");
});
test("mixed-talent hub order keeps the host theme (null)", async () => {
  const a = fake({ agency: HUB, lineTalentIds: ["tp1", "tp2"], pages: [] });
  assert.equal(await resolvePayThemeVars(a, "hub", "o1"), null);
});
test("non-hub workspace keeps the host theme (null)", async () => {
  const a = fake({ agency: { kind: "agency", plan_tier: "pro" }, lineTalentIds: ["tp1"], pages: [] });
  assert.equal(await resolvePayThemeVars(a, "t1", "o1"), null);
});
test("talent with no published design keeps the host theme (null)", async () => {
  const a = fake({ agency: HUB, lineTalentIds: ["tp1"], pages: [{ slug: "home", theme: {} }] });
  assert.equal(await resolvePayThemeVars(a, "hub", "o1"), null);
});
