"use client";

/**
 * Mobile tab — first-class mobile-side composition.
 *
 * Mobile is intentionally separate from Layout — operators don't think
 * "desktop minus stuff", they think "what does the menu look like, where
 * does the CTA go, how does the bar collapse". This tab answers those.
 *
 * In this first cut we ship two functional controls + IA stubs for the
 * three controls that need design judgment in the next session.
 */

import { InspectorGroup } from "../../kit";
import { GroupDescription, NextPassRow } from "../tab-helpers";
import {
  CtaPlacementThumb_Both,
  CtaPlacementThumb_Hidden,
  CtaPlacementThumb_InsideMenuOnly,
  CtaPlacementThumb_Right,
  MobileNavThumb_DrawerRight,
  MobileNavThumb_FullScreen,
  MobileNavThumb_SheetBottom,
} from "../thumbnails";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";
import type { ComponentType } from "react";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
}

const MOBILE_NAV_OPTIONS: Array<{
  value: string;
  label: string;
  helper: string;
  Thumb: ComponentType;
}> = [
  {
    value: "drawer-right",
    label: "Drawer right",
    helper: "Slides in from the right. Classic mobile pattern.",
    Thumb: MobileNavThumb_DrawerRight,
  },
  {
    value: "sheet-bottom",
    label: "Sheet bottom",
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

const MOBILE_CTA_OPTIONS: Array<{
  value: string;
  label: string;
  helper: string;
  Thumb: ComponentType;
}> = [
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

export function MobileTab({ config, patch }: Props) {
  const navVariant =
    config.branding.themeJson["shell.mobile-nav-variant"] ?? "drawer-right";
  const ctaPlacement =
    config.branding.themeJson["shell.header-mobile-cta-placement"] ?? "outside";

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup title="Mobile menu style">
        <GroupDescription>
          How the navigation reveals when a visitor taps the hamburger.
        </GroupDescription>
        <ChipGrid
          options={MOBILE_NAV_OPTIONS}
          value={navVariant}
          onChange={(v) => patch.patchToken("shell.mobile-nav-variant", v)}
          columns={3}
        />
      </InspectorGroup>

      <InspectorGroup title="Mobile CTA placement">
        <GroupDescription>
          Mobile-specific override of the desktop CTA decision.
        </GroupDescription>
        <ChipGrid
          options={MOBILE_CTA_OPTIONS}
          value={ctaPlacement}
          onChange={(v) =>
            patch.patchToken("shell.header-mobile-cta-placement", v)
          }
          columns={2}
        />
      </InspectorGroup>

      <InspectorGroup title="Coming next pass" advanced collapsible storageKey="header:mobile:next-pass">
        <GroupDescription>
          Mobile-only refinements that need their own design work.
        </GroupDescription>
        <NextPassRow label="Hamburger placement" hint="Left vs right of the bar." />
        <NextPassRow
          label="Featured links inside menu"
          hint="Pin specific links to the top of the mobile menu."
        />
        <NextPassRow
          label="Mobile bar utility cluster"
          hint="Which icons stay in the bar vs collapse into the menu."
        />
      </InspectorGroup>
    </div>
  );
}

function ChipGrid({
  options,
  value,
  onChange,
  columns,
}: {
  options: Array<{
    value: string;
    label: string;
    helper: string;
    Thumb: ComponentType;
  }>;
  value: string;
  onChange: (next: string) => void;
  columns: 2 | 3;
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
            className={`group flex flex-col items-stretch gap-2 rounded-lg border p-2.5 text-left transition ${
              active
                ? "border-indigo-300 bg-indigo-50/40 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
                : "border-[#e5e0d5] bg-[#faf9f6] hover:border-stone-300 hover:bg-white"
            }`}
          >
            <span className="flex items-center justify-center rounded-md bg-white py-1.5">
              <opt.Thumb />
            </span>
            <span className="flex flex-col gap-0.5 px-0.5">
              <span
                className={`text-[12px] font-semibold ${active ? "text-indigo-700" : "text-stone-700"}`}
              >
                {opt.label}
              </span>
              <span className="text-[10.5px] leading-snug text-stone-500">
                {opt.helper}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

