#!/usr/bin/env node
/**
 * qa-links.mjs — prove the /q/<code> resolver over HTTP, no browser.
 *
 * WHY THIS EXISTS: the house rule is that agents never browser-QA, and
 * AGENTS.md adds that "not clicked" belongs in a report only for things that
 * genuinely need a browser. Almost nothing here does. Whether a printed code
 * reaches its destination is: does the route answer at all, does it 302, does
 * the Location carry the right page, and did a scan row appear. That is a
 * script. What genuinely needs a human is holding a phone camera up to ink on
 * card stock, and that stays in the report.
 *
 *   npm run qa:links                       # READ-ONLY, safe anywhere
 *   npm run qa:links -- --host https://improntamodels.com
 *   npm run qa:links -- --seed --tenant <uuid> --i-understand-this-writes-to-the-database
 *
 * THE READ-ONLY PROBE IS THE IMPORTANT ONE. `surface-allow-list.ts` rewrites an
 * unlisted path to the branded /_page-not-found BEFORE Next routing runs, so a
 * route file that exists and is correct still 404s — this repo has shipped that
 * exact failure. Both cases are "404", which is why looking at the status code
 * alone cannot tell them apart. The handler's own refusal carries a sentinel
 * string; the allow-list's does not. So the probe reads the BODY.
 *
 * ⚠️ SAFETY: local env points at the PRODUCTION database. `--seed` refuses to
 * run without an explicit tenant and an explicit confirmation flag. Every row
 * it creates is prefixed `qa` and deleted in a finally block, including on
 * failure and on Ctrl-C.
 */

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1] ?? null;
};

