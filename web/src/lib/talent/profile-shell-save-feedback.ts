/**
 * Shared copy + helpers for the admin/talent profile shell (Option A —
 * explicit header Save). Keeps section labels and failure strings in one
 * place so the drawer header and per-step commits stay consistent.
 */

export const PROFILE_SHELL_UNSAVED_BANNER =
  "You have unsaved changes. Click Save at the top before leaving this drawer.";

export const PROFILE_SHELL_SAVE_REQUIRED_HINT =
  "Saved when you click Save at the top of this drawer.";

export const PROFILE_SHELL_SAVE_LOCKED_HINT =
  "This talent owns their profile — personal fields are read-only until exclusivity is confirmed.";

/**
 * `warnings` = the step COMMITTED, but something the operator asked for was
 * not applied (today: a talent type the workspace has disabled). It must reach
 * the UI. #1082 made an unavailable type non-fatal so it could no longer brick
 * the whole profile save — but the drawer only read `.ok`, so the drawer closed
 * on a green "Saved" while the service the operator had just picked was
 * silently dropped. That is the same silent-success failure #1081 fixed,
 * reintroduced from the opposite direction: skipping is fine, skipping QUIETLY
 * is not.
 */
export type ProfileShellSaveStepResult =
  | { ok: true; warnings?: string[] }
  | { ok: false; error: string };

export function profileShellStepFailure(section: string, error: string): string {
  return `${section}: ${error}`;
}

/**
 * Surface a committed-but-incomplete save, and report `false` so the caller does
 * NOT close on a green "Saved".
 *
 * Lives here rather than inline in TalentProfileShellDrawer for two reasons: the
 * staff batch path and the talent self-edit path must behave identically (they
 * drifted before), and that drawer is on a hard line-count ratchet, so shared
 * handling belongs in a module of its own.
 */
export function reportProfileShellSaveWarnings(
  warnings: readonly string[],
  handlers: {
    setStatus: (s: "error") => void;
    setError: (msg: string) => void;
    toast: (msg: string, opts: { tone: "error" }) => void;
  },
): false {
  handlers.setStatus("error");
  handlers.setError(formatProfileShellSaveFailures(warnings));
  for (const w of warnings) handlers.toast(w, { tone: "error" });
  return false;
}

export function formatProfileShellSaveFailures(failures: readonly string[]): string {
  return failures.join(" · ");
}

export async function runProfileShellSaveSteps(
  steps: ReadonlyArray<{
    section: string;
    run: () => Promise<ProfileShellSaveStepResult>;
  }>,
  /** Called with each section name as it starts, then null when the run
   *  finishes. Lets the header say which part of a multi-second save is in
   *  flight instead of showing an undifferentiated spinner. */
  onStep?: (section: string | null) => void,
): Promise<
  { ok: true; warnings?: string[] } | { ok: false; failures: string[] }
> {
  const failures: string[] = [];
  const warnings: string[] = [];
  for (const step of steps) {
    onStep?.(step.section);
    const res = await step.run();
    if (!res.ok) {
      failures.push(profileShellStepFailure(step.section, res.error));
    } else if (res.warnings?.length) {
      // Same "Section: message" shape as a failure — the operator needs to know
      // WHICH part of the save didn't take everything they asked for.
      for (const w of res.warnings) {
        warnings.push(profileShellStepFailure(step.section, w));
      }
    }
  }
  onStep?.(null);
  if (failures.length > 0) return { ok: false, failures };
  return warnings.length > 0 ? { ok: true, warnings } : { ok: true };
}
