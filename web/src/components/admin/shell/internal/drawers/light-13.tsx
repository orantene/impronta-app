"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  DrawerShell,
  FONTS,
  MethodDisabledNotice,
  PrimaryButton,
  SecondaryButton,
  Section,
  StatDot,
  StateChipMini,
  VmFieldLabel,
  useAdminShell,
  vmSmallHelpStyle,
  vmTextInputStyle
} from "./drawer-shared";

// Phase 1d (remediation §4): 10 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TalentPhoneVerifyDrawer() {
  const { state, closeDrawer, toast, createVerificationRequest, approveVerificationRequest, isVerificationMethodEnabled } = useAdminShell();
  const open = state.drawer.drawerId === "talent-phone-verify";
  const TALENT_ID = "t1";
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code" | "done">("phone");
  const [generatedCode, setGeneratedCode] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  if (!isVerificationMethodEnabled("phone_verified")) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title="Phone Verification" width={520}
        footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}>
        <MethodDisabledNotice />
      </DrawerShell>
    );
  }

  const sendCode = () => {
    if (!/^\+?\d{6,}$/.test(phone.replace(/\s/g, ""))) {
      toast("Enter a valid phone number with country code");
      return;
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedCode(otp);
    const req = createVerificationRequest({
      subjectType: "talent_profile", subjectId: TALENT_ID,
      requestedByUserId: "u-current-talent", context: "agency",
      method: "phone", verificationType: "phone_verified",
      verificationCode: otp, claimedIdentifier: phone.trim(),
      status: "pending_user_action",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    setRequestId(req.id);
    setStage("code");
    toast(`Code sent to ${phone} (demo: ${otp})`);
  };

  const verifyCode = () => {
    if (code.trim() === generatedCode && requestId) {
      approveVerificationRequest(requestId);
      setStage("done");
      toast("Phone verified");
    } else {
      toast("Wrong code · try again");
    }
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Verify your phone"
      description="Confirm a working phone number — used for security alerts. Stays internal — never shown publicly."
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>{stage === "done" ? "Close" : "Cancel"}</SecondaryButton>}
    >
      {stage === "phone" && (
        <>
          <VmFieldLabel>Phone number</VmFieldLabel>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+34 600 000 000" autoFocus style={vmTextInputStyle()} />
          <div style={vmSmallHelpStyle()}>Include country code. Standard SMS rates apply.</div>
          <PrimaryButton onClick={sendCode}>Send code</PrimaryButton>
        </>
      )}
      {stage === "code" && (
        <>
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12, color: COLORS.ink }}>
            Code sent to <strong>{phone}</strong>. Expires in 10 min. Demo code: <strong>{generatedCode}</strong>
          </div>
          <VmFieldLabel>6-digit code</VmFieldLabel>
          <input type="text" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus style={{ ...vmTextInputStyle(), letterSpacing: 6, fontSize: 18, textAlign: "center" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <SecondaryButton onClick={() => setStage("phone")}>Change number</SecondaryButton>
            <PrimaryButton onClick={verifyCode}>Verify</PrimaryButton>
          </div>
        </>
      )}
      {stage === "done" && (
        <div style={{
          padding: 20, borderRadius: 12, background: COLORS.successSoft, color: COLORS.successDeep,
          fontSize: 13, textAlign: "center", fontWeight: 600,
        }}>
          ✓ Phone verified. Your account security level just went up.
        </div>
      )}
    </DrawerShell>
  );
}


export function TalentIdVerifyDrawer() {
  const { state, closeDrawer, toast, createVerificationRequest, isVerificationMethodEnabled, getVerificationMethodConfig } = useAdminShell();
  const open = state.drawer.drawerId === "talent-id-verify";
  const TALENT_ID = "t1";
  const [docType, setDocType] = useState<"passport" | "drivers_license" | "national_id">("passport");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");

  if (!isVerificationMethodEnabled("id_verified")) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title="ID Verification" width={560}
        footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}>
        <MethodDisabledNotice />
      </DrawerShell>
    );
  }
  const cfg = getVerificationMethodConfig("id_verified");
  const submit = () => {
    if (cfg.evidenceRequired && !evidenceUrl.trim()) {
      toast("Upload URL required");
      return;
    }
    createVerificationRequest({
      subjectType: "talent_profile", subjectId: TALENT_ID,
      requestedByUserId: "u-current-talent", context: "agency",
      method: "manual_review", verificationType: "id_verified",
      claimedIdentifier: docType,
      evidenceUrl: evidenceUrl.trim() || null,
      evidenceNote: evidenceNote.trim() || null,
      status: "submitted",
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    });
    toast("ID submitted · admin review within 48h");
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Verify your ID"
      description="Upload a government-issued ID. Stays internal — never shown publicly. Used to confirm name + age + identity uniqueness."
      width={560}
      footer={<><SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton><PrimaryButton onClick={submit}>Submit for review</PrimaryButton></>}
    >
      <div style={{
        padding: "10px 12px", borderRadius: 10, marginBottom: 14,
        background: "rgba(91,107,160,0.06)", border: `1px solid rgba(91,107,160,0.18)`,
        fontSize: 11.5, color: COLORS.indigoDeep, lineHeight: 1.5,
      }}>
        🔒 Documents are encrypted, viewed only by trained reviewers, and deleted 30 days after decision.
      </div>

      <VmFieldLabel>Document type</VmFieldLabel>
      <select value={docType} onChange={(e) => setDocType(e.target.value as "passport" | "drivers_license" | "national_id")} style={{ ...vmTextInputStyle(), cursor: "pointer" }}>
        <option value="passport">Passport</option>
        <option value="drivers_license">Driver's license</option>
        <option value="national_id">National ID card</option>
      </select>

      <VmFieldLabel>Document URL{cfg.evidenceRequired ? " *" : ""}</VmFieldLabel>
      <input type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)}
        placeholder="https://… secure upload link" style={vmTextInputStyle()} />
      <div style={vmSmallHelpStyle()}>In production this is a direct upload. Prototype expects a secure URL (e.g. signed S3 / Drive link).</div>

      <VmFieldLabel>Note for reviewer (optional)</VmFieldLabel>
      <textarea value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} rows={3}
        placeholder="e.g. Name in document is 'María Reyes' — same as profile."
        style={{ ...vmTextInputStyle(), resize: "vertical" }} />
    </DrawerShell>
  );
}


