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
// 7. Notification surfaces (spec §9): Resend webhook rejecting unsigned
//    payloads, one-click unsubscribe + landing page mounted, cron endpoints
//    enforcing CRON_SECRET, and (when RESEND_API_KEY is present) the sending
//    domain verified. HTTP-only — never sends a real email.
// 8. Auth surface matrix (P3): a route allow-listed for a host kind in
//    `src/lib/saas/surface-allow-list.ts` (AUTH_PREFIXES) actually renders on
//    the REAL hosts of that kind — not just on app.tulala.digital. Three
//    production dead ends in two days were all this bug class: /claim 404ing
//    on branded hosts, canonical admin pages rendering naked on branded
//    hosts, and /get-started 404ing on a branded host (that last one is
//    intentional — see the check for why). Nothing else in this script would
//    have caught any of them, because they all returned 200 on
//    app.tulala.digital and only broke on a real agency domain.
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

// Fixed real hosts for the auth-surface-matrix check below (not overridden by
// --host): the whole point of that check is that app.tulala.digital hides
// surface-boundary bugs that only show up on an actual branded agency domain.
// improntamodels.com is a live "agency" host kind; tulala.digital doubles as
// the live "marketing" host kind.
const AGENCY_HOST = "https://improntamodels.com";
const MARKETING_HOST = "https://tulala.digital";

let failed = 0;
let warned = 0;

function pass(label, detail = "") {
  console.log(`  ✓ ${label}${detail ? "  — " + detail : ""}`);
}
function fail(label, reason) {
  failed += 1;
  console.log(`  ✗ ${label}  — ${reason}`);
}
// Non-fatal: a signal we couldn't verify (e.g. a credential-gated check with
// the credential absent). Surfaced in the summary but doesn't flip the exit code.
function warn(label, reason) {
  warned += 1;
  console.log(`  ⚠ ${label}  — ${reason}`);
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
      // Without an explicit media-src, <video> falls back to default-src 'self'
      // and every Supabase-hosted clip (video node, video_reel, video
      // backgrounds) is blocked with no server-side symptom at all.
      "media-src",
      // Video backgrounds embed the privacy-friendly YouTube host in an iframe.
      "youtube-nocookie.com",
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

// 7b) Tenant taxonomy / directory data consistency. Two of the four root causes
//     behind the 2026-08-09 "I save and nothing changes" incident were pure DATA
//     states — talent holding services their own workspace had switched off, and
//     category chips that advertised a number over an empty page. Both had
//     existed for months with every gate green, and both reached us as a client's
//     WhatsApp photo. HTTP probes cannot see either; this can.
async function check_taxonomy_consistency() {
  console.log("\nTenant taxonomy consistency");
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    "node",
    ["--env-file=.env.local", "scripts/check-taxonomy-consistency.mjs"],
    { encoding: "utf8" },
  );
  const body = (r.stdout || r.stderr || "").trim();
  const lines = (marker) =>
    body.split("\n").filter((l) => l.includes(marker)).slice(0, 10).join("\n     ");
  if (r.status !== 0) {
    fail("taxonomy consistency", lines("✗"));
  } else {
    pass("every category chip resolves to the talent it advertises");
  }
  // Warnings ride along on a passing exit code — surfaced, never deploy-blocking.
  const warnBody = lines("⚠");
  if (warnBody) warn("workspaces holding a switched-off service", warnBody);
}

// 8) Notification HTTP surfaces are deployed (spec §9 / §14.4). These are
//    HTTP-only reachability + correctness probes — they never send a real
//    email, so they're safe to run on every deploy without RESEND_API_KEY.
async function check_notification_routes() {
  console.log("\nNotification routes");

  // Resend webhook: unsigned POST must be rejected. 400 = signature enforced
  // (ideal), 503 = RESEND_WEBHOOK_SECRET unset in prod (warn), 200 = unsigned
  // payload ACCEPTED (security failure), 404 = route not deployed.
  try {
    const r = await get(HOST + "/api/webhooks/resend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (r.status === 400) pass("Resend webhook mounted + rejects unsigned (400)");
    else if (r.status === 503)
      warn("Resend webhook", "503 — RESEND_WEBHOOK_SECRET not set in prod (delivery events won't record)");
    else if (r.status === 200)
      fail("Resend webhook", "200 to an UNSIGNED payload — signature verification is bypassed");
    else if (r.status === 404) fail("Resend webhook", "404 — route not deployed");
    else fail("Resend webhook", `unexpected status=${r.status}`);
  } catch (e) {
    fail("Resend webhook", e.message);
  }

  // One-click unsubscribe (RFC 8058): POST must 200 regardless of token
  // validity (mail clients require it; we never leak whether a token is real).
  try {
    const r = await get(HOST + "/api/unsubscribe/smoke-probe-invalid-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
    });
    if (r.status === 200) pass("one-click unsubscribe (POST) mounted (200)");
    else if (r.status === 404) fail("unsubscribe API", "404 — route not deployed");
    else fail("unsubscribe API", `expected 200 for one-click POST, got ${r.status}`);
  } catch (e) {
    fail("unsubscribe API", e.message);
  }

  // Unsubscribe landing page renders (the human-facing confirm/manage surface).
  try {
    const r = await get(HOST + "/unsubscribe/smoke-probe-invalid-token");
    if (r.status >= 200 && r.status < 400) pass(`unsubscribe page renders (${r.status})`);
    else fail("unsubscribe page", `status=${r.status}`);
  } catch (e) {
    fail("unsubscribe page", e.message);
  }
}

