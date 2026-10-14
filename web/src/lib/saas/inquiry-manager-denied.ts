/**
 * Copy for the "not allowed to manage this inquiry" denial. Talents reach
 * this guard as appointed coordinators, so the wording says what to do next
 * instead of naming a role they may never have heard of.
 */
export function inquiryManagerDeniedMessage(locale: string | null | undefined): string {
  const lang = (locale ?? "en").toLowerCase().split("-")[0];
  if (lang === "es") {
    return "No tienes permiso para gestionar esta consulta. Pide al equipo de la agencia que te asigne como coordinador.";
  }
  return "You don't have permission to manage this inquiry. Ask the agency team to assign you as its coordinator.";
}

/** Resolves the request locale for the denial copy; never throws. */
export async function resolveDeniedLocale(): Promise<string> {
  try {
    const { getRequestLocale } = await import("@/i18n/request-locale");
    return await getRequestLocale();
  } catch {
    return "en";
  }
}
