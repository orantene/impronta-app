"use client";

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

import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import { COLORS, FONTS, type TalentProfile, type Client } from "./_state";

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
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${COLORS.borderSoft}`,
  fontFamily: FONTS.body,
  fontSize: 13,
  color: COLORS.ink,
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: COLORS.inkMuted,
  marginBottom: 5,
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
        gap: 10,
        padding: "10px 0",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        alignItems: "flex-start",
      }}
    >
      {/* Drag handle */}
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
          padding: "2px 4px",
          marginTop: 6,
          flexShrink: 0,
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ⠿
      </button>

      {/* Avatar */}
      {entry.thumb ? (
        <img
          src={entry.thumb}
          alt={entry.name}
          style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: COLORS.borderSoft,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: COLORS.inkDim,
            fontFamily: FONTS.body,
          }}
        >
          {entry.name[0]}
        </div>
      )}

      {/* Name + type + note */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.name}
          </span>
          {entry.primaryType && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: COLORS.inkDim,
                background: COLORS.borderSoft,
                borderRadius: 4,
                padding: "1px 5px",
                letterSpacing: 0.3,
                flexShrink: 0,
              }}
            >
              {entry.primaryType}
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
            fontSize: 12,
            padding: "6px 8px",
          }}
        />
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        aria-label={`Remove ${entry.name}`}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: COLORS.inkDim,
          fontSize: 16,
          padding: "2px",
          marginTop: 4,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        ×
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
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: COLORS.borderSoft,
        borderRadius: 6,
        padding: "4px 8px",
        fontFamily: FONTS.body,
        fontSize: 12,
        color: COLORS.ink,
        maxWidth: 180,
      }}
    >
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
  onClose,
  onNewPitch,
}: {
  data: PostSendData;
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
      {/* Success header */}
      <div
        style={{
          background: COLORS.successSoft,
          borderRadius: 10,
          padding: "14px 16px",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 22 }}>✓</span>
        <div>
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 14,
              fontWeight: 700,
              color: COLORS.successDeep,
              marginBottom: 2,
            }}
          >
            Pitch sent
          </div>
          <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.successDeep }}>
            The share link is live. Copy or send it directly.
          </div>
        </div>
      </div>

      {/* Share URL */}
      <div>
        <p style={sectionHeading}>Share link</p>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "stretch",
          }}
        >
          <input
            readOnly
            value={data.shareUrl}
            style={{
              ...field,
              flex: 1,
              background: COLORS.fill,
              color: COLORS.inkDim,
              fontSize: 12,
            }}
          />
          <button
            type="button"
            onClick={copyLink}
            style={{
              padding: "0 14px",
              background: copied ? COLORS.successDeep : COLORS.ink,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
              transition: "background 0.15s",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Send via */}
      <div>
        <p style={sectionHeading}>Send via</p>
        <div style={{ display: "flex", gap: 8 }}>
          {data.whatsappUrl ? (
            <a
              href={data.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                padding: "10px 14px",
                background: "#25D366",
                color: "#fff",
                border: "none",
                borderRadius: 9,
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: 16 }}>💬</span>
              WhatsApp
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
                justifyContent: "center",
                gap: 7,
                padding: "10px 14px",
                background: COLORS.fill,
                color: COLORS.ink,
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 9,
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: 16 }}>✉️</span>
              Email
            </a>
          ) : null}
          {!data.whatsappUrl && !data.emailUrl ? (
            <p
              style={{
                flex: 1,
                margin: 0,
                fontSize: 12,
                color: COLORS.inkMuted,
                lineHeight: 1.5,
              }}
            >
              No phone or email on file — copy the link above to share it manually.
            </p>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
        <button
          type="button"
          onClick={onNewPitch}
          style={{
            flex: 1,
            padding: "10px 0",
            background: "none",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.ink,
            cursor: "pointer",
          }}
        >
          New pitch
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            padding: "10px 0",
            background: COLORS.ink,
            border: "none",
            borderRadius: 8,
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
      console.error("[pitch-compose] send failed", e);
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
      onOpenChange={(v) => { if (!v) resetAndClose(); else onOpenChange(true); }}
      title="Send pitch"
      subtitle={
        postSend
          ? "Your pitch is live"
          : `${talents.length} talent${talents.length === 1 ? "" : "s"} selected`
      }
      icon={SendLucideIcon}
      size="md"
      footer={
        !postSend ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={resetAndClose}
              style={{
                flex: 1,
                padding: "10px 0",
                background: "none",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: 600,
                color: COLORS.ink,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              style={{
                flex: 2,
                padding: "10px 0",
                background: canSend ? COLORS.ink : COLORS.borderSoft,
                border: "none",
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: 700,
                color: canSend ? "#fff" : COLORS.inkDim,
                cursor: canSend ? "pointer" : "default",
                transition: "background 0.15s",
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
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* ── Recipient ─────────────────────────────────────── */}
          <section>
            <p style={sectionHeading}>Recipient</p>

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
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span style={{ color: COLORS.inkMuted, marginLeft: 6 }}>{c.contact}</span>
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
            <label style={{ ...fieldLabel, display: "block", marginBottom: 5 }}>
              Personal message
            </label>
            <textarea
              placeholder="Hi Sara — here's a curated selection for your upcoming campaign…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              style={{ ...field, resize: "vertical" }}
            />
          </section>

          {/* ── Talent list ───────────────────────────────────── */}
          <section>
            <p style={sectionHeading}>
              Talent ({talents.length}) — drag to reorder
            </p>
            {talents.length === 0 ? (
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                  color: COLORS.inkDim,
                  fontSize: 13,
                  fontFamily: FONTS.body,
                  background: COLORS.fill,
                  borderRadius: 8,
                }}
              >
                No talents selected. Close and select some from the roster.
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
                  {talents.map((entry) => (
                    <SortableTalentRow
                      key={entry.id}
                      entry={entry}
                      onNoteChange={updateNote}
                      onRemove={removeTalent}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </section>

          {/* ── Expiry ────────────────────────────────────────── */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input
                type="checkbox"
                id="pitch-expiry"
                checked={expiryEnabled}
                onChange={(e) => setExpiryEnabled(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <label
                htmlFor="pitch-expiry"
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  color: COLORS.ink,
                  cursor: "pointer",
                }}
              >
                Set an expiry
              </label>
            </div>
            {expiryEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted }}>
                  Expires in
                </span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Math.max(1, Math.min(90, Number(e.target.value))))}
                  style={{ ...field, width: 68 }}
                />
                <span style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted }}>
                  days
                </span>
              </div>
            )}
          </section>

          {/* ── File attachments ──────────────────────────────── */}
          <section>
            <p style={sectionHeading}>Attachments (lookbook, casting brief…)</p>
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
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                background: "none",
                border: `1px dashed ${COLORS.borderSoft}`,
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.inkDim,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 14 }}>+</span>
              Add files
            </button>
            <p
              style={{
                fontFamily: FONTS.body,
                fontSize: 11,
                color: COLORS.inkDim,
                marginTop: 5,
              }}
            >
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
