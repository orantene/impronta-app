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
import { useDashboardText } from "../dashboard-i18n";

// Phase 1d (remediation §4): 10 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TalentPhoneVerifyDrawer() {
  const { state, closeDrawer, toast, createVerificationRequest, approveVerificationRequest, isVerificationMethodEnabled } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const open = state.drawer.drawerId === "talent-phone-verify";
  const TALENT_ID = "t1";
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code" | "done">("phone");
  const [generatedCode, setGeneratedCode] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  if (!isVerificationMethodEnabled("phone_verified")) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title={tt("Phone Verification")} width={520}
        footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}>
        <MethodDisabledNotice />
      </DrawerShell>
    );
  }

  const sendCode = () => {
    if (!/^\+?\d{6,}$/.test(phone.replace(/\s/g, ""))) {
      toast(tt("Enter a valid phone number with country code"));
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
    toast(copy.isSpanish ? `Código enviado a ${phone} (demo: ${otp})` : `Code sent to ${phone} (demo: ${otp})`);
  };

  const verifyCode = () => {
    if (code.trim() === generatedCode && requestId) {
      approveVerificationRequest(requestId);
      setStage("done");
      toast(tt("Phone verified"));
    } else {
      toast(tt("Wrong code · try again"));
    }
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={tt("Verify your phone")}
      description={tt("Confirm a working phone number — used for security alerts. Stays internal — never shown publicly.")}
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>{stage === "done" ? tt("Close") : tt("Cancel")}</SecondaryButton>}
    >
      {stage === "phone" && (
        <>
          <VmFieldLabel>{tt("Phone number")}</VmFieldLabel>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+34 600 000 000" autoFocus style={vmTextInputStyle()} />
          <div style={vmSmallHelpStyle()}>{tt("Include country code. Standard SMS rates apply.")}</div>
          <PrimaryButton onClick={sendCode}>{tt("Send code")}</PrimaryButton>
        </>
      )}
      {stage === "code" && (
        <>
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12 }} className="bg-admin-surface text-admin-ink">
            {tt("Code sent to")} <strong>{phone}</strong>. {tt("Expires in 10 min. Demo code:")} <strong>{generatedCode}</strong>
          </div>
          <VmFieldLabel>{tt("6-digit code")}</VmFieldLabel>
          <input type="text" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus style={{ ...vmTextInputStyle(), letterSpacing: 6, fontSize: 18, textAlign: "center" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <SecondaryButton onClick={() => setStage("phone")}>{tt("Change number")}</SecondaryButton>
            <PrimaryButton onClick={verifyCode}>{tt("Verify")}</PrimaryButton>
          </div>
        </>
      )}
      {stage === "done" && (
        <div style={{ padding: 20, borderRadius: 12, fontSize: 13, textAlign: "center", fontWeight: 600 }} className="bg-admin-success-soft text-admin-success-deep">
          ✓ {tt("Phone verified. Your account security level just went up.")}
        </div>
      )}
    </DrawerShell>
  );
}


export function TalentIdVerifyDrawer() {
  const { state, closeDrawer, toast, createVerificationRequest, isVerificationMethodEnabled, getVerificationMethodConfig } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const open = state.drawer.drawerId === "talent-id-verify";
  const TALENT_ID = "t1";
  const [docType, setDocType] = useState<"passport" | "drivers_license" | "national_id">("passport");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");

  if (!isVerificationMethodEnabled("id_verified")) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title={tt("ID Verification")} width={560}
        footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}>
        <MethodDisabledNotice />
      </DrawerShell>
    );
  }
  const cfg = getVerificationMethodConfig("id_verified");
  const submit = () => {
    if (cfg.evidenceRequired && !evidenceUrl.trim()) {
      toast(tt("Upload URL required"));
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
    toast(tt("ID submitted · admin review within 48h"));
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={tt("Verify your ID")}
      description={tt("Upload a government-issued ID. Stays internal — never shown publicly. Used to confirm name + age + identity uniqueness.")}
      width={560}
      footer={<><SecondaryButton onClick={closeDrawer}>{tt("Cancel")}</SecondaryButton><PrimaryButton onClick={submit}>{tt("Submit for review")}</PrimaryButton></>}
    >
      <div style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 14, background: "rgba(91,107,160,0.06)", border: `1px solid rgba(91,107,160,0.18)`, fontSize: 11.5, lineHeight: 1.5 }} className="text-admin-indigo-deep">
        🔒 {tt("Documents are encrypted, viewed only by trained reviewers, and deleted 30 days after decision.")}
      </div>

      <VmFieldLabel>{tt("Document type")}</VmFieldLabel>
      <select value={docType} onChange={(e) => setDocType(e.target.value as "passport" | "drivers_license" | "national_id")} style={{ ...vmTextInputStyle(), cursor: "pointer" }}>
        <option value="passport">{tt("Passport")}</option>
        <option value="drivers_license">{tt("Driver's license")}</option>
        <option value="national_id">{tt("National ID card")}</option>
      </select>

      <VmFieldLabel>{tt("Document URL")}{cfg.evidenceRequired ? " *" : ""}</VmFieldLabel>
      <input type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)}
        placeholder={copy.isSpanish ? "https://… enlace seguro de subida" : "https://… secure upload link"} style={vmTextInputStyle()} />
      <div style={vmSmallHelpStyle()}>{tt("In production this is a direct upload. Prototype expects a secure URL (e.g. signed S3 / Drive link).")}</div>

      <VmFieldLabel>{tt("Note for reviewer (optional)")}</VmFieldLabel>
      <textarea value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} rows={3}
        placeholder={tt("e.g. Name in document is 'María Reyes' — same as profile.")}
        style={{ ...vmTextInputStyle(), resize: "vertical" }} />
    </DrawerShell>
  );
}


