/**
 * Talent website journeys — signed-in storage states.
 *
 * Runs as the `talent-website-setup` project, which every talent-website
 * project depends on, so it completes before any journey starts.
 *
 * WHY A SETUP PROJECT AND NOT A SIGN-IN INSIDE EACH SPEC
 * The journeys declare `test.use({ storageState: storageStateFor("t_max") })`
 * at describe scope, which Playwright resolves when it builds the context.
 * There is no point inside that lifecycle where a spec could sign itself in
 * first. Signing in once per fixture here also keeps the journeys about the
 * product rather than about authentication.
 *
 * HOW SIGN-IN WORKS
 * `/api/dev/signin` is the repo's existing passwordless fixture route, already
 * used by e2e/builder-smoke.spec.ts. It is gated to NODE_ENV=development /
 * non-production Vercel envs (src/app/api/dev/signin/route.ts), so this cannot
 * mint a session against production even by accident.
 *
 * The seeder (`seed.ts`) must have run first: it creates these auth users. A
 * fixture whose user does not exist fails here, loudly, naming the email —
 * which is the right place to find out, rather than six journeys failing on a
 * redirect to /login.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { expect, test as setup } from "@playwright/test";

import { AUTH_STATE_DIR, TALENT_FIXTURES, storageStateFor } from "./fixtures";

setup.describe.configure({ mode: "parallel" });

mkdirSync(AUTH_STATE_DIR, { recursive: true });

for (const fixture of TALENT_FIXTURES) {
  setup(`sign in ${fixture.key} (${fixture.email})`, async ({ page }) => {
    const statePath = storageStateFor(fixture.key);
    mkdirSync(dirname(statePath), { recursive: true });

    const res = await page.goto(
      `/api/dev/signin?email=${encodeURIComponent(fixture.email)}&next=%2F`,
      { waitUntil: "domcontentloaded" },
    );

    expect(
      res?.ok(),
      `dev-signin failed for ${fixture.email}. Has seed.ts run against this database?`,
    ).toBeTruthy();

    // Prove a SESSION exists rather than trusting the redirect: dev-signin
    // answers 200 and sets cookies, but a cookie that does not authenticate
    // would still produce a green setup and six confusing journey failures.
    const cookies = await page.context().cookies();
    const hasSession = cookies.some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
    expect(
      hasSession,
      `no Supabase auth cookie after dev-signin for ${fixture.email} (cookies: ${cookies
        .map((c) => c.name)
        .join(", ")})`,
    ).toBe(true);

    await page.context().storageState({ path: statePath });
  });
}