export function TalentBusinessVerifyDrawer() {
  const { state, closeDrawer, toast, createVerificationRequest, isVerificationMethodEnabled, getVerificationMethodConfig } = useAdminShell();
  const open = state.drawer.drawerId === "talent-business-verify";
  const TALENT_ID = "t1";
  const [legalName, setLegalName] = useState("");
  const [vat, setVat] = useState("");
  const [registryUrl, setRegistryUrl] = useState("");

  if (!isVerificationMethodEnabled("business_verified")) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title="Business Verification" width={560}
        footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}>
        <MethodDisabledNotice />
      </DrawerShell>
    );
  }
  const cfg = getVerificationMethodConfig("business_verified");
  const submit = () => {
    if (!legalName.trim() || !vat.trim()) { toast("Legal name + VAT/registration number required"); return; }
    if (cfg.evidenceRequired && !registryUrl.trim()) { toast("Public registry URL required by platform policy"); return; }
    createVerificationRequest({
      subjectType: "talent_profile", subjectId: TALENT_ID,
      requestedByUserId: "u-current-talent", context: "agency",
      method: "manual_review", verificationType: "business_verified",
      claimedIdentifier: vat.trim(),
      evidenceUrl: registryUrl.trim() || null,
      evidenceNote: `Legal name: ${legalName.trim()}`,
      status: "submitted",
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    });
    toast("Business details submitted · review within 3 business days");
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Verify your business"
      description="Confirm the registered legal entity behind your work. Public badge."
      width={560}
      footer={<><SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton><PrimaryButton onClick={submit}>Submit</PrimaryButton></>}
    >
      <VmFieldLabel>Legal entity name *</VmFieldLabel>
      <input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="e.g. Reyes Studio S.L." style={vmTextInputStyle()} />

      <VmFieldLabel>VAT / registration number *</VmFieldLabel>
      <input type="text" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="e.g. ESB12345678" style={vmTextInputStyle()} />

      <VmFieldLabel>Public registry URL{cfg.evidenceRequired ? " *" : " (optional)"}</VmFieldLabel>
      <input type="url" value={registryUrl} onChange={(e) => setRegistryUrl(e.target.value)} placeholder="https://… link to registry record" style={vmTextInputStyle()} />
      <div style={vmSmallHelpStyle()}>e.g. Companies House, DIC, Sociedades Mercantiles.{cfg.evidenceRequired ? " Required by platform policy." : ""}</div>
    </DrawerShell>
  );
}


