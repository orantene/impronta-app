/**
 * notification-drawer-targets.static.test.ts — every `targetDrawer` string
 * emitted anywhere in `src/` must open a REAL drawer.
 *
 * Why a static test (execution-plan-2026-08-15 §1 P0-2): notifications store a
 * free-form `target_drawer` string that the shell feeds straight into
 * `DrawerSwitch`. The switch has a `default:` arm that renders the friendly
 * "Coming up next" stub, so a typo'd or never-implemented id fails SILENTLY —
 * it looks like a deliberate placeholder, not a bug. Two media-ownership
 * notifications shipped that way and landed both halves of the two-key release
 * flow on the stub.
 *
 * Nothing at runtime can catch this: the ids are strings on both sides, the
 * cast at the dispatch site erases the type, and the switch never throws. So
 * the guard has to be a source scan.
 *
 * WHAT IT CHECKS
 *   1. Collect every `targetDrawer: "<literal>"` in `src/**`.
 *   2. Run each through `resolveNotificationDrawerTarget` (aliases included).
 *   3. Assert the resolved id has a real `case "<id>":` in `drawers.tsx`.
 *
 * Dynamic (non-literal) `targetDrawer:` expressions are skipped by the scan —
 * the ternary in `mention-notify.ts` returns literals that appear elsewhere in
 * the file and are caught anyway.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveNotificationDrawerTarget } from "@/components/admin/shell/internal/notification-drawer-targets";

const SRC = path.resolve(process.cwd(), "src");
const DRAWERS = path.join(SRC, "components/admin/shell/internal/drawers.tsx");

/**
 * Ids that are emitted today, resolve to nothing, and are OUT OF SCOPE for the
 * media batch that added this test. Each one is a real (smaller) instance of
 * the same bug: the notification opens the stub. They are listed rather than
 * guessed at because picking the "obviously right" drawer for each is a
 * product call, not a mechanical one.
 *
 * DO NOT add to this list to make a new emission pass. Add the case, or add an
 * alias in `notification-drawer-targets.ts`.
 */
const KNOWN_UNRESOLVED_OUT_OF_SCOPE = new Set<string>([
  // lib/payments/payout-reversal-notify.ts — "money" is a talent PAGE id, not
  // a drawer. Needs a page-navigation target kind, not a drawer alias.
  "money",
  // lib/talent/apply-actions.ts — no roster-applications drawer exists yet.
  "roster-applications",
  "talent-reach",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** `targetDrawer: "x"` / `targetDrawer: 'x'` / `targetDrawer: \`x\`` */
const EMIT_RE = /targetDrawer\s*:\s*(["'`])([a-z0-9-]+)\1/g;

function collectEmittedIds(): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  for (const file of walk(SRC)) {
    // The fixtures file is design-time sample data for the prototype shell,
    // not a real emission path — but its ids are drawer ids and cheap to
    // check, so it stays in.
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(EMIT_RE)) {
      const id = match[2];
      const rel = path.relative(SRC, file);
      const list = byId.get(id) ?? [];
      if (!list.includes(rel)) list.push(rel);
      byId.set(id, list);
    }
  }
  return byId;
}

function drawerCaseIds(): Set<string> {
  const source = readFileSync(DRAWERS, "utf8");
  const ids = new Set<string>();
  for (const match of source.matchAll(/case\s+"([a-z0-9-]+)"\s*:/g)) ids.add(match[1]);
  return ids;
}

test("every emitted targetDrawer resolves to a real case in DrawerSwitch", () => {
  const emitted = collectEmittedIds();
  const cases = drawerCaseIds();

  assert.ok(emitted.size > 0, "scan found no targetDrawer emissions — the regex broke");
  assert.ok(cases.size > 50, "scan found almost no drawer cases — DRAWERS path is wrong");

  const broken: string[] = [];
  for (const [id, files] of emitted) {
    if (KNOWN_UNRESOLVED_OUT_OF_SCOPE.has(id)) continue;
    const resolved = resolveNotificationDrawerTarget(id);
    assert.ok(resolved, `resolveNotificationDrawerTarget returned null for "${id}"`);
    if (!cases.has(resolved.drawerId)) {
      broken.push(`"${id}" → "${resolved.drawerId}" (no case) — emitted from ${files.join(", ")}`);
    }
  }

  assert.deepEqual(
    broken,
    [],
    `These notifications would open the "Coming up next" stub:\n  ${broken.join("\n  ")}`,
  );
});

test("the two media-ownership targets specifically resolve", () => {
  const cases = drawerCaseIds();

  // Talent half — "your photos" is the media section of the talent's own
  // profile, reached through the profile shell in edit-self mode.
  const talent = resolveNotificationDrawerTarget("talent-media");
  assert.equal(talent?.drawerId, "talent-profile-edit");
  assert.equal(talent?.payload?.section, "media");
  assert.equal(talent?.payload?.mode, "edit-self");
  assert.ok(cases.has("talent-profile-edit"));

  // Workspace half — the release-request queue.
  const workspace = resolveNotificationDrawerTarget("media-releases");
  assert.equal(workspace?.drawerId, "media-releases");
  assert.ok(cases.has("media-releases"));
});

test("a notification's own payload wins over the alias default", () => {
  const resolved = resolveNotificationDrawerTarget("talent-media", { section: "albums" });
  assert.equal(resolved?.payload?.section, "albums");
  assert.equal(resolved?.payload?.mode, "edit-self");
});

test("the out-of-scope allowlist stays honest", () => {
  const emitted = collectEmittedIds();
  for (const id of KNOWN_UNRESOLVED_OUT_OF_SCOPE) {
    assert.ok(
      emitted.has(id),
      `"${id}" is allowlisted but no longer emitted — delete it from the list`,
    );
  }
});
