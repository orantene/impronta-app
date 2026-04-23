"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_LOCALES, type Locale } from "@/lib/site-admin/locales";
import type { IdentityRow } from "@/lib/site-admin/server/identity";

import { saveIdentityAction, type IdentityActionState } from "./actions";

interface Props {
  canEdit: boolean;
  tenantId: string;
  row: IdentityRow | null;
}

function FieldError({ messages, name }: { messages?: Record<string, string>; name: string }) {
  if (!messages) return null;
  const msg = messages[name];
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

export function IdentityForm({ canEdit, row }: Props) {
  const [state, action, pending] = useActionState<IdentityActionState, FormData>(
    saveIdentityAction,
    undefined,
  );

  const initialSupported: readonly Locale[] =
    (row?.supported_locales as Locale[] | undefined) ?? ["en"];
  const initialDefault: Locale = (row?.default_locale as Locale | undefined) ?? "en";

  const [supported, setSupported] = useState<ReadonlySet<Locale>>(
    () => new Set(initialSupported),
  );
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialDefault);

  // If the default falls out of supported, snap it back.
  useEffect(() => {
    if (!supported.has(defaultLocale)) {
      const first = supported.values().next().value;
      if (first) setDefaultLocale(first);
    }
  }, [supported, defaultLocale]);

  function toggleSupported(locale: Locale) {
    if (!canEdit) return;
    setSupported((prev) => {
      const next = new Set(prev);
      if (next.has(locale)) {
        // Never let the user drop the current default.
        if (locale === defaultLocale) return prev;
        // Never let the last locale get dropped.
        if (next.size <= 1) return prev;
        next.delete(locale);
      } else {
        next.add(locale);
      }
      return next;
    });
  }

  const fieldErrors =
    state && state.ok === false ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="expectedVersion" value={row?.version ?? 0} />

      {/* ---------- Identity ---------- */}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <legend className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Identity
        </legend>

        <div className="space-y-1.5">
          <Label htmlFor="publicName">Public name</Label>
          <Input
            id="publicName"
            name="publicName"
            defaultValue={row?.public_name ?? ""}
            required
            maxLength={120}
          />
          <FieldError messages={fieldErrors} name="publicName" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="legalName">Legal name</Label>
            <Input
              id="legalName"
              name="legalName"
              defaultValue={row?.legal_name ?? ""}
              maxLength={200}
            />
            <FieldError messages={fieldErrors} name="legalName" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              name="tagline"
              defaultValue={row?.tagline ?? ""}
              maxLength={200}
            />
            <FieldError messages={fieldErrors} name="tagline" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="footerTagline">Footer tagline</Label>
          <Input
            id="footerTagline"
            name="footerTagline"
            defaultValue={row?.footer_tagline ?? ""}
            maxLength={200}
          />
          <FieldError messages={fieldErrors} name="footerTagline" />
        </div>
      </fieldset>

      {/* ---------- Localization ---------- */}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <legend className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Localization
        </legend>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Pick the locales this tenant publishes. When a page is missing a
            translation, the storefront falls back to the default locale below
            so visitors never see an empty surface.
          </p>
          <div className="flex flex-wrap gap-3">
            {PLATFORM_LOCALES.map((loc) => {
              const checked = supported.has(loc);
              return (
                <label
                  key={loc}
                  className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="supportedLocales"
                    value={loc}
                    checked={checked}
                    onChange={() => toggleSupported(loc)}
                    disabled={!canEdit || pending}
                  />
                  <span className="uppercase tracking-wide">{loc}</span>
                </label>
              );
            })}
          </div>
          <FieldError messages={fieldErrors} name="supportedLocales" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="defaultLocale">Default locale</Label>
          <select
            id="defaultLocale"
            name="defaultLocale"
            value={defaultLocale}
            onChange={(e) => setDefaultLocale(e.target.value as Locale)}
            className="block w-fit rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
            disabled={!canEdit || pending}
          >
            {Array.from(supported).map((loc) => (
              <option key={loc} value={loc}>
                {loc.toUpperCase()}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors} name="defaultLocale" />
        </div>
      </fieldset>

      {/* ---------- Contact ---------- */}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <legend className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Contact
        </legend>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Email</Label>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={row?.contact_email ?? ""}
            />
            <FieldError messages={fieldErrors} name="contactEmail" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">Phone</Label>
            <Input
              id="contactPhone"
              name="contactPhone"
              defaultValue={row?.contact_phone ?? ""}
              maxLength={40}
            />
            <FieldError messages={fieldErrors} name="contactPhone" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              defaultValue={row?.whatsapp ?? ""}
              maxLength={40}
            />
            <FieldError messages={fieldErrors} name="whatsapp" />
          </div>
        </div>
      </fieldset>

      {/* ---------- Address / service area ---------- */}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <legend className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Address &amp; service area
        </legend>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="addressCity">City</Label>
            <Input id="addressCity" name="addressCity" defaultValue={row?.address_city ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addressCountry">Country</Label>
            <Input id="addressCountry" name="addressCountry" defaultValue={row?.address_country ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="serviceArea">Service area</Label>
            <Input id="serviceArea" name="serviceArea" defaultValue={row?.service_area ?? ""} />
          </div>
        </div>
      </fieldset>

      {/* ---------- Social ---------- */}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <legend className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Social handles
        </legend>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="socialInstagram">Instagram</Label>
            <Input id="socialInstagram" name="socialInstagram" defaultValue={row?.social_instagram ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="socialTiktok">TikTok</Label>
            <Input id="socialTiktok" name="socialTiktok" defaultValue={row?.social_tiktok ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="socialFacebook">Facebook</Label>
            <Input id="socialFacebook" name="socialFacebook" defaultValue={row?.social_facebook ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="socialLinkedin">LinkedIn</Label>
            <Input id="socialLinkedin" name="socialLinkedin" defaultValue={row?.social_linkedin ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="socialYoutube">YouTube</Label>
            <Input id="socialYoutube" name="socialYoutube" defaultValue={row?.social_youtube ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="socialX">X / Twitter</Label>
            <Input id="socialX" name="socialX" defaultValue={row?.social_x ?? ""} />
          </div>
        </div>
      </fieldset>

      {/* ---------- Site defaults ---------- */}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <legend className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Site defaults
        </legend>
        <p className="text-sm text-muted-foreground">
          Fallbacks used when a page doesn&apos;t override. The primary CTA label
          &amp; URL are a pair — set both or neither.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="seoDefaultTitle">Default SEO title</Label>
          <Input
            id="seoDefaultTitle"
            name="seoDefaultTitle"
            defaultValue={row?.seo_default_title ?? ""}
            maxLength={120}
          />
          <FieldError messages={fieldErrors} name="seoDefaultTitle" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seoDefaultDescription">Default meta description</Label>
          <Textarea
            id="seoDefaultDescription"
            name="seoDefaultDescription"
            defaultValue={row?.seo_default_description ?? ""}
            maxLength={320}
            rows={3}
          />
          <FieldError messages={fieldErrors} name="seoDefaultDescription" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seoDefaultShareImageMediaAssetId">
            Default share-image media asset id
          </Label>
          <Input
            id="seoDefaultShareImageMediaAssetId"
            name="seoDefaultShareImageMediaAssetId"
            defaultValue={row?.seo_default_share_image_media_asset_id ?? ""}
            placeholder="UUID of a media_assets row"
          />
          <FieldError messages={fieldErrors} name="seoDefaultShareImageMediaAssetId" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="primaryCtaLabel">Primary CTA label</Label>
            <Input
              id="primaryCtaLabel"
              name="primaryCtaLabel"
              defaultValue={row?.primary_cta_label ?? ""}
              maxLength={60}
            />
            <FieldError messages={fieldErrors} name="primaryCtaLabel" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="primaryCtaHref">Primary CTA URL</Label>
            <Input
              id="primaryCtaHref"
              name="primaryCtaHref"
              defaultValue={row?.primary_cta_href ?? ""}
              placeholder="https://… or /path"
            />
            <FieldError messages={fieldErrors} name="primaryCtaHref" />
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canEdit || pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {state && state.ok === false && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state && state.ok === true && (
          <p className="text-sm text-emerald-400">
            Saved (v{state.version}).
          </p>
        )}
        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            Read-only — you do not have permission to edit identity.
          </p>
        )}
      </div>
    </form>
  );
}
