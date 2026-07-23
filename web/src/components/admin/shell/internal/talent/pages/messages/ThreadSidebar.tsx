"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useDashboardText } from "../../../dashboard-i18n";
import { Avatar, ClientTrustChip, Icon } from "../../../primitives";
import { COLORS, FONTS, TRANSITION, useAdminShell } from "../../../state";
import { BubbleMenuItem } from "./Bubbles";
import { InfoSection, RateChangeRequest, ThreadActivityTimeline } from "./ThreadParts";
import { STAGE_META } from "../../shared/client-threads-1";
import { type Conversation } from "../../shared/conversations-1";



export function ThreadHeader({
  conv,
  infoOpen,
  onToggleInfo,
  onBackToList,
}: {
  conv: Conversation;
  infoOpen: boolean;
  onToggleInfo: () => void;
  onBackToList?: () => void;
}) {
  const copy = useDashboardText();
  const stage = STAGE_META[conv.stage];
  return (
    <div
      data-tulala-thread-header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 18px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        fontFamily: FONTS.body,
      }}
    >
      {/* Mobile back button — visible only at narrow widths via CSS.
          Returns from thread → list pane in the single-pane stack. */}
      {onBackToList && (
        <button
          type="button"
          className="tulala-mobile-back"
          onClick={onBackToList}
          aria-label={copy.t("Back to messages list")}
          style={{
            display: "none",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: COLORS.ink,
            cursor: "pointer",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            flexShrink: 0,
            marginRight: -4,
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <Avatar size={36} tone="auto" hashSeed={conv.client} initials={conv.clientInitials} />
      <div className="flex-1 min-w-0">
        <div data-tulala-thread-header-titlerow style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }} className="text-admin-ink">{conv.client}</span>
          <span data-tulala-thread-header-trust style={{ display: "inline-flex", flexShrink: 0 }}>
            <ClientTrustChip level={conv.clientTrust} />
          </span>
          <span
            data-tulala-thread-header-stage
            style={{
              fontSize: 9.5,
              fontWeight: 700,
                            padding: "2px 6px",
              borderRadius: 999,
              background: stage.bg,
              color: stage.tone,
              flexShrink: 0,
            }}
          >
            {stage.label}
          </span>
        </div>
        <div data-tulala-thread-header-brief style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {conv.brief} {conv.date && `· ${conv.date}`}
        </div>
      </div>
      {/* Right side — search + options + info toggle. Leader, location,
          schedule, transport now live in the right info sidebar (toggle
          this with the panel button on the right). */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          title={copy.t("Search in thread")}
          aria-label={copy.t("Search in thread")}
          style={iconButtonSm}
        >
          <Icon name="search" size={13} color={COLORS.inkMuted} stroke={1.7} />
        </button>
        <ThreadOptionsMenu />

        {/* Info panel toggle — sidebar-icon glyph with active state */}
        <button
          type="button"
          onClick={onToggleInfo}
          aria-label={infoOpen ? copy.t("Hide info panel") : copy.t("Show info panel")}
          aria-pressed={infoOpen}
          title={infoOpen ? copy.t("Hide details") : copy.t("Show details")}
          style={{
            ...iconButtonSm,
            background: infoOpen ? COLORS.fill : "#fff",
            color: infoOpen ? "#fff" : COLORS.inkMuted,
            borderColor: infoOpen ? COLORS.ink : COLORS.borderSoft,
          }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>
      </div>
    </div>
  );
}


const iconButtonSm: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 7,
  border: `1px solid ${COLORS.borderSoft}`,
  background: "#fff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};


/**
 * Thread options menu — the options button in the thread header.
 * Thread mutations are hidden until they can persist.
 */
function ThreadOptionsMenu() {
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-tulala-thread-options-menu]')) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        title={copy.t("Thread options")}
        aria-label={copy.t("Thread options")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={iconButtonSm}
      >
        <span style={{ fontFamily: FONTS.body, fontWeight: 700, letterSpacing: 1 }} className="text-admin-ink-muted">···</span>
      </button>
      {open && (
        <div
          data-tulala-thread-options-menu
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(11,11,13,0.15)",
            padding: 6,
            zIndex: 30,
            minWidth: 220,
            fontFamily: FONTS.body,
            animation: "tulala-bubble-action-in .14s ease",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, padding: "6px 10px 4px" }} className="text-admin-ink-muted">{copy.t("Thread actions coming soon")}</div>
          <div style={{ padding: "4px 10px 8px", fontSize: 12, lineHeight: 1.45 }} className="text-admin-ink-muted">
            {copy.t("Star, mute, pin, export, archive, and block need real thread mutations before they appear here.")}
          </div>
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 4px" }} />
          <BubbleMenuItem icon="x" label={copy.t("Close menu")} onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}


/**
 * Right-rail info sidebar — full pinned info + extras for the open
 * thread. Toggleable from the thread header. Stays clean at the top
 * of the chat (just the highlight); details on-demand here.
 *
 * Sections (in priority order, shown only when populated):
 *   1. Schedule + call time + location (with map link)
 *   2. Transport (editable by coordinator/client)
 *   3. Your rate / Your take-home (locked when booked)
 *   4. Coordinator note (private to talent ↔ coordinator)
 *   5. Leader (who's running this for you)
 *   6. Files & attachments (count from chat)
 *   7. Action items (open + completed)
 *   8. Stage actions: drop / cancel (when booked) · resolve conflict
 *      (when hold conflict)
 */
export function ThreadInfoSidebar({
  conv,
  isLocked,
  onClose,
}: {
  conv: Conversation;
  isLocked: boolean;
  onClose: () => void;
}) {
  const copy = useDashboardText();
  const { openDrawer } = useAdminShell();
  const [infoTab, setInfoTab] = useState<"details" | "activity">("details");
  // Audit P1-8 — actual swipe-down-to-dismiss for the mobile bottom
  // sheet. The drag-pill rendered by CSS was previously cosmetic; now
  // it's a real affordance. Tracks touch deltaY, translates the sheet,
  // and dismisses past 80px or 30% sheet-height (whichever is smaller).
  const sheetRef = useRef<HTMLElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const sheetHeightRef = useRef<number>(0);
  const onTouchStart = (e: React.TouchEvent) => {
    if (!sheetRef.current) return;
    // Only start a drag if the touch begins near the top of the sheet
    // (within the drag-pill region) — touching deeper inside should
    // scroll content, not drag the sheet.
    const rect = sheetRef.current.getBoundingClientRect();
    if (e.touches[0]!.clientY - rect.top > 28) return;
    dragStartY.current = e.touches[0]!.clientY;
    sheetHeightRef.current = rect.height;
    sheetRef.current.style.transition = "none";
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null || !sheetRef.current) return;
    const dy = e.touches[0]!.clientY - dragStartY.current;
    if (dy <= 0) return;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragStartY.current == null || !sheetRef.current) return;
    const endY = e.changedTouches[0]?.clientY ?? dragStartY.current;
    const dy = endY - dragStartY.current;
    const threshold = Math.min(80, sheetHeightRef.current * 0.3);
    sheetRef.current.style.transition = `transform ${TRANSITION.layout}`;
    if (dy > threshold) {
      sheetRef.current.style.transform = `translateY(100%)`;
      window.setTimeout(() => onClose(), 180);
    } else {
      sheetRef.current.style.transform = "translateY(0)";
    }
    dragStartY.current = null;
  };
  return (
    <aside
      ref={sheetRef as never}
      data-tulala-thread-info-sidebar
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        borderLeft: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        overflowY: "auto",
        minHeight: 0,
        fontFamily: FONTS.body,
        animation: "tulala-info-fade .18s ease",
      }}
    >
      <style>{`@keyframes tulala-info-fade { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }`}</style>

      {/* Sidebar header — Details / Activity tabs + close */}
      <InfoSidebarHeader onClose={onClose} tab={infoTab} onTabChange={setInfoTab} />
      {infoTab === "activity" ? (
        <ThreadActivityTimeline conv={conv} />
      ) : (
      <>

      {/* Section: Schedule */}
      {(conv.pinned.schedule || conv.pinned.callTime || conv.date) && (
        <InfoSection icon="calendar" label={copy.t("Schedule")}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }} className="text-admin-ink">
            {conv.date && <div className="font-medium">{conv.date}</div>}
            {conv.pinned.schedule && (
              <div style={{ fontSize: 12, marginTop: 3 }} className="text-admin-ink-muted">
                {conv.pinned.schedule}
              </div>
            )}
          </div>
        </InfoSection>
      )}

      {/* Section: Location */}
      {conv.location && (
        <InfoSection icon="map-pin" label={copy.t("Location")}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }} className="text-admin-ink">{conv.location}</div>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(conv.location)}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 8,
              fontSize: 11.5,
              fontWeight: 600,
              color: COLORS.indigo,
              textDecoration: "none",
            }}
          >
            <Icon name="external" size={11} color={COLORS.indigo} />
            {copy.t("Open in Maps")}
          </a>
        </InfoSection>
      )}

      {/* Section: Transport */}
      {conv.pinned.transport && (
        <InfoSection icon="external" label={copy.t("Transport")}>
          <div style={{ fontSize: 12.5, lineHeight: 1.55 }} className="text-admin-ink">
            {conv.pinned.transport}
          </div>
        </InfoSection>
      )}

      {/* Section: Your rate / Your take + change-request affordance */}
      {(conv.amountToYou || conv.pinned.rate) && (
        <InfoSection
          icon="info"
          label={conv.amountToYou ? copy.t("Your take-home") : conv.pinned.rate?.status === "you-quoted" ? copy.t("Your rate") : conv.pinned.rate?.status === "client-budget" ? copy.t("Client budget") : copy.t("Agreed rate")}
          locked={isLocked}
        >
          <div style={{ fontSize: 14.5, fontWeight: 600, fontFamily: FONTS.display, letterSpacing: -0.1 }} className="text-admin-green">
            {conv.amountToYou ?? conv.pinned.rate?.value ?? "—"}
          </div>
          {isLocked && (
            <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {copy.t("You see your take-home only. Full offer is between the agency and the client.")}
            </div>
          )}
          {/* Talent can ALWAYS request a change — even on a locked
              booking. Useful for scope creep, additional days, usage
              extensions. Sends a structured change-request to the
              coordinator who negotiates with the client. */}
          <RateChangeRequest currentValue={conv.amountToYou ?? conv.pinned.rate?.value ?? ""} />
        </InfoSection>
      )}

      {/* Section: Coordinator note (private) */}
      {conv.pinned.coordinatorNote && (
        <InfoSection icon="info" label={copy.t("From your coordinator (private)")}>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, fontStyle: "italic" }} className="text-admin-ink">
            &quot;{conv.pinned.coordinatorNote}&quot;
          </div>
        </InfoSection>
      )}

      {/* Section: Leader */}
      <InfoSection icon="user" label={copy.t("Leader on this")}>
        <button
          type="button"
          onClick={() => openDrawer("talent-agency-relationship")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "8px 10px",
            background: "rgba(11,11,13,0.03)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            textAlign: "left",
            fontFamily: FONTS.body,
          }}
        >
          <Avatar size={28} tone="ink" initials={conv.leader.initials} />
          <div className="flex-1 min-w-0">
            <div className="text-admin-ink text-admin-12h font-medium">{conv.leader.name}</div>
            <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{conv.leader.role}</div>
          </div>
          <Icon name="chevron-right" size={11} color={COLORS.inkDim} />
        </button>
      </InfoSection>

      {/* Section: Files (mock counts based on stage) */}
      <InfoSection icon="external" label={copy.t("Files & attachments")}>
        <div className="flex flex-col gap-1">
          {[
            { name: "Mood board (4 images)", kind: "📷" },
            ...(conv.stage === "booked" ? [
              { name: "Vogue_callsheet_v2.pdf", kind: "📄" },
              { name: "Vogue_Italia_Editorial_May14-15.pdf", kind: "📑" },
            ] : []),
            ...(conv.stage === "past" ? [
              { name: "Loewe_invoice_Apr18.pdf", kind: "📄" },
              { name: "Selects (12 images)", kind: "📷" },
            ] : []),
          ].map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: FONTS.body,
                fontSize: 12,
                color: COLORS.ink,
                transition: `background ${TRANSITION.micro}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.03)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span className="text-sm">{f.kind}</span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.name}
              </span>
            </button>
          ))}
        </div>
      </InfoSection>

      {/* Stage-specific actions: drop / cancel (when booked); resolve
          (when hold conflict) */}
      {conv.stage === "booked" && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${COLORS.borderSoft}` }}>
          <button
            type="button"
            onClick={() => undefined}
            style={{
              width: "100%",
              padding: "9px 12px",
              background: "transparent",
              border: `1px solid ${COLORS.coral}`,
              color: COLORS.coralDeep,
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 600,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.coralSoft)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {copy.t("Drop / cancel booking")}
          </button>
          <p style={{ fontSize: 10.5, marginTop: 6, lineHeight: 1.5 }} className="text-admin-ink-muted">
            {copy.t("Sends a cancel request to your coordinator. They negotiate with the client.")}
          </p>
        </div>
      )}
      {conv.id === "c4" && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${COLORS.borderSoft}` }}>
          <button
            type="button"
            onClick={() => openDrawer("talent-conflict-resolve")}
            style={{
              width: "100%",
              padding: "9px 12px",
              background: COLORS.coral,
              border: "none",
              color: "#fff",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            {copy.t("✨ Resolve conflict")}
          </button>
          <p style={{ fontSize: 10.5, marginTop: 6, lineHeight: 1.5 }} className="text-admin-ink-muted">
            {copy.t("This thread overlaps with another booking. Open the smart resolver to pick a path.")}
          </p>
        </div>
      )}
      </>
      )}
    </aside>
  );
}


/**
 * Info-sidebar header with Details / Activity tabs. The "Activity" tab
 * shows a chronological log of stage transitions, status changes, and
 * key actions on this thread — useful for quick handover or compliance.
 */
function InfoSidebarHeader({ onClose, tab, onTabChange }: {
  onClose: () => void;
  tab: "details" | "activity";
  onTabChange: (t: "details" | "activity") => void;
}) {
  const copy = useDashboardText();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px 0 16px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
      }}
    >
      <div role="tablist" aria-label={copy.t("Info tabs")} style={{ display: "inline-flex", gap: 0 }}>
        {(["details", "activity"] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t)}
              style={{
                padding: "8px 4px 10px",
                marginRight: 16,
                background: "transparent",
                border: "none",
                borderBottom: active ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                color: active ? COLORS.ink : COLORS.inkMuted,
                fontFamily: FONTS.display,
                fontSize: 13.5,
                fontWeight: active ? 500 : 400,
                letterSpacing: -0.05,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {copy.t(t)}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={copy.t("Close info panel")}
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          border: "none",
          background: "transparent",
          color: COLORS.inkMuted,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}