// 9) Notification cron endpoints reject unauthenticated callers. A bare GET
//    (no bearer) should 401 — proving the route is mounted AND CRON_SECRET is
//    set in prod AND auth is enforced. 503 = CRON_SECRET unset (warn). 200 =
//    auth bypassed (security failure). 404 = not deployed.
async function check_notification_crons() {
  console.log("\nNotification cron auth");
  const crons = ["/api/cron/send-digest-emails", "/api/cron/retry-failed-emails", "/api/cron/expire-free-reserves"];
  for (const path of crons) {
    try {
      const r = await get(HOST + path);
      if (r.status === 401) pass(`${path} enforces CRON_SECRET (401 unauthenticated)`);
      else if (r.status === 503) warn(path, "503 — CRON_SECRET not set in prod");
      else if (r.status === 200) fail(path, "200 unauthenticated — CRON_SECRET auth is bypassed");
      else if (r.status === 404) fail(path, "404 — cron route not deployed");
      else fail(path, `unexpected status=${r.status}`);
    } catch (e) {
      fail(path, e.message);
    }
  }
}

// 10) Resend sending domain is verified (DKIM/SPF/DMARC). Credential-gated:
//     needs RESEND_API_KEY in the LOCAL env that runs this script. The key IS
//     set in Vercel Production (prod email works), but this script reads the
//     local shell — so absent a local key it WARNS (not fails) and skips the
//     domain API call. To actually verify the sending domain, run with the key:
//     `RESEND_API_KEY=$(vercel env pull ...) npm run deploy:smoke`, or pull it
//     into web/.env.local.
async function check_resend_domain() {
  console.log("\nResend sending domain");
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    warn("Resend domain", "skipped — RESEND_API_KEY not in local env (set it to verify the sending domain; the key is present in Vercel prod)");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      fail("Resend domain", `domains API returned ${res.status}`);
      return;
    }
    const body = await res.json();
    const domains = Array.isArray(body?.data) ? body.data : [];
    const sending = domains.find((d) => typeof d?.name === "string" && d.name.includes("tulala"));
    if (!sending) {
      fail("Resend domain", "no tulala.digital domain found on the Resend account");
    } else if (sending.status === "verified") {
      pass(`sending domain verified (${sending.name})`);
    } else {
      fail("Resend domain", `${sending.name} status=${sending.status} (DKIM/SPF not green)`);
    }
  } catch (e) {
    fail("Resend domain", e.message);
  }
}

// 11) Guest-chat anti-spam floor — the cross-instance KV rate limiter (Upstash)
//     is the HARD ceiling for guest inquiry-create + message-send. When the
//     UPSTASH_REDIS_REST_URL/TOKEN env vars are absent the limiter degrades to a
//     no-op (rate-limit-kv.ts) — the in-memory velocity layer is best-effort
//     only, so the hard floor is DISABLED.
//
//     Probes the DEPLOYED runtime via /api/health/guest-chat (a tiny diagnostics
//     route that returns { rateLimitFloor: "active" | "disabled" } based on the
//     server-side env — never exposes the secret values). This avoids the
//     previous bug where the check read the LOCAL process.env and always warned
//     "floor disabled" even when the Vercel prod env had the vars set.
//
//     NON-FATAL: always warns (never fails) so a deploy without the vars isn't
//     blocked, but the disabled floor is surfaced.
async function check_guest_chat_antispam() {
  console.log("\nGuest-chat anti-spam floor (Upstash KV)");
  const probeUrl = HOST + "/api/health/guest-chat";
  try {
    const r = await get(probeUrl);
    if (r.status === 404) {
      warn("guest-chat anti-spam", "health route not found (404) — deploy may not include the diagnostics endpoint yet");
      return;
    }
    if (r.status !== 200) {
      warn("guest-chat anti-spam", `health route returned ${r.status} — could not verify Upstash floor`);
      return;
    }
    let body;
    try {
      body = JSON.parse(r.body);
    } catch {
      warn("guest-chat anti-spam", `health route returned non-JSON — could not verify Upstash floor`);
      return;
    }
    if (body.rateLimitFloor === "active") {
      pass("Upstash KV env vars present in deployed runtime (guest-chat rate-limit floor enabled)");
    } else {
      warn(
        "guest-chat anti-spam",
        "UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN absent in the deployed runtime — " +
          "the cross-instance KV rate-limit floor is DISABLED (no-op). " +
          "Guest inquiry-create / message-send hard ceilings are not enforced (only the " +
          "best-effort in-memory velocity layer). Provision the Upstash env vars in the " +
          "Vercel project to restore the floor.",
      );
    }
  } catch (e) {
    warn("guest-chat anti-spam", `health route unreachable — ${e.message}`);
  }
}

