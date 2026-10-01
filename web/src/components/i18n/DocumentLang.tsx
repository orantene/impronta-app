"use client";

import { useLayoutEffect } from "react";

/**
 * Keeps `<html lang>` equal to the locale the page body actually rendered in.
 * The root layout resolves `lang` from the request locale, but a talent site is
 * bounded to the talent's own languages (an English-only talent renders English
 * even when the visitor asked for Spanish), so the body is the source of truth.
 * Renders nothing.
 */
export function DocumentLang({ locale }: { locale: string }) {
  useLayoutEffect(() => {
    if (locale && document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }
  }, [locale]);
  return null;
}
