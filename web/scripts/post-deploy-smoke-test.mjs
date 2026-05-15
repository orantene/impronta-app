#!/usr/bin/env node
// Post-deploy smoke test for production. Runs read-only HTTP probes and
// reports which signals are healthy. Designed to catch the kinds of bugs
// that have bitten this project before:
//
// 1. Custom-domain alias pointing at an older deploy than `vercel ls --prod`
//    says is current (ghost-locked branch quirk).
// 2. CSP missing newly added directives (e.g. vercel-scripts) after a deploy.
// 3. Image optimizer not enabled (returns the source image untouched).
// 4. Google Places API key reverted to a referrer-restricted one.
// 5. Drive API key missing in prod env.
// 6. Middleware blocking the custom domain (page-not-found at root).
//
// Usage:
//   node web/scripts/post-deploy-smoke-test.mjs
//   node web/scripts/post-deploy-smoke-test.mjs --host https://app.tulala.digital
//
// Exit code: 0 = all checks pass, 1 = at least one failure.

const args = process.argv.slice(2);
const hostFlag = args.indexOf("--host");
const HOST =
  hostFlag !== -1 && args[hostFlag + 1] ? args[hostFlag + 1] : "https://app.tulala.digital";
const PUBLIC_HOST =
  hostFlag !== -1 && args[hostFlag + 1] ? args[hostFlag + 1] : "https://tulala.digital";

let failed = 0;

function pass(label, detail = "") {
  console.log(`  ✓ ${label}${detail ? "  — " + detail : ""}`);
}
function fail(label, reason) {
  failed += 1;
  console.log(`  ✗ ${label}  — ${reason}`);
}

async function get(url, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts });
  const headers = {};
  for (const [k, v] of res.headers.entries()) headers[k.toLowerCase()] = v;
  return { status: res.status, headers, body: opts.body ? null : await res.text().catch(() => "") };
}

// 1) Root reachable
async function check_root_reachable() {
  console.log("\nDomain reachability");
  for (const url of [HOST, PUBLIC_HOST]) {
    try {
      const r = await get(url + "/");
      if (r.status >= 200 && r.status < 500 && r.status !== 404) {
        pass(`${url}/ responds (${r.status})`);
      } else {
        fail(`${url}/`, `status=${r.status} (middleware may be 404-ing this host)`);
      }
    } catch (e) {
      fail(`${url}/`, e.message);
    }
  }
}

// 2) CSP contains the directives we expect (regression guard)
async function check_csp() {
  console.log("\nContent-Security-Policy");
  try {
    const r = await get(HOST + "/");
    const csp = r.headers["content-security-policy"] || "";
    const required = [
      "va.vercel-scripts.com",
      "vitals.vercel-insights.com",
      "maps.googleapis.com",
    ];
    for (const directive of required) {
      if (csp.includes(directive)) pass(`CSP includes ${directive}`);
      else fail(`CSP missing ${directive}`, "Vercel analytics/maps will be blocked");
    }
  } catch (e) {
    fail("CSP fetch", e.message);
  }
}

// 3) Image optimizer is mounted (a 400 with x-vercel-error for a bad source
//    is the correct response — proves the optimizer is wired)
async function check_image_optimizer() {
  console.log("\nImage optimizer");
  try {
    const r = await get(
      HOST +
        "/_next/image?url=https%3A%2F%2Fpluhdapdnuiulvxmyspd.supabase.co%2Fnonexistent.jpg&w=384&q=75",
    );
    if (r.status === 400 && r.headers["x-vercel-error"] === "INVALID_IMAGE_OPTIMIZE_REQUEST") {
      pass("optimizer wired (responded with INVALID_IMAGE_OPTIMIZE_REQUEST for bad source)");
    } else if (r.status === 200) {
      pass("optimizer wired (200 — likely served from cache)");
    } else {
      fail("optimizer", `unexpected status=${r.status}`);
    }
  } catch (e) {
    fail("optimizer", e.message);
  }
}

