"use client";

import { useActionState, useState } from "react";
import {
  createClientWorkspaceInquiryAction,
  type ClientWorkspaceInquiryActionState,
} from "./actions";

type TalentOption = {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
};

type ClientSummary = {
  displayName: string;
  company?: string | null;
  agencyName: string;
};

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  red: "#A33A3A",
  redSoft: "rgba(163,58,58,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FIELD_STYLE = {
  width: "100%",
  minHeight: 36,
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: FONT,
  color: C.ink,
  background: "#fff",
  boxSizing: "border-box" as const,
};

export function NewInquiryForm({
  tenantSlug,
  client,
  roster,
  selectedTalentId,
  initialError,
}: {
  tenantSlug: string;
  client: ClientSummary;
  roster: TalentOption[];
  selectedTalentId?: string;
  initialError?: string;
}) {
  const initialState: ClientWorkspaceInquiryActionState = {
    error: initialError,
    values: {
      contactName: client.displayName,
      company: client.company ?? "",
      talentProfileId: selectedTalentId ?? "",
      eventDate: "",
      quantity: "",
      eventLocation: "",
      message: "",
    },
  };
  const [state, formAction, pending] = useActionState(
    createClientWorkspaceInquiryAction,
    initialState,
  );
  const [selectedId, setSelectedId] = useState(state.values.talentProfileId);
  const selectedTalent = roster.find((item) => item.id === selectedId) ?? null;

  return (
    <>
      {state.error ? (
        <div
          aria-live="polite"
          style={{
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 10,
            background: C.redSoft,
            color: C.red,
            padding: "9px 12px",
            fontSize: 12.5,
          }}
        >
          {state.error}
        </div>
      ) : null}

      <form
        action={formAction}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <input type="hidden" name="tenantSlug" value={tenantSlug} />

        <section
          style={{
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 12,
            background: C.cardBg,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            Contact name
            <input name="contactName" required defaultValue={state.values.contactName} style={FIELD_STYLE} />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            Company
            <input name="company" defaultValue={state.values.company} style={FIELD_STYLE} />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            Talent
            <select
              name="talentProfileId"
              defaultValue={state.values.talentProfileId}
              onChange={(event) => setSelectedId(event.currentTarget.value)}
              style={FIELD_STYLE}
            >
              <option value="">No preference</option>
              {roster.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.primaryTypeLabel ? ` - ${item.primaryTypeLabel}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
              Event date
              <input name="eventDate" type="date" defaultValue={state.values.eventDate} style={FIELD_STYLE} />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
              Quantity
              <input
                name="quantity"
                type="number"
                min={1}
                inputMode="numeric"
                defaultValue={state.values.quantity}
                style={FIELD_STYLE}
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            Location
            <input
              name="eventLocation"
              placeholder="Tulum, CDMX, Cancun..."
              defaultValue={state.values.eventLocation}
              style={FIELD_STYLE}
            />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            Message
            <textarea
              name="message"
              required
              rows={6}
              placeholder="Tell the agency what you are planning, date flexibility, usage, call time, styling, and anything already confirmed."
              defaultValue={state.values.message}
              style={{ ...FIELD_STYLE, resize: "vertical", lineHeight: 1.5 }}
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            style={{
              height: 38,
              border: "none",
              borderRadius: 8,
              background: C.accent,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: pending ? "wait" : "pointer",
              opacity: pending ? 0.72 : 1,
            }}
          >
            {pending ? "Sending..." : "Send inquiry"}
          </button>
        </section>

        <aside
          style={{
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 12,
            background: C.accentSoft,
            padding: 14,
            color: C.ink,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            {selectedTalent ? selectedTalent.name : client.agencyName}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.inkMuted }}>
            {selectedTalent
              ? `${selectedTalent.primaryTypeLabel ?? "Talent"}${selectedTalent.city ? ` in ${selectedTalent.city}` : ""}`
              : "The agency can recommend the right roster fit after reviewing your request."}
          </p>
        </aside>
      </form>
    </>
  );
}
