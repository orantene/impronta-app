/**
 * Service presentation resolver flag.
 *
 * Env: SERVICE_PRESENTATION_RESOLVER_ENABLED=true (or 1). Default OFF: until
 * enabled the resolver returns the legacy marker and nothing changes behaviour.
 */
export function servicePresentationResolverEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.SERVICE_PRESENTATION_RESOLVER_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
