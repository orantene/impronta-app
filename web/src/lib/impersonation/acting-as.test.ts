import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  actingAsBannerCopy,
  resolveShellUserId,
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
});

test("wiring: layout renders the banner from the real identity; chip is gated", () => {
  const layout = read("src/app/(workspace)/talent/layout.tsx");
  assert.match(layout, /resolveDashboardIdentity\(\)/);
  assert.match(layout, /<ImpersonationBanner/);
  assert.match(layout, /actingAs,/);
  const bar = read("src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx");
  assert.match(bar, /\(inWorkspace \|\| showTalentActingChip\) && \(/);
  assert.doesNotMatch(bar, /\(inWorkspace \|\| inTalent\) && \(/);
  const dict = read("src/components/admin/shell/internal/dashboard-i18n.ts");
  assert.match(dict, /"Acting as another user": "Actuando como otro usuario"/);
});

// ── TUL-205: the shell loads from the EFFECTIVE user, banner survives no-shell ──

test("resolveShellUserId: effective id only under real impersonation", () => {
  assert.equal(resolveShellUserId("actor-1", null), "actor-1");
  assert.equal(resolveShellUserId("actor-1", { isImpersonating: false, effectiveUserId: "actor-1" }), "actor-1");
  // A non-impersonating identity never switches the id, whatever effectiveUserId says.
  assert.equal(resolveShellUserId("actor-1", { isImpersonating: false, effectiveUserId: "other" }), "actor-1");
  assert.equal(resolveShellUserId("actor-1", { isImpersonating: true, effectiveUserId: "target-9" }), "target-9");
  assert.equal(resolveShellUserId("actor-1", { isImpersonating: true, effectiveUserId: "" }), "actor-1");
});

test("banner role label is per surface, en + es, no em dashes", () => {
  assert.equal(actingAsBannerCopy("en", "A", "talent").roleLabel, "Talent");
  assert.equal(actingAsBannerCopy("es", "A", "talent").roleLabel, "Talento");
  assert.equal(actingAsBannerCopy("en", "A", "client").roleLabel, "Client");
  assert.equal(actingAsBannerCopy("es-MX", "A", "client").roleLabel, "Cliente");
  assert.deepEqual(talentActingAsBannerCopy("es", "A"), actingAsBannerCopy("es", "A", "talent"));
  for (const v of Object.values(actingAsBannerCopy("es", null, "client"))) assert.ok(!/[—–]/.test(v), v);
});

test("wiring: talent layout resolves identity before the profile read and uses the effective id", () => {
  const layout = read("src/app/(workspace)/talent/layout.tsx");
  const identityAt = layout.search(/await resolveDashboardIdentity\(\)/);
  assert.ok(identityAt > 0);
  assert.ok(identityAt < layout.search(/loadTalentSelfProfileByUser\(shellUserId\)/));
  assert.doesNotMatch(layout, /loadTalentSelfProfileByUser\(session\.user\.id\)/);
  assert.match(layout, /resolveShellUserId\(session\.user\.id, impersonationIdentity\)/);
  assert.match(layout, /loadTalentSelfProfile\(shellUserId, tenantId\)/);
  assert.match(layout, /loadTalentPageAnalytics\(shellUserId,/);
  // Every no-shell return keeps the banner; only the two focused-flow bypasses stay bare.
  assert.equal((layout.match(/return bareChildren;/g) ?? []).length, 3);
  assert.equal((layout.match(/return <>\{children\}<\/>;/g) ?? []).length, 2);
  assert.match(layout, /\{actingAsBanner\}/);
});

test("wiring: client layout renders the banner (client role) and loads the effective profile", () => {
  const layout = read("src/app/(workspace)/[tenantSlug]/client/layout.tsx");
  assert.match(layout, /<ImpersonationBanner/);
  assert.match(layout, /actingAsBannerCopy\(locale, actingAs\.name, "client"\)/);
  assert.match(layout, /loadClientSelfProfile\(\s*resolveShellUserId\(session\.user\.id, impersonationIdentity\)/);
  assert.doesNotMatch(layout, /loadClientSelfProfile\(session\.user\.id/);
  assert.equal((layout.match(/\{actingAsBanner\}/g) ?? []).length, 2);
});
