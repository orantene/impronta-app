"use client";

/**
 * DetailsTab — the canonical job-record view inside the client Messages
 * shell. Reads from loadClientInquiryDetails (server-side) and renders
 * the 10 sections defined in spec §6.4.
 *
 * A1 — editable fields: date, location, brief/message, quantity.
 * Locked when the inquiry is booked/converted/archived/rejected/expired.
 */

import { useState, useCallback, useTransition } from "react";
import { formatDateOnly } from "@/lib/date-only";
import type { ClientInquiryDetails } from "../../_data-bridge/client-inquiry-details";
import { cancelInquiryAsClient } from "../_actions/inquiry-cancel-actions";
import { updateClientInquiryDetailsAction } from "../_actions/inquiry-details-actions";
import { ClientConfirmDialog } from "../_components/ConfirmDialog";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { TabLoadingSkeleton } from "./TabLoadingSkeleton";

type Translator = (key: string) => string;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  card: "#FFFFFF",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success: "#0F5132",
  successSoft: "rgba(15,81,50,0.08)",
  amber: "#92400E",
  amberSoft: "rgba(146,64,14,0.08)",
} as const;

function humanize(s: string): string {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// English values kept as the non-UI fallback / documentation; UI renders
// `t(OFFER_STATUS_KEYS[status])` so the label follows the dashboard locale.
const OFFER_STATUS_KEYS: Record<string, string> = {
  draft: "client.messages.detailsOfferStatus.draft",
  sent: "client.messages.detailsOfferStatus.sent",
  withdrawn: "client.messages.detailsOfferStatus.withdrawn",
  superseded: "client.messages.detailsOfferStatus.superseded",
  accepted: "client.messages.detailsOfferStatus.accepted",
  rejected: "client.messages.detailsOfferStatus.rejected",
  expired: "client.messages.detailsOfferStatus.expired",
};

function offerStatusLabel(status: string, t: Translator): string {
  const key = OFFER_STATUS_KEYS[status];
  return key ? t(key) : humanize(status);
}

// NOTE: client-facing wording intentionally differs from the admin canonical set
// in @/lib/status-labels (e.g. "In review" vs "Coordination", "Declined" vs
// "Rejected"). Do not replace with the shared import without auditing copy.
const INQUIRY_STATUS_KEYS: Record<string, string> = {
  draft: "dashboard.clientInquiries.statusDraft",
  submitted: "dashboard.clientInquiries.statusSubmitted",
  coordination: "dashboard.clientInquiries.statusInReview",
  offer_pending: "dashboard.clientInquiries.statusOfferPending",
  offer_sent: "client.messages.detailsStatusOfferSent",
  approved: "dashboard.clientInquiries.statusApproved",
  booked: "dashboard.clientInquiries.statusBooked",
  converted: "dashboard.clientInquiries.statusBooked",
  rejected: "dashboard.clientInquiries.statusDeclined",
  cancelled: "client.messages.detailsStatusCancelled",
  expired: "dashboard.clientInquiries.statusExpired",
  closed: "dashboard.clientInquiries.statusClosed",
  closed_lost: "dashboard.clientInquiries.statusClosed",
  archived: "dashboard.clientInquiries.statusArchived",
};

function inquiryStatusLabel(status: string, t: Translator): string {
  const key = INQUIRY_STATUS_KEYS[status];
  return key ? t(key) : humanize(status);
}

// Statuses where no edits are allowed.
const LOCKED_STATUSES = new Set([
  "booked", "converted", "archived", "rejected", "expired", "cancelled",
]);

export function DetailsTab({
  details,
  tenantSlug,
}: {
  details: ClientInquiryDetails | null;
  tenantSlug?: string;
}) {
  const t = useT();
  // A1 — edit state. All hooks unconditional per rules.
  const [editSection, setEditSection] = useState<"brief" | "schedule" | "location" | null>(null);
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Draft state for each editable field.
  const [draftDate, setDraftDate] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftBrief, setDraftBrief] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("");

  const openEdit = useCallback(
    (section: "brief" | "schedule" | "location") => {
      if (!details) return;
      setSaveError(null);
      setSaveSuccess(false);
      setEditSection(section);
      if (section === "schedule") {
        setDraftDate(details.schedule.event_date ?? "");
        setDraftQuantity(String(details.talent.count_needed ?? ""));
      }
      if (section === "location") {
        setDraftLocation(details.location.city ?? "");
      }
      if (section === "brief") {
        setDraftBrief(details.brief.summary ?? "");
      }
    },
    [details],
  );

  const cancelEdit = useCallback(() => {
    setEditSection(null);
    setSaveError(null);
  }, []);

  const save = useCallback(
    (patch: Parameters<typeof updateClientInquiryDetailsAction>[2]) => {
      if (!details || !tenantSlug) return;
      setSaveError(null);
      setSaveSuccess(false);
      startSave(async () => {
        const res = await updateClientInquiryDetailsAction(tenantSlug, details.id, patch);
        if (!res.ok) {
          setSaveError(res.error ?? t("client.messages.detailsSaveFailed"));
        } else {
          setSaveSuccess(true);
          setEditSection(null);
          // Brief flash then clear success state.
          setTimeout(() => setSaveSuccess(false), 2500);
        }
      });
    },
    [details, tenantSlug, t],
  );

  if (!details) {
    return <TabLoadingSkeleton label={t("dashboard.clientMessages.loadingMessages")} />;
  }

  const isLocked = LOCKED_STATUSES.has(details.status);

  return (
    <div style={{ padding: "16px 22px 32px", display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT }}>
      <JobHeader details={details} />

      {saveSuccess && (
        <div
          role="status"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            background: "rgba(15,81,50,0.08)",
            color: "#0F5132",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {t("client.messages.detailsSaved")}
        </div>
      )}

      {/* Project brief — editable */}
      <Section
        title={t("client.messages.detailsProjectBrief")}
        editable={!isLocked}
        onEdit={() => openEdit("brief")}
        editing={editSection === "brief"}
      >
        {editSection === "brief" ? (
          <EditBlock onCancel={cancelEdit} saving={saving} error={saveError}>
            <label className="flex flex-col gap-1.5">
              <span style={fieldLabelStyle}>{t("client.messages.detailsBriefLabel")}</span>
              <textarea
                value={draftBrief}
                onChange={(e) => setDraftBrief(e.target.value)}
                rows={5}
                placeholder={t("client.messages.detailsBriefPlaceholder")}
                style={{ ...editInputStyle, resize: "vertical", minHeight: 80, lineHeight: 1.45 }}
              />
            </label>
            <button
              type="button"
              style={saving ? { ...saveBtn, opacity: 0.6, cursor: "wait" } : saveBtn}
              disabled={saving}
              onClick={() => save({ message: draftBrief.trim() || null })}
            >
              {saving ? t("client.messages.detailsSaving") : t("client.messages.detailsSaveBrief")}
            </button>
          </EditBlock>
        ) : details.brief.summary ? (
          <p style={paragraphStyle}>{details.brief.summary}</p>
        ) : (
          <EmptyPrompt label={t("client.messages.detailsAddBrief")} hint={t("client.messages.detailsAddBriefHint")} />
        )}
      </Section>

      <SectionGrid>
        {/* Schedule — date + quantity editable */}
        <Section
          title={t("client.messages.detailsSchedule")}
          inline
          editable={!isLocked}
          onEdit={() => openEdit("schedule")}
          editing={editSection === "schedule"}
        >
          {editSection === "schedule" ? (
            <EditBlock onCancel={cancelEdit} saving={saving} error={saveError}>
              <label className="flex flex-col gap-1.5">
                <span style={fieldLabelStyle}>{t("client.messages.detailsEventDate")}</span>
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  style={editInputStyle}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span style={fieldLabelStyle}>{t("client.messages.detailsTalentNeeded")}</span>
                <input
                  type="number"
                  min={1}
                  value={draftQuantity}
                  onChange={(e) => setDraftQuantity(e.target.value)}
                  placeholder={t("client.messages.detailsQuantityPlaceholder")}
                  style={editInputStyle}
                />
              </label>
              <button
                type="button"
                style={saving ? { ...saveBtn, opacity: 0.6, cursor: "wait" } : saveBtn}
                disabled={saving}
                onClick={() =>
                  save({
                    event_date: draftDate.trim() || null,
                    quantity: draftQuantity.trim() ? Number(draftQuantity) : null,
                  })
                }
              >
                {saving ? t("client.messages.detailsSaving") : t("client.messages.detailsSaveSchedule")}
              </button>
            </EditBlock>
          ) : (
            <>
              <KV label={t("client.messages.detailsDate")} value={formatDate(details.schedule.event_date)} fallback={t("client.messages.detailsNotSet")} />
              <KV label={t("client.messages.detailsTime")} value={details.schedule.start_time} fallback="—" />
              <KV label={t("client.messages.detailsDuration")} value={details.schedule.duration} fallback="—" />
              <KV
                label={t("client.messages.detailsStatus")}
                value={statusLabel(details.schedule.date_status, t)}
                fallback={t("dashboard.enums.inquiryStatus.exact")}
              />
            </>
          )}
        </Section>

        {/* Location — city editable */}
        <Section
          title={t("client.messages.detailsLocation")}
          inline
          editable={!isLocked}
          onEdit={() => openEdit("location")}
          editing={editSection === "location"}
        >
          {editSection === "location" ? (
            <EditBlock onCancel={cancelEdit} saving={saving} error={saveError}>
              <label className="flex flex-col gap-1.5">
                <span style={fieldLabelStyle}>{t("client.messages.detailsCityVenue")}</span>
                <input
                  type="text"
                  value={draftLocation}
                  onChange={(e) => setDraftLocation(e.target.value)}
                  placeholder={t("client.messages.detailsCityPlaceholder")}
                  style={editInputStyle}
                />
              </label>
              <button
                type="button"
                style={saving ? { ...saveBtn, opacity: 0.6, cursor: "wait" } : saveBtn}
                disabled={saving}
                onClick={() => save({ event_location: draftLocation.trim() || null })}
              >
                {saving ? t("client.messages.detailsSaving") : t("client.messages.detailsSaveLocation")}
              </button>
            </EditBlock>
          ) : (
            <>
              <KV label={t("client.messages.detailsVenue")} value={details.location.venue_name} fallback="—" />
              <KV label={t("client.messages.detailsCity")} value={details.location.city} fallback="—" />
              <KV label={t("client.messages.detailsCountry")} value={details.location.country} fallback="—" />
              <KV
                label={t("client.messages.detailsStatus")}
                value={statusLabel(details.location.status, t)}
                fallback={t("dashboard.enums.inquiryStatus.unconfirmed")}
                badge={details.location.status === "confirmed" ? "success" : details.location.status === "unconfirmed" ? "warn" : undefined}
              />
              {details.location.notes && (
                <KV label={t("client.messages.detailsNotes")} value={details.location.notes} multiline />
              )}
            </>
          )}
        </Section>
      </SectionGrid>

      <Section title={t("client.messages.detailsYourCoordinator")}>
        {details.coordinator.assigned && details.coordinator.name ? (
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: C.accentSoft,
                color: C.accent,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: FONT,
              }}
            >
              {initials(details.coordinator.name)}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                {details.coordinator.name}
              </div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                {details.coordinator.assigned_at
                  ? interpolate(t("client.messages.detailsCoordinatingSince"), { date: formatDate(details.coordinator.assigned_at) })
                  : t("client.messages.detailsCoordinatingBooking")}
              </div>
            </div>
          </div>
        ) : (
          <EmptyPrompt label={t("client.messages.detailsNoCoordinator")} hint={t("client.messages.detailsNoCoordinatorHint")} />
        )}
      </Section>

      <Section title={t("client.messages.detailsTalentLineup")}>
        {details.talent.selected.length > 0 ? (
          <div className="flex flex-col gap-2">
            {details.talent.selected.map((t) => (
              <div
                key={t.participant_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: `1px solid ${C.borderSoft}`,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "rgba(11,11,13,0.06)",
                    color: C.inkMuted,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {initials(t.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                    {t.name}
                  </div>
                  {t.profile_code && (
                    <div style={{ fontSize: 11, color: C.inkDim, marginTop: 1 }}>
                      {t.profile_code}
                    </div>
                  )}
                </div>
                <TalentStatusPill status={t.status} />
              </div>
            ))}
          </div>
        ) : details.talent.selection_mode === "agency_recommends" ? (
          <EmptyPrompt
            label={t("client.messages.detailsAgencyRecommends")}
            hint={
              details.talent.count_needed
                ? interpolate(t("client.messages.detailsTalentNeededHint"), { count: details.talent.count_needed })
                : t("client.messages.detailsAgencyRecommendsHint")
            }
          />
        ) : (
          <EmptyPrompt label={t("client.messages.detailsNoTalent")} hint={t("client.messages.detailsNoTalentHint")} />
        )}
        {details.talent.notes && (
          <div style={{ marginTop: 10, fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>
            {details.talent.notes}
          </div>
        )}
      </Section>

      <Section title={t("client.messages.detailsBudget")}>
        <KV
          label={t("client.messages.detailsPricing")}
          value={budgetLabel(details.budget.preference, t)}
          fallback={t("dashboard.enums.budgetPreference.agency_recommends")}
        />
        {details.budget.amount != null && (
          <KV
            label={t("client.messages.detailsAmount")}
            value={`${details.budget.amount.toLocaleString()} ${details.budget.currency ?? ""}`.trim()}
          />
        )}
        {details.budget.notes && <KV label={t("client.messages.detailsNotes")} value={details.budget.notes} multiline />}
      </Section>

      <Section title={t("client.messages.detailsLogistics")}>
        <KV
          label={t("client.messages.detailsRoleExpectations")}
          value={details.brief.role_expectations.join(", ")}
          fallback="—"
          multiline
        />
        <KV label={t("client.messages.detailsWardrobe")} value={details.brief.wardrobe_notes} fallback="—" />
        <KV label={t("client.messages.detailsEquipment")} value={details.brief.equipment_notes} fallback="—" />
        <KV label={t("client.messages.detailsTravel")} value={details.brief.travel_notes} fallback="—" />
        <KV label={t("client.messages.detailsMediaUsage")} value={details.brief.media_usage} fallback="—" />
        <KV
          label={t("client.messages.detailsSpecialRequirements")}
          value={details.brief.special_requirements}
          fallback="—"
          multiline
        />
      </Section>

      <Section title={t("client.messages.detailsContact")}>
        <KV label={t("client.messages.detailsName")} value={details.contact.name} />
        <KV label={t("client.messages.detailsEmail")} value={details.contact.email} />
        <KV label={t("client.messages.detailsPhone")} value={details.contact.phone} fallback="—" />
        {details.contact.company && <KV label={t("client.messages.detailsCompany")} value={details.contact.company} />}
        {details.contact.booking_for && (
          <KV label={t("client.messages.detailsBookingFor")} value={statusLabel(details.contact.booking_for, t)} />
        )}
      </Section>

      <Section title={t("client.messages.detailsFiles")}>
        {details.attachments.files.length === 0 && details.attachments.links.length === 0 ? (
          <EmptyPrompt label={t("client.messages.detailsNoFiles")} hint={t("client.messages.detailsNoFilesHint")} />
        ) : (
          <>
            {details.attachments.files.map((f, i) => (
              <a
                key={i}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                style={fileRowStyle}
              >
                <span>📎 {f.name}</span>
              </a>
            ))}
            {details.attachments.links.map((l, i) => (
              <a key={i} href={l} target="_blank" rel="noreferrer" style={fileRowStyle}>
                <span>🔗 {l}</span>
              </a>
            ))}
          </>
        )}
      </Section>

      <Section title={t("client.messages.detailsActivity")}>
        {details.activity.length === 0 ? (
          <EmptyPrompt label={t("client.messages.detailsNoActivity")} hint={t("client.messages.detailsNoActivityHint")} />
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {details.activity.map((a) => (
              <li
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  fontSize: 12.5,
                  color: C.ink,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${C.borderSoft}`,
                }}
              >
                <span className="flex-1">
                  <strong>{a.actor_name ?? actorRoleLabel(a.actor_role, t) ?? t("client.messages.detailsActorSystem")}</strong>{" "}
                  <span style={{ color: C.inkMuted }}>{eventLabel(a.event_type, t)}</span>
                </span>
                <span style={{ color: C.inkDim, fontSize: 11, whiteSpace: "nowrap" }}>
                  {formatRelative(a.created_at, t)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* B3 — Cancel inquiry. Hidden once the project is booked/converted
          (separate cancellation flow needed at that point with refund +
          talent release). Also hidden once already rejected/expired. */}
      {tenantSlug && details &&
        !["rejected", "expired", "archived", "booked", "converted", "cancelled"].includes(details.status) && (
        <CancelInquiryRow tenantSlug={tenantSlug} inquiryId={details.id} />
      )}
    </div>
  );
}

function CancelInquiryRow({ tenantSlug, inquiryId }: { tenantSlug: string; inquiryId: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  function submit(reason: string | null) {
    setErr(null);
    startTransition(async () => {
      const r = await cancelInquiryAsClient(tenantSlug, inquiryId, reason);
      if (!r.ok) {
        setErr(r.error);
        setConfirmOpen(false);
      } else {
        window.location.reload();
      }
    });
  }
  return (
    <section
      style={{
        background: "rgba(239,68,68,0.04)",
        border: "1px solid rgba(239,68,68,0.18)",
        borderRadius: 12,
        padding: "14px 16px",
        marginTop: 8,
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#991B1B", textTransform: "uppercase", letterSpacing: 0.6 }}>
        {t("client.messages.detailsCancelInquiry")}
      </div>
      <div style={{ marginTop: 6, fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5 }}>
        {t("client.messages.detailsCancelInquiryBody")}
      </div>
      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#991B1B" }}>
          {err}
        </div>
      )}
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
        style={{
          marginTop: 10,
          padding: "8px 14px",
          borderRadius: 8,
          background: pending ? "rgba(239,68,68,0.4)" : "#991B1B",
          color: "#fff",
          border: "none",
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
        }}
      >
        {pending ? t("client.messages.detailsCancelling") : t("client.messages.detailsCancelInquiry")}
      </button>

      <ClientConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        destructive
        pending={pending}
        title={t("dashboard.clientConfirm.cancelInquiryTitle")}
        body={t("dashboard.clientConfirm.cancelInquiryBody")}
        reason={{
          label: t("dashboard.clientConfirm.cancelInquiryReasonLabel"),
          placeholder: t("dashboard.clientConfirm.cancelInquiryReasonPlaceholder"),
        }}
        confirmLabel={t("dashboard.clientConfirm.cancelInquiryConfirm")}
        cancelLabel={t("dashboard.clientConfirm.cancelInquiryKeep")}
      />
    </section>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function JobHeader({ details }: { details: ClientInquiryDetails }) {
  const t = useT();
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {t("client.messages.detailsProject")}
      </div>
      <h2
        style={{
          margin: "3px 0 0",
          fontSize: 20,
          fontWeight: 600,
          fontFamily: FONT_DISPLAY,
          color: C.ink,
          letterSpacing: -0.2,
        }}
      >
        {details.job.title ?? t("dashboard.clientMessages.inquiryFallback")}
      </h2>
      <div style={{ marginTop: 6, fontSize: 12, color: C.inkMuted, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>{interpolate(t("client.messages.detailsSubmittedOn"), { date: formatDate(details.created_at) })}</span>
        <span>·</span>
        <span>{inquiryStatusLabel(details.status, t)}</span>
        {details.offer && (
          <>
            <span>·</span>
            <span style={{ color: C.accent, fontWeight: 600 }}>{interpolate(t("client.messages.detailsOfferStatusLine"), { status: offerStatusLabel(details.offer.status, t) })}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  inline,
  editable,
  onEdit,
  editing,
}: {
  title: string;
  children: React.ReactNode;
  inline?: boolean;
  editable?: boolean;
  onEdit?: () => void;
  editing?: boolean;
}) {
  const t = useT();
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.inkMuted,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {title}
        </div>
        {editable && !editing && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              padding: "2px 9px",
              fontFamily: FONT,
              fontSize: 11,
              fontWeight: 600,
              color: C.inkMuted,
              cursor: "pointer",
              letterSpacing: 0.2,
            }}
          >
            {t("client.messages.detailsEdit")}
          </button>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: inline ? "column" : "column",
          gap: 6,
        }}
      >
        {children}
      </div>
    </section>
  );
}

// ─── Edit helpers ────────────────────────────────────────────────────────────

function EditBlock({
  onCancel,
  saving,
  error,
  children,
}: {
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      {children}
      {error && (
        <div style={{ fontSize: 12, color: "#991B1B", padding: "6px 10px", background: "rgba(239,68,68,0.06)", borderRadius: 6 }}>
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        style={{
          background: "transparent",
          border: `1px solid ${C.border}`,
          borderRadius: 7,
          padding: "5px 12px",
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 600,
          color: C.inkMuted,
          cursor: saving ? "not-allowed" : "pointer",
          alignSelf: "flex-start",
        }}
      >
        {t("client.messages.detailsCancel")}
      </button>
    </div>
  );
}

function SectionGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function KV({
  label,
  value,
  fallback,
  multiline,
  badge,
}: {
  label: string;
  value: string | null | undefined;
  fallback?: string;
  multiline?: boolean;
  badge?: "success" | "warn";
}) {
  const t = useT();
  const display = value?.trim() ? value : fallback ?? null;
  const empty = !value?.trim();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 12,
        alignItems: multiline ? "flex-start" : "baseline",
        paddingBottom: 4,
      }}
    >
      <div style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          color: empty ? C.inkDim : C.ink,
          lineHeight: 1.45,
          whiteSpace: multiline ? "pre-wrap" : "normal",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {display}
        {badge && (
          <span
            style={{
              padding: "1px 7px",
              borderRadius: 999,
              fontSize: 9.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              background: badge === "success" ? C.successSoft : C.amberSoft,
              color: badge === "success" ? C.success : C.amber,
            }}
          >
            {badge === "success" ? t("dashboard.enums.inquiryStatus.confirmed") : t("client.messages.detailsTbd")}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyPrompt({ label, hint }: { label: string; hint: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(11,11,13,0.02)",
        border: `1px dashed ${C.border}`,
        borderRadius: 8,
        fontSize: 12.5,
        color: C.inkMuted,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ color: C.ink }}>{label}</strong>
      <span> · {hint}</span>
    </div>
  );
}

function TalentStatusPill({ status }: { status: string }) {
  const t = useT();
  const palette = (() => {
    switch (status) {
      case "active":
        return { bg: C.successSoft, fg: C.success, label: t("dashboard.clientMessages.statusConfirmed") };
      case "invited":
        return { bg: C.accentSoft, fg: C.accent, label: t("dashboard.clientMessages.statusInvited") };
      case "declined":
        return { bg: "rgba(239,68,68,0.08)", fg: "#991B1B", label: t("dashboard.clientMessages.statusDeclined") };
      default:
        return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted, label: humanize(status) };
    }
  })();
  return (
    <span
      style={{
        padding: "3px 9px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      {palette.label}
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Enum values that have a shared catalog entry under dashboard.enums.inquiryStatus. */
const SHARED_STATUS_ENUM_VALUES = new Set([
  "confirmed", "unconfirmed", "online", "not_sure", "exact", "flexible", "multi_day", "recurring",
]);

function statusLabel(s: string | null | undefined, t: Translator): string | null {
  if (!s) return null;
  if (SHARED_STATUS_ENUM_VALUES.has(s)) return t(`dashboard.enums.inquiryStatus.${s}`);
  return humanize(s);
}

/** Enum values that have a shared catalog entry under dashboard.enums.budgetPreference. */
const SHARED_BUDGET_ENUM_VALUES = new Set([
  "agency_recommends", "total_budget", "per_hour", "per_day", "per_week", "per_contract", "per_talent", "not_sure",
]);

function budgetLabel(p: string | null | undefined, t: Translator): string | null {
  if (!p) return null;
  if (SHARED_BUDGET_ENUM_VALUES.has(p)) return t(`dashboard.enums.budgetPreference.${p}`);
  return statusLabel(p, t);
}

const EVENT_LABEL_KEYS: Record<string, string> = {
  INQUIRY_SUBMITTED: "client.messages.detailsEvent.inquirySubmitted",
  INQUIRY_MOVED_TO_COORDINATION: "client.messages.detailsEvent.movedToCoordination",
  COORDINATOR_ASSIGNED: "client.messages.detailsEvent.coordinatorAssigned",
  COORDINATOR_ACCEPTED: "client.messages.detailsEvent.coordinatorAccepted",
  ROSTER_TALENT_INVITED: "client.messages.detailsEvent.talentInvited",
  ROSTER_TALENT_ACCEPTED: "client.messages.detailsEvent.talentAccepted",
  ROSTER_TALENT_DECLINED: "client.messages.detailsEvent.talentDeclined",
  OFFER_CREATED: "client.messages.detailsEvent.offerCreated",
  OFFER_SENT: "client.messages.detailsEvent.offerSent",
  OFFER_CLIENT_REJECTED: "client.messages.detailsEvent.offerRejected",
  OFFER_CLIENT_ACCEPTED: "client.messages.detailsEvent.offerAccepted",
  APPROVAL_SUBMITTED: "client.messages.detailsEvent.approvalSubmitted",
  APPROVALS_COMPLETED: "client.messages.detailsEvent.approvalsCompleted",
  INQUIRY_CONVERTED_TO_BOOKING: "client.messages.detailsEvent.convertedToBooking",
  BOOKING_CONFIRMED: "client.messages.detailsEvent.bookingConfirmed",
  INQUIRY_FROZEN: "client.messages.detailsEvent.frozen",
  INQUIRY_UNFROZEN: "client.messages.detailsEvent.unfrozen",
  INQUIRY_ARCHIVED: "client.messages.detailsEvent.archived",
};

function eventLabel(eventType: string, t: Translator): string {
  const key = EVENT_LABEL_KEYS[eventType];
  return key ? t(key) : eventType.toLowerCase().replace(/_/g, " ");
}

function actorRoleLabel(role: string | null, t: Translator): string | null {
  if (!role) return null;
  if (role === "client") return t("client.messages.detailsActorYou");
  if (role === "admin") return t("client.messages.detailsActorCoordinator");
  return statusLabel(role, t);
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  // Date-only strings parse as LOCAL days (UTC-midnight parsing showed Aug 14 for Aug 15).
  return formatDateOnly(iso);
}

function formatRelative(iso: string, t: Translator): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return t("dashboard.clientInquiries.justNow");
    const m = Math.floor(ms / 60_000);
    if (m < 60) return interpolate(t("client.messages.detailsMinutesAgo"), { count: m });
    const h = Math.floor(m / 60);
    if (h < 24) return interpolate(t("dashboard.clientInquiries.hoursAgo"), { count: h });
    const d = Math.floor(h / 24);
    if (d < 7) return interpolate(t("dashboard.clientInquiries.daysAgo"), { count: d });
    return formatDate(iso);
  } catch {
    return "";
  }
}

const paragraphStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13.5,
  color: C.ink,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

const fileRowStyle: React.CSSProperties = {
  display: "block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(29,78,216,0.04)",
  color: C.accent,
  textDecoration: "none",
  fontSize: 12.5,
  fontWeight: 500,
};

// ─── Edit UI styles ──────────────────────────────────────────────────────────

const editInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 11px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  fontFamily: FONT,
  fontSize: 13,
  color: C.ink,
  background: "#fff",
  outline: "none",
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: C.inkMuted,
  fontWeight: 600,
};

const saveBtn: React.CSSProperties = {
  height: 34,
  padding: "0 14px",
  borderRadius: 8,
  background: C.accent,
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 12.5,
  fontWeight: 600,
  alignSelf: "flex-start",
};
