import assert from "node:assert/strict";
import { test } from "node:test";

import { checkDbTarget } from "./group6-fixtures.mjs";
import { ACCOUNT_SEED_TAG, DEMO_HOSTS, accountFor, checkApiTarget, diffLines, ownsAccount, hostOps, hostname, parseArgs, sdhId, selectHosts, verifyOps } from "./staging-demo-hosts.mjs";

const trees = { shell: (n) => [{ kind: "header", props: { text: n } }], home: (n, t) => [{ kind: "heading", props: { text: `${n} ${t}` } }] };
const now = new Date("2026-10-19T12:00:00Z");

test("staging-demo-hosts: the default run is a read-only dry run", () => {
  const a = parseArgs([]);
  assert.equal(a.apply, false);
  assert.equal(a.cleanup, false);
  assert.equal(a.selftest, false);
  assert.deepEqual(a.errors, []);
});

test("staging-demo-hosts: --apply refuses without --backup-file", () => {
  assert.match(parseArgs(["--apply"]).errors.join(";"), /--backup-file/);
  assert.deepEqual(parseArgs(["--apply", "--backup-file", "/tmp/b.json"]).errors, []);
  assert.match(parseArgs(["--cleanup", "--apply"]).errors.join(";"), /--backup-file/);
});

test("staging-demo-hosts: --selftest is exclusive and unknown keys are refused", () => {
  assert.match(parseArgs(["--selftest", "--apply", "--backup-file", "x"]).errors.join(";"), /selftest/);
  assert.match(parseArgs(["--only", "nobody"]).errors.join(";"), /unknown host key/);
  assert.match(parseArgs(["--bogus"]).errors.join(";"), /unknown argument/);
});

test("staging-demo-hosts: the production project is refused, staging pooler login accepted", () => {
  assert.equal(checkDbTarget({ DATABASE_URL: "postgresql://postgres.pluhdapdnuiulvxmyspd:x@aws-0-us-east-2.pooler.supabase.com:6543/postgres" }).ok, false);
  assert.equal(checkDbTarget({ DATABASE_URL: "postgresql://postgres.fxlankepwnvelxjrahwk:x@aws-0-us-east-2.pooler.supabase.com:6543/postgres" }).ok, true);
});

test("staging-demo-hosts: only seed hosts are written; held hosts never are", () => {
  const keys = selectHosts(null).map((h) => h.key);
  assert.deepEqual(keys, ["karla-beltran", "saul-tapia-ortega", "mateo-ferrer", "alba-nail-artist", "linh-tran"]);
  assert.deepEqual(DEMO_HOSTS.filter((x) => x.status === "seed").map((h) => h.code), ["TAL-93209", "TAL-93208", "TAL-97001", "TAL-97002", "TAL-97003"]);
  for (const h of DEMO_HOSTS.filter((x) => x.status === "held")) assert.ok(h.heldReason, `${h.key} needs a reason`);
  assert.deepEqual(selectHosts(["saul-tapia-ortega"]).map((h) => h.key), ["saul-tapia-ortega"]);
  assert.deepEqual(selectHosts(["mateo-ferrer"]).map((h) => h.key), ["mateo-ferrer"]);
});

test("staging-demo-hosts: ops use deterministic ids, demo profiles and a site_slug every label resolves to", () => {
  for (const h of selectHosts(null)) {
    const ops = hostOps(h, { trees, now, themeVersion: 2 });
    assert.deepEqual(ops.map((o) => o.table), ["public.talent_profiles", "public.talent_sites", "public.talent_pages"]);
    assert.ok(verifyOps(ops).ok, verifyOps(ops).problems.join("; "));
    assert.equal(ops[0].id, sdhId(`talent:${h.key}`));
    assert.equal(ops[0].row.is_demo, true);
    assert.equal(ops[1].row.talent_profile_id, ops[0].id);
    assert.equal(ops[1].row.theme_design_slug, h.theme);
    // A label resolves as "<site_slug>-demo" or through talent_site_subdomain_lookup's design_alias map.
    const ALIAS = { "folio-demo": "mateo-ferrer", "maison-v2-demo": "alba-nail-artist", "alba-demo": "alba-nail-artist", "linh-demo": "linh-tran" };
    for (const label of h.labels) assert.ok(`${ops[1].row.site_slug}-demo` === label || ALIAS[label] === ops[1].row.site_slug, label);
    assert.deepEqual(hostOps(h, { trees, now, themeVersion: 2 }).map((o) => o.id), ops.map((o) => o.id));
  }
  assert.equal(hostOps(selectHosts(null)[0], { trees, now, themeVersion: null })[1].row.theme_design_slug, undefined);
});

