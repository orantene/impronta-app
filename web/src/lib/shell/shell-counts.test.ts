/**
 * TUL-387 — loadShellCounts surface routing + layout bridge wiring.
 *
 * Unit half injects fake loaders (mock.module is unusable under tsx).
 * Layout half is a source scan: both shells must call loadShellCounts and
 * keep totalUnread === shellCounts.messages.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  loadShellCounts,
  type ShellCountLoaders,
  type ShellCounts,
} from "./shell-counts";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function fakeLoaders(opts: {
  workspace?: number | (() => Promise<number>);
  talent?: number | (() => Promise<number>);
  money?: number;
  attention?: number;
}): ShellCountLoaders {
  const asFn = (v: number | (() => Promise<number>) | undefined, label: string) => {
    if (v === undefined) {
      return async () => {
        throw new Error(`${label} loader must not be called`);
      };
    }
    if (typeof v === "function") return v;
    return async () => v;
  };
  return {
    loadWorkspaceUnread: asFn(opts.workspace, "workspace"),
    loadTalentUnread: asFn(opts.talent, "talent"),
    countUnreadNotifications: async () => ({
      total: (opts.money ?? 0) + (opts.attention ?? 0),
      messages: 0,
      money: opts.money ?? 0,
      attention: opts.attention ?? 0,
      updates: 0,
    }),
  };
}

test("workspace surface routes messages to loadWorkspaceUnread", async () => {
  const counts = await loadShellCounts(
    "workspace",
    { tenantId: "t1" },
    fakeLoaders({ workspace: 7 }),
  );
  assert.deepEqual(counts, {
    messages: 7,
    money: 0,
    attention: 0,
  } satisfies ShellCounts);
});

test("talent surface routes messages to loadTalentUnread", async () => {
  let seen: { talentProfileId: string; tenantId: string } | null = null;
  const counts = await loadShellCounts(
    "talent",
    { tenantId: "t1", talentProfileId: "tp-9" },
    {
      loadWorkspaceUnread: async () => {
        throw new Error("workspace loader must not be called on talent");
      },
      loadTalentUnread: async (talentProfileId, tenantId) => {
        seen = { talentProfileId, tenantId };
        return 3;
      },
    },
  );
  assert.deepEqual(seen, { talentProfileId: "tp-9", tenantId: "t1" });
  assert.deepEqual(counts, { messages: 3, money: 0, attention: 0 });
});

test("talent surface without talentProfileId returns zeros (never throws)", async () => {
  const counts = await loadShellCounts(
    "talent",
    { tenantId: "t1" },
    fakeLoaders({ talent: 99 }),
  );
  assert.deepEqual(counts, { messages: 0, money: 0, attention: 0 });
});

test("empty tenantId returns zeros without calling loaders", async () => {
  const counts = await loadShellCounts(
    "workspace",
    { tenantId: "" },
    fakeLoaders({ workspace: 5 }),
  );
  assert.deepEqual(counts, { messages: 0, money: 0, attention: 0 });
});

test("loader throw returns zeros (never throws into the layout)", async () => {
  const counts = await loadShellCounts(
    "workspace",
    { tenantId: "t1" },
    fakeLoaders({
      workspace: async () => {
        throw new Error("db down");
      },
    }),
  );
  assert.deepEqual(counts, { messages: 0, money: 0, attention: 0 });
});

test("negative / non-finite loader results sanitize to 0 messages", async () => {
  assert.equal(
    (await loadShellCounts("workspace", { tenantId: "t1" }, fakeLoaders({ workspace: -4 })))
      .messages,
    0,
  );
  assert.equal(
    (
      await loadShellCounts(
        "workspace",
        { tenantId: "t1" },
        fakeLoaders({ workspace: Number.NaN }),
      )
    ).messages,
    0,
  );
});

test("money and attention come from countUnreadNotifications (TUL-389)", async () => {
  const counts = await loadShellCounts(
    "workspace",
    { tenantId: "t1" },
    fakeLoaders({ workspace: 12, money: 2, attention: 5 }),
  );
  assert.deepEqual(counts, {
    messages: 12,
    money: 2,
    attention: 5,
  } satisfies ShellCounts);
});

test("notif loader throw leaves money/attention at 0 without blanking messages", async () => {
  const counts = await loadShellCounts("workspace", { tenantId: "t1" }, {
    loadWorkspaceUnread: async () => 4,
    loadTalentUnread: async () => {
      throw new Error("talent unused");
    },
    countUnreadNotifications: async () => {
      throw new Error("notif down");
    },
  });
  assert.deepEqual(counts, { messages: 4, money: 0, attention: 0 });
});

// ── Layout bridge wiring (source scan) ──────────────────────────────────────

test("admin layout loads shellCounts and stamps totalUnread from messages", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/layout.tsx");
  assert.ok(
    /from\s+"@\/lib\/shell\/shell-counts"/.test(src),
    "admin layout must import loadShellCounts",
  );
  assert.ok(
    /loadShellCounts\(\s*"workspace"/.test(src),
    "admin layout must call loadShellCounts for the workspace surface",
  );
  assert.ok(
    /totalUnread:\s*shellCounts\.messages/.test(src),
    "admin layout must keep totalUnread === shellCounts.messages",
  );
  assert.ok(
    /shellCounts,/.test(src) || /shellCounts:\s*shellCounts/.test(src),
    "admin layout must pass shellCounts onto the bridge",
  );
});

test("talent layout no longer hardcodes totalUnread: 0; uses loadShellCounts", () => {
  const src = read("src/app/(workspace)/talent/_talent-layout-inner.tsx");
  // Strip comments so a doc line naming the old hardcode cannot fail the guard.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.ok(
    /from\s+"@\/lib\/shell\/shell-counts"/.test(src),
    "talent layout must import loadShellCounts",
  );
  assert.ok(
    /loadShellCounts\(\s*"talent"/.test(src),
    "talent layout must call loadShellCounts for the talent surface",
  );
  assert.ok(
    /totalUnread:\s*shellCounts\.messages/.test(src),
    "talent layout must keep totalUnread === shellCounts.messages",
  );
  // The bug this card fixes: a literal zero on the bridge.
  assert.ok(
    !/totalUnread:\s*0\b/.test(code),
    "talent layout must not hardcode totalUnread: 0",
  );
  assert.ok(
    /talentUnread:\s*shellCounts\.messages/.test(src),
    "talent layout must set talentUnread from shellCounts.messages for the identity bar",
  );
});

test("BridgeData carries optional shellCounts; context exposes it", () => {
  const bridge = read("src/components/admin/shell/internal/data-bridge.ts");
  assert.ok(
    /shellCounts\?:/.test(bridge),
    "BridgeData must declare optional shellCounts",
  );

  const context = read("src/components/admin/shell/internal/state/context.tsx");
  assert.ok(
    /shellCounts/.test(context),
    "shell context must expose shellCounts for bubble consumers (TUL-388)",
  );
});
