"use client";

/**
 * Client editors for the platform-DEFAULT integrations (the values every tenant
 * inherits). Dark HQ theme. Each card shows the current status (configured-in-DB
 * vs env-fallback vs unset), an editable field, a masked secret display, and a
 * Save with explicit persistent state. Writes go through the super_admin-gated
 * server actions in platform-integration-actions.ts.
 */

import { useState, useTransition } from "react";

import type {
  PlatformIntegrationActionResult,
  PlatformIntegrationDefault,
} from "./platform-integration-actions";
import {
  clearPlatformCaptcha,
  clearPlatformEmailFrom,
  clearPlatformGa4Id,
  clearPlatformGoogleMapsKey,
  savePlatformCaptcha,
  savePlatformEmailFrom,
  savePlatformGa4Id,
  savePlatformGoogleMapsKey,
} from "./platform-integration-actions";

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  fieldBg: "#0F0F11",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  red: "#E8806B",
  amber: "#D6B45A",
} as const;

const F = '"Inter", system-ui, sans-serif';

// ─── Shared primitives ───────────────────────────────────────────────────────

function StatusPill({ status }: { status: PlatformIntegrationDefault["status"] }) {
  const map = {
    configured: { label: "Set in HQ", color: HQ.green, bg: "rgba(93,211,160,0.12)" },
    env_fallback: { label: "Using env fallback", color: HQ.amber, bg: "rgba(214,180,90,0.12)" },
    unset: { label: "Unset", color: HQ.inkDim, bg: HQ.cardSoft },
  } as const;
  const m = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 9px",
        borderRadius: 999,
        background: m.bg,
        color: m.color,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        fontFamily: F,
      }}
    >
      {m.label}
    </span>
  );
}

function fieldStyle(): React.CSSProperties {
  return {
    width: "100%",
    background: HQ.fieldBg,
    border: `1px solid ${HQ.border}`,
    borderRadius: 8,
    padding: "9px 11px",
    color: HQ.ink,
    fontSize: 13,
    fontFamily: F,
    outline: "none",
  };
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 11,
        color: HQ.inkMuted,
        fontWeight: 500,
        marginBottom: 5,
        fontFamily: F,
      }}
    >
      {children}
    </label>
  );
}

