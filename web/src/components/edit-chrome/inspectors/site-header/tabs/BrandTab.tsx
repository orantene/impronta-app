"use client";

/**
 * Brand tab — the WHO of the header bar.
 *
 * Holds everything an operator thinks of as "this is my brand":
 *   - Identity (label, tagline, primary CTA inputs live here too)
 *   - Logo
 *   - Brand layout (mark + text lockup style)
 *   - Brand colors (primary, accent — the brand palette)
 *   - Typography preset
 *
 * 2026-04-30 IA pass — these used to be split between Brand and a
 * separate "Style" tab, which forced operators to tab-hop while
 * editing one logical concept ("what does my brand look like?").
 * Colors live HERE because they're brand-level decisions; surface
 * colors (header bg/text/border) live in Layout because they're
 * about the bar, not the brand.
 *
 * Visual contract (matches CTA Banner / Hero inspectors):
 *   InspectorGroup → KIT.field → KIT.label + KIT.input. No bespoke
 *   group chrome. Helper microcopy lives in the InspectorGroup info-tip
 *   so the field surface stays calm.
 */

import { useEffect, useState } from "react";

import { useEditContext } from "../../../edit-context";
import { InspectorGroup, KIT, MediaField, toMediaValue } from "../../kit";
import {
  normalizeHeaderContactLink,
  normalizeHeaderSocialLink,
} from "@/lib/site-admin/site-header/social-contact-normalize";
import {
  BrandLayoutThumb_Inline,
  BrandLayoutThumb_LogoOnly,
  BrandLayoutThumb_Stacked,
  BrandLayoutThumb_TextOnly,
  BrandPositionThumb_Center,
  BrandPositionThumb_Left,
  BrandPositionThumb_Right,
} from "../thumbnails";
import { ColorRow } from "../shared/ColorRow";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
  tenantId: string;
}

type SocialContactKey =
  | "socialInstagram"
  | "socialTiktok"
  | "socialFacebook"
  | "socialYoutube"
  | "socialLinkedin"
  | "socialX"
  | "whatsapp"
  | "contactPhone"
  | "contactEmail";

type SocialContactField = {
  key: SocialContactKey;
  label: string;
  placeholder: string;
  maxLength: number;
  normalize: (value: string) => unknown | null;
  invalidMessage: string;
};

const SOCIAL_CONTACT_FIELDS: SocialContactField[] = [
  {
    key: "socialInstagram",
    label: "Instagram",
    placeholder: "e.g. https://instagram.com/impronta",
    maxLength: 120,
    normalize: (value) => normalizeHeaderSocialLink("instagram", value),
    invalidMessage: "Use an Instagram URL or handle.",
  },
  {
    key: "socialTiktok",
    label: "TikTok",
    placeholder: "e.g. https://tiktok.com/@impronta",
    maxLength: 120,
    normalize: (value) => normalizeHeaderSocialLink("tiktok", value),
    invalidMessage: "Use a TikTok URL or handle.",
  },
  {
    key: "socialFacebook",
    label: "Facebook",
    placeholder: "e.g. https://facebook.com/impronta",
    maxLength: 120,
    normalize: (value) => normalizeHeaderSocialLink("facebook", value),
    invalidMessage: "Use a Facebook URL or handle.",
  },
  {
    key: "socialYoutube",
    label: "YouTube",
    placeholder: "e.g. https://youtube.com/@impronta",
    maxLength: 120,
    normalize: (value) => normalizeHeaderSocialLink("youtube", value),
    invalidMessage: "Use a YouTube URL or handle.",
  },
  {
    key: "socialLinkedin",
    label: "LinkedIn",
    placeholder: "e.g. https://linkedin.com/company/impronta",
    maxLength: 120,
    normalize: (value) => normalizeHeaderSocialLink("linkedin", value),
    invalidMessage: "Use a LinkedIn URL or company handle.",
  },
  {
    key: "socialX",
    label: "X (Twitter)",
    placeholder: "e.g. https://x.com/impronta",
    maxLength: 120,
    normalize: (value) => normalizeHeaderSocialLink("x", value),
    invalidMessage: "Use an X/Twitter URL or handle.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    placeholder: "e.g. +52 984 000 0000",
    maxLength: 40,
    normalize: (value) => normalizeHeaderContactLink("whatsapp", value),
    invalidMessage: "Use a WhatsApp phone number.",
  },
  {
    key: "contactPhone",
    label: "Phone",
    placeholder: "e.g. +52 984 000 0000",
    maxLength: 40,
    normalize: (value) => normalizeHeaderContactLink("phone", value),
    invalidMessage: "Use a complete phone number.",
  },
  {
    key: "contactEmail",
    label: "Email",
    placeholder: "e.g. hello@improntamodels.com",
    maxLength: 240,
    normalize: (value) => normalizeHeaderContactLink("email", value),
    invalidMessage: "Use a valid email address.",
  },
];

