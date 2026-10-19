/**
 * function-execute-guard.mjs: the PURE half of "a new public function must not
 * become callable by signed-in users (or anon) without review" (TUL-1269 #6
 * systemic, package I2).
 *
 * The I/O half (psql against the CI job's local Supabase, annotations, the
 * WARN-ONLY switch) is function-execute-guard-cli.mjs. Everything here takes
 * plain data and returns plain data so node:test can pin the judgement.
 *
 * A function is identified by its SIGNATURE, `name(argtype, argtype)`, not its
 * name: changing an argument list is DROP + CREATE, a brand new object with
 * brand new grants, and that is exactly the moment a grant slips in.
 *
 * Three sources decide what is "reviewed":
 *   1. PUBLIC_SURFACE_FUNCTIONS + POLICY_HELPER_FUNCTIONS
 *      (web/src/lib/saas/public-surface-functions.ts): name level, both roles.
 *      Read from the TS module, never restated, so the boundary has one copy.
 *   2. web/scripts/function-execute-allowlist.json `reviewed`: name level, only
 *      the roles named, and every entry carries a reason.
 *   3. web/scripts/function-execute-baseline.json: the snapshot of what was
 *      already executable when the guard was switched on, per role and
 *      signature. It records the past; it is not an endorsement.
 */

export const GUARDED_ROLES = Object.freeze(["anon", "authenticated"]);

function readStringList(src, constName) {
  const re = new RegExp(`export const ${constName}[^=]*=\\s*\\[([\\s\\S]*?)\\]`);
  const block = src.match(re);
  if (!block) {
    throw new Error(
      `could not parse ${constName} from public-surface-functions.ts; refusing to run with an unknown allow-list`,
    );
  }
  return [...block[1].matchAll(/"([a-z0-9_]+)"/gi)].map((m) => m[1]);
}

/** Read both lists out of the TS module source text. Throws when unparseable. */
export function parseSurfaceModule(src) {
  return {
    publicSurface: readStringList(src, "PUBLIC_SURFACE_FUNCTIONS"),
    policyHelpers: readStringList(src, "POLICY_HELPER_FUNCTIONS"),
  };
}

/** Validate the committed JSON allow-list. Every entry needs a reason. */
export function parseReviewedAllowList(json) {
  if (!json || !Array.isArray(json.reviewed)) {
    throw new Error("function-execute-allowlist.json: `reviewed` must be an array");
  }
  return json.reviewed.map((e, i) => {
    if (!e || typeof e.name !== "string" || !/^[a-z0-9_]+$/i.test(e.name)) {
      throw new Error(`function-execute-allowlist.json: reviewed[${i}] needs a function name`);
    }
    if (!Array.isArray(e.roles) || e.roles.length === 0 || e.roles.some((r) => !GUARDED_ROLES.includes(r))) {
      throw new Error(
        `function-execute-allowlist.json: reviewed[${i}] (${e.name}) role must be one of ${GUARDED_ROLES.join(", ")}`,
      );
    }
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      throw new Error(`function-execute-allowlist.json: reviewed[${i}] (${e.name}) needs a reason`);
    }
    return { name: e.name, roles: [...e.roles], reason: e.reason };
  });
}

/** Merge the TS lists and the JSON entries into per-role name sets. */
export function reviewedFromSources(surface, jsonEntries) {
  const reviewed = { anon: new Set(), authenticated: new Set() };
  for (const name of [...surface.publicSurface, ...surface.policyHelpers]) {
    reviewed.anon.add(name);
    reviewed.authenticated.add(name);
  }
  for (const e of jsonEntries) for (const role of e.roles) reviewed[role].add(e.name);
  return reviewed;
}

/** Validate rows from the audit query and canonicalise the signature. */
export function normaliseRows(rows) {
  if (!Array.isArray(rows)) throw new Error("audit rows must be an array");
  return rows.map((r, i) => {
    if (!r || typeof r.signature !== "string" || typeof r.name !== "string") {
      throw new Error(`audit row ${i} has no signature/name; refusing to report clean`);
    }
    return {
      signature: r.signature.replace(/^public\./, ""),
      name: r.name,
      secdef: r.secdef === true,
      anon: r.anon === true,
      authenticated: r.authenticated === true,
    };
  });
}

/**
 * Compare the measured state with the reviewed lists and the baseline.
 * `unreviewed` is the finding list: (role, signature) pairs that are
 * executable, not in the baseline, and whose name is not reviewed for that role.
 */
export function compareExecutable({ rows, reviewed, baseline }) {
  const baselineKeys = new Set();
  if (baseline) {
    for (const role of GUARDED_ROLES) for (const sig of baseline[role] ?? []) baselineKeys.add(`${role}:${sig}`);
  }
  const liveKeys = new Set();
  const unreviewed = [];
  for (const r of rows) {
    for (const role of GUARDED_ROLES) {
      if (!r[role]) continue;
      const key = `${role}:${r.signature}`;
      liveKeys.add(key);
      if (baselineKeys.has(key) || reviewed[role].has(r.name)) continue;
      unreviewed.push({ role, signature: r.signature, name: r.name, secdef: r.secdef });
    }
  }
  unreviewed.sort((a, b) => `${a.role}:${a.signature}`.localeCompare(`${b.role}:${b.signature}`));
  const staleBaseline = [...baselineKeys].filter((k) => !liveKeys.has(k)).sort();
  return { unreviewed, staleBaseline };
}

/** The baseline snapshot of the measured state, in committable form. */
export function buildBaseline(rows) {
  const out = { version: 1 };
  for (const role of GUARDED_ROLES) {
    out[role] = rows.filter((r) => r[role]).map((r) => r.signature).sort();
  }
  return out;
}

/**
 * Exit code and level. WARN-ONLY never fails (the baseline is unknown until the
 * first CI run prints it). ENFORCE refuses to run without a baseline, because
 * "no baseline" would otherwise flag every function or, worse, none.
 */
export function decideOutcome({ enforce, baselinePresent, unreviewedCount }) {
  if (!enforce) {
    return {
      exitCode: 0,
      level: "warn",
      message: baselinePresent
        ? `WARN-ONLY: ${unreviewedCount} unreviewed grant(s). Flip FUNCTION_EXECUTE_GUARD_ENFORCE to true to make this blocking.`
        : `WARN-ONLY: no baseline committed yet; ${unreviewedCount} grant(s) printed below as the baseline to commit.`,
    };
  }
  if (!baselinePresent) {
    return {
      exitCode: 1,
      level: "fail",
      message: "ENFORCE is on but web/scripts/function-execute-baseline.json is missing; refusing to report clean.",
    };
  }
  if (unreviewedCount > 0) {
    return {
      exitCode: 1,
      level: "fail",
      message: `${unreviewedCount} new function grant(s) to anon/authenticated are not reviewed.`,
    };
  }
  return { exitCode: 0, level: "pass", message: "No unreviewed function grants to anon/authenticated." };
}
