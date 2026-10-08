"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import {
  OFFERING_MATRIX_TEXT_MAX,
  offeringMatrixFromAttributes,
  patchOfferingMatrix,
  type OfferingMatrixKey,
} from "@/lib/talent/offering-matrix";

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim";
const INPUT =
  "mt-1.5 w-full rounded-lg border border-admin-border-soft bg-white px-3 py-2.5 text-[15px] text-admin-ink outline-none focus:border-emerald-900/50";

/**
 * Optional typed fields the services comparison matrix reads: materials,
 * warranty and response time, in English and Spanish, plus the emergency flag.
 * Stored in `attributes.matrix` (no migration). Empty fields are removed, and
 * the matrix hides a row no service filled, so nothing here is required.
 */
export function MatrixFields({
  attributes,
  onChange,
}: {
  attributes: Record<string, unknown> | null | undefined;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const copy = useDashboardText();
  const matrix = offeringMatrixFromAttributes(attributes);
  // Read the stored text untrimmed so a trailing space does not jump the cursor.
  const rawMatrix = (attributes?.matrix ?? {}) as Record<string, unknown>;
  const raw = (key: OfferingMatrixKey, lang: "en" | "es"): string => {
    const t = rawMatrix[key];
    if (typeof t === "string") return t;
    const v = (t as Record<string, unknown> | undefined)?.[lang];
    return typeof v === "string" ? v : "";
  };
  const fields: Array<{ key: OfferingMatrixKey; label: string; hint: string }> = [
    { key: "materials", label: copy.t("Materials"), hint: copy.t("Who buys them and how it is priced") },
    { key: "warranty", label: copy.t("Warranty"), hint: copy.t("For example: 6 months, in writing") },
    { key: "response", label: copy.t("Response time"), hint: copy.t("For example: within 24 hours") },
  ];
  return (
    <div className="border-t border-admin-border-soft pt-5" data-matrix-fields="">
      <p className={LABEL}>{copy.t("Comparison details")}</p>
      <p className="mt-1 text-[13px] text-admin-ink-dim">
        {copy.t("Optional. Shown in the services comparison. A row nobody fills stays hidden.")}
      </p>
      <div className="mt-3 space-y-4">
        {fields.map((f) => (
          <div key={f.key}>
            <p className="text-[14px] font-semibold text-admin-ink">{f.label}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["en", "es"] as const).map((lang) => (
                <label key={lang} className="block">
                  <span className="text-[12px] text-admin-ink-dim">{lang === "en" ? "English" : "Español"}</span>
                  <input
                    type="text"
                    className={INPUT}
                    maxLength={OFFERING_MATRIX_TEXT_MAX}
                    placeholder={f.hint}
                    value={raw(f.key, lang)}
                    onChange={(e) => onChange(patchOfferingMatrix(attributes, { key: f.key, lang, value: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <label className="flex items-center gap-2 text-[14px] text-admin-ink">
          <input
            type="checkbox"
            checked={matrix.emergency === true}
            onChange={(e) => onChange(patchOfferingMatrix(attributes, { key: "emergency", value: e.target.checked }))}
          />
          {copy.t("This is my emergency service")}
        </label>
        <p className="-mt-2 text-[13px] text-admin-ink-dim">
          {copy.t("The comparison highlights this one while you are taking emergencies today.")}
        </p>
      </div>
    </div>
  );
}
