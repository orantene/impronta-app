"use client";
import { logServerError } from "@/lib/server/safe-error";

/**
 * PitchComposeDrawer — admin compose surface for the Pitch feature.
 *
 * Flow:
 *   1. Admin selects talents on the roster → clicks "Send as pitch…"
 *   2. This drawer opens pre-filled with those talents
 *   3. Admin sets recipient, personal message, per-talent notes, optional expiry
 *   4. "Send pitch" → createPitchDraftAction + sendPitchAction → post-send view
 *   5. Post-send view: copy link + WhatsApp / email deep links
 *
 * Drag-reorder uses @dnd-kit/sortable. File attachments UI is present but
 * upload is wired only to client-side state — actual Supabase storage upload
 * is Phase D/E work (requires a signed-upload endpoint).
 */

import { useState, useCallback, useRef, type CSSProperties } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Use the prototype's DrawerShell (light surface, matches the rest of the
// workspace chrome) instead of the production drawer which defaults to a
// dark theme when no [data-dashboard-theme] attribute is set.
import { DrawerShell, GhostButton, PrimaryButton, Eyebrow } from "./primitives";
import { COLORS, FONTS, type TalentProfile, type Client } from "./state";

// Server actions use node:crypto transitively and cannot be statically imported
// in a "use client" prototype component. The real wiring lives in Phase E
// production code (proper Next.js route with server components).
// The prototype simulates the full flow with a short delay.

// ─── Deep-link helpers (client-safe — no node:crypto dependency) ──────────────

