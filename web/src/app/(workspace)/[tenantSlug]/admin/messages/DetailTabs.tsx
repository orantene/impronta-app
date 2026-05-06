"use client";

// Phase 3.12 / Messages — Slice B: Offer / Files / Payment tab bodies.
//
// Pure client components — receive the inquiry + per-tab data as props from
// the server page (loaded eagerly when the inquiry is opened) and call
// server actions for mutations. Each tab maintains the prototype's
// information density and visual rhythm.

import React, { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  InquiryOffer,
  InquiryOfferLineItem,
  InquiryOfferHistoryEntry,
  InquiryAttachment,
  InquiryBookingTransaction,
} from "./messages-data";
import {
  sendOffer,
  markOfferAccepted,
  markOfferRejected,
  reviseOffer,
  createInitialOffer,
  updateOfferLineItem,
  uploadInquiryAttachment,
  deleteInquiryAttachment,
  getAttachmentSignedUrl,
} from "./detail-actions";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  surfaceAlt: "#FAFAF7",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  accentDeep: "#0B3B2E",
  coral:      "#B04A22",
  coralSoft:  "rgba(176,74,34,0.10)",
  coralDeep:  "#8C3318",
  success:    "#2E7D5B",
  successSoft:"rgba(46,125,91,0.10)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_MONO = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(0)}`;
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fileIcon(mime: string | null) {
  if (!mime) return "📎";
  if (mime.startsWith("image/")) return "🖼";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime === "application/pdf") return "📄";
  if (mime.includes("word")) return "📝";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  return "📎";
}

function offerStatusColor(status: string): { bg: string; fg: string; label: string } {
  const s = status.toLowerCase();
  if (s === "draft")    return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted, label: "Draft" };
  if (s === "sent")     return { bg: C.amberSoft,           fg: C.amber,    label: "Sent" };
  if (s === "accepted") return { bg: C.successSoft,         fg: C.success,  label: "Accepted" };
  if (s === "rejected") return { bg: C.coralSoft,           fg: C.coralDeep, label: "Rejected" };
  if (s === "expired")  return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted, label: "Expired" };
  return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted, label: status };
}

function bookingTxStatusColor(status: string): { bg: string; fg: string } {
  const s = status.toLowerCase();
  if (s === "paid" || s === "completed" || s === "succeeded") return { bg: C.successSoft, fg: C.success };
  if (s === "pending" || s === "processing" || s === "requested") return { bg: C.amberSoft, fg: C.amber };
  if (s === "failed" || s === "refunded" || s === "disputed") return { bg: C.coralSoft, fg: C.coralDeep };
  return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted };
}

// ─── Section primitives ───────────────────────────────────────────────────────

function SectionCard({
  title, action, children, padContent = true,
}: { title: string; action?: React.ReactNode; children: React.ReactNode; padContent?: boolean }) {
  return (
    <section style={{
      background: C.cardBg, border: `1px solid ${C.borderSoft}`,
      borderRadius: 14, overflow: "hidden", fontFamily: FONT,
    }}>
      <div style={{
        padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
        borderBottom: `1px solid ${C.borderSoft}`,
      }}>
        <h4 style={{
          fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.ink,
          margin: 0, letterSpacing: -0.05, flex: 1,
        }}>{title}</h4>
        {action}
      </div>
      <div style={{ padding: padContent ? "12px 16px" : 0 }}>
        {children}
      </div>
    </section>
  );
}

// ─── OfferTab ─────────────────────────────────────────────────────────────────