export function TalentDomainVerifyDrawer() {
  const { state, closeDrawer, toast, createVerificationRequest, approveVerificationRequest, isVerificationMethodEnabled } = useAdminShell();
  const open = state.drawer.drawerId === "talent-domain-verify";
  const TALENT_ID = "t1";
  const [domain, setDomain] = useState("");
  const [stage, setStage] = useState<"input" | "instructions" | "checking" | "done">("input");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [txtValue, setTxtValue] = useState("");

  if (!isVerificationMethodEnabled("domain_verified")) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title="Domain Verification" width={560}
        footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}>
        <MethodDisabledNotice />
      </DrawerShell>
    );
  }
  const startCheck = () => {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim())) {
      toast("Enter a valid domain (e.g. martareyes.com)");
      return;
    }
    const txt = `tulala-verify=${Math.random().toString(36).slice(2, 14)}`;
    setTxtValue(txt);
    const req = createVerificationRequest({
      subjectType: "talent_profile", subjectId: TALENT_ID,
      requestedByUserId: "u-current-talent", context: "agency",
      method: "domain", verificationType: "domain_verified",
      claimedIdentifier: domain.trim(),
      verificationCode: txt,
      status: "pending_user_action",
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    setRequestId(req.id);
    setStage("instructions");
  };
  const runCheck = () => {
    setStage("checking");
    setTimeout(() => {
      if (requestId) approveVerificationRequest(requestId);
      setStage("done");
      toast("DNS record found · domain verified");
    }, 1500);
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Verify your domain"
      description="Prove you control a domain (e.g. martareyes.com). Public badge — adds credibility."
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>{stage === "done" ? "Close" : "Cancel"}</SecondaryButton>}
    >
      {stage === "input" && (
        <>
          <VmFieldLabel>Domain</VmFieldLabel>
          <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="martareyes.com" autoFocus style={vmTextInputStyle()} />
          <div style={vmSmallHelpStyle()}>Just the domain — no https:// or paths.</div>
          <PrimaryButton onClick={startCheck}>Get DNS instructions</PrimaryButton>
        </>
      )}
      {stage === "instructions" && (
        <>
          <div style={{ fontSize: 13, color: COLORS.ink, marginBottom: 10 }}>Add this TXT record to <strong>{domain}</strong>:</div>
          <div style={{
            padding: "12px 14px", borderRadius: 10, background: COLORS.surface,
            border: `1px solid ${COLORS.borderSoft}`, marginBottom: 14,
            fontFamily: FONTS.mono ?? FONTS.body, fontSize: 12, color: COLORS.ink, lineHeight: 1.6,
          }}>
            <div><strong>Type:</strong> TXT</div>
            <div><strong>Host:</strong> @</div>
            <div><strong>Value:</strong> {txtValue}</div>
            <div><strong>TTL:</strong> 3600</div>
          </div>
          <div style={vmSmallHelpStyle()}>DNS can take 5–30 minutes to propagate. Once added, click below.</div>
          <PrimaryButton onClick={runCheck}>I've added the record · check now</PrimaryButton>
        </>
      )}
      {stage === "checking" && (
        <div style={{ textAlign: "center", padding: 30, color: COLORS.inkMuted, fontSize: 13 }}>
          Looking up TXT record on {domain}…
        </div>
      )}
      {stage === "done" && (
        <div style={{
          padding: 20, borderRadius: 12, background: COLORS.successSoft, color: COLORS.successDeep,
          fontSize: 13, textAlign: "center", fontWeight: 600,
        }}>
          ✓ {domain} verified. Domain badge is live.
        </div>
      )}
    </DrawerShell>
  );
}


