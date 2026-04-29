"use client";

/**
 * Style tab — color and typography surface for the header.
 *
 * Placeholder. Color tokens (primary/accent/ink) and font-preset live in
 * agency_branding and are edited today via /admin/site-settings/branding
 * + /admin/site-settings/design. The inspector edits will land in the
 * next pass with proper color-picker + font preview UX.
 */

import { InspectorGroup } from "../../kit";
import { GroupDescription } from "../tab-helpers";
import type { SiteHeaderConfig } from "@/lib/site-admin/site-header/types";

interface Props {
  config: SiteHeaderConfig;
}

export function StyleTab({ config }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup title="Current style">
        <GroupDescription>
          Read-only summary of what the header is using right now.
        </GroupDescription>
        <div className="grid grid-cols-2 gap-2">
          <SwatchRow
            label="Primary color"
            value={config.branding.primaryColor ?? "—"}
          />
          <SwatchRow
            label="Accent color"
            value={config.branding.accentColor ?? "—"}
          />
          <InfoRow
            label="Font preset"
            value={config.branding.fontPreset ?? "default"}
          />
          <InfoRow
            label="Background mode"
            value={
              config.branding.themeJson["background.mode"] ?? "default"
            }
          />
        </div>
      </InspectorGroup>

      <InspectorGroup title="Edit style">
        <GroupDescription>
          Color + font controls move into this drawer in the next pass.
        </GroupDescription>
        <div className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-4 text-[12px] text-stone-600">
          <p className="mb-2">
            <strong className="font-semibold text-stone-800">
              Color + typography editor coming next pass.
            </strong>{" "}
            We'll add accessible color pickers, contrast hints, and a Google Fonts picker that
            previews live in the canvas.
          </p>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <a
            href="/admin/site-settings/branding"
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-[11.5px] font-medium text-indigo-600 transition-colors hover:text-indigo-800"
          >
            Edit colors + logo →
          </a>
          <a
            href="/admin/site-settings/design"
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-[11.5px] font-medium text-indigo-600 transition-colors hover:text-indigo-800"
          >
            Edit typography + design tokens →
          </a>
        </div>
      </InspectorGroup>
    </div>
  );
}

function SwatchRow({ label, value }: { label: string; value: string }) {
  const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2.5 py-2">
      <span
        aria-hidden
        className="inline-block size-5 shrink-0 rounded border border-stone-200"
        style={{ background: isHex ? value : "transparent" }}
      />
      <span className="flex flex-col">
        <span className="text-[10.5px] uppercase tracking-wider text-stone-400">
          {label}
        </span>
        <span className="font-mono text-[11px] text-stone-700">{value}</span>
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2.5 py-2">
      <span className="text-[10.5px] uppercase tracking-wider text-stone-400">
        {label}
      </span>
      <span className="text-[11.5px] font-medium text-stone-700">{value}</span>
    </div>
  );
}