const HOST = (value("host") ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * The sentinel. `/q/<unknown>` is answered by the route handler itself with
 * this phrase; the surface allow-list's 404 is a different page that cannot
 * contain it. Presence proves the request REACHED the handler, which is the
 * one thing a status code cannot tell you.
 */
const HANDLER_404_SENTINEL = "This code is not active";

let failures = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => { failures++; console.log(`  \x1b[31m✗\x1b[0m ${m}`); };
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function get(path, headers = {}) {
  try {
    // `redirect: "manual"` is essential: the whole product is the redirect, and
    // following it would assert the destination page instead of the resolver.
    const res = await fetch(`${HOST}${path}`, { redirect: "manual", headers });
    return {
      status: res.status,
      location: res.headers.get("location"),
      body: await res.text(),
      unreachable: false,
    };
  } catch (err) {
    return {
      status: 0, location: null, body: "", unreachable: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function readOnly() {
  head(`Read-only probes against ${HOST}`);

  const unknown = await get(`/q/qa-does-not-exist-${Date.now()}`);
  if (unknown.unreachable) {
    bad(`cannot reach ${HOST} (${unknown.error}). Start the dev server or pass --host.`);
    return;
  }

  if (unknown.body.includes(HANDLER_404_SENTINEL)) {
    ok(`/q/<unknown> reached the resolver and refused it honestly (${unknown.status})`);
    if (unknown.status !== 404) {
      bad(`  ...but answered ${unknown.status}, not 404. A dead code must be a real 404 to a crawler.`);
    }
  } else if (unknown.status === 404) {
    bad(
      "/q/<unknown> returned 404 WITHOUT the resolver's own message — the surface " +
      "allow-list 404'd it before Next routing ran. The route exists and is unreachable. " +
      "Check /q in surface-allow-list.ts.",
    );
  } else if (unknown.status >= 300 && unknown.status < 400) {
    bad(`/q/<unknown> REDIRECTED to ${unknown.location}. An unknown code must refuse, never guess.`);
  } else {
    bad(`/q/<unknown> answered ${unknown.status}, expected a 404 from the resolver.`);
  }

  // The Spanish half of the refusal. Cheap to check and the kind of thing that
  // silently regresses, because nobody browses in Spanish on purpose.
  const spanish = await get(`/q/qa-does-not-exist-${Date.now()}`, { "accept-language": "es-MX,es;q=0.9" });
  if (spanish.body.includes("Este código no está activo")) ok("refusal is translated for an es visitor");
  else if (spanish.body.includes(HANDLER_404_SENTINEL)) bad("es visitor got the English refusal");
  else bad("es probe did not reach the resolver");

  // A code that cannot exist under links_code_format must still be refused
  // cleanly rather than 500 on the way to the database.
  const malformed = await get("/q/NOT_A_VALID_CODE");
  if (malformed.status === 404) ok("a malformed code is refused, not 500");
  else if (malformed.status >= 500) bad(`a malformed code returned ${malformed.status} — it should refuse, not throw`);
  else bad(`a malformed code returned ${malformed.status}, expected 404`);
}

async function seeded() {
  const tenantId = value("tenant");
  if (!tenantId || !flag("i-understand-this-writes-to-the-database")) {
    console.error(
      "\n--seed requires --tenant <uuid> --i-understand-this-writes-to-the-database\n" +
        "Local env points at PRODUCTION. Refusing.\n",
    );
    process.exit(2);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("Missing Supabase env; cannot seed."); process.exit(2); }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Unique per run so two harnesses cannot collide on (tenant_id, lower(code)),
  // and so a leaked row from a crashed run is identifiable rather than mistaken
  // for a real link someone printed.
  const code = `qa${Date.now().toString(36)}`;
  let linkId = null;

  const cleanup = async () => {
    if (!linkId) return;
    // Scans go first: link_scans.link_id is ON DELETE CASCADE, but deleting
    // explicitly means a failure to clean up is reported rather than hidden by
    // the cascade.
    await db.from("link_scans").delete().eq("link_id", linkId);
    const { error } = await db.from("links").delete().eq("id", linkId);
    if (error) console.error(`  ⚠️  FAILED TO CLEAN UP link ${linkId} (${code}): ${error.message}`);
    else console.log(`  cleaned up seeded link ${code}`);
  };
  process.on("SIGINT", async () => { await cleanup(); process.exit(130); });

  try {
    head(`Seeding a two-rule link on tenant ${tenantId}`);
    const { data, error } = await db.from("links").insert({
      tenant_id: tenantId,
      code,
      name: "QA harness link",
      kind: "other",
      targets: [
        // A window covering the whole day so the assertion does not depend on
        // what time the harness happens to run. The time-of-day arithmetic
        // itself is proven exhaustively in resolve-target.test.ts; what is
        // being proven HERE is that the route reads the rules at all.
        { when: "time_of_day", fromMinute: 0, toMinute: 1439, to: { to: "/menu", label: "menu" } },
        { when: "always", to: { to: "/", label: "home" } },
      ],
      context: { campaign: "qa-harness" },
    }).select("id").single();

    if (error) { bad(`could not seed a link: ${error.message}`); return; }
    linkId = data.id;
    ok(`seeded /q/${code}`);

    head("Resolving it over HTTP");
    const before = await db.from("link_scans").select("id", { count: "exact", head: true }).eq("link_id", linkId);
    const hit = await get(`/q/${code}`);

    if (hit.status === 302 || hit.status === 307) ok(`/q/${code} → ${hit.status}`);
    else { bad(`/q/${code} answered ${hit.status}, expected a 302`); return; }

    if (hit.location && hit.location.includes("/menu")) ok(`Location carries the first matching rule (${hit.location})`);
    else bad(`Location was ${hit.location}, expected the /menu rule to win over the default`);

    if (hit.location && hit.location.includes(`l=${linkId}`)) ok("the link id rides on the destination for attribution");
    else bad(`Location did not carry l=<link id>: ${hit.location}`);

    // The scan write is fire-and-forget on the redirect path, so it can land
    // after the response. Poll briefly rather than asserting immediately — an
    // assertion that races the thing it measures fails intermittently, which is
    // worse than not having it.
    head("Did the scan record?");
    let after = before.count ?? 0;
    for (let i = 0; i < 10 && after === (before.count ?? 0); i += 1) {
      await new Promise((r) => setTimeout(r, 300));
      const c = await db.from("link_scans").select("id", { count: "exact", head: true }).eq("link_id", linkId);
      after = c.count ?? 0;
    }
    if (after > (before.count ?? 0)) ok(`link_scans grew by ${after - (before.count ?? 0)}`);
    else bad("no link_scans row appeared within 3s of the redirect");

    const { data: scan } = await db
      .from("link_scans").select("resolved_to, device_class, tenant_id").eq("link_id", linkId).limit(1).single();
    if (scan?.resolved_to === "menu") ok(`resolved_to recorded the destination that was actually served ("${scan.resolved_to}")`);
    else bad(`resolved_to was ${JSON.stringify(scan?.resolved_to)}, expected "menu"`);
    if (scan?.tenant_id === tenantId) ok("the scan carries its tenant, so analytics never has to join to find it");
    else bad(`scan tenant_id was ${scan?.tenant_id}`);
  } finally {
    head("Cleanup");
    await cleanup();
  }
}

await readOnly();
if (flag("seed")) await seeded();

console.log(failures === 0 ? "\n\x1b[32mAll checks passed.\x1b[0m\n" : `\n\x1b[31m${failures} check(s) failed.\x1b[0m\n`);
process.exit(failures === 0 ? 0 : 1);
