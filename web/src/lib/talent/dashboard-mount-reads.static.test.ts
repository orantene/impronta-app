/**
 * TUL-1274 (P1 re-render): the talent dashboard re-rendered after load.
 *
 * A server action that answers while any cookie was written for the request
 * (a session refresh in the proxy is enough: Next 16 merges the proxy's
 * Set-Cookie into the action's mutable cookies) comes back flagged
 * "revalidated", and the client router refetches the whole RSC tree. The five
 * reads below ran as server actions from mount effects, so every load of
 * Settings / Profile / Today could trigger that refetch (the tab title fell
 * back to the layout title, panels closed, clicks missed).
 *
 * They now read through GET /api/talent/dashboard-reads (a plain fetch is not
 * in the router's action queue and never refreshes the tree). This pins it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const SRC = path.join(process.cwd(), "src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

const MOUNT_READERS: Array<{ file: string; action: string }> = [
  {
    file: "components/admin/shell/internal/talent/pages/SettingsPage.tsx",
    action: "loadWebsiteSettingsEnabledAction",
  },
  { file: "components/talent/connections/TalentInstagramCard.tsx", action: "loadTalentInstagramCardAction" },
  { file: "components/talent/site/TalentSiteActivateNudge.tsx", action: "loadTalentSiteActivationStateAction" },
  { file: "components/talent/website-reward/useWebsiteFlow.ts", action: "loadTalentSiteActivationStateAction" },
  { file: "components/talent/website-reward/useVerifiedLiveBadge.ts", action: "loadMySiteLiveVerifiedAction" },
  // The Today/website pill, mounted on every talent page, ran the same verified read.
  { file: "components/talent/website-reward/WebsiteRewardControl.tsx", action: "loadMySiteLiveVerifiedAction" },
];

for (const { file, action } of MOUNT_READERS) {
  test(`TUL-1274: ${path.basename(file)} does not call ${action} (a server action) on mount`, () => {
    const src = read(file);
    assert.equal(
      new RegExp(`\\b${action}\\b`).test(src),
      false,
      `${file} still references ${action}; read it with readTalentDashboard() instead`,
    );
  });

  test(`TUL-1274: ${path.basename(file)} reads through the GET dashboard-reads helper`, () => {
    const src = read(file);
    assert.match(src, /from "@\/lib\/talent\/dashboard-reads"/);
    assert.match(src, /\breadTalentDashboard\(/);
  });
}

test("TUL-1274: the dashboard-reads route is a GET handler that calls the same session-guarded readers", () => {
  const src = read("app/api/talent/dashboard-reads/route.ts");
  assert.match(src, /export async function GET\(/);
  assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)\(/);
  for (const { action } of MOUNT_READERS) assert.match(src, new RegExp(`\\b${action}\\b`));
  assert.match(src, /no-store/);
});

test("TUL-1274: the client helper never imports a server module at runtime", () => {
  const src = read("lib/talent/dashboard-reads.ts");
  for (const line of src.split("\n").filter((l) => /^import\s/.test(l))) {
    assert.match(line, /^import type /, `runtime import in dashboard-reads.ts: ${line}`);
  }
});
