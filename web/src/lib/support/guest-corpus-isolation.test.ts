import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { insightRowsToCorpus } from "./help-corpus";
import { buildGuestCorpus } from "./guest-corpus";

test("confirmed-insight content never reaches a guest prompt", () => {
  const guest = buildGuestCorpus("en");
  const poison = insightRowsToCorpus([
    {
      id: "secret-insight",
      summary: "PAYOUTS_FROZEN_TENANT_INCIDENT unique marker",
      root_cause: "private agency incident",
      product_area: "payouts",
    },
  ]);
  const hay = guest.map((e) => `${e.slug} ${e.purpose}`).join(" ");
  assert.equal(hay.includes("PAYOUTS_FROZEN_TENANT_INCIDENT"), false);
  assert.equal(
    poison.some((e) => e.purpose.includes("PAYOUTS_FROZEN_TENANT_INCIDENT")),
    true,
  );
  assert.equal(
    guest.some((e) => e.category === "past confirmed resolution"),
    false,
  );
});

test("guest AI route source never imports loadConfirmedInsightCorpus", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    join(here, "../../app/api/ai/guest-support-chat/route.ts"),
    "utf8",
  );
  assert.equal(src.includes("loadConfirmedInsightCorpus"), false);
  assert.equal(src.includes("insightRowsToCorpus"), false);
});
