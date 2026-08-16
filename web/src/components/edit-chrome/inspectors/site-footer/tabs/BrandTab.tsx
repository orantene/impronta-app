"use client";

/**
 * Brand tab — the footer's identity block plus the two whole-footer looks.
 *
 * IA note: `variant` and `tone` are NOT "layout settings" filed away on a
 * separate tab. They are the first thing an operator picks (what kind of footer
 * is this?) and everything below is a refinement of that choice, so they sit at
 * the top of the first tab. This is the header drawer's 6→3 lesson applied:
 * group by the operator's decision order, not by the schema's field order.
 */

import {
  InspectorField,
  InspectorGroup,
  InspectorInput,
  InspectorTextarea,
  MediaField,
  toMediaValue,
  VisualChipGroup,
  type ChipOption,
} from "../../kit";
import type {
  SiteFooterBrandDisplay,
  SiteFooterTone,
  SiteFooterVariant,
} from "@/lib/site-admin/site-footer/types";
import type { SiteFooterPatch } from "../SiteFooterInspector";
import {
  BrandImageAndTextThumb,
  BrandImageThumb,
  BrandTextThumb,
  FooterCompactThumb,
  FooterEditorialThumb,
  FooterRichThumb,
  FooterStandardThumb,
  ToneDeepThumb,
  ToneFollowThumb,
  ToneLightThumb,
} from "../thumbnails";

const VARIANT_OPTIONS: ReadonlyArray<ChipOption<SiteFooterVariant>> = [
  {
    value: "standard",
    label: "Standard",
    preview: <FooterStandardThumb />,
    info: "Brand block above evenly weighted link columns. The safe default.",
  },
  {
    value: "compact",
    label: "Compact",
    preview: <FooterCompactThumb />,
    info: "One line: wordmark on the left, links on the right. Best when the page already ends with a strong call to action.",
  },
  {
    value: "rich",
    label: "Rich",
    preview: <FooterRichThumb />,
    info: "Wide brand block, three link columns and a social row. Use when the footer is doing real navigation work.",
  },
  {
    value: "editorial",
    label: "Editorial",
    preview: <FooterEditorialThumb />,
    info: "Oversized serif wordmark with the columns tucked to the right. The most magazine-like of the four.",
  },
];

const TONE_OPTIONS: ReadonlyArray<ChipOption<SiteFooterTone>> = [
  {
    value: "follow",
    label: "Follow page",
    preview: <ToneFollowThumb />,
    info: "Inherit whatever tone the page already uses.",
  },
  {
    value: "light",
    label: "Light",
    preview: <ToneLightThumb />,
    info: "Pale surface with dark text.",
  },
  {
    value: "deep",
    label: "Deep",
    preview: <ToneDeepThumb />,
    info: "Dark canvas with light text.",
  },
];

const BRAND_DISPLAY_OPTIONS: ReadonlyArray<ChipOption<SiteFooterBrandDisplay>> = [
  {
    value: "image",
    label: "Logo only",
    preview: <BrandImageThumb />,
    info: "Use when the logo already contains the name, so the wordmark is not printed twice.",
  },
  {
    value: "text",
    label: "Text only",
    preview: <BrandTextThumb />,
    info: "Wordmark and tagline, no image.",
  },
  {
    value: "image-and-text",
    label: "Logo and text",
    preview: <BrandImageAndTextThumb />,
    info: "Logo above the wordmark.",
  },
];

export function BrandTab({
  api,
  tenantId,
}: {
  api: SiteFooterPatch;
  tenantId: string;
}) {
  const { value, patch } = api;

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Footer style"
        info="The overall shape of the footer. Everything below refines the look you pick here."
        searchTerms={["variant", "layout", "standard", "compact", "rich", "editorial"]}
      >
        <VisualChipGroup<SiteFooterVariant>
          value={value.variant}
          onChange={(next) => patch({ variant: next })}
          options={VARIANT_OPTIONS}
          columns={2}
        />
      </InspectorGroup>

      <InspectorGroup
        title="Tone"
        info="Whether the footer keeps the page's tone or switches to its own light or dark surface."
        searchTerms={["tone", "colour", "color", "dark", "light", "surface"]}
      >
        <VisualChipGroup<SiteFooterTone>
          value={value.tone}
          onChange={(next) => patch({ tone: next })}
          options={TONE_OPTIONS}
          columns={3}
        />
      </InspectorGroup>

      <InspectorGroup
        title="Brand"
        info="The identity block at the top of the footer."
        searchTerms={["logo", "wordmark", "name", "tagline", "brand"]}
      >
        <InspectorField label="What to show">
          <VisualChipGroup<SiteFooterBrandDisplay>
            value={value.brandDisplay}
            onChange={(next) => patch({ brandDisplay: next })}
            options={BRAND_DISPLAY_OPTIONS}
            columns={3}
          />
        </InspectorField>

        {/* The logo picker is hidden on `text`, where it would be inert. A
         *  control that does nothing is worse than an absent one — the
         *  operator sets it, sees no change, and concludes the editor is
         *  broken. */}
        {value.brandDisplay !== "text" ? (
          <InspectorField
            label="Footer logo"
            help="Often a simpler or single-colour version of the header logo."
          >
            <MediaField
              tenantId={tenantId}
              value={toMediaValue(value.brand.logoUrl ?? null)}
              // `logoUrl` is a bare string in the footer brand config (no id
              // slot), so the unit collapses to its url. Clear still arrives
              // as an explicit null and writes "" — the config's own
              // "no logo" value.
              onChange={(next) =>
                patch({
                  brand: { ...value.brand, logoUrl: next?.url ?? "" },
                })
              }
              emptyLabel="Choose a footer logo"
              aspect="16/9"
              layout="row"
            />
          </InspectorField>
        ) : null}

        {value.brandDisplay !== "text" && value.brand.logoUrl ? (
          <InspectorField
            label="Logo alt text"
            help="Read aloud by screen readers. Describe the logo, don't repeat the word 'logo'."
          >
            <InspectorInput
              value={value.brand.logoAlt ?? ""}
              maxLength={160}
              placeholder="Nova Crew"
              onChange={(event) =>
                patch({ brand: { ...value.brand, logoAlt: event.target.value } })
              }
            />
          </InspectorField>
        ) : null}

        {value.brandDisplay !== "image" ? (
          <>
            <InspectorField label="Name">
              <InspectorInput
                value={value.brand.label ?? ""}
                maxLength={60}
                placeholder="Nova Crew"
                onChange={(event) =>
                  patch({ brand: { ...value.brand, label: event.target.value } })
                }
              />
            </InspectorField>
            <InspectorField
              label="Tagline"
              help="One short line under the name. Leave empty to hide it."
            >
              <InspectorTextarea
                value={value.brand.tagline ?? ""}
                maxLength={240}
                rows={2}
                placeholder="Casting and talent management, end to end."
                onChange={(event) =>
                  patch({ brand: { ...value.brand, tagline: event.target.value } })
                }
              />
            </InspectorField>
          </>
        ) : null}
      </InspectorGroup>
    </div>
  );
}
