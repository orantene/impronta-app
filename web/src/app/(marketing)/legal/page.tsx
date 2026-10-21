import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";

/**
 * TUL-1797: `/legal` (and `/es/legal`) answered 404 because only the documents
 * under it exist. The index goes to the Terms, keeping the visitor's language.
 */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function LegalIndexPage() {
  const locale = await getRequestLocale();
  redirect(withLocaleHref("/legal/terms", locale));
}