export function OfferTab({
  tenantSlug,
  inquiryId,
  offer,
  history,
}: {
  tenantSlug: string;
  inquiryId: string;
  offer: InquiryOffer | null;
  history: InquiryOfferHistoryEntry[];
}) {
  const router = useRouter();
  const [pending, startMutation] = useTransition();
  const [mutatingLineId, setMutatingLineId] = useState<string | null>(null);

  const handleSend = useCallback(() => {
    if (!offer) return;
    startMutation(async () => {
      await sendOffer(tenantSlug, inquiryId, offer.id);
      router.refresh();
    });
  }, [offer, tenantSlug, inquiryId, router]);

  const handleAccept = useCallback(() => {
    if (!offer) return;
    if (!confirm("Mark this offer as accepted by the client?")) return;
    startMutation(async () => {
      await markOfferAccepted(tenantSlug, inquiryId, offer.id);
      router.refresh();
    });
  }, [offer, tenantSlug, inquiryId, router]);

  const handleReject = useCallback(() => {
    if (!offer) return;
    const reason = prompt("Reason for rejection (optional)");
    startMutation(async () => {
      await markOfferRejected(tenantSlug, inquiryId, offer.id, reason ?? undefined);
      router.refresh();
    });
  }, [offer, tenantSlug, inquiryId, router]);

  const handleRevise = useCallback(() => {
    if (!offer) return;
    startMutation(async () => {
      await reviseOffer(tenantSlug, inquiryId, offer.id);
      router.refresh();
    });
  }, [offer, tenantSlug, inquiryId, router]);

  const handleCreateInitial = useCallback(() => {
    startMutation(async () => {
      await createInitialOffer(tenantSlug, inquiryId);
      router.refresh();
    });
  }, [tenantSlug, inquiryId, router]);

  // No offer yet
  if (!offer) {
    return (
      <div style={{ padding: 16, fontFamily: FONT }}>
        <SectionCard title="No offer yet">
          <div style={{
            padding: "12px 0", color: C.inkMuted, fontSize: 13, lineHeight: 1.5,
          }}>
            Once you've built the lineup, create the first offer and send it to the client.
          </div>
          <button
            type="button"
            onClick={handleCreateInitial}
            disabled={pending}
            style={{
              padding: "8px 14px", borderRadius: 8,
              background: C.accent, color: "#fff", border: "none",
              fontSize: 12.5, fontWeight: 700, cursor: pending ? "default" : "pointer",
              fontFamily: FONT, opacity: pending ? 0.5 : 1,
            }}
          >
            + Build draft offer
          </button>
        </SectionCard>
      </div>
    );
  }

  const status = offerStatusColor(offer.status);
  const lineSubtotal = offer.lineItems.reduce((sum, li) => sum + li.totalPrice, 0);
  const grandTotal = offer.totalClientPrice ?? lineSubtotal;

  return (
    <div style={{
      padding: 16, display: "flex", flexDirection: "column", gap: 12,
      overflowY: "auto", flex: 1, minHeight: 0,
    }}>
      {/* Status header */}
      <SectionCard
        title={`Offer · v${offer.version}`}
        action={
          <span style={{
            padding: "3px 10px", borderRadius: 999,
            background: status.bg, color: status.fg,
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
            textTransform: "uppercase",
          }}>{status.label}</span>
        }
      >
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10, marginBottom: 10,
        }}>
          <KV label="Total" value={
            <span style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: C.ink }}>
              {formatMoney(grandTotal, offer.currencyCode)}
            </span>
          } />
          {offer.coordinatorFee != null && offer.coordinatorFee > 0 && (
            <KV label="Coordinator fee" value={formatMoney(offer.coordinatorFee, offer.currencyCode)} />
          )}
          {offer.validUntil && (
            <KV label="Valid until" value={new Date(offer.validUntil).toLocaleDateString()} />
          )}
          {offer.sentAt && <KV label="Sent" value={timeAgo(offer.sentAt)} />}
          {offer.acceptedAt && <KV label="Accepted" value={timeAgo(offer.acceptedAt)} />}
        </div>
        {offer.notes && (
          <div style={{
            padding: 10, background: C.surface, borderRadius: 8,
            fontSize: 12.5, color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap",
          }}>{offer.notes}</div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {offer.status === "draft" && (
            <button
              type="button"
              onClick={handleSend}
              disabled={pending}
              style={primaryBtn(pending)}
            >Send to client →</button>
          )}
          {offer.status === "sent" && (
            <>
              <button
                type="button"
                onClick={handleAccept}
                disabled={pending}
                style={primaryBtn(pending)}
              >Mark accepted</button>
              <button
                type="button"
                onClick={handleReject}
                disabled={pending}
                style={dangerBtn(pending)}
              >Mark rejected</button>
              <button
                type="button"
                onClick={handleRevise}
                disabled={pending}
                style={ghostBtn(pending)}
              >Revise (new version)</button>
            </>
          )}
          {(offer.status === "rejected" || offer.status === "expired") && (
            <button
              type="button"
              onClick={handleRevise}
              disabled={pending}
              style={primaryBtn(pending)}
            >Build new version</button>
          )}
          {offer.status === "accepted" && (
            <span style={{
              padding: "8px 12px", borderRadius: 8,
              background: C.successSoft, color: C.success,
              fontSize: 12, fontWeight: 600, fontFamily: FONT,
            }}>
              ✓ Locked in. Move to Booking tab to convert.
            </span>
          )}
        </div>
      </SectionCard>

      {/* Line items */}
      <SectionCard title={`Line items · ${offer.lineItems.length}`} padContent={false}>
        {offer.lineItems.length === 0 ? (
          <div style={{ padding: 16, color: C.inkMuted, fontSize: 13 }}>
            No line items yet. Add talent to the lineup, then they'll appear here on the next revision.
          </div>
        ) : (
          <div>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 70px 110px 120px",
              gap: 10, padding: "8px 16px",
              fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
              textTransform: "uppercase", color: C.inkDim,
              borderBottom: `1px solid ${C.borderSoft}`,
              background: C.surface,
            }}>
              <span>Item</span>
              <span style={{ textAlign: "right" }}>Units</span>
              <span style={{ textAlign: "right" }}>Unit price</span>
              <span style={{ textAlign: "right" }}>Total</span>
            </div>
            {offer.lineItems.map((li) => (
              <LineItemRow
                key={li.id}
                item={li}
                currency={offer.currencyCode}
                editable={offer.status === "draft"}
                tenantSlug={tenantSlug}
                isMutating={mutatingLineId === li.id}
                onSave={async (patch) => {
                  setMutatingLineId(li.id);
                  await updateOfferLineItem(tenantSlug, offer.id, li.id, patch);
                  setMutatingLineId(null);
                  router.refresh();
                }}
              />
            ))}
            <div style={{
              padding: "10px 16px", display: "flex",
              justifyContent: "space-between", alignItems: "center",
              borderTop: `1px solid ${C.border}`, background: C.surface,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.inkMuted }}>
                Subtotal
              </span>
              <span style={{
                fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: C.ink,
              }}>
                {formatMoney(lineSubtotal, offer.currencyCode)}
              </span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* History */}
      {history.length > 1 && (
        <SectionCard title={`Version history · ${history.length}`} padContent={false}>
          {history.map((h) => {
            const isCurrent = h.id === offer.id;
            const hStatus = offerStatusColor(h.status);
            return (
              <div key={h.id} style={{
                padding: "10px 16px",
                display: "flex", alignItems: "center", gap: 10,
                borderBottom: `1px solid ${C.borderSoft}`,
                background: isCurrent ? C.accentSoft : "transparent",
                fontFamily: FONT,
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: C.ink, width: 40,
                  fontFamily: FONT_MONO,
                }}>v{h.version}</span>
                <span style={{
                  padding: "2px 8px", borderRadius: 999,
                  background: hStatus.bg, color: hStatus.fg,
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                  textTransform: "uppercase", flexShrink: 0,
                }}>{hStatus.label}</span>
                <span style={{ flex: 1, fontSize: 12, color: C.inkMuted }}>
                  {h.totalClientPrice != null
                    ? formatMoney(h.totalClientPrice, h.currencyCode)
                    : "—"}
                </span>
                <span style={{ fontSize: 11, color: C.inkDim }}>
                  {timeAgo(h.sentAt ?? h.createdAt)}
                </span>
                {isCurrent && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
                    color: C.accent, textTransform: "uppercase",
                  }}>Current</span>
                )}
              </div>
            );
          })}
        </SectionCard>
      )}
    </div>
  );
}

