import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  clientActingAsBannerCopy,
  resolveClientActingAs,
  resolveTalentActingAs,
  shouldShowTalentActingChip,
  talentActingAsBannerCopy,
} from "./acting-as";

const WEB = join(new URL(".", import.meta.url).pathname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const profile = (display_name: string | null) =>
  ({ display_name, app_role: "talent" }) as never;

test("an ordinary signed-in owner is NOT acting as anyone", () => {
  const acting = resolveTalentActingAs({ isImpersonating: false, effectiveProfile: profile("Marta Reyes") });
  assert.equal(acting, null);
  assert.equal(shouldShowTalentActingChip(acting), false);
  assert.equal(resolveTalentActingAs(null), null);
});

test("a validated impersonation yields the display name", () => {
  const acting = resolveTalentActingAs({ isImpersonating: true, effectiveProfile: profile("  Marta Reyes ") });
  assert.deepEqual(acting, { name: "Marta Reyes" });
  assert.equal(shouldShowTalentActingChip(acting), true);
});

test("an email (or its prefix source) is never used as the name", () => {
  assert.deepEqual(
    resolveTalentActingAs({ isImpersonating: true, effectiveProfile: profile("marta@example.com") }),
    { name: null },
  );
  assert.deepEqual(resolveTalentActingAs({ isImpersonating: true, effectiveProfile: profile("  ") }), { name: null });
  assert.deepEqual(resolveTalentActingAs({ isImpersonating: true, effectiveProfile: null }), { name: null });
  // Still impersonating, so the chip and banner still show, with a neutral label.
  assert.equal(shouldShowTalentActingChip({ name: null }), true);
});

test("banner copy is en + es, names the person, and has no em dashes", () => {
  const en = talentActingAsBannerCopy("en", "Marta Reyes");
  const es = talentActingAsBannerCopy("es-MX", "Marta Reyes");
  assert.equal(en.effectiveName, "Marta Reyes");
  assert.notEqual(en.returnCta, es.returnCta);
  assert.notEqual(en.readOnlyLine, es.readOnlyLine);
  assert.equal(talentActingAsBannerCopy("en", null).effectiveName, "another user");
  assert.equal(talentActingAsBannerCopy("es", null).effectiveName, "otro usuario");
  for (const copy of [en, es]) {
    for (const value of Object.values(copy)) assert.ok(!/[—–]/.test(value), value);
  }
  const clientEn = clientActingAsBannerCopy("en", "Ana Client");
  const clientEs = clientActingAsBannerCopy("es", "Ana Client");
  assert.equal(clientEn.roleLabel, "Client");
  assert.equal(clientEs.roleLabel, "Cliente");
  assert.equal(resolveClientActingAs({ isImpersonating: true, effectiveProfile: profile("Ana") })?.name, "Ana");
});

test("wiring: layout renders the banner from the real identity; chip is gated", () => {
  const layout = read("src/app/(workspace)/talent/_talent-layout-inner.tsx");
  assert.match(layout, /resolveDashboardIdentity\(\)/);
  assert.match(layout, /<ImpersonationBanner/);
  assert.match(layout, /actingAs,/);
  const bar = read("src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx");
  assert.match(bar, /\(inWorkspace \|\| showTalentActingChip\) && \(/);
  assert.doesNotMatch(bar, /\(inWorkspace \|\| inTalent\) && \(/);
  const dict = read("src/components/admin/shell/internal/dashboard-i18n.ts");
  assert.match(dict, /"Acting as another user": "Actuando como otro usuario"/);
});

test("wiring: client layout mounts ImpersonationBanner with Exit; platform hosts WorkspaceSwitcher", () => {
  const clientLayout = read("src/app/(workspace)/[tenantSlug]/client/layout.tsx");
  assert.match(clientLayout, /resolveDashboardIdentity\(\)/);
  assert.match(clientLayout, /<ImpersonationBanner/);
  assert.match(clientLayout, /clientActingAsBannerCopy/);
  assert.doesNotMatch(clientLayout, /readOnlyViewingAs/);
  const clientRoot = read("src/app/client/page.tsx");
  assert.match(clientRoot, /effectiveReadContext\(/);
  assert.match(clientRoot, /loadClientPrimaryTenantSlug\(subjectUserId\)/);
  assert.doesNotMatch(clientRoot, /loadClientPrimaryTenantSlug\(session\.user\.id\)/);
  const platform = read("src/app/(workspace)/platform/admin/layout.tsx");
  assert.match(platform, /<WorkspaceSwitcher/);
  assert.match(platform, /qaClientUserIdEnv\(\)/);
  assert.match(platform, /startImpersonationAsQaClient|workspaceClientQa/);
  const startAction = read("src/lib/server-actions/admin-impersonation.ts");
  assert.match(startAction, /loadClientPrimaryTenantSlug\(target\)/);
});
