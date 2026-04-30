"use client";

/**
 * Layout tab — the HOW of the header bar.
 *
 * 2026-04-30 — Tab IA reduction landed here. Old tabs Mobile / Behavior /
 * Style folded in as collapsible sub-sections, so the operator never
 * leaves Layout while making layout-and-surface decisions.
 *
 * Sequence (matches operator decision order):
 *   1. Composition       — nav alignment, CTA placement, header style
 *   2. Surface           — bg / text / hairline (free-form colors), page mode
 *   3. Mobile            — mobile menu variant, mobile CTA placement
 *   4. Behavior          — sticky, transparent-on-hero
 *
 * The "Brand position" chip moved to the Brand tab where it belongs
 * (it's a brand-level decision that happens to express through layout).
 */

import { InspectorGroup, KIT } from "../../kit";
import {
  CtaPlacementThumb_Both,
  CtaPlacementThumb_Hidden,
  CtaPlacementThumb_InsideMenuOnly,
  CtaPlacementThumb_Right,
  HeaderVariantThumb_CenteredEditorial,
  HeaderVariantThumb_Classic,
  HeaderVariantThumb_EditorialSticky,
  HeaderVariantThumb_Espresso,
  HeaderVariantThumb_Minimal,
  MobileNavThumb_DrawerRight,
  MobileNavThumb_FullScreen,
  MobileNavThumb_SheetBottom,
  NavAlignThumb_Center,
  NavAlignThumb_Left,
  NavAlignThumb_Right,
  NavAlignThumb_Split,
} from "../thumbnails";
import { ColorRow } from "../shared/ColorRow";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";
import type { ComponentType } from "react";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
}

interface ChipDef<T extends string> {
  value: T;
  label: string;
  helper: string;
  Thumb: ComponentType;
}

const HEADER_VARIANT_OPTIONS: ChipDef<string>[] = [
  {
    value: "classic-solid",
    label: "Classic",
    helper: "Solid bar, traditional. Reliable default.",
    Thumb: HeaderVariantThumb_Classic,
  },
  {
    value: "editorial-sticky",
    label: "Editorial",
    helper: "Soft blur, ivory tone. Refined, content-first.",
    Thumb: HeaderVariantThumb_EditorialSticky,
  },
  {
    value: "espresso-column",
    label: "Espresso",
    helper: "Dark bar, light type. Moody, premium.",
    Thumb: HeaderVariantThumb_Espresso,
  },
  {
    value: "centered-editorial",
    label: "Centered",
    helper: "Logo center, nav split. Boutique, editorial.",
    Thumb: HeaderVariantThumb_CenteredEditorial,
  },
  {
    value: "minimal",
    label: "Minimal",
    helper: "Hairline border only. Maximum content focus.",
    Thumb: HeaderVariantThumb_Minimal,
  },
];

const NAV_ALIGN_OPTIONS: ChipDef<string>[] = [
  {
    value: "left",
    label: "Left",
    helper: "Nav next to the search icon. Default.",
    Thumb: NavAlignThumb_Left,
  },
  {
    value: "center",
    label: "Center",
    helper: "Nav fans out next to the centered brand.",
    Thumb: NavAlignThumb_Center,
  },
  {
    value: "right",
    label: "Right",
    helper: "Nav clusters before the utility icons on the right.",
    Thumb: NavAlignThumb_Right,
  },
  {
    value: "split-around-logo",
    label: "Split",
    helper: "Half on each side of the centered brand.",
    Thumb: NavAlignThumb_Split,
  },
];

const CTA_PLACEMENT_OPTIONS: ChipDef<string>[] = [
  {
    value: "right",
    label: "Right",
    helper: "Filled button on the right. The conventional CTA spot.",
    Thumb: CtaPlacementThumb_Right,
  },
  {
    value: "inside-menu-only",
    label: "Inside menu",
    helper: "CTA hidden in the bar; appears at the top of the mobile menu.",
    Thumb: CtaPlacementThumb_InsideMenuOnly,
  },
  {
    value: "both",
    label: "Both",
    helper: "Visible in the bar and inside the menu. Belt-and-braces.",
    Thumb: CtaPlacementThumb_Both,
  },
  {
    value: "hidden",
    label: "Hidden",
    helper: "Don't show a CTA. Useful for editorial / portfolio sites.",
    Thumb: CtaPlacementThumb_Hidden,
  },
];

const MOBILE_NAV_OPTIONS: ChipDef<string>[] = [
  {
    value: "drawer-right",
    label: "Drawer",
    helper: "Slides in from the right. Classic mobile pattern.",
    Thumb: MobileNavThumb_DrawerRight,
  },
  {
    value: "sheet-bottom",
    label: "Sheet",
    helper: "Slides up from below. Modern app feel.",
    Thumb: MobileNavThumb_SheetBottom,
  },
  {
    value: "full-screen-fade",
    label: "Full-screen",
    helper: "Covers the page. Editorial, immersive.",
    Thumb: MobileNavThumb_FullScreen,
  },
];

