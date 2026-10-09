import assert from "node:assert/strict";
import test from "node:test";

import { resolveEssentialsForBuild, resolveEssentialsTimezone } from "@/lib/onboarding/essentials-resolve";
import {
  defaultWeeklyHours,
  runEssentialsWrites,
  type EssentialsStore,
  type WeeklyEssentialHours,
} from "@/lib/onboarding/essentials";
import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { computePublicSlots } from "@/lib/scheduling/public-slots";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  editSiteNeedsPersonalProbe,
  resolveEditSiteRedirect,
  resolveMyWebsiteTarget,
  shouldAutoCreatePersonalSite,
} from "./my-website-target";

const base = { ownsBusinessWorkspace: false, hasWorkspaceSite: false, workspaceSlug: null, hasPersonalSite: false };

test("business owner with a workspace site opens the workspace site", () => {
  const t = resolveMyWebsiteTarget({ ...base, ownsBusinessWorkspace: true, hasWorkspaceSite: true, workspaceSlug: "maison" });
  assert.deepEqual(t, { kind: "workspace", slug: "maison", href: "/maison/admin/website" });
});

test("both sites present: workspace wins for a business owner", () => {
  const t = resolveMyWebsiteTarget({ ...base, ownsBusinessWorkspace: true, hasWorkspaceSite: true, workspaceSlug: "maison", hasPersonalSite: true });
  assert.equal(t.kind, "workspace");
});

test("an explicit personal request keeps the personal builder reachable", () => {
  const t = resolveMyWebsiteTarget({ ...base, ownsBusinessWorkspace: true, hasWorkspaceSite: true, workspaceSlug: "maison", hasPersonalSite: true, explicitPersonal: true });
  assert.equal(t.kind, "personal");
});

test("pure talent opens the personal site; none yet points at the create path", () => {
  assert.equal(resolveMyWebsiteTarget({ ...base, hasPersonalSite: true }).kind, "personal");
  assert.deepEqual(resolveMyWebsiteTarget(base), { kind: "create", href: "/talent/public-page" });
});

test("a business owner whose site is not ready yet never falls into a personal site", () => {
  const t = resolveMyWebsiteTarget({ ...base, ownsBusinessWorkspace: true, workspaceSlug: "maison" });
  assert.equal(t.kind, "create");
});

test("passive visits create a personal site only for a pure talent with none", () => {
  assert.equal(shouldAutoCreatePersonalSite({ ownsBusinessWorkspace: false, hasPersonalSite: false }), true);
  assert.equal(shouldAutoCreatePersonalSite({ ownsBusinessWorkspace: true, hasPersonalSite: false }), false);
  assert.equal(shouldAutoCreatePersonalSite({ ownsBusinessWorkspace: false, hasPersonalSite: true }), false);
});

test("timezone: confirmed zone, then city + country, then country default, never UTC", () => {
  assert.equal(resolveEssentialsTimezone({ timezone: "America/Bogota", city: "Cancun", country: "Mexico" }), "America/Bogota");
  assert.equal(resolveEssentialsTimezone({ timezone: null, city: "Cancun", country: "Mexico" }), "America/Cancun");
  assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: "Mexico" }), "America/Mexico_City");
  assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: null }), null);
});

test("the build resolves a timezone from the city so hours are written", () => {
  const e = resolveEssentialsForBuild({
    essentials: null, serviceFacts: ["Gel manicure"], discipline: "nails", tradeSlug: null,
    country: "Mexico", city: "Tijuana", locale: "en",
  });
  assert.equal(e?.timezone, "America/Tijuana");
});

function recordingStore(calls: string[]): EssentialsStore {
  return {
    async listOfferings() { return []; },
    async insertOfferings() { calls.push("offerings"); },
    async updateOffering() {},
    async upsertTalentHours({ timezone }) { calls.push(`hours:${timezone}`); return !!timezone; },
    async setTalentBookable() { calls.push("bookable"); },
    async setTalentPlace() {},
    async setWorkspaceBusinessInfo() { calls.push("businessInfo"); },
    async enableWorkspaceAppointments() { calls.push("appointments"); },
    async hasActiveProvider() { return false; },
    async inviteFirstProvider() { return "skipped" as never; },
  };
}