function buildWhatsappDeepLink({
  shareUrl,
  agencyName,
  phone,
  locale = "en",
}: {
  shareUrl: string;
  agencyName: string;
  phone?: string;
  locale?: "en" | "es";
}): string {
  const body =
    locale === "es"
      ? `${agencyName} te ha enviado una selección de talentos. Ábrela aquí: ${shareUrl}`
      : `${agencyName} sent you a talent pitch. Open it here: ${shareUrl}`;
  const digits = phone ? phone.replace(/\D/g, "") : "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}

function buildEmailDeepLink({
  shareUrl,
  agencyName,
  email,
  locale = "en",
}: {
  shareUrl: string;
  agencyName: string;
  email?: string;
  locale?: "en" | "es";
}): string {
  const subject =
    locale === "es" ? `${agencyName} — selección de talentos` : `${agencyName} — talent pitch`;
  const body =
    locale === "es"
      ? `Hola,\n\n${agencyName} ha preparado una selección de talentos para ti.\n\nÁbrela aquí: ${shareUrl}`
      : `Hi,\n\n${agencyName} has prepared a talent pitch for you.\n\nOpen it here: ${shareUrl}`;
  const to = email ? encodeURIComponent(email) : "";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PitchTalentEntry = {
  id: string;
  name: string;
  thumb?: string;
  primaryType?: string;
  adminNote: string;
};

type RecipientForm = {
  name: string;
  company: string;
  phone: string;
  email: string;
};

type PostSendData = {
  pitchId: string;
  shareUrl: string;
  whatsappUrl: string | null;
  emailUrl: string | null;
};

export type PitchComposeDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selected talent profiles pre-loaded into the pitch. */
  selectedTalents: TalentProfile[];
  /** Existing clients for recipient autocomplete. */
  clients: Client[];
  /** Current workspace slug for the server actions. */
  tenantSlug: string;
  /** Agency name used in share deep links. */
  agencyName: string;
  /** Base URL for share links (defaults to tulala.digital). */
  baseUrl?: string;
  onPitchSent?: (pitchId: string) => void;
};

// ─── Micro-helpers ────────────────────────────────────────────────────────────

const field: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${COLORS.borderSoft}`,
  fontFamily: FONTS.body,
  fontSize: 13.5,
  color: COLORS.ink,
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.12s, box-shadow 0.12s",
};

const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0,
  color: COLORS.inkMuted,
  marginBottom: 6,
  fontFamily: FONTS.body,
};

const sectionHeading: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: COLORS.inkMuted,
  fontFamily: FONTS.body,
  marginBottom: 10,
};

// ─── Sortable talent row ──────────────────────────────────────────────────────

function SortableTalentRow({
  entry,
  onNoteChange,
  onRemove,
}: {
  entry: PitchTalentEntry;
  onNoteChange: (id: string, note: string) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        gap: 12,
        padding: "12px",
        borderRadius: 12,
        background: isDragging ? "rgba(11,11,13,0.04)" : "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        alignItems: "flex-start",
      }}
    >
      {/* Drag handle — six-dot grip affordance */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        style={{
          background: "none",
          border: "none",
          cursor: "grab",
          color: COLORS.inkDim,
          padding: "8px 4px",
          marginTop: 14,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden>
          <circle cx="2" cy="3" r="1.2" fill="currentColor" />
          <circle cx="8" cy="3" r="1.2" fill="currentColor" />
          <circle cx="2" cy="8" r="1.2" fill="currentColor" />
          <circle cx="8" cy="8" r="1.2" fill="currentColor" />
          <circle cx="2" cy="13" r="1.2" fill="currentColor" />
          <circle cx="8" cy="13" r="1.2" fill="currentColor" />
        </svg>
      </button>

      {/* Avatar — larger, premium feel */}
      {entry.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.thumb}
          alt={entry.name}
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            objectFit: "cover",
            flexShrink: 0,
            border: `1px solid ${COLORS.borderSoft}`,
          }}
        />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: 10, background: "rgba(11,11,13,0.04)", border: `1px solid ${COLORS.borderSoft}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 600, fontFamily: FONTS.body }} className="text-admin-ink-muted">
          {entry.name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Name + type + note */}
      <div className="flex-1 min-w-0">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: FONTS.body, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: -0.1 }} className="text-admin-ink">
            {entry.name}
          </span>
          {entry.primaryType && (
            <span style={{ fontSize: 10.5, fontWeight: 600, background: "rgba(11,11,13,0.04)", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 999, padding: "2px 8px", letterSpacing: 0.3, textTransform: "capitalize", flexShrink: 0 }} className="text-admin-ink-muted">
              {entry.primaryType.replace(/[-_]/g, " ")}
            </span>
          )}
        </div>
        <textarea
          placeholder="Add a note about this talent… (optional)"
          value={entry.adminNote}
          onChange={(e) => onNoteChange(entry.id, e.target.value)}
          rows={2}
          style={{
            ...field,
            resize: "none",
            fontSize: 12.5,
            padding: "8px 10px",
            background: "rgba(11,11,13,0.02)",
          }}
        />
      </div>

      {/* Remove — larger hit target, tonal hover */}
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        aria-label={`Remove ${entry.name}`}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: COLORS.inkDim,
          padding: "6px",
          marginTop: 6,
          flexShrink: 0,
          lineHeight: 1,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(11,11,13,0.05)";
          e.currentTarget.style.color = COLORS.ink;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "none";
          e.currentTarget.style.color = COLORS.inkDim;
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ─── File attachment row ──────────────────────────────────────────────────────

function AttachmentChip({
  name,
  onRemove,
}: {
  name: string;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.borderSoft, borderRadius: 6, padding: "4px 8px", fontFamily: FONTS.body, fontSize: 12, maxWidth: 180 }} className="text-admin-ink">
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: COLORS.inkDim,
          padding: 0,
          lineHeight: 1,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Post-send view ───────────────────────────────────────────────────────────

