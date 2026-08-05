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

export type ProfileShellSaveStepResult =
  | { ok: true }
  | { ok: false; error: string };

export function profileShellStepFailure(section: string, error: string): string {
  return `${section}: ${error}`;
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
): Promise<{ ok: true } | { ok: false; failures: string[] }> {
  const failures: string[] = [];
  for (const step of steps) {
    onStep?.(step.section);
    const res = await step.run();
    if (!res.ok) {
      failures.push(profileShellStepFailure(step.section, res.error));
    }
  }
  onStep?.(null);
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true };
}
