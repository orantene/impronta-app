"use client";

import { TALENT_CURRENCY_OPTIONS } from "@/lib/billing/currencies";

/** MXN / USD picker for one service (TUL-97). A row saved in another code keeps it visible. */
export function CurrencyField({
  value,
  label,
  labelClass,
  inputClass,
  onChange,
}: {
  value: string;
  label: string;
  labelClass: string;
  inputClass: string;
  onChange: (currency: string) => void;
}) {
  const known = TALENT_CURRENCY_OPTIONS.includes(value as (typeof TALENT_CURRENCY_OPTIONS)[number]) || !value;
  const options: string[] = known ? [...TALENT_CURRENCY_OPTIONS] : [...TALENT_CURRENCY_OPTIONS, value];
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select
        className={inputClass}
        data-testid="service-editor-currency"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
