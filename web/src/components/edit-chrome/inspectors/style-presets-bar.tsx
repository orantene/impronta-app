"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { BuilderNodeStyle } from "@/lib/site-admin/builder-node/types";
import type {
  BuilderStylePreset,
  BuilderStylePresetRegistry,
} from "@/lib/site-admin/builder-node/style-classes";
import {
  readPresets,
  writePresets,
  subscribeStylePresetRegistry,
  getStylePresetRegistrySnapshot,
  getStylePresetRegistryServerSnapshot,
} from "@/lib/site-admin/builder-node/style-presets-storage";
import { CHROME } from "../kit/tokens";
import { InlineNameInput } from "./kit/inline-name-input";

/**
 * Copy/paste style + named style presets — a Figma/Webflow-style convenience
 * layer over a freeform node's full style object.
 *
 * STYLE-1 — presets + the copy/paste clipboard are now SITE-SCOPED and
 * DB-backed (not the old GLOBAL per-browser localStorage keys). They live in the
 * shared `style-presets-storage` registry keyed by `pageId`, seeded on load from
 * `CompositionData.stylePresets` and persisted through the active surface adapter
 * on save/publish. This bar reads/writes that registry and subscribes to its
 * cross-subtree bridge so every editor surface sees the same presets. Apply uses
 * OVERLAY semantics (the stored style's top-level keys merge over the target
 * node's current style), so pasting a preset never blanks unrelated properties.
 */

type StylePreset = BuilderStylePreset;

const btnStyle = {
  height: 28,
  paddingInline: 10,
  fontSize: 11,
  fontWeight: 600,
  background: CHROME.surface2,
  border: `1px solid ${CHROME.controlBorder}`,
  borderRadius: 7,
  color: CHROME.ink,
  cursor: "pointer" as const,
};

export function StylePresetsBar({
  pageId,
  currentStyle,
  onApply,
}: {
  /** Site scope — the registry key. `null` → home page. */
  pageId: string | null;
  currentStyle: BuilderNodeStyle | undefined;
  onApply: (style: BuilderNodeStyle) => void;
}) {
  // Subscribe to the shared cross-subtree registry so the bar reflects the
  // SSR-hydrated seed + any writes, identically on every editor surface.
  const registry = useSyncExternalStore<BuilderStylePresetRegistry>(
    subscribeStylePresetRegistry,
    getStylePresetRegistrySnapshot,
    getStylePresetRegistryServerSnapshot,
  );
  const presets = registry.presets;
  const hasClipboard = Boolean(registry.clipboard);

  // INS-3: inline naming state (replaces window.prompt).
  const [namingOpen, setNamingOpen] = useState(false);

  const persist = useCallback(
    (next: BuilderStylePresetRegistry) => {
      // writePresets republishes to the bridge, so the subscription above
      // re-renders this bar (and the canvas) with the new envelope.
      writePresets(pageId, next);
    },
    [pageId],
  );

  const hasStyle = Boolean(currentStyle && Object.keys(currentStyle).length > 0);

  const copyStyle = () => {
    if (!currentStyle) return;
    persist({ ...readPresets(pageId), clipboard: currentStyle });
  };

  const pasteStyle = () => {
    const clip = readPresets(pageId).clipboard;
    if (clip) onApply(clip);
  };

  const commitSavePreset = (name: string) => {
    setNamingOpen(false);
    if (!name.trim() || !currentStyle) return;
    // Stable id without Date.now()/Math.random() (both unavailable here) —
    // derive from name + current count.
    const id = `${name.trim().toLowerCase().replace(/\s+/g, "-")}-${presets.length}`;
    const current = readPresets(pageId);
    persist({
      ...current,
      presets: [...current.presets, { id, name: name.trim(), style: currentStyle }],
    });
  };

  const deletePreset = (id: string) => {
    const current = readPresets(pageId);
    persist({ ...current, presets: current.presets.filter((p) => p.id !== id) });
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-2"
      data-builder-style-presets=""
      style={{ background: CHROME.surface, border: `1px solid ${CHROME.line}` }}
    >
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          data-builder-style-preset-action="copy"
          style={{ ...btnStyle, opacity: hasStyle ? 1 : 0.45 }}
          disabled={!hasStyle}
          onClick={copyStyle}
        >
          Copy style
        </button>
        <button
          type="button"
          data-builder-style-preset-action="paste"
          style={{ ...btnStyle, opacity: hasClipboard ? 1 : 0.45 }}
          disabled={!hasClipboard}
          onClick={pasteStyle}
        >
          Paste
        </button>
        <button
          type="button"
          data-builder-style-preset-action="save"
          style={{ ...btnStyle, opacity: hasStyle ? 1 : 0.45 }}
          disabled={!hasStyle}
          onClick={() => setNamingOpen(true)}
        >
          Save preset…
        </button>
      </div>
      {namingOpen ? (
        <InlineNameInput
          mode="text"
          title="Name this style preset"
          placeholder="Preset name…"
          confirmLabel="Save"
          onConfirm={commitSavePreset}
          onCancel={() => setNamingOpen(false)}
        />
      ) : null}
      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <span
              key={preset.id}
              data-builder-style-preset-chip={preset.id}
              className="inline-flex items-center gap-1 rounded-full"
              style={{
                paddingInline: 8,
                height: 24,
                fontSize: 11,
                background: CHROME.surface2,
                border: `1px solid ${CHROME.controlBorder}`,
                color: CHROME.ink,
              }}
            >
              <button
                type="button"
                className="cursor-pointer"
                style={{ color: CHROME.ink, background: "transparent" }}
                onClick={() => onApply(preset.style)}
                title={`Apply "${preset.name}"`}
              >
                {preset.name}
              </button>
              <button
                type="button"
                className="cursor-pointer leading-none"
                style={{ color: CHROME.muted, background: "transparent" }}
                onClick={() => deletePreset(preset.id)}
                title="Delete preset"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