export function TalentPaymentVerifyDrawer() {
  const { state, closeDrawer, toast, createVerificationRequest, approveVerificationRequest, isVerificationMethodEnabled } = useAdminShell();
  const open = state.drawer.drawerId === "talent-payment-verify";
  const TALENT_ID = "t1";
  const [stage, setStage] = useState<"intro" | "running" | "done">("intro");

  if (!isVerificationMethodEnabled("payment_verified")) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title="Payment Verification" width={520}
        footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}>
        <MethodDisabledNotice />
      </DrawerShell>
    );
  }
  const run = () => {
    setStage("running");
    setTimeout(() => {
      const req = createVerificationRequest({
        subjectType: "talent_profile", subjectId: TALENT_ID,
        requestedByUserId: "u-current-talent", context: "agency",
        method: "payment", verificationType: "payment_verified",
        claimedIdentifier: "stripe_acct_demo",
        status: "submitted",
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      });
      approveVerificationRequest(req.id);
      setStage("done");
      toast("Payment account verified");
    }, 1500);
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Verify payment account"
      description="Confirm a working payout method. Internal only — improves your trust score for clients."
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>{stage === "done" ? "Close" : "Cancel"}</SecondaryButton>}
    >
      {stage === "intro" && (
        <>
          <div style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.6, marginBottom: 14 }}>
            We'll attempt a €1 hold on your connected payout method, then immediately refund it. Nothing actually moves.
          </div>
          <PrimaryButton onClick={run}>Run check</PrimaryButton>
        </>
      )}
      {stage === "running" && (
        <div style={{ textAlign: "center", padding: 30, color: COLORS.inkMuted, fontSize: 13 }}>
          Pinging Stripe…
        </div>
      )}
      {stage === "done" && (
        <div style={{
          padding: 20, borderRadius: 12, background: COLORS.successSoft, color: COLORS.successDeep,
          fontSize: 13, textAlign: "center", fontWeight: 600,
        }}>
          ✓ Payment account verified.
        </div>
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-25.2 — Bulk client CSV import
// Pattern parallels NewTalentDrawer's CSV mode but slimmer: clients are
// just (name, contact, email) records — no taxonomy mapping, no
// approval queue. Imports go straight into `importedClients` and
// surface in the Clients page.
// ════════════════════════════════════════════════════════════════════


export function ClientCsvBulkAddDrawer() {
  const { state, closeDrawer, bulkAddClient, toast } = useAdminShell();
  const open = state.drawer.drawerId === "client-csv-bulk-add";
  const [raw, setRaw] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  type Row = { name: string; contact: string; email: string };
  const parsed: Row[] = (() => {
    if (!raw.trim()) return [];
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const headerLine = lines[0].toLowerCase();
    const cols = headerLine.split(",").map(c => c.trim());
    const indexOf = (...names: string[]) => {
      for (const n of names) {
        const idx = cols.findIndex(c => c === n || c.startsWith(n));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const iName    = indexOf("name", "company", "client", "brand");
    const iContact = indexOf("contact", "person", "buyer");
    const iEmail   = indexOf("email", "e-mail");
    return lines.slice(1).map(line => {
      const cells = line.split(",").map(c => c.trim());
      return {
        name:    iName    >= 0 ? cells[iName]    ?? "" : "",
        contact: iContact >= 0 ? cells[iContact] ?? "" : "",
        email:   iEmail   >= 0 ? cells[iEmail]   ?? "" : "",
      };
    }).filter(r => r.name || r.contact || r.email);
  })();
  const valid = parsed.filter(r => r.name.trim() && (r.contact.trim() || r.email.trim())).length;
  const sample = `name,contact,email
Vogue Italia,Sara Bianchi,sara@vogue.it
Mango,Joana Rivera,joana@mango.com
Net-a-Porter,Helena Ross,helena@net-a-porter.com`;

  const handleFile = async (f: File) => {
    const text = await f.text();
    setRaw(text);
  };

  const footer = (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
      <PrimaryButton
        disabled={valid === 0}
        onClick={() => {
          const created = bulkAddClient(parsed.map(r => ({ name: r.name, contact: r.contact, email: r.email })));
          if (created > 0) {
            toast(`Imported ${created} client${created === 1 ? "" : "s"}`);
            closeDrawer();
          } else {
            toast("No valid rows — each row needs a name + contact or email");
          }
        }}
      >
        Import {valid > 0 ? `${valid} client${valid === 1 ? "" : "s"}` : "clients"}
      </PrimaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Bulk import clients" description="Paste or upload a CSV of clients to add to your workspace." footer={footer}>
      <div style={{ padding: 20, fontFamily: FONTS.body }}>
        <div style={{
          padding: 14, borderRadius: 12,
          background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}`,
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink, marginBottom: 4 }}>
            Paste or upload a CSV
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 10, lineHeight: 1.5 }}>
            Headers we recognize: <code style={{ fontFamily: FONTS.mono }}>name, contact, email</code>.
            Other column orders work too.
          </div>
          <textarea value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={sample}
            rows={6}
            style={{
              width: "100%", boxSizing: "border-box", padding: "10px 12px",
              borderRadius: 10, border: `1px solid ${COLORS.border}`,
              fontFamily: FONTS.mono, fontSize: 11.5, color: COLORS.ink, outline: "none",
              resize: "vertical", background: "#fff",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => fileRef.current?.click()} style={{
              padding: "7px 12px", borderRadius: 999,
              border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>📎 Upload .csv file</button>
            <button type="button" onClick={() => setRaw(sample)} style={{
              padding: "7px 12px", borderRadius: 999,
              border: `1px dashed ${COLORS.border}`, background: "transparent",
              color: COLORS.inkMuted,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>Use sample</button>
            {raw && (
              <button type="button" onClick={() => setRaw("")} style={{
                padding: "7px 12px", borderRadius: 999, border: "none",
                background: "transparent", color: COLORS.inkMuted,
                fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}>Clear</button>
            )}
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </div>
        </div>

        {parsed.length > 0 && (
          <>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, textTransform: "uppercase" }}>
                Preview · {parsed.length} row{parsed.length === 1 ? "" : "s"} ({valid} valid)
              </div>
            </div>
            <div style={{
              border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10,
              maxHeight: 300, overflowY: "auto",
            }}>
              {parsed.map((r, i) => {
                const isValid = r.name.trim() && (r.contact.trim() || r.email.trim());
                return (
                  <div key={i} style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr 1.4fr 18px",
                    gap: 10, padding: "8px 12px", alignItems: "center",
                    borderBottom: i < parsed.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
                    background: isValid ? "#fff" : COLORS.amberSoft,
                    fontSize: 11.5,
                  }}>
                    <span style={{ fontWeight: 600, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || "—"}</span>
                    <span style={{ color: COLORS.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.contact || "—"}</span>
                    <span style={{ color: COLORS.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email || "—"}</span>
                    <span style={{ color: isValid ? COLORS.successDeep : COLORS.amberDeep, fontWeight: 700, textAlign: "center" }}>{isValid ? "✓" : "!"}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DrawerShell>
  );
}


export function TaxonomyDrawer() {
  const { closeDrawer } = useAdminShell();
  const taxonomies = [
    { label: "Niches", values: ["Editorial", "Commercial", "Runway", "Showroom", "Lookbook"] },
    { label: "Categories", values: ["Female", "Male", "Non-binary"] },
    { label: "Regions", values: ["EU North", "EU South", "Iberia", "UK"] },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Taxonomy"
      description="Tags and categories for filtering and segmentation."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      {taxonomies.map((tx) => (
        <Section key={tx.label} title={tx.label}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tx.values.map((v) => (
              <span
                key={v}
                style={{
                  background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  padding: "5px 10px",
                  borderRadius: 999,
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  color: COLORS.ink,
                  fontWeight: 500,
                }}
              >
                {v}
              </span>
            ))}
            <button
              style={{
                background: "transparent",
                border: `1px dashed ${COLORS.border}`,
                padding: "5px 10px",
                borderRadius: 999,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                color: COLORS.inkMuted,
                cursor: "pointer",
              }}
            >
              + Add
            </button>
          </div>
        </Section>
      ))}
    </DrawerShell>
  );
}


export function WidgetsDrawer() {
  const { closeDrawer, effectiveTenant } = useAdminShell();
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Embeddable widgets"
      description="Drop your roster into any site."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <Section title="Active embeds">
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
            Roster grid
          </div>
          <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
            Used on acme-models.com/talent
          </div>
        </div>
      </Section>
      <Section title="Embed code">
        <div
          style={{
            background: COLORS.fillDeep,
            color: "#9DD9C7",
            padding: 12,
            borderRadius: 8,
            fontFamily: FONTS.mono,
            fontSize: 11,
            lineHeight: 1.7,
            overflowX: "auto",
            whiteSpace: "pre",
          }}
        >
{`<script src="https://embed.tulala.app/v1/widget.js"
  data-tenant="${effectiveTenant.slug}"
  data-view="grid"
  data-cols="3"></script>`}
        </div>
      </Section>
    </DrawerShell>
  );
}


export function ApiKeysDrawer() {
  const { closeDrawer } = useAdminShell();
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="API keys"
      description="Read your roster from your own app."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>Generate key</PrimaryButton>
        </>
      }
    >
      <Section title="Active keys">
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            padding: 12,
            fontFamily: FONTS.mono,
            fontSize: 11.5,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: COLORS.ink }}>tul_pk_••••••••••a91f</span>
            <StateChipMini label="Read only" tone="green" />
          </div>
          <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 4, fontFamily: FONTS.body }}>
            Used 184× in last 7 days
          </div>
        </div>
      </Section>
    </DrawerShell>
  );
}


export function SiteHealthDrawer() {
  const { closeDrawer } = useAdminShell();
  const checks = [
    { label: "Lighthouse score", value: "94", tone: "green" as const },
    { label: "Image optimization", value: "All optimized", tone: "green" as const },
    { label: "Broken links", value: "0", tone: "green" as const },
    { label: "SSL", value: "Valid · auto-renew", tone: "green" as const },
    { label: "Sitemap", value: "Generated 2h ago", tone: "green" as const },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Site health"
      description="Lighthouse, broken links, image optimization."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <Section title="Latest report">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {checks.map((c) => (
            <div
              key={c.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
                fontFamily: FONTS.body,
              }}
            >
              <StatDot tone={c.tone} />
              <span style={{ flex: 1, fontSize: 12.5, color: COLORS.ink, fontWeight: 500 }}>
                {c.label}
              </span>
              <span style={{ fontSize: 12, color: COLORS.inkMuted }}>{c.value}</span>
            </div>
          ))}
        </div>
      </Section>
    </DrawerShell>
  );
}

