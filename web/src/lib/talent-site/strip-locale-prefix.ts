/** Pure: no request, no database. */

/** `/es/servicios/x` -> `/servicios/x` when `es` is one of the site's languages. */
export function stripLocalePrefix(pathname: string, publicLocales: readonly string[]): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] && publicLocales.some((l) => l.toLowerCase() === parts[0].toLowerCase())) parts.shift();
  return `/${parts.join("/")}`;
}
