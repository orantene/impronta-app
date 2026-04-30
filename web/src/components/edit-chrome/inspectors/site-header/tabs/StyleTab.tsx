"use client";

/**
 * Style tab — color and surface decisions that affect the header.
 *
 * What this tab edits:
 *   - Primary brand color  (writes branding.primary_color directly)
 *   - Accent color         (writes branding.accent_color directly)
 *   - Page background mode (writes background.mode token; optimistic)
 *
 * What's deferred to a follow-up pass:
 *   - Full font picker — Google Fonts integration is its own surface;
 *     for now the current preset is shown with a route to the design
 *     admin where the picker already lives.
 *
 * Why this scope:
 *   The user's mental model in the Style tab is "color + tone of the
 *   bar". Primary + accent + background-mode reach 80% of header
 *   styling decisions; the remainder (fonts, advanced color overrides)
 *   are reasonable to keep one click away in the design admin until we
 *   bring the picker inline.
 */

import { useState } from "react";

import { InspectorGroup, KIT } from "../../kit";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";
import type { SiteHeaderPatch } from "../SiteHeaderInspector";

interface Props {
  config: SiteHeaderConfig;
  patch: SiteHeaderPatch;
}

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

export function StyleTab({ config, patch }: Props) {
  const primary = config.branding.primaryColor ?? "";
  const accent = config.branding.accentColor ?? "";
  const bgMode = config.branding.themeJson["background.mode"] ?? "plain";
  // 2026-04-30 — Open color customization. Empty string = "follow the
  // active background-mode default" (no override applied).
  const headerBg = config.branding.themeJson["shell.header-bg"] ?? "";
  const headerText = config.branding.themeJson["shell.header-text"] ?? "";
  const headerBorder = config.branding.themeJson["shell.header-border"] ?? "";
  const fontPreset = config.branding.fontPreset ?? "default";

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Brand colors"
        info="Primary drives buttons + active states. Accent is the gold/highlight register."
      >
        <ColorRow
          label="Primary"
          hint="Main brand hue. Used by the CTA button and active selection."
          value={primary}
          onChange={(hex) => patch.patchBranding({ primaryColor: hex || null })}
        />
        <div className="h-2" />
        <ColorRow
          label="Accent"
          hint="Secondary highlight — small chips, gold-line dividers, link underlines."
          value={accent}
          onChange={(hex) => patch.patchBranding({ accentColor: hex || null })}
        />
      </InspectorGroup>

      <InspectorGroup
        title="Header surface"
        info="Override the header bar's bg / text / hairline with any CSS color (hex, rgba, hsla, oklch). Leave empty to follow the page background mode below."
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
          hint="Brand label, nav links, utility icons. Works with any header background."
          value={headerText}
          onChange={(v) => patch.patchToken("shell.header-text", v)}
        />
        <div className="h-2" />
        <ColorRow
          label="Hairline"
          hint="Bottom border tone. A subtle line for warmth, or transparent for a clean float."
          value={headerBorder}
          onChange={(v) => patch.patchToken("shell.header-border", v)}
        />
      </InspectorGroup>

      <InspectorGroup
        title="Page background"
        info="The canvas the header sits on. Use a curated mode, or leave it and customize the header surface above."
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

      <InspectorGroup
        title="Typography"
        info="Header type follows the site-wide font preset. Full Google Fonts picker is in design settings."
      >
        <div className="flex items-center justify-between gap-3 rounded-lg border border-transparent bg-[#faf9f6] px-3 py-2.5 transition-[border-color] duration-150 hover:border-[#e5e0d5]">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10.5px] uppercase tracking-wider text-stone-400">
              Current preset
            </span>
            <span className="text-[13px] font-semibold text-stone-800">
              {fontPreset || "default"}
            </span>
          </div>
          <a
            href="/admin/site-settings/design"
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

// ── subcomponents ────────────────────────────────────────────────────

function ColorRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value);

  // Keep input in sync if server-side value updates while we're idle.
  if (draft !== value && document.activeElement?.tagName !== "INPUT") {
    setDraft(value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className={KIT.label}>{label}</span>
        {hint ? <span className={KIT.hint}>{hint}</span> : null}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2 py-1.5">
        {/* Native color picker — no popover anchoring complexity. The
         *  visible swatch IS the input, hidden but clickable through a
         *  custom-styled wrapper. */}
        <label
          aria-label={`Change ${label.toLowerCase()} color`}
          className="relative inline-block size-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-stone-200 transition hover:scale-105"
          style={{ background: isHex ? value : "transparent" }}
        >
          {!isHex ? (
            <span
              aria-hidden
              className="absolute inset-0 bg-[repeating-conic-gradient(#e5e0d8_0_25%,#fff_0_50%)] bg-[length:8px_8px]"
            />
          ) : null}
          <input
            type="color"
            value={isHex ? value : "#000000"}
            onChange={(e) => {
              setDraft(e.target.value);
              onChange(e.target.value);
            }}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <input
          type="text"
          className="flex-1 bg-transparent font-mono text-[12px] text-stone-700 placeholder:text-stone-400 focus:outline-none"
          placeholder="#— or rgba()"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onChange(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(value);
              e.currentTarget.blur();
            }
          }}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              onChange("");
            }}
            className="text-[10.5px] font-medium text-stone-400 transition hover:text-rose-600"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
