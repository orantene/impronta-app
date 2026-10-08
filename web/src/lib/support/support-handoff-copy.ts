import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { SUPPORT_AGENT_VARS } from "@/lib/support/support-persona";

/**
 * Plain-text body of the "ticket is with <agent>" hand-off card. It is what the
 * ticket list shows as the preview and what email falls back to, so it must be
 * in the requester's language (it was hard-coded English).
 */
export function supportHandoffBody(locale: string | null | undefined): string {
  const t = createTranslator(locale?.trim() || "en");
  return `${interpolate(t("dashboard.adminSupport.handoffTitle"), SUPPORT_AGENT_VARS)}.`;
}

/** Requester's dashboard locale from the request cookie; "en" outside a request. */
export async function requestSupportLocale(): Promise<string> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return jar.get("locale")?.value?.trim() || "en";
  } catch {
    return "en";
  }
}
