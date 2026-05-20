"use client";

/**
 * InquiryDrawer — the canonical inquiry creation surface.
 *
 * Spec:  web/docs/inquiry-engine-spec-2026-05-14.md
 * Plan:  web/docs/client-execution-plan-2026-05-14.md §8
 *
 * Single component used by every entry point (client dashboard,
 * Discover, saved talent, shortlist, public talent profile, agency
 * site, hub site, pitch, admin manual, book-again). Each entry passes
 * a `source` enum + optional `source_context` + initial intent
 * fragment; the drawer reconciles defaults and renders the 7 sections.
 *
 * Premium booking-request builder feel — NOT a CRM form. Sections that
 * matter are visible by default; advanced logistics live behind an
 * expander. The user reaches "Send to coordinator" in ≤ 7 fields when
 * they're in a hurry, or fills the rich form when they have time.
 *
 * Per spec §10 the desktop layout uses 2 columns; mobile collapses to 1.
 */

import { useState, useEffect, useRef, useTransition, useMemo } from "react";
import { useActionState } from "react";
import {
  type InquiryIntent,
  type InquirySource,
  type InquiryRequester,
  type InquiryClient,
  type InquiryLocation,
  type InquiryDate,
  type InquiryTalent,
  type InquiryBudget,
  type InquiryBrief,
  type InquiryAttachment,
  validateIntentForSubmit,
} from "@/lib/inquiry/inquiry-intent";
import {
  saveDraftAction,
  submitInquiryNowAction,
  type InquiryIntentActionState,
} from "@/app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions";

const INQUIRY_DRAFT_AUTOSAVE_MS = 10_000;

// ─── Design tokens ───────────────────────────────────────────────────────────
const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface: "#FAFAF7",
  surfaceAlt: "#F7F7F2",
  card: "#FFFFFF",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success: "#0F5132",
  successSoft: "rgba(15,81,50,0.08)",
  amber: "#92400E",
  amberSoft: "rgba(146,64,14,0.08)",
} as const;

// ─── Talent picker option ────────────────────────────────────────────────────
export type RosterLiteItem = {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
};

// ─── Drawer props ────────────────────────────────────────────────────────────
export type InquiryDrawerProps = {
  /** Which source triggered the drawer. Drives smart defaults. */
  source: InquirySource;
  /** Initial intent — drawer merges with defaults. Pass talent ids, brief
   *  hints, anything else the entry point already knows. */
  initialIntent?: Partial<InquiryIntent>;
  /** Tenant slug — required to route the submit. */
  tenantSlug: string;
  /** Agency display name for header copy. */
  agencyName: string;
  /** Logged-in client profile (if any). NULL = guest. */
  client: {
    user_id?: string | null;
    displayName?: string;
    email?: string;
    phone?: string | null;
    company?: string | null;
    photo_url?: string | null;
    trust_level?: "basic" | "verified" | "silver" | "gold";
    member_since?: string;
    previous_bookings_count?: number;
  } | null;
  /** Roster the talent picker can pull from (lite shape). */
  roster?: RosterLiteItem[];
  /** Whether to enable draft autosave. Disabled for guest path. */
  enableDraftAutosave?: boolean;
  onClose: () => void;
};

