"use client";

import { useCallback, useEffect, useState } from "react";
import { startDiagnosticsCollector } from "@/lib/support/diagnostics/collector";
import { useT } from "@/i18n/use-t";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS } from "./support-tokens";
import { useCompactViewport } from "./use-compact-viewport";
import { SupportPanel } from "./SupportPanel";
import type { SupportContract } from "./support-contract";
import { useSupportDeepLink, useSupportUnread } from "./support-hooks";

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

  return (
    <>
      {!hide ? (
        <button
          type="button"
          data-tulala-support-launcher=""
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t("dashboard.adminSupport.launcherAria")}
          onClick={toggle}
          style={{
            position: "fixed",
            right: 0,
            top: compact ? "60%" : "50%",
            transform: "translateY(-50%)",
            width: compact ? 36 : 40,
            height: compact ? 72 : 96,
            background: COLORS.card,
            border: `1px solid ${COLORS.borderSoft}`,
            borderRight: "none",
            borderRadius: "12px 0 0 12px",
            zIndex: 380,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            boxShadow: "0 4px 16px rgba(11,11,13,0.08)",
          }}
        >
          <Icon name="life-buoy" size={18} color={COLORS.ink} />
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: COLORS.royal,
            }}
          />
          {unread > 0 ? (
            <span
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: COLORS.coral,
                boxShadow: "0 0 0 0 rgba(194,106,69,0.5)",
                animation: "tulala-support-pulse 1.6s ease-out 1",
              }}
            />
          ) : null}
        </button>
      ) : null}
      <SupportPanel
        open={open}
        onClose={() => setOpen(false)}
        contract={contract}
        tickets={tickets}
        setTickets={setTickets}
        deepLinkTicketId={deepLinkTicketId}
      />
      <style>{`@keyframes tulala-support-pulse{0%{box-shadow:0 0 0 0 rgba(194,106,69,.45)}100%{box-shadow:0 0 0 10px rgba(194,106,69,0)}}@media (prefers-reduced-motion:reduce){button[data-tulala-support-launcher] span{animation:none!important}}`}</style>
    </>
  );
}