function LineItemRow({
  item, currency, editable, isMutating, onSave,
}: {
  item: InquiryOfferLineItem;
  currency: string;
  editable: boolean;
  isMutating: boolean;
  onSave: (patch: Partial<{
    label: string; units: number; unit_price: number; talent_cost: number; notes: string; pricing_unit: string;
  }>) => Promise<void>;
  tenantSlug: string;
}) {
  const [editing, setEditing] = useState(false);
  const [units, setUnits] = useState<string>(String(item.units));
  const [unitPrice, setUnitPrice] = useState<string>(String(item.unitPrice));
  const [label, setLabel] = useState(item.label);

  const reset = () => {
    setUnits(String(item.units));
    setUnitPrice(String(item.unitPrice));
    setLabel(item.label);
    setEditing(false);
  };

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 70px 110px 120px",
      gap: 10, padding: "10px 16px",
      borderBottom: `1px solid ${C.borderSoft}`,
      fontFamily: FONT, fontSize: 13, alignItems: "center",
      opacity: isMutating ? 0.5 : 1,
      transition: "opacity 120ms",
    }}>
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={inputSt}
          />
        ) : (
          <>
            <div style={{
              fontWeight: 600, color: C.ink,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{item.label}</div>
            {item.talentDisplayName && (
              <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 2 }}>
                {item.talentDisplayName}
              </div>
            )}
          </>
        )}
        {editable && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              padding: "2px 0", margin: "4px 0 0",
              border: "none", background: "transparent",
              color: C.accent, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: FONT,
            }}
          >Edit</button>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {editing ? (
          <input
            type="number"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            style={{ ...inputSt, width: 60, textAlign: "right" }}
          />
        ) : (
          <span style={{ fontFamily: FONT_MONO, color: C.ink }}>{item.units}</span>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {editing ? (
          <input
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            style={{ ...inputSt, width: 100, textAlign: "right" }}
          />
        ) : (
          <span style={{ fontFamily: FONT_MONO, color: C.ink }}>
            {formatMoney(item.unitPrice, currency)}
          </span>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {editing ? (
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={async () => {
                await onSave({
                  label,
                  units: Number(units) || 0,
                  unit_price: Number(unitPrice) || 0,
                });
                setEditing(false);
              }}
              disabled={isMutating}
              style={{
                padding: "3px 8px", borderRadius: 6,
                background: C.accent, color: "#fff", border: "none",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                fontFamily: FONT,
              }}
            >Save</button>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "3px 8px", borderRadius: 6,
                background: "transparent", color: C.inkMuted,
                border: `1px solid ${C.border}`,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                fontFamily: FONT,
              }}
            >Cancel</button>
          </div>
        ) : (
          <span style={{
            fontFamily: FONT_MONO, color: C.ink, fontWeight: 700,
          }}>
            {formatMoney(item.totalPrice, currency)}
          </span>
        )}
      </div>
    </div>
  );
}

