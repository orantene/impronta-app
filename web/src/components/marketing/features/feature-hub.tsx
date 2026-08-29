"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { withLocaleHref } from "@/i18n/pathnames";
import type { FeatureKey, FeaturePopupPayload, Para } from "@/lib/marketing/features";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { FeatureIcon } from "./feature-icons";

/**
 * The plate reader: one context, one dialog, opened from anywhere on a page.
 *
 * A plate in the grid and a feature named inside a sentence both open the same
 * popup, so the reader can check what something is without losing their place.
 * The dialog is authored here rather than adapted from another marketing
 * section, because the hub has its own visual language: a specimen plate
 * lifted off the page, not a card in a modal.
 *
 * The anchor underneath every trigger is a real link to the full page. Script
 * intercepts the click to open the popup instead, which keeps the popup as a
 * convenience rather than a place content is trapped: crawlers, middle clicks
 * and readers without script all reach the page itself.
 */

type HubContext = {
  open: (key: FeatureKey, from: string) => void;
  isOpen: boolean;
};

const Ctx = React.createContext<HubContext | null>(null);

export function useFeatureHub(): HubContext {
  return (
    React.useContext(Ctx) ?? {
      // A trigger rendered outside a provider still works as a plain link.
      open: () => {},
      isOpen: false,
    }
  );
}

export function FeatureHubProvider({
  payloads,
  locale,
  children,
}: {
  payloads: FeaturePopupPayload[];
  locale: string;
  children: React.ReactNode;
}) {
  const [openKey, setOpenKey] = React.useState<FeatureKey | null>(null);
  const returnFocusTo = React.useRef<HTMLElement | null>(null);

  const open = React.useCallback((key: FeatureKey, from: string) => {
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    setOpenKey(key);
    trackProductEvent("marketing_cta_clicked", {
      source_page: "feature-hub",
      intent: `feature-popup:${key}`,
      surface: from,
    });
  }, []);

  const close = React.useCallback(() => {
    setOpenKey(null);
    // Send focus back where it came from, or the reader loses their place.
    returnFocusTo.current?.focus?.();
  }, []);

  const value = React.useMemo<HubContext>(
    () => ({ open, isOpen: openKey !== null }),
    [open, openKey],
  );

  const payload = openKey ? payloads.find((p) => p.key === openKey) : undefined;

  return (
    <Ctx.Provider value={value}>
      {children}
      {payload ? (
        <FeaturePlateDialog
          payload={payload}
          locale={locale}
          onClose={close}
          onOpenOther={(key) => open(key, "popup")}
        />
      ) : null}
    </Ctx.Provider>
  );
}

// ─── The dialog ──────────────────────────────────────────────────────────────