function ActionRow({
  pending,
  result,
  onSave,
  onClear,
  showClear,
  saveLabel = "Save",
}: {
  pending: boolean;
  result: { ok: boolean; msg: string } | null;
  onSave: () => void;
  onClear?: () => void;
  showClear?: boolean;
  saveLabel?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
      <button
        type="button"
        disabled={pending}
        onClick={onSave}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          border: "none",
          background: HQ.green,
          color: "#0F0F11",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
          fontFamily: F,
        }}
      >
        {pending ? "Saving…" : saveLabel}
      </button>
      {showClear && onClear && (
        <button
          type="button"
          disabled={pending}
          onClick={onClear}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${HQ.border}`,
            background: "transparent",
            color: HQ.inkMuted,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: pending ? "default" : "pointer",
            fontFamily: F,
          }}
        >
          Clear
        </button>
      )}
      {result && (
        <span
          style={{
            fontSize: 12,
            color: result.ok ? HQ.green : HQ.red,
            fontFamily: F,
          }}
        >
          {result.msg}
        </span>
      )}
    </div>
  );
}

function envNote(note: string) {
  return (
    <p style={{ margin: "10px 0 0", fontSize: 11, color: HQ.inkDim, fontFamily: F }}>
      When unset, the runtime falls back to env: <code style={{ color: HQ.inkMuted }}>{note}</code>
    </p>
  );
}

function useSaver() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const run = (
    fn: () => Promise<PlatformIntegrationActionResult>,
    successMsg: string,
  ) => {
    setResult(null);
    start(async () => {
      const r = await fn();
      setResult(r.ok ? { ok: true, msg: successMsg } : { ok: false, msg: r.error });
    });
  };
  return { pending, result, run };
}

// ─── Google Maps (secret) ────────────────────────────────────────────────────

function GoogleMapsEditor({ item }: { item: PlatformIntegrationDefault }) {
  const [key, setKey] = useState("");
  const { pending, result, run } = useSaver();
  const present = item.secret?.present ?? false;
  const last4 = item.secret?.last4 ?? null;

  return (
    <div>
      {present && (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: HQ.inkMuted, fontFamily: F }}>
          Stored key: <code style={{ color: HQ.ink }}>••••{last4 ?? ""}</code> — paste a new value
          to replace it.
        </p>
      )}
      <Label>Google Maps browser API key (referer-restricted)</Label>
      <input
        type="password"
        value={key}
        placeholder={present ? "Paste a new key to replace" : "AIza…"}
        onChange={(e) => setKey(e.target.value)}
        style={fieldStyle()}
        autoComplete="off"
      />
      <ActionRow
        pending={pending}
        result={result}
        showClear={present}
        onSave={() => run(() => savePlatformGoogleMapsKey(key), "Saved. Tenants now inherit this Maps key.")}
        onClear={() => run(() => clearPlatformGoogleMapsKey(), "Cleared. Reverted to env fallback.")}
      />
      {envNote(item.envFallbackNote)}
    </div>
  );
}

// ─── GA4 (public id) ─────────────────────────────────────────────────────────

function Ga4Editor({ item }: { item: PlatformIntegrationDefault }) {
  const [id, setId] = useState(item.config.measurement_id ?? "");
  const { pending, result, run } = useSaver();
  const present = !!item.config.measurement_id;

  return (
    <div>
      <Label>GA4 Measurement ID</Label>
      <input
        type="text"
        value={id}
        placeholder="G-XXXXXXXXXX"
        onChange={(e) => setId(e.target.value)}
        style={fieldStyle()}
        autoComplete="off"
      />
      <ActionRow
        pending={pending}
        result={result}
        showClear={present}
        onSave={() => run(() => savePlatformGa4Id(id), "Saved. Tenants without their own GA4 inherit this.")}
        onClear={() => run(() => clearPlatformGa4Id(), "Cleared. Reverted to env fallback.")}
      />
      {envNote(item.envFallbackNote)}
    </div>
  );
}

// ─── Captcha (provider + site_key public, secret_key secret) ─────────────────

function CaptchaEditor({ item }: { item: PlatformIntegrationDefault }) {
  const [provider, setProvider] = useState<"hcaptcha" | "turnstile">(
    item.config.provider === "turnstile" ? "turnstile" : "hcaptcha",
  );
  const [siteKey, setSiteKey] = useState(item.config.site_key ?? "");
  const [secretKey, setSecretKey] = useState("");
  const { pending, result, run } = useSaver();
  const present = !!(item.config.provider && item.config.site_key);
  const secretPresent = item.secret?.present ?? false;
  const last4 = item.secret?.last4 ?? null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <Label>Provider</Label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as "hcaptcha" | "turnstile")}
          style={fieldStyle()}
        >
          <option value="hcaptcha">hCaptcha</option>
          <option value="turnstile">Cloudflare Turnstile</option>
        </select>
      </div>
      <div>
        <Label>Site key (public)</Label>
        <input
          type="text"
          value={siteKey}
          onChange={(e) => setSiteKey(e.target.value)}
          style={fieldStyle()}
          autoComplete="off"
        />
      </div>
      <div>
        <Label>Secret key</Label>
        {secretPresent && (
          <p style={{ margin: "0 0 5px", fontSize: 11.5, color: HQ.inkMuted, fontFamily: F }}>
            Stored: <code style={{ color: HQ.ink }}>••••{last4 ?? ""}</code> — leave blank to keep it.
          </p>
        )}
        <input
          type="password"
          value={secretKey}
          placeholder={secretPresent ? "Leave blank to keep current secret" : "Secret key"}
          onChange={(e) => setSecretKey(e.target.value)}
          style={fieldStyle()}
          autoComplete="off"
        />
      </div>
      <ActionRow
        pending={pending}
        result={result}
        showClear={present || secretPresent}
        onSave={() =>
          run(
            () => savePlatformCaptcha({ provider, site_key: siteKey, secret_key: secretKey }),
            "Saved. Tenants without their own captcha inherit this.",
          )
        }
        onClear={() => run(() => clearPlatformCaptcha(), "Cleared. Reverted to env fallback.")}
      />
      {envNote(item.envFallbackNote)}
    </div>
  );
}

// ─── Email from-address (public) ─────────────────────────────────────────────

function EmailFromEditor({ item }: { item: PlatformIntegrationDefault }) {
  const [fromAddress, setFromAddress] = useState(item.config.from_address ?? "");
  const [domain, setDomain] = useState(item.config.domain ?? "");
  const { pending, result, run } = useSaver();
  const present = !!(item.config.from_address || item.config.domain);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <Label>Default from-address (full)</Label>
        <input
          type="text"
          value={fromAddress}
          placeholder="Tulala <noreply@tulala.digital>"
          onChange={(e) => setFromAddress(e.target.value)}
          style={fieldStyle()}
          autoComplete="off"
        />
      </div>
      <div>
        <Label>…or a default sending domain (→ noreply@domain)</Label>
        <input
          type="text"
          value={domain}
          placeholder="mail.tulala.digital"
          onChange={(e) => setDomain(e.target.value)}
          style={fieldStyle()}
          autoComplete="off"
        />
      </div>
      <ActionRow
        pending={pending}
        result={result}
        showClear={present}
        onSave={() =>
          run(
            () => savePlatformEmailFrom({ from_address: fromAddress, domain }),
            "Saved. Outbound mail without a white-label domain uses this.",
          )
        }
        onClear={() => run(() => clearPlatformEmailFrom(), "Cleared. Reverted to env fallback.")}
      />
      {envNote(item.envFallbackNote)}
    </div>
  );
}

// ─── Card shell + dispatcher ─────────────────────────────────────────────────

export function PlatformIntegrationCard({ item }: { item: PlatformIntegrationDefault }) {
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: F,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: HQ.ink }}>{item.label}</span>
        <StatusPill status={item.status} />
      </div>
      {item.key === "google_maps" && <GoogleMapsEditor item={item} />}
      {item.key === "ga4" && <Ga4Editor item={item} />}
      {item.key === "captcha" && <CaptchaEditor item={item} />}
      {item.key === "email_domain" && <EmailFromEditor item={item} />}
    </section>
  );
}
