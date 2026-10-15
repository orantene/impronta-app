import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-912: service-area chips and the casting group heading are localized", () => {
  const block = read("src/app/t/[profileCode]/_light/ServicesBlock.tsx");
  for (const es of ["Con base en", "Viaja a", "Remoto", "con costo"]) assert.ok(block.includes(es), es);
  assert.ok(!/·\s*fee\s*\n/.test(block));
  const view = read("src/app/t/[profileCode]/profile-view.tsx");
  assert.ok(view.includes("Casting físico"));
});
