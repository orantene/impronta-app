/** Test helper: the client link copy (and the kit copy) built from each catalogue, the way the page builds it. */

import { createTranslator } from "@/i18n/messages";

import { buildKitCopy, type KitCopy } from "../kit/copy";
import { buildClientCopy, type ClientCopy } from "./copy";

export const EN_CLIENT: ClientCopy = buildClientCopy(createTranslator("en"));
export const ES_CLIENT: ClientCopy = buildClientCopy(createTranslator("es"));
export const FR_CLIENT: ClientCopy = buildClientCopy(createTranslator("fr"));
export const EN_KIT: KitCopy = buildKitCopy(createTranslator("en"));
