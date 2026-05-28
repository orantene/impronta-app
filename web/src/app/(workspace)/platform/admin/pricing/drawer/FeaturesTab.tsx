"use client";

/**
 * Drawer / Features tab — editable in Phase 4 (was read-only in
 * Phase 1).
 *
 * Each feature row is its own inline editor with:
 *   - label text input
 *   - included toggle (✓/—)
 *   - highlight toggle (★ shown on marketing PlanCards)
 *   - optional category text (defines a compare-table section)
 *   - optional value_text (overrides ✓/— with a string like "Up to 50"
 *     in the compare table)
 *   - up / down reorder buttons within the (tier, category) group
 *   - archive (hard-delete; features have no audit trail)
 *
 * A "+ Add feature" inline form lives at the bottom. Async states are
 * persistent per the every-async-state-must-be-visible rule.
 */

import { useState, useTransition } from "react";
import type { PricingTierRow } from "@/lib/pricing/pricing-types";
import {
  addFeature,
  updateFeature,
  archiveFeature,
  reorderFeature,
} from "@/lib/server-actions/admin-product-features";
import { HQ, F } from "../_tokens";
import {
  SectionLabel,
  Field,
  EmptyHint,
  inputStyle,
  Pill,
} from "../_primitives";

export function FeaturesTab({ tier }: { tier: PricingTierRow }) {
  // Group features by category (null grouped together as 'highlights').
  const byCategory = new Map<string, PricingTierRow["features"]>();
  for (const f of tier.features) {
    const key = f.category ?? "__none__";
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(f);
    else byCategory.set(key, [f]);
  }
  // Order: null first ('Highlights / general'), then alpha by category.
  const orderedCats = [
    "__none__",
    ...[...byCategory.keys()]
      .filter((k) => k !== "__none__")
      .sort(),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel
        title="Features"
        hint="Edit per-tier feature rows. Categories group rows on the marketing compare table."
      />

      {tier.features.length === 0 ? (
        <EmptyHint text="No features yet. Add one below." />
      ) : (
        orderedCats
          .filter((cat) => (byCategory.get(cat) ?? []).length > 0)
          .map((cat) => (
            <CategoryGroup
              key={cat}
              category={cat}
              rows={byCategory.get(cat) ?? []}
            />
          ))
      )}

      <AddFeatureRow tierId={tier.id} />
    </div>
  );
}

// ─── CategoryGroup ───────────────────────────────────────────────────────────

function CategoryGroup({
  category,
  rows,
}: {
  category: string;
  rows: PricingTierRow["features"];
}) {
  const isNoCategory = category === "__none__";
  return (
    <div
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: HQ.inkMuted,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          paddingBottom: 4,
        }}
      >
        {isNoCategory ? "Highlights / general" : category}
      </div>
      {rows.map((f, i) => (
        <FeatureRow
          key={f.id}
          feature={f}
          isFirst={i === 0}
          isLast={i === rows.length - 1}
        />
      ))}
    </div>
  );
}

// ─── FeatureRow ──────────────────────────────────────────────────────────────

