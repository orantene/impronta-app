import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { LEGACY_TENANT_ID } from "./tenant";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB_ROOT = join(HERE, "..", "..", "..");
const SRC_ROOT = join(WEB_ROOT, "src");

// ─────────────────────────────────────────────────────────────────────────────
// Source-level invariants that prove tenant isolation is structurally enforced
// even when a reviewer can't run the whole app against a real database.
// ─────────────────────────────────────────────────────────────────────────────

function gitGrepLines(pattern: string, options: { extraArgs?: string[] } = {}): string[] {
  const args = ["grep", "-nE", ...(options.extraArgs ?? []), pattern, "--", "src"];
  const res = spawnSync("git", args, {
    cwd: WEB_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // git grep: 0 = matches, 1 = no matches, other = real error.
  if (res.status === 0) {
    return res.stdout.split("\n").filter((line) => line.trim().length > 0);
  }
  if (res.status === 1) return [];
  throw new Error(
    `git grep failed (status ${res.status ?? "null"}): ${res.stderr?.trim() ?? "unknown error"}`,
  );
}

test("LEGACY_TENANT_ID is frozen to the seed UUID", () => {
  assert.equal(LEGACY_TENANT_ID, "00000000-0000-0000-0000-000000000001");
});

test("LEGACY_TENANT_ID is never used as a runtime fallback outside seed/migration paths", () => {
  const hits = gitGrepLines("\\bLEGACY_TENANT_ID\\b");
  // Allow the canonical declaration and migration-adjacent files. Any other
  // reference should explicitly opt-in by adding itself to this allow list —
  // that forces a reviewer to re-read Plan L37.
  const allowed = [
    "src/lib/saas/tenant.ts",
    "src/lib/saas/index.ts",
    "src/lib/saas/tenant-isolation.test.ts",
  ];
  const stray = hits.filter((line) => {
    const path = line.split(":")[0];
    return !allowed.some((a) => path === a);
  });
  assert.deepEqual(
    stray,
    [],
    `LEGACY_TENANT_ID must not leak into runtime code paths. Offending references:\n${stray.join("\n")}`,
  );
});

test("admin-scope helpers are the single tenant-aware guard for admin actions", () => {
  // If an admin action calls `requireStaff()` directly AND writes to a
  // tenant-scoped table in the same file, that's a red flag. We can't easily
  // spot that structurally, but we can assert the shared helper exists and is
  // exported from the package barrel so there's no excuse to reach past it.
  const barrel = readFileSync(join(SRC_ROOT, "lib/saas/index.ts"), "utf8");
  assert.match(barrel, /requireStaffTenantAction/);
  assert.match(barrel, /assertRowBelongsToTenant/);
  assert.match(barrel, /requireAdminTenantGuard/);
});

test("admin inquiry/booking action files delegate through requireStaffTenantAction", () => {
  const mustUseGuard = [
    "src/app/(dashboard)/admin/actions.ts",
    "src/app/(dashboard)/admin/bookings/actions.ts",
    "src/app/(dashboard)/admin/inquiries/[id]/coordinator-actions.ts",
    "src/app/(dashboard)/admin/inquiries/[id]/messaging-actions.ts",
    "src/app/(dashboard)/admin/inquiries/[id]/offer-actions.ts",
    "src/app/(dashboard)/admin/inquiries/[id]/roster-actions.ts",
    "src/app/(dashboard)/admin/inquiries/[id]/workspace-flow-actions.ts",
    "src/app/(dashboard)/admin/inquiries/[id]/convert-booking-actions.ts",
  ];
  for (const rel of mustUseGuard) {
    const body = readFileSync(join(WEB_ROOT, rel), "utf8");
    assert.match(
      body,
      /requireStaffTenantAction/,
      `${rel} must call requireStaffTenantAction() — found no usage`,
    );
  }
});

test("site-admin data access is kind-agnostic (M1 abstraction gate)", () => {
  // Phase 5/6 M1 — the CMS write/read primitives (site-settings actions +
  // site-admin server libs) must operate on an opaque tenantId. Branching on
  // `org.kind === 'hub'` or `org.kind === 'agency'` inside these paths
  // re-introduces the coupling M1 removed: any hub-only or agency-only
  // behavior belongs in a render-time dispatch (page.tsx), not in data
  // access code. If a future slice legitimately needs kind branching here,
  // add the file to the allow-list below and document the reason.
  const hits = gitGrepLines("kind[[:space:]]*===[[:space:]]*['\\\"](hub|agency)['\\\"]", {
    extraArgs: ["--"],
  }).filter((line) => {
    const path = line.split(":")[0];
    return (
      path.startsWith("src/app/(dashboard)/admin/site-settings/") ||
      path.startsWith("src/lib/site-admin/")
    );
  });
  const allowed: string[] = [];
  const stray = hits.filter((line) => {
    const path = line.split(":")[0];
    return !allowed.includes(path);
  });
  assert.deepEqual(
    stray,
    [],
    `Site-admin primitives must not branch on org kind. M1 abstraction gate violated:\n${stray.join("\n")}`,
  );
});

test("no admin action uses bare requireStaff + tenant-scoped table write", () => {
  // Heuristic: in files under admin/inquiries|bookings|actions.ts, if
  // `requireStaff(` appears, there should also be a `tenant_id` check nearby.
  // We assert the stronger property: these files should not import
  // `requireStaff` at all — they should import `requireStaffTenantAction`.
  const hits = gitGrepLines("from .@/lib/server/action-guards.", {
    extraArgs: ["-l"],
  });
  const tenantScoped = hits
    .map((line) => line.trim())
    .filter((path) => {
      if (!path.startsWith("src/app/(dashboard)/admin/")) return false;
      // These files only touch global tables (profiles, talent_profiles, etc.)
      // or are not actions at all — exempt explicitly.
      const exemptions = [
        "src/app/(dashboard)/admin/clients/actions.ts",
        "src/app/(dashboard)/admin/users/actions.ts",
        "src/app/(dashboard)/admin/users/password-actions.ts",
        "src/app/(dashboard)/admin/fields/actions.ts",
        "src/app/(dashboard)/admin/taxonomy/actions.ts",
        "src/app/(dashboard)/admin/talent/actions.ts",
        "src/app/(dashboard)/admin/talent/translation-actions.ts",
        "src/app/(dashboard)/admin/locations/actions.ts",
        "src/app/(dashboard)/admin/translations/actions.ts",
        "src/app/(dashboard)/admin/translations/translations-workflow-actions.ts",
        "src/app/(dashboard)/admin/translations/translations-ai-actions.ts",
        "src/app/(dashboard)/admin/translations/translations-tax-loc-actions.ts",
        "src/app/(dashboard)/admin/translations/translation-center-quick-edit-actions.ts",
        "src/app/(dashboard)/admin/settings/actions.ts",
        "src/app/(dashboard)/admin/settings/languages/actions.ts",
        "src/app/(dashboard)/admin/ai-workspace/actions.ts",
        "src/app/(dashboard)/admin/ai-workspace/ai-provider-actions.ts",
        "src/app/(dashboard)/admin/directory/filters/actions.ts",
        "src/app/(dashboard)/admin/admin-media-actions.ts",
        "src/app/(dashboard)/admin/account-actions.ts",
        "src/app/(dashboard)/admin/impersonation/actions.ts",
        "src/app/(dashboard)/admin/site-settings/content/posts/actions.ts",
        "src/app/(dashboard)/admin/site-settings/content/pages/actions.ts",
        "src/app/(dashboard)/admin/site-settings/content/navigation/actions.ts",
        "src/app/(dashboard)/admin/site-settings/content/cms-revision-actions.ts",
        // Phase 5 site-admin — uses requireStaff + requireTenantScope pattern
        // (see scope.ts). tenantId is threaded into lib-layer writes that
        // enforce capability + RLS + revision guards per-call.
        "src/app/(dashboard)/admin/site-settings/branding/actions.ts",
        "src/app/(dashboard)/admin/site-settings/branding/page.tsx",
        "src/app/(dashboard)/admin/site-settings/design/actions.ts",
        "src/app/(dashboard)/admin/site-settings/design/page.tsx",
        "src/app/(dashboard)/admin/site-settings/identity/actions.ts",
        "src/app/(dashboard)/admin/site-settings/identity/page.tsx",
        "src/app/(dashboard)/admin/site-settings/navigation/actions.ts",
        "src/app/(dashboard)/admin/site-settings/navigation/page.tsx",
        "src/app/(dashboard)/admin/site-settings/pages/actions.ts",
        "src/app/(dashboard)/admin/site-settings/pages/page.tsx",
        "src/app/(dashboard)/admin/site-settings/pages/new/page.tsx",
        "src/app/(dashboard)/admin/site-settings/pages/[id]/page.tsx",
        "src/app/(dashboard)/admin/site-settings/sections/actions.ts",
        "src/app/(dashboard)/admin/site-settings/sections/page.tsx",
        "src/app/(dashboard)/admin/site-settings/sections/new/page.tsx",
        "src/app/(dashboard)/admin/site-settings/sections/[id]/page.tsx",
        "src/app/(dashboard)/admin/analytics/talent/page.tsx",
        "src/app/(dashboard)/admin/analytics/seo/page.tsx",
        "src/app/(dashboard)/admin/analytics/search/page.tsx",
        "src/app/(dashboard)/admin/analytics/overview/page.tsx",
        "src/app/(dashboard)/admin/analytics/funnels/page.tsx",
        "src/app/(dashboard)/admin/analytics/acquisition/page.tsx",
        "src/app/(dashboard)/admin/bookings/new/page.tsx",
        "src/app/(dashboard)/admin/site-settings/structure/page.tsx",
      ];
      return !exemptions.includes(path);
    });
  assert.deepEqual(
    tenantScoped,
    [],
    `These admin-scoped action files still import requireStaff directly — migrate them to requireStaffTenantAction:\n${tenantScoped.join("\n")}`,
  );
});
