/**
 * Path matching primitives. Deliberately tiny and dependency-free: everything
 * else in this area is data plus one of these three predicates.
 *
 * Extracted from `surface-allow-list.ts`; that file is now the barrel and
 * remains the import path for every consumer.
 */

export function hasPrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  return pathname.startsWith(`${prefix}/`);
}

export function anyPrefix(pathname: string, prefixes: readonly string[]): boolean {
  for (const p of prefixes) {
    if (hasPrefix(pathname, p)) return true;
  }
  return false;
}

export function anyExact(pathname: string, exact: readonly string[]): boolean {
  for (const e of exact) {
    if (pathname === e) return true;
  }
  return false;
}
