"use client";

/**
 * OfferingOptionsEditor — the "Options & extras" block inside an offering's
 * expanded details (Lane D4).
 *
 * OPTIONS (variants): the client picks exactly one (e.g. 2h / 4h / full day);
 * a variant without a price uses the offering's base price. EXTRAS (add-ons):
 * zero or more stack on top, each with its own price. Every commit persists the
 * FULL lists via setOfferingOptions (replace-all, matching the photos action)
 * and re-syncs ids from the server response.
 *
 * Only rendered for saved offerings (a draft has no id to attach children to).
 */

import { useState } from "react";
import type { OfferingVariant, OfferingAddOn } from "@/lib/talent/offerings-types";
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";
import { toI18nMap } from "@/lib/i18n/i18n-columns";
import { setOfferingOptions } from "@/lib/talent/offerings-actions";
import { LocaleField } from "@/components/admin/shell/internal/primitives/locale-field";
import { useTalentFieldLocales } from "@/components/locale-field/use-talent-field-locales";

const C = {
  ink: "#14161d",
  inkMuted: "rgba(20,22,29,0.62)",
  inkSoft: "rgba(20,22,29,0.42)",
  border: "rgba(20,22,29,0.14)",
  surface: "#fff",
  accent: "#2f6d6a",
};
const FONT = "ui-sans-serif, system-ui, -apple-system, sans-serif";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: C.inkSoft,
  marginBottom: 6,
  fontFamily: FONT,
};
const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "8px 10px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  background: C.surface,
  color: C.ink,
  fontFamily: FONT,
};

type Row = { id: string; label: string; amountCents: number | null; labelI18n?: LocalizedMap };

/**
 * One option / extra label, translatable (PR 7): an `xs` badge over the input.
 * The plain label is the primary language; every language rides in labelI18n.
 * Commits on blur, like the price input beside it.
 */
function RowLabel({
  row,
  extra,
  disabled,
  onCommit,
}: {
  row: Row;
  extra: boolean;
  disabled: boolean;
  onCommit: (next: Pick<Row, "label" | "labelI18n">) => void;
}) {
  const { primary, locales } = useTalentFieldLocales();
  const initial: Record<string, string> = { ...toI18nMap(row.labelI18n), [primary]: row.label };
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const commit = (next: Record<string, string>) => {
    const label = (next[primary] ?? "").trim();
    if (!label) return;
    const changed = locales.some((l) => (next[l] ?? "").trim() !== (initial[l] ?? "").trim());
    if (changed) onCommit({ label, labelI18n: next });
  };
  return (
    <LocaleField
      size="xs"
      hideLabel
      label={row.label}
      value={draft}
      locales={locales}
      primary={primary}
      ai={{ field: extra ? "addon_label" : "variant_label" }}
      onChange={(locale, value) => {
        const next = { ...draft, [locale]: value };
        setDraft(next);
        // An AI result (or any change while the input is not focused) commits now.
        if (typeof document !== "undefined" && document.activeElement?.tagName !== "INPUT") commit(next);
      }}
      renderInput={(args) => (
        <input
          id={args.id}
          type="text"
          aria-label={row.label}
          value={args.value}
          placeholder={args.placeholder}
          readOnly={args.readOnly}
          disabled={disabled}
          onChange={(e) => args.onChange(e.target.value)}
          onBlur={() => commit(draft)}
          style={{ ...inputStyle, flex: "1 1 auto", minWidth: 0 }}
        />
      )}
    />
  );
}

