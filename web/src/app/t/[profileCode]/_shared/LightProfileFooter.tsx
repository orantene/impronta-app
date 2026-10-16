import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import type { Locale } from "@/i18n/config";

import { ProfileFooterSocket } from "./ProfileFooterSocket";

/** Classic profile footer (agency host only): CMS nav, then the global Tulala socket. */
export function LightProfileFooter({
  locale,
  whitelabel,
  profileCode,
}: {
  locale: Locale;
  whitelabel: boolean | undefined;
  profileCode?: string | null;
}) {
  return (
    <>
      <footer
        className="border-t px-4 py-8 sm:px-6 lg:px-8"
        style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg-deep)" }}
      >
        <div
          className="mx-auto flex max-w-4xl flex-col items-center gap-3 text-center text-sm"
          style={{ color: "var(--plt-muted)" }}
        >
          <PublicCmsFooterNav locale={locale} />
        </div>
      </footer>
      <ProfileFooterSocket
        locale={locale}
        whitelabel={whitelabel}
        profileCode={profileCode}
        tokens={{ surface: "var(--plt-bg-deep)", ink: "var(--plt-ink)", line: "var(--plt-hairline)" }}
      />
    </>
  );
}