const POSITION_OPTIONS = [
  {
    value: "left" as const,
    label: "Left",
    helper: "Brand on the left, nav and CTA flow rightward. Classic editorial.",
    Thumb: BrandPositionThumb_Left,
  },
  {
    value: "center" as const,
    label: "Center",
    helper: "Centered brand. Reads as boutique / fashion-forward.",
    Thumb: BrandPositionThumb_Center,
  },
  {
    value: "right" as const,
    label: "Right",
    helper: "Brand on the right. Rare; for type-forward studios with a strong wordmark.",
    Thumb: BrandPositionThumb_Right,
  },
];

const LAYOUT_OPTIONS = [
  {
    value: "inline" as const,
    label: "Inline",
    helper: "Mark + text on one line. The classic header lockup.",
    Thumb: BrandLayoutThumb_Inline,
  },
  {
    value: "stacked" as const,
    label: "Stacked",
    helper: "Mark above text. Editorial feel; reads like a wordmark.",
    Thumb: BrandLayoutThumb_Stacked,
  },
  {
    value: "logo-only" as const,
    label: "Logo only",
    helper: "Hide the text. For brands with a strong recognizable mark.",
    Thumb: BrandLayoutThumb_LogoOnly,
  },
  {
    value: "text-only" as const,
    label: "Text only",
    helper: "Hide the mark. Clean type-forward header.",
    Thumb: BrandLayoutThumb_TextOnly,
  },
];

