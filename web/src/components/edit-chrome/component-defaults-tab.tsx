"use client";

/**
 * ComponentDefaultsTab — GAP B-4 authoring surface for the per-component-type
 * default-style cascade (the Theme drawer's "Components" tab).
 *
 * The operator sets, per component kind (headings / body / buttons / cards), a
 * small set of default style props. Each prop binds to a THEME TOKEN by default
 * (so "all headings use Ink" follows the theme), or "Inherit" (no default →
 * global/CSS), or a literal value for colors. Editing publishes the working map
 * to the component-defaults bridge so the canvas repaints the cascade LIVE; a
 * "Save draft" persists it (no storefront effect until the drawer's Publish,
 * which copies component_styles_json_draft → live atomically with the theme).
 *
 * Token-binding reuses the SAME bindable catalogs the node inspector uses, so a
 * default like `token:color.ink` resolves through the exact `var(--token-…)`
 * machinery a node binding does — no divergence.
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

import { Card, CardBody, CardHead, CHROME, ColorRow, Field, FieldLabel, Helper, SelectDropdown } from "./kit";
import {
  publishComponentDefaultsPreview,
} from "./component-defaults-bridge";
import type { ComponentStylesSaveResult } from "@/lib/site-admin/edit-mode/design-actions";
import {
  STYLE_BINDABLE_COLOR_TOKENS,
  STYLE_BINDABLE_FONT_FAMILY_TOKENS,
  STYLE_BINDABLE_RADIUS_TOKENS,
} from "@/lib/site-admin/builder-node/style-token-bindings";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

// ── editable surface ────────────────────────────────────────────────────────
// Curated: the props that read as a brand "default" per kind. Each prop is a
// builder-node style field; values are raw or `token:` sentinels — the exact
// vocabulary `applyComponentStyleDefaults` + the renderer already understand.

type FieldType = "color" | "font" | "radius";

interface PropSpec {
  prop: string;
  label: string;
  type: FieldType;
}

const KIND_SPECS: ReadonlyArray<{
  kind: BuilderNodeKind;
  label: string;
  props: ReadonlyArray<PropSpec>;
}> = [
  {
    kind: "heading",
    label: "Headings",
    props: [
      { prop: "textColor", label: "Text color", type: "color" },
      { prop: "fontFamily", label: "Font", type: "font" },
    ],
  },
  {
    kind: "paragraph",
    label: "Body text",
    props: [
      { prop: "textColor", label: "Text color", type: "color" },
      { prop: "fontFamily", label: "Font", type: "font" },
    ],
  },
  {
    kind: "button",
    label: "Buttons",
    props: [
      { prop: "backgroundColor", label: "Background", type: "color" },
      { prop: "textColor", label: "Label color", type: "color" },
      { prop: "borderRadius", label: "Corner radius", type: "radius" },
    ],
  },
  {
    kind: "card",
    label: "Cards",
    props: [
      { prop: "backgroundColor", label: "Surface", type: "color" },
      { prop: "borderColor", label: "Border", type: "color" },
      { prop: "borderRadius", label: "Corner radius", type: "radius" },
    ],
  },
];

const INHERIT_OPTION = "__inherit__";
const CUSTOM_OPTION = "__custom__";

function tokenOptionsFor(type: FieldType): ReadonlyArray<{ value: string; label: string }> {
  const catalog =
    type === "color"
      ? STYLE_BINDABLE_COLOR_TOKENS
      : type === "font"
        ? STYLE_BINDABLE_FONT_FAMILY_TOKENS
        : STYLE_BINDABLE_RADIUS_TOKENS;
  return catalog.map((t) => ({ value: `token:${t.key}`, label: t.label }));
}

// ── component ────────────────────────────────────────────────────────────────

export function ComponentDefaultsTab({
  initialDefaults,
  version,
  onSaved,
  saveComponentStyles,
}: {
  initialDefaults: ComponentStyleDefaults;
  version: number;
  onSaved: (newVersion: number, saved: ComponentStyleDefaults) => void;
  /**
   * Surface-aware persistence. The drawer passes the resolved theme action set's
   * `saveComponentStyles` so this tab writes the talent's `talent_pages.theme`
   * component-style draft on talent surfaces, and `agency_branding` elsewhere —
   * without this tab importing tenant actions directly.
   */
  saveComponentStyles: (input: {
    componentStyles: ComponentStyleDefaults;
    expectedVersion: number;
  }) => Promise<ComponentStylesSaveResult>;
}): ReactElement {
  const [defaults, setDefaults] = useState<ComponentStyleDefaults>(initialDefaults);
  const [savedSnapshot, setSavedSnapshot] = useState<ComponentStyleDefaults>(initialDefaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Project the working map to the canvas the moment the tab mounts + on every
  // edit, so the cascade previews live. Clear on unmount → canvas reverts to the
  // LIVE defaults prop.
  useEffect(() => {
    publishComponentDefaultsPreview(defaults);
  }, [defaults]);

  const dirty = useMemo(
    () => JSON.stringify(defaults) !== JSON.stringify(savedSnapshot),
    [defaults, savedSnapshot],
  );

  const setField = useCallback(
    (kind: BuilderNodeKind, prop: string, value: string) => {
      setDefaults((prev) => {
        const next: ComponentStyleDefaults = { ...prev };
        const kindStyle = { ...(next[kind] ?? {}) } as Record<string, unknown>;
        if (value === "") {
          delete kindStyle[prop]; // inherit → drop the field
        } else {
          kindStyle[prop] = value;
        }
        if (Object.keys(kindStyle).length === 0) {
          delete next[kind];
        } else {
          next[kind] = kindStyle as (typeof next)[typeof kind];
        }
        return next;
      });
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveComponentStyles({
        componentStyles: defaults,
        expectedVersion: version,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedSnapshot(res.componentStylesDraft);
      setDefaults(res.componentStylesDraft);
      onSaved(res.version, res.componentStylesDraft);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }, [defaults, version, onSaved, saveComponentStyles]);

  return (
    <>
      {error ? (
        <div
          className="mb-3 rounded-md px-3 py-2 text-[11px]"
          style={{ background: CHROME.roseBg, border: `1px solid ${CHROME.roseLine}`, color: CHROME.rose }}
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div
        className="mb-3 rounded-md px-3 py-2 text-[11px]"
        style={{ background: CHROME.surface, border: `1px solid ${CHROME.line}`, color: CHROME.muted }}
      >
        Set a default look per element type. Every element of that type starts
        here; any one element can still override it. Bind to a theme token so the
        default follows your palette. Changes preview on the canvas live —{" "}
        <b>Save draft</b>, then <b>Publish theme</b> to go live.
      </div>

      {KIND_SPECS.map((spec) => (
        <Card key={spec.kind}>
          <CardHead title={spec.label} />
          <CardBody>
            {spec.props.map((p, i) => {
              const current = (defaults[spec.kind] as Record<string, unknown> | undefined)?.[
                p.prop
              ];
              return (
                <Field key={p.prop} flush={i === spec.props.length - 1}>
                  <FieldLabel htmlFor={`cd-${spec.kind}-${p.prop}`}>{p.label}</FieldLabel>
                  <DefaultControl
                    id={`cd-${spec.kind}-${p.prop}`}
                    type={p.type}
                    value={typeof current === "string" ? current : ""}
                    onChange={(v) => setField(spec.kind, p.prop, v)}
                  />
                </Field>
              );
            })}
          </CardBody>
        </Card>
      ))}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!dirty || busy}
          style={{
            height: 30,
            padding: "0 12px",
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
            background: !dirty || busy ? CHROME.muted2 : CHROME.accent,
            border: "none",
            borderRadius: 7,
            cursor: !dirty || busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Saving…" : "Save draft"}
        </button>
      </div>
    </>
  );
}

// A single default field: a token/inherit/custom select, plus a hex ColorRow
// when "Custom" is chosen for a color field.
function DefaultControl({
  id,
  type,
  value,
  onChange,
}: {
  id: string;
  type: FieldType;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const tokenOpts = useMemo(() => tokenOptionsFor(type), [type]);
  const isToken = value.startsWith("token:");
  const isCustomColor = type === "color" && value !== "" && !isToken;

  const selectValue = value === "" ? INHERIT_OPTION : isCustomColor ? CUSTOM_OPTION : value;

  // Build the options list for SelectDropdown
  const dropdownOptions = [
    ...tokenOpts,
    ...(type === "color" ? [{ value: CUSTOM_OPTION, label: "Custom color…" }] : []),
  ];

  return (
    <div className="flex flex-col gap-1.5" data-theme-tab="components">
      <SelectDropdown
        id={id}
        value={selectValue}
        onChange={(v) => {
          if (v === INHERIT_OPTION) onChange("");
          else if (v === CUSTOM_OPTION) onChange("#000000");
          else onChange(v);
        }}
        leadingOptions={[{ value: INHERIT_OPTION, label: "Inherit (theme default)" }]}
        options={dropdownOptions}
        data-theme-control={`cd-${id}`}
      />
      {isCustomColor ? (
        <ColorRow value={value} onChange={(v) => onChange(v)} />
      ) : null}
      {type === "color" ? (
        <Helper>Bind to a token so it follows your palette, or pick a custom color.</Helper>
      ) : null}
    </div>
  );
}
