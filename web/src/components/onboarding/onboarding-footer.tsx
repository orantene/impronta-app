import Link from "next/link";
import { resolveMarketingOrigin } from "@/lib/brand/marketing-origin";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { createTranslator } from "@/i18n/messages";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

/**
 * The one footer for the signup front door. Shared by the /onboarding layout and the
 * /start layout (TUL-1910: /onboarding/role redirects to /start, which had no footer).
 */
export async function OnboardingFooter() {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const legalLine = getMarketingCopy(locale).footer.legalLine;
  const labels = { terms: t("public.onboardingShell.terms"), privacy: t("public.onboardingShell.privacy"), contact: t("public.onboardingShell.contact") };
  return (
    <footer
      className="mt-12 py-8"
      style={{
        borderTop: "1px solid var(--plt-hairline)",
        background: "var(--plt-bg)",
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-5 sm:flex-row sm:px-8">
        <p
          className="text-[0.75rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          {/* Same copyright line as the marketing footer's bottom rail; the
              category message lives in the logo lockup only. */}
          © {new Date().getFullYear()} {PLATFORM_BRAND.legalName}. {legalLine}
        </p>
        <div className="flex items-center gap-5 text-[0.75rem]">
          {/* TUL-1057: these used to be built unprefixed, so a Spanish
              onboarding session's footer links dropped the `/es` prefix and
              landed on the English Terms/Privacy pages. */}
          <Link
            href={`${resolveMarketingOrigin()}${withLocaleHref("/legal/terms", locale)}`}
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            {labels.terms}
          </Link>
          <Link
            href={`${resolveMarketingOrigin()}${withLocaleHref("/legal/privacy", locale)}`}
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            {labels.privacy}
          </Link>
          {/* /about, not /contact: the marketing host has no /contact page
              (it is not in MARKETING_PAGE_PREFIXES, and the CMS clean-URL
              rewrite that would rescue it is agency-hosts-only), so this
              footer link 404'd on every surface. /about is the contact
              surface. */}
          <Link
            href={`${resolveMarketingOrigin()}/about`}
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            {labels.contact}
          </Link>
        </div>
      </div>
    </footer>
  );
}
