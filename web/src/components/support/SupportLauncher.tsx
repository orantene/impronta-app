"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { startDiagnosticsCollector } from "@/lib/support/diagnostics/collector";
import { useT } from "@/i18n/use-t";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS } from "./support-tokens";
import { useCompactViewport } from "./use-compact-viewport";
import { SupportPanel } from "./SupportPanel";
import type { SupportContract } from "./support-contract";
import { useSupportDeepLink, useSupportUnread } from "./support-hooks";
import { GUIDE_OPEN_EVENT, type GuideOpenDetail } from "@/lib/guide/open-guide";

export function SupportLauncher({
  contract,
  drawerOpen = false,
}: {
  contract: SupportContract;
  drawerOpen?: boolean;
}) {
  const t = useT();
  const compact = useCompactViewport();
  const [open, setOpen] = useState(false);
  const [tickets, setTicketsState] = useState(contract.initialTickets);
  const [deepLinkTicketId, setDeepLinkTicketId] = useState<string | null>(null);
  const [guideNodeId, setGuideNodeId] = useState<string | null>(null);
  // The (i) next to a page title (PageHeader guideNodeId) and, later, Helper
  // mode on real pages: open the drawer straight onto that article.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<GuideOpenDetail>).detail;
      if (!detail?.nodeId) return;
      setGuideNodeId(detail.nodeId);
      setOpen(true);
    };
    window.addEventListener(GUIDE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(GUIDE_OPEN_EVENT, onOpen);
  }, []);
  const setTickets = useCallback(
    (updater: (prev: typeof tickets) => typeof tickets) => setTicketsState(updater),
    [],
  );
  useEffect(() => {
    startDiagnosticsCollector();
  }, []);
  // Email "Reply in app" CTAs land with ?support=<ticketId>: the deep link
  // must OPEN the panel, not just preselect a thread inside a closed one.
  useSupportDeepLink(
    useCallback((id: string) => {
      setDeepLinkTicketId(id);
      setOpen(true);
    }, []),
  );
  const unread = useSupportUnread(tickets);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const hide = drawerOpen || open;

  // The workspace identity bar offers a slot left of the avatar
  // (`data-tulala-support-slot`); when it exists on a desktop viewport the
  // launcher renders there as a 32px header button instead of the floating
  // circle. The slot is owned by a sibling tree, so watch for it.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // Layout effect: the slot is in the same commit, so the header button is
  // in place before the first paint and the floating circle never flashes.
  useLayoutEffect(() => {
    // A rail slot (talent sidebar footer) wins over the identity-bar slot.
    const find = () =>
      document.querySelector<HTMLElement>('[data-tulala-support-slot="rail"][data-ready]') ??
      document.querySelector<HTMLElement>('[data-tulala-support-slot]:not([data-tulala-support-slot="rail"])');
    // Keep watching: a sidebar re-render can replace the slot node, and a
    // portal into a detached node renders nothing.
    let current = find();
    setSlot(current);
    const observer = new MutationObserver(() => {
      if (current?.isConnected && current.dataset.tulalaSupportSlot === "rail") return;
      current = find();
      setSlot(current);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ready"] });
    return () => observer.disconnect();
  }, []);
  const inRail = slot !== null && !compact && slot.dataset.tulalaSupportSlot === "rail";
  const inHeader = slot !== null && !compact && !inRail;

  return (
    <>
      {inRail && slot ? createPortal(
        <button
          type="button"
          data-tulala-support-launcher="rail"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="tulala-support-panel"
          aria-label={t("dashboard.adminSupport.launcherAria")}
          onClick={toggle}
          className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] border border-transparent bg-transparent px-[10px] py-[8px] text-left font-admin-body text-[12.5px] font-medium text-admin-ink-muted hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink [transition:background_var(--transition-admin-micro),color_var(--transition-admin-micro)]"
        >
          <Icon name="life-buoy" size={13} stroke={1.7} color="currentColor" />
          <span className="flex-1">{t("dashboard.adminSupport.railLabel")}</span>
          {unread > 0 ? (
            <span
              aria-hidden
              className="min-w-[15px] rounded-full px-[4px] text-center text-[10px] font-bold leading-[15px] text-white"
              style={{ background: COLORS.coral }}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>,
        slot,
      ) : null}
      {inHeader ? createPortal(
        <button
          type="button"
          data-tulala-support-launcher="header"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="tulala-support-panel"
          aria-label={t("dashboard.adminSupport.launcherAria")}
          title={t("dashboard.adminSupport.launcherAria")}
          onClick={toggle}
          className="relative inline-flex h-[32px] w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-admin-border bg-admin-card text-admin-ink-muted hover:text-admin-ink [transition:color_var(--transition-admin-micro)]"
        >
          <Icon name="help-circle" size={16} stroke={1.75} color="currentColor" />
          {unread > 0 ? (
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                minWidth: 15,
                height: 15,
                padding: "0 3px",
                boxSizing: "border-box",
                borderRadius: 8,
                background: COLORS.coral,
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: "15px",
                textAlign: "center",
                boxShadow: `0 0 0 2px ${COLORS.surface}`,
              }}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>,
        slot,
      ) : null}
      {/* One solid dark circle with a white chat bubble. The previous
          white edge-tab read as a floating blob, and the ring icon plus a
          stray violet dot looked like a rendering artifact. */}
      {!inHeader && !inRail && (
      <button
        type="button"
        data-tulala-support-launcher=""
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="tulala-support-panel"
        aria-label={t("dashboard.adminSupport.launcherAria")}
        onClick={toggle}
        style={{
          position: "fixed",
          right: compact ? 14 : 18,
          top: compact ? "62%" : "50%",
          transform: "translateY(-50%)",
          width: compact ? 46 : 52,
          height: compact ? 46 : 52,
          background: COLORS.fill,
          border: "none",
          borderRadius: "50%",
          zIndex: 380,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 26px -8px rgba(11,11,13,0.42), 0 2px 6px rgba(11,11,13,0.16)",
          visibility: hide ? "hidden" : "visible",
          pointerEvents: hide ? "none" : "auto",
          transition: "transform .16s cubic-bezier(.22,1,.36,1), box-shadow .16s ease",
        }}
      >
        <Icon name="life-buoy" size={compact ? 20 : 22} color="#FFFFFF" stroke={1.7} />
        {unread > 0 ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -1,
              right: -1,
              width: 13,
              height: 13,
              borderRadius: "50%",
              background: COLORS.coral,
              // Ring in the page background so the badge reads as a badge,
              // not a smudge on the circle's edge.
              boxShadow: `0 0 0 2.5px ${COLORS.surface}`,
              animation: "tulala-support-pulse 1.6s ease-out 1",
            }}
          />
        ) : null}
      </button>
      )}
      <SupportPanel
        open={open}
        onClose={() => setOpen(false)}
        contract={contract}
        tickets={tickets}
        setTickets={setTickets}
        deepLinkTicketId={deepLinkTicketId}
        guideNodeId={guideNodeId}
        onConsumedGuideNode={() => setGuideNodeId(null)}
      />
      <style>{`
        button[data-tulala-support-launcher=""]:hover{transform:translateY(-50%) scale(1.06)}
        button[data-tulala-support-launcher=""]:active{transform:translateY(-50%) scale(.97)}
        @keyframes tulala-support-badge{0%{box-shadow:0 0 0 2.5px ${COLORS.surface},0 0 0 2.5px rgba(194,106,69,.45)}100%{box-shadow:0 0 0 2.5px ${COLORS.surface},0 0 0 12px rgba(194,106,69,0)}}
        button[data-tulala-support-launcher=""] span{animation-name:tulala-support-badge}
        @media (prefers-reduced-motion:reduce){
          button[data-tulala-support-launcher] span{animation:none!important}
          button[data-tulala-support-launcher=""]:hover{transform:translateY(-50%)}
        }
      `}</style>
    </>
  );
}
