"use client";

/**
 * Registration Fields configurator — interactive client surface.
 *
 * Per talent-type (and the universal tier) the admin can:
 *   - toggle SHOW at registration  → show_in_registration_override
 *   - toggle REQUIRED              → required_override
 *   - drag-to-reorder the fields   → display_order_override
 *   - reset a field to catalog defaults
 *
 * Drag-and-drop reorder is implemented with native HTML5 drag (modelled on
 * the working SectionFieldOrderPanel), with an explicit "Save order" commit
 * so a reorder is one server round-trip, not one per field.
 *
 * Async-state contract (admin-edit-ux): every mutation shows an explicit,
 * persistent state — a per-row "Saving…" pill, a transient "Saved" tick, and
 * a sticky inline error that the admin must see (never toast-and-vanish).
 */

import { useMemo, useState, useTransition } from "react";
import { HQ, F, FD } from "../../../catalog/_ui";
import {
  setRegistrationFieldShow,
  setRegistrationFieldRequired,
  reorderRegistrationFields,
  resetRegistrationField,
} from "./registration-field-actions";
import type {
  RegistrationField,
  RegistrationFieldGroup,
} from "./registration-fields-data";

const FM = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';

type RowStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  on,
  disabled,
  onChange,
  labelOn,
  labelOff,
  tone,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  labelOn: string;
  labelOff: string;
  tone: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={() => onChange(!on)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${on ? `${tone}66` : HQ.border}`,
        background: on ? `${tone}1f` : "rgba(255,255,255,0.03)",
        color: on ? tone : HQ.inkDim,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: F,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: on ? tone : HQ.inkDim,
        }}
      />
      {on ? labelOn : labelOff}
    </button>
  );
}

function StatusPill({ status }: { status: RowStatus }) {
  if (status.kind === "idle") return null;
  const meta =
    status.kind === "saving"
      ? { t: "Saving…", c: HQ.amber }
      : status.kind === "saved"
        ? { t: "Saved ✓", c: HQ.green }
        : { t: status.message, c: HQ.red };
  return (
    <span
      role={status.kind === "error" ? "alert" : "status"}
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: meta.c,
        whiteSpace: status.kind === "error" ? "normal" : "nowrap",
        maxWidth: status.kind === "error" ? 220 : undefined,
      }}
    >
      {meta.t}
    </span>
  );
}

// ─── Field row ──────────────────────────────────────────────────────────────

function FieldRow({
  tenantId,
  field,
  draggingId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  tenantId: string;
  field: RegistrationField;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
}) {
  // Local optimistic state for the two toggles + the override flags, so the
  // row updates instantly and the "overridden" badges stay live without a
  // full reload. Reset semantics fall back to catalog defaults.
  const [shown, setShown] = useState(field.shown);
  const [required, setRequired] = useState(field.required);
  const [ovShown, setOvShown] = useState(field.override.shown);
  const [ovRequired, setOvRequired] = useState(field.override.required);
  const [ovOrder, setOvOrder] = useState(field.override.order);
  const [status, setStatus] = useState<RowStatus>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const isDragging = draggingId === field.field_definition_id;
  const overridden = ovShown || ovRequired || ovOrder;

  function run(
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    onOk: () => void,
  ) {
    setStatus({ kind: "saving" });
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          onOk();
          setStatus({ kind: "saved" });
          setTimeout(() => setStatus({ kind: "idle" }), 1800);
        } else {
          setStatus({ kind: "error", message: res.error });
        }
      } catch {
        setStatus({ kind: "error", message: "Network error — try again." });
      }
    });
  }

  function toggleShown(next: boolean) {
    setShown(next);
    setOvShown(true);
    run(
      () =>
        setRegistrationFieldShow({
          tenantId,
          fieldDefinitionId: field.field_definition_id,
          shown: next,
        }),
      () => {},
    );
  }

  function toggleRequired(next: boolean) {
    setRequired(next);
    setOvRequired(true);
    run(
      () =>
        setRegistrationFieldRequired({
          tenantId,
          fieldDefinitionId: field.field_definition_id,
          required: next,
        }),
      () => {},
    );
  }

  function reset() {
    run(
      () =>
        resetRegistrationField({
          tenantId,
          fieldDefinitionId: field.field_definition_id,
        }),
      () => {
        setShown(field.shown_default);
        setRequired(field.required_default);
        setOvShown(false);
        setOvRequired(false);
        setOvOrder(false);
      },
    );
  }

  return (
    <div
      draggable={!pending}
      onDragStart={() => onDragStart(field.field_definition_id)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(field.field_definition_id)}
      onDragEnd={onDragEnd}
      style={{
        display: "grid",
        gridTemplateColumns: "22px minmax(0,1fr) auto",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderTop: `1px solid ${HQ.borderSoft}`,
        background: isDragging ? "rgba(93,211,160,0.10)" : "transparent",
        borderRadius: isDragging ? 8 : 0,
        opacity: field.enabled ? 1 : 0.5,
        cursor: pending ? "wait" : "grab",
      }}
    >
      <span
        aria-hidden
        title="Drag to reorder"
        style={{ color: HQ.inkDim, fontSize: 13, lineHeight: 1, userSelect: "none" }}
      >
        ⠿
      </span>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 650, fontSize: 12.5, color: HQ.ink }}>{field.label}</span>
          {overridden && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: HQ.violet,
                border: `1px solid ${HQ.violet}55`,
                borderRadius: 999,
                padding: "0px 6px",
                letterSpacing: 0.3,
              }}
            >
              OVERRIDDEN
            </span>
          )}
          {!field.enabled && (
            <span style={{ fontSize: 9, fontWeight: 800, color: HQ.amber }}>DISABLED</span>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            color: HQ.inkMuted,
            fontFamily: FM,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {field.field_key} · #{field.display_order}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <StatusPill status={status} />
        <Toggle
          on={shown}
          disabled={pending || !field.enabled}
          onChange={toggleShown}
          labelOn="Shown"
          labelOff="Hidden"
          tone={HQ.green}
        />
        <Toggle
          on={required}
          disabled={pending || !field.enabled || !shown}
          onChange={toggleRequired}
          labelOn="Required"
          labelOff="Optional"
          tone={HQ.amber}
        />
        <button
          type="button"
          disabled={pending || !overridden}
          onClick={reset}
          title={overridden ? "Reset to catalog defaults" : "No overrides to reset"}
          style={{
            border: `1px solid ${HQ.border}`,
            background: "transparent",
            color: overridden ? HQ.inkMuted : HQ.inkDim,
            borderRadius: 7,
            padding: "4px 9px",
            fontSize: 10.5,
            fontWeight: 700,
            cursor: pending || !overridden ? "not-allowed" : "pointer",
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ─── Group (one talent type / universal) ─────────────────────────────────────

function moveItem(items: RegistrationField[], fromId: string, toId: string): RegistrationField[] {
  const from = items.findIndex((x) => x.field_definition_id === fromId);
  const to = items.findIndex((x) => x.field_definition_id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

function GroupPanel({
  tenantId,
  group,
  defaultOpen,
}: {
  tenantId: string;
  group: RegistrationFieldGroup;
  defaultOpen: boolean;
}) {
  const [items, setItems] = useState(group.fields);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<RowStatus>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const orderChanged = useMemo(
    () => items.some((it, i) => it.field_definition_id !== group.fields[i]?.field_definition_id),
    [items, group.fields],
  );

  const shownCount = items.filter((f) => f.shown && f.enabled).length;

  function saveOrder() {
    setOrderStatus({ kind: "saving" });
    startTransition(async () => {
      try {
        const res = await reorderRegistrationFields({
          tenantId,
          orderedIds: items.map((it) => it.field_definition_id),
        });
        if (res.ok) {
          setOrderStatus({ kind: "saved" });
          setTimeout(() => setOrderStatus({ kind: "idle" }), 2000);
        } else {
          setOrderStatus({ kind: "error", message: res.error });
        }
      } catch {
        setOrderStatus({ kind: "error", message: "Network error — try again." });
      }
    });
  }

  return (
    <details
      open={defaultOpen}
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        fontFamily: F,
        marginBottom: 10,
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ fontFamily: FD, fontSize: 14, fontWeight: 600, color: HQ.ink }}>
          {group.label}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: group.tier === "universal" ? HQ.green : HQ.violet,
            border: `1px solid ${(group.tier === "universal" ? HQ.green : HQ.violet)}44`,
            borderRadius: 999,
            padding: "1px 7px",
          }}
        >
          {group.tier === "universal" ? "UNIVERSAL" : "TYPE-SPECIFIC"}
        </span>
        <span style={{ fontSize: 11.5, color: HQ.inkMuted, marginLeft: "auto" }}>
          {shownCount}/{items.length} shown
        </span>
      </summary>

      <div style={{ padding: "0 16px 14px" }}>
        {/* Order commit bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 0 10px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, color: HQ.inkDim }}>
            Drag a field by its ⠿ handle to reorder, then save.
          </span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <StatusPill status={orderStatus} />
            {orderChanged && (
              <button
                type="button"
                onClick={() => setItems(group.fields)}
                disabled={pending}
                style={{
                  border: `1px solid ${HQ.border}`,
                  background: "transparent",
                  color: HQ.inkMuted,
                  borderRadius: 7,
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: pending ? "not-allowed" : "pointer",
                }}
              >
                Discard
              </button>
            )}
            <button
              type="button"
              onClick={saveOrder}
              disabled={!orderChanged || pending}
              style={{
                border: `1px solid ${orderChanged ? `${HQ.green}59` : HQ.border}`,
                background: orderChanged ? `${HQ.green}1f` : "rgba(255,255,255,0.03)",
                color: orderChanged ? HQ.green : HQ.inkDim,
                borderRadius: 7,
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 750,
                cursor: !orderChanged || pending ? "not-allowed" : "pointer",
              }}
            >
              Save order
            </button>
          </span>
        </div>

        <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, overflow: "hidden" }}>
          {items.map((field) => (
            <FieldRow
              key={field.field_definition_id}
              tenantId={tenantId}
              field={field}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(id) => {
                if (!draggingId) return;
                setItems((cur) => moveItem(cur, draggingId, id));
                setDraggingId(null);
              }}
              onDragEnd={() => setDraggingId(null)}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function RegistrationFieldsClient({
  tenantId,
  groups,
}: {
  tenantId: string;
  groups: RegistrationFieldGroup[];
}) {
  if (groups.length === 0) {
    return (
      <div style={{ fontSize: 13, color: HQ.inkDim, padding: "12px 0", fontFamily: F }}>
        No registration-eligible fields found for this workspace.
      </div>
    );
  }
  return (
    <div>
      {groups.map((group, i) => (
        <GroupPanel key={group.key} tenantId={tenantId} group={group} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
