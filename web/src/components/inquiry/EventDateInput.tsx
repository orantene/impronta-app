"use client";

import { useState, type CSSProperties } from "react";
import { useT } from "@/i18n/use-t";

/**
 * Event date input that shows an inline error for a half-typed native value
 * (e.g. 02/08/yyyy), which the browser otherwise only flags with its own popup.
 */
export function EventDateInput({
  value, onChange, style,
}: { value: string; onChange: (v: string) => void; style: CSSProperties }) {
  const t = useT();
  const [incomplete, setIncomplete] = useState(false);
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
        style={style}
      />
      {incomplete ? (
        <p role="alert" style={{ margin: "4px 0 0", fontSize: 12, color: "#b3261e" }}>
          {t("public.inquiryDrawer.dateIncompleteError")}
        </p>
      ) : null}
    </>
  );
}
