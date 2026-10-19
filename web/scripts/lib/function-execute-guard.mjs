/**
 * function-execute-guard.mjs: the PURE half of "a new function in the PUBLIC
 * SCHEMA must not become callable by signed-in users (or anon) without review"
 * (TUL-1269 #6 systemic, package I2). PUBLIC SCHEMA ONLY: other schemas are
 * not measured.
 *
 * The I/O half (psql against the CI job's local Supabase, annotations, the
 * WARN-ONLY switch) is function-execute-guard-cli.mjs. Everything here takes
 * plain data and returns plain data so node:test can pin the judgement.
 *
 * A function is identified by its SIGNATURE, `name(argtype, argtype)`, never
 * its name: a new overload, or a changed argument list (DROP + CREATE), is a
 * brand new object with brand new grants, and that is exactly the moment a
 * grant slips in. So the reviewed list is keyed by signature too.
 *
 * Sources:
 *   1. web/scripts/function-execute-allowlist.json `reviewed`: signature +
 *      roles + reason. The only thing that marks a grant as reviewed.
 *   2. PUBLIC_SURFACE_FUNCTIONS / POLICY_HELPER_FUNCTIONS
 *      (web/src/lib/saas/public-surface-functions.ts) set the ROLE POLICY for
 *      a name: a public-surface name may be reviewed for anon and
 *      authenticated; a policy helper for authenticated ONLY (an anon entry
 *      for one is refused). Names listed there with no pinned signature are
 *      reported as `unpinned`.
 *   3. web/scripts/function-execute-baseline.json: the snapshot of what was
 *      already true when the guard was armed. It records the past; it is not
 *      an endorsement.
 *
 * Two findings:
 *   unreviewed   (role, signature) executable by anon/authenticated, not in
 *                the baseline, not reviewed for that role.
 *   missingGrant a function a policy (applying to authenticated or PUBLIC) or a
 *                column default (on a table authenticated can INSERT into)
 *                depends on, that authenticated can NOT execute. After the
 *                held default-privilege revoke (20261231415700) every new
 *                function starts that way, and the failure is a runtime
 *                "permission denied for function", not a migration error.
 */

export const GUARDED_ROLES = Object.freeze(["anon", "authenticated"]);

const SIGNATURE_RE = /^([a-z0-9_]+)\((.*)\)$/i;

/** Remove // line comments and block comments so commented-out names never count. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

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
  const clean = stripComments(src);
  return {
    publicSurface: readStringList(clean, "PUBLIC_SURFACE_FUNCTIONS"),
    policyHelpers: readStringList(clean, "POLICY_HELPER_FUNCTIONS"),
  };
}

/** Validate the committed JSON allow-list. Signature keyed; every entry needs a reason. */
export function parseReviewedAllowList(json) {
  if (!json || !Array.isArray(json.reviewed)) {
    throw new Error("function-execute-allowlist.json: `reviewed` must be an array");
  }
  return json.reviewed.map((e, i) => {
    const m = typeof e?.signature === "string" ? e.signature.match(SIGNATURE_RE) : null;
    if (!m) {
      throw new Error(
        `function-execute-allowlist.json: reviewed[${i}] needs a signature like "name(uuid, text)"`,
      );
    }
    if (!Array.isArray(e.roles) || e.roles.length === 0 || e.roles.some((r) => !GUARDED_ROLES.includes(r))) {
      throw new Error(
        `function-execute-allowlist.json: reviewed[${i}] (${e.signature}) role must be one of ${GUARDED_ROLES.join(", ")}`,
      );
    }
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      throw new Error(`function-execute-allowlist.json: reviewed[${i}] (${e.signature}) needs a reason`);
    }
    return { signature: e.signature, name: m[1], roles: [...e.roles], reason: e.reason };
  });
}

