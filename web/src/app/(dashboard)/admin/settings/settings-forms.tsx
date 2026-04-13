"use client";

import { useActionState } from "react";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
/* Toggle (boolean) setting                                             */
/* ------------------------------------------------------------------ */
export function ToggleSettingForm({
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

  return (
    <form action={action} className="flex flex-wrap items-center justify-between gap-4">
      <input type="hidden" name="key" value={settingKey} />
      <input
        type="hidden"
        name="value"
        value={isEnabled ? "false" : "true"}
      />
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={
            "text-sm font-medium " +
            (isEnabled ? "text-emerald-400" : "text-muted-foreground")
          }
        >
          {isEnabled ? "Enabled" : "Disabled"}
        </span>
        <Button
          type="submit"
          variant={isEnabled ? "default" : "outline"}
          size="sm"
          disabled={pending}
        >
          {pending ? "…" : isEnabled ? "Disable" : "Enable"}
        </Button>
      </div>
    </form>
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
