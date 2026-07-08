"use client";

import React, { useState } from "react";
import { DetailsTabContainer } from "@/components/details-tab/DetailsTabContainer";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { useAdminShell, COLORS, FONTS, TRANSITION } from "../state";
import { type Conversation, type Participant } from "../talent";
import { buildInquiryTabs, convToInquiry } from "./shared/machinery-1";
import { getOffer } from "./shared/machinery-10";
import { OfferTab } from "./shared/machinery-12";
import { FilesTab } from "./shared/machinery-15";
import { ConversationTab } from "./shared/machinery-16";
import { ClientProjectViewTab } from "./shared/machinery-3";
import { LogisticsTab, PaymentTab, ShellNextActionBar, resolveShellAction } from "./shared/machinery-6";
import { DetailsPanel } from "./shared/machinery-7";
import type { ThreadTabId } from "./shared/machinery-8";
import { LockedTabOverlay, MOCK_FILES_FOR_CONV, ThreadTabBar } from "./shared/machinery-9";
import type { Offer } from "./shared/machinery-9";

// ── Client tabs block — Client thread (native) | Talent group (locked) | Files | Details ──
export function ClientTabsBlock({
  conv, lineup, timeline,
}: {
  conv: Conversation;
  lineup: Participant[];
  timeline: { ts: string; label: string }[];
}) {
  const { toast } = useAdminShell();
  const t = useT();
  const [activeTab, setActiveTab] = useState<ThreadTabId>("client");
  const fileCount = (MOCK_FILES_FOR_CONV[conv.id] ?? []).filter(f => f.thread === "client").length;

  return (
    <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }} className="rounded-admin-md">
      <ThreadTabBar
        activeId={activeTab}
        onSelect={setActiveTab}
        tabs={buildInquiryTabs({
          status: conv.stage === "booked" || conv.stage === "past" ? "booked" : "inquiry",
          pov: "client",
          unread: { client: conv.unreadCount, files: fileCount },
          offerNeedsAttention: getOffer(conv.id)?.stage === "sent",
          paymentDue: conv.stage === "booked",
        })}
      />
      {activeTab === "client" && (
        <ConversationTab
          conv={conv}
          threadKey={`${conv.id}:client`}
          placeholder={interpolate(t("dashboard.talentThread.messageClientPlaceholder"), { name: conv.leader.name.split(" ")[0] })}
          /* Client can suggest swaps + add talent to their own lineup.
             Offer details visible in the dedicated Offer tab; the
             lineup drawer just shows the line item totals. */
          povCanEditLineup={true}
          povCanSeeOffers={true}
          povCanSeeCoordNote={false}
        />
      )}
      {activeTab === "talent" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <LockedTabOverlay
            title={t("dashboard.clientThread.talentGroupInternal")}
            subtitle={interpolate(t("dashboard.clientThread.talentGroupSubtitle"), { names: lineup.map(p => p.name.split(" ")[0]).join(", "), coordinator: conv.leader.name })}
            requestLabel={t("dashboard.clientThread.askCoordinatorToShare")}
            disabled
            disabledTitle={t("dashboard.clientThread.shareNeedsWorkflow")}
            ghostPreview={
              <>
                <div className="mb-2"><strong>{conv.leader.name}:</strong> {t("dashboard.clientThread.ghostLineupConfirmed")}</div>
                {lineup[0] && <div style={{ marginBottom: 8, marginLeft: 24 }}><strong>{lineup[0].name}:</strong> {t("dashboard.clientThread.ghostAllClear")}</div>}
                {lineup[1] && <div style={{ marginBottom: 8, marginLeft: 24 }}><strong>{lineup[1].name}:</strong> {t("dashboard.clientThread.ghostChecking")}</div>}
              </>
            }
          />
        </div>
      )}
      {activeTab === "offer" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <OfferTab conv={conv} pov={{ kind: "client" }} />
        </div>
      )}
      {activeTab === "logistics" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <LogisticsTab inquiry={convToInquiry(conv)} pov="client" />
        </div>
      )}
      {activeTab === "payment" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <PaymentTab inquiry={convToInquiry(conv)} pov="client" />
        </div>
      )}
      {activeTab === "files" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <FilesTab conv={conv} povCanSeeTalentFiles={false} />
        </div>
      )}
      {activeTab === "details" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {/* Details v3 (plan §10): canonical DetailsTab is now the
              sole content surface for client pov when the conversation
              is backed by a real inquiry row. Mock convs fall back to
              the legacy <DetailsPanel> render. NOTE: the parens around
              the regex literal are load-bearing — `{/^...` in JSX
              collides with the `{/*` comment-opener token. */}
          {(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(conv.id) ? (
            <div style={{ padding: 14 }}>
              <DetailsTabContainer inquiryId={conv.id} pov="client" />
            </div>
          ) : (
            <DetailsPanel inquiry={convToInquiry(conv)} pov="client" />
          )}
        </div>
      )}
      {/* Merged "Project" tab — replaces Details + Logistics for client.
          Same surface pattern as the talent's "Details" tab so the
          design language is consistent across roles. */}
      {activeTab === "booking" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <ClientProjectViewTab
            conv={conv}
            inquiry={convToInquiry(conv)}
            onOpenClientThread={() => setActiveTab("client")}
            onOpenOffer={() => setActiveTab("offer")}
          />
        </div>
      )}
      <ShellNextActionBar {...resolveShellAction(conv, "client", toast, {
        onOpenOffer: () => setActiveTab("offer"),
        onOpenClientThread: () => setActiveTab("client"),
      }, t)} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Shared detail-view atoms (used by talent + client detail views)