export function BrandTab({ config, patch, tenantId }: Props) {
  const { workspaceMembershipSlug } = useEditContext();
  const designSettingsHref =
    workspaceMembershipSlug != null && workspaceMembershipSlug !== ""
      ? `/${workspaceMembershipSlug}/admin/website`
      : "/admin/site-settings/design";
  const layout =
    config.branding.themeJson["shell.header-brand-layout"] ?? "inline";
  const position =
    config.branding.themeJson["shell.header-brand-position"] ?? "left";

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Brand text"
        info="Shown in the header bar, tabs, browser title, and OpenGraph defaults."
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Brand label</label>
          <input
            type="text"
            className={KIT.input}
            placeholder="e.g. Impronta"
            maxLength={120}
            value={config.identity.publicName}
            onChange={(e) => patch.patchIdentity({ publicName: e.target.value })}
          />
        </div>

        <div className={KIT.field}>
          <label className={KIT.label}>Tagline</label>
          <input
            type="text"
            className={KIT.input}
            placeholder="Optional, e.g. Models & image agency"
            maxLength={160}
            value={config.identity.tagline ?? ""}
            onChange={(e) =>
              patch.patchIdentity({ tagline: e.target.value || null })
            }
          />
        </div>
      </InspectorGroup>

      <InspectorGroup
        title="Social & contact"
        info="Shown in the premium header cluster (and the footer, one source of truth). Leave a field blank to hide it. Nothing is auto-generated; only what you enter renders."
      >
        {SOCIAL_CONTACT_FIELDS.map((field) => {
          const value = (config.identity[field.key] as string | null) ?? "";
          const invalid =
            value.trim().length > 0 && field.normalize(value) == null;
          return (
            <div className={KIT.field} key={field.key}>
              <label className={KIT.label}>{field.label}</label>
              <input
                type="text"
                className={KIT.input}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                value={value}
                aria-invalid={invalid ? "true" : undefined}
                onChange={(e) =>
                  patch.patchIdentity({
                    [field.key]: e.target.value.trim() || null,
                  } as Parameters<typeof patch.patchIdentity>[0])
                }
              />
              {invalid ? (
                <p className="m-0 text-[11px] leading-4 text-blue-700">
                  {field.invalidMessage} Invalid values are hidden from the
                  live header.
                </p>
              ) : null}
            </div>
          );
        })}
      </InspectorGroup>

      <InspectorGroup
        title="Logo"
        info="Square mark, 60×60 minimum. SVG preferred so it stays crisp on retina."
      >
        <LogoField
          tenantId={tenantId}
          currentAssetId={config.branding.logoMediaAssetId}
          onChange={(id) => patch.patchBranding({ logoMediaAssetId: id })}
        />
      </InspectorGroup>

      <InspectorGroup
        title="Brand position"
        info="Where the brand anchors in the header bar. Independent of the lockup style below."
      >
        <div className="grid grid-cols-3 gap-2">
          {POSITION_OPTIONS.map((opt) => {
            const active = position === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  patch.patchToken("shell.header-brand-position", opt.value)
                }
                title={`${opt.label}: ${opt.helper}`}
                aria-label={opt.label}
                className={`group flex flex-col items-stretch gap-1.5 rounded-lg border p-2 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] ${
                  active
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-transparent bg-[#faf9f6] hover:border-[#e5e0d5] hover:bg-white"
                }`}
              >
                <span className="flex items-center justify-center rounded-md bg-white py-1.5">
                  <opt.Thumb />
                </span>
                <span
                  className={`px-0.5 text-[11.5px] font-medium ${active ? "text-indigo-700" : "text-stone-700"}`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </InspectorGroup>

      <InspectorGroup
        title="Brand layout"
        info="How the mark and text sit together in the header."
      >
        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_OPTIONS.map((opt) => {
            const active = layout === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  patch.patchToken("shell.header-brand-layout", opt.value)
                }
                title={`${opt.label}: ${opt.helper}`}
                aria-label={opt.label}
                className={`group flex flex-col items-stretch gap-1.5 rounded-lg border p-2 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] ${
                  active
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-transparent bg-[#faf9f6] hover:border-[#e5e0d5] hover:bg-white"
                }`}
              >
                <span className="flex items-center justify-center rounded-md bg-white py-1.5">
                  <opt.Thumb />
                </span>
                <span
                  className={`px-0.5 text-[11.5px] font-medium ${active ? "text-indigo-700" : "text-stone-700"}`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </InspectorGroup>

      <InspectorGroup
        title="Brand colors"
        info="Primary drives the CTA button + active states across the site. Accent is the gold/highlight register: small chips, link underlines, dividers."
      >
        <ColorRow
          label="Primary"
          hint="The CTA button and active selection."
          value={config.branding.primaryColor ?? ""}
          onChange={(hex) =>
            patch.patchBranding({ primaryColor: hex || null })
          }
        />
        <div className="h-2" />
        <ColorRow
          label="Accent"
          hint="Secondary highlight: gold-line dividers, link underlines."
          value={config.branding.accentColor ?? ""}
          onChange={(hex) =>
            patch.patchBranding({ accentColor: hex || null })
          }
        />
      </InspectorGroup>

      <InspectorGroup
        title="Typography"
        info="The brand's font preset. Header type follows it; full Google Fonts picker is one click away in design settings."
      >
        <div className="flex items-center justify-between gap-3 rounded-lg border border-transparent bg-[#faf9f6] px-3 py-2.5 transition-[border-color] duration-150 hover:border-[#e5e0d5]">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10.5px] uppercase tracking-wider text-stone-500">
              Current preset
            </span>
            <span className="text-[13px] font-semibold text-stone-800">
              {config.branding.fontPreset || "default"}
            </span>
          </div>
          <a
            href={designSettingsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11.5px] font-medium text-indigo-600 transition-colors hover:text-indigo-800"
          >
            Change in design →
          </a>
        </div>
      </InspectorGroup>
    </div>
  );
}

function LogoField({
  currentAssetId,
  onChange,
  tenantId,
}: {
  currentAssetId: string | null;
  onChange: (id: string | null) => void;
  tenantId: string;
}) {
  // Resolve the asset id → public URL so we can render a thumbnail.
  // Same /api/admin/media/library endpoint the picker uses.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!currentAssetId) {
      setPreviewUrl(null);
      return;
    }
    setResolving(true);
    (async () => {
      try {
        // QA 2026-05-13 — previously fetched the full media library (up
        // to 60 items) and scanned client-side to resolve one asset.
        // The route now honors `?id=` for server-side single-asset
        // lookup; switch to it so opening the BrandTab doesn't
        // over-fetch.
        const res = await fetch(
          `/api/admin/media/library?tenantId=${encodeURIComponent(
            tenantId,
          )}&id=${encodeURIComponent(currentAssetId)}`,
          { cache: "no-store" },
        );
        const body = await res.json();
        if (cancelled) return;
        if (res.ok && body.ok && Array.isArray(body.items)) {
          const found = body.items.find(
            (m: { id: string; publicUrl: string }) => m.id === currentAssetId,
          );
          setPreviewUrl(found?.publicUrl ?? null);
        }
      } catch {
        // Silent — preview is a nice-to-have, not load-blocking.
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentAssetId, tenantId]);

  // The whole thumbnail IS the trigger — that is `<MediaField layout="cover">`.
  // This used to be hand-rolled: an `[&>button]:absolute [&>button]:inset-0 …`
  // arbitrary-selector cascade reaching INTO `MediaPicker` to erase the button
  // it renders, plus a hand-written hover ×. `brand-quick-panel.tsx` carried a
  // byte-identical copy. Both are gone; the affordance is one component now.
  //
  // `resolving` is still consulted so an unresolved id shows nothing rather
  // than an "Add logo" empty state that would lie about the current value.
  return (
    <div className="size-24">
      <MediaField
        tenantId={tenantId}
        aspect="1/1"
        layout="cover"
        emptyLabel={resolving ? "" : "Logo"}
        coverReplaceLabel="Replace"
        // The consumer stores an ASSET ID, not a URL, so a pasted URL has
        // nothing to store — the escape hatch is off for this field.
        allowUrlPaste={false}
        value={toMediaValue(previewUrl, currentAssetId)}
        onChange={(next) => onChange(next?.mediaId ?? null)}
      />
    </div>
  );
}
