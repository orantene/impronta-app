/** TUL-966: what the dock tray's "Send request" does. Never a silent fresh draft. */
export type TraySendAction = "submit" | "open_thread" | "start";

export function traySendAction(i: { draftExists: boolean; canSubmit: boolean; recordExists: boolean; promoted: boolean }): TraySendAction {
  if (i.draftExists && i.canSubmit) return "submit";
  if (i.recordExists && i.promoted) return "open_thread";
  return "start";
}

export function runTraySend(
  i: Parameters<typeof traySendAction>[0],
  h: { start: () => void; openChat: () => void; submit?: () => void },
): void {
  const a = traySendAction(i);
  if (a === "start") h.start(); else h.openChat();
  if (a === "submit") h.submit?.();
}
