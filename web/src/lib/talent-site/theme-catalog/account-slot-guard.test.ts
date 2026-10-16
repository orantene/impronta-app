import assert from "node:assert/strict";
import test from "node:test";

import { splitShell } from "@/lib/talent-site/server/render-max-site-shell";

import { accountSlotPath } from "./account-slot-guard";
import { BUILTIN_DESIGNS } from "./builtins";
import { validateDesign } from "./validate";

const hasAccount = (n: unknown) => JSON.stringify(n).includes('"type":"account"');

test("every built-in Design header reaches the account entry at render time (item or shared overlay)", () => {
  const saved = process.env.CLIENT_ACCOUNT_HOSTS;
  process.env.CLIENT_ACCOUNT_HOSTS = "talent";
  try {
    for (const d of BUILTIN_DESIGNS) {
      const shell = d.buildPayload().shellTree as never[];
      const path = accountSlotPath(shell);
      assert.notEqual(path, "none", `${d.slug}: header would show no account entry`);
      if (path === "item") assert.ok(hasAccount(splitShell(shell, { accountEntry: true })[0]), `${d.slug}: item path did not add the account item`);
    }
  } finally {
    if (saved === undefined) delete process.env.CLIENT_ACCOUNT_HOSTS;
    else process.env.CLIENT_ACCOUNT_HOSTS = saved;
  }
});

test("release guard: a site_header landmark without regions (no place for the account item) fails validateDesign", () => {
  const payload = JSON.parse(JSON.stringify(BUILTIN_DESIGNS[0].buildPayload())) as { shellTree: { props: Record<string, unknown> }[] };
  const header = payload.shellTree.find((n) => (n.props as { sectionTypeKey?: string }).sectionTypeKey === "site_header")!;
  const sp = header.props.sectionProps as Record<string, unknown>;
  delete sp.regions;
  const res = validateDesign(payload);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /account/i.test(e)), res.errors.join(" | "));
});

test("release guard: a header that simply omits the account item still validates (render-time adds it)", () => {
  const payload = JSON.parse(JSON.stringify(BUILTIN_DESIGNS[0].buildPayload()));
  assert.equal(JSON.stringify(payload.shellTree).includes('"type":"account"'), false);
  assert.equal(validateDesign(payload).ok, true);
});
