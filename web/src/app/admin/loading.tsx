import { TalentShellSkeleton } from "@/app/(workspace)/talent/_talent-shell-skeleton";

/**
 * TUL-946: /admin is a server-side resolver (session, tenant, membership)
 * that redirects on. Without a loading boundary the browser shows a blank
 * white page until the redirect lands. Most sign-ins end on the talent
 * dashboard, so paint its shell skeleton right away.
 */
export default function AdminResolverLoading() {
  return <TalentShellSkeleton />;
}