test("both: owner hours, bookable, workspace hours and appointments are all written", async () => {
  const calls: string[] = [];
  const essentials = resolveEssentialsForBuild({
    essentials: null, serviceFacts: ["Gel manicure"], discipline: "nails", tradeSlug: null,
    country: "Mexico", city: "Tijuana", locale: "en",
  })!;
  const r = await runEssentialsWrites(recordingStore(calls), {
    choice: "both", essentials,
    talent: { talentProfileId: "tp1", tenantId: "t1" }, workspace: { tenantId: "t1", tenantSlug: "maison" },
  });
  assert.deepEqual(r.warnings, []);
  assert.ok(calls.includes("hours:America/Tijuana"));
  for (const c of ["bookable", "businessInfo", "appointments"]) assert.ok(calls.includes(c), c);
});

test("the owner-provider's onboarding hours produce slots for a house offering", () => {
  const weekly: WeeklyEssentialHours = defaultWeeklyHours();
  // The row exactly as upsertBookingHoursFromOnboarding writes it.
  const hours = parseBookingHours({
    timezone: "America/Mexico_City", weekly, exceptions: [],
    slot_minutes: 30, buffer_before_min: 0, buffer_after_min: 0, min_notice_min: 60, horizon_days: 60,
  });
  assert.ok(hours);
  // Next Monday 08:00 Mexico City is before opening; ask from a fixed Monday UTC.
  const from = new Date("2030-01-07T12:00:00Z");
  const r = computePublicSlots({ hours, durationMinutes: 60, from, days: 7, busy: [] });
  assert.equal(r.reason, null);
  assert.ok(r.starts.length > 0);
});

test("TUL-373: business owner goes straight to the admin website URL", () => {
  assert.equal(
    resolveEditSiteRedirect({ ...base, ownsBusinessWorkspace: true, hasWorkspaceSite: true, workspaceSlug: "maison" }),
    "/maison/admin/website",
  );
});

test("TUL-373: talent-only and unknown/failed lookups keep the in-page editor", () => {
  assert.equal(resolveEditSiteRedirect(base), null);
  assert.equal(resolveEditSiteRedirect({ ...base, hasPersonalSite: true }), null);
  assert.equal(resolveEditSiteRedirect({ ...base, ownsBusinessWorkspace: true, workspaceSlug: "maison" }), null);
  assert.equal(resolveEditSiteRedirect({ ...base, ownsBusinessWorkspace: true, hasWorkspaceSite: true, workspaceSlug: null }), null);
});

test("TUL-373: never redirects to a /talent path (no loop) and rejects unsafe slugs", () => {
  const owner = { ...base, ownsBusinessWorkspace: true, hasWorkspaceSite: true };
  for (const slug of ["maison", "a-b-1"]) {
    const href = resolveEditSiteRedirect({ ...owner, workspaceSlug: slug });
    assert.ok(href && !href.startsWith("/talent"));
  }
  for (const slug of ["../talent", "a/b", "", "Talent X", "//evil.com"]) {
    assert.equal(resolveEditSiteRedirect({ ...owner, workspaceSlug: slug }), null);
  }
});

test("TUL-373: explicit personal request with a personal site stays; without one it still redirects", () => {
  const owner = { ...base, ownsBusinessWorkspace: true, hasWorkspaceSite: true, workspaceSlug: "maison", explicitPersonal: true };
  assert.equal(resolveEditSiteRedirect({ ...owner, hasPersonalSite: true }), null);
  assert.equal(resolveEditSiteRedirect({ ...owner, hasPersonalSite: false }), "/maison/admin/website");
});

test("TUL-373: the personal probe runs only for an explicit-personal business owner", () => {
  assert.equal(editSiteNeedsPersonalProbe({ ownsBusinessWorkspace: true, hasWorkspaceSite: true, explicitPersonal: true }), true);
  assert.equal(editSiteNeedsPersonalProbe({ ownsBusinessWorkspace: true, hasWorkspaceSite: true, explicitPersonal: false }), false);
  assert.equal(editSiteNeedsPersonalProbe({ ownsBusinessWorkspace: false, hasWorkspaceSite: false, explicitPersonal: true }), false);
});

test("TUL-373: the page-builder route redirects on the server before the locale hop", () => {
  const src = readFileSync(path.join(process.cwd(), "src/app/(workspace)/talent/page-builder/page.tsx"), "utf8");
  assert.ok(!/^\s*"use client"/m.test(src), "route must be a server component");
  const redirectAt = src.indexOf("resolveEditSiteRedirect({");
  const localeAt = src.indexOf("loadTalentLocaleState(profile.id)");
  assert.ok(redirectAt > 0 && localeAt > 0 && redirectAt < localeAt, "workspace redirect must precede locale loads");
  assert.ok(/if \(workspaceHref\) redirect\(workspaceHref\)/.test(src));
});
