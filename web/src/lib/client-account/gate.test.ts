import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { afterEach } from "node:test";

import { resolveClientAccountMount } from "./gate";
import type { ClientAccountHostKind } from "./flag";

const ORIGINAL = process.env.CLIENT_ACCOUNT_HOSTS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CLIENT_ACCOUNT_HOSTS;
  else process.env.CLIENT_ACCOUNT_HOSTS = ORIGINAL;
});
const KINDS: ClientAccountHostKind[] = ["talent", "agency", "hub", "app", "marketing"];
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("flag unset: no account UI on any host kind", () => {
  delete process.env.CLIENT_ACCOUNT_HOSTS;
  for (const k of KINDS) assert.deepEqual(resolveClientAccountMount(k), { dock: false, headerItem: false }, k);
});

test("flag lists talent only: talent gets dock + header item, others nothing", () => {
  process.env.CLIENT_ACCOUNT_HOSTS = "talent";
  assert.deepEqual(resolveClientAccountMount("talent"), { dock: true, headerItem: true });
  for (const k of KINDS.filter((x) => x !== "talent")) assert.equal(resolveClientAccountMount(k).dock, false, k);
});

test("every render path is behind the gate", () => {
  assert.match(src("src/components/client-account/ClientAccountDock.tsx"), /resolveClientAccountMount\(surface === "profile_page" \? "app" : "talent"\)\.dock/);
  assert.match(src("src/lib/talent-site/server/render-max-site-demo.tsx"), /resolveClientAccountMount\("talent"\)\.headerItem/);
  const header = src("src/lib/site-admin/sections/site_header/Component.tsx");
  assert.match(header, /case "account":[\s\S]{0,200}props\.siteChrome\?\.account \?/);
  assert.match(src("src/app/api/client/account/route.ts"), /accountSurfaceEnabledForRequest\(\)\)\) return reply\(\{ error: "not_found" \}, 404\)/);
  assert.match(src("src/lib/client-account/actions.ts"), /!\(await accountSurfaceEnabledForRequest\(\)\)\) return \{ ok: false/);
});

test("both mounts render the dock gate, and proxy.ts is untouched by this feature", () => {
  assert.match(src("src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx"), /<ClientAccountDock locale/);
  assert.match(src("src/app/t/[profileCode]/_chat/TalentIntakeSurfaces.tsx"), /<ClientAccountDock locale/);
  assert.match(src("src/app/t/[profileCode]/_chat/TalentIntakeSurfaces.tsx"), /surface="profile_page"/);
});
