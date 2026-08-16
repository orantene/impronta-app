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
 *   2. Run each through `resolveNotificationDrawerTarget` (aliases + page
 *      targets included).
 *   3. Assert a drawer result has a real `case "<id>":` in `drawers.tsx`, and
 *      that a page result carries a path.
 *
 * Dynamic (non-literal) `targetDrawer:` expressions are skipped by the scan —
 * the ternary in `mention-notify.ts` returns literals that appear elsewhere in
 * the file and are caught anyway.
 *
 *   4. Separately, walk `NOTIFICATION_CATALOG` and fail any `in_app` entry that
 *      MUST be clickable but declares no `targetDrawer` at all. The source scan
 *      is blind to that case — an emitter with no `targetDrawer:` literal emits
 *      nothing for the regex to find — and it is exactly how the profile-approved
 *      and review-received rows shipped with `target_drawer = NULL`.
 *
 * There is NO allow-list. `money`, `roster-applications` and `talent-reach`
 * used to sit in a `KNOWN_UNRESOLVED_OUT_OF_SCOPE` set here — three real
 * notifications that opened the stub. They now resolve to page targets and the
 * escape hatch is gone, so any new unresolved id hard-fails this lane.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  adminBasePathFromPathname,
  notificationDrawerFields,
  notificationTargetHref,
  resolveNotificationDrawerTarget,
  type NotificationDrawerTarget,
  type NotificationPageTarget,
} from "@/components/admin/shell/internal/notification-drawer-targets";

const SRC = path.resolve(process.cwd(), "src");
const DRAWERS = path.join(SRC, "components/admin/shell/internal/drawers.tsx");

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
    const resolved = resolveNotificationDrawerTarget(id);
    assert.ok(resolved, `resolveNotificationDrawerTarget returned null for "${id}"`);
    if (resolved.kind === "page") {
      // A page target never reaches DrawerSwitch. It only has to be a real
      // path; the exact destinations are pinned in the test below.
      assert.ok(
        resolved.path.startsWith("/"),
        `"${id}" resolved to a page target with a non-absolute path "${resolved.path}"`,
      );
      continue;
    }
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

function drawerTarget(
  id: string,
  payload?: Record<string, unknown>,
): NotificationDrawerTarget {
  const target = resolveNotificationDrawerTarget(id, payload);
  assert.ok(target && target.kind === "drawer", `"${id}" did not resolve to a drawer target`);
  return target;
}

test("the two media-ownership targets specifically resolve", () => {
  const cases = drawerCaseIds();

  // Talent half — "your photos" is the media section of the talent's own
  // profile, reached through the profile shell in edit-self mode.
  const talent = drawerTarget("talent-media");
  assert.equal(talent.drawerId, "talent-profile-edit");
  assert.equal(talent.payload?.section, "media");
  assert.equal(talent.payload?.mode, "edit-self");
  assert.ok(cases.has("talent-profile-edit"));

  // Workspace half — the release-request queue.
  const workspace = drawerTarget("media-releases");
  assert.equal(workspace.drawerId, "media-releases");
  assert.ok(cases.has("media-releases"));
});

test("a notification's own payload wins over the alias default", () => {
  const resolved = drawerTarget("talent-media", { section: "albums" });
  assert.equal(resolved.payload?.section, "albums");
  assert.equal(resolved.payload?.mode, "edit-self");
});

/**
 * The three ids that used to open the "Coming up next" stub. Each assertion
 * pins the EXACT destination and its tenant-scoping, so a future refactor that
 * quietly re-points one of them fails here instead of in production.
 */
function pageTarget(id: string): NotificationPageTarget {
  const target = resolveNotificationDrawerTarget(id);
  assert.ok(target && target.kind === "page", `"${id}" did not resolve to a page target`);
  return target;
}

