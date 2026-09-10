/**
 * The shape `createTranslator()` (`@/i18n/messages`) already returns.
 * Named here rather than imported so this directory's own modules do not
 * need to import the i18n module just to type a parameter.
 */
export type Translator = (key: string) => string;