/** Per-role sets of reviewed signatures, after applying the TS role policy. */
export function reviewedFromSources(surface, jsonEntries) {
  const helpers = new Set(surface.policyHelpers);
  const reviewed = { anon: new Set(), authenticated: new Set(), unpinned: [] };
  const nameOf = (sig) => sig.match(SIGNATURE_RE)?.[1] ?? sig;
  for (const e of jsonEntries) {
    if (helpers.has(nameOf(e.signature)) && e.roles.includes("anon")) {
      throw new Error(
        `function-execute-allowlist.json: ${e.signature} is a policy helper, which is authenticated-only; remove "anon"`,
      );
    }
    for (const role of e.roles) reviewed[role].add(e.signature);
  }
  const pinned = new Set(jsonEntries.map((e) => nameOf(e.signature)));
  reviewed.unpinned = [...new Set([...surface.publicSurface, ...surface.policyHelpers])]
    .filter((n) => !pinned.has(n))
    .sort();
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
      usedInPolicy: r.usedInPolicy === true,
      usedInDefault: r.usedInDefault === true,
    };
  });
}

const needsAuthenticated = (r) => (r.usedInPolicy || r.usedInDefault) && !r.authenticated;

/** Compare the measured state with the reviewed list and the baseline. */
export function compareExecutable({ rows, reviewed, baseline }) {
  const baselineKeys = new Set();
  const baselineMissing = new Set(baseline?.missingAuthenticatedGrant ?? []);
  if (baseline) {
    for (const role of GUARDED_ROLES) for (const sig of baseline[role] ?? []) baselineKeys.add(`${role}:${sig}`);
  }
  const liveKeys = new Set();
  const unreviewed = [];
  const missingGrant = [];
  for (const r of rows) {
    for (const role of GUARDED_ROLES) {
      if (!r[role]) continue;
      const key = `${role}:${r.signature}`;
      liveKeys.add(key);
      if (baselineKeys.has(key) || reviewed[role].has(r.signature)) continue;
      unreviewed.push({ role, signature: r.signature, name: r.name, secdef: r.secdef });
    }
    if (needsAuthenticated(r) && !baselineMissing.has(r.signature)) {
      const usedIn = [r.usedInPolicy && "policy", r.usedInDefault && "default"].filter(Boolean);
      missingGrant.push({ signature: r.signature, name: r.name, usedIn });
    }
  }
  unreviewed.sort((a, b) => `${a.role}:${a.signature}`.localeCompare(`${b.role}:${b.signature}`));
  missingGrant.sort((a, b) => a.signature.localeCompare(b.signature));
  const staleBaseline = [...baselineKeys].filter((k) => !liveKeys.has(k)).sort();
  return { unreviewed, missingGrant, staleBaseline };
}

/** The baseline snapshot of the measured state, in committable form. */
export function buildBaseline(rows) {
  const out = { version: 1 };
  for (const role of GUARDED_ROLES) {
    out[role] = rows.filter((r) => r[role]).map((r) => r.signature).sort();
  }
  out.missingAuthenticatedGrant = rows.filter(needsAuthenticated).map((r) => r.signature).sort();
  return out;
}

/**
 * Exit code and level. WARN-ONLY never fails (the baseline is unknown until the
 * first CI run prints it). ENFORCE refuses to run without a baseline, because
 * "no baseline" would otherwise flag every function or, worse, none.
 */
export function decideOutcome({ enforce, baselinePresent, findingCount }) {
  if (!enforce) {
    return {
      exitCode: 0,
      level: "warn",
      message: baselinePresent
        ? `WARN-ONLY: ${findingCount} finding(s). Flip FUNCTION_EXECUTE_GUARD_ENFORCE to true to make this blocking.`
        : `WARN-ONLY: no baseline committed yet; ${findingCount} finding(s), current state printed below as the baseline to commit.`,
    };
  }
  if (!baselinePresent) {
    return {
      exitCode: 1,
      level: "fail",
      message: "ENFORCE is on but web/scripts/function-execute-baseline.json is missing; refusing to report clean.",
    };
  }
  if (findingCount > 0) {
    return {
      exitCode: 1,
      level: "fail",
      message: `${findingCount} unreviewed function grant(s) or missing authenticated grant(s) in the public schema.`,
    };
  }
  return { exitCode: 0, level: "pass", message: "Public schema: no unreviewed function grants, no missing grants." };
}
