/** Test helper: the screen copy (kit + shell) built from the catalogues. */

import { createTranslator } from "@/i18n/messages";

import { buildScreenCopy, type ScreenCopy } from "./copy";

export const EN_SCREEN: ScreenCopy = buildScreenCopy(createTranslator("en"));
export const ES_SCREEN: ScreenCopy = buildScreenCopy(createTranslator("es"));
export const FR_SCREEN: ScreenCopy = buildScreenCopy(createTranslator("fr"));
