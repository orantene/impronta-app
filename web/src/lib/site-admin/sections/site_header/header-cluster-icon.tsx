/**
 * Header cluster glyphs.
 *
 * Was a 107-line `switch` holding a verbatim copy of every brand path already
 * present in `SocialGlyph` — the file's own comment admitted it was "the SAME
 * markup". Both are now thin views onto the icon registry, so a corrected path
 * is corrected everywhere instead of in one of two places.
 *
 * The class name and the 1.7 stroke are preserved so the curated header's CSS
 * and optical weight are unchanged.
 */

import { BuilderIconSvg } from "@/lib/site-admin/builder-node/builder-icon-svg";
import { socialPlatformIconName } from "@/lib/site-admin/builder-node/social-platform-icons";

export function ClusterIcon({ name }: { name: string }) {
  return (
    <BuilderIconSvg
      name={socialPlatformIconName(name)}
      className="site-header__cluster-icon"
      strokeWidth={1.7}
    />
  );
}
