/**
 * F75: the owner-only banner on a draft preview. EN + ES, no em dash (house
 * rule). One source so the two renderers cannot drift.
 */
export function draftPreviewBannerText(locale: string | null | undefined): string {
  return typeof locale === "string" && locale.toLowerCase().startsWith("es")
    ? "Vista previa del borrador. Los visitantes ven la versión publicada hasta que vuelvas a publicar."
    : "Draft preview. Visitors see the published version until you publish again.";
}
