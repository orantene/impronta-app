"use client";

/**
 * EditJobSheet — the unified "Edit job" editor.
 *
 * Opened from the pencil next to the inquiry title in the admin Messages
 * thread header (admin-3.tsx). It edits EVERY field the job needs in one
 * place: the original inquiry request fields, plus (once the inquiry has
 * converted to a booking) the booking-side job fields — a clean-up surface
 * so all details are present before / after the event.
 *
 * Data path:
 *   - loadEditableJobFields  → prefill (inquiry + linked booking + event types)
 *   - updateInquiryJobFields → version-locked save of the inquiry request fields
 *   - updateBookingJobFields → scoped save of the linked booking's job fields
 *
 * Save state is always visible (per the "async state always visible" bar):
 * Save button shows saving / saved / error inline, and a version conflict
 * surfaces a clear message + a Refresh that reloads the form from the server.
 */

import { cloneElement, useCallback, useEffect, useId, useRef, useState } from "react";
import { Sheet } from "@/components/reservation-thread";
import {
  loadEditableJobFields,
  updateInquiryJobFields,
  updateBookingJobFields,
  type EditJobFieldData,
  type EditableInquiryJobFields,
  type EditableBookingJobFields,
  type EditJobEventTypeOption,
  type BookingJobFieldsPatch,
} from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import type { InquiryDetailsPatch } from "@/lib/inquiry/inquiry-engine-details";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

// Local editable form mirror — strings throughout (numbers/dates round-trip
// as text in inputs); we coerce back to the patch shapes on save.
type InquiryForm = {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  company: string;
  eventTypeId: string;
  quantity: string;
  message: string;
  eventDate: string;
  eventTimezone: string;
  deadlineLocal: string; // datetime-local value
  eventLocation: string;
  wardrobeNotes: string;
  equipmentNotes: string;
  transportNotes: string;
  lodgingNotes: string;
  mealsNotes: string;
  accessNotes: string;
};

type BookingForm = {
  title: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  eventDate: string;
  timezone: string;
  deadlineLocal: string;
  venueName: string;
  venueAddress: string;
  venueLocationText: string;
  notes: string;
  internalNotes: string;
  paymentNotes: string;
  wardrobeNotes: string;
  equipmentNotes: string;
  transportNotes: string;
  lodgingNotes: string;
  mealsNotes: string;
  accessNotes: string;
};

const s = (v: string | null | undefined): string => v ?? "";

