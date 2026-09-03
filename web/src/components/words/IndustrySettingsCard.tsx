"use client";

/**
 * Settings › Industry and words — the screen that makes the words engine real.
 *
 * F2a shipped sixteen presets and a read path; F2c shipped the write path. Both
 * merged, and until this card existed no human could reach any of it: every
 * workspace resolved to "custom" because nothing in the product ever set
 * `industry_preset`. This is the control.
 *
 * SHAPE: the preset sits ABOVE the values it writes, the same shape
 * `AppointmentsSettingsCard` established, because one answer fills the words,
 * the header verb and the chat voice. A person should meet the question they
 * can answer ("what kind of business is this?") before anything they cannot.
 *
 * THE `<select>` TRAP IS GUARDED IN A PURE MODULE, NOT HERE. A select whose
 * value matches no option silently displays the FIRST option and then saves it
 * — Spaces lost a live workspace's timezone to exactly that today.
 * `presetPickerModel` returns the options AND the normalised value together so
 * a caller cannot take one and forget the other, and the invariant is asserted
 * in `picker-options.test.ts` without needing a DOM.
 *
 * Lives OUTSIDE components/admin/shell (inline-style ratchet), same as the
 * appointments card.
 */

import { useEffect, useState, useTransition } from "react";

import { loadIndustrySettings, setIndustryPreset } from "@/lib/server-actions/industry-settings";
import { presetPickerModel, presetSummary } from "@/lib/words/picker-options";
import { resolveWords, type IndustryPresetId } from "@/lib/words";

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
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  );
}

export function IndustrySettingsCard({ locale = "en" }: { locale?: "en" | "es" }) {
  const [saving, startTransition] = useTransition();
  // The RAW stored value, never a normalised one: the picker must know what is
  // actually in the column so it can show Custom for something unrecognised
  // rather than silently displaying the first preset.
  const [current, setCurrent] = useState<unknown>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadIndustrySettings().then((result) => {
      if (!alive) return;
      if (result.ok) setCurrent(result.rawPresetId);
      else setError(result.error);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const es = locale === "es";
  const { options, selected } = presetPickerModel(current, locale);

  // What the tenant's own site says RIGHT NOW under this choice. Showing the
  // resolved words rather than a promise means the preview cannot drift from
  // what the public page renders: both call `resolveWords`.
  const words = resolveWords({ presetId: selected }, locale);
  const previewVerb = words.headerVerbLabel();
  const previewPlace = words.word("reservations.place");
  const previewItem = words.word("menu.item");

  function choose(next: IndustryPresetId) {
    setError(null);
    const previous = current;
    // Optimistic, because the whole point of the preview is that a person sees
    // the consequence of the choice immediately. Reverted on failure so the
    // screen never shows a value the database does not hold — which is the
    // same class of lie as the select trap.
    setCurrent(next);
    startTransition(async () => {
      const result = await setIndustryPreset({ presetId: next });
      if (!result.ok) {
        setCurrent(previous);
        setError(result.error);
      }
    });
  }

  if (!loaded) {
    // Deliberately no picker before the value is known. Rendering a select that
    // shows "Custom" for one frame and then jumps is the same lie as the
    // mismatch trap, briefly — and a person who clicks in that frame saves it.
    return (
      <section style={{ padding: "14px 0", fontSize: 13, color: "var(--admin-text-muted)" }}>
        {es ? "Cargando..." : "Loading..."}
      </section>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
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
            onChange={(e) => choose(e.target.value as IndustryPresetId)}
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
        {/* The preview reads the SAME resolver the public page reads, so it
            cannot promise a word the site will not show. */}
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