function RowsEditor({
  title,
  hint,
  rows,
  requirePrice,
  currency,
  disabled,
  onCommit,
}: {
  title: string;
  hint: string;
  rows: Row[];
  requirePrice: boolean;
  currency: string;
  disabled: boolean;
  onCommit: (rows: Row[]) => void;
}) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftPrice, setDraftPrice] = useState("");

  const commitNew = () => {
    const label = draftLabel.trim();
    if (!label) return;
    const n = draftPrice.trim() === "" ? null : Math.round(Number(draftPrice) * 100);
    const amountCents = n != null && Number.isFinite(n) && n >= 0 ? n : null;
    if (requirePrice && amountCents == null) return;
    onCommit([...rows, { id: "", label, amountCents }]);
    setDraftLabel("");
    setDraftPrice("");
  };

  return (
    <div style={{ flex: "1 1 280px", minWidth: 0 }}>
      <span style={labelStyle}>{title}</span>
      <p style={{ margin: "0 0 8px", fontSize: 11.5, color: C.inkSoft, fontFamily: FONT }}>{hint}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r, i) => (
          <div key={r.id || `new-${i}`} style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <RowLabel
              row={r}
              extra={requirePrice}
              disabled={disabled}
              onCommit={(next) => onCommit(rows.map((x, j) => (j === i ? { ...x, ...next } : x)))}
            />
            <input
              type="number"
              min={0}
              placeholder={requirePrice ? "0" : "base"}
              defaultValue={r.amountCents != null ? r.amountCents / 100 : ""}
              disabled={disabled}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const n = raw === "" ? null : Math.round(Number(raw) * 100);
                const v = n != null && Number.isFinite(n) && n >= 0 ? n : null;
                if (requirePrice && v == null) return;
                if (v !== r.amountCents) onCommit(rows.map((x, j) => (j === i ? { ...x, amountCents: v } : x)));
              }}
              style={{ ...inputStyle, width: 92 }}
            />
            <span style={{ fontSize: 11.5, color: C.inkSoft, fontFamily: FONT }}>{currency}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onCommit(rows.filter((_, j) => j !== i))}
              aria-label={`Remove ${r.label}`}
              style={{ border: "none", background: "transparent", color: C.inkMuted, fontSize: 15, cursor: "pointer", padding: "2px 6px", fontFamily: FONT }}
            >
              ×
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="text"
            placeholder={title === "Options" ? "e.g. Half day" : "e.g. Travel outside city"}
            value={draftLabel}
            disabled={disabled}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNew();
            }}
            style={{ ...inputStyle, flex: "1 1 auto", minWidth: 0 }}
          />
          <input
            type="number"
            min={0}
            placeholder={requirePrice ? "price" : "base"}
            value={draftPrice}
            disabled={disabled}
            onChange={(e) => setDraftPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNew();
            }}
            style={{ ...inputStyle, width: 92 }}
          />
          <button
            type="button"
            disabled={disabled || !draftLabel.trim()}
            onClick={commitNew}
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${C.accent}`,
              background: "transparent",
              color: C.accent,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export function OfferingOptionsEditor({
  talentId,
  offeringId,
  currency,
  variants,
  addOns,
  saving,
  onSynced,
}: {
  talentId: string;
  offeringId: string;
  currency: string;
  variants: OfferingVariant[];
  addOns: OfferingAddOn[];
  saving: boolean;
  onSynced: (variants: OfferingVariant[], addOns: OfferingAddOn[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = async (nextVariants: Row[], nextAddOns: Row[]) => {
    setBusy(true);
    setError(null);
    const res = await setOfferingOptions(talentId, offeringId, {
      variants: nextVariants.map((v) => ({ label: v.label, amountCents: v.amountCents, labelI18n: v.labelI18n })),
      addOns: nextAddOns
        .filter((a): a is Row & { amountCents: number } => a.amountCents != null)
        .map((a) => ({ label: a.label, amountCents: a.amountCents, labelI18n: a.labelI18n })),
    });
    setBusy(false);
    if (res.ok) onSynced(res.variants, res.addOns);
    else setError(res.error);
  };

  return (
    <div style={{ borderTop: "1px dashed rgba(20,22,29,0.10)", paddingTop: 12, marginTop: 2 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <RowsEditor
          title="Options"
          hint="Client picks one (sizes, durations, tiers). Leave the price empty to use the base price."
          rows={variants}
          requirePrice={false}
          currency={currency}
          disabled={saving || busy}
          onCommit={(rows) => void persist(rows, addOns)}
        />
        <RowsEditor
          title="Extras"
          hint="Client can add any of these on top, each with its own price."
          rows={addOns}
          requirePrice
          currency={currency}
          disabled={saving || busy}
          onCommit={(rows) => void persist(variants, rows)}
        />
      </div>
      <div style={{ minHeight: 14, marginTop: 6, fontSize: 12, color: error ? "#b4232a" : C.inkSoft, fontFamily: FONT }}>
        {error ?? (busy ? "Saving…" : "")}
      </div>
    </div>
  );
}
