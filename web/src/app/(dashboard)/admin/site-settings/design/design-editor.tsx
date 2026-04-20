"use client";

/**
 * Phase 5 / M6 — design editor.
 *
 * Read-for-operators mental model:
 *   - Form inputs always show the DRAFT token values. Editing a field is a
 *     local change; "Save draft" commits to `theme_json_draft`. Nothing
 *     public changes until the operator clicks "Publish".
 *   - The "Live values" column shows what's currently serving on the
 *     storefront (theme_json), so operators can see the delta before
 *     publishing. When the draft and live match exactly, we show "In sync".
 *   - Restore pulls a revision's snapshot into the draft. It does NOT
 *     publish — that's the dedicated button below, same as pages/sections.
 *
 * Token input widgets:
 *   - `color` scope → hex text input + swatch. Native color picker would
 *     be friendlier but it can't render `""` (empty = fall back to default)
 *     cleanly, so we keep the text+swatch pattern used in branding-form.tsx.
 *   - `typography`/`radius`/`spacing` scopes with enum validators → native
 *     `<select>`, options sourced from the Zod enum. No spacing tokens are
 *     agency-configurable in the default registry, but the widget code is
 *     generic so a future registry change doesn't need UI work.
 */

import { useActionState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TokenSpec } from "@/lib/site-admin/tokens/registry";

import {
  publishDesignAction,
  restoreDesignRevisionAction,
  saveDesignDraftAction,
  type DesignActionState,
} from "./actions";

interface RevisionEntry {
  id: string;
  kind: "draft" | "published" | "rollback";
  version: number;
  createdAt: string;
}

interface Props {
  tokens: ReadonlyArray<TokenSpec>;
  draftValues: Record<string, string>;
  liveValues: Record<string, string>;
  defaults: Record<string, string>;
  version: number;
  themePublishedAt: string | null;
  revisions: ReadonlyArray<RevisionEntry>;
  canEdit: boolean;
  canPublish: boolean;
}

function FieldError({
  messages,
  name,
}: {
  messages?: Record<string, string>;
  name: string;
}) {
  if (!messages) return null;
  const msg = messages[name];
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

function formatTs(ts: string | null): string {
  if (!ts) return "Never";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

/**
 * Extract enum options for a token whose validator is a Zod enum. Returns
 * `null` for non-enum validators (colors) so the caller can fall back to a
 * text input.
 */
function enumOptions(spec: TokenSpec): string[] | null {
  // z.ZodEnum exposes its members via `.options`. Any other validator path
  // (z.string().regex(...) for hex colors) returns `null`.
  const candidate = spec.validator as unknown as { options?: readonly string[] };
  if (Array.isArray(candidate.options)) return [...candidate.options];
  // Also support validators that expose a `_def.values` map (older Zod).
  const deprecatedDef = (spec.validator as unknown as {
    _def?: { values?: readonly string[] };
  })._def;
  if (deprecatedDef?.values && Array.isArray(deprecatedDef.values)) {
    return [...deprecatedDef.values];
  }
  return null;
}

function TokenInput({
  spec,
  draftValue,
  disabled,
  fieldErrors,
}: {
  spec: TokenSpec;
  draftValue: string;
  disabled: boolean;
  fieldErrors?: Record<string, string>;
}) {
  const name = `token.${spec.key}`;
  const options = enumOptions(spec);

  if (options) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={name}>{spec.label}</Label>
        <select
          id={name}
          name={name}
          defaultValue={draftValue}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <FieldError messages={fieldErrors} name={spec.key} />
      </div>
    );
  }

  // Colour: hex input + swatch. An empty string is allowed → drop to default.
  if (spec.scope === "color") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={name}>{spec.label}</Label>
        <div className="flex items-center gap-2">
          <Input
            id={name}
            name={name}
            defaultValue={draftValue}
            placeholder="#rrggbb"
            maxLength={7}
            disabled={disabled}
            className="w-32 font-mono uppercase"
          />
          {draftValue && (
            <span
              aria-hidden
              className="inline-block h-8 w-8 rounded-md border border-border/60"
              style={{ backgroundColor: draftValue }}
            />
          )}
        </div>
        <FieldError messages={fieldErrors} name={spec.key} />
      </div>
    );
  }

  // Fallback: plain text input.
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{spec.label}</Label>
      <Input
        id={name}
        name={name}
        defaultValue={draftValue}
        disabled={disabled}
      />
      <FieldError messages={fieldErrors} name={spec.key} />
    </div>
  );
}

// `z` import check — kept only so unused-imports linter doesn't scrub the
// dep; the runtime path doesn't need Zod here (server re-validates).
const _zEnumWitness: typeof z.ZodEnum | undefined = z.ZodEnum;
void _zEnumWitness;

