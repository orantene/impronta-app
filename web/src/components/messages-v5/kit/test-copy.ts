/** Test helper: the kit copy built from the EN catalogue, the way a screen would build it. */

import { createTranslator } from "@/i18n/messages";

import { buildKitCopy, type KitCopy } from "./copy";

export const EN_COPY: KitCopy = buildKitCopy(createTranslator("en"));
export const ES_COPY: KitCopy = buildKitCopy(createTranslator("es"));
export const FR_COPY: KitCopy = buildKitCopy(createTranslator("fr"));
