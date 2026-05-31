"use client";

import { useEffect, useState } from "react";
import type { BuilderNodeStyle } from "@/lib/site-admin/builder-node/types";
import { CHROME } from "../kit/tokens";

/**
 * Copy/paste style + named style presets — a Figma/Webflow-style convenience
 * layer over a freeform node's full style object. Persisted in localStorage
 * (per-browser, no DB migration): a single clipboard slot + a named-preset
 * list. Apply uses OVERLAY semantics (the stored style's top-level keys are
 * merged over the target node's current style), so pasting a preset never
 * blanks unrelated properties.
 */

const CLIPBOARD_KEY = "tulala:builder:style-clipboard";
const PRESETS_KEY = "tulala:builder:style-presets";

interface StylePreset {
  id: string;
  name: string;
  style: BuilderNodeStyle;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private-mode — non-fatal */
  }
}

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
  currentStyle,
  onApply,
}: {
  currentStyle: BuilderNodeStyle | undefined;
  onApply: (style: BuilderNodeStyle) => void;
}) {
  const [presets, setPresets] = useState<ReadonlyArray<StylePreset>>([]);
  const [hasClipboard, setHasClipboard] = useState(false);

  // Hydrate from localStorage on mount (client-only — avoids SSR mismatch).
  useEffect(() => {
    setPresets(readJson<StylePreset[]>(PRESETS_KEY, []));
    setHasClipboard(Boolean(window.localStorage.getItem(CLIPBOARD_KEY)));
  }, []);

  const hasStyle = Boolean(currentStyle && Object.keys(currentStyle).length > 0);

  const copyStyle = () => {
    if (!currentStyle) return;
    writeJson(CLIPBOARD_KEY, currentStyle);
    setHasClipboard(true);
  };

  const pasteStyle = () => {
    const clip = readJson<BuilderNodeStyle | null>(CLIPBOARD_KEY, null);
    if (clip) onApply(clip);
  };

  const savePreset = () => {
    if (!currentStyle) return;
    const name = window.prompt("Name this style preset");
    if (!name?.trim()) return;
    // Stable id without Date.now()/Math.random() (both unavailable here) —
    // derive from name + current count.
    const id = `${name.trim().toLowerCase().replace(/\s+/g, "-")}-${presets.length}`;
    const next = [...presets, { id, name: name.trim(), style: currentStyle }];
    setPresets(next);
    writeJson(PRESETS_KEY, next);
  };

  const deletePreset = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    writeJson(PRESETS_KEY, next);
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
          onClick={savePreset}
        >
          Save preset…
        </button>
      </div>
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
