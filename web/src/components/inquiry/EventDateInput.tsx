"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { usePublicT } from "@/i18n/use-public-t";

/**
 * Event date input that shows an inline error for a half-typed native value
 * (e.g. 02/08/yyyy), which the browser otherwise only flags with its own popup.
 */
export function EventDateInput({
  value, onChange, style, onIncompleteChange,
}: { value: string; onChange: (v: string) => void; style: CSSProperties; onIncompleteChange?: (incomplete: boolean) => void }) {
  const t = usePublicT();
  const [incomplete, setIncomplete] = useState(false);
  const errorId = useId();
  const report = (bad: boolean) => {
    setIncomplete(bad);
    onIncompleteChange?.(bad);
  };
  // If the field unmounts (review step, mode change) while half-typed, release the Send hold.
  useEffect(() => () => onIncompleteChange?.(false), [onIncompleteChange]);
  return (
    <>
      <input
        type="date"
        value={value}
        onChange={(e) => {
          report(e.target.validity.badInput);
          onChange(e.target.value);
        }}
        onBlur={(e) => report(e.target.validity.badInput)}
        aria-invalid={incomplete || undefined}
        aria-describedby={incomplete ? errorId : undefined}
        style={style}
      />
      {incomplete ? (
        <p id={errorId} role="alert" style={{ margin: "4px 0 0", fontSize: 12, color: "#b3261e" }}>
          {t("public.inquiryDrawer.dateIncompleteError")}
        </p>
      ) : null}
    </>
  );
}
