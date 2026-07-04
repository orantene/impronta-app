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

import { useState, useEffect, useRef, useTransition, useMemo, useCallback } from "react";
import { useActionState } from "react";
import Image from "next/image";
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
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import { SearchTalentField } from "./SearchTalentField";

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
  /** Public card-thumbnail URL — renders the talent's face in the picker. */
  photoUrl?: string | null;
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
  /**
   * Lane B / B2 — bind the selected talent to the canonical inquiry cart
   * (`useInquiryCart`). When set, the drawer keeps `intent.talent.selected_ids`
   * in sync with the public-discovery `saved_talent` cart, and talent
   * chip-removal writes back to the cart. Used by the directory so a
   * shortlist built on the grid stays live inside the composer.
   */
  bindToInquiryCart?: boolean;
  /**
   * Optional tools rendered inside the Talent section, beside the
   * selected-talent chips — used by the directory to host its talent
   * quick-add search next to the chips it populates.
   */
  talentToolsSlot?: React.ReactNode;
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
  bindToInquiryCart = false,
  talentToolsSlot,
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
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  // ─ Inquiry-cart binding (B2 — directory shortlist ⟷ composer) ─────────────
  // `useInquiryCart` is provider-optional: on the client dashboard (no
  // PublicDiscoveryState) it is inert and the sync effect below no-ops.
  const cart = useInquiryCart();
  const cartKey = cart.cartIds.join(",");
  useEffect(() => {
    if (!bindToInquiryCart) return;
    setIntent((cur) => {
      const next = cartKey ? cartKey.split(",") : [];
      const curIds = cur.talent?.selected_ids ?? [];
      if (
        curIds.length === next.length
        && curIds.every((id, i) => id === next[i])
      ) {
        return cur;
      }
      return {
        ...cur,
        talent: {
          ...cur.talent,
          selected_ids: next,
          selection_mode: cur.talent?.selection_mode ?? "i_know_who",
        },
      };
    });
  }, [bindToInquiryCart, cartKey]);

  const removeTalentFromCart = bindToInquiryCart
    ? (id: string) =>
        cart.setInCart({ talentProfileId: id, profileCode: "" }, false)
    : undefined;

  // ─ Submit ────────────────────────────────────────────────────────────────
  const [submitState, submitFormAction, submitting] = useActionState<
    InquiryIntentActionState,
    FormData
  >(submitInquiryNowAction, { kind: "idle" });
  const submitted = submitState.kind === "submitted";

  // B2 — once the inquiry is submitted, empty the inquiry cart so the next
  // inquiry doesn't pre-load this one's now-consumed shortlist. Runs once.
  const cartClearedRef = useRef(false);
  useEffect(() => {
    if (!bindToInquiryCart || !submitted || cartClearedRef.current) return;
    cartClearedRef.current = true;
    for (const id of cart.cartIds) {
      cart.setInCart({ talentProfileId: id, profileCode: "" }, false);
    }
  }, [bindToInquiryCart, submitted, cart]);

  // ─ Autosave (logged-in only) ──────────────────────────────────────────────
  const autosaveEnabled = (enableDraftAutosave ?? !!client?.user_id) && !!client?.user_id;
  const [saveState, saveAction] = useActionState<InquiryIntentActionState, FormData>(
    saveDraftAction,
    { kind: "idle" },
  );
  const [draftId, setDraftId] = useState<string | null>(null);
  const intentRef = useRef(intent);
  // Keep the ref current outside render — `triggerAutosave` reads the
  // latest intent from event/interval callbacks, never during render.
  useEffect(() => {
    intentRef.current = intent;
  });

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
  }, [autosaveEnabled, tenantSlug, draftId, saveAction, startAutosave]);

  // Periodic autosave + on-blur + on visibility change. Stops once the
  // inquiry is submitted so a post-submit tick can't spawn an orphan draft.
  useEffect(() => {
    if (!autosaveEnabled || submitted) return;
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
  }, [autosaveEnabled, submitted, triggerAutosave]);

  const validation = validateIntentForSubmit(intent);
  const canSubmit = validation.ok;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("intent", JSON.stringify(intent));
    stagedFiles.forEach((f) => fd.append("files[]", f));
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
              {submitted ? "Sent" : step === "compose" ? "New inquiry" : "Review & send"}
            </div>
            <h2 style={{ margin: "3px 0 0", fontSize: 19, fontWeight: 600, color: C.ink, letterSpacing: -0.1, fontFamily: FONT_DISPLAY }}>
              {submitted
                ? "Inquiry sent"
                : step === "compose"
                  ? "Start a new project"
                  : "Looks good, ready to send?"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.inkMuted, maxWidth: 520, lineHeight: 1.45 }}>
              {submitted
                ? <>Your request is with <strong>{agencyName}</strong>.</>
                : step === "compose"
                  ? <>Tell <strong>{agencyName}</strong> what you need. We&apos;ll match talent + draft an offer.</>
                  : <>One last check before <strong>{agencyName}</strong> picks this up.</>
              }
            </p>
            {autosaveEnabled && !submitted && (
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
          {submitState.kind === "submitted" ? (
            <SubmittedView state={submitState} agencyName={agencyName} />
          ) : step === "compose" ? (
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
              stagedFiles={stagedFiles}
              onStagedFiles={setStagedFiles}
              roster={roster}
              client={client}
              talentToolsSlot={talentToolsSlot}
              boundToCart={bindToInquiryCart}
              onRemoveTalent={removeTalentFromCart}
            />
          ) : (
            <Review intent={intent} agencyName={agencyName} stagedFiles={stagedFiles} />
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
            {submitted
              ? <>Thanks, {agencyName} will be in touch.</>
              : !canSubmit && step === "compose"
                ? <>Add at least <strong>your name</strong>, <strong>email or phone</strong>, and a <strong>brief</strong> to send.</>
                : submitState.kind === "error"
                  ? <span style={{ color: C.amber }}>{submitState.message}</span>
                  : <>By sending, you&apos;ll start a coordinator-led conversation with {agencyName}.</>
            }
          </div>
          <div style={{ display: "inline-flex", gap: 8, flexShrink: 0 }}>
            {submitted ? (
              <button type="button" onClick={onClose} style={primaryBtn(true)}>
                Done
              </button>
            ) : step === "compose" ? (
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
  stagedFiles: File[];
  onStagedFiles: (v: File[]) => void;
  roster: RosterLiteItem[];
  client: InquiryDrawerProps["client"];
  /** B2 — extra tools rendered inside the Talent section (directory quick-add). */
  talentToolsSlot?: React.ReactNode;
  /** B2 — selected talent is driven by the inquiry cart, not local edits. */
  boundToCart?: boolean;
  /** B2 — when cart-bound, removing a chip writes back to the cart. */
  onRemoveTalent?: (id: string) => void;
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
        boundToCart={props.boundToCart}
        onRemoveTalent={props.onRemoveTalent}
        toolsSlot={props.talentToolsSlot}
      />
      <BudgetSection
        value={intent.budget ?? {}}
        onChange={props.setBudget}
        talentCount={intent.talent?.selected_ids?.length ?? 0}
      />
      <BriefSection
        value={intent.brief ?? {}}
        onChange={props.setBrief}
        context={{
          talentNames: (intent.talent?.selected_ids ?? [])
            .map((id) => props.roster.find((r) => r.id === id)?.name ?? "")
            .filter(Boolean),
          eventLocation: [intent.location?.city, intent.location?.country]
            .filter(Boolean)
            .join(", "),
          eventDate: intent.date?.event_date ?? "",
          talentCount: intent.talent?.count_needed != null
            ? String(intent.talent.count_needed)
            : "",
        }}
      />
      <FilesLinksSection
        files={intent.files ?? []}
        links={intent.links ?? []}
        onFiles={props.setFiles}
        onLinks={props.setLinks}
        stagedFiles={props.stagedFiles}
        onStagedFiles={props.onStagedFiles}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Requester (spec §3)
// ─────────────────────────────────────────────────────────────────────────────

export function RequesterSection({
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
        Your contact info lets the agency follow up. You can set up a free account
        right after sending to track this inquiry.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Client / company / job (spec §4)
// ─────────────────────────────────────────────────────────────────────────────

export function ClientSection({
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
        <span><strong>Same as my profile</strong>, booking for me/my company</span>
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
// Section: Location (spec §5) — City autocomplete via /api/location-cities
// ─────────────────────────────────────────────────────────────────────────────

type CitySuggestion = {
  name_en: string;
  country_iso2: string;
  country_name_en: string;
  subtitle?: string | null;
};

export function CityAutocomplete({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (city: string, countryIso2: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Guard: onMouseDown on a suggestion fires before the input's onBlur.
  // Without this flag, onBlur would call onSelect(draft, "") and clobber
  // the country that handleSelect just set via onSelect(city, iso2).
  const justSelectedRef = useRef(false);

  // Sync external value changes (e.g. intent reset).
  useEffect(() => { setDraft(value); }, [value]);

  const fetchSuggestions = useCallback((q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    void fetch(`/api/location-cities?query=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        const list: CitySuggestion[] = (data.cities ?? []).slice(0, 6);
        setSuggestions(list);
        setOpen(list.length > 0);
      })
      .catch(() => { setSuggestions([]); setOpen(false); });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setDraft(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(q), 300);
  };

  const handleSelect = (s: CitySuggestion) => {
    justSelectedRef.current = true;
    setDraft(s.name_en);
    setSuggestions([]);
    setOpen(false);
    onSelect(s.name_en, s.country_iso2);
  };

  // Close on outside click; clear debounce on unmount.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={draft}
        onChange={handleChange}
        onBlur={() => {
          // If the user just clicked a suggestion, handleSelect already called
          // onSelect with the correct countryIso2 — skip the free-text flush
          // to avoid a second setState that would clobber the country.
          if (justSelectedRef.current) { justSelectedRef.current = false; return; }
          if (draft !== value) onSelect(draft, "");
        }}
        placeholder="e.g. Tulum"
        style={inputStyle}
      />
      {open && suggestions.length > 0 && (
        <ul style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          zIndex: 200, margin: 0, padding: "4px 0", listStyle: "none",
          background: "#fff", borderRadius: 8, border: `1px solid ${C.border}`,
          boxShadow: "0 4px 20px rgba(0,0,0,0.10)", fontFamily: FONT,
        }}>
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={() => handleSelect(s)}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 13, color: C.ink,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceAlt)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <span style={{ fontWeight: 500 }}>{s.name_en}</span>
              <span style={{ marginLeft: 6, fontSize: 11.5, color: C.inkMuted }}>
                {s.subtitle ?? s.country_name_en}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LocationSection({
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
          <CityAutocomplete
            value={value.city ?? ""}
            onSelect={(city, countryIso2) =>
              onChange({
                ...value,
                city,
                ...(countryIso2 ? { country: countryIso2 } : {}),
              })
            }
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

export function DateSection({
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
            placeholder="e.g. 2-4 hours · full day"
          />
        </Field>
      </FieldRow>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Selected talent (spec §7)
// ─────────────────────────────────────────────────────────────────────────────

export function TalentSection({
  value, onChange, roster, boundToCart = false, onRemoveTalent, toolsSlot,
}: {
  value: InquiryTalent;
  onChange: (v: InquiryTalent) => void;
  roster: RosterLiteItem[];
  /** B2 — selected talent mirrors the inquiry cart; manage it from there. */
  boundToCart?: boolean;
  /** B2 — cart-bound removal handler. */
  onRemoveTalent?: (id: string) => void;
  /** B2 — extra add-talent tools (directory quick-add) shown with the list. */
  toolsSlot?: React.ReactNode;
}) {
  const selected = value.selected_ids ?? [];
  const isAgencyMode = value.selection_mode === "agency_recommends" || selected.length === 0;

  const removeTalent = (id: string) => {
    if (boundToCart && onRemoveTalent) {
      onRemoveTalent(id);
      return;
    }
    onChange({ ...value, selected_ids: selected.filter((x) => x !== id) });
  };

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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 10,
            marginBottom: 10,
          }}
        >
          {selected.map((id) => {
            const r = roster.find((r) => r.id === id);
            const name = r?.name ?? "Talent";
            return (
              <div key={id} style={talentMiniCard}>
                <div style={talentMiniPhotoWrap}>
                  {r?.photoUrl ? (
                    <Image
                      src={r.photoUrl}
                      alt={name}
                      fill
                      sizes="160px"
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <div style={talentMiniFallback}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.inkDim} strokeWidth={1.5}>
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                      </svg>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={() => removeTalent(id)}
                    style={talentMiniRemove}
                  >
                    ×
                  </button>
                </div>
                <div style={{ padding: "7px 9px 9px" }}>
                  <div style={talentMiniName}>{name}</div>
                  {r?.primaryTypeLabel && (
                    <div style={talentMiniType}>{r.primaryTypeLabel}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!boundToCart && value.selection_mode === "i_know_who" && roster.length > 0 && (
        <FieldRow>
          <Field label="Add talent">
            <SearchTalentField
              roster={roster}
              selectedIds={selected}
              onAdd={(r) => {
                if (selected.includes(r.id)) return;
                onChange({ ...value, selected_ids: [...selected, r.id] });
              }}
            />
          </Field>
        </FieldRow>
      )}

      {/* B2 — caller-supplied add-talent tools (directory quick-add search),
          rendered right where the selected talent appears so adding a
          talent and seeing it land are in the same place. */}
      {toolsSlot && <div style={{ marginTop: 2 }}>{toolsSlot}</div>}

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

export function BudgetSection({
  value, onChange, talentCount,
}: {
  value: InquiryBudget;
  onChange: (v: InquiryBudget) => void;
  talentCount: number;
}) {
  const pref = value.preference ?? "agency_recommends";
  return (
    <Section title="Budget" subtitle="No need to guess, let the agency price it.">
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

type BriefContext = {
  talentNames: string[];
  eventLocation: string;
  eventDate: string;
  talentCount: string;
};

export function BriefSection({
  value, onChange, context,
}: {
  value: InquiryBrief;
  onChange: (v: InquiryBrief) => void;
  context: BriefContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);

  const hasText = (value.summary ?? "").trim().length > 20;

  const runAi = useCallback(async (action: "generate" | "polish") => {
    setAiState("loading");
    setAiError(null);
    try {
      const res = await fetch("/api/ai/inquiry-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          talentNames: context.talentNames,
          eventLocation: context.eventLocation,
          eventDate: context.eventDate,
          quantity: context.talentCount,
          currentMessage: value.summary ?? "",
        }),
      });
      const data = await res.json() as { draft?: string; error?: string };
      if (!res.ok || !data.draft) {
        setAiError(data.error ?? "Couldn't generate a draft right now.");
        setAiState("error");
        return;
      }
      onChange({ ...value, summary: data.draft });
      setAiState("idle");
    } catch {
      setAiError("Network error. Try again.");
      setAiState("error");
    }
  }, [context, value, onChange]);

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

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {!hasText && (
          <button
            type="button"
            disabled={aiState === "loading"}
            onClick={() => void runAi("generate")}
            style={{
              padding: "5px 10px",
              background: C.accentSoft,
              border: `1px solid rgba(29,78,216,0.18)`,
              borderRadius: 7,
              color: C.accent,
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: FONT,
              cursor: aiState === "loading" ? "not-allowed" : "pointer",
              opacity: aiState === "loading" ? 0.6 : 1,
            }}
          >
            {aiState === "loading" ? "Writing…" : "✦ Write a brief for me"}
          </button>
        )}
        {hasText && (
          <button
            type="button"
            disabled={aiState === "loading"}
            onClick={() => void runAi("polish")}
            style={{
              padding: "5px 10px",
              background: C.accentSoft,
              border: `1px solid rgba(29,78,216,0.18)`,
              borderRadius: 7,
              color: C.accent,
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: FONT,
              cursor: aiState === "loading" ? "not-allowed" : "pointer",
              opacity: aiState === "loading" ? 0.6 : 1,
            }}
          >
            {aiState === "loading" ? "Polishing…" : "✦ Polish this brief"}
          </button>
        )}
        {aiState === "error" && aiError && (
          <span style={{ fontSize: 11.5, color: C.amber }}>{aiError}</span>
        )}
      </div>

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

const FILE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB client-side guard
const FILE_MAX_COUNT = 10;
const FILE_ACCEPT = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";

export function FilesLinksSection({
  files, links, onFiles, onLinks, stagedFiles, onStagedFiles,
}: {
  files: InquiryAttachment[];
  links: string[];
  onFiles: (v: InquiryAttachment[] | undefined) => void;
  onLinks: (v: string[] | undefined) => void;
  stagedFiles: File[];
  onStagedFiles: (v: File[]) => void;
}) {
  const [linkDraft, setLinkDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileWarning, setFileWarning] = useState<string | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    const combined = [...stagedFiles, ...picked];
    const oversized = picked.filter((f) => f.size > FILE_MAX_BYTES);
    if (oversized.length > 0) {
      setFileWarning(`${oversized.map((f) => f.name).join(", ")} ${oversized.length === 1 ? "is" : "are"} over 20 MB and won't be uploaded.`);
    } else {
      setFileWarning(null);
    }
    const valid = combined.filter((f) => f.size <= FILE_MAX_BYTES).slice(0, FILE_MAX_COUNT);
    onStagedFiles(valid);
    // Reset so the same file can be re-selected after removal.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [stagedFiles, onStagedFiles]);

  const removeFile = useCallback((idx: number) => {
    onStagedFiles(stagedFiles.filter((_, i) => i !== idx));
  }, [stagedFiles, onStagedFiles]);

  void files; void onFiles; // reserved for post-submit attachment display

  return (
    <Section title="Files & references" subtitle="Optional. Moodboards, briefs, reference posts.">
      {/* File picker */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          onChange={handleFileChange}
          style={{ display: "none" }}
          aria-label="Attach files"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={stagedFiles.length >= FILE_MAX_COUNT}
          style={{
            ...ghostBtn,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            opacity: stagedFiles.length >= FILE_MAX_COUNT ? 0.5 : 1,
          }}
        >
          <span style={{ fontSize: 14 }}>📎</span>
          Attach files
        </button>
        <span style={{ marginLeft: 8, fontSize: 11, color: C.inkDim }}>
          PDF, images, docs, up to 20 MB each, {FILE_MAX_COUNT} max
        </span>
      </div>

      {stagedFiles.length > 0 && (
        <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {stagedFiles.map((f, i) => (
            <li
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: C.surfaceAlt, borderRadius: 6,
                padding: "6px 10px", fontSize: 12.5, color: C.ink,
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <span style={{ fontSize: 11, color: C.inkMuted, flexShrink: 0 }}>{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.name}`}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: C.inkMuted, fontSize: 14, lineHeight: 1, padding: "0 2px" }}
              >×</button>
            </li>
          ))}
        </ul>
      )}

      {fileWarning && (
        <div style={{ fontSize: 11.5, color: C.amber, marginTop: 2 }}>{fileWarning}</div>
      )}

      {/* Reference links */}
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
        <ul style={{ margin: "2px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
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
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Review step
// ─────────────────────────────────────────────────────────────────────────────

function Review({ intent, agencyName, stagedFiles }: { intent: InquiryIntent; agencyName: string; stagedFiles: File[] }) {
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
      {(stagedFiles.length > 0 || (intent.links ?? []).length > 0) && (
        <ReviewRow label="References">
          {stagedFiles.length > 0 && (
            <span>{stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""} attached</span>
          )}
          {stagedFiles.length > 0 && (intent.links ?? []).length > 0 && (
            <span style={{ color: C.inkMuted }}> · </span>
          )}
          {(intent.links ?? []).length > 0 && (
            <span style={{ color: C.inkMuted }}>{(intent.links ?? []).length} link{(intent.links ?? []).length !== 1 ? "s" : ""}</span>
          )}
        </ReviewRow>
      )}
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
// Submitted step — in-drawer confirmation (works for guest + authed client).
// ─────────────────────────────────────────────────────────────────────────────

type SubmittedState = Extract<InquiryIntentActionState, { kind: "submitted" }>;

function SubmittedView({
  state, agencyName,
}: {
  state: SubmittedState;
  agencyName: string;
}) {
  const messagesHref =
    `/${state.tenantSlug}/client/messages`
    + `?inquiry=${encodeURIComponent(state.inquiryId)}&just_submitted=1`;

  // Guest follow-up CTA. The route is activation-dependent so the visitor
  // never lands on a dead end:
  //  • created  → a fresh account with no password yet → set-password flow.
  //  • matched  → an existing account → password sign-in.
  //  • unlinked → no account was linked → let them register.
  const guestEmailQuery = state.guestEmail
    ? `?email=${encodeURIComponent(state.guestEmail)}`
    : "";
  const guestCta =
    state.guestActivation === "matched"
      ? { href: `/login${guestEmailQuery}`, label: "Sign in to track" }
      : state.guestActivation === "created"
        ? {
            href: `/forgot-password${guestEmailQuery}`,
            label: "Set a password to track",
          }
        : { href: `/register${guestEmailQuery}`, label: "Create an account" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 14,
        padding: "28px 12px",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          background: C.successSoft,
          color: C.success,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
        }}
      >
        ✓
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, fontFamily: FONT_DISPLAY }}>
          Your inquiry is on its way
        </div>
        <p style={{ margin: "6px auto 0", fontSize: 13, color: C.inkMuted, maxWidth: 380, lineHeight: 1.5 }}>
          {agencyName} has it now. A coordinator will review your brief, match
          talent, and reply with an offer. No commitment until you approve it.
        </p>
      </div>

      {state.isGuest ? (
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: C.card,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 10,
            padding: "14px 16px",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            {state.guestActivation === "matched"
              ? "We found your account"
              : state.guestActivation === "created"
                ? "We set up an account for you"
                : "Track this inquiry"}
          </div>
          <p style={{ margin: "5px 0 0", fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>
            {state.guestActivation === "created" ? (
              <>
                We started a free account for{" "}
                {state.guestEmail ? <strong>{state.guestEmail}</strong> : "you"}.
                Set a password to follow this inquiry. Offers, messages, and
                updates all land in one place.
              </>
            ) : state.guestActivation === "matched" ? (
              <>
                Sign in
                {state.guestEmail ? <> with <strong>{state.guestEmail}</strong></> : ""}{" "}
                to follow this inquiry. Offers, messages, and updates all land
                in one place.
              </>
            ) : (
              <>
                Create a free account
                {state.guestEmail ? <> with <strong>{state.guestEmail}</strong></> : ""}{" "}
                to follow this inquiry. Offers, messages, and updates all land
                in one place.
              </>
            )}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <a href={guestCta.href} style={primaryLinkStyle}>
              {guestCta.label}
            </a>
          </div>
        </div>
      ) : (
        <a href={messagesHref} style={primaryLinkStyle}>
          View in Messages
        </a>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="iq-field-row">{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: FONT, gridColumn: "1 / -1" }}>
      <span style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600, letterSpacing: 0.2 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: C.inkDim }}>{hint}</span>}
    </label>
  );
}

export function Input({
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

export function Textarea({
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

export function Select({
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

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

/** primaryBtn rendered as an <a> — used by the submitted-step CTAs. */
const primaryLinkStyle: React.CSSProperties = {
  ...primaryBtn(true),
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
};

// ─── Talent mini-card (selected-talent grid) ─────────────────────────────────
const talentMiniCard: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 12,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const talentMiniPhotoWrap: React.CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "4 / 5",
  background: C.surfaceAlt,
};

const talentMiniFallback: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(160deg, #F2F1EC, #E7E6DE)",
};

const talentMiniRemove: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  width: 22,
  height: 22,
  borderRadius: 999,
  border: "none",
  background: "rgba(11,11,13,0.55)",
  color: "#fff",
  fontSize: 14,
  lineHeight: 1,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const talentMiniName: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: C.ink,
  fontFamily: FONT,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const talentMiniType: React.CSSProperties = {
  fontSize: 11,
  color: C.inkMuted,
  fontFamily: FONT,
  marginTop: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
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

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// InquiryDrawerShell — reusable overlay + slide-in panel used by both the
// full composer and the auxiliary states (loading / paused / unconfigured).
// ─────────────────────────────────────────────────────────────────────────────

export function InquiryDrawerShell({
  label,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  label?: string;
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", justifyContent: "flex-end",
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
          display: "flex", flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.18)",
          fontFamily: FONT,
          animation: "iq-drawer-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <style dangerouslySetInnerHTML={{ __html: keyframesCSS }} />
        <header
          style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            padding: "16px 22px", borderBottom: `1px solid ${C.borderSoft}`,
            background: "#fff", flexShrink: 0,
          }}
        >
          <div className="flex-1 min-w-0">
            {label && (
              <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
                {label}
              </div>
            )}
            <h2 style={{ margin: label ? "3px 0 0" : 0, fontSize: 19, fontWeight: 600, color: C.ink, letterSpacing: -0.1, fontFamily: FONT_DISPLAY }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.inkMuted, maxWidth: 520, lineHeight: 1.45 }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: `1px solid ${C.borderSoft}`,
              background: "transparent", color: C.ink, fontSize: 16,
              cursor: "pointer", display: "inline-flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0,
            }}
          >
            ×
          </button>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 24px" }}>
          {children}
        </div>
        {footer && (
          <footer
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, padding: "12px 22px",
              borderTop: `1px solid ${C.borderSoft}`,
              background: "#fff", flexShrink: 0,
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
