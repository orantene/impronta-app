"use client";

/**
 * TalentInquiryFormSheet — the chat-off fallback (WSF PR D, report §7/§8,
 * scenario 08, QA Q3).
 *
 * Mounted INSTEAD of the guest chat launcher when the talent turned chat off
 * (`talent_sites.chat_enabled = false`). It answers the same window events the
 * launcher answers, so every Ask / Consultar / Pedir cotización entry point
 * keeps working without knowing which one is mounted:
 *   - `tulala:ask-question`   (Maison Ask, booking-sheet Ask / Chat now)
 *   - `tulala:open-guest-chat` (contact bridge "Ask a question")
 *   - `tulala:offering-request` (storefront cards), unless the catalog booking
 *     sheet took it (it announces itself on `tulala:maison-sheet`): one sheet,
 *     never two stacked.
 * The selected service(s) come from the shared pending-offering store the
 * catalog sheet and Maison Ask already write, so the form attaches exactly
 * what the dock would have.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
  buildInquiryFormPayload,
  type InquiryFormFieldError,
  type InquiryFormLine,
} from "@/lib/talent/inquiry-form-payload";
import { TASK_NOTE_MAX, briefFromDetail } from "@/lib/talent/offering-task-brief";
import { submitTalentInquiryForm } from "../_actions/talent-inquiry-form-action";
import { inquiryFormCopy, type InquiryFormCopyKey } from "./inquiry-form-copy";
import {
  clearPendingOffering,
  peekPendingOffering,
  type PendingOfferingDetail,
} from "./pending-offering-store";

type Phase = "edit" | "sending" | "failed" | "sent";

/** Wait this long before claiming an offering-request the catalog sheet may own. */
const SHEET_CLAIM_MS = 150;

function lineFromDetail(d: PendingOfferingDetail): InquiryFormLine {
  return {
    offeringId: d.offeringId,
    title: d.title,
    amountCents: d.amountCents,
    currency: d.currency,
    priceType: d.priceType,
    kind: d.kind,
    variantLabel: d.selection?.variantLabel ?? null,
    addOnLabels: d.selection?.addOnLabels ?? [],
    slotLabel: d.selection?.slotLabel ?? null,
    totalCents: d.selection?.totalCents ?? null,
    // G9b: the task travels as context; its note pre-fills the message box.
    // G13: intake answers from the sheet travel too.
    brief: briefFromDetail(d, false),
  };
}

/** G9b: the task-picker note, used to pre-fill an empty message box. */
function notePrefillFrom(d: PendingOfferingDetail | null | undefined): string {
  return d?.task ? (d.note ?? "").trim() : "";
}

/**
 * Lines from the pending store (the one the dock and catalog sheet share).
 * Same contract as the dock's "Asking about" card (#2385): the structured
 * payload is the FRONT offering; `askAbout` names every selected service and
 * is what the visitor sees.
 */
function linesFromPending(): InquiryFormLine[] {
  const p = peekPendingOffering();
  if (!p) return [];
  const names = (p.askAbout ?? []).filter((t) => t && t.trim());
  return [{ ...lineFromDetail(p), label: names.length > 1 ? names.join(" + ") : null }];
}

