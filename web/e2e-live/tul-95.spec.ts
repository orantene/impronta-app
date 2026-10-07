/**
 * TUL-95 — the QA talent site must serve the current production deployment,
 * not a pinned old build. Done when every production host reports the same
 * Vercel deployment id as tulala.digital.
 */
import { expect, test } from "@playwright/test";
import { PRODUCTION_HOSTS, deploymentId } from "./_live";

test("every production host serves the same deployment", async ({}, info) => {
  test.skip(info.project.name !== "desktop", "host check runs once");
  const ids = await Promise.all(PRODUCTION_HOSTS.map((h) => deploymentId(h)));
  const report = PRODUCTION_HOSTS.map((h, i) => `${h} ${ids[i]}`).join("\n");
  await info.attach("deployment-ids", { body: report, contentType: "text/plain" });
  expect(ids[0], "tulala.digital has no data-dpl-id").toBeTruthy();
  for (const [i, id] of ids.entries()) {
    expect(id, `${PRODUCTION_HOSTS[i]} serves a different deployment`).toBe(ids[0]);
  }
});
