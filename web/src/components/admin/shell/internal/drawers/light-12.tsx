"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  ConfigRow,
  DrawerShell,
  ExistingRequestRow,
  FONTS,
  FieldRow,
  InstagramVerificationInstructions,
  PrimaryButton,
  REVIEW_MODE_LABEL,
  SecondaryButton,
  Section,
  TIER_LABEL,
  TalentTrustHealthPanel,
  TextInput,
  Toggle,
  VERIFICATION_TYPE_META,
  VISIBILITY_LABEL,
  VerificationMethodConfig,
  VerificationType,
  useAdminShell,
  vmChipStyle,
  vmSelectStyle
} from "./drawer-shared";

// Phase 1d (remediation §4): 3 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TalentTrustDetailDrawer() {
  const { state, closeDrawer, toast, getTrustSummary, getRiskScore, createVerificationRequest, updateVerificationRequest, verificationRequests, isVerificationMethodEnabled, openDrawer, getTalentContactGate, setTalentContactGate } = useAdminShell();
  const open = state.drawer.drawerId === "talent-trust-detail";
  // Demo: prototype's "current talent" is roster id t1 (Marta).
  const TALENT_ID = "t1";
  const trust = getTrustSummary("talent_profile", TALENT_ID);
  const [igModalOpen, setIgModalOpen] = useState(false);
  const [igHandle, setIgHandle] = useState("");
  const [igEvidenceUrl, setIgEvidenceUrl] = useState("");
  const [igEvidenceNote, setIgEvidenceNote] = useState("");

  // Existing IG request, if any
  const existingIgRequest = verificationRequests.find(r =>
    r.subjectType === "talent_profile" && r.subjectId === TALENT_ID && r.verificationType === "instagram_verified"
    && (r.status === "pending_user_action" || r.status === "submitted" || r.status === "in_review" || r.status === "needs_more_info")
  );
  const igActive = trust.badges.some(b => b.type === "instagram_verified" && b.status === "active");
  const tulalaActive = trust.badges.some(b => b.type === "tulala_verified" && b.status === "active");
  const tulalaRequest = verificationRequests.find(r =>
    r.subjectType === "talent_profile" && r.subjectId === TALENT_ID && r.verificationType === "tulala_verified"
    && (r.status === "submitted" || r.status === "in_review" || r.status === "needs_more_info")
  );

  const startIgFlow = () => {
    setIgHandle("");
    setIgEvidenceUrl("");
    setIgEvidenceNote("");
    setIgModalOpen(true);
  };
  const submitIgRequest = () => {
    if (!igHandle.trim().startsWith("@")) {
      toast("Handle should start with @ (e.g. @yourname)");
      return;
    }
    // Generate a TUL-XXXX code
    const code = "TUL-" + Math.floor(1000 + Math.random() * 9000);
    createVerificationRequest({
      subjectType: "talent_profile",
      subjectId: TALENT_ID,
      requestedByUserId: "u-current-talent",
      context: "agency",
      method: "instagram_dm",
      verificationType: "instagram_verified",
      verificationCode: code,
      claimedIdentifier: igHandle.trim(),
      targetUrl: "https://atelier-roma.tulala.app/marta-reyes",
      evidenceUrl: igEvidenceUrl.trim() || null,
      evidenceNote: igEvidenceNote.trim() || null,
      status: "pending_user_action",
      expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    });
    toast(`Verification code generated · send the DM to @tulala.digital`);
  };
  const markIgSent = (id: string) => {
    updateVerificationRequest(id, { status: "submitted" });
    toast(`Marked as sent · Tulala will review within 24h`);
  };
  const cancelRequest = (id: string) => {
    updateVerificationRequest(id, { status: "cancelled" });
    toast("Request cancelled");
  };
  const requestTulalaReview = () => {
    createVerificationRequest({
      subjectType: "talent_profile",
      subjectId: TALENT_ID,
      requestedByUserId: "u-current-talent",
      context: "agency",
      method: "manual_review",
      verificationType: "tulala_verified",
      status: "submitted",
    });
    toast("Tulala Review requested · admins notified");
  };

  return (
    <>
      <DrawerShell
        open={open}
        onClose={closeDrawer}
        title="Trust & Verification"
        description="Get verified to win more bookings. Verified profiles get 3× more inquiries on Tulala."
        width={580}
        footer={<SecondaryButton onClick={closeDrawer}>Done</SecondaryButton>}
      >
        {/* Account email — top-of-card status */}
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: trust.account?.emailVerified ? COLORS.successSoft : "rgba(11,11,13,0.03)",
          marginBottom: 16, fontFamily: FONTS.body,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 12.5, fontWeight: 600,
            color: trust.account?.emailVerified ? COLORS.successDeep : COLORS.inkMuted,
          }}>
            <span>✉</span>
            {trust.account?.emailVerified ? "Account email verified" : "Account email not verified"}
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
            Email is account security only — it doesn't appear as a public verification badge.
          </div>
        </div>

        {/* Profile claim status */}
        {trust.claimStatus && (
          <Section title="Profile ownership" framed>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              fontFamily: FONTS.body,
            }}>
              <span style={{ fontSize: 18 }}>👤</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                  {trust.claimStatus === "claimed" && "You own this profile."}
                  {trust.claimStatus === "invite_sent" && "Claim invite pending."}
                  {trust.claimStatus === "unclaimed" && "Profile not yet claimed."}
                  {trust.claimStatus === "disputed" && "Disputed — admin reviewing."}
                  {trust.claimStatus === "released" && "You released ownership."}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                  {trust.claimStatus === "claimed"
                    ? "You can edit your profile and accept inquiries directly."
                    : "Atelier Roma created this profile. Claim it to take ownership."}
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* Trust Health — your own score + earn-+X suggestions. */}
        <TalentTrustHealthPanel talentId={TALENT_ID} />

        {/* Instagram Verified */}
        {isVerificationMethodEnabled("instagram_verified") && (
        <Section title="Instagram Verified" framed>
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginBottom: 12, lineHeight: 1.5 }}>
            Tulala confirms you control the Instagram account on your profile. Public badge appears on your storefront card.
          </div>
          {igActive && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 14px", borderRadius: 10,
              background: COLORS.successSoft,
              fontFamily: FONTS.body,
            }}>
              <span style={{ fontSize: 18 }}>📸</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.successDeep }}>Verified</div>
                <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>Public badge live</div>
              </div>
            </div>
          )}
          {!igActive && existingIgRequest && (
            <ExistingRequestRow
              request={existingIgRequest}
              onMarkSent={() => markIgSent(existingIgRequest.id)}
              onCancel={() => cancelRequest(existingIgRequest.id)}
            />
          )}
          {!igActive && !existingIgRequest && (
            <button type="button" onClick={startIgFlow} style={{
              padding: "10px 16px", borderRadius: 999,
              background: COLORS.fill, color: "#fff", border: "none",
              fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            }}>
              📸 Verify Instagram
            </button>
          )}
        </Section>
        )}

        {/* Tulala Review */}
        {isVerificationMethodEnabled("tulala_verified") && (
        <Section title="Tulala Review" framed>
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginBottom: 12, lineHeight: 1.5 }}>
            Tulala manually reviews your profile for authenticity, completeness, and quality. Verified profiles get featured placement and the highest trust signal.
          </div>
          {tulalaActive && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 14px", borderRadius: 10,
              background: COLORS.successSoft, fontFamily: FONTS.body,
            }}>
              <span style={{ fontSize: 18 }}>✓</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.successDeep }}>Tulala Verified</div>
                <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>Public badge live</div>
              </div>
            </div>
          )}
          {!tulalaActive && tulalaRequest && (
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: COLORS.amberSoft, fontFamily: FONTS.body,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: COLORS.amberDeep }}>
                <span>◌</span>
                {tulalaRequest.status === "needs_more_info" ? "Needs more info" : "In review"}
              </div>
              {tulalaRequest.publicMessage && (
                <div style={{ fontSize: 11.5, color: COLORS.ink, marginTop: 6, lineHeight: 1.5 }}>
                  <strong>Tulala's note:</strong> {tulalaRequest.publicMessage}
                </div>
              )}
            </div>
          )}
          {!tulalaActive && !tulalaRequest && (
            <button type="button" onClick={requestTulalaReview} style={{
              padding: "10px 16px", borderRadius: 999,
              background: COLORS.fill, color: "#fff", border: "none",
              fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            }}>
              ✓ Request Tulala Review
            </button>
          )}
        </Section>
        )}

        {/* Phase 2 — extra verification methods (Phone / ID / Business / Domain / Payment).
            Each one is gated on the platform-admin enable toggle. */}
        {(isVerificationMethodEnabled("phone_verified")
          || isVerificationMethodEnabled("id_verified")
          || isVerificationMethodEnabled("business_verified")
          || isVerificationMethodEnabled("domain_verified")
          || isVerificationMethodEnabled("payment_verified")) && (
          <Section title="More verifications" framed>
            <div style={{ fontSize: 12, color: COLORS.inkMuted, marginBottom: 12, lineHeight: 1.5 }}>
              Add more trust signals. Some are private (used for security + risk scoring), others get a public badge.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              {[
                { type: "phone_verified"   as const, drawer: "talent-phone-verify"    as const, emoji: "📱", label: "Verify phone" },
                { type: "id_verified"      as const, drawer: "talent-id-verify"       as const, emoji: "🪪", label: "Verify ID" },
                { type: "business_verified" as const, drawer: "talent-business-verify" as const, emoji: "🏢", label: "Verify business" },
                { type: "domain_verified"  as const, drawer: "talent-domain-verify"   as const, emoji: "🌐", label: "Verify domain" },
                { type: "payment_verified" as const, drawer: "talent-payment-verify"  as const, emoji: "💳", label: "Verify payment" },
              ].filter(m => isVerificationMethodEnabled(m.type)).map(m => {
                const active = trust.badges.some(b => b.type === m.type && b.status === "active");
                return (
                  <button key={m.type} type="button" onClick={() => openDrawer(m.drawer)}
                    disabled={active}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                      borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`,
                      background: active ? COLORS.successSoft : "#fff",
                      color: active ? COLORS.successDeep : COLORS.ink,
                      fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
                      cursor: active ? "default" : "pointer",
                      textAlign: "left",
                    }}>
                    <span style={{ fontSize: 16 }}>{m.emoji}</span>
                    <span style={{ flex: 1 }}>{active ? "Verified" : m.label}</span>
                    {!active && <span aria-hidden style={{ color: COLORS.inkDim }}>→</span>}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Contact gate — talent decides who can DM them. Default open. */}
        <Section title="Who can contact you" framed>
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginBottom: 12, lineHeight: 1.5 }}>
            Restrict inquiries based on the client's trust level. Tulala blocks the Send-inquiry button for clients who don't meet your gate.
          </div>
          {(["open", "verified_only", "trusted_only"] as const).map(g => {
            const cur = getTalentContactGate(TALENT_ID);
            const active = cur === g;
            const label = g === "open" ? "Anyone" : g === "verified_only" ? "Verified clients only" : "Trusted clients only (score ≥ 60)";
            const help = g === "open" ? "Default. Any client can send an inquiry." : g === "verified_only" ? "Client must have at least one active verification badge." : "Client must have multiple trust signals (verifications + claimed status).";
            return (
              <button key={g} type="button" onClick={() => { setTalentContactGate(TALENT_ID, g); toast(`Contact gate set to ${label}`); }}
                style={{
                  display: "flex", width: "100%", textAlign: "left", gap: 10,
                  padding: "10px 12px", borderRadius: 10, marginBottom: 6,
                  border: `1px solid ${active ? COLORS.successDeep : COLORS.borderSoft}`,
                  background: active ? "rgba(15,79,62,0.06)" : "#fff",
                  cursor: "pointer", fontFamily: FONTS.body, alignItems: "flex-start",
                }}>
                <span aria-hidden style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${active ? COLORS.successDeep : COLORS.border}`, background: active ? COLORS.successDeep : "#fff", marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: active ? COLORS.successDeep : COLORS.ink }}>{label}</div>
                  <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{help}</div>
                </div>
              </button>
            );
          })}
        </Section>

        {/* What admins see — informational */}
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: "rgba(91,107,160,0.08)",
          fontFamily: FONTS.body, fontSize: 11, color: COLORS.indigoDeep, lineHeight: 1.5,
          marginTop: 8,
        }}>
          <strong>Tulala admins review every request manually.</strong> Most decisions land within 24 hours.
        </div>
      </DrawerShell>

      {/* Instagram DM instructions modal */}
      {igModalOpen && (
        <InstagramVerificationInstructions
          existingHandle={igHandle}
          onChangeHandle={setIgHandle}
          evidenceUrl={igEvidenceUrl}
          onChangeEvidenceUrl={setIgEvidenceUrl}
          evidenceNote={igEvidenceNote}
          onChangeEvidenceNote={setIgEvidenceNote}
          onSubmit={() => { submitIgRequest(); setIgModalOpen(false); }}
          onCancel={() => setIgModalOpen(false)}
        />
      )}
    </>
  );
}