export function TalentBusinessVerifyDrawer() {
  const { state, closeDrawer, toast, createVerificationRequest, isVerificationMethodEnabled, getVerificationMethodConfig } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const open = state.drawer.drawerId === "talent-business-verify";
  const TALENT_ID = "t1";
  const [legalName, setLegalName] = useState("");
  const [vat, setVat] = useState("");
  const [registryUrl, setRegistryUrl] = useState("");

  if (!isVerificationMethodEnabled("business_verified")) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title={tt("Business Verification")} width={560}
        footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}>
        <MethodDisabledNotice />
      </DrawerShell>
    );
  }
  const cfg = getVerificationMethodConfig("business_verified");
  const submit = () => {
    if (!legalName.trim() || !vat.trim()) { toast(tt("Legal name + VAT/registration number required")); return; }
    if (cfg.evidenceRequired && !registryUrl.trim()) { toast(tt("Public registry URL required by platform policy")); return; }
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
    toast(tt("Business details submitted · review within 3 business days"));
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={tt("Verify your business")}
      description={tt("Confirm the registered legal entity behind your work. Public badge.")}
      width={560}
      footer={<><SecondaryButton onClick={closeDrawer}>{tt("Cancel")}</SecondaryButton><PrimaryButton onClick={submit}>{tt("Submit")}</PrimaryButton></>}
    >
      <VmFieldLabel>{tt("Legal entity name *")}</VmFieldLabel>
      <input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="e.g. Reyes Studio S.L." style={vmTextInputStyle()} />

      <VmFieldLabel>{tt("VAT / registration number *")}</VmFieldLabel>
      <input type="text" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="e.g. ESB12345678" style={vmTextInputStyle()} />

      <VmFieldLabel>{tt("Public registry URL")}{cfg.evidenceRequired ? " *" : ` ${copy.isSpanish ? "(opcional)" : "(optional)"}`}</VmFieldLabel>
      <input type="url" value={registryUrl} onChange={(e) => setRegistryUrl(e.target.value)} placeholder={copy.isSpanish ? "https://… enlace al registro" : "https://… link to registry record"} style={vmTextInputStyle()} />
      <div style={vmSmallHelpStyle()}>{tt("e.g. Companies House, DIC, Sociedades Mercantiles.")}{cfg.evidenceRequired ? ` ${tt("Required by platform policy.")}` : ""}</div>
    </DrawerShell>
  );
}