// ─── Drawer ──────────────────────────────────────────────────────────────────
export function InquiryDrawer({
  source,
  initialIntent,
  tenantSlug,
  agencyName,
  client,
  roster = [],
  enableDraftAutosave,
  onClose,
}: InquiryDrawerProps) {
  // ─ Body scroll lock + ESC ──────────────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ─ Compute defaults (spec §13 smart defaults per source) ──────────────────
  const defaults = useMemo<InquiryIntent>(() => buildDefaults(source, initialIntent, client), [source, initialIntent, client]);
  const [intent, setIntent] = useState<InquiryIntent>(defaults);

  const [step, setStep] = useState<"compose" | "review">("compose");

  // ─ Autosave (logged-in only) ──────────────────────────────────────────────
  const autosaveEnabled = (enableDraftAutosave ?? !!client?.user_id) && !!client?.user_id;
  const [saveState, saveAction] = useActionState<InquiryIntentActionState, FormData>(
    saveDraftAction,
    { kind: "idle" },
  );
  const [draftId, setDraftId] = useState<string | null>(null);
  const intentRef = useRef(intent);
  intentRef.current = intent;

  // Pick up the new draftId after a save resolves.
  useEffect(() => {
    if (saveState.kind === "saved" && saveState.draftId !== draftId) {
      setDraftId(saveState.draftId);
    }
  }, [saveState, draftId]);

  const [, startAutosave] = useTransition();
  const lastSavedJSONRef = useRef<string>("");
  const triggerAutosave = useMemo(() => {
    return () => {
      if (!autosaveEnabled) return;
      const serialized = JSON.stringify(intentRef.current);
      if (serialized === lastSavedJSONRef.current) return;
      lastSavedJSONRef.current = serialized;
      const fd = new FormData();
      fd.set("tenantSlug", tenantSlug);
      fd.set("intent", serialized);
      if (draftId) fd.set("draftId", draftId);
      startAutosave(() => { saveAction(fd); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saveAction is a stable useActionState dispatch; startAutosave is a stable useTransition dispatch; intentRef/lastSavedJSONRef are refs
  }, [autosaveEnabled, tenantSlug, draftId]);

  // Periodic autosave + on-blur + on visibility change.
  useEffect(() => {
    if (!autosaveEnabled) return;
    const t = setInterval(triggerAutosave, INQUIRY_DRAFT_AUTOSAVE_MS);
    const onBlur = () => triggerAutosave();
    const onVisibility = () => { if (document.hidden) triggerAutosave(); };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(t);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autosaveEnabled, triggerAutosave]);

  // ─ Submit ────────────────────────────────────────────────────────────────
  const [submitState, submitFormAction, submitting] = useActionState<
    InquiryIntentActionState,
    FormData
  >(submitInquiryNowAction, { kind: "idle" });

  const validation = validateIntentForSubmit(intent);
  const canSubmit = validation.ok;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("intent", JSON.stringify(intent));
    submitFormAction(fd);
  };

  // ─ Section updaters ──────────────────────────────────────────────────────
  const update = <K extends keyof InquiryIntent>(
    key: K,
    value: InquiryIntent[K],
  ) => setIntent((cur) => ({ ...cur, [key]: value }));

  // ─ Render ────────────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New inquiry"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
        background: "rgba(11,11,13,0.48)",
        backdropFilter: "blur(2px)",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "min(720px, 100vw)",
          height: "100dvh",
          background: C.surface,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.18)",
          fontFamily: FONT,
          animation: "iq-drawer-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <style dangerouslySetInnerHTML={{ __html: keyframesCSS }} />

        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "16px 22px",
            borderBottom: `1px solid ${C.borderSoft}`,
            background: "#fff",
            flexShrink: 0,
          }}
        >
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {step === "compose" ? "New inquiry" : "Review & send"}
            </div>
            <h2 style={{ margin: "3px 0 0", fontSize: 19, fontWeight: 600, color: C.ink, letterSpacing: -0.1, fontFamily: FONT_DISPLAY }}>
              {step === "compose" ? "Start a new project" : "Looks good — ready to send?"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.inkMuted, maxWidth: 520, lineHeight: 1.45 }}>
              {step === "compose"
                ? <>Tell <strong>{agencyName}</strong> what you need. We&apos;ll match talent + draft an offer.</>
                : <>One last check before <strong>{agencyName}</strong> picks this up.</>
              }
            </p>
            {autosaveEnabled && (
              <div style={{ marginTop: 8, fontSize: 11, color: saveState.kind === "saved" ? C.success : C.inkDim }}>
                {saveState.kind === "saved"
                  ? `Draft saved ${formatRelative(saveState.savedAt)}`
                  : "Draft will save automatically"}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${C.borderSoft}`,
              background: "transparent",
              color: C.ink,
              fontSize: 16,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </header>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 24px" }}>
          {step === "compose" ? (
            <Compose
              intent={intent}
              setRequester={(v) => update("requester", v)}
              setClient={(v) => update("client", v)}
              setLocation={(v) => update("location", v)}
              setDate={(v) => update("date", v)}
              setTalent={(v) => update("talent", v)}
              setBudget={(v) => update("budget", v)}
              setBrief={(v) => update("brief", v)}
              setFiles={(v) => update("files", v)}
              setLinks={(v) => update("links", v)}
              roster={roster}
              client={client}
            />
          ) : (
            <Review intent={intent} agencyName={agencyName} />
          )}
        </div>

        {/* Footer */}
        <footer
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "12px 22px",
            borderTop: `1px solid ${C.borderSoft}`,
            background: "#fff",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 11.5, color: C.inkDim, lineHeight: 1.35, maxWidth: 320 }}>
            {!canSubmit && step === "compose"
              ? <>Add at least <strong>your name</strong>, <strong>email or phone</strong>, and a <strong>brief</strong> to send.</>
              : submitState.kind === "error"
                ? <span style={{ color: C.amber }}>{submitState.message}</span>
                : <>By sending, you&apos;ll start a coordinator-led conversation with {agencyName}.</>
            }
          </div>
          <div style={{ display: "inline-flex", gap: 8, flexShrink: 0 }}>
            {step === "compose" ? (
              <button
                type="button"
                onClick={() => setStep("review")}
                disabled={!canSubmit}
                style={primaryBtn(canSubmit)}
              >
                Review
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setStep("compose")} style={ghostBtn}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !canSubmit}
                  style={primaryBtn(!submitting && canSubmit)}
                >
                  {submitting ? "Sending…" : "Send to coordinator"}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compose body — 7 sections per spec §3–9 + Files + Links.
// ─────────────────────────────────────────────────────────────────────────────

function Compose(props: {
  intent: InquiryIntent;
  setRequester: (v: InquiryRequester) => void;
  setClient: (v: InquiryClient) => void;
  setLocation: (v: InquiryLocation) => void;
  setDate: (v: InquiryDate) => void;
  setTalent: (v: InquiryTalent) => void;
  setBudget: (v: InquiryBudget) => void;
  setBrief: (v: InquiryBrief) => void;
  setFiles: (v: InquiryAttachment[] | undefined) => void;
  setLinks: (v: string[] | undefined) => void;
  roster: RosterLiteItem[];
  client: InquiryDrawerProps["client"];
}) {
  const { intent } = props;
  return (
    <div className="flex flex-col gap-4">
      <RequesterSection
        value={intent.requester}
        onChange={props.setRequester}
        client={props.client}
      />
      <ClientSection
        requester={intent.requester}
        value={intent.client ?? {}}
        onChange={props.setClient}
      />
      <LocationSection value={intent.location ?? {}} onChange={props.setLocation} />
      <DateSection value={intent.date ?? {}} onChange={props.setDate} />
      <TalentSection
        value={intent.talent ?? {}}
        onChange={props.setTalent}
        roster={props.roster}
      />
      <BudgetSection
        value={intent.budget ?? {}}
        onChange={props.setBudget}
        talentCount={intent.talent?.selected_ids?.length ?? 0}
      />
      <BriefSection
        value={intent.brief ?? {}}
        onChange={props.setBrief}
      />
      <FilesLinksSection
        files={intent.files ?? []}
        links={intent.links ?? []}
        onFiles={props.setFiles}
        onLinks={props.setLinks}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Requester (spec §3)
// ─────────────────────────────────────────────────────────────────────────────

function RequesterSection({
  value, onChange, client,
}: {
  value: InquiryRequester;
  onChange: (v: InquiryRequester) => void;
  client: InquiryDrawerProps["client"];
}) {
  const isLoggedIn = !!client?.user_id;
  return (
    <Section title="Your info" subtitle="Who is making this request?">
      {/* Trust card — always shown, content differs by state */}
      <TrustCard isLoggedIn={isLoggedIn} client={client} />

      <FieldRow>
        <Field label="Name">
          <Input value={value.name ?? ""} onChange={(v) => onChange({ ...value, name: v })} placeholder="Your full name" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Email">
          <Input type="email" value={value.email ?? ""} onChange={(v) => onChange({ ...value, email: v })} placeholder="you@brand.com" />
        </Field>
        <Field label="Phone or WhatsApp">
          <Input type="tel" value={value.phone ?? ""} onChange={(v) => onChange({ ...value, phone: v })} placeholder="+52 …" />
        </Field>
      </FieldRow>
    </Section>
  );
}

function TrustCard({ isLoggedIn, client }: { isLoggedIn: boolean; client: InquiryDrawerProps["client"] }) {
  if (isLoggedIn) {
    const bookings = client?.previous_bookings_count ?? 0;
    return (
      <div style={trustCardStyle(C.successSoft, C.success)}>
        <div className="font-bold">Logged-in client</div>
        <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", fontSize: 12, color: C.inkMuted, lineHeight: 1.6 }}>
          <li>✓ Verified email</li>
          {client?.member_since && <li>Member since {client.member_since}</li>}
          <li>Trust level: <strong>{client?.trust_level ?? "basic"}</strong></li>
          {bookings > 0 && <li>{bookings} previous booking{bookings === 1 ? "" : "s"}</li>}
        </ul>
      </div>
    );
  }
  return (
    <div style={trustCardStyle(C.amberSoft, C.amber)}>
      <div className="font-bold">New client</div>
      <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
        Contact info required so the agency can follow up. You&apos;ll get a magic-link to track this inquiry after submit.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Client / company / job (spec §4)
// ─────────────────────────────────────────────────────────────────────────────

function ClientSection({
  requester, value, onChange,
}: {
  requester: InquiryRequester;
  value: InquiryClient;
  onChange: (v: InquiryClient) => void;
}) {
  const sameAsRequester = value.same_as_requester !== false; // default checked
  return (
    <Section title="Who's this for?" subtitle="Job identity and the end client.">
      <label style={checkboxRow}>
        <input
          type="checkbox"
          checked={sameAsRequester}
          onChange={(e) => onChange({
            ...value,
            same_as_requester: e.target.checked,
            // If toggled off, clear name/company so the user has to enter them.
            ...(e.target.checked ? {} : { name: "", company: "" }),
          })}
        />
        <span><strong>Same as my profile</strong> — booking for me/my company</span>
      </label>

      {!sameAsRequester && (
        <>
          <FieldRow>
            <Field label="Client name">
              <Input value={value.name ?? ""} onChange={(v) => onChange({ ...value, name: v })} placeholder="The end client (if different)" />
            </Field>
            <Field label="Company / brand">
              <Input value={value.company ?? ""} onChange={(v) => onChange({ ...value, company: v })} placeholder="Brand or venue" />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Booking for">
              <Select
                value={value.booking_for ?? "another_client"}
                onChange={(v) => onChange({ ...value, booking_for: v as InquiryClient["booking_for"] })}
                options={[
                  { value: "myself", label: "Myself" },
                  { value: "my_company", label: "My company" },
                  { value: "another_client", label: "Another client / guest" },
                  { value: "brand", label: "A brand" },
                  { value: "venue", label: "A venue" },
                  { value: "agency_client", label: "An agency client" },
                ]}
              />
            </Field>
          </FieldRow>
        </>
      )}

      <FieldRow>
        <Field label="Job name (optional)" hint="A short title for this project.">
          <Input
            value={value.job_name ?? ""}
            onChange={(v) => onChange({ ...value, job_name: v })}
            placeholder={`e.g. ${requester.name?.split(" ")[0] ?? "Summer"} opening · Aug 14`}
          />
        </Field>
      </FieldRow>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Location (spec §5) — basic text + status, Google Places hookup TODO
// ─────────────────────────────────────────────────────────────────────────────

function LocationSection({
  value, onChange,
}: { value: InquiryLocation; onChange: (v: InquiryLocation) => void }) {
  return (
    <Section title="Where" subtitle="Helps talent confirm they can be there.">
      <FieldRow>
        <Field label="Venue or area">
          <Input
            value={value.venue_name ?? ""}
            onChange={(v) => onChange({ ...value, venue_name: v })}
            placeholder="e.g. Tulum Beach Club"
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="City">
          <Input
            value={value.city ?? ""}
            onChange={(v) => onChange({ ...value, city: v })}
            placeholder="e.g. Tulum"
          />
        </Field>
        <Field label="Country (optional)">
          <Input
            value={value.country ?? ""}
            onChange={(v) => onChange({ ...value, country: v })}
            placeholder="MX"
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Venue status">
          <Select
            value={value.status ?? "unconfirmed"}
            onChange={(v) => onChange({ ...value, status: v as InquiryLocation["status"] })}
            options={[
              { value: "confirmed", label: "Venue confirmed" },
              { value: "unconfirmed", label: "Venue not confirmed yet" },
              { value: "online", label: "Online / remote" },
              { value: "not_sure", label: "Not sure yet" },
            ]}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Address or notes (optional)">
          <Textarea
            rows={2}
            value={value.notes ?? ""}
            onChange={(v) => onChange({ ...value, notes: v })}
            placeholder="Specific street, parking notes, access info…"
          />
        </Field>
      </FieldRow>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Date / Time (spec §6)
// ─────────────────────────────────────────────────────────────────────────────

function DateSection({
  value, onChange,
}: { value: InquiryDate; onChange: (v: InquiryDate) => void }) {
  return (
    <Section title="When" subtitle="The date can be approximate.">
      <FieldRow>
        <Field label="Date status">
          <Select
            value={value.status ?? "exact"}
            onChange={(v) => onChange({ ...value, status: v as InquiryDate["status"] })}
            options={[
              { value: "exact", label: "Exact date" },
              { value: "flexible", label: "Flexible date" },
              { value: "not_sure", label: "Not sure yet" },
              { value: "multi_day", label: "Multi-day" },
              { value: "recurring", label: "Recurring" },
            ]}
          />
        </Field>
        <Field label="Event date">
          <Input
            type="date"
            value={value.event_date ?? ""}
            onChange={(v) => onChange({ ...value, event_date: v })}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Start time (optional)">
          <Input
            type="time"
            value={value.start_time ?? ""}
            onChange={(v) => onChange({ ...value, start_time: v })}
          />
        </Field>
        <Field label="Duration (optional)">
          <Input
            value={value.duration ?? ""}
            onChange={(v) => onChange({ ...value, duration: v })}
            placeholder="e.g. 2–4 hours · full day"
          />
        </Field>
      </FieldRow>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Selected talent (spec §7)
// ─────────────────────────────────────────────────────────────────────────────

function TalentSection({
  value, onChange, roster,
}: {
  value: InquiryTalent;
  onChange: (v: InquiryTalent) => void;
  roster: RosterLiteItem[];
}) {
  const selected = value.selected_ids ?? [];
  const isAgencyMode = value.selection_mode === "agency_recommends" || selected.length === 0;

  return (
    <Section title="Talent" subtitle="Pick specific talent, or let the agency recommend.">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <Pill
          active={value.selection_mode !== "i_know_who"}
          onClick={() => onChange({ ...value, selection_mode: "agency_recommends" })}
        >
          Let the agency recommend
        </Pill>
        <Pill
          active={value.selection_mode === "i_know_who"}
          onClick={() => onChange({ ...value, selection_mode: "i_know_who" })}
        >
          I know who I want
        </Pill>
        <Pill
          active={value.selection_mode === "similar_to_past"}
          onClick={() => onChange({ ...value, selection_mode: "similar_to_past" })}
        >
          Similar to past booking
        </Pill>
      </div>

      {selected.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {selected.map((id) => {
            const r = roster.find((r) => r.id === id);
            return (
              <span key={id} style={chipStyle}>
                {r?.name ?? id.slice(0, 8)}
                {r?.primaryTypeLabel && <span style={{ color: C.inkMuted }}> · {r.primaryTypeLabel}</span>}
                <button
                  type="button"
                  aria-label={`Remove ${r?.name ?? "talent"}`}
                  onClick={() => onChange({ ...value, selected_ids: selected.filter((x) => x !== id) })}
                  style={{ marginLeft: 6, border: "none", background: "transparent", cursor: "pointer", color: C.inkMuted }}
                >×</button>
              </span>
            );
          })}
        </div>
      )}

      {value.selection_mode === "i_know_who" && roster.length > 0 && (
        <FieldRow>
          <Field label="Add talent">
            <Select
              value=""
              onChange={(v) => {
                if (!v) return;
                if (selected.includes(v)) return;
                onChange({ ...value, selected_ids: [...selected, v] });
              }}
              options={[
                { value: "", label: selected.length > 0 ? "Add another…" : "Select talent…" },
                ...roster
                  .filter((r) => !selected.includes(r.id))
                  .map((r) => ({
                    value: r.id,
                    label: `${r.name}${r.primaryTypeLabel ? ` · ${r.primaryTypeLabel}` : ""}${r.city ? ` · ${r.city}` : ""}`,
                  })),
              ]}
            />
          </Field>
        </FieldRow>
      )}

      {isAgencyMode && (
        <FieldRow>
          <Field label="How many talent (optional)">
            <Input
              type="number"
              value={value.count_needed?.toString() ?? ""}
              onChange={(v) => onChange({ ...value, count_needed: v ? parseInt(v, 10) : undefined })}
              placeholder="e.g. 3"
            />
          </Field>
          <Field label="Type of talent">
            <Input
              value={value.notes ?? ""}
              onChange={(v) => onChange({ ...value, notes: v })}
              placeholder="e.g. 2 hosts + 1 model"
            />
          </Field>
        </FieldRow>
      )}
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Budget (spec §8)
// ─────────────────────────────────────────────────────────────────────────────

function BudgetSection({
  value, onChange, talentCount,
}: {
  value: InquiryBudget;
  onChange: (v: InquiryBudget) => void;
  talentCount: number;
}) {
  const pref = value.preference ?? "agency_recommends";
  return (
    <Section title="Budget" subtitle="No need to guess — let the agency price it.">
      <FieldRow>
        <Field label="How would you like the agency to price this?">
          <Select
            value={pref}
            onChange={(v) => onChange({ ...value, preference: v as InquiryBudget["preference"] })}
            options={[
              { value: "agency_recommends", label: "Let the agency recommend the best offer" },
              { value: "total_budget", label: "I have a total budget" },
              { value: "per_hour", label: "I want to pay per hour" },
              { value: "per_day", label: "I want to pay per day" },
              { value: "per_week", label: "I want to pay per week" },
              { value: "per_contract", label: "I want to pay per contract" },
              { value: "per_talent", label: "I want to pay per talent" },
              { value: "not_sure", label: "Not sure yet" },
            ]}
          />
        </Field>
      </FieldRow>

      {(pref === "total_budget" || pref === "per_hour" || pref === "per_day" || pref === "per_week" || pref === "per_contract" || pref === "per_talent") && (
        <FieldRow>
          <Field label={pref === "total_budget" ? "Around" : `Per ${pref.replace("per_", "")} (approx)`}>
            <Input
              type="number"
              value={value.amount?.toString() ?? ""}
              onChange={(v) => onChange({ ...value, amount: v ? parseFloat(v) : undefined })}
              placeholder="$"
            />
          </Field>
          <Field label="Currency">
            <Select
              value={value.currency ?? "USD"}
              onChange={(v) => onChange({ ...value, currency: v })}
              options={[
                { value: "USD", label: "USD" },
                { value: "MXN", label: "MXN" },
                { value: "EUR", label: "EUR" },
              ]}
            />
          </Field>
        </FieldRow>
      )}

      {pref === "agency_recommends" && talentCount > 0 && (
        <div style={hintBoxStyle}>
          With {talentCount} talent selected, the agency will price based on schedule, location, usage, and logistics. You&apos;ll see the offer here before any commitment.
        </div>
      )}
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Brief / logistics (spec §9)
// ─────────────────────────────────────────────────────────────────────────────

function BriefSection({
  value, onChange,
}: { value: InquiryBrief; onChange: (v: InquiryBrief) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Section title="What you need" subtitle="A short brief is enough to start.">
      <FieldRow>
        <Field label="Tell us about the project">
          <Textarea
            rows={4}
            value={value.summary ?? ""}
            onChange={(v) => onChange({ ...value, summary: v })}
            placeholder="What are you planning? What kind of talent works for you? Anything already confirmed?"
          />
        </Field>
      </FieldRow>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          marginTop: 6,
          alignSelf: "flex-start",
          padding: "6px 10px",
          background: "transparent",
          border: `1px dashed ${C.border}`,
          borderRadius: 7,
          color: C.inkMuted,
          fontSize: 11.5,
          fontWeight: 600,
          fontFamily: FONT,
          cursor: "pointer",
        }}
      >
        {expanded ? "− Hide advanced logistics" : "+ Add more details (wardrobe, media usage, equipment…)"}
      </button>

      {expanded && (
        <>
          <FieldRow>
            <Field label="What should the talent do?">
              <Textarea
                rows={2}
                value={(value.role_expectations ?? []).join(", ")}
                onChange={(v) => onChange({ ...value, role_expectations: v.split(",").map(s => s.trim()).filter(Boolean) })}
                placeholder="Greet guests, pose for photos, host booth, dance/perform, model clothing, create content…"
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Wardrobe / styling">
              <Input value={value.wardrobe_notes ?? ""} onChange={(v) => onChange({ ...value, wardrobe_notes: v })} placeholder="Talent brings · client provides · dress code · TBD" />
            </Field>
            <Field label="Equipment">
              <Input value={value.equipment_notes ?? ""} onChange={(v) => onChange({ ...value, equipment_notes: v })} placeholder="Talent brings · client provides · none · TBD" />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Media / usage">
              <Input value={value.media_usage ?? ""} onChange={(v) => onChange({ ...value, media_usage: v })} placeholder="No filming · event recap · organic social · paid ads · website" />
            </Field>
            <Field label="Travel / parking">
              <Input value={value.travel_notes ?? ""} onChange={(v) => onChange({ ...value, travel_notes: v })} placeholder="Parking · transport · talent handles own · TBD" />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Special notes">
              <Textarea rows={2} value={value.special_requirements ?? ""} onChange={(v) => onChange({ ...value, special_requirements: v })} placeholder="Anything else the coordinator should know…" />
            </Field>
          </FieldRow>
        </>
      )}
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Files + links
// ─────────────────────────────────────────────────────────────────────────────

function FilesLinksSection({
  files, links, onFiles, onLinks,
}: {
  files: InquiryAttachment[];
  links: string[];
  onFiles: (v: InquiryAttachment[] | undefined) => void;
  onLinks: (v: string[] | undefined) => void;
}) {
  const [linkDraft, setLinkDraft] = useState("");
  return (
    <Section title="Files & references" subtitle="Optional — moodboards, briefs, reference posts.">
      <FieldRow>
        <Field label="Reference link">
          <div className="flex gap-2">
            <Input
              value={linkDraft}
              onChange={setLinkDraft}
              placeholder="Paste Instagram, TikTok, drive link, brand site…"
            />
            <button
              type="button"
              style={ghostBtn}
              disabled={!linkDraft.trim()}
              onClick={() => {
                onLinks([...(links ?? []), linkDraft.trim()]);
                setLinkDraft("");
              }}
            >
              Add
            </button>
          </div>
        </Field>
      </FieldRow>
      {links.length > 0 && (
        <ul style={{ margin: "6px 0 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {links.map((l, i) => (
            <li key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: C.inkMuted }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
              <button
                type="button"
                onClick={() => onLinks(links.filter((_, j) => j !== i))}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: C.inkMuted }}
              >×</button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ fontSize: 11, color: C.inkDim, marginTop: 4 }}>
        File uploads coming soon — for now, link-share via the references field.
      </div>
      {/* files + onFiles reserved for the upload UI shipping in B-4.1 */}
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Review step
// ─────────────────────────────────────────────────────────────────────────────

function Review({ intent, agencyName }: { intent: InquiryIntent; agencyName: string }) {
  const sameAsRequester = intent.client?.same_as_requester !== false;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13.5, color: C.ink, fontFamily: FONT }}>
      <div style={{ fontSize: 12.5, color: C.inkMuted }}>
        Send request to <strong>{agencyName}</strong>
      </div>

      <ReviewRow label="Job">
        {intent.client?.job_name?.trim() || intent.brief?.summary?.slice(0, 60) || "Untitled inquiry"}
      </ReviewRow>
      <ReviewRow label="Contact">
        {intent.requester.name}
        {intent.requester.email && <span style={{ color: C.inkMuted }}> · {intent.requester.email}</span>}
        {intent.requester.phone && <span style={{ color: C.inkMuted }}> · {intent.requester.phone}</span>}
      </ReviewRow>
      {!sameAsRequester && (intent.client?.name || intent.client?.company) && (
        <ReviewRow label="Client / company">
          {intent.client?.name}{intent.client?.company ? ` · ${intent.client.company}` : ""}
        </ReviewRow>
      )}
      <ReviewRow label="Location">
        {[intent.location?.venue_name, intent.location?.city].filter(Boolean).join(" · ") || statusLabel(intent.location?.status)}
      </ReviewRow>
      <ReviewRow label="Date">
        {intent.date?.event_date || statusLabel(intent.date?.status)}
        {intent.date?.start_time && <span style={{ color: C.inkMuted }}> · {intent.date.start_time}</span>}
        {intent.date?.duration && <span style={{ color: C.inkMuted }}> · {intent.date.duration}</span>}
      </ReviewRow>
      <ReviewRow label="Talent">
        {intent.talent?.selection_mode === "agency_recommends"
          ? "Agency to recommend"
          : `${intent.talent?.selected_ids?.length ?? 0} selected`}
        {intent.talent?.count_needed ? ` · ${intent.talent.count_needed} needed` : ""}
      </ReviewRow>
      <ReviewRow label="Budget">
        {intent.budget?.preference === "agency_recommends" || !intent.budget?.preference
          ? "Let agency recommend the best offer"
          : `${intent.budget?.amount ?? "—"} ${intent.budget?.currency ?? ""} · ${intent.budget?.preference?.replace("_", " ")}`}
      </ReviewRow>
      <ReviewRow label="Brief">
        <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {intent.brief?.summary ?? "—"}
        </span>
      </ReviewRow>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 14, alignItems: "baseline", paddingBottom: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function statusLabel(s: string | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px 16px",
      }}
    >
      <div className="mb-2.5">
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="iq-field-row">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: FONT, gridColumn: "1 / -1" }}>
      <span style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600, letterSpacing: 0.2 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: C.inkDim }}>{hint}</span>}
    </label>
  );
}

function Input({
  value, onChange, placeholder, type = "text",
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}

function Textarea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ ...inputStyle, resize: "vertical", minHeight: 60, lineHeight: 1.45 }}
    />
  );
}

function Select({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        background: active ? C.ink : "transparent",
        color: active ? "#fff" : C.inkMuted,
        border: `1px solid ${active ? C.ink : C.border}`,
        cursor: "pointer",
        fontFamily: FONT,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  fontFamily: FONT,
  fontSize: 13.5,
  color: C.ink,
  background: "#fff",
  outline: "none",
  lineHeight: 1.4,
};

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    height: 36,
    padding: "0 16px",
    borderRadius: 8,
    background: enabled ? C.ink : "rgba(11,11,13,0.15)",
    color: "#fff",
    border: "none",
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 600,
  };
}

const ghostBtn: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: 8,
  background: "transparent",
  color: C.ink,
  border: `1px solid ${C.border}`,
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 10px",
  background: "#fff",
  border: `1px solid ${C.border}`,
  borderRadius: 999,
  fontSize: 12.5,
  fontFamily: FONT,
  color: C.ink,
};

const checkboxRow: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: C.ink,
  fontFamily: FONT,
  cursor: "pointer",
};

const hintBoxStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: C.accentSoft,
  borderRadius: 8,
  fontSize: 12,
  color: C.accent,
  lineHeight: 1.5,
};

function trustCardStyle(bg: string, fg: string): React.CSSProperties {
  return {
    background: bg,
    color: fg,
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 12.5,
    fontFamily: FONT,
    marginBottom: 4,
  };
}

const keyframesCSS =
  "@keyframes iq-drawer-in{from{transform:translateX(100%);opacity:0.6;}to{transform:translateX(0);opacity:1;}}"
  + "@media(max-width:640px){.iq-field-row{grid-template-columns:1fr!important;}}";

// ─────────────────────────────────────────────────────────────────────────────
// Smart defaults per source (spec §13)
// ─────────────────────────────────────────────────────────────────────────────

function buildDefaults(
  source: InquirySource,
  initial: Partial<InquiryIntent> | undefined,
  client: InquiryDrawerProps["client"],
): InquiryIntent {
  const requester: InquiryRequester = {
    name: initial?.requester?.name ?? client?.displayName ?? "",
    email: initial?.requester?.email ?? client?.email ?? "",
    phone: initial?.requester?.phone ?? client?.phone ?? "",
    user_id: initial?.requester?.user_id ?? client?.user_id ?? null,
    photo_url: client?.photo_url ?? null,
    trust_level: client?.trust_level ?? "basic",
  };
  const clientSection: InquiryClient = {
    same_as_requester: initial?.client?.same_as_requester ?? true,
    company: initial?.client?.company ?? client?.company ?? "",
    ...initial?.client,
  };
  return {
    source,
    source_context: initial?.source_context ?? {},
    requester,
    client: clientSection,
    location: initial?.location ?? { status: "unconfirmed" },
    date: initial?.date ?? { status: "exact" },
    talent: initial?.talent ?? { selection_mode: "agency_recommends" },
    budget: initial?.budget ?? { preference: "agency_recommends" },
    brief: initial?.brief ?? {},
    files: initial?.files ?? [],
    links: initial?.links ?? [],
  };
}

// ─── Tiny helpers ────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m === 1) return "1 minute ago";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.floor(m / 60);
  return h === 1 ? "1 hour ago" : `${h} hours ago`;
}
