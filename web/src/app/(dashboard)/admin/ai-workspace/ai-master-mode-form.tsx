"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { upsertSetting, type SettingsActionState } from "@/app/(dashboard)/admin/settings/actions";
import { cn } from "@/lib/utils";

export function AiMasterModeForm({
  enabled,
  label = "AI mode",
  description = "Master override for the whole site. When off, AI search, refine, explanations, and drafting are disabled even if the feature toggles below stay on.",
  className,
}: {
  enabled: boolean;
  label?: string;
  description?: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    upsertSetting,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? enabled;

  useEffect(() => {
    setOptimistic(null);
  }, [enabled]);

  useEffect(() => {
    if (state?.error || state?.success) setOptimistic(null);
  }, [state?.error, state?.success]);

  function onCheckedChange(next: boolean) {
    setOptimistic(next);
    if (valueRef.current) valueRef.current.value = next ? "true" : "false";
    formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      action={action}
      className={cn(
        "flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-card/30 p-4",
        className,
      )}
    >
      <input type="hidden" name="key" value="ai_master_enabled" />
      <input ref={valueRef} type="hidden" name="value" defaultValue={enabled ? "true" : "false"} />

      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        {state?.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        {state?.success ? (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Saved</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {checked ? "On" : "Off"}
        </span>
        <Switch
          checked={checked}
          disabled={pending}
          onCheckedChange={onCheckedChange}
          aria-label={`${label}. ${checked ? "On" : "Off"}. Toggle to change.`}
        />
      </div>
    </form>
  );
}