// ════════════════════════════════════════════════════════════════════

export function DetailBlock({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, padding: 14 }} className="rounded-admin-md">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {icon && <span aria-hidden style={{ color: COLORS.inkMuted, display: "inline-flex" }}>{icon}</span>}
        <span className="text-admin-ink-muted text-admin-10h font-bold">{label}</span>
      </div>
      {children}
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: 12.5 }}>
      <span className="text-admin-ink-muted">{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }} className="text-admin-ink">{value}</span>
    </div>
  );
}

export function ActionButton({ label, primary, tone, onClick }: { label: string; primary?: boolean; tone?: "danger"; onClick: () => void }) {
  const bg = primary ? COLORS.fill : "#fff";
  const fg = primary ? "#fff" : tone === "danger" ? COLORS.coral : COLORS.ink;
  const border = primary ? "none" : `1px solid ${tone === "danger" ? `${COLORS.coral}40` : COLORS.border}`;
  return (
    <button type="button" onClick={onClick} style={{
      padding: "10px 12px", borderRadius: 8, border, background: bg, color: fg,
      fontFamily: FONTS.body, fontSize: 13, fontWeight: 700, cursor: "pointer",
      transition: TRANSITION.sm,
    }}>
      {label}
    </button>
  );
}

export function MiniComposer({ placeholder, onSend }: { placeholder: string; onSend: (text: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) { onSend(val); setVal(""); } }}
        placeholder={placeholder}
        style={{
          flex: 1, padding: "10px 14px", borderRadius: 24,
          background: "rgba(11,11,13,0.04)", border: `1.5px solid ${val ? COLORS.accent : "transparent"}`,
          fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, outline: "none",
        }}
      />
      <button type="button" disabled={!val.trim()} onClick={() => { if (val.trim()) { onSend(val); setVal(""); } }}
        aria-label="Send"
        style={{
          width: 36, height: 36, borderRadius: "50%", border: "none",
          cursor: val.trim() ? "pointer" : "default",
          background: val.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
          color: val.trim() ? "#fff" : COLORS.inkDim,
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M12.5 7H1.5M12.5 7L8 2.5M12.5 7L8 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}

export function EmptyDetail({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: FONTS.body }} className="text-admin-ink-dim">
      {label}
    </div>
  );
}

// #9 — Talent take-home with collapsible breakdown.
// Headline = the take-home (what they get). Click "See breakdown"
// reveals: gross rate · agency commission · platform fee · take-home.
export function TakeHomeCard({ takeHome, stage }: { takeHome: string; stage: string }) {
  const [expanded, setExpanded] = useState(false);
  // Mock the breakdown — production reads from booking record.
  // Talent take-home is the headline; everything else derives.
  const numeric = parseFloat(takeHome.replace(/[^0-9.]/g, ""));
  const isReal = !isNaN(numeric) && numeric > 0;
  const currency = takeHome.match(/[€£$]/)?.[0] ?? "€";
  const gross = isReal ? numeric / 0.80 : 0; // talent's 80% of gross
  const agencyFee = isReal ? gross * 0.15 : 0;
  const platformFee = isReal ? gross * 0.05 : 0;
  const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

  return (
    <div style={{ border: `1px solid ${COLORS.success}30`, padding: 16, fontFamily: FONTS.body }} className="bg-admin-success-soft rounded-admin-md">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="text-admin-success text-admin-10h font-bold">Your take-home</div>
          <div style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 700, marginTop: 2, letterSpacing: -0.5 }} className="text-admin-ink">{takeHome}</div>
          <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
            {stage === "past" ? "Paid · invoice receipt available" : "Paid 14 days post-shoot"}
          </div>
        </div>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: "50%", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", color: COLORS.success }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5v13M4.5 5.5C4.5 4 5.5 3 7 3h2c1.5 0 2.5 1 2.5 2.5S10.5 8 9 8H7c-1.5 0-2.5 1-2.5 2.5S5.5 13 7 13h2c1.5 0 2.5-1 2.5-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </span>
      </div>
      {isReal && (
        <>
          <button type="button" onClick={() => setExpanded(v => !v)} style={{
            marginTop: 10, background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, color: COLORS.success,
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            {expanded ? "Hide breakdown" : "See breakdown"}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-admin-sm ${expanded ? 'rotate-180' : 'rotate-0'}`}>
              <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {expanded && (
            <div style={{ marginTop: 10, padding: 12, background: "rgba(255,255,255,0.5)", borderRadius: 8, border: `1px solid ${COLORS.success}25` }}>
              <BreakdownRow label="Gross rate"      value={fmt(gross)} muted />
              <BreakdownRow label="Agency commission (15%)" value={`–${fmt(agencyFee)}`} muted />
              <BreakdownRow label="Platform fee (5%)"  value={`–${fmt(platformFee)}`} muted />
              <div style={{ height: 1, background: `${COLORS.success}25`, margin: "6px 0" }} />
              <BreakdownRow label="Your take-home" value={takeHome} bold />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function BreakdownRow({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
      <span style={{ color: muted ? COLORS.inkMuted : COLORS.ink }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">{value}</span>
    </div>
  );
}
