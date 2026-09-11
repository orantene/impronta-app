"use client";

import { useState } from "react";
import { createTenantPromo } from "./actions";

export function DiscountForm() {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        void createTenantPromo({
          code,
          kind,
          value: Number(value),
        }).then((r) => {
          setBusy(false);
          setMsg(r.ok ? "saved" : r.error);
          if (r.ok) setCode("");
        });
      }}
      style={{ display: "grid", gap: 12, maxWidth: 360 }}
    >
      <label>
        Code
        <input
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          style={{ display: "block", width: "100%", minHeight: 44 }}
        />
      </label>
      <label>
        Kind
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "percent" | "amount")}
          style={{ display: "block", width: "100%", minHeight: 44 }}
        >
          <option value="percent">percent</option>
          <option value="amount">amount</option>
        </select>
      </label>
      <label>
        Value
        <input
          name="value"
          type="number"
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          style={{ display: "block", width: "100%", minHeight: 44 }}
        />
      </label>
      <button type="submit" disabled={busy} style={{ minHeight: 44 }}>
        {busy ? "Saving" : "Add code"}
      </button>
      {msg ? <p role="status">{msg}</p> : null}
    </form>
  );
}
