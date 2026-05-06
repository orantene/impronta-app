"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  type RosterTalentEditState,
  updateRosterTalentProfile,
  updateRosterTalentWorkflow,
} from "./actions";

// ─── Design tokens (match workspace shell) ────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.62)",
  inkDim:     "rgba(11,11,13,0.38)",
  border:     "rgba(24,24,27,0.10)",
  surface:    "#FAFAF7",
  card:       "#ffffff",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  green:      "#2E7D5B",
  greenSoft:  "rgba(46,125,91,0.10)",
  greenDeep:  "#1A5E3C",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(212,160,23,0.10)",
  error:      "#c0392b",
  errorSoft:  "rgba(192,57,43,0.08)",
} as const;

const F  = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

// ─── Sub-types ────────────────────────────────────────────────────────────────

type TalentTypeOption = { id: string; name_en: string };

export type TalentEditInitial = {
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  phone: string | null;
  workflow_status: string;
  visibility: string;
  agency_visibility: string;
  primary_type_term_id: string | null;
  profile_code: string | null;
};

// ─── Field / input helpers ────────────────────────────────────────────────────

function inputStyle(fullWidth = true): React.CSSProperties {
  return {
    display: "block",
    width: fullWidth ? "100%" : undefined,
    background: "#fff",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "9px 11px",
    fontSize: 14,
    fontFamily: F,
    color: C.ink,
    outline: "none",
    boxSizing: "border-box",
  };
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span
        style={{
          fontFamily: F,
          fontSize: 12,
          fontWeight: 600,
          color: C.inkMuted,
          letterSpacing: 0.2,
        }}
      >
        {label}
        {required && <span style={{ color: C.error, marginLeft: 3 }}>*</span>}
      </span>
      {children}
      {hint && (
        <span style={{ fontFamily: F, fontSize: 11.5, color: C.inkDim }}>{hint}</span>
      )}
    </label>
  );
}

// ─── Workflow status helpers ───────────────────────────────────────────────────

const WORKFLOW_META: Record<string, { label: string; dot: string; bg: string; textColor: string }> = {
  draft:     { label: "Draft",     dot: "rgba(11,11,13,0.35)", bg: "rgba(11,11,13,0.05)", textColor: C.inkMuted },
  invited:   { label: "Invited",   dot: "#3B5E9E",              bg: "rgba(59,94,158,0.10)", textColor: "#3B5E9E" },
  approved:  { label: "Approved",  dot: C.green,                bg: C.greenSoft,            textColor: C.greenDeep },
  published: { label: "Published", dot: C.green,                bg: C.greenSoft,            textColor: C.greenDeep },
  hidden:    { label: "Hidden",    dot: C.amber,                bg: C.amberSoft,            textColor: C.amber },
};

function WorkflowBadge({ status }: { status: string }) {
  const m = WORKFLOW_META[status] ?? WORKFLOW_META.draft;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        background: m.bg,
        color: m.textColor,
        fontSize: 11.5,
        fontWeight: 600,
        fontFamily: F,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.dot }} />
      {m.label}
    </span>
  );
}

// ─── Sidebar: workflow quick controls ─────────────────────────────────────────

