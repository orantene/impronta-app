/**
 * English message keys for why "Publish now" is disabled.
 *
 * Callers translate with editor `t()` / `editorT()`, then apply `{count}`
 * replacements. Keeps publish-drawer reason copy in one place so ES (and any
 * future locale) stays in parity with the English source of truth.
 */

export type PublishDisabledReasonInput = {
  publishing: boolean;
  hasConflictRecovery: boolean;
  saving: boolean;
  dirty: boolean;
  preflightLoading: boolean;
  preflightBlockingErrors: number;
  preflightMobileOverflowErrors: number;
  missingSectionCount: number;
  compositionCasVersionMissing: boolean;
};

export type PublishDisabledReason =
  | { key: string; count?: undefined }
  | { key: string; count: number };

/**
 * First-matching reason only (matches the tooltip / aria-describedby hint).
 * Returns null when publish is not disabled for a named reason.
 */
export function resolvePublishDisabledReason(
  input: PublishDisabledReasonInput,
): PublishDisabledReason | null {
  if (input.publishing) {
    return { key: "Publishing. Please wait." };
  }
  if (input.hasConflictRecovery) {
    return {
      key: "This page changed in another tab or session. Resolve the conflict banner first: Reload latest or Keep editing this copy.",
    };
  }
  if (input.saving) {
    return { key: "Saving draft. Try again in a moment." };
  }
  if (input.dirty) {
    return {
      key: "Unsaved changes. Autosave is catching up; try again in a moment.",
    };
  }
  if (input.preflightLoading) {
    return { key: "Running publish checks…" };
  }
  if (
    input.preflightMobileOverflowErrors > 0 &&
    input.preflightMobileOverflowErrors === input.preflightBlockingErrors
  ) {
    return {
      key:
        input.preflightMobileOverflowErrors === 1
          ? "Fix {count} mobile overflow issue to publish."
          : "Fix {count} mobile overflow issues to publish.",
      count: input.preflightMobileOverflowErrors,
    };
  }
  if (input.preflightBlockingErrors > 0) {
    return {
      key:
        input.preflightBlockingErrors === 1
          ? "Fix {count} blocking publish check above before publishing."
          : "Fix {count} blocking publish checks above before publishing.",
      count: input.preflightBlockingErrors,
    };
  }
  if (input.missingSectionCount > 0) {
    return {
      key:
        input.missingSectionCount === 1
          ? "{count} section missing from the latest published version. Reload composition to recover."
          : "{count} sections missing from the latest published version. Reload composition to recover.",
      count: input.missingSectionCount,
    };
  }
  if (input.compositionCasVersionMissing) {
    return { key: "Page version unavailable. Reload and try again." };
  }
  return null;
}

/** Apply `{count}` after locale lookup. */
export function formatPublishDisabledReason(
  reason: PublishDisabledReason,
  translate: (key: string) => string,
): string {
  const text = translate(reason.key);
  if (reason.count === undefined) return text;
  return text.replace("{count}", String(reason.count));
}

export type PublishHardBlockReasonInput = {
  hasConflictRecovery: boolean;
  preflightBlockingErrors: number;
  preflightMobileOverflowErrors: number;
  compositionCasVersionMissing: boolean;
};

/**
 * Hard blockers shown in the banner list (not transient save/preflight state).
 * Each entry is an English key; count templates use `{count}`.
 */
export function resolvePublishHardBlockReasons(
  input: PublishHardBlockReasonInput,
): PublishDisabledReason[] {
  const reasons: PublishDisabledReason[] = [];
  if (input.hasConflictRecovery) {
    reasons.push({
      key: "This page changed in another tab or session. Use the conflict banner to reload latest or keep editing this copy, then publish.",
    });
  }
  if (input.preflightMobileOverflowErrors > 0) {
    reasons.push({
      key:
        input.preflightMobileOverflowErrors === 1
          ? "{count} block overflows the mobile viewport horizontally. A page that scrolls sideways on phones cannot be published. Use \"Show on canvas\" above to fix each one, then publish."
          : "{count} blocks overflow the mobile viewport horizontally. A page that scrolls sideways on phones cannot be published. Use \"Show on canvas\" above to fix each one, then publish.",
      count: input.preflightMobileOverflowErrors,
    });
  }
  const nonOverflowBlockers =
    input.preflightBlockingErrors - input.preflightMobileOverflowErrors;
  if (nonOverflowBlockers > 0) {
    reasons.push({
      key: "Something on your page needs fixing before you can publish. Fix the items marked Blocker above. Warnings do not stop publish.",
    });
  }
  if (input.compositionCasVersionMissing) {
    reasons.push({ key: "Page version is unavailable. Reload and try again." });
  }
  return reasons;
}
