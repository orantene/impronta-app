"use client";

import React, { useState } from "react";
import { DetailsTabContainer } from "@/components/details-tab/DetailsTabContainer";
import { useAdminShell, COLORS, RADIUS, FONTS, TRANSITION } from "../state";
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
  const [activeTab, setActiveTab] = useState<ThreadTabId>("client");
  const fileCount = (MOCK_FILES_FOR_CONV[conv.id] ?? []).filter(f => f.thread === "client").length;

  return (
    <div style={{
      background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.md, overflow: "hidden",
      flex: 1, minHeight: 0,
      display: "flex", flexDirection: "column",
    }}>
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
          placeholder={`Message ${conv.leader.name.split(" ")[0]}…`}
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
            title="Talent group is internal"
            subtitle={`This is the coordinator's working thread with the talent (${lineup.map(t => t.name.split(" ")[0]).join(", ")}). You don't need to see it day-to-day, but ${conv.leader.name} can pull you in if it's useful.`}
            requestLabel="Ask coordinator to share"
            disabled
            disabledTitle="Share requests need a live coordinator workflow."
            ghostPreview={
              <>
                <div style={{ marginBottom: 8 }}><strong>{conv.leader.name}:</strong> Lineup confirmed for May 6. Marta + Tomás locked, Zara on standby…</div>
                {lineup[0] && <div style={{ marginBottom: 8, marginLeft: 24 }}><strong>{lineup[0].name}:</strong> All clear from me — happy to confirm.</div>}
                {lineup[1] && <div style={{ marginBottom: 8, marginLeft: 24 }}><strong>{lineup[1].name}:</strong> Checking my schedule, back in an hour…</div>}
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
      })} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Shared detail-view atoms (used by talent + client detail views)
// ════════════════════════════════════════════════════════════════════

export function DetailBlock({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.md, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {icon && <span aria-hidden style={{ color: COLORS.inkMuted, display: "inline-flex" }}>{icon}</span>}
        <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: 12.5 }}>
      <span style={{ color: COLORS.inkMuted }}>{label}</span>
      <span style={{ color: COLORS.ink, fontWeight: 600, textAlign: "right" }}>{value}</span>
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
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.inkDim, fontSize: 13, fontFamily: FONTS.body }}>
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
    <div style={{
      background: COLORS.successSoft, border: `1px solid ${COLORS.success}30`,
      borderRadius: RADIUS.md, padding: 16,
      fontFamily: FONTS.body,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.success }}>Your take-home</div>
          <div style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 700, color: COLORS.ink, marginTop: 2, letterSpacing: -0.5 }}>{takeHome}</div>
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
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
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: TRANSITION.sm }}>
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
      <span style={{ color: COLORS.ink, fontWeight: bold ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
