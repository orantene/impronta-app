/**
 * The quiet "ES missing" chip on a catalog list row. The decision is
 * `missingTitleLocale` (two languages, one title empty); this only draws it.
 * Kept free of hooks and the shell context so it renders in isolation: the
 * caller hands in the talent's `primary` and `locales` (from the server
 * settings, never from the client store alone) and the `t` function.
 */
import type { ReactNode } from "react";

import { languageName } from "@/lib/i18n/locale-field-model";
import { missingTitleLocale } from "@/lib/talent/offering-missing-translation";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { Chip } from "./catalog-chip";

export function MissingTranslationChip({
  item,
  primary,
  locales,
  uiLocale,
  t,
  className,
}: {
  item: Pick<TalentOffering, "title" | "titleI18n">;
  primary: string;
  locales: readonly string[];
  uiLocale: string;
  t: (key: string) => string;
  className?: string;
}): ReactNode {
  const lang = missingTitleLocale(item, primary, locales);
  if (!lang) return null;
  return (
    <span
      className={className}
      title={t("dashboard.catalog.list.langMissingHint").replace("{language}", languageName(lang, uiLocale))}
      data-testid="catalog-row-lang-missing"
    >
      <Chip>{t("dashboard.catalog.list.langMissing").replace("{lang}", lang.toUpperCase())}</Chip>
    </span>
  );
}