test("payout notifications land on the talent payouts page, host-local", () => {
  const target = pageTarget("money");
  assert.equal(target.surface, "talent");
  assert.equal(target.path, "/talent/payouts");

  // Host-local: the talent surface has no tenant-scoped routes (every
  // /<slug>/talent/* 308s to /talent/*), so the admin base path must NOT be
  // prefixed on any host.
  assert.equal(notificationTargetHref(target, "/admin"), "/talent/payouts");
  assert.equal(notificationTargetHref(target, "/impronta/admin"), "/talent/payouts");

  // NOT the settings sub-route, and NOT the look-alike `talent-payouts` drawer
  // (it hardcodes heldPayouts={null} and would hide the fact the notification
  // is about).
  assert.notEqual(target.path, "/talent/settings/payouts");
});

test("roster-application notifications land on the tenant-scoped applications page", () => {
  const target = pageTarget("roster-applications");
  assert.equal(target.surface, "workspace");

  // Tenant-scoped: the href follows the shell's host-resolved admin base.
  assert.equal(
    notificationTargetHref(target, "/impronta/admin"),
    "/impronta/admin/roster/applications",
  );
  // Branded host — no slug segment.
  assert.equal(notificationTargetHref(target, "/admin"), "/admin/roster/applications");
});

test("talent-reach lands on the REDIRECT DESTINATION, not the legacy hop", () => {
  const target = pageTarget("talent-reach");
  assert.equal(target.surface, "talent");
  // /talent/reach permanentRedirect()s to /talent/money. Pin the destination.
  assert.equal(target.path, "/talent/money");
  assert.notEqual(target.path, "/talent/reach");
});

test("adminBasePathFromPathname mirrors the shell's host rule", () => {
  // Shared app host: /<slug>/admin/...
  assert.equal(adminBasePathFromPathname("/impronta/admin/roster"), "/impronta/admin");
  assert.equal(adminBasePathFromPathname("/impronta/admin"), "/impronta/admin");
  // Branded host: /admin/...
  assert.equal(adminBasePathFromPathname("/admin/roster"), "/admin");
  assert.equal(adminBasePathFromPathname("/admin"), "/admin");
  // Talent surface (no admin segment) — the fallback is the branded base, and
  // it is never applied to a talent path anyway.
  assert.equal(adminBasePathFromPathname("/talent/payouts"), "/admin");
});

test("notificationDrawerFields hands page targets to the caller as an href", () => {
  const page = notificationDrawerFields("roster-applications", null, "/impronta/admin");
  assert.equal(page.targetHref, "/impronta/admin/roster/applications");
  assert.equal(page.targetPayload, undefined);

  const talentPage = notificationDrawerFields("money", null, "/impronta/admin");
  assert.equal(talentPage.targetHref, "/talent/payouts");

  // Drawer targets keep the old shape and carry NO href, so the click handler
  // falls through to openDrawer().
  const drawer = notificationDrawerFields("media-releases", "inq-1");
  assert.equal(drawer.targetDrawer, "media-releases");
  assert.equal(drawer.targetHref, undefined);
  assert.equal(drawer.targetPayload?.inquiryId, "inq-1");
});

test("profile-approved lands on Representation, the surface that renders the changed column", () => {
  // `talent.profile_approved` fires from ONE write:
  // `agency_talent_roster.agency_visibility = 'site_visible'`. The Representation
  // drawer is the talent-side reader of that exact column.
  const target = drawerTarget("representation");
  assert.equal(target.drawerId, "representation");
  assert.ok(drawerCaseIds().has("representation"));

  // Not the profile EDITOR: it renders fields, never workflow/visibility state,
  // so it would look plausible and show nothing about the approval.
  assert.notEqual(target.drawerId, "talent-profile-edit");

  // Drawer, not page — the click must call openDrawer(), not navigate.
  const fields = notificationDrawerFields("representation", null, "/impronta/admin");
  assert.equal(fields.targetDrawer, "representation");
  assert.equal(fields.targetHref, undefined);
});

test("review-received lands on the talent Reviews page, host-local", () => {
  const target = pageTarget("talent-reviews");
  assert.equal(target.surface, "talent");
  assert.equal(target.path, "/talent/reviews");

  // Host-local, like every other talent page target.
  assert.equal(notificationTargetHref(target, "/admin"), "/talent/reviews");
  assert.equal(notificationTargetHref(target, "/impronta/admin"), "/talent/reviews");

  // NOT the workspace staff moderation queue — a talent cannot open it, and it
  // stays a DRAWER target for the admin-side notification that emits it.
  const moderation = resolveNotificationDrawerTarget("reviews-moderation");
  assert.ok(moderation && moderation.kind === "drawer", "reviews-moderation is a drawer target");
  assert.equal(moderation.drawerId, "reviews-moderation");
});