function FeatureRow({
  feature,
  isFirst,
  isLast,
}: {
  feature: PricingTierRow["features"][number];
  isFirst: boolean;
  isLast: boolean;
}) {
  const [label, setLabel] = useState(feature.label);
  const [included, setIncluded] = useState(feature.included);
  const [highlight, setHighlight] = useState(feature.highlight);
  const [category, setCategory] = useState(feature.category ?? "");
  const [valueText, setValueText] = useState(feature.valueText ?? "");
  const [state, setState] = useState<
    "idle" | "saving" | "saved" | "error" | "reordering" | "archiving"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const dirty =
    label !== feature.label ||
    included !== feature.included ||
    highlight !== feature.highlight ||
    (category || null) !== (feature.category ?? null) ||
    (valueText || null) !== (feature.valueText ?? null);

  function save() {
    setState("saving");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await updateFeature({
        featureId: feature.id,
        label,
        included,
        highlight,
        category: category || null,
        valueText: valueText || null,
      });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
        return;
      }
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
    });
  }

  function move(direction: "up" | "down") {
    setState("reordering");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await reorderFeature({
        featureId: feature.id,
        direction,
      });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
        return;
      }
      setState("idle");
    });
  }

  function doArchive() {
    setState("archiving");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await archiveFeature({ featureId: feature.id });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
      }
    });
  }

  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 8,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Label + reorder + archive */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          style={{ ...inputStyle(), flex: 1, fontSize: 12.5 }}
          aria-label="Feature label"
        />
        <ReorderBtn
          direction="up"
          disabled={isFirst || state === "reordering"}
          onClick={() => move("up")}
        />
        <ReorderBtn
          direction="down"
          disabled={isLast || state === "reordering"}
          onClick={() => move("down")}
        />
        <button
          type="button"
          onClick={doArchive}
          disabled={state === "archiving"}
          aria-label="Archive feature"
          title="Archive feature"
          style={{
            background: "transparent",
            color: HQ.inkDim,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 4,
            width: 24,
            height: 24,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: state === "archiving" ? "wait" : "pointer",
            fontSize: 11,
          }}
        >
          {state === "archiving" ? "…" : "×"}
        </button>
      </div>

      {/* Toggles + category + value */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: HQ.inkMuted,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={included}
            onChange={(e) => setIncluded(e.target.checked)}
          />
          Included
        </label>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: HQ.inkMuted,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={highlight}
            onChange={(e) => setHighlight(e.target.checked)}
          />
          Highlight ★
        </label>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (e.g. pipeline)"
          maxLength={40}
          aria-label="Category"
          style={{
            ...inputStyle(),
            fontSize: 11,
            padding: "5px 8px",
            width: 160,
          }}
        />
        <input
          type="text"
          value={valueText}
          onChange={(e) => setValueText(e.target.value)}
          placeholder='value_text (e.g. "Up to 50")'
          maxLength={80}
          aria-label="Value text"
          style={{
            ...inputStyle(),
            fontSize: 11,
            padding: "5px 8px",
            width: 180,
          }}
        />
      </div>

      {/* Save row */}
      {(dirty || state === "saved" || state === "error") && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || state === "saving"}
            style={{
              background: dirty ? HQ.ink : "transparent",
              color: dirty ? HQ.bg : HQ.inkMuted,
              border: dirty ? "none" : `1px solid ${HQ.borderHover}`,
              borderRadius: 5,
              padding: "5px 12px",
              fontFamily: F,
              fontSize: 11.5,
              cursor: !dirty || state === "saving" ? "default" : "pointer",
              fontWeight: 600,
            }}
          >
            {state === "saving" ? "Saving…" : "Save"}
          </button>
          {state === "saved" && (
            <Pill color={HQ.green}>Saved</Pill>
          )}
          {state === "error" && (
            <span style={{ fontSize: 10.5, color: HQ.red }}>
              {errorMsg ?? "Save failed."}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ReorderBtn({
  direction,
  disabled,
  onClick,
}: {
  direction: "up" | "down";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "up" ? "Move up" : "Move down"}
      title={direction === "up" ? "Move up" : "Move down"}
      style={{
        background: "transparent",
        color: disabled ? HQ.inkDim : HQ.inkMuted,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 4,
        width: 24,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        fontSize: 11,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {direction === "up" ? "↑" : "↓"}
    </button>
  );
}

// ─── AddFeatureRow ───────────────────────────────────────────────────────────

function AddFeatureRow({ tierId }: { tierId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: HQ.cardSoft,
          border: `1px dashed ${HQ.borderSoft}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12.5,
          color: HQ.inkMuted,
          fontFamily: F,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        + Add feature
      </button>
    );
  }
  return <AddFeatureForm tierId={tierId} onClose={() => setOpen(false)} />;
}

function AddFeatureForm({
  tierId,
  onClose,
}: {
  tierId: string;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [included, setIncluded] = useState(true);
  const [highlight, setHighlight] = useState(false);
  const [category, setCategory] = useState("");
  const [valueText, setValueText] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const canSave = label.trim().length > 0 && state !== "saving";

  function save() {
    setState("saving");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await addFeature({
        tierId,
        label,
        included,
        highlight,
        category: category || null,
        valueText: valueText || null,
      });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
        return;
      }
      setState("saved");
      setTimeout(onClose, 1000);
    });
  }

  return (
    <div
      style={{
        background: HQ.cardElevated,
        border: `1px solid ${HQ.borderHover}`,
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: HQ.inkMuted,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        Add feature
      </div>
      <Field label="Label">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          placeholder="WhatsApp inquiry notifications"
          style={inputStyle()}
          autoFocus
        />
      </Field>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: HQ.inkMuted,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={included}
            onChange={(e) => setIncluded(e.target.checked)}
          />
          Included
        </label>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: HQ.inkMuted,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={highlight}
            onChange={(e) => setHighlight(e.target.checked)}
          />
          Highlight ★
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label="Category">
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="pipeline"
            maxLength={40}
            style={{ ...inputStyle(), width: 200 }}
          />
        </Field>
        <Field label='Value text (overrides ✓/—)'>
          <input
            type="text"
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            placeholder="Up to 50"
            maxLength={80}
            style={{ ...inputStyle(), width: 200 }}
          />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          style={{
            background: canSave ? HQ.ink : "transparent",
            color: canSave ? HQ.bg : HQ.inkMuted,
            border: canSave ? "none" : `1px solid ${HQ.borderHover}`,
            borderRadius: 6,
            padding: "8px 14px",
            fontFamily: F,
            fontSize: 12.5,
            cursor: canSave ? "pointer" : "default",
            fontWeight: 600,
          }}
        >
          {state === "saving" ? "Adding…" : "Add feature"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={state === "saving"}
          style={{
            background: "transparent",
            color: HQ.inkMuted,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 6,
            padding: "8px 12px",
            fontFamily: F,
            fontSize: 12.5,
            cursor: state === "saving" ? "default" : "pointer",
          }}
        >
          Cancel
        </button>
        {state === "saved" && <Pill color={HQ.green}>Added</Pill>}
        {state === "error" && (
          <span style={{ fontSize: 11, color: HQ.red }}>{errorMsg}</span>
        )}
      </div>
    </div>
  );
}