const MOBILE_CTA_OPTIONS: ChipDef<string>[] = [
  {
    value: "outside",
    label: "In bar",
    helper: "CTA stays visible in the mobile top bar.",
    Thumb: CtaPlacementThumb_Right,
  },
  {
    value: "inside",
    label: "Inside menu",
    helper: "CTA only inside the hamburger menu.",
    Thumb: CtaPlacementThumb_InsideMenuOnly,
  },
  {
    value: "both",
    label: "Both",
    helper: "Visible in the bar and in the menu.",
    Thumb: CtaPlacementThumb_Both,
  },
  {
    value: "hidden",
    label: "Hidden",
    helper: "Don't show a CTA on mobile.",
    Thumb: CtaPlacementThumb_Hidden,
  },
];

const BACKGROUND_MODES: Array<{
  value: string;
  label: string;
  helper: string;
  swatch: string;
}> = [
  { value: "plain", label: "Plain", helper: "Solid neutral. The safest default.", swatch: "#fafaf9" },
  { value: "editorial-ivory", label: "Ivory", helper: "Warm cream canvas. Boutique editorial feel.", swatch: "#f6f1ea" },
  { value: "editorial-noir", label: "Noir", helper: "Black canvas, gold serif type. Couture register.", swatch: "#1a1714" },
  { value: "champagne-gradient", label: "Champagne", helper: "Soft gold-to-ivory gradient. Wedding / lifestyle.", swatch: "linear-gradient(135deg,#f6e8c8,#fdf6e7)" },
  { value: "aurora", label: "Aurora", helper: "Subtle radial glow. Energetic, modern.", swatch: "radial-gradient(circle at 30% 20%, #d6b8e8, transparent 70%)" },
  { value: "mesh-blush", label: "Mesh blush", helper: "Soft blush mesh. Romantic, feminine.", swatch: "radial-gradient(circle at 30% 30%, #f4c2c2, #fff 80%)" },
  { value: "mesh-noir", label: "Mesh noir", helper: "Dark mesh with subtle warmth. Premium night.", swatch: "radial-gradient(circle at 70% 30%, #3a2a2a, #1a1a1a 80%)" },
  { value: "noise-texture", label: "Texture", helper: "Subtle paper grain. Tactile, considered.", swatch: "#e8e3d8" },
];

