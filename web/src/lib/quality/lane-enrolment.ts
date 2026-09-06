/**
 * EVERY GATE LANE IS EITHER WIRED OR DECLARED MANUAL.
 *
 * `check:ci-lane-parity` walks the `ci` aggregate and asks whether each lane it
 * finds also appears in the workflow. That question cannot find a lane in
 * NEITHER list, because such a lane is never walked. `test:access` sat in
 * neither for its whole life: parity reported "46 lanes OK" while the lane
 * gated nothing and its own test was failing on main the entire time.
 *
 * This asks the reverse question — enumerate every lane defined in
 * package.json, and account for each one.
 *
 * A lane is ACCOUNTED FOR when it is:
 *   - in the `ci` aggregate, or
 *   - invoked by name in .github/workflows/ci.yml, or
 *   - prefixed `manual:` (a deliberate out-of-CI lane), or
 *   - structurally unable to run in CI, per EXEMPT below.
 *
 * Anything else is UNGATED: it exists, someone believes it runs, and it does
 * not. Those are baselined, and the guard fails when the list GROWS.
 *
 * DIRECTION. Growth fails; shrink does not. A lane leaving this list means
 * somebody wired it or declared it manual, which is the outcome the guard
 * exists to produce — reddening main for doing the right thing is how two
 * ratchets took main down tonight. A shrink prints the delta and asks for the
 * baseline to be re-recorded, and the count in the baseline makes an
 * un-recorded shrink visible rather than silent.
 */
export type LaneVerdict = {
  readonly lane: string;
  readonly state: "ci-chain" | "workflow" | "manual" | "exempt" | "UNGATED";
  readonly why?: string;
};

/**
 * Lanes that CANNOT run in the structural gate, with the reason each cannot.
 * A pattern here is a claim about the lane's nature, not a convenience: adding
 * one silences a real finding, so each carries why.
 */
const EXEMPT: readonly (readonly [RegExp, string])[] = [
  [/^test:e2e/, "browser end-to-end — needs a live server and a seeded host"],
  [/^eval:/, "AI eval — needs model credentials and spends money per run"],
  [/:watch$/, "watch mode — never terminates"],
  [/:strict$|:full$/, "stricter variant of a lane that is itself wired"],
  [/:selftest$/, "self-test of a guard whose main lane is wired"],
  [/^test:builder-capabilities:[ab]$/, "sub-lane of a wired aggregate"],
];

const LANE_PREFIX = /^(test|check|verify|eval):/;

export function classifyLanes(
  scripts: Readonly<Record<string, string>>,
  workflowYaml: string,
): readonly LaneVerdict[] {
  const chain = new Set(
    (scripts.ci ?? "")
      .split("&&")
      .map((s) => s.trim().replace(/^npm run /, ""))
      .filter(Boolean),
  );
  const out: LaneVerdict[] = [];
  for (const lane of Object.keys(scripts)) {
    if (lane.startsWith("manual:")) continue;
    if (!LANE_PREFIX.test(lane)) continue;
    if (chain.has(lane)) {
      out.push({ lane, state: "ci-chain" });
      continue;
    }
    // Word-boundary match: `test:money` must not be satisfied by `test:moneybox`.
    if (new RegExp(`npm run ${escapeForRegExp(lane)}(?![\\w:-])`).test(workflowYaml)) {
      out.push({ lane, state: "workflow" });
      continue;
    }
    const hit = EXEMPT.find(([pattern]) => pattern.test(lane));
    if (hit) {
      out.push({ lane, state: "exempt", why: hit[1] });
      continue;
    }
    out.push({ lane, state: "UNGATED" });
  }
  return out;
}

export function ungatedLanes(verdicts: readonly LaneVerdict[]): readonly string[] {
  return verdicts
    .filter((v) => v.state === "UNGATED")
    .map((v) => v.lane)
    .sort();
}

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