// 12) Auth surface matrix (P3) — probes the real hosts, not app.tulala.digital,
//     for every `(auth)` route and asserts the status the allow-list promises.
//
//     Source of truth: `src/lib/saas/surface-allow-list.ts`. All 8 routes
//     below live in AUTH_PREFIXES, which is checked on BOTH the "agency" and
//     "marketing" host kinds (isPathAllowedForHostKind), so every route is
//     expected to be REACHABLE (not 404) on both improntamodels.com and
//     tulala.digital. "Reachable" allows either 200 (the page renders) or a
//     same-app redirect the page issues for unauthenticated/tokenless
//     requests (e.g. /claim with no invitation bounces to /login) — both
//     prove the route is mounted and passed the surface gate. A 404 is the
//     one outcome that always means the allow-list and reality disagree.
const AUTH_ROUTES = [
  // Always renders 200 for an unauthenticated visitor.
  { path: "/login", statuses: [200] },
  { path: "/register", statuses: [200] },
  { path: "/forgot-password", statuses: [200] },
  // P2 (#1059) — /register is the SINGLE signup page; these three are now
  // permanent redirects into it carrying `?as=<intent>` plus every inbound
  // param. A 308 is the correct, expected answer: it proves the route is
  // mounted AND passed the surface gate. A 404 would still mean the
  // allow-list and reality disagree; a 200 would mean the retired page came
  // back and signup has forked into multiple designs again.
  {
    path: "/talent/register",
    statuses: [308],
    note: "retired → 308 /register?as=talent",
  },
  {
    path: "/client/register",
    statuses: [308],
    note: "retired → 308 /register?as=client",
  },
  // Reachable, but the page itself redirects for an unauthenticated/tokenless
  // GET — still proves the surface gate let the request through.
  {
    path: "/claim",
    statuses: [200, 307],
    note: "no ?invitation token or session → page redirects to /login",
  },
  {
    path: "/join",
    statuses: [308],
    note: "talent-signup vanity URL → 308 /register?as=talent",
  },
  {
    path: "/update-password",
    statuses: [200, 307],
    note: "no active recovery session → redirects to /forgot-password",
  },
  // A1 (2026-08-08) — /es/ rows for the same three retired routes. Before
  // #1068 + a proxy.ts fix (isTenantSlugCandidate misreading "es" as a legacy
  // tenant slug, and isDashboardInnerPath misreading /talent|client/register
  // as dashboard roots), these did a SILENT double-hop: verified live,
  // `/es/talent/register` -> 308 -> plain `/talent/register` (locale gone
  // before the retired page's own redirect ever ran). Both hops of that bug
  // return 308, so a status-only check (like the three rows above) can NOT
  // catch it — nothing before this asserted the Location header, which is
  // why A1 shipped unnoticed. `location` below is checked verbatim against
  // the real deployed behavior (probed on both host kinds before encoding
  // this, not assumed): a single 308 straight to `/es/register?as=<intent>`.
  {
    path: "/es/talent/register",
    statuses: [308],
    location: "/es/register?as=talent",
    note: "A1 — /es/ must land on /es/register directly, not bounce through /talent/register",
  },
  {
    path: "/es/client/register",
    statuses: [308],
    location: "/es/register?as=client",
    note: "A1 — /es/ must land on /es/register directly, not bounce through /client/register",
  },
  {
    path: "/es/join",
    statuses: [308],
    location: "/es/register?as=talent",
    note: "A1 — /es/ vanity URL must land on /es/register directly",
  },
];

