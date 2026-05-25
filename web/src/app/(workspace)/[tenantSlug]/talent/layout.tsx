/**
 * Legacy /{tenantSlug}/talent/* routes redirect in each page.tsx to /talent/*.
 * This layout is a pass-through so we do not mount the tenant-scoped shell twice.
 */
export default function LegacyTalentLayoutPassthrough({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
