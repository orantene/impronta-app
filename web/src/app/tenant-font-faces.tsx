/**
 * TenantFontFaces — storefront `@font-face` injector for TENANT-UPLOADED
 * brand fonts (the licensed, self-hosted counterpart of GoogleFontsLink).
 *
 * Renders in the root layout, which every tenant-host request passes —
 * storefront pages, talent sites AND the builder's editor chrome — so the
 * canvas, the device-preview iframe (it clones the host <head>'s styles) and
 * the published page all see the same faces from the same rule set. The
 * metadata comes from `loadPublicBranding().theme_json.custom_fonts`, already
 * loaded by the layout for tokens; this component adds no query.
 *
 * Faces of families bound to the theme heading/body tokens are also
 * `<link rel="preload">`ed — those always paint above the fold, and the
 * preload removes the swap flash for exactly them without preloading fonts a
 * page might not use.
 */

import {
  parseTenantFonts,
  tenantFontFacesCss,
  tenantFontPreloadUrls,
} from "@/lib/site-admin/builder-node/tenant-fonts";

export function TenantFontFaces({
  themeJson,
  tokens,
}: {
  themeJson: Record<string, unknown> | null | undefined;
  tokens?: Readonly<Record<string, string>> | null;
}) {
  const families = parseTenantFonts(themeJson);
  if (families.length === 0) return null;
  const css = tenantFontFacesCss(families);
  const preloads = tenantFontPreloadUrls(families, tokens);
  return (
    <>
      {preloads.map((url) => (
        <link key={url} rel="preload" href={url} as="font" type="font/woff2" crossOrigin="" />
      ))}
      <style data-tenant-fonts="" dangerouslySetInnerHTML={{ __html: css }} />
    </>
  );
}
