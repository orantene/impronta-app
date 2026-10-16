/**
 * Every talent promo belongs to its talent (hub tenant fix).
 *
 * All hub talents share ONE tenant, so a promo read by tenant alone priced
 * every hub talent with one talent's promo. These guards pin the owner on
 * every read and write path that could list promos for a tenant:
 *
 *   1. No call to `loadTenantPromos` without an owner argument.
 *   2. The talent dashboard actions write and filter `talent_profile_id`.
 *   3. The admin discounts page lists agency-wide promos only.
 *   4. The cron notifies the owning talent, never the hub tenant's admins.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** The argument text of each `name(` call, balanced on parentheses. */
function callArgs(src: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b${name}\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i += 1) {
      if (src[i] === "(") depth += 1;
      else if (src[i] === ")") depth -= 1;
    }
    out.push(src.slice(start, i - 1));
  }
  return out;
}

const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

test("no code calls loadTenantPromos without an owner", () => {
  const offenders: string[] = [];
  let calls = 0;
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("loadTenantPromos(")) continue;
    for (const args of callArgs(src, "loadTenantPromos")) {
      // The definition itself.
      if (/admin:\s*SupabaseClient/.test(args)) continue;
      calls += 1;
      if (!/talentProfileId|agencyWide|\bo\b|owner/.test(args.split(",").slice(2).join(","))) {
        offenders.push(`${path.relative(SRC, file)}: loadTenantPromos(${args.replace(/\s+/g, " ")})`);
      }
    }
  }
  assert.ok(calls >= 4, `expected the promo readers to call loadTenantPromos, saw ${calls}`);
  assert.deepEqual(offenders, []);
});

test("loadTenantPromos filters by owner, never by tenant alone", () => {
  const repo = read("lib/promos/repo.ts");
  assert.match(repo, /owner: PromoOwner/);
  assert.match(repo, /\.eq\("talent_profile_id", owner\.talentProfileId\)/);
  assert.match(repo, /\.is\("talent_profile_id", null\)/);
});

test("talent dashboard actions write and filter the owning talent", () => {
  const actions = read("lib/promos/actions.ts");
  assert.match(actions, /talent_profile_id: scope\.talentId,/, "insertPromo must write the owner");
  // Every tenant-scoped read / write of a promo row in the actions is also owner-scoped.
  const tenantScoped = actions.match(/\.eq\("tenant_id", scope\.tenantId\)/g) ?? [];
  const promoBlocks = actions.split('.from("tenant_promo_codes")').slice(1).map((b) => b.slice(0, 400));
  for (const block of promoBlocks) {
    if (!block.includes('"tenant_id", scope.tenantId')) continue;
    assert.match(block, /\.eq\("talent_profile_id", scope\.talentId\)/, `unowned promo query: ${block.slice(0, 160)}`);
  }
  assert.ok(tenantScoped.length > 0);
});

test("admin discounts page and toggle are agency-wide only", () => {
  const page = read("app/(workspace)/[tenantSlug]/admin/discounts/page.tsx");
  assert.match(page, /\.is\("talent_profile_id", null\)/);
  const actions = read("app/(workspace)/[tenantSlug]/admin/discounts/actions.ts");
  assert.match(actions, /talent_profile_id: null,/);
  assert.match(actions, /\.is\("talent_profile_id", null\)/);
});

test("share kit uses the promo's own talent, not a roster guess", () => {
  const asset = read("lib/promos/share/asset-data.ts");
  assert.match(asset, /const profileId = row\.talent_profile_id;/);
  assert.doesNotMatch(asset, /agency_talent_roster/);
  const resolve = read("lib/promos/share/resolve.ts");
  assert.match(resolve, /loadTenantPromos\(admin, tenantId, \{ talentProfileId: profileId \}\)/);
});

test("make-good reissue copies the parent's owner", () => {
  const service = read("lib/promos/redemption/service.ts");
  assert.match(service, /talent_profile_id: parent\.talent_profile_id,/);
});

test("cron notifies the owning talent's user", () => {
  const cron = read("app/api/cron/promo-notifications/route.ts");
  assert.match(cron, /recipientUserIds: promoRecipientUserIds\(p, recipients, talentUsers\)/);
});
