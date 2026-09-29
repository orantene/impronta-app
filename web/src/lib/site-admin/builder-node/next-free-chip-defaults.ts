import type { BuilderNextFreeChipNode } from "./types";

/** Defaults for a freshly inserted `next_free_chip` (shared hero / band widget). */
export const NEXT_FREE_CHIP_DEFAULT_PROPS: BuilderNextFreeChipNode["props"] = {
  labelEn: "Next free",
  labelEs: "Próximo libre",
  days: 14,
  useWebsiteTheme: true,
};
