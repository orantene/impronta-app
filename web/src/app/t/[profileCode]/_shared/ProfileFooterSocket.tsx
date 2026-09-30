import type { CSSProperties } from "react";

import { TalentSiteSocket } from "@/components/talent-site/talent-site-socket";
import { buildSocketModel } from "@/lib/talent-site/footer-socket";

/**
 * The global Tulala footer socket on the legacy `/t/[profileCode]` templates
 * (Classic, Noir, Lumen, Atelier, Maison). One strip, the ONE Tulala credit,
 * and whitelabel hides the credit. Each template passes the CSS variables of
 * its own palette (surface, ink, line) so the strip is painted by that
 * template's tokens and keeps the same contrast as the page around it.
 */
export type ProfileSocketTokens = {
  surface: string;
  ink: string;
  line: string;
};

export function ProfileFooterSocket({
  locale,
  whitelabel,
  tokens,
}: {
  locale: string;
  whitelabel: boolean | undefined;
  tokens: ProfileSocketTokens;
}) {
  const model = buildSocketModel({
    locale,
    publicPathPrefix: "",
    supportedLocales: [],
    showCredit: true,
    whitelabel: Boolean(whitelabel),
    consentTooling: false,
    siteLinks: [],
  });
  const style = {
    "--token-color-surface-raised": tokens.surface,
    "--token-color-ink": tokens.ink,
    "--token-color-line": tokens.line,
  } as CSSProperties;
  return (
    <div style={style} data-profile-socket="">
      <TalentSiteSocket model={model} clearDock={false} />
    </div>
  );
}