/**
 * The catalog half of the guard.
 *
 * The scan above only proves that the strings which ARE emitted resolve. It
 * cannot see an emitter that sets no `targetDrawer` at all — which is exactly
 * how "Your profile is approved" and "You received a review from a client"
 * shipped: five and one production rows respectively, rendering and marking
 * read, with `target_drawer = NULL` so the click did nothing.
 *
 * Scoping matters here. A blanket "every talent-surface in_app entry needs a
 * destination" rule would be FALSE POSITIVES today: several entries legitimately
 * have none (e.g. `roster.join_rejected.talent` — nothing to open when the
 * answer is no; the two client review-request entries, whose only destination is
 * a tokenized external review form, not an in-app surface). So the rule is
 * narrowed to the one kind where a destination always exists — `profile`, which
 * by definition is about the talent's own profile — plus an explicit pin per
 * entry id for the two fixed here.
 */
const REQUIRED_IN_APP_DESTINATION: Readonly<Record<string, string>> = {
  "talent.profile_approved": "representation",
  "review.received.talent": "talent-reviews",
};

test("in_app entries that must be clickable declare a resolvable targetDrawer", async () => {
  const { NOTIFICATION_CATALOG } = await import("@/lib/notifications/catalog");
  const cases = drawerCaseIds();

  const missing: string[] = [];
  for (const entry of NOTIFICATION_CATALOG) {
    const cfg = entry.in_app;
    if (!cfg) continue;

    const pinned = REQUIRED_IN_APP_DESTINATION[entry.id];
    // `kind: "profile"` is the generalizing arm: a new profile-kind emitter that
    // forgets a destination fails here without anyone updating the pin list.
    const mustHaveTarget = pinned !== undefined || cfg.kind === "profile";
    if (!mustHaveTarget) continue;

    if (!cfg.targetDrawer) {
      missing.push(`"${entry.id}" (kind "${cfg.kind}") sets no targetDrawer`);
      continue;
    }
    if (pinned !== undefined && cfg.targetDrawer !== pinned) {
      missing.push(`"${entry.id}" emits "${cfg.targetDrawer}", pinned to "${pinned}"`);
      continue;
    }
    const resolved = resolveNotificationDrawerTarget(cfg.targetDrawer);
    assert.ok(resolved, `"${entry.id}" → "${cfg.targetDrawer}" resolved to null`);
    if (resolved.kind === "drawer" && !cases.has(resolved.drawerId)) {
      missing.push(`"${entry.id}" → "${resolved.drawerId}" has no case in DrawerSwitch`);
    }
  }

  assert.deepEqual(
    missing,
    [],
    `These in-app notifications would render an un-clickable row:\n  ${missing.join("\n  ")}`,
  );

  // The pins must still correspond to live entries — a renamed entry id would
  // otherwise silently drop its guard.
  for (const id of Object.keys(REQUIRED_IN_APP_DESTINATION)) {
    assert.ok(
      NOTIFICATION_CATALOG.some((e) => e.id === id),
      `catalog entry "${id}" no longer exists — retire or repoint its pin`,
    );
  }
});

test("no targetDrawer emission is left unresolved by an allow-list", () => {
  // The old KNOWN_UNRESOLVED_OUT_OF_SCOPE escape hatch is gone. Assert the
  // three ids it held are still emitted AND now resolve, so nobody can
  // "fix" a future regression by reintroducing the list.
  const emitted = collectEmittedIds();
  for (const id of ["money", "roster-applications", "talent-reach"]) {
    assert.ok(emitted.has(id), `"${id}" is no longer emitted — retire its page target too`);
    assert.equal(resolveNotificationDrawerTarget(id)?.kind, "page", `"${id}" no longer resolves`);
  }
});
