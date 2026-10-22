/**
 * TUL-1887: the label on a thread reply. A talent's reply read "Tulala Hub" on the client
 * thread because the sender's account name was a platform/hub label. A reply from a talent is
 * labelled with the talent's own display name; a real person name on the account still wins.
 * Pure.
 */
const PLATFORM_LABEL = /\bhub\b/i;

export function threadSenderLabel(input: {
  accountName: string | null | undefined;
  talentDisplayName: string | null | undefined;
  fallback: string;
}): string {
  const account = input.accountName?.trim() ?? "";
  const talent = input.talentDisplayName?.trim() ?? "";
  if (talent && (!account || PLATFORM_LABEL.test(account))) return talent;
  return account || input.fallback;
}