export function TalentDomainVerifyDrawer() {
  const { state, closeDrawer, toast, createVerificationRequest, approveVerificationRequest, isVerificationMethodEnabled } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const open = state.drawer.drawerId === "talent-domain-verify";
  const TALENT_ID = "t1";
  const [domain, setDomain] = useState("");
  const [stage, setStage] = useState<"input" | "instructions" | "checking" | "done">("input");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [txtValue, setTxtValue] = useState("");

  if (!isVerificationMethodEnabled("domain_verified")) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title={tt("Domain Verification")} width={560}
        footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}>
        <MethodDisabledNotice />
      </DrawerShell>
    );
  }
  const startCheck = () => {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim())) {
      toast(tt("Enter a valid domain (e.g. martareyes.com)"));
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
      toast(tt("DNS record found · domain verified"));
    }, 1500);
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={tt("Verify your domain")}
      description={tt("Prove you control a domain (e.g. martareyes.com). Public badge — adds credibility.")}
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>{stage === "done" ? tt("Close") : tt("Cancel")}</SecondaryButton>}
    >
      {stage === "input" && (
        <>
          <VmFieldLabel>{tt("Domain")}</VmFieldLabel>
          <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="martareyes.com" autoFocus style={vmTextInputStyle()} />
          <div style={vmSmallHelpStyle()}>{tt("Just the domain — no https:// or paths.")}</div>
          <PrimaryButton onClick={startCheck}>{tt("Get DNS instructions")}</PrimaryButton>
        </>
      )}
      {stage === "instructions" && (
        <>
          <div style={{ fontSize: 13, marginBottom: 10 }} className="text-admin-ink">{tt("Add this TXT record to")} <strong>{domain}</strong>:</div>
          <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, marginBottom: 14, fontFamily: FONTS.mono ?? FONTS.body, fontSize: 12, lineHeight: 1.6 }} className="bg-admin-surface text-admin-ink">
            <div><strong>{tt("Type:")}</strong> TXT</div>
            <div><strong>{tt("Host:")}</strong> @</div>
            <div><strong>{tt("Value:")}</strong> {txtValue}</div>
            <div><strong>TTL:</strong> 3600</div>
          </div>
          <div style={vmSmallHelpStyle()}>{tt("DNS can take 5–30 minutes to propagate. Once added, click below.")}</div>
          <PrimaryButton onClick={runCheck}>{tt("I've added the record · check now")}</PrimaryButton>
        </>
      )}
      {stage === "checking" && (
        <div style={{ textAlign: "center", padding: 30, fontSize: 13 }} className="text-admin-ink-muted">
          {tt("Looking up TXT record on")} {domain}…
        </div>
      )}
      {stage === "done" && (
        <div style={{ padding: 20, borderRadius: 12, fontSize: 13, textAlign: "center", fontWeight: 600 }} className="bg-admin-success-soft text-admin-success-deep">
          ✓ {domain} {tt("verified. Domain badge is live.")}
        </div>
      )}
    </DrawerShell>
  );
}


