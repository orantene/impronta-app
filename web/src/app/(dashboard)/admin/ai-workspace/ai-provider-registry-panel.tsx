"use client";

import { useActionState, useMemo } from "react";

import {
  addAiProviderInstance,
  deleteAiProviderInstance,
  disableAiProviderSecret,
  saveAiProviderSecret,
  setDefaultAiProviderInstance,
  testAiProviderConnection,
  updateAiProviderInstanceMeta,
  type AiProviderActionState,
} from "@/app/(dashboard)/admin/ai-workspace/ai-provider-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AiProviderSetupHelp } from "@/app/(dashboard)/admin/ai-workspace/ai-provider-setup-help";

export type RegistryInstance = {
  id: string;
  kind: "none" | "openai" | "anthropic" | "custom";
  label: string;
  is_default: boolean;
  disabled: boolean;
  sort_order: number;
  credential_source: "platform" | "agency" | "inherit";
  credential_ui_state: string;
  credential_masked_hint: string | null;
};

function StatusBadge({ state }: { state: string }) {
  const label =
    state === "active"
      ? "Active"
      : state === "invalid"
        ? "Invalid key"
        : state === "needs_billing"
          ? "Needs billing"
          : state === "disabled"
            ? "Disabled"
            : state === "unset"
              ? "No key saved"
              : state;
  const cls =
    state === "active"
      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
      : state === "needs_billing"
        ? "bg-amber-500/15 text-amber-900 dark:text-amber-100"
        : state === "invalid"
          ? "bg-destructive/15 text-destructive"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", cls)}>
      {label}
    </span>
  );
}

