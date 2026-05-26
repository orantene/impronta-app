"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  CapsLabel,
  DrawerShell,
  FONTS,
  Icon,
  Plan,
  RADIUS,
  SecondaryButton,
  Section,
  TRANSITION,
  openSupportEmail,
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 13 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function EscrowDetailDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open  = state.drawer.drawerId === "escrow-detail";
  const stage = (state.drawer.payload?.stage as string) ?? "held";
  const requestEscrowSupport = (request: string) => {
    openSupportEmail(
      `Tulala escrow ${request} request`,
      `Please review this escrow and advise next steps.\n\nRequested action: ${request}\nCurrent stage: ${stage}`,
    );
    toast("Opening escrow support email");
  };

  const steps = [
    { id: "authorized", label: "Authorized", icon: "🔑", desc: "Payment method verified. Hold placed — no charge yet.",         done: ["held","released"].includes(stage), active: stage === "authorized" },
    { id: "held",       label: "Held",       icon: "🔒", desc: "Funds locked in escrow. Released only after booking confirms.", done: stage === "released",                  active: stage === "held" },
    { id: "released",   label: "Released",   icon: "✅", desc: "Shoot complete. Funds transferred to payout receiver.",          done: false,                                 active: stage === "released" },
  ];

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Escrow Status" description="Payment held securely until shoot is confirmed complete" defaultSize="compact">
      <div style={{ display: "flex", flexDirection: "column", gap: 0, fontFamily: FONTS.body }}>
        {steps.map((s, i) => (
          <div key={s.id} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: s.done ? COLORS.green : s.active ? COLORS.fill : "rgba(11,11,13,0.06)", color: s.done || s.active ? "#fff" : COLORS.inkDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: s.done ? 14 : 16, fontWeight: 700 }}>
                {s.done ? "✓" : s.icon}
              </div>
              {i < steps.length - 1 && <div style={{ width: 2, height: 28, background: s.done ? COLORS.green : COLORS.borderSoft, margin: "4px 0" }} />}
            </div>
            <div style={{ flex: 1, paddingTop: 6, paddingBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: s.active ? 600 : 500, color: s.active || s.done ? COLORS.ink : COLORS.inkMuted, marginBottom: 2 }}>
                {s.label}{s.active && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" as const }} className="text-admin-green">Current</span>}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">{s.desc}</div>
            </div>
          </div>
        ))}
        {stage === "held" && (
          <div style={{ marginTop: 4, padding: "12px 14px", background: "rgba(46,125,91,0.06)", border: "1px solid rgba(46,125,91,0.18)", borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }} className="text-admin-success-deep">🔒 Funds are secured. Auto-released 24h after confirmed shoot date.</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => requestEscrowSupport("release")} style={{ padding: "7px 14px", background: COLORS.green, color: "#fff", border: "none", borderRadius: 7, fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Request release</button>
              <button type="button" onClick={() => requestEscrowSupport("dispute")} style={{ padding: "7px 14px", background: "transparent", color: COLORS.red, border: "1px solid rgba(176,48,58,0.25)", borderRadius: 7, fontFamily: FONTS.body, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Email dispute</button>
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-5.3 Refund · WS-5.8 Dispute · WS-5.7 PayoutFailure
// WS-5.10 KYC · WS-5.11 ProofOfFunds · WS-5.14 SubscriptionLifecycle
// WS-11 NotificationDetail · WS-18 AI Assist drawers
// ════════════════════════════════════════════════════════════════════


export function RefundFlowDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "refund-flow";
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState<"full"|"partial">("full");
  const emailRefundRequest = () => {
    openSupportEmail(
      "Tulala refund request",
      `Please review this refund request.\n\nAmount: ${amount}\nReason: ${reason}`,
    );
    toast("Opening refund support email");
  };
  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Request Refund" description="Email support to start a refund review." defaultSize="compact">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        <div className="flex gap-2">
          {(["full","partial"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setAmount(t)} style={{ flex: 1, padding: "10px 0", border: `1px solid ${amount===t ? COLORS.accent : COLORS.borderSoft}`, background: amount===t ? COLORS.fill : "transparent", color: amount===t ? "#fff" : COLORS.ink, borderRadius: 8, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" as const }}>{t} refund</button>
          ))}
        </div>
        <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 13, color: reason ? COLORS.ink : COLORS.inkMuted, background: "#fff" }}>
          <option value="">Select reason…</option>
          <option value="cancelled">Shoot cancelled by client</option>
          <option value="no-show">Talent no-show</option>
          <option value="force-majeure">Force majeure</option>
          <option value="quality">Deliverables below standard</option>
          <option value="duplicate">Billing error / duplicate</option>
        </select>
        <button type="button" disabled={!reason} onClick={emailRefundRequest} style={{ padding: "10px", background: reason ? COLORS.red : COLORS.borderSoft, border: "none", borderRadius: 8, color: reason ? "#fff" : COLORS.inkDim, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: reason ? "pointer" : "default" }}>Email refund request</button>
      </div>
    </DrawerShell>
  );
}


export function DisputeFlowDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "dispute-flow";
  const [step, setStep] = useState<1|2|3>(1);
  const [type, setType] = useState("");
  const types = [
    { id: "no-show",  label: "Talent didn't show up" },
    { id: "quality",  label: "Deliverables not as agreed" },
    { id: "overcharge", label: "Charged incorrectly" },
    { id: "cancellation", label: "Cancellation policy dispute" },
  ];
  const typeLabel = types.find((item) => item.id === type)?.label ?? type;
  const emailDisputeRequest = () => {
    openSupportEmail(
      "Tulala payment dispute request",
      `Please review this payment dispute.\n\nDispute type: ${typeLabel || "not selected"}`,
    );
    toast("Opening dispute support email");
  };
  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Open Dispute" description="Email support to start a dispute review. Funds are not frozen automatically from this drawer." defaultSize="half">
      <div style={{ fontFamily: FONTS.body }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
          {([1,2,3] as const).map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: s < step ? COLORS.green : s === step ? COLORS.fill : "rgba(11,11,13,0.06)", color: s <= step ? "#fff" : COLORS.inkDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{s < step ? "✓" : s}</div>
              <span style={{ fontSize: 12, color: s === step ? COLORS.ink : COLORS.inkMuted, fontWeight: s === step ? 600 : 400 }}>{s === 1 ? "Type" : s === 2 ? "Evidence" : "Review"}</span>
              {s < 3 && <div style={{ width: 20, height: 1, background: COLORS.borderSoft }} />}
            </div>
          ))}
        </div>
        {step === 1 && <div className="flex flex-col gap-2">{types.map((d) => (<button key={d.id} type="button" onClick={() => setType(d.id)} style={{ padding: "12px 14px", border: `1px solid ${type===d.id ? COLORS.accent : COLORS.borderSoft}`, background: type===d.id ? "rgba(11,11,13,0.04)" : "#fff", borderRadius: 9, textAlign: "left" as const, cursor: "pointer", fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">{d.label}</button>))}<button type="button" disabled={!type} onClick={() => setStep(2)} style={{ marginTop: 8, padding: "10px", background: type ? COLORS.fill : COLORS.borderSoft, border: "none", borderRadius: 8, color: type ? "#fff" : COLORS.inkDim, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: type ? "pointer" : "default" }}>Continue →</button></div>}
        {step === 2 && <div className="flex flex-col gap-4"><div style={{ padding: "40px 20px", border: `2px dashed ${COLORS.border}`, borderRadius: 10, textAlign: "center" as const, opacity: 0.65 }}><div className="text-[28px]">📎</div><div style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }} className="text-admin-ink">Evidence upload coming soon</div><div style={{ fontSize: 12, marginTop: 4 }} className="text-admin-ink-muted">Attach evidence to the support email after it opens.</div></div><div className="flex gap-2"><button type="button" onClick={() => setStep(1)} style={{ flex: 1, padding: "10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: "transparent", fontFamily: FONTS.body, fontSize: 13, cursor: "pointer", color: COLORS.ink }}>Back</button><button type="button" onClick={() => setStep(3)} style={{ flex: 1, padding: "10px", background: COLORS.fill, border: "none", borderRadius: 8, color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Continue →</button></div></div>}
        {step === 3 && <div className="flex flex-col gap-4"><div style={{ padding: "14px", background: "rgba(176,48,58,0.05)", border: "1px solid rgba(176,48,58,0.18)", borderRadius: 10, fontSize: 12.5, lineHeight: 1.6 }} className="text-admin-ink-muted"><strong style={{ color: "#7A2026" }}>Support must review this manually.</strong> Emailing this request does not freeze escrow automatically; support will confirm payment status and next steps.</div><div className="flex gap-2"><button type="button" onClick={() => setStep(2)} style={{ flex: 1, padding: "10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: "transparent", fontFamily: FONTS.body, fontSize: 13, cursor: "pointer", color: COLORS.ink }}>Back</button><button type="button" onClick={emailDisputeRequest} style={{ flex: 1, padding: "10px", background: COLORS.red, border: "none", borderRadius: 8, color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Email dispute request</button></div></div>}
      </div>
    </DrawerShell>
  );
}


export function KycVerificationDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "kyc-verification";
  const [step, setStep] = useState<"intro"|"id"|"selfie"|"done">("intro");
  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Identity Verification" description="Secure · Encrypted · ~3 minutes" defaultSize="compact">
      <div style={{ fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 20 }}>
        {step === "intro" && <>{[{icon:"🪪",title:"Government-issued ID",desc:"Passport, driving licence, or national ID"},{icon:"🤳",title:"Selfie with your ID",desc:"A clear photo of you holding your document"},{icon:"🔒",title:"Secure & private",desc:"Encrypted, deleted after verification"}].map((i) => (<div key={i.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><span className="text-admin-22">{i.icon}</span><div><div className="text-admin-ink text-admin-13 font-semibold">{i.title}</div><div className="text-admin-ink-muted text-xs">{i.desc}</div></div></div>))}<button type="button" onClick={() => setStep("id")} style={{ padding: "11px", background: COLORS.fill, border: "none", borderRadius: 8, color: "#fff", fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Start verification →</button></>}
        {step === "id" && <div className="flex flex-col gap-4"><div onClick={() => { toast("File picker — select ID document"); setStep("selfie"); }} style={{ padding: "40px 20px", border: `2px dashed ${COLORS.border}`, borderRadius: 10, textAlign: "center" as const, cursor: "pointer" }}><div className="text-4xl">🪪</div><div style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }} className="text-admin-ink">Tap to upload or take a photo</div></div></div>}
        {step === "selfie" && <div className="flex flex-col gap-4"><div onClick={() => setStep("done")} style={{ padding: "40px 20px", border: `2px dashed ${COLORS.border}`, borderRadius: 10, textAlign: "center" as const, cursor: "pointer" }}><div className="text-4xl">🤳</div><div style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }} className="text-admin-ink">Selfie holding your ID</div><div style={{ fontSize: 11.5, marginTop: 4 }} className="text-admin-ink-muted">Both your face and document must be clearly visible</div></div></div>}
        {step === "done" && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 20, textAlign: "center" as const }}><span style={{ fontSize: 48 }}>✅</span><div className="text-admin-ink text-base font-bold">Submitted</div><div style={{ fontSize: 13, lineHeight: 1.6 }} className="text-admin-ink-muted">Review within 24 hours. You&apos;ll be notified once verified.</div><button type="button" onClick={closeDrawer} style={{ padding: "10px 24px", background: COLORS.fill, border: "none", borderRadius: 8, color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button></div>}
      </div>
    </DrawerShell>
  );
}


export function ProofOfFundsDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "proof-of-funds";
  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Proof of Funds" description="Required for Silver and Gold trust tiers" defaultSize="compact">
      <div style={{ fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6 }} className="text-admin-ink-muted">Demonstrate available funds via bank link (instant) or wire deposit (1–3 business days).</div>
        <button type="button" onClick={() => toast("Bank link — opens Plaid / TrueLayer")} style={{ padding: "12px 16px", background: COLORS.fill, border: "none", borderRadius: 8, color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const }}>🏦 Link bank account (instant)</button>
        <button type="button" onClick={() => toast("Wire instructions sent to your email")} style={{ padding: "12px 16px", background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.ink, fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left" as const }}>💸 Wire deposit (1–3 days)</button>
      </div>
    </DrawerShell>
  );
}


export function PayoutMethodFailureDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "payout-method-failure";
  const reason = (state.drawer.payload?.reason as string) ?? "invalid_iban";
  const msgs: Record<string,string> = { invalid_iban: "The IBAN appears invalid. Please check and re-enter.", expired_card: "Your payout card has expired.", bank_rejected: "Your bank rejected the transfer — the account may be closed.", suspicious: "This transfer was flagged. Our team will contact you within 24h." };
  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Payout Failed" description="Action required to receive your payment" defaultSize="compact">
      <div style={{ fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: "12px 14px", background: "rgba(176,48,58,0.06)", border: "1px solid rgba(176,48,58,0.18)", borderRadius: 10, fontSize: 13, color: "#7A2026", lineHeight: 1.5 }}>⚠️ {msgs[reason] ?? "An error occurred."}</div>
        <button type="button" onClick={() => toast("Payment method editor")} style={{ padding: "11px", background: COLORS.fill, border: "none", borderRadius: 8, color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Update payout method →</button>
        <button type="button" onClick={() => toast("Support ticket opened")} style={{ padding: "10px", background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 13, cursor: "pointer" }}>Contact support</button>
      </div>
    </DrawerShell>
  );
}


export function SubscriptionLifecycleDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open  = state.drawer.drawerId === "subscription-lifecycle";
  const phase = (state.drawer.payload?.phase as string) ?? "active";
  const phases: Record<string, { title: string; desc: string; cta: string; ctaColor: string }> = {
    trial:     { title: "Trial ending soon",          desc: "Your trial ends in 3 days. Upgrade to keep access.",                              cta: "Upgrade now",    ctaColor: COLORS.accent },
    active:    { title: "Studio · Active",             desc: "Renews June 14, 2026 · €59/month. All features active.",                         cta: "Manage plan",    ctaColor: COLORS.accent },
    paused:    { title: "Plan paused",                desc: "Features are read-only. Resume any time — billing picks up from today.",          cta: "Resume plan",    ctaColor: COLORS.green },
    cancelled: { title: "Plan cancelled",             desc: "Expires June 14. After that you lose Studio features.",                           cta: "Reactivate",     ctaColor: COLORS.green },
    grace:     { title: "Payment failed — grace",     desc: "Couldn't charge your card. Update payment within 7 days to avoid restriction.",   cta: "Update payment", ctaColor: COLORS.red },
  };
  const c = phases[phase] ?? phases.active!;
  return (
    <DrawerShell open={open} onClose={closeDrawer} title={c.title} defaultSize="compact">
      <div style={{ fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6 }} className="text-admin-ink-muted">{c.desc}</div>
        <button type="button" onClick={() => toast(c.cta)} style={{ padding: "11px", background: c.ctaColor, border: "none", borderRadius: 8, color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{c.cta}</button>
        {phase === "active" && <button type="button" onClick={() => toast("Cancellation + win-back flow")} style={{ padding: "10px", background: "transparent", border: "none", color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 12, cursor: "pointer" }}>Cancel subscription</button>}
      </div>
    </DrawerShell>
  );
}


export function NotificationDetailDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "notification-detail";
  const n = state.drawer.payload?.notification as Record<string,string> | undefined;
  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Notification" defaultSize="compact">
      <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.6 }} className="text-admin-ink-muted">
        {n?.body ?? "No additional detail available."}
      </div>
    </DrawerShell>
  );
}


export function AiDraftAssistDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "ai-draft-assist";
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const DRAFTS: Record<string,string> = {
    "nudge client": "Hi Joana! Quick nudge — the offer we sent expires in 24 hours. Happy to extend the deadline if you need more time. Let me know! — Sara",
    "confirm date": "Hi team — confirming: May 6, full day at Estudio Roca, Madrid. Call time 8 AM. Please confirm receipt. Thanks! — Sara",
    "decline":      "Hi Tomás, thank you for your interest. After reviewing the lineup we're going in a slightly different direction. We'll keep you in mind for future shoots. — Sara",
  };
  const generate = () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setTimeout(() => {
      const key = Object.keys(DRAFTS).find((k) => prompt.toLowerCase().includes(k));
      setResult(DRAFTS[key ?? "nudge client"] ?? "Draft generated from context…");
      setLoading(false);
    }, 1100);
  };
  return (
    <DrawerShell open={open} onClose={closeDrawer} title="AI Draft Assist" description="Generate a first draft — you edit, then send" defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder='e.g. "nudge client about offer" or "confirm date with talent"' rows={3} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, resize: "none" as const, outline: "none", boxSizing: "border-box" as const }} />
        <button type="button" onClick={generate} disabled={loading || !prompt.trim()} style={{ padding: "10px", background: prompt.trim() ? COLORS.fill : COLORS.borderSoft, border: "none", borderRadius: 8, color: prompt.trim() ? "#fff" : COLORS.inkDim, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: prompt.trim() ? "pointer" : "default" }}>{loading ? "Drafting…" : "Generate draft"}</button>
        {result && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 6 }} className="text-admin-ink-muted">Draft — edit before sending</div>
            <textarea value={result} onChange={(e) => setResult(e.target.value)} rows={6} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(79,70,229,0.35)", fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, resize: "vertical" as const, outline: "none", background: "rgba(79,70,229,0.03)", boxSizing: "border-box" as const }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => { toast("Draft copied to composer"); closeDrawer(); }} style={{ flex: 1, padding: "9px", background: COLORS.fill, border: "none", borderRadius: 8, color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Use draft →</button>
              <button type="button" onClick={() => setResult("")} style={{ padding: "9px 14px", background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 13, cursor: "pointer" }}>Clear</button>
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}


