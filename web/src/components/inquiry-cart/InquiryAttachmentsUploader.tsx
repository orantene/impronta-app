"use client";

/**
 * InquiryAttachmentsUploader — drag-drop + multi-file attachment UI.
 *
 * Step 14 of the inquiry-funnel sprint (2026-05-14).
 *
 * Two render modes:
 *
 *   • "live"  (default) — uploads land in `inquiry_attachments` immediately
 *     via the supplied server action. Used on the post-create inquiry
 *     detail page where `inquiryId` is known.
 *
 *   • "queued"            — files are held in component state only. The
 *     parent form receives the file list (via `onQueueChange`) and is
 *     responsible for uploading after the inquiry exists. Used inside
 *     the inquiry creation forms where the inquiry id doesn't yet exist
 *     pre-submit. Queued files are also persisted to sessionStorage so
 *     a navigation between the form and the inquiry detail page can
 *     drain them.
 *
 * Both modes render: a drag-drop zone, a file-input fallback button, an
 * attachment-kind selector, per-file progress chips, and a remove button
 * on each existing attachment chip.
 *
 * The component is deliberately presentational about styling — it uses
 * the same inline-style palette as the surrounding NewInquiryForm /
 * cart so it doesn't pull in shadcn imports that would force every
 * caller through the global theme.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import type {
  ClientAttachmentActionResult,
  ClientAttachmentListResult,
  ClientAttachmentRemoveResult,
} from "@/lib/server-actions/client-inquiry-attachments";

// ── Palette (matches NewInquiryForm) ─────────────────────────────────────────

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.40)",
  borderSoft: "rgba(24,24,27,0.08)",
  border: "rgba(24,24,27,0.16)",
  cardBg: "#ffffff",
  surfaceAlt: "#F7F7F8",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  red: "#A33A3A",
  redSoft: "rgba(163,58,58,0.10)",
  ok: "#1F5C40",
  okSoft: "rgba(31,92,64,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ── Types ────────────────────────────────────────────────────────────────────

export type AttachmentKind = "mood_board" | "contract" | "reference" | "other";

const KIND_LABELS: Record<AttachmentKind, string> = {
  mood_board: "Mood board",
  contract: "Contract",
  reference: "Reference",
  other: "Other",
};

const KIND_OPTIONS: ReadonlyArray<{ value: AttachmentKind; label: string }> = [
  { value: "mood_board", label: "Mood board" },
  { value: "reference", label: "Reference" },
  { value: "contract", label: "Contract" },
  { value: "other", label: "Other" },
];

export interface ExistingAttachment {
  id: string;
  filename: string;
  byteSize: number | null;
  attachmentKind: string | null;
  isMine: boolean;
}

interface QueuedFile {
  id: string; // local-only nonce
  file: File;
  kind: AttachmentKind;
}

interface ProgressEntry {
  localId: string;
  filename: string;
  status: "uploading" | "ok" | "err";
  error?: string;
}

// ── Common props ─────────────────────────────────────────────────────────────

interface CommonProps {
  /** Optional label above the dropzone. Defaults to "Attachments". */
  label?: string;
  /** Hint copy under the dropzone. */
  hint?: string;
  /** Max bytes per file. Default: 100 MB. */
  maxBytes?: number;
  /** Accepted MIME prefixes (e.g. ["image/", "application/pdf"]). */
  acceptedTypes?: string[];
}

interface LiveProps extends CommonProps {
  mode: "live";
  inquiryId: string;
  /**
   * Pre-fetched existing attachments (server-loaded on first paint).
   * Optional — the component will fall back to its own client-side
   * loader using `listAction` when this is omitted.
   */
  initialAttachments?: ExistingAttachment[];
  /** Upload action — receives FormData(file, inquiryId, attachmentKind). */
  uploadAction: (formData: FormData) => Promise<ClientAttachmentActionResult>;
  /** Soft-delete action. */
  removeAction: (
    attachmentId: string,
  ) => Promise<ClientAttachmentRemoveResult>;
  /** Optional refresh action for live re-listing after upload. */
  listAction?: (inquiryId: string) => Promise<ClientAttachmentListResult>;
}