export function AiProviderRegistryPanel({
  instances,
  encryptionReady,
  tenantCredentialMode,
}: {
  instances: RegistryInstance[];
  encryptionReady: boolean;
  tenantCredentialMode: "platform" | "agency" | "inherit";
}) {
  const sorted = useMemo(
    () => [...instances].sort((a, b) => a.sort_order - b.sort_order),
    [instances],
  );

  return (
    <div className="space-y-6">
      {!encryptionReady ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Encrypted storage is not configured on this server (`AI_CREDENTIALS_ENCRYPTION_KEY`). You can
          still use platform keys from the host environment, but agency-managed keys cannot be saved
          until encryption is enabled.
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Tenant credential resolution:{" "}
        <span className="font-medium text-foreground">{tenantCredentialMode}</span>. Per-row
        &quot;credential source&quot; set to inherit follows this tenant default.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-foreground">Add provider</p>
        <AddProviderForm />
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No provider rows found. Apply the latest database migrations, then refresh — you should see OpenAI,
          Anthropic, and a &quot;None&quot; placeholder.
        </p>
      ) : null}

      <ul className="space-y-4">
        {sorted.map((row) => (
          <li
            key={row.id}
            className="rounded-2xl border border-border/60 bg-card/30 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {row.kind}
                </p>
                <p className="mt-1 font-medium text-foreground">{row.label}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge state={row.credential_ui_state} />
                  {row.is_default ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      Default
                    </span>
                  ) : null}
                  {row.disabled ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Disabled
                    </span>
                  ) : null}
                </div>
                {row.credential_masked_hint ? (
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    Stored key: {row.credential_masked_hint}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {!row.is_default ? (
                  <SetDefaultForm instanceId={row.id} disabled={row.disabled} />
                ) : null}
              </div>
            </div>

            {(row.kind === "openai" || row.kind === "anthropic") && (
              <div className="mt-4 space-y-4 border-t border-border/40 pt-4">
                <AiProviderSetupHelp kind={row.kind} />
                <MetaForm row={row} />
                {(row.kind === "openai" || row.kind === "anthropic") && encryptionReady ? (
                  <SecretForm row={row} />
                ) : row.kind === "openai" || row.kind === "anthropic" ? (
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Where to put the API key</p>
                    <p className="mt-1">
                      The paste field is hidden until the server has{" "}
                      <code className="text-foreground">AI_CREDENTIALS_ENCRYPTION_KEY</code> set (see{" "}
                      <code className="text-foreground">web/.env.example</code>). Then a password field
                      appears on this same card, directly under Label and Credential source — paste the
                      raw key once and click &quot;Save encrypted key&quot;.
                    </p>
                    <p className="mt-2">
                      Until then, set Credential source to Platform (host env keys) and put{" "}
                      <code className="text-foreground">OPENAI_API_KEY</code> or{" "}
                      <code className="text-foreground">ANTHROPIC_API_KEY</code> in the host{" "}
                      <code className="text-foreground">.env</code> (not in this UI).
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <TestForm instanceId={row.id} />
                  {row.credential_ui_state !== "unset" ? (
                    <DisableKeyForm instanceId={row.id} />
                  ) : null}
                  {!row.is_default ? <DeleteInstanceForm instanceId={row.id} /> : null}
                </div>
              </div>
            )}

            {row.kind === "custom" ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Custom providers are reserved for a future release.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddProviderForm() {
  const [state, action, pending] = useActionState<AiProviderActionState, FormData>(
    addAiProviderInstance,
    undefined,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="label" value="" />
      <select
        name="kind"
        required
        defaultValue="openai"
        className="h-9 w-[11rem] rounded-md border border-input bg-background px-2 text-sm shadow-sm"
      >
        <option value="none">none</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
        <option value="custom">custom</option>
      </select>
      <Button type="submit" size="sm" disabled={pending} variant="secondary">
        {pending ? "Adding…" : "Add"}
      </Button>
      {state?.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}

function SetDefaultForm({ instanceId, disabled }: { instanceId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<AiProviderActionState, FormData>(
    setDefaultAiProviderInstance,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="instance_id" value={instanceId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending || disabled}>
        {pending ? "…" : "Use as default"}
      </Button>
      {state?.error ? <span className="ml-2 text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}

function MetaForm({ row }: { row: RegistryInstance }) {
  const [state, action, pending] = useActionState<AiProviderActionState, FormData>(
    updateAiProviderInstanceMeta,
    undefined,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="instance_id" value={row.id} />
      <div className="space-y-1.5">
        <Label htmlFor={`label-${row.id}`}>Label</Label>
        <Input id={`label-${row.id}`} name="label" defaultValue={row.label} disabled={pending} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`cred-${row.id}`}>Credential source</Label>
        <select
          id={`cred-${row.id}`}
          name="credential_source"
          defaultValue={row.credential_source}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        >
          <option value="inherit">Inherit tenant default</option>
          <option value="platform">Platform (host env keys)</option>
          <option value="agency">Agency (encrypted keys only)</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="disabled"
          value="true"
          defaultChecked={row.disabled}
          disabled={pending}
        />
        Disabled (row excluded from routing)
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save row"}
        </Button>
        {state?.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
        {state?.success ? <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span> : null}
      </div>
    </form>
  );
}

function SecretForm({ row }: { row: RegistryInstance }) {
  const [state, action, pending] = useActionState<AiProviderActionState, FormData>(
    saveAiProviderSecret,
    undefined,
  );
  return (
    <form action={action} className="space-y-2 rounded-lg border border-border/50 bg-muted/10 p-3">
      <input type="hidden" name="instance_id" value={row.id} />
      <Label htmlFor={`secret-${row.id}`}>API key (server-only, never shown again in full)</Label>
      <Input
        id={`secret-${row.id}`}
        name="api_key"
        type="password"
        autoComplete="off"
        placeholder="Paste key — stored encrypted"
        disabled={pending}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save encrypted key"}
        </Button>
        {state?.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
        {state?.success ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}

function TestForm({ instanceId }: { instanceId: string }) {
  const [state, action, pending] = useActionState<AiProviderActionState, FormData>(
    testAiProviderConnection,
    undefined,
  );
  return (
    <form action={action} className="inline">
      <input type="hidden" name="instance_id" value={instanceId} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Testing…" : "Test connection"}
      </Button>
      {state?.error ? <span className="ml-2 text-xs text-destructive">{state.error}</span> : null}
      {state?.success ? (
        <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">{state.message}</span>
      ) : null}
    </form>
  );
}

function DisableKeyForm({ instanceId }: { instanceId: string }) {
  const [state, action, pending] = useActionState<AiProviderActionState, FormData>(
    disableAiProviderSecret,
    undefined,
  );
  return (
    <form action={action} className="inline">
      <input type="hidden" name="instance_id" value={instanceId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending}
        className="text-muted-foreground"
      >
        Remove key
      </Button>
      {state?.error ? <span className="ml-2 text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}

function DeleteInstanceForm({ instanceId }: { instanceId: string }) {
  const [state, action, pending] = useActionState<AiProviderActionState, FormData>(
    deleteAiProviderInstance,
    undefined,
  );
  return (
    <form
      action={action}
      className="inline"
      onSubmit={(e) => {
        if (!window.confirm("Delete this provider row? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="instance_id" value={instanceId} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        Delete row
      </Button>
      {state?.error ? <span className="ml-2 text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
