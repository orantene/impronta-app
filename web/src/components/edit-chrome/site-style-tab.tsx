"use client";

/**
 * Theme drawer "Style" tab: the site style tokens (type roles, buttons, shape,
 * spacing) a Design only sets DEFAULTS for. Talent-facing, so presets first,
 * the main controls next and everything else under "Advanced". Each group has
 * "Reset to design default", which clears the group so the Design's own
 * values show again. Colours live in the Colors tab.
 *
 * Per block, the block style controls still win (inline styles), and the
 * radius / spacing / font-size keys can be bound from those controls.
 */
import type { ReactElement } from "react";

import {
  AccordionSection,
  Card,
  CardBody,
  CardHead,
  CHROME,
  Field,
  FieldLabel,
  Segmented,
  TextInput,
  type SegmentedOption,
} from "./kit";
import { useEditorLocale } from "./use-editor-locale";
import {
  STYLE_TOKEN_PRESETS,
  applyStyleTokenPreset,
  resetStyleTokenGroup,
  styleTokensInGroup,
  type StyleTokenDef,
  type StyleTokenGroup,
} from "@/lib/site-admin/tokens/style-tokens";

type Lang = "en" | "es";

const GROUPS: ReadonlyArray<{ group: StyleTokenGroup; en: string; es: string; hintEn: string; hintEs: string }> = [
  { group: "typography", en: "Typography", es: "Tipografía", hintEn: "Title sizes, weights and small labels.", hintEs: "Tamaños de títulos, pesos y etiquetas." },
  { group: "buttons", en: "Buttons", es: "Botones", hintEn: "Shape, size and style of every button.", hintEs: "Forma, tamaño y estilo de cada botón." },
  { group: "shape", en: "Shape", es: "Forma", hintEn: "Corners of cards and photos, line thickness.", hintEs: "Esquinas de tarjetas y fotos, grosor de líneas." },
  { group: "spacing", en: "Spacing", es: "Espaciado", hintEn: "Space between sections and side margins.", hintEs: "Espacio entre secciones y márgenes laterales." },
];

const COPY = {
  designDefault: { en: "Design default", es: "Del diseño" },
  reset: { en: "Reset to design default", es: "Volver al diseño" },
  advanced: { en: "Advanced", es: "Avanzado" },
  colours: {
    en: "Colours are in the Colors tab. Everything here starts from your design and you can change any of it.",
    es: "Los colores están en la pestaña Colores. Todo aquí parte de tu diseño y puedes cambiar lo que quieras.",
  },
} as const;

function isGroupAtDefault(draft: Readonly<Record<string, string>>, group: StyleTokenGroup): boolean {
  return styleTokensInGroup(group).every((d) => !draft[d.key]);
}

function activePresetId(draft: Readonly<Record<string, string>>, group: StyleTokenGroup): string {
  if (isGroupAtDefault(draft, group)) return "default";
  const hit = STYLE_TOKEN_PRESETS[group].find((p) =>
    Object.entries(p.tokens).every(([k, val]) => draft[k] === val),
  );
  return hit?.id ?? "custom";
}

function TokenControl({
  def,
  lang,
  value,
  onChange,
  flush,
}: {
  def: StyleTokenDef;
  lang: Lang;
  value: string;
  onChange: (key: string, value: string) => void;
  flush?: boolean;
}): ReactElement {
  const id = `theme-${def.key}`;
  const defaultLabel = COPY.designDefault[lang];
  if (def.control === "enum") {
    const options: SegmentedOption<string>[] = [
      { value: "", label: defaultLabel },
      ...(def.options ?? []).map((o) => ({ value: o.value, label: o[lang] })),
    ];
    return (
      <Field flush={flush}>
        <FieldLabel htmlFor={id}>{def.label[lang]}</FieldLabel>
        <Segmented value={value} onChange={(v) => onChange(def.key, v)} options={options} fullWidth compact />
      </Field>
    );
  }
  return (
    <Field flush={flush}>
      <FieldLabel htmlFor={id}>{def.label[lang]}</FieldLabel>
      <TextInput
        id={id}
        value={value}
        onChange={(v) => onChange(def.key, v.trim())}
        placeholder={defaultLabel}
        mono
        data-theme-control={`style-${def.key}`}
      />
    </Field>
  );
}

/** The drawer tab label, in the editor's language. */
export function SiteStyleTabLabel(): ReactElement {
  const { locale } = useEditorLocale();
  return <>{locale === "es" ? "Estilo" : "Style"}</>;
}

export function SiteStyleTab({
  draft,
  onChange,
  onReplace,
}: {
  draft: Readonly<Record<string, string>>;
  onChange: (key: string, value: string) => void;
  /** Replace several keys at once (preset / reset). */
  onReplace: (next: Record<string, string>) => void;
}): ReactElement {
  const { locale } = useEditorLocale();
  const lang: Lang = locale === "es" ? "es" : "en";

  return (
    <>
      <p style={{ margin: "0 0 10px", fontSize: 11.5, lineHeight: 1.45, color: CHROME.muted }}>{COPY.colours[lang]}</p>
      {GROUPS.map(({ group, en, es, hintEn, hintEs }) => {
        const defs = styleTokensInGroup(group);
        const main = defs.filter((d) => !d.advanced);
        const advanced = defs.filter((d) => d.advanced);
        const presets = STYLE_TOKEN_PRESETS[group];
        const active = activePresetId(draft, group);
        const presetOptions: SegmentedOption<string>[] = [
          { value: "default", label: COPY.designDefault[lang] },
          ...presets.map((p) => ({ value: p.id, label: p.label[lang] })),
        ];
        return (
          <Card key={group}>
            <CardHead title={lang === "es" ? es : en} sub={lang === "es" ? hintEs : hintEn} />
            <CardBody>
              <Field>
                <Segmented
                  value={active}
                  onChange={(id) => {
                    if (id === "default") {
                      onReplace(resetStyleTokenGroup(draft, group));
                      return;
                    }
                    const preset = presets.find((p) => p.id === id);
                    if (preset) onReplace(applyStyleTokenPreset(draft, preset));
                  }}
                  options={presetOptions}
                  fullWidth
                  compact
                />
              </Field>
              {main.map((def) => (
                <TokenControl key={def.key} def={def} lang={lang} value={draft[def.key] ?? ""} onChange={onChange} />
              ))}
              {advanced.length > 0 ? (
                <AccordionSection title={COPY.advanced[lang]} data-theme-control={`style-advanced-${group}`}>
                  {advanced.map((def, i) => (
                    <TokenControl
                      key={def.key}
                      def={def}
                      lang={lang}
                      value={draft[def.key] ?? ""}
                      onChange={onChange}
                      flush={i === advanced.length - 1}
                    />
                  ))}
                </AccordionSection>
              ) : null}
              <button
                type="button"
                onClick={() => onReplace(resetStyleTokenGroup(draft, group))}
                disabled={isGroupAtDefault(draft, group)}
                data-theme-control={`style-reset-${group}`}
                style={{
                  marginTop: 6,
                  padding: 0,
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: isGroupAtDefault(draft, group) ? CHROME.muted2 : CHROME.muted,
                  background: "transparent",
                  border: "none",
                  cursor: isGroupAtDefault(draft, group) ? "default" : "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                {COPY.reset[lang]}
              </button>
            </CardBody>
          </Card>
        );
      })}
    </>
  );
}