export function TalentPaymentVerifyDrawer() {
  const { state, closeDrawer, toast, createVerificationRequest, approveVerificationRequest, isVerificationMethodEnabled } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const open = state.drawer.drawerId === "talent-payment-verify";
  const TALENT_ID = "t1";
  const [stage, setStage] = useState<"intro" | "running" | "done">("intro");

  if (!isVerificationMethodEnabled("payment_verified")) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title={tt("Payment Verification")} width={520}
        footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}>
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
      toast(tt("Payment account verified"));
    }, 1500);
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={tt("Verify payment account")}
      description={tt("Confirm a working payout method. Internal only — improves your trust score for clients.")}
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>{stage === "done" ? tt("Close") : tt("Cancel")}</SecondaryButton>}
    >
      {stage === "intro" && (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14 }} className="text-admin-ink">
            {tt("We'll attempt a €1 hold on your connected payout method, then immediately refund it. Nothing actually moves.")}
          </div>
          <PrimaryButton onClick={run}>{tt("Run check")}</PrimaryButton>
        </>
      )}
      {stage === "running" && (
        <div style={{ textAlign: "center", padding: 30, fontSize: 13 }} className="text-admin-ink-muted">
          {tt("Pinging Stripe…")}
        </div>
      )}
      {stage === "done" && (
        <div style={{ padding: 20, borderRadius: 12, fontSize: 13, textAlign: "center", fontWeight: 600 }} className="bg-admin-success-soft text-admin-success-deep">
          ✓ {tt("Payment account verified.")}
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
  const copy = useDashboardText();
  const tt = copy.t;
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
      <SecondaryButton onClick={closeDrawer}>{tt("Cancel")}</SecondaryButton>
      <PrimaryButton
        disabled={valid === 0}
        onClick={() => {
          const created = bulkAddClient(parsed.map(r => ({ name: r.name, contact: r.contact, email: r.email })));
          if (created > 0) {
            toast(copy.isSpanish
              ? `${created} cliente${created === 1 ? "" : "s"} importado${created === 1 ? "" : "s"}`
              : `Imported ${created} client${created === 1 ? "" : "s"}`);
            closeDrawer();
          } else {
            toast(tt("No valid rows — each row needs a name + contact or email"));
          }
        }}
      >
        {copy.isSpanish
          ? `Importar ${valid > 0 ? `${valid} cliente${valid === 1 ? "" : "s"}` : "clientes"}`
          : `Import ${valid > 0 ? `${valid} client${valid === 1 ? "" : "s"}` : "clients"}`}
      </PrimaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title={tt("Bulk import clients")} description={tt("Paste or upload a CSV of clients to add to your workspace.")} footer={footer}>
      <div style={{ padding: 20, fontFamily: FONTS.body }}>
        <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${COLORS.borderSoft}`, marginBottom: 14 }} className="bg-admin-surface">
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }} className="text-admin-ink">
            {tt("Paste or upload a CSV")}
          </div>
          <div style={{ fontSize: 11.5, marginBottom: 10, lineHeight: 1.5 }} className="text-admin-ink-muted">
            {copy.isSpanish ? "Encabezados que reconocemos:" : "Headers we recognize:"} <code style={{ fontFamily: FONTS.mono }}>name, contact, email</code>.
            {" "}{tt("Other column orders work too.")}
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
            }}>📎 {tt("Upload .csv file")}</button>
            <button type="button" onClick={() => setRaw(sample)} style={{
              padding: "7px 12px", borderRadius: 999,
              border: `1px dashed ${COLORS.border}`, background: "transparent",
              color: COLORS.inkMuted,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>{tt("Use sample")}</button>
            {raw && (
              <button type="button" onClick={() => setRaw("")} style={{
                padding: "7px 12px", borderRadius: 999, border: "none",
                background: "transparent", color: COLORS.inkMuted,
                fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}>{tt("Clear")}</button>
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
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">
                {copy.isSpanish
                  ? `Vista previa · ${parsed.length} fila${parsed.length === 1 ? "" : "s"} (${valid} válida${valid === 1 ? "" : "s"})`
                  : `Preview · ${parsed.length} row${parsed.length === 1 ? "" : "s"} (${valid} valid)`}
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
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink">{r.name || "—"}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink-muted">{r.contact || "—"}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink-muted">{r.email || "—"}</span>
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


// NOTE (Wave 17 i18n): TaxonomyDrawer is DEAD — never imported/registered in
// drawers.tsx (the "taxonomy" case renders TalentTypesDrawer from light-02).
// Left un-localized on purpose; delete when the god-file cleanup lands.
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
          <div className="flex flex-wrap gap-1.5">
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
            <button style={{ background: "transparent", border: `1px dashed ${COLORS.border}`, padding: "5px 10px", borderRadius: 999, fontFamily: FONTS.body, fontSize: 11.5, cursor: "pointer" }} className="text-admin-ink-muted">
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
  const copy = useDashboardText();
  const tt = copy.t;
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Embeddable widgets")}
      description={tt("Drop your roster into any site.")}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      <Section title={tt("Active embeds")}>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
            {tt("Roster grid")}
          </div>
          <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
            {tt("Used on")} acme-models.com/talent
          </div>
        </div>
      </Section>
      <Section title={tt("Embed code")}>
        <div style={{ color: "#9DD9C7", padding: 12, borderRadius: 8, fontFamily: FONTS.mono, fontSize: 11, lineHeight: 1.7, overflowX: "auto", whiteSpace: "pre" }} className="bg-admin-fill-deep">
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
  const copy = useDashboardText();
  const tt = copy.t;
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("API keys")}
      description={tt("Read your roster from your own app.")}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>{tt("Generate key")}</PrimaryButton>
        </>
      }
    >
      <Section title={tt("Active keys")}>
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
            <span className="text-admin-ink">tul_pk_••••••••••a91f</span>
            <StateChipMini label={tt("Read only")} tone="green" />
          </div>
          <div style={{ fontSize: 10.5, marginTop: 4, fontFamily: FONTS.body }} className="text-admin-ink-muted">
            {copy.isSpanish ? "Usada 184× en los últimos 7 días" : "Used 184× in last 7 days"}
          </div>
        </div>
      </Section>
    </DrawerShell>
  );
}


export function SiteHealthDrawer() {
  const { closeDrawer } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const checks = [
    { label: tt("Lighthouse score"), value: "94", tone: "green" as const },
    { label: tt("Image optimization"), value: copy.isSpanish ? "Todo optimizado" : "All optimized", tone: "green" as const },
    { label: tt("Broken links"), value: "0", tone: "green" as const },
    { label: tt("SSL"), value: copy.isSpanish ? "Válido · renovación automática" : "Valid · auto-renew", tone: "green" as const },
    { label: tt("Sitemap"), value: copy.isSpanish ? "Generado hace 2 h" : "Generated 2h ago", tone: "green" as const },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Site health")}
      description={tt("Lighthouse, broken links, image optimization.")}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      <Section title={tt("Latest report")}>
        <div className="flex flex-col gap-1.5">
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
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }} className="text-admin-ink">
                {c.label}
              </span>
              <span className="text-admin-ink-muted text-xs">{c.value}</span>
            </div>
          ))}
        </div>
      </Section>
    </DrawerShell>
  );
}