export function DesignEditor({
  tokens,
  draftValues,
  liveValues,
  defaults,
  version,
  themePublishedAt,
  revisions,
  canEdit,
  canPublish,
}: Props) {
  const [saveState, saveAction, savePending] = useActionState<
    DesignActionState,
    FormData
  >(saveDesignDraftAction, undefined);
  const [publishState, publishAction, publishPending] = useActionState<
    DesignActionState,
    FormData
  >(publishDesignAction, undefined);
  const [restoreState, restoreAction, restorePending] = useActionState<
    DesignActionState,
    FormData
  >(restoreDesignRevisionAction, undefined);

  const fieldErrors =
    saveState && saveState.ok === false ? saveState.fieldErrors : undefined;

  const inSync = tokens.every(
    (spec) => (draftValues[spec.key] ?? "") === (liveValues[spec.key] ?? ""),
  );

  return (
    <div className="space-y-8">
      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">Draft</strong> values are private
          to this workspace. Publishing copies them to the live row and
          revalidates the storefront. Last publish:{" "}
          <strong className="text-foreground">{formatTs(themePublishedAt)}</strong>
          . Current version:{" "}
          <strong className="text-foreground">v{version}</strong>.
          {inSync ? " Draft matches live." : " Draft has unpublished changes."}
        </p>
      </div>

      {!canEdit && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
          You don&apos;t have permission to edit design tokens on this
          workspace. Ask an admin for the design editor role.
        </div>
      )}

      {/* Save draft */}
      <form action={saveAction} className="space-y-6">
        <input type="hidden" name="expectedVersion" value={version} />
        <div className="grid gap-6 md:grid-cols-2">
          {tokens.map((spec) => (
            <div key={spec.key} className="rounded-md border border-border/40 p-3">
              <TokenInput
                spec={spec}
                draftValue={draftValues[spec.key] ?? ""}
                disabled={!canEdit || savePending}
                fieldErrors={fieldErrors}
              />
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Live:{" "}
                  <span className="font-mono">
                    {liveValues[spec.key] ?? defaults[spec.key] ?? "—"}
                  </span>
                </span>
                <span>
                  Default:{" "}
                  <span className="font-mono">{defaults[spec.key] ?? "—"}</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!canEdit || savePending}>
            {savePending ? "Saving…" : "Save draft"}
          </Button>
          {saveState?.ok === true && (
            <span className="text-sm text-muted-foreground">
              {saveState.message}
            </span>
          )}
          {saveState?.ok === false && (
            <span className="text-sm text-destructive">{saveState.error}</span>
          )}
        </div>
      </form>

      {/* Publish */}
      <div className="rounded-md border border-border/60 p-4">
        <h3 className="text-sm font-semibold">Publish</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Copies the draft token map into the live row and stamps the publish
          timestamp. The storefront picks up the new tokens on the next
          request; there&apos;s no manual cache clear.
        </p>
        <form action={publishAction} className="mt-3 flex items-center gap-3">
          <input type="hidden" name="expectedVersion" value={version} />
          <Button
            type="submit"
            variant="default"
            disabled={!canPublish || publishPending}
          >
            {publishPending ? "Publishing…" : "Publish design"}
          </Button>
          {publishState?.ok === true && (
            <span className="text-sm text-muted-foreground">
              {publishState.message}
            </span>
          )}
          {publishState?.ok === false && (
            <span className="text-sm text-destructive">
              {publishState.error}
            </span>
          )}
        </form>
      </div>

      {/* Revisions */}
      <div className="rounded-md border border-border/60 p-4">
        <h3 className="text-sm font-semibold">History</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Restoring a revision lands it as DRAFT. Publishing stays a separate
          action so you can review before the storefront flips.
        </p>
        {revisions.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            No revisions yet. Save a draft or publish to start the log.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {revisions.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <div>
                  <span className="font-mono">v{r.version}</span>
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {r.kind}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {formatTs(r.createdAt)}
                  </span>
                </div>
                <form action={restoreAction}>
                  <input type="hidden" name="revisionId" value={r.id} />
                  <input type="hidden" name="expectedVersion" value={version} />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={!canEdit || restorePending}
                  >
                    {restorePending ? "Restoring…" : "Restore as draft"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {restoreState?.ok === true && (
          <p className="mt-2 text-xs text-muted-foreground">
            {restoreState.message}
          </p>
        )}
        {restoreState?.ok === false && (
          <p className="mt-2 text-xs text-destructive">{restoreState.error}</p>
        )}
      </div>
    </div>
  );
}
