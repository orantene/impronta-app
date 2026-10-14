// TUL-724: who sees what in the profile editor rail. The agency "Back office"
// group (files, agency fields, admin) is for agency staff; the talent editing
// their own profile never sees it. The first-time hero is onboarding chrome
// and never shows on a published profile.

export function visibleRailGroups<G extends { slug: string }>(groups: G[], isSelf: boolean): G[] {
  return isSelf ? groups.filter((g) => g.slug !== "back_office") : groups;
}

export function shouldShowOnboardingHero(args: {
  completeness: number;
  profileStatus: string;
  dismissed: boolean;
}): boolean {
  return args.completeness < 35 && args.profileStatus !== "published" && !args.dismissed;
}
