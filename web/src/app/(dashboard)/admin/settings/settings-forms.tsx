"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { upsertSetting, type SettingsActionState } from "./actions";

/* ------------------------------------------------------------------ */
/* Generic key/value upsert form                                        */
/* ------------------------------------------------------------------ */
export function UpsertSettingForm({
  settingKey,
  currentValue,
  label,
  description,
}: {
  settingKey: string;
  currentValue: string;
  label: string;
  description?: string;
}) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    upsertSetting,
    undefined,
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="key" value={settingKey} />
      <div className="flex-1 space-y-1.5" style={{ minWidth: "12rem" }}>
        <Label htmlFor={`setting-${settingKey}`}>{label}</Label>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        <Input
          id={`setting-${settingKey}`}
          name="value"
          defaultValue={currentValue}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state?.success && (
          <p className="text-sm text-emerald-400">Saved.</p>
        )}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle (boolean) — table row (Settings → Feature toggles)            */
/* ------------------------------------------------------------------ */
export function ToggleSettingTableRow({
  settingKey,
  currentValue,
  label,
  description,
}: {
  settingKey: string;
  currentValue: string;
  label: string;
  description?: string;
}) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    upsertSetting,
    undefined,
  );

  const isEnabled = currentValue === "true" || currentValue === "1";
  const formRef = useRef<HTMLFormElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic !== null ? optimistic : isEnabled;

  useEffect(() => {
    setOptimistic(null);
  }, [isEnabled]);

  useEffect(() => {
    if (state?.error || state?.success) setOptimistic(null);
  }, [state?.error, state?.success]);

  function onCheckedChange(next: boolean) {
    setOptimistic(next);
    if (valueRef.current) valueRef.current.value = next ? "true" : "false";
    formRef.current?.requestSubmit();
  }

  return (
    <tr className="border-b border-border/40 transition-colors last:border-0 hover:bg-[var(--impronta-gold)]/[0.04]">
      <td className="px-4 py-3 align-top">
        <div className="max-w-2xl space-y-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
          {state?.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state?.success ? (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Saved</p>
          ) : null}
        </div>
      </td>
      <td className="w-[10rem] whitespace-nowrap px-4 py-3 align-middle">
        <form ref={formRef} action={action} className="flex items-center justify-end gap-3">
          <input type="hidden" name="key" value={settingKey} />
          <input ref={valueRef} type="hidden" name="value" defaultValue={isEnabled ? "true" : "false"} />
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{checked ? "On" : "Off"}</span>
          <Switch
            checked={checked}
            disabled={pending}
            onCheckedChange={onCheckedChange}
            aria-label={`${label}. ${checked ? "On" : "Off"}. Toggle to change.`}
          />
        </form>
      </td>
    </tr>
  );
}

export function SelectSettingForm({
  settingKey,
  currentValue,
  label,
  description,
  options,
}: {
  settingKey: string;
  currentValue: string;
  label: string;
  description?: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    upsertSetting,
    undefined,
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="key" value={settingKey} />
      <div className="flex-1 space-y-1.5" style={{ minWidth: "12rem" }}>
        <Label htmlFor={`setting-${settingKey}`}>{label}</Label>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        <select
          id={`setting-${settingKey}`}
          name="value"
          defaultValue={currentValue}
          className={ADMIN_FORM_CONTROL}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className="bg-background text-foreground"
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state?.success && (
          <p className="text-sm text-emerald-400">Saved.</p>
        )}
      </div>
    </form>
  );
}
