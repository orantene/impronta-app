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
import {
  uploadInquirySubmitAttachments,
  type InquirySubmitAttachmentResult,
} from "@/lib/client/signed-upload";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { SearchTalentField } from "./SearchTalentField";
import { SlotPicker, type SlotPickerValue } from "@/components/public-booking/SlotPicker";
import {
  applyReservationToIntent,
  type ReservationStamp,
} from "@/lib/scheduling/reservation-intent";
import type { BookableOffering } from "@/components/public-booking/pick-bookable-offering";

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
  /**
   * Does this workspace REPRESENT PEOPLE?
   *
   * False for a restaurant, a salon, a clinic — every preset where
   * `presetRepresentsPeople` is false. When false the Talent and Budget
   * sections are not rendered at all, and the remaining copy drops its casting
   * vocabulary.
   *
   * Measured on El Paisa in production: a diner who clicked "Reserve" was shown
   * "Start a new project — we'll match talent and draft an offer", asked for a
   * "Job name", the "end client", "how many talent", "type of talent" and what
   * "talent brings" versus what the client provides. 38 of this drawer's 194
   * strings are casting-shaped, and rewording them is not the fix: a diner does
   * not need "how many talent" phrased better, they need it absent.
   *
   * DEFAULTS TO TRUE, so every existing mount — the agency workspace, the
   * client area, the directory of a real talent agency — behaves exactly as it
   * does today. Only a caller that KNOWS the workspace represents nobody turns
   * it off.
   */
  representsPeople?: boolean;
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
  /**
   * When the offering resolves bookable, Compose swaps the date picker for
   * SlotPicker and hides event-only sections (budget / brief / wardrobe).
   */
  bookableOffering?: BookableOffering | null;
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
  representsPeople,
  bookableOffering = null,
  onClose,
}: InquiryDrawerProps) {
  const t = useT();
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

  useEffect(() => {
    if (!bookableOffering?.locationLabel) return;
    const city = bookableOffering.locationLabel;
    setIntent((cur) => {
      if (cur.location?.city === city) return cur;
      return { ...cur, location: { ...cur.location, city, status: "confirmed" } };
    });
  }, [bookableOffering?.locationLabel]);

  const applySlot = useCallback((value: SlotPickerValue | null) => {
    if (!bookableOffering) return;
    setIntent((cur) => {
      if (!value) {
        const nextCtx = { ...(cur.source_context ?? {}) };
        delete nextCtx.reservation;
        return { ...cur, source_context: nextCtx };
      }
      const stamp: ReservationStamp = {
        v: 1,
        offering_id: bookableOffering.offeringId,
        starts_at: value.startsAt,
        ends_at: value.endsAt,
        timezone: value.timezone,
        duration_minutes: bookableOffering.durationMinutes,
        mode: "request",
      };
      return applyReservationToIntent(cur, stamp);
    });
  }, [bookableOffering]);

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

  // T4 — attachment upload, phase 2. The inquiry exists by now, so each
  // file goes browser → storage over its own signed URL (no Server Action
  // body cap) and gets its own reported outcome. Previously a failed file
  // was `continue`d server-side and the user was told everything sent.
  const [attachmentPhase, setAttachmentPhase] = useState<
    | { kind: "idle" }
    | { kind: "uploading"; done: number; total: number }
    | { kind: "done"; uploaded: number; failed: InquirySubmitAttachmentResult[] }
  >({ kind: "idle" });
  const attachmentsStartedRef = useRef(false);
  const submittedInquiryId =
    submitState.kind === "submitted" ? submitState.inquiryId : null;
  useEffect(() => {
    if (!submittedInquiryId || attachmentsStartedRef.current) return;
    if (stagedFiles.length === 0) return;
    attachmentsStartedRef.current = true;
    const files = stagedFiles;
    setAttachmentPhase({ kind: "uploading", done: 0, total: files.length });
    void (async () => {
      const results = await uploadInquirySubmitAttachments({
        tenantSlug,
        inquiryId: submittedInquiryId,
        files,
        onFileDone: (done, total) =>
          setAttachmentPhase({ kind: "uploading", done, total }),
      });
      setAttachmentPhase({
        kind: "done",
        uploaded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok),
      });
    })();
  }, [submittedInquiryId, stagedFiles, tenantSlug]);

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
    // T4 — the binaries deliberately do NOT ride this FormData any more.
    // A Server Action body caps at ~4 MB, so appending a single phone photo
    // failed the whole inquiry submit. Files go up separately, against the
    // created inquiry id, in the effect below.
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
      aria-label={t("public.inquiryDrawer.dialogAria")}
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
              {submitted
                ? t("public.inquiryDrawer.eyebrowSent")
                : step === "compose"
                  ? t("public.inquiryDrawer.eyebrowCompose")
                  : t("public.inquiryDrawer.eyebrowReview")}
            </div>
              <h2 style={{ margin: "3px 0 0", fontSize: 19, fontWeight: 600, color: C.ink, letterSpacing: -0.1, fontFamily: FONT_DISPLAY }}>
              {submitted
                ? t("public.inquiryDrawer.titleSent")
                : step === "compose"
                  ? t(bookableOffering
                    ? "public.inquiryDrawer.titleComposeAppointment"
                    : representsPeople === false
                      ? "public.inquiryDrawer.titleComposeGeneric"
                      : "public.inquiryDrawer.titleCompose")
                  : t("public.inquiryDrawer.titleReview")}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.inkMuted, maxWidth: 520, lineHeight: 1.45 }}>
              {submitted
                ? interpolate(t("public.inquiryDrawer.leadSent"), { agency: agencyName })
                : step === "compose"
                  ? interpolate(
                      t(bookableOffering
                        ? "public.inquiryDrawer.leadComposeAppointment"
                        : representsPeople === false
                          ? "public.inquiryDrawer.leadComposeGeneric"
                          : "public.inquiryDrawer.leadCompose"),
                      { agency: agencyName },
                    )
                  : interpolate(t("public.inquiryDrawer.leadReview"), { agency: agencyName })
              }
            </p>
            {autosaveEnabled && !submitted && (
              <div style={{ marginTop: 8, fontSize: 11, color: saveState.kind === "saved" ? C.success : C.inkDim }}>
                {saveState.kind === "saved"
                  ? interpolate(t("public.inquiryDrawer.draftSaved"), { when: formatRelative(saveState.savedAt, t) })
                  : t("public.inquiryDrawer.draftWillSave")}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("public.inquiryDrawer.closeAria")}
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
            <>
              <SubmittedView state={submitState} agencyName={agencyName} />
              <AttachmentStatus phase={attachmentPhase} />
            </>
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
              representsPeople={representsPeople}
              talentToolsSlot={talentToolsSlot}
              boundToCart={bindToInquiryCart}
              onRemoveTalent={removeTalentFromCart}
              bookableOffering={bookableOffering}
              onSlotChange={applySlot}
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
              ? interpolate(t("public.inquiryDrawer.footerSent"), { agency: agencyName })
              : !canSubmit && step === "compose"
                ? t("public.inquiryDrawer.footerNeedMore")
                : submitState.kind === "error"
                  ? <span style={{ color: C.amber }}>{submitState.message}</span>
                  : interpolate(t("public.inquiryDrawer.footerReady"), { agency: agencyName })
            }
          </div>
          <div style={{ display: "inline-flex", gap: 8, flexShrink: 0 }}>
            {submitted ? (
              <button type="button" onClick={onClose} style={primaryBtn(true)}>
                {t("public.inquiryDrawer.btnDone")}
              </button>
            ) : step === "compose" ? (
              <button
                type="button"
                onClick={() => setStep("review")}
                disabled={!canSubmit}
                style={primaryBtn(canSubmit)}
              >
                {t("public.inquiryDrawer.btnReview")}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setStep("compose")} style={ghostBtn}>
                  {t("public.inquiryDrawer.btnEdit")}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !canSubmit}
                  style={primaryBtn(!submitting && canSubmit)}
                >
                  {submitting ? t("public.inquiryDrawer.btnSending") : t("public.inquiryDrawer.btnSend")}
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
  bookableOffering?: BookableOffering | null;
  onSlotChange?: (value: SlotPickerValue | null) => void;
  /** See `InquiryDrawerProps.representsPeople`. Defaults to true. */
  representsPeople?: boolean;
}) {
  const { intent, bookableOffering } = props;
  // Defaulting HERE rather than at every call site: an existing caller that
  // says nothing keeps today's behaviour, which is what every agency mount is.
  const representsPeople = props.representsPeople !== false;
  const reservation = intent.source_context?.reservation as
    | { starts_at?: string; ends_at?: string; timezone?: string }
    | undefined;
  const slotValue: SlotPickerValue | null =
    reservation?.starts_at && reservation.ends_at && reservation.timezone
      ? {
          startsAt: reservation.starts_at,
          endsAt: reservation.ends_at,
          timezone: reservation.timezone,
        }
      : null;
  return (
    <div className="flex flex-col gap-4">
      <RequesterSection
        value={intent.requester}
        onChange={props.setRequester}
        client={props.client}
      />
      <ClientSection
        representsPeople={representsPeople}
        requester={intent.requester}
        value={intent.client ?? {}}
        onChange={props.setClient}
      />
      {bookableOffering ? (
        <SlotPicker
          offeringId={bookableOffering.offeringId}
          durationMinutes={bookableOffering.durationMinutes}
          timezone={bookableOffering.timezone}
          value={slotValue}
          onChange={(next) => props.onSlotChange?.(next)}
        />
      ) : (
        <>
          <LocationSection value={intent.location ?? {}} onChange={props.setLocation} />
          <DateSection value={intent.date ?? {}} onChange={props.setDate} />
        </>
      )}
      {/* A workspace that represents nobody has no roster to pick from and no
          per-talent rate to quote, so these two sections are absent rather
          than reworded. Ruled by the CEO after El Paisa showed a diner a
          casting brief. */}
      {representsPeople ? (
        <TalentSection
          value={intent.talent ?? {}}
          onChange={props.setTalent}
          roster={props.roster}
          boundToCart={props.boundToCart}
          onRemoveTalent={props.onRemoveTalent}
          toolsSlot={props.talentToolsSlot}
        />
      ) : null}
      {bookableOffering ? null : (
        <>
      {representsPeople ? (
        <BudgetSection
          value={intent.budget ?? {}}
          onChange={props.setBudget}
          talentCount={intent.talent?.selected_ids?.length ?? 0}
        />
      ) : null}
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
        </>
      )}
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
  const t = useT();
  const isLoggedIn = !!client?.user_id;
  return (
    <Section title={t("public.inquiryDrawer.requesterTitle")} subtitle={t("public.inquiryDrawer.requesterSubtitle")}>
      {/* Trust card — always shown, content differs by state */}
      <TrustCard isLoggedIn={isLoggedIn} client={client} />

      <FieldRow>
        <Field label={t("public.inquiryDrawer.requesterName")}>
          <Input value={value.name ?? ""} onChange={(v) => onChange({ ...value, name: v })} placeholder={t("public.inquiryDrawer.requesterNamePlaceholder")} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("public.inquiryDrawer.requesterEmail")}>
          <Input type="email" value={value.email ?? ""} onChange={(v) => onChange({ ...value, email: v })} placeholder={t("public.inquiryDrawer.requesterEmailPlaceholder")} />
        </Field>
        <Field label={t("public.inquiryDrawer.requesterPhone")}>
          <Input type="tel" value={value.phone ?? ""} onChange={(v) => onChange({ ...value, phone: v })} placeholder={t("public.inquiryDrawer.requesterPhonePlaceholder")} />
        </Field>
      </FieldRow>
    </Section>
  );
}

