/**
 * TUL-1687: Settings links to "Who stays visible" (/admin/settings/visible-picks) only when
 * HUB_PLAN_CAP_PICKS_ENABLED=1 AND the caller may edit the roster (agency.roster.edit, the
 * capability the pick action checks). Anything else, including a load error, shows no link.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { VISIBLE_PICKS_COPY, visiblePicksEnabled, visiblePicksLinkShown } from "./visible-picks";

const WEB = process.cwd();
const read = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

describe("when the Settings link shows", () => {
  test("only with the flag on AND roster-edit permission", () => {
    assert.equal(visiblePicksLinkShown({ flagOn: true, canEditRoster: true }), true);
    assert.equal(visiblePicksLinkShown({ flagOn: true, canEditRoster: false }), false);
    assert.equal(visiblePicksLinkShown({ flagOn: false, canEditRoster: true }), false);
    assert.equal(visiblePicksLinkShown({ flagOn: false, canEditRoster: false }), false);
  });
  test("the flag is the page's own flag: only HUB_PLAN_CAP_PICKS_ENABLED=1", () => {
    for (const v of [undefined, "", "0", "true", "yes"]) {
      assert.equal(visiblePicksLinkShown({ flagOn: visiblePicksEnabled({ HUB_PLAN_CAP_PICKS_ENABLED: v }), canEditRoster: true }), false, String(v));
    }
    assert.equal(visiblePicksLinkShown({ flagOn: visiblePicksEnabled({ HUB_PLAN_CAP_PICKS_ENABLED: "1" }), canEditRoster: true }), true);
  });
  test("the link has plain ES and EN copy, no em dash", () => {
    for (const loc of ["es", "en"] as const) {
      const c = VISIBLE_PICKS_COPY[loc];
      for (const text of [c.title, c.settingsLinkDesc, c.open]) {
        assert.ok(text.trim().length > 0, `${loc}: ${text}`);
        assert.doesNotMatch(text, /—/, `${loc}: ${text}`);
      }
    }
    assert.equal(VISIBLE_PICKS_COPY.es.open, "Abrir");
    assert.equal(VISIBLE_PICKS_COPY.en.open, "Open");
  });
});

describe("wiring", () => {
  const action = read("src/lib/server-actions/admin-visible-picks-link.ts");
  const link = read("src/components/admin/shell/internal/page-modules/VisiblePicksSettingsLink.tsx");
  const settings = read("src/components/admin/shell/internal/page-modules/WorkspacePageView.tsx");

  test("the server check: flag first, then the session's workspace, then agency.roster.edit", () => {
    assert.match(action, /^"use server";/);
    const flag = action.indexOf("if (!visiblePicksEnabled()) return { show: false };");
    const session = action.indexOf("await resolveSession()");
    const scope = action.indexOf("await resolveScope()");
    const cap = action.indexOf('await hasCapability("agency.roster.edit", scope.tenantId)');
    assert.ok(flag > 0 && session > flag && scope > session && cap > scope, "flag, then session, then scope, then capability");
    assert.match(action, /if \(!session\.ok\) return \{ show: false \};/);
    assert.match(action, /if \(!scope\) return \{ show: false \};/);
    assert.match(action, /visiblePicksLinkShown\(\{ flagOn: true, canEditRoster \}\)/);
    // TUL-1716: no step in this file may route through a guard that writes an audit row on
    // refusal (requireWorkspaceStaffAction, with or without a capability) — this loader runs
    // on every Settings open, so a non-editor would audit-spam on every visit.
    assert.doesNotMatch(action, /requireWorkspaceStaffAction/);
    assert.doesNotMatch(action, /auditFailure/);
    // any error hides the link
    assert.match(action, /catch \(err\) \{[\s\S]*return \{ show: false \};/);
  });
  test("the link is a next/link to /admin/settings/visible-picks, hidden until the server says show", () => {
    assert.match(link, /^"use client";/);
    assert.match(link, /import Link from "next\/link";/);
    assert.doesNotMatch(link, /<a href=/);
    assert.match(link, /href=\{`\$\{adminBasePath\}\/settings\/visible-picks`\}/);
    assert.match(link, /useState\(false\)/);
    assert.match(link, /if \(!show\) return null;/);
    assert.match(link, /setShow\(r\.show === true\)/);
    assert.doesNotMatch(link, /#[0-9a-fA-F]{3,8}\b/);
  });
  test("Settings renders it in the Roster & profile fields group", () => {
    assert.match(settings, /import \{ VisiblePicksSettingsLink \} from "\.\/VisiblePicksSettingsLink";/);
    const group = settings.slice(settings.indexOf('id: "roster-fields"'));
    assert.match(group.slice(0, 600), /extra: <VisiblePicksSettingsLink adminBasePath=\{adminBasePath\} \/>/);
  });
});