async function check_auth_surface_matrix() {
  console.log("\nAuth surface matrix (P3)");
  for (const host of [AGENCY_HOST, MARKETING_HOST]) {
    for (const { path, statuses, note, location } of AUTH_ROUTES) {
      try {
        const r = await get(host + path);
        if (statuses.includes(r.status)) {
          if (location && r.headers["location"] !== location) {
            fail(
              `${host}${path}`,
              `status ${r.status} but Location is "${r.headers["location"]}", expected ` +
                `"${location}" — the locale prefix was likely stripped mid-redirect (A1 regression)`,
            );
            continue;
          }
          pass(`${host}${path} (${r.status})`, note);
        } else if (r.status === 404) {
          fail(
            `${host}${path}`,
            `404 — surface-allow-list.ts lists "${path}" in AUTH_PREFIXES, allowed on ` +
              `every host kind, but the deployed route is not reachable here`,
          );
        } else {
          fail(
            `${host}${path}`,
            `expected status in [${statuses.join(", ")}], got ${r.status}`,
          );
        }
      } catch (e) {
        fail(`${host}${path}`, e.message);
      }
    }
  }

  // Operator-signup funnel — investigated per P3. /get-started ("Start your
  // business, free") creates a brand-new tenant/workspace. It is deliberately
  // NOT in AGENCY_STOREFRONT_PREFIXES or AUTH_PREFIXES — only in
  // MARKETING_PAGE_PREFIXES, checked solely on the "marketing" host kind — so
  // it 404s on every branded agency domain BY DESIGN: a visitor on an
  // existing agency's storefront (e.g. improntamodels.com) must never be
  // shown "start your own competing agency". This is already pinned by
  // surface-allow-list.test.ts ("marketing host: non-marketing hosts must
  // 404 marketing pages") and by a comment on the allow-list entry itself.
  // Assert BOTH halves of the intentional split here so a regression in
  // either direction (200 leaking onto agency hosts, or 404 breaking on the
  // real marketing host) fails the deploy gate.
  try {
    const onMarketing = await get(MARKETING_HOST + "/get-started");
    if (onMarketing.status === 200) {
      pass(`${MARKETING_HOST}/get-started (200)`, "operator funnel — marketing-only, by design");
    } else {
      fail(
        `${MARKETING_HOST}/get-started`,
        `expected 200 on the marketing host, got ${onMarketing.status}`,
      );
    }
  } catch (e) {
    fail(`${MARKETING_HOST}/get-started`, e.message);
  }
  try {
    const onAgency = await get(AGENCY_HOST + "/get-started");
    if (onAgency.status === 404) {
      pass(
        `${AGENCY_HOST}/get-started (404)`,
        "INTENTIONAL — operator signup funnel is Tulala-marketing-only, not part of AUTH_PREFIXES",
      );
    } else {
      fail(
        `${AGENCY_HOST}/get-started`,
        `expected 404 on a branded agency host (operator funnel must stay marketing-only), got ${onAgency.status}`,
      );
    }
  } catch (e) {
    fail(`${AGENCY_HOST}/get-started`, e.message);
  }

  // Platform /contact — marketing hosts get the guest lead form at the App
  // Router `(public)/contact` route. Agency hosts do NOT serve that route:
  // `/contact` was removed from AGENCY_STOREFRONT_PREFIXES so tenants can own
  // the slug as a CMS page (clean-URL rewrite → `/p/contact`). So agency
  // `/contact` is either 200 (CMS page exists) or 404 (no such page) — never
  // the marketing platform form. See reserved-routes.collisions.static.test.ts
  // ("contact must stay tenant-ownable").
  try {
    const onMarketing = await get(MARKETING_HOST + "/contact");
    if (onMarketing.status === 200) {
      pass(`${MARKETING_HOST}/contact (200)`, "platform contact form on marketing host");
    } else {
      fail(
        `${MARKETING_HOST}/contact`,
        `expected 200 on the marketing host, got ${onMarketing.status}`,
      );
    }
  } catch (e) {
    fail(`${MARKETING_HOST}/contact`, e.message);
  }
  try {
    const onAgency = await get(AGENCY_HOST + "/contact");
    const matched = String(onAgency.headers["x-matched-path"] ?? "");
    if (onAgency.status === 404) {
      pass(
        `${AGENCY_HOST}/contact (404)`,
        "no CMS contact page — platform marketing form correctly unreachable",
      );
    } else if (onAgency.status === 200 && matched.includes("/p/")) {
      pass(
        `${AGENCY_HOST}/contact (200 CMS)`,
        "tenant-owned CMS page via clean-URL rewrite — not the marketing form",
      );
    } else {
      fail(
        `${AGENCY_HOST}/contact`,
        `expected 404 or CMS 200 (/p/), got ${onAgency.status} matched=${matched || "(none)"}`,
      );
    }
  } catch (e) {
    fail(`${AGENCY_HOST}/contact`, e.message);
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
  check_taxonomy_consistency,
  check_notification_routes,
  check_notification_crons,
  check_resend_domain,
  check_guest_chat_antispam,
  check_auth_surface_matrix,
]) {
  await check();
}

const warnSuffix = warned > 0 ? `  (${warned} warning${warned === 1 ? "" : "s"})` : "";
console.log(
  `\n${failed === 0 ? "✓ all checks passed" : `✗ ${failed} check(s) failed`}${warnSuffix}`,
);
process.exit(failed === 0 ? 0 : 1);
