"use client";

/**
 * G4: "Contact" group in Website settings. The public call number is opt-in
 * and separate from the private profile phone. It has its own Save (it does
 * not join the shared settings draft) and clearing it removes the call button.
 */

import { useEffect, useState } from "react";
import { loadCallNumberAction, saveCallNumberAction } from "./call-number-action";
import { SettingsCard } from "./primitives";

type T = (s: string) => string;

export function CallNumberGroup({ t }: { t: T }) {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "invalid" | "failed" | "done">("idle");

  useEffect(() => {
    let alive = true;
    void loadCallNumberAction().then((r) => {
      if (!alive) return;
      setSaved(r ? r.number : null);
      setValue(r?.number ?? "");
    });
    return () => {
      alive = false;
    };
  }, []);

  if (saved === undefined) return null;

  const dirty = value.trim() !== (saved ?? "");
  const save = async () => {
    setState("saving");
    const res = await saveCallNumberAction(value);
    if (res.ok) {
      setSaved(res.number);
      setValue(res.number ?? "");
      setState("done");
    } else setState(res.error === "invalid_number" ? "invalid" : "failed");
  };

  return (
    <SettingsCard>
      <label className="block py-2">
        <span className="block text-[14px] font-semibold text-admin-ink">{t("Show a call button")}</span>
        <span className="mt-0.5 block text-[12.5px] text-admin-ink-muted">
          {t(
            "Enter a number clients can call from your website. Leave it empty to hide the call button. Your private phone is never shown.",
          )}
        </span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={value}
          placeholder="+52 81 1234 5678"
          onChange={(e) => {
            setValue(e.target.value);
            setState("idle");
          }}
          className="mt-2 min-h-[44px] w-full rounded-lg border border-admin-border-soft bg-white px-3 text-[14px] text-admin-ink"
        />
      </label>
      {state === "invalid" ? (
        <p role="alert" className="pb-2 text-[12.5px] text-red-800">
          {t("Use the full international number, starting with + and the country code.")}
        </p>
      ) : null}
      {state === "failed" ? (
        <p role="alert" className="pb-2 text-[12.5px] text-red-800">
          {t("Could not save. Try again.")}
        </p>
      ) : null}
      {state === "done" ? (
        <p role="status" className="pb-2 text-[12.5px] text-emerald-900">
          {saved ? t("Call button is on.") : t("Call button is off.")}
        </p>
      ) : null}
      <button
        type="button"
        onClick={save}
        disabled={!dirty || state === "saving"}
        className="mb-1 min-h-[44px] w-full rounded-lg bg-[var(--tc-action)] px-4 text-[14px] font-semibold text-white hover:bg-[var(--tc-action-hover)] disabled:opacity-40"
      >
        {state === "saving" ? t("Saving…") : t("Save")}
      </button>
    </SettingsCard>
  );
}
