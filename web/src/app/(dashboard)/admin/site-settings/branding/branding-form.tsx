"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandingRow } from "@/lib/site-admin/server/branding";

import { saveBrandingAction, type BrandingActionState } from "./actions";

interface Props {
  canEdit: boolean;
  row: BrandingRow | null;
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

function ColorField({
  id,
  name,
  label,
  defaultValue,
  fieldErrors,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  fieldErrors?: Record<string, string>;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          name={name}
          defaultValue={defaultValue}
          placeholder="#rrggbb"
          maxLength={7}
          disabled={disabled}
          className="w-32 font-mono uppercase"
        />
        {defaultValue && (
          <span
            aria-hidden
            className="inline-block h-8 w-8 rounded-md border border-border/60"
            style={{ backgroundColor: defaultValue }}
          />
        )}
      </div>
      <FieldError messages={fieldErrors} name={name} />
    </div>
  );
}

export function BrandingForm({ canEdit, row }: Props) {
  const [state, action, pending] = useActionState<BrandingActionState, FormData>(
    saveBrandingAction,
    undefined,
  );

  const fieldErrors =
    state && state.ok === false ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="expectedVersion" value={row?.version ?? 0} />

      {/* ---------- Colors ---------- */}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <legend className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Colors
        </legend>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <ColorField
            id="primaryColor"
            name="primaryColor"
            label="Primary"
            defaultValue={row?.primary_color ?? ""}
            fieldErrors={fieldErrors}
            disabled={!canEdit || pending}
          />
          <ColorField
            id="secondaryColor"
            name="secondaryColor"
            label="Secondary"
            defaultValue={row?.secondary_color ?? ""}
            fieldErrors={fieldErrors}
            disabled={!canEdit || pending}
          />
          <ColorField
            id="accentColor"
            name="accentColor"
            label="Accent"
            defaultValue={row?.accent_color ?? ""}
            fieldErrors={fieldErrors}
            disabled={!canEdit || pending}
          />
          <ColorField
            id="neutralColor"
            name="neutralColor"
            label="Neutral"
            defaultValue={row?.neutral_color ?? ""}
            fieldErrors={fieldErrors}
            disabled={!canEdit || pending}
          />
        </div>
      </fieldset>

      {/* ---------- Media assets ---------- */}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <legend className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Media
        </legend>
        <p className="text-sm text-muted-foreground">
          Paste the UUID of a media asset. A library picker ships with the M6
          media UX; M1 accepts ids directly so branding isn&apos;t blocked.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="logoMediaAssetId">Logo (light)</Label>
            <Input
              id="logoMediaAssetId"
              name="logoMediaAssetId"
              defaultValue={row?.logo_media_asset_id ?? ""}
              placeholder="UUID"
            />
            <FieldError messages={fieldErrors} name="logoMediaAssetId" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="logoDarkMediaAssetId">Logo (dark)</Label>
            <Input
              id="logoDarkMediaAssetId"
              name="logoDarkMediaAssetId"
              defaultValue={row?.logo_dark_media_asset_id ?? ""}
              placeholder="UUID"
            />
            <FieldError messages={fieldErrors} name="logoDarkMediaAssetId" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faviconMediaAssetId">Favicon</Label>
            <Input
              id="faviconMediaAssetId"
              name="faviconMediaAssetId"
              defaultValue={row?.favicon_media_asset_id ?? ""}
              placeholder="UUID"
            />
            <FieldError messages={fieldErrors} name="faviconMediaAssetId" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ogImageMediaAssetId">Open Graph image</Label>
            <Input
              id="ogImageMediaAssetId"
              name="ogImageMediaAssetId"
              defaultValue={row?.og_image_media_asset_id ?? ""}
              placeholder="UUID"
            />
            <FieldError messages={fieldErrors} name="ogImageMediaAssetId" />
          </div>
        </div>
      </fieldset>

      {/* ---------- Typography ---------- */}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <legend className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Typography
        </legend>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="fontPreset">Font preset</Label>
            <Input
              id="fontPreset"
              name="fontPreset"
              defaultValue={row?.font_preset ?? ""}
              maxLength={60}
            />
            <FieldError messages={fieldErrors} name="fontPreset" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="headingFont">Heading font</Label>
            <Input
              id="headingFont"
              name="headingFont"
              defaultValue={row?.heading_font ?? ""}
              maxLength={120}
            />
            <FieldError messages={fieldErrors} name="headingFont" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bodyFont">Body font</Label>
            <Input
              id="bodyFont"
              name="bodyFont"
              defaultValue={row?.body_font ?? ""}
              maxLength={120}
            />
            <FieldError messages={fieldErrors} name="bodyFont" />
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canEdit || pending}>
          {pending ? "Saving…" : "Save branding"}
        </Button>
        {state && state.ok === false && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state && state.ok === true && (
          <p className="text-sm text-emerald-400">Saved (v{state.version}).</p>
        )}
        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            Read-only — you do not have permission to edit branding.
          </p>
        )}
      </div>
    </form>
  );
}
