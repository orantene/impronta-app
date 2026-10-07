/** Swap the literal `<code>` placeholder in a catalog label for the talent's real profile code. */
export function personalPageLabel(label: string, profileCode: string | null | undefined): string {
  return profileCode ? label.replace("<code>", profileCode) : label;
}
