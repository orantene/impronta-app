/**
 * redirect-query.ts
 *
 * Shared helper for thin root-route resolvers (app/admin, app/talent,
 * app/client) that need to forward incoming query parameters when
 * redirecting users to their tenant-scoped workspace path.
 *
 * Hash fragments are NOT preserved — they aren't sent to the server, so
 * a server-side redirect can't see or forward them.
 */

export function buildQuerySuffix(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string {
  if (!searchParams) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v !== undefined) params.append(key, v);
      }
    } else {
      params.append(key, value);
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
