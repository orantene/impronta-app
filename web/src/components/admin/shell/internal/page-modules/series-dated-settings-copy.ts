/**
 * Copy for the dated-places block of the Series editor (TUL-1344 slice 3).
 * Self-contained EN + ES; the dashboard locale picks one, anything else reads English.
 */
export type DatedSettingsCopy = {
  title: string;
  stopSelling: string;
  stopSellingHint: string;
  minutesBefore: string;
  perTier: string;
  perTierHint: string;
  noTiers: string;
  tierPlaceholder: string;
  save: string;
  saved: string;
  failed: string;
  saveFirst: string;
};

export const DATED_SETTINGS_COPY: Record<"en" | "es", DatedSettingsCopy> = {
  en: {
    title: "Spots and sales",
    stopSelling: "Stop selling before the start",
    stopSellingHint: "Leave empty to sell until the class starts.",
    minutesBefore: "minutes before",
    perTier: "Spots per date",
    perTierHint: "Optional cap for each price. The total above still applies.",
    noTiers: "This item has one price, so all spots are shared.",
    tierPlaceholder: "No cap",
    save: "Save spots and sales",
    saved: "Saved.",
    failed: "Could not save. Try again in a moment.",
    saveFirst: "Save the series first.",
  },
  es: {
    title: "Lugares y ventas",
    stopSelling: "Dejar de vender antes del inicio",
    stopSellingHint: "Déjalo vacío para vender hasta que empiece la clase.",
    minutesBefore: "minutos antes",
    perTier: "Lugares por fecha",
    perTierHint: "Tope opcional para cada precio. El total de arriba sigue aplicando.",
    noTiers: "Este servicio tiene un solo precio, así que los lugares son compartidos.",
    tierPlaceholder: "Sin tope",
    save: "Guardar lugares y ventas",
    saved: "Guardado.",
    failed: "No se pudo guardar. Inténtalo de nuevo en un momento.",
    saveFirst: "Guarda primero la serie.",
  },
};

export function datedSettingsCopy(locale: string): DatedSettingsCopy {
  return locale.toLowerCase().startsWith("es") ? DATED_SETTINGS_COPY.es : DATED_SETTINGS_COPY.en;
}
