export type ActionResultCode =
  | "validation_error"
  | "version_conflict"
  | "permission_denied"
  | "precondition_failed"
  | "server_error"
  | "timeout"
  | "locked_status";

/**
 * Action result with categorical failure codes for the inquiry workspace UI
 * (routes failures to inline error / blocker banner / toast based on `code`
 * — see `handleActionResult` below).
 *
 * Distinct from `ServerActionResult<T>` (`@/lib/server-actions/result`),
 * which is the canonical generic shape used elsewhere. Both share the `ok`
 * discriminator; the difference is the failure payload (`code` + `message`
 * vs. `error`). Kept separate intentionally — the inquiry engine UX layer
 * needs the code routing, while plain action callers only need a string.
 */
export type ActionResult<T = void> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; code: ActionResultCode; message: string };

export type ActionResultHandler = {
  onInlineError?: (message: string) => void;
  onBlockerBanner?: (message: string) => void;
  onToast?: (message: string) => void;
  onRefresh?: () => void;
};

export function handleActionResult<T>(
  result: ActionResult<T>,
  handlers: ActionResultHandler,
): boolean {
  if (result.ok) {
    if (result.message) handlers.onToast?.(result.message);
    handlers.onRefresh?.();
    return true;
  }
  switch (result.code) {
    case "validation_error":
    case "precondition_failed":
    case "version_conflict":
      handlers.onInlineError?.(result.message);
      break;
    case "permission_denied":
    case "server_error":
    case "locked_status":
      handlers.onBlockerBanner?.(result.message);
      break;
    case "timeout":
      handlers.onInlineError?.(result.message);
      break;
    default:
      handlers.onInlineError?.(result.message);
  }
  return false;
}
