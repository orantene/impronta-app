"use client";

/**
 * InspectorInfoTip — the ⓘ trigger + floating explanation used by every
 * inspector panel.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Inspector panels used to print every hint as a standing paragraph under its
 * control. A single container-block panel carried five of them, so the panel
 * read as a wall of prose and the operator had to hunt for the controls. The
 * copy is worth keeping — it just should not be the default state of the
 * panel. This moves it one hover away: the label keeps a small ⓘ, and the
 * explanation appears on hover, focus, or tap.
 *
 * WHY IT PORTALS
 * ──────────────
 * The inspector dock is an `overflow-y: auto` scroll container, so an
 * absolutely-positioned bubble is clipped at the panel edge — the exact trap
 * documented in `kit/portaled-overlay.tsx`. So this reuses the two proven
 * primitives instead of hand-rolling placement: `useAnchoredPopover` for
 * viewport-fixed coords (with flip-up near the bottom edge and re-placement on
 * scroll), and `PortaledOverlay` to render into <body>.
 *
 * INTERACTION MODEL
 * ─────────────────
 *   hover / focus  → opens (transient)
 *   click / tap    → pins it open, so touch users and anyone reading a long
 *                    explanation can move the pointer away
 *   Escape, outside click, or blur → closes
 * A short close grace period lets the pointer travel from the trigger into the
 * card without the card vanishing mid-journey.
 *
 * The copy passes through `useInspectorT`, the same translation boundary the
 * old inline hint used, so every string that was already Spanish stays Spanish
 * with no call-site change.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { PortaledOverlay } from "../../kit/portaled-overlay";
import { useAnchoredPopover } from "../../kit/use-anchored-popover";
import { useInspectorT } from "./use-inspector-t";

/** Card width in px — also fed to the placement math for viewport clamping. */
const TIP_WIDTH = 236;

/** Grace period (ms) before a hover-opened tip closes, so the pointer can reach the card. */
const CLOSE_GRACE_MS = 120;

export interface InspectorInfoTipProps {
  /**
   * The explanation. Plain strings are translated at the boundary; ReactNode
   * content (a fragment with a code sample, say) passes through untouched.
   */
  content: ReactNode;
  /**
   * Optional eyebrow above the copy — normally the field's own label, so a
   * pinned card still says what it is about once the pointer has moved away.
   */
  title?: string;
  /** Accessible name for the trigger. Defaults to "More info". */
  triggerLabel?: string;
  /** Nudges the trigger's optical alignment inside a label row. */
  className?: string;
}

export function InspectorInfoTip({
  content,
  title,
  triggerLabel = "More info",
  className,
}: InspectorInfoTipProps) {
  const { t, tn, to } = useInspectorT();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipId = useId();

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancelClose();
    setOpen(false);
    setPinned(false);
  }, [cancelClose]);

  // Outside-click + Escape + scroll-tracked placement, from the shared hook.
  const { triggerRef, popoverRef, position } = useAnchoredPopover<
    HTMLButtonElement,
    HTMLDivElement
  >({ open, onClose: close, width: TIP_WIDTH, align: "left", gap: 8 });

  useEffect(() => cancelClose, [cancelClose]);

  const openNow = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const closeSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      // A pinned tip survives the pointer leaving; only an explicit dismiss
      // (Escape, outside click, second click) closes it.
      setOpen((wasOpen) => (pinned ? wasOpen : false));
    }, CLOSE_GRACE_MS);
  }, [cancelClose, pinned]);

  const active = open;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t(triggerLabel)}
        aria-expanded={active}
        aria-describedby={active ? tipId : undefined}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        onFocus={openNow}
        onBlur={closeSoon}
        onClick={(event) => {
          // Stop the click reaching a parent label/row that would toggle a
          // control — the ⓘ sits inside clickable field headers.
          event.preventDefault();
          event.stopPropagation();
          if (pinned) {
            close();
          } else {
            setPinned(true);
            openNow();
          }
        }}
        className={`inspector-info-tip-trigger inline-flex shrink-0 cursor-help items-center justify-center rounded-full border bg-transparent p-0 align-middle transition-colors duration-150 ${className ?? ""}`}
        style={{
          width: 15,
          height: 15,
          borderWidth: 1.3,
          borderStyle: "solid",
          borderColor: active ? "#c4b5fd" : "#d6d0c4",
          background: active ? "#f3eefe" : "transparent",
          color: active ? "#7c3aed" : "#a8a29e",
          fontSize: 9.5,
          fontWeight: 700,
          lineHeight: 1,
          fontStyle: "normal",
        }}
      >
        <span aria-hidden style={{ transform: "translateY(0.5px)" }}>
          i
        </span>
      </button>

      {active && position ? (
        <PortaledOverlay>
          <div
            ref={popoverRef}
            id={tipId}
            role="tooltip"
            onMouseEnter={openNow}
            onMouseLeave={closeSoon}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: TIP_WIDTH,
              zIndex: 160,
              background: "#fffdf9",
              color: "#44403c",
              border: "1px solid #e5e0d5",
              borderRadius: 11,
              padding: "10px 12px",
              boxShadow:
                "0 8px 24px rgba(41, 37, 36, 0.16), 0 2px 6px rgba(41, 37, 36, 0.08)",
              fontSize: 12,
              lineHeight: 1.5,
              fontWeight: 400,
              letterSpacing: 0,
              textTransform: "none",
            }}
          >
            {title ? (
              <span
                style={{
                  display: "block",
                  marginBottom: 3,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: "#7c3aed",
                }}
              >
                {to(title)}
              </span>
            ) : null}
            {tn(content)}
          </div>
        </PortaledOverlay>
      ) : null}
    </>
  );
}

/**
 * Label row that carries an optional ⓘ. Every field primitive renders its
 * label through this, so the icon's size, gap and optical alignment are
 * defined once rather than at ~100 call sites.
 *
 * `info` absent → renders exactly the bare label it always did.
 */
export function InspectorLabelWithInfo({
  label,
  info,
  infoTitle,
  className,
}: {
  label: ReactNode;
  info?: ReactNode;
  /** Eyebrow for the tip card; defaults to the label when it is a string. */
  infoTitle?: string;
  className?: string;
}) {
  const { tn } = useInspectorT();
  const resolved = tn(label);
  if (info === undefined || info === null || info === false || info === "") {
    return <span className={className}>{resolved}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      {resolved}
      <InspectorInfoTip
        content={info}
        title={infoTitle ?? (typeof label === "string" ? label : undefined)}
      />
    </span>
  );
}