interface QueuedProps extends CommonProps {
  mode: "queued";
  /** Stable key used for sessionStorage handoff between form + detail page. */
  queueKey: string;
  /** Called whenever the queued file list changes. */
  onQueueChange?: (files: QueuedFile[]) => void;
}

export type InquiryAttachmentsUploaderProps = LiveProps | QueuedProps;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function localId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `q-${Date.now()}-${Math.random()}`;
}

function isAcceptedType(file: File, accepted?: string[]): boolean {
  if (!accepted || accepted.length === 0) return true;
  return accepted.some((prefix) =>
    file.type.toLowerCase().startsWith(prefix.toLowerCase()),
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function InquiryAttachmentsUploader(
  props: InquiryAttachmentsUploaderProps,
) {
  const {
    label = "Attachments",
    hint,
    maxBytes = 100 * 1024 * 1024,
    acceptedTypes,
  } = props;

  const [selectedKind, setSelectedKind] = useState<AttachmentKind>("mood_board");
  const [dragHover, setDragHover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [, startTransition] = useTransition();

  // ── LIVE mode state ────────────────────────────────────────────────────────
  const [liveAttachments, setLiveAttachments] = useState<ExistingAttachment[]>(
    props.mode === "live" ? (props.initialAttachments ?? []) : [],
  );

  const refreshLive = useCallback(async () => {
    if (props.mode !== "live" || !props.listAction) return;
    const r = await props.listAction(props.inquiryId);
    if (r.ok) {
      setLiveAttachments(
        r.data.map((d) => ({
          id: d.id,
          filename: d.filename,
          byteSize: d.byteSize,
          attachmentKind: d.attachmentKind,
          isMine: d.isMine,
        })),
      );
    }
    // Soft-fail on error — keep the optimistic list.
  }, [props]);

  // ── QUEUED mode state ──────────────────────────────────────────────────────
  const [queue, setQueue] = useState<QueuedFile[]>([]);

  // Persist queued File objects' metadata to sessionStorage so a
  // post-submit redirect doesn't lose context. Note: actual File bytes
  // can't be persisted; the detail page that drains the queue must
  // re-prompt the user if they navigate before the upload completes.
  useEffect(() => {
    if (props.mode !== "queued" || typeof window === "undefined") return;
    try {
      const summary = queue.map((q) => ({
        id: q.id,
        name: q.file.name,
        size: q.file.size,
        type: q.file.type,
        kind: q.kind,
      }));
      window.sessionStorage.setItem(
        `inquiry-att-queue:${props.queueKey}`,
        JSON.stringify(summary),
      );
    } catch {
      // sessionStorage may be unavailable (private mode); silent.
    }
  }, [queue, props]);

  // Notify parent whenever the queue changes.
  useEffect(() => {
    if (props.mode !== "queued") return;
    props.onQueueChange?.(queue);
  }, [queue, props]);

  // ── File intake ────────────────────────────────────────────────────────────

  const ingestFiles = useCallback(
    (incoming: FileList | File[]) => {
      const files = Array.from(incoming);
      if (files.length === 0) return;

      const valid: File[] = [];
      const errors: ProgressEntry[] = [];

      for (const f of files) {
        if (f.size === 0) {
          errors.push({
            localId: localId(),
            filename: f.name,
            status: "err",
            error: "File is empty.",
          });
          continue;
        }
        if (f.size > maxBytes) {
          errors.push({
            localId: localId(),
            filename: f.name,
            status: "err",
            error: `Exceeds ${formatBytes(maxBytes)} cap.`,
          });
          continue;
        }
        if (!isAcceptedType(f, acceptedTypes)) {
          errors.push({
            localId: localId(),
            filename: f.name,
            status: "err",
            error: "File type not accepted.",
          });
          continue;
        }
        valid.push(f);
      }

      if (errors.length > 0) {
        setProgressEntries((prev) => [...prev, ...errors]);
      }
      if (valid.length === 0) return;

      if (props.mode === "queued") {
        setQueue((prev) => [
          ...prev,
          ...valid.map((file) => ({
            id: localId(),
            file,
            kind: selectedKind,
          })),
        ]);
        return;
      }

      // LIVE mode — fire one upload per file. Each gets a progress
      // entry that flips to ok / err as the action resolves.
      for (const file of valid) {
        const lid = localId();
        setProgressEntries((prev) => [
          ...prev,
          { localId: lid, filename: file.name, status: "uploading" },
        ]);

        startTransition(async () => {
          const fd = new FormData();
          fd.set("inquiryId", props.inquiryId);
          fd.set("file", file);
          fd.set("attachmentKind", selectedKind);

          try {
            const r = await props.uploadAction(fd);
            if (r.ok) {
              setProgressEntries((prev) =>
                prev.map((p) =>
                  p.localId === lid ? { ...p, status: "ok" } : p,
                ),
              );
              setLiveAttachments((prev) => [
                {
                  id: r.data.attachmentId,
                  filename: r.data.filename,
                  byteSize: r.data.byteSize,
                  attachmentKind: r.data.attachmentKind,
                  isMine: true,
                },
                ...prev,
              ]);
              // Best-effort re-list to pull canonical timestamps.
              void refreshLive();
            } else {
              setProgressEntries((prev) =>
                prev.map((p) =>
                  p.localId === lid
                    ? { ...p, status: "err", error: r.error }
                    : p,
                ),
              );
            }
          } catch (err) {
            setProgressEntries((prev) =>
              prev.map((p) =>
                p.localId === lid
                  ? {
                      ...p,
                      status: "err",
                      error:
                        err instanceof Error ? err.message : "Upload failed.",
                    }
                  : p,
              ),
            );
          }
        });
      }
    },
    [acceptedTypes, maxBytes, props, refreshLive, selectedKind],
  );

  // ── DnD handlers ───────────────────────────────────────────────────────────

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragHover(false);
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        ingestFiles(event.dataTransfer.files);
      }
    },
    [ingestFiles],
  );

  // ── Remove ─────────────────────────────────────────────────────────────────

  const removeLive = useCallback(
    async (attachmentId: string) => {
      if (props.mode !== "live") return;
      const r = await props.removeAction(attachmentId);
      if (r.ok) {
        setLiveAttachments((prev) =>
          prev.filter((a) => a.id !== attachmentId),
        );
      } else {
        setProgressEntries((prev) => [
          ...prev,
          {
            localId: localId(),
            filename: "Remove failed",
            status: "err",
            error: r.error,
          },
        ]);
      }
    },
    [props],
  );

  const removeQueued = useCallback((id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const inProgressCount = useMemo(
    () => progressEntries.filter((p) => p.status === "uploading").length,
    [progressEntries],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: FONT,
      }}
    >
      {/* Header row — label + kind selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>
          {label}
        </span>
        <span style={{ flex: 1 }} />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11.5,
            color: C.inkMuted,
          }}
        >
          Type:
          <select
            value={selectedKind}
            onChange={(e) => setSelectedKind(e.target.value as AttachmentKind)}
            style={{
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 6,
              padding: "4px 6px",
              fontSize: 11.5,
              fontFamily: FONT,
              color: C.ink,
              background: "#fff",
            }}
          >
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Drag-drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragHover(true);
        }}
        onDragLeave={() => setDragHover(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        style={{
          border: `1.5px dashed ${dragHover ? C.accent : C.border}`,
          borderRadius: 10,
          background: dragHover ? C.accentSoft : C.surfaceAlt,
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          color: dragHover ? C.accent : C.ink,
          transition: "border-color 0.12s, background 0.12s",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
        >
          <path
            d="M10 3v10M5.5 7.5L10 3l4.5 4.5M3 17h14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
          Drop files or click to browse
        </span>
        <span style={{ fontSize: 11, color: C.inkMuted, textAlign: "center" }}>
          {hint ??
            "Briefs, mood boards, contracts, reference shots. Max 100 MB per file."}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        accept={acceptedTypes?.join(",")}
        onChange={(e) => {
          if (e.target.files) ingestFiles(e.target.files);
          // Reset so re-picking the same file fires onChange again.
          e.target.value = "";
        }}
      />

      {/* In-flight progress entries */}
      {progressEntries.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {progressEntries.map((p) => (
            <div
              key={p.localId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 9px",
                borderRadius: 6,
                fontSize: 11.5,
                background:
                  p.status === "err"
                    ? C.redSoft
                    : p.status === "ok"
                      ? C.okSoft
                      : C.surfaceAlt,
                color:
                  p.status === "err"
                    ? C.red
                    : p.status === "ok"
                      ? C.ok
                      : C.inkMuted,
              }}
            >
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.filename}
              </span>
              <span className="font-semibold">
                {p.status === "uploading"
                  ? "Uploading…"
                  : p.status === "ok"
                    ? "Uploaded"
                    : p.error || "Failed"}
              </span>
              {(p.status === "ok" || p.status === "err") && (
                <button
                  type="button"
                  onClick={() =>
                    setProgressEntries((prev) =>
                      prev.filter((x) => x.localId !== p.localId),
                    )
                  }
                  aria-label="Dismiss"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "currentColor",
                    cursor: "pointer",
                    fontSize: 12,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Queued mode chips — files awaiting parent to drain */}
      {props.mode === "queued" && queue.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: C.inkMuted,
            }}
          >
            Ready to attach when you send · {queue.length}
          </div>
          {queue.map((q) => (
            <AttachmentChip
              key={q.id}
              filename={q.file.name}
              byteSize={q.file.size}
              kind={q.kind}
              ownedByMe
              onRemove={() => removeQueued(q.id)}
            />
          ))}
        </div>
      )}

      {/* Live mode existing attachments */}
      {props.mode === "live" && liveAttachments.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: C.inkMuted,
            }}
          >
            Attached files · {liveAttachments.length}
            {inProgressCount > 0 ? ` (${inProgressCount} uploading)` : ""}
          </div>
          {liveAttachments.map((a) => (
            <AttachmentChip
              key={a.id}
              filename={a.filename}
              byteSize={a.byteSize}
              kind={a.attachmentKind as AttachmentKind | null}
              ownedByMe={a.isMine}
              onRemove={
                a.isMine ? () => void removeLive(a.id) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Attachment chip ──────────────────────────────────────────────────────────

function AttachmentChip({
  filename,
  byteSize,
  kind,
  ownedByMe,
  onRemove,
}: {
  filename: string;
  byteSize: number | null;
  kind: AttachmentKind | string | null;
  ownedByMe: boolean;
  onRemove?: () => void;
}) {
  const kindLabel =
    kind && (kind as string) in KIND_LABELS
      ? KIND_LABELS[kind as AttachmentKind]
      : null;
  const size = formatBytes(byteSize);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        background: "#fff",
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 8,
        fontSize: 12,
        color: C.ink,
        fontFamily: FONT,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden
        style={{ color: C.inkMuted, flexShrink: 0 }}
      >
        <path
          d="M3 1.5h5l3 3v7.5a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5z M8 1.5V4.5h3"
          stroke="currentColor"
          strokeWidth="1.2"
          fill="none"
        />
      </svg>
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {filename}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: C.inkMuted,
            marginTop: 1,
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          {size && <span>{size}</span>}
          {kindLabel && (
            <span
              style={{
                background: C.accentSoft,
                color: C.accent,
                padding: "1px 6px",
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 10,
                letterSpacing: 0.2,
              }}
            >
              {kindLabel}
            </span>
          )}
          {!ownedByMe && (
            <span style={{ color: C.inkDim }}>· shared by team</span>
          )}
        </div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${filename}`}
          style={{
            border: "none",
            background: "transparent",
            color: C.inkMuted,
            cursor: "pointer",
            padding: 4,
            fontSize: 14,
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = C.red;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = C.inkMuted;
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