function PostSendView({
  data,
  recipientName,
  recipientCompany,
  talents,
  expiresAt,
  onClose,
  onNewPitch,
}: {
  data: PostSendData;
  recipientName: string;
  recipientCompany: string;
  talents: PitchTalentEntry[];
  expiresAt: string | null;
  onClose: () => void;
  onNewPitch: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can copy manually */
    }
  };

  // Compact host/path split so the URL reads cleanly without truncating the
  // useful part. We keep the host visible in full and elide the long token.
  const linkLabel = (() => {
    try {
      const u = new URL(data.shareUrl);
      const path = u.pathname.replace(/^\/+/, "");
      const tail = path.length > 28 ? path.slice(0, 24) + "…" : path;
      return { host: u.host, tail };
    } catch {
      return { host: data.shareUrl, tail: "" };
    }
  })();

  // Expiry chip — humanize "expires in N days" if a future timestamp is given.
  const expiryLabel = (() => {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const days = Math.round(ms / (1000 * 60 * 60 * 24));
    if (days < 1) return "Expires today";
    if (days === 1) return "Expires in 1 day";
    return `Expires in ${days} days`;
  })();

  const visibleAvatars = talents.slice(0, 4);
  const overflow = Math.max(0, talents.length - visibleAvatars.length);
  const talentNames =
    talents.length === 0
      ? ""
      : talents.length <= 2
        ? talents.map((t) => t.name).join(" & ")
        : `${talents
            .slice(0, 2)
            .map((t) => t.name.split(" ")[0])
            .join(", ")} + ${talents.length - 2} more`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 4 }}>
      {/* Compact success line — replaces the full-width banner. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600 }} className="text-admin-success-deep">
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: 999,
            background: COLORS.successSoft,
            color: COLORS.successDeep,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          ✓
        </span>
        Pitch sent · just now
      </div>

      {/* Pitch summary — recipient + talent avatars + expiry. Replaces the
          empty space at the bottom of the previous design with a real
          confirmation of what went out. */}
      <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 14 }} className="bg-admin-surface-alt">
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4 }} className="text-admin-ink-dim">
            Recipient
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: FONTS.body }} className="text-admin-ink">
            {recipientName || "—"}
            {recipientCompany ? (
              <span style={{ fontWeight: 400, marginLeft: 6 }} className="text-admin-ink-muted">
                · {recipientCompany}
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ height: 1, background: COLORS.borderSoft }} />

        <div className="flex items-center gap-3">
          {/* Overlapping avatars */}
          <div style={{ display: "flex", flexShrink: 0 }}>
            {visibleAvatars.map((t, i) => (
              <div
                key={t.id}
                title={t.name}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: t.thumb
                    ? `center / cover no-repeat url(${t.thumb})`
                    : COLORS.fillSoft,
                  border: `2px solid ${COLORS.surfaceAlt}`,
                  marginLeft: i === 0 ? 0 : -10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: COLORS.inkMuted,
                  fontFamily: FONTS.body,
                  zIndex: visibleAvatars.length - i,
                }}
              >
                {!t.thumb ? t.name.charAt(0).toUpperCase() : null}
              </div>
            ))}
            {overflow > 0 ? (
              <div style={{ width: 32, height: 32, borderRadius: 999, border: `2px solid ${COLORS.surfaceAlt}`, marginLeft: -10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, fontFamily: FONTS.body }} className="bg-admin-surface text-admin-ink-muted">
                +{overflow}
              </div>
            ) : null}
          </div>

          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
              {talents.length} talent{talents.length === 1 ? "" : "s"}
              {talentNames ? (
                <span style={{ fontWeight: 400 }} className="text-admin-ink-muted">
                  {" · "}
                  {talentNames}
                </span>
              ) : null}
            </div>
            {expiryLabel ? (
              <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 999,
                    background: COLORS.coral,
                  }}
                />
                {expiryLabel}
              </div>
            ) : null}
          </div>

          <a
            href={data.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.brand,
              textDecoration: "none",
              flexShrink: 0,
              fontFamily: FONTS.body,
            }}
          >
            Preview ↗
          </a>
        </div>
      </div>

      {/* Share link — compact card with inline copy. The URL is visible but
          truncated; full value still goes into the clipboard on copy. */}
      <div>
        <p style={sectionHeading}>Share link</p>
        <div style={{ display: "flex", alignItems: "stretch", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, overflow: "hidden" }} className="bg-admin-card">
          <div style={{ flex: 1, minWidth: 0, padding: "10px 14px", display: "flex", alignItems: "baseline", gap: 2, fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink-muted">
            <span style={{ fontWeight: 600 }} className="text-admin-ink">
              {linkLabel.host}
            </span>
            {linkLabel.tail ? <span>/{linkLabel.tail}</span> : null}
          </div>
          <button
            type="button"
            onClick={copyLink}
            aria-live="polite"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "0 16px",
              background: copied ? COLORS.successSoft : "transparent",
              color: copied ? COLORS.successDeep : COLORS.ink,
              border: "none",
              borderLeft: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Send via — equal-weight options, brand-tinted icon badges. */}
      {(data.whatsappUrl || data.emailUrl) && (
        <div>
          <p style={sectionHeading}>Send directly to client</p>
          <div className="flex gap-2">
            {data.whatsappUrl ? (
              <a
                href={data.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 14px",
                  background: COLORS.card,
                  color: COLORS.ink,
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 10,
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "border-color 0.12s, transform 0.1s",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "rgba(37,211,102,0.14)",
                    fontSize: 14,
                  }}
                >
                  💬
                </span>
                <span className="flex-1">WhatsApp</span>
                <span className="text-admin-ink-dim text-sm font-normal">↗</span>
              </a>
            ) : null}
            {data.emailUrl ? (
              <a
                href={data.emailUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 14px",
                  background: COLORS.card,
                  color: COLORS.ink,
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 10,
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "border-color 0.12s, transform 0.1s",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: COLORS.brandSoft,
                    fontSize: 14,
                  }}
                >
                  ✉
                </span>
                <span className="flex-1">Email</span>
                <span className="text-admin-ink-dim text-sm font-normal">↗</span>
              </a>
            ) : null}
          </div>
        </div>
      )}

      {!data.whatsappUrl && !data.emailUrl ? (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">
          No phone or email on file — copy the link above to share it manually.
        </p>
      ) : null}

      {/* Footer — quiet "+ New pitch" link, primary "Done". Visual weight
          matches the rest of the workspace chrome rather than a 50/50 split. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 6,
        }}
      >
        <button
          type="button"
          onClick={onNewPitch}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.inkMuted,
            cursor: "pointer",
          }}
        >
          + New pitch
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "10px 22px",
            background: COLORS.ink,
            border: "none",
            borderRadius: 999,
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// Lucide icon used only for DrawerShell
function SendIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9l20-7z" />
    </svg>
  );
}

// DrawerShell expects a LucideIcon component — wrap our SVG to match the shape
const SendLucideIcon = Object.assign(
  ({ className }: { className?: string }) => <SendIcon size={18} />,
  { displayName: "SendIcon" },
) as unknown as import("lucide-react").LucideIcon;

export function PitchComposeDrawer({
  open,
  onOpenChange,
  selectedTalents,
  clients,
  tenantSlug,
  agencyName,
  baseUrl = "https://tulala.digital",
  onPitchSent,
}: PitchComposeDrawerProps) {
  // Talent list (sortable)
  const [talents, setTalents] = useState<PitchTalentEntry[]>(() =>
    selectedTalents.map((t) => ({
      id: t.id,
      name: t.name,
      thumb: t.thumb,
      primaryType: t.primaryType,
      adminNote: "",
    })),
  );

  // Recipient
  const [recipient, setRecipient] = useState<RecipientForm>({
    name: "",
    company: "",
    phone: "",
    email: "",
  });
  const [clientQuery, setClientQuery] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Brief + expiry
  const [message, setMessage] = useState("");
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryDays, setExpiryDays] = useState(14);

  // Files
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postSend, setPostSend] = useState<PostSendData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTalents((items) => {
        const oldIdx = items.findIndex((t) => t.id === active.id);
        const newIdx = items.findIndex((t) => t.id === over.id);
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  }, []);

  const updateNote = useCallback((id: string, note: string) => {
    setTalents((prev) => prev.map((t) => (t.id === id ? { ...t, adminNote: note } : t)));
  }, []);

  const removeTalent = useCallback((id: string) => {
    setTalents((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const filteredClients = clients.filter(
    (c) =>
      clientQuery.length > 0 &&
      (c.name.toLowerCase().includes(clientQuery.toLowerCase()) ||
        c.contact.toLowerCase().includes(clientQuery.toLowerCase())),
  );

  const selectClient = (c: Client) => {
    setRecipient((r) => ({ ...r, name: c.contact, company: c.name }));
    setClientQuery(c.name);
    setShowClientDropdown(false);
  };

  const handleSend = async () => {
    if (!recipient.name.trim()) {
      setError("Recipient name is required.");
      return;
    }
    if (talents.length === 0) {
      setError("Add at least one talent to the pitch.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Phase E hookup — call the real server actions. The action module is
      // marked "use server", so Next.js generates an RPC stub for the client
      // bundle (no node:crypto leak).
      const { createPitchDraftAction, sendPitchAction } = await import(
        "@/app/(workspace)/[tenantSlug]/admin/pitches/actions"
      );

      const expiresAt = expiryEnabled
        ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const talentNotes: Record<string, string> = {};
      for (const t of talents) {
        if (t.adminNote.trim()) talentNotes[t.id] = t.adminNote.trim();
      }

      const draft = await createPitchDraftAction(tenantSlug, {
        recipientContact: {
          name: recipient.name.trim() || null,
          email: recipient.email.trim() || null,
          phone: recipient.phone.trim() || null,
          company: recipient.company.trim() || null,
        },
        talentProfileIds: talents.map((t) => t.id),
        personalNote: message.trim() || null,
        brief: {},
        expiresAt,
        talentNotes,
      });

      if (!draft.ok) {
        const reason = draft.reason ?? "internal_error";
        const map: Record<string, string> = {
          forbidden: "You don't have permission to send pitches.",
          not_authenticated: "Sign in again, then retry.",
          tenant_not_found: "Workspace not found.",
          no_talents: "Add at least one publishable talent (must be approved + public).",
          // Phase G PR 3 — plan-tier gate now blocks Free workspaces.
          // Friendly message points to the upgrade path.
          plan_not_eligible: "Pitches are a Studio + Agency feature. Upgrade your workspace plan in Settings → Plan to send curated talent suggestions to clients.",
        };
        setError(map[reason] ?? draft.message ?? "Could not save draft. Try again.");
        return;
      }

      const sent = await sendPitchAction(tenantSlug, draft.data.pitchId, "copy_link");
      if (!sent.ok) {
        const reason = sent.reason ?? "internal_error";
        const map: Record<string, string> = {
          no_talents: "All selected talents are no longer publishable.",
          forbidden: "You don't have permission to send pitches.",
          draft_required: "This pitch is no longer in draft state.",
          plan_not_eligible: "Pitches are a Studio + Agency feature. Upgrade in Settings → Plan to send this pitch.",
        };
        setError(map[reason] ?? sent.message ?? "Could not send. Try again.");
        return;
      }

      setPostSend({
        pitchId: sent.data.pitchId,
        shareUrl: sent.data.shareUrl,
        whatsappUrl: sent.data.whatsappDeepLink,
        emailUrl: sent.data.emailDeepLink,
      });
      onPitchSent?.(sent.data.pitchId);
    } catch (e) {
      logServerError("pitch_compose", e);
      setError("Unexpected error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetAndClose = () => {
    setPostSend(null);
    setTalents(selectedTalents.map((t) => ({ id: t.id, name: t.name, thumb: t.thumb, primaryType: t.primaryType, adminNote: "" })));
    setRecipient({ name: "", company: "", phone: "", email: "" });
    setClientQuery("");
    setMessage("");
    setExpiryEnabled(false);
    setExpiryDays(14);
    setAttachments([]);
    setError(null);
    onOpenChange(false);
  };

  const canSend = recipient.name.trim().length > 0 && talents.length > 0 && !isLoading;

  return (
    <DrawerShell
      open={open}
      onClose={resetAndClose}
      title="Send pitch"
      description={
        postSend
          ? "Your pitch is live — share the link with your client"
          : `${talents.length} talent${talents.length === 1 ? "" : "s"} selected · craft the message and send`
      }
      defaultSize="half"
      width={560}
      footer={
        !postSend ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <GhostButton size="sm" onClick={resetAndClose}>
              Cancel
            </GhostButton>
            <button
              type="button"
              onClick={canSend ? handleSend : undefined}
              disabled={!canSend}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                height: 36,
                padding: "0 18px",
                background: canSend ? COLORS.ink : COLORS.borderSoft,
                border: "none",
                borderRadius: 999,
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: 600,
                color: canSend ? "#fff" : COLORS.inkDim,
                cursor: canSend ? "pointer" : "default",
                transition: "background 0.15s, transform 0.1s",
                letterSpacing: 0.1,
              }}
            >
              {isLoading ? "Sending…" : "Send pitch →"}
            </button>
          </div>
        ) : null
      }
    >
      {postSend ? (
        <PostSendView
          data={postSend}
          recipientName={recipient.name}
          recipientCompany={recipient.company}
          talents={talents}
          expiresAt={
            expiryEnabled
              ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
              : null
          }
          onClose={resetAndClose}
          onNewPitch={() => {
            setPostSend(null);
            setTalents([]);
            setRecipient({ name: "", company: "", phone: "", email: "" });
            setClientQuery("");
            setMessage("");
          }}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* ── Recipient ─────────────────────────────────────── */}
          <section>
            <Eyebrow>Who is this for?</Eyebrow>
            <div style={{ marginTop: 12 }} />

            {/* Client autocomplete */}
            <div style={{ position: "relative", marginBottom: 10 }}>
              <label style={fieldLabel}>Search existing clients</label>
              <input
                type="text"
                placeholder="Start typing a client name…"
                value={clientQuery}
                onChange={(e) => {
                  setClientQuery(e.target.value);
                  setShowClientDropdown(true);
                }}
                onFocus={() => setShowClientDropdown(true)}
                onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
                style={field}
              />
              {showClientDropdown && filteredClients.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    background: "#fff",
                    border: `1px solid ${COLORS.borderSoft}`,
                    borderRadius: 8,
                    boxShadow: "0 8px 24px -4px rgba(11,11,13,0.14)",
                    zIndex: 20,
                    overflow: "hidden",
                  }}
                >
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => selectClient(c)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "9px 12px",
                        background: "none",
                        border: "none",
                        textAlign: "left",
                        fontFamily: FONTS.body,
                        fontSize: 13,
                        color: COLORS.ink,
                        cursor: "pointer",
                      }}
                    >
                      <span className="font-semibold">{c.name}</span>
                      <span style={{ marginLeft: 6 }} className="text-admin-ink-muted">{c.contact}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Free-text recipient fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={fieldLabel}>Contact name *</label>
                <input
                  type="text"
                  placeholder="Sara Bianchi"
                  value={recipient.name}
                  onChange={(e) => setRecipient((r) => ({ ...r, name: e.target.value }))}
                  style={field}
                />
              </div>
              <div>
                <label style={fieldLabel}>Company</label>
                <input
                  type="text"
                  placeholder="Vogue Italia"
                  value={recipient.company}
                  onChange={(e) => setRecipient((r) => ({ ...r, company: e.target.value }))}
                  style={field}
                />
              </div>
              <div>
                <label style={fieldLabel}>Phone</label>
                <input
                  type="tel"
                  placeholder="+39 333 123 4567"
                  value={recipient.phone}
                  onChange={(e) => setRecipient((r) => ({ ...r, phone: e.target.value }))}
                  style={field}
                />
              </div>
              <div>
                <label style={fieldLabel}>Email</label>
                <input
                  type="email"
                  placeholder="sara@vogue.it"
                  value={recipient.email}
                  onChange={(e) => setRecipient((r) => ({ ...r, email: e.target.value }))}
                  style={field}
                />
              </div>
            </div>
          </section>

          {/* ── Personal message ──────────────────────────────── */}
          <section>
            <Eyebrow>A short note from you</Eyebrow>
            <p style={{ margin: "4px 0 10px", fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-dim">
              Sets the tone — first thing the recipient reads.
            </p>
            <textarea
              placeholder="Hi Sara — here's a curated selection for your upcoming campaign…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              style={{ ...field, resize: "vertical", lineHeight: 1.5 }}
            />
          </section>

          {/* ── Talent list ───────────────────────────────────── */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <Eyebrow>
                Talent ({talents.length})
              </Eyebrow>
              {talents.length > 1 ? (
                <span style={{ fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-dim">
                  Drag to reorder
                </span>
              ) : null}
            </div>
            {talents.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", fontSize: 13, fontFamily: FONTS.body, background: "rgba(11,11,13,0.02)", border: `1px dashed ${COLORS.borderSoft}`, borderRadius: 12, lineHeight: 1.6 }} className="text-admin-ink-muted">
                No talents selected.<br />
                <span className="text-admin-ink-dim text-xs">
                  Close, then pick some from the roster to start a pitch.
                </span>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={talents.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-2">
                    {talents.map((entry) => (
                      <SortableTalentRow
                        key={entry.id}
                        entry={entry}
                        onNoteChange={updateNote}
                        onRemove={removeTalent}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </section>

          {/* ── Expiry ────────────────────────────────────────── */}
          <section
            style={{
              padding: "12px 14px",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              background: "rgba(11,11,13,0.02)",
            }}
          >
            <label
              htmlFor="pitch-expiry"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontFamily: FONTS.body,
              }}
            >
              <input
                type="checkbox"
                id="pitch-expiry"
                checked={expiryEnabled}
                onChange={(e) => setExpiryEnabled(e.target.checked)}
                style={{ cursor: "pointer", width: 16, height: 16, accentColor: COLORS.ink }}
              />
              <div className="flex-1">
                <div className="text-admin-ink text-admin-13 font-semibold">Set an expiry</div>
                <div style={{ fontSize: 12, marginTop: 1 }} className="text-admin-ink-muted">
                  Link auto-expires; recipient sees a friendly notice instead of stale data.
                </div>
              </div>
            </label>
            {expiryEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingLeft: 26 }}>
                <span style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
                  Expires in
                </span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Math.max(1, Math.min(90, Number(e.target.value))))}
                  style={{ ...field, width: 72, padding: "8px 10px" }}
                />
                <span style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
                  days
                </span>
              </div>
            )}
          </section>

          {/* ── File attachments ──────────────────────────────── */}
          <section>
            <Eyebrow>Attachments</Eyebrow>
            <p style={{ margin: "4px 0 10px", fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-dim">
              Lookbook, casting brief, mood board — optional.
            </p>
            {attachments.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {attachments.map((f, i) => (
                  <AttachmentChip
                    key={i}
                    name={f.name}
                    onRemove={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setAttachments((prev) => [...prev, ...files]);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                background: "rgba(11,11,13,0.02)",
                border: `1px dashed ${COLORS.borderSoft}`,
                borderRadius: 10,
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: 500,
                color: COLORS.inkMuted,
                cursor: "pointer",
                transition: "background 0.12s, border-color 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(11,11,13,0.04)";
                e.currentTarget.style.borderColor = "rgba(11,11,13,0.2)";
                e.currentTarget.style.color = COLORS.ink;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(11,11,13,0.02)";
                e.currentTarget.style.borderColor = COLORS.borderSoft;
                e.currentTarget.style.color = COLORS.inkMuted;
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add files
            </button>
            <p style={{ fontFamily: FONTS.body, fontSize: 11, marginTop: 5 }} className="text-admin-ink-dim">
              Images, PDFs, Word docs. Upload goes live when you hit Send.
            </p>
          </section>

          {/* ── Error ─────────────────────────────────────────── */}
          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: "#fef2f2",
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: "#b91c1c",
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </DrawerShell>
  );
}