test("staging-demo-hosts: verifyOps refuses a non-demo row, TAL-93938 and a foreign id", () => {
  const ops = hostOps(selectHosts(null)[0], { trees, now, themeVersion: null });
  const bad = structuredClone(ops);
  bad[0].row.is_demo = false;
  bad[0].row.profile_code = "TAL-93938";
  bad[1].id = "00000000-0000-4000-8000-000000000000";
  const v = verifyOps(bad);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(";"), /is_demo/);
  assert.match(v.problems.join(";"), /TAL-93938/);
  assert.match(v.problems.join(";"), /sdhId/);
});

test("staging-demo-hosts: the diff names every card host on the staging root", () => {
  const lines = diffLines({ resolved: { "sofia-nails-demo": "camila-nails" }, codeOwner: { "TAL-93011": { demo: false } }, slugTaken: {}, ownRows: {} });
  const by = Object.fromEntries(lines.map((l) => [l.host, l.action]));
  assert.match(by[hostname("karla-beltran-demo")], /^MISSING/);
  assert.match(by[hostname("mateo-ferrer-demo")], /^MISSING/);
  assert.match(by[hostname("folio-demo")], /^MISSING/);
  assert.match(by[hostname("alba-demo")], /^MISSING/);
  assert.match(by[hostname("linh-demo")], /^MISSING/);
  assert.match(by[hostname("sofia-nails-demo")], /^OK/);
  assert.ok(lines.every((l) => l.host.endsWith(".staging.tulala.digital")));
  const blocked = diffLines({ resolved: {}, codeOwner: { "TAL-93209": { demo: false } }, slugTaken: {}, ownRows: {} });
  assert.match(blocked.find((l) => l.host === hostname("karla-beltran-demo")).action, /^BLOCKED/);
});

test("staging-demo-hosts: demo accounts pass the demo guard's rules and are marked as this seed's", () => {
  const karla = DEMO_HOSTS.find((h) => h.key === "karla-beltran");
  const a = accountFor(karla, "demo-2026-09-28");
  assert.equal(a.email, "demo-karla-beltran@impronta.test");
  assert.match(a.email, /^demo-[^@]+@impronta\.test$/);
  assert.equal(a.appMetadata.demo_batch, "demo-2026-09-28");
  assert.equal(a.appMetadata.seed, ACCOUNT_SEED_TAG);
  assert.deepEqual(a.secondaryLocales, ["en"]);
  assert.deepEqual(accountFor(DEMO_HOSTS.find((h) => h.key === "linh-tran"), "b").secondaryLocales, []);
  assert.equal(ownsAccount({ app_metadata: { seed: ACCOUNT_SEED_TAG } }), true);
  assert.equal(ownsAccount({ app_metadata: { demo_batch: "demo-2026-09-28" } }), false);
  assert.equal(ownsAccount(null), false);
});

test("staging-demo-hosts: the API target must be fxlank with a service key, never production", () => {
  assert.equal(checkApiTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://fxlankepwnvelxjrahwk.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }).ok, true);
  assert.equal(checkApiTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://pluhdapdnuiulvxmyspd.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }).ok, false);
  assert.equal(checkApiTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://fxlankepwnvelxjrahwk.supabase.co" }).ok, false);
  assert.equal(checkApiTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://fxlankepwnvelxjrahwk.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", OTHER: "x pluhdapdnuiulvxmyspd" }).ok, false);
  assert.deepEqual(parseArgs(["--link-accounts", "--cleanup"]).errors.length > 0, true);
});
