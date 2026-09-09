"use client";

/**
 * Settings › Industry and words — searchable business type plus preset.
 *
 * Type search writes `business_type_id` and may apply the type's default
 * preset. Word overrides are not cleared (L56).
 */

import { useEffect, useState, useTransition } from "react";

import { loadIndustrySettings, setBusinessType, setIndustryPreset } from "@/lib/server-actions/industry-settings";
import { presetPickerModel, presetSummary } from "@/lib/words/picker-options";
import { resolveWords, type IndustryPresetId } from "@/lib/words";
import { businessTypeById, searchBusinessTypes } from "@/lib/words/business-types";

const inputBoxStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--admin-border)",
  background: "var(--admin-surface)",
  color: "var(--admin-text)",
  padding: "8px 10px",
  fontSize: 14,
};

function Row({
  title,
  desc,
  right,
}: {
  title: string;
  desc?: string;
  right: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        justifyContent: "space-between",
        padding: "14px 0",
        borderTop: "1px solid var(--admin-border)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 260px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)" }}>{title}</div>
        {desc ? (
          <div style={{ fontSize: 13, color: "var(--admin-text-muted)", marginTop: 2 }}>{desc}</div>
        ) : null}
      </div>
      <div style={{ flexShrink: 0, minWidth: 220 }}>{right}</div>
    </div>
  );
}

export function IndustrySettingsCard({ locale = "en" }: { locale?: "en" | "es" }) {
  const [saving, startTransition] = useTransition();
  const [current, setCurrent] = useState<unknown>(undefined);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadIndustrySettings().then((result) => {
      if (!alive) return;
      if (result.ok) {
        setCurrent(result.rawPresetId);
        setTypeId(result.businessTypeId);
      } else setError(result.error);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const es = locale === "es";
  const { options, selected } = presetPickerModel(current, locale);
  const words = resolveWords({ presetId: selected }, locale);
  const previewVerb = words.headerVerbLabel();
  const previewPlace = words.word("reservations.place");
  const previewItem = words.word("menu.item");
  const selectedType = typeId ? businessTypeById(typeId) : undefined;
  const matches = searchBusinessTypes(query).slice(0, 12);

  function choosePreset(next: IndustryPresetId) {
    setError(null);
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await setIndustryPreset({ presetId: next });
      if (!result.ok) {
        setCurrent(previous);
        setError(result.error);
      }
    });
  }

  function chooseType(nextId: string) {
    setError(null);
    const previous = typeId;
    const previousPreset = current;
    const next = businessTypeById(nextId);
    setTypeId(nextId);
    if (next) setCurrent(next.preset);
    startTransition(async () => {
      const result = await setBusinessType({ typeId: nextId });
      if (!result.ok) {
        setTypeId(previous);
        setCurrent(previousPreset);
        setError(result.error);
      }
    });
  }

  if (!loaded) {
    return (
      <section style={{ padding: "14px 0", fontSize: 13, color: "var(--admin-text-muted)" }}>
        {es ? "Cargando..." : "Loading..."}
      </section>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      <Row
        title={es ? "Tipo de negocio" : "Business type"}
        desc={
          es
            ? "Busca el tipo más cercano. Puedes cambiarlo después. Other business queda fuera de los 120."
            : "Search for the closest match. You can change this later. Other business sits outside the 120 types."
        }
        right={
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260 }}>
            <input
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={query.trim().length > 0}
              aria-label={es ? "Buscar tipo de negocio" : "Search business type"}
              placeholder={es ? "Prueba uñas, restaurante o fotógrafo" : "Try nail salon, restaurant or photographer"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ ...inputBoxStyle, minWidth: 260 }}
            />
            <div style={{ fontSize: 13, color: "var(--admin-text)" }}>
              {selectedType
                ? `${selectedType.label[locale]} · ${selectedType.family}`
                : es
                  ? "Ningún tipo elegido"
                  : "No type selected"}
            </div>
            {query.trim() ? (
              <ul
                role="listbox"
                style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 240, overflow: "auto" }}
              >
                {matches.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={row.id === typeId}
                      disabled={saving}
                      onClick={() => {
                        chooseType(row.id);
                        setQuery("");
                      }}
                      style={{
                        ...inputBoxStyle,
                        width: "100%",
                        textAlign: "left",
                        cursor: saving ? "wait" : "pointer",
                        minHeight: 44,
                        marginBottom: 4,
                      }}
                    >
                      {row.label[locale]} · {row.family}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      chooseType("custom");
                      setQuery("");
                    }}
                    style={{
                      ...inputBoxStyle,
                      width: "100%",
                      textAlign: "left",
                      minHeight: 44,
                    }}
                  >
                    {es ? "Otro negocio" : "Other business"}
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
        }
      />

      <Row
        title={es ? "¿Qué tipo de negocio es este?" : "What kind of business is this?"}
        desc={
          es
            ? "Define cómo se llaman las cosas en tu sitio, el botón principal y la voz del chat. Nada queda bloqueado."
            : "It sets what things are called on your site, your main button, and how the chat greets people. Nothing is locked."
        }
        right={
          <select
            aria-label={es ? "Tipo de negocio" : "Kind of business"}
            value={selected}
            disabled={saving}
            onChange={(e) => choosePreset(e.target.value as IndustryPresetId)}
            style={{ ...inputBoxStyle, minWidth: 220, cursor: saving ? "wait" : "pointer" }}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} · {option.blurb}
              </option>
            ))}
          </select>
        }
      />

      <div
        style={{
          borderTop: "1px solid var(--admin-border)",
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>
          {presetSummary(selected, locale)}
        </div>
        <div style={{ fontSize: 13, color: "var(--admin-text)" }}>
          {es ? "Tu sitio dirá: " : "Your site will say: "}
          <strong>{previewVerb || (es ? "Escríbenos" : "Get in touch")}</strong>
          {" · "}
          <strong>{previewPlace}</strong>
          {" · "}
          <strong>{previewItem}</strong>
        </div>
        {error ? (
          <div role="alert" style={{ fontSize: 13, color: "var(--admin-danger, #b3261e)" }}>
            {error}
          </div>
        ) : null}
        {saving ? (
          <div style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>
            {es ? "Guardando..." : "Saving..."}
          </div>
        ) : null}
      </div>
    </section>
  );
}