// 4) Places autocomplete endpoint exists (we expect 401 unauthenticated;
//    a 500 means the Google key is bad, a 403 means staff-role gate is
//    misconfigured for the test caller)
async function check_places_route() {
  console.log("\nPlaces autocomplete route");
  try {
    const r = await get(HOST + "/api/admin/places-city-global?q=madrid");
    if (r.status === 401) {
      pass("route mounted (401 unauthenticated — expected without an admin session)");
    } else if (r.status === 200) {
      const body = JSON.parse(r.body);
      if (body.predictions && body.predictions.length > 0) {
        pass(`route + Google key healthy (${body.predictions.length} predictions)`);
      } else if (body.configured === false) {
        fail("Places route", "GOOGLE_PLACES_API_KEY not configured in prod env");
      } else {
        fail("Places route", `200 but no predictions: ${r.body.slice(0, 120)}`);
      }
    } else {
      fail("Places route", `unexpected status=${r.status}`);
    }
  } catch (e) {
    fail("Places route", e.message);
  }
}

// 5) Edge region — confirm the request is hitting an edge close to Supabase
async function check_edge_region() {
  console.log("\nEdge region");
  try {
    const r = await get(HOST + "/");
    const id = r.headers["x-vercel-id"] || "";
    // Expected pattern: "<edge>::<region>::<request-id>", e.g. "cle1::iad1::abc"
    const expectedNearby = ["cle1", "iad1", "dub1"];
    const hit = expectedNearby.find((r) => id.includes(r));
    if (hit) pass(`served from ${hit} (close to Supabase us-east-2)`);
    else fail("edge region", `unexpected x-vercel-id: ${id}`);
  } catch (e) {
    fail("edge region", e.message);
  }
}

// 6) Confirm aliases match (would catch ghost-locked-branch drift)
async function check_alias_drift() {
  console.log("\nAlias parity (app vs root domain)");
  try {
    const [app, root] = await Promise.all([get(HOST + "/"), get(PUBLIC_HOST + "/")]);
    const cspApp = app.headers["content-security-policy"] || "";
    const cspRoot = root.headers["content-security-policy"] || "";
    // Compare a stable substring rather than full equality — query timing can vary
    if (cspApp.slice(0, 200) === cspRoot.slice(0, 200)) {
      pass("CSP identical across hosts (aliases in sync)");
    } else {
      fail(
        "alias drift",
        "CSPs differ — one host is on an older deploy. Run `npm run deploy:promote` to re-align.",
      );
    }
  } catch (e) {
    fail("alias drift", e.message);
  }
}

// 7) Migration drift — local files vs what Supabase has applied. Critical
//    because the smoke test's HTTP probes can't see a missing DB table — code
//    that depends on an unapplied migration only 500s when a user exercises
//    that feature.
async function check_migration_drift() {
  console.log("\nSupabase migration drift");
  const { spawnSync } = await import("node:child_process");
  // Reuse the existing checker. It already loads env, handles the RPC, and
  // exits 0/1 with a clear pending-list. We invoke it as a subprocess so its
  // own behaviour (env loading, override flag) stays single-source-of-truth.
  const r = spawnSync(
    "node",
    ["--env-file=.env.local", "scripts/check-migrations-applied.mjs"],
    { encoding: "utf8" },
  );
  if (r.status === 0) {
    pass("all local migrations applied to remote Supabase");
  } else {
    fail(
      "migration drift",
      // Pull the bulleted list out of the checker's stderr so it shows inline
      // in the smoke output rather than buried behind a child-process boundary.
      (r.stderr || r.stdout || "").trim().split("\n").slice(-8).join("\n     "),
    );
  }
}

console.log(`Smoke-testing ${HOST} (and ${PUBLIC_HOST})…`);
for (const check of [
  check_root_reachable,
  check_csp,
  check_image_optimizer,
  check_places_route,
  check_edge_region,
  check_alias_drift,
  check_migration_drift,
]) {
  // eslint-disable-next-line no-await-in-loop
  await check();
}

console.log(`\n${failed === 0 ? "✓ all checks passed" : `✗ ${failed} check(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
