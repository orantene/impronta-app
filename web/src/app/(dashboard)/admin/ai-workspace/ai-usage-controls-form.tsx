"use client";

import { useActionState } from "react";

import { updateAiTenantControls, type AiProviderActionState } from "@/app/(dashboard)/admin/ai-workspace/ai-provider-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TenantControlsProps = {
  credential_mode: "platform" | "agency" | "inherit";
  monthly_spend_cap_cents: number | null;
  warn_threshold_percent: number | null;
  hard_stop_on_cap: boolean;
  max_requests_per_minute: number | null;
  max_requests_per_month: number | null;
  provider_unavailable_behavior: "graceful" | "strict";
};

export function AiUsageControlsForm({ initial }: { initial: TenantControlsProps }) {
  const [state, action, pending] = useActionState<AiProviderActionState, FormData>(
    updateAiTenantControls,
    undefined,
  );

  return (
    <form action={action} className="grid max-w-xl gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="credential_mode">Default credential resolution</Label>
        <p className="text-xs text-muted-foreground">
          Applies to provider rows set to &quot;inherit&quot;. Platform uses host environment keys;
          agency uses encrypted dashboard keys only; inherit tries encrypted keys first, then
          platform keys.
        </p>
        <select
          id="credential_mode"
          name="credential_mode"
          defaultValue={initial.credential_mode}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        >
          <option value="inherit">Inherit (encrypted key, then platform)</option>
          <option value="platform">Platform (host environment only)</option>
          <option value="agency">Agency (encrypted keys only)</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="monthly_spend_cap_cents">Monthly spend cap (USD cents)</Label>
          <Input
            id="monthly_spend_cap_cents"
            name="monthly_spend_cap_cents"
            type="number"
            min={0}
            placeholder="e.g. 5000"
            defaultValue={initial.monthly_spend_cap_cents ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="warn_threshold_percent">Warning threshold (% of cap)</Label>
          <Input
            id="warn_threshold_percent"
            name="warn_threshold_percent"
            type="number"
            min={0}
            max={100}
            placeholder="e.g. 80"
            defaultValue={initial.warn_threshold_percent ?? ""}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hard_stop_on_cap">Hard stop when cap is reached</Label>
        <select
          id="hard_stop_on_cap"
          name="hard_stop_on_cap"
          defaultValue={initial.hard_stop_on_cap ? "true" : "false"}
          className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        >
          <option value="true">Yes — block provider-backed calls</option>
          <option value="false">No — only warn in metrics</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="max_requests_per_minute">Max requests / minute (optional)</Label>
          <Input
            id="max_requests_per_minute"
            name="max_requests_per_minute"
            type="number"
            min={1}
            placeholder="empty = no limit"
            defaultValue={initial.max_requests_per_minute ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max_requests_per_month">Max requests / month (optional)</Label>
          <Input
            id="max_requests_per_month"
            name="max_requests_per_month"
            type="number"
            min={1}
            placeholder="empty = no limit"
            defaultValue={initial.max_requests_per_month ?? ""}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="provider_unavailable_behavior">When the provider is unavailable</Label>
        <select
          id="provider_unavailable_behavior"
          name="provider_unavailable_behavior"
          defaultValue={initial.provider_unavailable_behavior}
          className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        >
          <option value="graceful">
            Graceful — keep directory, inquiries, and non-AI flows working; skip AI stages
          </option>
          <option value="strict">
            Strict — fail provider-backed endpoints until resolved (rare)
          </option>
        </select>
      </div>

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save usage controls"}
      </Button>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.success ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>
      ) : null}
    </form>
  );
}
