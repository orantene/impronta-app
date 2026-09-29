import type { BuilderCompCardNode } from "./types";

/** Curated measure keys (Noir vitals order). Short labels for the strip. */
export type CompCardMeasureSpec = {
  fieldKey: string;
  labelEn: string;
  labelEs: string;
  unit?: string;
};

export const COMP_CARD_MEASURE_CATALOG: readonly CompCardMeasureSpec[] = [
  { fieldKey: "physical.height_cm", labelEn: "Height", labelEs: "Altura" },
  { fieldKey: "physical.bust_cm", labelEn: "Bust", labelEs: "Busto" },
  { fieldKey: "physical.waist_cm", labelEn: "Waist", labelEs: "Cintura" },
  { fieldKey: "physical.hips_cm", labelEn: "Hips", labelEs: "Cadera" },
  { fieldKey: "physical.suit_size", labelEn: "Suit", labelEs: "Saco" },
  {
    fieldKey: "physical.shoe_size_eu",
    labelEn: "Shoe",
    labelEs: "Calzado",
    unit: "EU",
  },
  { fieldKey: "physical.dress_size", labelEn: "Dress", labelEs: "Talla" },
  { fieldKey: "physical.hair_color", labelEn: "Hair", labelEs: "Cabello" },
  { fieldKey: "physical.eye_color", labelEn: "Eyes", labelEs: "Ojos" },
  { fieldKey: "languages", labelEn: "Languages", labelEs: "Idiomas" },
] as const;

export const COMP_CARD_MEASURES_MAX = 16;

/** Default props for a freshly inserted `comp_card` (measure strip) block. */
export const COMP_CARD_DEFAULT_PROPS: BuilderCompCardNode["props"] = {
  layout: "strip_with_details",
  eyebrow: "",
  title: "",
  measures: COMP_CARD_MEASURE_CATALOG.map((m) => ({
    fieldKey: m.fieldKey,
    enabled: true,
    labelEn: m.labelEn,
    labelEs: m.labelEs,
    ...(m.unit ? { unit: m.unit } : {}),
  })),
  minMeasures: 4,
  showFullDetails: true,
  detailsSummaryEn: "Full comp card",
  detailsSummaryEs: "Ficha completa",
  useWebsiteTheme: true,
};

export type CompCardLayout = NonNullable<BuilderCompCardNode["props"]["layout"]>;

export const COMP_CARD_LAYOUTS: readonly CompCardLayout[] = [
  "strip",
  "strip_with_details",
] as const;

/** Fresh props for create / kit stamps (measures cloned). */
export function cloneCompCardDefaultProps(): BuilderCompCardNode["props"] {
  return {
    ...COMP_CARD_DEFAULT_PROPS,
    measures: (COMP_CARD_DEFAULT_PROPS.measures ?? []).map((m) => ({ ...m })),
  };
}

export function catalogSpecForKey(fieldKey: string): CompCardMeasureSpec | undefined {
  return COMP_CARD_MEASURE_CATALOG.find((m) => m.fieldKey === fieldKey);
}
