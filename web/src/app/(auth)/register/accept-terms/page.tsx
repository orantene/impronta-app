import { redirect } from "next/navigation";

import { AuthCard, AuthHeading } from "@/components/auth/auth-ui";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { normalizeNextPath } from "@/lib/auth-flow";
import { getCachedActorSession } from "@/lib/server/request-cache";

import { AcceptTermsForm } from "./accept-terms-form";

/**
 * Legal 2.2: one-time step for a brand-new Google account (the OAuth provider
 * cannot carry the signup checkbox). The auth callback sends a fresh Google
 * signup here only when it has no signup acceptance on record; everyone else
 * never sees this page.
 */
export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const session = await getCachedActorSession();
  if (!session.user) redirect("/login");
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  return (
    <div className="w-full">
      <AuthHeading
        title={t("public.auth.acceptTerms.title")}
        description={t("public.auth.acceptTerms.description")}
      />
      <AuthCard>
        <AcceptTermsForm nextPath={normalizeNextPath(next)} locale={locale} />
      </AuthCard>
    </div>
  );
}