// timestamptz (ISO) → value for <input type="datetime-local"> (local time).
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// <input type="datetime-local"> value → ISO string (or null when cleared).
function localInputToIso(local: string): string | null {
  const trimmed = local.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function inquiryToForm(i: EditableInquiryJobFields): InquiryForm {
  return {
    contactName: s(i.contactName),
    contactEmail: s(i.contactEmail),
    contactPhone: s(i.contactPhone),
    company: s(i.company),
    eventTypeId: s(i.eventTypeId),
    quantity: i.quantity == null ? "" : String(i.quantity),
    message: s(i.message),
    eventDate: s(i.eventDate),
    eventTimezone: s(i.eventTimezone),
    deadlineLocal: isoToLocalInput(i.deadlineAt),
    eventLocation: s(i.eventLocation),
    wardrobeNotes: s(i.wardrobeNotes),
    equipmentNotes: s(i.equipmentNotes),
    transportNotes: s(i.transportNotes),
    lodgingNotes: s(i.lodgingNotes),
    mealsNotes: s(i.mealsNotes),
    accessNotes: s(i.accessNotes),
  };
}

function bookingToForm(b: EditableBookingJobFields): BookingForm {
  return {
    title: s(b.title),
    contactName: s(b.contactName),
    contactEmail: s(b.contactEmail),
    contactPhone: s(b.contactPhone),
    eventDate: s(b.eventDate),
    timezone: s(b.timezone),
    deadlineLocal: isoToLocalInput(b.deadlineAt),
    venueName: s(b.venueName),
    venueAddress: s(b.venueAddress),
    venueLocationText: s(b.venueLocationText),
    notes: s(b.notes),
    internalNotes: s(b.internalNotes),
    paymentNotes: s(b.paymentNotes),
    wardrobeNotes: s(b.wardrobeNotes),
    equipmentNotes: s(b.equipmentNotes),
    transportNotes: s(b.transportNotes),
    lodgingNotes: s(b.lodgingNotes),
    mealsNotes: s(b.mealsNotes),
    accessNotes: s(b.accessNotes),
  };
}

export function EditJobSheet({
  open,
  inquiryId,
  tenantSlug,
  onClose,
  onSaved,
}: {
  open: boolean;
  inquiryId: string;
  tenantSlug: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<EditJobFieldData | null>(null);
  const [inquiryForm, setInquiryForm] = useState<InquiryForm | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingForm | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveState("idle");
    setSaveError(null);
    loadEditableJobFields(tenantSlug, inquiryId)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok || !r.data) {
          setLoadError(r.ok ? "No job data found." : r.error);
          setData(null);
          return;
        }
        setData(r.data);
        setInquiryForm(inquiryToForm(r.data.inquiry));
        setBookingForm(r.data.booking ? bookingToForm(r.data.booking) : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, inquiryId]);

  useEffect(() => {
    if (!open) return;
    const dispose = load();
    return dispose;
  }, [open, load]);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const setInq = <K extends keyof InquiryForm>(key: K, value: string) =>
    setInquiryForm((f) => (f ? { ...f, [key]: value } : f));
  const setBk = <K extends keyof BookingForm>(key: K, value: string) =>
    setBookingForm((f) => (f ? { ...f, [key]: value } : f));

  const handleSave = async () => {
    if (!data || !inquiryForm || saveState === "saving") return;
    setSaveState("saving");
    setSaveError(null);

    // ── Build the inquiry patch (full field set). ──
    const i = inquiryForm;
    const qtyTrim = i.quantity.trim();
    let quantity: number | null = null;
    if (qtyTrim.length > 0) {
      const n = Number(qtyTrim);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        setSaveState("error");
        setSaveError("Talent needed must be a whole number.");
        return;
      }
      quantity = n;
    }
    if (!i.contactName.trim() || !i.contactEmail.trim()) {
      setSaveState("error");
      setSaveError("Contact name and email are required.");
      return;
    }

    const inquiryPatch: InquiryDetailsPatch = {
      contact_name: i.contactName,
      contact_email: i.contactEmail,
      contact_phone: i.contactPhone,
      company: i.company,
      event_type_id: i.eventTypeId ? i.eventTypeId : null,
      quantity,
      message: i.message,
      event_date: i.eventDate ? i.eventDate : null,
      event_timezone: i.eventTimezone,
      deadline_at: localInputToIso(i.deadlineLocal),
      event_location: i.eventLocation,
      wardrobe_notes: i.wardrobeNotes,
      equipment_notes: i.equipmentNotes,
      transport_notes: i.transportNotes,
      lodging_notes: i.lodgingNotes,
      meals_notes: i.mealsNotes,
      access_notes: i.accessNotes,
    };

    const inqRes = await updateInquiryJobFields(
      tenantSlug,
      inquiryId,
      data.inquiry.version,
      inquiryPatch,
    );

    if (!inqRes.ok) {
      const conflict = /updated elsewhere/i.test(inqRes.error);
      setSaveState(conflict ? "conflict" : "error");
      setSaveError(inqRes.error);
      return;
    }

    // ── Booking patch (only when booked). ──
    if (bookingForm) {
      const b = bookingForm;
      if (!b.title.trim()) {
        setSaveState("error");
        setSaveError("Job title is required.");
        return;
      }
      const bookingPatch: BookingJobFieldsPatch = {
        title: b.title,
        contact_name: b.contactName,
        contact_email: b.contactEmail,
        contact_phone: b.contactPhone,
        event_date: b.eventDate ? b.eventDate : null,
        timezone: b.timezone,
        deadline_at: localInputToIso(b.deadlineLocal),
        venue_name: b.venueName,
        venue_address: b.venueAddress,
        venue_location_text: b.venueLocationText,
        notes: b.notes,
        internal_notes: b.internalNotes,
        payment_notes: b.paymentNotes,
        wardrobe_notes: b.wardrobeNotes,
        equipment_notes: b.equipmentNotes,
        transport_notes: b.transportNotes,
        lodging_notes: b.lodgingNotes,
        meals_notes: b.mealsNotes,
        access_notes: b.accessNotes,
      };
      const bkRes = await updateBookingJobFields(tenantSlug, inquiryId, bookingPatch);
      if (!bkRes.ok) {
        setSaveState("error");
        setSaveError(bkRes.error);
        return;
      }
    }

    setSaveState("saved");
    onSaved?.();
    // Reload so the version bumps and the form reflects the canonical row.
    load();
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => {
      setSaveState((cur) => (cur === "saved" ? "idle" : cur));
    }, 2400);
  };

  const saveLabel =
    saveState === "saving" ? "Saving…"
    : saveState === "saved" ? "Saved ✓"
    : "Save changes";

  const footer = (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
        {saveState === "conflict" && (
          <span style={{ fontSize: 11.5, color: COLORS.red, fontFamily: FONTS.body }}>
            Updated elsewhere. Refresh to load the latest.
          </span>
        )}
        {saveState === "error" && saveError && (
          <span style={{ fontSize: 11.5, color: COLORS.red, fontFamily: FONTS.body }}>
            {saveError}
          </span>
        )}
        {saveState === "saved" && (
          <span style={{ fontSize: 11.5, color: COLORS.green, fontFamily: FONTS.body }}>
            Changes saved.
          </span>
        )}
      </div>
      {saveState === "conflict" ? (
        <button type="button" onClick={() => load()} style={primaryButton()}>
          Refresh
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === "saving" || loading || !inquiryForm}
          style={{
            ...primaryButton(),
            opacity: saveState === "saving" || loading || !inquiryForm ? 0.6 : 1,
            cursor: saveState === "saving" || loading || !inquiryForm ? "default" : "pointer",
          }}
        >
          {saveLabel}
        </button>
      )}
    </>
  );

  return (
    <Sheet pov="admin" open={open} title="Edit job" onClose={onClose} footer={footer}>
      {loading && !inquiryForm && (
        <div style={{ padding: "8px 2px", fontSize: 13, color: COLORS.inkMuted, fontFamily: FONTS.body }}>
          Loading job details…
        </div>
      )}
      {loadError && (
        <div
          role="alert"
          style={{
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(176,48,58,0.08)", color: COLORS.red,
            fontSize: 12.5, fontFamily: FONTS.body,
          }}
        >
          {loadError}
        </div>
      )}

      {inquiryForm && data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONTS.body }}>
          {data.inquiry.isFrozen && (
            <div
              role="alert"
              style={{
                padding: "8px 10px", borderRadius: 8,
                background: COLORS.amberSoft, color: COLORS.amberDeep,
                fontSize: 11.5,
              }}
            >
              This inquiry is frozen. Fields are read-only until it is unfrozen.
            </div>
          )}

          {/* Client & contact */}
          <Group label="Client and contact">
            <Field label="Contact name" required>
              <Input value={inquiryForm.contactName} onChange={(v) => setInq("contactName", v)} />
            </Field>
            <Field label="Contact email" required>
              <Input type="email" value={inquiryForm.contactEmail} onChange={(v) => setInq("contactEmail", v)} />
            </Field>
            <Field label="Contact phone">
              <Input type="tel" value={inquiryForm.contactPhone} onChange={(v) => setInq("contactPhone", v)} />
            </Field>
            <Field label="Company">
              <Input value={inquiryForm.company} onChange={(v) => setInq("company", v)} />
            </Field>
          </Group>

          {/* Job brief */}
          <Group label="Job brief">
            <Field label="Event type">
              <Select
                value={inquiryForm.eventTypeId}
                onChange={(v) => setInq("eventTypeId", v)}
                options={data.eventTypes}
              />
            </Field>
            <Field label="Talent needed">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={inquiryForm.quantity}
                onChange={(v) => setInq("quantity", v)}
              />
            </Field>
            <Field label="Request / brief">
              <TextArea value={inquiryForm.message} onChange={(v) => setInq("message", v)} rows={3} />
            </Field>
          </Group>

          {/* Schedule */}
          <Group label="Schedule">
            <Field label="Event date">
              <Input type="date" value={inquiryForm.eventDate} onChange={(v) => setInq("eventDate", v)} />
            </Field>
            <Field label="Time zone">
              <Input
                value={inquiryForm.eventTimezone}
                onChange={(v) => setInq("eventTimezone", v)}
                placeholder="e.g. America/Mexico_City"
              />
            </Field>
            <Field label="Confirmation deadline">
              <Input
                type="datetime-local"
                value={inquiryForm.deadlineLocal}
                onChange={(v) => setInq("deadlineLocal", v)}
              />
            </Field>
          </Group>

          {/* Location */}
          <Group label="Location">
            <Field label="Event location">
              <Input value={inquiryForm.eventLocation} onChange={(v) => setInq("eventLocation", v)} />
            </Field>
          </Group>

          {/* Logistics */}
          <Group label="Logistics">
            <Field label="Wardrobe notes">
              <TextArea value={inquiryForm.wardrobeNotes} onChange={(v) => setInq("wardrobeNotes", v)} rows={2} />
            </Field>
            <Field label="Equipment notes">
              <TextArea value={inquiryForm.equipmentNotes} onChange={(v) => setInq("equipmentNotes", v)} rows={2} />
            </Field>
            <Field label="Transport notes">
              <TextArea value={inquiryForm.transportNotes} onChange={(v) => setInq("transportNotes", v)} rows={2} />
            </Field>
            <Field label="Lodging notes">
              <TextArea value={inquiryForm.lodgingNotes} onChange={(v) => setInq("lodgingNotes", v)} rows={2} />
            </Field>
            <Field label="Meals notes">
              <TextArea value={inquiryForm.mealsNotes} onChange={(v) => setInq("mealsNotes", v)} rows={2} />
            </Field>
            <Field label="Access notes">
              <TextArea value={inquiryForm.accessNotes} onChange={(v) => setInq("accessNotes", v)} rows={2} />
            </Field>
          </Group>

          {/* Booking — only when a booking exists for this inquiry. */}
          {bookingForm && (
            <Group label="Booking" note="These confirmed details apply once the job is booked.">
              <Field label="Job title" required>
                <Input value={bookingForm.title} onChange={(v) => setBk("title", v)} />
              </Field>
              <Field label="Confirmed date">
                <Input type="date" value={bookingForm.eventDate} onChange={(v) => setBk("eventDate", v)} />
              </Field>
              <Field label="Time zone">
                <Input value={bookingForm.timezone} onChange={(v) => setBk("timezone", v)} />
              </Field>
              <Field label="Confirmation deadline">
                <Input
                  type="datetime-local"
                  value={bookingForm.deadlineLocal}
                  onChange={(v) => setBk("deadlineLocal", v)}
                />
              </Field>
              <Field label="Contact name">
                <Input value={bookingForm.contactName} onChange={(v) => setBk("contactName", v)} />
              </Field>
              <Field label="Contact email">
                <Input type="email" value={bookingForm.contactEmail} onChange={(v) => setBk("contactEmail", v)} />
              </Field>
              <Field label="Contact phone">
                <Input type="tel" value={bookingForm.contactPhone} onChange={(v) => setBk("contactPhone", v)} />
              </Field>
              <Field label="Venue name">
                <Input value={bookingForm.venueName} onChange={(v) => setBk("venueName", v)} />
              </Field>
              <Field label="Venue address">
                <Input value={bookingForm.venueAddress} onChange={(v) => setBk("venueAddress", v)} />
              </Field>
              <Field label="Venue location">
                <Input value={bookingForm.venueLocationText} onChange={(v) => setBk("venueLocationText", v)} />
              </Field>
              <Field label="Notes (shared)">
                <TextArea value={bookingForm.notes} onChange={(v) => setBk("notes", v)} rows={2} />
              </Field>
              <Field label="Internal notes">
                <TextArea value={bookingForm.internalNotes} onChange={(v) => setBk("internalNotes", v)} rows={2} />
              </Field>
              <Field label="Payment notes">
                <TextArea value={bookingForm.paymentNotes} onChange={(v) => setBk("paymentNotes", v)} rows={2} />
              </Field>
              <Field label="Wardrobe notes">
                <TextArea value={bookingForm.wardrobeNotes} onChange={(v) => setBk("wardrobeNotes", v)} rows={2} />
              </Field>
              <Field label="Equipment notes">
                <TextArea value={bookingForm.equipmentNotes} onChange={(v) => setBk("equipmentNotes", v)} rows={2} />
              </Field>
              <Field label="Transport notes">
                <TextArea value={bookingForm.transportNotes} onChange={(v) => setBk("transportNotes", v)} rows={2} />
              </Field>
              <Field label="Lodging notes">
                <TextArea value={bookingForm.lodgingNotes} onChange={(v) => setBk("lodgingNotes", v)} rows={2} />
              </Field>
              <Field label="Meals notes">
                <TextArea value={bookingForm.mealsNotes} onChange={(v) => setBk("mealsNotes", v)} rows={2} />
              </Field>
              <Field label="Access notes">
                <TextArea value={bookingForm.accessNotes} onChange={(v) => setBk("accessNotes", v)} rows={2} />
              </Field>
            </Group>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ── Presentational sub-components ──────────────────────────────────────────

function Group({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <h4
          style={{
            margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: COLORS.inkMuted,
          }}
        >
          {label}
        </h4>
        {note && (
          <p style={{ margin: "3px 0 0", fontSize: 11, color: COLORS.inkDim }}>{note}</p>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactElement<{ id?: string }> }) {
  const id = useId();
  // The control is wrapped by the <label>, so an explicit htmlFor + id pair is
  // not strictly required for the click/focus association, but we set both so
  // screen readers announce the field name even when focus lands directly.
  return (
    <label htmlFor={id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink }}>
        {label}
        {required && <span style={{ color: COLORS.red, marginLeft: 3 }} aria-hidden>*</span>}
      </span>
      {cloneElement(children, { id })}
    </label>
  );
}

const controlStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.card,
  color: COLORS.ink,
  fontFamily: FONTS.body,
  fontSize: 13,
  outline: "none",
};

function Input({
  id,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  inputMode,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  min?: number;
  inputMode?: "numeric" | "text" | "tel" | "email";
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      min={min}
      inputMode={inputMode}
      onChange={(e) => onChange(e.currentTarget.value)}
      style={controlStyle}
    />
  );
}

function TextArea({
  id,
  value,
  onChange,
  rows = 3,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.currentTarget.value)}
      style={{ ...controlStyle, resize: "vertical", lineHeight: 1.45 }}
    />
  );
}

function Select({
  id,
  value,
  onChange,
  options,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: EditJobEventTypeOption[];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      style={controlStyle}
    >
      <option value="">— Not set —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function primaryButton(): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 9,
    border: "none",
    background: COLORS.accent,
    color: "#fff",
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  };
}

/**
 * The pencil trigger that opens the Edit-job sheet. Lives here (outside
 * components/admin/shell) so its inline style is allowed; the admin thread
 * header renders it in its `headerActions` slot, to the right of the title.
 */
export function EditJobButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Edit job details"
      title="Edit job details"
      style={{
        border: "none",
        background: "transparent",
        padding: 5,
        cursor: "pointer",
        color: "inherit",
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M11.2 2.3l2.5 2.5-7.5 7.5-3 .5.5-3 7.5-7.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