export function LayoutTab({ config, patch }: Props) {
  const variant =
    config.branding.themeJson["shell.header-variant"] ?? "classic-solid";
  const navAlign =
    config.branding.themeJson["shell.header-nav-alignment"] ?? "left";
  const ctaPlacement =
    config.branding.themeJson["shell.header-cta-placement"] ?? "right";
  const mobileNav =
    config.branding.themeJson["shell.mobile-nav-variant"] ?? "drawer-right";
  const mobileCta =
    config.branding.themeJson["shell.header-mobile-cta-placement"] ?? "outside";
  const sticky = config.branding.themeJson["shell.header-sticky"] ?? "on";
  const transparent =
    config.branding.themeJson["shell.header-transparent-on-hero"] ?? "off";
  const bgMode = config.branding.themeJson["background.mode"] ?? "plain";
  const headerBg = config.branding.themeJson["shell.header-bg"] ?? "";
  const headerText = config.branding.themeJson["shell.header-text"] ?? "";
  const headerBorder = config.branding.themeJson["shell.header-border"] ?? "";

  return (
    <div className="flex flex-col gap-6">
      {/* ── 1. Composition ─────────────────────────────────────── */}
      <InspectorGroup
        title="Nav alignment"
        info="Where the inline links sit on desktop. Mobile keeps them inside the hamburger menu regardless."
      >
        <ChipGrid
          options={NAV_ALIGN_OPTIONS}
          value={navAlign}
          onChange={(v) => patch.patchToken("shell.header-nav-alignment", v)}
          columns={2}
        />
      </InspectorGroup>

      <InspectorGroup
        title="CTA placement"
        info="Renders the brand's primary call-to-action button. Picks up its label and link from Brand → Primary CTA."
      >
        <ChipGrid
          options={CTA_PLACEMENT_OPTIONS}
          value={ctaPlacement}
          onChange={(v) => patch.patchToken("shell.header-cta-placement", v)}
          columns={2}
        />
        <CtaIdentityHint config={config} />
      </InspectorGroup>

      <InspectorGroup
        title="Header style"
        info="Overall visual treatment of the bar. Try one — colors below let you customize from there."
      >
        <ChipGrid
          options={HEADER_VARIANT_OPTIONS}
          value={variant}
          onChange={(v) => patch.patchToken("shell.header-variant", v)}
          columns={2}
        />
      </InspectorGroup>

      {/* ── 2. Surface ─────────────────────────────────────────── */}
      <InspectorGroup
        title="Header surface"
        info="Override the bar's bg / text / hairline with any CSS color (hex, rgba, hsla, oklch). Empty = follow the page background mode below."
      >
        <ColorRow
          label="Background"
          hint="The header bar's surface color. Wins against the variant + page mode."
          value={headerBg}
          onChange={(v) => patch.patchToken("shell.header-bg", v)}
        />
        <div className="h-2" />
        <ColorRow
          label="Text"
          hint="Brand label, nav links, utility icons."
          value={headerText}
          onChange={(v) => patch.patchToken("shell.header-text", v)}
        />
        <div className="h-2" />
        <ColorRow
          label="Hairline"
          hint="Bottom border tone. Subtle line, or transparent for clean float."
          value={headerBorder}
          onChange={(v) => patch.patchToken("shell.header-border", v)}
        />
      </InspectorGroup>

      <InspectorGroup
        title="Page background"
        info="The canvas the header sits on. A curated mood — or leave it and customize the surface above."
      >
        <div className="grid grid-cols-2 gap-2">
          {BACKGROUND_MODES.map((opt) => {
            const active = bgMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch.patchToken("background.mode", opt.value)}
                title={`${opt.label} — ${opt.helper}`}
                aria-label={opt.label}
                className={`group flex flex-col items-stretch gap-1.5 rounded-lg border p-2 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] ${
                  active
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-transparent bg-[#faf9f6] hover:border-[#e5e0d5] hover:bg-white"
                }`}
              >
                <span
                  aria-hidden
                  className="block h-9 rounded-md border border-stone-200/60"
                  style={{ background: opt.swatch }}
                />
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

      {/* ── 3. Mobile ──────────────────────────────────────────── */}
      <InspectorGroup
        title="Mobile menu"
        info="How the navigation reveals on mobile when a visitor taps the hamburger."
        collapsible
        storageKey="site-header:mobile"
      >
        <ChipGrid
          options={MOBILE_NAV_OPTIONS}
          value={mobileNav}
          onChange={(v) => patch.patchToken("shell.mobile-nav-variant", v)}
          columns={3}
        />
        <div className="h-3" />
        <span className={KIT.label}>CTA on mobile</span>
        <div className="h-1.5" />
        <ChipGrid
          options={MOBILE_CTA_OPTIONS}
          value={mobileCta}
          onChange={(v) =>
            patch.patchToken("shell.header-mobile-cta-placement", v)
          }
          columns={2}
        />
      </InspectorGroup>

      {/* ── 4. Behavior ────────────────────────────────────────── */}
      <InspectorGroup
        title="Behavior"
        info="Scroll + interaction. Sticky pins the bar; transparent-on-hero pairs with full-bleed heroes."
        collapsible
        storageKey="site-header:behavior"
      >
        <ToggleRow
          label="Pin header to viewport"
          hint="On keeps the bar accessible while reading."
          checked={sticky === "on"}
          onChange={(v) =>
            patch.patchToken("shell.header-sticky", v ? "on" : "off")
          }
        />
        <div className="h-2" />
        <ToggleRow
          label="Transparent on hero, solid on scroll"
          hint="Pairs with full-bleed hero images."
          checked={transparent === "on"}
          onChange={(v) =>
            patch.patchToken(
              "shell.header-transparent-on-hero",
              v ? "on" : "off",
            )
          }
        />
      </InspectorGroup>
    </div>
  );
}

function ChipGrid({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: ChipDef<string>[];
  value: string;
  onChange: (next: string) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className={`grid ${columns === 2 ? "grid-cols-2" : "grid-cols-3"} gap-2`}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            // Helper text moves to native title — appears on hover
            // without occupying every chip's vertical real estate.
            title={`${opt.label} — ${opt.helper}`}
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
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-transparent bg-[#faf9f6] px-3 py-2.5 transition-[border-color,background-color] duration-150 hover:border-[#e5e0d5] hover:bg-white">
      <span className="flex flex-col gap-0.5">
        <span className="text-[12.5px] font-medium text-stone-800">{label}</span>
        {hint ? (
          <span className="text-[10.5px] leading-snug text-stone-500">{hint}</span>
        ) : null}
      </span>
      <span
        role="switch"
        aria-checked={checked}
        className={`relative inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border transition ${
          checked
            ? "border-indigo-400 bg-indigo-500 text-white"
            : "border-stone-300 bg-white text-stone-400"
        }`}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
      >
        {checked ? (
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 8 3 3 7-7" />
          </svg>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function CtaIdentityHint({ config }: { config: SiteHeaderConfig }) {
  const hasCta =
    Boolean(config.identity.primaryCtaLabel?.trim()) &&
    Boolean(config.identity.primaryCtaHref?.trim());

  if (hasCta) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-50/60 px-2.5 py-2 text-[11px] text-emerald-800">
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-emerald-500" />
        CTA set: <span className="font-semibold">{config.identity.primaryCtaLabel}</span>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-[#e5e0d5] bg-[#faf9f6] px-2.5 py-2 text-[11px] text-stone-600">
      No CTA configured. Set one in the <span className="font-medium">Brand</span> tab
      (or under <span className="font-medium">Identity → Primary CTA</span>) and any
      placement other than “hidden” will surface it.
    </div>
  );
}
