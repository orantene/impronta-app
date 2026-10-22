import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closedStaffCells, parseStaffLimit, planStaffLimitWrites } from "./staff-limit-plan";

const WEB = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

test("TUL-1722: unset manager and admin cells are closed; a row opens only its own cell", () => {
  assert.equal(closedStaffCells([]).length, 4);
  const rows = [{ role: "manager", action: "refund" }, { role: "owner", action: "discount" }];
  assert.deepEqual(closedStaffCells(rows).map((c) => `${c.role}:${c.action}`), ["manager:discount", "admin:refund", "admin:discount"]);
});

test("TUL-1722: skipping saves nothing; saving plans one write per cell and a blank deletes the row", () => {
  const plan = planStaffLimitWrites({ manager: { refund: 5000, discount: null }, admin: { refund: 20000, discount: 0 } });
  assert.equal(plan.length, 4);
  assert.deepEqual(plan.find((w) => w.role === "manager" && w.action === "discount"), { role: "manager", action: "discount", limitCents: null });
  assert.equal(plan.find((w) => w.role === "admin" && w.action === "discount")?.limitCents, 0);
  const step = read("src/components/admin/settings/staff-limits-step.tsx");
  const skip = step.slice(step.indexOf("data-staff-limits-skip") - 200, step.indexOf("data-staff-limits-skip"));
  assert.match(skip, /setPhase\("skipped"\)/);
  assert.doesNotMatch(skip, /saveStaffLimitsAction/);
});

test("TUL-1722: limit input parses to cents, blank is closed, junk is refused", () => {
  assert.deepEqual(parseStaffLimit("", 100), { ok: true, cents: null });
  assert.deepEqual(parseStaffLimit("12.50", 100), { ok: true, cents: 1250 });
  assert.deepEqual(parseStaffLimit("0", 100), { ok: true, cents: 0 });
  assert.deepEqual(parseStaffLimit("-1", 100), { ok: false });
  assert.deepEqual(parseStaffLimit("abc", 100), { ok: false });
});

test("TUL-1722: the save is owner-only and resolves the tenant on the server", () => {
  const src = read("src/lib/server-actions/owner-staff-limits.ts");
  assert.match(src, /^"use server";/);
  assert.match(src, /userHasCapability\("transfer_ownership", staff\.tenantId\)/);
  assert.match(src, /tenantScopedQuery\(admin, "role_limits", staff\.tenantId\)/);
  assert.doesNotMatch(src, /tenantId:\s*z\./);
  assert.match(src, /requireNotImpersonating/);
  const exported = [...src.matchAll(/^export (async )?(function|const|type)\b/gm)].map((m) => `${m[1] ?? ""}${m[2]}`);
  assert.deepEqual(exported, ["async function"]);
  const roles = read("src/lib/access/roles.ts");
  const adminCaps = roles.slice(roles.indexOf("const ADMIN_CAPS"), roles.indexOf("const OWNER_CAPS"));
  assert.doesNotMatch(adminCaps, /transfer_ownership/);
});

test("TUL-1722: the step reaches only the owner and is mounted in Roles & limits with en, es, fr copy", () => {
  assert.match(read("src/components/admin/settings/staff-limits-step.tsx"), /if \(!isOwner/);
  assert.match(read("src/components/admin/settings/roles-limits-card.tsx"), /<StaffLimitsStep currency=\{currency\} isOwner=\{isOwner\}/);
  assert.match(read("src/components/admin/shell/internal/page-modules/WorkspacePageView.tsx"), /isOwner=\{isOwner\}/);
  for (const lang of ["en", "es", "fr"]) {
    const step = JSON.parse(read(`messages/${lang}.json`)).dashboard.adminWorkspace.rolesLimits.staffStep as Record<string, string>;
    for (const k of ["title", "intro", "save", "skip", "skipped", "closedNote", "ownerOnly"]) assert.equal(typeof step[k], "string", `${lang}.${k}`);
  }
});