const inputSt: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 6,
  border: `1px solid ${C.border}`,
  fontFamily: FONT, fontSize: 12, color: C.ink,
  background: C.cardBg, outline: "none",
  width: "100%", boxSizing: "border-box",
};

function primaryBtn(pending: boolean): React.CSSProperties {
  return {
    padding: "8px 14px", borderRadius: 8,
    background: C.accent, color: "#fff", border: "none",
    fontSize: 12.5, fontWeight: 700, cursor: pending ? "default" : "pointer",
    fontFamily: FONT, opacity: pending ? 0.5 : 1,
  };
}
function dangerBtn(pending: boolean): React.CSSProperties {
  return {
    padding: "8px 14px", borderRadius: 8,
    background: C.coralSoft, color: C.coralDeep,
    border: `1px solid ${C.coralDeep}`,
    fontSize: 12.5, fontWeight: 600, cursor: pending ? "default" : "pointer",
    fontFamily: FONT, opacity: pending ? 0.5 : 1,
  };
}
function ghostBtn(pending: boolean): React.CSSProperties {
  return {
    padding: "8px 14px", borderRadius: 8,
    background: "transparent", color: C.ink,
    border: `1px solid ${C.border}`,
    fontSize: 12.5, fontWeight: 600, cursor: pending ? "default" : "pointer",
    fontFamily: FONT, opacity: pending ? 0.5 : 1,
  };
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
        textTransform: "uppercase", color: C.inkDim, marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

// ─── FilesTab ─────────────────────────────────────────────────────────────────

export function FilesTab({
  tenantSlug,
  inquiryId,
  attachments,
}: {
  tenantSlug: string;
  inquiryId: string;
  attachments: InquiryAttachment[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("visibility", "staff");
        const res = await uploadInquiryAttachment(tenantSlug, inquiryId, fd);
        if (!res.ok) {
          setError(res.error);
          break;
        }
      }
      router.refresh();
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }, [tenantSlug, inquiryId, router]);

  const handleDelete = useCallback(async (id: string, filename: string) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    await deleteInquiryAttachment(tenantSlug, inquiryId, id);
    router.refresh();
  }, [tenantSlug, inquiryId, router]);

  const handleDownload = useCallback(async (id: string) => {
    const res = await getAttachmentSignedUrl(tenantSlug, inquiryId, id);
    if (res.ok && res.data) {
      window.open(res.data.url, "_blank", "noopener");
    } else {
      alert("Could not generate download link.");
    }
  }, [tenantSlug, inquiryId]);

  return (
    <div style={{
      padding: 16, overflowY: "auto", flex: 1, minHeight: 0,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <SectionCard
        title={`Files · ${attachments.length}`}
        action={
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              style={primaryBtn(uploading)}
            >
              {uploading ? "Uploading…" : "+ Upload file"}
            </button>
          </>
        }
        padContent={false}
      >
        {error && (
          <div style={{
            margin: 12, padding: "8px 12px",
            background: C.coralSoft, color: C.coralDeep,
            border: `1px solid ${C.coralDeep}`, borderRadius: 8,
            fontSize: 12, fontFamily: FONT,
          }}>
            {error}
          </div>
        )}
        {attachments.length === 0 ? (
          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }}
            style={{
              padding: 32, textAlign: "center",
              border: `2px dashed ${C.border}`, borderRadius: 12,
              margin: 12,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              color: C.inkMuted, fontFamily: FONT,
            }}
          >
            <div style={{ fontSize: 28, opacity: 0.5 }}>📁</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>No files yet</div>
            <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.5, maxWidth: 320 }}>
              Drop call sheets, contracts, references, or any files relevant to this inquiry.
              Drag files here or click upload.
            </div>
          </div>
        ) : attachments.map((att) => (
          <div key={att.id} style={{
            padding: "12px 16px",
            borderTop: `1px solid ${C.borderSoft}`,
            display: "flex", alignItems: "center", gap: 12,
            fontFamily: FONT,
          }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{fileIcon(att.mimeType)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13.5, fontWeight: 600, color: C.ink,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                letterSpacing: -0.05,
              }}>{att.filename}</div>
              <div style={{
                display: "flex", gap: 8, marginTop: 2,
                fontSize: 11.5, color: C.inkMuted,
              }}>
                <span>{formatBytes(att.byteSize)}</span>
                <span>·</span>
                <span>by {att.uploadedByName ?? "—"}</span>
                <span>·</span>
                <span>{timeAgo(att.createdAt)}</span>
                {att.visibility === "shared" && (
                  <>
                    <span>·</span>
                    <span style={{ color: C.success, fontWeight: 600 }}>Shared</span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDownload(att.id)}
              style={{
                padding: "5px 12px", borderRadius: 7,
                background: C.accentSoft, color: C.accent,
                border: `1px solid ${C.accentSoft}`,
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: FONT,
              }}
            >Download</button>
            <button
              type="button"
              onClick={() => handleDelete(att.id, att.filename)}
              aria-label="Delete file"
              style={{
                padding: "5px 8px", borderRadius: 7,
                background: "transparent", color: C.inkMuted,
                border: `1px solid ${C.border}`,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: FONT,
              }}
            >🗑</button>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ─── PaymentTab ───────────────────────────────────────────────────────────────

export function PaymentTab({
  transactions,
  currency,
}: {
  transactions: InquiryBookingTransaction[];
  currency: string | null;
}) {
  if (transactions.length === 0) {
    return (
      <div style={{ padding: 16, fontFamily: FONT }}>
        <SectionCard title="No payment activity yet">
          <div style={{
            padding: "16px 0", color: C.inkMuted, fontSize: 13, lineHeight: 1.6,
          }}>
            Payments appear here once the booking is confirmed and the client funds it.
            <div style={{ marginTop: 8, fontSize: 12, color: C.inkDim }}>
              Stripe integration handles capture, payout, refund, and dispute states.
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  // Aggregate
  const grossTotal = transactions.reduce((s, t) => s + t.grossAmountCents, 0);
  const platformFeeTotal = transactions.reduce((s, t) => s + t.platformFeeCents, 0);
  const netTotal = transactions.reduce((s, t) => s + t.netAmountCents, 0);
  const cur = currency ?? transactions[0]?.currency ?? "USD";

  return (
    <div style={{
      padding: 16, overflowY: "auto", flex: 1, minHeight: 0,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <SectionCard title={`Payment summary · ${transactions.length} transactions`}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
        }}>
          <KV label="Gross" value={
            <span style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: C.ink }}>
              {formatMoney(grossTotal / 100, cur)}
            </span>
          } />
          <KV label="Platform fee" value={
            <span style={{ fontFamily: FONT_MONO, color: C.inkMuted }}>
              {formatMoney(platformFeeTotal / 100, cur)}
            </span>
          } />
          <KV label="Net" value={
            <span style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: C.success }}>
              {formatMoney(netTotal / 100, cur)}
            </span>
          } />
        </div>
      </SectionCard>

      <SectionCard title="Transactions" padContent={false}>
        {transactions.map((tx) => {
          const tone = bookingTxStatusColor(tx.status);
          return (
            <div key={tx.id} style={{
              padding: "12px 16px",
              borderTop: `1px solid ${C.borderSoft}`,
              fontFamily: FONT,
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 999,
                  background: tone.bg, color: tone.fg,
                  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
                  textTransform: "uppercase", flexShrink: 0,
                }}>{tx.status}</span>
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: 600, color: C.ink,
                }}>
                  {tx.payerEmail ?? "—"} {tx.payoutReceiverDisplayName ? `→ ${tx.payoutReceiverDisplayName}` : ""}
                </span>
                <span style={{
                  fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: C.ink,
                }}>
                  {formatMoney(tx.grossAmountCents / 100, tx.currency)}
                </span>
              </div>
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 12,
                fontSize: 11.5, color: C.inkMuted,
              }}>
                {tx.provider && <span>{tx.provider}</span>}
                {tx.providerReference && (
                  <span style={{ fontFamily: FONT_MONO }}>{tx.providerReference}</span>
                )}
                {tx.paidAt && <span>Paid {timeAgo(tx.paidAt)}</span>}
                {tx.payoutCompletedAt && <span>Payout {timeAgo(tx.payoutCompletedAt)}</span>}
                {tx.refundedAt && (
                  <span style={{ color: C.coralDeep }}>
                    Refunded {timeAgo(tx.refundedAt)}
                  </span>
                )}
                {tx.failedAt && tx.failureReason && (
                  <span style={{ color: C.coralDeep }}>
                    Failed: {tx.failureReason}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
}
