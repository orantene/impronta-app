"use client";

/**
 * TUL-75 · agency-talent path: "Work with a studio" in talent Settings. The
 * talent pastes the studio's address; the studio's own join policy decides.
 */

import { useState, useTransition } from "react";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { joinStudioAction } from "@/lib/server-actions/join-studio";

import { JS_DESC, JS_ERRORS, JS_TITLE, JS_UI } from "./join-studio-copy";

export function JoinStudioCard() {
  const lang = useDashboardLocale().toLowerCase().startsWith("es") ? "es" : "en";
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSent(null);
    startTransition(async () => {
      const res = await joinStudioAction(value);
      if (!res.ok) {
        setError(JS_ERRORS[res.code][lang]);
        return;
      }
      setSent((res.status === "active" ? JS_UI.active : JS_UI.pending)[lang].replace("{studio}", res.studioName));
      setValue("");
    });
  }

  return (
    <div data-testid="join-studio-card" className="rounded-admin-lg border border-admin-border-soft bg-admin-card p-4">
      <div className="text-[13px] font-semibold text-admin-ink">{JS_TITLE[lang]}</div>
      <div className="mt-0.5 text-[12px] text-admin-ink-muted">{JS_DESC[lang]}</div>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) submit();
        }}
      >
        <label className="text-[12px] text-admin-ink-muted">
          {JS_UI.label[lang]}
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={JS_UI.placeholder[lang]}
            disabled={busy}
            spellCheck={false}
            autoCapitalize="none"
            inputMode="url"
            className="mt-1 block w-full rounded-[8px] border border-admin-border bg-admin-surface px-[10px] py-[7px] text-[13px] text-admin-ink"
          />
        </label>
        <div>
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="cursor-pointer rounded-full border-0 bg-admin-ink px-[14px] py-[7px] text-[12.5px] font-medium text-admin-card disabled:opacity-60"
          >
            {busy ? JS_UI.working[lang] : JS_UI.send[lang]}
          </button>
        </div>
      </form>
      {error ? <div role="alert" className="mt-2 text-[12.5px] text-admin-critical-deep">{error}</div> : null}
      {sent ? <div role="status" className="mt-2 text-[12px] text-admin-success-deep">{sent}</div> : null}
    </div>
  );
}