function WorkflowSidebar({
  tenantSlug,
  talentId,
  workflowStatus,
  visibility,
  agencyVisibility,
  profileCode,
}: {
  tenantSlug: string;
  talentId: string;
  workflowStatus: string;
  visibility: string;
  agencyVisibility: string;
  profileCode: string | null;
}) {
  const boundAction = updateRosterTalentWorkflow.bind(null, tenantSlug, talentId);
  const [state, action, pending] = useActionState<RosterTalentEditState, FormData>(
    boundAction,
    undefined,
  );

  // Approve: set workflow_status=approved, visibility=public
  // Hide: set workflow_status=draft, visibility=hidden
  const isLive = workflowStatus === "published" || workflowStatus === "approved";

  const publicUrl = profileCode ? `https://tulala.digital/t/${profileCode}` : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: F,
      }}
    >
      {/* Status card */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
          Status
        </div>
        <div style={{ marginBottom: 12 }}>
          <WorkflowBadge status={workflowStatus} />
        </div>
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginBottom: 14, lineHeight: 1.5 }}>
          {isLive
            ? "This profile is visible on your site."
            : "Profile is in draft — not visible to clients."}
        </div>

        {state?.error && (
          <div
            role="alert"
            style={{
              background: C.errorSoft,
              border: `1px solid rgba(192,57,43,0.20)`,
              borderRadius: 7,
              padding: "8px 11px",
              fontSize: 12,
              color: C.error,
              marginBottom: 10,
            }}
          >
            {state.error}
          </div>
        )}

        {!isLive ? (
          <form action={action}>
            <input type="hidden" name="workflow_status" value="approved" />
            <input type="hidden" name="visibility" value="public" />
            <button
              type="submit"
              disabled={pending}
              style={{
                width: "100%",
                background: C.accent,
                color: "#fff",
                border: "none",
                padding: "9px 0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: F,
                cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.6 : 1,
              }}
            >
              {pending ? "Approving…" : "Approve & publish"}
            </button>
          </form>
        ) : (
          <form action={action}>
            <input type="hidden" name="workflow_status" value="draft" />
            <input type="hidden" name="visibility" value="hidden" />
            <button
              type="submit"
              disabled={pending}
              style={{
                width: "100%",
                background: "transparent",
                color: C.inkMuted,
                border: `1px solid ${C.border}`,
                padding: "9px 0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: F,
                cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.6 : 1,
              }}
            >
              {pending ? "Hiding…" : "Move to draft"}
            </button>
          </form>
        )}
      </div>

      {/* Agency visibility card */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
          Roster visibility
        </div>
        <div style={{ fontSize: 12.5, color: C.inkMuted, marginBottom: 4, lineHeight: 1.5 }}>
          {agencyVisibility === "featured"
            ? "Featured on your site"
            : agencyVisibility === "site_visible"
              ? "Site visible (storefront)"
              : "Roster only (not on storefront)"}
        </div>
        <div style={{ fontSize: 11, color: C.inkDim, lineHeight: 1.4 }}>
          Change this in the main edit form below.
        </div>
      </div>

      {/* Public profile link */}
      {publicUrl && (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "14px 18px",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>
            Public profile
          </div>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              fontSize: 12,
              color: C.accent,
              textDecoration: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {publicUrl}
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Main edit form ───────────────────────────────────────────────────────────

export function TalentEditForm({
  tenantSlug,
  talentId,
  initial,
  talentTypes,
}: {
  tenantSlug: string;
  talentId: string;
  initial: TalentEditInitial;
  talentTypes: TalentTypeOption[];
}) {
  const boundAction = updateRosterTalentProfile.bind(null, tenantSlug, talentId);
  const [state, action, pending] = useActionState<RosterTalentEditState, FormData>(
    boundAction,
    undefined,
  );

  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      {/* ── Left: edit form ── */}
      <form
        action={action}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          flex: "1 1 360px",
          minWidth: 0,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "20px 22px",
        }}
      >
        <div style={{ fontFamily: FD, fontSize: 14, fontWeight: 600, color: C.inkMuted, marginBottom: 2 }}>
          Profile details
        </div>

        {state?.error && (
          <div
            role="alert"
            style={{
              background: C.errorSoft,
              border: `1px solid rgba(192,57,43,0.20)`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: C.error,
              fontFamily: F,
            }}
          >
            {state.error}
          </div>
        )}

        {state?.success && (
          <div
            role="status"
            style={{
              background: C.greenSoft,
              border: `1px solid rgba(46,125,91,0.20)`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: C.greenDeep,
              fontFamily: F,
            }}
          >
            Saved successfully.
          </div>
        )}

        {/* Display name */}
        <Field label="Display name" required>
          <input
            name="display_name"
            required
            autoComplete="off"
            defaultValue={initial.display_name}
            style={inputStyle()}
          />
        </Field>

        {/* First / Last name */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="First name">
            <input
              name="first_name"
              autoComplete="off"
              defaultValue={initial.first_name ?? ""}
              style={inputStyle()}
            />
          </Field>
          <Field label="Last name">
            <input
              name="last_name"
              autoComplete="off"
              defaultValue={initial.last_name ?? ""}
              style={inputStyle()}
            />
          </Field>
        </div>

        {/* Talent type */}
        <Field label="Primary talent type" hint="Drives search and filtering on your site.">
          <select
            name="talent_type_term_id"
            defaultValue={initial.primary_type_term_id ?? ""}
            style={inputStyle()}
          >
            <option value="">— none —</option>
            {talentTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name_en}</option>
            ))}
          </select>
        </Field>

        {/* Phone */}
        <Field label="Phone">
          <input
            name="phone"
            type="tel"
            autoComplete="off"
            defaultValue={initial.phone ?? ""}
            placeholder="+1 555 000 0000"
            style={inputStyle()}
          />
        </Field>

        {/* Short bio */}
        <Field label="Short bio" hint="2–3 lines for clients. Full bio is managed on the profile page.">
          <textarea
            name="short_bio"
            rows={3}
            defaultValue={initial.short_bio ?? ""}
            placeholder="Brief intro for client-facing pages."
            style={{ ...inputStyle(), resize: "vertical" }}
          />
        </Field>

        {/* Workflow status */}
        <Field
          label="Workflow status"
          hint="Controls whether this profile is visible to clients."
        >
          <select
            name="workflow_status"
            defaultValue={initial.workflow_status}
            style={inputStyle()}
          >
            <option value="draft">Draft</option>
            <option value="invited">Invited</option>
            <option value="approved">Approved</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
          </select>
        </Field>

        {/* Profile visibility */}
        <Field label="Profile visibility" hint="Whether the profile page is publicly reachable.">
          <select
            name="visibility"
            defaultValue={initial.visibility}
            style={inputStyle()}
          >
            <option value="hidden">Hidden</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </Field>

        {/* Agency visibility */}
        <Field label="Roster visibility" hint="Where this profile appears in your agency site.">
          <select
            name="agency_visibility"
            defaultValue={initial.agency_visibility}
            style={inputStyle()}
          >
            <option value="roster_only">Roster only (not on storefront)</option>
            <option value="site_visible">Site visible</option>
            <option value="featured">Featured</option>
          </select>
        </Field>

        {/* Save */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
          <button
            type="submit"
            disabled={pending}
            style={{
              background: C.accent,
              color: "#fff",
              border: "none",
              padding: "10px 22px",
              borderRadius: 9,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: F,
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* ── Right: status sidebar ── */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <WorkflowSidebar
          tenantSlug={tenantSlug}
          talentId={talentId}
          workflowStatus={initial.workflow_status}
          visibility={initial.visibility}
          agencyVisibility={initial.agency_visibility}
          profileCode={initial.profile_code}
        />
      </div>
    </div>
  );
}
