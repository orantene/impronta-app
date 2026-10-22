import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

/**
 * TUL-1797: instant feedback for marketing pages that wait on the server
 * (legal, how-it-works). Shape of a page hero + a text card, tokens only,
 * no client JS. The label is announced to screen readers.
 */
export default async function MarketingLoading() {
  const t = createTranslator(await getRequestLocale());
  const bar = { background: "var(--plt-hairline)" } as const;
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-testid="marketing-page-loading"
      className="mx-auto w-full max-w-3xl animate-pulse px-5 py-16 sm:px-8"
    >
      <span className="sr-only">{t("public.pageLoading")}</span>
      <div className="h-3 w-24 rounded-full" style={bar} aria-hidden />
      <div className="mt-5 h-10 w-3/4 rounded-lg" style={bar} aria-hidden />
      <div className="mt-4 h-4 w-1/2 rounded-md" style={bar} aria-hidden />
      <div className="mt-10 space-y-3 rounded-[28px] p-8" style={{ border: "1px solid var(--plt-hairline)" }} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 rounded-md" style={{ ...bar, width: `${92 - i * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
