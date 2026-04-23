"use client";

import { useState } from "react";

import { SERVICES } from "../_data/services";
import { ALL_DESTINATIONS } from "../_data/professionals";

/**
 * Inquiry form.
 *
 * Future systemization (CMS → Inquiry Form Section + Template variant):
 *   - Template → `form-editorial` variant (this one): serif labels, calm
 *     typographic scale, multi-select service chips.
 *   - `form-compact` / `form-two-column` alternates exist.
 *
 * Field model (what a CMS editor can toggle per page):
 *   - enabled_fields: partner, event_type, event_date, destination,
 *     services[], guest_count, budget_range, notes, referral_source
 *   - required_fields: subset of above
 *   - success_message: rich-text
 *   - submit_label: string
 *   - deliver_to: email | webhook | crm
 *   - confirmation_email_template: CMS template ref
 */

const EVENT_TYPES = [
  "Wedding",
  "Destination wedding",
  "Private event",
  "Editorial shoot",
  "Rehearsal / welcome party",
  "Other",
];

const BUDGETS = [
  "Under $25,000",
  "$25k – $60k",
  "$60k – $120k",
  "$120k – $250k",
  "$250k+",
  "Prefer not to say",
];

export function InquiryForm({
  defaults,
}: {
  defaults?: { pro?: string; intent?: string; service?: string };
}) {
  const [submitted, setSubmitted] = useState(false);
  const [services, setServices] = useState<string[]>(
    defaults?.service ? [defaults.service] : [],
  );

  const toggleService = (slug: string) =>
    setServices((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );

  const intent = defaults?.intent;
  const headlineIntent =
    intent === "apply"
      ? "Apply to join the collective"
      : intent === "press"
        ? "Press inquiry"
        : intent === "team"
          ? "Build a custom team"
          : intent === "concierge"
            ? "Concierge support"
            : intent === "gift"
              ? "Gift a Muse day"
              : "Tell us about your celebration";

  if (submitted) {
    return (
      <div
        className="muse-surface-raised"
        style={{
          padding: "56px 40px",
          textAlign: "center",
          background: "var(--muse-ivory)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--muse-font-display)",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 48,
            color: "var(--muse-blush)",
            display: "block",
            marginBottom: 14,
          }}
        >
          thank you
        </span>
        <h3 style={{ fontSize: 32, marginBottom: 12 }}>
          Your concierge is reading this now.
        </h3>
        <p style={{ maxWidth: 460, marginInline: "auto" }}>
          Expect a thoughtful reply within two working days — with availability,
          a curated team, and any questions to help us plan something extraordinary.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      className="muse-surface-raised"
      style={{
        padding: "40px 36px 44px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        background: "#fff",
      }}
    >
      <div>
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--muse-muted)",
          }}
        >
          New inquiry
        </span>
        <h2
          style={{
            fontSize: "clamp(32px, 4vw, 44px)",
            marginTop: 8,
          }}
        >
          {headlineIntent}
        </h2>
        {defaults?.pro ? (
          <p style={{ marginTop: 10, color: "var(--muse-muted)", fontSize: 14 }}>
            Regarding:{" "}
            <strong style={{ color: "var(--muse-espresso)" }}>{defaults.pro}</strong>
          </p>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 18,
        }}
      >
        <Field label="Your name" required>
          <input type="text" name="name" required />
        </Field>
        <Field label="Partner's name">
          <input type="text" name="partner" />
        </Field>
        <Field label="Email" required>
          <input type="email" name="email" required />
        </Field>
        <Field label="Phone">
          <input type="tel" name="phone" />
        </Field>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 18,
        }}
      >
        <Field label="Event type">
          <select name="event_type" defaultValue="Wedding">
            {EVENT_TYPES.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </Field>
        <Field label="Event date">
          <input type="date" name="event_date" />
        </Field>
        <Field label="Destination">
          <select name="destination" defaultValue="">
            <option value="">Still deciding</option>
            {ALL_DESTINATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value="other">Elsewhere — tell us in notes</option>
          </select>
        </Field>
        <Field label="Guest count">
          <input type="number" name="guest_count" min={0} placeholder="e.g. 120" />
        </Field>
      </div>

      <div>
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--muse-muted)",
            display: "block",
            marginBottom: 10,
          }}
        >
          Services you&apos;re imagining
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SERVICES.map((s) => (
            <button
              type="button"
              key={s.slug}
              className="muse-chip"
              data-active={services.includes(s.slug) || undefined}
              onClick={() => toggleService(s.slug)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Field label="Budget range (optional)">
        <select name="budget" defaultValue="">
          <option value="">Prefer not to say</option>
          {BUDGETS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </Field>

      <Field label="Tell us about your celebration">
        <textarea
          name="notes"
          rows={5}
          placeholder="The mood you're dreaming of, venues you love, names of friends who've booked with us — anything that helps us plan."
        />
      </Field>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" className="muse-btn muse-btn--primary">
          Send Inquiry
        </button>
        <span
          style={{
            fontFamily: "var(--muse-font-display)",
            fontStyle: "italic",
            fontWeight: 300,
            color: "var(--muse-muted)",
            fontSize: 15,
          }}
        >
          Expect a reply within two working days.
        </span>
      </div>

      <style>{`
        .muse-root form input,
        .muse-root form select,
        .muse-root form textarea {
          width: 100%;
          padding: 13px 16px;
          border: 1px solid var(--muse-line);
          border-radius: var(--muse-radius-sm);
          background: var(--muse-ivory-warm);
          font-size: 14.5px;
          color: var(--muse-espresso-deep);
          transition: border-color 240ms var(--muse-ease-soft), background 240ms var(--muse-ease-soft);
        }
        .muse-root form textarea { resize: vertical; min-height: 120px; }
        .muse-root form input:focus,
        .muse-root form select:focus,
        .muse-root form textarea:focus {
          outline: none;
          border-color: var(--muse-espresso);
          background: #fff;
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--muse-muted)",
        }}
      >
        {label}
        {required ? <span style={{ color: "var(--muse-blush)" }}> ·</span> : null}
      </span>
      {children}
    </label>
  );
}
