/**
 * The Tulala Organization / WebSite / SoftwareApplication JSON-LD is the platform's own identity.
 * It is wrong on any tenant storefront (publicScope) and on a talent personal site, where the
 * page already carries its own ProfilePage entity.
 */
export function shouldEmitPlatformJsonLd(input: { hasPublicScope: boolean; hostContext: string | null }): boolean {
  return !input.hasPublicScope && input.hostContext !== "talent_site";
}