function TrustCard({ isLoggedIn, client }: { isLoggedIn: boolean; client: InquiryDrawerProps["client"] }) {
  const t = useT();
  if (isLoggedIn) {
    const bookings = client?.previous_bookings_count ?? 0;
    return (
      <div style={trustCardStyle(C.successSoft, C.success)}>
        <div className="font-bold">{t("public.inquiryDrawer.trustLoggedInTitle")}</div>
        <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", fontSize: 12, color: C.inkMuted, lineHeight: 1.6 }}>
          <li>✓ {t("public.inquiryDrawer.trustVerifiedEmail")}</li>
          {client?.member_since && <li>{interpolate(t("public.inquiryDrawer.trustMemberSince"), { date: client.member_since })}</li>}
          <li>{interpolate(t("public.inquiryDrawer.trustLevel"), { level: client?.trust_level ?? "basic" })}</li>
          {bookings > 0 && (
            <li>
              {interpolate(
                t(bookings === 1 ? "public.inquiryDrawer.trustBookingsOne" : "public.inquiryDrawer.trustBookingsOther"),
                { count: bookings },
              )}
            </li>
          )}
        </ul>
      </div>
    );
  }
  return (
    <div style={trustCardStyle(C.amberSoft, C.amber)}>
      <div className="font-bold">{t("public.inquiryDrawer.trustNewTitle")}</div>
      <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
        {t("public.inquiryDrawer.trustNewBody")}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Client / company / job (spec §4)
// ─────────────────────────────────────────────────────────────────────────────

export function ClientSection({
  requester, value, onChange, representsPeople = true,
}: {
  requester: InquiryRequester;
  value: InquiryClient;
  onChange: (v: InquiryClient) => void;
  /** See `InquiryDrawerProps.representsPeople`. */
  representsPeople?: boolean;
}) {
  const t = useT();
  const sameAsRequester = value.same_as_requester !== false; // default checked
  return (
    <Section
      title={t("public.inquiryDrawer.clientTitle")}
      subtitle={t(
        representsPeople
          ? "public.inquiryDrawer.clientSubtitle"
          : "public.inquiryDrawer.clientSubtitleGeneric",
      )}
    >
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
        <span>{t("public.inquiryDrawer.clientSameAsProfile")}</span>
      </label>

      {!sameAsRequester && (
        <>
          <FieldRow>
            <Field label={t("public.inquiryDrawer.clientNameLabel")}>
              <Input value={value.name ?? ""} onChange={(v) => onChange({ ...value, name: v })} placeholder={t("public.inquiryDrawer.clientNamePlaceholder")} />
            </Field>
            <Field label={t("public.inquiryDrawer.clientCompanyLabel")}>
              <Input value={value.company ?? ""} onChange={(v) => onChange({ ...value, company: v })} placeholder={t("public.inquiryDrawer.clientCompanyPlaceholder")} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label={t("public.inquiryDrawer.clientBookingForLabel")}>
              <Select
                value={value.booking_for ?? "another_client"}
                onChange={(v) => onChange({ ...value, booking_for: v as InquiryClient["booking_for"] })}
                options={[
                  { value: "myself", label: t("public.inquiryDrawer.clientBookingForMyself") },
                  { value: "my_company", label: t("public.inquiryDrawer.clientBookingForMyCompany") },
                  { value: "another_client", label: t("public.inquiryDrawer.clientBookingForAnother") },
                  { value: "brand", label: t("public.inquiryDrawer.clientBookingForBrand") },
                  { value: "venue", label: t("public.inquiryDrawer.clientBookingForVenue") },
                  { value: "agency_client", label: t("public.inquiryDrawer.clientBookingForAgency") },
                ]}
              />
            </Field>
          </FieldRow>
        </>
      )}

      {/* "Job name" and "a short title for this project" are casting words.
          A diner booking a table has no job, so this is absent rather than
          reworded — the same rule as the Talent and Budget sections. */}
      {representsPeople ? (
        <FieldRow>
          <Field label={t("public.inquiryDrawer.clientJobNameLabel")} hint={t("public.inquiryDrawer.clientJobNameHint")}>
            <Input
              value={value.job_name ?? ""}
              onChange={(v) => onChange({ ...value, job_name: v })}
              placeholder={interpolate(t("public.inquiryDrawer.clientJobNamePlaceholder"), {
                name: requester.name?.split(" ")[0] ?? t("public.inquiryDrawer.clientJobNameFallback"),
              })}
            />
          </Field>
        </FieldRow>
      ) : null}
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
  const t = useT();
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
        placeholder={t("public.inquiryDrawer.cityPlaceholder")}
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
  const t = useT();
  return (
    <Section title={t("public.inquiryDrawer.locationTitle")} subtitle={t("public.inquiryDrawer.locationSubtitle")}>
      <FieldRow>
        <Field label={t("public.inquiryDrawer.locationVenueLabel")}>
          <Input
            value={value.venue_name ?? ""}
            onChange={(v) => onChange({ ...value, venue_name: v })}
            placeholder={t("public.inquiryDrawer.locationVenuePlaceholder")}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("public.inquiryDrawer.locationCityLabel")}>
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
        <Field label={t("public.inquiryDrawer.locationCountryLabel")}>
          <Input
            value={value.country ?? ""}
            onChange={(v) => onChange({ ...value, country: v })}
            placeholder={t("public.inquiryDrawer.locationCountryPlaceholder")}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("public.inquiryDrawer.locationStatusLabel")}>
          <Select
            value={value.status ?? "unconfirmed"}
            onChange={(v) => onChange({ ...value, status: v as InquiryLocation["status"] })}
            options={[
              { value: "confirmed", label: t("public.inquiryDrawer.locationStatusConfirmed") },
              { value: "unconfirmed", label: t("public.inquiryDrawer.locationStatusUnconfirmed") },
              { value: "online", label: t("public.inquiryDrawer.locationStatusOnline") },
              { value: "not_sure", label: t("public.inquiryDrawer.locationStatusNotSure") },
            ]}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("public.inquiryDrawer.locationNotesLabel")}>
          <Textarea
            rows={2}
            value={value.notes ?? ""}
            onChange={(v) => onChange({ ...value, notes: v })}
            placeholder={t("public.inquiryDrawer.locationNotesPlaceholder")}
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
  const t = useT();
  return (
    <Section title={t("public.inquiryDrawer.dateTitle")} subtitle={t("public.inquiryDrawer.dateSubtitle")}>
      <FieldRow>
        <Field label={t("public.inquiryDrawer.dateStatusLabel")}>
          <Select
            value={value.status ?? "exact"}
            onChange={(v) => onChange({ ...value, status: v as InquiryDate["status"] })}
            options={[
              { value: "exact", label: t("public.inquiryDrawer.dateStatusExact") },
              { value: "flexible", label: t("public.inquiryDrawer.dateStatusFlexible") },
              { value: "not_sure", label: t("public.inquiryDrawer.dateStatusNotSure") },
              { value: "multi_day", label: t("public.inquiryDrawer.dateStatusMultiDay") },
              { value: "recurring", label: t("public.inquiryDrawer.dateStatusRecurring") },
            ]}
          />
        </Field>
        <Field label={t("public.inquiryDrawer.dateEventDateLabel")}>
          <Input
            type="date"
            value={value.event_date ?? ""}
            onChange={(v) => onChange({ ...value, event_date: v })}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("public.inquiryDrawer.dateStartTimeLabel")}>
          <Input
            type="time"
            value={value.start_time ?? ""}
            onChange={(v) => onChange({ ...value, start_time: v })}
          />
        </Field>
        <Field label={t("public.inquiryDrawer.dateDurationLabel")}>
          <Input
            value={value.duration ?? ""}
            onChange={(v) => onChange({ ...value, duration: v })}
            placeholder={t("public.inquiryDrawer.dateDurationPlaceholder")}
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
  const t = useT();
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
    <Section title={t("public.inquiryDrawer.talentTitle")} subtitle={t("public.inquiryDrawer.talentSubtitle")}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <Pill
          active={value.selection_mode !== "i_know_who"}
          onClick={() => onChange({ ...value, selection_mode: "agency_recommends" })}
        >
          {t("public.inquiryDrawer.talentModeRecommend")}
        </Pill>
        <Pill
          active={value.selection_mode === "i_know_who"}
          onClick={() => onChange({ ...value, selection_mode: "i_know_who" })}
        >
          {t("public.inquiryDrawer.talentModeIKnow")}
        </Pill>
        <Pill
          active={value.selection_mode === "similar_to_past"}
          onClick={() => onChange({ ...value, selection_mode: "similar_to_past" })}
        >
          {t("public.inquiryDrawer.talentModeSimilar")}
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
            const name = r?.name ?? t("public.inquiryDrawer.talentFallbackName");
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
                    aria-label={interpolate(t("public.inquiryDrawer.talentRemoveAria"), { name })}
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
          <Field label={t("public.inquiryDrawer.talentAddLabel")}>
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
          <Field label={t("public.inquiryDrawer.talentCountLabel")}>
            <Input
              type="number"
              value={value.count_needed?.toString() ?? ""}
              onChange={(v) => onChange({ ...value, count_needed: v ? parseInt(v, 10) : undefined })}
              placeholder={t("public.inquiryDrawer.talentCountPlaceholder")}
            />
          </Field>
          <Field label={t("public.inquiryDrawer.talentTypeLabel")}>
            <Input
              value={value.notes ?? ""}
              onChange={(v) => onChange({ ...value, notes: v })}
              placeholder={t("public.inquiryDrawer.talentTypePlaceholder")}
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
  const t = useT();
  const pref = value.preference ?? "agency_recommends";
  const amountLabelKey =
    pref === "total_budget"
      ? "public.inquiryDrawer.budgetAroundLabel"
      : pref === "per_hour"
        ? "public.inquiryDrawer.budgetPerHourLabel"
        : pref === "per_day"
          ? "public.inquiryDrawer.budgetPerDayLabel"
          : pref === "per_week"
            ? "public.inquiryDrawer.budgetPerWeekLabel"
            : pref === "per_contract"
              ? "public.inquiryDrawer.budgetPerContractLabel"
              : "public.inquiryDrawer.budgetPerTalentLabel";
  return (
    <Section title={t("public.inquiryDrawer.budgetTitle")} subtitle={t("public.inquiryDrawer.budgetSubtitle")}>
      <FieldRow>
        <Field label={t("public.inquiryDrawer.budgetPreferenceLabel")}>
          <Select
            value={pref}
            onChange={(v) => onChange({ ...value, preference: v as InquiryBudget["preference"] })}
            options={[
              { value: "agency_recommends", label: t("public.inquiryDrawer.budgetPrefRecommend") },
              { value: "total_budget", label: t("public.inquiryDrawer.budgetPrefTotal") },
              { value: "per_hour", label: t("public.inquiryDrawer.budgetPrefPerHour") },
              { value: "per_day", label: t("public.inquiryDrawer.budgetPrefPerDay") },
              { value: "per_week", label: t("public.inquiryDrawer.budgetPrefPerWeek") },
              { value: "per_contract", label: t("public.inquiryDrawer.budgetPrefPerContract") },
              { value: "per_talent", label: t("public.inquiryDrawer.budgetPrefPerTalent") },
              { value: "not_sure", label: t("public.inquiryDrawer.budgetPrefNotSure") },
            ]}
          />
        </Field>
      </FieldRow>

      {(pref === "total_budget" || pref === "per_hour" || pref === "per_day" || pref === "per_week" || pref === "per_contract" || pref === "per_talent") && (
        <FieldRow>
          <Field label={t(amountLabelKey)}>
            <Input
              type="number"
              value={value.amount?.toString() ?? ""}
              onChange={(v) => onChange({ ...value, amount: v ? parseFloat(v) : undefined })}
              placeholder="$"
            />
          </Field>
          <Field label={t("public.inquiryDrawer.budgetCurrencyLabel")}>
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
          {interpolate(t("public.inquiryDrawer.budgetHint"), { count: talentCount })}
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
  const t = useT();
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
        setAiError(data.error ?? t("public.inquiryDrawer.briefAiErrorGenerate"));
        setAiState("error");
        return;
      }
      onChange({ ...value, summary: data.draft });
      setAiState("idle");
    } catch {
      setAiError(t("public.inquiryDrawer.briefAiErrorNetwork"));
      setAiState("error");
    }
  }, [context, value, onChange, t]);

  return (
    <Section title={t("public.inquiryDrawer.briefTitle")} subtitle={t("public.inquiryDrawer.briefSubtitle")}>
      <FieldRow>
        <Field label={t("public.inquiryDrawer.briefSummaryLabel")}>
          <Textarea
            rows={4}
            value={value.summary ?? ""}
            onChange={(v) => onChange({ ...value, summary: v })}
            placeholder={t("public.inquiryDrawer.briefSummaryPlaceholder")}
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
            {aiState === "loading" ? t("public.inquiryDrawer.briefAiGenerating") : t("public.inquiryDrawer.briefAiGenerate")}
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
            {aiState === "loading" ? t("public.inquiryDrawer.briefAiPolishing") : t("public.inquiryDrawer.briefAiPolish")}
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
        {expanded ? t("public.inquiryDrawer.briefHideAdvanced") : t("public.inquiryDrawer.briefShowAdvanced")}
      </button>

      {expanded && (
        <>
          <FieldRow>
            <Field label={t("public.inquiryDrawer.briefRoleLabel")}>
              <Textarea
                rows={2}
                value={(value.role_expectations ?? []).join(", ")}
                onChange={(v) => onChange({ ...value, role_expectations: v.split(",").map(s => s.trim()).filter(Boolean) })}
                placeholder={t("public.inquiryDrawer.briefRolePlaceholder")}
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label={t("public.inquiryDrawer.briefWardrobeLabel")}>
              <Input value={value.wardrobe_notes ?? ""} onChange={(v) => onChange({ ...value, wardrobe_notes: v })} placeholder={t("public.inquiryDrawer.briefWardrobePlaceholder")} />
            </Field>
            <Field label={t("public.inquiryDrawer.briefEquipmentLabel")}>
              <Input value={value.equipment_notes ?? ""} onChange={(v) => onChange({ ...value, equipment_notes: v })} placeholder={t("public.inquiryDrawer.briefEquipmentPlaceholder")} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label={t("public.inquiryDrawer.briefMediaLabel")}>
              <Input value={value.media_usage ?? ""} onChange={(v) => onChange({ ...value, media_usage: v })} placeholder={t("public.inquiryDrawer.briefMediaPlaceholder")} />
            </Field>
            <Field label={t("public.inquiryDrawer.briefTravelLabel")}>
              <Input value={value.travel_notes ?? ""} onChange={(v) => onChange({ ...value, travel_notes: v })} placeholder={t("public.inquiryDrawer.briefTravelPlaceholder")} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label={t("public.inquiryDrawer.briefSpecialLabel")}>
              <Textarea rows={2} value={value.special_requirements ?? ""} onChange={(v) => onChange({ ...value, special_requirements: v })} placeholder={t("public.inquiryDrawer.briefSpecialPlaceholder")} />
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
  const t = useT();
  const [linkDraft, setLinkDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileWarning, setFileWarning] = useState<string | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    const combined = [...stagedFiles, ...picked];
    const oversized = picked.filter((f) => f.size > FILE_MAX_BYTES);
    if (oversized.length > 0) {
      setFileWarning(
        interpolate(
          t(oversized.length === 1 ? "public.inquiryDrawer.filesOversizedOne" : "public.inquiryDrawer.filesOversizedOther"),
          { names: oversized.map((f) => f.name).join(", ") },
        ),
      );
    } else {
      setFileWarning(null);
    }
    const valid = combined.filter((f) => f.size <= FILE_MAX_BYTES).slice(0, FILE_MAX_COUNT);
    onStagedFiles(valid);
    // Reset so the same file can be re-selected after removal.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [stagedFiles, onStagedFiles, t]);

  const removeFile = useCallback((idx: number) => {
    onStagedFiles(stagedFiles.filter((_, i) => i !== idx));
  }, [stagedFiles, onStagedFiles]);

  void files; void onFiles; // reserved for post-submit attachment display

  return (
    <Section title={t("public.inquiryDrawer.filesTitle")} subtitle={t("public.inquiryDrawer.filesSubtitle")}>
      {/* File picker */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          onChange={handleFileChange}
          style={{ display: "none" }}
          aria-label={t("public.inquiryDrawer.filesAttachAria")}
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
          {t("public.inquiryDrawer.filesAttachButton")}
        </button>
        <span style={{ marginLeft: 8, fontSize: 11, color: C.inkDim }}>
          {interpolate(t("public.inquiryDrawer.filesLimitHint"), { count: FILE_MAX_COUNT })}
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
                aria-label={interpolate(t("public.inquiryDrawer.filesRemoveAria"), { name: f.name })}
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
        <Field label={t("public.inquiryDrawer.linkLabel")}>
          <div className="flex gap-2">
            <Input
              value={linkDraft}
              onChange={setLinkDraft}
              placeholder={t("public.inquiryDrawer.linkPlaceholder")}
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
              {t("public.inquiryDrawer.linkAdd")}
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

// Localized enum→catalog-key maps for the Review summary (additive). Location +
// date `status` share one map (their value sets don't collide); the budget
// `preference` has its own. `t()` returns the key on a miss, so callers fall back
// to a humanized `snake_case → words` string for any value without a key.
const INQUIRY_STATUS_LABEL_KEYS: Record<string, string> = {
  confirmed: "dashboard.enums.inquiryStatus.confirmed",
  unconfirmed: "dashboard.enums.inquiryStatus.unconfirmed",
  online: "dashboard.enums.inquiryStatus.online",
  not_sure: "dashboard.enums.inquiryStatus.not_sure",
  exact: "dashboard.enums.inquiryStatus.exact",
  flexible: "dashboard.enums.inquiryStatus.flexible",
  multi_day: "dashboard.enums.inquiryStatus.multi_day",
  recurring: "dashboard.enums.inquiryStatus.recurring",
};
const BUDGET_PREFERENCE_LABEL_KEYS: Record<string, string> = {
  agency_recommends: "dashboard.enums.budgetPreference.agency_recommends",
  total_budget: "dashboard.enums.budgetPreference.total_budget",
  per_hour: "dashboard.enums.budgetPreference.per_hour",
  per_day: "dashboard.enums.budgetPreference.per_day",
  per_week: "dashboard.enums.budgetPreference.per_week",
  per_contract: "dashboard.enums.budgetPreference.per_contract",
  per_talent: "dashboard.enums.budgetPreference.per_talent",
  not_sure: "dashboard.enums.budgetPreference.not_sure",
};

function Review({ intent, agencyName, stagedFiles }: { intent: InquiryIntent; agencyName: string; stagedFiles: File[] }) {
  const t = useT();
  const sameAsRequester = intent.client?.same_as_requester !== false;
  const empty = t("public.inquiryDrawer.reviewEmpty");
  const fileCount = stagedFiles.length;
  const linkCount = (intent.links ?? []).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13.5, color: C.ink, fontFamily: FONT }}>
      <div style={{ fontSize: 12.5, color: C.inkMuted }}>
        {interpolate(t("public.inquiryDrawer.reviewSendTo"), { agency: agencyName })}
      </div>

      <ReviewRow label={t("public.inquiryDrawer.reviewJob")}>
        {intent.client?.job_name?.trim() || intent.brief?.summary?.slice(0, 60) || t("public.inquiryDrawer.reviewJobUntitled")}
      </ReviewRow>
      <ReviewRow label={t("public.inquiryDrawer.reviewContact")}>
        {intent.requester.name}
        {intent.requester.email && <span style={{ color: C.inkMuted }}> · {intent.requester.email}</span>}
        {intent.requester.phone && <span style={{ color: C.inkMuted }}> · {intent.requester.phone}</span>}
      </ReviewRow>
      {!sameAsRequester && (intent.client?.name || intent.client?.company) && (
        <ReviewRow label={t("public.inquiryDrawer.reviewClientCompany")}>
          {intent.client?.name}{intent.client?.company ? ` · ${intent.client.company}` : ""}
        </ReviewRow>
      )}
      <ReviewRow label={t("public.inquiryDrawer.reviewLocation")}>
        {[intent.location?.venue_name, intent.location?.city].filter(Boolean).join(" · ") || statusLabel(intent.location?.status, empty, t)}
      </ReviewRow>
      <ReviewRow label={t("public.inquiryDrawer.reviewDate")}>
        {intent.date?.event_date || statusLabel(intent.date?.status, empty, t)}
        {intent.date?.start_time && <span style={{ color: C.inkMuted }}> · {intent.date.start_time}</span>}
        {intent.date?.duration && <span style={{ color: C.inkMuted }}> · {intent.date.duration}</span>}
      </ReviewRow>
      <ReviewRow label={t("public.inquiryDrawer.reviewTalent")}>
        {intent.talent?.selection_mode === "agency_recommends"
          ? t("public.inquiryDrawer.reviewTalentRecommend")
          : interpolate(t("public.inquiryDrawer.reviewTalentSelected"), { count: intent.talent?.selected_ids?.length ?? 0 })}
        {intent.talent?.count_needed ? ` · ${interpolate(t("public.inquiryDrawer.reviewTalentNeeded"), { count: intent.talent.count_needed })}` : ""}
      </ReviewRow>
      <ReviewRow label={t("public.inquiryDrawer.reviewBudget")}>
        {intent.budget?.preference === "agency_recommends" || !intent.budget?.preference
          ? t("public.inquiryDrawer.reviewBudgetRecommend")
          : `${intent.budget?.amount ?? empty} ${intent.budget?.currency ?? ""} · ${budgetPreferenceLabel(intent.budget.preference, t)}`}
      </ReviewRow>
      <ReviewRow label={t("public.inquiryDrawer.reviewBrief")}>
        <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {intent.brief?.summary ?? empty}
        </span>
      </ReviewRow>
      {(fileCount > 0 || linkCount > 0) && (
        <ReviewRow label={t("public.inquiryDrawer.reviewReferences")}>
          {fileCount > 0 && (
            <span>{interpolate(t(fileCount !== 1 ? "public.inquiryDrawer.reviewFilesOther" : "public.inquiryDrawer.reviewFilesOne"), { count: fileCount })}</span>
          )}
          {fileCount > 0 && linkCount > 0 && (
            <span style={{ color: C.inkMuted }}> · </span>
          )}
          {linkCount > 0 && (
            <span style={{ color: C.inkMuted }}>{interpolate(t(linkCount !== 1 ? "public.inquiryDrawer.reviewLinksOther" : "public.inquiryDrawer.reviewLinksOne"), { count: linkCount })}</span>
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

function statusLabel(s: string | undefined, empty: string, t: (key: string) => string): string {
  if (!s) return empty;
  const key = INQUIRY_STATUS_LABEL_KEYS[s];
  if (key) {
    const localized = t(key);
    if (localized && localized !== key) return localized;
  }
  return s.replace(/_/g, " ");
}

function budgetPreferenceLabel(pref: string, t: (key: string) => string): string {
  const key = BUDGET_PREFERENCE_LABEL_KEYS[pref];
  if (key) {
    const localized = t(key);
    if (localized && localized !== key) return localized;
  }
  return pref.replace(/_/g, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Submitted step — in-drawer confirmation (works for guest + authed client).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * T4 — per-file attachment outcome, shown under the confirmation.
 *
 * The point of this component is the FAILURE branch. The old server-side
 * loop swallowed a failed upload with `continue`, so a user whose 18 MB
 * deck never landed was told the inquiry sent and nothing else. Now every
 * file that didn't make it is named, with its reason.
 */
function AttachmentStatus({
  phase,
}: {
  phase:
    | { kind: "idle" }
    | { kind: "uploading"; done: number; total: number }
    | { kind: "done"; uploaded: number; failed: InquirySubmitAttachmentResult[] };
}) {
  const t = useT();
  if (phase.kind === "idle") return null;

  const box: React.CSSProperties = {
    width: "100%",
    maxWidth: 420,
    margin: "14px auto 0",
    padding: "10px 13px",
    borderRadius: 10,
    border: `1px solid ${C.borderSoft}`,
    background: C.card,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: C.inkMuted,
    textAlign: "left",
  };

  if (phase.kind === "uploading") {
    return (
      <div style={box} role="status" aria-live="polite">
        {interpolate(t("public.inquiryDrawer.filesUploading"), {
          done: String(phase.done),
          total: String(phase.total),
        })}
      </div>
    );
  }

  if (phase.failed.length === 0) {
    return (
      <div style={box} role="status" aria-live="polite">
        {interpolate(t("public.inquiryDrawer.filesAttached"), {
          count: String(phase.uploaded),
        })}
      </div>
    );
  }

  return (
    <div
      style={{ ...box, borderColor: C.amber, color: C.amber, background: C.amberSoft }}
      role="alert"
    >
      <div style={{ fontWeight: 600 }}>
        {interpolate(t("public.inquiryDrawer.filesFailedTitle"), {
          count: String(phase.failed.length),
        })}
      </div>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {phase.failed.map((f) => (
          <li key={f.filename}>
            {f.filename}
            {f.error ? ` — ${f.error}` : ""}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 6, color: C.inkMuted }}>
        {t("public.inquiryDrawer.filesFailedHint")}
      </div>
    </div>
  );
}

type SubmittedState = Extract<InquiryIntentActionState, { kind: "submitted" }>;

function SubmittedView({
  state, agencyName,
}: {
  state: SubmittedState;
  agencyName: string;
}) {
  const t = useT();
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
      ? { href: `/login${guestEmailQuery}`, label: t("public.inquiryDrawer.guestCtaSignIn") }
      : state.guestActivation === "created"
        ? {
            href: `/forgot-password${guestEmailQuery}`,
            label: t("public.inquiryDrawer.guestCtaSetPassword"),
          }
        : { href: `/register${guestEmailQuery}`, label: t("public.inquiryDrawer.guestCtaCreate") };

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
          {t("public.inquiryDrawer.submittedTitle")}
        </div>
        <p style={{ margin: "6px auto 0", fontSize: 13, color: C.inkMuted, maxWidth: 380, lineHeight: 1.5 }}>
          {interpolate(t("public.inquiryDrawer.submittedBody"), { agency: agencyName })}
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
              ? t("public.inquiryDrawer.submittedGuestMatchedTitle")
              : state.guestActivation === "created"
                ? t("public.inquiryDrawer.submittedGuestCreatedTitle")
                : t("public.inquiryDrawer.submittedGuestTrackTitle")}
          </div>
          <p style={{ margin: "5px 0 0", fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>
            {state.guestActivation === "created"
              ? state.guestEmail
                ? interpolate(t("public.inquiryDrawer.submittedGuestCreatedBodyEmail"), { email: state.guestEmail })
                : t("public.inquiryDrawer.submittedGuestCreatedBodyNoEmail")
              : state.guestActivation === "matched"
                ? state.guestEmail
                  ? interpolate(t("public.inquiryDrawer.submittedGuestMatchedBodyEmail"), { email: state.guestEmail })
                  : t("public.inquiryDrawer.submittedGuestMatchedBodyNoEmail")
                : state.guestEmail
                  ? interpolate(t("public.inquiryDrawer.submittedGuestUnlinkedBodyEmail"), { email: state.guestEmail })
                  : t("public.inquiryDrawer.submittedGuestUnlinkedBodyNoEmail")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <a href={guestCta.href} style={primaryLinkStyle}>
              {guestCta.label}
            </a>
          </div>
        </div>
      ) : (
        <a href={messagesHref} style={primaryLinkStyle}>
          {t("public.inquiryDrawer.viewInMessages")}
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

function formatRelative(iso: string, t: (key: string) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return t("public.inquiryDrawer.relativeJustNow");
  const m = Math.floor(ms / 60_000);
  if (m === 1) return t("public.inquiryDrawer.relativeMinuteOne");
  if (m < 60) return interpolate(t("public.inquiryDrawer.relativeMinuteOther"), { count: m });
  const h = Math.floor(m / 60);
  return h === 1
    ? t("public.inquiryDrawer.relativeHourOne")
    : interpolate(t("public.inquiryDrawer.relativeHourOther"), { count: h });
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
  const t = useT();
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
            aria-label={t("public.inquiryDrawer.closeAria")}
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