function FeaturePlateDialog({
  payload,
  locale,
  onClose,
  onOpenOther,
}: {
  payload: FeaturePopupPayload;
  locale: string;
  onClose: () => void;
  onOpenOther: (key: FeatureKey) => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  React.useEffect(() => {
    // Move focus into the plate so the keyboard and a screen reader follow.
    cardRef.current?.focus();
  }, [payload.key]);

  if (!mounted) return null;

  const titleId = `feature-plate-title-${payload.key}`;
  const isComing = payload.status === "coming";
  const readMore = locale === "es" ? "Ver la función completa" : "See the full feature";
  const closeLabel = locale === "es" ? "Cerrar" : "Close";
  const comingLabel = locale === "es" ? "Próximamente" : "Coming soon";
  const relatedLabel = locale === "es" ? "Relacionado" : "Related";

  return createPortal(
    // The portal escapes the layout, so the marketing token scope has to be
    // re-declared here or every colour below resolves to nothing.
    <div data-platform-surface="marketing">
      <div
        className="fixed inset-0 z-[200] mkt-plate-scrim"
        style={{ background: "rgba(22, 26, 22, 0.42)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-0 z-[201] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="mkt-plate-rise relative w-full max-w-[34rem] outline-none"
          style={{
            background: "var(--plt-bg-raised)",
            border: "1px solid var(--plt-hairline)",
            borderRadius: "var(--tl-radius-lg)",
            boxShadow: "var(--tl-shadow-lg)",
          }}
        >
          {/* The spine: the same drawn line that threads the grid, entering
              the plate and running down its left edge. */}
          <span
            aria-hidden
            className="absolute left-0 top-8 bottom-8 w-px"
            style={{ background: "var(--plt-hairline-strong)" }}
          />

          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            style={{ color: "var(--plt-muted)" }}
          >
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <div className="px-7 pb-8 pt-9 sm:px-10 sm:pb-10 sm:pt-11">
            <div className="flex items-start gap-5">
              <span
                className="plt-numeral shrink-0 leading-none"
                style={{ fontSize: "2.75rem", color: "var(--plt-accent)" }}
              >
                {String(payload.plate).padStart(2, "0")}
              </span>
              <span style={{ color: "var(--plt-forest)" }}>
                <FeatureIcon featureKey={payload.key} size={40} />
              </span>
            </div>

            <p className="plt-eyebrow mt-6" style={{ color: "var(--plt-muted)" }}>
              {payload.stage}
              {isComing ? (
                <span
                  className="ml-2 rounded-full px-2 py-[2px]"
                  style={{
                    background: "var(--tl-warning-bg)",
                    color: "var(--tl-warning)",
                    fontSize: "0.625rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  {comingLabel}
                </span>
              ) : null}
            </p>

            <h2
              id={titleId}
              className="plt-display mt-2"
              style={{ fontSize: "clamp(1.65rem, 4vw, 2.15rem)", color: "var(--plt-ink)" }}
            >
              {payload.name}
            </h2>

            <p
              className="plt-display-serif mt-2 italic"
              style={{ fontSize: "1.0625rem", color: "var(--plt-forest)" }}
            >
              {payload.promise}
            </p>

            <div
              className="plt-body mt-5 flex flex-col gap-3"
              style={{ color: "var(--plt-ink-soft)", fontSize: "0.9375rem", lineHeight: 1.65 }}
            >
              {payload.body.map((para, i) => (
                <p key={i}>
                  <PopupPara para={para} onOpenOther={onOpenOther} locale={locale} />
                </p>
              ))}
            </div>

            {payload.related.length > 0 ? (
              <div className="mt-7">
                <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
                  {relatedLabel}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {payload.related.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => onOpenOther(r.key)}
                      className="inline-flex items-center gap-2 rounded-full px-3 py-[6px] transition-colors"
                      style={{
                        border: "1px solid var(--plt-hairline)",
                        color: "var(--plt-ink-soft)",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <span className="plt-numeral" style={{ color: "var(--plt-muted-soft)" }}>
                        {String(r.plate).padStart(2, "0")}
                      </span>
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex items-center gap-4">
              <a
                href={withLocaleHref(payload.path, locale)}
                className="inline-flex items-center gap-2 rounded-full px-5 py-[10px] font-medium transition-colors"
                style={{
                  background: "var(--plt-forest)",
                  color: "var(--plt-forest-on)",
                  fontSize: "0.875rem",
                }}
              >
                {readMore}
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h13M12 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PopupPara({
  para,
  onOpenOther,
  locale,
}: {
  para: Para;
  onOpenOther: (key: FeatureKey) => void;
  locale: string;
}) {
  return (
    <>
      {para.map((seg, i) =>
        typeof seg === "string" ? (
          <React.Fragment key={i}>{seg}</React.Fragment>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onOpenOther(seg.f)}
            className="underline decoration-dotted underline-offset-[3px] transition-colors"
            style={{ color: "var(--plt-forest)" }}
            lang={locale}
          >
            {seg.label}
          </button>
        ),
      )}
    </>
  );
}
