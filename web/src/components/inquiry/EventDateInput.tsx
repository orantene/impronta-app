"use client";

import { useId, useState, type CSSProperties } from "react";
import { usePublicT } from "@/i18n/use-public-t";

/**
 * Event date input that shows an inline error for a half-typed native value
 * (e.g. 02/08/yyyy), which the browser otherwise only flags with its own popup.
 */
export function EventDateInput({
  value, onChange, style,
}: { value: string; onChange: (v: string) => void; style: CSSProperties }) {
  const t = usePublicT();
  const [incomplete, setIncomplete] = useState(false);
  const errorId = useId();
  return (
    <>
      <input
        type="date"
        value={value}
        onChange={(e) => {
          setIncomplete(e.target.validity.badInput);
          onChange(e.target.value);
        }}
        onBlur={(e) => setIncomplete(e.target.validity.badInput)}
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
