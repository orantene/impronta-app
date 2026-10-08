/**
 * Maison theme flag — default off; `talents` mode is allow-list only.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isTalentMaisonThemeEnabled,
  readMaisonThemeMode,
  readMaisonThemeTalentAllowlist,
} from "./talent-maison-theme";

const SWITCH = "TALENT_MAISON_THEME_ENABLED";
const ALLOW = "TALENT_MAISON_THEME_TALENTS";

function withEnv(
  values: { switch?: string | undefined; allow?: string | undefined },
  body: () => void,
): void {
  const prevSwitch = process.env[SWITCH];
  const prevAllow = process.env[ALLOW];
  if (values.switch === undefined) delete process.env[SWITCH];
  else process.env[SWITCH] = values.switch;
  if (values.allow === undefined) delete process.env[ALLOW];
  else process.env[ALLOW] = values.allow;
  try {
    body();
  } finally {
    if (prevSwitch === undefined) delete process.env[SWITCH];
    else process.env[SWITCH] = prevSwitch;
    if (prevAllow === undefined) delete process.env[ALLOW];
    else process.env[ALLOW] = prevAllow;
  }
}

test("Maison theme mode is off when unset", () => {
  withEnv({ switch: undefined }, () => {
    assert.equal(readMaisonThemeMode(), "off");
    assert.equal(isTalentMaisonThemeEnabled(), false);
    assert.equal(isTalentMaisonThemeEnabled("any-id"), false);
  });
});

test("Maison theme mode is all for true/1/all", () => {
  withEnv({ switch: "true" }, () => {
    assert.equal(readMaisonThemeMode(), "all");
    assert.equal(isTalentMaisonThemeEnabled(), true);
    assert.equal(isTalentMaisonThemeEnabled("any-id"), true);
  });
  withEnv({ switch: "1" }, () => {
    assert.equal(isTalentMaisonThemeEnabled("x"), true);
  });
  withEnv({ switch: "all" }, () => {
    assert.equal(isTalentMaisonThemeEnabled("x"), true);
  });
  withEnv({ switch: "yes" }, () => {
    assert.equal(isTalentMaisonThemeEnabled("x"), false);
  });
});

test("talents mode requires allow-list id", () => {
  const id = "6d4e7d73-8577-42fb-b0d3-d2e55a64ca14";
  withEnv({ switch: "talents", allow: id }, () => {
    assert.equal(readMaisonThemeMode(), "talents");
    assert.equal(isTalentMaisonThemeEnabled(), false);
    assert.equal(isTalentMaisonThemeEnabled(id), true);
    assert.equal(isTalentMaisonThemeEnabled("f048e578-cbae-45db-9a3b-34239abea136"), false);
    assert.equal(isTalentMaisonThemeEnabled(null), false);
  });
});

test("allow-list is ignored when mode is off", () => {
  const id = "6d4e7d73-8577-42fb-b0d3-d2e55a64ca14";
  withEnv({ switch: "0", allow: id }, () => {
    assert.equal(isTalentMaisonThemeEnabled(id), false);
  });
  withEnv({ switch: undefined, allow: id }, () => {
    assert.equal(isTalentMaisonThemeEnabled(id), false);
  });
});

test("readMaisonThemeTalentAllowlist trims and splits", () => {
  assert.deepEqual(
    [...readMaisonThemeTalentAllowlist(" a ,b,  ,c ")].sort(),
    ["a", "b", "c"],
  );
  assert.equal(readMaisonThemeTalentAllowlist(undefined).size, 0);
});

test("opts override env for unit injection", () => {
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  assert.equal(
    isTalentMaisonThemeEnabled(id, { mode: "talents", allowlist: new Set([id]) }),
    true,
  );
  assert.equal(
    isTalentMaisonThemeEnabled(id, { mode: "off", allowlist: new Set([id]) }),
    false,
  );
});
