import { changelogFeedResponse } from "@/lib/changelog/feed";
import { getRequestLocale } from "@/i18n/request-locale";

export const dynamic = "force-dynamic";

export async function GET() {
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  return changelogFeedResponse(locale);
}
