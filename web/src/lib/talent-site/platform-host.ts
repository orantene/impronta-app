/** Host kinds where `/t/<code>` may render the talent-owned Max personal site. */
export function isTalentProfilePlatformHost(kind: string): boolean {
  return kind === "app" || kind === "marketing";
}
