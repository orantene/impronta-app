/**
 * Prefer the talent roster display name for hybrid owners so Admin chrome
 * matches Talento (onb1-22). `profiles.display_name` often stays the email
 * local-part from signup ("tulala-qa") while the talent profile holds the
 * real name ("QA Grok Uno").
 */
export function resolveHybridSessionDisplayName(opts: {
  profileDisplayName: string | null | undefined;
  talentDisplayName: string | null | undefined;
}): string | null {
  const talent = opts.talentDisplayName?.trim() || null;
  if (talent) return talent;
  const profile = opts.profileDisplayName?.trim() || null;
  return profile;
}
