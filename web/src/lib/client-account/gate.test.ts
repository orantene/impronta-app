import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { afterEach } from "node:test";

import { resolveClientAccountMount, resolveClientGate, mountKindForHostContext } from "./gate";
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

test("mount kind follows x-impronta-host-context (agency/hub are not app)", () => {
  assert.equal(mountKindForHostContext("talent_site"), "talent");
  assert.equal(mountKindForHostContext("agency"), "agency");
  assert.equal(mountKindForHostContext("hub"), "hub");
  assert.equal(mountKindForHostContext("app"), "app");
  assert.equal(mountKindForHostContext("marketing"), "marketing");
  assert.equal(mountKindForHostContext(null), null);
});

test("flag lists agency: agency mount on, app mount off", () => {
  process.env.CLIENT_ACCOUNT_HOSTS = "talent,agency";
  assert.equal(resolveClientAccountMount("agency").dock, true);
  assert.equal(resolveClientAccountMount("hub").dock, false);
  assert.equal(resolveClientAccountMount("app").dock, false);
});

/**
 * TUL-64 matrix: host kind × account_status × role → where the visitor goes.
 * Pins the bug: an active client on agency/hub must get the account area when
 * that host's flag is on — never /onboarding/role (or /start on the app host).
 */
test("matrix: host kind × account_status × role (TUL-64)", () => {
  const hosts = ["agency", "hub", "app", "marketing", "talent_site"] as const;
  const statuses = ["active", "onboarding", "registered"] as const;
  const roles = ["client", "talent", "agency_staff", null] as const;

  for (const hostContext of hosts) {
    for (const accountStatus of statuses) {
      for (const appRole of roles) {
        const flagOn = hostContext === "talent_site"
          ? true
          : hostContext === "agency" || hostContext === "hub" || hostContext === "app" || hostContext === "marketing";
        const target = resolveClientGate({
          hostContext,
          accountStatus,
          appRole,
          userId: "u",
          flagOn,
        });
        const cell = `${hostContext}/${accountStatus}/${appRole ?? "null"}`;

        if (hostContext === "talent_site") {
          if (appRole === "client" || appRole === null) {
            assert.equal(target, "talent_area", cell);
          } else {
            assert.equal(target, "legacy", cell);
          }
          continue;
        }

        // Tenant hosts with flag on: client-eligible → account area.
        if (appRole === "client" || appRole === null) {
          assert.equal(target, "account_area", cell);
          continue;
        }

        // Staff / talent keep the legacy role redirect.
        assert.equal(target, "legacy", cell);
      }
    }
  }
});

test("matrix: active client never lands on onboarding (flag off fallback)", () => {
  // When the host flag is off, agency/hub/app active clients use the client
  // resolver — never /onboarding/role (which becomes /start on the app host).
  for (const hostContext of ["agency", "hub", "app", "marketing"]) {
    assert.equal(
      resolveClientGate({
        hostContext,
        accountStatus: "active",
        appRole: "client",
        userId: "u",
        flagOn: false,
      }),
      "client_resolver",
      hostContext,
    );
  }
  assert.equal(
    resolveClientGate({
      hostContext: "agency",
      accountStatus: "onboarding",
      appRole: "client",
      userId: "u",
      flagOn: false,
    }),
    "onboarding",
  );
});

test("every render path is behind the gate", () => {
  assert.match(
    src("src/components/client-account/ClientAccountDock.tsx"),
    /mountKindForHostContext\(hostContext\)/,
  );
  assert.match(
    src("src/components/client-account/ClientAccountDock.tsx"),
    /resolveClientAccountMount\(flagKind\)\.dock/,
  );
  assert.match(src("src/lib/talent-site/server/render-max-site-demo.tsx"), /resolveClientAccountMount\("talent"\)\.headerItem/);
  const header = src("src/lib/site-admin/sections/site_header/Component.tsx");
  assert.match(header, /case "account":[\s\S]{0,200}props\.siteChrome\?\.account \?/);
  assert.match(src("src/app/api/client/account/route.ts"), /accountSurfaceEnabledForRequest\(\)\)\) return reply\(\{ error: "not_found" \}, 404\)/);
  assert.match(src("src/lib/client-account/actions.ts"), /!\(await accountSurfaceEnabledForRequest\(\)\)\) return \{ ok: false/);
  // TUL-516 L3: guest dock must not hit the account API when the flag is off.
  const cards = src("src/app/t/[profileCode]/_chat/GuestClientCards.tsx");
  assert.match(cards, /clientAccountSurface/);
  assert.match(cards, /if \(!accountSurface\)/);
  assert.match(src("src/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount.tsx"), /clientAccountSurface/);
  assert.match(src("src/app/(public)/_chat/AgencyChatLauncherMount.tsx"), /clientAccountSurface/);
});

test("both mounts render the dock gate, and proxy.ts is untouched by this feature", () => {
  assert.match(src("src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx"), /<ClientAccountDock locale/);
  assert.match(src("src/app/t/[profileCode]/_chat/TalentIntakeSurfaces.tsx"), /<ClientAccountDock locale/);
  assert.match(src("src/app/t/[profileCode]/_chat/TalentIntakeSurfaces.tsx"), /surface="profile_page"/);
});

test("account page and entry redirect read host-context flag kinds, not hard-coded app", () => {
  const account = src("src/app/account/page.tsx");
  assert.match(account, /accountFlagKindForHost\(host\.hostContext\)/);
  assert.doesNotMatch(account, /clientAccountEnabledFor\("app"\)/);
  const entry = src("src/lib/client-account/entry-redirect.server.ts");
  assert.match(entry, /accountFlagKindForHost\(host\.hostContext\)/);
  assert.doesNotMatch(entry, /clientAccountEnabledFor\("app"\)/);
  const tenant = src("src/lib/client-account/render-tenant-area.tsx");
  assert.match(tenant, /clientAccountEnabledFor\(flagKind\)/);
  assert.doesNotMatch(tenant, /clientAccountEnabledFor\("app"\)/);
});
