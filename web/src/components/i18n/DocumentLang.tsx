"use client";

import { useLayoutEffect } from "react";

import { documentLangBootstrapScript, documentLangToken } from "@/i18n/document-lang";

/**
 * Keeps `<html lang>` equal to the locale the page body actually rendered in.
 * The root layout resolves `lang` from the request locale, but a talent site is
 * bounded to the talent's own languages (an English-only talent renders English
 * even when the visitor asked for Spanish), so the body is the source of truth.
 *
 * TUL-516 S3: also emit a sync bootstrap script so the attribute matches before
 * paint (useLayoutEffect alone left `lang="es"` while the English UI painted).
 */
export function DocumentLang({ locale }: { locale: string }) {
  const token = documentLangToken(locale);
  const bootstrap = documentLangBootstrapScript(locale);

  useLayoutEffect(() => {
    if (token && document.documentElement.lang !== token) {
      document.documentElement.lang = token;
    }
  }, [token]);

  if (!bootstrap) return null;
  return <script dangerouslySetInnerHTML={{ __html: bootstrap }} />;
}