export function TalentInquiryFormSheet({
  tenantSlug,
  talentProfileId,
  talentProfileCode,
  talentName,
  sourcePage,
  locale,
  accentColor = null,
}: {
  tenantSlug: string;
  talentProfileId: string;
  talentProfileCode: string;
  talentName: string;
  sourcePage: string;
  locale: string;
  accentColor?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<InquiryFormLine[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<InquiryFormFieldError[]>([]);
  const [phase, setPhase] = useState<Phase>("edit");
  const [sentTo, setSentTo] = useState("");
  const sheetOpenRef = useRef(false);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const tx = (k: InquiryFormCopyKey, vars?: Record<string, string>) =>
    inquiryFormCopy(locale, k, vars);

  const openWith = useCallback((next: InquiryFormLine[], prefill = "") => {
    setLines(next);
    // Pre-fill only an empty box: never overwrite what the visitor typed.
    if (prefill) setMessage((m) => (m.trim() ? m : prefill));
    setErrors([]);
    setPhase((p) => (p === "sent" ? "edit" : p === "sending" ? p : "edit"));
    setOpen(true);
  }, []);

  useEffect(() => {
    const onSheet = (e: Event) => {
      const d = (e as CustomEvent).detail as { open?: boolean } | null;
      sheetOpenRef.current = d?.open === true;
    };
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | { demo?: boolean; offeringId?: string | null; offeringTitle?: string | null; message?: unknown }
        | null;
      if (d?.demo === true) return;
      // An on-page app (Nail Designer) hands over a starting message: pre-fill only.
      const appMessage = typeof d?.message === "string" ? d.message.trim().slice(0, TASK_NOTE_MAX) : "";
      const fromStore = linesFromPending();
      if (fromStore.length > 0) return openWith(fromStore, appMessage || notePrefillFrom(peekPendingOffering()));
      openWith(
        d?.offeringId && d.offeringTitle
          ? [{ offeringId: d.offeringId, title: d.offeringTitle }]
          : [],
        appMessage,
      );
    };
    const onOpenClean = () => {
      clearPendingOffering();
      openWith([]);
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onOfferingRequest = (e: Event) => {
      const d = (e as CustomEvent).detail as PendingOfferingDetail | null;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (sheetOpenRef.current) return; // the catalog sheet owns this click
        const ok = d && typeof d === "object" && d.offeringId;
        openWith(ok ? [lineFromDetail(d)] : [], ok ? notePrefillFrom(d) : "");
      }, SHEET_CLAIM_MS);
    };
    window.addEventListener("tulala:maison-sheet", onSheet);
    window.addEventListener("tulala:ask-question", onAsk);
    window.addEventListener("tulala:open-guest-chat", onOpenClean);
    window.addEventListener("tulala:offering-request", onOfferingRequest);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("tulala:maison-sheet", onSheet);
      window.removeEventListener("tulala:ask-question", onAsk);
      window.removeEventListener("tulala:open-guest-chat", onOpenClean);
      window.removeEventListener("tulala:offering-request", onOfferingRequest);
    };
  }, [openWith]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    firstFieldRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const submit = async () => {
    const built = buildInquiryFormPayload(
      { name, email, message, honeypot },
      { tenantSlug, talentProfileId, talentProfileCode, sourcePage, locale, lines },
    );
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors([]);
    setPhase("sending");
    try {
      const res = await submitTalentInquiryForm(built.input);
      if (res.ok) {
        clearPendingOffering();
        setSentTo(res.guestEmail || email.trim());
        setMessage("");
        setPhase("sent");
        return;
      }
      if (res.code === "validation_failed") {
        setPhase("edit");
        setErrors(["message"]);
        return;
      }
      setPhase("failed");
    } catch {
      setPhase("failed");
    }
  };

  if (!open) return null;

  const accent = accentColor || "CanvasText";
  const field = (err: boolean): CSSProperties => ({
    width: "100%",
    minHeight: 44,
    boxSizing: "border-box",
    padding: "10px 12px",
    fontSize: 16,
    font: "inherit",
    color: "CanvasText",
    background: "Canvas",
    border: `1px solid ${err ? "var(--tl-danger, crimson)" : "color-mix(in srgb, CanvasText 22%, transparent)"}`,
    borderRadius: 12,
  });
  const label: CSSProperties = { display: "grid", gap: 6, fontSize: 14, fontWeight: 600 };
  const errText: CSSProperties = { color: "var(--tl-danger, crimson)", fontSize: 13, fontWeight: 400 };
  const primary: CSSProperties = {
    minHeight: 48,
    width: "100%",
    border: 0,
    borderRadius: 999,
    background: accent,
    color: "Canvas",
    font: "inherit",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div
      data-talent-inquiry-form=""
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== "sending") setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "color-mix(in srgb, CanvasText 45%, transparent)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tl-inquiry-form-title"
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "92dvh",
          overflowY: "auto",
          boxSizing: "border-box",
          padding: "20px 16px calc(20px + env(safe-area-inset-bottom))",
          background: "Canvas",
          color: "CanvasText",
          borderRadius: "20px 20px 0 0",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <h2 id="tl-inquiry-form-title" style={{ flex: 1, margin: 0, fontSize: 19 }}>
            {phase === "sent" ? tx("sentTitle") : tx("title", { name: talentName })}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={phase === "sending"}
            aria-label={tx("close")}
            style={{
              width: 44,
              height: 44,
              border: 0,
              borderRadius: 999,
              background: "transparent",
              color: "inherit",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {phase === "sent" ? (
          <div role="status" style={{ display: "grid", gap: 16 }}>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>
              {tx("sentBody", { name: talentName, email: sentTo })}
            </p>
            <button type="button" style={primary} onClick={() => setOpen(false)}>
              {tx("done")}
            </button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (phase !== "sending") void submit();
            }}
            style={{ display: "grid", gap: 14 }}
          >
            {lines.length > 0 ? (
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>{tx("about")}</span>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {lines.map((l) => (
                    <li
                      key={l.offeringId}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        paddingLeft: 12,
                        borderRadius: 999,
                        border: "1px solid color-mix(in srgb, CanvasText 22%, transparent)",
                        fontSize: 14,
                      }}
                    >
                      <span>{l.label || l.title}</span>
                      <button
                        type="button"
                        aria-label={tx("removeService", { title: l.label || l.title })}
                        onClick={() => setLines((ls) => ls.filter((x) => x.offeringId !== l.offeringId))}
                        style={{
                          width: 44,
                          height: 44,
                          border: 0,
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <label style={label}>
              {tx("name")}
              <input
                ref={firstFieldRef}
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={errors.includes("name")}
                style={field(errors.includes("name"))}
              />
              {errors.includes("name") ? <span style={errText}>{tx("errName")}</span> : null}
            </label>
            <label style={label}>
              {tx("email")}
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={errors.includes("email")}
                style={field(errors.includes("email"))}
              />
              {errors.includes("email") ? <span style={errText}>{tx("errEmail")}</span> : null}
            </label>
            <label style={label}>
              {tx("message")}
              <textarea
                rows={4}
                value={message}
                placeholder={tx("messageHint")}
                onChange={(e) => setMessage(e.target.value)}
                aria-invalid={errors.includes("message")}
                style={{ ...field(errors.includes("message")), resize: "vertical" }}
              />
              {errors.includes("message") ? <span style={errText}>{tx("errMessage")}</span> : null}
            </label>
            {/* Honeypot: off-screen, never focusable. A value is a silent reject. */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
            />

            {phase === "failed" ? (
              <p role="alert" style={{ ...errText, margin: 0, fontSize: 14 }}>
                {tx("failed")}
              </p>
            ) : null}

            <button type="submit" style={primary} disabled={phase === "sending"} aria-busy={phase === "sending"}>
              {phase === "sending" ? tx("sending") : phase === "failed" ? tx("retry") : tx("send")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
