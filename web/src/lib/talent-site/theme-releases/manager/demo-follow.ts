/**
 * THEME CORE P1 (audit rec. 6): do the demos of a design sit on ONE version
 * that exists in `talent_theme_versions`? Pure decision, no effects.
 *
 * Publishing already moves demos: Builder Lab publish runs `changeChannel(..,
 * "demos")`, and opening a release to talents (optin / default) runs
 * `applyToDemos` first. Both go through `selectDemoTargets`, which only takes
 * demos BEHIND the target. What that leaves, and what this reports:
 *   behind      demos below the target: a rebuild / publish-to-demos fixes them
 *   ahead       demos above the target: nothing moves them down; needs a decision
 *   noSnapshot  demos pinned to a version with no snapshot: an upgrade has no
 *               exact base and can only add blocks
 */
export interface DemoPin {
  code: string;
  pin: number | null;
}

export interface DemoFollowPlan {
  target: number | null;
  behind: DemoPin[];
  ahead: DemoPin[];
  aligned: DemoPin[];
  noSnapshot: DemoPin[];
  /** `rebuild` when any demo is behind; `review` when only ahead / noSnapshot remain; else `none`. */
  action: "rebuild" | "review" | "none";
}

/** `target` is the newest version a demos-or-wider release targets (null = no release). */
export function planDemoFollow(input: {
  target: number | null;
  snapshotVersions: ReadonlyArray<number>;
  demos: ReadonlyArray<DemoPin>;
}): DemoFollowPlan {
  const have = new Set(input.snapshotVersions);
  const behind: DemoPin[] = [];
  const ahead: DemoPin[] = [];
  const aligned: DemoPin[] = [];
  const noSnapshot: DemoPin[] = [];
  for (const d of input.demos) {
    if (typeof d.pin === "number" && !have.has(d.pin)) noSnapshot.push(d);
    if (input.target === null) continue;
    const pin = d.pin ?? 0;
    if (pin < input.target) behind.push(d);
    else if (pin > input.target) ahead.push(d);
    else aligned.push(d);
  }
  const action = behind.length > 0 ? "rebuild" : ahead.length > 0 || noSnapshot.length > 0 ? "review" : "none";
  return { target: input.target, behind, ahead, aligned, noSnapshot, action };
}
