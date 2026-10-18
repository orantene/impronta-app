// TUL-1241: `/talent/support` and `/talent/help` are the URLs people guess for the
// support panel. They have no page of their own; the catch-all opens the panel.

const SUPPORT_ALIASES: ReadonlySet<string> = new Set(["support", "help"]);

export function isTalentSupportAlias(segments: ReadonlyArray<string>): boolean {
  return segments.length === 1 && SUPPORT_ALIASES.has((segments[0] ?? "").toLowerCase());
}