export function AiSearchExplainDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open    = state.drawer.drawerId === "ai-search-explain";
  const query   = (state.drawer.payload?.query as string) ?? "";
  const results = (state.drawer.payload?.resultCount as number) ?? 0;
  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Search interpretation" defaultSize="compact">
      <div style={{ fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 14 }}>
        {query && <div style={{ padding: "10px 12px", background: "rgba(11,11,13,0.03)", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 8, fontSize: 13 }} className="text-admin-ink">&ldquo;{query}&rdquo;</div>}
        <div style={{ fontSize: 13, lineHeight: 1.6 }} className="text-admin-ink-muted">Searched across name, agency, brief, status, and location. Found <strong className="text-admin-ink">{results} results</strong>. Try date ranges, status filters, or talent names for precision.</div>
      </div>
    </DrawerShell>
  );
}

// ─── WS-18.6 — AI Weekly Digest drawer ──────────────────────────────────────
// Shows a mock AI-generated "what changed this week" recap.
// In production this would be generated server-side from the activity_log table.


export function AiWeeklyDigestDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "ai-weekly-digest";

  const DIGEST_SECTIONS = [
    {
      label: "Inquiries",
      icon: "bolt" as const,
      items: [
        "3 new inquiries arrived — Net-a-Porter, Bvlgari, and Valentino.",
        "Offer v3 accepted by Net-a-Porter. Booking BK-205 confirmed.",
        "Vogue Italia is awaiting your counter-offer (sent 2d ago).",
      ],
    },
    {
      label: "Roster",
      icon: "user" as const,
      items: [
        "Kai Lin updated measurements and submitted 4 new portfolio images.",
        "Lina Park's profile changes approved and published.",
        "Tomás Navarro added as a new face — awaiting agency verification.",
      ],
    },
    {
      label: "Payments",
      icon: "credit" as const,
      items: [
        "€7,913 net payout for BK-203 (Kai Lin · Bvlgari) is processing.",
        "€3,400 payout for BK-205 is in escrow — releases on May 15.",
      ],
    },
    {
      label: "Team",
      icon: "team" as const,
      items: [
        "Sara Bianchi handled 14 messages this week — highest on the team.",
        "Andrés Lopez joined as Editor 3 days ago. No actions yet.",
      ],
    },
  ] as const;

  const ACTIONS = [
    "Vogue Italia — send counter-offer",
    "BK-203 payout — confirm receiver",
    "Tomás Navarro — complete verification",
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Weekly digest"
      description="AI-generated summary of what changed in your workspace this week. Generated Mon, Apr 28."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>
        {/* AI header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", border: "1px solid rgba(95,75,139,0.18)" }} className="bg-admin-royal-soft rounded-admin-lg">
          <Icon name="sparkle" size={14} color={COLORS.royal} stroke={1.7} />
          <div className="flex-1">
            <div className="text-admin-royal text-xs font-bold">
              AI-generated · not saved · Apr 21 – Apr 28
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 1 }} className="text-admin-royal">
              Pulled from 47 activity events, 12 messages, 3 inquiry updates.
            </div>
          </div>
        </div>

        {/* Outstanding actions */}
        <div>
          <CapsLabel>Outstanding actions · {ACTIONS.length}</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {ACTIONS.map((action, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: COLORS.coralSoft,
                  border: `1px solid rgba(194,106,69,0.2)`,
                  borderRadius: RADIUS.md,
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  color: COLORS.coralDeep,
                  fontWeight: 500,
                }}
              >
                <Icon name="alert" size={12} color={COLORS.coral} stroke={1.8} />
                {action}
              </div>
            ))}
          </div>
        </div>

        {/* Section summaries */}
        {DIGEST_SECTIONS.map((section) => (
          <div key={section.label}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 8,
              }}
            >
              <Icon name={section.icon} size={13} color={COLORS.inkMuted} stroke={1.8} />
              <span style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">
                {section.label}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {section.items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "8px 10px",
                    background: COLORS.surfaceAlt,
                    borderRadius: RADIUS.md,
                    border: `1px solid ${COLORS.borderSoft}`,
                    fontFamily: FONTS.body,
                    fontSize: 12.5,
                    color: COLORS.ink,
                    lineHeight: 1.45,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: COLORS.inkDim,
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-19 — Reporting & analytics drawers
// ════════════════════════════════════════════════════════════════════


/**
 * WorkspaceRevenueDrawer — retired 2026-05-26.
 *
 * Previously a mock-fed (MONTHLY / CATEGORIES arrays) revenue summary.
 * Replaced by the canonical `/{tenantSlug}/admin/financials` route
 * which reads `loadAgencyFinancials` — same source rows that power the
 * talent Money view. See decision-log L46. The export is kept as a
 * no-op stub so any lingering deep import (drawer dispatcher) stops
 * cleanly without rendering fabricated euros.
 */
export function WorkspaceRevenueDrawer() {
  return null;
}


export function ConversionFunnelDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "conversion-funnel";

  const STAGES = [
    { label: "Inquiries received", count: 48, pct: 100, dropPct: null  as number | null },
    { label: "Offer sent",         count: 31, pct: 65,  dropPct: 35   as number | null },
    { label: "Client approved",    count: 22, pct: 46,  dropPct: 29   as number | null },
    { label: "Booking confirmed",  count: 17, pct: 35,  dropPct: 23   as number | null },
  ];
  const FUNNEL_W = 280;
  const STAGE_H = 48;
  const GAP = 6;
  const STAGE_COLORS = [COLORS.accent, COLORS.indigo, COLORS.success, COLORS.green];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Conversion funnel"
      description="Inquiry-to-booking conversion — last 90 days. Drop-off shows where deals are lost."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>
        {/* Summary KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Overall conversion", value: "35%",  sub: "inquiry → booking" },
            { label: "Avg time to close",  value: "8.2d", sub: "inquiry → confirmed" },
            { label: "Lost deals",         value: "31",   sub: "last 90 days", warn: true },
          ].map((tile) => (
            <div
              key={tile.label}
              style={{
                background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
                padding: "12px 14px", border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }} className="text-admin-ink-muted">
                {tile.label}
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: (tile as { warn?: boolean }).warn ? COLORS.coral : COLORS.ink, marginBottom: 2 }}>
                {tile.value}
              </div>
              <div className="text-admin-ink-muted text-admin-10h">{tile.sub}</div>
            </div>
          ))}
        </div>

        {/* SVG funnel */}
        <div style={{ padding: "16px", border: `1px solid ${COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-lg">
          <CapsLabel>Pipeline funnel · last 90 days</CapsLabel>
          <div style={{ marginTop: 14 }}>
            <svg
              width={FUNNEL_W}
              height={STAGES.length * (STAGE_H + GAP)}
              style={{ display: "block", overflow: "visible" }}
            >
              {STAGES.map((stage, i) => {
                const w = Math.round((stage.pct / 100) * FUNNEL_W);
                const x = (FUNNEL_W - w) / 2;
                const y = i * (STAGE_H + GAP);
                return (
                  <g key={stage.label}>
                    <rect x={x} y={y} width={w} height={STAGE_H} rx={6}
                      fill={STAGE_COLORS[i] ?? COLORS.accent}
                      opacity={1 - i * 0.07}
                    />
                    <text x={FUNNEL_W / 2} y={y + STAGE_H / 2 - 5}
                      textAnchor="middle" fontSize={11} fontWeight="600" fill="#fff">
                      {stage.label}
                    </text>
                    <text x={FUNNEL_W / 2} y={y + STAGE_H / 2 + 10}
                      textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.85)">
                      {stage.count} · {stage.pct}%
                    </text>
                    {stage.dropPct !== null && (
                      <text x={FUNNEL_W - 2} y={y - 1}
                        textAnchor="end" fontSize={9.5} fill={COLORS.coral}>
                        −{stage.dropPct}%
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Stage detail rows */}
        <div>
          <CapsLabel>Stage breakdown</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {STAGES.map((stage, i) => (
              <div
                key={stage.label}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", background: COLORS.surfaceAlt,
                  borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: STAGE_COLORS[i] ?? COLORS.accent, flexShrink: 0, }} />
                  <span className="text-admin-ink text-admin-13 font-medium">{stage.label}</span>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span className="text-admin-ink text-admin-13 font-bold">{stage.count}</span>
                  {stage.dropPct !== null ? (
                    <span className="text-admin-coral text-admin-11">−{stage.dropPct}% drop</span>
                  ) : (
                    <span className="text-admin-ink-muted text-admin-11">entry stage</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

