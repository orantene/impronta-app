"use client";

/**
 * Service name + short description, per language (PR 7). The plain `title` /
 * `description` always mirror the PRIMARY language; `titleI18n` /
 * `descriptionI18n` carry every language and ride the normal Save
 * (`offeringToRowPatch` keeps the other languages).
 */
import { LocaleField } from "@/components/admin/shell/internal/primitives/locale-field";
import { useTalentFieldLocales } from "@/components/locale-field/use-talent-field-locales";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function OfferingNameField({
  item,
  label,
  inputClass,
  patch,
}: {
  item: TalentOffering;
  label: string;
  inputClass: string;
  patch: (partial: Partial<TalentOffering>) => void;
}) {
  const { primary, locales, seeded } = useTalentFieldLocales();
  const map = { ...(item.titleI18n ?? {}), [primary]: item.title };
  return (
    <LocaleField
      label={label}
      value={map}
      locales={locales}
      primary={primary}
      ai={{ field: "offering_title" }}
      onChange={(l, v) =>
        // Unseeded (languages unknown): write the plain column only, never a map entry.
        patch(seeded ? { titleI18n: { ...map, [l]: v }, ...(l === primary ? { title: v } : {}) } : { title: v })
      }
      renderInput={(a) => (
        <input
          id={a.id}
          className={inputClass}
          maxLength={120}
          value={a.value}
          placeholder={a.placeholder}
          readOnly={a.readOnly}
          onChange={(e) => a.onChange(e.target.value)}
        />
      )}
    />
  );
}

export function OfferingDescriptionField({
  item,
  label,
  inputClass,
  patch,
}: {
  item: TalentOffering;
  label: string;
  inputClass: string;
  patch: (partial: Partial<TalentOffering>) => void;
}) {
  const { primary, locales, seeded } = useTalentFieldLocales();
  const map = { ...(item.descriptionI18n ?? {}), [primary]: item.description ?? "" };
  return (
    <LocaleField
      label={label}
      value={map}
      locales={locales}
      primary={primary}
      ai={{ field: "offering_description" }}
      onChange={(l, v) =>
        patch(
          seeded
            ? { descriptionI18n: { ...map, [l]: v }, ...(l === primary ? { description: v || null } : {}) }
            : { description: v || null },
        )
      }
      renderInput={(a) => (
        <textarea
          id={a.id}
          rows={2}
          maxLength={280}
          className={inputClass}
          value={a.value}
          placeholder={a.placeholder}
          readOnly={a.readOnly}
          onChange={(e) => a.onChange(e.target.value)}
        />
      )}
    />
  );
}
