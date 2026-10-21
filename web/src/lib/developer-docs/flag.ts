/**
 * Developer docs flag (TUL-1401).
 *
 * Env: DEVELOPER_DOCS_ENABLED=true (or 1). Default OFF. Off: docs.tulala.digital keeps
 * hopping to the help center and the /developers pages 404.
 */
export function developerDocsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.DEVELOPER_DOCS_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