export function TalentClaimInviteDrawer() {
  const { state, closeDrawer, toast, effectiveTenant } = useAdminShell();
  const open = state.drawer.drawerId === "talent-claim-invite";
  const [step, setStep] = useState<"review" | "claim" | "dispute">("review");
  const [email, setEmail] = useState("amelia.dorsey@example.com");
  const [agreed, setAgreed] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  // Profile name comes from the invite payload; fall back to generic label.
  const profileName = (state.drawer.payload?.profileName as string | undefined) ?? "Your profile";
  const agencyName = effectiveTenant.name;

  const accept = () => {
    if (!agreed) { toast("Confirm you reviewed what's collected"); return; }
    toast(`Welcome, ${profileName.split(" ")[0]} · profile is yours`);
    closeDrawer();
  };

  const submitDispute = () => {
    if (!disputeReason.trim()) { toast("Add a reason — admin will review"); return; }
    toast("Reported · Tulala admin will resolve");
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={step === "review" ? `Claim ${profileName}'s profile`
        : step === "claim" ? "Confirm + sign in"
        : "This isn't me"}
      description={step === "review"
        ? `${agencyName} created a profile for you on Tulala. Review and claim it.`
        : step === "claim" ? "One last step to take ownership."
        : "Tell us what happened."}
      width={520}
      footer={
        step === "review" ? (
          <>
            <SecondaryButton onClick={() => setStep("dispute")}>This isn't me</SecondaryButton>
            <PrimaryButton onClick={() => setStep("claim")}>Claim this profile →</PrimaryButton>
          </>
        ) : step === "claim" ? (
          <>
            <SecondaryButton onClick={() => setStep("review")}>Back</SecondaryButton>
            <PrimaryButton onClick={accept}>Confirm + sign in</PrimaryButton>
          </>
        ) : (
          <>
            <SecondaryButton onClick={() => setStep("review")}>Back</SecondaryButton>
            <PrimaryButton onClick={submitDispute}>Send report</PrimaryButton>
          </>
        )
      }
    >
      {step === "review" && (
        <>
          {/* Profile preview */}
          <div style={{
            padding: 16, borderRadius: 12,
            background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
            marginBottom: 14, fontFamily: FONTS.body,
          }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <span style={{
                width: 56, height: 56, borderRadius: "50%",
                background: `url(https://i.pravatar.cc/200?img=23) center/cover, ${COLORS.surfaceAlt}`,
                flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink }}>{profileName}</div>
                <div style={{ fontSize: 12, color: COLORS.accentDeep, fontWeight: 600 }}>Promotional model · Lisbon</div>
                <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>Created by {agencyName} · 5 days ago</div>
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, textTransform: "uppercase", marginBottom: 6 }}>
              What's already on your profile
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["3 photos", "Lisbon", "5'8\"", "EN · PT", "Trade-show staff"].map((c) => (
                <span key={c} style={{
                  fontSize: 10.5, padding: "2px 8px", borderRadius: 999,
                  background: "rgba(11,11,13,0.05)", color: COLORS.ink, fontWeight: 500,
                }}>{c}</span>
              ))}
            </div>
          </div>

          {/* Permissions / what they'll capture */}
          <Section title={`What ${agencyName} will manage`} framed>
            <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5, marginBottom: 8 }}>
              By claiming, you agree this agency can edit your profile and represent you for bookings until you say otherwise.
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: COLORS.ink, lineHeight: 1.6 }}>
              <li>Send inquiries on your behalf</li>
              <li>Edit your profile fields you don't lock</li>
              <li>Add Agency Confirmed badge to your profile</li>
              <li>Pause/unpause your visibility</li>
            </ul>
            <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 8, lineHeight: 1.5 }}>
              You can release ownership any time from your Talent settings.
            </div>
          </Section>
        </>
      )}

      {step === "claim" && (
        <>
          <FieldRow label="Your email">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </FieldRow>
          <div style={{
            padding: 12, borderRadius: 10,
            background: COLORS.indigoSoft, border: "1px solid rgba(91,107,160,0.18)",
            fontSize: 11.5, color: COLORS.indigoDeep, lineHeight: 1.5, marginBottom: 14,
          }}>
            We'll email you a one-tap sign-in link. Once you click it, the profile is yours — {agencyName} keeps editing access until you change it.
          </div>
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            cursor: "pointer", fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, lineHeight: 1.5,
          }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              I confirm I am {profileName} and I've reviewed what {agencyName} will manage on my behalf.
            </span>
          </label>
        </>
      )}

      {step === "dispute" && (
        <>
          <Section title="What's wrong?" framed>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="e.g. I'm not Amelia. I don't know this agency. The photos aren't mine."
              rows={4}
              autoFocus
              style={{
                width: "100%", boxSizing: "border-box", padding: "10px 12px",
                borderRadius: 10, border: `1px solid ${COLORS.border}`,
                fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
                resize: "vertical",
              }}
            />
          </Section>
          <div style={{
            padding: 12, borderRadius: 10,
            background: "rgba(200,40,40,0.08)",
            fontSize: 11.5, color: COLORS.red, lineHeight: 1.5,
          }}>
            Reporting takes the profile offline immediately and notifies Tulala admins. We'll resolve within 1 business day.
          </div>
        </>
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Platform-admin Verification Methods console
// ────────────────────────────────────────────────────────────────────
// Source-of-truth registry. Toggle methods on/off, change review mode,
// visibility, tier-gating, and evidence requirements. Every change
// emits an audit entry.
// ════════════════════════════════════════════════════════════════════


export function PlatformVerificationMethodsDrawer() {
  const { closeDrawer, verificationMethodConfigs, verificationMethodAudit, updateVerificationMethod, profileVerifications, toast } = useAdminShell();
  const [activeId, setActiveId] = useState<VerificationType | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<{ type: VerificationType; label: string; activeCount: number } | null>(null);

  const cur: VerificationMethodConfig | null = activeId ? verificationMethodConfigs.find(c => c.type === activeId) ?? null : verificationMethodConfigs[0];
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

  const activeBadgeCountFor = (type: VerificationType) =>
    profileVerifications.filter(pv => pv.verificationType === type && pv.status === "active").length;

  const onToggleEnabled = (type: VerificationType, next: boolean) => {
    if (!next) {
      const count = activeBadgeCountFor(type);
      const meta = VERIFICATION_TYPE_META[type];
      if (count > 0) {
        setConfirmDisable({ type, label: meta.label, activeCount: count });
        return;
      }
    }
    updateVerificationMethod(type, { enabled: next });
    const m = VERIFICATION_TYPE_META[type];
    toast(`${m.label} ${next ? "enabled" : "disabled"} platform-wide`);
  };

  const confirmDisableMethod = () => {
    if (!confirmDisable) return;
    updateVerificationMethod(confirmDisable.type, { enabled: false });
    toast(`${confirmDisable.label} disabled · ${confirmDisable.activeCount} active badges remain valid until expiry`);
    setConfirmDisable(null);
  };

  const enabledCount = verificationMethodConfigs.filter(c => c.enabled).length;
  const filteredAudit = activeId ? verificationMethodAudit.filter(a => a.methodType === activeId) : verificationMethodAudit;

  return (
    <>
      <DrawerShell
        open
        onClose={closeDrawer}
        title="Verification methods"
        description={`${enabledCount} of ${verificationMethodConfigs.length} methods enabled · platform-wide registry`}
        width={820}
        footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      >
        <div style={{
          padding: "10px 12px", borderRadius: 10, marginBottom: 14,
          background: "rgba(91,107,160,0.06)", border: `1px solid rgba(91,107,160,0.18)`,
          fontSize: 12, color: COLORS.indigoDeep, lineHeight: 1.55,
        }}>
          Enable methods that talent and clients can use to build trust on Tulala. Disabled methods disappear from talent CTAs and admin queues. Active badges of disabled methods stay valid until expiry.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 1.4fr", gap: 14 }}>
          {/* List */}
          <div style={{
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12,
            background: "#fff", maxHeight: "70vh", overflowY: "auto",
          }}>
            {verificationMethodConfigs.map(c => {
              const meta = VERIFICATION_TYPE_META[c.type];
              const active = (cur?.type ?? null) === c.type;
              return (
                <button key={c.type} type="button" onClick={() => setActiveId(c.type)} style={{
                  display: "flex", width: "100%", textAlign: "left", gap: 10,
                  padding: "12px 14px", border: "none",
                  background: active ? COLORS.surface : "transparent",
                  borderBottom: `1px solid ${COLORS.borderSoft}`,
                  cursor: "pointer", fontFamily: FONTS.body, alignItems: "flex-start",
                }}>
                  <span aria-hidden style={{ fontSize: 18, lineHeight: "20px" }}>{meta.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{meta.label}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                        background: c.enabled ? "rgba(15,79,62,0.12)" : "rgba(11,11,13,0.06)",
                        color: c.enabled ? COLORS.successDeep : COLORS.inkDim,
                      }}>{c.enabled ? "ON" : "OFF"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>
                      {REVIEW_MODE_LABEL[c.reviewMode]} · {c.visibleOn.map(v => VISIBILITY_LABEL[v]).join(" · ")}
                    </div>
                    <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginTop: 2 }}>
                      {c.availableToTiers.map(t => TIER_LABEL[t]).join(", ")}{c.evidenceRequired ? " · evidence" : ""}{c.expiresAfterDays ? ` · expires ${c.expiresAfterDays}d` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail */}
          <div style={{
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12,
            background: "#fff", padding: 16,
          }}>
            {!cur ? (
              <div style={{ color: COLORS.inkMuted, fontSize: 12.5 }}>Pick a method to configure.</div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.2 }}>
                    {VERIFICATION_TYPE_META[cur.type].label}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginBottom: 14, lineHeight: 1.5 }}>
                  {VERIFICATION_TYPE_META[cur.type].tooltip}
                </div>

                {/* Enabled toggle */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px", borderRadius: 10, background: COLORS.surface,
                  border: `1px solid ${COLORS.borderSoft}`, marginBottom: 14,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Enabled platform-wide</div>
                    <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                      {cur.enabled ? "Talent and admins can use this method." : "Hidden from talent CTAs and admin queues."}
                    </div>
                  </div>
                  <button type="button" onClick={() => onToggleEnabled(cur.type, !cur.enabled)} style={{
                    width: 44, height: 24, borderRadius: 999,
                    background: cur.enabled ? COLORS.successDeep : "rgba(11,11,13,0.18)",
                    border: "none", cursor: "pointer", position: "relative",
                    transition: "background 0.15s",
                  }} aria-label="Toggle enabled">
                    <span style={{
                      position: "absolute", top: 3, left: cur.enabled ? 23 : 3,
                      width: 18, height: 18, borderRadius: "50%", background: "#fff",
                      transition: "left 0.15s",
                      boxShadow: "0 1px 2px rgba(11,11,13,0.20)",
                    }} />
                  </button>
                </div>

                <ConfigRow label="Review mode" hint="Automated runs without a human; manual goes through the admin queue.">
                  <select value={cur.reviewMode} onChange={(e) => updateVerificationMethod(cur.type, { reviewMode: e.target.value as "automated" | "manual" | "hybrid" })} style={vmSelectStyle()}>
                    {(["automated", "manual", "hybrid"] as const).map(m => <option key={m} value={m}>{REVIEW_MODE_LABEL[m]}</option>)}
                  </select>
                </ConfigRow>

                <ConfigRow label="Visible on" hint="Public_profile = badge appears on storefront; admin_only = trust signal not shown publicly.">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(["public_profile", "admin_only", "internal"] as const).map(v => {
                      const on = cur.visibleOn.includes(v);
                      return (
                        <button key={v} type="button" onClick={() => {
                          const next = on ? cur.visibleOn.filter(x => x !== v) : [...cur.visibleOn, v];
                          if (next.length === 0) return;
                          updateVerificationMethod(cur.type, { visibleOn: next });
                        }} style={vmChipStyle(on)}>{VISIBILITY_LABEL[v]}</button>
                      );
                    })}
                  </div>
                </ConfigRow>

                <ConfigRow label="Available to tiers" hint='"All" overrides specific tiers.'>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(["all", "basic", "pro", "portfolio"] as const).map(t => {
                      const on = cur.availableToTiers.includes(t);
                      return (
                        <button key={t} type="button" onClick={() => {
                          const next = on
                            ? cur.availableToTiers.filter(x => x !== t)
                            : t === "all" ? ["all" as const] : [...cur.availableToTiers.filter(x => x !== "all"), t];
                          if (next.length === 0) return;
                          updateVerificationMethod(cur.type, { availableToTiers: next });
                        }} style={vmChipStyle(on)}>{TIER_LABEL[t]}</button>
                      );
                    })}
                  </div>
                </ConfigRow>

                <ConfigRow label="Evidence required" hint="Talent must attach a URL or upload to submit.">
                  <input type="checkbox" checked={cur.evidenceRequired}
                    onChange={(e) => updateVerificationMethod(cur.type, { evidenceRequired: e.target.checked })} />
                </ConfigRow>

                <ConfigRow label="Expires after (days)" hint="Blank = badge never expires.">
                  <input type="number" min={0} value={cur.expiresAfterDays ?? ""} placeholder="never"
                    onChange={(e) => updateVerificationMethod(cur.type, { expiresAfterDays: e.target.value === "" ? null : Number(e.target.value) })}
                    style={{ width: 120, padding: "7px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 12.5 }}
                  />
                </ConfigRow>

                {/* Audit log */}
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLORS.borderSoft}` }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
                    color: COLORS.inkDim, marginBottom: 8,
                  }}>Recent changes</div>
                  {filteredAudit.length === 0 ? (
                    <div style={{ fontSize: 12, color: COLORS.inkDim }}>No changes logged.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {filteredAudit.slice(0, 8).map(a => (
                        <div key={a.id} style={{ fontSize: 11.5, color: COLORS.ink, lineHeight: 1.5 }}>
                          <span style={{ color: COLORS.inkMuted }}>{fmt(a.at)}</span> · <strong>{a.changeKind.replace(/_/g, " ")}</strong>: {a.before} → {a.after}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DrawerShell>

      {confirmDisable && (
        <div onClick={() => setConfirmDisable(null)} style={{
          position: "fixed", inset: 0, zIndex: 220,
          background: "rgba(11,11,13,0.42)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONTS.body,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "calc(100% - 48px)", maxWidth: 460,
            background: "#fff", borderRadius: 16, padding: 22,
            boxShadow: "0 24px 80px -20px rgba(11,11,13,0.45)",
          }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, color: COLORS.ink, marginBottom: 6 }}>
              Disable {confirmDisable.label}?
            </div>
            <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginBottom: 14, lineHeight: 1.5 }}>
              <strong style={{ color: COLORS.ink }}>{confirmDisable.activeCount} active badge{confirmDisable.activeCount === 1 ? "" : "s"}</strong> will stay valid until expiry, but they'll be hidden from public profiles right away. New requests of this type will be blocked.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setConfirmDisable(null)} style={{
                padding: "9px 16px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
                background: "transparent", color: COLORS.ink,
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}>Cancel</button>
              <button type="button" onClick={confirmDisableMethod} style={{
                padding: "9px 16px", borderRadius: 999, border: "none",
                background: COLORS.red, color: "#fff",
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}>Disable</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

